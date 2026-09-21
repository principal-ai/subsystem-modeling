/**
 * MaintenancePanel — the ambient Maintain agent surface: the aggregate
 * verification ledger across every stored subsystem model, the models sorted
 * farthest-from-verified first, pending correction proposals inline with
 * accept/reject, and a repo filter like the Subsystems tab's drilldown.
 * Renders as a full-bleed tab view by default (`overlay=false`), or wrapped in
 * a modal overlay for the legacy AppHeader chip (`overlay=true`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Component, ListChecks, Loader2, Network, Play, Route, ScanSearch, Server } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { repoAvatarUrl } from "@principal-ai/subsystems-react";
import type {
	MaintenanceOverview,
	MaintenanceOverviewModel,
	StudioMessages,
	SubsystemVerificationLane,
	VerificationLaneStatus,
} from "../../shared/contract";
import {
	electrobun,
	opencodeLiveFeedSubscribers,
	subsystemModelChangeSubscribers,
	subsystemModelMaintainChangeSubscribers,
	subsystemModelProposalsChangeSubscribers,
} from "../rpc";
import { runSubsystemModelAuditFlow } from "../auditSubsystemModelFlow";
import { MaintainModelPickerModal } from "./MaintainModelPickerModal";
import { MaintenanceAuditAllModal } from "./MaintenanceAuditAllModal";
import { ProposalsModal } from "./ProposalsModal";
import { AuditResultsModal, type AuditModalState } from "./AuditResultsModal";
import { RepoRow } from "./RepoRow";
import { buildMaintenanceOverview } from "../../bun/maintenance-overview";

function verdictColor(
	verdict: MaintenanceOverviewModel["verdict"],
	colors: { success?: string; error?: string; textSecondary?: string },
	fallback: string,
): string {
	if (verdict === "fully_verified") return colors.success ?? "#2da44e";
	if (verdict === "issues") return colors.error ?? "#e5534b";
	return colors.textSecondary ?? fallback;
}

function verdictLabel(verdict: MaintenanceOverviewModel["verdict"]): string {
	if (verdict === "fully_verified") return "Verified";
	if (verdict === "partially_verified") return "Partial";
	if (verdict === "issues") return "Issues";
	return "Not audited";
}

/** Lane badge order + icons for the four verification layers. */
const LANE_META: Array<{
	lane: SubsystemVerificationLane;
	label: string;
	Icon: typeof Component;
}> = [
	{ lane: "construct", label: "Construct", Icon: Component },
	{ lane: "static-topology", label: "Static topology", Icon: Network },
	{ lane: "runtime-topology", label: "Runtime topology", Icon: Server },
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

/** Four lane icons, each colored by verified / partial / issues / blocked / none. */
function LaneBadges({
	lanes,
	colors,
	muted,
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
}) {
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
				return (
					<Icon
						key={lane}
						size={13}
						aria-label={`${label}: ${status}`}
						style={{
							color: laneStatusColor(status, colors, muted),
							opacity: status === "none" ? 0.35 : 1,
						}}
					/>
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
				"Layer 2 — how constructs are arranged in source: typed relations[] (imports, extends, …) and containment (package / module).",
		},
		"runtime-topology": {
			name: "Runtime topology",
			blurb:
				"Layer 3 — deployment-unit membership via process: which unit each construct runs in.",
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
	hoverBackground,
	onOpen,
}: {
	lane: SubsystemVerificationLane;
	label: string;
	Icon: typeof Component;
	color: string;
	hoverBackground: string;
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
				background: hover ? hoverBackground : "transparent",
				border: "none",
				borderRadius: 6,
				padding: 3,
				display: "inline-flex",
				cursor: "pointer",
				color,
				transition: "background-color 120ms ease",
			}}
		>
			<Icon size={22} />
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
}: {
	repoBreaks: ReturnType<typeof repoBreakdown>;
	selectedKey: string | null;
	onSelect: (repoKey: string) => void;
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
				paddingRight: 12,
				display: "flex",
				flexDirection: "column",
			}}
		>
			<span
				style={{
					fontSize: theme.fontSizes[0],
					color: muted,
					textTransform: "uppercase",
					letterSpacing: 0.3,
					padding: "2px 8px 6px",
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
	const [overview, setOverview] = useState<MaintenanceOverview | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Graph whose "Run maintenance" click opened the model picker.
	const [pickTarget, setPickTarget] = useState<MaintenanceOverviewModel | null>(null);
	// Single-model dry-run audit results (opens AuditResultsModal).
	const [auditTarget, setAuditTarget] = useState<MaintenanceOverviewModel | null>(
		null,
	);
	const [auditModalState, setAuditModalState] = useState<AuditModalState | null>(
		null,
	);
	// Batch "Audit all" over visible models.
	const [auditAllOpen, setAuditAllOpen] = useState(false);
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
	};
	// Live OpenCode feed per graphId, so "Run maintenance" shows what the
	// agent is actually doing instead of a silent spinner.
	const [feeds, setFeeds] = useState<Record<string, FeedEntry>>({});
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
			const res = await electrobun.rpc!.request.getMaintenanceOverview({});
			if (!res.ok) {
				setError(res.error ?? "Failed to load maintenance overview");
				return;
			}
			setError(null);
			setOverview(res.overview ?? null);
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

	// Re-paint when a background re-audit finishes (or a run/proposal changes).
	useEffect(() => {
		const refresh = () => void load();
		subsystemModelChangeSubscribers.add(refresh);
		subsystemModelProposalsChangeSubscribers.add(refresh);
		subsystemModelMaintainChangeSubscribers.add(refresh);
		return () => {
			subsystemModelChangeSubscribers.delete(refresh);
			subsystemModelProposalsChangeSubscribers.delete(refresh);
			subsystemModelMaintainChangeSubscribers.delete(refresh);
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

	// Dry-run deterministic audit for a single model.
	const runAudit = useCallback(async (m: MaintenanceOverviewModel) => {
		setAuditTarget(m);
		setAuditModalState({ phase: "auditing", title: m.title });
		try {
			const res = await runSubsystemModelAuditFlow(m.graphId, {
				onModal: setAuditModalState,
			});
			if (res.ok === false) {
				setAuditModalState({
					phase: "error",
					title: m.title,
					error: res.error,
				});
			}
		} catch (err) {
			setAuditModalState({
				phase: "error",
				title: m.title,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}, []);

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
	// to the first (and re-selecting if the current one disappears).
	useEffect(() => {
		if (repoBreaks.length === 0) return;
		setRepoKey((current) => {
			const exists =
				current != null &&
				repoBreaks.some(
					(r) => `${r.owner}/${r.name}`.toLowerCase() === current,
				);
			if (exists) return current;
			return `${repoBreaks[0].owner}/${repoBreaks[0].name}`.toLowerCase();
		});
	}, [repoBreaks]);
	const matchesRepo = (m: MaintenanceOverviewModel) =>
		repoKey == null ||
		(m.repos ?? []).some(
			(r) => `${r.owner}/${r.name}`.toLowerCase() === repoKey,
		);
	const visibleModels = useMemo(
		() => (overview?.models ?? []).filter(matchesRepo),
		[overview, repoKey],
	);
	const visiblePending = useMemo(
		() =>
			repoKey == null
				? pending
				: pending.filter((e) =>
						(reposByGraph.get(e.graphId) ?? []).some(
							(r) => `${r.owner}/${r.name}`.toLowerCase() === repoKey,
						),
					),
		[repoKey, pending, reposByGraph],
	);
	const inRepo = (gid: string) =>
		repoKey == null ||
		(reposByGraph.get(gid) ?? []).some(
			(r) => `${r.owner}/${r.name}`.toLowerCase() === repoKey,
		);
	const visibleRunning = useMemo(
		() => (overview?.running ?? []).filter(inRepo),
		[overview, repoKey, reposByGraph],
	);
	const visibleAuditing = useMemo(
		() => (overview?.auditing ?? []).filter(inRepo),
		[overview, repoKey, reposByGraph],
	);

	// Re-run the same aggregation over the repo-filtered subset so the "% 
	// verified" bar, model states, and open/blocked ledger all track the
	// selected repo.
	const filtered = useMemo(
		() =>
			overview
				? buildMaintenanceOverview({
						models: visibleModels,
						pendingProposals: visiblePending,
						running: visibleRunning,
						auditing: visibleAuditing,
					})
				: null,
		[overview, visibleModels, visiblePending, visibleRunning, visibleAuditing],
	);
	const totals = filtered?.totals;
	const coveragePct = totals ? Math.round(totals.coverage * 100) : 0;

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
								padding: 24,
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
								gap: 2,
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
									hoverBackground={
										theme.colors.backgroundTertiary ??
										theme.colors.backgroundSecondary ??
										theme.colors.border
									}
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
								fontSize: theme.fontSizes[1],
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
						{overlay && (
							<button
								type="button"
								onClick={onClose}
								style={{
									background: "transparent",
									border: "none",
									color: muted,
									cursor: "pointer",
									fontSize: theme.fontSizes[1],
								}}
							>
								Close
							</button>
						)}
					</div>
				</div>
				<p
					style={{
						margin: "0 0 16px",
						fontSize: theme.fontSizes[0],
						color: muted,
						lineHeight: 1.5,
					}}
				>
					Verification progress across every subsystem model. Confirm a
					proposal to move a model closer to fully verified.
				</p>

				{error && (
					<p
						style={{
							margin: "0 0 12px",
							color: theme.colors.error ?? "#e5534b",
							fontSize: theme.fontSizes[0],
						}}
					>
						{error}
					</p>
				)}

				{overview === null && !error && (
					<p style={{ color: muted, fontSize: theme.fontSizes[1] }}>Loading…</p>
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
							selectedKey={repoKey}
							onSelect={setRepoKey}
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
								paddingBottom: 8,
							}}
						>
				{filtered && totals && (
					<div
						style={{
							padding: 14,
							borderRadius: 8,
							border: `1px solid ${theme.colors.border}`,
							background: theme.colors.background,
							marginBottom: 16,
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "baseline",
								justifyContent: "space-between",
								gap: 8,
								marginBottom: 8,
							}}
						>
							<span style={{ fontSize: theme.fontSizes[1], fontWeight: 600 }}>
								{coveragePct}% verified
							</span>
							<span style={{ fontSize: theme.fontSizes[0], color: muted }}>
								{filtered.verified} verified · {filtered.needsWork} need work
								{filtered.running.length > 0
									? ` · ${filtered.running.length} running`
									: ""}
								{filtered.auditing.length > 0
									? ` · ${filtered.auditing.length} auditing`
									: ""}
							</span>
						</div>
						<div
							style={{
								height: 8,
								borderRadius: 999,
								overflow: "hidden",
								background: `${muted}33`,
								marginBottom: 8,
							}}
						>
							<div
								style={{
									width: `${coveragePct}%`,
									height: "100%",
									background:
										coveragePct === 100
											? (theme.colors.success ?? "#2da44e")
											: theme.colors.primary,
								}}
							/>
						</div>
						<div style={{ fontSize: theme.fontSizes[0], color: muted }}>
							{totals.open} open ({totals.blocking} blocking) · {totals.blocked}{" "}
							blocked on repo/cache · {totals.na} n/a
						</div>
					</div>
				)}

				{inFlightGraphs.length > 0 && (
					<div style={{ marginBottom: 16 }}>
						<div
							style={{
								fontSize: theme.fontSizes[0],
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
							return (
								<div
									key={gid}
									style={{
										padding: "10px 12px",
										borderRadius: 8,
										border: `1px solid ${theme.colors.border}`,
										background: theme.colors.background,
										marginBottom: 8,
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
										<Loader2
											size={12}
											className="principal-studio-spin"
											style={{ flexShrink: 0, color: theme.colors.primary }}
										/>
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
											<code style={{ fontSize: theme.fontSizes[0], color: muted }}>
												{f.agent}
											</code>
										)}
										{f != null && (
											<span
												style={{
													fontSize: theme.fontSizes[0],
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
											fontSize: theme.fontSizes[0],
											color: muted,
											fontFamily:
												theme.fonts.monospace ?? "ui-monospace, monospace",
											lineHeight: 1.45,
											wordBreak: "break-word",
										}}
									>
										{f
											? f.last
												? `${f.title ? `${f.title} — ` : ""}${f.last}`
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
												fontSize: theme.fontSizes[0],
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
								fontSize: theme.fontSizes[0],
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
								<p style={{ color: muted, fontSize: theme.fontSizes[1] }}>
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
								return (
									<div
										key={m.graphId}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											padding: "8px 10px",
											borderRadius: 6,
											border: `1px solid ${theme.colors.border}`,
											background: theme.colors.background,
											fontSize: theme.fontSizes[1],
										}}
									>
										{rowBusy && (
											<Loader2
												size={12}
												className="principal-studio-spin"
												style={{ flexShrink: 0, color: theme.colors.primary }}
											/>
										)}
										<span style={{ flex: 1, minWidth: 0 }}>{m.title}</span>
										{m.blocked > 0 && (
											<span
												title="Claims blocked on an unavailable repo or graphify cache. Run maintenance to rebuild caches; cloned repos still need the repo available locally."
												style={{
													fontSize: theme.fontSizes[0],
													color: muted,
												}}
											>
												{m.blocked} blocked
											</span>
										)}
										{m.verdict !== "partially_verified" && (
											<span
												style={{
													fontSize: theme.fontSizes[0],
													fontWeight: 600,
													textTransform: "uppercase",
													letterSpacing: 0.3,
													color: verdictColor(m.verdict, theme.colors, muted),
												}}
											>
												{verdictLabel(m.verdict)}
											</span>
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
													fontSize: theme.fontSizes[0],
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
												onClick={() => setPickTarget(m)}
												title="Run a background maintenance pass: audits this model and drafts a proposal for the first fixable finding (does not auto-accept)."
												style={{
													padding: "0 10px",
													height: 26,
													borderRadius: 6,
													fontSize: theme.fontSizes[0],
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
										<button
											type="button"
											disabled={rowBusy}
											onClick={() => void runAudit(m)}
											title="Dry-run deterministic audit of this model (no agent, no mutations)."
											style={{
												padding: "0 10px",
												height: 26,
												borderRadius: 6,
												fontSize: theme.fontSizes[0],
												fontFamily: theme.fonts.body,
												background: "transparent",
												color: muted,
												border: `1px solid ${theme.colors.border ?? "#333"}`,
												cursor: rowBusy ? "default" : "pointer",
												opacity: rowBusy ? 0.6 : 1,
												display: "inline-flex",
												alignItems: "center",
												gap: 6,
												flexShrink: 0,
											}}
										>
											<ScanSearch size={11} />
											Audit
										</button>
										<LaneBadges
											lanes={m.lanes ?? {}}
											colors={theme.colors}
											muted={muted}
										/>
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
									? theme.fontSizes[1]
									: theme.fontSizes[0],
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
					mode={pickTarget.verdict === "issues" ? "issues" : "gaps"}
					onClose={() => setPickTarget(null)}
					onStarted={onMaintainStarted}
				/>
			)}
			{auditTarget && auditModalState && (
				<AuditResultsModal
					state={auditModalState}
					onClose={() => {
						setAuditTarget(null);
						setAuditModalState(null);
					}}
					onReportChange={() => void load()}
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
										fontSize: theme.fontSizes[1],
										lineHeight: 1.5,
										color: muted,
									}}
								>
									{LANE_HELP[laneHelp].blurb}
								</p>
								<div
									style={{
										fontSize: theme.fontSizes[0],
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
												fontSize: theme.fontSizes[0],
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
											fontSize: theme.fontSizes[1],
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
