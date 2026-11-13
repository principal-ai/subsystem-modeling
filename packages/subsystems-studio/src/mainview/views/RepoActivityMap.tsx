import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	MultiVersionCityBuilder,
	type CityData,
} from "@principal-ai/file-city-react";
import { GitFileTreeBuilder } from "@principal-ai/repository-abstraction";
import { repoAvatarUrl } from "@principal-ai/subsystems-react";
import type {
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

export interface RepoActivityLayer {
	id: string;
	title: string;
	files: string[];
}

export function RepoActivityMap({
	repos,
	layersByRepo,
	showFailedRepos = false,
	selectedRepoKeys,
	onToggleRepo,
	onHoverRepo,
	hoveredLayerId,
	layerSingular,
	layerPlural,
	coverageNoun,
	listLabel,
	emptyTitle,
	emptyDetail,
	onRepoFastForwarded,
}: {
	repos: MergedPullRequestRepo[];
	layersByRepo: ReadonlyMap<string, RepoActivityLayer[]>;
	/** Include failed repo cards with their load errors instead of hiding them. */
	showFailedRepos?: boolean;
	selectedRepoKeys: ReadonlySet<string>;
	onToggleRepo: (repoKey: string) => void;
	onHoverRepo: (repoKey: string | null) => void;
	hoveredLayerId: string | null;
	layerSingular: string;
	layerPlural: string;
	/** e.g. "changed-file references" — rendered as "<n> <noun> across <plural>". */
	coverageNoun: string;
	listLabel: string;
	emptyTitle: string;
	emptyDetail: string;
	/** Fired after a repo's checkout moves, so the host view can refetch its activity. */
	onRepoFastForwarded?: (repoKey: string) => void;
}) {
	const [cities, setCities] = useState<Map<string, CityData>>(() => new Map());
	const [failed, setFailed] = useState<ReadonlyMap<string, string>>(() => new Map());
	const [retrying, setRetrying] = useState<ReadonlySet<string>>(() => new Set());
	const [fastForward, setFastForward] = useState<
		Map<string, { running: boolean; message?: string; error?: string }>
	>(() => new Map());
	const retryRepo = useCallback((repoKey: string) => {
		setRetrying((prev) =>
			prev.has(repoKey) ? prev : new Set(prev).add(repoKey),
		);
	}, []);
	// Held outside state so the double-click guard below reads the current set.
	const ffInFlight = useRef<Set<string>>(new Set());
	const fastForwardRepo = useCallback(
		async (repoKey: string) => {
			// Synchronous guard against double-clicks while the running flag
			// is still propagating through state.
			if (ffInFlight.current.has(repoKey)) return;
			ffInFlight.current.add(repoKey);
			setFastForward((previous) => new Map(previous).set(repoKey, { running: true }));
			try {
				const result = await electrobun.rpc!.request.fastForwardRepo({ purl: repoKey });
				if (!result.ok) {
					setFastForward((previous) =>
						new Map(previous).set(repoKey, {
							running: false,
							error: result.error ?? "Fast-forward failed.",
						}),
					);
					return;
				}
				const short = (sha: string | null | undefined) => sha?.slice(0, 7) ?? "?";
				setFastForward((previous) =>
					new Map(previous).set(repoKey, {
						running: false,
						message: result.moved
							? `Advanced ${result.branch ?? ""} ${short(result.before)} → ${short(result.after)}`
							: "Already up to date",
					}),
				);
				if (result.moved) {
					// The checkout changed under the city — drop it so the
					// loader effect below rebuilds it from the new tree.
					setCities((previous) => {
						if (!previous.has(repoKey)) return previous;
						const next = new Map(previous);
						next.delete(repoKey);
						return next;
					});
					onRepoFastForwarded?.(repoKey);
				}
			} catch (error) {
				setFastForward((previous) =>
					new Map(previous).set(repoKey, {
						running: false,
						error: error instanceof Error ? error.message : String(error),
					}),
				);
			} finally {
				ffInFlight.current.delete(repoKey);
			}
		},
		[onRepoFastForwarded],
	);

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
					"[RepoActivityMap] getRepoFileTree failed:",
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
		return repos
			.filter(
				(repo) =>
					cities.has(`pkg:github/${repo.owner}/${repo.name}`) ||
					(showFailedRepos && failed.has(`pkg:github/${repo.owner}/${repo.name}`)),
			)
			.map((repo) => {
				const repoKey = `pkg:github/${repo.owner}/${repo.name}`;
				const layers: SubsystemCoverageModel[] = (layersByRepo.get(repoKey) ?? []).map((layer) => ({
					id: layer.id,
					title: layer.title,
					files: layer.files ?? [],
				}));
				return {
					repoKey,
					label: `${repo.owner}/${repo.name}`,
					name: repo.name,
					avatarUrl: repoAvatarUrl(repoKey),
					cityData: cities.get(repoKey) ?? null,
					error: cities.has(repoKey) ? undefined : failed.get(repoKey),
					retrying: retrying.has(repoKey),
					fastForward: fastForward.get(repoKey),
					models: layers,
					layerSingular,
					layerPlural,
					coverageVerb: "changed",
					coverageTitle: `${layers.reduce((count, layer) => count + layer.files.length, 0)} ${coverageNoun} across ${layerPlural}`,
				};
			});
	}, [repos, layersByRepo, cities, failed, retrying, fastForward, showFailedRepos, layerSingular, layerPlural, coverageNoun]);

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
			onFastForwardRepo={fastForwardRepo}
			onHoverRepo={onHoverRepo}
			hoveredModelId={hoveredLayerId}
			minColumnWidth={300}
			listLabel={listLabel}
			emptyTitle={emptyTitle}
			emptyDetail={emptyDetail}
		/>
	);
}
