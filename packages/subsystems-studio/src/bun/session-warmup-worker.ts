/**
 * Session re-processing worker — a `Bun.Worker` that re-runs the session
 * pipeline off the host's event loop.
 *
 * The host spawns this module on demand (dev: the `.ts` source; packaged: the
 * compiled sibling `session-warmup-worker.js`) the first time the Agent
 * Sessions view asks for a live refresh, and drives it over `postMessage`. The
 * worker reuses `session-pipeline.ts` — reading raw sources, running the
 * pipelines, and writing the durable disk cache. Event timelines never cross
 * the thread boundary: the worker writes the shared `~/.principal/session-events`
 * cache and the host reads it, so this channel only carries control signals.
 *
 * Because it runs in its own thread, the heavy sqlite/accumulate work never
 * starves the host's RPC loop (the tab-strip bug that in-process processing
 * caused). Agent Sessions is an opt-in feature, so there is no boot-time
 * warm-up pass: the worker only does work the open view explicitly requests.
 */

import { processSessionEvents } from "./session-pipeline";
import type {
	SessionWarmupEvent,
	SessionWarmupMessage,
} from "./session-pipeline";

function post(msg: SessionWarmupEvent): void {
	(self as unknown as { postMessage: (m: SessionWarmupEvent) => void }).postMessage(msg);
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
	if (msg.type === "refresh") void runRefresh(msg.sessionIds);
});
