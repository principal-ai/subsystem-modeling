/**
 * SessionEventsView — renders one session's raw → repo-normalized → accumulated
 * event feed (a `kind: "session-events"` tab).
 *
 * Fetches the session's events from the host in pages (`getSessionEvents` with
 * `includeRaw` + `offset`/`limit`), so each RPC message stays bounded even for
 * sessions whose raw payloads reach hundreds of MB. Rows accumulate across
 * pages and are handed to the shared `SessionEventFeed`.
 */

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { SessionEventFeed, type SessionEventFeedRow } from "@principal-ai/subsystems-react";
import { electrobun, reloadSubscribers } from "../rpc";
import { CenteredMessage } from "../ui";

const PAGE_SIZE = 150;

type ViewState =
	| { kind: "loading" }
	| { kind: "error"; message: string }
	| {
			kind: "ready";
			title: string;
			rows: SessionEventFeedRow[];
			total: number;
			hasMore: boolean;
			loadingMore: boolean;
			loadMoreError?: string;
	  };

export function SessionEventsView({
	sessionId,
}: {
	sessionId: string;
}) {
	const { theme } = useTheme();
	const [state, setState] = useState<ViewState>({ kind: "loading" });

	const loadFirst = useCallback(() => {
		let cancelled = false;
		setState({ kind: "loading" });
		void electrobun.rpc!.request
			.getSessionEvents({ sessionId, includeRaw: true, limit: PAGE_SIZE })
			.then((res) => {
				if (cancelled) return;
				if (!res.ok || !res.events || res.events.length === 0) {
					setState({
						kind: "error",
						message: res.error ?? "Session not found or empty",
					});
					return;
				}
				setState({
					kind: "ready",
					title: res.session?.title ?? sessionId,
					rows: res.events as SessionEventFeedRow[],
					total: res.total ?? res.events.length,
					hasMore: res.hasMore ?? false,
					loadingMore: false,
				});
			})
			.catch((err) => {
				if (cancelled) return;
				setState({
					kind: "error",
					message: err instanceof Error ? err.message : String(err),
				});
			});
		return () => {
			cancelled = true;
		};
	}, [sessionId]);

	const loadMore = useCallback(() => {
		setState((prev) => {
			if (prev.kind !== "ready" || prev.loadingMore || !prev.hasMore) return prev;
			return { ...prev, loadingMore: true, loadMoreError: undefined };
		});
		void electrobun.rpc!.request
			.getSessionEvents({
				sessionId,
				includeRaw: true,
				offset: state.kind === "ready" ? state.rows.length : 0,
				limit: PAGE_SIZE,
			})
			.then((res) => {
				setState((prev) => {
					if (prev.kind !== "ready" || !res.ok || !res.events) {
						if (prev.kind === "ready") {
							return { ...prev, loadingMore: false, loadMoreError: res.error ?? "Could not load more" };
						}
						return prev;
					}
					return {
						kind: "ready",
						title: prev.title,
						rows: [...prev.rows, ...(res.events as SessionEventFeedRow[])],
						total: res.total ?? prev.total,
						hasMore: res.hasMore ?? false,
						loadingMore: false,
						loadMoreError: undefined,
					};
				});
			})
			.catch((err) => {
				setState((prev) =>
					prev.kind === "ready"
						? { ...prev, loadingMore: false, loadMoreError: err instanceof Error ? err.message : String(err) }
						: prev,
				);
			});
	}, [sessionId, state]);

	useEffect(() => {
		const cancel = loadFirst();
		reloadSubscribers.add(loadFirst);
		return () => {
			cancel();
			reloadSubscribers.delete(loadFirst);
		};
	}, [loadFirst]);

	if (state.kind === "loading") {
		return <CenteredMessage title="Loading session events…" />;
	}
	if (state.kind === "error") {
		return <CenteredMessage title="Could not load session events" detail={state.message} />;
	}

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				width: "100%",
				overflow: "auto",
				background: theme.colors.background,
			}}
		>
			<SessionEventFeed title={state.title} rows={state.rows} />
			{state.hasMore ? (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 6,
						padding: "16px 0 32px",
					}}
				>
					<button
						type="button"
						onClick={loadMore}
						disabled={state.loadingMore}
						style={{
							padding: "8px 20px",
							border: `1px solid ${theme.colors.border}`,
							borderRadius: 6,
							background: theme.colors.backgroundSecondary,
							color: theme.colors.text,
							fontFamily: theme.fonts.body,
							fontSize: theme.fontSizes[0],
							cursor: state.loadingMore ? "default" : "pointer",
							opacity: state.loadingMore ? 0.6 : 1,
						}}
					>
						{state.loadingMore
							? "Loading…"
							: `Load more (${state.rows.length} / ${state.total})`}
					</button>
					{state.loadMoreError ? (
						<span style={{ color: "#ef4444", fontSize: 12 }}>
							{state.loadMoreError}
						</span>
					) : null}
				</div>
			) : null}
		</div>
	);
}
