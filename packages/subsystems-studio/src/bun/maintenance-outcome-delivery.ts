/**
 * Terminal-outcome delivery only. OpenBot's registered trigger owns routing,
 * event deduplication and work scheduling; this is a bounded Studio retry
 * checkpoint, not another responsibility queue.
 */
import { createHash, createHmac } from "node:crypto";
import type { SubsystemMaintenanceSnapshot } from "../shared/contract";
import type { MaintenanceRunStore } from "./subsystem-maintenance-runs";

export const OUTCOME_EVENT_TYPE = "studio.maintenance.finished";
export const DELIVERY_MAX_ATTEMPTS = 5;
export const DELIVERY_TIMEOUT_MS = 10_000;
export const DELIVERY_BACKOFF_MS = [5_000, 30_000, 120_000, 600_000] as const;
const MAX_BODY_BYTES = 24 * 1024; // Below OpenBot's 32 KiB event ledger cap.
const MAX_RECEIPT_BYTES = 8 * 1024;
export type DeliveryFailure = "configuration" | "destination_changed" | "network" |
	"http_retryable" | "http_rejected" | "invalid_receipt" | "attempts_exhausted" | "backlog_full";
export interface OutcomeDelivery {
	version: 1;
	eventId: string;
	body: string;
	destinationHash: string | null;
	status: "pending" | "delivered" | "ignored" | "failed";
	attempts: number;
	nextAttemptAt: string | null;
	lastAttemptAt: string | null;
	httpStatus: number | null;
	receipt: "queued" | "duplicate" | "filtered" | null;
	failure: DeliveryFailure | null;
}
export type DeliveryStatus = Omit<OutcomeDelivery, "version" | "body" | "destinationHash">;
export function deliveryStatus(delivery: OutcomeDelivery): DeliveryStatus {
	const { version: _, body: _body, destinationHash: _destination, ...status } = delivery;
	return structuredClone(status);
}

