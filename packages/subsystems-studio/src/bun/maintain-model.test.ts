import { describe, expect, test } from "bun:test";
import type { SubsystemModelAuditReport } from "../shared/contract";
import {
	buildVerificationBrief,
	CONSTRUCT_FIXER_AGENT,
	CONSTRUCT_VERIFIER_AGENT,
	PACKAGE_MODULE_FIXER_AGENT,
	PACKAGE_MODULE_VERIFIER_AGENT,
	RUNTIME_TOPOLOGY_VERIFIER_AGENT,
	selectMaintainRoute,
} from "./maintain-model";
import type { StoredSubsystemModel } from "./subsystem-model-store";

function graphFixture(partial?: Partial<StoredSubsystemModel>): StoredSubsystemModel {
	return {
		id: "sg-1",
		title: "Maintain run",
		description: "how a Maintain run starts",
		components: [
			{
				alias: "maintain-orchestrator",
				name: "maintainSubsystemModel",
				purl: "external:no-root",
			},
		],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...partial,
	} as unknown as StoredSubsystemModel;
}

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
			stepsUnconfirmed: 0,
			stepsStale: 0,
			stepsVerified: 0,
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
			processRequired: 0,
			processClaimed: 0,
			processMissing: 0,
		},
		checks: [],
		boundaryChecks: [],
		...partial,
	};
}

describe("selectMaintainRoute", () => {
	test("prefers construct issues over module issues", () => {
		const report = emptyReport({
			needsUpdate: true,
			findings: [
				{
					kind: "missing_file",
					severity: "error",
					componentAlias: "a",
					message: "gone",
				},
				{
					kind: "boundary_module_file_mismatch",
					severity: "error",
					componentAlias: "a",
					message: "no anchor",
				},
			],
		});
		expect(selectMaintainRoute(report)?.agent).toBe(CONSTRUCT_FIXER_AGENT);
	});

	test("prefers construct issues over module gaps", () => {
		const report = emptyReport({
			needsUpdate: true,
			findings: [
				{
					kind: "construct_mismatch",
					severity: "error",
					componentAlias: "a",
					message: "wrong",
				},
				{
					kind: "boundary_module_file_mismatch",
					severity: "info",
					componentAlias: "a",
					message: "mismatch",
				},
			],
		});
		expect(selectMaintainRoute(report)?.agent).toBe(CONSTRUCT_FIXER_AGENT);
	});

	test("routes module containment hard failures to package-module-fixer (static topology)", () => {
		const report = emptyReport({
			needsUpdate: true,
			findings: [
				{
					kind: "boundary_module_file_mismatch",
					severity: "error",
					componentAlias: "a",
					message: "no anchor",
				},
			],
		});
		expect(selectMaintainRoute(report)).toEqual({
			agent: PACKAGE_MODULE_FIXER_AGENT,
			layer: "static-topology",
			mode: "issues",
		});
	});

	test("prefers module containment gaps over construct gaps", () => {
		const report = emptyReport({
			findings: [
				{
					kind: "construct_unconfirmed",
					severity: "info",
					componentAlias: "a",
					message: "unknown",
				},
				{
					kind: "boundary_module_file_mismatch",
					severity: "info",
					componentAlias: "a",
					message: "mismatch",
				},
			],
		});
		expect(selectMaintainRoute(report)?.agent).toBe(
			PACKAGE_MODULE_VERIFIER_AGENT,
		);
	});

	test("routes module unconfirmed to package-module-verifier (static topology)", () => {
		const report = emptyReport({
			findings: [
				{
					kind: "boundary_module_file_mismatch",
					severity: "info",
					componentAlias: "a",
					message: "mismatch",
				},
			],
			boundaryChecks: [
				{
					componentAlias: "a",
					kind: "module_file",
					module: "src/other",
					file: "src/a.ts",
					verdict: "gap",
				},
			],
		});
		expect(selectMaintainRoute(report)).toEqual({
			agent: PACKAGE_MODULE_VERIFIER_AGENT,
			layer: "static-topology",
			mode: "verify",
		});
	});

	test("routes process unconfirmed to runtime-topology-verifier", () => {
		const report = emptyReport({
			findings: [
				{
					kind: "boundary_process_nest_disagree",
					severity: "info",
					componentAlias: "a",
					message: "disagree",
				},
			],
		});
		expect(selectMaintainRoute(report)).toEqual({
			agent: RUNTIME_TOPOLOGY_VERIFIER_AGENT,
			layer: "dynamic-topology",
			mode: "verify",
		});
	});

	test("prefers process gaps over construct gaps", () => {
		const report = emptyReport({
			findings: [
				{
					kind: "construct_unconfirmed",
					severity: "info",
					componentAlias: "a",
					message: "unknown",
				},
				{
					kind: "boundary_process_nest_disagree",
					severity: "info",
					componentAlias: "a",
					message: "disagree",
				},
			],
		});
		expect(selectMaintainRoute(report)?.agent).toBe(
			RUNTIME_TOPOLOGY_VERIFIER_AGENT,
		);
	});

	test("routes construct gaps to construct-verifier when nothing else remains", () => {
		const report = emptyReport({
			findings: [
				{
					kind: "construct_unconfirmed",
					severity: "info",
					componentAlias: "a",
					message: "unknown",
				},
			],
		});
		expect(selectMaintainRoute(report)).toEqual({
			agent: CONSTRUCT_VERIFIER_AGENT,
			layer: "construct",
			mode: "verify",
		});
	});

	test("routes an unmatched symbol to construct-fixer (a broken claim, not a gap)", () => {
		// symbol_unmatched is emitted at error severity: the file exists but
		// nothing in it declares the symbol. That is a hard failure, so it must
		// reach the fixer (which can relocate, rename, or deprecate) rather than
		// the verifier, which only fills confirmation gaps.
		const report = emptyReport({
			needsUpdate: true,
			findings: [
				{
					kind: "symbol_unmatched",
					severity: "error",
					componentAlias: "a",
					message: "No Graphify node matches symbol foo in a.ts",
				},
			],
		});
		expect(selectMaintainRoute(report)).toEqual({
			agent: CONSTRUCT_FIXER_AGENT,
			layer: "construct",
			mode: "issues",
		});
	});

	test("returns null when clean", () => {
		const report = emptyReport({ findings: [] });
		expect(selectMaintainRoute(report)).toBeNull();
	});
});

describe("buildVerificationBrief", () => {
	test("carries identity, verdict, findings, and access commands", () => {
		const report = emptyReport({
			findings: [
				{
					kind: "construct_unconfirmed",
					severity: "info",
					componentAlias: "maintain-orchestrator",
					message: "Construct unclassified",
				},
			],
		});
		const brief = buildVerificationBrief({ graph: graphFixture(), report });
		expect(brief).toContain("# Subsystem model verification brief");
		expect(brief).toContain("- **Model id**: sg-1");
		expect(brief).toContain("- **Verdict**: partially_verified");
		expect(brief).toContain("## Findings");
		expect(brief).toContain("construct_unconfirmed");
		expect(brief).toContain("/api/subsystem-model/sg-1/audit");
		expect(brief).toContain("Answer questions about this model's verification state");
	});

	test("reports unknown verdict without a persisted audit", () => {
		const brief = buildVerificationBrief({ graph: graphFixture() });
		expect(brief).toContain("- **Verdict**: unknown (no audit persisted yet)");
		expect(brief).toContain("no persisted audit");
	});
});
