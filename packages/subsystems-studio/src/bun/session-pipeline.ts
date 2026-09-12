/**
 * Session-processing pipeline — the shared core the host's RPC path and the
 * (future) background warm-up worker both call.
 *
 * Everything here is deliberately free of electrobun imports: reading raw
 * sources (opencode sqlite + durable transcripts), normalizing/accumulating,
 * and writing the durable disk cache. The host keeps its own in-memory layers
 * (resident store, bounded hot cache) on top of `processSessionEvents`; a
 * `Bun.Worker` running this same module will be able to warm the disk cache
 * without touching the host's event loop.
 */

import {
	normalizeEventsWithAdapter,
	accumulateEvents,
	collectRepositories,
	opencodeRowsToUniversalEvents,
} from "@principal-ai/subsystems-core/pipeline";
import {
	createAccumulatedState,
	eventOp,
	PathNormalizationService,
	ClineSessionReader,
	cleanClinePrompt,
	PiSessionReader,
	GrokSessionReader,
	CodexSessionReader,
	CursorSessionReader,
} from "@principal-ai/agent-monitoring";
import type {
	AgentSessionEvent,
	UniversalAgentSessionEvent,
	RepositoryInfo,
} from "@principal-ai/agent-monitoring";
import { BunNormalizationAdapter } from "./normalizationAdapter";
import {
	readCachedSessionEvents,
	writeCachedSessionEvents,
	trimSessionEventRows,
} from "./session-cache";
import {
	loadAlexandriaRepos,
	registerProjectInAlexandria,
} from "./alexandria";
import type {
	RepoInfo,
	SessionEventRow,
	SessionGroup,
	SessionSummary,
} from "../shared/contract";
import { statSync } from "node:fs";
import { isMaintainSession } from "./maintain-sessions";
import {
	isOpencodeV2Session,
	readOpencodeV2Session,
	sessionMessagesToUniversalEvents,
} from "./opencode-v2-messages";

function openCodeDBPath(): string {
	const env = process.env as Record<string, string | undefined>;
	if (env["OPENCODE_DATA_DIR"]) return `${env["OPENCODE_DATA_DIR"]}/opencode/opencode.db`;
	const home = env["HOME"] || env["USERPROFILE"] || "/root";
	const xdgData = env["XDG_DATA_HOME"] || `${home}/.local/share`;
	return `${xdgData}/opencode/opencode.db`;
}

// When set to "1", getSessionEvents responses include the full raw event payload
// and the full normalized event. Default (unset) ships only the trimmed fields
// the File City renderer consumes (timestamp + accumulated) — opencode raw
// payloads reach hundreds of MB per session and freeze the agent drawer. A
// future diagnosing UI that compares the raw → normalized → accumulated
// pipeline enables this to get the full shapes.
const INCLUDE_RAW_EVENT_PAYLOADS =
	((process.env as Record<string, string | undefined>)["TRAIL_INCLUDE_RAW"] ?? "") === "1";

function wantRawPayloads(requestIncludeRaw: boolean): boolean {
	return INCLUDE_RAW_EVENT_PAYLOADS || requestIncludeRaw;
}

/**
 * Host-side cache of fully-built session event rows, keyed by
 * `${sessionId}:${includeRaw}`. The opencode pipeline (normalize + accumulate)
 * needs the whole session before any row is correct, so the full set is built
 * once and paginated requests serve slices from this cache instead of re-running
 * the pipeline per page. Bounded so a busy principal-studio doesn't hoard whole
 * sessions; raw payloads can reach hundreds of MB per session.
 */
const sessionEventsCache = new Map<string, SessionEventRow[]>();

// Cline CLI stores its durable data under its own convention (~/.cline/data),
// not XDG. The reader handles the path resolution; we just need a singleton
// and a way to tell Cline sessions apart from opencode sessions.
const clineReader = new ClineSessionReader();

function isClineSession(sessionId: string): boolean {
	return clineReader.readSession(sessionId) !== null;
}

// pi CLI stores its durable sessions under ~/.pi/agent/sessions (JSONL files).
// Same durable-transcript pattern as Cline: one file per session, tree-shaped.
const piReader = new PiSessionReader();

function isPiSession(sessionId: string): boolean {
	return piReader.readSession(sessionId) !== null;
}

// Grok Build stores durable sessions under ~/.grok/sessions/<cwd>/<id>/
// (summary.json + updates.jsonl). Same stage-1 reader shape as Cline/pi.
const grokReader = new GrokSessionReader();

function isGrokSession(sessionId: string): boolean {
	return grokReader.readSession(sessionId) !== null;
}

// Codex stores durable rollout JSONL under ~/.codex/sessions.
const codexReader = new CodexSessionReader();

function isCodexSession(sessionId: string): boolean {
	return codexReader.readSession(sessionId) !== null;
}

// Cursor IDE stores durable agent chats under ~/.cursor/chats.
const cursorReader = new CursorSessionReader();

function isCursorSession(sessionId: string): boolean {
	return cursorReader.readSession(sessionId) !== null;
}

/**
 * OpenCode V2 durable transcript: `session_v2` + `session_message` → universal
 * events → same normalize/accumulate path as Cline/pi. Identity is explicit
 * (`session_v2` row), not “empty `event` table.”
 */
async function runOpencodeV2MessagePipeline(
	sessionId: string,
): Promise<ClinePipelineResult | null> {
	const record = readOpencodeV2Session(sessionId);
	if (!record) return null;

	const sessionTitle = record.meta.title || "OpenCode V2 session";
	const sessionSlug = record.meta.slug || "";
	const workingDirectory = record.meta.directory ?? "";

	const rawEvents = sessionMessagesToUniversalEvents(sessionId, record.messages, {
		workingDirectory,
	});
	if (rawEvents.length === 0) return null;

	const alexandriaRepos = loadAlexandriaRepos();
	const knownRoots = new Map<string, RepositoryInfo>();
	for (const [path, repo] of alexandriaRepos) {
		knownRoots.set(path, {
			root: repo.root,
			remoteUrl: repo.remoteUrl,
			owner: repo.owner,
			repo: repo.repo,
		});
	}
	const adapter = new BunNormalizationAdapter(knownRoots);
	const normalizationService = new PathNormalizationService(adapter);

	const normalizedEvents = await normalizationService.normalizePathsBatch(
		rawEvents,
		workingDirectory,
	);

	for (const discovered of adapter.newlyDiscovered) {
		registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
	}

	const accState = createAccumulatedState(sessionTitle);
	const events: SessionEventRow[] = [];
	const repoSet = new Map<string, { root: string; fileCount: number }>();

	for (let i = 0; i < normalizedEvents.length; i++) {
		const normalizedEvent = normalizedEvents[i];
		const accResult = eventOp(accState, normalizedEvent);
		events.push({
			seq: i,
			type: normalizedEvent.eventType,
			raw: INCLUDE_RAW_EVENT_PAYLOADS ? normalizedEvent.raw : undefined,
			normalized: INCLUDE_RAW_EVENT_PAYLOADS
				? (normalizedEvent as unknown as Record<string, unknown>)
				: { timestamp: normalizedEvent.timestamp },
			accumulated: accResult,
		});
		if (normalizedEvent.files) {
			for (const f of normalizedEvent.files) {
				const root = f.repository?.gitRoot;
				if (root) {
					const entry = repoSet.get(root) ?? { root, fileCount: 0 };
					entry.fileCount++;
					repoSet.set(root, entry);
				}
			}
		}
	}

	const lastEvent = events[events.length - 1];
	if (lastEvent) {
		const lastTimestamp =
			((lastEvent.normalized as Record<string, unknown>)["timestamp"] as
				| number
				| undefined) ?? 0;
		events.push({
			seq: lastEvent.seq + 1,
			type: "finished",
			raw: null,
			normalized: { timestamp: lastTimestamp },
			accumulated: {
				id: "",
				timestamp: lastTimestamp,
				sessionId: sessionSlug || sessionId,
				sessionName: accState.sessionName,
				sessionColor: accState.sessionColor,
				operation: "finished",
				files: [],
				dependencies: [],
				description: `${accState.sessionName} finished`,
				layers: [],
				contextTokens: accState.contextTokens,
			},
		});
	}

	const repos = Array.from(repoSet.values())
		.sort((a, b) => b.fileCount - a.fileCount)
		.map((r) => {
			const parts = r.root.replace(/\/+$/, "").split("/");
			const known = knownRoots.get(r.root);
			return {
				root: r.root,
				fileCount: r.fileCount,
				owner: known?.owner ?? null,
				name: parts[parts.length - 1] ?? null,
				editing: false,
			};
		});
	const repoRoot = repos.length > 0 ? repos[0].root : undefined;

	return {
		rawEvents,
		normalizedEvents,
		accState,
		events,
		repos,
		repoRoot,
		sessionTitle,
		sessionSlug,
	};
}

