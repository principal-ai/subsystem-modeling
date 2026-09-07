/**
 * Saved-concepts store — the on-disk index of concept cards a user has
 * deliberately kept, out of the concept analyses that produced them.
 *
 * A single JSON file (`~/.principal/principal-studio-saved-concepts.json`) keyed by
 * a stable saved id (`saved-<analysisId>-<cardId>`). Each record is a full
 * `SavedConcept`: a *copy* of the extracted `ConceptCardData` plus provenance
 * (source analysis/session, savedAt) — so re-running or retrying the source
 * analysis can never mutate or orphan a saved card.
 *
 * This is what the Concepts tab renders: it is reserved for saved concepts, not
 * a dump of every extraction.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SavedConcept } from "../shared/contract";
import { migrateLegacyStoreFile } from "./legacy-store-migrate";

const STORE_PATH = join(homedir(), ".principal", "principal-studio-saved-concepts.json");

migrateLegacyStoreFile("trail-viewer-saved-concepts.json", STORE_PATH);

export interface SavedConceptsStore {
	get: (id: string) => SavedConcept | null;
	list: () => SavedConcept[];
	save: (concept: SavedConcept) => SavedConcept;
	remove: (id: string) => boolean;
}

function loadAll(): Map<string, SavedConcept> {
	try {
		const raw = readFileSync(STORE_PATH, "utf8");
		const parsed = JSON.parse(raw) as Record<string, SavedConcept>;
		return new Map(Object.entries(parsed));
	} catch {
		return new Map();
	}
}

function persistAll(map: Map<string, SavedConcept>): void {
	try {
		mkdirSync(join(homedir(), ".principal"), { recursive: true });
		const obj = Object.fromEntries(map.entries());
		writeFileSync(STORE_PATH, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
	} catch (err) {
		console.error(
			`[principal-studio] failed to write saved-concepts store: ${(err as Error).message}`,
		);
	}
}

export function createSavedConceptsStore(): SavedConceptsStore {
	return {
		get(id) {
			return loadAll().get(id) ?? null;
		},
		list() {
			const all = Array.from(loadAll().values());
			all.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
			return all;
		},
		save(concept) {
			const map = loadAll();
			map.set(concept.savedConceptId, concept);
			persistAll(map);
			return concept;
		},
		remove(id) {
			const map = loadAll();
			const existed = map.delete(id);
			if (existed) persistAll(map);
			return existed;
		},
	};
}

/** A single-store singleton — the store is one file, no instances worth
 *  managing. */
export const savedConcepts: SavedConceptsStore = createSavedConceptsStore();
