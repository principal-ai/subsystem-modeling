import type { Meta, StoryObj } from "@storybook/react";
import type { MergedPullRequest, MergedPullRequestRepo } from "../../shared/contract";
import { mockMergedPullRequestData } from "../../../.storybook/mocks/rpc";
import { MergedPullRequestsView } from "./MergedPullRequestsView";

const repos: MergedPullRequestRepo[] = [
	{ owner: "principal-ai", name: "subsystem-modeling", path: "/work/subsystem-modeling", url: "https://github.com/principal-ai/subsystem-modeling" },
	{ owner: "principal-ai", name: "file-city", path: "/work/file-city", url: "https://github.com/principal-ai/file-city" },
	{ owner: "example-org", name: "docs", path: "/work/docs", url: "https://github.com/example-org/docs" },
];

function recentPullRequests(): MergedPullRequest[] {
	const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
	return [
		{ owner: "principal-ai", repo: "subsystem-modeling", number: 1842, title: "Add merged pull request activity tab", url: "https://github.com/principal-ai/subsystem-modeling/pull/1842", author: "octocat", authorAvatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", mergedAt: hoursAgo(2), files: ["packages/subsystems-studio/src/bun/merged-pull-requests.ts", "packages/subsystems-studio/src/mainview/views/MergedPullRequestsView.tsx"] },
		{ owner: "principal-ai", repo: "file-city", number: 602, title: "Preserve camera state when switching layers", url: "https://github.com/principal-ai/file-city/pull/602", author: "ada", authorAvatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", mergedAt: hoursAgo(8), files: ["packages/file-city-react/src/camera.ts", "packages/file-city-react/src/city.tsx"] },
		{ owner: "principal-ai", repo: "subsystem-modeling", number: 1839, title: "Improve repository summary loading", url: "https://github.com/principal-ai/subsystem-modeling/pull/1839", author: "linus", authorAvatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", mergedAt: hoursAgo(31), files: ["packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx"] },
		{ owner: "example-org", repo: "docs", number: 94, title: "Document local setup", url: "https://github.com/example-org/docs/pull/94", author: "grace", authorAvatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", mergedAt: hoursAgo(6), files: ["README.md", "docs/setup.md"] },
	];
}

const meta = {
	title: "Studio/Merged PRs",
	component: MergedPullRequestsView,
	decorators: [(Story) => <div style={{ height: "100vh", display: "flex" }}><Story /></div>],
	beforeEach: () => mockMergedPullRequestData(repos, recentPullRequests()),
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
