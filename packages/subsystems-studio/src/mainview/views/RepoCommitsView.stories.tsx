import type { Meta, StoryObj } from "@storybook/react";
import type { MergedPullRequestRepo, RepoCommit } from "../../shared/contract";
import {
  mockRecentCommitData,
  mockRepoFileTreeFailures,
  mockShowFailedRepoCityCards,
} from "../../../.storybook/mocks/rpc";
import { RepoCommitsView } from "./RepoCommitsView";

const repos: MergedPullRequestRepo[] = [
	{ owner: "principal-ai", name: "subsystem-modeling", path: "/work/subsystem-modeling", url: "https://github.com/principal-ai/subsystem-modeling" },
	{ owner: "principal-ai", name: "file-city", path: "/work/file-city", url: "https://github.com/principal-ai/file-city" },
	{ owner: "example-org", name: "docs", path: "/work/docs", url: "https://github.com/example-org/docs" },
];

function recentCommits(): RepoCommit[] {
	const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
	return [
		{ owner: "principal-ai", repo: "subsystem-modeling", sha: "6c8002eca4acad58db6160eabcb466e61fc35afb", message: "docs(changelog): cite the correct per-PR issues for the 0.9.104 robustness batch", branch: "main", author: "octocat", authorAvatarUrl: "https://github.com/octocat.png?size=64", committedAt: hoursAgo(2), files: ["packages/subsystems-studio/src/bun/recent-commits.ts", "packages/subsystems-studio/src/mainview/views/RepoCommitsView.tsx"] },
		{ owner: "principal-ai", repo: "file-city", sha: "433a57a002908f74c0f1abd2ad93af8b302b71c4", message: "test(install): allow the lean-core line budget for the #4762 per-block reads", branch: "main", author: "ada", authorAvatarUrl: "https://github.com/ada.png?size=64", committedAt: hoursAgo(8), files: ["packages/file-city-react/src/camera.ts", "packages/file-city-react/src/city.tsx"] },
		{ owner: "principal-ai", repo: "subsystem-modeling", sha: "cb5106aa861c4a10b689d3afc5b2b851b1c6410c", message: "Merge branch 'feature' into main", branch: "main", author: "linus", committedAt: hoursAgo(31), files: ["packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx"], merge: true },
		{ owner: "example-org", repo: "docs", sha: "c3d5305eb2826c163cd2adce9a2a2cd788ce9a2a", message: "Document local setup", branch: "main", author: "grace", committedAt: hoursAgo(6), files: ["README.md", "docs/setup.md"] },
	] as RepoCommit[];
}

const meta = {
	title: "Studio/Commits",
	component: RepoCommitsView,
	decorators: [(Story) => <div style={{ height: "100vh", display: "flex" }}><Story /></div>],
	beforeEach: () => {
		mockRecentCommitData(repos, recentCommits());
		mockRepoFileTreeFailures(new Map());
		mockShowFailedRepoCityCards(false);
	},
} satisfies Meta<typeof RepoCommitsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecentActivity: Story = {};

export const NoCommits: Story = {
	beforeEach: () => mockRecentCommitData(repos, []),
};

export const NoLocalRepos: Story = {
	beforeEach: () => mockRecentCommitData([], []),
};

/** A checkout the daemon cannot read stays visible with its error and a retry. */
export const FailedRepoCity: Story = {
	beforeEach: () => {
		mockRecentCommitData(repos, recentCommits());
		mockRepoFileTreeFailures(
			new Map([["example-org/docs", "Request timeout: getFileTree"]]),
		);
		mockShowFailedRepoCityCards(true);
	},
};
