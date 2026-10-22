import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, slateNeonTheme } from "@principal-ade/industry-theme";
import { formatConstructDelta, formatTimelineDate, timelineActivityDays, timelineCommitDay } from "./timelineActivity";
import { ConstructTimelineActivity } from "./ConstructTimelineActivity";
import type { ConstructTimelineCommit } from "../../shared/construct-timeline";

const commits: ConstructTimelineCommit[] = [
	{ sha: "a".repeat(40), committedAt: "2024-02-29T12:00:00Z", subject: "Latest commit" },
	{ sha: "b".repeat(40), committedAt: "2024-02-29T10:00:00Z", subject: "Earlier commit" },
	{ sha: "c".repeat(40), committedAt: "2024-02-28T10:00:00Z", subject: "Analyzed day" },
	{ sha: "d".repeat(40), committedAt: "2023-12-31T10:00:00Z", subject: "Older year" },
];
const analyzed = new Set([commits[1]!.sha, commits[2]!.sha]);
const changes = commits.map((commit, index) => ({
	...commit, introduced: [4, 10, 2, 0][index]!, removed: [3, 2, 7, 0][index]!, changed: 5,
}));

describe("timeline activity calendar", () => {
	test("uses the same font size for the date, construct count and added/removed counts", () => {
		const { html } = renderActivity();
		const line = html.slice(html.indexOf('aria-label="Daily construct change"'), html.indexOf('role="list"'));
		const sizes = [...line.matchAll(/font-size:([^;"]+)/g)].map((match) => match[1]);
		expect(sizes).toHaveLength(3);
		expect(new Set(sizes).size).toBe(1);
		expect(line).toContain("Feb 29, 2024");
		expect(line).toContain("10 added");
	});

	test("places the right-aligned legend beside the activity title and subtitle", () => {
		const { html } = renderActivity();
		const header = html.slice(html.indexOf('aria-label="Activity header"'), html.indexOf('aria-label="Activity controls"'));
		expect(header).toContain("Construct activity");
		expect(header).toContain("Daily net change");
		expect(header).toContain('aria-label="Activity legend"');
		expect(header).toContain("Analyzed");
		expect(header).toContain("Not analyzed");
		expect(header).toContain("Partly analyzed day");
		expect(header).toContain("No commits");
		expect(header).toContain("justify-content:flex-end");
		expect(header).toContain("margin-left:auto");
		expect(html.match(/aria-label="Activity legend"/g)).toHaveLength(1);
	});

	test("shows a single year as left-aligned text, not a dropdown", () => {
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineActivity commits={commits.slice(0, 3)} analyzed={analyzed} following
				onSelect={() => {}} onFollow={() => {}} />
		</ThemeProvider>);
		expect(html).toContain('<span aria-label="Activity year"');
		expect(html).not.toContain('aria-haspopup="menu"');
		expect(html).not.toContain("<select");
		const controls = html.slice(html.indexOf('aria-label="Activity controls"'));
		expect(controls.indexOf('aria-label="Activity year"')).toBeLessThan(controls.indexOf(">Follow latest<"));
	});

	test("formats readable dates without shifting their UTC day", () => {
		expect(formatTimelineDate("2026-03-14")).toBe("Mar 14, 2026");
		expect(formatTimelineDate("2024-02-29T12:00:00Z")).toBe("Feb 29, 2024");
		expect(formatTimelineDate("2024-01-01T00:30:00+02:00")).toBe("Dec 31, 2023");
		expect(formatTimelineDate("invalid")).toBe("—");
		expect(formatTimelineDate()).toBe("—");
	});

	function renderActivity(processingSha?: string, selectedSha = commits[0]!.sha, following = false) {
		const processing = commits.find((commit) => commit.sha === processingSha);
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineActivity commits={commits} analyzed={analyzed} changes={changes}
				selectedSha={selectedSha} following={following} processing={processing} onSelect={() => {}} onFollow={() => {}} />
		</ThemeProvider>);
		return {
			html, dots: html.match(/<span[^>]*class="timeline-commit-dot"[^>]*>/g) ?? [],
			calendarDays: html.match(/<button[^>]*class="timeline-activity-day"[^>]*>/g) ?? [],
		};
	}

	test("pulses only the processing day's border, even when another day is pinned", () => {
		const current = renderActivity(commits[0]!.sha, commits[2]!.sha);
		const pulsing = current.calendarDays.filter((day) => day.includes('data-processing="true"'));
		expect(pulsing).toHaveLength(1);
		expect(pulsing[0]).toContain("2024-02-29");
		expect(pulsing[0]).toContain('aria-pressed="false"');
		expect(current.html).toContain("timeline-day-pulse");
		expect(current.html).toContain("prefers-reduced-motion: reduce");
		expect(renderActivity().calendarDays.some((day) => day.includes('data-processing="true"'))).toBe(false);
		expect(renderActivity(commits[1]!.sha).calendarDays.some((day) => day.includes('data-processing="true"'))).toBe(false);
	});

	test("shows one dot per commit, oldest first, and pulses only the actual active commit", () => {
		const { html, dots } = renderActivity(commits[0]!.sha);
		expect(dots).toHaveLength(2);
		expect(dots[0]).toContain('data-commit-state="analyzed"');
		expect(dots[1]).toContain('data-commit-state="processing"');
		expect(dots[1]).toContain('aria-label="Commit 2: Analyzing"');
		expect(html).toContain('aria-label="2 commits on 2024-02-29, oldest first"');
		expect(html).toContain("prefers-reduced-motion: reduce");
		expect(html).not.toContain("Latest commit");
		expect(html).not.toContain(commits[0]!.sha);
	});

	test("does not infer an active commit from pending history or pulse a completed result", () => {
		const idle = renderActivity().dots;
		expect(idle[1]).toContain('data-commit-state="unanalyzed"');
		expect(idle.some((dot) => dot.includes('data-commit-state="processing"'))).toBe(false);
		const completed = renderActivity(commits[1]!.sha).dots;
		expect(completed[0]).toContain('data-commit-state="analyzed"');
		expect(completed.some((dot) => dot.includes('data-commit-state="processing"'))).toBe(false);
	});

	test("follows the processing day but leaves a pinned historical day alone", () => {
		const following = renderActivity(commits[0]!.sha, commits[2]!.sha, true);
		expect(following.dots).toHaveLength(2);
		expect(following.dots[1]).toContain('data-commit-state="processing"');
		const pinned = renderActivity(commits[0]!.sha, commits[2]!.sha);
		expect(pinned.dots).toHaveLength(1);
		expect(pinned.dots[0]).toContain('data-commit-state="analyzed"');
		expect(pinned.html).not.toContain("Net change in observed constructs");
	});

	test("lays out a full UTC leap year in correctly aligned weeks", () => {
		const days = timelineActivityDays(commits, analyzed, 2024);
		expect(days).toHaveLength(366);
		expect(days[0]).toMatchObject({ date: "2024-01-01", column: 1, row: 2, state: "none" });
		expect(days.at(-1)?.date).toBe("2024-12-31");
		expect(days.find((day) => day.date === "2024-02-29")?.row).toBe(5);
		expect(timelineActivityDays(commits, analyzed, 2023)).toHaveLength(365);
	});

	test("distinguishes no commits, analyzed, unanalyzed and mixed days by actual SHA evidence", () => {
		const days = timelineActivityDays(commits, analyzed, 2024);
		expect(days.find((day) => day.date === "2024-02-28")).toMatchObject({ state: "analyzed", analyzed: 1 });
		const mixed = days.find((day) => day.date === "2024-02-29")!;
		expect(mixed.state).toBe("mixed");
		expect(mixed.commits.map((commit) => commit.sha)).toEqual(commits.slice(0, 2).map((commit) => commit.sha));
		expect(timelineActivityDays(commits, new Set(), 2024).find((day) => day.date === mixed.date)?.state).toBe("unanalyzed");
	});

	test("uses UTC consistently across offsets, year boundaries and invalid dates", () => {
		expect(timelineCommitDay({ ...commits[0]!, committedAt: "2024-01-01T00:30:00+02:00" })).toBe("2023-12-31");
		expect(timelineCommitDay({ ...commits[0]!, committedAt: "invalid" })).toBe("");
	});

	test("sums additions minus removals across the day, not changed constructs or unanalyzed history", () => {
		const counts = new Map(changes.map((commit) => [commit.sha, commit]));
		const days = timelineActivityDays(commits, analyzed, 2024, counts);
		expect(days.find((day) => day.date === "2024-02-29")).toMatchObject({ introduced: 10, removed: 2, net: 8, state: "mixed" });
		expect(days.find((day) => day.date === "2024-02-28")!.net).toBe(-5);
		const completed = timelineActivityDays(commits, new Set(commits.map((commit) => commit.sha)), 2024, counts);
		expect(completed.find((day) => day.date === "2024-02-29")!.net).toBe(9);
		expect(formatConstructDelta(8)).toBe("+8");
		expect(formatConstructDelta(-5)).toBe("-5");
		expect(formatConstructDelta(0)).toBe("0");
	});

	test("distinguishes unknown changes from an analyzed day with no net change", () => {
		const counts = new Map(changes.map((commit) => [commit.sha, commit]));
		const all = new Set(commits.map((commit) => commit.sha));
		expect(timelineActivityDays(commits, all, 2023, counts).find((day) => day.date === "2023-12-31")!.net).toBe(0);
		expect(timelineActivityDays(commits, analyzed, 2024).find((day) => day.date === "2024-02-29")!.net).toBeUndefined();
		expect(timelineActivityDays(commits, new Set(), 2024, counts).find((day) => day.date === "2024-02-29")!.net).toBeUndefined();
	});

	test("does not label unknown dates as empty when full Git history is unavailable", () => {
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineActivity commits={commits} analyzed={analyzed} historyComplete={false}
				following onSelect={() => {}} onFollow={() => {}} />
		</ThemeProvider>);
		expect(html).toContain("Unknown activity");
		expect(html).toContain("Git activity unavailable");
		expect(html).not.toContain(": no commits");
	});

	test("shows daily construct changes without individual commit subjects, hashes or controls", () => {
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineActivity commits={commits} analyzed={analyzed} changes={changes} selectedSha={commits[0]!.sha}
				following={false} onSelect={() => {}} onFollow={() => {}} />
		</ThemeProvider>);
		expect(html).toContain('aria-label="Activity year"');
		expect(html).toContain('aria-haspopup="menu"');
		expect(html).toContain('aria-expanded="false"');
		expect(html).not.toContain("<select");
		expect(html).toContain("2024-02-29: +8 constructs, 10 added, 2 removed, partially analyzed");
		expect(html).toContain('data-activity-state="mixed"');
		expect(html).toContain('aria-label="Daily construct change"');
		expect(html).toContain("+8 constructs");
		expect(html).toContain(">Feb 29, 2024</time>");
		expect(html).toContain('dateTime="2024-02-29"');
		expect(html).not.toContain("Partially analyzed day. Change shown is from analyzed history only.");
		expect(html).not.toContain('aria-label="Commits on selected day"');
		expect(html).not.toContain("Latest commit");
		expect(html).not.toContain("Earlier commit");
		expect(html).not.toContain("aaaaaaaa");
		expect(html).toContain("Not analyzed");
		expect(html).not.toContain('aria-label="File coverage commit"');
	});
});
