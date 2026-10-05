/**
 * Principal Studio host (bun process).
 *
 * Boot inputs:
 *   - Tour: argv[2] / TOUR_FILE and TOUR_REPO_ROOT (default cwd).
 *   - Subsystem model: SUBSYSTEM_MODEL_ID — opens a stored model tab on cold
 *     start (used by `principal-ai subsystem-model create/open`).
 *
 * Opens an Electrobun window and exposes a tiny RPC surface to the mainview
 * so it can render tours, subsystem models, and related surfaces, and
 * resolve slice snippets from the working tree (local mode).
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
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
	parsePurl,
} from "@principal-ai/alexandria-core-library";
import { parseTourOrThrow } from "@principal-ai/file-city-builder";
import { handoffToRunning, startIpcServer, type LoadTourMessage } from "./ipc";
import { startHttpServer } from "./http-server";
import { resolveSandboxed } from "./sandboxed-path";
import { deleteSubsystemModel, getSubsystemModel, listSubsystemModels, purlRepoKey, resolveRepoRootForComponent, setSubsystemModelChangeListener, stampVerifiedCommits, startSubsystemModelDirWatcher, subsystemModelFilePath, touchSubsystemModelOpened, updateSubsystemModel } from "./subsystem-model-store";
import { mergeSubsystemModels, type MergeInputModel } from "./merge-submodel-models";
import type { ModelProvenanceSnapshot } from "../shared/contract";
import {
	modelProvenance,
	modelProvenanceDetail,
	planAutoRePin,
	purlCommitFreshness,
} from "./purl-commits";
import { attachSignatureAugmentations } from "./augmentation-store";
import { publishSubsystemModelGist } from "./gist-publish";
import {
	buildAuditFingerprint,
	deleteSubsystemModelAudit,
	getSubsystemModelAuditListSummary,
	loadSubsystemModelAudit,
	summarizeLanes,
} from "./audit-report-store";
import {
	acceptSubsystemModelProposal as acceptProposalInStore,
	createSubsystemModelProposal,
	deleteAllPendingSubsystemModelProposals,
	deleteSubsystemModelProposals,
	getSubsystemModelProposal,
	listSubsystemModelProposals,
	pendingProposalCount,
	rejectSubsystemModelProposal as rejectProposalInStore,
	setProposalSecondOpinion,
} from "./proposal-store";
import {
	buildVerificationBrief,
	maintainSubsystemModelSequence,
	nextMaintainRouteForModel,
} from "./maintain-model";
import {
	autoAcceptProposalIfConfident,
	evaluateProposalSecondOpinion,
} from "./jev-maintenance";
import { buildProposalSourceContext } from "./proposal-source-context";
import { listMaintainSessions } from "./maintain-sessions";
import {
	deleteSubsystemModelRuns,
	listSubsystemModelRuns,
} from "./subsystem-model-runs";
import {
	modelProviderOf,
	resolveSubsystemMaintainerModel,
	type OpenCodeModelInfo,
} from "./opencode-models";
import { auditSubsystemModel, applySubsystemModelAuditFix, verifySubsystemComponent } from "./verify-subsystem-component";
import { inspectSubsystemSymbol } from "./inspect-symbol";
import {
	getGraphifyStatus,
	getGraphifyStatusDetailed,
	installGraphify,
	isGraphifyNotInstalledError,
	resolveGraphifyBin,
	uninstallGraphify,
	updateGraphify,
} from "./graphify-runner";
import {
	getStudioVersionStatus,
	getStudioVersionStatusDetailed,
	startStudioUpdate,
} from "./studio-version";
import {
	getOpencodeV2Status,
	getOpencodeV2StatusDetailed,
	installOpencodeV2,
	resolveOpencode2Bin,
	updateOpencodeV2,
} from "./opencode-v2";
import {
	getOpencodeV2ProbeState,
	setOpencodeV2ProbeListener,
	startOpencodeV2Probe,
	stopOpencodeV2Probe,
} from "./opencode-v2-probe";
import {
	getOpencodeLiveFeed,
	getOpencodeLiveFeedByGraphId,
	subscribeOpencodeLiveFeeds,
} from "./opencode-v2-live";
import { ensureGraphifyGraph, listGraphifyGraphs, listGraphifyRepos, assessSubsystemGraphifyReadiness } from "./graphify-store";
import { buildMaintenanceOverview } from "./maintenance-overview";
import { ensurePackageLayers, listPackageLayers, listPackageLayerRepos } from "./package-layer-store";
import {
	walkTours,
	resolveLocalRepoIdentity,
	resolveUserIdentity,
} from "./library";
import type {
	DefaultTabFlags,
	GraphifyCliStatus,
	MaintenanceOverviewModel,
	MaintenanceOverviewProposal,
	OpencodeV2Status,

	RepoInfo,
	ServerSessionRow,
	SessionEventRow,
	SessionSummary,
	TabFullState,
	TabSummary,
	StudioMessages,
	StudioRequests,
	StudioVersionStatus,
	SubsystemModelAuditFixGroup,
	SubsystemModelAuditReport,
	SubsystemModelVerification,
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
import { createRegularAuditScheduler } from "./regular-audit";
import { reconcileOrphanedRuns } from "./subsystem-model-run-reconcile";

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
	const raw = (process.env as Record<string, string | undefined>)["PRINCIPAL_STUDIO_WARMUP_DAYS"];
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
const MAINTENANCE_SESSIONS_TAB_ID = "maintenance-sessions";
const SUBSYSTEMS_TAB_ID = "subsystems";
const MAINTENANCE_TAB_ID = "maintenance";
const GRAPHIFY_TAB_ID = "graphify";
const PACKAGE_LAYERS_TAB_ID = "package-layers";
const OPENCODE_V2_TAB_ID = "opencode-v2";

/** Permanent tabs controlled by `ViewerSettings.defaultTabs`. Order here is
 *  the strip order when all are enabled. */
const PERMANENT_TAB_DEFS: Array<{
	id: string;
	kind:
		| "agent-sessions"
		| "maintenance-sessions"
		| "subsystems"
		| "maintenance"
		| "graphify"
		| "package-layers"
		| "library"
		| "opencode-v2";
	title: string;
	flag: keyof DefaultTabFlags;
}> = [
	{
		id: SUBSYSTEMS_TAB_ID,
		kind: "subsystems",
		title: "Subsystems",
		flag: "subsystems",
	},
	{
		id: MAINTENANCE_TAB_ID,
		kind: "maintenance",
		title: "Maintainer",
		flag: "maintenance",
	},
	{
		id: AGENT_SESSIONS_TAB_ID,
		kind: "agent-sessions",
		title: "Agent Sessions",
		flag: "sessions",
	},
	{
		id: MAINTENANCE_SESSIONS_TAB_ID,
		kind: "maintenance-sessions",
		title: "Maintenance Sessions",
		flag: "maintenanceSessions",
	},
	{
		id: GRAPHIFY_TAB_ID,
		kind: "graphify",
		title: "Graphify",
		flag: "graphify",
	},
	{
		id: PACKAGE_LAYERS_TAB_ID,
		kind: "package-layers",
		title: "Package Layers",
		flag: "packageLayers",
	},
	{
		id: OPENCODE_V2_TAB_ID,
		kind: "opencode-v2",
		title: "OpenCode V2",
		flag: "opencodeV2",
	},
	{
		id: LIBRARY_TAB_ID,
		kind: "library",
		title: "Tours",
		flag: "tours",
	},
];

function isPermanentTabId(id: string): boolean {
	return PERMANENT_TAB_DEFS.some((d) => d.id === id);
}

// ---------------------------------------------------------------------------
// CLI args / env
// ---------------------------------------------------------------------------

function resolveMode(): ViewerMode {
	const raw = process.env["TOUR_MODE"];
	if (raw === "remote") return "remote";
	if (raw === "local" || raw === undefined || raw === "") return "local";
	console.warn(
		`[principal-studio] unknown TOUR_MODE='${raw}', falling back to 'local'`,
	);
	return "local";
}

