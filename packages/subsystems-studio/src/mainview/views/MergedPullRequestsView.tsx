import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
	ChevronDown,
	Check,
	FileDiff,
	GitPullRequest,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	FileChange,
	MergedPullRequest,
	MergedPullRequestRepo,
} from "../../shared/contract";
import { electrobun, showFailedRepoCityCardsSubscribers } from "../rpc";
import { CenteredMessage, relativeTime } from "../ui";
import {
	ContributorAvatarFan,
	groupContributorsByRepo,
} from "../components/ContributorAvatarFan";
import { FileChangeList, summarizeFileChanges } from "../components/FileChangeList";
import { LineChangeScaleBar, type LineStats } from "../components/LineChangeBar";
import { RepoActivityDayHeatmap } from "../components/RepoActivityDayHeatmap";
import { RepoActivityMonthHeatmap } from "../components/RepoActivityMonthHeatmap";
import { RepoActivityWeekHeatmap } from "../components/RepoActivityWeekHeatmap";
import {
	isInActivityTimeRange,
	type ActivityTimeRange,
} from "../components/activityTimeRange";
import { PullRequestListSkeleton } from "../components/PullRequestListSkeleton";
import { MODEL_LAYER_COLORS } from "../components/SubsystemCoverageMapCards";
import { MergedPullRequestRepoMap, pullRequestLayerId } from "./MergedPullRequestRepoMap";
import {
	ACTIVITY_WINDOWS as WINDOWS,
	ACTIVITY_POLL_INTERVAL_MS,
	asQueryDate,
	inActivityWindow as inWindow,
	windowStart,
	type ActivityWindow as MergedWindow,
} from "./repoActivityWindows";
type PullRequestDiffState = {
	files?: string[];
	changes?: FileChange[];
	loading: boolean;
	error?: string;
	truncated?: boolean;
};

/** Max PRs the tab auto-loads diffs for. Beyond this the user expands cards
 *  manually — bounds GitHub files-API fan-out for busy org-weeks. */
const AUTO_LOAD_DIFF_LIMIT = 200;
/** Parallel files-API requests while progressively filling the repo map. */
const DIFF_LOAD_CONCURRENCY = 4;