// Shared Cline pipeline: reader → normalizePathsBatch → eventOp loop.
// Returns the same shapes getSessionEvents build so the Cline branch can
// drop into the existing response assembly with no extra plumbing.
interface ClinePipelineResult {
	rawEvents: UniversalAgentSessionEvent[];
	normalizedEvents: import("@principal-ai/agent-monitoring").RepoNormalizedUniversalAgentSessionEvent[];
	accState: ReturnType<typeof createAccumulatedState>;
	events: SessionEventRow[];
	repos: RepoInfo[];
	repoRoot: string | undefined;
	sessionTitle: string;
	sessionSlug: string;
}

async function runClinePipeline(sessionId: string): Promise<ClinePipelineResult | null> {
	const record = clineReader.readSession(sessionId);
	if (!record) return null;

	// Title/name: prefer the (tag-stripped) session prompt, truncated; fall back
	// to a readable label rather than the raw session id string.
	const promptText = cleanClinePrompt(record.metadata.prompt ?? "");
	const sessionTitle = promptText
		? promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText
		: "Cline session";
	const sessionSlug = "";

	const rawEvents = clineReader.toUniversalEvents(sessionId);
	if (rawEvents.length === 0) return null;

	const alexandriaRepos = loadAlexandriaRepos();
	const knownRoots = new Map<string, RepositoryInfo>();
	for (const [path, repo] of alexandriaRepos) {
		knownRoots.set(path, {
			root: repo.root,
			remoteUrl: repo.remoteUrl,
			owner: repo.owner,
			repo: repo.repo,
		});
	}
	const adapter = new BunNormalizationAdapter(knownRoots);
	const normalizationService = new PathNormalizationService(adapter);

	const normalizedEvents = await normalizationService.normalizePathsBatch(
		rawEvents,
		record.metadata.workspace_root || record.metadata.cwd || "",
	);

	// Auto-register any newly discovered git roots
	for (const discovered of adapter.newlyDiscovered) {
		registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
	}

	const accState = createAccumulatedState(sessionTitle);
	const events: SessionEventRow[] = [];
	const repoSet = new Map<string, { root: string; fileCount: number }>();

	for (let i = 0; i < normalizedEvents.length; i++) {
		const normalizedEvent = normalizedEvents[i];
		const accResult = eventOp(accState, normalizedEvent);
		events.push({
			seq: i,
			type: normalizedEvent.eventType,
			raw: INCLUDE_RAW_EVENT_PAYLOADS ? normalizedEvent.raw : undefined,
			normalized: INCLUDE_RAW_EVENT_PAYLOADS
				? (normalizedEvent as unknown as Record<string, unknown>)
				: { timestamp: normalizedEvent.timestamp },
			accumulated: accResult,
		});
		if (normalizedEvent.files) {
			for (const f of normalizedEvent.files) {
				const root = f.repository?.gitRoot;
				if (root) {
					const entry = repoSet.get(root) ?? { root, fileCount: 0 };
					entry.fileCount++;
					repoSet.set(root, entry);
				}
			}
		}
	}

	// Append a "finished" row like the opencode path does
	const lastEvent = events[events.length - 1];
	if (lastEvent) {
		const lastTimestamp = (lastEvent.normalized as Record<string, unknown>)["timestamp"] as number | undefined ?? 0;
		events.push({
			seq: lastEvent.seq + 1,
			type: "finished",
			raw: null,
			normalized: { timestamp: lastTimestamp },
			accumulated: {
				id: "",
				timestamp: lastTimestamp,
				sessionId: sessionId,
				sessionName: accState.sessionName,
				sessionColor: accState.sessionColor,
				operation: "finished",
				files: [],
				dependencies: [],
				description: `${accState.sessionName} finished`,
				layers: [],
				contextTokens: accState.contextTokens,
			},
		});
	}

	const repos = Array.from(repoSet.values())
		.sort((a, b) => b.fileCount - a.fileCount)
		.map((r) => {
			const parts = r.root.replace(/\/+$/, "").split("/");
			const known = knownRoots.get(r.root);
			return { root: r.root, fileCount: r.fileCount, owner: known?.owner ?? null, name: parts[parts.length - 1] ?? null, editing: false };
		});
	const repoRoot = repos.length > 0 ? repos[0].root : undefined;

	return { rawEvents, normalizedEvents, accState, events, repos, repoRoot, sessionTitle, sessionSlug };
}