function resolveTourFilePath(): string | null {
	const argPath = process.argv[2];
	const envPath = process.env["TOUR_FILE"];
	const raw = argPath ?? envPath ?? null;
	if (!raw) return null;
	return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

function resolveRepoRoot(tourFilePath: string | null): string {
	const argRoot = process.argv[3];
	const envRoot = process.env["TOUR_REPO_ROOT"];
	const raw = argRoot ?? envRoot;
	if (raw) return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
	// Sensible default: parent dir of the tour file, so a `*.tour.json` dropped
	// next to a checkout has things "just work".
	if (tourFilePath) return dirname(tourFilePath);
	return process.cwd();
}

// Which permanent tab the window opens on. `principal-ai agent-sessions` spawns
// with PRINCIPAL_STUDIO_START_TAB=agent-sessions so a bare launch lands straight on
// the Agent Sessions overview. Otherwise resume the tab that was active when the
// last session closed, if it's still enabled; falling back to Subsystems when
// that tab is enabled, else the first enabled permanent tab.
function resolveStartTab(settings: ViewerSettings): string {
	const raw = process.env["PRINCIPAL_STUDIO_START_TAB"];
	if (raw && isPermanentTabId(raw)) {
		return raw;
	}
	const last = PERMANENT_TAB_DEFS.find((d) => d.id === settings.lastActiveTabId);
	if (last && settings.defaultTabs[last.flag]) return last.id;
	if (settings.defaultTabs.subsystems) return SUBSYSTEMS_TAB_ID;
	const firstEnabled = PERMANENT_TAB_DEFS.find(
		(d) => settings.defaultTabs[d.flag],
	);
	return firstEnabled?.id ?? SUBSYSTEMS_TAB_ID;
}

// Per-tab state. Tour tabs are fully self-contained views of one File City
// introduction tour; the library tab is a permanent first tab that lists cached
// tours. Tabs from different repos do not share env vars, repoRoot, or
// sandboxing.
interface TourTabState {
	id: string;
	kind: "tour";
	title: string;
	mode: ViewerMode;
	tourFilePath: string;
	repoRoot: string;
	loaded: LoadedTour;
	repoOwner?: string;
	repoName?: string;
	repoPurl?: string;
	ghToken?: string;
}

interface LibraryTabState {
	id: typeof LIBRARY_TAB_ID;
	kind: "library";
	title: "Tours";
}

interface AgentSessionsTabState {
	id: typeof AGENT_SESSIONS_TAB_ID;
	kind: "agent-sessions";
	title: "Agent Sessions";
}

interface MaintenanceSessionsTabState {
	id: typeof MAINTENANCE_SESSIONS_TAB_ID;
	kind: "maintenance-sessions";
	title: "Maintenance Sessions";
}

interface SubsystemsTabState {
	id: typeof SUBSYSTEMS_TAB_ID;
	kind: "subsystems";
	title: "Subsystems";
}

interface MaintenanceTabState {
	id: typeof MAINTENANCE_TAB_ID;
	kind: "maintenance";
	title: "Maintainer";
}

interface GraphifyTabState {
	id: typeof GRAPHIFY_TAB_ID;
	kind: "graphify";
	title: "Graphify";
}

interface PackageLayersTabState {
	id: typeof PACKAGE_LAYERS_TAB_ID;
	kind: "package-layers";
	title: "Package Layers";
}

interface OpencodeV2TabState {
	id: typeof OPENCODE_V2_TAB_ID;
	kind: "opencode-v2";
	title: "OpenCode V2";
}

interface SessionEventsTabState {
	id: string;
	kind: "session-events";
	title: string;
	sessionId: string;
	agent?: string;
}

interface SubsystemModelTabState {
	id: string;
	kind: "subsystem-model";
	title: string;
	graphId: string;
	/** Trail to select when the view mounts (opened from a row). */
	focusTrailId?: string;
	/** Open the sidebar's issues view on mount (opened from a row). */
	showIssues?: boolean;
	/** With `showIssues`, land focused on this verification layer. */
	focusIssueCategory?: string;
	/** Live Maintain session whose collapsible event panel is mounted over the
	 *  graph (opened from the Maintenance tab's live strip). */
	liveSessionId?: string;
	liveTitle?: string;
	liveAgent?: string;
}

/**
 * A read-only, agent-authored slice of the Subsystems list: the same view and
 * rows as the permanent Subsystems tab, but scoped to an explicit, ordered set
 * of model ids and without the filter header.
 */
interface SubsystemShowcaseTabState {
	id: string;
	kind: "subsystem-showcase";
	title: string;
	showcaseIds: string[];
}

type TabState =
	| LibraryTabState
	| AgentSessionsTabState
	| MaintenanceSessionsTabState
	| SubsystemsTabState
	| MaintenanceTabState
	| GraphifyTabState
	| PackageLayersTabState
	| OpencodeV2TabState
	| SessionEventsTabState
	| SubsystemModelTabState
	| SubsystemShowcaseTabState
	| TourTabState;

function permanentTabState(
	def: (typeof PERMANENT_TAB_DEFS)[number],
):
	| AgentSessionsTabState
	| MaintenanceSessionsTabState
	| SubsystemsTabState
	| MaintenanceTabState
	| GraphifyTabState
	| PackageLayersTabState
	| OpencodeV2TabState
	| LibraryTabState {
	if (def.kind === "agent-sessions") {
		return { id: AGENT_SESSIONS_TAB_ID, kind: "agent-sessions", title: "Agent Sessions" };
	}
	if (def.kind === "maintenance-sessions") {
		return {
			id: MAINTENANCE_SESSIONS_TAB_ID,
			kind: "maintenance-sessions",
			title: "Maintenance Sessions",
		};
	}
	if (def.kind === "subsystems") {
		return { id: SUBSYSTEMS_TAB_ID, kind: "subsystems", title: "Subsystems" };
	}
	if (def.kind === "maintenance") {
		return { id: MAINTENANCE_TAB_ID, kind: "maintenance", title: "Maintainer" };
	}
	if (def.kind === "graphify") {
		return { id: GRAPHIFY_TAB_ID, kind: "graphify", title: "Graphify" };
	}
	if (def.kind === "package-layers") {
		return {
			id: PACKAGE_LAYERS_TAB_ID,
			kind: "package-layers",
			title: "Package Layers",
		};
	}
	if (def.kind === "opencode-v2") {
		return { id: OPENCODE_V2_TAB_ID, kind: "opencode-v2", title: "OpenCode V2" };
	}
	return { id: LIBRARY_TAB_ID, kind: "library", title: "Tours" };
}

/**
 * Rebuild the permanent-tab prefix of `tabs` from settings. Transient tabs
 * (tours, models, …) are preserved after the permanent ones so strip order
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
			maintenanceSessions:
				id === MAINTENANCE_SESSIONS_TAB_ID ||
				viewerSettings.defaultTabs.maintenanceSessions,
			tours: id === LIBRARY_TAB_ID || viewerSettings.defaultTabs.tours,
			graphify: id === GRAPHIFY_TAB_ID || viewerSettings.defaultTabs.graphify,
			packageLayers:
				id === PACKAGE_LAYERS_TAB_ID || viewerSettings.defaultTabs.packageLayers,
			subsystems:
				id === SUBSYSTEMS_TAB_ID || viewerSettings.defaultTabs.subsystems,
			maintenance:
				id === MAINTENANCE_TAB_ID || viewerSettings.defaultTabs.maintenance,
			opencodeV2:
				id === OPENCODE_V2_TAB_ID || viewerSettings.defaultTabs.opencodeV2,
		},
		autoAcceptSubsystemModelProposals:
			viewerSettings.autoAcceptSubsystemModelProposals,
		autoAcceptSubsystemModelConfidenceThreshold:
			viewerSettings.autoAcceptSubsystemModelConfidenceThreshold,
		subsystemMaintainerModel: viewerSettings.subsystemMaintainerModel,
		regularAuditEnabled: viewerSettings.regularAuditEnabled,
		regularAuditIntervalMinutes: viewerSettings.regularAuditIntervalMinutes,
		autoApplyAuditFixes: viewerSettings.autoApplyAuditFixes,
		typesafeApiKey: viewerSettings.typesafeApiKey,
		maintenanceRepoKey: viewerSettings.maintenanceRepoKey,
		lastActiveTabId: viewerSettings.lastActiveTabId,
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

type LoadedTour =
	| { ok: true; payload: unknown; path: string }
	| { ok: false; error: string };

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
 * Returns `null` when the payload carries no tour (wrong shape, or unrelated).
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

function loadTourFile(path: string | null): LoadedTour {
	if (!path) {
		return {
			ok: false,
			error:
				"No tour file. Pass a path as the first arg or set TOUR_FILE=<path>.",
		};
	}
	let json: unknown;
	try {
		json = JSON.parse(readFileSync(path, "utf8"));
	} catch (err) {
		return { ok: false, error: `Failed to load ${path}: ${(err as Error).message}` };
	}

	const tour = extractTourPayload(json);
	if (!tour) {
		return {
			ok: false,
			error: `Failed to load ${path}: no tour found. Expected a tour payload with a \`steps[]\` array (a bare tour, the by-id wrapper, or the audio envelope).`,
		};
	}
	// Validate up front so a malformed tour fails at load with a clear message
	// rather than silently rendering an idle, empty city.
	try {
		parseTourOrThrow(JSON.stringify(tour));
	} catch (err) {
		return { ok: false, error: `Failed to load ${path}: ${(err as Error).message}` };
	}
	return { ok: true, payload: tour, path };
}

/**
 * Resolve a marker's `sourcePath` against a tab's repoRoot, refusing path
 * traversal. Returns the absolute path on disk.
 */
/**
 * The GitHub `owner/name` a tour was authored against, read from its (possibly
 * repaired) `repos[0].remote`. `extractTourPayload` guarantees this is present
 * for every shape we accept, so it's how a library-opened tour finds its repo.
 */
function tourRepoIdentity(
	loaded: LoadedTour,
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

function deriveTitle(loaded: LoadedTour, fallbackPath: string): string {
	if (loaded.ok && typeof loaded.payload === "object" && loaded.payload !== null) {
		const t = (loaded.payload as { title?: unknown }).title;
		if (typeof t === "string" && t) return t;
	}
	const base = fallbackPath.split("/").pop() ?? fallbackPath;
	return base.replace(/\.json$/i, "");
}

function addTabFromMessage(msg: LoadTourMessage): string {
	const tourFilePath = msg.tourFile;
	// Dedupe: re-firing the same tour (same on-disk path) focuses the existing
	// tab rather than spawning a duplicate. Closing and reopening a tab is the
	// way to force a re-load.
	for (const existing of tabs.values()) {
		if (existing.kind === "tour" && existing.tourFilePath === tourFilePath) {
			suggestedTabId = existing.id;
			console.log(`[principal-studio] tab ${existing.id} focused (already open): ${tourFilePath}`);
			return existing.id;
		}
	}

	const id = String(nextTabId++);
	let loaded = loadTourFile(tourFilePath);

	// Tours render against a whole working tree, so they're always local. The CLI
	// `tour view` passes the repoRoot (cwd); a tour opened from the library
	// carries none, so we resolve it from the Alexandria registry by the GitHub
	// owner/repo the tour was authored against. When the registry doesn't know
	// that repo we can't render the city, so we fail the tab with a clear message
	// rather than an empty/idle view.
	let repoRoot: string;
	if (!msg.repoRoot) {
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
			};
		}
	} else {
		repoRoot = msg.repoRoot;
	}
	const mode: ViewerMode = "local";
	const tab: TabState = {
		id,
		kind: "tour",
		title: deriveTitle(loaded, tourFilePath),
		mode,
		tourFilePath,
		repoRoot,
		loaded,
		repoOwner: msg.repoOwner,
		repoName: msg.repoName,
		repoPurl: msg.repoPurl,
		ghToken: msg.ghToken,
	};
	tabs.set(id, tab);
	suggestedTabId = id;
	console.log(`[principal-studio] tab ${id} added: ${tourFilePath} (tour, ${mode})`);
	return id;
}

/**
 * Focus or create the tab that renders a session's raw → normalized →
 * accumulated event feed. Dedupes by sessionId. Only opencode and cursor
 * sessions are supported — callers check the agent before invoking (the
 * renderer disables the button for unsupported agents).
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
 * Focus a model's graph tab and open (or retarget) its collapsible live
 * Maintain events panel for an OpenCode session. Replaces the old per-session
 * maintain-events tab.
 */
async function openMaintainLive(opts: {
	sessionId: string;
	graphId: string;
	title?: string;
	agent?: string;
}): Promise<{ ok: boolean; tabId?: string; error?: string }> {
	const tabId = await openSubsystemModelTab(opts.graphId, undefined, {
		live: {
			sessionId: opts.sessionId,
			title: opts.title,
			agent: opts.agent,
		},
	});
	if (!tabId) return { ok: false, error: `unknown graph ${opts.graphId}` };
	broadcastMaintainLivePanelChanged({
		graphId: opts.graphId,
		sessionId: opts.sessionId,
		title: opts.title,
		agent: opts.agent,
	});
	console.log(
		`[principal-studio] maintain live panel opened on graph ${opts.graphId}: ${opts.sessionId}`,
	);
	return { ok: true, tabId };
}

