import type { Meta, StoryObj } from "@storybook/react";
import type {
	MaintenanceOverview,
	SubsystemModelProposal,
	SubsystemModelRun,
} from "../../shared/contract";
import { mockMaintenanceOverview, mockProposals } from "../../../.storybook/mocks/rpc";
import { MaintenancePanel } from "./MaintenancePanel";

const T0 = "2026-09-26T09:00:00.000Z";

function run(
	over: Partial<SubsystemModelRun> & { id: string; graphId: string },
): SubsystemModelRun {
	return {
		graphTitle: "graph",
		status: "done",
		startedAt: T0,
		endedAt: "2026-09-26T09:04:00.000Z",
		agent: "construct-fixer",
		model: "opencode-go/deepseek-v4-flash",
		verdict: "partially_verified",
		...over,
	};
}

const OVERVIEW: MaintenanceOverview = {
	running: [],
	auditing: [],
	needsWork: 2,
	verified: 1,
	totals: { verified: 130, open: 6, blocking: 0, blocked: 3, na: 7, coverage: 0.85 },
	models: [
		{
			graphId: "g-payments",
			title: "Payments Service",
			verdict: "issues",
			verified: 40,
			open: 4,
			blocking: 2,
			blocked: 0,
			na: 2,
			coverage: 0.8,
			pendingProposalCount: 2,
			stale: false,
			checkedAt: T0,
			lanes: {
				construct: "issues",
				"static-topology": "partial",
				"dynamic-topology": "verified",
				walkthrough: "none",
			},
			repos: [{ owner: "principal-ai", name: "subsystem-modeling" }],
			nextRoute: { agent: "construct-fixer", layer: "construct", mode: "issues" },
		},
		{
			graphId: "g-auth",
			title: "Auth Boundary",
			verdict: "fully_verified",
			verified: 88,
			open: 0,
			blocking: 0,
			blocked: 0,
			na: 4,
			coverage: 1,
			pendingProposalCount: 0,
			stale: false,
			checkedAt: T0,
			lanes: {
				construct: "verified",
				"static-topology": "verified",
				"dynamic-topology": "verified",
				walkthrough: "verified",
			},
			repos: [{ owner: "principal-ai", name: "subsystem-modeling" }],
		},
		{
			graphId: "g-notify",
			title: "Notifications Worker",
			verdict: "partially_verified",
			verified: 12,
			open: 2,
			blocking: 0,
			blocked: 3,
			na: 1,
			coverage: 0.85,
			pendingProposalCount: 1,
			stale: false,
			checkedAt: T0,
			lanes: {
				construct: "verified",
				"static-topology": "blocked",
				"dynamic-topology": "partial",
				walkthrough: "none",
			},
			repos: [{ owner: "principal-ai", name: "subsystem-modeling" }],
			nextRoute: {
				agent: "static-topology-fixer",
				layer: "static-topology",
				mode: "issues",
			},
		},
	],
	pendingProposals: [],
};

const PROPOSALS: SubsystemModelProposal[] = [
	{
		id: "p1",
		graphId: "g-payments",
		status: "pending",
		createdAt: T0,
		lane: "construct",
		rationale: "Signature drifted from the declaration.",
		changes: [],
		preview: [],
		author: "construct-fixer",
		secondOpinion: {
			source: "jev-latest",
			checkedAt: T0,
			verdict: "accurate",
			confidence: 0.92,
		},
	},
	{
		id: "p2",
		graphId: "g-notify",
		status: "pending",
		createdAt: T0,
		lane: "static-topology",
		rationale: "Relation target renamed.",
		changes: [],
		preview: [],
		author: "static-topology-fixer",
	},
];

const RUNS: SubsystemModelRun[] = [
	run({ id: "run-1", graphId: "g-payments", agent: "static-topology-verifier" }),
	run({ id: "run-2", graphId: "g-notify", agent: "construct-fixer", status: "error", error: "OpenCode session failed" }),
];

const meta = {
	title: "Maintenance/MaintenancePanel",
	component: MaintenancePanel,
	parameters: { layout: "fullscreen" },
	decorators: [
		// The panel sizes itself with `flex: 1` against a definite-height
		// ancestor (the app shell's `100vh`). Storybook's html/body are
		// `height: auto`, so give it that ancestor here.
		(Story: () => JSX.Element) => (
			<div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof MaintenancePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The whole Maintainer tab: header, repo filter, and the model card list,
 *  against seeded mock RPC data. */
export const Default: Story = {
	render: () => {
		mockMaintenanceOverview(OVERVIEW, RUNS);
		mockProposals(PROPOSALS);
		return <MaintenancePanel />;
	},
};

/** Every model fully verified and no pending proposals — the green footer. */
export const AllVerified: Story = {
	render: () => {
		mockMaintenanceOverview(
			{
				...OVERVIEW,
				needsWork: 0,
				auditing: ["g-payments"],
				pendingProposals: [],
				models: OVERVIEW.models.map((m) => ({
					...m,
					verdict: "fully_verified" as const,
					open: 0,
					blocking: 0,
					pendingProposalCount: 0,
				})),
			},
			[],
		);
		return <MaintenancePanel />;
	},
};

/** A model is mid-run with a live feed — its card shows the agent strip. */
export const Running: Story = {
	render: () => {
		mockMaintenanceOverview({ ...OVERVIEW, running: ["g-notify"] }, RUNS);
		return <MaintenancePanel />;
	},
};

/** No stored models at all. */
export const NoModels: Story = {
	render: () => {
		mockMaintenanceOverview(
			{
				...OVERVIEW,
				needsWork: 0,
				verified: 0,
				models: [],
				pendingProposals: [],
			},
			[],
		);
		return <MaintenancePanel />;
	},
};