export function MergedPullRequestsView({ active = true }: { active?: boolean } = {}) {
	const { theme } = useTheme();
	const [repos, setRepos] = useState<MergedPullRequestRepo[] | null>(null);
	const [owner, setOwner] = useState("");
	const [githubLogin, setGithubLogin] = useState<string | null>(null);
	const [identityReady, setIdentityReady] = useState(false);
	const [window, setWindow] = useState<MergedWindow>("today");
	const [selectedRepos, setSelectedRepos] = useState<ReadonlySet<string>>(() => new Set());
	const [selectedAuthors, setSelectedAuthors] = useState<ReadonlySet<string>>(() => new Set());
	const [selectedTimeRange, setSelectedTimeRange] = useState<ActivityTimeRange | null>(null);
	const [authorsOpen, setAuthorsOpen] = useState(false);
	const [pullRequests, setPullRequests] = useState<MergedPullRequest[]>([]);
	const [showFailedRepos, setShowFailedRepos] = useState(false);
	const [hoveredRepoKey, setHoveredRepoKey] = useState<string | null>(null);
	const [hoveredPullRequestId, setHoveredPullRequestId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const loadingRef = useRef(false);
	const [queryProgress, setQueryProgress] = useState({ queried: 0, total: 0 });
	const [queryStage, setQueryStage] = useState<"priority" | "repos" | "done">("repos");
	const [searchedRepoKeys, setSearchedRepoKeys] = useState<ReadonlySet<string>>(() => new Set());
	const [error, setError] = useState<string | null>(null);
	const [repoErrors, setRepoErrors] = useState<string[]>([]);
	const [truncatedRepos, setTruncatedRepos] = useState<string[]>([]);
	const [fileDiffs, setFileDiffs] = useState<Map<string, PullRequestDiffState>>(() => new Map());
	const fileDiffsRef = useRef(fileDiffs);
	const requestId = useRef(0);
	// Stale-while-revalidate: keep the previous search's PRs on screen while
	// the next pass runs. loadPullRequests seeds from this ref instead of
	// blanking the list, so a refresh/poll never flashes an empty merge tab.
	const pullRequestsRef = useRef(pullRequests);
	useEffect(() => {
		pullRequestsRef.current = pullRequests;
	}, [pullRequests]);

	const updateFileDiff = useCallback((id: string, state: PullRequestDiffState) => {
		const next = new Map(fileDiffsRef.current);
		next.set(id, state);
		fileDiffsRef.current = next;
		setFileDiffs(next);
	}, []);
	const loadPullRequestFiles = useCallback(async (pr: MergedPullRequest) => {
		const id = pullRequestLayerId(pr);
		const current = fileDiffsRef.current.get(id);
		if (current?.loading || (current?.files && !current.error)) return;
		updateFileDiff(id, { loading: true });
		try {
			const result = await electrobun.rpc!.request.getMergedPullRequestFiles({
				owner: pr.owner,
				repo: pr.repo,
				number: pr.number,
			});
			updateFileDiff(
				id,
				result.ok
					? {
							loading: false,
							files: result.files ?? [],
							changes: result.changes,
							truncated: result.truncated,
						}
					: { loading: false, error: result.error ?? "Could not load PR files." },
			);
		} catch (error) {
			updateFileDiff(id, {
				loading: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}, [updateFileDiff]);

	const refreshRepos = useCallback(async () => {
		try {
			const result = await electrobun.rpc!.request.listMergedPullRequestRepos({});
			setRepos(result.repos);
			setOwner((current) =>
				current && result.repos.some((repo) => repo.owner === current)
					? current
					: (result.repos[0]?.owner ?? ""),
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setRepos([]);
		}
	}, []);

	useEffect(() => {
		let settingsChanged = false;
		const onShowFailedRepoCityCards = (enabled: boolean) => {
			settingsChanged = true;
			setShowFailedRepos(enabled);
		};
		showFailedRepoCityCardsSubscribers.add(onShowFailedRepoCityCards);
		void electrobun.rpc!.request
			.getSettings({})
			.then((settings) => {
				if (!settingsChanged) {
					setShowFailedRepos(settings.showFailedRepoCityCards);
				}
			})
			.catch(() => {});
		return () => {
			showFailedRepoCityCardsSubscribers.delete(onShowFailedRepoCityCards);
		};
	}, []);

	useEffect(() => {
		void refreshRepos();
	}, [refreshRepos]);
	useEffect(() => {
		let cancelled = false;
		void electrobun.rpc!.request
			.getUserIdentity({})
			.then((identity) => {
				if (!cancelled && identity.source === "gh") {
					setGithubLogin(identity.login ?? null);
				}
			})
			.catch(() => {})
			.finally(() => {
				if (!cancelled) setIdentityReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const owners = useMemo(
		() => [...new Set((repos ?? []).map((repo) => repo.owner))].sort((a, b) => a.localeCompare(b)),
		[repos],
	);
	const repoCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const repo of repos ?? []) counts.set(repo.owner, (counts.get(repo.owner) ?? 0) + 1);
		return counts;
	}, [repos]);
	const orgRepos = useMemo(
		() => (repos ?? []).filter((repo) => repo.owner === owner),
		[repos, owner],
	);
	const orgRepoKeys = useMemo(
		() => new Set(orgRepos.map((repo) => `pkg:github/${repo.owner}/${repo.name}`)),
		[orgRepos],
	);
	useEffect(() => {
		setSelectedRepos(new Set());
	}, [owner]);
	useEffect(() => {
		setSelectedAuthors(new Set());
		setAuthorsOpen(false);
		setSelectedTimeRange(null);
	}, [owner, window]);

	const toggleRepo = useCallback((repoKey: string) => {
		setSelectedRepos((current) => {
			const next = new Set(current);
			if (next.has(repoKey)) next.delete(repoKey);
			else next.add(repoKey);
			return next;
		});
	}, []);

	const loadPullRequests = useCallback(() => {
		if (!active || !owner || repos === null || !identityReady) return undefined;
		const id = ++requestId.current;
		const sinceStart = windowStart(window);
		// Query a day wider than the local window; GitHub indexes merge dates in UTC.
		sinceStart.setDate(sinceStart.getDate() - 1);
		const since = asQueryDate(sinceStart);
		setLoading(true);
		loadingRef.current = true;
		setError(null);
		setRepoErrors([]);
		setTruncatedRepos([]);
		// Keep the previous search's results visible while the next pass runs;
		// per-repo results below replace their own slice as each search lands.
		setQueryProgress({ queried: 0, total: orgRepos.length });
		setQueryStage(githubLogin ? "priority" : "repos");
		void (async () => {
			// Seed from the previous search so the tab never blanks: keep PRs
			// for the current org that still fall inside the new query range.
			// Each repo's slice is replaced as its own search completes.
			const accumulated = new Map<string, MergedPullRequest>();
			for (const pr of pullRequestsRef.current) {
				const repoKey = `pkg:github/${pr.owner}/${pr.repo}`;
				if (!orgRepoKeys.has(repoKey)) continue;
				if (!Number.isFinite(Date.parse(pr.mergedAt))) continue;
				if (Date.parse(pr.mergedAt) < sinceStart.getTime()) continue;
				accumulated.set(`${pr.owner}/${pr.repo}#${pr.number}`, pr);
			}
			const errors: string[] = [];
			const truncated = new Set<string>();
			try {
				const priorityRepoKeys = new Set<string>();
				if (githubLogin) {
					try {
						const priority = await electrobun.rpc!.request.searchMergedPullRequestsByAuthor({
							owner,
							since,
							author: githubLogin,
						});
						if (id !== requestId.current) return;
						if (priority.ok) {
							for (const pr of priority.pullRequests) {
								const repoKey = `pkg:github/${pr.owner}/${pr.repo}`;
								if (!orgRepoKeys.has(repoKey)) continue;
								priorityRepoKeys.add(repoKey.toLowerCase());
								accumulated.set(`${pr.owner}/${pr.repo}#${pr.number}`, pr);
							}
							setPullRequests(
								[...accumulated.values()].sort(
									(a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt),
								),
							);
						} else if (priority.error) {
							errors.push(`Signed-in user PR search: ${priority.error}`);
							setRepoErrors([...errors]);
							if (/403|rate.?limit/i.test(priority.error)) {
								setError(priority.error);
								return;
							}
						}
					} catch (err) {
						if (id !== requestId.current) return;
						const message = err instanceof Error ? err.message : String(err);
						errors.push(`Signed-in user PR search: ${message}`);
						setRepoErrors([...errors]);
						if (/403|rate.?limit/i.test(message)) {
							setError(message);
							return;
						}
					}
				}
				if (id !== requestId.current) return;
				setQueryStage("repos");
				const orderedRepos = [
					...orgRepos.filter((repo) =>
						priorityRepoKeys.has(`pkg:github/${repo.owner}/${repo.name}`.toLowerCase()),
					),
					...orgRepos.filter(
						(repo) =>
							!priorityRepoKeys.has(`pkg:github/${repo.owner}/${repo.name}`.toLowerCase()),
					),
				];
				for (const [index, repo] of orderedRepos.entries()) {
					if (id !== requestId.current) return;
					try {
						const result = await electrobun.rpc!.request.listMergedPullRequests({
							owner,
							since,
							repo: repo.name,
						});
						if (id !== requestId.current) return;
						if (!result.ok && !result.errors?.length) {
							setError(result.error ?? "Could not load merged pull requests.");
							setQueryProgress({ queried: index + 1, total: orgRepos.length });
							break;
						}
						if (result.ok) {
							const repoKey = `pkg:github/${repo.owner}/${repo.name}`;
							setSearchedRepoKeys((current) => new Set(current).add(repoKey));
						}
						// Replace this repo's previous slice so removed merges
						// disappear as their own search lands (not all at once
						// when the pass starts). On failure keep the stale
						// slice instead of blanking it.
						if (result.ok) {
							for (const key of [...accumulated.keys()]) {
								if (key.startsWith(`${owner}/${repo.name}#`)) accumulated.delete(key);
							}
							for (const pr of result.pullRequests) {
								accumulated.set(`${pr.owner}/${pr.repo}#${pr.number}`, pr);
							}
						}
						errors.push(...(result.errors ?? []));
						for (const item of result.truncatedRepos ?? []) truncated.add(item);
						setPullRequests(
							[...accumulated.values()].sort(
								(a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt),
							),
						);
						setRepoErrors([...errors]);
						setTruncatedRepos([...truncated]);
					} catch (err) {
						if (id !== requestId.current) return;
						errors.push(
							`${repo.owner}/${repo.name}: ${err instanceof Error ? err.message : String(err)}`,
						);
						setRepoErrors([...errors]);
					}
					setQueryProgress({ queried: index + 1, total: orgRepos.length });
				}
			} finally {
				if (id === requestId.current) {
					loadingRef.current = false;
					setLoading(false);
					setQueryStage("done");
				}
			}
		})();
		return id;
	}, [active, githubLogin, identityReady, orgRepoKeys, owner, orgRepos, repos, window]);

	useEffect(() => {
		const id = loadPullRequests();
		return () => {
			if (id !== undefined && id === requestId.current) {
				requestId.current++;
				loadingRef.current = false;
				setLoading(false);
			}
		};
	}, [loadPullRequests]);

	// Re-check for new merges while this tab is active, but never overlap a
	// multi-repo pass or spend Search quota while the tab is in the background.
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => {
			if (document.hidden || loadingRef.current) return;
			loadPullRequests();
		}, ACTIVITY_POLL_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [active, loadPullRequests]);

	const mergedInWindow = useMemo(() => {
		const now = new Date();
		return pullRequests.filter(
			(pr) =>
				orgRepoKeys.has(`pkg:github/${pr.owner}/${pr.repo}`) &&
				inWindow(pr.mergedAt, window, now),
		);
	}, [pullRequests, window, orgRepoKeys]);
	const heatmapPullRequests = useMemo(
		() =>
			selectedAuthors.size === 0
				? mergedInWindow
				: mergedInWindow.filter(
						(pr) => pr.author != null && selectedAuthors.has(pr.author),
					),
		[mergedInWindow, selectedAuthors],
	);
	const contributorsByRepo = useMemo(
		() =>
			groupContributorsByRepo(
				mergedInWindow,
				(pr) => `pkg:github/${pr.owner}/${pr.repo}`,
				(pr) =>
					pr.author
						? { login: pr.author, avatarUrl: pr.authorAvatarUrl }
						: undefined,
			),
		[mergedInWindow],
	);
	const authors = useMemo(() => {
		const byLogin = new Map<string, { login: string; avatarUrl?: string; count: number }>();
		for (const pr of mergedInWindow) {
			if (!pr.author) continue;
			const existing = byLogin.get(pr.author);
			if (existing) existing.count++;
			else byLogin.set(pr.author, { login: pr.author, avatarUrl: pr.authorAvatarUrl, count: 1 });
		}
		return [...byLogin.values()].sort((a, b) => b.count - a.count || a.login.localeCompare(b.login));
	}, [mergedInWindow]);
	const authorColors = useMemo(
		() =>
			new Map(
				authors.map((author, index) => [
					author.login,
					MODEL_LAYER_COLORS[index % MODEL_LAYER_COLORS.length]!,
				]),
			),
		[authors],
	);
	const timeFilteredPullRequests = useMemo(
		() =>
			selectedTimeRange
				? mergedInWindow.filter((pr) =>
						isInActivityTimeRange(pr.mergedAt, selectedTimeRange),
					)
				: mergedInWindow,
		[mergedInWindow, selectedTimeRange],
	);
	const authorFilteredPullRequests = useMemo(
		() => selectedAuthors.size === 0
			? timeFilteredPullRequests
			: timeFilteredPullRequests.filter((pr) => pr.author != null && selectedAuthors.has(pr.author)),
		[timeFilteredPullRequests, selectedAuthors],
	);
	const mappedPullRequests = useMemo(
		() => authorFilteredPullRequests.map((pr) => ({
			...pr,
			files: fileDiffs.get(pullRequestLayerId(pr))?.files ?? pr.files ?? [],
		})),
		[authorFilteredPullRequests, fileDiffs],
	);
	// Progressively load changed paths so the repo map fills in without
	// waiting on every PR. Bounded concurrency + an auto-load cap keep the
	// GitHub files-API fan-out predictable; the rest load on expand.
	const diffProgress = useMemo(() => {
		let loaded = 0;
		for (const pr of authorFilteredPullRequests) {
			if (fileDiffs.get(pullRequestLayerId(pr))?.files !== undefined) loaded++;
		}
		return { loaded, total: authorFilteredPullRequests.length };
	}, [authorFilteredPullRequests, fileDiffs]);
	const diffsCapped = diffProgress.total > AUTO_LOAD_DIFF_LIMIT;
	useEffect(() => {
		const pending = authorFilteredPullRequests.filter((pr) => {
			const state = fileDiffsRef.current.get(pullRequestLayerId(pr));
			return !state || (!state.files && !state.loading && !state.error);
		});
		// Only the first slice auto-loads; the card's expand path loads the rest.
		const queue = pending.slice(0, AUTO_LOAD_DIFF_LIMIT);
		if (queue.length === 0) return;
		let cancelled = false;
		const workers = Array.from(
			{ length: Math.min(DIFF_LOAD_CONCURRENCY, queue.length) },
			async () => {
				while (!cancelled) {
					const pr = queue.shift();
					if (!pr) return;
					await loadPullRequestFiles(pr);
				}
			},
		);
		void Promise.all(workers);
		return () => {
			cancelled = true;
		};
	}, [authorFilteredPullRequests, loadPullRequestFiles]);
	const visiblePullRequests = useMemo(
		() =>
			authorFilteredPullRequests.filter((pr) => {
				const key = `pkg:github/${pr.owner}/${pr.repo}`;
				return orgRepoKeys.has(key) && (selectedRepos.size === 0 || selectedRepos.has(key));
			}),
		[authorFilteredPullRequests, orgRepoKeys, selectedRepos],
	);
	const lineSummaryByPr = useMemo(() => {
		const byPr = new Map<
			string,
			ReturnType<typeof summarizeFileChanges>
		>();
		for (const pr of visiblePullRequests) {
			const diff = fileDiffs.get(pullRequestLayerId(pr));
			const files = diff?.files ?? pr.files ?? [];
			const changes =
				diff?.changes ??
				pr.changes ??
				files.map((path) => ({ path, status: "modified" as const }));
			byPr.set(pullRequestLayerId(pr), summarizeFileChanges(changes));
		}
		return byPr;
	}, [visiblePullRequests, fileDiffs]);
	const lineStatsByRepo = useMemo(() => {
		const byRepo = new Map<string, LineStats>();
		for (const pr of visiblePullRequests) {
			const summary = lineSummaryByPr.get(pullRequestLayerId(pr));
			if (!summary?.known) continue;
			const key = `pkg:github/${pr.owner}/${pr.repo}`;
			const current = byRepo.get(key) ?? { additions: 0, deletions: 0 };
			current.additions += summary.additions;
			current.deletions += summary.deletions;
			byRepo.set(key, current);
		}
		return byRepo;
	}, [visiblePullRequests, lineSummaryByPr]);
	const maxLineChanges = useMemo(() => {
		let max = 0;
		for (const summary of lineSummaryByPr.values()) {
			if (summary.known) {
				max = Math.max(max, summary.additions + summary.deletions);
			}
		}
		return max;
	}, [lineSummaryByPr]);
	// Keep repos visible until a successful search has checked them. After
	// that, hide repos with no currently visible PRs; the layer data follows
	// the same author/time/repo filters as the list.
	const mappedVisiblePullRequests = useMemo(
		() =>
			mappedPullRequests.filter((pr) => {
				const key = `pkg:github/${pr.owner}/${pr.repo}`;
				return orgRepoKeys.has(key) && (selectedRepos.size === 0 || selectedRepos.has(key));
			}),
		[mappedPullRequests, orgRepoKeys, selectedRepos],
	);
	const visibleRepoKeys = useMemo(
		() => new Set(visiblePullRequests.map((pr) => `pkg:github/${pr.owner}/${pr.repo}`)),
		[visiblePullRequests],
	);
	const mapRepos = useMemo(() => {
		// Most recently merged first, so the city grid tracks the PR list.
		// Repos with no merged PRs in the current filter keep their
		// registration order at the end (e.g. before search completes).
		const latestByRepo = new Map<string, number>();
		for (const pr of mappedVisiblePullRequests) {
			const key = `pkg:github/${pr.owner}/${pr.repo}`;
			const t = Date.parse(pr.mergedAt);
			if (!Number.isFinite(t)) continue;
			if ((latestByRepo.get(key) ?? -Infinity) < t) latestByRepo.set(key, t);
		}
		const indexByKey = new Map<string, number>(
			orgRepos.map((repo, index) => [`pkg:github/${repo.owner}/${repo.name}`, index] as [string, number]),
		);
		return orgRepos
			.filter((repo) => {
				const key = `pkg:github/${repo.owner}/${repo.name}`;
				return !searchedRepoKeys.has(key) || visibleRepoKeys.has(key);
			})
			.sort((a, b) => {
				const keyA = `pkg:github/${a.owner}/${a.name}`;
				const keyB = `pkg:github/${b.owner}/${b.name}`;
				const tA = latestByRepo.get(keyA);
				const tB = latestByRepo.get(keyB);
				if (tA == null && tB == null)
					return (indexByKey.get(keyA) ?? 0) - (indexByKey.get(keyB) ?? 0);
				if (tA == null) return 1;
				if (tB == null) return -1;
				if (tB !== tA) return tB - tA;
				return (indexByKey.get(keyA) ?? 0) - (indexByKey.get(keyB) ?? 0);
			});
	}, [orgRepos, searchedRepoKeys, visibleRepoKeys, mappedVisiblePullRequests]);
	// With a single repo card there is nothing to disambiguate, so keep city
	// hover from tinting every PR row. PR hover still drives the map below.
	const highlightRowsFromRepoHover = mapRepos.length > 1;
	const toggleAuthor = useCallback((login: string) => {
		setSelectedAuthors((current) => {
			return current.has(login) ? new Set<string>() : new Set([login]);
		});
	}, []);
	const selectTimeRange = useCallback((range: ActivityTimeRange) => {
		setSelectedTimeRange((current) => current?.key === range.key ? null : range);
	}, []);
	// After a checkout moves, re-check for merges against the new HEAD.
	const handleRepoFastForwarded = useCallback(() => {
		loadPullRequests();
	}, [loadPullRequests]);
	const handleOpenRepoInsights = useCallback((repoKey: string) => {
		const repo = orgRepos.find((candidate) => `pkg:github/${candidate.owner}/${candidate.name}` === repoKey);
		if (!repo) return;
		void electrobun.rpc!.request
			.openRepoInsightsTab({ owner: repo.owner, repo: repo.name })
			.then((result) => {
				if (!result.ok) setError(result.error ?? "Could not open repository overview.");
			})
			.catch((err) => setError(err instanceof Error ? err.message : String(err)));
	}, [orgRepos]);
	if (repos === null) return <CenteredMessage loading title="Loading local repositories…" />;
	if (repos.length === 0) {
		return (
			<CenteredMessage
				title="No locally cloned GitHub repos"
				detail="Open a GitHub repository in Principal to register its checkout."
			/>
		);
	}

	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
				color: theme.colors.text,
				fontFamily: theme.fonts.body,
			}}
		>
			<style>{`.merged-pr-author-filters{scrollbar-width:none}.merged-pr-author-filters::-webkit-scrollbar{display:none;width:0;height:0}
.merged-pr-org-option{background:transparent}
.merged-pr-org-option:hover,.merged-pr-org-option:focus,.merged-pr-org-option[aria-checked="true"]{background:var(--merged-pr-org-hover)}
.merged-pr-org-option:focus-visible{outline:1px solid var(--merged-pr-org-accent);outline-offset:-1px}`}</style>
			<header
				style={{
					flexShrink: 0,
					display: "flex",
					flexDirection: "column",
					borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
					background: theme.colors.backgroundSecondary ?? theme.colors.background,
				}}
			>
			<div style={{ display: "flex", alignItems: "stretch", minHeight: 36 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "0 14px",
						borderRight: `1px solid ${theme.colors.border ?? "#333"}`,
					}}
				>
					<span
						style={{
							fontSize: theme.fontSizes[0],
							color: muted,
							textTransform: "uppercase",
							letterSpacing: 0.3,
						}}
					>
						Organization
					</span>
					<OrganizationSelector
						owners={owners}
						owner={owner}
						repoCounts={repoCounts}
						onChange={setOwner}
					/>
				</div>
				<div style={{ flex: 1, minWidth: 0, display: "flex" }}>
					{WINDOWS.map(({ key, label }, index) => {
						const active = window === key;
						return (
							<button
								key={key}
								type="button"
								aria-pressed={active}
								onClick={() => setWindow(key)}
								style={{
									padding: "0 14px",
									border: "none",
									borderRight: index < WINDOWS.length - 1 ? `1px solid ${theme.colors.border ?? "#333"}` : "none",
									background: active ? `${theme.colors.primary}22` : "transparent",
									color: active ? theme.colors.primary : muted,
									fontFamily: theme.fonts.body,
									fontSize: theme.fontSizes[0],
									fontWeight: active ? 600 : 400,
									letterSpacing: 0.3,
									textTransform: "uppercase",
									cursor: "pointer",
								}}
							>
								{label}
							</button>
						);
					})}
				</div>
				{authors.length > 0 && (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							padding: "0 10px",
							borderLeft: `1px solid ${theme.colors.border ?? "#333"}`,
						}}
					>
						{authors.length === 1 ? (
							<AuthorFilterChip
								login={authors[0]!.login}
								avatarUrl={authors[0]!.avatarUrl}
								count={authors[0]!.count}
								color={authorColors.get(authors[0]!.login)}
								selected={selectedAuthors.has(authors[0]!.login)}
								onClick={() => toggleAuthor(authors[0]!.login)}
							/>
						) : (
							<button
								type="button"
								aria-label="Toggle contributor filters"
								aria-expanded={authorsOpen}
								title={`${authors.length} contributors · ${authorsOpen ? "Hide" : "Show"} contributor filters`}
								onClick={() => setAuthorsOpen((open) => !open)}
								style={{
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									padding: "2px 4px",
									border: "none",
									background: "transparent",
									color: selectedAuthors.size > 0 ? theme.colors.primary : muted,
									cursor: "pointer",
								}}
							>
								<ContributorAvatarFan
									contributors={authors}
									size={20}
									max={4}
									activityNoun="merge"
									ringColor={
										theme.colors.backgroundSecondary ?? theme.colors.background
									}
								/>
								<ChevronDown
									size={12}
									aria-hidden="true"
									style={{
										transform: authorsOpen ? "rotate(180deg)" : undefined,
										transition: "transform 120ms ease",
									}}
								/>
							</button>
						)}
					</div>
				)}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						padding: "0 12px",
						color: muted,
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[0],
						whiteSpace: "nowrap",
					}}
					title={
						[
							diffsCapped
								? `Auto-loading diffs for the first ${AUTO_LOAD_DIFF_LIMIT} PRs; expand a card to load the rest.`
								: "",
							"GitHub Search requests are paced to at most 10 per minute.",
						].filter(Boolean).join("\n")
					}
				>
					{loading ? (
						<span role="status" aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
							<Loader2 size={11} className="principal-studio-spin" aria-hidden="true" />
							{queryStage === "priority"
								? "Finding your PR repos…"
								: `Repos searched ${queryProgress.queried}/${queryProgress.total}`}
						</span>
					) : diffProgress.total === 0 ? (
						`${visiblePullRequests.length} merged`
					) : diffProgress.loaded < Math.min(diffProgress.total, AUTO_LOAD_DIFF_LIMIT) ? (
						`${visiblePullRequests.length} merged · diffs ${diffProgress.loaded}/${Math.min(diffProgress.total, AUTO_LOAD_DIFF_LIMIT)}`
					) : (
						`${visiblePullRequests.length} merged · diffs loaded`
					)}
				</div>
				<button
					type="button"
					aria-label="Refresh merged pull requests"
					title="Refresh local repositories and merged PRs"
					disabled={loading}
					onClick={() => void refreshRepos()}
					style={{
						width: 36,
						border: "none",
						borderLeft: `1px solid ${theme.colors.border ?? "#333"}`,
						background: "transparent",
						color: muted,
						cursor: loading ? "default" : "pointer",
						opacity: loading ? 0.5 : 1,
					}}
				>
					<RefreshCw size={14} aria-hidden="true" />
				</button>
			</div>
			{authors.length > 1 && authorsOpen && (
				<div
					role="group"
					aria-label="Filter merged pull requests by contributor"
					className="merged-pr-author-filters"
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 44,
						padding: "4px 12px",
						borderTop: `1px solid ${theme.colors.border ?? "#333"}`,
						overflowX: "auto",
					}}
				>
					<span style={{ flexShrink: 0, color: muted, fontSize: theme.fontSizes[0], textTransform: "uppercase", letterSpacing: 0.3 }}>
						Contributors
					</span>
					{authors.map((author) => (
						<AuthorFilterChip
							key={author.login}
							login={author.login}
							avatarUrl={author.avatarUrl}
							count={author.count}
							color={authorColors.get(author.login)}
							selected={selectedAuthors.has(author.login)}
							onClick={() => toggleAuthor(author.login)}
						/>
					))}
				</div>
			)}
			</header>

			<div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
				<div
					style={{
						width: "42%",
						minWidth: 300,
						minHeight: 0,
						display: "flex",
						flexDirection: "column",
						overflow: "hidden",
						borderRight: `1px solid ${theme.colors.border ?? "#333"}`,
					}}
				>
					<MergedPullRequestRepoMap
						repos={mapRepos}
						pullRequests={mappedVisiblePullRequests}
						contributorsByRepo={contributorsByRepo}
						lineStatsByRepo={lineStatsByRepo}
						authorColors={authorColors}
						showFailedRepos={showFailedRepos}
						selectedRepoKeys={selectedRepos}
						onToggleRepo={toggleRepo}
						onHoverRepo={setHoveredRepoKey}
						hoveredPullRequestId={hoveredPullRequestId}
						onRepoFastForwarded={handleRepoFastForwarded}
						onOpenRepoDetails={handleOpenRepoInsights}
					/>
				</div>
				<div
					style={{
						flex: 1,
						minWidth: 0,
						minHeight: 0,
						display: "flex",
						flexDirection: "column",
					}}
				>
					<div style={{ flexShrink: 0 }}>
						{window === "week" ? (
							<RepoActivityWeekHeatmap
								timestamps={heatmapPullRequests.map((pr) => pr.mergedAt)}
								weekStart={windowStart("week")}
								activityNoun="merge"
								selectedRangeKey={selectedTimeRange?.key}
								onSelectRange={selectTimeRange}
							/>
						) : window === "month" ? (
							<RepoActivityMonthHeatmap
								timestamps={heatmapPullRequests.map((pr) => pr.mergedAt)}
								monthStart={windowStart("month")}
								activityNoun="merge"
								selectedRangeKey={selectedTimeRange?.key}
								onSelectRange={selectTimeRange}
							/>
						) : (
							<RepoActivityDayHeatmap
								timestamps={heatmapPullRequests.map((pr) => pr.mergedAt)}
								day={windowStart(window)}
								dayLabel={window}
								activityNoun="merge"
								selectedRangeKey={selectedTimeRange?.key}
								onSelectRange={selectTimeRange}
							/>
						)}
					</div>
					<main style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto" }}>
					{error && <Notice theme={theme} danger>{error}</Notice>}
					{repoErrors.map((item) => <Notice key={item} theme={theme} danger>{item}</Notice>)}
					{truncatedRepos.length > 0 && (
						<Notice theme={theme}>
							GitHub search is limited to 1,000 results per repository: {truncatedRepos.join(", ")}.
						</Notice>
					)}
					{loading && visiblePullRequests.length === 0 ? (
						<PullRequestListSkeleton />
					) : visiblePullRequests.length === 0 ? (
						<CenteredMessage
							title={error ? "Could not load merged pull requests" : "No merged pull requests"}
							detail={
								error
									? undefined
									: mergedInWindow.length === 0
										? `No merged PRs for ${owner} in this window. Showing the local checkout cities instead.`
										: selectedRepos.size
											? "No merges for the selected repos in this window."
											: `No merges for ${owner} in this window.`
							}
						/>
					) : (
						<div style={{ maxWidth: 960, margin: "0 auto" }}>
							{visiblePullRequests.map((pr) => {
								const id = pullRequestLayerId(pr);
								const repoKey = `pkg:github/${pr.owner}/${pr.repo}`;
								return (
									<MergedPullRequestCard
										key={id}
										pullRequest={pr}
										diff={fileDiffs.get(id)}
										lineSummary={lineSummaryByPr.get(id)}
										maxLineChanges={maxLineChanges}
										highlighted={
											highlightRowsFromRepoHover &&
											hoveredRepoKey === repoKey
										}
										onHover={() => setHoveredPullRequestId(id)}
										onLeave={() => setHoveredPullRequestId(null)}
										onLoadFiles={() => void loadPullRequestFiles(pr)}
										onOpen={() => void electrobun.rpc!.request.openExternal({ url: pr.url })}
									/>
								);
							})}
						</div>
					)}
				</main>
				</div>
			</div>
		</div>
	);
}

