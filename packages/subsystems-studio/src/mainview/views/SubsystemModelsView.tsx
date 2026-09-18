/**
 * SubsystemModelsView — the "Subsystems" tab: a list of stored subsystem
 * graphs (~/.principal/subsystem-models) with an aggregate file tree on the
 * left (union of `summary.files` across the listed graphs, grouped per repo).
 * Clicking a row opens the graph in a subsystem-model tab via the host;
 * clicking a file opens its owning graph.
 *
 * The list polls every 10s so graphs posted via the HTTP API appear without
 * reopening the viewer. Host-side regular audit (Settings) refreshes
 * verification badges; click a badge for the last report. Pending agent
 * proposals show a separate badge to review before/after + why.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bot, Check, Copy, Loader2, Share2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	buildRepoGroups,
	purlRepoKey,
	repoAvatarUrl,
	SubsystemFileTree,
	type RepoGroup,
} from "@principal-ai/subsystems-react";
import type {
	RegularAuditStatus,
	SubsystemModelAuditReport,
	SubsystemModelSummary,
	StudioMessages,
} from "../../shared/contract";
import {
	electrobun,
	graphifyChangeSubscribers,
	regularAuditChangeSubscribers,
	subsystemModelChangeSubscribers,
	subsystemModelMaintainChangeSubscribers,
	subsystemModelProposalsChangeSubscribers,
} from "../rpc";
import {
	AuditResultsModal,
	type AuditModalState,
} from "../components/AuditResultsModal";
import { ProposalsModal } from "../components/ProposalsModal";
import { MaintainModelPickerModal } from "../components/MaintainModelPickerModal";
import { CenteredMessage, lastLoadedLabel, relativeTime } from "../ui";

const SUBSYSTEMS_POLL_MS = 10_000;
const COPY_FEEDBACK_MS = 1500;
/** Default view hides graphs not edited in the last day. */
const RECENT_MS = 24 * 60 * 60 * 1000;

type ListAuditEntry =
	| { status: "auditing" }
	| {
			status: "fully_verified";
			checkedAt: string;
			stale?: boolean;
			issueCount: number;
			report?: SubsystemModelAuditReport;
	  }
	| {
			status: "partially_verified";
			checkedAt: string;
			stale?: boolean;
			issueCount: number;
			report?: SubsystemModelAuditReport;
	  }
	| {
			status: "issues";
			checkedAt: string;
			stale?: boolean;
			issueCount: number;
			report?: SubsystemModelAuditReport;
	  }
	| { status: "error"; error: string; title?: string };

function entryFromLastAudit(
	lastAudit: NonNullable<SubsystemModelSummary["lastAudit"]>,
	existing?: ListAuditEntry,
): Extract<
	ListAuditEntry,
	{ status: "fully_verified" | "partially_verified" | "issues" }
> {
	const status =
		lastAudit.verdict ??
		(lastAudit.needsUpdate || lastAudit.issueCount > 0
			? "issues"
			: "fully_verified");
	const keepReport =
		existing &&
		(existing.status === "fully_verified" ||
			existing.status === "partially_verified" ||
			existing.status === "issues") &&
		existing.report &&
		existing.checkedAt === lastAudit.checkedAt
			? existing.report
			: undefined;
	return {
		status,
		checkedAt: lastAudit.checkedAt,
		stale: lastAudit.stale,
		issueCount: lastAudit.issueCount,
		report: keepReport,
	};
}

/** Map list audit status → Maintain mode (null = disabled). */
function maintainModeFromAuditEntry(
	entry: ListAuditEntry | undefined,
): "issues" | "gaps" | null {
	if (!entry) return null;
	if (entry.status === "issues") return "issues";
	if (entry.status === "partially_verified") return "gaps";
	return null;
}

function maintainButtonCopy(mode: "issues" | "gaps" | null): {
	label: string;
	title: string;
	agentName: string;
} {
	if (mode === "issues") {
		return {
			label: "Run maintenance",
			title:
				"Run maintenance — host picks construct / boundary / topology fixer by layer",
			agentName: "Maintainer",
		};
	}
	if (mode === "gaps") {
		return {
			label: "Run maintenance",
			title:
				"Run maintenance — host picks construct / boundary / topology gap-filler by layer",
			agentName: "Maintainer",
		};
	}
	return {
		label: "Run maintenance",
		title: "Audit first — maintenance runs when verification failed or partially verified",
		agentName: "Maintainer",
	};
}

