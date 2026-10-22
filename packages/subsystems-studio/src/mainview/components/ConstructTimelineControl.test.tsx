import { describe, expect, test, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, slateNeonTheme } from "@principal-ade/industry-theme";
import type { ConstructTimelineState } from "./ConstructTimelineControl";
import type { ConstructTimelineCommit, ConstructTimelineOptions, ConstructTimelineSummary } from "../../shared/construct-timeline";

// The section's module imports the electrobun RPC bridge, which touches `window`
// at import time. The section itself never issues a request while rendering.
mock.module("../rpc", () => ({ electrobun: { rpc: { request: {} } } }));

const { ConstructTimelinePanel, ConstructTimelineSection, ConstructTimelineTrigger, ConstructTimelineResetConfirmation, ConstructTimelineProjectStats } = await import("./ConstructTimelineControl");
const { ConstructTimelineExtendDialog } = await import("./ConstructTimelineExtendDialog");

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
		purl: meta.purl, meta, summary, error: undefined, busy: false, loaded: true,
		extend: async () => {}, cancel: async () => {}, reset: async () => true,
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
	test("replaces cursor and storage stats with project history and analysis progress", () => {
		const html = render(state());
		expect(html).toContain("Timeline");
		expect(html).not.toContain(">Idle<");
		expect(html).toContain("Project started");
		expect(html).toContain("Latest commit");
		expect(html).toContain("Total commits");
		expect(html).toContain("Analyzed");
		expect(html).not.toContain("abcdef01");
		expect(html).not.toContain(">Saved<");
		expect(html).not.toContain(">Elapsed<");
		expect(html).not.toContain(">Cursor<");
		expect(html).toContain("Continue analysis");
		expect(html).not.toContain("Commits per extension");
		expect(html).not.toContain("Minutes per extension");
		expect(html).not.toContain("<form");
		expect(html).not.toContain("Walks the first-parent history");
		expect(html).toContain("Reset timeline");
		expect(html).not.toContain('role="alertdialog"');
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
		expect(html).not.toContain(">Not started<");
		expect(html).toContain("Start analysis");
		expect(html).not.toContain("Extend timeline");
		expect(html).not.toContain("Reset timeline");
	});

	test("surfaces a failure and disables extend while running", () => {
		const failed = render(state({
			meta: { ...meta, status: "failed", error: "History was rewritten since the last extension." },
		}));
		expect(failed).toContain("History was rewritten");
		const running = render(state({ meta: { ...meta, status: "running" } }));
		expect(running).not.toContain(">Extending<");
		expect(running).toContain(">Cancel</button>");
		expect(running.match(/<button[^>]*>Continue analysis/)?.[0] ?? "").toContain("disabled");
		expect(running.match(/<button[^>]*>Reset timeline/)?.[0] ?? "").toContain("disabled");
		const busy = render(state({ busy: true }));
		expect(busy.match(/<button[^>]*>Reset timeline/)?.[0] ?? "").toContain("disabled");
		expect(busy.match(/<button[^>]*>Continue analysis/)?.[0] ?? "").toContain("disabled");
	});

	test("explains the selected repository and permanent deletion before confirmation", () => {
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineResetConfirmation purl={meta.purl} commits={meta.events} busy={false}
				onCancel={() => {}} onConfirm={() => {}} />
		</ThemeProvider>);
		expect(html).toContain('role="alertdialog"');
		expect(html).toContain(meta.purl);
		expect(html).toContain("permanently deletes 1,234 analyzed commits");
		expect(html).toContain("Source files, subsystem models, and other repositories are not changed");
		expect(html).toContain("Nothing restarts automatically");
		expect(html).toContain("Keep analysis");
		expect(html).toContain("Delete analysis");
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
		expect(html).toContain('aria-label="Repo Analysis"');
		expect(html).toContain('aria-expanded="true"');
		expect(html).toContain('aria-label="Close timeline"');
		expect(html).toContain("Continue analysis");
		expect(html).not.toContain("Start new run");
		expect(html).not.toContain("Last 7 days");
		expect(html).not.toContain("Disk budget");
	});

	test("combines the standalone title and actions without an interruption label", () => {
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelinePanel timeline={state({ meta: { ...meta, status: "interrupted" } })} onClose={() => {}} />
		</ThemeProvider>);
		const header = html.slice(html.indexOf('aria-label="Timeline header"'), html.indexOf('aria-label="Project history overview"'));
		expect(header).toContain(">Repo Analysis</h2>");
		expect(header).not.toContain("Interrupted");
		expect(header).toContain(">Reset timeline</button>");
		expect(header).toContain(">Continue analysis</button>");
		expect(header).toContain('aria-label="Close timeline"');
		expect(html).not.toContain(">Timeline</strong>");
		expect(html.match(/<h2/g)).toHaveLength(1);
		expect(render(state())).toContain(">Timeline</strong>");
		expect(render(state())).not.toContain('aria-label="Close timeline"');
	});

	test("hides the routine interruption notice without hiding actionable errors", () => {
		const html = render(state({ meta: { ...meta, status: "interrupted",
			error: "Interrupted. Extend the timeline to continue from the cursor." } }));
		expect(html).not.toContain("Interrupted");
		expect(html).not.toContain("continue from the cursor");
		expect(html).toContain("Continue analysis");
		for (const error of [
			"Time budget reached.",
			"Time budget reached (10.0 min). Extend again to continue from the cursor.",
			"Time budget reached (60.0 min). Extend again to continue from the cursor.",
		]) {
			const budget = render(state({ meta: { ...meta, status: "interrupted", error } }));
			expect(budget).not.toContain("Time budget reached");
			expect(budget).not.toContain('role="alert"');
			expect(budget).toContain("Continue analysis");
		}
		const actionable = render(state({ meta: { ...meta, status: "interrupted", error: "Could not save the timeline checkpoint." } }));
		expect(actionable).toContain("Could not save the timeline checkpoint.");
		const failed = render(state({ meta: { ...meta, status: "failed", error: "Time budget reached. Could not save the checkpoint." } }));
		expect(failed).toContain("Could not save the checkpoint.");
	});
});

