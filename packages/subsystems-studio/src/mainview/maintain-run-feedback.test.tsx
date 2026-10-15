import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, slateNeonTheme } from "@principal-ade/industry-theme";
import { maintainRunFeedback } from "./maintain-run-feedback";
import { MaintenanceModelList } from "./components/MaintenanceModelList";
import modelListStories from "./components/MaintenanceModelList.stories";

describe("maintenance run feedback", () => {
	test("shows preparation before an OpenCode session exists and clears old errors", () => {
		const feedback = maintainRunFeedback({
			status: "error", events: 10, error: "old error", sessionId: "old-session",
		}, {
			graphId: "g-test", status: "running", model: "opencode/current",
		});
		expect(feedback.status).toBe("starting");
		expect(feedback.last).toContain("opencode/current");
		expect(feedback.error).toBeUndefined();
		expect(feedback.sessionId).toBeUndefined();
		expect(feedback.events).toBe(0);
	});

	test("retains failures before the first feed and after overview refreshes", () => {
		const feedback = maintainRunFeedback(undefined, {
			graphId: "g-test", status: "error", error: "OpenCode model catalog request failed (503)",
		});
		expect(feedback.status).toBe("error");
		expect(feedback.error).toContain("(503)");
		expect(feedback.sessionId).toBeUndefined();
	});

	test("retains the session link when a run fails after session creation", () => {
		const feedback = maintainRunFeedback({
			status: "running", events: 5, sessionId: "ses-existing",
		}, { graphId: "g-test", status: "error", error: "session failed" });
		expect(feedback.sessionId).toBe("ses-existing");
		expect(feedback.events).toBe(5);
		expect(feedback.last).toBe("session failed");
	});

	test("explains skipped and paused runs instead of silently disappearing", () => {
		expect(maintainRunFeedback(undefined, {
			graphId: "g-test", status: "done", skipped: true,
		}).last).toContain("Nothing to run");
		expect(maintainRunFeedback(undefined, {
			graphId: "g-test", status: "done", outcome: "needs_unblock",
		}).last).toContain("review the pending proposals");
		expect(maintainRunFeedback(undefined, {
			graphId: "g-test", status: "done", outcome: "stalled",
		}).last).toContain("did not clear");
	});

	test("renders a startup error even after the graph is no longer running", () => {
		const graph = modelListStories.args.models[0]!;
		const feedback = maintainRunFeedback(undefined, {
			graphId: graph.graphId, status: "error", error: "The catalog could not be loaded",
		});
		const html = renderToStaticMarkup(
			<ThemeProvider theme={slateNeonTheme}>
				<MaintenanceModelList
					{...modelListStories.args}
					models={[graph]}
					running={[]}
					feeds={{ [graph.graphId]: feedback }}
				/>
			</ThemeProvider>,
		);
		expect(html).toContain('role="alert"');
		expect(html).toContain("The catalog could not be loaded");
	});

	test("renders a no-op completion without a session or running graph", () => {
		const graph = modelListStories.args.models[0]!;
		const html = renderToStaticMarkup(
			<ThemeProvider theme={slateNeonTheme}>
				<MaintenanceModelList
					{...modelListStories.args}
					models={[graph]}
					running={[]}
					feeds={{ [graph.graphId]: maintainRunFeedback(undefined, {
						graphId: graph.graphId, status: "done", skipped: true,
					}) }}
				/>
			</ThemeProvider>,
		);
		expect(html).toContain('role="status"');
		expect(html).toContain("Nothing to run");
	});
});