function agentDisplayName(
	agent:
		| "issue-fixer"
		| "gap-filler"
		| "topology-fixer"
		| "topology-gap-filler"
		| "boundary-gap-filler"
		| undefined,
): string {
	if (agent === "issue-fixer") return "Issue fixer";
	if (agent === "gap-filler") return "Gap filler";
	if (agent === "topology-fixer") return "Topology fixer";
	if (agent === "topology-gap-filler") return "Topology gap filler";
	if (agent === "boundary-gap-filler") return "Boundary gap filler";
	return "Maintainer";
}

function listAuditBadge(
	entry: ListAuditEntry,
	colors: {
		success?: string;
		error?: string;
		warning?: string;
		textSecondary?: string;
	},
	muted: string,
): {
	label: string;
	color: string;
	title: string;
	clickable: boolean;
	spinning: boolean;
} {
	if (entry.status === "auditing") {
		return {
			label: "Auditing…",
			color: colors.textSecondary ?? muted,
			title: "Audit in progress",
			clickable: false,
			spinning: true,
		};
	}
	if (entry.status === "error") {
		return {
			label: "Audit failed",
			color: colors.error ?? "#e5534b",
			title: entry.error,
			clickable: true,
			spinning: false,
		};
	}
	const n = entry.issueCount;
	const baseLabel =
		entry.status === "fully_verified"
			? "Fully verified"
			: entry.status === "partially_verified"
				? "Partially verified"
				: n === 1
					? "Verification failed · 1 issue"
					: `Verification failed · ${n} issues`;
	const label = entry.stale ? `Stale · ${baseLabel}` : baseLabel;
	const color = entry.stale
		? (colors.warning ?? "#d4a017")
		: entry.status === "fully_verified"
			? (colors.success ?? "#2da44e")
			: entry.status === "partially_verified"
				? (colors.textSecondary ?? muted)
				: (colors.error ?? "#e5534b");
	const when = new Date(entry.checkedAt).toLocaleString();
	return {
		label,
		color,
		title: entry.stale
			? `Audit outdated (inputs changed) · ${when} — click for last report; regular audit will refresh`
			: entry.status === "fully_verified"
				? `All applicable checks confirmed · ${when} — click for report`
				: entry.status === "partially_verified"
					? `No failures, but some checks still need follow-up · ${when} — click for report`
					: `Verification failed (${n === 1 ? "1 issue" : `${n} issues`}) · ${when} — click for report`,
		clickable: true,
		spinning: false,
	};
}

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

