/**
 * opencode server session tracking for the principal-studio header.
 *
 * Talks to the running opencode v2 server (the instance server `opencode2`
 * runs) over its HTTP surface:
 *   - `GET /api/session?limit=100` — sessions, filtered to the recent window
 *   - `GET /api/session/active` — the currently-running (in-flight drain) set
 *   - `GET /api/event` — one SSE subscription that carries EVERY session's
 *     events (`session.status` busy/idle/retry plus the durable
 *     `session.next.*` events, each carrying `sessionID`), so the header can
 *     show each session's last event without one subscription per session.
 *
 * Discovery + auth mirror the server's own daemon: read `service.json` (or
 * `server.json`) for the URL + password and Basic-auth every call. All of this
 * stays host-side — the webview must never touch the password.
 */

import { existsSync, readFileSync } from "node:fs";
import type { OpencodeServerStatus, ServerSessionRow } from "../shared/contract";

export interface OpencodeConnection {
	url: string;
	password: string;
	version?: string;
}

/** Resolve the opencode state dir (where the v2 server writes its
 *  registration + password) the same way session-pipeline resolves the data
 *  dir. XDG_STATE_HOME wins (opencode's own Global.Path.state), else the
 *  `~/.local/state` fallback. An explicit OPENCODE_STATE_DIR override mirrors
 *  the data-dir pattern for tests / odd installs. */
export function openCodeStateDir(): string {
	const env = process.env as Record<string, string | undefined>;
	if (env["OPENCODE_STATE_DIR"]) return env["OPENCODE_STATE_DIR"];
	const home = env["HOME"] || env["USERPROFILE"] || "/root";
	const xdgState = env["XDG_STATE_HOME"] || `${home}/.local/state`;
	return `${xdgState}/opencode`;
}

/** Resolve the running opencode v2 server. Two on-disk layouts exist:
 *   - the installed CLI (`opencode2` / `@opencode-ai/cli`) writes `service.json`
 *     carrying `url`, `version`, `pid`, and the `password` inline;
 *   - the source-repo daemon (`cli/src/services/daemon.ts`) writes `server.json`
 *     plus a separate `password` file.
 *  Returns null when neither exists — the server was never started (or its
 *  registration was removed on exit). */
export function resolveOpencodeConnection(): OpencodeConnection | null {
	// Explicit override wins — lets the viewer target a source-built (or any
	// custom) opencode server without fighting the daemon's service.json
	// (which the published CLI rewrites whenever it (re)starts its own server).
	const env = process.env as Record<string, string | undefined>;
	const urlOverride = env["OPENCODE_SERVER_URL"];
	if (urlOverride) {
		return {
			url: urlOverride,
			password: env["OPENCODE_SERVER_PASSWORD"] ?? "",
			version: env["OPENCODE_SERVER_VERSION"],
		};
	}

	const stateDir = openCodeStateDir();
	for (const file of ["service.json", "server.json"]) {
		const path = `${stateDir}/${file}`;
		if (!existsSync(path)) continue;
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8")) as {
				url?: unknown;
				version?: unknown;
				password?: unknown;
			};
			if (typeof parsed["url"] !== "string" || !parsed["url"]) continue;
			let password = typeof parsed["password"] === "string" ? parsed["password"] : "";
			if (!password) {
				try {
					password = readFileSync(`${stateDir}/password`, "utf8").trim();
				} catch {
					password = "";
				}
			}
			return {
				url: parsed["url"],
				password,
				version: typeof parsed["version"] === "string" ? parsed["version"] : undefined,
			};
		} catch {
			// unparseable — try the next layout, else report not running
			continue;
		}
	}
	return null;
}

/** Basic-auth headers for the opencode server. No password (embedded mode)
 *  means no header. */
