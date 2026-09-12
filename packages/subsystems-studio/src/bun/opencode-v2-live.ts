/**
 * OpenCode V2 live agent sessions — ensure service, create+prompt, stream
 * `/api/event` for a session. Used by Maintain (and can back the debug probe).
 */

import type { OpencodeV2ProbeEvent } from "../shared/contract";
import {
	probeOpencodeServer,
	resolveOpencodeConnection,
	serverAuthHeaders,
	type OpencodeConnection,
} from "./server-sessions";
import { resolveOpencode2Bin } from "./opencode-v2";

const MAX_EVENTS = 400;

export type OpencodeLiveFeedStatus =
	| "starting"
	| "running"
	| "done"
	| "error";

export interface OpencodeLiveFeedState {
	sessionId: string;
	status: OpencodeLiveFeedStatus;
	events: OpencodeV2ProbeEvent[];
	error: string | null;
	title?: string;
	agent?: string;
	graphId?: string;
}

type FeedListener = (state: OpencodeLiveFeedState) => void;

const feeds = new Map<string, OpencodeLiveFeedState>();
const feedListeners = new Set<FeedListener>();
const feedPublishTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getOpencodeLiveFeed(sessionId: string): OpencodeLiveFeedState | null {
	const feed = feeds.get(sessionId);
	return feed ? { ...feed, events: feed.events.slice() } : null;
}

export function subscribeOpencodeLiveFeeds(listener: FeedListener): () => void {
	feedListeners.add(listener);
	return () => {
		feedListeners.delete(listener);
	};
}

function publishFeed(sessionId: string, immediate = false): void {
	const feed = feeds.get(sessionId);
	if (!feed) return;
	const emit = () => {
		const snapshot = getOpencodeLiveFeed(sessionId);
		if (!snapshot) return;
		for (const listener of feedListeners) listener(snapshot);
	};
	if (immediate) {
		const t = feedPublishTimers.get(sessionId);
		if (t) {
			clearTimeout(t);
			feedPublishTimers.delete(sessionId);
		}
		emit();
		return;
	}
	if (feedPublishTimers.has(sessionId)) return;
	feedPublishTimers.set(
		sessionId,
		setTimeout(() => {
			feedPublishTimers.delete(sessionId);
			emit();
		}, 120),
	);
}

function upsertFeed(partial: OpencodeLiveFeedState, immediate = false): void {
	feeds.set(partial.sessionId, partial);
	publishFeed(partial.sessionId, immediate);
}

function pushFeedEvent(sessionId: string, event: OpencodeV2ProbeEvent): void {
	const feed = feeds.get(sessionId);
	if (!feed) return;
	upsertFeed({
		...feed,
		events: [...feed.events, event].slice(-MAX_EVENTS),
	});
}

export function parseOpencodeModelRef(
	ref: string,
): { providerID: string; id: string } | null {
	const trimmed = ref.trim();
	const slash = trimmed.indexOf("/");
	if (slash <= 0) return null;
	const providerID = trimmed.slice(0, slash);
	const rest = trimmed.slice(slash + 1);
	const id = rest.split("#")[0]?.trim();
	if (!providerID || !id) return null;
	return { providerID, id };
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
			error: "opencode2 is not installed — open the OpenCode V2 tab to install it",
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
	void type;
	return undefined;
}

function summarizeEvent(type: string, data: Record<string, unknown> | undefined): string {
	if (!data) return type;
	if (typeof data["text"] === "string") return data["text"].slice(0, 160);
	if (typeof data["delta"] === "string") return data["delta"].slice(0, 160);
	if (type === "session.inbox.enqueued") {
		const item = data["item"];
		if (item && typeof item === "object") {
			const payload = (item as Record<string, unknown>)["payload"];
			if (payload && typeof payload === "object") {
				const text = (payload as Record<string, unknown>)["text"];
				if (typeof text === "string") return text.slice(0, 160);
			}
		}
	}
	if (typeof data["title"] === "string") return data["title"];
	if (typeof data["sessionID"] === "string") return data["sessionID"];
	return type;
}

function isRelevant(sessionId: string, type: string, eventSession: string | undefined): boolean {
	if (type === "server.connected") return true;
	if (type.startsWith("plugin.")) return false;
	return eventSession === sessionId;
}

