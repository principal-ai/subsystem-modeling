/**
 * MaintenancePanel — the ambient Maintain agent surface: the aggregate
 * verification ledger across every stored subsystem model, the models sorted
 * farthest-from-verified first, pending correction proposals inline with
 * accept/reject, and a repo filter like the Subsystems tab's drilldown.
 * Renders as a full-bleed tab view by default (`overlay=false`), or wrapped in
 * a modal overlay for the legacy AppHeader chip (`overlay=true`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Boxes, Check, Loader2, Play } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { repoAvatarUrl } from "@principal-ai/subsystems-react";
import type {
	MaintenanceOverview,
	MaintenanceOverviewModel,
	MaintenanceOverviewProposal,
	StudioMessages,
} from "../../shared/contract";
import {
	electrobun,
	opencodeLiveFeedSubscribers,
	subsystemModelChangeSubscribers,
	subsystemModelMaintainChangeSubscribers,
	subsystemModelProposalsChangeSubscribers,
} from "../rpc";
import { MaintainModelPickerModal } from "./MaintainModelPickerModal";
import { RepoRow } from "./RepoRow";
import { buildMaintenanceOverview } from "../../bun/maintenance-overview";

function formatValue(v: unknown): string {
	if (v === undefined) return "—";
	if (v === null) return "null";
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}

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
 * FilesPanel drilldown: repo avatar + owner/name + model count per row, with an
 * "All repos" row on top. Clicking a repo narrows the model/pending lists to
 * models referencing it; clicking again (or clicking All) unfilters.
 */
