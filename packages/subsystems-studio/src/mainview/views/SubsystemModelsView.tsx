/**
 * SubsystemModelsView — the "Subsystems" tab: a list of stored subsystem
 * graphs (~/.principal/subsystem-models) with an aggregate file tree on the
 * left (union of `summary.files` across the listed graphs, grouped per repo).
 * Clicking a row opens the graph in a subsystem-model tab via the host;
 * clicking a file opens its owning graph.
 *
 * The list polls every 10s so graphs posted via the HTTP API appear without
 * reopening the viewer. Verification and maintenance live in the Maintenance
 * tab; the list no longer surfaces per-model audit state.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Boxes, Check, Component as ComponentIcon, Copy, Info, LayoutGrid, List, Loader2, Route as RouteIcon, Share2 } from "lucide-react";
import { DocumentView } from "themed-markdown";
import { useTheme } from "@principal-ade/industry-theme";
import {
	buildRepoGroups,
	purlRepoKey,
	PierreFileView,
	type RepoGroup,
} from "@principal-ai/subsystems-react";
import type {
	SubsystemModelSummary,
	StudioMessages,
} from "../../shared/contract";
import {
	electrobun,
	graphifyChangeSubscribers,
	subsystemModelChangeSubscribers,
	subsystemModelProposalsChangeSubscribers,
} from "../rpc";
import {
	FilesDrilldown,
	drilldownRepoKey,
	type RepoFileCoverage,
} from "../components/FilesDrilldown";
import { ComposedGraphPane } from "./ComposedGraphPane";
import { SubsystemReposMap } from "./SubsystemReposMap";
import { CenteredMessage } from "../ui";

const SUBSYSTEMS_POLL_MS = 10_000;
const COPY_FEEDBACK_MS = 1500;
/** Width of the model-list side panel shown beside the composed graph. */
const COMBINED_LIST_WIDTH = 340;

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
					<Boxes size={26} strokeWidth={1.5} />
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
 * Walkthroughs of a graph with a step site in the given file. Step files
 * are in component-`file` form; repo attribution comes from the step
 * endpoint's purl (host-derived). Purl-less steps match any repo.
 */
function walkthroughsUsingFile(
	graph: SubsystemModelSummary,
	repoKey: string | undefined,
	displayPath: string,
): NonNullable<SubsystemModelSummary["walkthroughs"]> {
	return (graph.walkthroughs ?? []).filter((w) =>
		w.files.some(
			(f) =>
				f.file === displayPath &&
				((f.purl ?? "") === "" ||
					(repoKey ?? "") === "" ||
					purlRepoKey(f.purl) === repoKey),
		),
	);
}

/**
 * Whether a graph references a file — via its component anchors or any
 * walkthrough step site. Same repo-aware matching as the expansion helpers:
 * purl-less entries match any repo. Drives the open-file list filter.
 */
function graphReferencesFile(
	graph: SubsystemModelSummary,
	repoKey: string | undefined,
	displayPath: string,
): boolean {
	const match = (file: string, purl?: string) =>
		file === displayPath &&
		((purl ?? "") === "" ||
			(repoKey ?? "") === "" ||
			purlRepoKey(purl) === repoKey);
	if ((graph.files ?? []).some((f) => match(f.file, f.purl))) return true;
	return (graph.walkthroughs ?? []).some((w) =>
		w.files.some((f) => match(f.file, f.purl)),
	);
}

/**
 * Components declared in the given file (host-derived per file anchor).
 * This is the whole reason a walkthrough-less file is in the model.
 */
function componentsInFile(
	graph: SubsystemModelSummary,
	repoKey: string | undefined,
	displayPath: string,
): Array<{ alias: string; name: string; construct: string; startLine?: number }> {
	const entry = (graph.files ?? []).find(
		(f) =>
			f.file === displayPath &&
			((f.purl ?? "") === "" ||
				(repoKey ?? "") === "" ||
				purlRepoKey(f.purl) === repoKey),
	);
	return entry?.components ?? [];
}

/**
 * First 1-based line the graph references in the given file: the topmost of
 * its component declaration lines and walkthrough step lines. Drives preview
 * focus when a row is clicked while a file is open. Null when the graph has
 * no line data for the file (or doesn't reference it at all).
 */
function firstReferencedLine(
	graph: SubsystemModelSummary,
	repoKey: string | undefined,
	displayPath: string,
): number | null {
	const lines: number[] = [];
	for (const m of componentsInFile(graph, repoKey, displayPath)) {
		if (m.startLine != null && Number.isFinite(m.startLine) && m.startLine > 0) {
			lines.push(m.startLine);
		}
	}
	for (const w of walkthroughsUsingFile(graph, repoKey, displayPath)) {
		for (const f of w.files) {
			if (f.file !== displayPath) continue;
			for (const line of f.lines ?? []) lines.push(line);
		}
	}
	if (lines.length === 0) return null;
	return Math.min(...lines);
}

type SummaryWalkthrough = NonNullable<
	SubsystemModelSummary["walkthroughs"]
>[number];

/** Whether one walkthrough step is sited in the open file (repo-aware). */
function stepReferencesFile(
	step: { file: string; purl?: string },
	openFile: { repoKey: string | undefined; displayPath: string },
): boolean {
	return (
		step.file === openFile.displayPath &&
		((step.purl ?? "") === "" ||
			(openFile.repoKey ?? "") === "" ||
			purlRepoKey(step.purl) === openFile.repoKey)
	);
}

/**
 * One walkthrough row: wrapping title plus a step-bar strip (one segment per
 * step) underneath. Segments sited in the open file light up in primary;
 * the rest stay muted. Clicking opens the graph with this walkthrough selected.
 */
