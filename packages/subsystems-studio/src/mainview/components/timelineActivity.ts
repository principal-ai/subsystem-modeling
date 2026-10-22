import type { ConstructTimelineCommit } from "../../shared/construct-timeline";

export type TimelineActivityState = "none" | "unanalyzed" | "analyzed" | "mixed";
type ConstructChange = { introduced: number; removed: number };

const dateFormatter = new Intl.DateTimeFormat("en-US", {
	month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});

export function formatTimelineDate(value?: string): string {
	if (!value) return "—";
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : "—";
}

export function formatConstructDelta(value: number): string {
	return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

export function timelineCommitDay(commit: ConstructTimelineCommit): string {
	const date = new Date(commit.committedAt);
	return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

export function timelineActivityDays(
	commits: readonly ConstructTimelineCommit[], analyzed: ReadonlySet<string>, year: number,
	changes: ReadonlyMap<string, ConstructChange> = new Map(),
) {
	const grouped = new Map<string, ConstructTimelineCommit[]>();
	for (const commit of commits) {
		const day = timelineCommitDay(commit);
		if (!day.startsWith(`${year}-`)) continue;
		const entries = grouped.get(day) ?? [];
		entries.push(commit);
		grouped.set(day, entries);
	}
	const start = Date.UTC(year, 0, 1);
	const offset = new Date(start).getUTCDay();
	const length = Math.round((Date.UTC(year + 1, 0, 1) - start) / 86_400_000);
	return Array.from({ length }, (_, index) => {
		const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
		const entries = grouped.get(date) ?? [];
		const observations = entries.filter((commit) => analyzed.has(commit.sha));
		const completed = observations.length;
		const hasCounts = completed > 0 && observations.every((commit) => changes.has(commit.sha));
		const introduced = observations.reduce((sum, commit) => sum + (changes.get(commit.sha)?.introduced ?? 0), 0);
		const removed = observations.reduce((sum, commit) => sum + (changes.get(commit.sha)?.removed ?? 0), 0);
		const state: TimelineActivityState = !entries.length ? "none" : !completed ? "unanalyzed" : completed === entries.length ? "analyzed" : "mixed";
		return {
			date, commits: entries, analyzed: completed,
			state,
			introduced, removed, net: hasCounts ? introduced - removed : undefined,
			column: Math.floor((index + offset) / 7) + 1, row: (index + offset) % 7 + 1,
		};
	});
}
