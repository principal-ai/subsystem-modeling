import { useMemo } from "react";
import type {
	MergedPullRequest,
	MergedPullRequestRepo,
} from "../../shared/contract";
import { RepoActivityMap } from "./RepoActivityMap";

function pullRequestLayerId(pr: MergedPullRequest): string {
	return `${pr.owner}/${pr.repo}#${pr.number}`;
}

export function MergedPullRequestRepoMap({
	repos,
	pullRequests,
	showFailedRepos = false,
	selectedRepoKeys,
	onToggleRepo,
	onHoverRepo,
	hoveredPullRequestId,
	onRepoFastForwarded,
}: {
	repos: MergedPullRequestRepo[];
	pullRequests: MergedPullRequest[];
	/** Include failed repo cards with their load errors instead of hiding them. */
	showFailedRepos?: boolean;
	selectedRepoKeys: ReadonlySet<string>;
	onToggleRepo: (repoKey: string) => void;
	onHoverRepo: (repoKey: string | null) => void;
	hoveredPullRequestId: string | null;
	/** Fired after a repo's checkout moves, so the host view can refetch. */
	onRepoFastForwarded?: (repoKey: string) => void;
}) {
	const layersByRepo = useMemo(() => {
		const byRepo = new Map<string, Array<{ id: string; title: string; files: string[] }>>();
		for (const pr of pullRequests) {
			const key = `pkg:github/${pr.owner}/${pr.repo}`;
			const list = byRepo.get(key) ?? [];
			list.push({
				id: pullRequestLayerId(pr),
				title: `#${pr.number} · ${pr.title}`,
				files: pr.files ?? [],
			});
			byRepo.set(key, list);
		}
		return byRepo;
	}, [pullRequests]);
	return (
		<RepoActivityMap
			repos={repos}
			layersByRepo={layersByRepo}
			showFailedRepos={showFailedRepos}
			selectedRepoKeys={selectedRepoKeys}
			onToggleRepo={onToggleRepo}
			onHoverRepo={onHoverRepo}
			hoveredLayerId={hoveredPullRequestId}
			layerSingular="merged PR"
			layerPlural="merged PRs"
			coverageNoun="changed-file references"
			listLabel="Merged pull request maps"
			emptyTitle="No repo maps available"
			emptyDetail="The locally cloned repositories could not be turned into File Cities."
			onRepoFastForwarded={onRepoFastForwarded}
		/>
	);
}

export { pullRequestLayerId };
