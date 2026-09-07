/**
 * FailuresModal — lists concept extractions that errored, with the message and
 * a per-row retry. Opened from the header's failed-analysis chip.
 */

import { Loader2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type { ConceptAnalysis } from "../../shared/contract";

function formatFailDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function FailuresModal({
	analyses,
	retryingId,
	onRetry,
	onDelete,
	onClose,
}: {
	analyses: ConceptAnalysis[];
	retryingId: string | null;
	onRetry: (a: ConceptAnalysis) => void;
	onDelete: (a: ConceptAnalysis) => void;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<div
			role="dialog"
			aria-modal
			aria-label="Failed concept extractions"
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
						Failed concept extractions
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
					{analyses.length === 0 ? (
						<div style={{ fontSize: theme.fontSizes[1], color: muted, padding: "8px 4px" }}>
							No failed extractions to show.
						</div>
					) : (
						analyses.map((a) => {
							const isRetrying = retryingId === a.id;
							return (
								<div
									key={a.id}
									style={{
										display: "flex",
										alignItems: "flex-start",
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
										<div style={{ fontSize: theme.fontSizes[0], color: muted, marginBottom: 6 }}>
											{formatFailDate(a.createdAt)}
											{a.agent ? ` · ${a.agent}` : ""}
										</div>
										<div
											style={{
												fontSize: theme.fontSizes[0],
												fontFamily: theme.fonts.monospace,
												color: theme.colors.error ?? "#e5534b",
												lineHeight: 1.5,
												wordBreak: "break-word",
											}}
										>
											{a.error ?? "Unknown error"}
										</div>
									</div>
									<button
										type="button"
										disabled={isRetrying}
										onClick={() => onRetry(a)}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											padding: "6px 12px",
											borderRadius: 6,
											border: `1px solid ${theme.colors.border}`,
											background: theme.colors.backgroundSecondary,
											color: theme.colors.text,
											fontSize: theme.fontSizes[1],
											fontFamily: theme.fonts.body,
											cursor: isRetrying ? "default" : "pointer",
											opacity: isRetrying ? 0.6 : 1,
											flexShrink: 0,
										}}
									>
										{isRetrying && <Loader2 size={14} className="principal-studio-spin" />}
										{isRetrying ? "Restarting…" : "Retry"}
									</button>
									<button
										type="button"
										disabled={isRetrying}
										onClick={() => onDelete(a)}
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
											cursor: isRetrying ? "default" : "pointer",
											opacity: isRetrying ? 0.6 : 1,
											flexShrink: 0,
										}}
									>
										Delete
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
