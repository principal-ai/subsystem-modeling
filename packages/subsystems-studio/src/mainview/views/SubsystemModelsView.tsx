/**
 * SubsystemModelsView — the "Subsystems" tab: a list of stored subsystem
 * graphs (~/.principal/subsystem-models). Clicking a row opens the graph in
 * a subsystem-model tab via the host.
 *
 * The list loads once and refreshes from host-pushed store changes. Verification
 * and maintenance live in the Maintenance tab; the list no longer surfaces
 * per-model audit state.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LayoutDashboard, PencilRuler, Search, Trash2, X } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { purlRepoKey } from "@principal-ai/subsystems-react";
import type {
	C4SketchSummary,
	SubsystemModelSummary,
	StudioMessages,
} from "../../shared/contract";
import {
	electrobun,
	showFailedRepoCityCardsSubscribers,
	c4SketchChangeSubscribers,
	graphifyChangeSubscribers,
	subsystemModelChangeSubscribers,
	subsystemModelProposalsChangeSubscribers,
} from "../rpc";
import { SubsystemModelCard } from "../components/SubsystemModelCard";
import { SubsystemSketchCard } from "../components/SubsystemSketchCard";
import {
	Modal,
	ModalBody,
	ModalButton,
	ModalFooter,
	ModalHeader,
} from "../components/Modal";
import { SubsystemReposMap } from "./SubsystemReposMap";
import { CenteredMessage } from "../ui";

/** Max width of the centered list column (sketches + model rows). */
const LIST_MAX_WIDTH = 960;

/** Which edited-at window the Subsystems list and map are showing. */
type EditedWindow = "today" | "yesterday" | "week" | "all";

const EDITED_WINDOWS: ReadonlyArray<{
	key: EditedWindow;
	label: string;
	title: string;
}> = [
	{ key: "today", label: "Today", title: "Edited today" },
	{ key: "yesterday", label: "Yesterday", title: "Edited yesterday" },
	{ key: "week", label: "This week", title: "Edited this week, Monday through now" },
	{ key: "all", label: "All", title: "Every subsystem model" },
];

