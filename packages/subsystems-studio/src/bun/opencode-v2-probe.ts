/**
 * OpenCode V2 debug probe — create a short session on the shared service and
 * stream matching `/api/event` payloads so Studio can verify SSE wiring.
 */

import type { OpencodeV2ProbeEvent, OpencodeV2ProbeState } from "../shared/contract";
import {
	probeOpencodeServer,
	resolveOpencodeConnection,
	serverAuthHeaders,
	type OpencodeConnection,
} from "./server-sessions";
import { resolveOpencode2Bin } from "./opencode-v2";

const DEFAULT_PROBE_MESSAGE = "Reply with exactly one word: pong";
const MAX_EVENTS = 150;

type ProbeListener = (state: OpencodeV2ProbeState) => void;

let listener: ProbeListener | null = null;
let abort: AbortController | null = null;
let state: OpencodeV2ProbeState = idleState();
let publishTimer: ReturnType<typeof setTimeout> | null = null;

function idleState(): OpencodeV2ProbeState {
	return {
		status: "idle",
		sessionId: null,
		events: [],
		error: null,
	};
}

export function getOpencodeV2ProbeState(): OpencodeV2ProbeState {
	return {
		...state,
		events: state.events.slice(),
	};
}

export function setOpencodeV2ProbeListener(next: ProbeListener | null): void {
	listener = next;
}

function publish(immediate = false): void {
	if (immediate) {
		if (publishTimer) {
			clearTimeout(publishTimer);
			publishTimer = null;
		}
		listener?.(getOpencodeV2ProbeState());
		return;
	}
	if (publishTimer) return;
	publishTimer = setTimeout(() => {
		publishTimer = null;
		listener?.(getOpencodeV2ProbeState());
	}, 120);
}

function pushEvent(event: OpencodeV2ProbeEvent): void {
	state = {
		...state,
		events: [...state.events, event].slice(-MAX_EVENTS),
	};
	publish();
}

function summarizeEvent(type: string, data: Record<string, unknown> | undefined): string {
	if (!data) return type;
	if (type === "session.inbox.enqueued") {
		const item = data["item"];
		if (item && typeof item === "object") {
			const payload = (item as Record<string, unknown>)["payload"];
			if (payload && typeof payload === "object") {
				const text = (payload as Record<string, unknown>)["text"];
				if (typeof text === "string") return text.slice(0, 120);
			}
		}
	}
	if (typeof data["text"] === "string") return data["text"].slice(0, 120);
	if (typeof data["title"] === "string") return data["title"];
	if (typeof data["sessionID"] === "string") return data["sessionID"];
	return type;
}

function eventSessionId(
	type: string,
	data: Record<string, unknown> | undefined,
	durable: Record<string, unknown> | undefined,
): string | undefined {
	if (data && typeof data["sessionID"] === "string") return data["sessionID"];
	if (durable && typeof durable["aggregateID"] === "string") {
		const id = durable["aggregateID"];
		if (id.startsWith("ses_")) return id;
	}
	if (type === "session.created" && data && typeof data["sessionID"] === "string") {
		return data["sessionID"];
	}
	return undefined;
}

function isRelevant(type: string, sessionId: string | null, eventSession: string | undefined): boolean {
	if (type === "server.connected") return true;
	if (type.startsWith("plugin.")) return false;
	if (!sessionId) return type.startsWith("session.") || type.startsWith("server.");
	return eventSession === sessionId;
}

async function ensureServiceRunning(): Promise<
	{ ok: true; connection: OpencodeConnection } | { ok: false; error: string }
