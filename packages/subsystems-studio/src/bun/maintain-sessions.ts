/**
 * Historical Maintain sessions — listed from OpenCode's durable SQLite store
 * (same db Agent Sessions / the running opencode2 service use).
 *
 * OpenCode V2 persists session metadata in `session_v2` (title, agent, times).
 * Older runs may still live in `session`. The `event` stream is for timelines,
 * not discovery — Maintain titles/agents often never appear on `session.created`.
 */

import type { SessionSummary } from "../shared/contract";

function openCodeDBPath(): string {
	const env = process.env as Record<string, string | undefined>;
	if (env["OPENCODE_DATA_DIR"]) return `${env["OPENCODE_DATA_DIR"]}/opencode/opencode.db`;
	const home = env["HOME"] || env["USERPROFILE"] || "/root";
	const xdgData = env["XDG_DATA_HOME"] || `${home}/.local/share`;
	return `${xdgData}/opencode/opencode.db`;
}

/** Titles we stamp when creating Maintain V2 sessions (`Maintain — …`). */
export function isMaintainSessionTitle(title: string): boolean {
	return /^Maintain\s*[—–-]/.test(title.trim());
}

export function isMaintainAgentName(agent: string | undefined | null): boolean {
	return agent === "issue-fixer" || agent === "gap-filler";
}

export function isMaintainSession(opts: {
	title?: string;
	agent?: string | null;
}): boolean {
	if (isMaintainAgentName(opts.agent)) return true;
	if (opts.title && isMaintainSessionTitle(opts.title)) return true;
	return false;
}

function parseModelId(raw: string | null | undefined): string | undefined {
	if (!raw) return undefined;
	try {
		const parsed = JSON.parse(raw) as { id?: unknown; providerID?: unknown };
		if (typeof parsed.id === "string" && typeof parsed.providerID === "string") {
			return `${parsed.providerID}/${parsed.id}`;
		}
		if (typeof parsed.id === "string") return parsed.id;
	} catch {
		/* plain string */
	}
	const trimmed = raw.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

type SessionRow = {
	id: string;
	title: string | null;
	slug: string | null;
	agent: string | null;
	model: string | null;
	directory: string | null;
	time_created: number;
	time_updated: number | null;
};

function rowToSummary(
	row: SessionRow,
	opencodeKind: "v1" | "v2",
): SessionSummary | null {
	const title = (row.title ?? "").trim() || row.id.slice(0, 12);
	const agent = row.agent ?? undefined;
	if (!isMaintainSession({ title, agent })) return null;
	const model = parseModelId(row.model ?? undefined);
	return {
		id: row.id,
		title,
		slug: row.slug ?? "",
		createdAt: new Date(row.time_created).toISOString(),
		lastEventAt: row.time_updated
			? new Date(row.time_updated).toISOString()
			: undefined,
		durationMs: 0,
		eventCount: 0,
		isFinished: true,
		agent: agent ?? "maintain",
		opencodeKind,
		repoRoot: row.directory ?? undefined,
		models: model ? [model] : undefined,
	};
}

function tableExists(
	db: import("bun:sqlite").Database,
	name: string,
): boolean {
	const row = db
		.prepare(
			`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`,
		)
		.get(name) as { ok: number } | null;
	return row != null;
}

/**
 * List historical Maintain sessions from opencode.db (newest first).
 * Prefers `session_v2` (V2 service), falls back to legacy `session`.
 */
export async function listMaintainSessions(opts?: {
	days?: number;
	limit?: number;
}): Promise<{
	sessions: SessionSummary[];
	hasMore: boolean;
}> {
	const dayCount = Math.max(1, Math.floor(opts?.days ?? 30));
	const limit = Math.max(1, Math.min(500, Math.floor(opts?.limit ?? 100)));
	const cutoff = Date.now() - dayCount * 86400000;
	const dbPath = openCodeDBPath();

	let db: import("bun:sqlite").Database | null = null;
	try {
		const { Database } = await import("bun:sqlite");
		// immutable so we see the writer's WAL without needing a write lock
		db = new Database(dbPath, { readonly: true });
		try {
			db.exec("PRAGMA query_only = ON");
		} catch {
			/* older sqlite */
		}

		const byId = new Map<string, SessionSummary>();
		let hasOlder = false;

		const ingest = (rows: SessionRow[], opencodeKind: "v1" | "v2") => {
			for (const row of rows) {
				if (row.time_created <= cutoff) {
					hasOlder = true;
					continue;
				}
				const summary = rowToSummary(row, opencodeKind);
				if (!summary) continue;
				const existing = byId.get(summary.id);
				if (!existing) {
					byId.set(summary.id, summary);
					continue;
				}
				// Prefer V2 identity when both tables somehow share an id.
				if (
					summary.opencodeKind === "v2" &&
					existing.opencodeKind !== "v2"
				) {
					byId.set(summary.id, summary);
					continue;
				}
				// Prefer the row with a Maintain title / richer agent stamp.
				const preferNew =
					isMaintainSessionTitle(summary.title) &&
					!isMaintainSessionTitle(existing.title);
				if (preferNew) byId.set(summary.id, summary);
			}
		};

		const maintainWhere = `(
			agent IN ('issue-fixer', 'gap-filler')
			OR title LIKE 'Maintain%'
		)`;

		if (tableExists(db, "session_v2")) {
			ingest(
				db
					.prepare(
						`SELECT
							id, title, slug, agent, model, directory,
							time_created, time_updated
						FROM session_v2
						WHERE ${maintainWhere}
						ORDER BY time_created DESC
						LIMIT ?`,
					)
					.all(limit * 3) as SessionRow[],
				"v2",
			);
		}

		if (tableExists(db, "session")) {
			ingest(
				db
					.prepare(
						`SELECT
							id, title, slug, agent, model, directory,
							time_created, time_updated
						FROM session
						WHERE ${maintainWhere}
						ORDER BY time_created DESC
						LIMIT ?`,
					)
					.all(limit * 3) as SessionRow[],
				"v1",
			);
		}

		let sessions = Array.from(byId.values()).sort((a, b) => {
			const aMs = new Date(a.lastEventAt ?? a.createdAt).getTime();
			const bMs = new Date(b.lastEventAt ?? b.createdAt).getTime();
			return bMs - aMs;
		});

		if (sessions.length > limit) {
			hasOlder = true;
			sessions = sessions.slice(0, limit);
		}

		return { sessions, hasMore: hasOlder };
	} catch (err) {
		console.warn(
			`[principal-studio] listMaintainSessions failed: ${(err as Error).message}`,
		);
		return { sessions: [], hasMore: false };
	} finally {
		try {
			db?.close();
		} catch {
			/* ignore */
		}
	}
}
