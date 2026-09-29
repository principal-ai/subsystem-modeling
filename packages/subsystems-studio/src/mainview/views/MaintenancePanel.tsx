/**
 * MaintenancePanel — the ambient Maintain agent surface: the aggregate
 * verification ledger across every stored subsystem model, the models sorted
 * with pending proposals and recent Maintain runs first (then
 * farthest-from-verified), pending correction proposals inline with
 * accept/reject, and a repo filter like the Subsystems tab's drilldown. Mounts
 * as the full-bleed Maintenance tab view.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@principal-ade/industry-theme";
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
import { MaintainModelPickerModal } from "../components/MaintainModelPickerModal";
import { ProposalsModal } from "../components/ProposalsModal";
import { DeleteAllProposalsDialog } from "../components/DeleteAllProposalsDialog";
import { RunMaintenanceConfirm } from "../components/RunMaintenanceConfirm";
import { AcceptConfidentDialog } from "../components/AcceptConfidentDialog";
import { LaneHelpDialog } from "../components/LaneHelpDialog";
import { MaintenanceHeader } from "../components/MaintenanceHeader";
import {
	LANE_META,
	laneStatusColor,
	MaintenanceModelList,
	RUN_COPY_FEEDBACK_MS,
	type FeedEntry,
} from "../components/MaintenanceModelList";
import { MaintenanceRepoList, repoBreakdown } from "../components/MaintenanceRepoList";

/**
 * Write text to the system clipboard via the host. `navigator.clipboard` needs
 * the transient user activation of the click, which is lost once we `await` the
 * brief RPC first — the host writes natively instead and needs no gesture.
 */
