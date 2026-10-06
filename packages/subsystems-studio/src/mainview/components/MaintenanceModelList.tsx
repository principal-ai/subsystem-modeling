/**
 * MaintenanceModelList — the "Models" section of the Maintainer surface: one
 * card per stored subsystem model showing its verification lanes, pending
 * proposals, and (when expanded) its most recent Maintain run. Extracted from
 * `MaintenancePanel` as a pure presentational component so
 * it can be rendered without the panel's RPC wiring (see
 * `MaintenanceModelList.stories.tsx`).
 *
 * The panel owns all state; this module only renders and forwards intents via
 * callbacks. Its lane helpers (`AGENT_META`, `LANE_META`, `laneStatusColor`,
 * `LaneBadges`) are exported because the panel's header and progress rows reuse
 * them.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
	Ban,
	LayoutDashboard,
	AppWindow,
	Check,
	Copy,
	Loader2,
	Network,
	Route,
	Box,
	Wrench,
	type LucideIcon,
} from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	ProvenanceBadge,
	ProvenanceDetail,
	ownerName,
	shortSha,
	type ModelProvenanceData,
} from "./ModelProvenance";
import type { AnchorChanges, ModelProvenanceDetail } from "../../shared/contract";
import type {
	MaintenanceOverviewModel,
	SubsystemModelProposal,
	SubsystemModelRun,
	SubsystemVerificationLane,
	VerificationLaneStatus,
} from "../../shared/contract";

/** Copy-feedback flash duration for a run row's copy button. */
export const RUN_COPY_FEEDBACK_MS = 1500;

