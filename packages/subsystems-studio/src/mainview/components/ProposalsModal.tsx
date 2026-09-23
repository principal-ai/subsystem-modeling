/**
 * Review agent-proposed subsystem model corrections (before/after + why).
 * Accept applies the patch; reject leaves the model unchanged.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	SubsystemModelProposal,
	SubsystemVerificationLane,
} from "../../shared/contract";
import { electrobun } from "../rpc";

const LANE_LABEL: Record<SubsystemVerificationLane, string> = {
	construct: "Construct",
	"static-topology": "Static topology",
	"runtime-topology": "Runtime topology",
	walkthrough: "Walkthrough",
};

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

const COPY_FEEDBACK_MS = 1500;

/**
 * Build a paste-ready brief for an agent explaining a proposal and why its
 * Jev second opinion came back low (uncertain / inaccurate / errored).
 */
function buildAgentPrompt(p: SubsystemModelProposal, title?: string): string {
	const lines: string[] = [];
	lines.push(
		"You are reviewing a correction proposal for a subsystem model. Its Jev second opinion scored low, and I need to understand why.",
	);
	lines.push("");
	lines.push("## Proposal");
	if (title) lines.push(`Model: ${title}`);
	lines.push(`Model id: ${p.graphId}`);
	lines.push(`Proposal id: ${p.id}`);
	if (p.author) lines.push(`Author: ${p.author}`);
	if (p.lane) lines.push(`Lane: ${LANE_LABEL[p.lane]}`);
	lines.push(`Created: ${p.createdAt}`);
	lines.push("");
	lines.push("### Rationale (why the agent wants this change)");
	lines.push(p.rationale || "(none)");
	if (p.finding?.message) {
		lines.push("");
		lines.push("### Audit finding");
		if (p.finding.kind) lines.push(`Kind: ${p.finding.kind}`);
		if (p.finding.severity) lines.push(`Severity: ${p.finding.severity}`);
		if (p.finding.componentName || p.finding.componentAlias) {
			lines.push(
				`Component: ${p.finding.componentName ?? p.finding.componentAlias}`,
			);
		}
		if (p.finding.relationId) lines.push(`Relation: ${p.finding.relationId}`);
		if (p.finding.walkthroughId) {
			lines.push(
				`Walkthrough: ${p.finding.walkthroughId}${
					p.finding.step != null ? ` step ${p.finding.step}` : ""
				}`,
			);
		}
		lines.push(p.finding.message);
	}
	if (p.preview.length > 0) {
		lines.push("");
		lines.push("### Proposed changes");
		for (const row of p.preview) {
			lines.push(
				`- ${row.label}: ${formatValue(row.before)} -> ${formatValue(row.after)}`,
			);
		}
	}
	lines.push("");
	lines.push("### Raw proposal JSON");
	lines.push("```json");
	lines.push(JSON.stringify(p, null, 2));
	lines.push("```");
	lines.push("");
	lines.push("## Second opinion (Jev)");
	if (!p.secondOpinion) {
		lines.push("Not scored yet.");
	} else {
		const o = p.secondOpinion;
		lines.push(`Source: ${o.source}`);
		lines.push(`Checked at: ${o.checkedAt}`);
		lines.push(`Verdict: ${o.verdict}`);
		lines.push(`Confidence: ${Math.round(o.confidence * 100)}%`);
		if (o.changeKind) lines.push(`Change kind: ${o.changeKind}`);
		if (o.risk) lines.push(`Risk: ${o.risk}`);
		if (o.error) lines.push(`Error: ${o.error}`);
	}
	lines.push("");
	lines.push("## What I need from you");
	lines.push(
		"Explain why the second opinion scored as it did. Is Jev right or wrong? Point at the specific files, symbols, and lines that support or refute the change, and say what the proposal should have claimed instead.",
	);
	return lines.join("\n");
}

function opinionBadge(
	opinion: NonNullable<SubsystemModelProposal["secondOpinion"]>,
	colors: { success?: string; error?: string; textSecondary?: string },
	muted: string,
): { text: string; color: string } {
	if (opinion.error) {
		return { text: `Second opinion unavailable — ${opinion.error}`, color: colors.error ?? "#e5534b" };
	}
	const pct = Math.round(opinion.confidence * 100);
	const label =
		opinion.verdict === "accurate"
			? "Accurate"
			: opinion.verdict === "inaccurate"
				? "Inaccurate"
				: "Uncertain";
	const color =
		opinion.verdict === "accurate"
			? (colors.success ?? "#2da44e")
			: opinion.verdict === "inaccurate"
				? (colors.error ?? "#e5534b")
				: muted;
	const extra = opinion.changeKind ? ` · ${opinion.changeKind}` : "";
	return { text: `Second opinion · ${label} ${pct}%${extra}`, color };
}

