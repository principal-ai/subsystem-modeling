/**
 * Disk cache for fully-processed session event timelines.
 *
 * The normalize + accumulate pipeline re-runs from raw every time
 * `getSessionEvents` is called (opencode sqlite rows, or durable transcripts
 * for cline/pi/grok/codex). For the agent-sessions tab's initial load that
 * means re-processing every session in the window on every cold start. This
 * module persists the *processed* result — the trimmed `SessionEventRow[]`
 * plus the repoRoot/repos/session metadata the renderer consumes — so a cold
 * load can serve cached output instead of recomputing it.
 *
 * Layout mirrors the trail cache convention under `~/.principal/`:
 *   `~/.principal/session-events/<dayKey>/<sessionId>.json`
 *
 * where `dayKey` is the calendar day the entry was written (`YYYY-MM-DD`).
 * Entries are stored by day so old days roll off naturally; day directories
 * older than `KEEP_DAYS` are pruned on each write.
 *
 * Invalidation ("overwrite regularly" — processing is still being refined):
 *   - `PROCESSING_VERSION` is stamped into every entry and bumped whenever the
 *     normalize/accumulate pipeline changes, which invalidates everything at
 *     once.
 *   - Every fresh build writes through to disk, so a session that keeps
 *     growing (live polls, which pass `useCache: false`) overwrites its entry
 *     with the newest processed result.
 *   - Reads are version-checked; a stale or corrupt file is treated as a miss.
 *
 * Only the trimmed event form is ever cached (`normalized` reduced to
 * `{ timestamp }`, `raw` dropped) — the raw payload variant can reach hundreds
 * of MB per session and is never written here. The `includeRaw` RPC path
 * bypasses the disk cache entirely.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RepoInfo, SessionEventRow } from "../shared/contract";

const CACHE_ROOT = join(homedir(), ".principal", "session-events");

/**
 * Stamped into every entry. Bump when the raw → normalized → accumulated
 * pipeline changes so previously processed sessions are re-processed instead
 * of served stale.
 */
export const PROCESSING_VERSION = 1;

/** Day directories older than this are pruned on each write. */
const KEEP_DAYS = 14;

export interface CachedSessionEvents {
	version: number;
	/** When this entry was written (ISO). */
	writtenAt: string;
	/** Calendar day the entry lives under (`YYYY-MM-DD`). */
	dayKey: string;
	agent: string;
	session: { slug: string; title: string; agent?: string };
	repoRoot?: string;
	repos: RepoInfo[];
	events: SessionEventRow[];
}

function dayKeyOf(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function isDayOlderThan(day: string, cutoff: Date): boolean {
	const [y, m, d] = day.split("-").map(Number);
	if (!y || !m || !d) return false;
	return new Date(y, m - 1, d).getTime() < cutoff.getTime();
}

/**
 * Read a cached session's processed events. Day dirs are scanned newest-first
 * (a session is always looked up by the day it was processed, which is recent
 * for anything the agent-sessions window cares about), stopping at the first
 * hit. Version mismatch or a corrupt file counts as a miss — the caller
 * re-processes and overwrites.
 */
export function readCachedSessionEvents(sessionId: string): CachedSessionEvents | null {
	let dirs;
	try {
		dirs = readdirSync(CACHE_ROOT, { withFileTypes: true });
	} catch {
		return null;
	}
	const dayDirs = dirs
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort()
		.reverse();
	for (const day of dayDirs) {
		const path = join(CACHE_ROOT, day, `${sessionId}.json`);
		if (!existsSync(path)) continue;
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8")) as CachedSessionEvents;
			if (parsed.version !== PROCESSING_VERSION) continue;
			return parsed;
		} catch {
			// Corrupt entry — treat as a miss; the write-through overwrites it.
			continue;
		}
	}
	return null;
}

/**
 * Persist a freshly processed session. Written atomically (tmp + rename) so a
 * crash never leaves a torn file readable as a cache hit. Stored under
 * today's day dir; stale day dirs are pruned afterwards.
 */
export function writeCachedSessionEvents(
	sessionId: string,
	data: Omit<CachedSessionEvents, "version" | "writtenAt" | "dayKey">,
): void {
	try {
		const dayKey = dayKeyOf(new Date());
		const dir = join(CACHE_ROOT, dayKey);
		mkdirSync(dir, { recursive: true });
		const payload: CachedSessionEvents = {
			version: PROCESSING_VERSION,
			writtenAt: new Date().toISOString(),
			dayKey,
			...data,
		};
		const tmp = join(dir, `.${sessionId}.json.tmp`);
		writeFileSync(tmp, `${JSON.stringify(payload)}\n`, "utf8");
		renameSync(tmp, join(dir, `${sessionId}.json`));
		pruneStaleDays();
	} catch (err) {
		console.error(`[principal-studio] failed to write session cache: ${(err as Error).message}`);
	}
}

/**
 * Drop day directories older than `KEEP_DAYS`. The agent-sessions view only
 * pages through recent days, so anything beyond the keep window will never be
 * read again — pruning keeps the cache from growing unboundedly as the
 * processing pipeline ages.
 */
function pruneStaleDays(): void {
	let dirs;
	try {
		dirs = readdirSync(CACHE_ROOT, { withFileTypes: true });
	} catch {
		return;
	}
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
	for (const d of dirs) {
		if (!d.isDirectory()) continue;
		if (isDayOlderThan(d.name, cutoff)) {
			try {
				rmSync(join(CACHE_ROOT, d.name), { recursive: true, force: true });
			} catch {
				// best-effort prune
			}
		}
	}
}

/**
 * Reduce built rows to the trimmed form the agent-sessions renderer consumes
 * (`timestamp` + `accumulated`). Used before persisting so full raw/normalized
 * payloads — which the `INCLUDE_RAW_EVENT_PAYLOADS` debug flag can put in the
 * built rows — never reach the disk cache.
 */
export function trimSessionEventRows(events: SessionEventRow[]): SessionEventRow[] {
	return events.map((e) => ({
		seq: e.seq,
		type: e.type,
		raw: undefined,
		normalized: {
			timestamp: (e.normalized as Record<string, unknown> | undefined)?.["timestamp"],
		},
		accumulated: e.accumulated,
	}));
}
