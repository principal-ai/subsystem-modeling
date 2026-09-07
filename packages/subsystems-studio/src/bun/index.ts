/**
 * Principal Studio host (bun process).
 *
 * Boot inputs:
 *   - Trail: argv[2] / TRAIL_FILE, optional TRAIL_MODE=local|remote, and
 *     TRAIL_REPO_ROOT (default cwd).
 *   - Subsystem model: SUBSYSTEM_MODEL_ID — opens a stored model tab on cold
 *     start (used by `principal-ai subsystem-model create/open`).
 *
 * Opens an Electrobun window and exposes a tiny RPC surface to the mainview
 * so it can render trails, subsystem models, and related surfaces, and
 * resolve slice snippets.
 *
 * Slice resolution has two modes (see docs/PRINCIPAL_STUDIO_MODES.md):
 *   - 'local' (default): files come from the working tree at repoRoot.
 *   - 'remote':          files come from raw.githubusercontent.com keyed by
 *                        each repo's authored sha. Selected via TRAIL_MODE env.
 *
 * Replaces the prior OTEL events manager prototype; see git history if you
 * need that back.
 */

import {
	ApplicationMenu,
	BrowserView,
	BrowserWindow,
	Utils,
	type RPCSchema,
} from "electrobun/bun";
import { promises as fs } from "node:fs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
	extractPurlFromRemoteUrl,
	parsePurl,
} from "@principal-ai/alexandria-core-library";
import { parseTourOrThrow } from "@principal-ai/file-city-builder";
import { readFileRemote as fetchRemoteSlice } from "./remote-files";
import { handoffToRunning, startIpcServer, type LoadTrailMessage } from "./ipc";
import { startHttpServer } from "./http-server";
import { deleteSubsystemModel, getSubsystemModel, listSubsystemModels, resolveRepoRootForComponent, setSubsystemModelChangeListener, startSubsystemModelDirWatcher, subsystemModelFilePath, touchSubsystemModelOpened } from "./subsystem-model-store";
import { verifySubsystemComponent } from "./verify-subsystem-component";
import {
	getGraphifyStatus,
	getGraphifyStatusDetailed,
	installGraphify,
	isGraphifyNotInstalledError,
	resolveGraphifyBin,
	uninstallGraphify,
	updateGraphify,
} from "./graphify-runner";
import { ensureGraphifyGraph, listGraphifyGraphs, listGraphifyRepos, assessSubsystemGraphifyReadiness } from "./graphify-store";
import {
	walkLibrary,
	walkTours,
	resolveLocalRepoIdentity,
	resolveUserIdentity,
} from "./library";
import { analyses, newAnalysisId } from "./analyses";
import { savedConcepts } from "./saved";
import { runOpenCodeExtraction, writeBrief, buildBrief, getExtractionPromptInfo } from "./extraction";
import { analyzeBeats } from "./beat-analysis";
import type {
	DefaultTabFlags,
	GraphifyCliStatus,
	PayloadKind,
	RepoInfo,
	ServerSessionRow,
	SessionEventRow,
	SessionSummary,
	TabFullState,
	TabSummary,
	StudioMessages,
	StudioRequests,
	ViewerMode,
	ViewerSettings,
} from "../shared/contract";
import { resolveRepoRootFromAlexandria } from "./alexandria";
import {
	listRecentServerSessions,
	probeOpencodeServer,
	setServerEventWatch,
} from "./server-sessions";
import {
	buildSessionIndex,
	processSessionEvents,
	type BuiltSessionEvents,
	type SessionWarmupEvent,
} from "./session-pipeline";
import {
	loadViewerSettings,
	patchViewerSettings,
} from "./viewer-settings";

/**
 * Resident store — the in-memory home for the recent window's processed
 * (trimmed) session event timelines, keyed by sessionId. The Agent Sessions
 * window is small and trimmed rows are compact (timestamp + accumulated, no
 * raw/normalized payloads), so a window-sized cap is fine. Serves
 * getSessionEvents / getAgentSessionsOverview with zero I/O; hydrated from the
 * disk cache at boot and promoted on every fresh build.
 */
const residentEvents = new Map<string, ResidentSession>();
const RESIDENT_CAP = 512;

function boundResidentStore(): void {
	while (residentEvents.size > RESIDENT_CAP) {
		const oldest = residentEvents.keys().next().value;
		if (oldest === undefined) break;
		residentEvents.delete(oldest);
	}
}

/**
 * RPC-facing session loader: resident store → shared pipeline → resident
 * promotion. The disk-cache fast path and the processing pipeline live in
 * `session-pipeline.ts` (`processSessionEvents`); this host wrapper adds the
 * in-memory resident layer on top so the visible window is served with zero
 * I/O after its first build.
 */
async function buildSessionEvents(
	sessionId: string,
	opts: { includeRaw?: boolean; useCache?: boolean },
): Promise<BuiltSessionEvents> {
	const includeRaw = opts.includeRaw === true;
	const useCache = opts.useCache !== false;

	// Resident store — in-memory fast path for the visible window. Gated on
	// `useCache` like the disk path so live refreshes (`useCache: false`) always
	// re-process a growing session instead of serving a stale snapshot.
	if (useCache && !includeRaw) {
		const resident = residentEvents.get(sessionId);
		if (resident) return { ok: true, ...resident };
	}
	const res = await processSessionEvents(sessionId, { includeRaw, useCache });
	if (res.ok && !includeRaw) {
		residentEvents.set(sessionId, {
			events: res.events,
			repoRoot: res.repoRoot,
			repos: res.repos,
			session: res.session,
		});
		boundResidentStore();
	}
	return res;
}

// ---------------------------------------------------------------------------
// Background warm-up (Bun.Worker)
//
// Warm the recent session window at boot so even a cold cache is pre-built,
// WITHOUT touching this host's single-threaded event loop — in-process warm-up
// starved the webview's initial RPCs (listTabs timed out → the tab strip never
// populated). The worker is a separate thread running `session-pipeline.ts`
// directly; it writes the shared disk cache and the host reads it, so the only
// cross-thread traffic is control signals (postMessage), never event payloads.
//
// The worker is its own build artifact: `bun build` doesn't emit sibling
// chunks for `new Worker(new URL(...))`, so dev resolves the `.ts` source and
// the packaged app resolves the compiled `session-warmup-worker.js` staged
// next to `index.js` by scripts/stage-bundle.ts.
// ---------------------------------------------------------------------------

function warmupDays(): number {
	const raw = (process.env as Record<string, string | undefined>)["TRAIL_WARMUP_DAYS"];
	const n = raw ? parseInt(raw, 10) : NaN;
	return Number.isFinite(n) && n > 0 ? n : 7;
}

function warmupWorkerURL(): URL {
	// Dev runs the host as .ts; packaged builds run it as .js. The worker
	// sibling keeps the same extension so the packaged stage step can emit it.
	const ext = import.meta.url.endsWith(".ts") ? "ts" : "js";
	return new URL(`./session-warmup-worker.${ext}`, import.meta.url);
}

let warmupWorker: Worker | null = null;

// Sessions the renderer asked to live-refresh (getSessionEvents with
// `useCache: false`). When the worker reports one of these done, the host
// invalidates its resident copy (the worker's disk cache is now fresher) and
// pushes `sessionsUpdated` so the renderer re-fetches.
const requestedLiveRefresh = new Set<string>();

/** Ask the worker to re-process a set of sessions off-loop. Returns false when
 *  no worker is running (caller falls back to inline processing). */
function refreshInWorker(sessionIds: string[]): boolean {
	if (!warmupWorker) return false;
	for (const id of sessionIds) requestedLiveRefresh.add(id);
	warmupWorker.postMessage({ type: "refresh", sessionIds });
	return true;
}

/** Push a host→renderer notification that these sessions' caches are fresh. */
function broadcastSessionsUpdated(sessionIds: string[]): void {
	if (sessionIds.length === 0) return;
	try {
		(rpc.send as unknown as Record<string, (payload: unknown) => void>)[
			"sessionsUpdated"
		]({ sessionIds });
	} catch (err) {
		console.warn(`[principal-studio] could not notify renderer of session updates: ${(err as Error).message}`);
	}
}

/** Spawn the warm-up worker (once) and kick off a warmup pass. Fire-and-forget;
 *  the worker does the heavy pipeline work off this host's event loop. */
function startWarmupWorker(): void {
	if (warmupWorker) return;
	try {
		const worker = new Worker(warmupWorkerURL());
		warmupWorker = worker;
		worker.addEventListener("message", (ev: MessageEvent) => {
			const msg = ev.data as SessionWarmupEvent;
			if (msg.type === "progress") {
				// A requested live-refresh finished: drop the host's resident
				// copy so the next read hits the worker's fresh disk cache, and
				// tell the renderer to re-fetch.
				if (requestedLiveRefresh.delete(msg.sessionId)) {
					residentEvents.delete(msg.sessionId);
					broadcastSessionsUpdated([msg.sessionId]);
				}
			} else if (msg.type === "done") {
				console.log(`[principal-studio] warmup worker: ${msg.processed}/${msg.total} sessions ready`);
			} else if (msg.type === "error") {
				console.warn(`[principal-studio] warmup worker error: ${msg.message}`);
			}
		});
		worker.addEventListener("error", (err: ErrorEvent) => {
			console.warn(`[principal-studio] warmup worker failed: ${err.message}`);
			warmupWorker = null;
		});
		worker.postMessage({ type: "warmup", days: warmupDays() });
	} catch (err) {
		console.warn(`[principal-studio] could not start warmup worker: ${(err as Error).message}`);
	}
}



const LIBRARY_TAB_ID = "library";
const AGENT_SESSIONS_TAB_ID = "agent-sessions";
const SUBSYSTEMS_TAB_ID = "subsystems";
const GRAPHIFY_TAB_ID = "graphify";

/** Permanent tabs controlled by `ViewerSettings.defaultTabs`. Order here is
 *  the strip order when all are enabled. */
const PERMANENT_TAB_DEFS: Array<{
	id: string;
	kind: "agent-sessions" | "subsystems" | "graphify" | "library";
	title: string;
	flag: keyof DefaultTabFlags;
}> = [
	{
		id: AGENT_SESSIONS_TAB_ID,
		kind: "agent-sessions",
		title: "Agent Sessions",
		flag: "sessions",
	},
	{
		id: SUBSYSTEMS_TAB_ID,
		kind: "subsystems",
		title: "Subsystems",
		flag: "subsystems",
	},
	{
		id: GRAPHIFY_TAB_ID,
		kind: "graphify",
		title: "Graphify",
		flag: "graphify",
	},
	{
		id: LIBRARY_TAB_ID,
		kind: "library",
		title: "Trails",
		flag: "trails",
	},
];

