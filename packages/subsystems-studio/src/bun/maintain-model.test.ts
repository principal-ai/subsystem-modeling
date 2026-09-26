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
	STATIC_TOPOLOGY_FIXER_AGENT,
	STATIC_TOPOLOGY_VERIFIER_AGENT,
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
		relations: [],
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
			walkthroughFailures: 0,
			staleDeclarations: 0,
			constructMismatches: 0,
			signatureMismatches: 0,
			weakAnchors: 0,
			unresolved: 0,
			ok: 0,
			relations: 0,
			softChecked: 0,
			softConfirmed: 0,
			softUnconfirmed: 0,
			brokenRelationEndpoints: 0,
			modulesClaimed: 0,
			moduleFileOk: 0,
			moduleFileMismatch: 0,
			processNestsChecked: 0,
			processNestOk: 0,
			processNestDisagree: 0,
		},
		checks: [],
		topologyChecks: [],
		boundaryChecks: [],
		...partial,
	};
}

describe("selectMaintainRoute", () => {
	test("prefers construct issues over topology issues", () => {
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
					kind: "topology_broken_endpoint",
					severity: "error",
					relationId: "r1",
					message: "broken",
				},
			],
		});
		expect(selectMaintainRoute(report)?.agent).toBe(CONSTRUCT_FIXER_AGENT);
	});

	test("routes topology broken endpoints to static-topology-fixer", () => {
		const report = emptyReport({
			needsUpdate: true,
			findings: [
				{
					kind: "topology_broken_endpoint",
					severity: "error",
					relationId: "r1",
					message: "broken",
				},
			],
		});
		expect(selectMaintainRoute(report)).toEqual({
			agent: STATIC_TOPOLOGY_FIXER_AGENT,
			layer: "static-topology",
			mode: "issues",
		});
	});

	test("prefers construct gaps over topology soft gaps", () => {
		const report = emptyReport({
			findings: [
				{
					kind: "construct_unconfirmed",
					severity: "info",
					componentAlias: "a",
					message: "unknown",
				},
				{
					kind: "topology_relation_unconfirmed",
					severity: "info",
					relationId: "r1",
					message: "soft",
				},
			],
		});
		expect(selectMaintainRoute(report)?.agent).toBe(CONSTRUCT_VERIFIER_AGENT);
	});

	test("prefers package/module unconfirmed over relation unconfirmed", () => {
		const report = emptyReport({
			findings: [
				{
					kind: "boundary_module_file_mismatch",
					severity: "info",
					componentAlias: "a",
					message: "mismatch",
				},
				{
					kind: "topology_relation_unconfirmed",
					severity: "info",
					relationId: "r1",
					message: "soft",
				},
			],
		});
		expect(selectMaintainRoute(report)?.agent).toBe(
			PACKAGE_MODULE_VERIFIER_AGENT,
		);
	});

	test("routes relation unconfirmed to static-topology-verifier", () => {
		const report = emptyReport({
			findings: [
				{
					kind: "topology_relation_unconfirmed",
					severity: "info",
					relationId: "r1",
					message: "soft",
				},
			],
			topologyChecks: [
				{
					relationId: "r1",
					relationType: "references",
					from: "a",
					to: "b",
					graphify: "unconfirmed",
					verdict: "gap",
				},
			],
		});
		expect(selectMaintainRoute(report)).toEqual({
			agent: STATIC_TOPOLOGY_VERIFIER_AGENT,
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

	test("routes package/module hard failures to package-module-fixer", () => {
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
			layer: "dynamic-topology",
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