// Shared pi pipeline: reader → normalizePathsBatch → eventOp loop.
// Same shapes as runClinePipeline so both drop into the existing response
// assembly with no extra plumbing.
async function runPiPipeline(sessionId: string): Promise<ClinePipelineResult | null> {
	const record = piReader.readSession(sessionId);
	if (!record) return null;

	// Title/name: prefer the first user prompt, truncated; fall back to a
	// readable label rather than the raw session id string.
	const promptText = record.firstPrompt;
	const sessionTitle = promptText
		? promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText
		: "pi session";
	const sessionSlug = "";

	const rawEvents = piReader.toUniversalEvents(sessionId);
	if (rawEvents.length === 0) return null;

	const alexandriaRepos = loadAlexandriaRepos();
	const knownRoots = new Map<string, RepositoryInfo>();
	for (const [path, repo] of alexandriaRepos) {
		knownRoots.set(path, {
			root: repo.root,
			remoteUrl: repo.remoteUrl,
			owner: repo.owner,
			repo: repo.repo,
		});
	}
	const adapter = new BunNormalizationAdapter(knownRoots);
	const normalizationService = new PathNormalizationService(adapter);

	// The pi session header carries the working directory; that is the repo to
	// normalize against (the ~/.pi sessions dir itself is never a repo).
	const normalizedEvents = await normalizationService.normalizePathsBatch(
		rawEvents,
		record.header.cwd || "",
	);

	// Auto-register any newly discovered git roots
	for (const discovered of adapter.newlyDiscovered) {
		registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
	}

	const accState = createAccumulatedState(sessionTitle);
	const events: SessionEventRow[] = [];
	const repoSet = new Map<string, { root: string; fileCount: number }>();

	for (let i = 0; i < normalizedEvents.length; i++) {
		const normalizedEvent = normalizedEvents[i];
		const accResult = eventOp(accState, normalizedEvent);
		events.push({
			seq: i,
			type: normalizedEvent.eventType,
			raw: INCLUDE_RAW_EVENT_PAYLOADS ? normalizedEvent.raw : undefined,
			normalized: INCLUDE_RAW_EVENT_PAYLOADS
				? (normalizedEvent as unknown as Record<string, unknown>)
				: { timestamp: normalizedEvent.timestamp },
			accumulated: accResult,
		});
		if (normalizedEvent.files) {
			for (const f of normalizedEvent.files) {
				const root = f.repository?.gitRoot;
				if (root) {
					const entry = repoSet.get(root) ?? { root, fileCount: 0 };
					entry.fileCount++;
					repoSet.set(root, entry);
				}
			}
		}
	}

	// Append a "finished" row like the opencode path does
	const lastEvent = events[events.length - 1];
	if (lastEvent) {
		const lastTimestamp = (lastEvent.normalized as Record<string, unknown>)["timestamp"] as number | undefined ?? 0;
		events.push({
			seq: lastEvent.seq + 1,
			type: "finished",
			raw: null,
			normalized: { timestamp: lastTimestamp },
			accumulated: {
				id: "",
				timestamp: lastTimestamp,
				sessionId: sessionId,
				sessionName: accState.sessionName,
				sessionColor: accState.sessionColor,
				operation: "finished",
				files: [],
				dependencies: [],
				description: `${accState.sessionName} finished`,
				layers: [],
				contextTokens: accState.contextTokens,
			},
		});
	}

	const repos = Array.from(repoSet.values())
		.sort((a, b) => b.fileCount - a.fileCount)
		.map((r) => {
			const parts = r.root.replace(/\/+$/, "").split("/");
			const known = knownRoots.get(r.root);
			return { root: r.root, fileCount: r.fileCount, owner: known?.owner ?? null, name: parts[parts.length - 1] ?? null, editing: false };
		});
	const repoRoot = repos.length > 0 ? repos[0].root : undefined;

	return { rawEvents, normalizedEvents, accState, events, repos, repoRoot, sessionTitle, sessionSlug };
}

// Shared Grok pipeline: reader → normalizePathsBatch → eventOp loop.
// Same shapes as runClinePipeline / runPiPipeline.
async function runGrokPipeline(sessionId: string): Promise<ClinePipelineResult | null> {
	const record = grokReader.readSession(sessionId);
	if (!record) return null;

	const promptText = (record.firstPrompt ?? "").trim();
	const sessionTitle =
		record.title ||
		(promptText
			? promptText.length > 80
				? `${promptText.slice(0, 80)}…`
				: promptText
			: "Grok session");
	const sessionSlug = "";

	const rawEvents = grokReader.toUniversalEvents(sessionId);
	if (rawEvents.length === 0) return null;

	const alexandriaRepos = loadAlexandriaRepos();
	const knownRoots = new Map<string, RepositoryInfo>();
	for (const [path, repo] of alexandriaRepos) {
		knownRoots.set(path, {
			root: repo.root,
			remoteUrl: repo.remoteUrl,
			owner: repo.owner,
			repo: repo.repo,
		});
	}
	const adapter = new BunNormalizationAdapter(knownRoots);
	const normalizationService = new PathNormalizationService(adapter);

	// summary.info.cwd is the project working directory — not ~/.grok/sessions.
	const normalizedEvents = await normalizationService.normalizePathsBatch(
		rawEvents,
		record.cwd || "",
	);

	for (const discovered of adapter.newlyDiscovered) {
		registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
	}

	const accState = createAccumulatedState(sessionTitle);
	const events: SessionEventRow[] = [];
	const repoSet = new Map<string, { root: string; fileCount: number }>();

	for (let i = 0; i < normalizedEvents.length; i++) {
		const normalizedEvent = normalizedEvents[i];
		const accResult = eventOp(accState, normalizedEvent);
		events.push({
			seq: i,
			type: normalizedEvent.eventType,
			raw: INCLUDE_RAW_EVENT_PAYLOADS ? normalizedEvent.raw : undefined,
			normalized: INCLUDE_RAW_EVENT_PAYLOADS
				? (normalizedEvent as unknown as Record<string, unknown>)
				: { timestamp: normalizedEvent.timestamp },
			accumulated: accResult,
		});
		if (normalizedEvent.files) {
			for (const f of normalizedEvent.files) {
				const root = f.repository?.gitRoot;
				if (root) {
					const entry = repoSet.get(root) ?? { root, fileCount: 0 };
					entry.fileCount++;
					repoSet.set(root, entry);
				}
			}
		}
	}

	const lastEvent = events[events.length - 1];
	if (lastEvent) {
		const lastTimestamp = (lastEvent.normalized as Record<string, unknown>)["timestamp"] as number | undefined ?? 0;
		events.push({
			seq: lastEvent.seq + 1,
			type: "finished",
			raw: null,
			normalized: { timestamp: lastTimestamp },
			accumulated: {
				id: "",
				timestamp: lastTimestamp,
				sessionId: sessionId,
				sessionName: accState.sessionName,
				sessionColor: accState.sessionColor,
				operation: "finished",
				files: [],
				dependencies: [],
				description: `${accState.sessionName} finished`,
				layers: [],
				contextTokens: accState.contextTokens,
			},
		});
	}

	const repos = Array.from(repoSet.values())
		.sort((a, b) => b.fileCount - a.fileCount)
		.map((r) => {
			const parts = r.root.replace(/\/+$/, "").split("/");
			const known = knownRoots.get(r.root);
			return { root: r.root, fileCount: r.fileCount, owner: known?.owner ?? null, name: parts[parts.length - 1] ?? null, editing: false };
		});
	const repoRoot = repos.length > 0 ? repos[0].root : (record.cwd || undefined);

	return { rawEvents, normalizedEvents, accState, events, repos, repoRoot, sessionTitle, sessionSlug };
}

