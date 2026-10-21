/**
 * Spawns and supervises the analysis worker. The host's RPC handlers call
 * through this instead of running the parse-heavy loop in-process, so the main
 * event loop stays free. A worker that stops (WASM abort, crash, or a request
 * timeout) is dropped; an explicit extension can respawn it and continue the
 * timeline from its saved cursor.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

interface Pending {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export interface AnalysisWorkerSupervisorOptions {
	/** Override the staged worker path (tests, scripts). */
	path?: string;
	/** Per-request timeout; a timeout is treated as a worker failure. */
	timeoutMs?: number;
}

export class AnalysisWorkerSupervisor {
	private worker?: Worker;
	private pending = new Map<number, Pending>();
	private sequence = 0;
	private path: string;
	private timeoutMs: number;

	constructor(options: AnalysisWorkerSupervisorOptions = {}) {
		this.path = options.path ?? join(import.meta.dir, "construct-timeline-worker.js");
		this.timeoutMs = options.timeoutMs ?? 120_000;
	}

	/** True while a worker is resident; reads fall back to disk when false. */
	get alive(): boolean {
		return this.worker !== undefined;
	}

	private ensure(): Worker {
		if (this.worker) return this.worker;
		if (!existsSync(this.path)) {
			throw new Error(`Analysis worker is missing (${this.path}). Rebuild Studio.`);
		}
		const worker = new Worker(this.path);
		worker.onmessage = (event: MessageEvent) => this.onMessage(event);
		worker.onerror = () => this.drop();
		// Bun's Worker is a separate thread; terminate frees it on close/crash.
		this.worker = worker;
		return worker;
	}

	private onMessage(event: MessageEvent): void {
		const message = event.data as { requestId?: number; type?: string; error?: string };
		if (typeof message.requestId !== "number") return;
		const pending = this.pending.get(message.requestId);
		if (!pending) return;
		this.pending.delete(message.requestId);
		clearTimeout(pending.timer);
		if (message.type === "error") pending.reject(new Error(message.error ?? "Analysis worker error."));
		else pending.resolve(message);
	}

	/** Forget a stopped worker and fail everything still waiting on it. */
	private drop(): void {
		const worker = this.worker;
		this.worker = undefined;
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error("Analysis worker stopped."));
			this.pending.delete(id);
		}
		try {
			worker?.terminate();
		} catch {
			/* already gone */
		}
	}

	async request<T>(message: Record<string, unknown>, timeoutMs = this.timeoutMs): Promise<T> {
		const worker = this.ensure();
		const requestId = ++this.sequence;
		return await new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				// A silent worker is a failed worker; the next request respawns.
				this.drop();
				reject(new Error("Analysis worker request timed out."));
			}, timeoutMs);
			this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timer });
			worker.postMessage({ ...message, requestId });
		});
	}

	stop(): void {
		this.drop();
	}
}

export const analysisWorker = new AnalysisWorkerSupervisor();