function WalkthroughButton({
	graphTitle,
	walkthrough,
	openFile,
	onOpen,
}: {
	graphTitle: string;
	walkthrough: SummaryWalkthrough;
	openFile: { repoKey: string | undefined; displayPath: string } | null;
	onOpen: () => void;
}) {
	const { theme } = useTheme();
	const inactive = theme.colors.border ?? "#333";
	const [hover, setHover] = useState(false);
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onOpen();
			}}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			aria-label={`Open ${graphTitle} · ${walkthrough.title}`}
			style={{
				border: "none",
				background: hover ? (theme.colors.border ?? "#333") : "transparent",
				padding: "6px 4px",
				borderRadius: 4,
				cursor: "pointer",
				color: "inherit",
				font: "inherit",
				textAlign: "left",
				width: "100%",
				display: "flex",
				flexDirection: "column",
				alignItems: "stretch",
				gap: 4,
				fontSize: theme.fontSizes[1],
				transition: "background 120ms ease",
			}}
		>
			<span
				style={{
					whiteSpace: "normal",
					overflowWrap: "break-word",
					wordBreak: "break-word",
				}}
			>
				{walkthrough.title}
			</span>
			{walkthrough.steps.length > 0 && (
				<span style={{ display: "flex", gap: 3 }} aria-hidden="true">
					{walkthrough.steps.map((s, i) => {
						const active = openFile != null && stepReferencesFile(s, openFile);
						return (
							<span
								key={i}
								style={{
									flex: "1 1 0",
									minWidth: 4,
									height: 4,
									borderRadius: 2,
									background: active ? theme.colors.primary : inactive,
								}}
							/>
						);
					})}
				</span>
			)}
		</button>
	);
}

