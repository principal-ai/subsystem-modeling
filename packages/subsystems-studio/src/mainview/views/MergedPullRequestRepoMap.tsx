import { useMemo } from "react";
import type {
	MergedPullRequest,
	MergedPullRequestRepo,
} from "../../shared/contract";
import type { ContributorsByRepo } from "../components/ContributorAvatarFan";
import type { LineStats } from "../components/LineChangeBar";
import { RepoActivityMap, type RepoActivityLayer } from "./RepoActivityMap";

function pullRequestLayerId(pr: MergedPullRequest): string {
	return `${pr.owner}/${pr.repo}#${pr.number}`;
}

export function MergedPullRequestRepoMap({
	repos,
	pullRequests,
	contributorsByRepo,
	lineStatsByRepo,
	authorColors,
	showFailedRepos = false,
	selectedRepoKeys,
	onToggleRepo,
	onHoverRepo,
	hoveredPullRequestId,
	onRepoFastForwarded,
	onOpenRepoDetails,
}: {
	repos: MergedPullRequestRepo[];
	pullRequests: MergedPullRequest[];
	/** Contributors per repo key, fanned over each card's bottom-left corner. */
	contributorsByRepo?: ContributorsByRepo;
	/** Line totals per repo key, shown in the card footer. */
	lineStatsByRepo?: ReadonlyMap<string, LineStats>;
	/** Author login → highlight layer color, so map and chips agree. */
	authorColors?: ReadonlyMap<string, string>;
	/** Include failed repo cards with their load errors instead of hiding them. */
	showFailedRepos?: boolean;
	selectedRepoKeys: ReadonlySet<string>;
	onToggleRepo: (repoKey: string) => void;
	onHoverRepo: (repoKey: string | null) => void;
	hoveredPullRequestId: string | null;
	/** Fired after a repo's checkout moves, so the host view can refetch. */
	onRepoFastForwarded?: (repoKey: string) => void;
	/** Open a repository overview tab from its map card. */
	onOpenRepoDetails?: (repoKey: string) => void;
}) {
	const layersByRepo = useMemo(() => {
		const byRepo = new Map<string, RepoActivityLayer[]>();
		for (const pr of pullRequests) {
			const key = `pkg:github/${pr.owner}/${pr.repo}`;
			const list = byRepo.get(key) ?? [];
			list.push({
				id: pullRequestLayerId(pr),
				title: `#${pr.number} · ${pr.title}`,
				files: pr.files ?? [],
				colorKey: pr.author ? `author:${pr.author}` : undefined,
				color: pr.author ? authorColors?.get(pr.author) : undefined,
			});
			byRepo.set(key, list);
		}
		return byRepo;
	}, [pullRequests, authorColors]);
	return (
		<RepoActivityMap
			repos={repos}
			layersByRepo={layersByRepo}
			contributorsByRepo={contributorsByRepo}
			lineStatsByRepo={lineStatsByRepo}
			contributorNoun="merge"
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
			onOpenRepoDetails={onOpenRepoDetails}
		/>
	);
}

export { pullRequestLayerId };