describe("timeline extension dialog", () => {
	function renderDialog(hasTimeline = true, busy = false, running = false, options: ConstructTimelineOptions = { maxCommits: 50 }) {
		return renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineExtendDialog options={options} hasTimeline={hasTimeline}
				busy={busy} running={running} onOptionsChange={() => {}} onClose={() => {}} onSubmit={() => {}} />
		</ThemeProvider>);
	}
	test("offers history, commit-count and runtime presets without a mandatory time limit", () => {
		const html = renderDialog();
		expect(html).toContain('role="dialog"');
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('aria-label="Continue analysis"');
		for (const label of ["1 day", "1 week", "1 month", "10 commits", "100 commits", "1000 commits", "10 minutes", "1 hour"]) {
			expect(html).toContain(`>${label}</button>`);
		}
		expect(html).toContain("Custom commits");
		expect(html).toContain("No time limit");
		expect(html).not.toContain("Minutes per extension");
		expect(html).not.toContain('aria-label="Timeline time budget"');
		expect(html).toContain('value="50"');
		expect(html).toContain('type="submit"');
		expect(html).toContain("Extend timeline");
		expect(html).toContain("Continues oldest-first from the cursor");
		expect(html).toContain("History presets use UTC commit dates");
	});
	test("marks the chosen preset and leaves custom commits optional for history or timed runs", () => {
		for (const [options, label] of [
			[{ historyPeriod: "week" }, "1 week"], [{ maxMinutes: 60 }, "1 hour"], [{ maxCommits: 100 }, "100 commits"],
		] as Array<[ConstructTimelineOptions, string]>) {
			const html = renderDialog(true, false, false, options);
			const selected = html.match(/<button[^>]*aria-pressed="true"[^>]*>[^<]*<\/button>/g);
			expect(selected).toHaveLength(1);
			expect(selected![0]).toContain(`>${label}</button>`);
			const input = html.match(/<input[^>]*>/)![0];
			expect(input.includes("required")).toBe(options.maxCommits !== undefined);
			if (options.maxCommits === undefined) expect(input).toContain('value=""');
			expect(html.includes("No time limit")).toBe(options.maxMinutes === undefined);
		}
	});
	test("supports starting a fresh timeline", () => {
		const html = renderDialog(false);
		expect(html).toContain('aria-label="Start analysis"');
		expect(html).toContain("Start timeline");
		expect(html).not.toContain("Extend timeline");
	});
	test("disables the inputs and submit action when busy or already running", () => {
		for (const html of [renderDialog(true, true), renderDialog(true, false, true)]) {
			expect(html.match(/<input[^>]*>/g)?.every((input) => input.includes("disabled"))).toBe(true);
			expect(html.match(/<button type="submit"[^>]*>/)?.[0]).toContain("disabled");
		}
	});
});

const projectHistory: ConstructTimelineCommit[] = [
	{ sha: "c", committedAt: "2026-10-21T12:00:00Z", subject: "Repository HEAD" },
	{ sha: "b", committedAt: "2026-10-16T12:00:00Z", subject: "Analysis cursor" },
	{ sha: "a", committedAt: "2020-01-01T12:00:00Z", subject: "Project root" },
];
function renderProject(history: readonly ConstructTimelineCommit[] | undefined, analyzed: readonly { sha: string }[] | undefined, loading = false, error?: string) {
	return renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
		<ConstructTimelineProjectStats history={history} analyzed={analyzed} loading={loading} error={error} onRetry={() => {}} />
	</ThemeProvider>);
}
describe("timeline project overview", () => {
	test("shows the actual project start and HEAD dates, total history and analyzed fraction", () => {
		const html = renderProject(projectHistory, summary.commits);
		expect(html).toContain("Jan 1, 2020");
		expect(html).toContain("Oct 21, 2026");
		expect(html).toContain("66.7%");
		expect(html).toContain("2 of 3 commits");
	});

	test("counts matching SHAs, not stale events from another history", () => {
		const html = renderProject(projectHistory, [{ sha: "a" }, { sha: "a" }, { sha: "unrelated" }]);
		expect(html).toContain("33.3%");
		expect(html).toContain("1 of 3 commits");
	});

	test("distinguishes not started, complete and unavailable progress", () => {
		expect(renderProject(projectHistory, [])).toContain("0%");
		expect(renderProject(projectHistory, projectHistory)).toContain("100%");
		expect(renderProject(projectHistory, undefined)).not.toContain("0%");
		expect(renderProject(undefined, [], true)).toContain("Loading project history");
		expect(renderProject([], [])).not.toContain("NaN");
		expect(renderProject([], [])).not.toContain("0%");
	});

	test("keeps loaded values on read failure and offers retry", () => {
		const html = renderProject(projectHistory, summary.commits, false, "History unavailable");
		expect(html).toContain("66.7%");
		expect(html).toContain("Showing the last loaded history");
		expect(html).toContain("Retry project history");
	});
});
