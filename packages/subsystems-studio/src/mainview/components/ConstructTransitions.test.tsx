import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, slateNeonTheme } from "@principal-ade/industry-theme";
import type { ConstructTimelineSummary } from "../../shared/construct-timeline";
import { ConstructTransitionsCharts, cumulativeAverageCommitAgeDays } from "./ConstructTransitions";

const summary: ConstructTimelineSummary = {
	commits: [
		{ sha: "new", committedAt: "2026-10-03T00:00:00Z", subject: "Newest", introduced: 1, changed: 1, removed: 1, constructs: 120 },
		{ sha: "mid", committedAt: "2026-10-02T00:00:00Z", subject: "Middle", introduced: 1, changed: 0, removed: 0, constructs: 110 },
		{ sha: "old", committedAt: "2026-10-01T00:00:00Z", subject: "Oldest", introduced: 1, changed: 0, removed: 0, constructs: 100 },
	],
	introduced: 3, removed: 1, changed: 1, lifetimes: [],
	size: { newest: 120, oldest: 100, verifiedNewest: 120 },
};

describe("timeline transition charts", () => {
	test("renders all three series, the axis toggle, and both overlays", () => {
		const html = renderToStaticMarkup(
			<ThemeProvider theme={slateNeonTheme}>
				<ConstructTransitionsCharts summary={summary} />
			</ThemeProvider>,
		);
		for (const label of ["Entries", "Changed", "Exits", "Census size", "Average commit age", "Commits", "Days"]) {
			expect(html).toContain(label);
		}
		expect(html).toContain("<path");
		expect(html).toContain('aria-label="Transition axis"');
		expect(html).toContain('aria-label="Entries, changes, and exits per bucket with census size"');
		expect(html).toContain('aria-label="Entries, changes, and exits per bucket with average commit age"');
		expect(html).toContain("Source-verified declaration census");
	});

	test("cumulative average commit age reads newest-first", () => {
		const age = cumulativeAverageCommitAgeDays(summary.commits);
		expect(age[0]).toBeCloseTo(1, 6);
		expect(age[1]).toBeCloseTo(0.5, 6);
		expect(age[2]).toBeCloseTo(0, 6);
		expect(cumulativeAverageCommitAgeDays([{ committedAt: "not-a-date" }])).toEqual([]);
	});
});
