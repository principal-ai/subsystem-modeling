import type { Meta, StoryObj } from "@storybook/react";
import { MaintenanceRepoList, repoBreakdown } from "./MaintenanceRepoList";

const meta = {
	title: "Maintenance/MaintenanceRepoList",
	component: MaintenanceRepoList,
	parameters: { layout: "fullscreen" },
	args: {
		repoBreaks: [
			{ owner: "principal-ai", name: "subsystem-modeling", count: 4 },
			{ owner: "principal-ai", name: "alexandria", count: 2 },
			{ owner: "principal-ade", name: "industry-theme", count: 1 },
			{ owner: "vercel", name: "next.js", count: 7 },
		],
		selectedKey: "principal-ai/subsystem-modeling",
		onSelect: () => {},
	},
} satisfies Meta<typeof MaintenanceRepoList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default selection — the first repo is highlighted. */
export const Default: Story = {};

/** A different repo selected. */
export const SecondSelected: Story = {
	args: { selectedKey: "vercel/next.js" },
};

/** Only one repo references any model. */
export const SingleRepo: Story = {
	args: {
		repoBreaks: [{ owner: "principal-ai", name: "subsystem-modeling", count: 1 }],
		selectedKey: "principal-ai/subsystem-modeling",
	},
};

/** No models reference any repo — the header with no rows. */
export const Empty: Story = {
	args: { repoBreaks: [], selectedKey: null },
};

/**
 * `repoBreakdown` derives the rows from an overview's models — this story
 * exercises that derivation instead of hand-writing the breaks.
 */
export const DerivedFromOverview: Story = {
	args: {
		repoBreaks: repoBreakdown({
			running: [],
			auditing: [],
			needsWork: 2,
			verified: 0,
			totals: { verified: 0, open: 0, blocking: 0, blocked: 0, na: 0, coverage: 0 },
			pendingProposals: [],
			models: [
				{
					graphId: "g1",
					title: "Payments",
					verdict: "issues",
					verified: 1,
					open: 1,
					blocking: 1,
					blocked: 0,
					na: 0,
					coverage: 0.5,
					pendingProposalCount: 0,
					stale: false,
					lanes: {
						construct: "issues",
						"static-topology": "none",
						"dynamic-topology": "none",
						trail: "none",
					},
					repos: [{ owner: "principal-ai", name: "subsystem-modeling" }],
				},
				{
					graphId: "g2",
					title: "Auth",
					verdict: "partially_verified",
					verified: 2,
					open: 1,
					blocking: 0,
					blocked: 0,
					na: 0,
					coverage: 0.66,
					pendingProposalCount: 0,
					stale: false,
					lanes: {
						construct: "partial",
						"static-topology": "none",
						"dynamic-topology": "none",
						trail: "none",
					},
					repos: [
						{ owner: "principal-ai", name: "subsystem-modeling" },
						{ owner: "principal-ai", name: "alexandria" },
					],
				},
			],
		}),
		selectedKey: "principal-ai/alexandria",
	},
};
