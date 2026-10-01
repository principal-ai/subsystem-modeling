import { describe, expect, test } from "bun:test";
import type {
	MaintenanceOverviewModel,
	MaintenanceOverviewProposal,
} from "../shared/contract";
import { buildMaintenanceOverview } from "./maintenance-overview";

function model(
	over: Partial<MaintenanceOverviewModel> & { title: string },
): MaintenanceOverviewModel {
	return {
		graphId: over.title,
		verdict: "partially_verified",
		verified: 0,
		open: 0,
		blocking: 0,
		blocked: 0,
		na: 0,
		coverage: 0,
		pendingProposalCount: 0,
		stale: false,
		lanes: {
			construct: "none",
			"static-topology": "none",
			"dynamic-topology": "none",
			trail: "none",
		},
		...over,
	};
}

describe("buildMaintenanceOverview", () => {
	test("sorts farthest-from-verified first", () => {
		const overview = buildMaintenanceOverview({
			models: [
				model({ title: "done", verdict: "fully_verified", verified: 5, coverage: 1 }),
				model({ title: "small", open: 1, coverage: 0.5 }),
				model({ title: "biggest", blocked: 4, open: 3, coverage: 0.2 }),
			],
			pendingProposals: [],
			running: [],
		});
		expect(overview.models.map((m) => m.title)).toEqual([
			"biggest",
			"small",
			"done",
		]);
	});

	test("sorts proposals, then recent runs, ahead of work", () => {
		const overview = buildMaintenanceOverview({
			models: [
				model({ title: "most-work-no-run", open: 5, coverage: 0.1 }),
				model({
					title: "with-proposal",
					open: 1,
					coverage: 0.5,
					pendingProposalCount: 2,
				}),
				model({
					title: "older-run",
					open: 3,
					coverage: 0.1,
					recentRunAt: "2026-01-01T00:00:00.000Z",
				}),
				model({
					title: "newer-run",
					open: 2,
					coverage: 0.5,
					recentRunAt: "2026-06-01T00:00:00.000Z",
				}),
				model({
					title: "with-proposal-and-run",
					open: 4,
					coverage: 0.2,
					pendingProposalCount: 1,
					recentRunAt: "2026-03-01T00:00:00.000Z",
				}),
			],
			pendingProposals: [],
			running: [],
		});
		expect(overview.models.map((m) => m.title)).toEqual([
			"with-proposal-and-run",
			"with-proposal",
			"newer-run",
			"older-run",
			"most-work-no-run",
		]);
	});

	test("sums the ledger and derives aggregate coverage", () => {
		const overview = buildMaintenanceOverview({
			models: [
				model({ title: "a", verified: 3, open: 1, blocking: 1, blocked: 2, na: 1, coverage: 0.75 }),
				model({ title: "b", verified: 6, open: 2, coverage: 0.75 }),
			],
			pendingProposals: [],
			running: [],
		});
		expect(overview.totals).toEqual({
			verified: 9,
			open: 3,
			blocking: 1,
			blocked: 2,
			na: 1,
			coverage: 0.75,
		});
	});

	test("all-blocked models read 0% coverage", () => {
		const overview = buildMaintenanceOverview({
			models: [model({ title: "stuck", blocked: 3, coverage: 0 })],
			pendingProposals: [],
			running: [],
		});
		expect(overview.totals.coverage).toBe(0);
	});

	test("counts needsWork and verified, and passes proposals/running through", () => {
		const pending: MaintenanceOverviewProposal[] = [
			{
				graphId: "g1",
				title: "g1",
				proposal: {
					id: "sp-1",
					graphId: "g1",
					status: "pending",
					createdAt: "2026-01-01T00:00:00.000Z",
					lane: "construct",
					rationale: "fix",
					changes: [],
					preview: [],
				},
			},
		];
		const overview = buildMaintenanceOverview({
			models: [
				model({ title: "verified", verdict: "fully_verified", verified: 2, coverage: 1 }),
				model({ title: "blocked-only", blocked: 2, coverage: 0 }),
				model({ title: "open", open: 1, coverage: 0.5 }),
			],
			pendingProposals: pending,
			running: ["open"],
			auditing: ["blocked-only"],
		});
		expect(overview.verified).toBe(1);
		expect(overview.needsWork).toBe(1);
		expect(overview.running).toEqual(["open"]);
		expect(overview.auditing).toEqual(["blocked-only"]);
		expect(overview.pendingProposals).toBe(pending);
	});

	test("does not mutate the input array order", () => {
		const input = [
			model({ title: "done", verdict: "fully_verified", coverage: 1 }),
			model({ title: "work", open: 2, coverage: 0.1 }),
		];
		buildMaintenanceOverview({
			models: input,
			pendingProposals: [],
			running: [],
		});
		expect(input.map((m) => m.title)).toEqual(["done", "work"]);
	});
});