function isPermanentTabId(id: string): boolean {
	return PERMANENT_TAB_DEFS.some((d) => d.id === id);
}

// ---------------------------------------------------------------------------
// CLI args / env
// ---------------------------------------------------------------------------

function resolveMode(): ViewerMode {
	const raw = process.env["TRAIL_MODE"];
	if (raw === "remote") return "remote";
	if (raw === "local" || raw === undefined || raw === "") return "local";
	console.warn(
		`[principal-studio] unknown TRAIL_MODE='${raw}', falling back to 'local'`,
	);
	return "local";
}

function resolveTrailFilePath(): string | null {
	const argPath = process.argv[2];
	const envPath = process.env["TRAIL_FILE"];
	const raw = argPath ?? envPath ?? null;
	if (!raw) return null;
	return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

function resolveRepoRoot(trailFilePath: string | null): string {
	const argRoot = process.argv[3];
	const envRoot = process.env["TRAIL_REPO_ROOT"];
	const raw = argRoot ?? envRoot;
	if (raw) return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
	// Sensible default: parent dir of the trail file. Lets `principal-ai trail
	// view` drop a json next to a repo and have things "just work".
	if (trailFilePath) return dirname(trailFilePath);
	return process.cwd();
}

// Which permanent tab the window opens on. `principal-ai agent-sessions` spawns
// with PRINCIPAL_STUDIO_START_TAB=agent-sessions so a bare launch lands straight on
// the Agent Sessions overview. Bare launches prefer Subsystems when that tab is
// enabled; otherwise the first enabled permanent tab.
function resolveStartTab(settings: ViewerSettings): string {
	const raw = process.env["PRINCIPAL_STUDIO_START_TAB"];
	if (raw && isPermanentTabId(raw)) {
		return raw;
	}
	if (settings.defaultTabs.subsystems) return SUBSYSTEMS_TAB_ID;
	const firstEnabled = PERMANENT_TAB_DEFS.find(
		(d) => settings.defaultTabs[d.flag],
	);
	return firstEnabled?.id ?? SUBSYSTEMS_TAB_ID;
}

// Per-tab state. Trail tabs are fully self-contained views of one trail; the
// library tab is a permanent first tab that lists cached trails. Tabs from
// different repos do not share env vars, repoRoot, or sandboxing.
interface TrailTabState {
	id: string;
	kind: "trail";
	title: string;
	mode: ViewerMode;
	/** Whether this tab holds a trail (`markers`/`views`) or a File City
	 *  introduction tour (`steps` + `focusDirectory`). Both render in the same
	 *  tab machinery; only the renderer's panel choice differs. */
	payloadKind: PayloadKind;
	trailFilePath: string;
	repoRoot: string;
	loaded: LoadedTrail;
	repoOwner?: string;
	repoName?: string;
	repoPurl?: string;
	ghToken?: string;
}

interface LibraryTabState {
	id: typeof LIBRARY_TAB_ID;
	kind: "library";
	title: "Trails";
}

interface AgentSessionsTabState {
	id: typeof AGENT_SESSIONS_TAB_ID;
	kind: "agent-sessions";
	title: "Agent Sessions";
}

interface SubsystemsTabState {
	id: typeof SUBSYSTEMS_TAB_ID;
	kind: "subsystems";
	title: "Subsystems";
}

interface GraphifyTabState {
	id: typeof GRAPHIFY_TAB_ID;
	kind: "graphify";
	title: "Graphify";
}

interface AnalysisTabState {
	id: string;
	kind: "analysis";
	title: string;
	analysisId: string;
}

interface SessionEventsTabState {
	id: string;
	kind: "session-events";
	title: string;
	sessionId: string;
	agent?: string;
}

interface PromptTabState {
	id: string;
	kind: "prompt";
	title: string;
}

interface SubsystemModelTabState {
	id: string;
	kind: "subsystem-model";
	title: string;
	graphId: string;
}

type TabState =
	| LibraryTabState
	| AgentSessionsTabState
	| SubsystemsTabState
	| GraphifyTabState
	| AnalysisTabState
	| SessionEventsTabState
	| PromptTabState
	| SubsystemModelTabState
	| TrailTabState;

function permanentTabState(
	def: (typeof PERMANENT_TAB_DEFS)[number],
):
	| AgentSessionsTabState
	| SubsystemsTabState
	| GraphifyTabState
	| LibraryTabState {
	if (def.kind === "agent-sessions") {
		return { id: AGENT_SESSIONS_TAB_ID, kind: "agent-sessions", title: "Agent Sessions" };
	}
	if (def.kind === "subsystems") {
		return { id: SUBSYSTEMS_TAB_ID, kind: "subsystems", title: "Subsystems" };
	}
	if (def.kind === "graphify") {
		return { id: GRAPHIFY_TAB_ID, kind: "graphify", title: "Graphify" };
	}
	return { id: LIBRARY_TAB_ID, kind: "library", title: "Trails" };
}

/**
 * Rebuild the permanent-tab prefix of `tabs` from settings. Transient tabs
 * (trails, analyses, …) are preserved after the permanent ones so strip order
 * stays stable when flags flip.
 */
function syncPermanentTabs(settings: ViewerSettings): void {
	const transient = Array.from(tabs.values()).filter(
		(t) => !isPermanentTabId(t.id),
	);
	tabs.clear();
	for (const def of PERMANENT_TAB_DEFS) {
		if (settings.defaultTabs[def.flag]) {
			tabs.set(def.id, permanentTabState(def));
		}
	}
	for (const t of transient) tabs.set(t.id, t);
	if (!tabs.has(suggestedTabId)) {
		suggestedTabId =
			Array.from(tabs.keys())[0] ??
			PERMANENT_TAB_DEFS.find((d) => settings.defaultTabs[d.flag])?.id ??
			SUBSYSTEMS_TAB_ID;
	}
}

/** Force a permanent tab into the strip (CLI ACTIVATE_TAB / START_TAB), even
 *  when settings currently hide it. Does not persist a settings change. */
function ensurePermanentTab(id: string): void {
	const def = PERMANENT_TAB_DEFS.find((d) => d.id === id);
	if (!def || tabs.has(id)) return;
	// Insert at the permanent-tab position: rebuild with this tab forced on.
	const forced: ViewerSettings = {
		defaultTabs: {
			sessions:
				id === AGENT_SESSIONS_TAB_ID || viewerSettings.defaultTabs.sessions,
			trails: id === LIBRARY_TAB_ID || viewerSettings.defaultTabs.trails,
			graphify: id === GRAPHIFY_TAB_ID || viewerSettings.defaultTabs.graphify,
			subsystems:
				id === SUBSYSTEMS_TAB_ID || viewerSettings.defaultTabs.subsystems,
		},
	};
	syncPermanentTabs(forced);
}

const tabs = new Map<string, TabState>();
let viewerSettings: ViewerSettings = loadViewerSettings();
// Which tab the host suggests showing. Not authoritative — the renderer owns
// the on-screen tab. Updated when the host creates a tab it wants visible, on
// external activation, and (as a resume point) whenever the renderer reports a
// switch via setActiveTab. Served to the renderer through listTabs so a freshly
// loaded webview resumes on the right tab.
let suggestedTabId: string = resolveStartTab(viewerSettings);
syncPermanentTabs(viewerSettings);
// CLI start-tab overrides settings for this launch so `principal-ai
// agent-sessions` still lands on Agent Sessions even if that flag is off.
{
	const start = process.env["PRINCIPAL_STUDIO_START_TAB"];
	if (start && isPermanentTabId(start) && !tabs.has(start)) {
		ensurePermanentTab(start);
		suggestedTabId = start;
	}
}
let nextTabId = 1;

// Pre-load the payload so the renderer's first read is synchronous and any
// parse error surfaces at boot rather than after the window is up.

type LoadedTrail =
	| { ok: true; payload: unknown; path: string; payloadKind: PayloadKind }
	| { ok: false; error: string; payloadKind: PayloadKind };

/**
 * Distinguish a File City introduction tour from a trail. The filename is the
 * canonical signal — the tours skill always writes `*.tour.json` — with a
 * payload-shape fallback (`steps[]` and no `markers`) for files that don't
 * carry the suffix.
 */
function detectPayloadKind(path: string, payload: unknown): PayloadKind {
	if (/\.tour\.json$/i.test(path)) return "tour";
	if (typeof payload === "object" && payload !== null) {
		const obj = payload as Record<string, unknown>;
		if (Array.isArray(obj["steps"]) && !("markers" in obj)) return "tour";
	}
	return "trail";
}

/**
 * web-ade's `/api/trails/by-id/<id>` returns a wrapper around the trail
 * payload: `{ entry, owner, repo, payload }`. Hand-authored / local files are
 * just the bare TrailPayload. Detect the wrapper and unwrap so the renderer
 * always sees `{ markers, views, ... }` directly. (Tours are handled separately
 * by `extractTourPayload`, which copes with their extra nesting.)
 */
function unwrapPayload(raw: unknown): unknown {
	if (typeof raw !== "object" || raw === null) return raw;
	const obj = raw as Record<string, unknown>;
	const inner = obj["payload"];
	if (
		typeof inner === "object" &&
		inner !== null &&
		"markers" in (inner as Record<string, unknown>)
	) {
		return inner;
	}
	return raw;
}

/**
 * Locate the renderable tour inside a cached/loaded file, coping with every
 * shape the store and CLI emit:
 *   - a bare tour                       — `{ steps, ... }`
 *   - the by-id wrapper                 — `{ owner, repo, entry, payload: <tour> }`
 *   - the newer audio envelope          — `{ ..., payload: { tour: <tour>, audio } }`
 * We pick the first object carrying a `steps[]` array. A tour authored against
 * a repo but cached without `repos[]` (the audio-envelope format drops it) is
 * repaired from the wrapper's `owner`/`repo` so strict `parseTourOrThrow`
 * validation — and the panel's repo resolution — still has a repo to anchor to.
 *
 * Returns `null` when no tour is present (the file is a trail or unrecognized).
 */
function extractTourPayload(raw: unknown): Record<string, unknown> | null {
	if (typeof raw !== "object" || raw === null) return null;
	const root = raw as Record<string, unknown>;
	const payload =
		typeof root["payload"] === "object" && root["payload"] !== null
			? (root["payload"] as Record<string, unknown>)
			: undefined;
	const nestedTour =
		payload && typeof payload["tour"] === "object" && payload["tour"] !== null
			? (payload["tour"] as Record<string, unknown>)
			: undefined;

	let tour: Record<string, unknown> | null = null;
	for (const candidate of [root, payload, nestedTour]) {
		if (candidate && Array.isArray(candidate["steps"])) {
			tour = candidate;
			break;
		}
	}
	if (!tour) return null;

	if (!Array.isArray(tour["repos"]) || (tour["repos"] as unknown[]).length === 0) {
		const owner = typeof root["owner"] === "string" ? (root["owner"] as string) : undefined;
		const name = typeof root["repo"] === "string" ? (root["repo"] as string) : undefined;
		if (owner && name) {
			tour = {
				...tour,
				repos: [
					{
						id: `pkg:github/${owner.toLowerCase()}/${name}`,
						name,
						remote: { host: "github", owner, name },
					},
				],
			};
		}
	}
	return tour;
}

function loadTrailFile(path: string | null): LoadedTrail {
	if (!path) {
		return {
			ok: false,
			error:
				"No trail file. Pass a path as the first arg or set TRAIL_FILE=<path>.",
			payloadKind: "trail",
		};
	}
	// Determine the kind first, from the file contents, so that even a tour that
	// fails to load is reported as a tour. Otherwise the renderer would fall back
	// to the trail panel and crash dereferencing `views[0]` on a tour payload.
	let json: unknown;
	try {
		json = JSON.parse(readFileSync(path, "utf8"));
	} catch (err) {
		return {
			ok: false,
			error: `Failed to load ${path}: ${(err as Error).message}`,
			payloadKind: detectPayloadKind(path, null),
		};
	}

	const tour = extractTourPayload(json);
	if (tour || /\.tour\.json$/i.test(path)) {
		if (!tour) {
			return {
				ok: false,
				error: `Failed to load ${path}: file has a .tour.json name but no tour steps`,
				payloadKind: "tour",
			};
		}
		// Validate up front so a malformed tour fails at load with a clear message
		// rather than silently rendering an idle, empty city.
		try {
			parseTourOrThrow(JSON.stringify(tour));
		} catch (err) {
			return {
				ok: false,
				error: `Failed to load ${path}: ${(err as Error).message}`,
				payloadKind: "tour",
			};
		}
		return { ok: true, payload: tour, path, payloadKind: "tour" };
	}

	return { ok: true, payload: unwrapPayload(json), path, payloadKind: "trail" };
}

/**
 * Resolve a marker's `sourcePath` against a tab's repoRoot, refusing path
 * traversal. Returns the absolute path on disk.
 */
function resolveSandboxed(repoRoot: string, rawPath: string): string {
	let cleaned = rawPath;
	if (cleaned.startsWith("/")) cleaned = cleaned.slice(1);
	if (cleaned.startsWith("GitHub/")) cleaned = cleaned.slice("GitHub/".length);
	const absolute = resolve(repoRoot, cleaned);
	if (!absolute.startsWith(repoRoot)) {
		throw new Error(`Path escapes repo root: ${rawPath}`);
	}
	return absolute;
}

/**
 * The GitHub `owner/name` a tour was authored against, read from its (possibly
 * repaired) `repos[0].remote`. `extractTourPayload` guarantees this is present
 * for every shape we accept, so it's how a library-opened tour finds its repo.
 */
function tourRepoIdentity(
	loaded: LoadedTrail,
): { owner: string; name: string } | null {
	if (!loaded.ok || typeof loaded.payload !== "object" || loaded.payload === null) {
		return null;
	}
	const repos = (loaded.payload as { repos?: unknown }).repos;
	if (!Array.isArray(repos) || repos.length === 0) return null;
	const remote = (repos[0] as { remote?: { owner?: unknown; name?: unknown } })
		.remote;
	if (typeof remote?.owner === "string" && typeof remote?.name === "string") {
		return { owner: remote.owner, name: remote.name };
	}
	return null;
}

function deriveTitle(loaded: LoadedTrail, fallbackPath: string): string {
	if (loaded.ok && typeof loaded.payload === "object" && loaded.payload !== null) {
		const t = (loaded.payload as { title?: unknown }).title;
		if (typeof t === "string" && t) return t;
	}
	const base = fallbackPath.split("/").pop() ?? fallbackPath;
	return base.replace(/\.json$/i, "");
}

function addTabFromMessage(msg: LoadTrailMessage): string {
	const trailFilePath = msg.trailFile;
	// Dedupe: re-firing the same trail (same on-disk path) focuses the existing
	// tab rather than spawning a duplicate. Closing and reopening a tab is the
	// way to force a re-load with different mode/auth.
	for (const existing of tabs.values()) {
		if (existing.kind === "trail" && existing.trailFilePath === trailFilePath) {
			suggestedTabId = existing.id;
			console.log(`[principal-studio] tab ${existing.id} focused (already open): ${trailFilePath}`);
			return existing.id;
		}
	}

	const id = String(nextTabId++);
	let loaded = loadTrailFile(trailFilePath);
	const payloadKind: PayloadKind = loaded.payloadKind;

	// Tours render against a whole working tree, not a marker-derived remote file
	// set, so they're always local. The CLI `tour view` passes the repoRoot
	// (cwd); a tour opened from the library carries none, so we resolve it from
	// the Alexandria registry by the GitHub owner/repo the tour was authored
	// against. When the registry doesn't know that repo we can't render the city,
	// so we fail the tab with a clear message rather than an empty/idle view.
	let repoRoot: string;
	if (payloadKind === "tour" && !msg.repoRoot) {
		const identity = tourRepoIdentity(loaded);
		const resolved = identity
			? resolveRepoRootFromAlexandria(identity.owner, identity.name)
			: null;
		if (resolved) {
			repoRoot = resolved;
		} else {
			repoRoot = "";
			const repoLabel = identity
				? `${identity.owner}/${identity.name}`
				: "this tour's repository";
			loaded = {
				ok: false,
				error: `We couldn't find a local checkout of ${repoLabel}. This tour renders against the repository's files, but it isn't in your Alexandria registry — open the repo once in the Principal desktop app (or clone it) and reopen the tour.`,
				payloadKind: "tour",
			};
		}
	} else {
		repoRoot = msg.repoRoot ?? dirname(trailFilePath);
	}
	const mode: ViewerMode = payloadKind === "tour" ? "local" : msg.mode;
	const tab: TabState = {
		id,
		kind: "trail",
		title: deriveTitle(loaded, trailFilePath),
		mode,
		payloadKind,
		trailFilePath,
		repoRoot,
		loaded,
		repoOwner: msg.repoOwner,
		repoName: msg.repoName,
		repoPurl: msg.repoPurl,
		ghToken: msg.ghToken,
	};
	tabs.set(id, tab);
	suggestedTabId = id;
	console.log(`[principal-studio] tab ${id} added: ${trailFilePath} (${payloadKind}, ${mode})`);
	return id;
}

/**
 * Focus or create the tab that renders a session's raw → normalized →
 * accumulated event feed. Dedupes by sessionId the way analysis tabs dedupe by
 * analysisId. Only opencode sessions are supported for now — callers check the
 * agent before invoking (the renderer disables the button for unsupported agents).
 */
function openSessionEventsTab(
	sessionId: string,
	title?: string,
	agent?: string,
): string {
	for (const existing of tabs.values()) {
		if (existing.kind === "session-events" && existing.sessionId === sessionId) {
			suggestedTabId = existing.id;
			console.log(`[principal-studio] session-events tab ${existing.id} focused (already open): ${sessionId}`);
			broadcastTabsChanged(existing.id);
			return existing.id;
		}
	}
	const id = String(nextTabId++);
	tabs.set(id, {
		id,
		kind: "session-events",
		title: `Events — ${title ?? sessionId.slice(0, 12)}`,
		sessionId,
		agent,
	});
	suggestedTabId = id;
	console.log(`[principal-studio] session-events tab ${id} added: ${sessionId}`);
	broadcastTabsChanged(id);
	return id;
}

/**
 * Focus or create the prompt tab — the surface that shows what the extractor
 * agent is asked (system prompt + task template). Deduped like analysis tabs.
 */
function openPromptTab(): string {
	for (const existing of tabs.values()) {
		if (existing.kind === "prompt") {
			suggestedTabId = existing.id;
			console.log(`[principal-studio] prompt tab ${existing.id} focused (already open)`);
			broadcastTabsChanged(existing.id);
			return existing.id;
		}
	}
	const id = String(nextTabId++);
	tabs.set(id, { id, kind: "prompt", title: "Extractor prompt" });
	suggestedTabId = id;
	console.log(`[principal-studio] prompt tab ${id} added`);
	broadcastTabsChanged(id);
	return id;
}

/**
 * Focus or create the tab that renders a session's concept analysis (the custom
 * `AnalysisView`, with concept cards + subsystem snapshots). Dedupes by
 * analysisId. This is how an analysis surfaces in our view rather than only
 * expanding inline in the guide panel.
 */
function openAnalysisTab(analysisId: string): string {
	for (const existing of tabs.values()) {
		if (existing.kind === "analysis" && existing.analysisId === analysisId) {
			suggestedTabId = existing.id;
			console.log(`[principal-studio] analysis tab ${existing.id} focused (already open): ${analysisId}`);
			broadcastTabsChanged(existing.id);
			return existing.id;
		}
	}
	const analysis = analyses.get(analysisId);
	const title = analysis?.sessionTitle
		? `Analysis — ${analysis.sessionTitle}`
		: `Analysis — ${analysisId.slice(0, 12)}`;
	const id = String(nextTabId++);
	tabs.set(id, { id, kind: "analysis", title, analysisId });
	suggestedTabId = id;
	console.log(`[principal-studio] analysis tab ${id} added: ${analysisId}`);
	broadcastTabsChanged(id);
	return id;
}

async function openSubsystemModelTab(graphId: string): Promise<string> {
	const graph = await getSubsystemModel(graphId);
	const title = graph?.title || `Subsystem Graph — ${graphId.slice(0, 12)}`;
	// Stamp last-opened once here — covers both the focus and create paths
	// below, and both the renderer RPC and the agent HTTP route funnel through
	// this function.
	await touchSubsystemModelOpened(graphId);
	for (const existing of tabs.values()) {
		if (existing.kind === "subsystem-model" && existing.graphId === graphId) {
			// Keep the label current if the graph was renamed since it opened.
			if (existing.title !== title) existing.title = title;
			suggestedTabId = existing.id;
			console.log(`[principal-studio] subsystem-model tab ${existing.id} focused (already open): ${graphId}`);
			broadcastTabsChanged(existing.id);
			return existing.id;
		}
	}
	const id = String(nextTabId++);
	tabs.set(id, { id, kind: "subsystem-model", title, graphId });
	suggestedTabId = id;
	console.log(`[principal-studio] subsystem-model tab ${id} added: ${graphId}`);
	broadcastTabsChanged(id);
	return id;
}

/** Shared by the renderer RPC and the agent HTTP route: delete a graph and
 *  close any tab rendering it so the view can't linger on a missing record. */
async function deleteGraphAndCloseTabs(graphId: string): Promise<{ ok: boolean; error?: string }> {
	for (const tab of Array.from(tabs.values())) {
		if (tab.kind === "subsystem-model" && tab.graphId === graphId) {
			closeTabById(tab.id);
		}
	}
	const deleted = await deleteSubsystemModel(graphId);
	return deleted
		? { ok: true }
		: { ok: false, error: `unknown graph: ${graphId}` };
}

async function walkFiles(
	root: string,
): Promise<Array<{ path: string; size: number }>> {
	const out: Array<{ path: string; size: number }> = [];
	async function walk(dir: string, rel: string): Promise<void> {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === ".git" || entry.name === "node_modules") continue;
			if (entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			const relPath = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				await walk(full, relPath);
			} else if (entry.isFile()) {
				try {
					const stat = await fs.stat(full);
					out.push({ path: relPath, size: stat.size });
				} catch {
					// skip unreadable
				}
			}
		}
	}
	await walk(root, "");
	return out;
}

