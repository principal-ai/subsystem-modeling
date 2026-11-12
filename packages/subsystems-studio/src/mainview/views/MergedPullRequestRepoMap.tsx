import { useCallback, useEffect, useMemo, useState } from "react";
import {
	MultiVersionCityBuilder,
	type CityData,
} from "@principal-ai/file-city-react";
import { GitFileTreeBuilder } from "@principal-ai/repository-abstraction";
import { repoAvatarUrl } from "@principal-ai/subsystems-react";
import type {
	MergedPullRequest,
	MergedPullRequestRepo,
} from "../../shared/contract";
import {
	SubsystemCoverageMapCards,
	type SubsystemCoverageModel,
	type SubsystemCoverageRepo,
} from "../components/SubsystemCoverageMapCards";
import { electrobun } from "../rpc";
import { CenteredMessage } from "../ui";

function buildCity(files: Array<{ path: string; size?: number }>): CityData {
	const tree = new GitFileTreeBuilder().build({
		files,
		rootPath: "/local",
		commitSha: "local",
		branch: "local",
	});
	return MultiVersionCityBuilder.build(new Map([["working", tree]])).unionCity;
}

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
}: {
	repos: MergedPullRequestRepo[];
	pullRequests: MergedPullRequest[];
	/** Include failed repo cards with their load errors instead of hiding them. */
	showFailedRepos?: boolean;
	selectedRepoKeys: ReadonlySet<string>;
	onToggleRepo: (repoKey: string) => void;
	onHoverRepo: (repoKey: string | null) => void;
	hoveredPullRequestId: string | null;
}) {
	const [cities, setCities] = useState<Map<string, CityData>>(() => new Map());
	const [failed, setFailed] = useState<ReadonlyMap<string, string>>(() => new Map());
	const [retrying, setRetrying] = useState<ReadonlySet<string>>(() => new Set());
	const retryRepo = useCallback((repoKey: string) => {
		setRetrying((prev) =>
			prev.has(repoKey) ? prev : new Set(prev).add(repoKey),
		);
	}, []);

	useEffect(() => {
		const repoKeyOf = (repo: MergedPullRequestRepo) =>
			`pkg:github/${repo.owner}/${repo.name}`;
		const retryTarget = repos.find((repo) => {
			const key = repoKeyOf(repo);
			return !cities.has(key) && retrying.has(key);
		});
		const missing = retryTarget ?? repos.find((repo) => {
			const key = repoKeyOf(repo);
			return !cities.has(key) && !failed.has(key);
		});
		if (!missing) return;
		const repoKey = repoKeyOf(missing);
		let cancelled = false;
		void (async () => {
			try {
				const result = await electrobun.rpc!.request.getRepoFileTree({ purl: repoKey });
				if (cancelled) return;
				if (!result.files?.length) {
					setFailed((previous) =>
						new Map(previous).set(
							repoKey,
							result.error || "No files were returned for this checkout.",
						),
					);
					setRetrying((previous) => {
						if (!previous.has(repoKey)) return previous;
						const next = new Set(previous);
						next.delete(repoKey);
						return next;
					});
					return;
				}
				setFailed((previous) => {
					if (!previous.has(repoKey)) return previous;
					const next = new Map(previous);
					next.delete(repoKey);
					return next;
				});
				setRetrying((previous) => {
					if (!previous.has(repoKey)) return previous;
					const next = new Set(previous);
					next.delete(repoKey);
					return next;
				});
				const city = buildCity(result.files);
				setCities((previous) => new Map(previous).set(repoKey, city));
			} catch (error) {
				if (cancelled) return;
				console.error(
					"[MergedPullRequestRepoMap] getRepoFileTree failed:",
					repoKey,
					error,
				);
				setFailed((previous) =>
					new Map(previous).set(
						repoKey,
						error instanceof Error ? error.message : String(error),
					),
				);
				setRetrying((previous) => {
					if (!previous.has(repoKey)) return previous;
					const next = new Set(previous);
					next.delete(repoKey);
					return next;
				});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [repos, cities, failed, retrying]);

	const cards = useMemo<SubsystemCoverageRepo[]>(() => {
		const byRepo = new Map<string, MergedPullRequest[]>();
		for (const pr of pullRequests) {
			const key = `pkg:github/${pr.owner}/${pr.repo}`;
			const list = byRepo.get(key) ?? [];
			list.push(pr);
			byRepo.set(key, list);
		}
		return repos
			.filter(
				(repo) =>
					cities.has(`pkg:github/${repo.owner}/${repo.name}`) ||
					(showFailedRepos && failed.has(`pkg:github/${repo.owner}/${repo.name}`)),
			)
			.map((repo) => {
				const repoKey = `pkg:github/${repo.owner}/${repo.name}`;
				const layers: SubsystemCoverageModel[] = (byRepo.get(repoKey) ?? []).map((pr) => ({
					id: pullRequestLayerId(pr),
					title: `#${pr.number} · ${pr.title}`,
					files: pr.files ?? [],
				}));
				return {
					repoKey,
					label: `${repo.owner}/${repo.name}`,
					name: repo.name,
					avatarUrl: repoAvatarUrl(repoKey),
					cityData: cities.get(repoKey) ?? null,
					error: cities.has(repoKey) ? undefined : failed.get(repoKey),
					retrying: retrying.has(repoKey),
					models: layers,
					layerSingular: "merged PR",
					layerPlural: "merged PRs",
					coverageVerb: "changed",
					coverageTitle: `${layers.reduce((count, layer) => count + layer.files.length, 0)} changed-file references across merged PRs`,
				};
			});
	}, [repos, pullRequests, cities, failed, retrying, showFailedRepos]);

	const pending = repos.filter((repo) => {
		const key = `pkg:github/${repo.owner}/${repo.name}`;
		return !cities.has(key) && !failed.has(key);
	}).length;
	if (cards.length === 0 && pending > 0) {
		return <CenteredMessage title="Loading repo cities…" detail={`${pending} local checkouts remaining.`} />;
	}
	return (
		<SubsystemCoverageMapCards
			repos={cards}
			selectedRepoKeys={selectedRepoKeys}
			onSelectRepo={onToggleRepo}
			onRetryRepo={retryRepo}
			onHoverRepo={onHoverRepo}
			hoveredModelId={hoveredPullRequestId}
			minColumnWidth={300}
			listLabel="Merged pull request maps"
			emptyTitle="No repo maps available"
			emptyDetail="The locally cloned repositories could not be turned into File Cities."
		/>
	);
}

export { pullRequestLayerId };
