import { Database } from "bun:sqlite";
import {
	normalizeEventsWithAdapter,
	accumulateEvents,
	opencodeRowsToUniversalEvents,
} from "@principal-ai/subsystems-core/pipeline";
import { loadAlexandriaRepos } from "../src/bun/alexandria";

const sessionId = "ses_03077a255ffeC2STfMIxazjHZv";
const dbPath = `${process.env.HOME}/.local/share/opencode/opencode.db`;
const t = (ms: number) => (ms / 1000).toFixed(2) + "s";
const lap = (label: string, start: number) => console.log(`${label}: ${t(performance.now() - start)}`);

const db = new Database(dbPath, { readonly: true });

let s = performance.now();
const rows = db
	.prepare(`SELECT id, aggregate_id AS aggregateId, seq, type, data FROM event WHERE aggregate_id = ? ORDER BY seq ASC`)
	.all(sessionId);
lap("read rows", s);
console.log(`events: ${rows.length}`);

s = performance.now();
const universal = opencodeRowsToUniversalEvents(rows);
lap("opencodeRowsToUniversalEvents", s);
console.log(`universal: ${universal.length}; first: ${universal[0]?.eventType}`);

const alexandriaRepos = loadAlexandriaRepos();
const knownRoots = new Map();
for (const [path, repo] of alexandriaRepos) {
	knownRoots.set(path, { root: repo.root, remoteUrl: repo.remoteUrl, owner: repo.owner, repo: repo.repo });
}

s = performance.now();
const { normalized, adapter } = await normalizeEventsWithAdapter(universal, "", knownRoots);
lap("normalizeEventsWithAdapter", s);
console.log(`normalized: ${normalized.length}; new roots: ${adapter.newlyDiscovered.length}`);

let maxFiles = 0, withFiles = 0;
for (const ev of normalized) {
	if (ev.files) {
		withFiles++;
		if (ev.files.length > maxFiles) maxFiles = ev.files.length;
	}
}
console.log(`events with files: ${withFiles}; max files per event: ${maxFiles}`);

s = performance.now();
const accumulated = accumulateEvents(normalized, "harness");
lap("accumulateEvents", s);
console.log(`accumulated: ${accumulated.length}`);

db.close();
console.log("done");
