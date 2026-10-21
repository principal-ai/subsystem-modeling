import { describe, expect, test, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, slateNeonTheme } from "@principal-ade/industry-theme";
import type { ConstructTimelineState } from "./ConstructTimelineControl";
import type { ConstructTimelineSummary } from "../../shared/construct-timeline";

// The section's module imports the electrobun RPC bridge, which touches `window`
// at import time. The section itself never issues a request while rendering.
mock.module("../rpc", () => ({ electrobun: { rpc: { request: {} } } }));

const { ConstructTimelinePanel, ConstructTimelineSection, ConstructTimelineTrigger } = await import("./ConstructTimelineControl");

const meta = {
	version: 1 as const, analyzerVersion: "construct-timeline-v1", purl: "pkg:github/example/repo",
	cursor: { sha: "abcdef0123456789", committedAt: "2026-10-16T12:00:00Z" },
	epoch: { sha: "0123456789abcdef", committedAt: "2026-01-01T00:00:00Z" },
	status: "idle" as const, updatedAt: "2026-10-16T12:00:00Z",
	events: 1234, constructs: 3766, elapsedMs: 90_000, retainedBytes: 2_000_000,
};

const summary: ConstructTimelineSummary = {
	commits: [
		{ sha: "b", committedAt: "2026-10-16T12:00:00Z", subject: "Newer", introduced: 2, removed: 1, changed: 1, constructs: 3766 },
		{ sha: "a", committedAt: "2026-10-15T12:00:00Z", subject: "Older", introduced: 1, removed: 0, changed: 0, constructs: 3765 },
	],
	introduced: 3, removed: 1, changed: 1,
	size: { newest: 3766, oldest: 3765, verifiedNewest: 3766 },
	lifetimes: [],
};

function state(overrides: Partial<ConstructTimelineState> = {}): ConstructTimelineState {
	return {
		meta, summary, error: undefined, busy: false,
		extend: async () => {}, cancel: async () => {},
		...overrides,
	};
}

function render(value: ConstructTimelineState): string {
	return renderToStaticMarkup(
		<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineSection timeline={value} />
		</ThemeProvider>,
	);
}

describe("cumulative timeline panel", () => {
	test("shows the cursor, event totals, and an extend action", () => {
		const html = render(state());
		expect(html).toContain("Timeline");
		expect(html).toContain("Idle");
		expect(html).toContain("1,234");
		expect(html).toContain("abcdef01");
		expect(html).toContain("Extend timeline");
		expect(html).toContain("3 entries");
	});

	test("renders both transition charts from the timeline summary", () => {
		const html = render(state());
		// One chart per overlay: census size and average commit age.
		expect(html).toContain("with census size");
		expect(html).toContain("with average commit age");
		expect(html).toContain("Census size");
		expect(html).toContain("Average commit age");
	});

	test("offers to start the timeline before any commit is analyzed", () => {
		const html = render(state({ meta: undefined, summary: undefined }));
		expect(html).toContain("Not started");
		expect(html).toContain("Start timeline");
		expect(html).not.toContain("Extend timeline");
	});

	test("surfaces a failure and disables extend while running", () => {
		const failed = render(state({
			meta: { ...meta, status: "failed", error: "History was rewritten since the last extension." },
		}));
		expect(failed).toContain("History was rewritten");
		const running = render(state({ meta: { ...meta, status: "running" } }));
		expect(running).toContain("Extending");
		expect(running.match(/<button[^>]*>Extend timeline/)?.[0] ?? "").toContain("disabled");
	});

	test("opens a standalone timeline panel without bounded-run controls", () => {
		const html = renderToStaticMarkup(
			<ThemeProvider theme={slateNeonTheme}>
				<ConstructTimelineTrigger timeline={state()} open={true} onToggle={() => {}} />
				<ConstructTimelinePanel timeline={state()} onClose={() => {}} />
			</ThemeProvider>,
		);
		expect(html).toContain('aria-controls="construct-timeline-panel"');
		expect(html).toContain('id="construct-timeline-panel"');
		expect(html).toContain('aria-expanded="true"');
		expect(html).toContain('aria-label="Close timeline"');
		expect(html).toContain("Extend timeline");
		expect(html).not.toContain("Start new run");
		expect(html).not.toContain("Last 7 days");
		expect(html).not.toContain("Disk budget");
	});
});
