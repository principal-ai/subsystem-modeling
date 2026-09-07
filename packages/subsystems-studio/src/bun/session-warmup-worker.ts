/**
 * Session warm-up worker — a `Bun.Worker` that processes the recent session
 * window off the host's event loop.
 *
 * The host spawns this module (dev: the `.ts` source; packaged: the compiled
 * sibling `session-warmup-worker.js`) and drives it over `postMessage`. The
 * worker reuses `session-pipeline.ts` — reading raw sources, running the
 * pipelines, and writing the durable disk cache. Event timelines never cross
 * the thread boundary: the worker writes the shared `~/.principal/session-events`
 * cache and the host reads it, so this channel only carries control signals.
 *
 * Because it runs in its own thread, the heavy sqlite/accumulate work never
 * starves the host's RPC loop (the tab-strip bug that in-process warm-up
 * caused). The host stays responsive; the cache just gets warm in the
 * background.
 */

import { buildSessionIndex, processSessionEvents } from "./session-pipeline";
import type {
	SessionWarmupEvent,
	SessionWarmupMessage,
} from "./session-pipeline";
import type { SessionSummary } from "../shared/contract";

function post(msg: SessionWarmupEvent): void {
	(self as unknown as { postMessage: (m: SessionWarmupEvent) => void }).postMessage(msg);
}

/** Process the recent window (write-through disk cache). Skipped for sessions
 *  already cached (`useCache: true`) — the host's live poll handles sessions
 *  that keep growing. */
async function runWarmup(days: number): Promise<void> {
	const index = await buildSessionIndex({ days });
	const sessions: SessionSummary[] = [];
	for (const g of index.groups) sessions.push(g.parent);
	sessions.push(...index.standalone);
	const total = sessions.length;
	let done = 0;
	for (const s of sessions) {
		try {
			const res = await processSessionEvents(s.id, {
				includeRaw: false,
				useCache: true,
			});
			if (res.ok) done++;
		} catch (err) {
			post({ type: "error", message: (err as Error).message });
		}
		post({ type: "progress", sessionId: s.id, done, total });
	}
	post({ type: "done", processed: done, total });
}

/** Re-process specific sessions from raw (`useCache: false`) so a growing
 *  session's cache is refreshed. */
async function runRefresh(sessionIds: string[]): Promise<void> {
	const total = sessionIds.length;
	let done = 0;
	for (const id of sessionIds) {
		try {
			const res = await processSessionEvents(id, {
				includeRaw: false,
				useCache: false,
			});
			if (res.ok) done++;
		} catch (err) {
			post({ type: "error", message: (err as Error).message });
		}
		post({ type: "progress", sessionId: id, done, total });
	}
	post({ type: "done", processed: done, total });
}

self.addEventListener("message", (ev: MessageEvent<SessionWarmupMessage>) => {
	const msg = ev.data;
	if (msg.type === "warmup") void runWarmup(msg.days);
	else if (msg.type === "refresh") void runRefresh(msg.sessionIds);
});
