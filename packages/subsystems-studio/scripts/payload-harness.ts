import { Database } from "bun:sqlite";
import {
	normalizeEventsWithAdapter,
	accumulateEvents,
	opencodeRowsToUniversalEvents,
} from "@principal-ai/subsystems-core/pipeline";
import { loadAlexandriaRepos } from "../src/bun/alexandria";

const sessionId = process.argv[2] ?? "ses_03077a255ffeC2STfMIxazjHZv";
const dbPath = `${process.env.HOME}/.local/share/opencode/opencode.db`;
const t = (ms: number) => (ms / 1000).toFixed(2) + "s";
const mb = (n: number) => (n / (1024 * 1024)).toFixed(1) + "MB";

const db = new Database(dbPath, { readonly: true });

let s = performance.now();
const rows = db
	.prepare(`SELECT id, aggregate_id AS aggregateId, seq, type, data FROM event WHERE aggregate_id = ? ORDER BY seq ASC`)
	.all(sessionId) as Array<{ id: string; aggregateId: string; seq: number; type: string; data: string }>;
const rawBytes = rows.reduce((n, r) => n + r.data.length, 0);
console.log(`read rows: ${t(performance.now() - s)}; events: ${rows.length}; raw JSON: ${mb(rawBytes)}`);

s = performance.now();
const universal = opencodeRowsToUniversalEvents(rows);
console.log(`opencodeRowsToUniversalEvents: ${t(performance.now() - s)}`);

const alexandriaRepos = loadAlexandriaRepos();
const knownRoots = new Map();
for (const [path, repo] of alexandriaRepos) {
	knownRoots.set(path, { root: repo.root, remoteUrl: repo.remoteUrl, owner: repo.owner, repo: repo.repo });
}

s = performance.now();
const { normalized } = await normalizeEventsWithAdapter(universal, "", knownRoots);
console.log(`normalizeEventsWithAdapter: ${t(performance.now() - s)}`);

s = performance.now();
const accumulated = accumulateEvents(normalized, sessionId);
console.log(`accumulateEvents: ${t(performance.now() - s)}`);

// Replicate the exact SessionEventRow[] assembly from the getSessionEvents handler.
s = performance.now();
const events = accumulated.map((entry, i) => {
	const rawEnvelope = entry.normalized.raw as { data?: unknown; type?: string; seq?: number } | undefined;
	const seq = rawEnvelope?.seq ?? i;
	return {
		seq,
		type: rawEnvelope?.type ?? entry.normalized.eventType,
		raw: rawEnvelope?.data,
		normalized: entry.normalized as unknown as Record<string, unknown>,
		accumulated: entry.accumulated,
	};
});
console.log(`assemble rows: ${t(performance.now() - s)}`);

s = performance.now();
const serialized = JSON.stringify(events);
console.log(`JSON.stringify response: ${t(performance.now() - s)}; payload: ${mb(serialized.length)}`);

// How much would the payload shrink if we dropped the unused `raw` field?
s = performance.now();
const stripped = JSON.stringify(events.map(({ raw, ...rest }) => rest));
console.log(`stringify WITHOUT raw: ${t(performance.now() - s)}; payload: ${mb(stripped.length)}`);

db.close();