/** Deployment configuration, never payload-selected. Do not persist the secret or URL. */
export function maintenanceWebhookConfig(env: Record<string, string | undefined> = process.env) {
	const urlValue = env["PRINCIPAL_MAINTENANCE_WEBHOOK_URL"]?.trim();
	const secret = env["PRINCIPAL_MAINTENANCE_WEBHOOK_SECRET"]?.trim();
	if (!urlValue && !secret) return null;
	if (!urlValue || !secret) throw new Error("Invalid maintenance webhook configuration");
	const url = new URL(urlValue);
	if (url.username || url.password || url.search || url.hash ||
		!/^\/api\/events\/triggers\/[\w-]{1,128}$/.test(url.pathname) ||
		(url.protocol !== "https:" && !(url.protocol === "http:" &&
			["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
		throw new Error("Invalid maintenance webhook configuration");
	}
	const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
	const key = Buffer.from(encoded, "base64");
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || key.length < 32 || key.length > 128 ||
		key.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
		throw new Error("Invalid maintenance webhook configuration");
	}
	return { url: url.href, key, destinationHash: createHash("sha256").update(url.href).digest("hex") };
}
type WebhookConfig = NonNullable<ReturnType<typeof maintenanceWebhookConfig>>;

export function createOutcomeDelivery(
	snapshot: Omit<SubsystemMaintenanceSnapshot, "observedAt">,
	env: Record<string, string | undefined> = process.env,
): OutcomeDelivery | undefined {
	if (snapshot.sequence.status !== "finished") return undefined;
	let config: WebhookConfig | null = null;
	let failure: DeliveryFailure | null = null;
	try { config = maintenanceWebhookConfig(env); } catch { failure = "configuration"; }
	if (!config && !failure) return undefined; // Opt-in, no historical backfill.
	const eventId = `studio-maintenance-${snapshot.sequence.id}`;
	const payload = {
		schemaVersion: 1, type: OUTCOME_EVENT_TYPE, eventId,
		occurredAt: snapshot.sequence.endedAt,
		model: { id: snapshot.model.id, title: snapshot.model.title.slice(0, 1000) },
		maintenanceRun: {
			id: snapshot.sequence.id, outcome: snapshot.sequence.outcome,
			startedAt: snapshot.sequence.startedAt, endedAt: snapshot.sequence.endedAt,
		},
		revision: snapshot.revision, counts: snapshot.counts, verification: snapshot.verification,
		commitsAtStart: snapshot.commitsAtStart, verifiedAtCommits: snapshot.verifiedAtCommits,
	};
	let body = JSON.stringify(payload);
	if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
		body = JSON.stringify({ ...payload, commitsAtStart: null, verifiedAtCommits: null, provenanceOmitted: true });
	}
	return {
		version: 1, eventId, body, destinationHash: config?.destinationHash ?? null,
		status: failure ? "failed" : "pending", attempts: 0,
		nextAttemptAt: failure ? null : snapshot.sequence.endedAt,
		lastAttemptAt: null, httpStatus: null, receipt: null, failure,
	};
}

export function assertOutcomeDelivery(value: OutcomeDelivery, snapshot: Omit<SubsystemMaintenanceSnapshot, "observedAt">) {
	const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
	const nullableDate = (v: unknown) => v === null || date(v);
	if (!value || value.version !== 1 || snapshot.sequence.status !== "finished" ||
		typeof value.eventId !== "string" || value.eventId !== `studio-maintenance-${snapshot.sequence.id}` ||
		value.eventId.length > 200 || typeof value.body !== "string" || Buffer.byteLength(value.body) > MAX_BODY_BYTES ||
		(value.destinationHash !== null && !/^[a-f0-9]{64}$/.test(value.destinationHash)) ||
		!["pending", "delivered", "ignored", "failed"].includes(value.status) ||
		!Number.isInteger(value.attempts) || value.attempts < 0 || value.attempts > DELIVERY_MAX_ATTEMPTS ||
		!nullableDate(value.lastAttemptAt) || !nullableDate(value.nextAttemptAt) ||
		(value.status === "pending" ? !date(value.nextAttemptAt) || !value.destinationHash : value.nextAttemptAt !== null) ||
		(value.httpStatus !== null && (!Number.isInteger(value.httpStatus) || value.httpStatus < 100 || value.httpStatus > 599)) ||
		(value.receipt !== null && !["queued", "duplicate", "filtered"].includes(value.receipt)) ||
		(value.failure !== null && !["configuration", "destination_changed", "network", "http_retryable",
			"http_rejected", "invalid_receipt", "attempts_exhausted", "backlog_full"].includes(value.failure))) {
		throw new Error("Invalid maintenance delivery checkpoint");
	}
	const payload = JSON.parse(value.body);
	if (payload?.schemaVersion !== 1 || payload.type !== OUTCOME_EVENT_TYPE || payload.eventId !== value.eventId ||
		payload.model?.id !== snapshot.model.id || payload.maintenanceRun?.id !== snapshot.sequence.id ||
		payload.maintenanceRun?.outcome !== snapshot.sequence.outcome ||
		payload.maintenanceRun?.endedAt !== snapshot.sequence.endedAt) {
		throw new Error("Invalid maintenance delivery event");
	}
}

export function outcomeWebhookHeaders(delivery: Pick<OutcomeDelivery, "eventId" | "body">, key: Buffer, now: number) {
	const timestamp = String(Math.floor(now / 1000));
	return {
		"content-type": "application/json",
		"webhook-id": delivery.eventId,
		"webhook-timestamp": timestamp,
		"webhook-signature": `v1,${createHmac("sha256", key)
			.update(`${delivery.eventId}.${timestamp}.${delivery.body}`, "utf8").digest("base64")}`,
	};
}

async function receipt(response: Response): Promise<OutcomeDelivery["receipt"]> {
	const reader = response.body?.getReader();
	if (!reader) return null;
	let length = 0;
	const chunks: Uint8Array[] = [];
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > MAX_RECEIPT_BYTES) { await reader.cancel(); return null; }
			chunks.push(value);
		}
		const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		if (body?.accepted !== true || typeof body.queued !== "boolean") return null;
		if (body.duplicate === true) return "duplicate";
		if (body.queued) return "queued";
		return typeof body.reason === "string" ? "filtered" : null;
	} catch { return null; } finally { reader.releaseLock(); }
}