function formatRegularAuditCountdown(status: RegularAuditStatus, nowMs: number): string {
	if (!status.enabled) return "";
	if (status.running) return "Auditing…";
	if (!status.nextAuditAt) return "Next audit soon…";
	const ms = new Date(status.nextAuditAt).getTime() - nowMs;
	if (!Number.isFinite(ms) || ms <= 0) return "Auditing…";
	const totalSec = Math.ceil(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) {
		return `Next audit in ${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}
	return `Next audit in ${m}:${String(s).padStart(2, "0")}`;
}

function SubsystemsTabHeader({
	lastLoadedAt,
	sortBy,
	onSortChange,
	showAll,
	hiddenStaleCount,
	onToggleShowAll,
	issuesOnly,
	onToggleIssuesOnly,
	regularAudit,
	searchQuery,
	onSearchChange,
}: {
	lastLoadedAt: number | null;
	sortBy: SubsystemSortKey;
	onSortChange: (key: SubsystemSortKey) => void;
	showAll?: boolean;
	hiddenStaleCount?: number;
	onToggleShowAll?: () => void;
	issuesOnly?: boolean;
	onToggleIssuesOnly?: () => void;
	regularAudit?: RegularAuditStatus | null;
	searchQuery?: string;
	onSearchChange?: (query: string) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [, bump] = useState(0);

	useEffect(() => {
		if (lastLoadedAt == null && !regularAudit?.enabled) return;
		const id = setInterval(() => bump((n) => n + 1), 1_000);
		return () => clearInterval(id);
	}, [lastLoadedAt, regularAudit?.enabled]);

	const auditLabel =
		regularAudit?.enabled === true
			? formatRegularAuditCountdown(regularAudit, Date.now())
			: null;

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
			<div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
				{onSearchChange && (
					<input
						type="search"
						value={searchQuery ?? ""}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Filter subsystems…"
						aria-label="Filter subsystem models"
						style={{
							fontSize: theme.fontSizes[1],
							fontFamily: theme.fonts.body,
							color: theme.colors.text,
							background: theme.colors.background,
							border: `1px solid ${theme.colors.border ?? "#333"}`,
							borderRadius: 6,
							padding: "4px 10px",
							width: 200,
							outline: "none",
							flexShrink: 0,
						}}
					/>
				)}
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
				{(onToggleShowAll || onToggleIssuesOnly) && (
					<>
						<div
							aria-hidden="true"
							style={{
								width: 1,
								alignSelf: "stretch",
								background: theme.colors.border ?? "#333",
								flexShrink: 0,
							}}
						/>
						<div
							role="group"
							aria-label="Filter subsystems"
							style={{ display: "flex", alignItems: "center", gap: 4 }}
						>
							{onToggleShowAll && (
							<button
								key="recent"
								type="button"
								title={
									showAll
										? "Show only graphs edited in the last day"
										: hiddenStaleCount != null && hiddenStaleCount > 0
											? `Show ${hiddenStaleCount} older hidden graph${hiddenStaleCount === 1 ? "" : "s"}`
											: "Show graphs older than a day"
								}
								aria-pressed={!showAll}
								onClick={onToggleShowAll}
								style={{
									fontSize: theme.fontSizes[0],
									fontWeight: !showAll ? 600 : 400,
									letterSpacing: 0.3,
									textTransform: "uppercase",
									padding: "1px 7px",
									borderRadius: 4,
									border: `1px solid ${
										!showAll ? theme.colors.primary : (theme.colors.border ?? "#333")
									}`,
									background: !showAll ? `${theme.colors.primary}22` : "transparent",
									color: !showAll ? theme.colors.primary : muted,
									cursor: "pointer",
									fontFamily: theme.fonts.body,
								}}
							>
								Recent
							</button>
							)}
							{onToggleIssuesOnly && (
							<button
								key="issues"
								type="button"
								title={
									issuesOnly
										? "Show all graphs"
										: "Show only graphs with failed verification or failed audits"
								}
								aria-pressed={issuesOnly}
								onClick={onToggleIssuesOnly}
								style={{
									fontSize: theme.fontSizes[0],
									fontWeight: issuesOnly ? 600 : 400,
									letterSpacing: 0.3,
									textTransform: "uppercase",
									padding: "1px 7px",
									borderRadius: 4,
									border: `1px solid ${
										issuesOnly ? theme.colors.primary : (theme.colors.border ?? "#333")
									}`,
									background: issuesOnly ? `${theme.colors.primary}22` : "transparent",
									color: issuesOnly ? theme.colors.primary : muted,
									cursor: "pointer",
									fontFamily: theme.fonts.body,
								}}
							>
								Issues
							</button>
							)}
						</div>
					</>
				)}
				{auditLabel && (
					<div
						title={
							regularAudit?.running
								? "Regular audit is running across stored subsystem models"
								: `Regular audit every ${regularAudit?.intervalMinutes ?? "?"} min — change in Settings`
						}
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							padding: "3px 10px",
							borderRadius: 6,
							border: `1px solid ${theme.colors.border ?? "#333"}`,
							background: theme.colors.background,
							color: regularAudit?.running
								? theme.colors.primary
								: muted,
							fontSize: theme.fontSizes[0],
							fontFamily: theme.fonts.monospace,
							flexShrink: 0,
						}}
					>
						{regularAudit?.running ? (
							<Loader2 size={12} className="principal-studio-spin" />
						) : null}
						{auditLabel}
					</div>
				)}
			</div>
			<div
				style={{
					fontSize: theme.fontSizes[0],
					color: muted,
					fontFamily: theme.fonts.monospace,
					flexShrink: 0,
				}}
			>
				{lastLoadedAt == null
					? "Loading…"
					: `Last loaded ${lastLoadedLabel(lastLoadedAt)}`}
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
 * Left file panel for the Subsystems tab: per-repo Pierre `SubsystemFileTree`s
 * over every visible subsystem, grouped with `buildRepoGroups` — the same
 * primitives the detail graph sidebar uses. Fed by `summary.files` (the host
 * already loads every full model per listing), so no detail fetches are
 * needed. Clicking a file highlights its owning graph in the list; a shared
 * file prefers the selected row's graph when it owns it, else the topmost
 * owner in list order.
 */
function FilesPanel({
	graphs,
	selectedId,
	width,
	onHighlightGraph,
}: {
	graphs: SubsystemModelSummary[];
	selectedId: string | null;
	width: number;
	onHighlightGraph: (graph: SubsystemModelSummary) => void;
}) {
	const { theme } = useTheme();
	const byId = useMemo(() => new Map(graphs.map((g) => [g.id, g])), [graphs]);

	const { groups, owners } = useMemo(() => {
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
		return { groups, owners };
	}, [graphs]);

	const onSelectFile = useCallback(
		(repoKey: string | undefined, displayPath: string) => {
			const ids = owners.get(`${repoKey ?? ""}\0${displayPath}`) ?? [];
			const pick =
				selectedId && ids.includes(selectedId) ? selectedId : ids[0];
			const graph = pick ? byId.get(pick) : undefined;
			if (graph) onHighlightGraph(graph);
		},
		[owners, byId, selectedId, onHighlightGraph],
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
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
				}}
			>
				{groups.map((group, i) => (
					<RepoFilesGroup
						key={group.repoKey ?? "__no-repo__"}
						group={group}
						bordered={i > 0}
						onSelectFile={(displayPath) =>
							onSelectFile(group.repoKey, displayPath)
						}
					/>
				))}
			</div>
		</div>
	);
}

function RepoFilesGroup({
	group,
	bordered,
	onSelectFile,
}: {
	group: RepoGroup;
	bordered: boolean;
	onSelectFile: (displayPath: string) => void;
}) {
	const { theme } = useTheme();
	const [collapsed, setCollapsed] = useState(false);
	const files = useMemo(
		() => group.entries.map((e) => e.displayPath),
		[group],
	);
	const avatar = group.repoKey
		? repoAvatarUrl(group.repoKey)
		: undefined;
	const label = group.repo ?? "No repo";
	// Definite height so the tree fills it; grows with file count, capped.
	const height = Math.min(320, Math.max(120, files.length * 26 + 48));

	return (
		<div
			style={{
				flex: "0 0 auto",
				height: collapsed ? undefined : height,
				display: "flex",
				flexDirection: "column",
				borderTop: bordered
					? `1px solid ${theme.colors.border ?? "#333"}`
					: undefined,
			}}
		>
			<button
				type="button"
				onClick={() => setCollapsed((v) => !v)}
				title={collapsed ? "Expand repo files" : "Collapse repo files"}
				aria-expanded={!collapsed}
				onMouseEnter={(e) => {
					e.currentTarget.style.background = theme.colors.border ?? "#333";
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.background = "transparent";
				}}
				style={{
					flexShrink: 0,
					display: "flex",
					alignItems: "center",
					gap: 6,
					padding: "8px 12px 4px",
					border: "none",
					borderRadius: 4,
					background: "transparent",
					cursor: "pointer",
					fontFamily: theme.fonts.body,
					textAlign: "left",
					minWidth: 0,
					transition: "background 120ms ease",
				}}
			>
				{avatar && (
					<img
						src={avatar}
						alt=""
						width={28}
						height={28}
						style={{ borderRadius: 6, flexShrink: 0 }}
					/>
				)}
				<span
					style={{
						fontSize: theme.fontSizes[2],
						fontFamily: theme.fonts.monospace,
						color: theme.colors.text,
						fontWeight: 600,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
					title={group.owner ? `${group.owner}/${label}` : label}
				>
					{label}
				</span>
			</button>
			{!collapsed && (
				<SubsystemFileTree
					files={files}
					onSelectFile={onSelectFile}
					headerless
				/>
			)}
		</div>
	);
}

export function SubsystemModelsView() {
	const { theme } = useTheme();
	const [graphs, setGraphs] = useState<SubsystemModelSummary[] | null>(null);
	const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [sharingId, setSharingId] = useState<string | null>(null);
	const [sortBy, setSortBy] = useState<SubsystemSortKey>("opened");
	const [showAll, setShowAll] = useState(false);
	const [issuesOnly, setIssuesOnly] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [auditByGraphId, setAuditByGraphId] = useState<
		Record<string, ListAuditEntry>
	>({});
	const [auditModal, setAuditModal] = useState<AuditModalState | null>(null);
	const [proposalsModal, setProposalsModal] = useState<{
		graphId: string;
		title: string;
	} | null>(null);
	const [maintainPicker, setMaintainPicker] = useState<{
		graphId: string;
		title: string;
		mode: "issues" | "gaps";
	} | null>(null);
	/** graphId → maintain agent in flight / last error */
	const [maintainByGraphId, setMaintainByGraphId] = useState<
		Record<string, { status: "running" | "error"; error?: string }>
	>({});
	const [regularAudit, setRegularAudit] = useState<RegularAuditStatus | null>(
		null,
	);
	/** Selected row highlight (file-tree clicks land here, no new tab). */
	const [selectedId, setSelectedId] = useState<string | null>(null);

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
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

	useEffect(
		() => () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		},
		[],
	);

	useEffect(() => {
		let alive = true;
		void electrobun.rpc!.request
			.getRegularAuditStatus({})
			.then((status) => {
				if (alive) setRegularAudit(status);
			})
			.catch(() => {
				/* optional */
			});
		const onRegularAudit = (status: StudioMessages["regularAuditChanged"]) => {
			setRegularAudit(status);
		};
		regularAuditChangeSubscribers.add(onRegularAudit);
		return () => {
			alive = false;
			regularAuditChangeSubscribers.delete(onRegularAudit);
		};
	}, []);

	const refresh = useCallback(async () => {
		try {
			const subResult = await electrobun.rpc!.request.listSubsystemModels({});
			setGraphs(subResult.graphs);
			setLastLoadedAt(Date.now());
			setError(null);
			setAuditByGraphId((prev) => {
				const next: Record<string, ListAuditEntry> = { ...prev };
				for (const g of subResult.graphs) {
					if (next[g.id]?.status === "auditing") continue;
					if (g.lastAudit) {
						next[g.id] = entryFromLastAudit(g.lastAudit, next[g.id]);
					}
				}
				return next;
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
		const onProposals = (
			_payload: StudioMessages["subsystemModelProposalsChanged"],
		) => {
			void refresh();
		};
		const onMaintain = (
			payload: StudioMessages["subsystemModelMaintainChanged"],
		) => {
			setMaintainByGraphId((prev) => {
				if (payload.status === "running") {
					return {
						...prev,
						[payload.graphId]: { status: "running" },
					};
				}
				const next = { ...prev };
				if (payload.status === "error") {
					next[payload.graphId] = {
						status: "error",
						error: payload.error,
					};
				} else {
					delete next[payload.graphId];
				}
				return next;
			});
			if (payload.status === "done" || payload.status === "error") {
				void refresh();
				if (payload.status === "done") {
					const who = agentDisplayName(payload.agent);
					if (payload.skipped) {
						setMessage(
							payload.summary ??
								`${who}: fully verified — nothing to propose`,
						);
					} else {
						setMessage(
							payload.pendingCount != null && payload.pendingCount > 0
								? `${who} finished (${payload.model ?? "model"}) — ${payload.pendingCount} proposal${payload.pendingCount === 1 ? "" : "s"} to review`
								: `${who} finished (${payload.model ?? "model"}) — no new proposals`,
						);
					}
				} else if (payload.error) {
					setError(payload.error);
				}
			}
		};
		graphifyChangeSubscribers.add(onGraphify);
		subsystemModelChangeSubscribers.add(onSubsystem);
		subsystemModelProposalsChangeSubscribers.add(onProposals);
		subsystemModelMaintainChangeSubscribers.add(onMaintain);
		return () => {
			graphifyChangeSubscribers.delete(onGraphify);
			subsystemModelChangeSubscribers.delete(onSubsystem);
			subsystemModelProposalsChangeSubscribers.delete(onProposals);
			subsystemModelMaintainChangeSubscribers.delete(onMaintain);
		};
	}, [refresh]);

	const onOpen = useCallback(async (graph: SubsystemModelSummary) => {
		setSelectedId(graph.id);
		await electrobun.rpc!.request.openSubsystemModel({ graphId: graph.id });
	}, []);

	/** File-tree click: highlight the owning row in place, no new tab. */
	const onHighlightGraph = useCallback((graph: SubsystemModelSummary) => {
		setSelectedId(graph.id);
		requestAnimationFrame(() => {
			document
				.querySelector(`[data-subsystem-row="${CSS.escape(graph.id)}"]`)
				?.scrollIntoView({ block: "nearest", behavior: "smooth" });
		});
	}, []);


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

	const onMaintain = useCallback(
		(e: React.MouseEvent, graph: SubsystemModelSummary) => {
			e.stopPropagation();
			if (maintainByGraphId[graph.id]?.status === "running") return;
			const mode = maintainModeFromAuditEntry(auditByGraphId[graph.id]);
			if (!mode) return;
			setError(null);
			setMaintainPicker({ graphId: graph.id, title: graph.title, mode });
		},
		[auditByGraphId, maintainByGraphId],
	);

	const onMaintainStarted = useCallback(
		(
			graphId: string,
			title: string,
			info: {
				model: string;
				alreadyRunning?: boolean;
				mode: "issues" | "gaps";
			},
		) => {
			setMaintainByGraphId((prev) => ({
				...prev,
				[graphId]: { status: "running" },
			}));
			const who = maintainButtonCopy(info.mode).agentName;
			if (info.alreadyRunning) {
				setMessage(`${who} already running for ${title}`);
			} else {
				setMessage(`${who} running for ${title} (${info.model})…`);
			}
		},
		[],
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
				setAuditByGraphId((prev) => {
					if (!(graph.id in prev)) return prev;
					const next = { ...prev };
					delete next[graph.id];
					return next;
				});
				setSelectedId((current) => (current === graph.id ? null : current));
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[confirmId],
	);

	const onShowAuditReport = useCallback(
		async (e: React.MouseEvent, graphId: string, entry: ListAuditEntry) => {
			e.stopPropagation();
			if (entry.status === "error") {
				setAuditModal({
					phase: "error",
					title: entry.title,
					error: entry.error,
				});
				return;
			}
			if (
				entry.status !== "fully_verified" &&
				entry.status !== "partially_verified" &&
				entry.status !== "issues"
			)
				return;

			if (entry.report) {
				setAuditModal({ phase: "done", report: entry.report });
				return;
			}

			setAuditModal({
				phase: "auditing",
				title: "Loading saved audit…",
			});
			try {
				const res = await electrobun.rpc!.request.getSubsystemModelAudit({
					graphId,
				});
				if (!res.ok || !res.report) {
					setAuditModal({
						phase: "error",
						title: "Saved audit",
						error: res.error ?? "No saved audit report",
					});
					return;
				}
				setAuditByGraphId((prev) => ({
					...prev,
					[graphId]: {
						status: entry.status,
						checkedAt: res.report!.checkedAt,
						stale: res.stale === true,
						issueCount: entry.issueCount,
						report: res.report,
					},
				}));
				setAuditModal({ phase: "done", report: res.report });
			} catch (err) {
				setAuditModal({
					phase: "error",
					title: "Saved audit",
					error: err instanceof Error ? err.message : String(err),
				});
			}
		},
		[],
	);

	if (error && graphs === null) {
		return (
			<SubsystemsTabShell>
				<SubsystemsTabHeader
				lastLoadedAt={lastLoadedAt}
				sortBy={sortBy}
				onSortChange={setSortBy}
				regularAudit={regularAudit}
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
				regularAudit={regularAudit}
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
				regularAudit={regularAudit}
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

	const now = Date.now();
	const isRecent = (g: SubsystemModelSummary) =>
		now - new Date(g.updatedAt).getTime() <= RECENT_MS;
	const query = searchQuery.trim().toLowerCase();
	const searchedGraphs =
		query.length === 0
			? graphs
			: graphs.filter((g) => {
					if (g.title.toLowerCase().includes(query)) return true;
					if (g.description?.toLowerCase().includes(query)) return true;
					if (g.id.toLowerCase().includes(query)) return true;
					for (const r of g.repos ?? []) {
						if (`${r.owner}/${r.name}`.toLowerCase().includes(query))
							return true;
					}
					return false;
				});
	const issueGraphs = issuesOnly
		? searchedGraphs.filter((g) => {
				const entry = auditByGraphId[g.id];
				return entry?.status === "issues" || entry?.status === "error";
			})
		: searchedGraphs;
	const recentGraphs = showAll
		? issueGraphs
		: issueGraphs.filter(isRecent);
	const hiddenStaleCount = issueGraphs.length - recentGraphs.length;
	const sortedGraphs = [...recentGraphs].sort(
		(a, b) => subsystemModelSortTime(b, sortBy) - subsystemModelSortTime(a, sortBy),
	);

	return (
		<SubsystemsTabShell>
			<SubsystemsTabHeader
				lastLoadedAt={lastLoadedAt}
				sortBy={sortBy}
				onSortChange={setSortBy}
				showAll={showAll}
				hiddenStaleCount={hiddenStaleCount}
				onToggleShowAll={() => setShowAll((v) => !v)}
				issuesOnly={issuesOnly}
				onToggleIssuesOnly={() => setIssuesOnly((v) => !v)}
				regularAudit={regularAudit}
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
			/>
			<SubsystemsTabBody>
				<div
					style={{
						flex: 1,
						minHeight: 0,
						display: "flex",
						flexDirection: "row",
						userSelect: panelDrag ? "none" : undefined,
					}}
				>
					<FilesPanel
						graphs={sortedGraphs}
						selectedId={selectedId}
						width={panelWidth}
						onHighlightGraph={onHighlightGraph}
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
			{recentGraphs.length === 0 ? (
				<div
					style={{
						fontSize: theme.fontSizes[1],
						color: muted,
						padding: "24px 0",
					}}
				>
					{query.length > 0 && searchedGraphs.length === 0
						? `No graphs match "${searchQuery.trim()}".`
						: issuesOnly && issueGraphs.length === 0
							? "No graphs with verification issues."
							: hiddenStaleCount > 0
								? `No graphs edited in the last day — ${hiddenStaleCount} older hidden.`
								: "No subsystem graphs."}
				</div>
			) : (
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				{sortedGraphs.map((graph) => {
					const auditEntry = auditByGraphId[graph.id];
					const auditBadge = auditEntry
						? listAuditBadge(auditEntry, theme.colors, muted)
						: null;
					const maintainState = maintainByGraphId[graph.id];
					const maintaining = maintainState?.status === "running";
					const maintainMode = maintainModeFromAuditEntry(auditEntry);
					const maintainCopy = maintainButtonCopy(maintainMode);
					const maintainDisabled = maintaining || !maintainMode;

					return (
						<div
							data-subsystem-row={graph.id}
							onClick={() => onOpen(graph)}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = theme.colors.textMuted ?? "#555";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor =
									graph.id === selectedId
										? theme.colors.primary
										: (theme.colors.border ?? "#333");
							}}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "8px 12px",
								borderRadius: 4,
								border: `1px solid ${
									graph.id === selectedId
										? theme.colors.primary
										: (theme.colors.border ?? "#333")
								}`,
								background: theme.colors.backgroundSecondary ?? "transparent",
								cursor: "pointer",
								fontSize: theme.fontSizes[2],
								transition: "border-color 0.15s ease",
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
							{auditBadge && (
								<button
									type="button"
									onClick={(e) => {
										if (auditEntry && auditBadge.clickable) {
											void onShowAuditReport(e, graph.id, auditEntry);
										} else {
											e.stopPropagation();
										}
									}}
									title={auditBadge.title}
									style={{
										flexShrink: 0,
										boxSizing: "border-box",
										fontSize: theme.fontSizes[0],
										fontWeight: 600,
										letterSpacing: 0.3,
										textTransform: "uppercase",
										padding: "2px 7px",
										borderRadius: 999,
										background: `${auditBadge.color}22`,
										color: auditBadge.color,
										border: `1px solid ${auditBadge.color}55`,
										whiteSpace: "nowrap",
										cursor: auditBadge.clickable ? "pointer" : "default",
										fontFamily: theme.fonts.body,
										display: "inline-flex",
										alignItems: "center",
										gap: 5,
									}}
								>
									{auditBadge.spinning && (
										<Loader2 size={10} className="principal-studio-spin" />
									)}
									{auditBadge.label}
								</button>
							)}
							{(graph.pendingProposalCount ?? 0) > 0 && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										setProposalsModal({
											graphId: graph.id,
											title: graph.title,
										});
									}}
									title="Review agent proposed corrections"
									style={{
										flexShrink: 0,
										boxSizing: "border-box",
										fontSize: theme.fontSizes[0],
										fontWeight: 600,
										letterSpacing: 0.3,
										textTransform: "uppercase",
										padding: "2px 7px",
										borderRadius: 999,
										background: `${theme.colors.primary}22`,
										color: theme.colors.primary,
										border: `1px solid ${theme.colors.primary}55`,
										whiteSpace: "nowrap",
										cursor: "pointer",
										fontFamily: theme.fonts.body,
									}}
								>
									{graph.pendingProposalCount === 1
										? "1 proposal"
										: `${graph.pendingProposalCount} proposals`}
								</button>
							)}
							<button
								type="button"
								onClick={(e) => void onMaintain(e, graph)}
								disabled={maintainDisabled}
								title={
									maintainState?.status === "error"
										? `${maintainCopy.agentName} failed: ${maintainState.error ?? "unknown"} — click to retry`
										: maintaining
											? `${maintainCopy.agentName} running…`
											: maintainCopy.title
								}
								aria-label={`${maintainCopy.label} ${graph.title}`}
								style={{
									flexShrink: 0,
									display: "inline-flex",
									alignItems: "center",
									gap: 4,
									padding: "4px 8px",
									borderRadius: 4,
									border: `1px solid ${
										maintainState?.status === "error"
											? (theme.colors.error ?? "#e5534b")
											: (theme.colors.border ?? "#333")
									}`,
									background: "transparent",
									color:
										maintainState?.status === "error"
											? (theme.colors.error ?? "#e5534b")
											: muted,
									cursor: maintainDisabled ? "default" : "pointer",
									opacity: maintainDisabled ? 0.55 : 1,
									fontSize: theme.fontSizes[0],
									fontFamily: theme.fonts.body,
								}}
							>
								{maintaining ? (
									<Loader2 size={12} className="principal-studio-spin" />
								) : (
									<Bot size={12} />
								)}
								{maintaining ? "Running…" : maintainCopy.label}
							</button>
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
					);
				})}
			</div>
			)}
				</div>
				</div>
			</SubsystemsTabBody>
			{auditModal && (
				<AuditResultsModal
					state={auditModal}
					onClose={() => setAuditModal(null)}
					onReportChange={(report) => {
						setAuditModal({ phase: "done", report });
						setAuditByGraphId((prev) => ({
							...prev,
							[report.graphId]: {
								status: report.needsUpdate
									? "issues"
									: report.findings.some(
												(f) => f.kind === "construct_unconfirmed",
										  ) ||
										  report.checks.some(
												(c) =>
													c.constructInferred === "unknown" ||
													c.signature === "skipped",
										  )
										? "partially_verified"
										: "fully_verified",
								checkedAt: report.checkedAt,
								stale: false,
								issueCount: report.findings.filter(
									(f) => f.severity === "error",
								).length,
								report,
							},
						}));
					}}
				/>
			)}
			{proposalsModal && (
				<ProposalsModal
					graphId={proposalsModal.graphId}
					title={proposalsModal.title}
					onClose={() => setProposalsModal(null)}
				/>
			)}
			{maintainPicker && (
				<MaintainModelPickerModal
					graphId={maintainPicker.graphId}
					title={maintainPicker.title}
					mode={maintainPicker.mode}
					onClose={() => setMaintainPicker(null)}
					onStarted={(info) =>
						onMaintainStarted(
							maintainPicker.graphId,
							maintainPicker.title,
							{ ...info, mode: maintainPicker.mode },
						)
					}
				/>
			)}
		</SubsystemsTabShell>
	);
}
