/**
 * Owns the cumulative construct timeline and tree-sitter runtime so parsing
 * never blocks the Studio host's event loop. Bundled separately and staged
 * beside the same tree-sitter assets as the host.
 */
import { ConstructTimelineService } from "./construct-timeline";
import { summarizeConstructTimeline, type ConstructTimelineOptions } from "../shared/construct-timeline";

interface WorkerRequest {
	type: "timelineExtend" | "timelineGet" | "timelineCancel";
	requestId?: number;
	purl: string;
	timelineOptions?: ConstructTimelineOptions;
}

const scope = globalThis as unknown as {
	onmessage: ((event: { data: WorkerRequest }) => void) | null;
	postMessage: (message: unknown) => void;
};

const timeline = new ConstructTimelineService();

scope.onmessage = (event) => {
	const message = event.data;
	const requestId = message.requestId;
	void (async () => {
		try {
			switch (message.type) {
				case "timelineExtend": {
					const meta = await timeline.extend(message.purl, message.timelineOptions ?? {});
					scope.postMessage({ requestId, type: "timelineMeta", meta });
					break;
				}
				case "timelineGet": {
					const stored = await timeline.get(message.purl);
					// Progress polls never ship the event log.
					scope.postMessage({
						requestId, type: "timeline",
						timeline: stored ? { meta: stored.meta, summary: summarizeConstructTimeline(stored.events) } : undefined,
					});
					break;
				}
				case "timelineCancel": {
					timeline.cancel(message.purl);
					scope.postMessage({ requestId, type: "cancelled" });
					break;
				}
				default:
					scope.postMessage({ requestId, type: "error", error: `Unknown analysis request: ${String(message.type)}` });
			}
		} catch (error) {
			scope.postMessage({ requestId, type: "error", error: error instanceof Error ? error.message : "Analysis worker failed." });
		}
	})();
};
