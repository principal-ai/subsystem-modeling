import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createMaintenanceOutcomeSender, createOutcomeDelivery, maintenanceWebhookConfig,
	DELIVERY_BACKOFF_MS, DELIVERY_TIMEOUT_MS, OUTCOME_EVENT_TYPE,
} from "./maintenance-outcome-delivery";
import { createMaintenanceRunStore } from "./subsystem-maintenance-runs";

let root: string, clock: number;
let env: Record<string, string | undefined>;
let store: ReturnType<typeof createMaintenanceRunStore>;
const senders: ReturnType<typeof createMaintenanceOutcomeSender>[] = [];
const url = "http://127.0.0.1:3001/api/events/triggers/trigger-test";
const secret = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
const graphId = "sg-webhook";
function reopen(owner = "host-a") {
	return createMaintenanceRunStore({
		root, owner, now: () => new Date(clock).toISOString(),
		delivery: (snapshot) => createOutcomeDelivery(snapshot, env),
	});
}
function sender(request: (input: string | URL | Request, init?: RequestInit) => Promise<Response>, using = store) {
	const s = createMaintenanceOutcomeSender({
		store: using, now: () => clock, config: () => maintenanceWebhookConfig(env),
		fetch: Object.assign(request, { preconnect: fetch.preconnect }) as typeof fetch,
	});
	senders.push(s);
	return s;
}
async function finish(id = graphId, outcome: "converged" | "needs_unblock" | "stalled" | "cap" | "error" = "converged") {
	const snapshot = await store.start({ graphId: id, title: "Example" });
	await store.context(id, snapshot.sequence.id, { title: "Example", commitsAtStart: { repo: "a".repeat(40) } });
	await store.finish(id, snapshot.sequence.id, { outcome, summary: "Private agent output must not be delivered." });
	return snapshot.sequence.id;
}
const accepted = () => Response.json({ accepted: true, queued: true, duplicate: false });
beforeEach(async () => {
	root = await fs.mkdtemp(join(tmpdir(), "maintenance-delivery-"));
	clock = Date.parse("2026-10-26T10:00:00.000Z");
	env = { PRINCIPAL_MAINTENANCE_WEBHOOK_URL: url, PRINCIPAL_MAINTENANCE_WEBHOOK_SECRET: secret };
	store = reopen();
});
afterEach(async () => {
	await Promise.all(senders.splice(0).map((s) => s.stop()));
	await fs.rm(root, { recursive: true, force: true });
});

