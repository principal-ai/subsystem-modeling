/**
 * Host-side facade over the analysis worker for the cumulative construct
 * timeline. The RPC handlers keep the same `extend` / `get` / `cancel` surface,
 * but the forward walk and all parsing live in the supervised worker. Reads
 * fall back to disk whenever no worker is resident, so the UI never waits on a
 * busy worker.
 */

import { analysisWorker } from "./analysis-worker-supervisor";
import { ConstructTimelineService } from "./construct-timeline";
import { summarizeConstructTimeline } from "../shared/construct-timeline";
import type { ConstructTimelineMeta, ConstructTimelineOptions, ConstructTimelineSummary } from "../shared/construct-timeline";

/** What the UI needs: the cursor and totals, never the event log. */
export interface ConstructTimelineReadout {
	meta: ConstructTimelineMeta;
	summary: ConstructTimelineSummary;
}

export class ConstructTimelineProxy {
	/** Read-only disk access when no worker is resident. */
	private disk = new ConstructTimelineService();

	async extend(purl: string, options: ConstructTimelineOptions = {}): Promise<ConstructTimelineMeta> {
		const result = await analysisWorker.request<{ meta: ConstructTimelineMeta }>(
			{ type: "timelineExtend", purl, timelineOptions: options },
			30_000,
		);
		return result.meta;
	}

	async get(purl: string): Promise<ConstructTimelineReadout | undefined> {
		if (analysisWorker.alive) {
			try {
				const result = await analysisWorker.request<{ timeline?: ConstructTimelineReadout }>({ type: "timelineGet", purl }, 20_000);
				return result.timeline;
			} catch {
				/* worker stopped mid-flight; serve the checkpoint from disk */
			}
		}
		const stored = await this.disk.get(purl);
		return stored ? { meta: stored.meta, summary: summarizeConstructTimeline(stored.events) } : undefined;
	}

	cancel(purl: string): void {
		if (!analysisWorker.alive) return;
		void analysisWorker.request({ type: "timelineCancel", purl }, 5_000).catch(() => analysisWorker.stop());
	}

	/** All mutations go through the worker so active analyses cannot race deletion. */
	async reset(purl: string): Promise<void> {
		await analysisWorker.request({ type: "timelineReset", purl }, 120_000);
	}

	/** Immutable recorded events and Git objects need no worker round trip. */
	getFiles(purl: string, sha: string) {
		return this.disk.getFiles(purl, sha);
	}

	getHistory(purl: string) {
		return this.disk.getHistory(purl);
	}

	/** Terminate the worker (app shutdown, tests). */
	stop(): void {
		analysisWorker.stop();
	}
}

export const constructTimeline = new ConstructTimelineProxy();
