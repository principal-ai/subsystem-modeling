/**
 * useMaintainLiveFeed — subscribes to one opencode session's live SSE feed and
 * returns the state the graph's live panel renders. Seeds from the host's
 * current snapshot (`getOpencodeLiveFeed`) so a panel opened mid-run shows the
 * events seen so far, then follows `opencodeLiveFeedChanged` pushes.
 */

import { useEffect, useState } from "react";
import type { OpencodeV2ProbeEvent, StudioMessages } from "../shared/contract";
import { electrobun, opencodeLiveFeedSubscribers } from "./rpc";

export interface MaintainLiveFeed {
	status: "starting" | "running" | "done" | "error";
	events: OpencodeV2ProbeEvent[];
	total: number;
	error: string | null;
}

const EMPTY: MaintainLiveFeed = {
	status: "starting",
	events: [],
	total: 0,
	error: null,
};

export function useMaintainLiveFeed(sessionId: string | undefined): MaintainLiveFeed {
	const [state, setState] = useState<MaintainLiveFeed>(EMPTY);

	useEffect(() => {
		if (!sessionId) {
			setState(EMPTY);
			return;
		}
		let cancelled = false;
		void electrobun.rpc!.request
			.getOpencodeLiveFeed({ sessionId })
			.then((res) => {
				if (cancelled || !res.ok) return;
				setState({
					status: res.status ?? "starting",
					events: res.events ?? [],
					total: res.total ?? 0,
					error: res.error ?? null,
				});
			})
			.catch(() => {
				/* feed may not exist yet; the live push will populate */
			});
		const onPush = (payload: StudioMessages["opencodeLiveFeedChanged"]) => {
			if (payload.sessionId !== sessionId) return;
			setState({
				status: payload.status,
				events: payload.events,
				total: payload.total,
				error: payload.error ?? null,
			});
		};
		opencodeLiveFeedSubscribers.add(onPush);
		return () => {
			cancelled = true;
			opencodeLiveFeedSubscribers.delete(onPush);
		};
	}, [sessionId]);

	return state;
}