// Codex uses the same durable-reader → normalize → accumulate path as Grok.
async function runCodexPipeline(sessionId: string): Promise<ClinePipelineResult | null> {
	const record = codexReader.readSession(sessionId);
	if (!record) return null;

	const promptText = record.firstPrompt.trim();
	const sessionTitle = promptText
		? promptText.length > 80
			? `${promptText.slice(0, 80)}…`
			: promptText
		: "Codex session";
	const sessionSlug = "";
	const rawEvents = codexReader.toUniversalEvents(sessionId);
	if (rawEvents.length === 0) return null;

	const alexandriaRepos = loadAlexandriaRepos();
	const knownRoots = new Map<string, RepositoryInfo>();
	for (const [path, repo] of alexandriaRepos) {
		knownRoots.set(path, {
			root: repo.root,
			remoteUrl: repo.remoteUrl,
			owner: repo.owner,
			repo: repo.repo,
		});
	}
	const adapter = new BunNormalizationAdapter(knownRoots);
	const normalizationService = new PathNormalizationService(adapter);
	const normalizedEvents = await normalizationService.normalizePathsBatch(
		rawEvents,
		record.cwd || "",
	);

	for (const discovered of adapter.newlyDiscovered) {
		registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
	}

	const accState = createAccumulatedState(sessionTitle);
	const events: SessionEventRow[] = [];
	const repoSet = new Map<string, { root: string; fileCount: number }>();
	for (let i = 0; i < normalizedEvents.length; i++) {
		const normalizedEvent = normalizedEvents[i];
		const accResult = eventOp(accState, normalizedEvent);
		events.push({
			seq: i,
			type: normalizedEvent.eventType,
			raw: INCLUDE_RAW_EVENT_PAYLOADS ? normalizedEvent.raw : undefined,
			normalized: INCLUDE_RAW_EVENT_PAYLOADS
				? (normalizedEvent as unknown as Record<string, unknown>)
				: { timestamp: normalizedEvent.timestamp },
			accumulated: accResult,
		});
		for (const file of normalizedEvent.files ?? []) {
			const root = file.repository?.gitRoot;
			if (!root) continue;
			const entry = repoSet.get(root) ?? { root, fileCount: 0 };
			entry.fileCount++;
			repoSet.set(root, entry);
		}
	}

	const lastEvent = events[events.length - 1];
	if (lastEvent) {
		const lastTimestamp =
			((lastEvent.normalized as Record<string, unknown>)["timestamp"] as number | undefined) ?? 0;
		events.push({
			seq: lastEvent.seq + 1,
			type: "finished",
			raw: null,
			normalized: { timestamp: lastTimestamp },
			accumulated: {
				id: "",
				timestamp: lastTimestamp,
				sessionId,
				sessionName: accState.sessionName,
				sessionColor: accState.sessionColor,
				operation: "finished",
				files: [],
				dependencies: [],
				description: `${accState.sessionName} finished`,
				layers: [],
				contextTokens: accState.contextTokens,
			},
		});
	}

	const repos = Array.from(repoSet.values())
		.sort((a, b) => b.fileCount - a.fileCount)
		.map((repo) => {
			const parts = repo.root.replace(/\/+$/, "").split("/");
			const known = knownRoots.get(repo.root);
			return {
				root: repo.root,
				fileCount: repo.fileCount,
				owner: known?.owner ?? null,
				name: parts[parts.length - 1] ?? null,
				editing: false,
			};
		});
	const repoRoot = repos.length > 0 ? repos[0].root : record.cwd || undefined;

	return { rawEvents, normalizedEvents, accState, events, repos, repoRoot, sessionTitle, sessionSlug };
}

// Cursor IDE uses the same durable-reader → normalize → accumulate path as Codex.
async function runCursorPipeline(
	sessionId: string,
	includeRaw = false,
): Promise<ClinePipelineResult | null> {
	const record = cursorReader.readSession(sessionId);
	if (!record) return null;

	const promptText = record.firstPrompt.trim();
	const sessionTitle =
		record.title ||
		(promptText
			? promptText.length > 80
				? `${promptText.slice(0, 80)}…`
				: promptText
			: "Cursor session");
	const sessionSlug = "";

	const rawEvents = cursorReader.toUniversalEvents(sessionId);
	if (rawEvents.length === 0) return null;

	const alexandriaRepos = loadAlexandriaRepos();
	const knownRoots = new Map<string, RepositoryInfo>();
	for (const [path, repo] of alexandriaRepos) {
		knownRoots.set(path, {
			root: repo.root,
			remoteUrl: repo.remoteUrl,
			owner: repo.owner,
			repo: repo.repo,
		});
	}
	const adapter = new BunNormalizationAdapter(knownRoots);
	const normalizationService = new PathNormalizationService(adapter);
	const normalizedEvents = await normalizationService.normalizePathsBatch(
		rawEvents,
		record.cwd || "",
	);

	for (const discovered of adapter.newlyDiscovered) {
		registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
	}

	const accState = createAccumulatedState(sessionTitle);
	const events: SessionEventRow[] = [];
	const repoSet = new Map<string, { root: string; fileCount: number }>();
	const includeRawPayload = wantRawPayloads(includeRaw);
	for (let i = 0; i < normalizedEvents.length; i++) {
		const normalizedEvent = normalizedEvents[i];
		const accResult = eventOp(accState, normalizedEvent);
		events.push({
			seq: i,
			type: normalizedEvent.eventType,
			raw: includeRawPayload ? normalizedEvent.raw : undefined,
			normalized: includeRawPayload
				? (normalizedEvent as unknown as Record<string, unknown>)
				: { timestamp: normalizedEvent.timestamp },
			accumulated: accResult,
		});
		for (const file of normalizedEvent.files ?? []) {
			const root = file.repository?.gitRoot;
			if (!root) continue;
			const entry = repoSet.get(root) ?? { root, fileCount: 0 };
			entry.fileCount++;
			repoSet.set(root, entry);
		}
	}

	const lastEvent = events[events.length - 1];
	if (lastEvent) {
		const lastTimestamp =
			((lastEvent.normalized as Record<string, unknown>)["timestamp"] as number | undefined) ?? 0;
		events.push({
			seq: lastEvent.seq + 1,
			type: "finished",
			raw: null,
			normalized: { timestamp: lastTimestamp },
			accumulated: {
				id: "",
				timestamp: lastTimestamp,
				sessionId: sessionId,
				sessionName: accState.sessionName,
				sessionColor: accState.sessionColor,
				operation: "finished",
				files: [],
				dependencies: [],
				description: `${accState.sessionName} finished`,
				layers: [],
				contextTokens: accState.contextTokens,
			},
		});
	}

	const repos = Array.from(repoSet.values())
		.sort((a, b) => b.fileCount - a.fileCount)
		.map((repo) => {
			const parts = repo.root.replace(/\/+$/, "").split("/");
			const known = knownRoots.get(repo.root);
			return {
				root: repo.root,
				fileCount: repo.fileCount,
				owner: known?.owner ?? null,
				name: parts[parts.length - 1] ?? null,
				editing: false,
			};
		});
	const repoRoot = repos.length > 0 ? repos[0].root : record.cwd || undefined;

	return { rawEvents, normalizedEvents, accState, events, repos, repoRoot, sessionTitle, sessionSlug };
}


// Durable-transcript branches (cline/pi/grok/codex/cursor) all share one response
// assembly: persist the processed result to the disk cache, then return the
// same `ok: true` shape each branch currently builds inline.
function respondWithCachedPipeline(
	sessionId: string,
	agent: string,
	result: ClinePipelineResult,
): {
	ok: true;
	events: SessionEventRow[];
	repoRoot: string | undefined;
	repos: RepoInfo[];
	session: { slug: string; title: string; agent: string };
} {
	writeCachedSessionEvents(sessionId, {
		agent,
		session: { slug: result.sessionSlug, title: result.sessionTitle, agent },
		repoRoot: result.repoRoot,
		repos: result.repos,
		events: trimSessionEventRows(result.events),
	});
	return {
		ok: true,
		events: result.events,
		repoRoot: result.repoRoot,
		repos: result.repos,
		session: { slug: result.sessionSlug, title: result.sessionTitle, agent },
	};
}