> {
	const existing = resolveOpencodeConnection();
	if (existing) {
		const health = await probeOpencodeServer();
		if (health.running) return { ok: true, connection: existing };
	}

	const bin = resolveOpencode2Bin();
	if (!bin) {
		return {
			ok: false,
			error: "opencode2 is not installed — install it from this tab first",
		};
	}

	const proc = Bun.spawn({
		cmd: [bin, "service", "start"],
		stdio: ["ignore", "pipe", "pipe"],
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	if (code !== 0) {
		return {
			ok: false,
			error: `opencode2 service start failed (exit ${code}): ${(stderr || stdout).trim() || "unknown error"}`,
		};
	}

	for (let i = 0; i < 20; i++) {
		await Bun.sleep(150);
		const connection = resolveOpencodeConnection();
		if (!connection) continue;
		const health = await probeOpencodeServer();
		if (health.running) return { ok: true, connection };
	}
	return { ok: false, error: "service started but Studio could not connect yet" };
}

async function readSse(
	connection: OpencodeConnection,
	controller: AbortController,
	onRaw: (event: {
		type: string;
		created?: number;
		data?: Record<string, unknown>;
		durable?: Record<string, unknown>;
	}) => void,
): Promise<void> {
	const res = await fetch(`${connection.url}/api/event`, {
		headers: serverAuthHeaders(connection.password),
		signal: controller.signal,
	});
	if (!res.ok || !res.body) throw new Error(`event stream ${res.status}`);
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
		const blocks = buffer.split("\n\n");
		buffer = blocks.pop() ?? "";
		for (const block of blocks) {
			const dataLine = block.split("\n").find((line) => line.startsWith("data:"));
			if (!dataLine) continue;
			let parsed: {
				type?: unknown;
				created?: unknown;
				data?: unknown;
				properties?: unknown;
				durable?: unknown;
			};
			try {
				parsed = JSON.parse(dataLine.slice(5).trim()) as typeof parsed;
			} catch {
				continue;
			}
			const type = parsed.type;
			if (typeof type !== "string") continue;
			const data =
				(typeof parsed.data === "object" && parsed.data !== null
					? parsed.data
					: typeof parsed.properties === "object" && parsed.properties !== null
						? parsed.properties
						: undefined) as Record<string, unknown> | undefined;
			const durable =
				typeof parsed.durable === "object" && parsed.durable !== null
					? (parsed.durable as Record<string, unknown>)
					: undefined;
			onRaw({
				type,
				created: typeof parsed.created === "number" ? parsed.created : undefined,
				data,
				durable,
			});
		}
	}
}

/**
 * Start (or restart) a probe: ensure service → open SSE → create session → prompt.
 * Returns immediately; events arrive via the probe listener / getOpencodeV2ProbeState.
 */
export async function startOpencodeV2Probe(opts?: {
	message?: string;
	directory?: string;
}): Promise<{ ok: boolean; started?: boolean; sessionId?: string; error?: string }> {
	if (state.status === "running" || state.status === "starting") {
		return {
			ok: true,
			started: true,
			sessionId: state.sessionId ?? undefined,
		};
	}

	stopOpencodeV2Probe();
	state = {
		status: "starting",
		sessionId: null,
		events: [],
		error: null,
	};
	publish(true);

	const ensured = await ensureServiceRunning();
	if (!ensured.ok) {
		state = { ...idleState(), status: "error", error: ensured.error };
		publish();
		return { ok: false, error: ensured.error };
	}
	const { connection } = ensured;
	const controller = new AbortController();
	abort = controller;

	const message = opts?.message?.trim() || DEFAULT_PROBE_MESSAGE;
	const directory = opts?.directory?.trim() || process.cwd();

	let sessionId: string | null = null;
	let sawIdleOrEnd = false;

	const feed = readSse(connection, controller, (raw) => {
		const sid = eventSessionId(raw.type, raw.data, raw.durable);
		if (!isRelevant(raw.type, sessionId, sid)) return;
		pushEvent({
			at: raw.created ?? Date.now(),
			type: raw.type,
			sessionId: sid,
			summary: summarizeEvent(raw.type, raw.data),
		});
		if (
			sessionId &&
			(raw.type === "session.execution.finished" ||
				raw.type === "session.execution.succeeded" ||
				raw.type === "session.execution.failed" ||
				raw.type === "session.idle" ||
				raw.type === "session.status")
		) {
			const status = raw.data?.["status"];
			const statusType =
				status && typeof status === "object"
					? (status as Record<string, unknown>)["type"]
					: status;
			if (
				raw.type === "session.execution.finished" ||
				raw.type === "session.execution.succeeded" ||
				raw.type === "session.execution.failed" ||
				raw.type === "session.idle" ||
				statusType === "idle"
			) {
				sawIdleOrEnd = true;
			}
		}
	}).catch((err) => {
		if (err instanceof Error && err.name === "AbortError") return;
		if (state.status === "running" || state.status === "starting") {
			state = {
				...state,
				status: "error",
				error: err instanceof Error ? err.message : String(err),
			};
			publish();
		}
	});

	// Give the SSE connection a moment to land before creating the session.
	await Bun.sleep(200);

	try {
		const createRes = await fetch(`${connection.url}/api/session`, {
			method: "POST",
			headers: {
				...serverAuthHeaders(connection.password),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				title: "Studio V2 event probe",
				location: { directory },
				model: { providerID: "opencode", id: "big-pickle" },
			}),
			signal: AbortSignal.timeout(10_000),
		});
		const createBody = (await createRes.json().catch(() => null)) as {
			data?: { id?: unknown };
			message?: unknown;
		} | null;
		const id = createBody?.data?.id;
		if (!createRes.ok || typeof id !== "string") {
			const error =
				(typeof createBody?.message === "string" && createBody.message) ||
				`create session failed (${createRes.status})`;
			controller.abort();
			state = { ...idleState(), status: "error", error };
			publish();
			return { ok: false, error };
		}
		sessionId = id;
		state = {
			...state,
			status: "running",
			sessionId,
			error: null,
		};
		publish();

		const promptRes = await fetch(`${connection.url}/api/session/${sessionId}/prompt`, {
			method: "POST",
			headers: {
				...serverAuthHeaders(connection.password),
				"content-type": "application/json",
			},
			body: JSON.stringify({ text: message }),
			signal: AbortSignal.timeout(10_000),
		});
		if (!promptRes.ok) {
			const errBody = (await promptRes.json().catch(() => null)) as {
				message?: unknown;
			} | null;
			const error =
				(typeof errBody?.message === "string" && errBody.message) ||
				`prompt failed (${promptRes.status})`;
			controller.abort();
			state = { ...state, status: "error", error };
			publish();
			return { ok: false, error, sessionId };
		}

		// Auto-finish shortly after the session goes idle (or after a timeout).
		void (async () => {
			const deadline = Date.now() + 60_000;
			while (Date.now() < deadline && abort === controller) {
				await Bun.sleep(400);
				if (sawIdleOrEnd) break;
			}
			if (abort !== controller) return;
			controller.abort();
			await feed.catch(() => undefined);
			if (state.sessionId === sessionId && state.status === "running") {
				state = { ...state, status: "done" };
				publish();
			}
		})();

		return { ok: true, started: true, sessionId };
	} catch (err) {
		controller.abort();
		const error = err instanceof Error ? err.message : String(err);
		state = { ...state, status: "error", error };
		publish();
		return { ok: false, error };
	}
}

export function stopOpencodeV2Probe(): { ok: boolean } {
	abort?.abort();
	abort = null;
	if (state.status === "running" || state.status === "starting") {
		state = { ...state, status: "done" };
		publish();
	}
	return { ok: true };
}
