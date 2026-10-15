import type { StudioMessages } from "../shared/contract";
import type { FeedEntry } from "./components/MaintenanceModelList";

/** Keep lifecycle feedback even when no OpenCode session/feed was created. */
export function maintainRunFeedback(
	previous: FeedEntry | undefined,
	payload: StudioMessages["subsystemModelMaintainChanged"],
): FeedEntry {
	if (payload.status === "running") {
		return {
			status: "starting",
			events: 0,
			agent: payload.agent,
			last: payload.model
				? `Preparing maintenance with ${payload.model}…`
				: "Preparing maintenance: checking the model and auditing claims…",
		};
	}
	const summary = payload.skipped
		? "Nothing to run: the audit found no maintenance stage to execute."
		: payload.outcome === "needs_unblock"
			? "Maintenance paused: review the pending proposals before continuing."
			: payload.outcome === "stalled"
				? "Maintenance stopped: the agent did not clear the current stage."
				: payload.outcome === "cap"
					? "Maintenance stopped after reaching the stage limit."
					: "Maintenance finished.";
	return {
		...previous,
		status: payload.status,
		events: previous?.events ?? 0,
		error: payload.status === "error" ? payload.error ?? "Maintenance failed before completion." : null,
		last: payload.status === "error"
			? payload.error ?? "Maintenance failed before completion."
			: payload.summary ?? summary,
	};
}
