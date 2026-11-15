import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { ThemeProvider, slateNeonTheme } from "@principal-ade/industry-theme";
import { RepoActivityDayHeatmap } from "./RepoActivityDayHeatmap";
import { RepoActivityMonthHeatmap } from "./RepoActivityMonthHeatmap";
import { RepoActivityWeekHeatmap } from "./RepoActivityWeekHeatmap";
import { createActivityTimeRange, isInActivityTimeRange } from "./activityTimeRange";

const timestamp = new Date(2026, 10, 12, 14, 20).toISOString();

function render(element: ReactNode): string {
	return renderToStaticMarkup(
		<ThemeProvider theme={slateNeonTheme}>{element}</ThemeProvider>,
	);
}

describe("repo activity heatmaps", () => {
	test("shows commit counts in the daily layout", () => {
		const start = new Date(timestamp);
		const end = new Date(start);
		end.setMinutes(end.getMinutes() + 10);
		const range = createActivityTimeRange(start, end, "today · 14:20–14:29");
		const html = render(
			<RepoActivityDayHeatmap
				timestamps={[timestamp]}
				day={new Date(2026, 10, 12)}
				dayLabel="today"
				activityNoun="commit"
				selectedRangeKey={range.key}
			/>,
		);

		expect(html).toContain("Commit activity for today: 1 commit");
		expect(html).toContain("Commit rhythm");
		expect(html).toContain("1 commit today");
		expect(html).toContain('aria-pressed="true"');
		expect(isInActivityTimeRange(timestamp, range)).toBe(true);
	});

	test("shows hourly commit counts in the weekly layout", () => {
		const start = new Date(2026, 10, 12, 14);
		const end = new Date(start);
		end.setHours(end.getHours() + 1);
		const range = createActivityTimeRange(start, end, "Thursday · 14:00–15:00");
		const html = render(
			<RepoActivityWeekHeatmap
				timestamps={[timestamp]}
				weekStart={new Date(2026, 10, 8)}
				activityNoun="commit"
				selectedRangeKey={range.key}
			/>,
		);

		expect(html).toContain("Commit activity this week: 1 commit");
		expect(html).toContain("14:00–15:00 · 1 commit");
		expect(html).toContain('aria-pressed="true"');
	});

	test("shows daily commit counts in the monthly calendar", () => {
		const start = new Date(2026, 10, 12);
		const end = new Date(2026, 10, 13);
		const range = createActivityTimeRange(start, end, "Thursday, Nov 12");
		const html = render(
			<RepoActivityMonthHeatmap
				timestamps={[timestamp]}
				monthStart={new Date(2026, 10, 1)}
				activityNoun="commit"
				selectedRangeKey={range.key}
			/>,
		);

		expect(html).toContain("Commit activity this month: 1 commit");
		expect(html).toContain("1 commit this month");
		expect(html).toContain(">12</button>");
		expect(html).toContain('aria-pressed="true"');
	});

	test("uses an empty-current border pulse and keeps the fill pulse for activity", () => {
		const now = new Date();
		const weekStart = new Date(now);
		weekStart.setHours(0, 0, 0, 0);
		weekStart.setDate(weekStart.getDate() - weekStart.getDay());
		const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
		const weeklyEmpty = render(
			<RepoActivityWeekHeatmap
				timestamps={[]}
				weekStart={weekStart}
				activityNoun="commit"
			/>,
		);
		const monthlyEmpty = render(
			<RepoActivityMonthHeatmap
				timestamps={[]}
				monthStart={monthStart}
				activityNoun="commit"
			/>,
		);
		const weeklyActive = render(
			<RepoActivityWeekHeatmap
				timestamps={[now.toISOString()]}
				weekStart={weekStart}
				activityNoun="commit"
			/>,
		);
		const monthlyActive = render(
			<RepoActivityMonthHeatmap
				timestamps={[now.toISOString()]}
				monthStart={monthStart}
				activityNoun="commit"
			/>,
		);

		expect(weeklyEmpty).toContain('class="activity-week-now-empty-cell"');
		expect(monthlyEmpty).toContain('class="activity-month-now-empty-cell"');
		expect(weeklyActive).toContain('class="activity-week-now-cell"');
		expect(monthlyActive).toContain('class="activity-month-now-cell"');
	});
});