async function openSubsystemModelTab(
	graphId: string,
	trailId?: string,
	focus?: {
		showIssues?: boolean;
		focusIssueCategory?: string;
		live?: { sessionId: string; title?: string; agent?: string };
	},
): Promise<string | null> {
	// Fast path: already open — no I/O. Broadcast first so the tab switches
	// immediately; stamp last-opened in the background. The detail view owns
	// its Loading / not-found empty states and fills in via getSubsystemModel.
	for (const existing of tabs.values()) {
		if (existing.kind === "subsystem-model" && existing.graphId === graphId) {
			// Keep the deep-link target current: reopening from a trail
			// row selects it; a plain open (row double-click) clears it.
			existing.focusTrailId = trailId;
			// The issues focus is sticky-on-open only: a reopen that asks for it
			// sets it, a reopen that doesn't clears it so stale focus doesn't
			// linger on a tab the user is revisiting for something else. The
			// view re-reads these when the tab is (re)broadcast.
			existing.showIssues = focus?.showIssues;
			existing.focusIssueCategory = focus?.focusIssueCategory;
			if (focus?.live) {
				existing.liveSessionId = focus.live.sessionId;
				existing.liveTitle = focus.live.title;
				existing.liveAgent = focus.live.agent;
			}
			suggestedTabId = existing.id;
			console.log(`[principal-studio] subsystem-model tab ${existing.id} focused (already open): ${graphId}`);
			broadcastTabsChanged(existing.id);
			void touchSubsystemModelOpened(graphId).catch(() => {});
			// Refresh a stale label in the background if the graph was
			// renamed since the tab opened (cheap index read, off the click path).
			void listSubsystemModels()
				.then((entries) => {
					const entry = entries.find((e) => e.id === graphId);
					if (entry && existing.title !== entry.title) {
						existing.title = entry.title;
						broadcastTabsChanged(existing.id);
					}
				})
				.catch(() => {});
			return existing.id;
		}
	}
	// Resolve the title from the small index file instead of parsing the full
	// graph record, so a first open doesn't block on graph JSON I/O either.
	let title: string | null = null;
	try {
		title = (await listSubsystemModels()).find((e) => e.id === graphId)?.title ?? null;
	} catch {
		title = null;
	}
	if (title == null) {
		// Stale or missing index entry — fall back to a full read. A null
		// return preserves the unknown-graph contract: no tab is created and
		// callers report the error; the detail view is never mounted.
		const graph = await getSubsystemModel(graphId);
		if (!graph) return null;
		title = graph.title;
	}
	const id = String(nextTabId++);
	tabs.set(id, {
		id,
		kind: "subsystem-model",
		title,
		graphId,
		...(trailId ? { focusTrailId: trailId } : {}),
		...(focus?.showIssues ? { showIssues: true } : {}),
		...(focus?.focusIssueCategory
			? { focusIssueCategory: focus.focusIssueCategory }
			: {}),
		...(focus?.live
			? {
					liveSessionId: focus.live.sessionId,
					liveTitle: focus.live.title,
					liveAgent: focus.live.agent,
				}
			: {}),
	});
	suggestedTabId = id;
	console.log(`[principal-studio] subsystem-model tab ${id} added: ${graphId}`);
	broadcastTabsChanged(id);
	// Fire-and-forget: the last-opened stamp (full re-read + record/index
	// rewrites) must not gate tab visibility.
	void touchSubsystemModelOpened(graphId).catch(() => {});
	return id;
}

/**
 * Open an agent-authored showcase: a Subsystems-like tab scoped to an explicit,
 * ordered set of stored model ids and stripped of the filter header. Unknown
 * ids are dropped; returns null when none survive so callers report the error.
 */