/** Live OpenCode feed snapshot for a model, mirrored from the host broadcast. */
export type FeedEntry = {
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

/**
 * The Maintain agents, in routing priority order (construct → static topology →
 * dynamic topology), each with a badge icon. Mirrors the host's
 * `MaintainAgentId` set; drives the per-row "which agent is running" badge
 * strip. Static topology is package/module containment; dynamic topology is
 * process runtime.
 */
export const AGENT_META: Array<{ agent: string; label: string; Icon: LucideIcon }> = [
	// Icon = the agent's lane (construct / static-topology / dynamic-topology),
	// so the badge reads as "which lane"; the name distinguishes the workers
	// within a lane. Mirrors the lane icons: construct→Box,
	// static-topology→Network, dynamic-topology→AppWindow (the C4 container
	// icon — the lane is about the containers).
	{ agent: "construct-fixer", label: "Construct Fixer", Icon: Box },
	{
		agent: "package-module-fixer",
		label: "Package/Module Fixer",
		Icon: Network,
	},
	{ agent: "construct-verifier", label: "Construct Verifier", Icon: Box },
	{
		agent: "package-module-verifier",
		label: "Package/Module Verifier",
		Icon: Network,
	},
	{
		agent: "runtime-topology-verifier",
		label: "Runtime Topology Verifier",
		Icon: AppWindow,
	},
	{
		agent: "container-verifier",
		label: "Container Verifier",
		Icon: AppWindow,
	},
	{ agent: "trail-verifier", label: "Trail Verifier", Icon: Route },
];

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
	const commits = Object.entries(run.commitsAtStart ?? {});
	if (commits.length > 0) {
		lines.push("Commits at start:");
		for (const [purl, sha] of commits) lines.push(`- \`${sha}\` ${purl}`);
	}
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
	const muted = theme.colors.textSecondary;
	const [copied, setCopied] = useState(false);
	const [hover, setHover] = useState(false);
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
			: muted;
	// Running rows never reach the history list, so only the finished outcome
	// (done / error / skipped) is labelled here.
	const label = run.status === "done" ? "Result" : run.status;
	const agentMeta = AGENT_META.find((a) => a.agent === run.agent);
	const acceptedProposals = (proposals ?? []).filter(
		(p) => p.status === "accepted",
	);
	const pendingProposalTotal = (proposals ?? []).filter(
		(p) => p.status === "pending",
	).length;
	const rejectedProposals = (proposals ?? []).filter(
		(p) => p.status === "rejected",
	).length;
	// The commit(s) the agent read, one per referenced repo. Empty for runs
	// recorded before commits were captured, in which case nothing renders.
	const startCommits = Object.entries(run.commitsAtStart ?? {});
	return (
		<div
			onClick={onOpen}
			onMouseEnter={onOpen ? () => setHover(true) : undefined}
			onMouseLeave={onOpen ? () => setHover(false) : undefined}
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 1,
				minWidth: 0,
				cursor: onOpen ? "pointer" : "default",
				padding: "6px 8px",
				borderRadius: 6,
				border: `1px solid ${
					hover ? theme.colors.primary : (theme.colors.border ?? "#333")
				}`,
				background: hover
					? (theme.colors.backgroundSecondary ?? theme.colors.background)
					: theme.colors.background,
				transition: "border-color 120ms ease, background 120ms ease",
			}}
		>
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "2px 0",
				fontSize: theme.fontSizes[1],
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
							fontSize: theme.fontSizes[1],
							fontFamily: theme.fonts.body,
							color: theme.colors.primary,
						}}
					>
						<agentMeta.Icon size={11} color={theme.colors.primary} />
						{agentMeta.label}
					</span>
				)}
				<span
					style={{
						flexShrink: 0,
						color: statusColor,
						fontWeight: 600,
					}}
				>
					{label}
				</span>
				{proposals && (
					<span style={{ flexShrink: 0 }}>
						{proposals.length === 0
							? "No proposals"
							: `${acceptedProposals.length} accepted${
									pendingProposalTotal > 0
										? ` · ${pendingProposalTotal} pending`
										: ""
								}${
									rejectedProposals > 0
										? ` · ${rejectedProposals} rejected`
										: ""
								}`}
					</span>
				)}
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
		{startCommits.length > 0 && (
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					gap: 10,
					padding: "0 0 2px",
					fontSize: theme.fontSizes[0],
					fontFamily: theme.fonts.monospace,
					color: muted,
				}}
			>
				<span style={{ fontFamily: theme.fonts.body }}>at</span>
				{startCommits.map(([purl, sha]) => (
					<span key={purl} title={`${purl} @ ${sha}`}>
						{ownerName(purl)}{" "}
						<span style={{ color: theme.colors.text }}>{shortSha(sha)}</span>
					</span>
				))}
			</div>
		)}
		</div>
	);
}

/** Lane badge order + icons for the four verification layers. */
export const LANE_META: Array<{
	lane: SubsystemVerificationLane;
	label: string;
	Icon: typeof Box;
}> = [
	{ lane: "construct", label: "Construct", Icon: Box },
	{ lane: "static-topology", label: "Static topology", Icon: Network },
	{ lane: "dynamic-topology", label: "Dynamic topology", Icon: AppWindow },
	{ lane: "trail", label: "Trail", Icon: Route },
];