function startOfLocalDay(ms: number): number {
	const d = new Date(ms);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/** Monday 00:00 local for the week that contains `dayStart`. */
function startOfLocalWeek(dayStartMs: number): number {
	const d = new Date(dayStartMs);
	const day = d.getDay();
	const daysSinceMonday = day === 0 ? 6 : day - 1;
	d.setDate(d.getDate() - daysSinceMonday);
	return d.getTime();
}

function editedInWindow(
	updatedAt: string,
	window: EditedWindow,
	nowMs: number,
): boolean {
	if (window === "all") return true;
	const t = new Date(updatedAt).getTime();
	if (!Number.isFinite(t)) return false;
	const startToday = startOfLocalDay(nowMs);
	if (window === "today") return t >= startToday && t <= nowMs;
	if (window === "yesterday") {
		const startYesterday = new Date(startToday);
		startYesterday.setDate(startYesterday.getDate() - 1);
		return t >= startYesterday.getTime() && t < startToday;
	}
	return t >= startOfLocalWeek(startToday) && t <= nowMs;
}

/** Next wider edited-at window, for the empty state's way out. */
function widerEditedWindow(window: EditedWindow): EditedWindow | null {
	if (window === "today" || window === "yesterday") return "week";
	if (window === "week") return "all";
	return null;
}

function SubsystemEmptyState({
	title,
	detail,
	action,
}: {
	title: string;
	detail?: string;
	action?: { label: string; onClick: () => void };
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<div
			style={{
				flex: 1,
				minHeight: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: "48px 24px",
			}}
		>
			<div
				style={{
					maxWidth: 380,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					textAlign: "center",
					gap: 12,
				}}
			>
				<div
					aria-hidden="true"
					style={{
						width: 56,
						height: 56,
						borderRadius: 16,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						marginBottom: 4,
						color: theme.colors.primary,
						background: `${theme.colors.primary}18`,
						border: `1px solid ${theme.colors.primary}44`,
					}}
				>
					<LayoutDashboard size={26} strokeWidth={1.5} />
				</div>
				<div
					style={{
						fontSize: theme.fontSizes[3],
						fontWeight: 600,
						letterSpacing: -0.2,
						color: theme.colors.text,
					}}
				>
					{title}
				</div>
				{detail && (
					<div
						style={{
							fontSize: theme.fontSizes[1],
							lineHeight: 1.5,
							color: muted,
						}}
					>
						{detail}
					</div>
				)}
				{action && (
					<button
						type="button"
						onClick={action.onClick}
						style={{
							marginTop: 4,
							fontSize: theme.fontSizes[1],
							fontFamily: theme.fonts.body,
							fontWeight: 600,
							color: theme.colors.primary,
							background: `${theme.colors.primary}18`,
							border: `1px solid ${theme.colors.primary}66`,
							borderRadius: 8,
							padding: "6px 14px",
							cursor: "pointer",
						}}
					>
						{action.label}
					</button>
				)}
			</div>
		</div>
	);
}

/**
 * Last-opened timestamp for list order. Never-opened graphs sort oldest, so
 * existing graphs keep their relative order until opened once.
 */
function openedSortTime(graph: SubsystemModelSummary): number {
	const opened = graph.lastOpenedAt ? Date.parse(graph.lastOpenedAt) : NaN;
	return Number.isFinite(opened) ? opened : 0;
}

/**
 * Reuse `prev` when `next` holds the same elements in the same order.
 * Filter/sort chains mint a fresh array every render; consumers memoized on
 * the array reference (the repo map rebuilds every city from it) must only
 * see a new reference when the contents actually differ.
 */
function sameElements<T>(prev: readonly T[] | null, next: readonly T[]): boolean {
	if (!prev || prev.length !== next.length) return false;
	for (let i = 0; i < next.length; i++) {
		if (prev[i] !== next[i]) return false;
	}
	return true;
}

/** Repo keys (`pkg:github/owner/name`) a model touches, via `repos` + file purls. */
function repoKeysForGraph(graph: SubsystemModelSummary): Set<string> {
	const keys = new Set<string>();
	for (const r of graph.repos ?? []) {
		if (r.owner && r.name) keys.add(`pkg:github/${r.owner}/${r.name}`);
	}
	for (const f of graph.files ?? []) {
		const key = purlRepoKey(f.purl);
		if (key) keys.add(key);
	}
	return keys;
}

/**
 * Title search, centered in the Subsystems tab header. Title-only substring
 * match (case-insensitive). Repo selection lives in the left map rail;
 * search, repos, and the edited-at window all compose.
 */
function SubsystemsTabHeader({
	editedWindow,
	onEditedWindowChange,
	query,
	onQueryChange,
	resultCount,
	totalCount,
	filtersActive,
	onClearAll,
}: {
	editedWindow?: EditedWindow;
	onEditedWindowChange?: (window: EditedWindow) => void;
	query: string;
	onQueryChange: (query: string) => void;
	resultCount: number;
	totalCount: number;
	filtersActive: boolean;
	onClearAll: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<div
			style={{
				flexShrink: 0,
				display: "flex",
				alignItems: "stretch",
				padding: 0,
				minHeight: 34,
				borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
				background: theme.colors.backgroundSecondary ?? theme.colors.background,
			}}
		>
			<div style={{ display: "flex", alignItems: "stretch", minWidth: 0 }}>
				{onEditedWindowChange && (
					<div
						role="group"
						aria-label="Edited"
						style={{ display: "flex", alignItems: "stretch" }}
					>
							{EDITED_WINDOWS.map((w, i) => {
								const active = (editedWindow ?? "today") === w.key;
								return (
									<button
										key={w.key}
										type="button"
										title={w.title}
										aria-pressed={active}
										onClick={() => onEditedWindowChange(w.key)}
										style={{
											display: "inline-flex",
											alignItems: "center",
											fontSize: theme.fontSizes[0],
											fontWeight: active ? 600 : 400,
											letterSpacing: 0.3,
											textTransform: "uppercase",
											padding: "0 14px",
											border: "none",
											borderRight:
												i < EDITED_WINDOWS.length - 1
													? `1px solid ${theme.colors.border ?? "#333"}`
													: "none",
											background: active
												? `${theme.colors.primary}22`
												: "transparent",
											color: active ? theme.colors.primary : muted,
											cursor: "pointer",
											fontFamily: theme.fonts.body,
										}}
									>
										{w.label}
									</button>
								);
							})}
					</div>
				)}
			</div>
			<div
				role="group"
				aria-label="Filter"
				style={{
					flex: 1,
					minWidth: 0,
					display: "flex",
					alignItems: "stretch",
					justifyContent: "center",
				}}
			>
				<div
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						padding: "0 6px 0 14px",
						minWidth: 120,
						flex: "0 1 280px",
					}}
				>
					<Search size={12} color={muted} style={{ flexShrink: 0 }} aria-hidden="true" />
					<input
						type="search"
						value={query}
						placeholder="SEARCH TITLES"
						aria-label="Search subsystem models by title"
						onChange={(e) => onQueryChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape" && query) {
								e.preventDefault();
								onQueryChange("");
							}
						}}
						style={{
							flex: 1,
							minWidth: 0,
							border: "none",
							outline: "none",
							background: "transparent",
							color: theme.colors.text,
							fontFamily: theme.fonts.body,
							fontSize: theme.fontSizes[0],
							letterSpacing: 0.3,
						}}
					/>
					{query && (
						<button
							type="button"
							aria-label="Clear title search"
							onClick={() => onQueryChange("")}
							style={{
								display: "inline-flex",
								border: "none",
								background: "transparent",
								color: muted,
								cursor: "pointer",
								padding: "0 2px",
							}}
						>
							<X size={12} />
						</button>
					)}
				</div>
				{/* Always mounted (visibility-toggled) so the centered
					search + repo controls never shift when it appears. */}
				<button
					type="button"
					onClick={onClearAll}
					title="Clear title search and repo filter"
					disabled={!filtersActive}
					tabIndex={filtersActive ? undefined : -1}
					aria-hidden={!filtersActive}
					style={{
						flexShrink: 0,
						alignSelf: "stretch",
						border: "none",
						borderLeft: `1px solid ${theme.colors.border ?? "#333"}`,
						background: "transparent",
						color: muted,
						cursor: filtersActive ? "pointer" : "default",
						fontFamily: theme.fonts.body,
						fontSize: theme.fontSizes[0],
						fontWeight: 600,
						letterSpacing: 0.3,
						textTransform: "uppercase",
						padding: "0 14px",
						visibility: filtersActive ? "visible" : "hidden",
					}}
				>
					Clear
				</button>
			</div>
			<div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
				<span
					style={{
						padding: "0 8px",
						color: muted,
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[0],
						whiteSpace: "nowrap",
						display: "inline-block",
						minWidth: "22ch",
						textAlign: "right",
					}}
				>
					{filtersActive ? `Filtered · ${resultCount} of ${totalCount}` : `${resultCount} of ${totalCount}`}
				</span>
			</div>
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

