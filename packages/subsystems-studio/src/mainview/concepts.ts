/**
 * Shared concept-card vocabulary for the principal-studio.
 *
 * The curated registry that used to live here was proof-of-concept data and has
 * been removed — the Concepts tab is now purely store-driven, rendering the
 * saved-concepts store (`src/bun/saved.ts`). What remains is the change-type
 * vocabulary every card shares.
 */

import type {
	ConceptCardData,
	ConceptChangeType,
} from "../shared/contract";

export type ChangeType = ConceptChangeType;

/** A concept card — hand-curated or agent-extracted, same shape on the wire. */
export type ConceptCard = ConceptCardData;

/** Generic visual shown for every concept of a change type, before the
 *  concept-specific diagram is revealed. Grounds the viewer in the category. */
export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
	execution: "Execution",
	derive: "Data Flow",
	integration: "Integration",
	ui: "UI",
};
