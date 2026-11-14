import type { Meta, StoryObj } from "@storybook/react";
import type { MergedPullRequest, MergedPullRequestRepo } from "../../shared/contract";
import {
  mockMergedPullRequestData,
  mockRepoFileTreeFailures,
  mockShowFailedRepoCityCards,
} from "../../../.storybook/mocks/rpc";
import { MergedPullRequestsView } from "./MergedPullRequestsView";

const repos: MergedPullRequestRepo[] = [
	{ owner: "principal-ai", name: "subsystem-modeling", path: "/work/subsystem-modeling", url: "https://github.com/principal-ai/subsystem-modeling" },
	{ owner: "principal-ai", name: "file-city", path: "/work/file-city", url: "https://github.com/principal-ai/file-city" },
	{ owner: "example-org", name: "docs", path: "/work/docs", url: "https://github.com/example-org/docs" },
];

function recentPullRequests(): MergedPullRequest[] {
	const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
	return [
		{ owner: "principal-ai", repo: "subsystem-modeling", number: 1842, title: "Add merged pull request activity tab", url: "https://github.com/principal-ai/subsystem-modeling/pull/1842", author: "octocat", authorAvatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", mergedAt: hoursAgo(2), files: ["packages/subsystems-studio/src/bun/merged-pull-requests.ts", "packages/subsystems-studio/src/mainview/views/MergedPullRequestsView.tsx"], changes: [{ path: "packages/subsystems-studio/src/bun/merged-pull-requests.ts", status: "modified", additions: 12, deletions: 3 }, { path: "packages/subsystems-studio/src/mainview/views/MergedPullRequestsView.tsx", status: "added", additions: 40, deletions: 0 }] },
		{ owner: "principal-ai", repo: "file-city", number: 602, title: "Preserve camera state when switching layers", url: "https://github.com/principal-ai/file-city/pull/602", author: "ada", authorAvatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", mergedAt: hoursAgo(8), files: ["packages/file-city-react/src/camera.ts", "packages/file-city-react/src/city.tsx"], changes: [{ path: "packages/file-city-react/src/camera.ts", status: "modified", additions: 12, deletions: 3 }, { path: "packages/file-city-react/src/city.tsx", status: "modified", additions: 12, deletions: 3 }] },
		{ owner: "principal-ai", repo: "subsystem-modeling", number: 1839, title: "Improve repository summary loading", url: "https://github.com/principal-ai/subsystem-modeling/pull/1839", author: "linus", authorAvatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", mergedAt: hoursAgo(31), files: ["packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx", "packages/subsystems-studio/src/mainview/views/OldSummaryView.tsx"], changes: [{ path: "packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx", status: "modified", additions: 12, deletions: 3 }, { path: "packages/subsystems-studio/src/mainview/views/OldSummaryView.tsx", status: "deleted", additions: 0, deletions: 30 }] },
		{ owner: "example-org", repo: "docs", number: 94, title: "Document local setup", url: "https://github.com/example-org/docs/pull/94", author: "grace", authorAvatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", mergedAt: hoursAgo(6), files: ["README.md", "docs/setup.md"], changes: [{ path: "README.md", status: "added", additions: 40, deletions: 0 }, { path: "docs/setup.md", status: "added", additions: 40, deletions: 0 }] },
	];
}

const meta = {
	title: "Studio/Merged PRs",
	component: MergedPullRequestsView,
	decorators: [(Story) => <div style={{ height: "100vh", display: "flex" }}><Story /></div>],
	beforeEach: () => {
		mockMergedPullRequestData(repos, recentPullRequests());
		mockRepoFileTreeFailures(new Map());
		mockShowFailedRepoCityCards(false);
	},
} satisfies Meta<typeof MergedPullRequestsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecentActivity: Story = {};

export const NoMergedPullRequests: Story = {
	beforeEach: () => mockMergedPullRequestData(repos, []),
};

export const NoLocalRepos: Story = {
	beforeEach: () => mockMergedPullRequestData([], []),
};

/** A checkout the daemon cannot read stays visible with its error and a retry. */
export const FailedRepoCity: Story = {
	beforeEach: () => {
		mockMergedPullRequestData(repos, recentPullRequests());
		mockRepoFileTreeFailures(
			new Map([["example-org/docs", "Request timeout: getFileTree"]]),
		);
		mockShowFailedRepoCityCards(true);
	},
};