export function laneStatusColor(
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

/** Tooltip for the card's title mark, keyed on the worst lane status. */
const SEVERITY_LABEL: Record<VerificationLaneStatus, string> = {
	issues: "Hard failure — must be fixed",
	blocked: "Blocked — repo or cache unavailable",
	partial: "Unconfirmed claims remain",
	none: "Not verified yet",
	verified: "Fully verified",
};

/**
 * Worst lane status across a model's verification lanes, by severity:
 * issues > blocked > partial > none > verified. Drives the card's title icon.
 */
export function worstLaneStatus(
	lanes: Partial<Record<SubsystemVerificationLane, VerificationLaneStatus>>,
): VerificationLaneStatus {
	const order: VerificationLaneStatus[] = [
		"issues",
		"blocked",
		"partial",
		"none",
		"verified",
	];
	let worst: VerificationLaneStatus = "verified";
	for (const lane of Object.values(lanes)) {
		if (order.indexOf(lane) < order.indexOf(worst)) worst = lane;
	}
	return worst;
}

/** Four lane icons, each colored by verified / partial / issues / blocked / none.
 *  When `onOpenLane` is set each icon becomes a button that opens the model
 *  focused on that verification layer. */
export function LaneBadges({
	lanes,
	colors,
	muted,
	onOpenLane,
	proposalCounts,
	onOpenProposals,
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
	/** Pending proposals per lane — shows a count badge and reroutes the click. */
	proposalCounts?: Partial<Record<SubsystemVerificationLane, number>>;
	onOpenProposals?: (lane: SubsystemVerificationLane) => void;
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
				const count = proposalCounts?.[lane] ?? 0;
				// A lane with pending proposals reviews them instead of opening
				// the model — the badge is the proposal affordance.
				if (count > 0 && onOpenProposals) {
					return (
						<button
							key={lane}
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onOpenProposals(lane);
							}}
							aria-label={`Review ${count} ${label} proposal${count === 1 ? "" : "s"}`}
							title={`Review ${count} ${label} proposal${count === 1 ? "" : "s"}`}
							style={{
								position: "relative",
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								width: 26,
								height: 26,
								padding: 0,
								border: `1px solid ${theme.colors.primary}`,
								borderRadius: 6,
								background: "transparent",
								color: theme.colors.primary,
								cursor: "pointer",
							}}
						>
							<Icon size={14} />
							<span
								style={{
									position: "absolute",
									top: -5,
									right: -5,
									minWidth: 14,
									height: 14,
									padding: "0 3px",
									borderRadius: 7,
									background: theme.colors.primary,
									color: theme.colors.background,
									fontSize: 9,
									fontWeight: 700,
									lineHeight: "14px",
									textAlign: "center",
								}}
							>
								{count}
							</span>
						</button>
					);
				}
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

/** One model card: title, blocked count, Runs / Run maintenance / Brief agent,
 *  lane badges, and — while a run is in flight — the live agent strip (active
 *  agent, event counters, last event line, click to open the events tab). */
export function MaintenanceModelCard({
	model,
	runs,
	proposals,
	feed,
	maintainRunning,
	auditRunning,
	runsOpen,
	briefCopied,
	proposalCounts,
	provenance,
	provenanceOpen,
	onToggleProvenance,
	onToggleRuns,
	onOpenModel,
	onRunMaintenance,
	onCopyBrief,
	onOpenLane,
	onOpenProposals,
	onOpenRun,
	onOpenLive,
}: {
	model: MaintenanceOverviewModel;
	runs: SubsystemModelRun[];
	/** Every proposal for the model (any status), when loaded. */
	proposals?: SubsystemModelProposal[];
	feed?: FeedEntry;
	/** A Maintain run is in flight for this model. */
	maintainRunning: boolean;
	/** A re-audit is in flight for this model. */
	auditRunning: boolean;
	/** The run-history section is expanded. */
	runsOpen: boolean;
	/** The Brief-agent copy just landed for this model. */
	briefCopied: boolean;
	proposalCounts?: Partial<Record<SubsystemVerificationLane, number>>;
	/**
	 * Commit provenance for this model — "verified at X, and this has happened
	 * since". Omitted when the host has not measured it, in which case the card
	 * renders exactly as it did before.
	 */
	provenance?: ModelProvenanceData;
	/** The provenance timeline strip is expanded. */
	provenanceOpen?: boolean;
	/** Expand / collapse the provenance strip. Omit to render the badge inert. */
	onToggleProvenance?: (graphId: string) => void;
	onToggleRuns: (graphId: string) => void;
	onOpenModel: (model: MaintenanceOverviewModel) => void;
	onRunMaintenance: (model: MaintenanceOverviewModel) => void;
	onCopyBrief: (graphId: string) => void;
	onOpenLane: (model: MaintenanceOverviewModel, lane: SubsystemVerificationLane) => void;
	onOpenProposals: (
		model: MaintenanceOverviewModel,
		lane: SubsystemVerificationLane,
	) => void;
	onOpenRun: (run: SubsystemModelRun, model: MaintenanceOverviewModel) => void;
	/** Open the live events tab for the model's in-flight run. */
	onOpenLive: (model: MaintenanceOverviewModel, feed?: FeedEntry) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textSecondary;
	const rowBusy = maintainRunning || auditRunning;
	// Which agent is running right now: the live feed's agent while a session
	// streams, else the newest running run row.
	const feedAgent =
		feed && (feed.status === "running" || feed.status === "starting")
			? feed.agent
			: undefined;
	const activeAgent = maintainRunning
		? (feedAgent ?? runs.find((r) => r.status === "running")?.agent)
		: undefined;
	const activeMeta = AGENT_META.find((a) => a.agent === activeAgent);
	// The stage a run would execute next, so the button names the agent it'll
	// dispatch rather than a generic "Run maintenance".
	const nextMeta = model.nextRoute
		? AGENT_META.find((a) => a.agent === model.nextRoute?.agent)
		: undefined;
	// Nothing queued (fully verified) means a run has nothing to fix, so the
	// button is only offered when a stage is pending. A model with blocked
	// claims keeps the button but greys it out — a run can't check evidence
	// that isn't available; the fix is environmental (see the blocked notice).
	const blocked = model.blocked > 0;
	const runLabel = rowBusy
		? "Running…"
		: nextMeta
			? `Run ${nextMeta.label}`
			: null;
	const runDisabled = rowBusy || blocked;
	// In-flight live detail: the last event line + counters, or a preparing
	// note until the first OpenCode event lands.
	const liveDetail = maintainRunning
		? feed
			? feed.last
				? feed.last
				: feed.status === "starting"
					? "Starting OpenCode session…"
					: `${feed.status}…`
			: "Preparing OpenCode session…"
		: null;
	// Runs arrive newest first, so the first finished one is the most recent.
	// A persisted "running" row always has a live block above it (the run is in
	// flight), so drop it to avoid stating it twice. Only the newest finished
	// run is shown: older rows are history nobody acts on, and the Fix-cycle
	// strip already summarizes the sequence.
	const latestRun = runs.find((r) => r.status !== "running");
	return (
		<div
			onClick={() => onToggleRuns(model.graphId)}
			onDoubleClick={(e) => {
				// Let the row's buttons keep their own double-click behavior.
				if ((e.target as HTMLElement).closest("button")) return;
				onOpenModel(model);
			}}
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
			<span
				style={{
					flex: 1,
					minWidth: 0,
					display: "inline-flex",
					alignItems: "center",
					gap: 8,
				}}
			>
				{(() => {
					const sev = worstLaneStatus(model.lanes ?? {});
					const tint = laneStatusColor(sev, theme.colors, muted);
					return (
						<span
							title={SEVERITY_LABEL[sev]}
							aria-label={SEVERITY_LABEL[sev]}
							style={{
								display: "inline-flex",
								alignItems: "center",
								flexShrink: 0,
							}}
						>
							<LayoutDashboard size={14} color={tint} aria-hidden="true" />
						</span>
					);
				})()}
				<span
					style={{
						minWidth: 0,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{model.title}
				</span>
			</span>
			<LaneBadges
				lanes={model.lanes ?? {}}
				colors={theme.colors}
				muted={muted}
				onOpenLane={(lane) => onOpenLane(model, lane)}
				proposalCounts={proposalCounts}
				onOpenProposals={(lane) => onOpenProposals(model, lane)}
			/>
			</div>
			{/*
			 * Second row: when the model was checked on the left, the action on
			 * the right. Always rendered so Run keeps one consistent home —
			 * otherwise it jumps between rows as provenance arrives, and a
			 * button that moves is a button that gets misclicked.
			 *
			 * The badge reads as a note under the card rather than a fourth
			 * verdict, because row 1 already answers "how much passes" and this
			 * answers "when was it checked" — different axes.
			 */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "2px 10px 8px",
					minHeight: 34,
				}}
			>
				{provenance && (
					<ProvenanceBadge
						provenance={provenance}
						open={provenanceOpen}
						onToggle={
							onToggleProvenance
								? () => onToggleProvenance(model.graphId)
								: undefined
						}
					/>
				)}
				<span style={{ flex: 1 }} />
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onCopyBrief(model.graphId);
					}}
					title="Copy a verification brief for this model — paste it to an agent to ask questions about what is and isn't verified."
					style={{
						padding: "0 10px",
						height: 26,
						borderRadius: 6,
						fontSize: theme.fontSizes[1],
						fontFamily: theme.fonts.body,
						background: briefCopied
							? (theme.colors.primary ?? "#2da44e")
							: "transparent",
						color: briefCopied ? theme.colors.background : muted,
						border: `1px solid ${
							briefCopied
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
					{briefCopied ? (
						<Check size={11} />
					) : (
						<Copy size={11} />
					)}
					{/* Both labels share one grid cell so the button
					    keeps the wider label's width when it flips. */}
					<span style={{ display: "inline-grid" }}>
						<span
							style={{
								gridArea: "1 / 1",
								visibility: briefCopied ? "hidden" : "visible",
							}}
						>
							Brief agent
						</span>
						<span
							style={{
								gridArea: "1 / 1",
								visibility: briefCopied ? "visible" : "hidden",
							}}
						>
							Copied
						</span>
					</span>
				</button>
				{runLabel && (
					<button
						type="button"
						disabled={runDisabled}
						onClick={(e) => {
							e.stopPropagation();
							onRunMaintenance(model);
						}}
						title={
							blocked
								? "Some claims can't be verified until the repo is available locally / its graphify cache is built."
								: "Run a background maintenance pass: audits this model and drafts a proposal for the first fixable finding (does not auto-accept)."
						}
						style={{
							padding: "0 10px",
							height: 26,
							borderRadius: 6,
							fontSize: theme.fontSizes[1],
							fontFamily: theme.fonts.body,
							background: "transparent",
							color: runDisabled ? muted : theme.colors.primary,
							border: `1px solid ${
								runDisabled ? (theme.colors.border ?? "#333") : theme.colors.primary
							}`,
							cursor: runDisabled ? "default" : "pointer",
							opacity: runDisabled ? 0.6 : 1,
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							flexShrink: 0,
						}}
					>
						{rowBusy ? (
							<Loader2 size={11} className="principal-studio-spin" />
						) : (
							<Wrench size={11} />
						)}
						{runLabel}
					</button>
				)}
			</div>
			{provenanceOpen && provenance && (
				<div style={{ padding: "0 10px 8px" }}>
					<ProvenanceDetail provenance={provenance} />
				</div>
			)}
			{model.blocked > 0 && (
				<div
					style={{
						borderTop: `1px solid ${theme.colors.border}`,
						padding: "12px 10px 8px",
						display: "flex",
						alignItems: "center",
						gap: 6,
						fontSize: theme.fontSizes[1],
						color: theme.colors.warning ?? "#d4a017",
					}}
				>
					<Ban size={12} aria-hidden="true" />
					<span>
						{model.blocked} claim{model.blocked === 1 ? "" : "s"} blocked —
						needs the repo cloned locally or its graphify cache built
						before a maintenance run can check it.
					</span>
				</div>
			)}
			{maintainRunning && (
				<div
					onClick={() => onOpenLive(model, feed)}
					title={
						feed?.sessionId
							? "Open this run's live events"
							: undefined
					}
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 5,
						borderTop: `1px solid ${theme.colors.border}`,
						padding: "12px 10px 8px",
						cursor: feed?.sessionId ? "pointer" : "default",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
						}}
					>
						<span
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
							className="principal-studio-running-border"
						>
							{activeMeta && <activeMeta.Icon size={12} />}
							{activeMeta?.label ?? feed?.agent ?? "maintain"}
						</span>
						{feed != null && (
							<span
								style={{
									fontSize: theme.fontSizes[1],
									color: muted,
									fontVariantNumeric: "tabular-nums",
								}}
							>
								{feed.events} events · {feed.status}
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
						{liveDetail}
					</div>
					{feed?.error && (
						<div
							style={{
								color: theme.colors.error ?? "#e5534b",
								fontSize: theme.fontSizes[1],
							}}
						>
							{feed.error}
						</div>
					)}
				</div>
			)}
			{runsOpen && (
				<div
					onClick={(e) => e.stopPropagation()}
					style={{
						borderTop: `1px solid ${theme.colors.border}`,
						padding: "12px 10px 10px",
						display: "flex",
						flexDirection: "column",
						gap: 6,
						background:
							theme.colors.backgroundSecondary ??
							theme.colors.background,
						borderBottomLeftRadius: 6,
						borderBottomRightRadius: 6,
					}}
				>
					{latestRun ? (
						<RunRow
							key={latestRun.id}
							run={latestRun}
							graphTitle={model.title}
							proposals={proposalsForRun(proposals, latestRun)}
							onOpen={
								latestRun.sessionId
									? () => onOpenRun(latestRun, model)
									: undefined
							}
						/>
					) : (
						<div
							style={{
								fontSize: theme.fontSizes[1],
								color: muted,
							}}
						>
							No runs yet.
						</div>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * Fold the lazily-fetched detail tier over the cheap snapshot.
 *
 * The two carry overlapping fields, so the merge is per-purl rather than a
 * replacement: the snapshot measured contact and distance, the detail re-walks
 * the log to add `commits` and the remote's position. Taking the snapshot's
 * values would throw away the walk; replacing wholesale would throw away the
 * measurement the walk never recomputes.
 */
function mergeProvenance(
	snapshot: ModelProvenanceData | undefined,
	detail: ModelProvenanceDetail | undefined,
): ModelProvenanceData | undefined {
	if (!snapshot) return undefined;
	if (!detail) return snapshot;
	const anchorChanges: Record<string, AnchorChanges> = {};
	for (const [purl, base] of Object.entries(snapshot.anchorChanges ?? {})) {
		anchorChanges[purl] = { ...base, ...(detail.anchorChanges?.[purl] ?? {}) };
	}
	return {
		...snapshot,
		anchorChanges:
			Object.keys(anchorChanges).length > 0 ? anchorChanges : undefined,
	};
}

/**
 * The "Models" section: an uppercase label with an optional action slot, an
 * empty-state message, and one card per model. Pure — every interaction is
 * forwarded to the panel.
 */
export function MaintenanceModelList({
	models,
	running,
	auditing,
	runsByGraph,
	proposalsByGraph,
	feeds,
	expandedRuns,
	expandedProvenance,
	provenanceDetailByGraph,
	briefCopiedId,
	proposalCountsByGraph,
	headerActions,
	emptyMessage = "No subsystem models.",
	onToggleRuns,
	onToggleProvenance,
	onOpenModel,
	onRunMaintenance,
	onCopyBrief,
	onOpenLane,
	onOpenProposals,
	onOpenRun,
	onOpenLive,
}: {
	models: MaintenanceOverviewModel[];
	/** Model ids with a Maintain run in flight. */
	running: readonly string[];
	/** Model ids being re-audited after a confirmed proposal. */
	auditing: readonly string[];
	runsByGraph: ReadonlyMap<string, SubsystemModelRun[]>;
	proposalsByGraph: ReadonlyMap<string, SubsystemModelProposal[]>;
	feeds: Record<string, FeedEntry>;
	expandedRuns: ReadonlySet<string>;
	/** Model ids whose provenance strip is expanded. */
	expandedProvenance?: ReadonlySet<string>;
	/** Lazily-fetched expensive provenance tier, keyed by model id. */
	provenanceDetailByGraph?: ReadonlyMap<string, ModelProvenanceDetail>;
	briefCopiedId: string | null;
	proposalCountsByGraph: ReadonlyMap<
		string,
		Partial<Record<SubsystemVerificationLane, number>>
	>;
	/** Shown when `models` is empty. */
	emptyMessage?: string;
	/**
	 * Rendered at the right of the "Models" label — the list-wide batch controls
	 * (Audit all, Run maintenance on all). Omitted renders the label alone.
	 */
	headerActions?: ReactNode;
	onToggleRuns: (graphId: string) => void;
	/** Expand/collapse a model's provenance strip. */
	onToggleProvenance: (graphId: string) => void;
	onOpenModel: (model: MaintenanceOverviewModel) => void;
	onRunMaintenance: (model: MaintenanceOverviewModel) => void;
	onCopyBrief: (graphId: string) => void;
	onOpenLane: (model: MaintenanceOverviewModel, lane: SubsystemVerificationLane) => void;
	onOpenProposals: (
		model: MaintenanceOverviewModel,
		lane: SubsystemVerificationLane,
	) => void;
	onOpenRun: (run: SubsystemModelRun, model: MaintenanceOverviewModel) => void;
	/** Open the live events tab for a model's in-flight run (agent strip click). */
	onOpenLive: (model: MaintenanceOverviewModel, feed?: FeedEntry) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textSecondary;
	// The status footer is the list's "nothing pending" state: shown only when
	// no model among the given ones still has proposals in flight, styled green
	// and larger once everything is fully verified.
	const noProposals = models.every((m) => m.pendingProposalCount === 0);
	const allVerified =
		noProposals &&
		running.length === 0 &&
		auditing.length === 0 &&
		models.length > 0 &&
		models.every((m) => m.verdict === "fully_verified");
	const statusStyle = {
		marginTop: 16,
		fontSize: allVerified ? theme.fontSizes[2] : theme.fontSizes[1],
		color: allVerified ? (theme.colors.success ?? "#2da44e") : muted,
	};
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				padding: "0 24px 12px 0",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 12,
					padding: "12px 12px 12px 0",
				}}
			>
				<span
					style={{
						fontSize: theme.fontSizes[1],
						textTransform: "uppercase",
						letterSpacing: 0.3,
						color: muted,
					}}
				>
					Models
				</span>
				{headerActions}
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				{models.map((m) => (
					<MaintenanceModelCard
						key={m.graphId}
						model={m}
						runs={runsByGraph.get(m.graphId) ?? []}
						proposals={proposalsByGraph.get(m.graphId)}
						feed={feeds[m.graphId]}
						maintainRunning={running.includes(m.graphId)}
						auditRunning={auditing.includes(m.graphId)}
						runsOpen={expandedRuns.has(m.graphId)}
						provenance={mergeProvenance(
							m.provenance,
							provenanceDetailByGraph?.get(m.graphId),
						)}
						provenanceOpen={expandedProvenance?.has(m.graphId) ?? false}
						onToggleProvenance={onToggleProvenance}
						briefCopied={briefCopiedId === m.graphId}
						proposalCounts={proposalCountsByGraph.get(m.graphId)}
						onToggleRuns={onToggleRuns}
						onOpenModel={onOpenModel}
						onRunMaintenance={onRunMaintenance}
						onCopyBrief={onCopyBrief}
						onOpenLane={onOpenLane}
						onOpenProposals={onOpenProposals}
						onOpenRun={onOpenRun}
						onOpenLive={onOpenLive}
					/>
				))}
			</div>
			{models.length === 0 ? (
				<p style={{ color: muted, fontSize: theme.fontSizes[2] }}>
					{emptyMessage}
				</p>
			) : (
				noProposals && (
					<p style={statusStyle}>
						{running.length > 0
							? "Maintainer is auditing to produce the next proposal…"
							: auditing.length > 0
								? "Re-auditing to confirm your accepted proposal…"
								: models.every((m) => m.verdict === "fully_verified")
									? "Fully verified — nothing to maintain."
									: "No proposal surfaced yet — run maintenance on a model above to draft the next one."}
					</p>
				)
			)}
		</div>
	);
}
