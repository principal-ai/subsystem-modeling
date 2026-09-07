/**
 * SubsystemModelsView — the "Subsystems" tab: a list of stored subsystem
 * graphs (~/.principal/subsystem-models). Clicking a row opens the graph in a
 * subsystem-model tab via the host.
 *
 * A strip of repo cards across the top aggregates unique GitHub repos from the
 * visible graphs (component purls, falling back to each graph's authored
 * `repo`). Each card shows graphify status: Alexandria freshness when the
 * repo is registered locally, otherwise verification-cache readiness. Click
 * cards to AND-filter the list. Each row shows whether graphify verification
 * is *possible* (any cached graph.json for every component purl) and can
 * trigger ensure for missing purls. That is cache presence, not
 * component/edge verification — and not an exact match to the current dirty
 * working tree.
 *
 * The list polls every 10s so graphs posted via the HTTP API appear without
 * reopening the viewer.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	GraphifyRepoEntry,
	SubsystemModelSummary,
	SubsystemGraphifyAggregateStatus,
	SubsystemGraphifyPurlStatus,
	StudioMessages,
} from "../../shared/contract";
import { electrobun, graphifyChangeSubscribers, subsystemModelChangeSubscribers } from "../rpc";
import { CenteredMessage, lastLoadedLabel, relativeTime } from "../ui";

const SUBSYSTEMS_POLL_MS = 10_000;
const COPY_FEEDBACK_MS = 1500;

/** Listing sort offered by the Subsystems tab header. */
type SubsystemSortKey = "opened" | "edited" | "created";

const SUBSYSTEM_SORTS: ReadonlyArray<{ key: SubsystemSortKey; label: string }> = [
	{ key: "opened", label: "Opened" },
	{ key: "edited", label: "Edited" },
	{ key: "created", label: "Created" },
];

/**
 * Sort timestamp for a summary row. Last-opened treats never-opened graphs as
 * oldest (stamp is absent), so existing graphs keep their current relative
 * order until opened once.
 */
function subsystemModelSortTime(
	graph: SubsystemModelSummary,
	sortKey: SubsystemSortKey,
): number {
	if (sortKey === "edited") return new Date(graph.updatedAt).getTime();
	if (sortKey === "created") return new Date(graph.createdAt).getTime();
	const opened = graph.lastOpenedAt ? Date.parse(graph.lastOpenedAt) : NaN;
	return Number.isFinite(opened) ? opened : 0;
}

