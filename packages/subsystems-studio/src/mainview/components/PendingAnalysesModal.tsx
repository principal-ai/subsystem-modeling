/**
 * PendingAnalysesModal — lists concept extractions currently marked pending,
 * with basic provenance (session, agent, started-when) and a per-row discard.
 * Opened from the header's "Analyzing…" chip — mainly so a record left pending
 * by a crashed run can be identified and cleared instead of spinning forever.
 */

import { Loader2, Trash2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type { ConceptAnalysis } from "../../shared/contract";

function formatStarted(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return iso;
	const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
	if (secs < 60) return "just started";
	const mins = Math.floor(secs / 60);
	if (mins < 60) return `${mins} min ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours} hr ago`;
	return `${Math.floor(hours / 24)} day${Math.floor(hours / 24) === 1 ? "" : "s"} ago`;
}

export function PendingAnalysesModal({
	analyses,
	discardingId,
	onDiscard,
	onClose,
}: {
	analyses: ConceptAnalysis[];
	discardingId: string | null;
	onDiscard: (a: ConceptAnalysis) => void;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<div
			role="dialog"
			aria-modal
			aria-label="Pending concept extractions"
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
					width: "min(560px, calc(100vw - 48px))",
					maxHeight: "min(70vh, 600px)",
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
						alignItems: "center",
						justifyContent: "space-between",
						gap: 12,
						padding: "14px 20px",
						borderBottom: `1px solid ${theme.colors.border}`,
						background: theme.colors.background,
					}}
				>
					<span style={{ fontSize: theme.fontSizes[3], fontWeight: 600 }}>
						Pending concept extractions
					</span>
					<button
						type="button"
						onClick={onClose}
						style={{
							width: 28,
							height: 28,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 6,
							border: `1px solid ${theme.colors.border}`,
							background: theme.colors.background,
							color: theme.colors.textSecondary,
							fontSize: theme.fontSizes[2],
							cursor: "pointer",
							lineHeight: 1,
						}}
						title="Close"
					>
						×
					</button>
				</div>
				<div
					style={{
						flex: 1,
						minHeight: 0,
						overflowY: "auto",
						padding: 16,
					}}
				>
					<div style={{ fontSize: theme.fontSizes[0], color: muted, lineHeight: 1.5, marginBottom: 12 }}>
						Extraction runs in a background session and can be left pending if the
						viewer closes mid-run. Discard a stuck one to clear the indicator.
					</div>
					{analyses.length === 0 ? (
						<div style={{ fontSize: theme.fontSizes[1], color: muted, padding: "8px 4px" }}>
							No pending extractions to show.
						</div>
					) : (
						analyses.map((a) => {
							const isDiscarding = discardingId === a.id;
							return (
								<div
									key={a.id}
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: 12,
										padding: "12px 14px",
										marginBottom: 10,
										borderRadius: 8,
										background: theme.colors.background,
										border: `1px solid ${theme.colors.border}`,
									}}
								>
									<div style={{ minWidth: 0, flex: 1 }}>
										<div style={{ fontWeight: 600, fontSize: theme.fontSizes[1], marginBottom: 2 }}>
											{a.sessionTitle ?? a.sessionId}
										</div>
										<div style={{ fontSize: theme.fontSizes[0], color: muted }}>
											Started {formatStarted(a.createdAt)}
											{a.agent ? ` · ${a.agent}` : ""}
											{" · "}
											<span style={{ fontFamily: theme.fonts.monospace }}>
												{a.sessionId.slice(0, 12)}
											</span>
										</div>
									</div>
									<button
										type="button"
										disabled={isDiscarding}
										onClick={() => onDiscard(a)}
										title="Delete this analysis record and clear its indicator"
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											padding: "6px 12px",
											borderRadius: 6,
											border: `1px solid ${theme.colors.border}`,
											background: theme.colors.background,
											color: theme.colors.error ?? "#e5534b",
											fontSize: theme.fontSizes[1],
											fontFamily: theme.fonts.body,
											cursor: isDiscarding ? "default" : "pointer",
											opacity: isDiscarding ? 0.6 : 1,
											flexShrink: 0,
										}}
									>
										{isDiscarding ? (
											<Loader2 size={14} className="principal-studio-spin" />
										) : (
											<Trash2 size={14} />
										)}
										{isDiscarding ? "Discarding…" : "Discard"}
									</button>
								</div>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
}