describe("signed whole-maintenance outcomes", () => {
	test("commits outcome and immutable delivery together, signs raw bytes, and does not emit stages or raw errors", async () => {
		const initial = await store.start({ graphId, title: "Example" });
		let posts = 0;
		const worker = sender(async (input, init) => {
			posts++;
			expect(String(input)).toBe(url);
			expect(init?.redirect).toBe("error");
			expect(init?.credentials).toBe("omit");
			const body = String(init?.body);
			const headers = new Headers(init?.headers);
			const event = JSON.parse(body);
			expect(event.type).toBe(OUTCOME_EVENT_TYPE);
			expect(event.maintenanceRun.id).toBe(initial.sequence.id);
			expect(event.maintenanceRun.outcome).toBe("error");
			expect(event).not.toHaveProperty("ownerUserId");
			expect(body).not.toContain("Private agent");
			const expected = createHmac("sha256", Buffer.alloc(32, 7))
				.update(`${headers.get("webhook-id")}.${headers.get("webhook-timestamp")}.${body}`).digest("base64");
			expect(headers.get("webhook-signature")).toBe(`v1,${expected}`);
			const saved = JSON.parse(await fs.readFile(join(root, `${graphId}.json`), "utf8"));
			expect(saved.runs[0].snapshot.sequence.status).toBe("finished");
			expect(saved.runs[0].delivery.attempts).toBe(1);
			return accepted();
		});
		await worker.flush();
		expect(posts).toBe(0);
		await store.finish(graphId, initial.sequence.id, { outcome: "error", summary: "Private agent error" });
		const revision = (await store.latest(graphId))!.revision;
		await worker.flush();
		expect(posts).toBe(1);
		expect((await store.latest(graphId))!.revision).toBe(revision);
		const status = await store.deliveryStatus(graphId);
		expect(status.latest).toMatchObject({ status: "delivered", receipt: "queued", attempts: 1, failure: null });
		expect(status.latest).not.toHaveProperty("body");
		expect(status.latest).not.toHaveProperty("destinationHash");
		const disk = await fs.readFile(join(root, `${graphId}.json`), "utf8");
		expect(disk).not.toContain(secret);
		expect(disk).not.toContain(url);
		await store.finish(graphId, initial.sequence.id, { outcome: "error" });
		await worker.flush();
		expect(posts).toBe(1);
	});
	test("every real terminal outcome emits one event; observations and evidence never re-emit it", async () => {
		const outcomes: string[] = [];
		const worker = sender(async (_url, init) => {
			outcomes.push(JSON.parse(String(init?.body)).maintenanceRun.outcome);
			return accepted();
		});
		for (const outcome of ["converged", "needs_unblock", "stalled", "cap", "error"] as const) {
			const id = await finish(graphId, outcome);
			await worker.flush();
			await store.evidence(graphId, id, { counts: {}, verification: null, verifiedAtCommits: { repo: "b".repeat(40) } });
			await store.latest(graphId);
			await worker.flush();
		}
		expect(outcomes).toEqual(["converged", "needs_unblock", "stalled", "cap", "error"]);
	});
	test("lost acknowledgement retries across restart with the same id/body and a fresh signed timestamp", async () => {
		await finish();
		const requests: RequestInit[] = [];
		await sender(async (_url, init) => { requests.push(init!); throw new Error("Lost acknowledgement"); }).flush();
		expect((await store.deliveryStatus(graphId)).latest).toMatchObject({ status: "pending", attempts: 1 });
		store = reopen("host-restarted");
		const next = sender(async (_url, init) => { requests.push(init!); return Response.json({ accepted: true, queued: false, duplicate: true }); });
		await next.flush();
		expect(requests).toHaveLength(1);
		clock += DELIVERY_BACKOFF_MS[0];
		await next.flush();
		expect(requests).toHaveLength(2);
		expect(requests[1]!.body).toBe(requests[0]!.body);
		expect(new Headers(requests[1]!.headers).get("webhook-id")).toBe(new Headers(requests[0]!.headers).get("webhook-id"));
		expect(new Headers(requests[1]!.headers).get("webhook-timestamp")).not.toBe(new Headers(requests[0]!.headers).get("webhook-timestamp"));
		expect((await store.deliveryStatus(graphId)).latest).toMatchObject({ status: "delivered", receipt: "duplicate", attempts: 2 });
	});
	test("all retryable failures are bounded at five durable reservations", async () => {
		await finish();
		let posts = 0;
		const worker = sender(async () => { posts++; return new Response("Unavailable", { status: 503 }); });
		for (let i = 0; i < 5; i++) { await worker.flush(); clock += 1_000_000; }
		await worker.flush();
		expect(posts).toBe(5);
		expect((await store.deliveryStatus(graphId)).latest).toMatchObject({ status: "failed", attempts: 5, httpStatus: 503, failure: "http_retryable", nextAttemptAt: null });
	});
	test("crashed reservations wait out the ambiguity window and never exceed the retry budget", async () => {
		const runId = await finish();
		for (let i = 0; i < 5; i++) {
			expect(await store.reserveDelivery(graphId, runId, i, clock)).not.toBeNull();
			expect(await reopen("restart").reserveDelivery(graphId, runId, i + 1, clock)).toBeNull();
			clock += DELIVERY_TIMEOUT_MS + (DELIVERY_BACKOFF_MS[i] ?? 0);
		}
		let posts = 0;
		await sender(async () => { posts++; return accepted(); }, reopen("restart")).flush();
		expect(posts).toBe(0);
		expect((await store.deliveryStatus(graphId)).latest).toMatchObject({ status: "failed", attempts: 5, failure: "attempts_exhausted" });
	});
	test("a filtered acceptance is ignored, not a claimed notification or a retry", async () => {
		await finish();
		let posts = 0;
		const worker = sender(async () => { posts++; return Response.json({ accepted: true, queued: false, reason: "Filter did not match" }); });
		await worker.flush(); clock += 1_000_000; await worker.flush();
		expect(posts).toBe(1);
		expect((await store.deliveryStatus(graphId)).latest).toMatchObject({ status: "ignored", receipt: "filtered" });
	});
	test("missing, forged and oversized receipts cannot claim delivery", async () => {
		for (const response of [Response.json({ accepted: false, queued: true }), Response.json({ accepted: true }), new Response("x".repeat(9000))]) {
			await finish();
			await sender(async () => response).flush();
			expect((await store.deliveryStatus(graphId)).latest).toMatchObject({ status: "pending", failure: "invalid_receipt" });
		}
	});
	test("permanent rejection stops; paused triggers can retry; destinations are never silently changed", async () => {
		await finish();
		await sender(async () => new Response("", { status: 401 })).flush();
		expect((await store.deliveryStatus(graphId)).latest).toMatchObject({ status: "failed", failure: "http_rejected" });
		await finish();
		await sender(async () => new Response("", { status: 409 })).flush();
		expect((await store.deliveryStatus(graphId)).latest).toMatchObject({ status: "pending" });
		clock += DELIVERY_BACKOFF_MS[0];
		env["PRINCIPAL_MAINTENANCE_WEBHOOK_URL"] = url.replace("trigger-test", "another-trigger");
		let posts = 0;
		await sender(async () => { posts++; return accepted(); }).flush();
		expect(posts).toBe(0);
		expect((await store.deliveryStatus(graphId)).latest).toMatchObject({ status: "failed", failure: "destination_changed" });
	});
	test("disabled/unknown outcomes never backfill; partial configuration is a visible failure", async () => {
		env = {};
		const id = await finish();
		env = { PRINCIPAL_MAINTENANCE_WEBHOOK_URL: url, PRINCIPAL_MAINTENANCE_WEBHOOK_SECRET: secret };
		await store.evidence(graphId, id, { counts: {}, verification: null, verifiedAtCommits: null });
		expect(await store.pendingDeliveries()).toEqual([]);
		const active = await store.start({ graphId, title: "Example" });
		expect((await reopen("restart").latest(graphId))?.sequence.status).toBe("unknown");
		await expect(store.finish(graphId, active.sequence.id, { outcome: "error" })).rejects.toThrow("interrupted");
		expect(await store.pendingDeliveries()).toEqual([]);
		env = { PRINCIPAL_MAINTENANCE_WEBHOOK_URL: url };
		await finish();
		expect((await store.deliveryStatus(graphId)).latest).toMatchObject({ status: "failed", attempts: 0, failure: "configuration" });
	});
	test("an atomic-write failure cannot expose a terminal snapshot without its delivery", async () => {
		const initial = await store.start({ graphId, title: "Example" });
		const rename = spyOn(fs, "rename").mockRejectedValueOnce(new Error("Disk full"));
		try { await expect(store.finish(graphId, initial.sequence.id, { outcome: "converged" })).rejects.toThrow("Disk full"); }
		finally { rename.mockRestore(); }
		const saved = JSON.parse(await fs.readFile(join(root, `${graphId}.json`), "utf8"));
		expect(saved.runs[0].snapshot.sequence.status).toBe("running");
		expect(saved.runs[0].delivery).toBeUndefined();
		expect(await store.pendingDeliveries()).toEqual([]);
		await store.finish(graphId, initial.sequence.id, { outcome: "converged" });
		expect(await store.pendingDeliveries()).toHaveLength(1);
	});
	test("concurrent senders reserve only one request, and retention never silently loses pending work", async () => {
		await finish();
		let posts = 0;
		const request = async () => { posts++; return accepted(); };
		await Promise.all([sender(request).flush(), sender(request, reopen("other")).flush()]);
		expect(posts).toBe(1);
		for (let i = 0; i < 45; i++) await finish();
		const status = await store.deliveryStatus(graphId);
		expect(status.pending).toBe(20);
		expect(status.latest).toMatchObject({ status: "failed", failure: "backlog_full" });
		expect(JSON.parse(await fs.readFile(join(root, `${graphId}.json`), "utf8")).runs.length).toBeLessThanOrEqual(40);
		await sender(request).flush();
		expect((await store.deliveryStatus(graphId)).pending).toBe(0);
		expect(posts).toBe(21);
	});
	test("rejects unsafe target URLs and invalid signing keys without printing them", () => {
		for (const target of [
			"http://openbot.example/api/events/triggers/test", "http://localhost.evil/api/events/triggers/test",
			"https://user:password@openbot.example/api/events/triggers/test",
			`${url}?secret=bad`, `${url}#bad`, "https://openbot.example/arbitrary",
		]) expect(() => maintenanceWebhookConfig({ ...env, PRINCIPAL_MAINTENANCE_WEBHOOK_URL: target })).toThrow();
		expect(() => maintenanceWebhookConfig({ ...env, PRINCIPAL_MAINTENANCE_WEBHOOK_SECRET: "whsec_short" })).toThrow();
		expect(maintenanceWebhookConfig({})).toBeNull();
	});
	test("stopping aborts an in-flight POST, leaving a durable ambiguity window for restart", async () => {
		await finish();
		let posted!: () => void;
		const began = new Promise<void>((resolve) => { posted = resolve; });
		let aborted = false;
		const worker = sender(async (_url, init) => {
			posted();
			return new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("Aborted")); });
			});
		});
		const pending = worker.flush();
		await began;
		await worker.stop();
		await pending;
		expect(aborted).toBe(true);
		expect((await store.deliveryStatus(graphId)).latest).toMatchObject({ status: "pending", attempts: 1 });
		let posts = 0;
		const recovered = sender(async () => { posts++; return accepted(); }, reopen("restart"));
		await recovered.flush();
		expect(posts).toBe(0);
		clock += DELIVERY_TIMEOUT_MS + DELIVERY_BACKOFF_MS[0];
		await recovered.flush();
		expect(posts).toBe(1);
	});
	test("one corrupt checkpoint cannot starve valid model outcomes", async () => {
		await finish();
		const file = join(root, `${graphId}.json`);
		const saved = JSON.parse(await fs.readFile(file, "utf8"));
		saved.runs[0].delivery.body = "{}";
		await fs.writeFile(file, JSON.stringify(saved));
		await finish("sg-healthy");
		let posts = 0;
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try { await sender(async () => { posts++; return accepted(); }).flush(); }
		finally { warn.mockRestore(); }
		expect(posts).toBe(1);
		expect((await store.deliveryStatus("sg-healthy")).latest?.status).toBe("delivered");
		await expect(store.deliveryStatus(graphId)).rejects.toThrow("Invalid maintenance delivery event");
	});
	test("the resident sender wakes on a newly committed outcome without a polling responsibility", async () => {
		let posted!: () => void;
		const began = new Promise<void>((resolve) => { posted = resolve; });
		let posts = 0;
		const worker = sender(async () => { posts++; posted(); return accepted(); });
		worker.start();
		await finish();
		const timeout = setTimeout(() => posted(), 2_000);
		try { await began; } finally { clearTimeout(timeout); }
		expect(posts).toBe(1);
		await worker.flush();
		expect((await store.deliveryStatus(graphId)).latest?.status).toBe("delivered");
	});
});
