import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ArchitectureMapHighlightLayers,
	MultiVersionCityBuilder,
	type CityData,
} from "@principal-ai/file-city-react";
import { GitFileTreeBuilder } from "@principal-ai/repository-abstraction";
import { repoAvatarUrl } from "@principal-ai/subsystems-react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	MergedPullRequestRepo,
} from "../../shared/contract";
import {
	SubsystemCoverageMapCards,
	type SubsystemCoverageModel,
	type SubsystemCoverageRepo,
} from "../components/SubsystemCoverageMapCards";
import { RepoCitySkeleton } from "../components/RepoCitySkeleton";
import type { ContributorsByRepo } from "../components/ContributorAvatarFan";
import type { LineStats } from "../components/LineChangeBar";
import { electrobun } from "../rpc";

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
	/** Stable color identity — activity tabs use the author's login. */
	colorKey?: string;
	/** Explicit highlight color, so the map matches the author chip. */
	color?: string;
}

const CITY_LOAD_CONCURRENCY = 4;

export function RepoActivityMap({
	repos,
	layersByRepo,
	contributorsByRepo,
	lineStatsByRepo,
	contributorNoun = "commit",
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
	onOpenRepoDetails,
	display = "cards",
	highlightedFiles = [],
}: {
	repos: MergedPullRequestRepo[];
	layersByRepo: ReadonlyMap<string, RepoActivityLayer[]>;
	/** Contributors per repo key, fanned over each card's bottom-left corner. */
	contributorsByRepo?: ContributorsByRepo;
	/** Line totals per repo key, shown in the card footer. */
	lineStatsByRepo?: ReadonlyMap<string, LineStats>;
	/** Noun used in contributor tooltips ("commit", "merge"). */
	contributorNoun?: string;
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
	/** Open a dedicated repo overview tab from a map card. */
	onOpenRepoDetails?: (repoKey: string) => void;
	/** Render a lone File City edge-to-edge instead of inside a repo card. */
	display?: "cards" | "city";
	/** Files to illuminate when a contributor row is selected in the repo view. */
	highlightedFiles?: string[];
}) {
	const { theme } = useTheme();
	const [cities, setCities] = useState<Map<string, CityData>>(() => new Map());
	const [failed, setFailed] = useState<ReadonlyMap<string, string>>(() => new Map());
	const [retrying, setRetrying] = useState<ReadonlySet<string>>(() => new Set());
	const [fastForward, setFastForward] = useState<
		Map<string, { running: boolean; message?: string; error?: string }>
	>(() => new Map());
	const cityLoadsInFlight = useRef(new Set<string>());
	const mounted = useRef(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
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
		const candidates = [
			...repos.filter((repo) => retrying.has(repoKeyOf(repo))),
			...repos.filter((repo) => !retrying.has(repoKeyOf(repo))),
		].filter((repo) => {
			const key = repoKeyOf(repo);
			return (
				!cities.has(key) &&
				(retrying.has(key) || !failed.has(key)) &&
				!cityLoadsInFlight.current.has(key)
			);
		});
		const availableSlots = Math.max(
			0,
			CITY_LOAD_CONCURRENCY - cityLoadsInFlight.current.size,
		);
		for (const repo of candidates.slice(0, availableSlots)) {
			const repoKey = repoKeyOf(repo);
			cityLoadsInFlight.current.add(repoKey);
			void (async () => {
				try {
					const result = await electrobun.rpc!.request.getRepoFileTree({ purl: repoKey });
					if (!mounted.current) return;
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
					if (!mounted.current) return;
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
				} finally {
					cityLoadsInFlight.current.delete(repoKey);
				}
			})();
		}
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
					colorKey: layer.colorKey,
					color: layer.color,
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
					contributors: contributorsByRepo?.get(repoKey),
					lineStats: lineStatsByRepo?.get(repoKey),
					contributorNoun,
					layerSingular,
					layerPlural,
					coverageVerb: "changed",
					coverageTitle: `${layers.reduce((count, layer) => count + layer.files.length, 0)} ${coverageNoun} across ${layerPlural}`,
				};
			});
	}, [repos, layersByRepo, contributorsByRepo, lineStatsByRepo, contributorNoun, cities, failed, retrying, fastForward, showFailedRepos, layerSingular, layerPlural, coverageNoun]);

	const pending = repos.filter((repo) => {
		const key = `pkg:github/${repo.owner}/${repo.name}`;
		return !cities.has(key) && (!failed.has(key) || retrying.has(key));
	}).length;
	if (display === "city" && repos.length === 1) {
		const repo = repos[0]!;
		const repoKey = `pkg:github/${repo.owner}/${repo.name}`;
		const city = cities.get(repoKey);
		const error = failed.get(repoKey);
		return (
			<div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative", overflow: "hidden", background: theme.colors.background }}>
				{city ? (
					<ArchitectureMapHighlightLayers
						cityData={city}
						highlightLayers={highlightedFiles.length ? [{
							id: "selected-contributor",
							name: "Contributor files",
							enabled: true,
							color: theme.colors.primary,
							opacity: 0.85,
							priority: -1,
							items: highlightedFiles.map((path) => ({
								path,
								type: "file" as const,
								renderStrategy: "fill" as const,
							})),
						}] : []}
						fullSize
						showFileNames={false}
						showFileTypeIcons={false}
						enableHover={false}
						isolationMode="collapse"
						dimOpacity={0.25}
						canvasBackgroundColor={theme.colors.background}
						maxCanvasSize={2048}
					/>
				) : (
					<div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center", color: theme.colors.textMuted ?? theme.colors.textSecondary }}>
						{error ? (
							<>
								<div>{error}</div>
								<button type="button" onClick={() => retryRepo(repoKey)} style={{ padding: "6px 12px", border: `1px solid ${theme.colors.border ?? "#333"}`, borderRadius: 6, background: "transparent", color: theme.colors.text, cursor: "pointer", font: "inherit" }}>
									Retry
								</button>
							</>
						) : (
							<RepoCitySkeleton />
						)}
					</div>
				)}
			</div>
		);
	}
	return (
		<SubsystemCoverageMapCards
			repos={cards}
			skeletonCount={Math.min(pending, 6)}
			pendingCount={pending}
			selectedRepoKeys={selectedRepoKeys}
			onSelectRepo={onToggleRepo}
			onRetryRepo={retryRepo}
			onFastForwardRepo={fastForwardRepo}
			onOpenDetails={onOpenRepoDetails}
			onHoverRepo={onHoverRepo}
			hoveredModelId={hoveredLayerId}
			minColumnWidth={300}
			listLabel={listLabel}
			emptyTitle={emptyTitle}
			emptyDetail={emptyDetail}
		/>
	);
}
