/**
 * AcceptConfidentDialog — batch "Accept N confident proposals" review. Lists
 * each candidate with its Jev confidence and per-row progress while accepting.
 * Presentational; the caller owns the portal and the accept run.
 */

import { BadgeCheck, Check, Loader2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";

export type AcceptBatchState = Record<
	string,
	{ status: "pending" | "running" | "done" | "error"; error?: string }
>;

export interface AcceptConfidentEntry {
	id: string;
	/** Model / proposal label shown in the row. */
	title: string;
	confidencePct: number;
}

export function AcceptConfidentDialog({
	entries,
	threshold,
	batch,
	running,
	onCancel,
	onAccept,
}: {
	entries: AcceptConfidentEntry[];
	/** Jev confidence bar (0-1) rendered into the lead copy. */
	threshold: number;
	batch: AcceptBatchState;
	running: boolean;
	onCancel: () => void;
	onAccept: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textSecondary;
	const anyStarted = Object.keys(batch).length > 0;
	return (
		<div
			role="dialog"
			aria-modal
			aria-label="Accept confident proposals"
			onClick={() => {
				if (!running) onCancel();
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
							Accept {entries.length} confident proposal
							{entries.length === 1 ? "" : "s"}
						</div>
						<div
							style={{
								fontSize: theme.fontSizes[1],
								color: muted,
								lineHeight: 1.4,
							}}
						>
							{running
								? "Applying patches…"
								: `Each cleared the Jev confidence bar of ${Math.round(
										threshold * 100,
									)}%. Lower-scoring proposals stay pending.`}
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
					{entries.map((entry) => {
						const state = batch[entry.id];
						return (
							<div
								key={entry.id}
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
										• {entry.confidencePct}%
									</span>
								)}
								<span
									style={{
										flex: 1,
										minWidth: 0,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
								>
									{entry.title}
								</span>
								<span
									style={{
										fontSize: theme.fontSizes[1],
										color:
											state?.status === "error"
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
												: `Jev ${entry.confidencePct}%`)}
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
						disabled={running}
						onClick={onCancel}
						style={{
							padding: "0 12px",
							height: 32,
							borderRadius: 6,
							fontSize: theme.fontSizes[2],
							fontFamily: theme.fonts.body,
							background: "transparent",
							color: theme.colors.text,
							border: `1px solid ${theme.colors.border}`,
							cursor: running ? "default" : "pointer",
							opacity: running ? 0.6 : 1,
						}}
					>
						{running ? "Close" : "Cancel"}
					</button>
					{!running && !anyStarted && (
						<button
							type="button"
							onClick={onAccept}
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
							Accept {entries.length}
						</button>
					)}
					{!running && anyStarted && (
						<button
							type="button"
							onClick={onCancel}
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
							}}
						>
							Done
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
