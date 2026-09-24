/**
 * MaintenancePanel — the ambient Maintain agent surface: the aggregate
 * verification ledger across every stored subsystem model, the models sorted
 * with pending proposals and recent Maintain runs first (then
 * farthest-from-verified), pending correction proposals inline with
 * accept/reject, and a repo filter like the Subsystems tab's drilldown.
 * Renders as a full-bleed tab view by default (`overlay=false`), or wrapped in
 * a modal overlay for the legacy AppHeader chip (`overlay=true`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, Bot, Check, Component, Copy, History, ListChecks, Loader2, Network, Play, Route, ScanSearch, Server, Square, Trash2, type LucideIcon } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { repoAvatarUrl } from "@principal-ai/subsystems-react";
import type {
	MaintenanceOverview,
	MaintenanceOverviewModel,
	MaintenanceOverviewProposal,
	StudioMessages,
	SubsystemModelProposal,
	SubsystemModelRun,
	SubsystemVerificationLane,
	VerificationLaneStatus,
} from "../../shared/contract";
import {
	electrobun,
	opencodeLiveFeedSubscribers,
	subsystemModelChangeSubscribers,
	subsystemModelMaintainChangeSubscribers,
	subsystemModelProposalsChangeSubscribers,
	subsystemModelRunsChangeSubscribers,
} from "../rpc";
import { MaintainModelPickerModal } from "./MaintainModelPickerModal";
import { MaintenanceAuditAllModal } from "./MaintenanceAuditAllModal";
import { ProposalsModal } from "./ProposalsModal";
import { RepoRow } from "./RepoRow";

/** Copy-feedback flash duration for a run row's copy button. */
const RUN_COPY_FEEDBACK_MS = 1500;

/**
 * The Maintain agents, in routing priority order (construct → static topology →
 * package/module → runtime topology), each with a badge icon. Mirrors the
 * host's `MaintainAgentId` set; drives the per-row "which agent is running"
 * badge strip.
 */
const AGENT_META: Array<{ agent: string; label: string; Icon: LucideIcon }> = [
	// Icon = the agent's lane (construct / static-topology / dynamic-topology),
	// so the badge reads as "which lane"; the name distinguishes the workers
	// within a lane. Mirrors the lane icons: construct→Component,
	// static-topology→Network, dynamic-topology→Server.
	{ agent: "construct-fixer", label: "Construct Fixer", Icon: Component },
	{
		agent: "static-topology-fixer",
		label: "Static Topology Fixer",
		Icon: Network,
	},
	{ agent: "package-module-fixer", label: "Package/Module Fixer", Icon: Server },
	{ agent: "construct-verifier", label: "Construct Verifier", Icon: Component },
	{
		agent: "static-topology-verifier",
		label: "Static Topology Verifier",
		Icon: Network,
	},
	{
		agent: "package-module-verifier",
		label: "Package/Module Verifier",
		Icon: Server,
	},
	{
		agent: "runtime-topology-verifier",
		label: "Runtime Topology Verifier",
		Icon: Server,
	},
];

/**
 * The fix-cycle position for a model: the routing-ordered stages with the ones
 * already cleared marked done, the next one highlighted, and the rest queued.
 * `nextRoute === null` means nothing is queued (fully verified).
 */
function FixCycleStrip({
	nextRoute,
}: {
	nextRoute: MaintenanceOverviewModel["nextRoute"];
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const success = theme.colors.success ?? "#2da44e";
	const nextIdx = nextRoute
		? AGENT_META.findIndex((a) => a.agent === nextRoute.agent)
		: -1;
	const nextLabel = nextIdx >= 0 ? AGENT_META[nextIdx]?.label : null;
	return (
		<>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 5,
					flexWrap: "wrap",
				}}
			>
				<span style={{ fontSize: theme.fontSizes[1], color: muted }}>
					Fix cycle
				</span>
				{AGENT_META.map(({ agent, label, Icon }, idx) => {
					const state =
						nextIdx < 0
							? "cleared"
							: idx < nextIdx
								? "cleared"
								: idx === nextIdx
									? "next"
									: "pending";
					return (
						<span
							key={agent}
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 4,
								padding: "1px 7px",
								borderRadius: 6,
								fontSize: theme.fontSizes[1],
								fontFamily: theme.fonts.body,
								border: `1px solid ${
									state === "next"
										? theme.colors.primary
										: (theme.colors.border ?? "#333")
								}`,
								background:
									state === "next" ? theme.colors.primary : "transparent",
								color:
									state === "next"
										? theme.colors.background
										: state === "cleared"
											? success
											: muted,
								opacity: state === "pending" ? 0.5 : 1,
							}}
						>
							<Icon size={11} />
							{label}
						</span>
					);
				})}
			</div>
			<span style={{ fontSize: theme.fontSizes[1], color: muted }}>
				{nextLabel
					? `Next: ${nextLabel}`
					: "Nothing queued — fully verified"}
			</span>
		</>
	);
}

/** Compact copyable context for one run — mirrors the agent-sessions row copy. */
function formatRunContext(run: SubsystemModelRun, graphTitle: string): string {
	const lines: string[] = [];
	lines.push(`## Maintain run — ${graphTitle}`);
	const head = [
		run.status,
		run.agent,
		run.layer && run.mode ? `${run.layer}/${run.mode}` : null,
	]
		.filter(Boolean)
		.join(" · ");
	lines.push(`_${head}_`);
	lines.push("");
	if (run.sessionId) lines.push(`Session id: \`${run.sessionId}\``);
	if (run.model) lines.push(`Model: \`${run.model}\``);
	lines.push(`Started: ${run.startedAt}`);
	if (run.endedAt) lines.push(`Finished: ${run.endedAt}`);
	if (run.verdict) lines.push(`Verdict: ${run.verdict}`);
	if (run.pendingCount != null) lines.push(`Pending proposals: ${run.pendingCount}`);
	if (run.error) lines.push("", `Error: ${run.error}`);
	if (run.summary) lines.push("", run.summary);
	return lines.join("\n");
}

/**
 * Attribute proposals to a run: by `runId` when it matches (new runs), else by
 * the run's agent within its start/end window — older runs predate
 * `runId === log id`, so their proposals carry a runId that no log entry has.
 */
function proposalsForRun(
	all: SubsystemModelProposal[] | undefined,
	run: SubsystemModelRun,
): SubsystemModelProposal[] | undefined {
	if (!all) return undefined;
	const byRunId = all.filter((p) => p.runId === run.id);
	if (byRunId.length > 0) return byRunId;
	// Half-open [startedAt, endedAt) so adjacent runs don't both claim a
	// proposal posted on the boundary; a still-running run owns everything after.
	const start = Date.parse(run.startedAt);
	const end = run.endedAt
		? Date.parse(run.endedAt)
		: Number.POSITIVE_INFINITY;
	return all.filter((p) => {
		if (p.author !== run.agent) return false;
		const t = Date.parse(p.createdAt);
		return Number.isFinite(t) && t >= start && t < end;
	});
}