function orgAvatarUrl(org: string): string {
	return `https://github.com/${org}.png?size=64`;
}

function OrgAvatar({ org, size = 20 }: { org: string; size?: number }) {
	const { theme } = useTheme();
	const [broken, setBroken] = useState(false);
	const border = theme.colors.border ?? "#333";
	if (broken) {
		return (
			<span
				aria-hidden="true"
				style={{
					width: size,
					height: size,
					flexShrink: 0,
					borderRadius: 6,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					background: theme.colors.backgroundSecondary ?? theme.colors.background,
					border: `1px solid ${border}`,
					color: theme.colors.textSecondary ?? theme.colors.text,
					fontSize: size * 0.55,
					fontWeight: 700,
				}}
			>
				{org.slice(0, 1).toUpperCase()}
			</span>
		);
	}
	return (
		<img
			src={orgAvatarUrl(org)}
			alt=""
			width={size}
			height={size}
			onError={() => setBroken(true)}
			style={{
				width: size,
				height: size,
				flexShrink: 0,
				borderRadius: 6,
				objectFit: "cover",
				border: `1px solid ${border}`,
				background: theme.colors.backgroundSecondary ?? theme.colors.background,
			}}
		/>
	);
}

export function OrganizationSelector({
	owners,
	owner,
	repoCounts,
	onChange,
}: {
	owners: readonly string[];
	owner: string;
	repoCounts: ReadonlyMap<string, number>;
	onChange: (owner: string) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [open, setOpen] = useState(false);
	const [triggerHovered, setTriggerHovered] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const menuId = useId();

	useEffect(() => {
		if (!open) return;
		menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
		const dismiss = (event: PointerEvent) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", dismiss);
		return () => document.removeEventListener("pointerdown", dismiss);
	}, [open ]);
	const close = useCallback(() => {
		setOpen(false);
		trigger.current?.focus();
	}, []);

	if (owners.length <= 1) {
		return (
			<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
				<OrgAvatar org={owner} size={20} />
				<span style={{ fontFamily: theme.fonts.body, fontSize: theme.fontSizes[1], fontWeight: 600, color: theme.colors.text }}>
					{owner}
				</span>
			</span>
		);
	}

	const highlighted = open || triggerHovered;
	return (
		<div
			ref={root}
			style={{
				position: "relative",
				"--merged-pr-org-hover": theme.colors.backgroundSecondary ?? theme.colors.background,
				"--merged-pr-org-accent": theme.colors.primary,
			} as CSSProperties}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape" && open) {
					event.preventDefault();
					event.stopPropagation();
					close();
				}
			}}
		>
			<button
				ref={trigger}
				type="button"
				aria-label="GitHub organization"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				onClick={() => setOpen((value) => !value)}
				onMouseEnter={() => setTriggerHovered(true)}
				onMouseLeave={() => setTriggerHovered(false)}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						setOpen(true);
					}
				}}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 8,
					maxWidth: 240,
					padding: "4px 2px",
					border: "none",
					background: "transparent",
					color: highlighted ? theme.colors.primary : theme.colors.text,
					cursor: "pointer",
					fontFamily: theme.fonts.body,
					fontSize: theme.fontSizes[1],
					fontWeight: 600,
					transition: "color 120ms ease",
				}}
			>
				<OrgAvatar org={owner} size={20} />
				<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
					{owner}
				</span>
				<ChevronDown
					size={14}
					aria-hidden="true"
					style={{
						flexShrink: 0,
						color: highlighted ? theme.colors.primary : muted,
						transform: open ? "rotate(180deg)" : undefined,
						transition: "transform 120ms ease",
					}}
				/>
			</button>
			{open && (
				<div
					ref={menu}
					id={menuId}
					role="menu"
					aria-label="GitHub organizations"
					style={{
						position: "absolute",
						left: 0,
						top: "calc(100% + 8px)",
						zIndex: 20,
						minWidth: 240,
						maxWidth: 320,
						maxHeight: 320,
						overflowY: "auto",
						padding: 4,
						background: theme.colors.background,
						border: `1px solid ${theme.colors.border ?? "#333"}`,
						borderRadius: 8,
						boxShadow: "0 8px 24px #0005",
					}}
					onKeyDown={(event) => {
						if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
						event.preventDefault();
						const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
						const index = options.indexOf(document.activeElement as HTMLButtonElement);
						const next =
							event.key === "Home"
								? 0
								: event.key === "End"
									? options.length - 1
									: (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
						options[next]?.focus();
					}}
				>
					{owners.map((item) => {
						const selected = item === owner;
						const count = repoCounts.get(item) ?? 0;
						return (
							<button
								key={item}
								type="button"
								role="menuitemradio"
								aria-checked={selected}
								tabIndex={-1}
								className="merged-pr-org-option"
								onClick={() => {
									onChange(item);
									setOpen(false);
									trigger.current?.focus();
								}}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									width: "100%",
									padding: "7px 9px",
									border: 0,
									borderRadius: 6,
									color: selected ? theme.colors.primary : theme.colors.text,
									fontFamily: theme.fonts.body,
									fontSize: theme.fontSizes[1],
									cursor: "pointer",
									textAlign: "left",
								}}
							>
								<OrgAvatar org={item} size={24} />
								<span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: selected ? 600 : 400 }}>
									{item}
								</span>
								<span style={{ flexShrink: 0, fontFamily: theme.fonts.monospace, fontSize: theme.fontSizes[0], color: muted }}>
									{count} {count === 1 ? "repo" : "repos"}
								</span>
								{selected && <Check size={14} aria-hidden="true" style={{ flexShrink: 0 }} />}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

export function AuthorFilterChip({
	login,
	avatarUrl,
	count,
	color,
	selected,
	onClick,
	activityNoun = "merged pull request",
}: {
	login: string;
	avatarUrl?: string;
	count: number;
	/** Highlight color used for this author's map layers. */
	color?: string;
	selected: boolean;
	onClick: () => void;
	/** Singular noun for the accessible label and tooltip. */
	activityNoun?: string;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [avatarBroken, setAvatarBroken] = useState(false);
	const activity = `${count} ${activityNoun}${count === 1 ? "" : "s"}`;
	return (
		<button
			type="button"
			aria-pressed={selected}
			aria-label={`Filter by ${login}, ${activity}`}
			title={`${login} · ${activity}`}
			onClick={onClick}
			style={{
				flexShrink: 0,
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				padding: "3px 8px 3px 4px",
				border: `1px solid ${color ?? (selected ? theme.colors.primary : theme.colors.border ?? "#444")}`,
				borderRadius: 8,
				background: selected ? `${theme.colors.primary}22` : "transparent",
				color: selected ? theme.colors.primary : theme.colors.text,
				cursor: "pointer",
				fontFamily: theme.fonts.body,
				fontSize: theme.fontSizes[0],
			}}
		>
			{avatarUrl && !avatarBroken ? (
				<img
					src={avatarUrl}
					alt=""
					width={24}
					height={24}
					onError={() => setAvatarBroken(true)}
					style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }}
				/>
			) : (
				<span
					aria-hidden="true"
					style={{
						width: 24,
						height: 24,
						borderRadius: "50%",
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						background: theme.colors.background,
						color: muted,
						fontSize: theme.fontSizes[0],
					}}
				>
					{login.slice(0, 1).toUpperCase()}
				</span>
			)}
			<span>{login}</span>
			<span
				style={{
					minWidth: 18,
					padding: "1px 5px",
					borderRadius: 999,
					background: selected ? `${theme.colors.primary}33` : (theme.colors.backgroundSecondary ?? "#333"),
					color: selected ? theme.colors.primary : muted,
					fontFamily: theme.fonts.monospace,
					textAlign: "center",
				}}
			>
				{count}
			</span>
		</button>
	);
}

function MergedPullRequestCard({
	pullRequest,
	diff,
	lineSummary,
	maxLineChanges,
	highlighted,
	onHover,
	onLeave,
	onLoadFiles,
	onOpen,
}: {
	pullRequest: MergedPullRequest;
	diff?: PullRequestDiffState;
	lineSummary?: ReturnType<typeof summarizeFileChanges>;
	maxLineChanges?: number;
	highlighted: boolean;
	onHover: () => void;
	onLeave: () => void;
	onLoadFiles: () => void;
	onOpen: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [expanded, setExpanded] = useState(false);
	const [avatarBroken, setAvatarBroken] = useState(false);
	const [numberHovered, setNumberHovered] = useState(false);
	const [rowHovered, setRowHovered] = useState(false);
	const mergedTime = Date.parse(pullRequest.mergedAt);
	const files = diff?.files ?? pullRequest.files ?? [];
	const changes: FileChange[] =
		diff?.changes ??
		pullRequest.changes ??
		files.map((path) => ({ path, status: "modified" }));
	const computedLineSummary = summarizeFileChanges(changes);
	const summary = lineSummary ?? computedLineSummary;
	const filesLoaded = diff?.files !== undefined || pullRequest.files !== undefined;
	const toggleExpanded = () => {
		const nextExpanded = !expanded;
		setExpanded(nextExpanded);
		if (nextExpanded && !filesLoaded && !diff?.loading) onLoadFiles();
	};
	return (
		<div
			data-merged-pull-request={`${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`}
			role="button"
			tabIndex={0}
			aria-expanded={expanded}
			onClick={toggleExpanded}
			onKeyDown={(event) => {
				if (event.target !== event.currentTarget) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					toggleExpanded();
				}
			}}
			onMouseEnter={() => {
				setRowHovered(true);
				onHover();
			}}
			onMouseLeave={() => {
				setRowHovered(false);
				onLeave();
			}}
			style={{
				padding: "16px 12px",
				minHeight: 72,
				cursor: "pointer",
				borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
				background: highlighted
					? `${theme.colors.primary}12`
					: rowHovered
						? `${theme.colors.primary}0a`
						: "transparent",
				transition: "background 120ms ease",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
				{pullRequest.author && (
					<span
						aria-hidden="true"
						title={`Merged by ${pullRequest.author}`}
						style={{
							width: 42,
							height: 42,
							flexShrink: 0,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						{pullRequest.authorAvatarUrl && !avatarBroken ? (
							<img
								src={pullRequest.authorAvatarUrl}
								alt=""
								width={42}
								height={42}
								onError={() => setAvatarBroken(true)}
								style={{
									width: 42,
									height: 42,
									borderRadius: "50%",
									objectFit: "cover",
									flexShrink: 0,
								}}
							/>
						) : (
							<span
								aria-hidden="true"
								style={{
									width: 42,
									height: 42,
									borderRadius: "50%",
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									background: theme.colors.backgroundSecondary ?? "#333",
									color: muted,
									fontSize: 15,
									fontWeight: 700,
									flexShrink: 0,
								}}
							>
								{pullRequest.author.slice(0, 1).toUpperCase()}
							</span>
						)}
					</span>
				)}
				<div
					style={{
						flex: 1,
						minWidth: 0,
						display: "flex",
						flexDirection: "column",
						gap: 4,
						transform: "translateY(-1px)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: theme.fontSizes[0], fontFamily: theme.fonts.monospace, color: muted }}>
						{Number.isFinite(mergedTime) && (
							<time dateTime={pullRequest.mergedAt} title={new Date(mergedTime).toLocaleString()}>
								merged {relativeTime(mergedTime)}
							</time>
						)}
						{summary.known && (
							<span
								title={`${summary.additions} additions, ${summary.deletions} deletions`}
							>
								{Number.isFinite(mergedTime) ? "· " : ""}
								<span style={{ color: theme.colors.success ?? "#3d9a5f" }}>
									+{summary.additions}
								</span>{" "}
								<span style={{ color: theme.colors.error ?? "#e5534b" }}>
									−{summary.deletions}
								</span>
							</span>
						)}
						<span>
							{Number.isFinite(mergedTime) || summary.known
								? `· ${pullRequest.repo}`
								: pullRequest.repo}
						</span>
						{pullRequest.author && (
							<span>· {pullRequest.author}</span>
						)}
					</div>
					<div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
						<div style={{ flex: "1 1 220px", minWidth: 0 }}>
							<div style={{ minWidth: 0, overflowWrap: "anywhere", color: highlighted ? theme.colors.primary : theme.colors.text }}>
								{pullRequest.title}
							</div>
						</div>
					</div>
				</div>
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onOpen();
					}}
					onMouseEnter={() => setNumberHovered(true)}
					onMouseLeave={() => setNumberHovered(false)}
					aria-label={`Open pull request ${pullRequest.number} on GitHub`}
					title={`Open pull request #${pullRequest.number} on GitHub`}
					style={{
						flexShrink: 0,
						display: "inline-flex",
						alignItems: "center",
						gap: 4,
						padding: 0,
						border: "none",
						background: "transparent",
						color: numberHovered ? theme.colors.primary : muted,
						cursor: "pointer",
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[0],
						textDecoration: numberHovered ? "underline" : "none",
					}}
				>
					<GitPullRequest
						size={14}
						style={{
							flexShrink: 0,
							color: theme.colors.success ?? "#3d9a5f",
						}}
						aria-hidden="true"
					/>
					#{pullRequest.number}
				</button>
				{summary.known && summary.additions + summary.deletions > 0 ? (
					<div style={{ flex: 1, minWidth: 0 }}>
						<LineChangeScaleBar
							additions={summary.additions}
							deletions={summary.deletions}
							maxTotal={maxLineChanges ?? 0}
						/>
					</div>
				) : (
					<div
						style={{
							flex: 1,
							height: 12,
							borderRadius: 2,
							background: theme.colors.border ?? "#333",
							opacity: 0.35,
						}}
					/>
				)}
			</div>
			<div style={{ display: "grid", gridTemplateRows: expanded ? "1fr" : "0fr", transition: "grid-template-rows 220ms cubic-bezier(0.4, 0, 0.2, 1)" }}>
				<div inert={!expanded} style={{ minHeight: 0, overflow: "hidden" }}>
					{expanded && (
						<div onClick={(event) => event.stopPropagation()} style={{ marginTop: 8, marginLeft: 22, paddingTop: 8, borderTop: `1px solid ${theme.colors.border ?? "#333"}`, display: "flex", flexDirection: "column", gap: 4 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, fontSize: theme.fontSizes[0], color: muted }}>
								<FileDiff size={12} aria-hidden="true" /> Changed paths · highlighted in repo map
							</div>
							{diff?.loading ? (
								<div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: theme.fontSizes[1], color: muted }}>
									<Loader2 size={12} className="principal-studio-spin" aria-hidden="true" />
									Loading changed paths from GitHub…
								</div>
							) : diff?.error ? (
								<div style={{ fontSize: theme.fontSizes[1], color: theme.colors.error ?? "#e5534b" }}>
									{diff.error}{" "}
									<button type="button" onClick={onLoadFiles} style={{ border: "none", background: "transparent", color: theme.colors.primary, cursor: "pointer", font: "inherit" }}>Retry</button>
								</div>
							) : !filesLoaded ? (
								<div style={{ fontSize: theme.fontSizes[1], color: muted }}>Expand this PR to load its changed paths and highlight the repo map.</div>
							) : files.length === 0 ? (
								<div style={{ fontSize: theme.fontSizes[1], color: muted }}>No changed-file paths were returned by GitHub.</div>
							) : (
								<FileChangeList changes={changes} />
							)}
							{diff?.truncated && <div style={{ marginTop: 4, fontSize: theme.fontSizes[0], color: muted }}>Showing the first 300 changed paths.</div>}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export function Notice({
	theme,
	children,
	danger = false,
}: {
	theme: ReturnType<typeof useTheme>["theme"];
	children: ReactNode;
	danger?: boolean;
}) {
	return (
		<div style={{ padding: "10px 16px", borderBottom: `1px solid ${theme.colors.border ?? "#333"}`, color: danger ? "#e5534b" : (theme.colors.textSecondary ?? theme.colors.text), fontSize: theme.fontSizes[1] }}>
			{children}
		</div>
	);
}
