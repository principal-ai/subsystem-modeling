/**
 * Shared time-window helpers for the repo-activity tabs (Merged PRs, Commits).
 *
 * Windows are always bounded — there is intentionally no "all" option, so the
 * host never runs an unbounded lifetime query. The host is asked for a day
 * wider than the local window (GitHub indexes merge dates in UTC; local git
 * uses checkout-local time) and the client narrows to the exact window.
 */

export type ActivityWindow = "today" | "yesterday" | "week";

/** Re-check interval for the repo-activity tabs (Merged PRs, Commits). */
export const ACTIVITY_POLL_INTERVAL_MS = 5 * 60_000;

export const ACTIVITY_WINDOWS: ReadonlyArray<{ key: ActivityWindow; label: string }> = [
	{ key: "today", label: "Today" },
	{ key: "yesterday", label: "Yesterday" },
	{ key: "week", label: "This week" },
];

export function windowStart(window: ActivityWindow, now = new Date()): Date {
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	if (window === "today") return today;
	if (window === "yesterday") {
		today.setDate(today.getDate() - 1);
		return today;
	}
	const day = today.getDay();
	today.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
	return today;
}

export function windowEnd(window: ActivityWindow, now = new Date()): Date | null {
	if (window === "week") return null;
	const end = new Date(now);
	if (window === "today") return end;
	end.setHours(0, 0, 0, 0);
	return end;
}

export function asQueryDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function inActivityWindow(committedAt: string, window: ActivityWindow, now: Date): boolean {
	const time = Date.parse(committedAt);
	if (!Number.isFinite(time)) return false;
	const start = windowStart(window, now).getTime();
	const end = windowEnd(window, now)?.getTime() ?? now.getTime();
	return time >= start && (window === "yesterday" ? time < end : time <= end);
}