/** One persisted Maintain run: status · agent/layer/model · started · copy. */
function RunRow({
	run,
	graphTitle,
	proposals,
	onOpen,
}: {
	run: SubsystemModelRun;
	graphTitle: string;
	/** Every proposal this run produced (any status), when loaded. */
	proposals?: SubsystemModelProposal[];
	/** Click the row to open the run's live events tab. */
	onOpen?: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);
	const onCopy = async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(formatRunContext(run, graphTitle));
			setCopied(true);
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(() => setCopied(false), RUN_COPY_FEEDBACK_MS);
		} catch {
			// clipboard may be denied — fail quietly
		}
	};
	const statusColor =
		run.status === "error"
			? theme.colors.error ?? "#e5534b"
			: run.status === "running"
				? theme.colors.primary
				: muted;
	const label = run.status === "running" ? "Running…" : run.status;
	const agentMeta = AGENT_META.find((a) => a.agent === run.agent);
	// The agent chip already implies the layer/mode, so only the model is left.
	const meta = run.model ?? "";
	const acceptedProposals = (proposals ?? []).filter(
		(p) => p.status === "accepted",
	);
	const pendingProposalTotal = (proposals ?? []).filter(
		(p) => p.status === "pending",
	).length;
	const rejectedProposals = (proposals ?? []).filter(
		(p) => p.status === "rejected",
	).length;
	return (
		<div
			onClick={onOpen}
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 1,
				minWidth: 0,
				cursor: onOpen ? "pointer" : "default",
			}}
		>
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "3px 0",
				fontSize: theme.fontSizes[2],
				minWidth: 0,
			}}
		>
			<span
				style={{
					flex: 1,
					minWidth: 0,
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
				}}
			>
				{agentMeta && (
					<span
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 4,
							flexShrink: 0,
							padding: "1px 7px",
							borderRadius: 6,
							fontSize: theme.fontSizes[1],
							fontFamily: theme.fonts.body,
							border: `1px solid ${theme.colors.border ?? "#333"}`,
							color: muted,
						}}
					>
						<agentMeta.Icon size={11} />
						{agentMeta.label}
					</span>
				)}
				<span
					style={{
						minWidth: 0,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						color: muted,
						fontFamily: theme.fonts.monospace ?? "ui-monospace, monospace",
					}}
				>
					{meta || "—"}
				</span>
			</span>
			<span
				style={{
					flexShrink: 0,
					color: muted,
					fontVariantNumeric: "tabular-nums",
					fontSize: theme.fontSizes[1],
				}}
			>
				{new Date(run.startedAt).toLocaleString()}
			</span>
			<button
				type="button"
				onClick={(e) => void onCopy(e)}
				title="Copy run session info"
				aria-label="Copy run session info"
				style={{
					flexShrink: 0,
					display: "inline-flex",
					alignItems: "center",
					gap: 4,
					padding: "2px 6px",
					borderRadius: 4,
					border: `1px solid ${
						copied ? theme.colors.primary : (theme.colors.border ?? "#333")
					}`,
					background: copied ? theme.colors.primary : "transparent",
					color: copied ? theme.colors.background : muted,
					cursor: "pointer",
					fontSize: theme.fontSizes[1],
					fontFamily: theme.fonts.body,
				}}
			>
				{copied ? <Check size={12} /> : <Copy size={12} />}
			</button>
		</div>
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				fontSize: theme.fontSizes[1],
				color: muted,
			}}
		>
			<span
				style={{
					flexShrink: 0,
					color: statusColor,
					textTransform: "uppercase",
					fontSize: theme.fontSizes[1],
					letterSpacing: 0.3,
					fontWeight: 600,
				}}
			>
				{label}
			</span>
			{proposals &&
				(proposals.length === 0 ? (
					<span>No proposals</span>
				) : (
					<span>
						{acceptedProposals.length} accepted
						{pendingProposalTotal > 0
							? ` · ${pendingProposalTotal} pending`
							: ""}
						{rejectedProposals > 0
							? ` · ${rejectedProposals} rejected`
							: ""}
					</span>
				))}
		</div>
		</div>
	);
}

/** Lane badge order + icons for the four verification layers. */
const LANE_META: Array<{
	lane: SubsystemVerificationLane;
	label: string;
	Icon: typeof Component;
}> = [
	{ lane: "construct", label: "Construct", Icon: Component },
	{ lane: "static-topology", label: "Static topology", Icon: Network },
	{ lane: "dynamic-topology", label: "Dynamic topology", Icon: Server },
	{ lane: "walkthrough", label: "Walkthrough", Icon: Route },
];

function laneStatusColor(
	status: VerificationLaneStatus,
	colors: {
		success?: string;
		error?: string;
		warning?: string;
		primary?: string;
		textSecondary?: string;
	},
	fallback: string,
): string {
	if (status === "verified") return colors.success ?? "#2da44e";
	if (status === "issues") return colors.error ?? "#e5534b";
	// Yellow, not the theme's primary (orange) — partial must not read as "on".
	if (status === "partial") return colors.warning ?? "#d4a017";
	return colors.textSecondary ?? fallback;
}

/** Four lane icons, each colored by verified / partial / issues / blocked / none.
 *  When `onOpenLane` is set each icon becomes a button that opens the model
 *  focused on that verification layer. */
function LaneBadges({
	lanes,
	colors,
	muted,
	onOpenLane,
}: {
	lanes: Partial<Record<SubsystemVerificationLane, VerificationLaneStatus>>;
	colors: {
		success?: string;
		error?: string;
		warning?: string;
		primary?: string;
		textSecondary?: string;
	};
	muted: string;
	/** Open the model with the issues view focused on the clicked lane. */
	onOpenLane?: (lane: SubsystemVerificationLane) => void;
}) {
	const { theme } = useTheme();
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 5,
				flexShrink: 0,
			}}
		>
			{LANE_META.map(({ lane, label, Icon }) => {
				const status = lanes[lane] ?? "none";
				const tint = laneStatusColor(status, colors, muted);
				if (!onOpenLane) {
					return (
						<Icon
							key={lane}
							size={13}
							aria-label={`${label}: ${status}`}
							style={{
								color: tint,
								opacity: status === "none" ? 0.35 : 1,
							}}
						/>
					);
				}
				return (
					<button
						key={lane}
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onOpenLane(lane);
						}}
						aria-label={`Open ${label} findings (${status})`}
						title={`Open this model focused on ${label} findings`}
						style={{
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							width: 26,
							height: 26,
							padding: 0,
							border: `1px solid ${theme.colors.border ?? "#333"}`,
							borderRadius: 6,
							background: "transparent",
							color: tint,
							opacity: status === "none" ? 0.5 : 1,
							cursor: "pointer",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background =
								theme.colors.backgroundHover ??
								theme.colors.backgroundSecondary ??
								"transparent";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "transparent";
						}}
					>
						<Icon size={14} />
					</button>
				);
			})}
		</span>
	);
}

/** What each verification lane checks (for the header help popover). */
const LANE_HELP: Record<SubsystemVerificationLane, { name: string; blurb: string }> =
	{
		construct: {
			name: "Construct verification",
			blurb:
				"Layer 1 — each component's source declaration: the file exists, the symbol is declared, the construct matches, and the signature types agree.",
		},
		"static-topology": {
			name: "Static topology",
			blurb:
				"Layer 2 — typed relations[] between constructs (extends, implements, …).",
		},
		"dynamic-topology": {
			name: "Dynamic topology",
			blurb:
				"Layer 3 — how constructs are arranged at runtime: deployment-unit membership via process, and containment via package / module.",
		},
		walkthrough: {
			name: "Walkthrough verification",
			blurb:
				"Layer 4 — runtime file:line seams on walkthrough hops: each step's file, line, symbol, and mechanism.",
		},
	};

const STATUS_LEGEND: Array<{
	status: VerificationLaneStatus;
	label: string;
	desc: string;
}> = [
	{ status: "verified", label: "Verified", desc: "Evidence confirms every claim." },
	{
		status: "partial",
		label: "Partial",
		desc: "Some claims are unconfirmed — agent work remains.",
	},
	{ status: "issues", label: "Issues", desc: "A hard failure — must be fixed." },
	{
		status: "blocked",
		label: "Blocked",
		desc: "Cannot check yet (repo / graphify cache unavailable).",
	},
];

/** Header lane-legend icon: theme-coloured hover background, no tooltip. */
function LaneIconButton({
	lane,
	label,
	Icon,
	color,
	textColor,
	hoverBackground,
	borderColor,
	fontSize,
	fontFamily,
	onOpen,
}: {
	lane: SubsystemVerificationLane;
	label: string;
	Icon: typeof Component;
	/** Tint for the lane icon only. */
	color: string;
	/** Neutral colour for the button label. */
	textColor: string;
	hoverBackground: string;
	borderColor: string;
	fontSize: number;
	fontFamily: string;
	onOpen: (lane: SubsystemVerificationLane) => void;
}) {
	const [hover, setHover] = useState(false);
	return (
		<button
			type="button"
			onClick={() => onOpen(lane)}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			aria-label={`About ${label} verification`}
			style={{
				background: hover
					? hoverBackground
					: `${hoverBackground}33`,
				border: `1px solid ${borderColor}`,
				borderRadius: 6,
				padding: "0 10px",
				height: 26,
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				cursor: "pointer",
				color: textColor,
				fontSize,
				fontFamily,
				transition: "background-color 120ms ease, border-color 120ms ease",
			}}
		>
			<Icon size={11} color={color} />
			{label}
		</button>
	);
}

/** Distinct owner/name repos referenced by any model's component purls, with model counts. */
function repoBreakdown(
	overview: MaintenanceOverview | null,
): Array<{ owner: string; name: string; count: number }> {
	const counts = new Map<string, { owner: string; name: string; count: number }>();
	for (const m of overview?.models ?? []) {
		for (const r of m.repos ?? []) {
			const key = `${r.owner}/${r.name}`.toLowerCase();
			const cur = counts.get(key);
			if (cur) cur.count++;
			else counts.set(key, { owner: r.owner, name: r.name, count: 1 });
		}
	}
	return [...counts.values()].sort((a, b) =>
		`${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`),
	);
}

/**
 * Left sidebar repo filter — the same visual language as the Subsystems tab's
 * FilesPanel drilldown: repo avatar + owner/name + model count per row. One
 * repo is always selected (the first by default); clicking a repo narrows the
 * model/pending lists to models referencing it.
 */
