import { describe, expect, test } from "bun:test";
import type { SubsystemModelAuditReport } from "../shared/contract";
import {
	CONSTRUCT_FIXER_AGENT,
	CONSTRUCT_VERIFIER_AGENT,
	PACKAGE_MODULE_VERIFIER_AGENT,
} from "./maintain-model";
import { runMaintainSequence, type MaintainStageRun } from "./maintain-sequence";

function emptyReport(
	partial: Partial<SubsystemModelAuditReport> & {
		findings: SubsystemModelAuditReport["findings"];
	},
): SubsystemModelAuditReport {
	return {
		graphId: "g1",
		title: "t",
		checkedAt: new Date().toISOString(),
		needsUpdate: false,
		summary: {
			components: 0,
			filesVerified: 0,
			symbolsVerified: 0,
			declarationsFresh: 0,
			constructsMatched: 0,
			signaturesMatched: 0,
			anchorsExact: 0,
			graphifyConfirmed: 0,
			externalsSkipped: 0,
			missingFiles: 0,
			missingSymbols: 0,
			trailFailures: 0,
			staleDeclarations: 0,
			constructMismatches: 0,
			signatureMismatches: 0,
			weakAnchors: 0,
			unresolved: 0,
			ok: 0,
			modulesClaimed: 0,
			moduleFileOk: 0,
			moduleFileMismatch: 0,
			processNestsChecked: 0,
			processNestOk: 0,
			processNestDisagree: 0,
		},
		checks: [],
		boundaryChecks: [],
		...partial,
	};
}

const constructIssue = () =>
	emptyReport({ findings: [{ kind: "missing_file", severity: "error", message: "x" }] });
const constructGap = () =>
	emptyReport({
		findings: [{ kind: "construct_unconfirmed", severity: "info", message: "x" }],
	});
const boundaryGap = () =>
	emptyReport({
		findings: [{ kind: "boundary_module_file_mismatch", severity: "info", message: "x" }],
	});
const noWork = () => emptyReport({ findings: [] });

/** Scripted audit: returns each report in turn, then the last forever. */
function scriptedAudit(reports: SubsystemModelAuditReport[]) {
	let i = 0;
	const calls = { n: 0 };
	return {
		calls,
		audit: async () => {
			calls.n++;
			const r = reports[Math.min(i, reports.length - 1)];
			i++;
			return r;
		},
	};
}

const okRun = (runId: string): MaintainStageRun => ({ ok: true, runId });

describe("runMaintainSequence", () => {
	test("converges immediately when there is nothing to route", async () => {
		const { audit } = scriptedAudit([noWork()]);
		let ran = 0;
		const result = await runMaintainSequence({
			audit,
			runStage: async () => {
				ran++;
				return okRun("r1");
			},
			pendingForRun: async () => 0,
		});
		expect(result.outcome).toBe("converged");
		expect(result.stages).toEqual([]);
		expect(ran).toBe(0);
	});

	test("runs a stage and converges when it is cleared", async () => {
		const { audit } = scriptedAudit([constructIssue(), noWork()]);
		const result = await runMaintainSequence({
			audit,
			runStage: async () => okRun("r1"),
			pendingForRun: async () => 0,
		});
		expect(result.outcome).toBe("converged");
		expect(result.stages).toHaveLength(1);
		expect(result.stages[0]?.route.agent).toBe(CONSTRUCT_FIXER_AGENT);
		expect(result.stages[0]?.cleared).toBe(true);
	});

	test("stops and surfaces when a stage leaves pending proposals", async () => {
		const { audit } = scriptedAudit([constructIssue()]);
		const result = await runMaintainSequence({
			audit,
			runStage: async () => okRun("r1"),
			pendingForRun: async (runId) => (runId === "r1" ? 2 : 0),
		});
		expect(result.outcome).toBe("needs_unblock");
		expect(result.ok).toBe(true);
		expect(result.blockedAt?.agent).toBe(CONSTRUCT_FIXER_AGENT);
		expect(result.stages).toHaveLength(1);
		expect(result.stages[0]?.pending).toBe(2);
		expect(result.stages[0]?.cleared).toBe(false);
	});

	test("advances through stages in priority order", async () => {
		const { audit, calls } = scriptedAudit([
			constructIssue(),
			constructGap(),
			boundaryGap(),
			noWork(),
		]);
		const result = await runMaintainSequence({
			audit,
			runStage: async () => okRun(`r${calls.n}`),
			pendingForRun: async () => 0,
		});
		expect(result.outcome).toBe("converged");
		expect(result.stages.map((s) => s.route.agent)).toEqual([
			CONSTRUCT_FIXER_AGENT,
			CONSTRUCT_VERIFIER_AGENT,
			PACKAGE_MODULE_VERIFIER_AGENT,
		]);
		// One audit before the first stage + one after each of the 3 cleared stages.
		expect(calls.n).toBe(4);
	});

	test("errors when a stage run fails", async () => {
		const { audit } = scriptedAudit([constructIssue()]);
		const result = await runMaintainSequence({
			audit,
			runStage: async () => ({ ok: false, runId: "r1", error: "boom" }),
			pendingForRun: async () => 0,
		});
		expect(result.outcome).toBe("error");
		expect(result.ok).toBe(false);
		expect(result.error).toBe("boom");
		expect(result.stages[0]?.ok).toBe(false);
	});

	test("stalls when a cleared stage does not advance the route", async () => {
		// Same work every audit, and the stage clears with zero pending (the
		// agent declined to propose) — the sequence must not re-run it.
		const { audit } = scriptedAudit([constructIssue()]);
		const result = await runMaintainSequence({
			audit,
			runStage: async () => okRun("r1"),
			pendingForRun: async () => 0,
			maxStages: 8,
		});
		expect(result.outcome).toBe("stalled");
		expect(result.stages).toHaveLength(1);
		expect(result.blockedAt?.agent).toBe(CONSTRUCT_FIXER_AGENT);
	});
});
