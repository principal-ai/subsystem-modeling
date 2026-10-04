import { describe, expect, test } from "bun:test";
import { auditReportToIssues } from "./subsystemIssues";
import type { SubsystemModelAuditFinding, SubsystemModelAuditReport } from "../shared/contract";
import type { StoredSubsystemModel } from "../bun/subsystem-model-store";

function report(findings: SubsystemModelAuditFinding[]): SubsystemModelAuditReport {
	return {
		graphId: "g1",
		title: "t",
		checkedAt: new Date().toISOString(),
		needsUpdate: false,
		summary: {} as SubsystemModelAuditReport["summary"],
		checks: [],
		findings,
	};
}

const graph = {
	id: "g1",
	title: "t",
	components: [
		{
			alias: "main",
			name: "main",
			construct: "function",
			file: "src/main.ts",
			purl: "pkg:github/a/repo",
		},
	],
} as unknown as StoredSubsystemModel;

describe("auditReportToIssues", () => {
	test("process-verification findings target the process frame — badge + focus work", () => {
		const { issues } = auditReportToIssues(
			report([
				{
					kind: "boundary_process_unassigned",
					severity: "info",
					processKey: "subsystems-studio/host",
					message: "no container claims it",
				},
			]),
			graph,
		);
		expect(issues).toHaveLength(1);
		// The graph folds frame badges and click-focus off this target; without
		// it the finding lists but the graph never learns it exists.
		expect(issues[0]!.target).toEqual({
			kind: "process",
			id: "subsystems-studio/host",
			label: "subsystems-studio/host",
		});
	});

	test("unbacked gaps keep their component target — focus the component, not a frame", () => {
		const { issues } = auditReportToIssues(
			report([
				{
					kind: "boundary_process_unbacked",
					severity: "info",
					componentAlias: "main",
					message: "no accepted container to assign from",
				},
			]),
			graph,
		);
		expect(issues[0]!.target).toEqual({
			kind: "component",
			id: "main",
			label: "main",
		});
	});
});
