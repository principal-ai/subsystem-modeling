import type { Meta, StoryObj } from "@storybook/react";
import type {
	MaintenanceOverviewModel,
	SubsystemModelProposal,
	SubsystemModelRun,
} from "../../shared/contract";
import { MaintenanceModelList } from "./MaintenanceModelList";

const T0 = "2026-09-26T09:00:00.000Z";

function model(over: Partial<MaintenanceOverviewModel> & { graphId: string; title: string }): MaintenanceOverviewModel {
	return {
		verdict: "partially_verified",
		verified: 42,
		open: 6,
		blocking: 0,
		blocked: 0,
		na: 3,
		coverage: 0.875,
		pendingProposalCount: 0,
		stale: false,
		checkedAt: T0,
		lanes: {
			construct: "verified",
			"static-topology": "partial",
			"dynamic-topology": "verified",
			trail: "none",
		},
		nextRoute: null,
		...over,
	};
}

function proposal(over: Partial<SubsystemModelProposal>): SubsystemModelProposal {
	return {
		id: "p1",
		graphId: "g-payments",
		status: "pending",
		createdAt: T0,
		lane: "construct",
		rationale: "Signature drifted from the declaration.",
		changes: [],
		preview: [],
		author: "construct-fixer",
		...over,
	};
}

function run(over: Partial<SubsystemModelRun> & { id: string; graphId: string }): SubsystemModelRun {
	return {
		graphTitle: "graph",
		status: "done",
		startedAt: T0,
		endedAt: "2026-09-26T09:04:00.000Z",
		agent: "construct-fixer",
		model: "opencode-go/deepseek-v4-flash",
		verdict: "partially_verified",
		commitsAtStart: {
			"pkg:github/principal-ai/subsystem-modeling": "b2c4e81f0a9d3756ce14b8f2d9071aa5e63c4b21",
		},
		...over,
	};
}

const PAYMENTS = model({
	graphId: "g-payments",
	title: "Payments Service",
	blocked: 2,
	pendingProposalCount: 2,
	lanes: {
		construct: "issues",
		"static-topology": "partial",
		"dynamic-topology": "verified",
		trail: "none",
	},
	nextRoute: { agent: "construct-fixer", layer: "construct", mode: "issues" },
});

const AUTH = model({
	graphId: "g-auth",
	title: "Auth Boundary",
	verdict: "fully_verified",
	verified: 88,
	open: 0,
	blocking: 0,
	na: 4,
	coverage: 1,
	lanes: {
		construct: "verified",
		"static-topology": "verified",
		"dynamic-topology": "verified",
		trail: "verified",
	},
});

const NOTIFICATIONS = model({
	graphId: "g-notify",
	title: "Notifications Worker",
	blocked: 1,
	lanes: {
		construct: "verified",
		"static-topology": "blocked",
		"dynamic-topology": "partial",
		trail: "none",
	},
	nextRoute: {
		agent: "package-module-fixer",
		layer: "static-topology",
		mode: "issues",
	},
});

const PAYMENTS_RUNS: SubsystemModelRun[] = [
	run({
		id: "run-2",
		graphId: "g-payments",
		status: "running",
		startedAt: "2026-09-26T09:10:00.000Z",
		endedAt: undefined,
		agent: "construct-fixer",
	}),
	run({
		id: "run-1",
		graphId: "g-payments",
		agent: "package-module-verifier",
		summary: "Confirmed 6 module boundaries, drafted one correction.",
		pendingCount: 1,
	}),
];

const PAYMENTS_PROPOSALS: SubsystemModelProposal[] = [
	proposal({
		id: "p-accepted",
		runId: "run-1",
		status: "accepted",
		author: "package-module-verifier",
		lane: "static-topology",
	}),
	proposal({ id: "p-pending", runId: "run-2", lane: "construct" }),
	proposal({
		id: "p-rejected",
		status: "rejected",
		author: "construct-verifier",
		lane: "construct",
	}),
];

const meta = {
	title: "Maintenance/MaintenanceModelList",
	component: MaintenanceModelList,
	parameters: { layout: "fullscreen" },
	args: {
		models: [PAYMENTS, AUTH, NOTIFICATIONS],
		running: ["g-notify"],
		auditing: [],
		runsByGraph: new Map([
			["g-payments", PAYMENTS_RUNS],
			["g-auth", [run({ id: "run-auth", graphId: "g-auth" })]],
		]),
		proposalsByGraph: new Map([["g-payments", PAYMENTS_PROPOSALS]]),
		feeds: {
			"g-notify": {
				status: "running",
				events: 14,
				agent: "package-module-fixer",
				last: "Auditing package/module boundaries for NotificationDispatcher…",
				lastAt: Date.now(),
				sessionId: "ses_mock",
			},
		},
		expandedRuns: new Set<string>(),
		briefCopiedId: null,
		proposalCountsByGraph: new Map([
			["g-payments", { construct: 1, "static-topology": 1 }],
		]),
		onToggleRuns: () => {},
		onToggleProvenance: () => {},
		onOpenModel: () => {},
		onRunMaintenance: () => {},
		onCopyBrief: () => {},
		onOpenLane: () => {},
		onOpenProposals: () => {},
		onOpenRun: () => {},
		onOpenLive: () => {},
	},
} satisfies Meta<typeof MaintenanceModelList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mixed list: one model with issues + pending proposals, one fully verified,
 *  one blocked, one running. */
export const Default: Story = {};

/** A model with its run history expanded, showing the Fix-cycle strip and runs. */
export const RunsExpanded: Story = {
	args: {
		expandedRuns: new Set(["g-payments"]),
		proposalCountsByGraph: new Map(),
	},
};

/** The Brief-agent copy landed on the first model. */
export const BriefCopied: Story = {
	args: { briefCopiedId: "g-payments" },
};

/** Repo-filtered to a repo whose model has no runs — the empty-history state. */
export const NoRuns: Story = {
	args: {
		models: [AUTH, NOTIFICATIONS],
		runsByGraph: new Map(),
		proposalsByGraph: new Map(),
	},
};

/** No models reference the selected repo. */
export const Empty: Story = {
	args: {
		models: [],
		runsByGraph: new Map(),
		proposalsByGraph: new Map(),
		feeds: {},
		emptyMessage: "No models reference this repo.",
	},
};

/** Models present but nothing pending, and none of them fully verified — the
 *  "run maintenance to draft the next one" footer. */
export const NothingPending: Story = {
	args: {
		models: [NOTIFICATIONS],
		running: [],
		runsByGraph: new Map(),
		proposalsByGraph: new Map(),
		proposalCountsByGraph: new Map(),
		feeds: {},
	},
};

/** Every model fully verified — the green "nothing to maintain" footer. */
export const AllVerified: Story = {
	args: {
		models: [AUTH],
		running: [],
		runsByGraph: new Map(),
		proposalsByGraph: new Map(),
		proposalCountsByGraph: new Map(),
		feeds: {},
	},
};