function MaintenanceRepoList({
	totalModels,
	repoBreaks,
	selectedKey,
	onSelect,
}: {
	totalModels: number;
	repoBreaks: ReturnType<typeof repoBreakdown>;
	selectedKey: string | null;
	onSelect: (repoKey: string | null) => void;
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
			<RepoRow
				avatarFallback={<Boxes size={16} aria-hidden="true" />}
				label="All repos"
				title="Show models across all repos"
				badge={totalModels}
				active={selectedKey == null}
				onPress={() => onSelect(null)}
			/>
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
						onPress={() => onSelect(active ? null : repoKey)}
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
	// Per-card busy state so acting on one proposal never clears another's
	// in-flight indicator.
	const [busy, setBusy] = useState<Record<string, "accept" | "reject" | "scoring">>({});
	// Graph whose "Run maintenance" click opened the model picker.
	const [pickTarget, setPickTarget] = useState<MaintenanceOverviewModel | null>(null);
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

	const load = useCallback(async () => {
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
					events: payload.events.length,
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

	const resolve = useCallback(
		async (
			entry: MaintenanceOverviewProposal,
			action: "accept" | "reject",
		) => {
			const id = entry.proposal.id;
			setBusy((prev) => ({ ...prev, [id]: action }));
			setError(null);
			try {
				const req =
					action === "accept"
						? electrobun.rpc!.request.acceptSubsystemModelProposal({
								graphId: entry.graphId,
								proposalId: id,
							})
						: electrobun.rpc!.request.rejectSubsystemModelProposal({
								graphId: entry.graphId,
								proposalId: id,
							});
				const res = await req;
				if (!res.ok) setError(res.error ?? `${action} failed`);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				// Free the card as soon as the RPC settles; the overview reload
				// below may be slow and shouldn't hold the indicator.
				setBusy((prev) => {
					const next = { ...prev };
					delete next[id];
					return next;
				});
			}
			// Fire-and-forget: the host broadcast will also refresh us.
			void load();
		},
		[load],
	);

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

	const score = useCallback(
		async (entry: MaintenanceOverviewProposal) => {
			const id = entry.proposal.id;
			setBusy((prev) => ({ ...prev, [id]: "scoring" }));
			setError(null);
			try {
				const res = await electrobun.rpc!.request.scoreSubsystemModelProposal({
					graphId: entry.graphId,
					proposalId: id,
				});
				if (!res.ok) setError(res.error ?? "Second-opinion scoring failed");
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusy((prev) => {
					const next = { ...prev };
					delete next[id];
					return next;
				});
			}
			void load();
		},
		[load],
	);

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
					</span>
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
							totalModels={overview.models.length}
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

				{overview && visiblePending.length > 0 && (
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
							Pending proposals
						</div>
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 12,
								marginBottom: 20,
							}}
						>
							{visiblePending.map((entry) => {
								const p = entry.proposal;
								const cardAction = busy[p.id];
								const cardBusy = cardAction != null;
								const accepting = cardAction === "accept";
								const rejecting = cardAction === "reject";
								return (
									<article
										key={p.id}
										style={{
											padding: 14,
											borderRadius: 8,
											border: `1px solid ${theme.colors.border}`,
											background: theme.colors.background,
										}}
									>
										<div
											style={{
												display: "flex",
												justifyContent: "space-between",
												gap: 8,
												marginBottom: 6,
											}}
										>
											<span style={{ fontSize: theme.fontSizes[1], fontWeight: 600 }}>
												{entry.title}
											</span>
											<code style={{ fontSize: theme.fontSizes[0], color: muted }}>
												{p.author ? p.author : p.id}
											</code>
										</div>
										<p
											style={{
												margin: "0 0 10px",
												fontSize: theme.fontSizes[1],
												lineHeight: 1.5,
											}}
										>
											<strong>Why: </strong>
											{p.rationale}
										</p>
										<div
											style={{
												display: "flex",
												flexDirection: "column",
												gap: 6,
												marginBottom: 12,
											}}
										>
											{p.preview.map((row, i) => (
												<div
													key={`${row.label}-${i}`}
													style={{
														fontSize: theme.fontSizes[0],
														fontFamily:
															theme.fonts.monospace ?? "ui-monospace, monospace",
														lineHeight: 1.4,
														padding: "6px 8px",
														borderRadius: 6,
														background: theme.colors.surface,
														border: `1px solid ${theme.colors.border}`,
													}}
												>
													<div style={{ color: muted, marginBottom: 2 }}>
														{row.label}
													</div>
													<div>
														<span style={{ color: theme.colors.error ?? "#e5534b" }}>
															{formatValue(row.before)}
														</span>
														{" → "}
														<span style={{ color: theme.colors.success ?? "#2da44e" }}>
															{formatValue(row.after)}
														</span>
													</div>
												</div>
											))}
										</div>
										{p.secondOpinion ? (
											<p
												style={{
													margin: "0 0 12px",
													fontSize: theme.fontSizes[0],
													color: p.secondOpinion.error
														? (theme.colors.error ?? "#e5534b")
														: p.secondOpinion.verdict === "safe"
															? (theme.colors.success ?? "#2da44e")
															: p.secondOpinion.verdict === "unsafe"
																? (theme.colors.error ?? "#e5534b")
																: muted,
													lineHeight: 1.45,
												}}
											>
												{p.secondOpinion.error ? (
													<>Second opinion unavailable — {p.secondOpinion.error}</>
												) : (
													<>
														Second opinion ·{" "}
														{p.secondOpinion.verdict === "safe"
															? "Safe"
															: p.secondOpinion.verdict === "unsafe"
																? "Unsafe"
																: "Needs human"}{" "}
														{Math.round(p.secondOpinion.confidence * 100)}%
														{p.secondOpinion.changeKind ? ` · ${p.secondOpinion.changeKind}` : ""}
													</>
												)}
											</p>
										) : null}
										<div
											style={{
												display: "flex",
												gap: 8,
												justifyContent: "flex-end",
												flexWrap: "wrap",
											}}
										>
											{(!p.secondOpinion || p.secondOpinion.error) && (
												<button
													type="button"
													disabled={cardBusy}
													onClick={() => void score(entry)}
													title="Ask Jev for a second opinion without accepting"
													style={{
														padding: "0 12px",
														height: 32,
														borderRadius: 6,
														fontSize: theme.fontSizes[1],
														fontFamily: theme.fonts.body,
														background: "transparent",
														color: theme.colors.primary,
														border: `1px solid ${theme.colors.primary}`,
														cursor: cardBusy ? "default" : "pointer",
														opacity: cardBusy ? 0.6 : 1,
														display: "inline-flex",
														alignItems: "center",
														gap: 6,
													}}
												>
													{cardAction === "scoring" && (
														<Loader2 size={12} className="principal-studio-spin" />
													)}
													{cardAction === "scoring" ? "Scoring…" : p.secondOpinion?.error ? "Retry scoring" : "Get second opinion"}
												</button>
											)}
											<button
												type="button"
												disabled={cardBusy}
												onClick={() => void resolve(entry, "reject")}
												style={{
													padding: "0 12px",
													height: 32,
													borderRadius: 6,
													fontSize: theme.fontSizes[1],
													fontFamily: theme.fonts.body,
													background: "transparent",
													color: theme.colors.text,
													border: `1px solid ${theme.colors.border}`,
													cursor: cardBusy ? "default" : "pointer",
													opacity: cardBusy ? 0.6 : 1,
													display: "inline-flex",
													alignItems: "center",
													gap: 6,
												}}
											>
												{rejecting && (
													<Loader2 size={12} className="principal-studio-spin" />
												)}
												{rejecting ? "Rejecting…" : "Reject"}
											</button>
											<button
												type="button"
												disabled={cardBusy}
												onClick={() => void resolve(entry, "accept")}
												style={{
													padding: "0 12px",
													height: 32,
													borderRadius: 6,
													fontSize: theme.fontSizes[1],
													fontWeight: 500,
													fontFamily: theme.fonts.body,
													background: theme.colors.primary,
													color: theme.colors.background,
													border: `1px solid ${theme.colors.primary}`,
													cursor: cardBusy ? "default" : "pointer",
													opacity: cardBusy ? 0.6 : 1,
													display: "inline-flex",
													alignItems: "center",
													gap: 6,
												}}
											>
												{accepting ? (
													<Loader2 size={12} className="principal-studio-spin" />
												) : (
													<Check size={13} />
												)}
												{accepting ? "Accepting…" : "Accept"}
											</button>
										</div>
									</article>
								);
							})}
						</div>
					</>
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
										<span
											style={{
												fontSize: theme.fontSizes[0],
												color: muted,
												fontVariantNumeric: "tabular-nums",
											}}
										>
											{Math.round(m.coverage * 100)}%
										</span>
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
										{m.pendingProposalCount > 0 && (
											<span
												style={{
													fontSize: theme.fontSizes[0],
													padding: "1px 6px",
													borderRadius: 999,
													background: `${theme.colors.primary}22`,
													color: theme.colors.primary,
												}}
											>
												{m.pendingProposalCount} proposal
												{m.pendingProposalCount === 1 ? "" : "s"}
											</span>
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