/** At-least-once transport; a lost acknowledgement reuses the exact body and id.
 * Reserving before POST consumes an attempt even if Studio dies before sending. */
export function createMaintenanceOutcomeSender(opts: {
	store: MaintenanceRunStore;
	config?: () => ReturnType<typeof maintenanceWebhookConfig>;
	fetch?: typeof fetch;
	now?: () => number;
	onError?: () => void;
}) {
	const now = opts.now ?? Date.now;
	const config = opts.config ?? maintenanceWebhookConfig;
	const request = opts.fetch ?? fetch;
	let running: Promise<void> | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let started = false, closed = false, requested = false;
	let unsubscribe: (() => void) | undefined;
	const abort = new AbortController();
	async function flush(): Promise<void> {
		if (closed) return;
		if (running) { requested = true; return running; }
		running = (async () => {
			let remaining = 20;
			do {
				requested = false;
				const candidates = await opts.store.pendingDeliveries();
				for (const item of candidates) {
					if (remaining <= 0) break;
					if (closed || Date.parse(item.delivery.nextAttemptAt!) > now()) continue;
					const delivery = await opts.store.reserveDelivery(item.graphId, item.runId, item.delivery.attempts, now());
					if (!delivery) continue;
					remaining--;
					let cfg: ReturnType<typeof maintenanceWebhookConfig>;
					try { cfg = config(); } catch { cfg = null; }
					let result: { receipt?: OutcomeDelivery["receipt"]; failure?: DeliveryFailure; httpStatus?: number } = {};
					if (!cfg) result.failure = "configuration";
					else if (cfg.destinationHash !== delivery.destinationHash) result.failure = "destination_changed";
					else try {
						const response = await request(cfg.url, {
							method: "POST", redirect: "error", credentials: "omit",
							headers: outcomeWebhookHeaders(delivery, cfg.key, now()), body: delivery.body,
							signal: AbortSignal.any([abort.signal, AbortSignal.timeout(DELIVERY_TIMEOUT_MS)]),
						});
						result.httpStatus = response.status;
						if (response.status === 200) {
							result.receipt = await receipt(response);
							if (!result.receipt) result.failure = "invalid_receipt";
						} else {
							await response.body?.cancel().catch(() => {});
							result.failure = [408, 409, 429].includes(response.status) || response.status >= 500
								? "http_retryable" : "http_rejected";
						}
					} catch { result.failure = "network"; }
					if (!closed) await opts.store.completeDelivery(item.graphId, item.runId, delivery.attempts, result, now());
				}
			} while (requested && !closed && remaining > 0);
		})();
		try { await running; } finally {
			running = null;
			if (started && !closed) {
				// No idle polling when there are no pending outcomes. New commits wake us.
				const pending = await opts.store.pendingDeliveries();
				if (pending.length && !closed) {
					const earliest = Math.min(...pending.map((p) => Date.parse(p.delivery.nextAttemptAt!)));
					if (timer) clearTimeout(timer);
					timer = setTimeout(wake, Math.min(30_000, Math.max(1_000, earliest - now())));
					timer.unref?.();
				}
			}
		}
	}
	function wake() {
		if (closed) return;
		if (timer) clearTimeout(timer);
		void flush().catch(() => {
			opts.onError?.();
			if (started && !closed) { timer = setTimeout(wake, 30_000); timer.unref?.(); }
		});
	}
	return {
		flush,
		start() {
			if (started || closed) return;
			started = true;
			unsubscribe = opts.store.onDeliveryReady(wake);
			wake();
		},
		async stop() {
			closed = true; unsubscribe?.();
			if (timer) clearTimeout(timer);
			abort.abort();
			await running?.catch(() => {});
		},
	};
}