function MaintenanceRepoList({
	repoBreaks,
	selectedKey,
	onSelect,
	scalePad,
}: {
	repoBreaks: ReturnType<typeof repoBreakdown>;
	selectedKey: string | null;
	onSelect: (repoKey: string) => void;
	scalePad: number;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

	return (
		<div
			style={{
				width: 350,
				flexShrink: 0,
				minHeight: 0,
				overflowY: "auto",
				borderRight: `1px solid ${theme.colors.border ?? "#333"}`,
				paddingLeft: scalePad,
				paddingRight: 12,
				display: "flex",
				flexDirection: "column",
			}}
		>
			<span
				style={{
					fontSize: theme.fontSizes[1],
					color: muted,
					textTransform: "uppercase",
					letterSpacing: 0.3,
					padding: `${scalePad ? 12 : 2}px 8px 6px`,
				}}
			>
				Repos
			</span>
			{repoBreaks.map((r) => {
				const repoKey = `${r.owner}/${r.name}`.toLowerCase();
				const active = selectedKey === repoKey;
				return (
					<RepoRow
						key={repoKey}
						avatarUrl={repoAvatarUrl(`pkg:github/${r.owner}/${r.name}`)}
						label={r.name}
						title={`${r.owner}/${r.name} — ${r.count} model${r.count === 1 ? "" : "s"}`}
						badge={r.count}
						active={active}
						onPress={() => onSelect(repoKey)}
					/>
				);
			})}
		</div>
	);
}

export function MaintenancePanel({
	overlay = true,
	onClose,
}: {
	/** Modal overlay (AppHeader chip) vs full-bleed tab view. */
	overlay?: boolean;
	onClose?: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	// The tab view bleeds to its edges (header border, repo list border run full
	// width); the modal keeps container padding and zero internal pad.
	const scalePad = overlay ? 0 : 24;
	const [overview, setOverview] = useState<MaintenanceOverview | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Graph whose "Run maintenance" click opened the model picker.
	const [pickTarget, setPickTarget] = useState<MaintenanceOverviewModel | null>(null);
	// Batch "Audit all" over visible models.
	const [auditAllOpen, setAuditAllOpen] = useState(false);
	// Batch "Accept confident" over visible pending proposals at/above the
	// auto-accept confidence threshold.
	const [acceptConfidentOpen, setAcceptConfidentOpen] = useState(false);
	// Confirm modal for "Delete all proposals" across every model.
	const [deleteAllOpen, setDeleteAllOpen] = useState(false);
	const [deleteAllRunning, setDeleteAllRunning] = useState(false);
	const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
	// Per-proposal outcome while the batch accept run is in flight.
	const [acceptBatch, setAcceptBatch] = useState<
		Record<string, { status: "pending" | "running" | "done" | "error"; error?: string }>
	>({});
	const [acceptBatchRunning, setAcceptBatchRunning] = useState(false);
	// Jev confidence threshold, mirrored from viewer settings for the gate.
	const [confidenceThreshold, setConfidenceThreshold] = useState(0.85);
	// Model whose per-model proposals modal is open (from its row chip).
	const [proposalsTarget, setProposalsTarget] = useState<{
		graphId: string;
		title: string;
	} | null>(null);
	// Which lane's "what does this mean" popover is open (header legend).
	const [laneHelp, setLaneHelp] = useState<SubsystemVerificationLane | null>(
		null,
	);
	type FeedEntry = {
		status: string;
		events: number;
		agent?: string;
		title?: string;
		last?: string;
		lastAt?: number;
		error?: string | null;
		/** OpenCode session id — used to open the events tab on click. */
		sessionId?: string;
	};
	// Live OpenCode feed per graphId, so "Run maintenance" shows what the
	// agent is actually doing instead of a silent spinner.
	const [feeds, setFeeds] = useState<Record<string, FeedEntry>>({});
	// Persisted Maintain run history per graphId (durable sessionId -> graphId).
	const [runsByGraph, setRunsByGraph] = useState<
		ReadonlyMap<string, SubsystemModelRun[]>
	>(() => new Map());
	// Model rows whose "Runs" section is expanded.
	const [expandedRunsIds, setExpandedRunsIds] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	// Every proposal (any status) per model, loaded lazily when a model's Runs
	// section is expanded — so each run can show what it accomplished.
	const [proposalsByGraph, setProposalsByGraph] = useState<
		ReadonlyMap<string, SubsystemModelProposal[]>
	>(() => new Map());

	const loadProposalsFor = useCallback(async (graphId: string) => {
		try {
			const res = await electrobun.rpc!.request.listSubsystemModelProposals({
				graphId,
				includeResolved: true,
			});
			if (!res.ok) return;
			const proposals = res.proposals ?? [];
			setProposalsByGraph((prev) => {
				const next = new Map(prev);
				next.set(graphId, proposals);
				return next;
			});
		} catch {
			// best-effort — the Runs section just won't show outcomes
		}
	}, []);

	/** Open the live events tab for a run's session (no auto-open on start). */
	const openRunEvents = useCallback(
		(sessionId: string | undefined, graphId: string, title?: string, agent?: string) => {
			if (!sessionId) return;
			void electrobun.rpc!.request
				.openMaintainEvents({ sessionId, graphId, title, agent })
				.catch(() => {});
		},
		[],
	);
	// Repo filter (owner/name, lowercased) narrowing the model + proposal lists,
	// mirroring the Subsystems tab's repo drilldown.
	const [repoKey, setRepoKey] = useState<string | null>(null);

	const loadInFlight = useRef(false);
	const loadQueued = useRef(false);

	const load = useCallback(async () => {
		if (loadInFlight.current) {
			loadQueued.current = true;
			return;
		}
		loadInFlight.current = true;
		try {
			const [res, runsRes] = await Promise.all([
				electrobun.rpc!.request.getMaintenanceOverview({}),
				electrobun.rpc!.request
					.listSubsystemModelRuns({})
					.catch((): { ok: boolean; runs: SubsystemModelRun[] } => ({
						ok: false,
						runs: [],
					})),
			]);
			if (!res.ok) {
				setError(res.error ?? "Failed to load maintenance overview");
				return;
			}
			setError(null);
			setOverview(res.overview ?? null);
			const grouped = new Map<string, SubsystemModelRun[]>();
			for (const run of runsRes.runs ?? []) {
				const arr = grouped.get(run.graphId);
				if (arr) arr.push(run);
				else grouped.set(run.graphId, [run]);
			}
			setRunsByGraph((prev) =>
				JSON.stringify([...prev]) === JSON.stringify([...grouped])
					? prev
					: grouped,
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			loadInFlight.current = false;
			if (loadQueued.current) {
				loadQueued.current = false;
				void load();
			}
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	// Mirror the Jev confidence threshold so the "Accept confident" button
	// agrees with the host's auto-accept gate, and restore the last repo the
	// user picked in the filter (unless they already picked one this session).
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await electrobun.rpc!.request.getSettings({});
				if (!cancelled && res) {
					setConfidenceThreshold(
						res.autoAcceptSubsystemModelConfidenceThreshold,
					);
					setRepoKey((current) => current ?? res.maintenanceRepoKey ?? null);
				}
			} catch {
				// keep the default threshold / first repo
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// Persist the repo pick so the Maintainer tab reopens on it next time.
	const onSelectRepo = useCallback((key: string) => {
		setRepoKey(key);
		void (async () => {
			try {
				await electrobun.rpc!.request.setSettings({
					settings: { maintenanceRepoKey: key },
				});
			} catch {
				// best-effort — the pick still applies for this session
			}
		})();
	}, []);

	// Re-paint when a background re-audit finishes (or a run/proposal changes).
	useEffect(() => {
		const refresh = () => void load();
		subsystemModelChangeSubscribers.add(refresh);
		subsystemModelProposalsChangeSubscribers.add(refresh);
		subsystemModelMaintainChangeSubscribers.add(refresh);
		subsystemModelRunsChangeSubscribers.add(refresh);
		return () => {
			subsystemModelChangeSubscribers.delete(refresh);
			subsystemModelProposalsChangeSubscribers.delete(refresh);
			subsystemModelMaintainChangeSubscribers.delete(refresh);
			subsystemModelRunsChangeSubscribers.delete(refresh);
		};
	}, [load]);

	// Live OpenCode SSE feed, keyed by the graphId the host stamps on it.
	useEffect(() => {
		const onFeed = (payload: StudioMessages["opencodeLiveFeedChanged"]) => {
			const gid = payload.graphId;
			if (!gid) return;
			const last = payload.events[payload.events.length - 1];
			setFeeds((prev) => ({
				...prev,
				[gid]: {
					status: payload.status,
					events: payload.total,
					agent: payload.agent ?? prev[gid]?.agent,
					title: payload.title ?? prev[gid]?.title,
					last: last?.summary ?? prev[gid]?.last,
					lastAt: last?.at ?? prev[gid]?.lastAt,
					error: payload.error ?? prev[gid]?.error,
					sessionId: payload.sessionId ?? prev[gid]?.sessionId,
				},
			}));
		};
		opencodeLiveFeedSubscribers.add(onFeed);
		return () => {
			opencodeLiveFeedSubscribers.delete(onFeed);
		};
	}, []);

	// The picker modal handled the start; reflect its outcome.
	const onMaintainStarted = useCallback(
		(info: { model: string; alreadyRunning?: boolean }) => {
			if (info.alreadyRunning) {
				setError("Maintenance is already running for this model.");
			}
			setPickTarget(null);
			void load();
		},
		[load],
	);

	// Sequentially accept the confident pending proposals, then refresh so the
	// ledger and proposal counts land in their post-accept state.
	const runAcceptConfident = useCallback(
		async (entries: MaintenanceOverviewProposal[]) => {
			if (entries.length === 0) return;
			setAcceptBatch(
				Object.fromEntries(
					entries.map((e) => [e.proposal.id, { status: "pending" as const }]),
				),
			);
			setAcceptBatchRunning(true);
			for (const entry of entries) {
				setAcceptBatch((prev) => ({
					...prev,
					[entry.proposal.id]: { status: "running" },
				}));
				try {
					const res = await electrobun.rpc!.request.acceptSubsystemModelProposal({
						graphId: entry.graphId,
						proposalId: entry.proposal.id,
					});
					setAcceptBatch((prev) => ({
						...prev,
						[entry.proposal.id]: res.ok
							? { status: "done" }
							: { status: "error", error: res.error ?? "Accept failed" },
					}));
				} catch (err) {
					setAcceptBatch((prev) => ({
						...prev,
						[entry.proposal.id]: {
							status: "error",
							error: err instanceof Error ? err.message : String(err),
						},
					}));
				}
			}
			setAcceptBatchRunning(false);
			await load();
		},
		[load],
	);

	// Open the model in a subsystem-model tab (host resolves it like the
	// Subsystems tab's row double-click). From the Maintainer tab the sidebar
	// always lands on the issues view; a lane icon additionally focuses it on
	// that verification layer.
	const onModelOpen = useCallback(
		(m: MaintenanceOverviewModel, focusIssueCategory?: SubsystemVerificationLane) => {
			void electrobun.rpc!.request.openSubsystemModel({
				graphId: m.graphId,
				showIssues: true,
				...(focusIssueCategory ? { focusIssueCategory } : {}),
			});
		},
		[],
	);

	const onRowDoubleClick = useCallback(
		(e: React.MouseEvent, m: MaintenanceOverviewModel) => {
			// Let the row's buttons keep their own double-click behavior.
			if ((e.target as HTMLElement).closest("button")) return;
			onModelOpen(m);
		},
		[onModelOpen],
	);

	// Delete every pending proposal across all models (keeps accepted/rejected
	// history and never touches the model files themselves).
	const runDeleteAll = useCallback(async () => {
		setDeleteAllRunning(true);
		setDeleteAllError(null);
		try {
			const res =
				await electrobun.rpc!.request.deleteAllSubsystemModelProposals({});
			if (!res.ok) {
				setDeleteAllError(res.error ?? "Failed to delete proposals");
			}
		} catch (err) {
			setDeleteAllError(err instanceof Error ? err.message : String(err));
		}
		setDeleteAllRunning(false);
		setDeleteAllOpen(false);
		await load();
	}, [load]);

	const pending = overview?.pendingProposals ?? [];
	const auditing = overview?.auditing ?? [];

	// Repo filter facets: per-model repos and the distinct repo breaks (with
	// model counts) fed to the filter sidebar.
	const reposByGraph = useMemo(() => {
		const map = new Map<string, Array<{ owner: string; name: string }>>();
		for (const m of overview?.models ?? []) {
			map.set(m.graphId, m.repos ?? []);
		}
		return map;
	}, [overview]);
	const repoBreaks = useMemo(() => repoBreakdown(overview), [overview]);
	// There is no "all repos" view — always keep one repo selected, defaulting
	// to the first (and re-selecting if the current one disappears). Resolve it
	// during render rather than in an effect: an effect would paint every model
	// for one frame after the overview loads before narrowing to a repo, which
	// reads as a flash.
	const activeRepoKey = useMemo(() => {
		if (repoBreaks.length === 0) return null;
		const exists =
			repoKey != null &&
			repoBreaks.some((r) => `${r.owner}/${r.name}`.toLowerCase() === repoKey);
		return exists
			? repoKey
			: `${repoBreaks[0].owner}/${repoBreaks[0].name}`.toLowerCase();
	}, [repoBreaks, repoKey]);
	const matchesRepo = (m: MaintenanceOverviewModel) =>
		activeRepoKey == null ||
		(m.repos ?? []).some(
			(r) => `${r.owner}/${r.name}`.toLowerCase() === activeRepoKey,
		);
	const visibleModels = useMemo(
		() => (overview?.models ?? []).filter(matchesRepo),
		[overview, activeRepoKey],
	);
	const visiblePending = useMemo(
		() =>
			activeRepoKey == null
				? pending
				: pending.filter((e) =>
						(reposByGraph.get(e.graphId) ?? []).some(
							(r) => `${r.owner}/${r.name}`.toLowerCase() === activeRepoKey,
						),
					),
		[activeRepoKey, pending, reposByGraph],
	);
	const inRepo = (gid: string) =>
		activeRepoKey == null ||
		(reposByGraph.get(gid) ?? []).some(
			(r) => `${r.owner}/${r.name}`.toLowerCase() === activeRepoKey,
		);
	const visibleRunning = useMemo(
		() => (overview?.running ?? []).filter(inRepo),
		[overview, activeRepoKey, reposByGraph],
	);
	const visibleAuditing = useMemo(
		() => (overview?.auditing ?? []).filter(inRepo),
		[overview, activeRepoKey, reposByGraph],
	);

	// Visible pending proposals whose Jev second opinion already cleared the
	// auto-accept confidence bar. Missing opinions / scoring errors never
	// qualify, mirroring `shouldAutoAcceptOnConfidence` host-side.
	const confidentPending = useMemo(
		() =>
			visiblePending.filter((e) => {
				const o = e.proposal.secondOpinion;
				return !o?.error && o != null && o.confidence >= confidenceThreshold;
			}),
		[visiblePending, confidenceThreshold],
	);

	// Union of model runs the overview knows about and feeds still streaming,
	// both narrowed to the selected repo.
	const activeFeeds = Object.entries(feeds).filter(
		([gid, f]) =>
			(f.status === "running" || f.status === "starting") && inRepo(gid),
	);
	const inFlightGraphs = Array.from(
		new Set([
			...visibleRunning,
			...activeFeeds.map(([gid]) => gid),
		]),
	);

	// Batch "Run maintenance on all" over the repo-filtered visible models.
	const [repoBatch, setRepoBatch] = useState<
		Record<
			string,
			{
				status: "pending" | "running" | "done" | "skipped" | "stopped" | "error";
				error?: string;
			}
		>
	>({});
	const [repoBatchActive, setRepoBatchActive] = useState(false);
	const [repoBatchStopping, setRepoBatchStopping] = useState(false);
	/** Set to stop the batch after the in-flight model finishes. */
	const repoBatchCancel = useRef(false);

	/** Resolve when a model's background Maintain run finishes (done/error). */
	const waitForMaintainDone = useCallback(
		(graphId: string): { promise: Promise<void>; cancel: () => void } => {
			let resolve!: () => void;
			const promise = new Promise<void>((r) => {
				resolve = r;
			});
			const handler = (
				payload: StudioMessages["subsystemModelMaintainChanged"],
			) => {
				if (payload.graphId !== graphId) return;
				if (payload.status === "done" || payload.status === "error") {
					subsystemModelMaintainChangeSubscribers.delete(handler);
					resolve();
				}
			};
			subsystemModelMaintainChangeSubscribers.add(handler);
			return {
				promise,
				cancel: () => subsystemModelMaintainChangeSubscribers.delete(handler),
			};
		},
		[],
	);

	// Run maintenance across the visible (repo-filtered) models, one at a time.
	// Models with pending proposals are skipped so a human can review them first.
	const runRepoMaintenance = useCallback(async () => {
		if (repoBatchActive) return;
		const targets = visibleModels;
		repoBatchCancel.current = false;
		setRepoBatchStopping(false);
		setRepoBatchActive(true);
		setRepoBatch(
			Object.fromEntries(
				targets.map((m) => [m.graphId, { status: "pending" as const }]),
			),
		);
		try {
			for (const m of targets) {
				// Stop requested: halt after the model already in flight.
				if (repoBatchCancel.current) break;
				if (m.pendingProposalCount > 0) {
					setRepoBatch((prev) => ({
						...prev,
						[m.graphId]: { status: "skipped" },
					}));
					continue;
				}
				setRepoBatch((prev) => ({
					...prev,
					[m.graphId]: { status: "running" },
				}));
				const waiter = waitForMaintainDone(m.graphId);
				try {
					const res =
						await electrobun.rpc!.request.maintainSubsystemModel({
							graphId: m.graphId,
						});
					if (!res.ok) {
						waiter.cancel();
						setRepoBatch((prev) => ({
							...prev,
							[m.graphId]: { status: "error", error: res.error },
						}));
						continue;
					}
					if (res.alreadyRunning || res.started === false) {
						waiter.cancel();
						setRepoBatch((prev) => ({
							...prev,
							[m.graphId]: { status: "skipped" },
						}));
						continue;
					}
					await waiter.promise;
					setRepoBatch((prev) => ({
						...prev,
						[m.graphId]: { status: "done" },
					}));
				} catch (err) {
					waiter.cancel();
					setRepoBatch((prev) => ({
						...prev,
						[m.graphId]: {
							status: "error",
							error: err instanceof Error ? err.message : String(err),
						},
					}));
				}
			}
			if (repoBatchCancel.current) {
				setRepoBatch((prev) => {
					const next = { ...prev };
					for (const [gid, entry] of Object.entries(next)) {
						if (entry.status === "pending") next[gid] = { status: "stopped" };
					}
					return next;
				});
			}
		} finally {
			setRepoBatchStopping(false);
			setRepoBatchActive(false);
		}
	}, [repoBatchActive, visibleModels, waitForMaintainDone]);

	const repoBatchDone = Object.values(repoBatch).filter(
		(e) => e.status === "done",
	).length;
	const repoBatchSkipped = Object.values(repoBatch).filter(
		(e) => e.status === "skipped",
	).length;
	const repoBatchStopped = Object.values(repoBatch).filter(
		(e) => e.status === "stopped",
	).length;

	return (
		<div
			role={overlay ? "dialog" : undefined}
			aria-modal={overlay ? true : undefined}
			aria-label="Maintenance agent"
			onClick={overlay ? onClose : undefined}
			style={{
				fontFamily: theme.fonts.body,
				...(overlay
					? {
							position: "fixed",
							inset: 0,
							zIndex: 2147483000,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							background: "rgba(0,0,0,0.55)",
						}
					: {
							flex: 1,
							minHeight: 0,
							display: "flex",
							flexDirection: "column",
							background: theme.colors.background,
							color: theme.colors.text,
						}),
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					...(overlay
						? {
								width: "min(720px, calc(100vw - 48px))",
								maxHeight: "min(84vh, 780px)",
								background: theme.colors.surface,
								border: `1px solid ${theme.colors.border}`,
								borderRadius: 12,
								padding: 24,
								boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
								color: theme.colors.text,
							}
: {
							flex: 1,
							minHeight: 0,
							padding: 0,
							color: theme.colors.text,
						}),
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "baseline",
						justifyContent: "space-between",
						gap: 12,
						padding: `${scalePad}px ${scalePad}px 0`,
						marginBottom: 4,
					}}
				>
					<span
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							fontSize: theme.fontSizes[3],
							fontWeight: 600,
						}}
					>
						<Bot size={18} style={{ color: theme.colors.primary }} />
						Maintainer
						<span
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								marginLeft: 6,
								paddingLeft: 10,
								borderLeft: `1px solid ${theme.colors.border}`,
							}}
						>
							{LANE_META.map(({ lane, label, Icon }) => (
								<LaneIconButton
									key={lane}
									lane={lane}
									label={label}
									Icon={Icon}
									color={theme.colors.primary}
									textColor={theme.colors.text}
									hoverBackground={
										theme.colors.backgroundTertiary ??
										theme.colors.backgroundSecondary ??
										theme.colors.border
									}
									borderColor={theme.colors.border ?? "#333"}
									fontSize={theme.fontSizes[1]}
									fontFamily={theme.fonts.body}
									onOpen={setLaneHelp}
								/>
							))}
						</span>
					</span>
					<div
						style={{
							display: "flex",
							alignItems: "baseline",
							gap: 8,
						}}
					>
						<button
							type="button"
							onClick={() => setAuditAllOpen(true)}
							title="Dry-run deterministic audit of every visible model (no agent, no mutations)."
							style={{
								background: "transparent",
								border: `1px solid ${theme.colors.border ?? "#333"}`,
								color: theme.colors.text,
								cursor: "pointer",
								fontSize: theme.fontSizes[2],
								fontFamily: theme.fonts.body,
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
								padding: "4px 10px",
								borderRadius: 6,
							}}
						>
							<ScanSearch size={13} />
							Audit all
						</button>
						<button
							type="button"
							disabled={repoBatchActive || visibleModels.length === 0}
							onClick={() => void runRepoMaintenance()}
							title="Run maintenance on every visible model in this repo, one at a time. Models with pending proposals are skipped."
							style={{
								background: "transparent",
								border: `1px solid ${theme.colors.primary}`,
								color: theme.colors.primary,
								cursor: repoBatchActive ? "default" : "pointer",
								opacity: repoBatchActive ? 0.6 : 1,
								fontSize: theme.fontSizes[2],
								fontFamily: theme.fonts.body,
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
								padding: "4px 10px",
								borderRadius: 6,
							}}
						>
							{repoBatchActive ? (
								<Loader2 size={13} className="principal-studio-spin" />
							) : (
								<Play size={13} />
							)}
							{repoBatchActive
								? `Running… ${repoBatchDone}/${visibleModels.length}`
								: "Run maintenance on all"}
						</button>
						{repoBatchActive && (
							<button
								type="button"
								disabled={repoBatchStopping}
								onClick={() => {
									repoBatchCancel.current = true;
									setRepoBatchStopping(true);
								}}
								title="Stop after the model currently running finishes."
								style={{
									background: "transparent",
									border: `1px solid ${theme.colors.error ?? "#e5534b"}`,
									color: theme.colors.error ?? "#e5534b",
									cursor: repoBatchStopping ? "default" : "pointer",
									opacity: repoBatchStopping ? 0.6 : 1,
									fontSize: theme.fontSizes[2],
									fontFamily: theme.fonts.body,
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									padding: "4px 10px",
									borderRadius: 6,
								}}
							>
								<Square size={13} />
								{repoBatchStopping ? "Stopping…" : "Stop"}
							</button>
						)}
						{!repoBatchActive && repoBatchSkipped > 0 && (
							<span style={{ fontSize: theme.fontSizes[1], color: muted }}>
								{repoBatchSkipped} skipped (pending proposals)
							</span>
						)}
						{!repoBatchActive && repoBatchStopped > 0 && (
							<span style={{ fontSize: theme.fontSizes[1], color: muted }}>
								{repoBatchStopped} stopped
							</span>
						)}
						{pending.length > 0 && (
							<button
								type="button"
								onClick={() => {
									setDeleteAllError(null);
									setDeleteAllOpen(true);
								}}
								title="Delete every pending proposal across all models (keeps resolved history, does not change models)."
								style={{
									background: "transparent",
									border: `1px solid ${theme.colors.error ?? "#e5534b"}`,
									color: theme.colors.error ?? "#e5534b",
									cursor: "pointer",
									fontSize: theme.fontSizes[2],
									fontFamily: theme.fonts.body,
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									padding: "4px 10px",
									borderRadius: 6,
								}}
							>
								<Trash2 size={13} />
								Delete all
							</button>
						)}
						{confidentPending.length > 0 && (
							<button
								type="button"
								onClick={() => {
									setAcceptBatch({});
									setAcceptConfidentOpen(true);
								}}
								title={`Accept every visible proposal whose Jev second opinion cleared ${Math.round(confidenceThreshold * 100)}%.`}
								style={{
									background: "transparent",
									border: `1px solid ${theme.colors.success ?? "#2da44e"}`,
									color: theme.colors.success ?? "#2da44e",
									cursor: "pointer",
									fontSize: theme.fontSizes[2],
									fontFamily: theme.fonts.body,
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									padding: "4px 10px",
									borderRadius: 6,
								}}
							>
								<BadgeCheck size={13} />
								Accept {confidentPending.length} confident
							</button>
						)}
						{overlay && (
							<button
								type="button"
								onClick={onClose}
								style={{
									background: "transparent",
									border: "none",
									color: muted,
									cursor: "pointer",
									fontSize: theme.fontSizes[2],
								}}
							>
								Close
							</button>
						)}
					</div>
				</div>
				{error && (
					<p
						style={{
							margin: "0 0 12px",
							padding: `0 ${scalePad}px`,
							color: theme.colors.error ?? "#e5534b",
							fontSize: theme.fontSizes[1],
						}}
					>
						{error}
					</p>
				)}

				{overview === null && !error && (
					<p
						style={{
							padding: `0 ${scalePad}px`,
							color: muted,
							fontSize: theme.fontSizes[2],
						}}
					>
						Loading…
					</p>
				)}

				{overview && (
					<div
						style={{
							flex: 1,
							minHeight: 0,
							display: "flex",
							flexDirection: "row",
							gap: 18,
						}}
					>
						<MaintenanceRepoList
							repoBreaks={repoBreaks}
							selectedKey={activeRepoKey}
							onSelect={onSelectRepo}
							scalePad={scalePad}
						/>
						<div
							style={{
								flex: 1,
								minWidth: 0,
								minHeight: 0,
								overflowY: "auto",
								display: "flex",
								flexDirection: "column",
								gap: 16,
								padding: `${scalePad ? 12 : 0}px ${scalePad}px 8px 0`,
							}}
						>
				{inFlightGraphs.length > 0 && (
					<div style={{ marginBottom: 16 }}>
						<div
							style={{
								fontSize: theme.fontSizes[1],
								textTransform: "uppercase",
								letterSpacing: 0.3,
								color: muted,
								marginBottom: 8,
							}}
						>
							Maintainer progress
						</div>
						{inFlightGraphs.map((gid) => {
							const m = overview?.models.find((x) => x.graphId === gid);
							const f = feeds[gid];
							const title = m?.title || f?.title || gid;
							const progressMeta = AGENT_META.find(
								(a) => a.agent === f?.agent,
							);
							return (
								<div
									key={gid}
									onClick={() =>
										openRunEvents(
											feeds[gid]?.sessionId,
											gid,
											title,
											feeds[gid]?.agent,
										)
									}
									style={{
										padding: "10px 12px",
										borderRadius: 8,
										border: `1px solid ${theme.colors.border}`,
										background: theme.colors.background,
										marginBottom: 8,
										cursor: feeds[gid]?.sessionId ? "pointer" : "default",
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											marginBottom: 4,
										}}
									>
										<span
											className="principal-studio-running-border"
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 5,
												flexShrink: 0,
												height: 26,
												padding: "0 8px",
												borderRadius: 6,
												fontSize: theme.fontSizes[1],
												fontFamily: theme.fonts.body,
												border: `1px solid ${theme.colors.primary}`,
												color: theme.colors.primary,
												whiteSpace: "nowrap",
											}}
										>
											{progressMeta && <progressMeta.Icon size={12} />}
											{progressMeta?.label ?? f?.agent ?? "maintain"}
										</span>
										<span
											style={{
												flex: 1,
												minWidth: 0,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
												fontWeight: 600,
											}}
										>
											{title}
										</span>
										{f?.agent && (
											<code style={{ fontSize: theme.fontSizes[1], color: muted }}>
												{f.agent}
											</code>
										)}
										{f != null && (
											<span
												style={{
													fontSize: theme.fontSizes[1],
													color: muted,
													fontVariantNumeric: "tabular-nums",
												}}
											>
												{f.events} events · {f.status}
											</span>
										)}
									</div>
									<div
										style={{
											fontSize: theme.fontSizes[1],
											color: muted,
											fontFamily:
												theme.fonts.monospace ?? "ui-monospace, monospace",
											lineHeight: 1.45,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{f
											? f.last
												? f.last
												: f.status === "starting"
													? "Starting OpenCode session…"
													: `${f.status}…`
											: "Preparing OpenCode session…"}
									</div>
									{f?.error && (
										<div
											style={{
												marginTop: 4,
												color: theme.colors.error ?? "#e5534b",
												fontSize: theme.fontSizes[1],
											}}
										>
											{f.error}
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}

				{overview && (
					<>
						<div
							style={{
								fontSize: theme.fontSizes[1],
								textTransform: "uppercase",
								letterSpacing: 0.3,
								color: muted,
								marginBottom: 8,
							}}
						>
							Models
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							{visibleModels.length === 0 && (
								<p style={{ color: muted, fontSize: theme.fontSizes[2] }}>
									{overview.models.length === 0
										? "No subsystem models."
										: "No models reference this repo."}
								</p>
							)}
							{visibleModels.map((m) => {
const rowBusy =
								overview.running.includes(m.graphId) ||
								auditing.includes(m.graphId);
								const showRun =
									(m.open > 0 || m.blocked > 0) &&
									m.pendingProposalCount === 0;
								const modelRuns = runsByGraph.get(m.graphId) ?? [];
								const runsOpen = expandedRunsIds.has(m.graphId);
								// Which agent is running right now: the live feed's agent
								// while a session streams, else the newest running run row.
								const maintainRunning = overview.running.includes(m.graphId);
								const feed = feeds[m.graphId];
								const feedAgent =
									feed && (feed.status === "running" || feed.status === "starting")
										? feed.agent
										: undefined;
								const activeAgent = maintainRunning
									? (feedAgent ??
										modelRuns.find((r) => r.status === "running")?.agent)
									: undefined;
								return (
									<div
										key={m.graphId}
										onClick={() => {
											const expanding = !expandedRunsIds.has(m.graphId);
											setExpandedRunsIds((prev) => {
												const next = new Set(prev);
												if (next.has(m.graphId)) next.delete(m.graphId);
												else next.add(m.graphId);
												return next;
											});
											if (expanding) void loadProposalsFor(m.graphId);
										}}
										onDoubleClick={(e) => onRowDoubleClick(e, m)}
										style={{
											borderRadius: 6,
											border: `1px solid ${theme.colors.border}`,
											background: theme.colors.background,
											fontSize: theme.fontSizes[2],
											cursor: "pointer",
										}}
									>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: 8,
												padding: "8px 10px",
											}}
										>
										<span style={{ flex: 1, minWidth: 0 }}>{m.title}</span>
										{m.blocked > 0 && (
											<span
												title="Claims blocked on an unavailable repo or graphify cache. Run maintenance to rebuild caches; cloned repos still need the repo available locally."
												style={{
													fontSize: theme.fontSizes[1],
													color: muted,
												}}
											>
												{m.blocked} blocked
											</span>
										)}
										{modelRuns.length > 0 && (
											<button
												type="button"
												aria-expanded={runsOpen}
												onClick={(e) => {
													e.stopPropagation();
													const expanding = !expandedRunsIds.has(m.graphId);
													setExpandedRunsIds((prev) => {
														const next = new Set(prev);
														if (next.has(m.graphId))
															next.delete(m.graphId);
														else next.add(m.graphId);
														return next;
													});
													if (expanding) void loadProposalsFor(m.graphId);
												}}
												title={
													runsOpen
														? "Hide recent runs"
														: "Show recent runs for this model"
												}
												style={{
													padding: "0 10px",
													height: 26,
													borderRadius: 6,
													fontSize: theme.fontSizes[1],
													fontFamily: theme.fonts.body,
													background: runsOpen
														? (theme.colors.primary ?? "#2da44e")
														: "transparent",
													color: runsOpen
														? theme.colors.background
														: muted,
													border: `1px solid ${
														runsOpen
															? theme.colors.primary
															: (theme.colors.border ?? "#333")
													}`,
													cursor: "pointer",
													display: "inline-flex",
													alignItems: "center",
													gap: 6,
													flexShrink: 0,
												}}
											>
												<History size={11} />
												Runs ({modelRuns.length})
											</button>
										)}
										{m.pendingProposalCount > 0 && (
											<button
												type="button"
												onMouseDown={(e) => e.stopPropagation()}
												onClick={(e) => {
													e.stopPropagation();
													setProposalsTarget({
														graphId: m.graphId,
														title: m.title,
													});
												}}
												aria-label={`Review ${m.pendingProposalCount} pending proposal${
													m.pendingProposalCount === 1 ? "" : "s"
												} for ${m.title}`}
												style={{
													padding: "0 10px",
													height: 26,
													borderRadius: 6,
													fontSize: theme.fontSizes[1],
													fontFamily: theme.fonts.body,
													background: "transparent",
													color: theme.colors.primary,
													border: `1px solid ${theme.colors.primary}`,
													cursor: "pointer",
													display: "inline-flex",
													alignItems: "center",
													gap: 6,
													flexShrink: 0,
												}}
											>
												<ListChecks size={11} />
												{m.pendingProposalCount} proposal
												{m.pendingProposalCount === 1 ? "" : "s"}
											</button>
										)}
										{showRun && (
											<button
												type="button"
												disabled={rowBusy}
												onClick={(e) => {
													e.stopPropagation();
													setPickTarget(m);
												}}
												title="Run a background maintenance pass: audits this model and drafts a proposal for the first fixable finding (does not auto-accept)."
												style={{
													padding: "0 10px",
													height: 26,
													borderRadius: 6,
													fontSize: theme.fontSizes[1],
													fontFamily: theme.fonts.body,
													background: "transparent",
													color: theme.colors.primary,
													border: `1px solid ${theme.colors.primary}`,
													cursor: rowBusy ? "default" : "pointer",
													opacity: rowBusy ? 0.6 : 1,
													display: "inline-flex",
													alignItems: "center",
													gap: 6,
													flexShrink: 0,
												}}
											>
												{rowBusy ? (
													<Loader2 size={11} className="principal-studio-spin" />
												) : (
													<Play size={11} />
												)}
												{rowBusy ? "Running…" : "Run maintenance"}
											</button>
										)}
										<LaneBadges
											lanes={m.lanes ?? {}}
											colors={theme.colors}
											muted={muted}
											onOpenLane={(lane) => onModelOpen(m, lane)}
										/>
										</div>
										{maintainRunning && (
											<div
												style={{
													display: "flex",
													flexWrap: "wrap",
													gap: 5,
													padding: "0 10px 8px",
												}}
											>
												{AGENT_META.map(({ agent, label, Icon }) => {
													const active = agent === activeAgent;
													return (
														<span
															key={agent}
															className={
																active
																	? "principal-studio-running-border"
																	: undefined
															}
															style={{
																display: "inline-flex",
																alignItems: "center",
																justifyContent: "center",
																gap: 5,
																width: 132,
																height: 26,
																padding: "0 8px",
																borderRadius: 6,
																fontSize: theme.fontSizes[1],
																fontFamily: theme.fonts.body,
																whiteSpace: "nowrap",
																border: `1px solid ${
																	active
																		? theme.colors.primary
																		: (theme.colors.border ?? "#333")
																}`,
																background: "transparent",
																color: active
																	? theme.colors.primary
																	: muted,
																opacity: active ? 1 : 0.5,
																flexShrink: 0,
															}}
														>
															<Icon size={12} />
															{label}
														</span>
													);
												})}
											</div>
										)}
										{runsOpen && (
											<div
												onClick={(e) => e.stopPropagation()}
												style={{
													borderTop: `1px solid ${theme.colors.border}`,
													padding: "6px 10px 8px",
													display: "flex",
													flexDirection: "column",
													gap: 6,
												}}
											>
												<FixCycleStrip nextRoute={m.nextRoute} />
												<div
													style={{
														display: "flex",
														flexDirection: "column",
														gap: 2,
													}}
												>
													{modelRuns.length === 0 ? (
														<div
															style={{
																fontSize: theme.fontSizes[1],
																color: muted,
															}}
														>
															No runs yet.
														</div>
													) : (
														modelRuns.map((run) => (
														<RunRow
															key={run.id}
															run={run}
															graphTitle={m.title}
															proposals={proposalsForRun(
																proposalsByGraph.get(m.graphId),
																run,
															)}
															onOpen={
																run.sessionId
																	? () =>
																			openRunEvents(
																				run.sessionId,
																				run.graphId,
																				m.title,
																				run.agent,
																			)
																	: undefined
															}
														/>
														))
													)}
												</div>
											</div>
										)}
									</div>
								);
							})}
						</div>
					</>
				)}

				{overview && pending.length === 0 && (
					<p
						style={{
							marginTop: 16,
							fontSize:
								overview.needsWork === 0 &&
								overview.running.length === 0 &&
								overview.auditing.length === 0
									? theme.fontSizes[2]
									: theme.fontSizes[1],
							color:
								overview.needsWork === 0 &&
								overview.running.length === 0 &&
								overview.auditing.length === 0
									? (theme.colors.success ?? "#2da44e")
									: muted,
						}}
					>
						{overview.running.length > 0
							? "Maintainer is auditing to produce the next proposal…"
							: overview.auditing.length > 0
								? "Re-auditing to confirm your accepted proposal…"
								: overview.needsWork === 0
									? "Fully verified — nothing to maintain."
									: "No proposal surfaced yet — run maintenance on a model above to draft the next one."}
					</p>
				)}
						</div>
					</div>
				)}
			</div>
			{pickTarget && (
				<MaintainModelPickerModal
					graphId={pickTarget.graphId}
					title={pickTarget.title}
					mode={pickTarget.verdict === "issues" ? "issues" : "verify"}
					onClose={() => setPickTarget(null)}
					onStarted={onMaintainStarted}
				/>
			)}
			{auditAllOpen && (
				<MaintenanceAuditAllModal
					models={visibleModels}
					onClose={() => {
						setAuditAllOpen(false);
						void load();
					}}
				/>
			)}
			{acceptConfidentOpen &&
				createPortal(
					<div
						role="dialog"
						aria-modal
						aria-label="Accept confident proposals"
						onClick={() => {
							if (!acceptBatchRunning) setAcceptConfidentOpen(false);
						}}
						style={{
							position: "fixed",
							inset: 0,
							zIndex: 2147483000,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							background: "rgba(0,0,0,0.55)",
							fontFamily: theme.fonts.body,
						}}
					>
						<div
							onClick={(e) => e.stopPropagation()}
							style={{
								width: "min(560px, calc(100vw - 48px))",
								maxHeight: "min(75vh, 680px)",
								display: "flex",
								flexDirection: "column",
								background: theme.colors.surface,
								border: `1px solid ${theme.colors.border}`,
								borderRadius: 12,
								overflow: "hidden",
								boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
								color: theme.colors.text,
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "flex-start",
									justifyContent: "space-between",
									gap: 12,
									padding: "14px 20px",
									borderBottom: `1px solid ${theme.colors.border}`,
									background: theme.colors.background,
								}}
							>
								<div style={{ minWidth: 0, flex: 1 }}>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											marginBottom: 4,
											fontSize: theme.fontSizes[3],
											fontWeight: 600,
										}}
									>
										<BadgeCheck
											size={16}
											style={{ color: theme.colors.success ?? "#2da44e" }}
										/>
										Accept {confidentPending.length} confident proposal
										{confidentPending.length === 1 ? "" : "s"}
									</div>
									<div
										style={{
											fontSize: theme.fontSizes[1],
											color: muted,
											lineHeight: 1.4,
										}}
									>
										{acceptBatchRunning
											? "Applying patches…"
											: `Each cleared the Jev confidence bar of ${Math.round(confidenceThreshold * 100)}%. Lower-scoring proposals stay pending.`}
									</div>
								</div>
							</div>

							<div
								style={{
									flex: 1,
									minHeight: 0,
									overflowY: "auto",
									padding: "12px 20px 16px",
									display: "flex",
									flexDirection: "column",
									gap: 6,
								}}
							>
								{confidentPending.map((entry) => {
									const state = acceptBatch[entry.proposal.id];
									const pct = Math.round(
										(entry.proposal.secondOpinion?.confidence ?? 0) * 100,
									);
									return (
										<div
											key={entry.proposal.id}
											style={{
												display: "flex",
												alignItems: "center",
												gap: 10,
												padding: "8px 10px",
												borderRadius: 6,
												border: `1px solid ${theme.colors.border}`,
												background: theme.colors.background,
												fontSize: theme.fontSizes[2],
											}}
										>
											{state?.status === "running" ? (
												<Loader2
													size={13}
													className="principal-studio-spin"
													style={{ flexShrink: 0, color: theme.colors.primary }}
												/>
											) : state?.status === "error" ? (
												<span
													style={{
														flexShrink: 0,
														color: theme.colors.error ?? "#e5534b",
													}}
												>
													✕
												</span>
											) : state?.status === "done" ? (
												<Check
													size={13}
													style={{
														flexShrink: 0,
														color: theme.colors.success ?? "#2da44e",
													}}
												/>
											) : (
												<span
													style={{
														flexShrink: 0,
														color: theme.colors.success ?? "#2da44e",
													}}
												>
													• {pct}%
												</span>
											)}
											<span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
												{entry.title}
											</span>
											<span
												style={{
													fontSize: theme.fontSizes[1],
													color: state?.status === "error"
														? (theme.colors.error ?? "#e5534b")
														: muted,
													maxWidth: 220,
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												}}
											>
												{state?.error ??
													(state?.status === "running"
														? "Accepting…"
														: state?.status === "done"
															? "Accepted"
															: `Jev ${pct}%`)}
											</span>
										</div>
									);
								})}
							</div>

							<div
								style={{
									display: "flex",
									justifyContent: "flex-end",
									gap: 8,
									padding: "12px 20px",
									borderTop: `1px solid ${theme.colors.border}`,
									background: theme.colors.background,
								}}
							>
								<button
									type="button"
									disabled={acceptBatchRunning}
									onClick={() => setAcceptConfidentOpen(false)}
									style={{
										padding: "0 12px",
										height: 32,
										borderRadius: 6,
										fontSize: theme.fontSizes[2],
										fontFamily: theme.fonts.body,
										background: "transparent",
										color: theme.colors.text,
										border: `1px solid ${theme.colors.border}`,
										cursor: acceptBatchRunning ? "default" : "pointer",
										opacity: acceptBatchRunning ? 0.6 : 1,
									}}
								>
									{acceptBatchRunning ? "Close" : "Cancel"}
								</button>
								{!acceptBatchRunning &&
									Object.keys(acceptBatch).length === 0 && (
										<button
											type="button"
											onClick={() => void runAcceptConfident(confidentPending)}
											style={{
												padding: "0 14px",
												height: 32,
												borderRadius: 6,
												fontSize: theme.fontSizes[2],
												fontWeight: 500,
												fontFamily: theme.fonts.body,
												background: theme.colors.primary,
												color: theme.colors.background,
												border: `1px solid ${theme.colors.primary}`,
												cursor: "pointer",
												display: "inline-flex",
												alignItems: "center",
												gap: 6,
											}}
										>
											<BadgeCheck size={13} />
											Accept {confidentPending.length}
										</button>
									)}
								{!acceptBatchRunning &&
									Object.keys(acceptBatch).length > 0 && (
										<button
											type="button"
											onClick={() => {
												setAcceptConfidentOpen(false);
												void load();
											}}
											style={{
												padding: "0 14px",
												height: 32,
												borderRadius: 6,
												fontSize: theme.fontSizes[2],
												fontWeight: 500,
												fontFamily: theme.fonts.body,
												background: theme.colors.primary,
												color: theme.colors.background,
												border: `1px solid ${theme.colors.primary}`,
												cursor: "pointer",
												display: "inline-flex",
												alignItems: "center",
												gap: 6,
											}}
										>
											Done
										</button>
									)}
							</div>
						</div>
					</div>,
					document.body,
				)}
			{deleteAllOpen &&
				createPortal(
					<div
						role="dialog"
						aria-modal
						aria-label="Delete all proposals"
						onClick={() => {
							if (!deleteAllRunning) setDeleteAllOpen(false);
						}}
						style={{
							position: "fixed",
							inset: 0,
							zIndex: 2147483000,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							background: "rgba(0,0,0,0.55)",
							fontFamily: theme.fonts.body,
						}}
					>
						<div
							onClick={(e) => e.stopPropagation()}
							style={{
								width: "min(480px, calc(100vw - 48px))",
								display: "flex",
								flexDirection: "column",
								background: theme.colors.surface,
								border: `1px solid ${theme.colors.border}`,
								borderRadius: 12,
								overflow: "hidden",
								boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
								color: theme.colors.text,
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "flex-start",
									justifyContent: "space-between",
									gap: 12,
									padding: "14px 20px",
									borderBottom: `1px solid ${theme.colors.border}`,
									background: theme.colors.background,
								}}
							>
								<div style={{ minWidth: 0, flex: 1 }}>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											marginBottom: 4,
											fontSize: theme.fontSizes[3],
											fontWeight: 600,
										}}
									>
										<Trash2
											size={16}
											style={{ color: theme.colors.error ?? "#e5534b" }}
										/>
										Delete all {pending.length} proposal
										{pending.length === 1 ? "" : "s"}
									</div>
									<div
										style={{
											fontSize: theme.fontSizes[1],
											color: muted,
											lineHeight: 1.4,
										}}
									>
										{deleteAllRunning
											? "Deleting…"
											: "Deletes every pending proposal across all models. Accepted/rejected history is kept and model files are not changed."}
									</div>
								</div>
							</div>

							{deleteAllError && (
								<div
									style={{
										padding: "10px 20px 0",
										fontSize: theme.fontSizes[1],
										color: theme.colors.error ?? "#e5534b",
									}}
								>
									{deleteAllError}
								</div>
							)}

							<div
								style={{
									display: "flex",
									justifyContent: "flex-end",
									gap: 8,
									padding: "12px 20px",
									borderTop: `1px solid ${theme.colors.border}`,
									background: theme.colors.background,
								}}
							>
								<button
									type="button"
									disabled={deleteAllRunning}
									onClick={() => setDeleteAllOpen(false)}
									style={{
										padding: "0 12px",
										height: 32,
										borderRadius: 6,
										fontSize: theme.fontSizes[2],
										fontFamily: theme.fonts.body,
										background: "transparent",
										color: theme.colors.text,
										border: `1px solid ${theme.colors.border}`,
										cursor: deleteAllRunning ? "default" : "pointer",
										opacity: deleteAllRunning ? 0.6 : 1,
									}}
								>
									{deleteAllRunning ? "Cancel" : "Keep them"}
								</button>
								<button
									type="button"
									disabled={deleteAllRunning}
									onClick={() => void runDeleteAll()}
									style={{
										padding: "0 14px",
										height: 32,
										borderRadius: 6,
										fontSize: theme.fontSizes[2],
										fontWeight: 500,
										fontFamily: theme.fonts.body,
										background: theme.colors.error ?? "#e5534b",
										color: theme.colors.background,
										border: `1px solid ${theme.colors.error ?? "#e5534b"}`,
										cursor: deleteAllRunning ? "default" : "pointer",
										opacity: deleteAllRunning ? 0.6 : 1,
										display: "inline-flex",
										alignItems: "center",
										gap: 6,
									}}
								>
									{deleteAllRunning ? (
										<Loader2 size={13} className="principal-studio-spin" />
									) : (
										<Trash2 size={13} />
									)}
									{deleteAllRunning ? "Deleting…" : "Delete all"}
								</button>
							</div>
						</div>
					</div>,
					document.body,
				)}
			{proposalsTarget &&
				createPortal(
					<ProposalsModal
						graphId={proposalsTarget.graphId}
						title={proposalsTarget.title}
						onClose={() => {
							setProposalsTarget(null);
							void load();
						}}
					/>,
					document.body,
				)}
			{laneHelp &&
				(() => {
					const meta = LANE_META.find((m) => m.lane === laneHelp)!;
					const HelpIcon = meta.Icon;
					return (
						<div
							role="dialog"
							aria-modal
							aria-label={`${LANE_HELP[laneHelp].name} — what this lane verifies`}
							onClick={() => setLaneHelp(null)}
							style={{
								position: "fixed",
								inset: 0,
								zIndex: 2147483000,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								background: "rgba(0,0,0,0.55)",
								fontFamily: theme.fonts.body,
							}}
						>
							<div
								onClick={(e) => e.stopPropagation()}
								style={{
									width: "min(440px, calc(100vw - 48px))",
									background: theme.colors.surface,
									border: `1px solid ${theme.colors.border}`,
									borderRadius: 12,
									padding: 20,
									boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
									color: theme.colors.text,
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										marginBottom: 8,
									}}
								>
									<HelpIcon
										size={26}
										style={{ color: theme.colors.primary }}
									/>
									<span style={{ fontSize: theme.fontSizes[2], fontWeight: 600 }}>
										{LANE_HELP[laneHelp].name}
									</span>
								</div>
								<p
									style={{
										margin: "0 0 14px",
										fontSize: theme.fontSizes[2],
										lineHeight: 1.5,
										color: muted,
									}}
								>
									{LANE_HELP[laneHelp].blurb}
								</p>
								<div
									style={{
										fontSize: theme.fontSizes[1],
										textTransform: "uppercase",
										letterSpacing: 0.3,
										color: muted,
										marginBottom: 6,
									}}
								>
									Status colours
								</div>
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 6,
									}}
								>
									{STATUS_LEGEND.map(({ status, label, desc }) => (
										<div
											key={status}
											style={{
												display: "flex",
												alignItems: "baseline",
												gap: 8,
												fontSize: theme.fontSizes[1],
											}}
										>
											<span
												style={{
													width: 64,
													flexShrink: 0,
													fontWeight: 600,
													color: laneStatusColor(status, theme.colors, muted),
												}}
											>
												{label}
											</span>
											<span style={{ color: muted }}>{desc}</span>
										</div>
									))}
								</div>
								<div
									style={{
										display: "flex",
										justifyContent: "flex-end",
										marginTop: 16,
									}}
								>
									<button
										type="button"
										onClick={() => setLaneHelp(null)}
										style={{
											padding: "0 14px",
											height: 34,
											borderRadius: 6,
											fontSize: theme.fontSizes[2],
											fontWeight: 500,
											fontFamily: theme.fonts.body,
											background: theme.colors.primary,
											color: theme.colors.background,
											border: `1px solid ${theme.colors.primary}`,
											cursor: "pointer",
										}}
									>
										Done
									</button>
								</div>
							</div>
						</div>
					);
				})()}
		</div>
	);
}

/**
 * Legacy AppHeader chip surface — the monolith as a modal overlay. The pane is
 * graduating into the permanent Maintenance tab (`MaintenanceView`), so this
 * wrapper only re-renders the same `MaintenancePanel` in an overlay.
 */
export function MaintenanceAgentModal({ onClose }: { onClose: () => void }) {
	return <MaintenancePanel overlay onClose={onClose} />;
}