function isTerminalEvent(type: string, data: Record<string, unknown> | undefined): boolean {
	if (
		type === "session.execution.finished" ||
		type === "session.execution.succeeded" ||
		type === "session.execution.failed" ||
		type === "session.idle"
	) {
		return true;
	}
	if (type === "session.status") {
		const status = data?.["status"];
		const statusType =
			status && typeof status === "object"
				? (status as Record<string, unknown>)["type"]
				: status;
		return statusType === "idle";
	}
	return false;
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

function extractTextSummary(events: OpencodeV2ProbeEvent[]): string | undefined {
	const texts: string[] = [];
	for (const ev of events) {
		if (!/text\.(delta|ended)|message\.part\.text/i.test(ev.type)) continue;
		if (!ev.summary || ev.summary === ev.type) continue;
		if (ev.summary.startsWith("ses_")) continue;
		texts.push(ev.summary);
	}
	const joined = texts.join("").trim();
	return joined.length > 0 ? joined.slice(0, 4000) : undefined;
}

export interface RunOpencodeV2AgentSessionOpts {
	title: string;
	agent: string;
	model: string;
	directory: string;
	text: string;
	graphId?: string;
	/** Fired as soon as the session id exists (open a tab / attach UI). */
	onSession?: (sessionId: string) => void;
}

export async function runOpencodeV2AgentSession(
	opts: RunOpencodeV2AgentSessionOpts,
): Promise<{
	ok: boolean;
	sessionId?: string;
	summary?: string;
	error?: string;
	model: string;
	agent: string;
}> {
	const modelRef = parseOpencodeModelRef(opts.model);
	if (!modelRef) {
		return {
			ok: false,
			error: `invalid model ref: ${opts.model}`,
			model: opts.model,
			agent: opts.agent,
		};
	}

	const ensured = await ensureServiceRunning();
	if (!ensured.ok) {
		return {
			ok: false,
			error: ensured.error,
			model: opts.model,
			agent: opts.agent,
		};
	}
	const { connection } = ensured;
	const controller = new AbortController();

	let sessionId: string | null = null;
	let sawTerminal = false;
	const placeholderId = `pending-${Date.now()}`;

	upsertFeed(
		{
			sessionId: placeholderId,
			status: "starting",
			events: [],
			error: null,
			title: opts.title,
			agent: opts.agent,
			graphId: opts.graphId,
		},
		true,
	);

	const feedTask = readSse(connection, controller, (raw) => {
		if (!sessionId) return;
		const sid = eventSessionId(raw.type, raw.data, raw.durable);
		if (!isRelevant(sessionId, raw.type, sid)) return;
		pushFeedEvent(sessionId, {
			at: raw.created ?? Date.now(),
			type: raw.type,
			sessionId: sid,
			summary: summarizeEvent(raw.type, raw.data),
		});
		if (isTerminalEvent(raw.type, raw.data)) sawTerminal = true;
	}).catch((err) => {
		if (err instanceof Error && err.name === "AbortError") return;
		if (!sessionId) return;
		const feed = feeds.get(sessionId);
		if (!feed || feed.status === "done" || feed.status === "error") return;
		upsertFeed(
			{
				...feed,
				status: "error",
				error: err instanceof Error ? err.message : String(err),
			},
			true,
		);
	});

	await Bun.sleep(200);

	try {
		const createRes = await fetch(`${connection.url}/api/session`, {
			method: "POST",
			headers: {
				...serverAuthHeaders(connection.password),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				title: opts.title,
				agent: opts.agent,
				model: modelRef,
				location: { directory: opts.directory },
			}),
			signal: AbortSignal.timeout(15_000),
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
			feeds.delete(placeholderId);
			return { ok: false, error, model: opts.model, agent: opts.agent };
		}

		sessionId = id;
		feeds.delete(placeholderId);
		upsertFeed(
			{
				sessionId,
				status: "running",
				events: [],
				error: null,
				title: opts.title,
				agent: opts.agent,
				graphId: opts.graphId,
			},
			true,
		);
		opts.onSession?.(sessionId);

		const promptRes = await fetch(`${connection.url}/api/session/${sessionId}/prompt`, {
			method: "POST",
			headers: {
				...serverAuthHeaders(connection.password),
				"content-type": "application/json",
			},
			body: JSON.stringify({ text: opts.text }),
			signal: AbortSignal.timeout(15_000),
		});
		if (!promptRes.ok) {
			const errBody = (await promptRes.json().catch(() => null)) as {
				message?: unknown;
			} | null;
			const error =
				(typeof errBody?.message === "string" && errBody.message) ||
				`prompt failed (${promptRes.status})`;
			controller.abort();
			const feed = feeds.get(sessionId);
			if (feed) {
				upsertFeed({ ...feed, status: "error", error }, true);
			}
			return {
				ok: false,
				error,
				sessionId,
				model: opts.model,
				agent: opts.agent,
			};
		}

		const deadline = Date.now() + 15 * 60_000;
		while (Date.now() < deadline && !sawTerminal) {
			await Bun.sleep(400);
			const feed = feeds.get(sessionId);
			if (feed?.status === "error") {
				controller.abort();
				await feedTask.catch(() => undefined);
				return {
					ok: false,
					error: feed.error ?? "live feed error",
					sessionId,
					model: opts.model,
					agent: opts.agent,
				};
			}
		}

		controller.abort();
		await feedTask.catch(() => undefined);

		const feed = feeds.get(sessionId);
		const events = feed?.events ?? [];
		const failed = events.some((e) => e.type === "session.execution.failed");
		const summary = extractTextSummary(events);
		upsertFeed(
			{
				sessionId,
				status: failed ? "error" : "done",
				events,
				error: failed ? "session.execution.failed" : null,
				title: opts.title,
				agent: opts.agent,
				graphId: opts.graphId,
			},
			true,
		);

		if (failed) {
			return {
				ok: false,
				error: "OpenCode session execution failed",
				sessionId,
				summary,
				model: opts.model,
				agent: opts.agent,
			};
		}

		return {
			ok: true,
			sessionId,
			summary,
			model: opts.model,
			agent: opts.agent,
		};
	} catch (err) {
		controller.abort();
		const error = err instanceof Error ? err.message : String(err);
		if (sessionId) {
			const feed = feeds.get(sessionId);
			if (feed) upsertFeed({ ...feed, status: "error", error }, true);
		} else {
			feeds.delete(placeholderId);
		}
		return { ok: false, error, sessionId: sessionId ?? undefined, model: opts.model, agent: opts.agent };
	}
}