// opencode stores a placeholder title ("New session - <iso timestamp>") on
// sessions it never generated a title for. Surface the first real user prompt
// text instead so the agent-sessions list reads as actual tasks.
function firstUserPromptText(
	db: import("bun:sqlite").Database,
	aggregateId: string,
): string {
	const userMsg = db
		.prepare(
			`SELECT json_extract(data, '$.info.id') AS id
			 FROM event
			 WHERE aggregate_id = ? AND type = 'message.updated.1'
			   AND json_extract(data, '$.info.role') = 'user'
			 ORDER BY seq ASC LIMIT 1`,
		)
		.get(aggregateId) as { id: string | null } | null;
	if (!userMsg?.id) return "";
	const part = db
		.prepare(
			`SELECT json_extract(data, '$.part.text') AS text
			 FROM event
			 WHERE aggregate_id = ? AND type = 'message.part.updated.1'
			   AND json_extract(data, '$.part.messageID') = ?
			   AND json_extract(data, '$.part.type') = 'text'
			 ORDER BY seq ASC LIMIT 1`,
		)
		.get(aggregateId, userMsg.id) as { text: string | null } | null;
	if (typeof part?.text !== "string" || part.text === "") return "";
	return part.text.replace(/\s+/g, " ").trim();
}
/** One session's fully-processed result, as served by getSessionEvents. */
export type BuiltSessionEvents =
	| {
			ok: true;
			events: SessionEventRow[];
			repoRoot?: string;
			repos: RepoInfo[];
			session: { slug: string; title: string; agent?: string };
	  }
	| { ok: false; error: string };

/** Host → worker control messages. */
export type SessionWarmupMessage =
	| { type: "warmup"; days: number }
	| { type: "refresh"; sessionIds: string[] };

/** Worker → host status messages. Event timelines never cross the bridge — the
 *  worker writes the shared disk cache and the host reads it, so this channel
 *  only carries progress/done/error signals. */
export type SessionWarmupEvent =
	| { type: "progress"; sessionId: string; done: number; total: number }
	| { type: "done"; processed: number; total: number }
	| { type: "error"; message: string };

/**
 * Build the recent-session index: opencode sqlite (window-filtered, with
 * parent/child grouping) plus durable-transcript agents (cline/pi/grok/codex).
 * Shared by the listSessions RPC and the warm-up worker.
 */
export type SessionIndex = {
	groups: SessionGroup[];
	standalone: SessionSummary[];
	hasMore?: boolean;
};

// Cheap session-index cache. The index is a scan of the (large) opencode event
// table, so caching it keyed by the DB's mtime/size turns repeated
// buildSessionIndex calls (overview, listSessions, the 30s poll) into a memory
// read instead of a multi-second host-loop block — which is what lets the
// overview serve cached timelines "first". Rebuilds whenever the DB actually
// changes (new sessions, new events). Thread-local, so the host and the
// warm-up worker each keep their own copy.
const indexCache = new Map<
	string,
	{ groups: SessionGroup[]; standalone: SessionSummary[]; hasMore?: boolean }
>();
const INDEX_CACHE_MAX = 4;

function dbFingerprint(dbPath: string): string {
	// The opencode DB is WAL-mode: new events are appended to the -wal file and
	// only checkpointed into the main .db periodically, so a fingerprint of the
	// main file alone could miss fresh writes. Stat both (cheap syscalls).
	const stats: Array<{ mtimeMs: number; size: number }> = [];
	for (const p of [dbPath, `${dbPath}-wal`]) {
		try {
			const st = statSync(p);
			stats.push({ mtimeMs: st.mtimeMs, size: st.size });
		} catch {
			// missing — no-op
		}
	}
	return stats.length > 0
		? stats.map((s) => `${s.mtimeMs}:${s.size}`).join("|")
		: "missing";
}

