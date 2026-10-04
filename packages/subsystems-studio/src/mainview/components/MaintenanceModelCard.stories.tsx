import type { Meta, StoryObj } from "@storybook/react";
import type {
	MaintenanceOverviewModel,
	SubsystemModelProposal,
	SubsystemModelRun,
} from "../../shared/contract";
import { MaintenanceModelCard } from "./MaintenanceModelList";
import type { ModelProvenanceData } from "./ModelProvenance";

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
		trail: "none",
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
		agent: "package-module-verifier",
		model: "opencode-go/deepseek-v4-flash",
		verdict: "partially_verified",
		summary: "Confirmed 6 module boundaries, drafted one correction.",
		pendingCount: 1,
		commitsAtStart: {
			"pkg:github/principal-ai/subsystem-modeling": "b2c4e81f0a9d3756ce14b8f2d9071aa5e63c4b21",
		},
	},
	{
		id: "run-0",
		graphId: "g-payments",
		graphTitle: "Payments Service",
		status: "done",
		startedAt: "2026-09-25T08:00:00.000Z",
		endedAt: "2026-09-25T08:02:00.000Z",
		agent: "construct-fixer",
		model: "opencode-go/deepseek-v4-flash",
		verdict: "partially_verified",
		summary: "Older run — superseded by run-1.",
		commitsAtStart: {
			"pkg:github/principal-ai/subsystem-modeling": "7d1f2a90c4b3e5f60718293a4b5c6d7e8f901234",
		},
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
		rationale: "Module boundary renamed.",
		changes: [],
		preview: [],
		author: "package-module-verifier",
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
		author: "package-module-verifier",
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

const sha = (seed: string): string =>
	(seed + "0f3c9a17be42d5086ac3719fe5b2d4e08a6c9137").slice(0, 40);

const CORE = "pkg:github/principal-ai/subsystem-modeling";
const PIN = sha("83a9a50950ef50cb11c9c559cbc500cbd92311ee");
const LIVE = sha("b2c4e81f0a9d3756ce14b8f2d9071aa5e63c4b21");

/** Per-commit flags for the dot strip: 22 commits, 4 unpushed, 3 touched. */
const COMMITS = Array.from({ length: 22 }, (_, i) => ({
	sha: sha(`c${i}`),
	touched: [19, 20, 21].includes(i),
}));

/**
 * The headline case: 22 commits since verification, 3 of which touched a file
 * the model anchors, and 4 not yet pushed.
 */
const PROVENANCE_MOVED: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN },
	verifiedAtCommits: { [CORE]: PIN },
	purlFreshness: [{ purl: CORE, pinned: PIN, live: LIVE, status: "moved" }],
	anchorChanges: {
		[CORE]: {
			committed: ["packages/subsystems-studio/src/bun/purl-commits.ts"],
			commitsSincePin: 22,
			remoteIndex: 17,
			commits: COMMITS,
		},
	},
};

/** Verified and unmoved — the strip collapses to nothing under the badge. */
const PROVENANCE_CURRENT: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN },
	verifiedAtCommits: { [CORE]: PIN },
	purlFreshness: [{ purl: CORE, pinned: PIN, live: PIN, status: "match" }],
};

/** Uncommitted edits to anchored files, on a model verified at its pin. */
const PROVENANCE_DIRTY: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN },
	verifiedAtCommits: { [CORE]: PIN },
	purlFreshness: [{ purl: CORE, pinned: PIN, live: PIN, status: "match" }],
	anchorChanges: {
		[CORE]: { dirty: ["packages/subsystems-studio/src/bun/git-repo.ts"] },
	},
};

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
		provenance: undefined,
		provenanceOpen: false,
		onToggleProvenance: () => {},
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
				trail: "none",
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
				trail: "verified",
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
				trail: "none",
			},
			nextRoute: {
				agent: "package-module-fixer",
				layer: "static-topology",
				mode: "issues",
			},
		},
	},
};

/** A finished run available — the card expands to show it. */
export const WithRuns: Story = {
	args: { runs: RUNS, proposals: PROPOSALS },
};

/** Expanded: the most recent run and its proposal outcomes. Older finished
 *  runs are intentionally not listed. */
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
			agent: "package-module-fixer",
			last: "Module boundary audit aborted.",
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

/* ---------------------------- provenance ---------------------------- */

/**
 * The timeline framing: verified at a commit, and this is what has happened
 * since. Sits below the verdict cluster because that cluster answers "how much
 * passes" while this answers "when was it checked" — two different axes, and
 * merging them into one row blurs which is which.
 */
export const ProvenanceMoved: Story = {
	args: { provenance: PROVENANCE_MOVED, provenanceOpen: true },
};

/** Collapsed: the badge alone, strip not expanded. */
export const ProvenanceCollapsed: Story = {
	args: { provenance: PROVENANCE_MOVED, provenanceOpen: false },
};

/** Verified and unmoved — the strip is empty, so only the badge shows. */
export const ProvenanceCurrent: Story = {
	args: { provenance: PROVENANCE_CURRENT, provenanceOpen: true },
};

/** Uncommitted edits to anchored files, alongside the verification timeline. */
export const ProvenanceDirty: Story = {
	args: { provenance: PROVENANCE_DIRTY, provenanceOpen: true },
};

/**
 * Drift with hard failures and pending proposals — the two axes together, to
 * check the provenance strip stays subordinate to the verdict it sits under.
 */
export const ProvenanceWithIssues: Story = {
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
				trail: "none",
			},
			nextRoute: {
				agent: "construct-fixer",
				layer: "construct",
				mode: "issues",
			},
		},
		proposalCounts: { construct: 1, "static-topology": 1 },
		provenance: PROVENANCE_MOVED,
		provenanceOpen: true,
	},
};

/**
 * No provenance prop at all — the pre-wiring default. The card must render
 * exactly as it did before, with no empty strip or placeholder row.
 */
export const WithoutProvenance: Story = {
	args: { provenance: undefined, provenanceOpen: false },
};

/**
 * The cheap snapshot as the host actually sends it: no `commits`, no remote
 * position. The strip should still open and still say what it knows, rather
 * than rendering an empty timeline while the detail fetch is in flight.
 */
export const ProvenanceSnapshotOnly: Story = {
	args: {
		provenance: {
			createdAtCommits: { [CORE]: PIN },
			verifiedAtCommits: { [CORE]: PIN },
			purlFreshness: [
				{ purl: CORE, pinned: PIN, live: LIVE, status: "moved" },
			],
			anchorChanges: {
				[CORE]: {
					committed: ["packages/subsystems-studio/src/bun/purl-commits.ts"],
					commitsSincePin: 22,
					pinOnlyCommits: 0,
				},
			},
		},
		provenanceOpen: true,
	},
};

/**
 * After the detail tier lands: same snapshot with the per-commit walk and the
 * remote's position folded in. This is what a fully-loaded row looks like.
 */
export const ProvenanceWithDetail: Story = {
	args: {
		provenance: {
			createdAtCommits: { [CORE]: PIN },
			verifiedAtCommits: { [CORE]: PIN },
			purlFreshness: [
				{ purl: CORE, pinned: PIN, live: LIVE, status: "moved" },
			],
			anchorChanges: {
				[CORE]: {
					committed: ["packages/subsystems-studio/src/bun/purl-commits.ts"],
					commitsSincePin: 22,
					pinOnlyCommits: 0,
					commits: COMMITS,
					remoteIndex: 17,
					remoteAhead: 0,
				},
			},
		},
		provenanceOpen: true,
	},
};