// ---------------------------------------------------------------------------
// RPC schema + handlers
// ---------------------------------------------------------------------------

// The request/message schemas + all payload types (TabSummary, TabFullState,
// SessionSummary, SessionGroup, SessionEventRow, RepoInfo, LibraryEntry,
// UserIdentity, ViewerMode, PayloadKind) live in src/shared/contract.ts — the
// single cross-process contract both this host and the renderer import.
type StudioRPC = {
	bun: RPCSchema<{
		requests: StudioRequests;
		messages: StudioMessages;
	}>;
	webview: RPCSchema<{
		requests: Record<string, never>;
		messages: Record<string, never>;
	}>;
};

function getTab(id: string): TabState | null {
	return tabs.get(id) ?? null;
}

async function readFileLocal(tab: TrailTabState, path: string): Promise<{ ok: boolean; content?: string; error?: string }> {
	try {
		const absolute = resolveSandboxed(tab.repoRoot, path);
		const content = await fs.readFile(absolute, "utf8");
		return { ok: true, content };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}

async function readFileRemote(tab: TrailTabState, path: string, repo?: string): Promise<{ ok: boolean; content?: string; error?: string }> {
	if (!tab.loaded.ok) return { ok: false, error: tab.loaded.error };
	return fetchRemoteSlice(
		tab.loaded.payload,
		{
			ghToken: tab.ghToken,
			fallbackOwner: tab.repoOwner,
			fallbackName: tab.repoName,
			fallbackPurl: tab.repoPurl,
		},
		path,
		repo,
	);
}

async function getFileTreeRemote(tab: TrailTabState): Promise<{ files: Array<{ path: string; size: number }> }> {
	if (!tab.loaded.ok || typeof tab.loaded.payload !== "object" || tab.loaded.payload === null) {
		return { files: [] };
	}
	const markers = (tab.loaded.payload as { markers?: Array<{ sourcePath?: unknown }> }).markers;
	if (!Array.isArray(markers)) return { files: [] };

	const seen = new Set<string>();
	const files: Array<{ path: string; size: number }> = [];
	for (const marker of markers) {
		const raw = marker?.sourcePath;
		if (typeof raw !== "string" || !raw) continue;
		const cleaned = raw.replace(/^\/+/, "").replace(/^GitHub\//, "");
		if (!cleaned || cleaned.includes("..")) continue;
		if (seen.has(cleaned)) continue;
		seen.add(cleaned);
		files.push({ path: cleaned, size: 0 });
	}
	return { files };
}

/**
 * Apply a mutation to the trail's `notes[]` and persist it back to disk.
 *
 * Re-reads the file each call so a concurrent rewrite (e.g. the same trail
 * being edited via another tool's MCP bridge while a tab is open) doesn't get
 * clobbered by stale in-memory state. The `{ entry, payload }` wrapper from
 * web-ade fetches is preserved on write — we only ever mutate the inner
 * payload's `notes` field.
 *
 * On success, also patches `tab.loaded.payload.notes` so subsequent
 * snippet/file-tree resolvers see the new notes array without a reload.
 */
function persistNoteMutation<T>(
	tab: TrailTabState,
	mutate: (notes: unknown[]) => { notes: unknown[]; result: T },
): { ok: true; result: T } | { ok: false; error: string } {
	try {
		const raw = readFileSync(tab.trailFilePath, "utf8");
		const root = JSON.parse(raw) as Record<string, unknown>;
		const wrappedInner =
			typeof root["payload"] === "object" &&
			root["payload"] !== null &&
			"markers" in (root["payload"] as Record<string, unknown>)
				? (root["payload"] as Record<string, unknown>)
				: null;
		const inner = wrappedInner ?? root;
		const existing = Array.isArray(inner["notes"]) ? (inner["notes"] as unknown[]) : [];
		const { notes, result } = mutate(existing);
		inner["notes"] = notes;
		writeFileSync(tab.trailFilePath, `${JSON.stringify(root, null, 2)}\n`, "utf8");
		if (tab.loaded.ok && typeof tab.loaded.payload === "object" && tab.loaded.payload !== null) {
			(tab.loaded.payload as Record<string, unknown>)["notes"] = notes;
		}
		return { ok: true, result };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}

/**
 * Set `payload.share = { id }` on the trail file. Mirrors `persistNoteMutation`'s
 * wrapper-preserving write: re-reads from disk, unwraps `{ entry, payload }`
 * when present, writes the updated root back. Also patches `tab.loaded.payload`
 * so the renderer's next slice fetch sees the new share field without needing
 * a tab reload.
 */
function persistShareMutation(
	tab: TrailTabState,
	share: { id: string },
): { ok: true } | { ok: false; error: string } {
	try {
		const raw = readFileSync(tab.trailFilePath, "utf8");
		const root = JSON.parse(raw) as Record<string, unknown>;
		const wrappedInner =
			typeof root["payload"] === "object" &&
			root["payload"] !== null &&
			"markers" in (root["payload"] as Record<string, unknown>)
				? (root["payload"] as Record<string, unknown>)
				: null;
		const inner = wrappedInner ?? root;
		inner["share"] = share;
		writeFileSync(tab.trailFilePath, `${JSON.stringify(root, null, 2)}\n`, "utf8");
		if (tab.loaded.ok && typeof tab.loaded.payload === "object" && tab.loaded.payload !== null) {
			(tab.loaded.payload as Record<string, unknown>)["share"] = share;
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}



/**
 * Permanent, non-trail tabs (library, agent sessions, subsystems).
 * They carry no trail payload and don't serve files or notes; several RPC
 * handlers use this to reject calls aimed at trail-only state.
 */
function isStaticTab(
	tab: TabState,
): tab is LibraryTabState | AgentSessionsTabState | SubsystemsTabState | GraphifyTabState {
	return (
		tab.kind === "library" ||
		tab.kind === "agent-sessions" ||
		tab.kind === "subsystems" ||
		tab.kind === "graphify"
	);
}

function summarize(tab: TabState): TabSummary {
	if (tab.kind === "analysis") {
		return { id: tab.id, kind: "analysis", title: tab.title };
	}
	if (tab.kind === "session-events") {
		return { id: tab.id, kind: "session-events", title: tab.title };
	}
	if (tab.kind === "prompt") {
		return { id: tab.id, kind: "prompt", title: tab.title };
	}
	if (tab.kind === "subsystem-model") {
		return {
			id: tab.id,
			kind: "subsystem-model",
			title: tab.title,
			path: subsystemModelFilePath(tab.graphId),
		};
	}
	if (isStaticTab(tab)) {
		return { id: tab.id, kind: tab.kind, title: tab.title };
	}
	return {
		id: tab.id,
		kind: "trail",
		title: tab.title,
		mode: tab.mode,
		payloadKind: tab.payloadKind,
	};
}

function fullState(tab: TabState): TabFullState {
	if (tab.kind === "analysis") {
		return {
			ok: true,
			id: tab.id,
			kind: "analysis",
			title: tab.title,
			analysisId: tab.analysisId,
			payload: analyses.get(tab.analysisId) ?? null,
		};
	}
	if (tab.kind === "session-events") {
		return {
			ok: true,
			id: tab.id,
			kind: "session-events",
			title: tab.title,
			sessionId: tab.sessionId,
		};
	}
	if (tab.kind === "prompt") {
		return {
			ok: true,
			id: tab.id,
			kind: "prompt",
			title: tab.title,
			payload: getExtractionPromptInfo(),
		};
	}
	if (tab.kind === "subsystem-model") {
		return {
			ok: true,
			id: tab.id,
			kind: "subsystem-model",
			title: tab.title,
			graphId: tab.graphId,
		};
	}
	if (isStaticTab(tab)) {
		return { ok: true, id: tab.id, kind: tab.kind, title: tab.title };
	}
	if (!tab.loaded.ok) {
		return {
			ok: false,
			error: tab.loaded.error,
			id: tab.id,
			kind: "trail",
			title: tab.title,
			mode: tab.mode,
			payloadKind: tab.payloadKind,
			repoRoot: tab.repoRoot,
			trailFilePath: tab.trailFilePath,
		};
	}
	// Resolve repo identity the same way the library listing does: prefer an
	// explicit owner/name carried by the open message (web-ade / remote trails),
	// otherwise recover it from the working tree's git origin. This is what lets
	// the tab header show `owner/name` (+ GitHub link) for local trails instead
	// of `local / <path>`.
	const identity =
		tab.repoOwner && tab.repoName
			? { owner: tab.repoOwner, repo: tab.repoName }
			: resolveLocalRepoIdentity(tab.repoRoot);
	return {
		ok: true,
		id: tab.id,
		kind: "trail",
		title: tab.title,
		mode: tab.mode,
		payloadKind: tab.payloadKind,
		repoRoot: tab.repoRoot,
		trailFilePath: tab.trailFilePath,
		payload: tab.loaded.payload,
		owner: identity.owner,
		repo: identity.repo,
	};
}

/** Handler-map type derived from the RPC contract — restores the contextual
 *  typing the handlers lost when the object was hoisted out of defineRPC. */
type RequestHandlers = {
	[K in keyof StudioRequests]: (
		params: StudioRequests[K]["params"],
	) => StudioRequests[K]["response"] | Promise<StudioRequests[K]["response"]>;
};

/** The resident store's value — the trimmed events plus the metadata the RPC
 *  responses carry, so a memory hit needs no extra reads. */
interface ResidentSession {
	events: SessionEventRow[];
	repoRoot?: string;
	repos: RepoInfo[];
	session: { slug: string; title: string; agent?: string };
}

/**
 * Build the recent-session index: opencode sqlite (window-filtered, with
 * parent/child grouping) plus durable-transcript agents (cline/pi/grok/codex).
 * Shared by the listSessions RPC and the warm-up worker.
 */

const requests: RequestHandlers = {
			listTabs: () => ({
				tabs: Array.from(tabs.values()).map(summarize),
				suggestedActiveTabId: suggestedTabId,
			}),
			getTab: ({ id }) => {
				const tab = getTab(id);
				if (!tab) {
					return {
						ok: false,
						error: `unknown tab: ${id}`,
						id,
						kind: "trail",
						title: "",
					};
				}
				return fullState(tab);
			},
			setActiveTab: ({ id }) => {
				// The renderer owns the on-screen tab and switches instantly; this
				// just records the switch as the host's resume suggestion (served
				// back through listTabs if the webview reloads). No broadcast — the
				// renderer already applied the change locally.
				if (!tabs.has(id)) return { ok: false, error: `unknown tab: ${id}` };
				suggestedTabId = id;
				return { ok: true };
			},
			closeTab: ({ id }) => closeTabById(id),
			readFile: async ({ tabId, path, repo }) => {
				const tab = getTab(tabId);
				if (!tab) return { ok: false, error: `unknown tab: ${tabId}` };
				if (tab.kind === "subsystem-model") {
					// Graph components carry repo-relative paths; reads are
					// sandboxed to the repo's recorded local root (opt-in —
					// graphs posted without roots don't serve files). Multi-repo
					// graphs resolve each file against the root of the
					// component's own purl before falling back to `repoRoot`.
					const graph = await getSubsystemModel(tab.graphId);
					const component = graph?.components.find((c) => c.file === path);
					const root = graph && component
						? resolveRepoRootForComponent(graph, component.purl)
						: graph?.repoRoot;
					if (!root) return { ok: false, error: "graph has no local root for this file" };
					try {
						const absolute = resolveSandboxed(root, path);
						const content = await fs.readFile(absolute, "utf8");
						return { ok: true, content };
					} catch (err) {
						return { ok: false, error: (err as Error).message };
					}
				}
				if (tab.kind === "library" || tab.kind === "agent-sessions" || tab.kind === "subsystems" || tab.kind === "graphify" || tab.kind === "analysis" || tab.kind === "session-events" || tab.kind === "prompt") {
					return { ok: false, error: `${tab.kind} tab does not serve files` };
				}
				return tab.mode === "remote"
					? readFileRemote(tab, path, repo)
					: readFileLocal(tab, path);
			},
			getFileTree: async ({ tabId, path }) => {
				const walkPath = path ?? null;
				if (!walkPath) {
					const tab = getTab(tabId);
					if (!tab || tab.kind === "library" || tab.kind === "agent-sessions" || tab.kind === "subsystems" || tab.kind === "graphify" || tab.kind === "analysis" || tab.kind === "session-events" || tab.kind === "prompt" || tab.kind === "subsystem-model") return { files: [] };
					return tab.mode === "remote"
						? getFileTreeRemote(tab)
						: { files: await walkFiles(tab.repoRoot) };
				}
				return { files: await walkFiles(walkPath) };
			},
			listTrails: async () => {
				// Merge cached trails and tours into one mtime-sorted list; each row
				// carries a `kind` so the renderer badges and opens it correctly.
				const [trails, tours] = await Promise.all([
					walkLibrary(),
					walkTours(),
				]);
				const entries = [...trails, ...tours].sort(
					(a, b) => b.mtimeMs - a.mtimeMs,
				);
				return { entries };
			},
			listSessions: async ({ days }) => buildSessionIndex({ days }),

			createTrailNote: ({ tabId, draft }) => {
				const tab = getTab(tabId);
				if (!tab || tab.kind === "library" || tab.kind === "agent-sessions" || tab.kind === "subsystems" || tab.kind === "graphify" || tab.kind === "analysis" || tab.kind === "session-events" || tab.kind === "prompt" || tab.kind === "subsystem-model") {
					return { ok: false, error: `unknown trail tab: ${tabId}` };
				}
				if (tab.payloadKind === "tour") {
					return { ok: false, error: "tours do not support notes" };
				}
				if (typeof draft !== "object" || draft === null) {
					return { ok: false, error: "draft must be an object" };
				}
				const now = new Date().toISOString();
				const note = {
					...(draft as Record<string, unknown>),
					id: randomUUID(),
					createdAt: now,
					updatedAt: now,
				};
				const outcome = persistNoteMutation(tab, (notes) => ({
					notes: [...notes, note],
					result: note,
				}));
				if (!outcome.ok) return { ok: false, error: outcome.error };
				return { ok: true, note: outcome.result };
			},
			updateTrailNote: ({ tabId, noteId, body }) => {
				const tab = getTab(tabId);
				if (!tab || tab.kind === "library" || tab.kind === "agent-sessions" || tab.kind === "subsystems" || tab.kind === "graphify" || tab.kind === "analysis" || tab.kind === "session-events" || tab.kind === "prompt" || tab.kind === "subsystem-model") {
					return { ok: false, error: `unknown trail tab: ${tabId}` };
				}
				if (tab.payloadKind === "tour") {
					return { ok: false, error: "tours do not support notes" };
				}
				const now = new Date().toISOString();
				let updated: unknown = null;
				const outcome = persistNoteMutation(tab, (notes) => {
					const next = notes.map((n) => {
						if (typeof n !== "object" || n === null) return n;
						const obj = n as Record<string, unknown>;
						if (obj["id"] !== noteId) return n;
						const patched = { ...obj, body, updatedAt: now };
						updated = patched;
						return patched;
					});
					return { notes: next, result: updated };
				});
				if (!outcome.ok) return { ok: false, error: outcome.error };
				if (!outcome.result) return { ok: false, error: `note not found: ${noteId}` };
				return { ok: true, note: outcome.result };
			},
			openExternal: ({ url }) => {
				if (url.startsWith("debug:")) {
					console.log("[scroll-debug] " + url.slice(6));
					return { ok: true };
				}
				// Hand-off to the OS shell. The webview never navigates externally —
				// we always route through this so https links open in the user's
				// browser rather than replacing the viewer's view stack.
				const ok = Utils.openExternal(url);
				return { ok };
			},
			openFile: ({ purl }) => {
				const parsed = parsePurl(purl);
				const owner = parsed?.namespace;
				const name = parsed?.name;
				const subpath = parsed?.subpath;
				if (!owner || !name || !subpath) {
					return {
						ok: false,
						error: "expected pkg:<type>/<owner>/<name>#<path>",
					};
				}
				const rel = safeSubpath(subpath);
				if (rel === null) {
					return { ok: false, error: "unsafe file path in purl" };
				}
				// Prefer the Alexandria registry: if owner/name maps to a local
				// clone on disk, open the file there.
				const root = resolveRepoRootFromAlexandria(owner, name);
				if (root) {
					const abs = join(root, rel);
					if (existsSync(abs)) {
						Utils.openExternal(`file://${abs}`);
						return { ok: true };
					}
				}
				// Fallback: open on GitHub (default branch "main"; a 404 shows
				// GitHub's own navigate-to-default-branch affordance).
				const url = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob/main/${rel
					.split("/")
					.map(encodeURIComponent)
					.join("/")}`;
				Utils.openExternal(url);
				return { ok: true };
			},
			getUserIdentity: async () => {
				// Source repoRoot/token from a trail tab (the suggested/active one
				// first, else any) for the git/token fallbacks. The gh-CLI path
				// needs neither.
				const active = getTab(suggestedTabId);
				const trailTab =
					active && active.kind === "trail"
						? active
						: (Array.from(tabs.values()).find(
								(t): t is TrailTabState => t.kind === "trail",
						  ) ?? null);
				return resolveUserIdentity(trailTab?.repoRoot, trailTab?.ghToken);
			},
			getSettings: () => viewerSettings,
			setSettings: ({ settings }) => {
				viewerSettings = patchViewerSettings(viewerSettings, settings);
				const prevSuggested = suggestedTabId;
				syncPermanentTabs(viewerSettings);
				broadcastTabsChanged(
					suggestedTabId !== prevSuggested ? suggestedTabId : undefined,
				);
				return { ok: true, settings: viewerSettings };
			},
			getOpencodeServerStatus: async () => probeOpencodeServer(),
			getServerSessions: async () => listRecentServerSessions(),
			setServerEventWatch: async ({ active }) => {
				setServerEventWatch(active, active ? broadcastServerEvents : undefined);
				return { ok: true };
			},
			shareTrail: ({ tabId }) => {
				const tab = getTab(tabId);
				if (!tab || tab.kind === "library" || tab.kind === "agent-sessions" || tab.kind === "subsystems" || tab.kind === "graphify" || tab.kind === "analysis" || tab.kind === "session-events" || tab.kind === "prompt" || tab.kind === "subsystem-model") {
					return { ok: false, error: `unknown trail tab: ${tabId}` };
				}
				if (tab.payloadKind === "tour") {
					return { ok: false, error: "tours cannot be shared" };
				}
				// 1. Sniff the GitHub remote from the working tree. The publish
				//    endpoint gates by `<owner>/<repo>` access; without a remote we
				//    have no identity to publish under.
				const gitResult = spawnSync(
					"git",
					["-C", tab.repoRoot, "remote", "get-url", "origin"],
					{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
				);
				const remoteUrl = gitResult.stdout?.trim() ?? "";
				if (gitResult.status !== 0 || !remoteUrl) {
					return {
						ok: false,
						error: `No git origin remote at ${tab.repoRoot}. Add one pointing at GitHub before sharing.`,
					};
				}
				const purl = extractPurlFromRemoteUrl(remoteUrl);
				const parsed = purl ? parsePurl(purl) : null;
				if (!parsed || parsed.type !== "github" || !parsed.namespace) {
					return {
						ok: false,
						error: `Publishing requires a GitHub remote. Current origin: ${remoteUrl}`,
					};
				}
				const owner = parsed.namespace;
				const repo = parsed.name;

				// 2. Shell out to the published CLI to publish. Keeps token
				//    resolution (gh / git credential helper) and the POST in one
				//    place; we just orchestrate. `PRINCIPAL_AI_CLI` overrides the
				//    npx fallback for local dev where iterating on the CLI matters.
				const cliOverride = process.env["PRINCIPAL_AI_CLI"];
				const [command, baseArgs] = cliOverride
					? [cliOverride, [] as string[]]
					: ["npx", ["-y", "@principal-ai/principal-studio-cli@latest"]];
				const publishResult = spawnSync(
					command,
					[
						...baseArgs,
						"trail",
						"publish",
						tab.trailFilePath,
						"--owner",
						owner,
						"--repo",
						repo,
					],
					{
						encoding: "utf8",
						stdio: ["ignore", "pipe", "pipe"],
						cwd: tab.repoRoot,
					},
				);
				if (publishResult.status !== 0) {
					const stderr = publishResult.stderr?.trim();
					return {
						ok: false,
						error: stderr || `Publish failed (exit ${publishResult.status})`,
					};
				}
				const shareUrl = publishResult.stdout?.trim() ?? "";
				const idMatch = shareUrl.match(/\/trail\/([^/?#]+)/);
				if (!shareUrl || !idMatch) {
					return {
						ok: false,
						error: `Publish succeeded but returned an unparseable URL: '${shareUrl}'`,
					};
				}
				const shareId = idMatch[1]!;

				// 3. Persist `share: { id }` back to the trail JSON. The renderer
				//    swaps the header chrome based on this — and the next tab open
				//    will read the persisted value from disk.
				const outcome = persistShareMutation(tab, { id: shareId });
				if (!outcome.ok) return { ok: false, error: outcome.error };

				return { ok: true, shareId, shareUrl };
			},
			deleteTrailNote: ({ tabId, noteId }) => {
				const tab = getTab(tabId);
				if (!tab || tab.kind === "library" || tab.kind === "agent-sessions" || tab.kind === "subsystems" || tab.kind === "graphify" || tab.kind === "analysis" || tab.kind === "session-events" || tab.kind === "prompt" || tab.kind === "subsystem-model") {
					return { ok: false, error: `unknown trail tab: ${tabId}` };
				}
				if (tab.payloadKind === "tour") {
					return { ok: false, error: "tours do not support notes" };
				}
				const outcome = persistNoteMutation(tab, (notes) => {
					const next = notes.filter((n) => {
						if (typeof n !== "object" || n === null) return true;
						return (n as Record<string, unknown>)["id"] !== noteId;
					});
					return { notes: next, result: undefined };
				});
				if (!outcome.ok) return { ok: false, error: outcome.error };
				return { ok: true };
			},
			openTrailFromCache: async ({ trailFile, mode, repoRoot }) => {
				try {
					// Default mode: `local` when the caller (library tab) has resolved
					// a working tree on disk, otherwise `remote`. Local trails carry no
					// `repos[].remote`, so remote mode is guaranteed to fail snippet
					// fetches; the library row decides which it is and passes both.
					const resolvedMode = mode ?? (repoRoot ? "local" : "remote");
					const msg: LoadTrailMessage = {
						kind: "LOAD_TRAIL",
						trailFile,
						mode: resolvedMode,
					};
					if (repoRoot) msg.repoRoot = repoRoot;
					const tabId = addTabFromMessage(msg);
					broadcastTabsChanged(tabId);
					try {
						browserWindow.focus();
					} catch {
						// non-fatal
					}
					return { ok: true, tabId };
				} catch (err) {
					return { ok: false, error: (err as Error).message };
				}
			},
			getSessionEvents: async ({ sessionId, includeRaw, offset, limit, useCache }) => {
				// A live refresh (`useCache: false`) no longer re-processes on
				// this host's event loop: serve the current cache for the
				// immediate response and kick the warm-up worker to re-process
				// off-loop. When it finishes, `sessionsUpdated` tells the
				// renderer to re-fetch the fresh cache. Falls back to inline
				// processing if no worker is running.
				const wantLive = useCache === false && !includeRaw;
				let built = await buildSessionEvents(sessionId, {
					includeRaw,
					useCache: wantLive ? true : useCache,
				});
				if (built.ok && wantLive && !refreshInWorker([sessionId])) {
					const live = await processSessionEvents(sessionId, {
						includeRaw: false,
						useCache: false,
					});
					if (live.ok) built = live;
				}
				if (!built.ok) return { ok: false, error: built.error };
				const total = built.events.length;
				const start = Math.max(0, offset ?? 0);
				const end = limit !== undefined ? Math.min(total, start + limit) : total;
				return {
					ok: true,
					events: built.events.slice(start, end),
					total,
					hasMore: end < total,
					repoRoot: built.repoRoot,
					repos: built.repos,
					session: built.session,
				};
			},

			getAgentSessionsOverview: async ({ days }) => {
				try {
					const index = await buildSessionIndex({ days });
					const sessions: SessionSummary[] = [];
					for (const g of index.groups) sessions.push(g.parent);
					sessions.push(...index.standalone);
					const processed: Array<{
						id: string;
						agent: string;
						session: { slug: string; title: string; agent?: string };
						repoRoot?: string;
						repos: RepoInfo[];
						events: SessionEventRow[];
					}> = [];
					for (const s of sessions) {
						const res = await buildSessionEvents(s.id, { includeRaw: false, useCache: true });
						if (res.ok) {
							processed.push({
								id: s.id,
								agent: res.session.agent ?? s.agent ?? "opencode",
								session: res.session,
								repoRoot: res.repoRoot,
								repos: res.repos,
								events: res.events,
							});
						}
					}
					return {
						ok: true,
						groups: index.groups,
						standalone: index.standalone,
						hasMore: index.hasMore,
						processed,
					};
				} catch (err) {
					return {
						ok: false,
						error: (err as Error).message,
						groups: [],
						standalone: [],
						processed: [],
					};
				}
			},

			listAnalyses: async () => {
				return { analyses: analyses.summaries() };
			},
			listAnalysesFull: async () => {
				return { analyses: analyses.list() };
			},
			listSavedConcepts: async () => {
				return { concepts: savedConcepts.list() };
			},
			saveConcept: async ({ analysisId, conceptId }) => {
				const analysis = analyses.get(analysisId);
				if (!analysis) {
					return { ok: false, error: `unknown analysis: ${analysisId}` };
				}
				const concept = analysis.concepts.find((c) => c.id === conceptId);
				if (!concept) {
					return {
						ok: false,
						error: `concept ${conceptId} not found in analysis ${analysisId}`,
					};
				}
				const savedConceptId = `saved-${analysisId}-${conceptId}`;
				const existing = savedConcepts.get(savedConceptId);
				if (existing) return { ok: true, savedConcept: existing };
				const saved = savedConcepts.save({
					...concept,
					savedConceptId,
					source: "analysis",
					sourceAnalysisId: analysis.id,
					sourceSessionId: analysis.sessionId,
					savedAt: new Date().toISOString(),
				});
				broadcastTabsChanged();
				return { ok: true, savedConcept: saved };
			},
			unsaveConcept: async ({ savedConceptId }) => {
				savedConcepts.remove(savedConceptId);
				broadcastTabsChanged();
				return { ok: true };
			},
			deleteAnalysis: async ({ analysisId }) => {
				// Close any analysis tab still wired to the record, then drop the
				// record itself. Saved concepts copied out of it are unaffected.
				for (const tab of Array.from(tabs.values())) {
					if (tab.kind === "analysis" && tab.analysisId === analysisId) {
						tabs.delete(tab.id);
						if (suggestedTabId === tab.id) {
							const remaining = Array.from(tabs.keys());
							suggestedTabId = remaining[remaining.length - 1] ?? LIBRARY_TAB_ID;
						}
					}
				}
				const removed = analyses.remove(analysisId);
				broadcastTabsChanged();
				return { ok: removed, error: removed ? undefined : `unknown analysis: ${analysisId}` };
			},
			getSubsystemModel: async ({ graphId }) => {
				const graph = await getSubsystemModel(graphId);
				if (!graph) return { ok: false, error: `unknown graph: ${graphId}` };
				return { ok: true, graph };
			},
			listSubsystemModels: async () => {
				const entries = await listSubsystemModels();
				const graphs = await Promise.all(
					entries.map(async (e) => {
						const full = await getSubsystemModel(e.id);
						const graphify = full
							? assessSubsystemGraphifyReadiness(full, graphifyBuildingPurls)
							: undefined;
						return {
							id: e.id,
							title: e.title,
							description: e.description,
							componentCount: e.componentCount,
							edgeCount: e.edgeCount,
							createdAt: e.createdAt,
							updatedAt: e.updatedAt,
							lastOpenedAt: e.lastOpenedAt,
							source: e.source,
							repo: e.repo,
							path: subsystemModelFilePath(e.id),
							graphify,
						};
					}),
				);
				return { graphs };
			},
			openSubsystemModel: async ({ graphId }) => {
				const graph = await getSubsystemModel(graphId);
				if (!graph) return { ok: false, error: `unknown graph: ${graphId}` };
				const tabId = await openSubsystemModelTab(graphId);
				return { ok: true, tabId };
			},
			deleteSubsystemModel: async ({ graphId }) => deleteGraphAndCloseTabs(graphId),
			verifySubsystemComponent: async ({ graphId, componentId }) =>
				verifySubsystemComponent(graphId, componentId),
			getGraphifyStatus: async ({ detailed }) => {
				const base = withGraphifyCliBusy(
					cachedDetailedGraphifyStatus ?? getGraphifyStatus(),
				);
				if (detailed) {
					refreshGraphifyStatusDetailed();
				}
				return base;
			},
			listGraphifyGraphs: async () => {
				const entries = await listGraphifyGraphs();
				return {
					graphs: entries.map((e) => ({
						purl: e.purl,
						purlKey: e.purlKey,
						headSha: e.headSha,
						dirtyHash: e.dirtyHash,
						slotKey: e.slotKey,
						repoRoot: e.repoRoot,
						builtAt: e.builtAt,
						nodeCount: e.nodeCount,
						edgeCount: e.edgeCount,
						graphJsonPath: e.graphJsonPath,
					})),
				};
			},
			listGraphifyRepos: async () => ({
				repos: await listGraphifyRepos(undefined, graphifyBuildingPurls),
				graphify: withGraphifyCliBusy(
					cachedDetailedGraphifyStatus ?? getGraphifyStatus(),
				),
			}),
			ensureGraphifyGraph: async ({ purl, repoRoot, force }) => {
				if (!resolveGraphifyBin()) {
					const st = getGraphifyStatus();
					return {
						ok: false,
						error: "graphify CLI not found",
						code: "graphify_not_installed",
						installCommand: st.installCommand,
					};
				}
				const key = purl.trim();
				if (graphifyBuildingPurls.has(key)) {
					return { ok: true, status: "building", purl: key };
				}

				graphifyBuildingPurls.add(key);
				broadcastGraphifyChanged({ kind: "repos" });

				const work = ensureGraphifyGraph({ purl: key, repoRoot, force });
				const raced = await Promise.race([
					work.then((r) => ({ done: true as const, r })),
					sleepMs(250).then(() => ({ done: false as const })),
				]);

				if (raced.done) {
					graphifyBuildingPurls.delete(key);
					const result = raced.r;
					if (!result.ok) {
						const notInstalled = isGraphifyNotInstalledError(result.error);
						broadcastGraphifyChanged({
							kind: "ensure",
							purl: key,
							ensure: {
								ok: false,
								error: result.error,
								code: notInstalled ? "graphify_not_installed" : "ensure_failed",
								durationMs: result.durationMs,
							},
						});
						return {
							ok: false,
							error: result.error,
							code: notInstalled ? "graphify_not_installed" : "ensure_failed",
							installCommand: notInstalled
								? getGraphifyStatus().installCommand
								: undefined,
							durationMs: result.durationMs,
						};
					}
					broadcastGraphifyChanged({
						kind: "ensure",
						purl: key,
						ensure: {
							ok: true,
							status: result.status,
							nodeCount: result.nodeCount,
							edgeCount: result.edgeCount,
							durationMs: result.durationMs,
						},
					});
					return {
						ok: true,
						status: result.status,
						purl: result.purl,
						headSha: result.headSha,
						dirtyHash: result.dirtyHash,
						slotKey: result.slotKey,
						repoRoot: result.repoRoot,
						graphJsonPath: result.graphJsonPath,
						nodeCount: result.nodeCount,
						edgeCount: result.edgeCount,
						durationMs: result.durationMs,
					};
				}

				// Extract outlives the RPC window — finish in background.
				void work
					.then((result) => {
						graphifyBuildingPurls.delete(key);
						if (!result.ok) {
							const notInstalled = isGraphifyNotInstalledError(result.error);
							broadcastGraphifyChanged({
								kind: "ensure",
								purl: key,
								ensure: {
									ok: false,
									error: result.error,
									code: notInstalled
										? "graphify_not_installed"
										: "ensure_failed",
									durationMs: result.durationMs,
								},
							});
							return;
						}
						broadcastGraphifyChanged({
							kind: "ensure",
							purl: key,
							ensure: {
								ok: true,
								status: result.status,
								nodeCount: result.nodeCount,
								edgeCount: result.edgeCount,
								durationMs: result.durationMs,
							},
						});
					})
					.catch((err) => {
						graphifyBuildingPurls.delete(key);
						broadcastGraphifyChanged({
							kind: "ensure",
							purl: key,
							ensure: {
								ok: false,
								error: err instanceof Error ? err.message : String(err),
								code: "ensure_failed",
							},
						});
					});

				return { ok: true, status: "building", purl: key };
			},
			installGraphify: async () => startGraphifyCliJob("install"),
			updateGraphify: async () => startGraphifyCliJob("update"),
			uninstallGraphify: async () => startGraphifyCliJob("uninstall"),
			openSessionEventsTab: async ({ sessionId, title, agent }) => {
				const agentName = (agent ?? "").toLowerCase();
				const rawFeedAgents = new Set(["opencode", "cursor"]);
				if (agentName && !rawFeedAgents.has(agentName)) {
					return { ok: false, error: "agent not supported" };
				}
				const tabId = openSessionEventsTab(sessionId, title, agent);
				return { ok: true, tabId };
			},
			openAnalysisTab: async ({ analysisId }) => {
				if (!analyses.get(analysisId)) {
					return { ok: false, error: `unknown analysis: ${analysisId}` };
				}
				const tabId = openAnalysisTab(analysisId);
				return { ok: true, tabId };
			},
			openPromptTab: async () => {
				const tabId = openPromptTab();
				return { ok: true, tabId };
			},
			analyzeSession: async ({ sessionId, title, agent, force }) => {
				const existing = analyses.findBySession(sessionId);
				if (existing && force && existing.status !== "pending") {
					// Redo: reset the record and restart extraction in place,
					// keeping the same analysis id so any open tabs stay wired
					// to it. A `pending` record is left alone — extraction is
					// already running, so force just falls through below.
					analyses.save({
						...existing,
						status: "pending",
						error: undefined,
						model: undefined,
						concepts: [],
					});
					analyzeSessionInBackground(existing.id, { sessionId, title, agent });
					const tabId = openAnalysisTab(existing.id);
					return { ok: true, analysisId: existing.id, tabId };
				}
				if (existing) {
					// Idempotent: an analysis already exists for this session —
					// open (or focus) its tab in our custom view.
					const tabId = openAnalysisTab(existing.id);
					return { ok: true, analysisId: existing.id, tabId };
				}
				const id = newAnalysisId();
				analyses.save({
					id,
					sessionId,
					sessionTitle: title,
					agent,
					createdAt: new Date().toISOString(),
					status: "pending",
					concepts: [],
				});
				analyzeSessionInBackground(id, { sessionId, title, agent });
				const tabId = openAnalysisTab(id);
				return { ok: true, analysisId: id, tabId };
			},
			
		};

/**
 * Graphify work (extract / uv install) outlives the Electrobun RPC window
 * (host maxRequestTime is 5s). Same pattern as analyzeSession: return quickly,
 * finish in the background, push `graphifyChanged`.
 */
const graphifyBuildingPurls = new Set<string>();
let graphifyCliBusy: "install" | "update" | "uninstall" | null = null;
let cachedDetailedGraphifyStatus: GraphifyCliStatus | null = null;
let detailedRefreshInflight: Promise<void> | null = null;

function sleepMs(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function withGraphifyCliBusy(status: GraphifyCliStatus): GraphifyCliStatus {
	return { ...status, cliBusy: graphifyCliBusy };
}

function broadcastGraphifyChanged(
	payload: StudioMessages["graphifyChanged"],
): void {
	try {
		(rpc.send as unknown as Record<string, (p: unknown) => void>)[
			"graphifyChanged"
		](payload);
	} catch (err) {
		console.warn(
			`[principal-studio] could not notify renderer (graphifyChanged): ${(err as Error).message}`,
		);
	}
}

function broadcastSubsystemModelChanged(
	payload: StudioMessages["subsystemModelChanged"],
): void {
	try {
		(rpc.send as unknown as Record<string, (p: unknown) => void>)[
			"subsystemModelChanged"
		](payload);
	} catch (err) {
		console.warn(
			`[principal-studio] could not notify renderer (subsystemModelChanged): ${(err as Error).message}`,
		);
	}
}

function refreshGraphifyStatusDetailed(): void {
	if (detailedRefreshInflight) return;
	detailedRefreshInflight = (async () => {
		try {
			const status = withGraphifyCliBusy(await getGraphifyStatusDetailed());
			cachedDetailedGraphifyStatus = status;
			broadcastGraphifyChanged({ kind: "cli", status });
		} catch (err) {
			console.warn(
				`[principal-studio] graphify PyPI check failed: ${(err as Error).message}`,
			);
			// Still push local status so the modal stops spinning.
			const status = withGraphifyCliBusy(getGraphifyStatus());
			broadcastGraphifyChanged({ kind: "cli", status });
		} finally {
			detailedRefreshInflight = null;
		}
	})();
}

async function startGraphifyCliJob(
	action: "install" | "update" | "uninstall",
): Promise<{
	ok: boolean;
	error?: string;
	bin?: string;
	started?: boolean;
	status?: GraphifyCliStatus;
}> {
	if (graphifyCliBusy) {
		return {
			ok: true,
			started: true,
			status: withGraphifyCliBusy(
				cachedDetailedGraphifyStatus ?? getGraphifyStatus(),
			),
		};
	}

	// Already installed: install is a sync no-op.
	if (action === "install" && resolveGraphifyBin()) {
		const status = withGraphifyCliBusy(
			cachedDetailedGraphifyStatus ?? getGraphifyStatus(),
		);
		refreshGraphifyStatusDetailed();
		return { ok: true, bin: status.bin ?? undefined, status };
	}

	graphifyCliBusy = action;
	const busyStatus = withGraphifyCliBusy(getGraphifyStatus());
	broadcastGraphifyChanged({ kind: "cli", status: busyStatus });

	void (async () => {
		try {
			const result =
				action === "install"
					? await installGraphify()
					: action === "update"
						? await updateGraphify()
						: await uninstallGraphify();
			graphifyCliBusy = null;
			const status = withGraphifyCliBusy(
				result.status ?? (await getGraphifyStatusDetailed()),
			);
			cachedDetailedGraphifyStatus = status;
			if (!result.ok) {
				broadcastGraphifyChanged({
					kind: "cli",
					status,
					error: result.error ?? `${action} failed`,
				});
				console.error(
					`[principal-studio] graphify ${action} failed: ${result.error}`,
				);
				return;
			}
			broadcastGraphifyChanged({ kind: "cli", status });
			broadcastGraphifyChanged({ kind: "repos" });
		} catch (err) {
			graphifyCliBusy = null;
			const status = withGraphifyCliBusy(getGraphifyStatus());
			cachedDetailedGraphifyStatus = status;
			broadcastGraphifyChanged({
				kind: "cli",
				status,
				error: err instanceof Error ? err.message : String(err),
			});
			console.error(
				`[principal-studio] graphify ${action} failed: ${(err as Error).message}`,
			);
		}
	})();

	return { ok: true, started: true, status: busyStatus };
}

/**
 * Fire-and-forget concept extraction for one analysis. The opencode run
 * outlives the 5s RPC window, so the analysis is saved as `pending`,
 * extraction happens here in the background, and a final tabsChanged refresh
 * surfaces the result. Shared by the initial `analyzeSession` and retries
 * (which reset the record to `pending` before calling back in).
 */
function analyzeSessionInBackground(
	id: string,
	opts: { sessionId: string; title?: string; agent?: string },
): void {
	// Surface the pending state to the renderer immediately (the header's
	// activity chip and the Agent Sessions view both watch listAnalyses); the
	// finally block below broadcasts again on completion/failure.
	broadcastTabsChanged();
	void (async () => {
		try {
			const { sessionId, title, agent } = opts;
			const loaded = await requests.getSessionEvents({ sessionId });
			if (!loaded.ok || !loaded.events) {
				throw new Error(loaded.error ?? "Session not found or empty");
			}
			const beats = analyzeBeats(sessionId, loaded.events);
			const sessionTitle =
				loaded.session?.title ?? title ?? sessionId.slice(0, 12);
			writeBrief({
				sessionId,
				sessionTitle,
				sessionSlug: loaded.session?.slug,
				agent: loaded.session?.agent ?? agent,
				repos: loaded.repos ?? [],
				beats,
			});
			const result = await runOpenCodeExtraction({
				primaryRepoRoot: loaded.repoRoot,
				task: buildBrief({
					sessionId,
					sessionTitle,
					sessionSlug: loaded.session?.slug,
					agent: loaded.session?.agent ?? agent,
					repos: loaded.repos ?? [],
					beats,
				}),
			});
			if (!result.ok) throw new Error(result.error ?? "extraction failed");
			const current = analyses.get(id);
			if (!current) return;
			analyses.save({
				...current,
				status: "done",
				model: result.model,
				concepts: (result.concepts ?? []).map((c) => ({
					...c,
					sessionIds: Array.from(
						new Set([sessionId, ...(c.sessionIds ?? [])]),
					),
				})),
				subsystems: (result.subsystems ?? []).map((s) => ({
					...s,
					sessionIds: Array.from(
						new Set([sessionId, ...(s.sessionIds ?? [])]),
					),
				})),
			});
			console.log(
				`[principal-studio] analysis ${id} complete (${(result.concepts ?? []).length} cards, ${(result.subsystems ?? []).length} subsystems)`,
			);
		} catch (err) {
			const current = analyses.get(id);
			if (current) {
				analyses.save({
					...current,
					status: "error",
					error: (err as Error).message,
				});
			}
			console.error(
				`[principal-studio] analysis ${id} failed: ${(err as Error).message}`,
			);
		} finally {
			broadcastTabsChanged();
		}
	})();
}

/** Normalize a purl subpath to a repo-root-relative path, rejecting anything
 *  that escapes the root. The purl spec forbids `.`/`..` segments, so we reject
 *  rather than normalize-and-hope — the result is later joined onto a real
 *  clone dir. Mirrors the electron-app's `resolvePurlLink` guard. */
function safeSubpath(subpath: string): string | null {
	if (subpath.startsWith("/")) return null;
	const parts: string[] = [];
	for (const seg of subpath.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") return null; // traversal — reject
		parts.push(seg);
	}
	return parts.length > 0 ? parts.join("/") : null;
}

const rpc = BrowserView.defineRPC<StudioRPC>({
	maxRequestTime: 5000,
	handlers: {
		requests,
		messages: {},
	},
});

/** Push live last-event updates for the watched opencode sessions to the
 *  renderer's server-session list. The listener comes from server-sessions.ts;
 *  this is the module-scoped sender wired in setServerEventWatch. */
function broadcastServerEvents(sessions: ServerSessionRow[]): void {
	try {
		(rpc.send as unknown as Record<string, (payload: unknown) => void>)["serverEventsChanged"]({
			sessions,
		});
	} catch (err) {
		console.warn(`[principal-studio] could not notify renderer: ${(err as Error).message}`);
	}
}

function broadcastTabsChanged(focusTabId?: string): void {
	try {
		(rpc.send as unknown as Record<string, (payload: unknown) => void>)[
			"tabsChanged"
		]({ focusTabId });
	} catch (err) {
		console.warn(`[principal-studio] could not notify renderer: ${(err as Error).message}`);
	}
}

// ---------------------------------------------------------------------------
// IPC handoff + server
// ---------------------------------------------------------------------------

function bootMessage(): LoadTrailMessage | null {
	const initialMode = resolveMode();
	const initialTrailFile = resolveTrailFilePath();
	if (!initialTrailFile) return null;
	const initialRepoRoot = resolveRepoRoot(initialTrailFile);
	const msg: LoadTrailMessage = {
		kind: "LOAD_TRAIL",
		trailFile: initialTrailFile,
		mode: initialMode,
	};
	if (initialRepoRoot) msg.repoRoot = initialRepoRoot;
	const ghToken = process.env["TRAIL_GH_TOKEN"];
	if (ghToken) msg.ghToken = ghToken;
	const repoOwner = process.env["TRAIL_REPO_OWNER"];
	if (repoOwner) msg.repoOwner = repoOwner;
	const repoName = process.env["TRAIL_REPO_NAME"];
	if (repoName) msg.repoName = repoName;
	const repoPurl = process.env["TRAIL_REPO_PURL"];
	if (repoPurl) msg.repoPurl = repoPurl;
	return msg;
}

const initialMessage = bootMessage();
if (initialMessage) {
	const handed = await handoffToRunning(initialMessage);
	if (handed) {
		console.log("[principal-studio] handed off to running instance");
		process.exit(0);
	}
	// Become server. Seed the first tab from boot args before the window opens
	// so the renderer's first listTabs call sees it.
	addTabFromMessage(initialMessage);
}

// CLI `subsystem-model create/open` cold-start: open a stored model by id.
// Same handoff pattern as TRAIL_FILE — if Studio is already up, open there and
// exit; otherwise seed a subsystem-model tab before the window appears.
const bootSubsystemModelId = (process.env["SUBSYSTEM_MODEL_ID"] ?? "").trim();
if (bootSubsystemModelId) {
	const handed = await handoffToRunning({
		kind: "LOAD_SUBSYSTEM_GRAPH",
		graphId: bootSubsystemModelId,
	});
	if (handed) {
		console.log("[principal-studio] handed off subsystem model to running instance");
		process.exit(0);
	}
	await openSubsystemModelTab(bootSubsystemModelId);
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

const browserWindow = new BrowserWindow({
	title: "Principal AI",
	url: "views://mainview/index.html",
	rpc,
	// Initial frame is just the fallback the window briefly opens at before we
	// maximize it below; it's also what `unmaximize` restores to.
	frame: { width: 1200, height: 800, x: 100, y: 100 },
});

// Open filling the screen's work area. We maximize rather than hardcode a size
// so it adapts to whatever display the user is on; `setFullScreen(true)` would
// instead push it into the borderless macOS fullscreen space, which isn't what
// we want for a windowed viewer.
browserWindow.maximize();

// Spawn the background warm-up worker (off this host's event loop) so the
// recent window's disk cache is pre-built before the user opens Agent
// Sessions. The worker thread never starves the webview's initial RPCs — the
// tab strip populates normally while warm-up runs in parallel.
startWarmupWorker();

function closeTabById(id: string): { ok: boolean; error?: string } {
	if (isPermanentTabId(id)) {
		return { ok: false, error: "permanent tab cannot be closed" };
	}
	if (!tabs.has(id)) return { ok: false, error: `unknown tab: ${id}` };
	tabs.delete(id);
	// If the renderer was on this tab, the renderer picks its own fallback on
	// the next refresh. We only keep the host's resume suggestion valid.
	if (suggestedTabId === id) {
		const remaining = Array.from(tabs.keys());
		suggestedTabId = remaining[remaining.length - 1] ?? LIBRARY_TAB_ID;
	}
	broadcastTabsChanged();
	return { ok: true };
}

// Application menu — without one macOS has no Cmd+Q binding and no way to
// surface Cmd+W to close the active tab. We keep the viewer chrome lean; the
// Edit menu's native roles are what wire Cmd+C/V into the webviews' clipboard.
ApplicationMenu.setApplicationMenu([
	{
		submenu: [
			{ role: "about", label: "About Subsystems Studio" },
			{ type: "separator" },
			{ role: "hide" },
			{ role: "hideOthers" },
			{ role: "showAll" },
			{ type: "separator" },
			{ role: "quit", accelerator: "CommandOrControl+Q" },
		],
	},
	{
		label: "Edit",
		submenu: [
			{ role: "undo" },
			{ role: "redo" },
			{ type: "separator" },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "selectAll" },
		],
	},
	{
		label: "File",
		submenu: [
			{
				label: "Close Tab",
				action: "closeActiveTab",
				accelerator: "CommandOrControl+W",
			},
			{ role: "close", label: "Close Window", accelerator: "Shift+CommandOrControl+W" },
		],
	},
]);

ApplicationMenu.on("application-menu-clicked", (event) => {
	// Electrobun wraps the payload — `{ data: { action, id?, data? } }`.
	const action = (event as { data?: { action?: string } }).data?.action;
	if (action === "closeActiveTab") closeTabById(suggestedTabId);
});

console.log("[principal-studio] window opened");

startIpcServer(async (msg) => {
	try {
		if (msg.kind === "FOCUS") {
			// Bare bring-to-front (e.g. `principal-ai open-studio`) — no tab change.
			try {
				browserWindow.focus();
			} catch (err) {
				console.warn(`[principal-studio] could not focus window: ${(err as Error).message}`);
			}
			return { ok: true };
		}
		if (msg.kind === "ACTIVATE_TAB") {
			// Bring a running viewer to a permanent tab (e.g. the CLI's
			// `principal-ai agent-sessions`). The host suggests the focus; the
			// renderer applies it to its own active-tab state. CLI activation
			// forces the tab into the strip even if settings currently hide it.
			if (!isPermanentTabId(msg.tabId)) {
				return { ok: false, error: `unknown permanent tab: ${msg.tabId}` };
			}
			ensurePermanentTab(msg.tabId);
			suggestedTabId = msg.tabId;
			broadcastTabsChanged(msg.tabId);
			try {
				browserWindow.focus();
			} catch (err) {
				console.warn(`[principal-studio] could not focus window: ${(err as Error).message}`);
			}
			return { ok: true };
		}
		if (msg.kind === "LOAD_SUBSYSTEM_GRAPH") {
			const tabId = await openSubsystemModelTab(msg.graphId);
			broadcastTabsChanged(tabId);
			try {
				browserWindow.focus();
			} catch (err) {
				console.warn(`[principal-studio] could not focus window: ${(err as Error).message}`);
			}
			return { ok: true };
		}
		const tabId = addTabFromMessage(msg);
		broadcastTabsChanged(tabId);
		try {
			browserWindow.focus();
		} catch (err) {
			console.warn(`[principal-studio] could not focus window: ${(err as Error).message}`);
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
});

// HTTP server for agent communication (subsystem graphs, etc.)
setSubsystemModelChangeListener(broadcastSubsystemModelChanged);
void startSubsystemModelDirWatcher().then(() => {
	console.log("[principal-studio] watching ~/.principal/subsystem-models for changes");
});
startHttpServer(async (graphId) => {
	const tabId = await openSubsystemModelTab(graphId);
	broadcastTabsChanged(tabId);
	try {
		browserWindow.focus();
	} catch (err) {
		console.warn(`[principal-studio] could not focus window: ${(err as Error).message}`);
	}
	return { ok: true, tabId };
}, async (graphId) => deleteGraphAndCloseTabs(graphId));