export async function buildSessionIndex({ days }: { days?: number }): Promise<{
	groups: SessionGroup[];
	standalone: SessionSummary[];
	hasMore?: boolean;
}> {
	const dayCount = Math.max(1, Math.floor(days ?? 7));
	const cutoff = Date.now() - dayCount * 86400000;
	const dbPath = openCodeDBPath();
	// Cached index fast path — see indexCache above.
	const cacheKey = `${dayCount}|${dbFingerprint(dbPath)}`;
	const cached = indexCache.get(cacheKey);
	if (cached) return cached;

	let result: { groups: SessionGroup[]; standalone: SessionSummary[]; hasMore?: boolean };
	let db: import("bun:sqlite").Database | null = null;
	try {
		const { Database } = await import("bun:sqlite");
		db = new Database(dbPath, { readonly: true });
		// One pass over every session's first event — the window split
		// happens in JS so we never scan the (large) event table twice.
		// GROUP BY MIN is ~7x faster than the equivalent correlated subquery.
		const firstEvents = db
			.prepare(
				`SELECT
					e.aggregate_id,
					e.data
				FROM event e
				WHERE e.seq IN (SELECT MIN(seq) FROM event GROUP BY aggregate_id)
				ORDER BY e.seq DESC`,
			)
			.all() as Array<{
			aggregate_id: string;
			data: string;
		}>;
		const idToSummary = new Map<string, SessionSummary>();
		// Older-than-window signal: any session whose first event predates
		// the cutoff. Drives the renderer's "Load more" affordance.
		let hasOlder = false;
		for (const row of firstEvents) {
			let title = row.aggregate_id.slice(0, 12);
			let slug = "";
			let createdAtStr = "";
			let agentFromInfo: string | undefined;
			const durationMs = 0;
			try {
				const parsed = JSON.parse(row.data) as Record<string, unknown>;
				const info = parsed["info"] as Record<string, unknown> | undefined;
				const rawTitle = info?.["title"];
				if (typeof rawTitle === "string") {
					title = rawTitle;
				}
				const rawSlug = info?.["slug"];
				if (typeof rawSlug === "string") {
					slug = rawSlug;
				}
				const rawAgent = info?.["agent"];
				if (typeof rawAgent === "string") {
					agentFromInfo = rawAgent;
				}
				const rawTime = info?.["time"] as Record<string, unknown> | undefined;
				const rawCreated = rawTime?.["created"];
				if (typeof rawCreated === "number") {
					createdAtStr = new Date(rawCreated).toISOString();
				}
			} catch {
				// best-effort parse
			}
			// Maintain runs have their own overview tab — keep them out of Agent Sessions.
			if (isMaintainSession({ title, agent: agentFromInfo })) continue;
			// Sessions the old SQL cutoff would have dropped (no date, or
			// predating the window) never enter the list; predating ones
			// still count as "more exists".
			const createdMs = createdAtStr ? new Date(createdAtStr).getTime() : 0;
			if (!createdMs) continue;
			if (createdMs <= cutoff) {
				hasOlder = true;
				continue;
			}
			if (title.startsWith("New session")) {
				const promptText = firstUserPromptText(db, row.aggregate_id);
				if (promptText) title = promptText;
			}
			idToSummary.set(row.aggregate_id, {
				id: row.aggregate_id,
				title,
				slug,
				createdAt: createdAtStr,
				durationMs,
				eventCount: 0,
				isFinished: false,
				models: undefined,
			});
		}
		// Scope the enrichment queries to the window's sessions. The event table
		// is large (~500k rows here) and `aggregate_id` is indexed, so the
		// full-table scans with json_extract dominate buildSessionIndex's cost.
		const windowIds = Array.from(idToSummary.keys());
		const windowIdsSql =
			windowIds.length > 0
				? `(${windowIds.map((id) => JSON.stringify(id)).join(",")})`
				: null;
		// opencode stamps the session model into `session.created`/`session.updated`
		// events; the model is static per session, so any matching event suffices.
		// Scoped by type (indexed) so we don't json_extract every event of the
		// window's sessions.
		const modelRows = windowIdsSql
			? (db
					.prepare(
						`SELECT
							aggregate_id,
							json_extract(data, '$.info.model.id') AS model_id
						FROM event
						WHERE aggregate_id IN ${windowIdsSql}
							AND type IN ('session.created.1', 'session.updated.1')
							AND json_extract(data, '$.info.model.id') IS NOT NULL
						GROUP BY aggregate_id`,
					)
					.all() as Array<{ aggregate_id: string; model_id: string | null }>)
			: [];
		for (const m of modelRows) {
			const summary = idToSummary.get(m.aggregate_id);
			if (summary && m.model_id) summary.models = [m.model_id];
		}
		// Latest event time per session — the renderer's live-refresh staleness
		// signal. The processed timeline always ends in a synthetic "finished"
		// row, so the loaded state can't tell active from done; comparing the
		// summary's lastEventAt against what's loaded is what decides whether a
		// session needs re-processing (only sessions that actually grew do).
		// Fetched via the (aggregate_id, seq) index — take each session's LAST
		// event (max seq) and json_extract only that row (~50ms vs ~3.5s for
		// MAX(json_extract(...)) over every event).
		const lastEventRows = windowIdsSql
			? (db
					.prepare(
						`SELECT
							e.aggregate_id,
							json_extract(e.data, '$.info.time.created') AS last_created
						FROM event e
						WHERE (e.aggregate_id, e.seq) IN (
							SELECT aggregate_id, MAX(seq)
							FROM event
							WHERE aggregate_id IN ${windowIdsSql}
							GROUP BY aggregate_id
						)`,
					)
					.all() as Array<{ aggregate_id: string; last_created: number | null }>)
			: [];
		for (const row of lastEventRows) {
			const summary = idToSummary.get(row.aggregate_id);
			if (summary && typeof row.last_created === "number") {
				summary.lastEventAt = new Date(row.last_created).toISOString();
			}
		}
		// Parent/child grouping: the last task-tool event per child session.
		// Task events are `message.part.updated.1` in the parent's stream, so
		// scoping by type + window ids uses the (aggregate_id, type, seq) index.
		const relations = windowIdsSql
			? (db
					.prepare(
						`SELECT
							json_extract(data, '$.part.state.metadata.parentSessionId') AS parent_id,
							json_extract(data, '$.part.state.metadata.sessionId') AS child_id,
							json_extract(data, '$.part.state.status') AS status
						FROM event
						WHERE aggregate_id IN ${windowIdsSql}
							AND seq IN (
								SELECT MAX(seq)
								FROM event
								WHERE aggregate_id IN ${windowIdsSql}
									AND type = 'message.part.updated.1'
									AND json_extract(data, '$.part.tool') = 'task'
									AND json_extract(data, '$.part.state.metadata.sessionId') IS NOT NULL
								GROUP BY json_extract(data, '$.part.state.metadata.sessionId')
							)`,
					)
					.all() as Array<{ parent_id: string; child_id: string; status: string | null }>)
			: [];
		const childIds = new Set<string>();
		const groups: SessionGroup[] = [];
		for (const rel of relations) {
			if (!rel.parent_id || !rel.child_id) continue;
			const child = idToSummary.get(rel.child_id);
			if (!child) continue;
			if (rel.status === "completed" || rel.status === "error") {
				child.isFinished = true;
			}
			childIds.add(rel.child_id);
		}
		for (const summary of idToSummary.values()) {
			if (childIds.has(summary.id)) continue;
			const childList: SessionSummary[] = [];
			for (const rel of relations) {
				if (rel.parent_id === summary.id) {
					const child = idToSummary.get(rel.child_id);
					if (child) childList.push(child);
				}
			}
			if (childList.length > 0) {
				groups.push({ parent: { ...summary }, children: childList });
			}
		}
		const standalone: SessionSummary[] = [];
		for (const summary of idToSummary.values()) {
			if (childIds.has(summary.id)) continue;
			if (!groups.some((g) => g.parent.id === summary.id)) {
				standalone.push(summary);
			}
		}
		// Append Cline CLI sessions (durable transcript, not in opencode DB)
		for (const clineSession of clineReader.listSessions()) {
			const meta = clineSession.metadata;
			const promptText = cleanClinePrompt(meta.prompt ?? "");
			const title = promptText
				? promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText
				: "Cline session";
			const createdAtStr = meta.started_at ?? "";
			const durationMs = meta.ended_at
				? new Date(meta.ended_at).getTime() - new Date(meta.started_at ?? meta.ended_at).getTime()
				: 0;
			const eventCount = clineReader.readMessages(clineSession.sessionId)?.messages.length ?? 0;
			standalone.push({
				id: clineSession.sessionId,
				title,
				slug: "",
				createdAt: createdAtStr,
				lastEventAt: meta.ended_at ?? meta.started_at ?? undefined,
				durationMs,
				eventCount,
				isFinished: meta.status === "completed" || meta.status === "failed",
				models: meta.model ? [meta.model] : undefined,
				agent: "cline",
			});
		}
		// Append pi CLI sessions (durable JSONL transcript, not in opencode DB)
		for (const piSession of piReader.listSessions()) {
			const promptText = piSession.firstPrompt;
			const title = promptText
				? promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText
				: "pi session";
			const createdAtStr = piSession.header.timestamp ?? "";
			const durationMs = Math.max(0, piSession.lastActivity - new Date(createdAtStr || 0).getTime());
			standalone.push({
				id: piSession.sessionId,
				title,
				slug: "",
				createdAt: createdAtStr,
				lastEventAt: new Date(piSession.lastActivity).toISOString(),
				durationMs,
				eventCount: piSession.messageCount,
				isFinished: false,
				agent: "pi",
			});
		}
		// Append Grok Build sessions (durable updates.jsonl under ~/.grok/sessions)
		for (const grokSession of grokReader.listSessions()) {
			const createdAtStr = grokSession.createdAt ?? "";
			const durationMs = Math.max(
				0,
				grokSession.lastActivity - new Date(createdAtStr || 0).getTime(),
			);
			standalone.push({
				id: grokSession.sessionId,
				title: grokSession.title || "Grok session",
				slug: "",
				createdAt: createdAtStr,
				lastEventAt: new Date(grokSession.lastActivity).toISOString(),
				durationMs,
				eventCount: grokSession.messageCount,
				isFinished: false,
				models: grokSession.modelId ? [grokSession.modelId] : undefined,
				agent: "grok",
			});
		}
		// Append Codex durable rollout sessions (under ~/.codex/sessions).
		for (const codexSession of codexReader.listSessions()) {
			const createdAtStr =
				typeof codexSession.meta.timestamp === "string"
					? codexSession.meta.timestamp
					: new Date(codexSession.lastActivity).toISOString();
			standalone.push({
				id: codexSession.sessionId,
				title: codexSession.firstPrompt || "Codex session",
				slug: "",
				createdAt: createdAtStr,
				lastEventAt: new Date(codexSession.lastActivity).toISOString(),
				durationMs: 0,
				eventCount: codexSession.messageCount,
				isFinished: false,
				models:
					typeof codexSession.meta.model_provider === "string"
						? [codexSession.meta.model_provider]
						: undefined,
				agent: "codex",
			});
		}
		// Append Cursor IDE agent chats (under ~/.cursor/chats).
		for (const cursorSession of cursorReader.listSessions()) {
			const createdAtStr = cursorSession.createdAt || new Date(cursorSession.lastActivity).toISOString();
			const durationMs = Math.max(
				0,
				cursorSession.lastActivity - new Date(createdAtStr || 0).getTime(),
			);
			standalone.push({
				id: cursorSession.sessionId,
				title: cursorSession.title || "Cursor session",
				slug: "",
				createdAt: createdAtStr,
				lastEventAt: new Date(cursorSession.lastActivity).toISOString(),
				durationMs,
				eventCount: cursorSession.messageCount,
				isFinished: false,
				agent: "cursor",
			});
		}
		result = { groups, standalone, hasMore: hasOlder };
	} catch (err) {
		console.warn(`[principal-studio] listSessions failed: ${(err as Error).message}`);
		// Still surface durable-transcript agents when the opencode DB is missing.
		const standalone: SessionSummary[] = [];
		try {
			for (const clineSession of clineReader.listSessions()) {
				const meta = clineSession.metadata;
				const promptText = cleanClinePrompt(meta.prompt ?? "");
				const title = promptText
					? promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText
					: "Cline session";
				standalone.push({
					id: clineSession.sessionId,
					title,
					slug: "",
					createdAt: meta.started_at ?? "",
					durationMs: 0,
					eventCount: clineReader.readMessages(clineSession.sessionId)?.messages.length ?? 0,
					isFinished: meta.status === "completed" || meta.status === "failed",
					agent: "cline",
				});
			}
			for (const piSession of piReader.listSessions()) {
				const promptText = piSession.firstPrompt;
				const title = promptText
					? promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText
					: "pi session";
				standalone.push({
					id: piSession.sessionId,
					title,
					slug: "",
					createdAt: piSession.header.timestamp ?? "",
					durationMs: 0,
					eventCount: piSession.messageCount,
					isFinished: false,
					agent: "pi",
				});
			}
			for (const grokSession of grokReader.listSessions()) {
				standalone.push({
					id: grokSession.sessionId,
					title: grokSession.title || "Grok session",
					slug: "",
					createdAt: grokSession.createdAt ?? "",
					durationMs: 0,
					eventCount: grokSession.messageCount,
					isFinished: false,
					agent: "grok",
				});
			}
			for (const codexSession of codexReader.listSessions()) {
				standalone.push({
					id: codexSession.sessionId,
					title: codexSession.firstPrompt || "Codex session",
					slug: "",
					createdAt:
						typeof codexSession.meta.timestamp === "string"
							? codexSession.meta.timestamp
							: "",
					durationMs: 0,
					eventCount: codexSession.messageCount,
					isFinished: false,
					agent: "codex",
				});
			}
		} catch {
			// best-effort
		}
		result = { groups: [], standalone, hasMore: false };
	} finally {
		db?.close();
	}

	indexCache.set(cacheKey, result);
	while (indexCache.size > INDEX_CACHE_MAX) {
		const oldest = indexCache.keys().next().value;
		if (oldest === undefined) break;
		indexCache.delete(oldest);
	}
	return result;
}

