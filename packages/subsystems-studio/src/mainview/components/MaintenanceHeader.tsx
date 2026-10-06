/**
 * MaintenanceHeader — the Maintainer tab's header bar: the "Maintainer" title
 * with the per-lane help buttons, and the proposal actions (Delete all, Accept
 * confident). Pure — every action is forwarded to the panel via callbacks.
 *
 * The batch controls (Audit all, Run maintenance on all) live in
 * {@link MaintenanceBatchActions}, rendered on the models section's "Models"
 * label row so they sit with the list they act on.
 *
 * Also exports `LaneIconButton`, the header's lane help button.
 */

import { useState } from "react";
import {
	BadgeCheck,
	Bot,
	Loader2,
	Box,
	ScanSearch,
	Square,
	Trash2,
	Wrench,
} from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type { SubsystemVerificationLane } from "../../shared/contract";
import { LANE_META } from "./MaintenanceModelList";

/** Header lane-legend icon: theme-coloured hover background, no tooltip. */
export function LaneIconButton({
	lane,
	label,
	Icon,
	onOpen,
}: {
	lane: SubsystemVerificationLane;
	label: string;
	Icon: typeof Box;
	onOpen: (lane: SubsystemVerificationLane) => void;
}) {
	const { theme } = useTheme();
	const [hover, setHover] = useState(false);
	const hoverBackground =
		theme.colors.backgroundTertiary ??
		theme.colors.backgroundSecondary ??
		theme.colors.border;
	return (
		<button
			type="button"
			onClick={() => onOpen(lane)}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			aria-label={`About ${label} verification`}
			style={{
				background: hover ? hoverBackground : `${hoverBackground}33`,
				border: `1px solid ${theme.colors.border ?? "#333"}`,
				borderRadius: 6,
				padding: "0 10px",
				height: 26,
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				cursor: "pointer",
				color: theme.colors.text,
				fontSize: theme.fontSizes[1],
				fontFamily: theme.fonts.body,
				transition: "background-color 120ms ease, border-color 120ms ease",
			}}
		>
			<Icon size={11} color={theme.colors.primary} />
			{label}
		</button>
	);
}

/** Shared style for the header's transparent, bordered action buttons. */
function actionButtonStyle(
	theme: ReturnType<typeof useTheme>["theme"],
	color: string,
	disabled: boolean,
) {
	return {
		background: "transparent",
		border: `1px solid ${color}`,
		color,
		cursor: disabled ? "default" : "pointer",
		opacity: disabled ? 0.6 : 1,
		fontSize: theme.fontSizes[2],
		fontFamily: theme.fonts.body,
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
		padding: "4px 10px",
		borderRadius: 6,
	} as const;
}

/**
 * Batch controls for the models currently listed: Audit all, Run maintenance on
 * all, and — while a batch is in flight — Stop plus its counters. Rendered on the
 * "Models" label row rather than in the header bar: both act on every model in
 * the list, so they belong next to the list, and the header keeps the
 * proposal-wide actions. Pure — every action is forwarded to the panel.
 */