export function SubsystemModelsView({
	scope,
}: {
	/**
	 * Present for `subsystem-showcase` tabs: render only these model ids (in
	 * this order) and hide the filter header. Absent for the permanent
	 * Subsystems tab, which shows everything with filters.
	 */
	scope?: { ids: string[]; title?: string };
} = {}) {
	const { theme } = useTheme();
	const [graphs, setGraphs] = useState<SubsystemModelSummary[] | null>(null);
	const [showFailedRepos, setShowFailedRepos] = useState(false);
	const [sketches, setSketches] = useState<C4SketchSummary[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);
	const [editedWindow, setEditedWindow] = useState<EditedWindow>("today");
	/** Title substring filter (case-insensitive). Inactive in showcase scope. */
	const [query, setQuery] = useState("");
	/** Repo keys (`pkg:github/owner/name`) — empty means all repos. */
	const [selectedRepos, setSelectedRepos] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const onToggleRepo = useCallback((repoKey: string) => {
		setSelectedRepos((current) => {
			const next = new Set(current);
			if (next.has(repoKey)) {
				next.delete(repoKey);
			} else {
				next.add(repoKey);
			}
			return next;
		});
	}, []);
	const onClearFilters = useCallback(() => {
		setQuery("");
		setSelectedRepos(new Set());
	}, []);
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

	/** Repo hovered via the rail — touching models tint primary. */
	const [hoveredRepoKey, setHoveredRepoKey] = useState<string | null>(null);
	/** Model hovered via the list — the rail isolates its layer. */
	const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
	/** Rows expanded to list all their trails (row click toggles). */
	const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	/** Last `panelGraphs` handed to the map; reused while its contents hold. */
	const panelGraphsRef = useRef<SubsystemModelSummary[] | null>(null);
	/** Last repo-filter-exempt graphs handed to the rail; same reuse. */
	const mapPanelGraphsRef = useRef<SubsystemModelSummary[] | null>(null);

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

	const refresh = useCallback(async () => {
		try {
			const [subResult, sketchResult] = await Promise.all([
				electrobun.rpc!.request.listSubsystemModels({}),
				electrobun.rpc!.request
					.listC4Sketches({})
					.catch(() => null),
			]);
			// Keep the previous array identity when a push-triggered refresh finds
			// no changes. The repo map and Pierre tree use this identity to preserve
			// their derived state and folder expansion.
			setGraphs((prev) =>
				prev !== null &&
				JSON.stringify(prev) === JSON.stringify(subResult.graphs)
					? prev
					: subResult.graphs,
			);
			setSketches((prev) => {
				if (!sketchResult?.ok) return prev ?? [];
				const next = sketchResult.sketches ?? [];
				return prev !== null && JSON.stringify(prev) === JSON.stringify(next)
					? prev
					: next;
			});
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setSketches((prev) => prev ?? []);
		}
	}, []);

	useEffect(() => {
		const onGraphify = (_payload: StudioMessages["graphifyChanged"]) => {
			void refresh();
		};
		const onSubsystem = (_payload: StudioMessages["subsystemModelChanged"]) => {
			void refresh();
		};
		const onProposals = (
			_payload: StudioMessages["subsystemModelProposalsChanged"],
		) => {
			void refresh();
		};
		const onC4Sketch = (_payload: StudioMessages["c4SketchChanged"]) => {
			void refresh();
		};
		graphifyChangeSubscribers.add(onGraphify);
		subsystemModelChangeSubscribers.add(onSubsystem);
		subsystemModelProposalsChangeSubscribers.add(onProposals);
		c4SketchChangeSubscribers.add(onC4Sketch);
		void refresh();
		return () => {
			graphifyChangeSubscribers.delete(onGraphify);
			subsystemModelChangeSubscribers.delete(onSubsystem);
			subsystemModelProposalsChangeSubscribers.delete(onProposals);
			c4SketchChangeSubscribers.delete(onC4Sketch);
		};
	}, [refresh]);

	const onOpen = useCallback(
		async (graph: SubsystemModelSummary, trailId?: string) => {
			await electrobun.rpc!.request.openSubsystemModel({
				graphId: graph.id,
				...(trailId ? { trailId } : {}),
			});
		},
		[],
	);

	/** Open an authored C4 hypothesis in its own tab. */
	const onOpenSketch = useCallback((sketch: C4SketchSummary) => {
		void electrobun.rpc!.request.openC4Sketch({ sketchId: sketch.id });
	}, []);

	/** Delete a sketch, then drop it from the in-memory list. */
	const onDeleteSketch = useCallback(async (sketch: C4SketchSummary) => {
		try {
			const res = await electrobun.rpc!.request.deleteC4Sketch({
				sketchId: sketch.id,
			});
			if (!res.ok) {
				setError(res.error ?? "Could not delete sketch");
				return;
			}
			setSketches((prev) => prev?.filter((s) => s.id !== sketch.id) ?? null);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	/** Details toggle: open/close the row's inline trail list. */
	const onToggleDetails = useCallback(
		(graph: SubsystemModelSummary) => {
			setExpandedIds((current) => {
				const next = new Set(current);
				if (next.has(graph.id)) {
					next.delete(graph.id);
				} else {
					next.add(graph.id);
				}
				return next;
			});
		},
		[],
	);

	/**
	 * Row click opens the model in its own tab. Expanding the inline details
	 * (description + trail list) is a dedicated button on the row, wired to
	 * `onToggleDetails`, so the two actions no longer compete for the click.
	 */
	const onRowClick = useCallback(
		(graph: SubsystemModelSummary) => {
			void onOpen(graph);
		},
		[onOpen],
	);

	/** Arm the delete confirmation modal for a model. */
	const requestDelete = useCallback((graph: SubsystemModelSummary) => {
		setConfirmId(graph.id);
	}, []);

	/** Delete the model the confirmation is armed for, then close the modal. */
	const confirmDelete = useCallback(async () => {
		const graph = confirmId
			? graphs?.find((g) => g.id === confirmId)
			: undefined;
		setConfirmId(null);
		if (!graph) return;
		try {
			await electrobun.rpc!.request.deleteSubsystemModel({ graphId: graph.id });
			setGraphs((prev) => prev?.filter((g) => g.id !== graph.id) ?? null);
			setExpandedIds((current) => {
				if (!current.has(graph.id)) return current;
				const next = new Set(current);
				next.delete(graph.id);
				return next;
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, [confirmId, graphs]);

	/** The model whose deletion is awaiting confirmation. */
	const pendingDelete = confirmId
		? (graphs?.find((g) => g.id === confirmId) ?? null)
		: null;

	if (error && graphs === null) {
		return (
			<SubsystemsTabShell>
				<SubsystemsTabBody>
					<CenteredMessage title="Could not load subsystem graphs" detail={error} />
				</SubsystemsTabBody>
			</SubsystemsTabShell>
		);
	}
	if (graphs === null || sketches === null) {
		return (
			<SubsystemsTabShell>
				<SubsystemsTabBody>
					<CenteredMessage title="Loading subsystem graphs…" />
				</SubsystemsTabBody>
			</SubsystemsTabShell>
		);
	}
	if (graphs.length === 0 && sketches.length === 0) {
		return (
			<SubsystemsTabShell>
				<SubsystemsTabBody>
					<SubsystemEmptyState
						title="No subsystem models yet"
						detail="When a model is saved, it shows up here."
					/>
				</SubsystemsTabBody>
			</SubsystemsTabShell>
		);
	}

	const now = Date.now();
	const inEditedWindow = (g: SubsystemModelSummary) =>
		editedInWindow(g.updatedAt, editedWindow, now);
	// Title + repo filters. In showcase scope they are inactive (the agent
	// chose the set). Title, repos, and the recency window all compose.
	const searching = !scope && (query.trim() !== "" || selectedRepos.size > 0);
	const titleQuery = query.trim().toLowerCase();
	const matchesTitle = (title: string) =>
		titleQuery === "" || title.toLowerCase().includes(titleQuery);
	const matchesRepos = (keys: ReadonlySet<string> | Set<string>) =>
		selectedRepos.size === 0 || [...selectedRepos].some((k) => keys.has(k));
	// Sketches are a separate artifact, but they carry title + updatedAt, so
	// the title filter and recency window apply the same way. A showcase is
	// an explicit model-id set, so sketches are not part of it.
	const visibleSketches = (sketches ?? []).filter((sketch) => {
		if (scope) return false;
		if (!matchesTitle(sketch.title)) return false;
		if (selectedRepos.size > 0 && !sketch.repoKeys.some((k) => selectedRepos.has(k))) return false;
		if (editedWindow !== "all" && !editedInWindow(sketch.updatedAt, editedWindow, now)) return false;
		return true;
	});
	// Showcase scope: an explicit, ordered id set. When present it wins over
	// recency hiding — the agent chose the set and its order.
	const scopeOrder = scope?.ids ?? null;
	const scopeRank = scopeOrder
		? new Map(scopeOrder.map((id, i) => [id, i]))
		: null;
	const orderByScope = (list: SubsystemModelSummary[]) =>
		scopeRank
			? [...list].sort(
					(a, b) =>
						(scopeRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
						(scopeRank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
				)
			: list;
	const queryFilteredGraphs = scopeOrder
		? graphs.filter((g) => scopeRank!.has(g.id))
		: graphs.filter(
				(g) => matchesTitle(g.title) && matchesRepos(repoKeysForGraph(g)),
			);
	const visibleGraphs = queryFilteredGraphs;
	// Order stays last-opened, newest first. Title, repos, and the edited-at
	// window all compose (AND). Showcase scope skips the window.
	const applyListFilters = (base: SubsystemModelSummary[]) => {
		const windowed =
			scopeOrder || editedWindow === "all" ? base : base.filter(inEditedWindow);
		return orderByScope(
			[...windowed].sort((a, b) => openedSortTime(b) - openedSortTime(a)),
		);
	};
	const windowedGraphs =
		scopeOrder || editedWindow === "all"
			? visibleGraphs
			: visibleGraphs.filter(inEditedWindow);
	const sortedGraphs = applyListFilters(visibleGraphs);
	// Identity-stable: preview toggles re-render this view without changing
	// the list, and the repo map keys every city build off this array.
	const nextPanelGraphs = applyListFilters(visibleGraphs);
	const panelGraphs = sameElements(panelGraphsRef.current, nextPanelGraphs)
		? panelGraphsRef.current!
		: nextPanelGraphs;
	panelGraphsRef.current = panelGraphs;
	// The rail is the repo picker: it follows the title + window filters but
	// never the repo selection itself, so clicking a card only highlights —
	// the rail's membership and order stay put while the list narrows.
	const queryNoRepoGraphs = scopeOrder
		? graphs.filter((g) => scopeRank!.has(g.id))
		: graphs.filter((g) => matchesTitle(g.title));
	const nextMapGraphs = applyListFilters(queryNoRepoGraphs);
	const mapPanelGraphs = sameElements(mapPanelGraphsRef.current, nextMapGraphs)
		? mapPanelGraphsRef.current!
		: nextMapGraphs;
	mapPanelGraphsRef.current = mapPanelGraphs;

	const outsideWindow = visibleGraphs.length - windowedGraphs.length;
	const widenTo = !scopeOrder ? widerEditedWindow(editedWindow) : null;
	const filtersMatchNothing = visibleGraphs.length === 0 && (titleQuery !== "" || selectedRepos.size > 0);
	const emptyCopy: { title: string; detail?: string } = filtersMatchNothing
		? {
					title: "No models match",
					detail:
						[titleQuery ? `"${query.trim()}"` : null, selectedRepos.size > 0 ? `${selectedRepos.size} repo${selectedRepos.size === 1 ? "" : "s"}` : null]
							.filter(Boolean)
							.join(" · ") || undefined,
				}
			: editedWindow === "today"
				? { title: "Nothing edited today" }
				: editedWindow === "yesterday"
					? { title: "Nothing edited yesterday" }
					: editedWindow === "week"
						? { title: "Nothing edited this week" }
						: { title: "No subsystem models" };
	const widenLabel = EDITED_WINDOWS.find((w) => w.key === widenTo)?.label;
	const emptyAction = filtersMatchNothing
		? {
					label: "Clear search",
					onClick: onClearFilters,
				}
			: widenTo && outsideWindow > 0 && widenLabel
				? {
						label: `Show ${widenLabel.toLowerCase()}`,
						onClick: () => setEditedWindow(widenTo),
					}
				: undefined;
	const sketchSection = visibleSketches.length > 0 ? (
		<div
			style={{
				borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					padding: "12px 24px 6px",
					color: muted,
					fontSize: theme.fontSizes[0],
					fontFamily: theme.fonts.monospace,
					letterSpacing: 0.3,
					textTransform: "uppercase",
				}}
			>
				<PencilRuler size={12} aria-hidden="true" />
				C4 sketches
				<span style={{ color: theme.colors.textMuted ?? muted }}>
					{visibleSketches.length}
				</span>
			</div>
			{visibleSketches.map((sketch) => (
				<div
					key={sketch.id}
					style={{
						boxShadow: `inset 0 1px 0 ${theme.colors.border ?? "#333"}`,
					}}
				>
					<SubsystemSketchCard
						sketch={sketch}
						onOpen={() => onOpenSketch(sketch)}
						onDelete={() => void onDeleteSketch(sketch)}
					/>
				</div>
			))}
		</div>
	) : null;

	const modelList = (
windowedGraphs.length === 0 ? (
				<SubsystemEmptyState
					title={emptyCopy.title}
					detail={emptyCopy.detail}
					action={emptyAction}
				/>
			) : (
			<div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
				{sortedGraphs.map((graph, i) => {
					return (
						<div
							key={graph.id}
							// Hairline between rows, like the sidebar's `RepoRow`
							// wrappers; an inset shadow so it adds no height.
							style={{
								boxShadow:
									i > 0
										? `inset 0 1px 0 ${theme.colors.border ?? "#333"}`
										: undefined,
							}}
						>
							<SubsystemModelCard
								graph={graph}
								rowExpanded={expandedIds.has(graph.id)}
								highlighted={
									hoveredRepoKey != null &&
									repoKeysForGraph(graph).has(hoveredRepoKey)
								}
								onRowClick={() => onRowClick(graph)}
								onToggleDetails={() => onToggleDetails(graph)}
								onHoverModel={setHoveredModelId}
								onDelete={() => requestDelete(graph)}
								onOpenTrail={(trailId) => void onOpen(graph, trailId)}
							/>
						</div>
					);
				})}
			</div>
			)
	);


	const renderListScroll = (centered: boolean) => (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				overflowY: "auto",
				padding: 0,
			}}
		>
			<div
				style={{
					maxWidth: LIST_MAX_WIDTH,
					margin: centered ? "0 auto" : 0,
					width: "100%",
					boxSizing: "border-box",
				}}
			>
				{error && (
					<div
						style={{
							fontSize: theme.fontSizes[1],
							color: "#e5534b",
							marginBottom: 10,
							padding: "12px 24px 0",
						}}
					>
						{error}
					</div>
				)}
				{sketchSection}
				{modelList}
			</div>
		</div>
	);
	return (
		<SubsystemsTabShell>
			{!scope && (
				<SubsystemsTabHeader
				editedWindow={editedWindow}
				onEditedWindowChange={setEditedWindow}
				query={query}
				onQueryChange={setQuery}
				resultCount={sortedGraphs.length}
				totalCount={graphs.length}
				filtersActive={searching}
				onClearAll={onClearFilters}
			/>
			)}
			{panelGraphs.length === 0 && visibleSketches.length > 0 ? (
				<SubsystemsTabBody>
					<div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
						<div
							style={{
								maxWidth: LIST_MAX_WIDTH,
								margin: "0 auto",
								width: "100%",
								boxSizing: "border-box",
							}}
						>
							{sketchSection}
						</div>
					</div>
				</SubsystemsTabBody>
			) : panelGraphs.length === 0 ? (
				<SubsystemsTabBody>
					<SubsystemEmptyState
						title={emptyCopy.title}
						detail={emptyCopy.detail}
						action={emptyAction}
					/>
				</SubsystemsTabBody>
			) : scope ? (
			<SubsystemsTabBody>
				{renderListScroll(true)}
			</SubsystemsTabBody>
			) : (
			<SubsystemsTabBody>
				<div
					style={{
						flex: 1,
						minWidth: 0,
						minHeight: 0,
						display: "flex",
						position: "relative",
						overflow: "hidden",
					}}
				>
					<div
						className="subsystem-map-rail"
						style={{
							width: "40%",
							flexShrink: 0,
							minHeight: 0,
							display: "flex",
							flexDirection: "column",
							background: theme.colors.background,
							paddingLeft: 12,
							paddingRight: 12,
							scrollbarWidth: "none",
						}}
					>
						<style>{`.subsystem-map-rail,.subsystem-map-rail *{scrollbar-width:none;}.subsystem-map-rail::-webkit-scrollbar,.subsystem-map-rail *::-webkit-scrollbar{display:none;}`}</style>
						<SubsystemReposMap
							graphs={mapPanelGraphs}
							showFailedRepos={showFailedRepos}
							selectedRepoKeys={selectedRepos}
							onToggleRepo={onToggleRepo}
							onHoverRepo={setHoveredRepoKey}
							hoveredModelId={hoveredModelId}
							/>
					</div>
					{renderListScroll(false)}
				</div>
			</SubsystemsTabBody>
			)}
		{pendingDelete && (
				<Modal
					ariaLabel="Delete subsystem model"
					onClose={() => setConfirmId(null)}
				>
					<ModalHeader
						icon={Trash2}
						tone="danger"
						title="Delete subsystem model?"
					/>
					<ModalBody>
						This permanently deletes <strong>{pendingDelete.title}</strong> and
						its audit history. This can&rsquo;t be undone.
					</ModalBody>
					<ModalFooter>
						<ModalButton onClick={() => setConfirmId(null)}>Cancel</ModalButton>
						<ModalButton
							variant="danger"
							icon={Trash2}
							onClick={() => void confirmDelete()}
						>
							Delete
						</ModalButton>
					</ModalFooter>
				</Modal>
			)}
		</SubsystemsTabShell>
	);
}
