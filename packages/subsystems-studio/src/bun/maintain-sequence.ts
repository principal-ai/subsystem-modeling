/**
 * Maintain sequence — walk the audit's routed stages in priority order,
 * running one agent per stage, and advance only when the stage is cleared.
 *
 * A stage is **cleared** when its run leaves no pending proposals (the agent's
 * proposals were all auto-accepted, or it proposed nothing). If a stage leaves
 * pending proposals, the sequence stops and surfaces to the user to unblock —
 * the next stage runs only once the current one is clear.
 *
 * Pure and dependency-injected (audit / runStage / pendingForRun) so the state
 * machine is unit-testable without OpenCode, Graphify, or the proposal store.
 * The host wires the real implementations in maintain-model.ts.
 */

import type { SubsystemModelAuditReport } from "../shared/contract";
import { selectMaintainRoute, type MaintainRoute } from "./maintain-model";

/** Safety bound on stages per sequence. Routing has ~5 stages; this is generous. */
export const DEFAULT_MAX_MAINTAIN_STAGES = 8;

export type MaintainSequenceOutcome =
	/** Plan exhausted — `selectMaintainRoute` returned null. */
	| "converged"
	/** A stage left pending proposals; stopped for the user to unblock. */
	| "needs_unblock"
	/** Hit the stage cap without converging (e.g. a stage that never advances). */
	| "cap"
	/** A stage's agent run failed (or a dependency threw). */
	| "error";

export interface MaintainStageRun {
	ok: boolean;
	/** This stage's run id — the join key used to find its proposals. */
	runId: string;
	error?: string;
	sessionId?: string;
	summary?: string;
}

export interface MaintainStageOutcome extends MaintainStageRun {
	route: MaintainRoute;
	/** Pending proposals left behind by this stage's run. */
	pending: number;
	/** True when `pending === 0` (and the run succeeded). */
	cleared: boolean;
}

export interface MaintainSequenceResult {
	ok: boolean;
	outcome: MaintainSequenceOutcome;
	stages: MaintainStageOutcome[];
	/** The stage that left pending proposals, when `outcome === "needs_unblock"`. */
	blockedAt?: MaintainRoute;
	error?: string;
}

/**
 * Run the routed stages in order. See module doc for the cleared rule.
 *
 * `audit` is called before the first stage and again after each cleared stage,
 * so the next route reflects the accepted changes.
 */
export async function runMaintainSequence(deps: {
	audit: () => Promise<SubsystemModelAuditReport>;
	runStage: (
		route: MaintainRoute,
		report: SubsystemModelAuditReport,
	) => Promise<MaintainStageRun>;
	/** Pending proposals attributable to a stage's run (by runId). 0 == cleared. */
	pendingForRun: (runId: string) => Promise<number>;
	maxStages?: number;
}): Promise<MaintainSequenceResult> {
	const maxStages = Math.max(
		1,
		Math.floor(deps.maxStages ?? DEFAULT_MAX_MAINTAIN_STAGES),
	);
	const stages: MaintainStageOutcome[] = [];

	try {
		let report = await deps.audit();
		for (;;) {
			const route = selectMaintainRoute(report);
			if (!route) return { ok: true, outcome: "converged", stages };
			if (stages.length >= maxStages) {
				return { ok: true, outcome: "cap", stages };
			}

			const run = await deps.runStage(route, report);
			if (!run.ok) {
				stages.push({ ...run, route, pending: 0, cleared: false });
				return { ok: false, outcome: "error", stages, error: run.error };
			}

			const pending = await deps.pendingForRun(run.runId);
			const cleared = pending === 0;
			stages.push({ ...run, route, pending, cleared });
			if (!cleared) {
				return { ok: true, outcome: "needs_unblock", stages, blockedAt: route };
			}

			report = await deps.audit();
		}
	} catch (err) {
		return {
			ok: false,
			outcome: "error",
			stages,
			error: (err as Error).message,
		};
	}
}