/**
 * Build (or serve from cache) a session's full processed event timeline.
 * Fast-path order: disk cache → pipeline. The disk cache is the durable layer
 * (warm restarts); a miss runs normalize + accumulate and writes through so
 * later readers (the host's resident store, the warm-up worker, other RPC
 * calls) find the session already processed. This is the shared core both the
 * host's RPC path and the (future) warm-up worker call.
 */
export async function processSessionEvents(
	sessionId: string,
	opts: { includeRaw?: boolean; useCache?: boolean },
): Promise<BuiltSessionEvents> {
	const includeRaw = opts.includeRaw === true;
	const useCache = opts.useCache !== false;

	// Disk-cache fast path — serves a previously processed (trimmed) timeline
	// without re-running normalize + accumulate. Used for initial loads only:
	// live refreshes pass `useCache: false`, and the raw-feed view requests
	// `includeRaw`, which the cache never stores. Version-stamped so a pipeline
	// change invalidates all.
	if (useCache && !includeRaw) {
		const cached = readCachedSessionEvents(sessionId);
		if (cached) {
			return {
				ok: true,
				events: cached.events,
				repoRoot: cached.repoRoot,
				repos: cached.repos,
				session: cached.session,
			};
		}
	}
	// Cline CLI sessions: read the durable transcript, not the opencode DB
	if (isClineSession(sessionId)) {
		try {
			const result = await runClinePipeline(sessionId);
			if (!result) return { ok: false, error: "Cline session not found or empty" };
			return respondWithCachedPipeline(sessionId, "cline", result);
		} catch (err) {
			return { ok: false, error: (err as Error).message };
		}
	}
	// pi CLI sessions: read the durable JSONL transcript, not the opencode DB
	if (isPiSession(sessionId)) {
		try {
			const result = await runPiPipeline(sessionId);
			if (!result) return { ok: false, error: "pi session not found or empty" };
			return respondWithCachedPipeline(sessionId, "pi", result);
		} catch (err) {
			return { ok: false, error: (err as Error).message };
		}
	}
	// Grok Build sessions: read durable updates.jsonl, not the opencode DB
	if (isGrokSession(sessionId)) {
		try {
			const result = await runGrokPipeline(sessionId);
			if (!result) return { ok: false, error: "Grok session not found or empty" };
			return respondWithCachedPipeline(sessionId, "grok", result);
		} catch (err) {
			return { ok: false, error: (err as Error).message };
		}
	}
	// Codex sessions are durable rollouts, never opencode SQLite rows.
	if (isCodexSession(sessionId)) {
		try {
			const result = await runCodexPipeline(sessionId);
			if (!result) return { ok: false, error: "Codex session not found or empty" };
			return respondWithCachedPipeline(sessionId, "codex", result);
		} catch (err) {
			return { ok: false, error: (err as Error).message };
		}
	}
	// Cursor IDE chats are durable store.db transcripts, not opencode SQLite rows.
	if (isCursorSession(sessionId)) {
		try {
			const result = await runCursorPipeline(sessionId, includeRaw);
			if (!result) return { ok: false, error: "Cursor session not found or empty" };
			return respondWithCachedPipeline(sessionId, "cursor", result);
		} catch (err) {
			return { ok: false, error: (err as Error).message };
		}
	}
	// OpenCode V2: identity is a `session_v2` row; transcript is `session_message`.
	// Do not fall through to the V1 `event` path (which is empty for these).
	if (isOpencodeV2Session(sessionId)) {
		try {
			const result = await runOpencodeV2MessagePipeline(sessionId);
			if (!result) {
				return { ok: false, error: "OpenCode V2 session not found or empty" };
			}
			return respondWithCachedPipeline(sessionId, "opencode-v2", result);
		} catch (err) {
			return { ok: false, error: (err as Error).message };
		}
	}
	// OpenCode V1 sessions: raw rows in the `event` table. The full event set is
	// built once (normalize + accumulate need the whole session for correct
	// accumulated rows), cached, and served in pages so the webview never
	// receives the session's whole raw payload in one RPC message.
	const cacheKey = `opencode:${sessionId}:${includeRaw ? "raw" : "min"}`;
	let events = sessionEventsCache.get(cacheKey);
	let sessionSlug = "";
	let sessionTitle = sessionId.slice(0, 12);
	let repoRoot: string | undefined;
	let repos: RepoInfo[] = [];
	if (!events) {
		const dbPath = openCodeDBPath();
		let db: import("bun:sqlite").Database | null = null;
		try {
			const { Database } = await import("bun:sqlite");
			db = new Database(dbPath, { readonly: true });
			const rows = db
				.prepare(
					`SELECT id, aggregate_id, seq, type, data FROM event WHERE aggregate_id = ? ORDER BY seq ASC`,
				)
				.all(sessionId) as Array<{
				id: string;
				aggregate_id: string;
				seq: number;
				type: string;
				data: string;
			}>;
			// Extract session metadata from first event
			if (rows.length > 0) {
				try {
					const firstParsed = JSON.parse(rows[0].data) as Record<string, unknown>;
					const info = firstParsed["info"] as Record<string, unknown> | undefined;
					const rawTitle = info?.["title"];
					if (typeof rawTitle === "string") sessionTitle = rawTitle;
					const rawSlug = info?.["slug"];
					if (typeof rawSlug === "string") sessionSlug = rawSlug;
				} catch {
					// best-effort
				}
			}
			if (sessionTitle.startsWith("New session")) {
				const promptText = firstUserPromptText(db, sessionId);
				if (promptText) sessionTitle = promptText;
			}
			const universalEvents = opencodeRowsToUniversalEvents(
				rows.map((r) => ({ id: r.id, aggregateId: r.aggregate_id, seq: r.seq, type: r.type, data: r.data })),
			);
			const alexandriaRepos = loadAlexandriaRepos();
			const knownRoots = new Map<string, RepositoryInfo>();
			for (const [path, repo] of alexandriaRepos) {
				knownRoots.set(path, {
					root: repo.root,
					remoteUrl: repo.remoteUrl,
					owner: repo.owner,
					repo: repo.repo,
				});
			}
			const { normalized, adapter } = await normalizeEventsWithAdapter(universalEvents, "", knownRoots);
			// Auto-register any newly discovered git roots
			for (const discovered of adapter.newlyDiscovered) {
				registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
			}
			const accumulated = accumulateEvents(normalized, sessionTitle);
			const includeRawPayload = INCLUDE_RAW_EVENT_PAYLOADS || includeRaw;
			const built: SessionEventRow[] = accumulated.map((entry, i) => {
				const rawEnvelope = entry.normalized.raw as { data?: unknown; type?: string; seq?: number } | undefined;
				const seq = rawEnvelope?.seq ?? i;
				return {
					seq,
					type: rawEnvelope?.type ?? entry.normalized.eventType,
					// Full raw V1 event (id/aggregateId/seq/type/data) when the
					// session-events feed requests it — the raw column renders
					// the complete payload, not just its `data` half.
					raw: includeRawPayload ? (rawEnvelope as unknown) : undefined,
					normalized: includeRawPayload
						? (entry.normalized as unknown as Record<string, unknown>)
						: { timestamp: entry.normalized.timestamp },
					accumulated: entry.accumulated as AgentSessionEvent | null,
				};
			});
			const lastEvent = built[built.length - 1];
			if (lastEvent) {
				const lastTimestamp = (lastEvent.normalized as Record<string, unknown>)["timestamp"] as number | undefined ?? 0;
				const lastAcc = lastEvent.accumulated ?? ({} as AgentSessionEvent);
				const lastSessionName = lastAcc.sessionName ?? sessionTitle;
				const lastSessionColor = lastAcc.sessionColor ?? "";
				const lastContextTokens = lastAcc.contextTokens;
				built.push({
					seq: lastEvent.seq + 1,
					type: "finished",
					raw: null,
					normalized: { timestamp: lastTimestamp },
					accumulated: {
						id: "",
						timestamp: lastTimestamp,
						sessionId: sessionSlug,
						sessionName: lastSessionName,
						sessionColor: lastSessionColor,
						operation: "finished",
						files: [],
						dependencies: [],
						description: `${lastSessionName} finished`,
						layers: [],
						contextTokens: lastContextTokens,
					},
				});
			}
			const repoSet = new Map<string, { root: string; fileCount: number }>();
			for (const ev of normalized) {
				if (!ev.files) continue;
				for (const f of ev.files) {
					const root = f.repository?.gitRoot;
					if (root) {
						const entry = repoSet.get(root) ?? { root, fileCount: 0 };
						entry.fileCount++;
						repoSet.set(root, entry);
					}
				}
			}
			repos = collectRepositories(normalized)
				.map((r) => {
					const entry = repoSet.get(r.root);
					const parts = r.root.replace(/\/+$/, "").split("/");
					return { root: r.root, fileCount: entry?.fileCount ?? 0, owner: r.owner ?? null, name: r.repo ?? parts[parts.length - 1] ?? null, editing: false };
				})
				.sort((a, b) => b.fileCount - a.fileCount);
			repoRoot = repos.length > 0 ? repos[0].root : undefined;
			events = built;
			// Write-through the freshly processed timeline so cold starts serve
			// it from disk instead of re-running the pipeline. Trimmed form only;
			// `includeRaw` never hits this. Skip empty builds — caching a zero-
			// event V1 miss used to poison V2 sessions that share the same id
			// space once the adapter landed (disk cache is checked before kind).
			if (built.length > 0) {
				writeCachedSessionEvents(sessionId, {
					agent: "opencode",
					session: { slug: sessionSlug, title: sessionTitle, agent: "opencode" },
					repoRoot,
					repos,
					events: trimSessionEventRows(built),
				});
			}
			sessionEventsCache.set(cacheKey, events);
			// Bounded cache — raw payloads are heavy; evict oldest
			// entries once we hold more than a few sessions.
			while (sessionEventsCache.size > 4) {
				const oldestKey = sessionEventsCache.keys().next().value;
				if (oldestKey === undefined) break;
				sessionEventsCache.delete(oldestKey);
			}
		} catch (err) {
			return { ok: false, error: (err as Error).message };
		} finally {
			db?.close();
		}
	}
	return {
		ok: true,
		events,
		repoRoot,
		repos,
		session: { slug: sessionSlug, title: sessionTitle, agent: "opencode" },
	};
}