async function writeClipboard(text: string): Promise<boolean> {
	try {
		const res = await electrobun.rpc!.request.writeClipboard({ text });
		return res.ok;
	} catch {
		return false;
	}
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

export function MaintenancePanel() {
	const { theme } = useTheme();
	const muted = theme.colors.textSecondary;
	// The full-bleed tab view bleeds to its edges (header border, repo list
	// border run full width); the inner scroll column supplies its own pad.
	const [overview, setOverview] = useState<MaintenanceOverview | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Graph whose "Run maintenance" click opened the model picker.
	const [pickTarget, setPickTarget] = useState<MaintenanceOverviewModel | null>(null);
	// Batch "Audit all" over visible models.
	const [auditAllStarting, setAuditAllStarting] = useState(false);
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
	// Model whose per-model proposals modal is open (from its lane badge).
	const [proposalsTarget, setProposalsTarget] = useState<{
		graphId: string;
		title: string;
		/** Lane the badge belongs to — scopes the modal to that lane. */
		lane?: SubsystemVerificationLane;
	} | null>(null);
	// Run maintenance while proposals exist → confirm deleting them first.
	const [runConfirm, setRunConfirm] = useState<
		| { kind: "single"; graphId: string; title: string; count: number }
		| { kind: "batch"; count: number }
		| null
	>(null);
	const [runConfirmBusy, setRunConfirmBusy] = useState(false);
	// Which lane's "what does this mean" popover is open (header legend).
	const [laneHelp, setLaneHelp] = useState<SubsystemVerificationLane | null>(
		null,
	);
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
	// Model whose "Brief agent" copy just landed (flashes the button).
	const [briefCopiedId, setBriefCopiedId] = useState<string | null>(null);
	const briefCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (briefCopyTimer.current) clearTimeout(briefCopyTimer.current);
		},
		[],
	);

	const copyBriefFor = useCallback(async (graphId: string) => {
		try {
			const res = await electrobun.rpc!.request.getSubsystemModelBrief({
				graphId,
			});
			if (!res.ok || !res.brief) return;
			const copied = await writeClipboard(res.brief);
			if (!copied) return;
			setBriefCopiedId(graphId);
			if (briefCopyTimer.current) clearTimeout(briefCopyTimer.current);
			briefCopyTimer.current = setTimeout(
				() => setBriefCopiedId(null),
				RUN_COPY_FEEDBACK_MS,
			);
		} catch {
			// best-effort — surface nothing when the copy can't happen
		}
	}, []);

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

	/** Open the live events panel over the model's graph (no auto-open on start). */
	const openRunEvents = useCallback(
		(sessionId: string | undefined, graphId: string, title?: string, agent?: string) => {
			if (!sessionId) return;
			void electrobun.rpc!.request
				.openMaintainLive({ sessionId, graphId, title, agent })
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

	// Expand/collapse a model's run history; expanding lazily loads its
	// proposals so each run row can show what it accomplished.
	const toggleRuns = useCallback(
		(graphId: string) => {
			const expanding = !expandedRunsIds.has(graphId);
			setExpandedRunsIds((prev) => {
				const next = new Set(prev);
				if (next.has(graphId)) next.delete(graphId);
				else next.add(graphId);
				return next;
			});
			if (expanding) void loadProposalsFor(graphId);
		},
		[expandedRunsIds, loadProposalsFor],
	);

	// Clicking "Run maintenance" on a model with proposals asks to delete them
	// first; otherwise it opens the model picker directly.
	const onRunMaintenance = useCallback((m: MaintenanceOverviewModel) => {
		if (m.pendingProposalCount > 0) {
			setRunConfirm({
				kind: "single",
				graphId: m.graphId,
				title: m.title,
				count: m.pendingProposalCount,
			});
			return;
		}
		setPickTarget(m);
	}, []);

	const onOpenRun = useCallback(
		(run: SubsystemModelRun, m: MaintenanceOverviewModel) => {
			openRunEvents(run.sessionId, run.graphId, m.title, run.agent);
		},
		[openRunEvents],
	);

	// A card's live agent strip: open the in-flight run's events tab, falling
	// back to the model title / feed agent when the overview row lacks them.
	const onOpenLive = useCallback(
		(m: MaintenanceOverviewModel, feed?: FeedEntry) => {
			openRunEvents(
				feed?.sessionId,
				m.graphId,
				m.title || feed?.title,
				feed?.agent,
			);
		},
		[openRunEvents],
	);

	const onOpenLane = useCallback(
		(m: MaintenanceOverviewModel, lane: SubsystemVerificationLane) => {
			onModelOpen(m, lane);
		},
		[onModelOpen],
	);

	const onOpenProposals = useCallback(
		(m: MaintenanceOverviewModel, lane: SubsystemVerificationLane) => {
			setProposalsTarget({ graphId: m.graphId, title: m.title, lane });
		},
		[],
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

	// Pending proposals per model, grouped by lane — badges the lane icons.
	const proposalCountsByGraph = useMemo(() => {
		const map = new Map<
			string,
			Partial<Record<SubsystemVerificationLane, number>>
		>();
		for (const { graphId, proposal } of pending) {
			const lane = proposal.lane;
			if (!lane) continue;
			const counts = map.get(graphId) ?? {};
			counts[lane] = (counts[lane] ?? 0) + 1;
			map.set(graphId, counts);
		}
		return map;
	}, [pending]);

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
	// "Audit all" batch progress, derived from the host's auditing set — no
	// local counter, so it stays correct across re-renders and broadcasts.
	const auditAuditTotal = visibleModels.length;
	const auditAuditedCount = useMemo(
		() =>
			visibleModels.filter((m) => !visibleAuditing.includes(m.graphId)).length,
		[visibleModels, visibleAuditing],
	);
	const auditAllActive =
		!auditAllStarting && visibleAuditing.length > 0 && auditAuditedCount < auditAuditTotal;

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
	// Every in-flight model must appear as a card, including ones whose feed is
	// still streaming but which the overview's `running` set no longer carries.
	const cardModels = useMemo(() => {
		const byId = new Map(visibleModels.map((m) => [m.graphId, m] as const));
		const extra: MaintenanceOverviewModel[] = [];
		for (const gid of inFlightGraphs) {
			if (byId.has(gid)) continue;
			const base = (overview?.models ?? []).find((m) => m.graphId === gid);
			if (base) {
				byId.set(gid, base);
				extra.push(base);
			}
		}
		return extra.length === 0 ? visibleModels : [...visibleModels, ...extra];
	}, [visibleModels, inFlightGraphs, overview]);

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
	// Models with pending proposals have them deleted first (confirmed upstream).
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

	// Confirm deleting existing proposals, then run maintenance.
	const confirmRunWithProposals = useCallback(async () => {
		if (!runConfirm) return;
		setRunConfirmBusy(true);
		try {
			if (runConfirm.kind === "single") {
				await electrobun.rpc!.request.deleteSubsystemModelProposals({
					graphId: runConfirm.graphId,
				});
				const model = (overview?.models ?? []).find(
					(m) => m.graphId === runConfirm.graphId,
				);
				await load();
				if (model) setPickTarget(model);
			} else {
				const withProposals = visibleModels.filter(
					(m) => m.pendingProposalCount > 0,
				);
				for (const m of withProposals) {
					await electrobun.rpc!.request.deleteSubsystemModelProposals({
						graphId: m.graphId,
					});
				}
				await load();
				void runRepoMaintenance();
			}
		} finally {
			setRunConfirmBusy(false);
			setRunConfirm(null);
		}
	}, [runConfirm, overview, visibleModels, load, runRepoMaintenance]);

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
			aria-label="Maintenance agent"
			style={{
				fontFamily: theme.fonts.body,
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
				color: theme.colors.text,
			}}
		>
			<div
				style={{
					flex: 1,
					minHeight: 0,
					color: theme.colors.text,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				<MaintenanceHeader
					modelCount={visibleModels.length}
					auditAllActive={auditAllActive}
					auditAllStarting={auditAllStarting}
					auditAuditedCount={auditAuditedCount}
					auditAuditTotal={auditAuditTotal}
					repoBatchActive={repoBatchActive}
					repoBatchStopping={repoBatchStopping}
					repoBatchDone={repoBatchDone}
					repoBatchSkipped={repoBatchSkipped}
					repoBatchStopped={repoBatchStopped}
					pendingCount={pending.length}
					confidentPendingCount={confidentPending.length}
					confidenceThreshold={confidenceThreshold}
					onAuditAll={() => {
						setAuditAllStarting(true);
						void electrobun.rpc!.request
							.auditSubsystemModels({
								graphIds: visibleModels.map((m) => m.graphId),
							})
							.finally(() => setAuditAllStarting(false));
					}}
					onRunAll={() => {
						const withProposals = visibleModels.filter(
							(m) => m.pendingProposalCount > 0,
						);
						if (withProposals.length > 0) {
							setRunConfirm({
								kind: "batch",
								count: withProposals.reduce(
									(n, m) => n + m.pendingProposalCount,
									0,
								),
							});
							return;
						}
						void runRepoMaintenance();
					}}
					onStopAll={() => {
						repoBatchCancel.current = true;
						setRepoBatchStopping(true);
					}}
					onDeleteAll={() => {
						setDeleteAllError(null);
						setDeleteAllOpen(true);
					}}
					onAcceptConfident={() => {
						setAcceptBatch({});
						setAcceptConfidentOpen(true);
					}}
					onOpenLane={setLaneHelp}
				/>
				{error && (
					<p
						style={{
							margin: "0 0 12px",
							padding: "0 24px",
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
							padding: "0 24px",
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
							alignItems: "stretch",
						}}
					>
						<MaintenanceRepoList
							repoBreaks={repoBreaks}
							selectedKey={activeRepoKey}
							onSelect={onSelectRepo}
						/>
						<div
							style={{
								flex: 1,
								minWidth: 0,
								minHeight: 0,
								overflowY: "auto",
								borderLeft: `1px solid ${theme.colors.border ?? "#333"}`,
								paddingLeft: 12,
							}}
						>
				{overview && (
					<MaintenanceModelList
						models={cardModels}
						running={overview.running}
						auditing={auditing}
						runsByGraph={runsByGraph}
						proposalsByGraph={proposalsByGraph}
						feeds={feeds}
						expandedRuns={expandedRunsIds}
						briefCopiedId={briefCopiedId}
						proposalCountsByGraph={proposalCountsByGraph}
						emptyMessage={
							overview.models.length === 0
								? "No subsystem models."
								: "No models reference this repo."
						}
						onToggleRuns={toggleRuns}
						onOpenModel={onModelOpen}
						onRunMaintenance={onRunMaintenance}
						onCopyBrief={copyBriefFor}
						onOpenLane={onOpenLane}
						onOpenProposals={onOpenProposals}
						onOpenRun={onOpenRun}
						onOpenLive={onOpenLive}
					/>
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
					agent={pickTarget.nextRoute?.agent}
					onClose={() => setPickTarget(null)}
					onStarted={onMaintainStarted}
				/>
			)}
			{acceptConfidentOpen &&
				createPortal(
					<AcceptConfidentDialog
						entries={confidentPending.map((entry) => ({
							id: entry.proposal.id,
							title: entry.title,
							confidencePct: Math.round(
								(entry.proposal.secondOpinion?.confidence ?? 0) * 100,
							),
						}))}
						threshold={confidenceThreshold}
						batch={acceptBatch}
						running={acceptBatchRunning}
						onCancel={() => setAcceptConfidentOpen(false)}
						onAccept={() => void runAcceptConfident(confidentPending)}
					/>,
					document.body,
				)}
						{deleteAllOpen &&
				createPortal(
					<DeleteAllProposalsDialog
						count={pending.length}
						running={deleteAllRunning}
						error={deleteAllError}
						onCancel={() => setDeleteAllOpen(false)}
						onConfirm={() => void runDeleteAll()}
					/>,
					document.body,
				)}
			{runConfirm &&
				createPortal(
					<RunMaintenanceConfirm
						kind={runConfirm.kind}
						count={runConfirm.count}
						busy={runConfirmBusy}
						onCancel={() => setRunConfirm(null)}
						onConfirm={() => void confirmRunWithProposals()}
						onViewProposals={
							runConfirm.kind === "single"
								? () => {
									const target = runConfirm;
									setRunConfirm(null);
									setProposalsTarget({
										graphId: target.graphId,
										title: target.title,
									});
								}
								: undefined
						}
					/>,
					document.body,
				)}
			{proposalsTarget &&
				createPortal(
					<ProposalsModal
						graphId={proposalsTarget.graphId}
						title={proposalsTarget.title}
						lane={proposalsTarget.lane}
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
					return (
						<LaneHelpDialog
							Icon={meta.Icon}
							name={LANE_HELP[laneHelp].name}
							blurb={LANE_HELP[laneHelp].blurb}
							legend={STATUS_LEGEND.map(({ status, label, desc }) => ({
								status,
								label,
								desc,
								color: laneStatusColor(status, theme.colors, muted),
							}))}
							onClose={() => setLaneHelp(null)}
						/>
					);
				})()}
					</div>
	);
}
