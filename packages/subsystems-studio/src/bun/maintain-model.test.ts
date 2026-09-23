import { describe, expect, test } from "bun:test";
import type { SubsystemModelAuditReport } from "../shared/contract";
import {
	BOUNDARY_GAP_FILLER_AGENT,
	GAP_FILLER_AGENT,
	ISSUE_FIXER_AGENT,
	selectMaintainRoute,
	TOPOLOGY_FIXER_AGENT,
	TOPOLOGY_GAP_FILLER_AGENT,
} from "./maintain-model";

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
		expect(selectMaintainRoute(report)?.agent).toBe(ISSUE_FIXER_AGENT);
	});

	test("routes topology broken endpoints to topology-fixer", () => {
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
			agent: TOPOLOGY_FIXER_AGENT,
			layer: "topology",
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
		expect(selectMaintainRoute(report)?.agent).toBe(GAP_FILLER_AGENT);
	});

	test("prefers boundary gaps over topology soft gaps", () => {
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
		expect(selectMaintainRoute(report)?.agent).toBe(BOUNDARY_GAP_FILLER_AGENT);
	});

	test("routes topology soft gaps to topology-gap-filler", () => {
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
			agent: TOPOLOGY_GAP_FILLER_AGENT,
			layer: "topology",
			mode: "gaps",
		});
	});

	test("routes boundary soft gaps to boundary-gap-filler", () => {
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
			agent: BOUNDARY_GAP_FILLER_AGENT,
			layer: "boundary",
			mode: "gaps",
		});
	});

	test("returns null when clean", () => {
		const report = emptyReport({ findings: [] });
		expect(selectMaintainRoute(report)).toBeNull();
	});
});