/** Parse `pkg:github/owner/name` (fragment/query ignored). */
function parseGithubRepo(
	purl: string | undefined,
): { owner: string; name: string } | null {
	if (!purl) return null;
	const match = /^pkg:github\/([^/]+)\/([^/#?]+)/.exec(purl.trim());
	if (!match) return null;
	return { owner: match[1]!, name: match[2]! };
}

/**
 * Graphify status shown on a repo card.
 * Prefer Alexandria freshness (`listGraphifyRepos`); fall back to subsystem
 * verification-cache readiness for that purl.
 */
type RepoCardGraphify =
	| {
			source: "freshness";
			status: GraphifyRepoEntry["status"];
			/** True when some cache exists but may not match HEAD. */
			hasCached: boolean;
			purl: string;
			repoRoot: string;
	  }
	| {
			source: "verification";
			status: SubsystemGraphifyPurlStatus;
			purl: string;
			repoRoot?: string;
	  };

interface SubsystemRepoCard {
	owner: string;
	name: string;
	/** How many listed graphs reference this repo. */
	graphCount: number;
	graphify: RepoCardGraphify | null;
}

function repoKey(owner: string, name: string): string {
	return `${owner}/${name}`;
}

const EMPTY_REPO_FILTER: ReadonlySet<string> = new Set();

function asRepoFilterSet(value: unknown): ReadonlySet<string> {
	if (value instanceof Set) return value;
	if (typeof value === "string" && value.length > 0) return new Set([value]);
	if (Array.isArray(value)) return new Set(value.filter((k) => typeof k === "string"));
	return EMPTY_REPO_FILTER;
}

/** Whether a listed graph references the given GitHub repo. */
function graphUsesRepo(
	graph: SubsystemModelSummary,
	owner: string,
	name: string,
): boolean {
	const key = repoKey(owner, name);
	for (const p of graph.graphify?.purls ?? []) {
		const repo = parseGithubRepo(p.purl);
		if (repo && repoKey(repo.owner, repo.name) === key) return true;
	}
	return graph.repo != null && repoKey(graph.repo.owner, graph.repo.name) === key;
}

function verificationGraphifyForRepo(
	graphs: SubsystemModelSummary[],
	owner: string,
	name: string,
): Extract<RepoCardGraphify, { source: "verification" }> | null {
	const key = repoKey(owner, name);
	for (const graph of graphs) {
		for (const p of graph.graphify?.purls ?? []) {
			const repo = parseGithubRepo(p.purl);
			if (repo && repoKey(repo.owner, repo.name) === key) {
				return {
					source: "verification",
					status: p.status,
					purl: p.purl,
					repoRoot: p.repoRoot,
				};
			}
		}
	}
	return null;
}

/**
 * Unique repos across the visible subsystem list, with graphify status joined
 * on: Alexandria freshness when present, else verification-cache readiness.
 */
function collectReposFromGraphs(
	graphs: SubsystemModelSummary[],
	graphifyRepos: GraphifyRepoEntry[] | null,
): SubsystemRepoCard[] {
	const byKey = new Map<
		string,
		{ owner: string; name: string; graphIds: Set<string> }
	>();

	const add = (owner: string, name: string, graphId: string) => {
		const key = repoKey(owner, name);
		let entry = byKey.get(key);
		if (!entry) {
			entry = { owner, name, graphIds: new Set() };
			byKey.set(key, entry);
		}
		entry.graphIds.add(graphId);
	};

	for (const graph of graphs) {
		const seenOnGraph = new Set<string>();
		for (const p of graph.graphify?.purls ?? []) {
			const repo = parseGithubRepo(p.purl);
			if (!repo) continue;
			const key = repoKey(repo.owner, repo.name);
			if (seenOnGraph.has(key)) continue;
			seenOnGraph.add(key);
			add(repo.owner, repo.name, graph.id);
		}
		if (graph.repo) {
			const key = repoKey(graph.repo.owner, graph.repo.name);
			if (!seenOnGraph.has(key)) {
				add(graph.repo.owner, graph.repo.name, graph.id);
			}
		}
	}

	const freshnessByKey = new Map<string, GraphifyRepoEntry>();
	for (const entry of graphifyRepos ?? []) {
		freshnessByKey.set(repoKey(entry.owner, entry.name), entry);
	}

	return [...byKey.values()]
		.map((e) => {
			const freshness = freshnessByKey.get(repoKey(e.owner, e.name));
			let graphify: RepoCardGraphify | null = null;
			if (freshness) {
				graphify = {
					source: "freshness",
					status: freshness.status,
					hasCached: freshness.cached != null,
					purl: freshness.purl,
					repoRoot: freshness.path,
				};
			} else {
				graphify = verificationGraphifyForRepo(graphs, e.owner, e.name);
			}
			return {
				owner: e.owner,
				name: e.name,
				graphCount: e.graphIds.size,
				graphify,
			};
		})
		.sort(
			(a, b) =>
				b.graphCount - a.graphCount ||
				a.owner.localeCompare(b.owner) ||
				a.name.localeCompare(b.name),
		);
}

function repoCardCanRunGraphify(g: RepoCardGraphify): boolean {
	if (g.source === "freshness") {
		return g.status !== "building" && !!g.repoRoot;
	}
	return (
		(g.status === "missing" || g.status === "ready") && !!g.repoRoot
	);
}

function repoCardGraphifyLabel(g: RepoCardGraphify): string {
	if (g.source === "freshness") {
		if (g.status === "ready") return "Up to date";
		if (g.status === "building") return "Running";
		return g.hasCached ? "Out of date" : "Not run";
	}
	switch (g.status) {
		case "ready":
			return "Cached";
		case "building":
			return "Running";
		case "missing":
			return "Not ready";
		case "unavailable":
			return "Unavailable";
	}
}

function repoCardGraphifyTitle(g: RepoCardGraphify, canRun: boolean): string {
	const base =
		g.source === "freshness"
			? g.status === "ready"
				? "Graphify cache matches current HEAD(+dirty) for this Alexandria checkout."
				: g.status === "building"
					? "Graphify extract in progress."
					: g.hasCached
						? "A graphify cache exists, but it was built for a different commit or dirty state."
						: "No graphify graph cached for this Alexandria checkout yet."
			: g.status === "ready"
				? "Some graphify cache exists for this purl (verification possible). Not checked against current HEAD."
				: g.status === "building"
					? "Graphify extract in progress for this purl."
					: g.status === "missing"
						? "No graphify cache yet — run graphify to prepare verification."
						: "No cached graph and no local checkout for this purl.";
	if (!canRun) return base;
	if (g.source === "freshness" && g.status === "ready") {
		return `${base} Click to re-run.`;
	}
	if (g.source === "verification" && g.status === "ready") {
		return `${base} Click to re-run.`;
	}
	return `${base} Click to run graphify.`;
}

function repoCardGraphifyColor(
	g: RepoCardGraphify,
	muted: string,
	secondary: string,
): string {
	if (g.source === "freshness") {
		if (g.status === "ready") return "#3d9a5f";
		if (g.status === "building") return secondary;
		return g.hasCached ? "#e5534b" : muted;
	}
	switch (g.status) {
		case "ready":
			return "#3d9a5f";
		case "building":
			return secondary;
		case "missing":
		case "unavailable":
			return muted;
	}
}

function readinessLabel(status: SubsystemGraphifyAggregateStatus): string {
	switch (status) {
		case "possible":
			return "Verification possible";
		case "partial":
			return "Partial";
		case "running":
			return "Running";
		case "not_ready":
			return "Not ready";
		case "unavailable":
			return "Unavailable";
	}
}

function readinessTitle(
	status: SubsystemGraphifyAggregateStatus,
	purls: NonNullable<SubsystemModelSummary["graphify"]>["purls"],
): string {
	const detail = purls
		.map((p) => `${p.purl}: ${p.status}`)
		.join("\n");
	const intro =
		status === "possible"
			? "All component purls have a cached graphify graph — verification can run (any slot; not necessarily matching current dirty tree)."
			: status === "partial"
				? "Some purls are cached; run graphify for the rest."
				: status === "running"
					? "Graphify extract in progress for one or more purls."
					: status === "not_ready"
						? "No graphify cache yet — run graphify to prepare verification."
						: "No cached graph and no local checkout for these purls.";
	return detail ? `${intro}\n\n${detail}` : intro;
}

function readinessColor(
	status: SubsystemGraphifyAggregateStatus,
	muted: string,
	secondary: string,
): string {
	switch (status) {
		case "possible":
			return "#3d9a5f";
		case "partial":
		case "running":
			return secondary;
		case "not_ready":
		case "unavailable":
			return muted;
	}
}

function SubsystemsTabHeader({
	lastLoadedAt,
	sortBy,
	onSortChange,
}: {
	lastLoadedAt: number | null;
	sortBy: SubsystemSortKey;
	onSortChange: (key: SubsystemSortKey) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [, bump] = useState(0);

	useEffect(() => {
		if (lastLoadedAt == null) return;
		const id = setInterval(() => bump((n) => n + 1), 1_000);
		return () => clearInterval(id);
	}, [lastLoadedAt]);

	return (
		<div
			style={{
				flexShrink: 0,
				display: "flex",
				alignItems: "baseline",
				justifyContent: "space-between",
				gap: 12,
				padding: "10px 24px",
				borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
				background: theme.colors.backgroundSecondary ?? theme.colors.background,
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
				<div style={{ fontSize: theme.fontSizes[2], fontWeight: 600 }}>Subsystems</div>
				<div
					role="group"
					aria-label="Sort subsystems"
					style={{ display: "flex", alignItems: "center", gap: 4 }}
				>
					{SUBSYSTEM_SORTS.map((s) => {
						const active = s.key === sortBy;
						return (
							<button
								key={s.key}
								type="button"
								title={`Sort by ${s.label.toLowerCase()}`}
								aria-pressed={active}
								onClick={() => onSortChange(s.key)}
								style={{
									fontSize: theme.fontSizes[0],
									fontWeight: active ? 600 : 400,
									letterSpacing: 0.3,
									textTransform: "uppercase",
									padding: "1px 7px",
									borderRadius: 999,
									border: `1px solid ${
										active ? theme.colors.primary : "transparent"
									}`,
									background: active ? `${theme.colors.primary}22` : "transparent",
									color: active ? theme.colors.primary : muted,
									cursor: "pointer",
									fontFamily: theme.fonts.body,
								}}
							>
								{s.label}
							</button>
						);
					})}
				</div>
			</div>
			<div
				style={{
					fontSize: theme.fontSizes[0],
					color: muted,
					fontFamily: theme.fonts.monospace,
				}}
			>
				{lastLoadedAt == null
					? "Loading…"
					: `Last loaded ${lastLoadedLabel(lastLoadedAt)}`}
			</div>
		</div>
	);
}

function SubsystemRepoCards({
	repos,
	selectedKeys = EMPTY_REPO_FILTER,
	busyPurl,
	onToggle,
	onRunGraphify,
}: {
	repos: SubsystemRepoCard[];
	selectedKeys?: ReadonlySet<string>;
	busyPurl: string | null;
	onToggle: (key: string) => void;
	onRunGraphify: (repo: SubsystemRepoCard) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	if (repos.length === 0) return null;

	return (
		<div
			style={{
				flexShrink: 0,
				display: "flex",
				alignItems: "stretch",
				gap: 8,
				padding: "10px 24px",
				borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
				overflowX: "auto",
			}}
		>
			{repos.map((repo) => {
				const key = repoKey(repo.owner, repo.name);
				const selected = selectedKeys.has(key);
				const gf = repo.graphify;
				const gfColor = gf
					? repoCardGraphifyColor(gf, muted, theme.colors.textSecondary)
					: null;
				const running =
					gf != null &&
					(busyPurl === gf.purl || gf.status === "building");
				const canRun =
					gf != null &&
					busyPurl === null &&
					!running &&
					repoCardCanRunGraphify(gf);
				return (
					<div
						key={key}
						role="button"
						tabIndex={0}
						title={
							selected
								? `Remove ${key} from filter`
								: selectedKeys.size > 0
									? `Also require ${key}`
									: `Filter graphs that use ${key}`
						}
						aria-pressed={selected}
						aria-label={
							selected
								? `Remove ${key} from filter`
								: `Add ${key} to filter`
						}
						onClick={() => onToggle(key)}
						onKeyDown={(e) => {
							if (e.key !== "Enter" && e.key !== " ") return;
							e.preventDefault();
							onToggle(key);
						}}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							flexShrink: 0,
							minWidth: 0,
							maxWidth: 400,
							padding: "6px 10px 6px 6px",
							borderRadius: 6,
							border: `1px solid ${
								selected
									? theme.colors.primary
									: (theme.colors.border ?? "#333")
							}`,
							background: selected
								? `${theme.colors.primary}22`
								: (theme.colors.backgroundSecondary ?? "transparent"),
							color: theme.colors.text,
							cursor: "pointer",
							textAlign: "left",
							fontFamily: theme.fonts.body,
						}}
					>
						<img
							src={`https://github.com/${encodeURIComponent(repo.owner)}.png?size=64`}
							alt=""
							width={40}
							height={40}
							style={{
								borderRadius: 8,
								flexShrink: 0,
								display: "block",
								background: theme.colors.background,
							}}
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).style.visibility = "hidden";
							}}
						/>
						<div
							style={{
								minWidth: 0,
								flex: 1,
								display: "flex",
								flexDirection: "column",
								gap: 3,
							}}
						>
							<div
								style={{
									fontSize: theme.fontSizes[1],
									fontWeight: 600,
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{repo.name}
							</div>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									minWidth: 0,
								}}
							>
								<div
									style={{
										fontSize: theme.fontSizes[0],
										color: muted,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
										minWidth: 0,
									}}
								>
									{repo.owner}
								</div>
								{gf && gfColor && (
									<button
										type="button"
										disabled={!canRun}
										aria-label={
											running
												? `Graphify running for ${key}`
												: canRun
													? gf.status === "ready"
														? `Re-run graphify for ${key}`
														: `Run graphify for ${key}`
													: repoCardGraphifyLabel(gf)
										}
										title={repoCardGraphifyTitle(gf, canRun)}
										onClick={(e) => {
											e.stopPropagation();
											if (canRun) onRunGraphify(repo);
										}}
										style={{
											flexShrink: 0,
											fontSize: 10,
											fontWeight: 600,
											letterSpacing: 0.3,
											textTransform: "uppercase",
											padding: "1px 6px",
											borderRadius: 999,
											background: `${gfColor}22`,
											color: gfColor,
											border: `1px solid ${gfColor}55`,
											whiteSpace: "nowrap",
											cursor: canRun ? "pointer" : "default",
											opacity: running ? 0.75 : canRun ? 1 : 0.85,
											fontFamily: theme.fonts.body,
										}}
									>
										{running ? "Running…" : repoCardGraphifyLabel(gf)}
									</button>
								)}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function SubsystemsTabBody({ children }: { children: ReactNode }) {
	return (
		<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
			{children}
		</div>
	);
}

function SubsystemsTabShell({ children }: { children: ReactNode }) {
	const { theme } = useTheme();
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
			{children}
		</div>
	);
}

export function SubsystemModelsView() {
	const { theme } = useTheme();
	const [graphs, setGraphs] = useState<SubsystemModelSummary[] | null>(null);
	const [graphifyRepos, setGraphifyRepos] = useState<GraphifyRepoEntry[] | null>(
		null,
	);
	const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);
	const [busyGraphId, setBusyGraphId] = useState<string | null>(null);
	const [busyPurl, setBusyPurl] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [repoFilter, setRepoFilter] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const [sortBy, setSortBy] = useState<SubsystemSortKey>("opened");
	const [message, setMessage] = useState<string | null>(null);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

	useEffect(
		() => () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		},
		[],
	);

	const refresh = useCallback(async () => {
		try {
			const [subResult, gfResult] = await Promise.all([
				electrobun.rpc!.request.listSubsystemModels({}),
				electrobun.rpc!.request.listGraphifyRepos({}).catch(() => null),
			]);
			setGraphs(subResult.graphs);
			if (gfResult) setGraphifyRepos(gfResult.repos);
			setLastLoadedAt(Date.now());
			setError(null);
			const stillRunning = subResult.graphs.some(
				(g) => g.graphify?.status === "running",
			);
			if (!stillRunning) setBusyGraphId(null);
			setBusyPurl((current) => {
				if (current == null) return null;
				const stillBuilding =
					(gfResult?.repos.some(
						(r) => r.purl === current && r.status === "building",
					) ??
						false) ||
					subResult.graphs.some((g) =>
						g.graphify?.purls.some(
							(p) => p.purl === current && p.status === "building",
						),
					);
				return stillBuilding ? current : null;
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	useEffect(() => {
		void refresh();
		const id = setInterval(() => {
			void refresh();
		}, SUBSYSTEMS_POLL_MS);
		return () => clearInterval(id);
	}, [refresh]);

	useEffect(() => {
		const onGraphify = (_payload: StudioMessages["graphifyChanged"]) => {
			void refresh();
		};
		const onSubsystem = (_payload: StudioMessages["subsystemModelChanged"]) => {
			void refresh();
		};
		graphifyChangeSubscribers.add(onGraphify);
		subsystemModelChangeSubscribers.add(onSubsystem);
		return () => {
			graphifyChangeSubscribers.delete(onGraphify);
			subsystemModelChangeSubscribers.delete(onSubsystem);
		};
	}, [refresh]);

	const onOpen = useCallback(async (graph: SubsystemModelSummary) => {
		await electrobun.rpc!.request.openSubsystemModel({ graphId: graph.id });
	}, []);

	const onRunGraphify = useCallback(
		async (e: React.MouseEvent, graph: SubsystemModelSummary) => {
			e.stopPropagation();
			const readiness = graph.graphify;
			if (!readiness) return;
			const toEnsure = readiness.purls.filter(
				(p) => p.status === "missing" && p.repoRoot,
			);
			if (toEnsure.length === 0) {
				setMessage(`${graph.title}: nothing to run (already ready or unavailable)`);
				return;
			}
			setBusyGraphId(graph.id);
			setMessage(null);
			setError(null);
			try {
				for (const p of toEnsure) {
					const result = await electrobun.rpc!.request.ensureGraphifyGraph({
						purl: p.purl,
						repoRoot: p.repoRoot,
					});
					if (!result.ok) {
						setError(
							result.code === "graphify_not_installed"
								? `${result.error} — open the Graphify tab to install`
								: (result.error ?? "ensure failed"),
						);
						setBusyGraphId(null);
						return;
					}
				}
				setMessage(
					`${graph.title}: running graphify for ${toEnsure.length} purl${toEnsure.length === 1 ? "" : "s"}…`,
				);
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
				setBusyGraphId(null);
			}
		},
		[refresh],
	);

	const onCopyPath = useCallback(
		async (e: React.MouseEvent, graph: SubsystemModelSummary) => {
			e.stopPropagation();
			try {
				await navigator.clipboard.writeText(graph.path);
				setCopiedId(graph.id);
				if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
				copyTimeoutRef.current = setTimeout(() => setCopiedId(null), COPY_FEEDBACK_MS);
			} catch {
				// clipboard may be denied — fail quietly
			}
		},
		[],
	);

	const onToggleRepoFilter = useCallback((key: string) => {
		setRepoFilter((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const onRunRepoGraphify = useCallback(
		async (repo: SubsystemRepoCard) => {
			const gf = repo.graphify;
			if (!gf || !repoCardCanRunGraphify(gf)) return;
			const force = gf.status === "ready";
			setBusyPurl(gf.purl);
			setMessage(null);
			setError(null);
			try {
				const result = await electrobun.rpc!.request.ensureGraphifyGraph({
					purl: gf.purl,
					repoRoot: gf.repoRoot,
					force,
				});
				if (!result.ok) {
					setError(
						result.code === "graphify_not_installed"
							? `${result.error} — open the Graphify tab to install`
							: (result.error ?? "ensure failed"),
					);
					setBusyPurl(null);
					return;
				}
				if (result.status === "building") {
					setMessage(`${repo.owner}/${repo.name}: running graphify…`);
					setGraphifyRepos((prev) =>
						prev
							? prev.map((r) =>
									r.purl === gf.purl ? { ...r, status: "building" } : r,
								)
							: prev,
					);
					return;
				}
				setMessage(
					`${repo.owner}/${repo.name}: ${result.status}` +
						(result.nodeCount != null
							? ` — ${result.nodeCount} nodes / ${result.edgeCount} edges`
							: ""),
				);
				setBusyPurl(null);
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
				setBusyPurl(null);
			}
		},
		[refresh],
	);

	const onDelete = useCallback(
		async (e: React.MouseEvent, graph: SubsystemModelSummary) => {
			e.stopPropagation();
			if (confirmId !== graph.id) {
				setConfirmId(graph.id);
				return;
			}
			setConfirmId(null);
			try {
				await electrobun.rpc!.request.deleteSubsystemModel({ graphId: graph.id });
				setGraphs((prev) => prev?.filter((g) => g.id !== graph.id) ?? null);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[confirmId],
	);

	if (error && graphs === null) {
		return (
			<SubsystemsTabShell>
				<SubsystemsTabHeader
				lastLoadedAt={lastLoadedAt}
				sortBy={sortBy}
				onSortChange={setSortBy}
			/>
				<SubsystemsTabBody>
					<CenteredMessage title="Could not load subsystem graphs" detail={error} />
				</SubsystemsTabBody>
			</SubsystemsTabShell>
		);
	}
	if (graphs === null) {
		return (
			<SubsystemsTabShell>
				<SubsystemsTabHeader
				lastLoadedAt={lastLoadedAt}
				sortBy={sortBy}
				onSortChange={setSortBy}
			/>
				<SubsystemsTabBody>
					<CenteredMessage title="Loading subsystem graphs…" />
				</SubsystemsTabBody>
			</SubsystemsTabShell>
		);
	}
	if (graphs.length === 0) {
		return (
			<SubsystemsTabShell>
				<SubsystemsTabHeader
				lastLoadedAt={lastLoadedAt}
				sortBy={sortBy}
				onSortChange={setSortBy}
			/>
				<SubsystemsTabBody>
					<CenteredMessage
						title="No subsystem graphs yet"
						detail="POST one to http://127.0.0.1:3045/api/subsystem-model to create it."
					/>
				</SubsystemsTabBody>
			</SubsystemsTabShell>
		);
	}

	const repos = collectReposFromGraphs(graphs, graphifyRepos);
	const knownKeys = new Set(repos.map((r) => repoKey(r.owner, r.name)));
	const filterSet = asRepoFilterSet(repoFilter);
	const activeFilter = new Set(
		[...filterSet].filter((k) => knownKeys.has(k)),
	);
	const visibleGraphs =
		activeFilter.size === 0
			? graphs
			: graphs.filter((g) =>
					[...activeFilter].every((key) => {
						const [owner, name] = key.split("/");
						return owner != null && name != null && graphUsesRepo(g, owner, name);
					}),
				);
	const sortedGraphs = [...visibleGraphs].sort(
		(a, b) =>
			subsystemModelSortTime(b, sortBy) - subsystemModelSortTime(a, sortBy),
	);

	return (
		<SubsystemsTabShell>
			<SubsystemsTabHeader
				lastLoadedAt={lastLoadedAt}
				sortBy={sortBy}
				onSortChange={setSortBy}
			/>
			<SubsystemRepoCards
				repos={repos}
				selectedKeys={activeFilter}
				busyPurl={busyPurl}
				onToggle={onToggleRepoFilter}
				onRunGraphify={(repo) => void onRunRepoGraphify(repo)}
			/>
			<SubsystemsTabBody>
				<div
					style={{
						flex: 1,
						minHeight: 0,
						overflowY: "auto",
						padding: "16px 24px",
					}}
				>
			{message && (
				<div
					style={{
						fontSize: theme.fontSizes[1],
						color: theme.colors.textSecondary,
						marginBottom: 10,
					}}
				>
					{message}
				</div>
			)}
			{error && (
				<div style={{ fontSize: theme.fontSizes[1], color: "#e5534b", marginBottom: 10 }}>
					{error}
				</div>
			)}
			{visibleGraphs.length === 0 ? (
				<div
					style={{
						fontSize: theme.fontSizes[1],
						color: muted,
						padding: "24px 0",
					}}
				>
					{activeFilter.size > 0
						? `No graphs use all of: ${[...activeFilter].join(", ")}.`
						: "No subsystem graphs."}
				</div>
			) : (
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				{sortedGraphs.map((graph) => {
					const gf = graph.graphify;
					const status = gf?.status ?? "unavailable";
					const badgeColor = readinessColor(
						status,
						muted,
						theme.colors.textSecondary,
					);
					const canRun =
						busyGraphId === null &&
						gf != null &&
						gf.purls.some((p) => p.status === "missing" && p.repoRoot);
					const running =
						busyGraphId === graph.id || status === "running";

					return (
						<div
							key={graph.id}
							onClick={() => onOpen(graph)}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "8px 12px",
								borderRadius: 4,
								border: `1px solid ${theme.colors.border ?? "#333"}`,
								background: theme.colors.backgroundSecondary ?? "transparent",
								cursor: "pointer",
								fontSize: theme.fontSizes[2],
							}}
						>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div
									style={{
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{graph.title}
								</div>
								<div
									style={{
										marginTop: 4,
										fontSize: theme.fontSizes[0],
										color: muted,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
								{graph.componentCount === 1
									? "1 component"
									: `${graph.componentCount} components`}
								{" · "}
								{relativeTime(new Date(graph.updatedAt).getTime())}
								{graph.lastOpenedAt && (
									<>
										{" · opened "}
										{relativeTime(new Date(graph.lastOpenedAt).getTime())}
									</>
								)}
								</div>
							</div>
							<span
								title={
									gf
										? readinessTitle(status, gf.purls)
										: "Graphify readiness unknown"
								}
								style={{
									flexShrink: 0,
									boxSizing: "border-box",
									fontSize: theme.fontSizes[0],
									fontWeight: 600,
									letterSpacing: 0.3,
									textTransform: "uppercase",
									padding: "2px 7px",
									borderRadius: 999,
									background: `${badgeColor}22`,
									color: badgeColor,
									border: `1px solid ${badgeColor}55`,
									whiteSpace: "nowrap",
								}}
							>
								{readinessLabel(status)}
							</span>
							{(canRun || running) && (
								<button
									type="button"
									onClick={(e) => void onRunGraphify(e, graph)}
									disabled={!canRun || running}
									title="Ensure graphify cache for missing purls"
									style={{
										flexShrink: 0,
										padding: "4px 8px",
										borderRadius: 4,
										border: `1px solid ${theme.colors.border ?? "#333"}`,
										background: canRun && !running ? theme.colors.primary : "transparent",
										color:
											canRun && !running
												? theme.colors.background
												: muted,
										cursor: canRun && !running ? "pointer" : "default",
										fontSize: theme.fontSizes[0],
										fontFamily: theme.fonts.body,
										opacity: running ? 0.7 : 1,
									}}
								>
									{running ? "Running…" : "Run graphify"}
								</button>
							)}
							<button
								type="button"
								onClick={(e) => void onCopyPath(e, graph)}
								title={`Copy path: ${graph.path}`}
								aria-label={`Copy path for ${graph.title}`}
								style={{
									flexShrink: 0,
									display: "inline-flex",
									alignItems: "center",
									gap: 4,
									padding: "4px 8px",
									borderRadius: 4,
									border: `1px solid ${
										copiedId === graph.id
											? theme.colors.primary
											: (theme.colors.border ?? "#333")
									}`,
									background:
										copiedId === graph.id
											? theme.colors.primary
											: "transparent",
									color:
										copiedId === graph.id
											? theme.colors.background
											: muted,
									cursor: "pointer",
									fontSize: theme.fontSizes[0],
									fontFamily: theme.fonts.body,
								}}
							>
								{copiedId === graph.id ? <Check size={12} /> : <Copy size={12} />}
								{copiedId === graph.id ? "Copied" : "Copy path"}
							</button>
							<button
								type="button"
								onClick={(e) => onDelete(e, graph)}
								title={
									confirmId === graph.id
										? "Click again to delete"
										: `Delete ${graph.title}`
								}
								aria-label={
									confirmId === graph.id
										? `Confirm delete ${graph.title}`
										: `Delete ${graph.title}`
								}
								style={{
									flexShrink: 0,
									border: "none",
									background: "transparent",
									color:
										confirmId === graph.id
											? "#e5534b"
											: muted,
									fontWeight: confirmId === graph.id ? 600 : 400,
									cursor: "pointer",
									fontSize: theme.fontSizes[1],
									lineHeight: 1,
									padding: "2px 6px",
									borderRadius: 4,
								}}
							>
								{confirmId === graph.id ? "delete?" : "✕"}
							</button>
						</div>
					);
				})}
			</div>
			)}
				</div>
			</SubsystemsTabBody>
		</SubsystemsTabShell>
	);
}
