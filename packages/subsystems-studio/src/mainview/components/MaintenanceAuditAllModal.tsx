/**
 * MaintenanceAuditAllModal — "Audit all" batch surface for the Maintain tab.
 * Sequentially dry-runs the deterministic audit across every visible model,
 * showing per-model progress and a verdict + issue count when each finishes.
 * Reports are persisted host-side, so the Maintain overview reflects them on
 * reload after the modal closes.
 */

import { useEffect, useState } from "react";
import { Check, Loader2, ScanSearch, X } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	MaintenanceOverviewModel,
	SubsystemModelAuditReport,
} from "../../shared/contract";
import { electrobun } from "../rpc";
import { diagnosticIssueCount, diagnosticStatus } from "../subsystemIssues";

type BatchStatus = "pending" | "running" | "done" | "error";

type BatchEntry = {
	graphId: string;
	title: string;
	status: BatchStatus;
	report?: SubsystemModelAuditReport;
	error?: string;
};

function statusLabel(status: "unknown" | "issues" | "gaps" | "ok"): string {
	if (status === "issues") return "Issues";
	if (status === "gaps") return "Partial";
	if (status === "ok") return "Verified";
	return "—";
}

export function MaintenanceAuditAllModal({
	models,
	onClose,
}: {
	models: MaintenanceOverviewModel[];
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

	const [entries, setEntries] = useState<BatchEntry[]>(() =>
		models.map((m) => ({
			graphId: m.graphId,
			title: m.title,
			status: "pending" as const,
		})),
	);
	const [refreshing, setRefreshing] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			for (let i = 0; i < models.length; i++) {
				if (cancelled) break;
				const graphId = models[i].graphId;
				setEntries((prev) =>
					prev.map((e, idx) =>
						idx === i ? { ...e, status: "running" } : e,
					),
				);
				try {
					const res = await electrobun.rpc!.request.auditSubsystemModel({
						graphId,
					});
					if (cancelled) break;
					setEntries((prev) =>
						prev.map((e, idx) =>
							idx === i
								? res.ok && res.report
									? { ...e, status: "done", report: res.report }
									: { ...e, status: "error", error: res.error ?? "Audit failed" }
								: e,
						),
					);
				} catch (err) {
					if (cancelled) break;
					setEntries((prev) =>
						prev.map((e, idx) =>
							idx === i
								? {
										...e,
										status: "error",
										error: err instanceof Error ? err.message : String(err),
									}
								: e,
						),
					);
				}
			}
			if (!cancelled) setRefreshing(false);
		})();
		return () => {
			cancelled = true;
		};
	}, [models]);

	const doneCount = entries.filter((e) => e.status === "done").length;
	const errorCount = entries.filter((e) => e.status === "error").length;
	const issueTotal = entries.reduce(
		(sum, e) => sum + diagnosticIssueCount(e.report ?? null),
		0,
	);
	const running = refreshing || entries.some((e) => e.status === "running");

	return (
		<div
			role="dialog"
			aria-modal
			aria-label="Audit all subsystem models"
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 2147483000,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 24,
				background: "rgba(0,0,0,0.55)",
				fontFamily: theme.fonts.body,
			}}
		>
			<div
				style={{
					width: "min(640px, calc(100vw - 48px))",
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
							<ScanSearch size={16} style={{ color: theme.colors.primary }} />
							Audit all — {models.length} model{models.length === 1 ? "" : "s"}
						</div>
						<div
							style={{
								fontSize: theme.fontSizes[0],
								color: muted,
								lineHeight: 1.4,
							}}
						>
							{running
								? "Dry-run verification against current HEAD+dirty source…"
								: `${doneCount} audited · ${issueTotal} issue${issueTotal === 1 ? "" : "s"}${errorCount > 0 ? ` · ${errorCount} failed` : ""}`}
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close audit all"
						style={{
							background: "transparent",
							border: "none",
							color: muted,
							cursor: "pointer",
							padding: 4,
							display: "inline-flex",
						}}
					>
						<X size={16} />
					</button>
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
					{entries.map((e) => {
						const status = e.report ? diagnosticStatus(e.report) : null;
						const issues = diagnosticIssueCount(e.report ?? null);
						return (
							<div
								key={e.graphId}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									padding: "8px 10px",
									borderRadius: 6,
									border: `1px solid ${theme.colors.border}`,
									background: theme.colors.background,
									fontSize: theme.fontSizes[1],
								}}
							>
								{e.status === "running" && (
									<Loader2
										size={13}
										className="principal-studio-spin"
										style={{ flexShrink: 0, color: theme.colors.primary }}
									/>
								)}
								{e.status === "done" && (
									<Check
										size={13}
										style={{
											flexShrink: 0,
											color: status === "issues" ? (theme.colors.error ?? "#e5534b") : (theme.colors.success ?? "#2da44e"),
										}}
									/>
								)}
								{e.status === "error" && (
									<span
										style={{
											flexShrink: 0,
											color: theme.colors.error ?? "#e5534b",
											fontSize: theme.fontSizes[1],
										}}
									>
										✕
									</span>
								)}
								{e.status === "pending" && (
									<span
										style={{
											flexShrink: 0,
											color: muted,
											fontSize: theme.fontSizes[1],
										}}
									>
										•
									</span>
								)}
								<span style={{ flex: 1, minWidth: 0 }}>{e.title}</span>
								{e.status === "pending" && (
									<span style={{ fontSize: theme.fontSizes[0], color: muted }}>
										Queued
									</span>
								)}
								{e.status === "running" && (
									<span style={{ fontSize: theme.fontSizes[0], color: muted }}>
										Auditing…
									</span>
								)}
								{e.status === "done" && status && (
									<span
										style={{
											fontSize: theme.fontSizes[0],
											fontWeight: 600,
											textTransform: "uppercase",
											letterSpacing: 0.3,
											color:
												status === "issues"
													? (theme.colors.error ?? "#e5534b")
													: status === "gaps"
														? muted
														: (theme.colors.success ?? "#2da44e"),
											fontVariantNumeric: "tabular-nums",
										}}
									>
										{statusLabel(status)}
										{issues > 0 ? ` · ${issues}` : ""}
									</span>
								)}
								{e.status === "error" && (
									<span
										style={{
											fontSize: theme.fontSizes[0],
											color: theme.colors.error ?? "#e5534b",
											maxWidth: 320,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{e.error}
									</span>
								)}
							</div>
						);
					})}
				</div>

				<div
					style={{
						display: "flex",
						justifyContent: "flex-end",
						padding: "12px 20px",
						borderTop: `1px solid ${theme.colors.border}`,
						background: theme.colors.background,
					}}
				>
					<button
						type="button"
						disabled={running}
						onClick={onClose}
						style={{
							padding: "0 14px",
							height: 32,
							borderRadius: 6,
							fontSize: theme.fontSizes[1],
							fontWeight: 500,
							fontFamily: theme.fonts.body,
							background: theme.colors.primary,
							color: theme.colors.background,
							border: `1px solid ${theme.colors.primary}`,
							cursor: running ? "default" : "pointer",
							opacity: running ? 0.6 : 1,
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						{running ? "Auditing…" : "Done"}
					</button>
				</div>
			</div>
		</div>
	);
}