export function serverAuthHeaders(password: string): Record<string, string> {
	return password
		? { authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` }
		: {};
}

/** Probe `/api/health` exactly like the server's own daemon. Missing
 *  registration, a failed fetch, or a non-healthy body means "not running". */
export async function probeOpencodeServer(): Promise<OpencodeServerStatus> {
	const connection = resolveOpencodeConnection();
	if (!connection) return { running: false };
	try {
		const res = await fetch(`${connection.url}/api/health`, {
			headers: serverAuthHeaders(connection.password),
			signal: AbortSignal.timeout(2_000),
		});
		if (!res.ok) return { running: false, url: connection.url, version: connection.version };
		const body = (await res.json().catch(() => null)) as { healthy?: unknown } | null;
		return {
			running: body?.["healthy"] === true,
			url: connection.url,
			version: connection.version,
		};
	} catch {
		return { running: false, url: connection.url, version: connection.version };
	}
}

// ---------------------------------------------------------------------------
// Session list + live event watch
// ---------------------------------------------------------------------------

const RECENT_WINDOW_MS = 10 * 60_000;

type ServerStatus = "busy" | "retry" | "idle";

interface WatchEntry {
	status?: ServerStatus;
	retryMessage?: string;
	updatedAt?: number;
	lastEvent?: { type: string; at: number };
}

// Live per-session state fed by the single /api/event subscription.
const watch = new Map<string, WatchEntry>();
let watchController: AbortController | null = null;
let watchListener: ((sessions: ServerSessionRow[]) => void) | null = null;
let watchRunning = false;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

/** Start (and register a listener for) or stop the host's event subscription.
 *  Stopping aborts the fetch and clears the live state. */
export function setServerEventWatch(
	active: boolean,
	listener?: (sessions: ServerSessionRow[]) => void,
): void {
	if (active) {
		if (listener) watchListener = listener;
		void startWatch();
		return;
	}
	if (notifyTimer) {
		clearTimeout(notifyTimer);
		notifyTimer = null;
	}
	watchController?.abort();
	watchController = null;
	watchRunning = false;
	watch.clear();
	watchListener = null;
}

/** Snapshot of sessions that are active (running) or were updated within the
 *  last 10 minutes, merged with the live event watch. */
export async function listRecentServerSessions(): Promise<{
	ok: boolean;
	running: boolean;
	error?: string;
	sessions: ServerSessionRow[];
}> {
	const connection = resolveOpencodeConnection();
	if (!connection) return { ok: true, running: false, sessions: [] };

	// If a popover asked us to watch and the stream dropped (server restart,
	// transient network), the next poll quietly reconnects.
	if (watchListener && !watchRunning) void startWatch();

	const headers = serverAuthHeaders(connection.password);
	try {
		const [listRes, activeRes] = await Promise.all([
			fetch(`${connection.url}/api/session?limit=100`, {
				headers,
				signal: AbortSignal.timeout(5_000),
			}),
			fetch(`${connection.url}/api/session/active`, {
				headers,
				signal: AbortSignal.timeout(5_000),
			}),
		]);
		if (!listRes.ok) {
			return { ok: false, running: true, error: `session list ${listRes.status}`, sessions: [] };
		}
		const listPayload = (await listRes.json().catch(() => null)) as { data?: unknown } | null;
		const activePayload = activeRes.ok
			? ((await activeRes.json().catch(() => null)) as { data?: unknown } | null)
			: null;

		// Sessions with an in-flight agent drain on this server process.
		const active = new Set<string>();
		if (activePayload && typeof activePayload["data"] === "object" && activePayload["data"] !== null) {
			for (const key of Object.keys(activePayload["data"])) active.add(key);
		}

		const cutoff = Date.now() - RECENT_WINDOW_MS;
		const rows: ServerSessionRow[] = [];
		const seen = new Set<string>();
		const list = Array.isArray(listPayload?.["data"]) ? (listPayload["data"] as unknown[]) : [];
		for (const raw of list) {
			if (typeof raw !== "object" || raw === null) continue;
			const info = raw as Record<string, unknown>;
			const sessionId = info["id"];
			if (typeof sessionId !== "string" || !sessionId) continue;
			seen.add(sessionId);
			const time = info["time"];
			const updated =
				typeof time === "object" && time !== null
					? (time as Record<string, unknown>)["updated"]
					: undefined;
			const activeNow = active.has(sessionId);
			if (!activeNow && (typeof updated !== "number" || updated < cutoff)) continue;
			rows.push(
				buildRow(sessionId, info, activeNow ? { type: "busy" } : undefined, watch.get(sessionId)),
			);
		}

		// Running sessions the list didn't surface (just started / outside the
		// recent-window filter) are still actively running.
		for (const sessionId of active) {
			if (seen.has(sessionId)) continue;
			seen.add(sessionId);
			rows.push(buildRow(sessionId, undefined, { type: "busy" }, watch.get(sessionId)));
		}

		// Sessions the event watch saw recently but that aren't in the list yet.
		for (const [sessionId, entry] of watch) {
			if (seen.has(sessionId)) continue;
			if ((entry.lastEvent?.at ?? entry.updatedAt ?? 0) < cutoff) continue;
			seen.add(sessionId);
			rows.push(buildRow(sessionId, undefined, undefined, entry));
		}

		rows.sort((a, b) => (b.updatedAt ?? b.lastEvent?.at ?? 0) - (a.updatedAt ?? a.lastEvent?.at ?? 0));
		return { ok: true, running: true, sessions: rows };
	} catch (err) {
		return {
			ok: false,
			running: true,
			error: err instanceof Error ? err.message : String(err),
			sessions: [],
		};
	}
}

function buildRow(
	sessionId: string,
	info?: Record<string, unknown>,
	status?: { type?: unknown; message?: unknown },
	live?: WatchEntry,
): ServerSessionRow {
	const row: ServerSessionRow = { sessionId };
	if (info) {
		if (typeof info["title"] === "string") row.title = info["title"];
		const time = info["time"];
		if (typeof time === "object" && time !== null) {
			const updated = (time as Record<string, unknown>)["updated"];
			if (typeof updated === "number") row.updatedAt = updated;
		}
	}
	const statusType = status?.["type"];
	if (statusType === "busy" || statusType === "retry") {
		row.status = statusType;
		if (statusType === "retry" && typeof status?.["message"] === "string") {
			row.retryMessage = status["message"];
		}
	}
	if (live) {
		if (live.lastEvent) row.lastEvent = live.lastEvent;
		if (live.status && !row.status) {
			row.status = live.status;
			if (live.retryMessage) row.retryMessage = live.retryMessage;
		}
		if (live.updatedAt && (!row.updatedAt || live.updatedAt > row.updatedAt)) {
			row.updatedAt = live.updatedAt;
		}
	}
	return row;
}

async function startWatch(): Promise<void> {
	if (watchRunning) return;
	const connection = resolveOpencodeConnection();
	if (!connection) return;
	const controller = new AbortController();
	watchController = controller;
	watchRunning = true;
	try {
		const res = await fetch(`${connection.url}/api/event`, {
			headers: serverAuthHeaders(connection.password),
			signal: controller.signal,
		});
		if (!res.ok || !res.body) throw new Error(`event stream ${res.status}`);
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
			const blocks = buffer.split("\n\n");
			buffer = blocks.pop() ?? "";
			for (const block of blocks) handleEventBlock(block);
		}
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") return;
		// Stream dropped (server restart, network blip). Keep the last snapshot;
		// the next listRecentServerSessions reconnects while the popover is open.
	} finally {
		watchRunning = false;
		if (watchController === controller) watchController = null;
	}
}

function handleEventBlock(block: string): void {
	const dataLine = block.split("\n").find((line) => line.startsWith("data:"));
	if (!dataLine) return;
	let event: { type?: unknown; created?: unknown; data?: unknown; properties?: unknown };
	try {
		event = JSON.parse(dataLine.slice(5).trim()) as typeof event;
	} catch {
		return;
	}
	const type = event["type"];
	// Two wire shapes exist: the source-repo instance server maps events to
	// `{ id, type, properties }`; the installed CLI emits `{ id, created,
	// type, data }`. The per-event payload lives under whichever of the two.
	const props =
		(typeof event["data"] === "object" && event["data"] !== null ? event["data"] : event["properties"]) as
			| Record<string, unknown>
			| undefined;
	if (typeof type !== "string" || typeof props !== "object" || props === null) return;
	if (type === "server.instance.disposed") {
		setServerEventWatch(false);
		return;
	}
	const sessionId = props["sessionID"];
	if (typeof sessionId !== "string" || !sessionId) return;

	const now = typeof event["created"] === "number" ? event["created"] : Date.now();
	const entry = watch.get(sessionId) ?? {};
	if (type === "session.status") {
		const status = (props as Record<string, unknown>)["status"] as
			| { type?: unknown; message?: unknown }
			| undefined;
		const statusType = status?.["type"];
		if (statusType === "busy" || statusType === "retry") {
			entry.status = statusType;
			entry.retryMessage =
				statusType === "retry" && typeof status?.["message"] === "string"
					? status["message"]
					: undefined;
		} else if (statusType === "idle") {
			entry.status = "idle";
			entry.retryMessage = undefined;
		}
	}
	entry.lastEvent = { type, at: now };
	entry.updatedAt = now;
	watch.set(sessionId, entry);
	scheduleNotify();
}

/** Push the live watch rows to the renderer, throttled to ~1/sec so a busy
 *  session's text.delta / step events don't flood the RPC bridge. */
function scheduleNotify(): void {
	if (notifyTimer) return;
	notifyTimer = setTimeout(() => {
		notifyTimer = null;
		if (!watchListener) return;
		const now = Date.now();
		const rows: ServerSessionRow[] = [];
		for (const [sessionId, entry] of watch) {
			if ((entry.lastEvent?.at ?? entry.updatedAt ?? 0) < now - RECENT_WINDOW_MS) {
				watch.delete(sessionId);
				continue;
			}
			rows.push(buildRow(sessionId, undefined, undefined, entry));
		}
		rows.sort((a, b) => (b.lastEvent?.at ?? b.updatedAt ?? 0) - (a.lastEvent?.at ?? a.updatedAt ?? 0));
		watchListener(rows);
	}, 800);
}