async function openSubsystemShowcaseTab(opts: {
	title?: string;
	ids: string[];
}): Promise<string | null> {
	const known = new Set((await listSubsystemModels()).map((e) => e.id));
	const seen = new Set<string>();
	const ids: string[] = [];
	for (const id of opts.ids) {
		if (!known.has(id) || seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}
	if (ids.length === 0) return null;
	const title =
		opts.title?.trim() || `Subsystem showcase (${ids.length})`;
	const id = String(nextTabId++);
	tabs.set(id, { id, kind: "subsystem-showcase", title, showcaseIds: ids });
	suggestedTabId = id;
	console.log(`[principal-studio] subsystem-showcase tab ${id} added: ${ids.length} model(s)`);
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
	if (deleted) {
		await deleteSubsystemModelAudit(graphId);
		await deleteSubsystemModelProposals(graphId);
		await deleteSubsystemModelRuns(graphId);
		return { ok: true };
	}
	return { ok: false, error: `unknown graph: ${graphId}` };
}

/**
 * Distinct GitHub repos referenced by a model's components, derived from their
 * purls. The model stores no `repo` field — purls are the single source of
 * truth, so this is computed per listing.
 */
function githubReposFromComponents(
	components: ReadonlyArray<{ purl?: string }>,
): Array<{ owner: string; name: string }> {
	const byKey = new Map<string, { owner: string; name: string }>();
	for (const c of components) {
		const match = /^pkg:github\/([^/]+)\/([^/#?]+)/.exec((c.purl ?? "").trim());
		if (!match) continue;
		const owner = match[1]!;
		const name = match[2]!;
		const key = `${owner}/${name}`.toLowerCase();
		if (!byKey.has(key)) byKey.set(key, { owner, name });
	}
	return [...byKey.values()];
}

/**
 * Deduped component file anchors for the Subsystems tab file panel.
 * Components sharing a file (multiple symbols per module) collapse to one
 * entry carrying each component's id/name/construct; file-less components
 * (external / custom_entity) are skipped.
 */
function subsystemFilesFromComponents(
	components: ReadonlyArray<{
		alias: string;
		name: string;
		construct: string;
		file?: string;
		purl?: string;
		declarationRef?: { startLine?: number };
	}>,
): Array<{
	file: string;
	purl?: string;
	components: Array<{
		alias: string;
		name: string;
		construct: string;
		startLine?: number;
	}>;
}> {
	const byKey = new Map<
		string,
		{
			file: string;
			purl?: string;
			components: Array<{
				alias: string;
				name: string;
				construct: string;
				startLine?: number;
			}>;
		}
	>();
	for (const c of components) {
		if (!c.file) continue;
		const key = `${c.purl ?? ""}\0${c.file}`;
		let entry = byKey.get(key);
		if (!entry) {
			entry = { file: c.file, purl: c.purl, components: [] };
			byKey.set(key, entry);
		}
		if (!entry.components.some((m) => m.alias === c.alias)) {
			entry.components.push({
				alias: c.alias,
				name: c.name,
				construct: c.construct,
				startLine: c.declarationRef?.startLine,
			});
		}
	}
	return [...byKey.values()];
}

/**
 * Per-trail step sites for the Subsystems tab file → trail expansion. Step
 * `file`s are repo-root-relative (same form as component `file`) and repo
 * attribution is the step's own `purl`, which is required — there is nothing to
 * infer from the endpoint components, so they are not consulted.
 */
function subsystemTrailsFromModel(
	trails?: ReadonlyArray<{
		id: string;
		title: string;
		steps?: ReadonlyArray<{ file: string; line: number; from: string; to: string; purl?: string }>;
	}>,
): Array<{
	id: string;
	title: string;
	stepCount: number;
	files: Array<{ file: string; purl?: string; lines?: number[] }>;
	steps: Array<{ file: string; purl?: string; line?: number }>;
}> {
	const out: Array<{
		id: string;
		title: string;
		stepCount: number;
		files: Array<{ file: string; purl?: string; lines?: number[] }>;
		steps: Array<{ file: string; purl?: string; line?: number }>;
	}> = [];
	for (const w of trails ?? []) {
		const steps = w.steps ?? [];
		const files: Array<{ file: string; purl?: string; lines?: number[] }> = [];
		const byKey = new Map<string, (typeof files)[number]>();
		const stepSites: Array<{ file: string; purl?: string; line?: number }> = [];
		for (const s of steps) {
			if (!s.file) continue;
			// A step names its own site purl — `purl` is required on a trail step,
			// so there is nothing to infer. An unauthored step (hand-written file,
			// or a record predating the requirement) falls through with no purl and
			// is still listed by file.
			const purl = s.purl;
			const key = `${purl ?? ""}\0${s.file}`;
			let entry = byKey.get(key);
			if (!entry) {
				entry = { file: s.file, purl, lines: [] };
				byKey.set(key, entry);
				files.push(entry);
			}
			if (
				Number.isFinite(s.line) &&
				s.line > 0 &&
				!entry.lines!.includes(s.line)
			) {
				entry.lines!.push(s.line);
			}
			stepSites.push({
				file: s.file,
				purl,
				line: Number.isFinite(s.line) && s.line > 0 ? s.line : undefined,
			});
		}
		for (const f of files) f.lines!.sort((a, b) => a - b);
		out.push({
			id: w.id,
			title: w.title,
			stepCount: steps.length,
			files,
			steps: stepSites,
		});
	}
	return out;
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
// UserIdentity, ViewerMode) live in src/shared/contract.ts — the
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

async function readFileLocal(tab: TourTabState, path: string): Promise<{ ok: boolean; content?: string; error?: string }> {
	try {
		const absolute = resolveSandboxed(tab.repoRoot, path);
		const content = await fs.readFile(absolute, "utf8");
		return { ok: true, content };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}

/**
 * Permanent, non-tour tabs (library, agent sessions, subsystems).
 * They carry no tour payload and don't serve files or notes; several RPC
 * handlers use this to reject calls aimed at tour-only state.
 */
function isStaticTab(
	tab: TabState,
): tab is
	| LibraryTabState
	| AgentSessionsTabState
	| MaintenanceSessionsTabState
	| SubsystemsTabState
	| MaintenanceTabState
	| GraphifyTabState
	| PackageLayersTabState
	| OpencodeV2TabState {
	return (
		tab.kind === "library" ||
		tab.kind === "agent-sessions" ||
		tab.kind === "maintenance-sessions" ||
		tab.kind === "subsystems" ||
		tab.kind === "maintenance" ||
		tab.kind === "graphify" ||
		tab.kind === "package-layers" ||
		tab.kind === "opencode-v2"
	);
}

/** Narrows to tour tabs — the only tabs that carry a tour payload. */
function isTourTab(tab: TabState): tab is TourTabState {
	return tab.kind === "tour";
}

function summarize(tab: TabState): TabSummary {
	if (tab.kind === "session-events") {
		return { id: tab.id, kind: "session-events", title: tab.title };
	}
	if (tab.kind === "subsystem-model") {
		return {
			id: tab.id,
			kind: "subsystem-model",
			title: tab.title,
			path: subsystemModelFilePath(tab.graphId),
		};
	}
	if (tab.kind === "subsystem-showcase") {
		return { id: tab.id, kind: "subsystem-showcase", title: tab.title };
	}
	if (isStaticTab(tab)) {
		return { id: tab.id, kind: tab.kind, title: tab.title };
	}
	return {
		id: tab.id,
		kind: "tour",
		title: tab.title,
		mode: tab.mode,

	};
}

function fullState(tab: TabState): TabFullState {
	if (tab.kind === "session-events") {
		return {
			ok: true,
			id: tab.id,
			kind: "session-events",
			title: tab.title,
			sessionId: tab.sessionId,
		};
	}
	if (tab.kind === "subsystem-model") {
		return {
			ok: true,
			id: tab.id,
			kind: "subsystem-model",
			title: tab.title,
			graphId: tab.graphId,
			focusTrailId: tab.focusTrailId,
			showIssues: tab.showIssues,
			focusIssueCategory: tab.focusIssueCategory,
			liveSessionId: tab.liveSessionId,
			liveTitle: tab.liveTitle,
			liveAgent: tab.liveAgent,
		};
	}
	if (tab.kind === "subsystem-showcase") {
		return {
			ok: true,
			id: tab.id,
			kind: "subsystem-showcase",
			title: tab.title,
			showcaseIds: tab.showcaseIds,
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
			kind: "tour",
			title: tab.title,
			mode: tab.mode,

			repoRoot: tab.repoRoot,
			tourFilePath: tab.tourFilePath,
		};
	}
	// Resolve repo identity the same way the library listing does: prefer an
	// explicit owner/name carried by the open message,
	// otherwise recover it from the working tree's git origin. This is what lets
	// the tab header show `owner/name` (+ GitHub link) for local tours instead
	// of `local / <path>`.
	const identity =
		tab.repoOwner && tab.repoName
			? { owner: tab.repoOwner, repo: tab.repoName }
			: resolveLocalRepoIdentity(tab.repoRoot);
	return {
		ok: true,
		id: tab.id,
		kind: "tour",
		title: tab.title,
		mode: tab.mode,

		repoRoot: tab.repoRoot,
		tourFilePath: tab.tourFilePath,
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
						kind: "tour",
						title: "",
					};
				}
				return fullState(tab);
			},
			setActiveTab: ({ id }) => {
				// The renderer owns the on-screen tab and switches instantly; this
				// just records the switch as the host's resume suggestion (served
				// back through listTabs if the webview reloads) and, for permanent
				// tabs, persists it so the next launch reopens on it. No broadcast —
				// the renderer already applied the change locally.
				if (!tabs.has(id)) return { ok: false, error: `unknown tab: ${id}` };
				suggestedTabId = id;
				// Transient tabs (tours, models) do not survive a restart, so only
				// permanent ones are worth restoring.
				if (isPermanentTabId(id) && viewerSettings.lastActiveTabId !== id) {
					viewerSettings = patchViewerSettings(viewerSettings, {
						lastActiveTabId: id,
					});
				}
				return { ok: true };
			},
			closeTab: ({ id }) => closeTabById(id),
			readSubsystemFile: async ({ purl, file }) => {
				const root = resolveRepoRootForComponent(purl);
				if (!root) return { ok: false, error: "no local checkout for this repo" };
				try {
					const absolute = resolveSandboxed(root, file);
					const content = await fs.readFile(absolute, "utf8");
					return { ok: true, content };
				} catch (err) {
					return { ok: false, error: (err as Error).message };
				}
			},
		readFile: async ({ tabId, path, repo }) => {
			const tab = getTab(tabId);
			if (!tab) return { ok: false, error: `unknown tab: ${tabId}` };
			if (tab.kind === "subsystem-model") {
				// Preferred: the caller names the repo (step `purl` or repo
				// key) — resolve the checkout straight from Alexandria and
				// serve sandboxed, with no component lookup involved.
				if (repo) {
					const root = resolveRepoRootForComponent(repo);
					if (!root) return { ok: false, error: "graph has no local root for this file" };
					try {
						const absolute = resolveSandboxed(root, path);
						const content = await fs.readFile(absolute, "utf8");
						return { ok: true, content };
					} catch {
						return { ok: false, error: `file not found in graph repos: ${path}` };
					}
				}
				// Legacy bare-path reads: prefer the owning component's
				// checkout, else fall back to the graph's other referenced
				// checkouts (seam files with no exported symbol to anchor).
				// Every candidate stays inside resolveSandboxed.
				const graph = await getSubsystemModel(tab.graphId);
				const component = graph?.components.find((c) => c.file === path);
				const roots: string[] = [];
				const pushRoot = (purl: string | undefined) => {
					const root = purl
						? resolveRepoRootForComponent(purl)
						: undefined;
					if (root && !roots.includes(root)) roots.push(root);
				};
				pushRoot(component?.purl);
				for (const c of graph?.components ?? []) pushRoot(c.purl);
				if (roots.length === 0) return { ok: false, error: "graph has no local root for this file" };
				for (const root of roots) {
					try {
						const absolute = resolveSandboxed(root, path);
						const content = await fs.readFile(absolute, "utf8");
						return { ok: true, content };
					} catch {
						/* not under this root — try the next referenced checkout */
					}
				}
				return { ok: false, error: `file not found in graph repos: ${path}` };
			}
				if (!isTourTab(tab)) {
					return { ok: false, error: `${tab.kind} tab does not serve files` };
				}
				return readFileLocal(tab, path);
			},
			getFileTree: async ({ tabId, path }) => {
				const walkPath = path ?? null;
				if (!walkPath) {
					const tab = getTab(tabId);
					if (!tab || !isTourTab(tab)) return { files: [] };
					return { files: await walkFiles(tab.repoRoot) };
				}
				return { files: await walkFiles(walkPath) };
			},
			getRepoFileTree: async ({ purl }) => {
				const root = resolveRepoRootForComponent(purl);
				if (!root) {
					return { files: [], error: "no local checkout for this repo" };
				}
				try {
					return { files: await walkFiles(root), repoRoot: root };
				} catch (err) {
					return { files: [], error: (err as Error).message };
				}
			},
			listTours: async () => {
				const entries = (await walkTours()).sort(
					(a, b) => b.mtimeMs - a.mtimeMs,
				);
				return { entries };
			},
			listSessions: async ({ days }) => buildSessionIndex({ days }),
			listMaintainSessions: async ({ days, limit }) =>
				listMaintainSessions({ days, limit }),
			listSubsystemModelRuns: async ({ graphId, days, limit }) => ({
				ok: true as const,
				runs: await listSubsystemModelRuns({ graphId, days, limit }),
			}),

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
			writeClipboard: ({ text }) => {
				// The webview's navigator.clipboard requires the click's transient
				// activation, which is gone once we await the brief RPC first. Write
				// from the host instead (macOS-only app).
				try {
					const proc = Bun.spawnSync({
						cmd: ["pbcopy"],
						stdin: Buffer.from(text),
						stdout: "pipe",
						stderr: "pipe",
					});
					if (proc.exitCode === 0) return { ok: true };
					return {
						ok: false,
						error:
							proc.stderr.toString().trim() || `pbcopy exited ${proc.exitCode}`,
					};
				} catch (err) {
					return { ok: false, error: (err as Error).message };
				}
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
				// Source repoRoot/token from a tour tab (the suggested/active one
				// first, else any) for the git/token fallbacks. The gh-CLI path
				// needs neither.
				const active = getTab(suggestedTabId);
				const tourTab =
					active && active.kind === "tour"
						? active
						: (Array.from(tabs.values()).find(
								(t): t is TourTabState => t.kind === "tour",
						  ) ?? null);
				return resolveUserIdentity(tourTab?.repoRoot, tourTab?.ghToken);
			},
			getSettings: () => viewerSettings,
			setSettings: ({ settings }) => {
				viewerSettings = patchViewerSettings(viewerSettings, settings);
				const prevSuggested = suggestedTabId;
				syncPermanentTabs(viewerSettings);
				regularAuditScheduler.sync(viewerSettings);
				broadcastTabsChanged(
					suggestedTabId !== prevSuggested ? suggestedTabId : undefined,
				);
				return { ok: true, settings: viewerSettings };
			},
			getRegularAuditStatus: () => regularAuditScheduler.getStatus(),
			getOpencodeServerStatus: async () => probeOpencodeServer(),
			getServerSessions: async () => listRecentServerSessions(),
			setServerEventWatch: async ({ active }) => {
				setServerEventWatch(active, active ? broadcastServerEvents : undefined);
				return { ok: true };
			},
			openTourFromCache: async ({ file, repoRoot }) => {
				try {
					// Tours are always local-mode: they render against a working tree,
					// never a marker-derived remote file set. The host resolves the
					// tour's repo from Alexandria when the caller has no repoRoot.
					const msg: LoadTourMessage = {
						kind: "LOAD_TOUR",
						tourFile: file,
						mode: "local",
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

			getAgentSessionsOverview: async ({ days, scope }) => {
				try {
					const processSummaries = async (
						sessions: SessionSummary[],
					): Promise<
						Array<{
							id: string;
							agent: string;
							session: { slug: string; title: string; agent?: string };
							repoRoot?: string;
							repos: RepoInfo[];
							events: SessionEventRow[];
						}>
					> => {
						const processed: Array<{
							id: string;
							agent: string;
							session: { slug: string; title: string; agent?: string };
							repoRoot?: string;
							repos: RepoInfo[];
							events: SessionEventRow[];
						}> = [];
						for (const s of sessions) {
							const res = await buildSessionEvents(s.id, {
								includeRaw: false,
								useCache: true,
							});
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
						return processed;
					};

					if (scope === "maintain") {
						const index = await listMaintainSessions({ days });
						return {
							ok: true,
							groups: [],
							standalone: index.sessions,
							hasMore: index.hasMore,
							processed: await processSummaries(index.sessions),
						};
					}

					const index = await buildSessionIndex({ days });
					const sessions: SessionSummary[] = [];
					for (const g of index.groups) sessions.push(g.parent);
					sessions.push(...index.standalone);
					return {
						ok: true,
						groups: index.groups,
						standalone: index.standalone,
						hasMore: index.hasMore,
						processed: await processSummaries(sessions),
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

			getSubsystemModel: async ({ graphId }) => {
				const graph = await getSubsystemModel(graphId);
				if (!graph) return { ok: false, error: `unknown graph: ${graphId}` };
				// Overlay accepted signature augmentations for display only —
				// never written back to the stored model.
				const components = await attachSignatureAugmentations(graph.components);
				return { ok: true, graph: { ...graph, components } };
			},
			updateSubsystemModel: async ({ graphId, patch }) => {
				const updated = await updateSubsystemModel(graphId, patch);
				if (!updated) return { ok: false, error: `unknown graph: ${graphId}` };
				return { ok: true, graph: updated };
			},
			getComposedSubsystemModel: async ({ repoKey, modelIds }) => {
				const entries = await listSubsystemModels();
				// A showcase tab passes its id set; without one, compose every
				// model touching the repo (the permanent Subsystems tab).
				const scope = modelIds ? new Set(modelIds) : null;
				const models: MergeInputModel[] = [];
				for (const e of entries) {
					if (scope && !scope.has(e.id)) continue;
					const full = await getSubsystemModel(e.id);
					if (!full) continue;
					const touches = (full.components ?? []).some(
						(c) => (purlRepoKey(c.purl) ?? "__no-repo__") === repoKey,
					);
					if (touches) models.push({ 
						id: e.id, 
						document: full,
						verifiedAtCommits: full.verifiedAtCommits,
					});
				}
				const merged = mergeSubsystemModels(models);
				// Overlay accepted signature augmentations for display only.
				const components = await attachSignatureAugmentations(
					merged.document.components,
				);
				return {
					ok: true as const,
					document: { ...merged.document, components },
					sidecar: merged.sidecar,
					modelIds: models.map((m) => m.id),
				};
			},
			listSubsystemModels: async () => {
				const entries = await listSubsystemModels();
				const graphs = await Promise.all(
					entries.map(async (e) => {
						const full = await getSubsystemModel(e.id);
						const graphify = full
							? await assessSubsystemGraphifyReadiness(full, graphifyBuildingPurls)
							: undefined;
								let lastAudit:
							| {
									checkedAt: string;
									needsUpdate: boolean;
									issueCount: number;
									verdict: "fully_verified" | "partially_verified" | "issues";
									stale: boolean;
									verification?: SubsystemModelVerification;
							  }
							| undefined;
						if (full) {
							const fingerprint = await buildAuditFingerprint({
								updatedAt: full.updatedAt,
								components: full.components,
								graphify,
							});
							const summary = await getSubsystemModelAuditListSummary(
								e.id,
								fingerprint,
								{ hasTrails: (full.trails?.length ?? 0) > 0 },
							);
							if (summary) {
								lastAudit = {
									checkedAt: summary.checkedAt,
									needsUpdate: summary.needsUpdate,
									issueCount: summary.issueCount,
									verdict: summary.verdict,
									stale: summary.stale,
									verification: summary.verification,
								};
							}
						}
						const pendingCount = await pendingProposalCount(e.id);
						return {
							id: e.id,
							title: e.title,
							description: e.description,
							componentCount: e.componentCount,
							edgeCount: e.edgeCount,
							createdAt: e.createdAt,
							updatedAt: e.updatedAt,
							lastOpenedAt: e.lastOpenedAt,
						repos: full
							? githubReposFromComponents(full.components)
							: undefined,
					files: full
						? subsystemFilesFromComponents(full.components)
						: undefined,
					trails: full
						? subsystemTrailsFromModel(full.trails)
						: undefined,
						path: subsystemModelFilePath(e.id),
							gist: e.gist ?? full?.gist,
							graphify,
							lastAudit,
							createdAtCommits: full?.createdAtCommits,
							verifiedAtCommits: full?.verifiedAtCommits,
							purlFreshness:
								full && (full.createdAtCommits || full.verifiedAtCommits)
									? await purlCommitFreshness(full, full.components)
									: undefined,
							pendingProposalCount: pendingCount > 0 ? pendingCount : undefined,
						};
					}),
				);
				return { graphs };
			},
			getMaintenanceOverview: async () => {
				const entries = await listSubsystemModels();
				const overviewRows = await Promise.all(
					entries.map(async (e): Promise<
						[MaintenanceOverviewModel, MaintenanceOverviewProposal[]]
					> => {
						const full = await getSubsystemModel(e.id);
						let verdict: MaintenanceOverviewModel["verdict"] = "unknown";
						let verification: SubsystemModelVerification | undefined;
						let lanes: MaintenanceOverviewModel["lanes"] = {
							construct: "none",
							"static-topology": "none",
							"dynamic-topology": "none",
							trail: "none",
						};
						let stale = false;
						let checkedAt: string | undefined;
						if (full) {
							const graphify = await assessSubsystemGraphifyReadiness(
								full,
								graphifyBuildingPurls,
							);
							const fingerprint = await buildAuditFingerprint({
								updatedAt: full.updatedAt,
								components: full.components,
								graphify,
							});
							const summary = await getSubsystemModelAuditListSummary(
								e.id,
								fingerprint,
								{ hasTrails: (full.trails?.length ?? 0) > 0 },
							);
							if (summary) {
								verdict = summary.verdict;
								verification = summary.verification;
								lanes = summary.lanes;
								stale = summary.stale;
								checkedAt = summary.checkedAt;
							}
						}
						// Cheap provenance tier — a couple of git calls per referenced
						// repo, reusing the record this handler already fetched. Runs
						// per model on every overview pass, so it deliberately excludes
						// the per-commit walk (see getModelProvenanceDetail).
						// `auditVerdict` rides along so the badge can refuse to read
						// "Verified" when the saved audit no longer supports it — the
						// pin says the code did not move; it says nothing about
						// whether the audit that earned it still passes.
						const provenance = full
							? {
									...(await modelProvenance({
										createdAtCommits: full.createdAtCommits,
										verifiedAtCommits: full.verifiedAtCommits,
										components: full.components,
										trails: full.trails,
									})),
									auditVerdict: verdict === "unknown" ? undefined : verdict,
								}
							: undefined;
						// Carry the pin forward when nothing anchored moved. The proof is
						// content identity, not a re-audit — but it is a write, so it only
						// fires when a repo actually needs a new pin.
						if (provenance) await applyAutoRePin(e.id, provenance, full);
						const pending = await listSubsystemModelProposals(e.id);
						const lastRun = (
							await listSubsystemModelRuns({ graphId: e.id, limit: 1 })
						)[0];
						const model: MaintenanceOverviewModel = {
							provenance,
							graphId: e.id,
							title: e.title,
							verdict,
							verified: verification?.verified ?? 0,
							open: verification?.open ?? 0,
							blocking: verification?.blocking ?? 0,
							blocked: verification?.blocked ?? 0,
							na: verification?.na ?? 0,
							coverage: verification?.coverage ?? 0,
							pendingProposalCount: pending.length,
							recentRunAt: lastRun?.startedAt,
							stale,
							checkedAt,
							lanes,
							repos: githubReposFromComponents(full?.components ?? []),
							nextRoute: await nextMaintainRouteForModel(e.id),
						};
						return [
							model,
							pending.map((proposal) => ({
								graphId: e.id,
								title: e.title,
								proposal,
							})),
						];
					}),
				);
				const models = overviewRows.map(([model]) => model);
				const pendingProposals = overviewRows.flatMap(
					([, props]) => props,
				);
				return {
					ok: true as const,
					overview: buildMaintenanceOverview({
						models,
						pendingProposals,
						running: entries
							.filter((e) => maintainingGraphIds.has(e.id))
							.map((e) => e.id),
						auditing: entries
							.filter((e) => auditingGraphIds.has(e.id))
							.map((e) => e.id),
					}),
				};
			},
			openSubsystemModel: async ({
				graphId,
				trailId,
				showIssues,
				focusIssueCategory,
			}) => {
				const tabId = await openSubsystemModelTab(graphId, trailId, {
					showIssues,
					focusIssueCategory,
				});
				if (!tabId) return { ok: false, error: `unknown graph: ${graphId}` };
				return { ok: true, tabId };
			},
			deleteSubsystemModel: async ({ graphId }) => deleteGraphAndCloseTabs(graphId),
			shareSubsystemModelAsGist: async ({ graphId }) => {
				const graph = await getSubsystemModel(graphId);
				if (!graph) return { ok: false, error: `unknown graph: ${graphId}` };
				const result = await publishSubsystemModelGist({
					document: graph,
					existing: graph.gist ?? null,
				});
				if (!result.ok) return { ok: false, error: result.error };
				const updated = await updateSubsystemModel(graphId, {
					gist: { id: result.gistId, fileName: result.fileName },
				});
				if (!updated) {
					return {
						ok: false,
						error: `Gist published (${result.gistId}) but failed to stamp the local record.`,
					};
				}
				return {
					ok: true,
					gistId: result.gistId,
					gistUrl: result.gistUrl,
					viewUrl: result.viewUrl,
					fileName: result.fileName,
					created: result.created,
				};
			},
			verifySubsystemComponent: async ({ graphId, componentAlias }) =>
				verifySubsystemComponent(graphId, componentAlias),
			inspectSubsystemSymbol: async ({ purl, file, symbol, nodeId }) =>
				inspectSubsystemSymbol({ purl, file, symbol, nodeId }),
			auditSubsystemModel: async ({ graphId }) =>
				auditAndStageOneClickFixes(graphId),
			auditSubsystemModels: async ({ graphIds }) => {
				auditSubsystemModelsInBackground(graphIds);
				return { ok: true, started: true };
			},
			applySubsystemModelAuditFix: async ({ graphId, fixId, componentAlias }) => {
				const applied = await applySubsystemModelAuditFix({
					graphId,
					fixId,
					componentAlias,
				});
				// A per-finding Apply closes that finding, so the staged batch no
				// longer describes reality — drop it rather than offer stale work.
				if (applied.ok) {
					pendingAuditFixPreviews.delete(graphId);
					// The write landed on disk: notify every surface (graph canvas,
					// Maintain list, badges) exactly as the batch path does, so the
					// change appears without a close/reopen.
					broadcastSubsystemModelChanged({ graphId, reason: "updated" });
					broadcastSubsystemModelProposalsChanged({
						graphId,
						pendingCount: await pendingProposalCount(graphId),
					});
				}
				return applied;
			},
			getPendingAuditFixes: async ({ graphId }) => ({
				ok: true,
				groups: pendingAuditFixPreviews.get(graphId) ?? [],
			}),
			resolvePendingAuditFixes: async ({ graphId, apply }) => {
				const groups = pendingAuditFixPreviews.get(graphId) ?? [];
				pendingAuditFixPreviews.delete(graphId);
				if (!apply) return { ok: true, applied: 0 };
				// Each kind is one unscoped call, which re-verifies every
				// component for that fix before writing — so a kind with no
				// adoptable instance fails softly rather than aborting the rest.
				let applied = 0;
				let lastReport: SubsystemModelAuditReport | undefined;
				let lastFingerprint: string | undefined;
				let lastError: string | undefined;
				for (const group of groups) {
					const res = await applySubsystemModelAuditFix({
						graphId,
						fixId: group.fixId,
					});
					if (!res.ok) {
						lastError = res.error;
						continue;
					}
					applied += res.applied ?? 0;
					lastReport = res.report;
					lastFingerprint = res.fingerprint;
				}
				if (applied === 0 && lastError) {
					return { ok: false, error: lastError };
				}
				broadcastSubsystemModelChanged({ graphId, reason: "updated" });
				broadcastSubsystemModelProposalsChanged({
					graphId,
					pendingCount: await pendingProposalCount(graphId),
				});
				return {
					ok: true,
					applied,
					report: lastReport,
					fingerprint: lastFingerprint,
				};
			},
			// Expensive provenance tier: the per-commit walk and the remote's
			// position on it. Deliberately a separate call from the cheap
			// snapshot that rides on list/overview passes — a whole-log read per
			// referenced repo does not belong on a path that runs per model per
			// refresh.
			getModelProvenanceDetail: async ({ id }) => {
				const full = await getSubsystemModel(id);
				if (!full) return { id };
				const snapshot = await modelProvenance({
					createdAtCommits: full.createdAtCommits,
					verifiedAtCommits: full.verifiedAtCommits,
					components: full.components,
					trails: full.trails,
				});
				return await modelProvenanceDetail(id, {
					createdAtCommits: full.createdAtCommits,
					verifiedAtCommits: full.verifiedAtCommits,
					components: full.components,
					trails: full.trails,
				}, snapshot.anchorChanges);
			},
			getSubsystemModelAudit: async ({ graphId }) => {
				const full = await getSubsystemModel(graphId);
				if (!full) return { ok: false, error: `unknown graph: ${graphId}` };
				const saved = await loadSubsystemModelAudit(graphId);
				if (!saved) return { ok: false, error: `no audit saved for ${graphId}` };
				const graphify = await assessSubsystemGraphifyReadiness(
					full,
					graphifyBuildingPurls,
				);
				const live = await buildAuditFingerprint({
					updatedAt: full.updatedAt,
					components: full.components,
					graphify,
				});
				return {
					ok: true,
					report: saved.report,
					fingerprint: saved.fingerprint,
					checkedAt: saved.report.checkedAt,
					stale: saved.fingerprint !== live,
					// The per-lane statuses the maintainer shows — the issues list
					// renders the same statuses so a layer with nothing to verify
					// reads "not applicable" (grey), not "verified" (green).
					lanes: summarizeLanes(saved.report, {
						hasTrails: (full.trails?.length ?? 0) > 0,
					}),
				};
			},
			getSubsystemModelNextRoute: async ({ graphId }) => {
				const route = await nextMaintainRouteForModel(graphId);
				return {
					ok: true,
					next: route
						? { agent: route.agent, layer: route.layer, mode: route.mode }
						: null,
				};
			},
			getSubsystemModelBrief: async ({ graphId }) => {
				const full = await getSubsystemModel(graphId);
				if (!full) return { ok: false, error: `unknown graph: ${graphId}` };
				const saved = await loadSubsystemModelAudit(graphId);
				const graphify = await assessSubsystemGraphifyReadiness(
					full,
					graphifyBuildingPurls,
				);
				const live = await buildAuditFingerprint({
					updatedAt: full.updatedAt,
					components: full.components,
					graphify,
				});
				return {
					ok: true,
					brief: buildVerificationBrief({
						graph: full,
						report: saved?.report,
						stale: saved ? saved.fingerprint !== live : undefined,
					}),
					checkedAt: saved?.report.checkedAt,
					stale: saved ? saved.fingerprint !== live : undefined,
				};
			},
			listSubsystemModelProposals: async ({ graphId, includeResolved }) => {
				const full = await getSubsystemModel(graphId);
				if (!full) return { ok: false, error: `unknown graph: ${graphId}` };
				const proposals = await listSubsystemModelProposals(graphId, {
					includeResolved: includeResolved === true,
				});
				const pendingCount = await pendingProposalCount(graphId);
				return { ok: true, proposals, pendingCount };
			},
			proposeSubsystemModelCorrection: async ({
				graphId,
				rationale,
				changes,
				finding,
				author,
				runId,
			}) => {
				const created = await createSubsystemModelProposal({
					graphId,
					rationale,
					changes,
					finding,
					author,
					runId,
				});
				if (!created.ok) return { ok: false, error: created.error };
				let proposal = created.proposal;
				let autoAccepted = false;
				if (viewerSettings.autoAcceptSubsystemModelProposals) {
					const graph = await getSubsystemModel(graphId);
					const sourceContext = graph
						? await buildProposalSourceContext(graph, proposal)
						: undefined;
					const gate = await autoAcceptProposalIfConfident(
						graphId,
						proposal,
						{
							enabled: true,
							threshold:
								viewerSettings.autoAcceptSubsystemModelConfidenceThreshold,
							apiKey: viewerSettings.typesafeApiKey ?? undefined,
							sourceContext,
						},
					);
					proposal = gate.proposal;
					autoAccepted = gate.accepted;
				}
				const pendingCount = await pendingProposalCount(graphId);
				broadcastSubsystemModelProposalsChanged({ graphId, pendingCount });
				if (autoAccepted) {
					broadcastSubsystemModelChanged({ graphId, reason: "updated" });
				}
				return { ok: true, proposal, autoAccepted };
			},
			acceptSubsystemModelProposal: async ({ graphId, proposalId }) => {
				const result = await acceptProposalInStore(graphId, proposalId);
				if (!result.ok) return { ok: false, error: result.error };
				const pendingCount = await pendingProposalCount(graphId);
				broadcastSubsystemModelProposalsChanged({ graphId, pendingCount });
				broadcastSubsystemModelChanged({ graphId, reason: "updated" });
				return { ok: true, proposal: result.proposal };
			},
			rejectSubsystemModelProposal: async ({ graphId, proposalId }) => {
				const result = await rejectProposalInStore(graphId, proposalId);
				if (!result.ok) return { ok: false, error: result.error };
				const pendingCount = await pendingProposalCount(graphId);
				broadcastSubsystemModelProposalsChanged({ graphId, pendingCount });
				return { ok: true, proposal: result.proposal };
			},
			deleteAllSubsystemModelProposals: async () => {
				const result = await deleteAllPendingSubsystemModelProposals();
				for (const graphId of result.graphIds) {
					broadcastSubsystemModelProposalsChanged({ graphId, pendingCount: 0 });
				}
				return { ok: true, deleted: result.deleted };
			},
			deleteSubsystemModelProposals: async ({ graphId }) => {
				await deleteSubsystemModelProposals(graphId);
				const pendingCount = await pendingProposalCount(graphId);
				broadcastSubsystemModelProposalsChanged({ graphId, pendingCount });
				return { ok: true };
			},
			scoreSubsystemModelProposal: async ({ graphId, proposalId, force }) => {
				const existing = await getSubsystemModelProposal(graphId, proposalId);
				if (!existing) return { ok: false, error: `unknown proposal: ${proposalId}` };
				if (existing.secondOpinion && !existing.secondOpinion.error && !force) {
					return { ok: true, proposal: existing, cached: true };
				}
				const graph = await getSubsystemModel(graphId);
				const sourceContext = graph
					? await buildProposalSourceContext(graph, existing)
					: undefined;
				const opinion = await evaluateProposalSecondOpinion(existing, {
					apiKey: viewerSettings.typesafeApiKey ?? undefined,
					sourceContext,
				});
				const stored = await setProposalSecondOpinion(graphId, proposalId, opinion);
				if (!stored.ok) return { ok: false, error: stored.error };
				const pendingCount = await pendingProposalCount(graphId);
				broadcastSubsystemModelProposalsChanged({ graphId, pendingCount });
				return { ok: true, proposal: stored.proposal, cached: false };
			},
			maintainSubsystemModel: async ({ graphId, model, remember }) => {
				const full = await getSubsystemModel(graphId);
				if (!full) return { ok: false, error: `unknown graph: ${graphId}` };
				if (maintainingGraphIds.has(graphId)) {
					return { ok: true, started: false, alreadyRunning: true };
				}
				if (remember === true) {
					const trimmed = typeof model === "string" ? model.trim() : "";
					viewerSettings = patchViewerSettings(viewerSettings, {
						subsystemMaintainerModel: trimmed.length > 0 ? trimmed : null,
					});
				}
				maintainSubsystemModelInBackground(graphId, {
					model: typeof model === "string" && model.trim() ? model.trim() : undefined,
				});
				return { ok: true, started: true };
			},
			openMaintainLive: async ({ sessionId, graphId, title, agent }) => {
				if (!sessionId) return { ok: false, error: "sessionId is required" };
				return await openMaintainLive({ sessionId, graphId, title, agent });
			},
			getSubsystemMaintainerModels: async ({ refresh }) => {
				try {
					const resolved = await resolveSubsystemMaintainerModel({
						configured: viewerSettings.subsystemMaintainerModel,
						refresh: refresh === true,
					});
					const toRow = (m: OpenCodeModelInfo) => ({
						ref: m.ref,
						id: m.id,
						providerID: m.providerID,
						name: m.name,
					});
					const freeModels = resolved.freeModels.map(toRow);
					const models = (resolved.candidates ?? resolved.freeModels).map(
						toRow,
					);
					const goModels = (resolved.goModels ?? []).map(toRow);
					const credentialed = resolved.credentialedProviders;
					let note: string | undefined;
					const remembered = viewerSettings.subsystemMaintainerModel;
					if (
						credentialed &&
						!credentialed.includes("opencode") &&
						freeModels.length > 0 &&
						!freeModels.some((m) => m.ref === resolved.model)
					) {
						note = `OpenCode Zen free models (opencode/*) need an OpenCode Zen credential, which is not configured here — using ${resolved.model} instead.`;
					}
					if (
						credentialed &&
						remembered &&
						modelProviderOf(remembered) &&
						!credentialed.includes(modelProviderOf(remembered)) &&
						resolved.model !== remembered
					) {
						note = `Remembered model ${remembered} is unusable (no credential for its provider) — using ${resolved.model} instead.`;
					}
					return {
						ok: true,
						resolved: resolved.model,
						source: resolved.source,
						configured: viewerSettings.subsystemMaintainerModel,
						freeModels,
						models:
							models.length > 0
								? models
								: freeModels,
						goModels,
						note,
					};
				} catch (err) {
					return {
						ok: false,
						error: err instanceof Error ? err.message : String(err),
					};
				}
			},
			getGraphifyStatus: async ({ detailed }) => {
				const base = withGraphifyCliBusy(
					cachedDetailedGraphifyStatus ?? getGraphifyStatus(),
				);
				if (detailed) {
					refreshGraphifyStatusDetailed();
				}
				return base;
			},
			getOpencodeV2Status: async ({ detailed }) => {
				const base = withOpencodeV2CliBusy(
					cachedDetailedOpencodeV2Status ?? getOpencodeV2Status(),
				);
				if (detailed) {
					refreshOpencodeV2StatusDetailed();
				}
				return base;
			},
			installOpencodeV2: async () => startOpencodeV2CliJob("install"),
			updateOpencodeV2: async () => startOpencodeV2CliJob("update"),
			getOpencodeV2ProbeState: async () => getOpencodeV2ProbeState(),
			startOpencodeV2Probe: async ({ message, directory }) => {
				setOpencodeV2ProbeListener((probeState) => {
					broadcastOpencodeV2ProbeChanged({ state: probeState });
				});
				return startOpencodeV2Probe({
					message: typeof message === "string" ? message : undefined,
					directory: typeof directory === "string" ? directory : undefined,
				});
			},
			stopOpencodeV2Probe: async () => stopOpencodeV2Probe(),
			getOpencodeLiveFeed: async ({ sessionId }) => {
				const feed = getOpencodeLiveFeed(sessionId);
				if (!feed) return { ok: false };
				return {
					ok: true,
					sessionId: feed.sessionId,
					status: feed.status,
					events: feed.events,
					total: feed.total,
					error: feed.error,
					title: feed.title,
					agent: feed.agent,
					graphId: feed.graphId,
				};
			},
			getMaintainRunState: async ({ graphId }) => {
				const feed = getOpencodeLiveFeedByGraphId(graphId);
				const feedRunning =
					feed?.status === "running" || feed?.status === "starting";
				return {
					ok: true,
					running: maintainingGraphIds.has(graphId) || feedRunning,
					sessionId: feed?.sessionId,
					title: feed?.title,
					agent: feed?.agent,
					status: feed?.status,
				};
			},
			getStudioVersionStatus: async ({ detailed }) => {
				const base = cachedDetailedStudioVersion ?? getStudioVersionStatus();
				if (detailed) {
					refreshStudioVersionDetailed();
				}
				return base;
			},
			updateStudio: async () => startStudioUpdate(),
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

				const work = ensureGraphifyGraph({
					purl: key,
					repoRoot,
					force,
				});
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
			listPackageLayers: async () => {
				const entries = await listPackageLayers();
				return {
					layers: entries.map((e) => ({
						purl: e.purl,
						purlKey: e.purlKey,
						headSha: e.headSha,
						dirtyHash: e.dirtyHash,
						slotKey: e.slotKey,
						repoRoot: e.repoRoot,
						builtAt: e.builtAt,
						packageCount: e.packageCount,
						isMonorepo: e.isMonorepo,
						rootPackageName: e.rootPackageName,
						packagesJsonPath: e.packagesJsonPath,
					})),
				};
			},
			listPackageLayerRepos: async () => ({
				repos: await listPackageLayerRepos(undefined, packageLayersBuildingPurls),
			}),
			ensurePackageLayers: async ({ purl, repoRoot, force }) => {
				const key = purl.trim();
				if (packageLayersBuildingPurls.has(key)) {
					return { ok: true, status: "building", purl: key };
				}

				packageLayersBuildingPurls.add(key);
				broadcastPackageLayersChanged({ kind: "repos" });

				const work = ensurePackageLayers({
					purl: key,
					repoRoot,
					force,
				});
				const raced = await Promise.race([
					work.then((r) => ({ done: true as const, r })),
					sleepMs(250).then(() => ({ done: false as const })),
				]);

				if (raced.done) {
					packageLayersBuildingPurls.delete(key);
					const result = raced.r;
					if (!result.ok) {
						broadcastPackageLayersChanged({
							kind: "ensure",
							purl: key,
							ensure: {
								ok: false,
								error: result.error,
								durationMs: result.durationMs,
							},
						});
						return {
							ok: false,
							error: result.error,
							purl: result.purl,
							durationMs: result.durationMs,
						};
					}
					broadcastPackageLayersChanged({
						kind: "ensure",
						purl: key,
						ensure: {
							ok: true,
							status: result.status,
							packageCount: result.packageCount,
							isMonorepo: result.isMonorepo,
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
						packagesJsonPath: result.packagesJsonPath,
						packageCount: result.packageCount,
						isMonorepo: result.isMonorepo,
						durationMs: result.durationMs,
					};
				}

				void work
					.then((result) => {
						packageLayersBuildingPurls.delete(key);
						if (!result.ok) {
							broadcastPackageLayersChanged({
								kind: "ensure",
								purl: key,
								ensure: {
									ok: false,
									error: result.error,
									durationMs: result.durationMs,
								},
							});
							return;
						}
						broadcastPackageLayersChanged({
							kind: "ensure",
							purl: key,
							ensure: {
								ok: true,
								status: result.status,
								packageCount: result.packageCount,
								isMonorepo: result.isMonorepo,
								durationMs: result.durationMs,
							},
						});
					})
					.catch((err) => {
						packageLayersBuildingPurls.delete(key);
						broadcastPackageLayersChanged({
							kind: "ensure",
							purl: key,
							ensure: {
								ok: false,
								error: err instanceof Error ? err.message : String(err),
							},
						});
					});

				return { ok: true, status: "building", purl: key };
			},
			openSessionEventsTab: async ({ sessionId, title, agent }) => {
				const agentName = (agent ?? "").toLowerCase();
				const rawFeedAgents = new Set(["opencode", "cursor"]);
				if (agentName && !rawFeedAgents.has(agentName)) {
					return { ok: false, error: "agent not supported" };
				}
				const tabId = openSessionEventsTab(sessionId, title, agent);
				return { ok: true, tabId };
			},
		};

/**
 * Graphify work (extract / uv install) outlives the Electrobun RPC window
 * (host maxRequestTime is 5s). Return quickly,
 * finish in the background, push `graphifyChanged`.
 */
const graphifyBuildingPurls = new Set<string>();
const packageLayersBuildingPurls = new Set<string>();
let graphifyCliBusy: "install" | "update" | "uninstall" | null = null;
let cachedDetailedGraphifyStatus: GraphifyCliStatus | null = null;
let detailedRefreshInflight: Promise<void> | null = null;
let cachedDetailedStudioVersion: StudioVersionStatus | null = null;
let studioVersionRefreshInflight: Promise<void> | null = null;
let opencodeV2CliBusy: "install" | "update" | null = null;
let cachedDetailedOpencodeV2Status: OpencodeV2Status | null = null;
let opencodeV2RefreshInflight: Promise<void> | null = null;

function sleepMs(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function withGraphifyCliBusy(status: GraphifyCliStatus): GraphifyCliStatus {
	return { ...status, cliBusy: graphifyCliBusy };
}

function withOpencodeV2CliBusy(status: OpencodeV2Status): OpencodeV2Status {
	return { ...status, cliBusy: opencodeV2CliBusy };
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

function broadcastPackageLayersChanged(
	payload: StudioMessages["packageLayersChanged"],
): void {
	try {
		(rpc.send as unknown as Record<string, (p: unknown) => void>)[
			"packageLayersChanged"
		](payload);
	} catch (err) {
		console.warn(
			`[principal-studio] could not notify renderer (packageLayersChanged): ${(err as Error).message}`,
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

function broadcastSubsystemModelProposalsChanged(
	payload: StudioMessages["subsystemModelProposalsChanged"],
): void {
	try {
		(rpc.send as unknown as Record<string, (p: unknown) => void>)[
			"subsystemModelProposalsChanged"
		](payload);
	} catch (err) {
		console.warn(
			`[principal-studio] could not notify renderer (subsystemModelProposalsChanged): ${(err as Error).message}`,
		);
	}
}

function broadcastSubsystemModelRunsChanged(
	payload: StudioMessages["subsystemModelRunsChanged"],
): void {
	try {
		(rpc.send as unknown as Record<string, (p: unknown) => void>)[
			"subsystemModelRunsChanged"
		](payload);
	} catch (err) {
		console.warn(
			`[principal-studio] could not notify renderer (subsystemModelRunsChanged): ${(err as Error).message}`,
		);
	}
}

function broadcastSubsystemModelMaintainChanged(
	payload: StudioMessages["subsystemModelMaintainChanged"],
): void {
	try {
		(rpc.send as unknown as Record<string, (p: unknown) => void>)[
			"subsystemModelMaintainChanged"
		](payload);
	} catch (err) {
		console.warn(
			`[principal-studio] could not notify renderer (subsystemModelMaintainChanged): ${(err as Error).message}`,
		);
	}
}

function broadcastRegularAuditChanged(
	payload: StudioMessages["regularAuditChanged"],
): void {
	try {
		(rpc.send as unknown as Record<string, (p: unknown) => void>)[
			"regularAuditChanged"
		](payload);
	} catch (err) {
		console.warn(
			`[principal-studio] could not notify renderer (regularAuditChanged): ${(err as Error).message}`,
		);
	}
}

/** Graphs with an in-flight Maintain agent run. */
const maintainingGraphIds = new Set<string>();

/**
 * Graphs being re-audited after a confirmed proposal. Distinct from
 * `maintainingGraphIds` (agent runs) and from the regular-audit pass; only
 * user-visible re-audits land here so the Maintain panel can show a spinner.
 */
const auditingGraphIds = new Set<string>();



/**
 * Group a report's one-click fixes by `fix.id` so the confirmation preview can
 * offer one action per kind. Every fix of a kind shares the same RPC and the
 * same write path, so a group is applied by a single unscoped call; scoped
 * calls stay reserved for the per-finding Apply buttons.
 */
function pendingAuditFixesByKind(
	report: SubsystemModelAuditReport,
): SubsystemModelAuditFixGroup[] {
	const byFix = new Map<string, number>();
	for (const finding of report.findings) {
		if (!finding.fix) continue;
		byFix.set(finding.fix.id, (byFix.get(finding.fix.id) ?? 0) + 1);
	}
	return [...byFix.entries()].map(([fixId, count]) => ({
		fixId: fixId as SubsystemModelAuditFixGroup["fixId"],
		count,
	}));
}

/**
 * One-click fixes an audit found, waiting on the user's confirmation.
 * In-memory and single-slot per model: the preview is a transient offer, and
 * the next audit for that model replaces it. Nothing is written to the model
 * until the user resolves it.
 */
const pendingAuditFixPreviews = new Map<
	string,
	SubsystemModelAuditFixGroup[]
>();

function setPendingAuditFixPreview(
	graphId: string,
	groups: SubsystemModelAuditFixGroup[],
): void {
	pendingAuditFixPreviews.set(graphId, groups);
}

/** Audit, then stage any one-click fixes it found for confirmation. */
async function auditAndStageOneClickFixes(
	graphId: string,
): Promise<
	| { ok: true; report: SubsystemModelAuditReport; fingerprint: string }
	| { ok: false; error: string }
> {
	const audited = await auditSubsystemModel(graphId);
	if (!audited.ok) return audited;
	if (viewerSettings.autoApplyAuditFixes) {
		const groups = pendingAuditFixesByKind(audited.report);
		if (groups.length > 0) setPendingAuditFixPreview(graphId, groups);
	}
	return audited;
}

/**
 * Re-run deterministic audit after model mutations so list badges aren't stale.
 *
 * `surface: true` marks the graph as user-visible-auditing so the Maintain
 * surface shows a spinner; the background regular-audit pass leaves it false.
 * Callers that don't need the result should fire-and-forget so a full audit
 * never blocks a user action.
 */
async function reauditSubsystemModelQuietly(
	graphId: string,
	opts?: { surface?: boolean },
): Promise<void> {
	const surface = opts?.surface === true;
	if (surface) {
		auditingGraphIds.add(graphId);
		// Let the Maintain surface paint the "auditing" state immediately.
		broadcastSubsystemModelChanged({ graphId, reason: "updated" });
	}
	try {
		const audited = await auditAndStageOneClickFixes(graphId);
		if (!audited.ok) {
			console.warn(
				`[principal-studio] re-audit after model change failed for ${graphId}: ${audited.error}`,
			);
		}
	} catch (err) {
		console.warn(
			`[principal-studio] re-audit after model change failed for ${graphId}: ${(err as Error).message}`,
		);
	} finally {
		// Clear the auditing flag *before* broadcasting so the surface paints the
		// finished state (fresh report + spinner off) in one push.
		if (surface) auditingGraphIds.delete(graphId);
		broadcastSubsystemModelChanged({ graphId, reason: "updated" });
	}
}

/** Models in a running caller-driven "Audit all" batch (dedupes double-starts). */
const batchAuditGraphIds = new Set<string>();

/**
 * Dry-run the audit over several models, one at a time, surfacing each via the
 * `auditing` flag so the Maintain rows show progress in place. Fire-and-forget.
 */
function auditSubsystemModelsInBackground(graphIds: string[]): void {
	const pending = graphIds.filter(
		(id) => !batchAuditGraphIds.has(id) && !auditingGraphIds.has(id),
	);
	if (pending.length === 0) return;
	void (async () => {
		for (const graphId of pending) {
			batchAuditGraphIds.add(graphId);
			try {
				await reauditSubsystemModelQuietly(graphId, { surface: true });
			} finally {
				batchAuditGraphIds.delete(graphId);
			}
		}
	})();
}

const regularAuditScheduler = createRegularAuditScheduler({
	listGraphIds: async () => {
		const entries = await listSubsystemModels();
		return entries.map((e) => e.id);
	},
	auditOne: async (graphId) => {
		await reauditSubsystemModelQuietly(graphId);
	},
	onStatusChange: (status) => {
		broadcastRegularAuditChanged(status);
	},
});
regularAuditScheduler.sync(viewerSettings);

/**
 * Close out run-log entries orphaned by a previous Studio restart. The OpenCode
 * sessions outlive this host process, so a run left `running` in the log is
 * reconciled against the server (finished → done, missing → error). Runs the
 * host is tracking are skipped. Swept once on boot and then periodically.
 */
async function reconcileRunsNow(): Promise<void> {
	try {
		const { closedGraphIds } = await reconcileOrphanedRuns({
			trackedGraphIds: maintainingGraphIds,
		});
		for (const graphId of closedGraphIds) {
			broadcastSubsystemModelRunsChanged({ graphId });
			broadcastSubsystemModelChanged({ graphId, reason: "updated" });
		}
	} catch (err) {
		console.warn(
			`[principal-studio] run reconcile failed: ${(err as Error).message}`,
		);
	}
}
setTimeout(() => void reconcileRunsNow(), 8_000);
setInterval(() => void reconcileRunsNow(), 5 * 60_000);

function maintainSubsystemModelInBackground(
	graphId: string,
	opts?: { model?: string },
): void {
	if (maintainingGraphIds.has(graphId)) return;
	maintainingGraphIds.add(graphId);
	ensureLiveFeedBroadcast();
	broadcastSubsystemModelMaintainChanged({ graphId, status: "running" });
	void (async () => {
		try {
			const result = await maintainSubsystemModelSequence(graphId, {
				model: opts?.model,
				onSession: () => {
					// Do not auto-open the events tab — the run log now has the
					// sessionId -> graphId pair; the Maintain surface opens the tab
					// on demand (click a run row / the progress card).
					broadcastSubsystemModelRunsChanged({ graphId });
				},
			});
			const pendingCount = result.pendingCount;
			broadcastSubsystemModelProposalsChanged({ graphId, pendingCount });
			if (!result.ok) {
				broadcastSubsystemModelMaintainChanged({
					graphId,
					status: "error",
					error: result.error ?? "maintain failed",
					pendingCount,
					model: result.model,
					outcome: result.outcome,
					stages: result.stages.length,
					blockedAt: result.blockedAt,
				});
				return;
			}
			const lastStage = result.stages[result.stages.length - 1];
			broadcastSubsystemModelMaintainChanged({
				graphId,
				status: "done",
				pendingCount,
				summary: lastStage?.summary,
				model: result.model,
				outcome: result.outcome,
				stages: result.stages.length,
				blockedAt: result.blockedAt,
				skipped: result.outcome === "converged" && result.stages.length === 0,
			});
		} catch (err) {
			broadcastSubsystemModelMaintainChanged({
				graphId,
				status: "error",
				error: err instanceof Error ? err.message : String(err),
			});
		} finally {
			maintainingGraphIds.delete(graphId);
			// The run log's running entry was closed out (or a skipped/error
			// entry appended) — let any open Subsystems row re-read it.
			broadcastSubsystemModelRunsChanged({ graphId });
		}
	})();
}

function broadcastStudioVersionChanged(
	payload: StudioMessages["studioVersionChanged"],
): void {
	try {
		(rpc.send as unknown as Record<string, (p: unknown) => void>)[
			"studioVersionChanged"
		](payload);
	} catch (err) {
		console.warn(
			`[principal-studio] could not notify renderer (studioVersionChanged): ${(err as Error).message}`,
		);
	}
}

function broadcastOpencodeV2Changed(
	payload: StudioMessages["opencodeV2Changed"],
): void {
	try {
		(rpc.send as unknown as Record<string, (p: unknown) => void>)[
			"opencodeV2Changed"
		](payload);
	} catch (err) {
		console.warn(
			`[principal-studio] could not notify renderer (opencodeV2Changed): ${(err as Error).message}`,
		);
	}
}

function broadcastOpencodeV2ProbeChanged(
	payload: StudioMessages["opencodeV2ProbeChanged"],
): void {
	try {
		(rpc.send as unknown as Record<string, (p: unknown) => void>)[
			"opencodeV2ProbeChanged"
		](payload);
	} catch (err) {
		console.warn(
			`[principal-studio] could not notify renderer (opencodeV2ProbeChanged): ${(err as Error).message}`,
		);
	}
}

function broadcastOpencodeLiveFeedChanged(
	payload: StudioMessages["opencodeLiveFeedChanged"],
): void {
	try {
		(rpc.send as unknown as Record<string, (p: unknown) => void>)[
			"opencodeLiveFeedChanged"
		](payload);
	} catch (err) {
		console.warn(
			`[principal-studio] could not notify renderer (opencodeLiveFeedChanged): ${(err as Error).message}`,
		);
	}
}

function broadcastMaintainLivePanelChanged(
	payload: StudioMessages["maintainLivePanelChanged"],
): void {
	try {
		(rpc.send as unknown as Record<string, (p: unknown) => void>)[
			"maintainLivePanelChanged"
		](payload);
	} catch (err) {
		console.warn(
			`[principal-studio] could not notify renderer (maintainLivePanelChanged): ${(err as Error).message}`,
		);
	}
}

let liveFeedSubscribed = false;
function ensureLiveFeedBroadcast(): void {
	if (liveFeedSubscribed) return;
	liveFeedSubscribed = true;
	subscribeOpencodeLiveFeeds((feed) => {
		broadcastOpencodeLiveFeedChanged({
			sessionId: feed.sessionId,
			status: feed.status,
			events: feed.events,
			total: feed.total,
			error: feed.error,
			title: feed.title,
			agent: feed.agent,
			graphId: feed.graphId,
		});
	});
}

function refreshStudioVersionDetailed(): void {
	if (studioVersionRefreshInflight) return;
	studioVersionRefreshInflight = (async () => {
		try {
			const status = await getStudioVersionStatusDetailed();
			cachedDetailedStudioVersion = status;
			broadcastStudioVersionChanged({ status });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.warn(`[principal-studio] Studio npm version check failed: ${message}`);
			const status = getStudioVersionStatus();
			broadcastStudioVersionChanged({ status, error: message });
		} finally {
			studioVersionRefreshInflight = null;
		}
	})();
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

function refreshOpencodeV2StatusDetailed(): void {
	if (opencodeV2RefreshInflight) return;
	opencodeV2RefreshInflight = (async () => {
		try {
			const status = withOpencodeV2CliBusy(await getOpencodeV2StatusDetailed());
			cachedDetailedOpencodeV2Status = status;
			broadcastOpencodeV2Changed({ status });
		} catch (err) {
			const status = withOpencodeV2CliBusy(getOpencodeV2Status());
			broadcastOpencodeV2Changed({
				status,
				error: err instanceof Error ? err.message : String(err),
			});
		} finally {
			opencodeV2RefreshInflight = null;
		}
	})();
}

async function startOpencodeV2CliJob(
	action: "install" | "update",
): Promise<{
	ok: boolean;
	error?: string;
	bin?: string;
	started?: boolean;
	status?: OpencodeV2Status;
}> {
	if (opencodeV2CliBusy) {
		return {
			ok: true,
			started: true,
			status: withOpencodeV2CliBusy(
				cachedDetailedOpencodeV2Status ?? getOpencodeV2Status(),
			),
		};
	}

	if (action === "install" && resolveOpencode2Bin()) {
		const status = withOpencodeV2CliBusy(
			cachedDetailedOpencodeV2Status ?? getOpencodeV2Status(),
		);
		refreshOpencodeV2StatusDetailed();
		return { ok: true, bin: status.bin ?? undefined, status };
	}

	if (action === "update" && !resolveOpencode2Bin()) {
		return {
			ok: false,
			error: "opencode2 is not installed",
			status: withOpencodeV2CliBusy(getOpencodeV2Status()),
		};
	}

	opencodeV2CliBusy = action;
	const busyStatus = withOpencodeV2CliBusy(getOpencodeV2Status());
	broadcastOpencodeV2Changed({ status: busyStatus });

	void (async () => {
		try {
			const result =
				action === "install" ? await installOpencodeV2() : await updateOpencodeV2();
			opencodeV2CliBusy = null;
			const status = withOpencodeV2CliBusy(
				result.status ?? (await getOpencodeV2StatusDetailed()),
			);
			cachedDetailedOpencodeV2Status = status;
			if (!result.ok) {
				broadcastOpencodeV2Changed({
					status,
					error: result.error ?? `${action} failed`,
				});
				console.error(
					`[principal-studio] opencode2 ${action} failed: ${result.error}`,
				);
				return;
			}
			broadcastOpencodeV2Changed({ status });
		} catch (err) {
			opencodeV2CliBusy = null;
			const status = withOpencodeV2CliBusy(getOpencodeV2Status());
			cachedDetailedOpencodeV2Status = status;
			broadcastOpencodeV2Changed({
				status,
				error: err instanceof Error ? err.message : String(err),
			});
			console.error(
				`[principal-studio] opencode2 ${action} failed: ${(err as Error).message}`,
			);
		}
	})();

	return { ok: true, started: true, status: busyStatus };
}

/**
 * Carry a model's verified pin forward for repos whose anchored files did not
 * move.
 *
 * This is a write on a read path, so it is deliberately narrow: it fires only
 * for a repo whose measured `committed` list came back empty, and only when
 * that list was actually measured. An absent list means "unknown", never
 * "clean", and promoting on unknown would be the exact false claim this whole
 * mechanism exists to avoid.
 *
 * `stampVerifiedCommits` preserves `updatedAt` (it spreads the existing record),
 * which matters: bumping it would invalidate the saved audit fingerprint and
 * make every stored audit read as stale.
 *
 * A failure here must not take down the overview pass — the snapshot the caller
 * already holds stays correct either way, since the pin it reported was the
 * pre-promotion one and the next refresh will show the new one.
 */
async function applyAutoRePin(
	graphId: string,
	snapshot: ModelProvenanceSnapshot,
	full?: {
		components: ReadonlyArray<{ alias: string; file?: string; purl?: string }>;
		trails?: ReadonlyArray<{
			steps?: ReadonlyArray<{
				file?: string;
				purl?: string;
				from?: string;
				to?: string;
			}>;
		}>;
	} | null,
): Promise<void> {
	if (!full) return;
	const plan = await planAutoRePin(
		{
			createdAtCommits: snapshot.createdAtCommits,
			verifiedAtCommits: snapshot.verifiedAtCommits,
			components: full.components,
			trails: full.trails,
		},
		snapshot.anchorChanges,
	);
	const applied: Record<string, string> = {};
	for (const [purl, outcome] of Object.entries(plan)) {
		if (outcome.status === "applied" && outcome.commit) applied[purl] = outcome.commit;
	}
	// Nothing to do is the common case; do not rewrite the record for it.
	if (Object.keys(applied).length === 0) return;
	try {
		await stampVerifiedCommits(graphId, applied);
	} catch {
		/* a stale pin is recoverable; failing the overview pass is not */
	}
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

function bootMessage(): LoadTourMessage | null {
	const initialMode = resolveMode();
	const initialTourFile = resolveTourFilePath();
	if (!initialTourFile) return null;
	const initialRepoRoot = resolveRepoRoot(initialTourFile);
	const msg: LoadTourMessage = {
		kind: "LOAD_TOUR",
		tourFile: initialTourFile,
		mode: initialMode,
	};
	if (initialRepoRoot) msg.repoRoot = initialRepoRoot;
	const ghToken = process.env["TOUR_GH_TOKEN"];
	if (ghToken) msg.ghToken = ghToken;
	const repoOwner = process.env["TOUR_REPO_OWNER"];
	if (repoOwner) msg.repoOwner = repoOwner;
	const repoName = process.env["TOUR_REPO_NAME"];
	if (repoName) msg.repoName = repoName;
	const repoPurl = process.env["TOUR_REPO_PURL"];
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
// Same handoff pattern as TOUR_FILE — if Studio is already up, open there and
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
			if (!tabId) return { ok: false, error: `unknown graph: ${msg.graphId}` };
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
startHttpServer(
	async (graphId) => {
		const tabId = await openSubsystemModelTab(graphId);
		if (!tabId) return { ok: false, error: `unknown graph: ${graphId}` };
		try {
			browserWindow.focus();
		} catch (err) {
			console.warn(`[principal-studio] could not focus window: ${(err as Error).message}`);
		}
		return { ok: true, tabId };
	},
	async (graphId) => deleteGraphAndCloseTabs(graphId),
	async (opts) => {
		const tabId = await openSubsystemShowcaseTab(opts);
		if (!tabId) return { ok: false, error: "no known models in the given ids" };
		try {
			browserWindow.focus();
		} catch (err) {
			console.warn(`[principal-studio] could not focus window: ${(err as Error).message}`);
		}
		return { ok: true, tabId };
	},
	(graphId, pendingCount) => {
		broadcastSubsystemModelProposalsChanged({ graphId, pendingCount });
	},
);