export function ProposalsModal({
	graphId,
	title,
	onClose,
}: {
	graphId: string;
	title?: string;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [proposals, setProposals] = useState<SubsystemModelProposal[] | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);
	// Per-card busy state so acting on one proposal never clears another's
	// in-flight indicator.
	const [busy, setBusy] = useState<Record<string, "accept" | "reject" | "scoring">>({});
	const [notice, setNotice] = useState<
		{ kind: "accepted" | "rejected"; changeCount: number } | null
	>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const onCopyForAgent = useCallback(
		async (p: SubsystemModelProposal) => {
			try {
				await navigator.clipboard.writeText(buildAgentPrompt(p, title));
				setCopiedId(p.id);
				if (copyTimer.current) clearTimeout(copyTimer.current);
				copyTimer.current = setTimeout(
					() => setCopiedId(null),
					COPY_FEEDBACK_MS,
				);
			} catch {
				// clipboard may be denied — fail quietly
			}
		},
		[title],
	);


	const refresh = useCallback(async () => {
		try {
			const res = await electrobun.rpc!.request.listSubsystemModelProposals({
				graphId,
				includeResolved: false,
			});
			if (!res.ok) {
				setError(res.error ?? "Failed to load proposals");
				setProposals([]);
				return [];
			}
			setError(null);
			const next = res.proposals ?? [];
			setProposals(next);
			return next;
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setProposals([]);
			return [];
		}
	}, [graphId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		return () => {
			if (closeTimer.current) clearTimeout(closeTimer.current);
			if (copyTimer.current) clearTimeout(copyTimer.current);
		};
	}, []);

	const scheduleClose = useCallback(
		(delayMs: number) => {
			if (closeTimer.current) clearTimeout(closeTimer.current);
			closeTimer.current = setTimeout(onClose, delayMs);
		},
		[onClose],
	);

	const onAccept = useCallback(
		async (proposalId: string) => {
			const target = proposals?.find((p) => p.id === proposalId);
			const changeCount =
				target?.changes.length ?? target?.preview.length ?? 0;
setBusy((prev) => ({ ...prev, [proposalId]: "accept" }));
			setNotice(null);
			setProposals((prev) =>
				(prev ?? []).filter((p) => p.id !== proposalId),
			);
			try {
				const res = await electrobun.rpc!.request.acceptSubsystemModelProposal({
					graphId,
					proposalId,
				});
				if (!res.ok) {
					const alreadyResolved =
						typeof res.error === "string" &&
						res.error.startsWith("proposal is already ");
					if (!alreadyResolved) {
						setError(res.error ?? "Accept failed");
						setProposals((prev) => {
							if (!target) return prev;
							const next = (prev ?? []).filter((p) => p.id !== proposalId);
							return [target, ...next];
						});
						return;
					}
				}
				const applied = res.proposal?.changes.length ?? changeCount;
				setNotice({ kind: "accepted", changeCount: applied });
				const remaining = await refresh();
				if (remaining.length === 0) scheduleClose(1600);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
				setProposals((prev) => {
					if (!target) return prev;
					const next = (prev ?? []).filter((p) => p.id !== proposalId);
					return [target, ...next];
				});
			} finally {
				setBusy((prev) => {
					const next = { ...prev };
					delete next[proposalId];
					return next;
				});
			}
		},
		[graphId, proposals, refresh, scheduleClose],
	);

	const onReject = useCallback(
		async (proposalId: string) => {
			const target = proposals?.find((p) => p.id === proposalId);
			const changeCount =
				target?.changes.length ?? target?.preview.length ?? 0;
			setBusy((prev) => ({ ...prev, [proposalId]: "reject" }));
			setNotice(null);
			try {
				const res = await electrobun.rpc!.request.rejectSubsystemModelProposal({
					graphId,
					proposalId,
				});
				if (!res.ok) {
					const alreadyResolved =
						typeof res.error === "string" &&
						res.error.startsWith("proposal is already ");
					if (!alreadyResolved) {
						setError(res.error ?? "Reject failed");
						return;
					}
				}
				const discarded = res.proposal?.changes.length ?? changeCount;
				setNotice({ kind: "rejected", changeCount: discarded });
				const remaining = await refresh();
				if (remaining.length === 0) scheduleClose(1600);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusy((prev) => {
					const next = { ...prev };
					delete next[proposalId];
					return next;
				});
			}
		},
		[graphId, proposals, refresh, scheduleClose],
	);

	const onScore = useCallback(
		async (proposalId: string) => {
			setBusy((prev) => ({ ...prev, [proposalId]: "scoring" }));
			setError(null);
			try {
				const res = await electrobun.rpc!.request.scoreSubsystemModelProposal({
					graphId,
					proposalId,
				});
				if (!res.ok) {
					setError(res.error ?? "Second-opinion scoring failed");
					return;
				}
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusy((prev) => {
					const next = { ...prev };
					delete next[proposalId];
					return next;
				});
			}
		},
		[graphId, refresh],
	);

	return (
		<div
			role="dialog"
			aria-modal
			aria-label="Correction proposals"
			onClick={onClose}
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
					width: "min(640px, calc(100vw - 48px))",
					maxHeight: "min(80vh, 720px)",
					overflow: "auto",
					background: theme.colors.surface,
					border: `1px solid ${theme.colors.border}`,
					borderRadius: 12,
					padding: 24,
					boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
					color: theme.colors.text,
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
					<span style={{ fontSize: theme.fontSizes[3], fontWeight: 600 }}>
						Proposed corrections
					</span>
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
				</div>
				<p
					style={{
						margin: "0 0 16px",
						fontSize: theme.fontSizes[0],
						color: muted,
						lineHeight: 1.5,
					}}
				>
					{title ? `${title} — ` : ""}
					Review what the agent wants to change and why before applying.
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

				{notice && (
					<p
						role="status"
						style={{
							margin: "0 0 12px",
							padding: "8px 12px",
							borderRadius: 8,
							border: `1px solid ${
								notice.kind === "accepted"
									? (theme.colors.success ?? "#2da44e")
									: theme.colors.border
							}`,
							background:
								notice.kind === "accepted"
									? "rgba(45, 164, 78, 0.10)"
									: theme.colors.background,
							color:
								notice.kind === "accepted"
									? (theme.colors.success ?? "#2da44e")
									: muted,
							fontSize: theme.fontSizes[1],
							lineHeight: 1.5,
						}}
					>
						{notice.kind === "accepted"
							? `Accepted — applied ${notice.changeCount} change${notice.changeCount === 1 ? "" : "s"}. Closing…`
							: `Rejected — discarded ${notice.changeCount} change${notice.changeCount === 1 ? "" : "s"}. Closing…`}
					</p>
				)}

				{proposals === null && (
					<p style={{ color: muted, fontSize: theme.fontSizes[1] }}>Loading…</p>
				)}

				{proposals && proposals.length === 0 && (
					<p style={{ color: muted, fontSize: theme.fontSizes[1] }}>
						No pending proposals.
					</p>
				)}

				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					{(proposals ?? []).map((p) => {
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
										marginBottom: 8,
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											minWidth: 0,
										}}
									>
										<code
											style={{
												fontSize: theme.fontSizes[0],
												color: muted,
											}}
										>
											{p.id}
											{p.author ? ` · ${p.author}` : ""}
										</code>
										{p.lane && (
											<span
												style={{
													padding: "1px 6px",
													borderRadius: 4,
													border: `1px solid ${theme.colors.border}`,
													fontSize: theme.fontSizes[0],
													color: muted,
													whiteSpace: "nowrap",
												}}
											>
												{LANE_LABEL[p.lane]}
											</span>
										)}
									</div>
									<span style={{ fontSize: theme.fontSizes[0], color: muted }}>
										{new Date(p.createdAt).toLocaleString()}
									</span>
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

								{p.finding?.message && (
									<p
										style={{
											margin: "0 0 10px",
											fontSize: theme.fontSizes[0],
											color: muted,
											lineHeight: 1.45,
										}}
									>
										Finding
										{p.finding.kind ? ` (${p.finding.kind})` : ""}:{" "}
										{p.finding.message}
									</p>
								)}

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
												fontFamily: theme.fonts.monospace ?? "ui-monospace, monospace",
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
										title={`Jev ${p.secondOpinion.source} · ${p.secondOpinion.checkedAt}${p.secondOpinion.risk ? ` · risk ${p.secondOpinion.risk}` : ""}${p.secondOpinion.error ? ` · ${p.secondOpinion.error}` : ""}`}
										style={{
											margin: "0 0 12px",
											fontSize: theme.fontSizes[0],
											color: opinionBadge(p.secondOpinion, theme.colors, muted).color,
											lineHeight: 1.45,
										}}
									>
										{opinionBadge(p.secondOpinion, theme.colors, muted).text}
									</p>
								) : null}

								<div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
									<button
										type="button"
										onClick={() => void onCopyForAgent(p)}
										title="Copy a prompt asking an agent why this second opinion was low"
										style={{
											padding: "0 12px",
											height: 32,
											borderRadius: 6,
											fontSize: theme.fontSizes[1],
											fontFamily: theme.fonts.body,
											background: "transparent",
											color: muted,
											border: `1px solid ${theme.colors.border}`,
											cursor: "pointer",
											display: "inline-flex",
											alignItems: "center",
											gap: 6,
											marginRight: "auto",
										}}
									>
										{copiedId === p.id ? (
											<Check size={12} />
										) : (
											<Copy size={12} />
										)}
										{copiedId === p.id ? "Copied" : "Copy for agent"}
									</button>
									{(!p.secondOpinion || p.secondOpinion.error) && (
										<button
											type="button"
											disabled={cardBusy}
											onClick={() => void onScore(p.id)}
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
										onClick={() => void onReject(p.id)}
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
										onClick={() => void onAccept(p.id)}
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
										{accepting && (
											<Loader2 size={12} className="principal-studio-spin" />
										)}
										{accepting ? "Accepting…" : "Accept"}
									</button>
								</div>
							</article>
						);
					})}
				</div>
			</div>
		</div>
	);
}