export function MaintenanceBatchActions({
	modelCount,
	auditAllActive,
	auditAllStarting,
	auditAuditedCount,
	auditAuditTotal,
	repoBatchActive,
	repoBatchStopping,
	repoBatchDone,
	repoBatchSkipped,
	repoBatchStopped,
	repoBatchFailed,
	repoBatchError,
	onAuditAll,
	onRunAll,
	onStopAll,
}: {
	/** Visible (repo-filtered) model count — gates the batch buttons. */
	modelCount: number;
	auditAllActive: boolean;
	auditAllStarting: boolean;
	auditAuditedCount: number;
	auditAuditTotal: number;
	repoBatchActive: boolean;
	repoBatchStopping: boolean;
	repoBatchDone: number;
	repoBatchSkipped: number;
	repoBatchStopped: number;
	/** Models whose run failed. Rendered so a fully-failed batch isn't silent. */
	repoBatchFailed: number;
	/** First failure message, shown as the failed-count's tooltip. */
	repoBatchError?: string;
	onAuditAll: () => void;
	onRunAll: () => void;
	onStopAll: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textSecondary;
	const idle = modelCount === 0;
	const auditDisabled = auditAllActive || idle;
	const runDisabled = repoBatchActive || idle;
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
			<button
				type="button"
				disabled={auditDisabled}
				onClick={onAuditAll}
				title="Dry-run the deterministic audit on every visible model (no agent, no mutations). Progress shows on each row."
				style={actionButtonStyle(theme, theme.colors.border ?? "#333", auditDisabled)}
			>
				{auditAllActive || auditAllStarting ? (
					<Loader2 size={13} className="principal-studio-spin" />
				) : (
					<ScanSearch size={13} />
				)}
				{auditAllActive
					? `Auditing ${auditAuditedCount}/${auditAuditTotal}…`
					: "Audit all"}
			</button>
			<button
				type="button"
				disabled={runDisabled}
				onClick={onRunAll}
				title="Run maintenance on every visible model in this repo, one at a time. Existing proposals are deleted first."
				style={actionButtonStyle(theme, theme.colors.primary, runDisabled)}
			>
				{repoBatchActive ? (
					<Loader2 size={13} className="principal-studio-spin" />
				) : (
					<Wrench size={13} />
				)}
				{repoBatchActive
					? `Running… ${repoBatchDone}/${modelCount}`
					: "Run maintenance on all"}
			</button>
			{repoBatchActive && (
				<button
					type="button"
					disabled={repoBatchStopping}
					onClick={onStopAll}
					title="Stop after the model currently running finishes."
					style={actionButtonStyle(
						theme,
						theme.colors.error ?? "#e5534b",
						repoBatchStopping,
					)}
				>
					<Square size={13} />
					{repoBatchStopping ? "Stopping…" : "Stop"}
				</button>
			)}
			{!repoBatchActive && repoBatchSkipped > 0 && (
				<span style={{ fontSize: theme.fontSizes[1], color: muted }}>
					{repoBatchSkipped} skipped (pending proposals)
				</span>
			)}
			{!repoBatchActive && repoBatchStopped > 0 && (
				<span style={{ fontSize: theme.fontSizes[1], color: muted }}>
					{repoBatchStopped} stopped
				</span>
			)}
			{!repoBatchActive && repoBatchFailed > 0 && (
				<span
					title={repoBatchError}
					style={{
						fontSize: theme.fontSizes[1],
						color: theme.colors.error ?? "#e5534b",
					}}
				>
					{repoBatchFailed} failed
				</span>
			)}
		</div>
	);
}

export function MaintenanceHeader({
	pendingCount,
	confidentPendingCount,
	confidenceThreshold,
	onDeleteAll,
	onAcceptConfident,
	onOpenLane,
}: {
	/** Pending proposals across every model — shows Delete all. */
	pendingCount: number;
	/** Visible pending proposals clearing the auto-accept bar. */
	confidentPendingCount: number;
	confidenceThreshold: number;
	onDeleteAll: () => void;
	onAcceptConfident: () => void;
	onOpenLane: (lane: SubsystemVerificationLane) => void;
}) {
	const { theme } = useTheme();
	return (
		<div
			style={{
				display: "flex",
				alignItems: "baseline",
				justifyContent: "space-between",
				gap: 12,
				padding: "24px 24px 12px",
				borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
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
						gap: 6,
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
							onOpen={onOpenLane}
						/>
					))}
				</span>
			</span>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				{pendingCount > 0 && (
					<button
						type="button"
						onClick={onDeleteAll}
						title="Delete every pending proposal across all models (keeps resolved history, does not change models)."
						style={actionButtonStyle(theme, theme.colors.error ?? "#e5534b", false)}
					>
						<Trash2 size={13} />
						Delete all
					</button>
				)}
				{confidentPendingCount > 0 && (
					<button
						type="button"
						onClick={onAcceptConfident}
						title={`Accept every visible proposal whose Jev second opinion cleared ${Math.round(confidenceThreshold * 100)}%.`}
						style={actionButtonStyle(theme, theme.colors.success ?? "#2da44e", false)}
					>
						<BadgeCheck size={13} />
						Accept {confidentPendingCount} confident
					</button>
				)}
			</div>
		</div>
	);
}