function SubsystemsTabHeader({
	editedWindow,
	onEditedWindowChange,
	viewMode,
	onViewModeChange,
}: {
	editedWindow?: EditedWindow;
	onEditedWindowChange?: (window: EditedWindow) => void;
	/** List (default) or repo City map. */
	viewMode?: "list" | "map";
	onViewModeChange?: (mode: "list" | "map") => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

	return (
		<div
			style={{
				flexShrink: 0,
				display: "flex",
				alignItems: "stretch",
				justifyContent: "space-between",
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
			<div style={{ display: "flex", alignItems: "stretch", flexShrink: 0 }}>
				{onViewModeChange && (
					<div
						role="group"
						aria-label="Subsystems view"
						style={{ display: "flex", alignItems: "stretch" }}
					>
						{(
							[
								["list", "List"],
								["map", "Map"],
							] as const
						).map(([key, label], i) => {
							const active = (viewMode ?? "list") === key;
							return (
								<button
									key={key}
									type="button"
									title={`${label} view`}
									aria-pressed={active}
									onClick={() => onViewModeChange(key)}
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 4,
										fontSize: theme.fontSizes[0],
										fontWeight: active ? 600 : 400,
										letterSpacing: 0.3,
										textTransform: "uppercase",
										padding: "0 14px",
										border: "none",
										borderLeft:
											i > 0
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
									{key === "list" ? <List size={12} /> : <LayoutGrid size={12} />}
									{label}
								</button>
							);
						})}
					</div>
				)}
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

/**
 * File preview pane — the right-hand `PierreFileView` for a selected file,
 * read through `readSubsystemFile` (purl + repo-relative path). Shared by the
 * list view and the repo City map so both open files the same way.
 *
 * Positioning is left to the caller via `style` (the two views dock it
 * differently); the inner layout is fixed.
 */
function FilePreviewPane({
	file,
	readFile,
	onClose,
	style,
}: {
	file: { repoKey?: string; displayPath: string; focusLine?: number | null };
	readFile: (path: string) => Promise<string>;
	onClose: () => void;
	style?: CSSProperties;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	// Read the file here (not inside PierreFileView) so the pane can slide in
	// immediately showing a loading state instead of an empty body. Keep the
	// latest reader in a ref so the effect only re-runs when the file changes.
	const readRef = useRef(readFile);
	readRef.current = readFile;
	const fileKey = `${file.repoKey ?? ""}\0${file.displayPath}`;
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		setContent(null);
		setError(null);
		(async () => {
			try {
				const text = await readRef.current(file.displayPath);
				if (!cancelled) setContent(text);
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : String(err));
				}
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [fileKey]);
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				minHeight: 0,
				background: theme.colors.background,
				...style,
			}}
		>
			<div
				style={{
					flexShrink: 0,
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "8px 12px",
					borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
				}}
			>
				<span
					style={{
						flex: 1,
						minWidth: 0,
						fontSize: theme.fontSizes[1],
						fontFamily: theme.fonts.monospace,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
					title={file.displayPath}
				>
					{file.displayPath}
				</span>
				<button
					type="button"
					onClick={onClose}
					title="Close preview"
					aria-label="Close file preview"
					style={{
						flexShrink: 0,
						border: "none",
						background: "transparent",
						color: muted,
						cursor: "pointer",
						fontSize: theme.fontSizes[1],
						lineHeight: 1,
						padding: "2px 6px",
						borderRadius: 4,
					}}
				>
					✕
				</button>
			</div>
			<div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
				{error ? (
					<div
						style={{
							padding: 16,
							fontSize: theme.fontSizes[1],
							color: "#e5534b",
							fontFamily: theme.fonts.body,
						}}
					>
						{error}
					</div>
				) : content == null ? (
					<div
						style={{
							height: "100%",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
							color: muted,
							fontSize: theme.fontSizes[1],
							fontFamily: theme.fonts.body,
						}}
					>
						<Loader2 size={16} className="principal-studio-spin" />
						Loading…
					</div>
				) : (
					<PierreFileView
						key={`${fileKey}\0${file.focusLine ?? ""}`}
						filePath={file.displayPath}
						fileName={
							file.displayPath.split("/").pop() ?? file.displayPath
						}
						readFile={async () => content}
						background={theme.colors.background}
						focusLine={file.focusLine ?? undefined}
					/>
				)}
			</div>
		</div>
	);
}

/**
 * Right-docked preview that slides in from / out to the right edge. Keeps the
 * pane mounted through the exit so the transform animates instead of the pane
 * vanishing; `file === null` starts the exit.
 */
function SlideInPreview({
	file,
	readFile,
	onClose,
	width,
	onResizeStart,
}: {
	file: { repoKey?: string; displayPath: string; focusLine?: number | null } | null;
	readFile: (path: string) => Promise<string>;
	onClose: () => void;
	width: number;
	onResizeStart: (e: React.MouseEvent) => void;
}) {
	const { theme } = useTheme();
	const [entered, setEntered] = useState(false);
	const [displayed, setDisplayed] = useState(file);
	useEffect(() => {
		if (file) {
			setDisplayed(file);
			const raf = requestAnimationFrame(() => setEntered(true));
			return () => cancelAnimationFrame(raf);
		}
		setEntered(false);
		const t = setTimeout(() => setDisplayed(null), 220);
		return () => clearTimeout(t);
	}, [file]);
	if (!displayed) return null;
	return (
		<div
			style={{
				position: "absolute",
				top: 0,
				right: 0,
				bottom: 0,
				width,
				maxWidth: "100%",
				zIndex: 4,
				display: "flex",
				transform: entered ? "translateX(0)" : "translateX(100%)",
				transition: "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
				pointerEvents: entered ? "auto" : "none",
			}}
		>
			<div
				onMouseDown={onResizeStart}
				aria-label="Resize file preview"
				title="Drag to resize"
				style={{
					position: "absolute",
					top: 0,
					bottom: 0,
					left: -3,
					width: 3,
					zIndex: 5,
					cursor: "col-resize",
					background: theme.colors.border,
				}}
			/>
			<FilePreviewPane
				file={displayed}
				readFile={readFile}
				onClose={onClose}
				style={{
					flex: 1,
					minWidth: 0,
					borderLeft: `1px solid ${theme.colors.border ?? "#333"}`,
				}}
			/>
		</div>
	);
}

/**
 * Left file panel for the Subsystems tab: a drill-down over every visible
 * subsystem's files, grouped per repo with `buildRepoGroups` — the same
 * primitives the detail graph sidebar uses. Fed by `summary.files` (the host
 * already loads every full model per listing), so no detail fetches are
 * needed. Clicking a repo drills in (and narrows the list to its models);
 * clicking a file highlights its owning graph and expands the walkthroughs
 * using that file; a shared file prefers the selected row's graph when it
 * owns it, else the topmost owner in list order. Clicking a file highlights
 * its graph, expands its walkthroughs, and opens it in the preview pane.
 */
function FilesPanel({
	graphs,
	selectedId,
	width,
	focusedRepo,
	onFocusRepo,
	onHighlightGraph,
	onPreviewFile,
	combinedActive,
	onToggleCombined,
	autoFocusSingleRepo,
	fileCoverageByRepo,
}: {
	graphs: SubsystemModelSummary[];
	selectedId: string | null;
	width: number;
	focusedRepo: string | null;
	onFocusRepo: (repoKey: string) => void;
	/**
	 * Map mode only. Overview rows show this instead of the model count.
	 */
	fileCoverageByRepo?: ReadonlyMap<string, RepoFileCoverage>;
	/** Combined-graph mode toggle — omitted in map mode (the toggle hides). */
	combinedActive?: boolean;
	onToggleCombined?: () => void;
	/** Showcase single-repo: skip the repo overview and go straight to files. */
	autoFocusSingleRepo?: boolean;
	onHighlightGraph: (
		graph: SubsystemModelSummary,
		file: { repoKey: string | undefined; displayPath: string },
	) => void;
	onPreviewFile: (
		graph: SubsystemModelSummary,
		file: { repoKey: string | undefined; displayPath: string },
	) => void;
}) {
	const { theme } = useTheme();
	const byId = useMemo(() => new Map(graphs.map((g) => [g.id, g])), [graphs]);

	const { groups, owners, graphCountByRepo } = useMemo(() => {
		const flat = graphs.flatMap((g) =>
			(g.files ?? []).map((f) => ({ file: f.file, purl: f.purl })),
		);
		const grouped = buildRepoGroups(flat);
		// `${repoKey}\0${file}` → owning graph ids in list order.
		const owners = new Map<string, string[]>();
		for (const g of graphs) {
			for (const f of g.files ?? []) {
				const key = `${purlRepoKey(f.purl) ?? ""}\0${f.file}`;
				const arr = owners.get(key);
				if (arr) {
					if (!arr.includes(g.id)) arr.push(g.id);
				} else {
					owners.set(key, [g.id]);
				}
			}
		}
		// Repos holding files from the most subsystem graphs first.
		const graphCount = (group: RepoGroup): number => {
			const ids = new Set<string>();
			for (const e of group.entries) {
				for (const id of owners.get(
					`${group.repoKey ?? ""}\0${e.file}`,
				) ?? []) {
					ids.add(id);
				}
			}
			return ids.size;
		};
		const groups = [...grouped.groups].sort(
			(a, b) =>
				graphCount(b) - graphCount(a) ||
				b.entries.length - a.entries.length ||
				(a.repo ?? "").localeCompare(b.repo ?? ""),
		);
		const graphCountByRepo = new Map(
			groups.map((g) => [g.repoKey ?? "", graphCount(g)]),
		);
		return { groups, owners, graphCountByRepo };
	}, [graphs]);

	const pickGraph = useCallback(
		(repoKey: string | undefined, displayPath: string) => {
			const ids = owners.get(`${repoKey ?? ""}\0${displayPath}`) ?? [];
			const pick =
				selectedId && ids.includes(selectedId) ? selectedId : ids[0];
			return pick ? byId.get(pick) : undefined;
		},
		[owners, byId, selectedId],
	);

	const onSelectFile = useCallback(
		(repoKey: string | undefined, displayPath: string) => {
			const graph = pickGraph(repoKey, displayPath);
			if (!graph) return;
			onHighlightGraph(graph, { repoKey, displayPath });
			onPreviewFile(graph, { repoKey, displayPath });
		},
		[pickGraph, onHighlightGraph, onPreviewFile],
	);

	return (
		<div
			style={{
				width,
				minWidth: width,
				borderRight: `1px solid ${theme.colors.border ?? "#333"}`,
				background: theme.colors.backgroundSecondary ?? theme.colors.background,
				display: "flex",
				flexDirection: "column",
				minHeight: 0,
			}}
		>
			<div
				style={{
					flex: 1,
					minHeight: 0,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				<FilesDrilldown
					groups={groups}
					graphCountByRepo={graphCountByRepo}
					fileCoverageByRepo={fileCoverageByRepo}
					focusedRepo={focusedRepo}
					onFocusRepo={onFocusRepo}
					onSelectFile={(group, displayPath) =>
						onSelectFile(group.repoKey, displayPath)
					}
					combinedActive={combinedActive}
					onToggleCombined={onToggleCombined}
					autoFocusSingleRepo={autoFocusSingleRepo}
				/>
			</div>
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
	const [error, setError] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [sharingId, setSharingId] = useState<string | null>(null);
	const [editedWindow, setEditedWindow] = useState<EditedWindow>("today");
	const [message, setMessage] = useState<string | null>(null);
	/** Selected row highlight (file-tree clicks land here, no new tab). */
	const [selectedId, setSelectedId] = useState<string | null>(null);
	/** Rows expanded to list all their walkthroughs (row click toggles). */
	const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	/** Rows showing their model description (info button toggles). */
	const [descIds, setDescIds] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	/** Clicked file driving row expansion (walkthroughs using it). */
	const [selectedFile, setSelectedFile] = useState<{
		graphId: string;
		repoKey: string | undefined;
		displayPath: string;
	} | null>(null);
	/** Double-clicked file shown in the right preview pane. */
	const [previewFile, setPreviewFile] = useState<{
		graphId: string;
		repoKey: string | undefined;
		displayPath: string;
		/** 1-based line to highlight (first line the graph references). */
		focusLine?: number | null;
	} | null>(null);
	/** While previewing, the list collapses to a rail; expanding the rail
	 *  overlays the list back over the preview. */
	const [listOverlay, setListOverlay] = useState(false);
	/** Drilled-in repo in the file panel — the list filters to its models. */
	const [focusedRepo, setFocusedRepo] = useState<string | null>(null);
	/** Combined-graph mode: the list swaps for the merged repo graph. */
	const [combinedActive, setCombinedActive] = useState(false);
	/** Repo City map replaces the file tree + model list. */
	const [showMap, setShowMap] = useState(false);
	/** Map mode: repo key → file coverage, filled as each city tree loads. */
	const [fileCoverageByRepo, setFileCoverageByRepo] = useState<
		ReadonlyMap<string, RepoFileCoverage>
	>(() => new Map());
	const onFileCoverage = useCallback(
		(next: ReadonlyMap<string, RepoFileCoverage>) => {
			setFileCoverageByRepo((prev) => {
				if (prev.size !== next.size) return next;
				for (const [key, value] of next) {
					const old = prev.get(key);
					if (
						!old ||
						old.percent !== value.percent ||
						old.referenced !== value.referenced ||
						old.total !== value.total
					) {
						return next;
					}
				}
				return prev;
			});
		},
		[],
	);

	const onFocusRepo = useCallback((repoKey: string) => {
		setFocusedRepo((current) => (current === repoKey ? null : repoKey));
		setCombinedActive(false);
	}, []);

	const onToggleCombined = useCallback(() => {
		setCombinedActive((v) => !v);
	}, []);

	// Panel width (px). Draggable via the resize handle between the panel
	// and the list — same pattern as the detail graph sidebar in
	// `@principal-ai/subsystems-react` (mousedown + document move/up, clamped).
	const [panelWidth, setPanelWidth] = useState(350);
	const [panelDrag, setPanelDrag] = useState(false);
	const panelDragStartX = useRef(0);
	const panelDragStartWidth = useRef(350);
	const panelDragMaxWidth = useRef(600);
	const PANEL_MIN_WIDTH = 200;

	const onPanelResizeStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			panelDragStartX.current = e.clientX;
			panelDragStartWidth.current = panelWidth;
			panelDragMaxWidth.current = Math.max(
				window.innerWidth * 0.6,
				PANEL_MIN_WIDTH,
			);
			setPanelDrag(true);
		},
		[panelWidth],
	);

	useEffect(() => {
		if (!panelDrag) return;
		const onMove = (e: MouseEvent) => {
			const delta = e.clientX - panelDragStartX.current;
			setPanelWidth(
				Math.min(
					Math.max(panelDragStartWidth.current + delta, PANEL_MIN_WIDTH),
					panelDragMaxWidth.current,
				),
			);
		};
		const onUp = () => setPanelDrag(false);
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, [panelDrag]);

	// Preview pane width (px) — docked right in map mode, draggable by its
	// left edge. Starts wide and clamps so the map keeps some room.
	const [previewWidth, setPreviewWidth] = useState(800);
	const [previewDrag, setPreviewDrag] = useState(false);
	const previewDragStartX = useRef(0);
	const previewDragStartWidth = useRef(800);
	const PREVIEW_MIN_WIDTH = 320;

	const onPreviewResizeStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			previewDragStartX.current = e.clientX;
			previewDragStartWidth.current = previewWidth;
			setPreviewDrag(true);
		},
		[previewWidth],
	);

	useEffect(() => {
		if (!previewDrag) return;
		const onMove = (e: MouseEvent) => {
			// The handle sits on the pane's left edge — dragging left widens it.
			const delta = previewDragStartX.current - e.clientX;
			setPreviewWidth(
				Math.min(
					Math.max(previewDragStartWidth.current + delta, PREVIEW_MIN_WIDTH),
					Math.max(window.innerWidth - 480, PREVIEW_MIN_WIDTH),
				),
			);
		};
		const onUp = () => setPreviewDrag(false);
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, [previewDrag]);

	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	/** Defers row expand so a double-click can open instead. */
	const rowClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

	useEffect(
		() => () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			if (rowClickTimerRef.current) clearTimeout(rowClickTimerRef.current);
		},
		[],
	);

	useEffect(() => {
		if (!previewFile) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setPreviewFile(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [previewFile]);

	const refresh = useCallback(async () => {
		try {
			const subResult = await electrobun.rpc!.request.listSubsystemModels({});
			// Keep the previous array identity when nothing changed — otherwise
			// every 10s poll rebuilds the file-panel groups and the Pierre
			// tree sees a new `files` prop, calling `resetPaths` and wiping
			// folder expansion.
			setGraphs((prev) =>
				prev !== null &&
				JSON.stringify(prev) === JSON.stringify(subResult.graphs)
					? prev
					: subResult.graphs,
			);
			setError(null);
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
		const onProposals = (
			_payload: StudioMessages["subsystemModelProposalsChanged"],
		) => {
			void refresh();
		};
		graphifyChangeSubscribers.add(onGraphify);
		subsystemModelChangeSubscribers.add(onSubsystem);
		subsystemModelProposalsChangeSubscribers.add(onProposals);
		return () => {
			graphifyChangeSubscribers.delete(onGraphify);
			subsystemModelChangeSubscribers.delete(onSubsystem);
			subsystemModelProposalsChangeSubscribers.delete(onProposals);
		};
	}, [refresh]);

	const onOpen = useCallback(
		async (graph: SubsystemModelSummary, walkthroughId?: string) => {
			setSelectedId(graph.id);
			await electrobun.rpc!.request.openSubsystemModel({
				graphId: graph.id,
				...(walkthroughId ? { walkthroughId } : {}),
			});
		},
		[],
	);

	/** Map-mode opener: the repo map only knows model ids. */
	const onOpenModelById = useCallback(
		(graphId: string, walkthroughId?: string) => {
			const graph = graphs?.find((g) => g.id === graphId);
			if (graph) {
				void onOpen(graph, walkthroughId);
				return;
			}
			void electrobun.rpc!.request.openSubsystemModel({
				graphId,
				...(walkthroughId ? { walkthroughId } : {}),
			});
		},
		[graphs, onOpen],
	);

	/** Map mode: a file click just selects its owning graph (no preview pane). */
	const onMapHighlightGraph = useCallback(
		(graph: SubsystemModelSummary) => setSelectedId(graph.id),
		[],
	);
	const onMapPreviewFile = useCallback(() => {}, []);

	/** Map mode: a city building click opens the file in the shared preview. */
	const onOpenMapFile = useCallback(
		(file: { repoKey: string | undefined; displayPath: string }) => {
			const graph = graphs?.find((g) =>
				graphReferencesFile(g, file.repoKey, file.displayPath),
			);
			setPreviewFile({
				graphId: graph?.id ?? "",
				repoKey: file.repoKey,
				displayPath: file.displayPath,
				focusLine: graph
					? firstReferencedLine(graph, file.repoKey, file.displayPath)
					: null,
			});
		},
		[graphs],
	);

	/** Row click: expand/collapse its walkthrough list (no new tab). When a
	 *  file is open and the row is being expanded, focus the first line this
	 *  graph references in the open file. */
	const onToggleExpand = useCallback(
		(graph: SubsystemModelSummary) => {
			setSelectedId(graph.id);
			setSelectedFile((current) =>
				current?.graphId === graph.id ? null : current,
			);
			const isOpen =
				expandedIds.has(graph.id) || selectedFile?.graphId === graph.id;
			if (previewFile && !isOpen) {
				const line = firstReferencedLine(
					graph,
					previewFile.repoKey,
					previewFile.displayPath,
				);
				if (line != null) {
					setPreviewFile((current) =>
						current ? { ...current, focusLine: line } : current,
					);
				}
			}
			setExpandedIds((current) => {
				const next = new Set(current);
				if (next.has(graph.id)) next.delete(graph.id);
				else next.add(graph.id);
				return next;
			});
		},
		[expandedIds, selectedFile, previewFile],
	);

	/**
	 * Single click expands (deferred so a double-click can open instead);
	 * double click opens the graph in a tab.
	 */
	const onRowClick = useCallback(
		(graph: SubsystemModelSummary) => {
			if (rowClickTimerRef.current) clearTimeout(rowClickTimerRef.current);
			rowClickTimerRef.current = setTimeout(() => {
				rowClickTimerRef.current = null;
				onToggleExpand(graph);
			}, 250);
		},
		[onToggleExpand],
	);

	const onRowDoubleClick = useCallback(
		(graph: SubsystemModelSummary) => {
			if (rowClickTimerRef.current) {
				clearTimeout(rowClickTimerRef.current);
				rowClickTimerRef.current = null;
			}
			void onOpen(graph);
		},
		[onOpen],
	);

	/** File-tree click: highlight the owning row in place (no new tab),
	 *  expand the walkthroughs using that file, and open the preview pane.
	 *  Re-clicking the same file collapses the expansion (preview stays). */
	const onHighlightGraph = useCallback(
		(
			graph: SubsystemModelSummary,
			file: { repoKey: string | undefined; displayPath: string },
		) => {
			setSelectedId(graph.id);
			setSelectedFile((current) =>
				current &&
				current.graphId === graph.id &&
				(current.repoKey ?? "") === (file.repoKey ?? "") &&
				current.displayPath === file.displayPath
					? null
					: { graphId: graph.id, ...file },
			);
			requestAnimationFrame(() => {
				document
					.querySelector(`[data-subsystem-row="${CSS.escape(graph.id)}"]`)
					?.scrollIntoView({ block: "nearest", behavior: "smooth" });
			});
		},
		[],
	);

	/** File-tree click: open the file in the preview pane, focused on the
	 *  first line the owning graph references in it. */
	const onPreviewFile = useCallback(
		(
			graph: SubsystemModelSummary,
			file: { repoKey: string | undefined; displayPath: string },
		) => {
			setSelectedId(graph.id);
			setListOverlay(true);
			setPreviewFile({
				graphId: graph.id,
				...file,
				focusLine: firstReferencedLine(graph, file.repoKey, file.displayPath),
			});
		},
		[],
	);

	const readPreviewFile = useCallback(
		async (_path: string): Promise<string> => {
			if (!previewFile) throw new Error("No file selected");
			const res = await electrobun.rpc!.request.readSubsystemFile({
				purl: previewFile.repoKey,
				file: previewFile.displayPath,
			});
			if (!res.ok || res.content == null) {
				throw new Error(res.error ?? "Failed to read file");
			}
			return res.content;
		},
		[previewFile],
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

	const onShareGist = useCallback(
		async (e: React.MouseEvent, graph: SubsystemModelSummary) => {
			e.stopPropagation();
			setSharingId(graph.id);
			setMessage(null);
			setError(null);
			try {
				const result = await electrobun.rpc!.request.shareSubsystemModelAsGist({
					graphId: graph.id,
				});
				if (!result.ok) {
					setError(result.error ?? "Failed to share as gist");
					return;
				}
				const url = result.viewUrl ?? result.gistUrl;
				if (url) {
					try {
						await navigator.clipboard.writeText(url);
					} catch {
						// clipboard may be denied
					}
				}
				setMessage(
					result.created
						? `Shared as gist — link copied${url ? `: ${url}` : ""}`
						: `Gist updated — link copied${url ? `: ${url}` : ""}`,
				);
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to share as gist");
			} finally {
				setSharingId(null);
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
				setExpandedIds((current) => {
					if (!current.has(graph.id)) return current;
					const next = new Set(current);
					next.delete(graph.id);
					return next;
				});
				setSelectedFile((current) =>
					current?.graphId === graph.id ? null : current,
				);
				setPreviewFile((current) =>
					current?.graphId === graph.id ? null : current,
				);
				setSelectedId((current) => (current === graph.id ? null : current));
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[confirmId],
	);

	if (error && graphs === null) {
		return (
			<SubsystemsTabShell>
				<SubsystemsTabBody>
					<CenteredMessage title="Could not load subsystem graphs" detail={error} />
				</SubsystemsTabBody>
			</SubsystemsTabShell>
		);
	}
	if (graphs === null) {
		return (
			<SubsystemsTabShell>
				<SubsystemsTabBody>
					<CenteredMessage title="Loading subsystem graphs…" />
				</SubsystemsTabBody>
			</SubsystemsTabShell>
		);
	}
	if (graphs.length === 0) {
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
	// Showcase scope: an explicit, ordered id set. When present it wins over
	// repo drilldown and recency hiding — the agent chose the set and its order.
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
	const visibleGraphs = scopeOrder
		? graphs.filter((g) => scopeRank!.has(g.id))
		: focusedRepo
			? graphs.filter((g) =>
					(g.files ?? []).some(
						(f) =>
							focusedRepo ===
							drilldownRepoKey({ repoKey: purlRepoKey(f.purl) }),
					),
				)
			: graphs;
	// An open preview narrows the list to the models referencing that file.
	const fileVisibleGraphs = previewFile
		? visibleGraphs.filter((g) =>
				graphReferencesFile(g, previewFile.repoKey, previewFile.displayPath),
			)
		: visibleGraphs;
	// The edited-at window applies identically to both chains; only the
	// open-file narrowing differs (list vs panel). Order stays last-opened,
	// newest first. Showcase scope skips the window.
	const applyListFilters = (base: SubsystemModelSummary[]) => {
		const windowed =
			scopeOrder || editedWindow === "all" ? base : base.filter(inEditedWindow);
		return orderByScope(
			[...windowed].sort((a, b) => openedSortTime(b) - openedSortTime(a)),
		);
	};
	const windowedGraphs =
		scopeOrder || editedWindow === "all"
			? fileVisibleGraphs
			: fileVisibleGraphs.filter(inEditedWindow);
	const sortedGraphs = applyListFilters(fileVisibleGraphs);
	// The file panel ignores the open-file narrowing so the tree stays stable
	// while previewing; it still follows the recency filter.
	const panelGraphs = applyListFilters(visibleGraphs);
	/** The composed graph is showing, with the model list docked right. */
	const combinedPane = combinedActive && focusedRepo != null;
	/**
	 * Model ids the composed graph is built from. Omitting them makes the host
	 * compose every model touching the repo, so the recency window would filter
	 * the list but not the graph. Uses the panel list — recency applied, open-file
	 * narrowing ignored — so previewing a file does not recompose.
	 */
	const composedModelIds = scopeOrder ?? panelGraphs.map((g) => g.id);

	// The model list is rendered either as the main pane or as the
	// composed-graph side panel — one JSX tree, two placements.
	const outsideWindow = fileVisibleGraphs.length - windowedGraphs.length;
	const widenTo =
		!previewFile && !scopeOrder ? widerEditedWindow(editedWindow) : null;
	const emptyCopy = previewFile && fileVisibleGraphs.length === 0
		? {
				title: "No models for this file",
				detail: previewFile.displayPath,
			}
		: focusedRepo && editedWindow === "all"
			? {
					title: "No models in this repo",
					detail: "None of the subsystem models touch the repo you have open.",
				}
			: editedWindow === "today"
				? { title: "Nothing edited today" }
				: editedWindow === "yesterday"
					? { title: "Nothing edited yesterday" }
					: editedWindow === "week"
						? { title: "Nothing edited this week" }
						: { title: "No subsystem models" };
	const widenLabel = EDITED_WINDOWS.find((w) => w.key === widenTo)?.label;
	const emptyAction =
		widenTo && outsideWindow > 0 && widenLabel
			? {
					label: `Show ${widenLabel.toLowerCase()}`,
					onClick: () => setEditedWindow(widenTo),
				}
			: focusedRepo && !previewFile
				? {
						label: "All repos",
						onClick: () => onFocusRepo(focusedRepo),
					}
				: undefined;
	const modelList = (
windowedGraphs.length === 0 ? (
				<SubsystemEmptyState
					title={emptyCopy.title}
					detail={emptyCopy.detail}
					action={emptyAction}
				/>
			) : (
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				{sortedGraphs.map((graph) => {
					const isExpanded = selectedFile?.graphId === graph.id;
					const isRowExpanded = expandedIds.has(graph.id) && !isExpanded;
					const isOpen = isExpanded || expandedIds.has(graph.id);
					const fileWalkthroughs =
						isExpanded && selectedFile
							? walkthroughsUsingFile(
									graph,
									selectedFile.repoKey,
									selectedFile.displayPath,
								)
							: [];
					const fileComponents =
						isExpanded && selectedFile && fileWalkthroughs.length === 0
							? componentsInFile(
									graph,
									selectedFile.repoKey,
									selectedFile.displayPath,
								)
							: [];

					return (
						<div
							key={graph.id}
							data-subsystem-row={graph.id}
							onClick={() => onRowClick(graph)}
							onDoubleClick={() => onRowDoubleClick(graph)}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = theme.colors.textMuted ?? "#555";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor =
									theme.colors.border ?? "#333";
							}}
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "stretch",
								gap: isOpen || descIds.has(graph.id) ? 8 : 0,
								padding: "8px 12px",
								borderRadius: 4,
								border: `1px solid ${theme.colors.border ?? "#333"}`,
								background: theme.colors.backgroundSecondary ?? "transparent",
								cursor: "pointer",
								fontSize: theme.fontSizes[2],
								transition: "border-color 0.15s ease",
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									flexWrap: "wrap",
									gap: 8,
									rowGap: 8,
								}}
							>
							<div style={{ flex: "1 1 180px", minWidth: 0 }}>
								<div
									style={{
										whiteSpace: "normal",
										overflowWrap: "break-word",
										wordBreak: "break-word",
									}}
								>
									{graph.title}
								</div>
							</div>
							{graph.description && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										setDescIds((current) => {
											const next = new Set(current);
											if (next.has(graph.id)) next.delete(graph.id);
											else next.add(graph.id);
											return next;
										});
									}}
									title={
										descIds.has(graph.id)
											? "Hide description"
											: "Show description"
									}
									aria-label={`Show description for ${graph.title}`}
									aria-pressed={descIds.has(graph.id)}
									style={{
										flexShrink: 0,
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										width: 22,
										height: 22,
										padding: 0,
										border: "none",
										borderRadius: 4,
										background: descIds.has(graph.id)
											? `${theme.colors.primary}22`
											: "transparent",
										color: descIds.has(graph.id)
											? theme.colors.primary
											: muted,
										cursor: "pointer",
									}}
								>
									<Info size={13} />
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
								onClick={(e) => void onShareGist(e, graph)}
								disabled={sharingId === graph.id}
								title={
									graph.gist
										? `Update gist ${graph.gist.id}`
										: "Share as a public GitHub gist"
								}
								aria-label={
									graph.gist
										? `Update gist for ${graph.title}`
										: `Share ${graph.title} as gist`
								}
								style={{
									flexShrink: 0,
									display: "inline-flex",
									alignItems: "center",
									gap: 4,
									padding: "4px 8px",
									borderRadius: 4,
									border: `1px solid ${theme.colors.border ?? "#333"}`,
									background: "transparent",
									color: muted,
									cursor: sharingId === graph.id ? "default" : "pointer",
									fontSize: theme.fontSizes[0],
									fontFamily: theme.fonts.body,
									opacity: sharingId === graph.id ? 0.7 : 1,
								}}
							>
								<Share2 size={12} />
								{sharingId === graph.id
									? "Sharing…"
									: graph.gist
										? "Update gist"
										: "Gist"}
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
							{descIds.has(graph.id) && graph.description && (
								<div
									onClick={(e) => e.stopPropagation()}
									style={{
										fontSize: theme.fontSizes[1],
									}}
								>
									<DocumentView
										content={graph.description}
										theme={theme}
										transparentBackground
										maxWidth="100%"
									/>
								</div>
							)}
							{isExpanded && selectedFile && (
								<div
									onClick={(e) => e.stopPropagation()}
									style={{
										borderTop: `1px solid ${theme.colors.border ?? "#333"}`,
										paddingTop: 6,
										display: "flex",
										flexDirection: "column",
										gap: 2,
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											fontSize: theme.fontSizes[0],
											color: muted,
										}}
									>
										{fileWalkthroughs.length > 0 ? (
											<RouteIcon size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
										) : (
											<ComponentIcon size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
										)}
										{fileWalkthroughs.length > 0 ? `Walkthroughs` : `Component`}
									</div>
									{fileWalkthroughs.length === 0 && fileComponents.length === 0 ? (
										<div
											style={{
												fontSize: theme.fontSizes[1],
												color: muted,
											}}
										>
											No walkthroughs use this file.
										</div>
									) : fileWalkthroughs.length > 0 ? (
										fileWalkthroughs.map((w) => (
											<WalkthroughButton
												key={w.id}
												graphTitle={graph.title}
												walkthrough={w}
												openFile={previewFile}
												onOpen={() => void onOpen(graph, w.id)}
											/>
										))
									) : (
										fileComponents.map((m) => (
											<button
												key={m.alias}
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													setSelectedId(graph.id);
													setListOverlay(true);
													setPreviewFile({
														graphId: graph.id,
														repoKey: selectedFile.repoKey,
														displayPath: selectedFile.displayPath,
														focusLine: m.startLine ?? null,
													});
												}}
												onMouseEnter={(e) => {
													e.currentTarget.style.background =
														theme.colors.border ?? "#333";
												}}
												onMouseLeave={(e) => {
													e.currentTarget.style.background = "transparent";
												}}
												style={{
													border: "none",
													background: "transparent",
													padding: "2px 4px",
													cursor: "pointer",
													color: "inherit",
													font: "inherit",
													textAlign: "left",
													fontSize: theme.fontSizes[1],
													whiteSpace: "nowrap",
													overflow: "hidden",
													textOverflow: "ellipsis",
													borderRadius: 4,
												}}
											>
												{m.name}
												<span style={{ color: muted }}> · {m.construct}</span>
											</button>
										))
									)}
								</div>
							)}
							{isRowExpanded && (
								<div
									onClick={(e) => e.stopPropagation()}
									style={{
										borderTop: `1px solid ${theme.colors.border ?? "#333"}`,
										paddingTop: 6,
										display: "flex",
										flexDirection: "column",
										gap: 2,
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											fontSize: theme.fontSizes[0],
											color: muted,
										}}
									>
										<RouteIcon size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
										Walkthroughs
									</div>
									{(graph.walkthroughs ?? []).length === 0 ? (
										<div
											style={{
												fontSize: theme.fontSizes[1],
												color: muted,
											}}
										>
											No walkthroughs yet.
										</div>
									) : (
										(graph.walkthroughs ?? []).map((w) => (
											<WalkthroughButton
												key={w.id}
												graphTitle={graph.title}
												walkthrough={w}
												openFile={previewFile}
												onOpen={() => void onOpen(graph, w.id)}
											/>
										))
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>
			)
	);

	return (
		<SubsystemsTabShell>
			{!scope && (
				<SubsystemsTabHeader
				editedWindow={editedWindow}
				onEditedWindowChange={setEditedWindow}
				viewMode={showMap ? "map" : "list"}
				onViewModeChange={(mode) => {
					setShowMap(mode === "map");
					if (mode === "map") setFileCoverageByRepo(new Map());
				}}
			/>
			)}
			{panelGraphs.length === 0 ? (
				<SubsystemsTabBody>
					<SubsystemEmptyState
						title={emptyCopy.title}
						detail={emptyCopy.detail}
						action={emptyAction}
					/>
				</SubsystemsTabBody>
			) : showMap && !scope ? (
				<SubsystemsTabBody>
					<div
						style={{
							flex: 1,
							minHeight: 0,
							display: "flex",
							flexDirection: "row",
							position: "relative",
							userSelect: panelDrag ? "none" : undefined,
						}}
					>
						{/* Reuse the tab's existing repo list/drilldown as the
						    map's repo-selection chrome (same `focusedRepo`). */}
						<FilesPanel
							graphs={panelGraphs}
							selectedId={selectedId}
							width={panelWidth}
							focusedRepo={focusedRepo}
							onFocusRepo={onFocusRepo}
							onHighlightGraph={onMapHighlightGraph}
							onPreviewFile={onMapPreviewFile}
							autoFocusSingleRepo={false}
							fileCoverageByRepo={fileCoverageByRepo}
						/>
						<div
							onMouseDown={onPanelResizeStart}
							aria-label="Resize files panel"
							title="Drag to resize"
							style={{
								width: 3,
								flexShrink: 0,
								cursor: "col-resize",
								background: theme.colors.border,
								transition: "background 120ms ease",
								zIndex: 1,
							}}
						/>
						<div
							style={{
								flex: 1,
								minWidth: 0,
								minHeight: 0,
								display: "flex",
								position: "relative",
								overflow: "hidden",
								userSelect: previewDrag ? "none" : undefined,
							}}
						>
							<SubsystemReposMap
								graphs={panelGraphs}
								onOpenModel={onOpenModelById}
								onFileCoverage={onFileCoverage}
								selectedRepoKey={focusedRepo}
								onSelectRepo={setFocusedRepo}
								onOpenFile={onOpenMapFile}
							/>
							<SlideInPreview
								file={previewFile}
								readFile={readPreviewFile}
								onClose={() => setPreviewFile(null)}
								width={previewWidth}
								onResizeStart={onPreviewResizeStart}
							/>
						</div>
					</div>
				</SubsystemsTabBody>
			) : (
			<SubsystemsTabBody>
				<div
					style={{
						flex: 1,
						minHeight: 0,
						display: "flex",
						flexDirection: "row",
						position: "relative",
						userSelect: panelDrag ? "none" : undefined,
					}}
				>
					<FilesPanel
						graphs={panelGraphs}
						selectedId={selectedId}
						width={panelWidth}
						focusedRepo={focusedRepo}
						onFocusRepo={onFocusRepo}
						onHighlightGraph={onHighlightGraph}
						onPreviewFile={onPreviewFile}
						combinedActive={combinedActive}
						onToggleCombined={onToggleCombined}
						autoFocusSingleRepo={scope != null}
					/>
					<div
						onMouseDown={onPanelResizeStart}
						aria-label="Resize files panel"
						title="Drag to resize"
						style={{
							width: 3,
							flexShrink: 0,
							cursor: "col-resize",
							background: theme.colors.border,
							transition: "background 120ms ease",
							zIndex: 1,
						}}
					/>
					<div
						style={{
							flex: 1,
							minWidth: 0,
							minHeight: 0,
							overflowY: "auto",
							// The composed graph is a full-bleed canvas; the model
							// list keeps the pane's inset.
							padding: combinedPane ? 0 : "16px 24px",
							// In composed mode the list is a persistent right
							// panel, so the preview's dock-to-rail behavior is off.
							...(previewFile && listOverlay && !combinedPane
								? {
										position: "absolute",
										top: 0,
										bottom: 0,
										right: 0,
										width: 400,
										zIndex: 4,
										flex: "none",
										background: theme.colors.background,
										borderLeft: `1px solid ${theme.colors.border ?? "#333"}`,
									}
								: null),
						}}
					>
			{previewFile && listOverlay && !combinedPane && (
				<div
					style={{
						flexShrink: 0,
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "0 0 8px",
					}}
				>
					<span
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							fontSize: theme.fontSizes[0],
							color: muted,
							textTransform: "uppercase",
							letterSpacing: 0.3,
						}}
					>
						<Boxes size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
						Subsystems
					</span>
					<span style={{ flex: 1 }} />
					<button
						type="button"
						onClick={() => setListOverlay(false)}
						title="Collapse list to rail"
						aria-label="Collapse subsystem list"
						style={{
							flexShrink: 0,
							border: "none",
							background: "transparent",
							color: muted,
							cursor: "pointer",
							fontSize: theme.fontSizes[1],
							lineHeight: 1,
							padding: "2px 6px",
							borderRadius: 4,
						}}
					>
						»
					</button>
				</div>
			)}
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
			{combinedActive && focusedRepo ? (
				<div style={{ height: "100%", display: "flex", flexDirection: "row" }}>
					<div style={{ flex: 1, minWidth: 0, height: "100%" }}>
						<ComposedGraphPane
							repoKey={focusedRepo}
							graphs={graphs}
							modelIds={composedModelIds}
							onPreviewFile={onPreviewFile}
						/>
					</div>
					<div
						style={{
							width: COMBINED_LIST_WIDTH,
							flexShrink: 0,
							height: "100%",
							boxSizing: "border-box",
							overflowY: "auto",
							borderLeft: `1px solid ${theme.colors.border ?? "#333"}`,
							background:
								theme.colors.backgroundSecondary ?? theme.colors.background,
							padding: "12px",
						}}
					>
						{modelList}
					</div>
				</div>
			) : (
				modelList
			)}
				</div>
				{previewFile && (
					<FilePreviewPane
						file={previewFile}
						readFile={readPreviewFile}
						onClose={() => setPreviewFile(null)}
						style={{
							position: "absolute",
							top: 0,
							bottom: 0,
							left: panelWidth + 3,
							// The open list docks right — end the preview at its
							// edge so the header (and its ✕) is never covered.
							// Composed mode keeps the list panel visible instead.
							right: combinedPane
								? COMBINED_LIST_WIDTH
								: listOverlay
									? 400
									: 0,
							zIndex: 2,
							borderLeft: `1px solid ${theme.colors.border ?? "#333"}`,
						}}
					/>
				)}
				{previewFile && !listOverlay && !combinedPane && (
					<button
						type="button"
						onClick={() => setListOverlay(true)}
						title="Show subsystem list"
						aria-label="Show subsystem list"
						style={{
							position: "absolute",
							top: 0,
							bottom: 0,
							right: 0,
							width: 28,
							zIndex: 3,
							border: "none",
							borderLeft: `1px solid ${theme.colors.border ?? "#333"}`,
							background:
								theme.colors.backgroundSecondary ?? theme.colors.background,
							color: muted,
							cursor: "pointer",
							fontSize: theme.fontSizes[1],
						}}
					>
						«
					</button>
				)}
				</div>
			</SubsystemsTabBody>
			)}
		</SubsystemsTabShell>
	);
}
