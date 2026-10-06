/**
 * subsystemModelFiles — the "which files does this graph touch" logic behind
 * the Subsystems tab. A stored `SubsystemModelSummary` carries per-file
 * component anchors (`files`) and per-trail step sites (`trails`); both the
 * list row (`SubsystemModelCard`) and the view's filtering / focus helpers
 * need to answer, repo-aware, whether a given file is referenced and what sits
 * there.
 *
 * Step and anchor files are in component-`file` form; repo attribution comes
 * from the entry's purl (host-derived). Purl-less entries match any repo.
 *
 * Extracted from `SubsystemModelsView` so the card can be exercised on its own
 * in Storybook (see `SubsystemModelCard.stories.tsx`) without dragging the
 * view's filtering along.
 */

import { purlRepoKey } from "@principal-ai/subsystems-react";
import type { SubsystemModelSummary } from "../shared/contract";

/** One per-trail entry on a summary (id, title, step sites). */
export type SummaryTrail = NonNullable<SubsystemModelSummary["trails"]>[number];

/** Repo-aware file match: purl-less entries (or an unknown repo) match any. */
function fileMatches(
	file: string,
	purl: string | undefined,
	repoKey: string | undefined,
	displayPath: string,
): boolean {
	return (
		file === displayPath &&
		((purl ?? "") === "" ||
			(repoKey ?? "") === "" ||
			purlRepoKey(purl) === repoKey)
	);
}

/**
 * Trails of a graph with a step site in the given file. Step files are in
 * component-`file` form; repo attribution comes from the step endpoint's purl
 * (host-derived). Purl-less steps match any repo.
 */
export function trailsUsingFile(
	graph: SubsystemModelSummary,
	repoKey: string | undefined,
	displayPath: string,
): NonNullable<SubsystemModelSummary["trails"]> {
	return (graph.trails ?? []).filter((w) =>
		w.files.some((f) => fileMatches(f.file, f.purl, repoKey, displayPath)),
	);
}

/**
 * Whether a graph references a file — via its component anchors or any trail
 * step site. Same repo-aware matching as the expansion helpers: purl-less
 * entries match any repo. Drives the open-file list filter.
 */
export function graphReferencesFile(
	graph: SubsystemModelSummary,
	repoKey: string | undefined,
	displayPath: string,
): boolean {
	if ((graph.files ?? []).some((f) => fileMatches(f.file, f.purl, repoKey, displayPath))) {
		return true;
	}
	return (graph.trails ?? []).some((w) =>
		w.files.some((f) => fileMatches(f.file, f.purl, repoKey, displayPath)),
	);
}

/**
 * Components declared in the given file (host-derived per file anchor). This
 * is the whole reason a trail-less file is in the model.
 */
export function componentsInFile(
	graph: SubsystemModelSummary,
	repoKey: string | undefined,
	displayPath: string,
): Array<{ alias: string; name: string; construct: string; startLine?: number }> {
	const entry = (graph.files ?? []).find((f) =>
		fileMatches(f.file, f.purl, repoKey, displayPath),
	);
	return entry?.components ?? [];
}

/**
 * First 1-based line the graph references in the given file: the topmost of
 * its component declaration lines and trail step lines. Drives preview focus
 * when a row is clicked while a file is open. Null when the graph has no line
 * data for the file (or doesn't reference it at all).
 */
export function firstReferencedLine(
	graph: SubsystemModelSummary,
	repoKey: string | undefined,
	displayPath: string,
): number | null {
	const lines: number[] = [];
	for (const m of componentsInFile(graph, repoKey, displayPath)) {
		if (m.startLine != null && Number.isFinite(m.startLine) && m.startLine > 0) {
			lines.push(m.startLine);
		}
	}
	for (const w of trailsUsingFile(graph, repoKey, displayPath)) {
		for (const f of w.files) {
			if (f.file !== displayPath) continue;
			for (const line of f.lines ?? []) lines.push(line);
		}
	}
	if (lines.length === 0) return null;
	return Math.min(...lines);
}

/** Whether one trail step is sited in the open file (repo-aware). */
export function stepReferencesFile(
	step: { file: string; purl?: string },
	openFile: { repoKey: string | undefined; displayPath: string },
): boolean {
	return fileMatches(step.file, step.purl, openFile.repoKey, openFile.displayPath);
}
