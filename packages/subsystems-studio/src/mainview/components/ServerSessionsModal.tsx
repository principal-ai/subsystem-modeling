/**
 * ServerSessionsModal — the session list behind the header's opencode-server
 * chip. Shows sessions that are active now (busy/retry) or were updated in the
 * last 10 minutes, with each session's most recent event and when it happened.
 *
 * The list snapshots come from the host's `getServerSessions` (session list +
 * status endpoints), polled every 10s while open. Live "last event" updates
 * arrive over `serverEventsChanged` — the host's single /api/event
 * subscription, throttled — and are merged in by sessionId between polls.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type { ServerSessionRow } from "../../shared/contract";
import { electrobun, serverEventSubscribers } from "../rpc";
import { relativeTime } from "../ui";

const EVENT_LABELS: Record<string, string> = {
	"session.next.prompted": "prompted",
	"session.next.prompt.admitted": "prompt admitted",
	"session.next.step.started": "step started",
	"session.next.step.ended": "step ended",
	"session.next.step.failed": "step failed",
	"session.next.text.started": "started responding",
	"session.next.text.delta": "responding…",
	"session.next.text.ended": "finished responding",
	"session.next.reasoning.delta": "reasoning…",
	"session.next.reasoning.ended": "finished reasoning",
	"session.next.tool.called": "called tool",
	"session.next.tool.success": "tool completed",
	"session.next.tool.failed": "tool failed",
	"session.next.shell.started": "shell started",
	"session.next.shell.ended": "shell ended",
	"session.next.compaction.started": "compacting",
	"session.next.retried": "retrying",
	"session.next.agent.switched": "agent switched",
	"session.next.model.switched": "model switched",
	"session.next.context.updated": "context updated",
	"session.status": "status change",
};

function lastEventLabel(type: string): string {
	const label = EVENT_LABELS[type];
	if (label) return label;
	return type.replace(/^session\.next\./, "").replace(/\./g, " ");
}

function sessionActivity(row: ServerSessionRow): number {
	return row.lastEvent?.at ?? row.updatedAt ?? 0;
}

export function ServerSessionsModal({ onClose }: { onClose: () => void }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [sessions, setSessions] = useState<ServerSessionRow[]>([]);
	const [running, setRunning] = useState<boolean | null>(null);
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		let alive = true;

		const load = async () => {
			try {
				const res = await electrobun.rpc!.request.getServerSessions({});
				if (!alive) return;
				setRunning(res.running);
				setError(res.error);
				setSessions(res.sessions);
			} catch {
				if (alive) setRunning(false);
			}
		};

		// Live rows only carry status/lastEvent/updatedAt — merge field-by-field
		// so a gap in the watch doesn't clobber the title from the list snapshot.
		const applyLive = (live: ServerSessionRow[]) => {
			if (!alive) return;
			setSessions((prev) => {
				const merged = new Map(prev.map((row) => [row.sessionId, { ...row }]));
				for (const liveRow of live) {
					const existing = merged.get(liveRow.sessionId);
					const next: ServerSessionRow = { sessionId: liveRow.sessionId };
					if (existing) {
						next.title = existing.title;
						next.status = existing.status;
						next.updatedAt = existing.updatedAt;
						next.retryMessage = existing.retryMessage;
					}
					if (liveRow.title) next.title = liveRow.title;
					if (liveRow.status) next.status = liveRow.status;
					if (liveRow.updatedAt) next.updatedAt = liveRow.updatedAt;
					if (liveRow.retryMessage) next.retryMessage = liveRow.retryMessage;
					if (liveRow.lastEvent) next.lastEvent = liveRow.lastEvent;
					merged.set(liveRow.sessionId, next);
				}
				return Array.from(merged.values());
			});
		};

		void electrobun.rpc!.request.setServerEventWatch({ active: true });
		void load();
		serverEventSubscribers.add(applyLive);
		const id = setInterval(() => void load(), 10_000);
		return () => {
			alive = false;
			serverEventSubscribers.delete(applyLive);
			clearInterval(id);
			void electrobun.rpc!.request.setServerEventWatch({ active: false });
		};
	}, []);

	const sorted = useMemo(
		() =>
			[...sessions].sort(
				(a, b) => sessionActivity(b) - sessionActivity(a),
			),
		[sessions],
	);

	const statusColor = (row: ServerSessionRow): string => {
		if (row.status === "busy") return theme.colors.success;
		if (row.status === "retry") return theme.colors.warning ?? "#d4a72c";
		return muted;
	};

	return createPortal(
		<div
			role="dialog"
			aria-modal
			aria-label="Active opencode sessions"
			onClick={onClose}
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 2147483000,
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "center",
				paddingTop: 72,
				background: "rgba(0,0,0,0.5)",
				fontFamily: theme.fonts.body,
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					width: "min(480px, calc(100vw - 48px))",
					maxHeight: "calc(100vh - 120px)",
					display: "flex",
					flexDirection: "column",
					background: theme.colors.surface,
					border: `1px solid ${theme.colors.border}`,
					borderRadius: 12,
					boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
					color: theme.colors.text,
					overflow: "hidden",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "14px 16px",
						borderBottom: `1px solid ${theme.colors.border}`,
						flexShrink: 0,
					}}
				>
					<span style={{ fontSize: theme.fontSizes[3], fontWeight: 700, flex: 1 }}>
						Active sessions
					</span>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close active sessions"
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							width: 28,
							height: 28,
							borderRadius: 6,
							background: "transparent",
							border: "none",
							color: theme.colors.text,
							cursor: "pointer",
						}}
					>
						<X size={16} />
					</button>
				</div>

				<div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
					{error && (
						<div
							style={{
								fontSize: theme.fontSizes[0],
								color: theme.colors.error,
								fontFamily: theme.fonts.monospace,
								marginBottom: 12,
							}}
						>
							{error}
						</div>
					)}
					{running === false && (
						<div style={{ fontSize: theme.fontSizes[1], color: muted }}>
							The opencode server is not running.
						</div>
					)}
					{running === true && sorted.length === 0 && (
						<div style={{ fontSize: theme.fontSizes[1], color: muted }}>
							No sessions active in the last 10 minutes.
						</div>
					)}
					{running === null && (
						<div style={{ fontSize: theme.fontSizes[1], color: muted }}>
							Checking…
						</div>
					)}
					{sorted.map((row) => (
						<div
							key={row.sessionId}
							style={{
								display: "flex",
								alignItems: "flex-start",
								gap: 10,
								padding: "10px 14px",
								borderRadius: 8,
								background: theme.colors.background,
								border: `1px solid ${theme.colors.border}`,
								marginBottom: 8,
							}}
						>
							<span
								style={{
									width: 8,
									height: 8,
									borderRadius: "50%",
									marginTop: 6,
									flexShrink: 0,
									background: statusColor(row),
								}}
							/>
							<div style={{ minWidth: 0, flex: 1 }}>
								<div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
									<span
										style={{
											fontSize: theme.fontSizes[1],
											fontWeight: 600,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{row.title || "Untitled session"}
									</span>
									<span style={{ fontSize: theme.fontSizes[0], color: muted, flexShrink: 0 }}>
										{row.sessionId.slice(0, 8)}
									</span>
								</div>
								<div
									style={{
										fontSize: theme.fontSizes[0],
										color: muted,
										marginTop: 2,
										fontFamily: theme.fonts.monospace,
									}}
								>
									{row.lastEvent
										? `${lastEventLabel(row.lastEvent.type)} · ${relativeTime(row.lastEvent.at)}`
										: row.status === "busy" || row.status === "retry"
											? row.status === "retry"
												? "retrying"
												: "working…"
											: row.updatedAt
												? `updated ${relativeTime(row.updatedAt)}`
												: "no activity yet"}
								</div>
								{row.retryMessage && (
									<div
										style={{
											fontSize: theme.fontSizes[0],
											color: theme.colors.warning ?? "#d4a72c",
											marginTop: 4,
											lineHeight: 1.4,
										}}
									>
										{row.retryMessage}
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>,
		document.body,
	);
}
