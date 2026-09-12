/**
 * Review agent-proposed subsystem model corrections (before/after + why).
 * Accept applies the patch; reject leaves the model unchanged.
 */

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import type { SubsystemModelProposal } from "../../shared/contract";
import { electrobun } from "../rpc";

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
	const [busyId, setBusyId] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const res = await electrobun.rpc!.request.listSubsystemModelProposals({
				graphId,
				includeResolved: false,
			});
			if (!res.ok) {
				setError(res.error ?? "Failed to load proposals");
				setProposals([]);
				return;
			}
			setError(null);
			setProposals(res.proposals ?? []);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setProposals([]);
		}
	}, [graphId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const onAccept = useCallback(
		async (proposalId: string) => {
			setBusyId(proposalId);
			try {
				const res = await electrobun.rpc!.request.acceptSubsystemModelProposal({
					graphId,
					proposalId,
				});
				if (!res.ok) {
					setError(res.error ?? "Accept failed");
					return;
				}
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusyId(null);
			}
		},
		[graphId, refresh],
	);

	const onReject = useCallback(
		async (proposalId: string) => {
			setBusyId(proposalId);
			try {
				const res = await electrobun.rpc!.request.rejectSubsystemModelProposal({
					graphId,
					proposalId,
				});
				if (!res.ok) {
					setError(res.error ?? "Reject failed");
					return;
				}
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusyId(null);
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
						const busy = busyId === p.id;
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
									<code
										style={{
											fontSize: theme.fontSizes[0],
											color: muted,
										}}
									>
										{p.id}
										{p.author ? ` · ${p.author}` : ""}
									</code>
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

								<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
									<button
										type="button"
										disabled={busy}
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
											cursor: busy ? "default" : "pointer",
											opacity: busy ? 0.6 : 1,
										}}
									>
										Reject
									</button>
									<button
										type="button"
										disabled={busy}
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
											cursor: busy ? "default" : "pointer",
											opacity: busy ? 0.6 : 1,
										}}
									>
										Accept
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
