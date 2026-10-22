import type { HighlightLayer } from "@principal-ai/file-city-builder";
import type { ConstructTimelineFileSnapshot, ConstructTimelineFileStatus } from "../../shared/construct-timeline";

export const TIMELINE_FILE_STYLES: Record<ConstructTimelineFileStatus, { label: string; color: string }> = {
	verified: { label: "Verified", color: "#34d399" },
	partial: { label: "Partial", color: "#fbbf24" },
	unresolved: { label: "Unresolved", color: "#fb923c" },
	unsupported: { label: "Not supported for construct verification", color: "#a78bfa" },
	error: { label: "Error", color: "#f87171" },
	uncovered: { label: "No evidence", color: "#64748b" },
	"non-code": { label: "Non-code", color: "#475569" },
};

export const TIMELINE_CHANGE_STYLES = {
	added: { label: "Added", color: "#34d399" },
	modified: { label: "Modified", color: "#fbbf24" },
	removed: { label: "Removed", color: "#f87171" },
};

/** Display-only deleted buildings. Never mix these into persisted coverage totals. */
export function timelineChangeSnapshot(snapshot: ConstructTimelineFileSnapshot): ConstructTimelineFileSnapshot {
	const paths = new Set(snapshot.files.map((file) => file.path));
	const removed = (snapshot.changes ?? []).flatMap((change) =>
		change.status === "removed" && change.before && !paths.has(change.path)
			? [{ path: change.path, ...change.before, status: "uncovered" as const }] : []);
	return { ...snapshot, analyzed: false, coverageAvailable: false,
		files: [...snapshot.files.map((file) => ({ ...file, status: "uncovered" as const, coverage: undefined })), ...removed] };
}

export function timelineChangeLayers(snapshot: ConstructTimelineFileSnapshot): HighlightLayer[] {
	return (Object.keys(TIMELINE_CHANGE_STYLES) as Array<keyof typeof TIMELINE_CHANGE_STYLES>).flatMap((status) => {
		const items = (snapshot.changes ?? []).filter((change) => change.status === status)
			.map((change) => ({ path: change.path, type: "file" as const, renderStrategy: "fill" as const }));
		return items.length ? [{ id: `change-${status}`, name: TIMELINE_CHANGE_STYLES[status].label,
			color: TIMELINE_CHANGE_STYLES[status].color, enabled: true, opacity: 1, priority: 20, items }] : [];
	});
}

export function timelineFileExplanation(file: ConstructTimelineFileSnapshot["files"][number], coverageAvailable: boolean): string {
	if (file.kind === "submodule") return "Submodule contents are not analyzed.";
	if (file.kind === "symlink") return "Symlink targets are not analyzed.";
	if (file.status === "non-code") return "Known documentation, configuration or asset format; not a construct-verification target.";
	if (file.status === "unsupported") return "Not supported for construct verification. This file type has no available source verification in the current analyzer; this is not pending work or an extraction failure.";
	if (!coverageAvailable) return "Per-file declaration evidence was not recorded for this commit. Current file-type support does not establish historical coverage.";
	return "No per-file declaration evidence was recorded. Parser support alone does not prove extraction or verification.";
}

export function timelineFileLayers(snapshot: ConstructTimelineFileSnapshot): HighlightLayer[] {
	const groups = new Map<ConstructTimelineFileStatus, HighlightLayer>();
	for (const file of snapshot.files) {
		const status = snapshot.analyzed === false ? "uncovered" : file.status;
		let layer = groups.get(status);
		if (!layer) {
			const style = TIMELINE_FILE_STYLES[status];
			layer = { id: status, name: style.label, color: style.color, enabled: true, priority: 10, opacity: 1, items: [] };
			groups.set(status, layer);
		}
		layer.items.push({ path: file.path, type: "file", renderStrategy: "fill" });
	}
	return [...groups.values()];
}

