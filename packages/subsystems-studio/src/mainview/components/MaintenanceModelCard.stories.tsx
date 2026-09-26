import type { Meta, StoryObj } from "@storybook/react";
import type {
	MaintenanceOverviewModel,
	SubsystemModelProposal,
	SubsystemModelRun,
} from "../../shared/contract";
import { MaintenanceModelCard } from "./MaintenanceModelList";

const T0 = "2026-09-26T09:00:00.000Z";

const BASE: MaintenanceOverviewModel = {
	graphId: "g-payments",
	title: "Payments Service",
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
		walkthrough: "none",
	},
};

const RUNS: SubsystemModelRun[] = [
	{
		id: "run-2",
		graphId: "g-payments",
		graphTitle: "Payments Service",
		status: "running",
		startedAt: "2026-09-26T09:10:00.000Z",
		agent: "construct-fixer",
		model: "opencode-go/deepseek-v4-flash",
	},
	{
		id: "run-1",
		graphId: "g-payments",
		graphTitle: "Payments Service",
		status: "done",
		startedAt: T0,
		endedAt: "2026-09-26T09:04:00.000Z",
		agent: "static-topology-verifier",
		model: "opencode-go/deepseek-v4-flash",
		verdict: "partially_verified",
		summary: "Confirmed 6 relations, drafted one correction.",
		pendingCount: 1,
	},
];

const PROPOSALS: SubsystemModelProposal[] = [
	{
		id: "p-accepted",
		runId: "run-1",
		graphId: "g-payments",
		status: "accepted",
		createdAt: T0,
		lane: "static-topology",
		rationale: "Relation target renamed.",
		changes: [],
		preview: [],
		author: "static-topology-verifier",
	},
	{
		id: "p-pending",
		runId: "run-1",
		graphId: "g-payments",
		status: "pending",
		createdAt: T0,
		lane: "construct",
		rationale: "Signature drifted from the declaration.",
		changes: [],
		preview: [],
		author: "static-topology-verifier",
	},
	{
		id: "p-rejected",
		graphId: "g-payments",
		status: "rejected",
		createdAt: T0,
		lane: "construct",
		rationale: "No change needed.",
		changes: [],
		preview: [],
		author: "construct-verifier",
	},
];

const meta = {
	title: "Maintenance/MaintenanceModelCard",
	component: MaintenanceModelCard,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story: () => JSX.Element) => (
			<div style={{ padding: 24, maxWidth: 960 }}>
				<Story />
			</div>
		),
	],
	args: {
		model: BASE,
		runs: [],
		proposals: undefined,
		feed: undefined,
		maintainRunning: false,
		auditRunning: false,
		runsOpen: false,
		briefCopied: false,
		proposalCounts: undefined,
		onToggleRuns: () => {},
		onOpenModel: () => {},
		onRunMaintenance: () => {},
		onCopyBrief: () => {},
		onOpenLane: () => {},
		onOpenProposals: () => {},
		onOpenRun: () => {},
		onOpenLive: () => {},
	},
} satisfies Meta<typeof MaintenanceModelCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Baseline card: no runs, no proposals, mixed lane badges. */
export const Default: Story = {};

/** A hard failure in the construct lane plus pending proposals — the lane badge
 *  shows the count badge and the Run button stays available. */
export const IssuesWithProposals: Story = {
	args: {
		model: {
			...BASE,
			verdict: "issues",
			blocking: 2,
			pendingProposalCount: 2,
			lanes: {
				construct: "issues",
				"static-topology": "partial",
				"dynamic-topology": "verified",
				walkthrough: "none",
			},
			nextRoute: { agent: "construct-fixer", layer: "construct", mode: "issues" },
		},
		proposalCounts: { construct: 1, "static-topology": 1 },
	},
};

/** Every layer verified and nothing pending. */
export const FullyVerified: Story = {
	args: {
		model: {
			...BASE,
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
				walkthrough: "verified",
			},
		},
	},
};

/** Claims stranded on an unavailable repo / graphify cache — the blocked count. */
export const Blocked: Story = {
	args: {
		model: {
			...BASE,
			blocked: 3,
			lanes: {
				construct: "verified",
				"static-topology": "blocked",
				"dynamic-topology": "partial",
				walkthrough: "none",
			},
			nextRoute: {
				agent: "static-topology-fixer",
				layer: "static-topology",
				mode: "issues",
			},
		},
	},
};

/** Run history available — the Runs ( n ) toggle appears. */
export const WithRuns: Story = {
	args: { runs: RUNS, proposals: PROPOSALS },
};

/** Run history expanded: the Fix-cycle strip plus the run rows and their
 *  per-run proposal outcomes. */
export const RunsExpanded: Story = {
	args: { runs: RUNS, proposals: PROPOSALS, runsOpen: true },
};

/** A run in flight — the live agent strip shows the active agent, event
 *  counters, and the last event line; clicking opens the events tab. */
export const Running: Story = {
	args: {
		runs: RUNS,
		maintainRunning: true,
		feed: {
			status: "running",
			events: 14,
			agent: "construct-fixer",
			title: "Payments Service",
			last: "Auditing construct declarations…",
			lastAt: Date.now(),
			sessionId: "ses_mock",
		},
	},
};

/** Starting up — no OpenCode event yet. */
export const RunningStarting: Story = {
	args: {
		runs: RUNS,
		maintainRunning: true,
		feed: {
			status: "starting",
			events: 0,
			agent: "construct-fixer",
			sessionId: "ses_mock",
		},
	},
};

/** The run failed — the feed error renders under the live line. */
export const RunningErrored: Story = {
	args: {
		runs: RUNS,
		maintainRunning: true,
		feed: {
			status: "error",
			events: 3,
			agent: "static-topology-fixer",
			last: "Relation audit aborted.",
			error: "OpenCode session failed: context length exceeded",
			sessionId: "ses_mock",
		},
	},
};

/** A re-audit (not a Maintain run) is in flight — the Run button is busy. */
export const Auditing: Story = {
	args: { runs: RUNS, auditRunning: true },
};

/** The Brief-agent copy just landed — the button flips to "Copied". */
export const BriefCopied: Story = {
	args: { runs: RUNS, briefCopied: true },
};
