/**
 * MaintainEventsView — live OpenCode V2 SSE feed for a Maintain agent run.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import type { OpencodeV2ProbeEvent, StudioMessages } from "../../shared/contract";
import { electrobun, opencodeLiveFeedSubscribers } from "../rpc";
import { CenteredMessage } from "../ui";

export function MaintainEventsView({
	sessionId,
	title,
	agent,
}: {
	sessionId: string;
	title?: string;
	agent?: string;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [status, setStatus] = useState<string>("starting");
	const [events, setEvents] = useState<OpencodeV2ProbeEvent[]>([]);
	const [error, setError] = useState<string | null>(null);
	const logRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		let cancelled = false;
		void electrobun.rpc!.request
			.getOpencodeLiveFeed({ sessionId })
			.then((res) => {
				if (cancelled || !res.ok) return;
				if (res.status) setStatus(res.status);
				if (res.events) setEvents(res.events);
				if (res.error) setError(res.error);
			})
			.catch(() => {
				/* feed may not exist yet; live push will populate */
			});
		return () => {
			cancelled = true;
		};
	}, [sessionId]);

	useEffect(() => {
		const onPush = (payload: StudioMessages["opencodeLiveFeedChanged"]) => {
			if (payload.sessionId !== sessionId) return;
			setStatus(payload.status);
			setEvents(payload.events);
			setError(payload.error ?? null);
		};
		opencodeLiveFeedSubscribers.add(onPush);
		return () => {
			opencodeLiveFeedSubscribers.delete(onPush);
		};
	}, [sessionId]);

	useEffect(() => {
		const el = logRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [events.length]);

	const formatTime = (at: number) =>
		new Date(at).toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});

	const wrap: CSSProperties = {
		height: "100%",
		display: "flex",
		flexDirection: "column",
		padding: 20,
		color: theme.colors.text,
		fontFamily: theme.typography?.fontFamily ?? "inherit",
		boxSizing: "border-box",
	};

	if (!sessionId) {
		return <CenteredMessage>Waiting for OpenCode session…</CenteredMessage>;
	}

	return (
		<div style={wrap}>
			<div style={{ marginBottom: 12 }}>
				<div style={{ fontSize: 18, fontWeight: 650 }}>
					{title ?? "Maintain events"}
				</div>
				<div style={{ marginTop: 4, fontSize: 12, color: muted }}>
					{agent ? `${agent} · ` : null}
					{sessionId}
					{" · "}
					<span style={{ fontWeight: 600 }}>{status}</span>
					{" · "}
					{events.length} events
				</div>
				{error ? (
					<div style={{ marginTop: 8, color: theme.colors.danger ?? "#e55", fontSize: 13 }}>
						{error}
					</div>
				) : null}
			</div>
			<div
				ref={logRef}
				style={{
					flex: 1,
					minHeight: 0,
					overflow: "auto",
					borderRadius: 8,
					border: `1px solid ${theme.colors.border ?? "rgba(255,255,255,0.12)"}`,
					background: "rgba(0,0,0,0.25)",
					padding: "10px 12px",
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
					fontSize: 11,
					lineHeight: 1.45,
				}}
			>
				{events.length === 0 ? (
					<div style={{ color: muted }}>Waiting for SSE events…</div>
				) : (
					events.map((ev, i) => (
						<div key={`${ev.at}-${ev.type}-${i}`} style={{ marginBottom: 6 }}>
							<span style={{ color: muted }}>{formatTime(ev.at)}</span>{" "}
							<span style={{ color: theme.colors.primary ?? "#8fd" }}>{ev.type}</span>
							{ev.summary && ev.summary !== ev.type ? (
								<span> — {ev.summary}</span>
							) : null}
						</div>
					))
				)}
			</div>
		</div>
	);
}
