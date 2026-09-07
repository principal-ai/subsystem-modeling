/**
 * Concept-analysis store — the on-disk index of "a session analyzed into
 * concept cards".
 *
 * A single JSON file (`~/.principal/principal-studio-analyses.json`) keyed by
 * analysis id. Each record is a `ConceptAnalysis` (sessionId, status, and the
 * extracted `ConceptCardData[]`). The Agent Sessions view reads this to set
 * `hasAnalysis` on rows, and `analyzeSession` creates-or-reopens records here.
 *
 * Layout mirrors the trail cache convention (`~/.principal/...`). Synchronous
 * reads/writes — the file is small and the callers (RPC handlers) are already
 * sync where it matters.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
	AnalysisSummary,
	ConceptAnalysis,
	ConceptCardData,
} from "../shared/contract";
import { migrateLegacyStoreFile } from "./legacy-store-migrate";

const STORE_PATH = join(homedir(), ".principal", "principal-studio-analyses.json");

migrateLegacyStoreFile("trail-viewer-analyses.json", STORE_PATH);

export interface AnalysisStore {
	get: (id: string) => ConceptAnalysis | null;
	findBySession: (sessionId: string) => ConceptAnalysis | null;
	list: () => ConceptAnalysis[];
	summaries: () => AnalysisSummary[];
	save: (analysis: ConceptAnalysis) => ConceptAnalysis;
	remove: (id: string) => boolean;
}

function loadAll(): Map<string, ConceptAnalysis> {
	try {
		const raw = readFileSync(STORE_PATH, "utf8");
		const parsed = JSON.parse(raw) as Record<string, ConceptAnalysis>;
		return new Map(Object.entries(parsed));
	} catch {
		return new Map();
	}
}

function persistAll(map: Map<string, ConceptAnalysis>): void {
	try {
		mkdirSync(join(homedir(), ".principal"), { recursive: true });
		const obj = Object.fromEntries(map.entries());
		writeFileSync(STORE_PATH, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
	} catch (err) {
		console.error(`[principal-studio] failed to write analyses store: ${(err as Error).message}`);
	}
}

export function createAnalysisStore(): AnalysisStore {
	return {
		get(id) {
			return loadAll().get(id) ?? null;
		},
		findBySession(sessionId) {
			for (const a of loadAll().values()) {
				if (a.sessionId === sessionId) return a;
			}
			return null;
		},
		list() {
			const all = Array.from(loadAll().values());
			all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
			return all;
		},
		summaries() {
			return createAnalysisStore()
				.list()
				.map((a) => ({
					id: a.id,
					sessionId: a.sessionId,
					sessionTitle: a.sessionTitle,
					status: a.status,
					createdAt: a.createdAt,
					conceptCount: a.concepts.length,
				}));
		},
		save(analysis) {
			const map = loadAll();
			map.set(analysis.id, analysis);
			persistAll(map);
			return analysis;
		},
		remove(id) {
			const map = loadAll();
			const existed = map.delete(id);
			if (existed) persistAll(map);
			return existed;
		},
	};
}

/** A single-`ConceptAnalysis` singleton — the store is one file, no instances
 *  worth managing. */
export const analyses: AnalysisStore = createAnalysisStore();

/**
 * New-analysis id — short, readable, and namespaced so it reads as a card
 * reference (`analysis_…`), like the session ids it pairs with.
 */
export function newAnalysisId(): string {
	return `analysis_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * Stub concept card for an analyzed session — the first testable slice of the
 * Analyze flow. Produces a `done` analysis instantly (no opencode run) so the
 * button → RPC → tab → cards wiring is provable before the real extraction
 * lands. The stub card names the session and lists its repos from the session
 * metadata the caller already has.
 */
export function stubConceptCard(opts: {
	sessionId: string;
	sessionTitle?: string;
	agent?: string;
	repos?: Array<{ owner: string; name: string }>;
}): ConceptCardData {
	const { sessionId, sessionTitle, agent, repos } = opts;
	const label = sessionTitle?.trim() || sessionId.slice(0, 12);
	return {
		id: `${sessionId}-stub-concept`,
		title: `Session surfaced a working change — ${label}`,
		changeType: "execution",
		status: "draft",
		sessionIds: [sessionId],
		repos: repos ?? [],
		description:
			"Placeholder concept — the Analyze wiring is proven end-to-end, but real concept extraction via the opencode agent hasn't landed yet.",
		points: [
			`Session${agent ? ` by ${agent}` : ""}: ${label}`,
			"Extraction is stubbed — no opencode run was performed",
			"Replace this card by wiring `opencode run` into the host handler",
		],
		mermaid: `flowchart LR
    SESSION["${label.replace(/"/g, "'")}<br/>session"] --> WIRING["Analyze button → RPC → tab"]
    WIRING --> CARDS["concept cards render"]`,
	};
}
