/**
 * Storybook stand-in for `src/mainview/rpc.ts`.
 *
 * The real module constructs `new Electrobun.Electroview(...)` at import time
 * (rpc.ts:165), which requires the electrobun host bridge. The Storybook config
 * (`.storybook/main.ts`) redirects every relative `../rpc` / `./rpc` import to
 * this file, so components render against canned RPC responses instead.
 *
 * Stories seed the in-memory store with `mockProposals(...)`; accept / reject /
 * score mutate it so the modal behaves like the real one (it closes once the
 * last pending proposal resolves). Subscriber sets and helpers mirror the real
 * module's exports so any component that imports them still resolves.
 */
import type {
	PartialViewerSettings,
	SubsystemComponent,
	SubsystemModelProposal,
	ViewerSettings,
  ConstructInventoryRepo,
} from "../../src/shared/contract";
import type { ConstructTimelineMeta, ConstructTimelineSummary, ConstructTimelineFileSnapshot, ConstructTimelineCommit } from "../../src/shared/construct-timeline";

type RpcRequest = Record<string, (params?: unknown) => Promise<unknown>>;
export const constructLoadCalls = { graphInventory: 0, graphify: 0, packages: 0, timelineExtensions: 0 };

/** Minimal model components so a construct proposal can render its node. */
const MODEL_COMPONENTS: SubsystemComponent[] = [
	{
		alias: "tab-registry",
		name: "tabs",
		construct: "store",
		file: "packages/subsystems-studio/src/bun/index.ts",
		symbol: "tabs",
		purl: "pkg:github/principal-ai/subsystem-modeling",
		purpose: "Holds open tab states keyed by id.",
	},
	{
		alias: "open-stamp",
		name: "touchSubsystemModelOpened",
		construct: "function",
		file: "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
		symbol: "touchSubsystemModelOpened",
		purl: "pkg:github/principal-ai/subsystem-modeling",
	},
	{
		alias: "store-read",
		name: "getSubsystemModel",
		construct: "function",
		file: "packages/subsystems-studio/src/bun/subsystem-model-store.ts",
		symbol: "getSubsystemModel",
		purl: "pkg:github/principal-ai/subsystem-modeling",
	},
];

export const reloadSubscribers = new Set<(focusTabId?: string) => void>();
export const sessionRefreshers = new Set<(sessionIds: string[]) => void>();
export const libraryRefreshers = new Set<() => void>();
export const serverEventSubscribers = new Set<unknown>();
export const graphifyChangeSubscribers = new Set<unknown>();
export const packageLayersChangeSubscribers = new Set<unknown>();
export const studioVersionChangeSubscribers = new Set<unknown>();
export const opencodeV2ChangeSubscribers = new Set<unknown>();
export const opencodeV2ProbeChangeSubscribers = new Set<unknown>();
export const opencodeLiveFeedSubscribers = new Set<unknown>();
export const maintainLivePanelSubscribers = new Set<unknown>();
export const subsystemModelChangeSubscribers = new Set<unknown>();
export const subsystemModelProposalsChangeSubscribers = new Set<unknown>();
export const subsystemModelMaintainChangeSubscribers = new Set<unknown>();
export const subsystemModelRunsChangeSubscribers = new Set<unknown>();
export const regularAuditChangeSubscribers = new Set<unknown>();

export function refreshLibrary(): void {}

let store: SubsystemModelProposal[] = [];

function pending(): SubsystemModelProposal[] {
  return store.filter((p) => p.status === "pending");
}

function proposalId(params: unknown): string {
  return (params as { proposalId?: string } | undefined)?.proposalId ?? "";
}

let viewerSettings: ViewerSettings = {
  defaultTabs: {
    sessions: true,
    maintenanceSessions: true,
    tours: true,
    graphify: false,
    packageLayers: false,
    subsystems: true,
    constructs: false,
    maintenance: true,
    opencodeV2: false,
  },
  autoAcceptSubsystemModelProposals: false,
  autoAcceptSubsystemModelConfidenceThreshold: 0.9,
  subsystemMaintainerModel: "opencode-go/deepseek-v4-flash",
  regularAuditEnabled: true,
  regularAuditIntervalMinutes: 5,
  autoApplyAuditFixes: true,
  typesafeApiKey: null,
  maintenanceRepoKey: "principal-ai/subsystem-modeling",
  lastActiveTabId: null,
};

const request: RpcRequest = {
  listVerifiedConstructs: async () => ({ ok: true, repos: [] }),
  listConstructInventory: async () => ({ ok: true, repos: inventoryRepo ? [inventoryRepo] : [] }),
  getConstructInventory: async () => (constructLoadCalls.graphInventory++, inventoryLoadingResponses-- > 0
    ? { ok: true, loading: true }
    : { ok: true, loading: false, repo: inventoryRepo }),
  ensureGraphifyGraph: async () => (constructLoadCalls.graphify++, { ok: false, error: "Graphify extraction is not run by this Storybook fixture." }),
  ensurePackageLayers: async () => (constructLoadCalls.packages++, { ok: true }),
  readSubsystemSpan: async () => ({ ok: true, text: "export function calculate() {\n  return 2;\n}", verified: true }),
  getConstructRepositoryInfo: async () => ({ ok: true, commits: 128, firstCommitAt: "2026-02-01T00:00:00Z", ageDays: 258 }),
  getConstructTimeline: async () => ({ ok: true, meta: timelineMeta, summary: timelineSummary }),
  getConstructTimelineHistory: async () => ({ ok: true, commits: timelineHistory ?? [...timelineFileSnapshots.keys()].map((sha, index) => ({
    sha, committedAt: `2026-10-${String(21 - index).padStart(2, "0")}T12:00:00Z`, subject: `Fixture commit ${index + 1}`,
  })) }),
  getConstructTimelineFiles: async (params) => ({
    ok: true, snapshot: timelineFileSnapshots.get((params as { sha: string }).sha) ?? { sha: (params as { sha: string }).sha, analyzed: false, coverageAvailable: false,
      files: [{ path: "src/calculate.ts", size: 200, kind: "file", status: "uncovered" }] },
  }),
  extendConstructTimeline: async (params) => {
    constructLoadCalls.timelineExtensions++;
    const { purl } = params as { purl: string };
    timelineMeta = {
      ...timelineMeta,
      version: 1, analyzerVersion: "construct-timeline-v1", purl,
      status: "running", updatedAt: new Date().toISOString(),
      events: timelineMeta?.events ?? 0, constructs: timelineMeta?.constructs ?? 0,
      elapsedMs: timelineMeta?.elapsedMs ?? 0, retainedBytes: timelineMeta?.retainedBytes ?? 0,
    };
    return { ok: true, meta: timelineMeta };
  },
  cancelConstructTimeline: async () => {
    if (timelineMeta) timelineMeta = { ...timelineMeta, status: "interrupted" };
    return { ok: true };
  },
  resetConstructTimeline: async () => {
    timelineMeta = undefined;
    timelineSummary = undefined;
    timelineFileSnapshots.clear();
    timelineHistory = undefined;
    return { ok: true };
  },
  assessConstructComplexity: async (params) => {
    const input = params as { file: string; contentHash: string };
    await new Promise((resolve) => setTimeout(resolve, 750));
    if (input.file === "error.ts") {
      return { ok: false, error: "Missing Jev API key — add your TypeSafe AI key in Settings → Jev." };
    }
    return {
      ok: true,
      result: {
        score: input.file === "complex.ts" ? 0.9 : input.file === "moderate.ts" ? 0.5 : 0.1,
        confidence: 0.85,
        model: "jev-latest",
        contentHash: input.contentHash,
        checkedAt: new Date().toISOString(),
      },
    };
  },
  listSubsystemModelProposals: async () => ({
    ok: true,
    proposals: pending(),
    pendingCount: pending().length,
  }),
  acceptSubsystemModelProposal: async (params) => {
    const id = proposalId(params);
    store = store.map((p) =>
      p.id === id ? { ...p, status: "accepted" as const } : p,
    );
    return { ok: true, proposal: store.find((p) => p.id === id) };
  },
  rejectSubsystemModelProposal: async (params) => {
    const id = proposalId(params);
    store = store.map((p) =>
      p.id === id ? { ...p, status: "rejected" as const } : p,
    );
    return { ok: true, proposal: store.find((p) => p.id === id) };
  },
  scoreSubsystemModelProposal: async (params) => {
    const id = proposalId(params);
    const target = store.find((p) => p.id === id);
    return { ok: true, proposal: target };
  },
  getSubsystemModel: async () => ({
    ok: true,
    graph: { components: MODEL_COMPONENTS },
  }),
  // Settings — ViewerSettings shape the modal reads.
  getSettings: async () => viewerSettings,
  setSettings: async (params) => {
    const patch = (params as { settings?: PartialViewerSettings } | undefined)
      ?.settings;
    if (patch) {
      viewerSettings = {
        ...viewerSettings,
        ...patch,
        defaultTabs: {
          ...viewerSettings.defaultTabs,
          ...(patch.defaultTabs ?? {}),
        },
      };
    }
    return { ok: true, settings: viewerSettings };
  },
  openPromptTab: async () => ({ ok: true }),
  // Maintainer model picker.
  getSubsystemMaintainerModels: async () => ({
    ok: true,
    resolved: "opencode-go/deepseek-v4-flash",
    source: "settings",
    configured: "opencode-go/deepseek-v4-flash",
    credentialedModels: [
      {
        ref: "opencode-go/deepseek-v4-flash",
        id: "deepseek-v4-flash",
        providerID: "opencode-go",
        name: "DeepSeek v4 Flash",
      },
    ],
    freeModels: [
      { ref: "opencode/zen-free", id: "zen-free", providerID: "opencode", name: "Zen Free" },
    ],
    goModels: [
      {
        ref: "opencode-go/deepseek-v4-flash",
        id: "deepseek-v4-flash",
        providerID: "opencode-go",
        name: "DeepSeek v4 Flash",
      },
    ],
  }),
  // Integration / CLI status pills.
  getGraphifyStatus: async () => ({ installed: true, serving: true }),
  getOpencodeV2Status: async () => ({ installed: true, running: true }),
  getOpencodeServerStatus: async () => ({
    running: true,
    url: "http://127.0.0.1:4096",
    version: "0.6.0",
  }),
  getGraphifyCli: async () => ({
    installed: true,
    bin: "/usr/local/bin/graphify",
    conventionalBin: "/usr/local/bin/graphify",
    installCommand: "npm i -g graphify",
    installedVersion: "0.5.0",
    latestVersion: "0.5.0",
    updateAvailable: false,
    cliBusy: null,
  }),
  installGraphify: async () => ({ ok: true }),
  updateGraphify: async () => ({ ok: true }),
  uninstallGraphify: async () => ({ ok: true }),
  installOpencodeV2: async () => ({ ok: true }),
  updateOpencodeV2: async () => ({ ok: true }),
  openExternal: async () => ({ ok: true }),
  updateStudio: async () => ({ ok: true }),
  analyzeSession: async () => ({ ok: true }),
  deleteAnalysis: async () => ({ ok: true }),
  auditSubsystemModel: async () => ({ ok: true }),
  getPendingAuditFixes: async () => ({ ok: true, groups: [] }),
  resolvePendingAuditFixes: async () => ({ ok: true, applied: 0 }),
  readFile: async () => ({ ok: true, content: "" }),
  // MaintenancePanel: aggregate overview + persisted runs.
  getMaintenanceOverview: async () => ({ ok: true, overview: mockOverview }),
  listSubsystemModelRuns: async () => ({ ok: true, runs: mockRuns }),
  getSubsystemModelBrief: async () => ({ ok: true, brief: "# Brief\n\nMock brief." }),
  openMaintainLive: async () => ({ ok: true }),
  openSubsystemModel: async () => ({ ok: true }),
  deleteSubsystemModelProposals: async () => ({ ok: true }),
  deleteAllSubsystemModelProposals: async () => ({ ok: true }),
  maintainSubsystemModel: async () => ({ ok: true, started: true }),
  auditSubsystemModels: async () => ({ ok: true }),
  getRegularAuditStatus: async () => ({
    enabled: true,
    running: false,
    intervalMinutes: 15,
    nextAuditAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  }),
  writeClipboard: async () => ({ ok: true }),
};

let mockOverview: unknown = null;
let mockRuns: unknown[] = [];
let inventoryRepo: ConstructInventoryRepo | undefined;
let inventoryLoadingResponses = 0;

let timelineMeta: ConstructTimelineMeta | undefined;
let timelineSummary: ConstructTimelineSummary | undefined;
let timelineFileSnapshots = new Map<string, ConstructTimelineFileSnapshot>();
let timelineHistory: ConstructTimelineCommit[] | undefined;

export function mockConstructTimelineHistory(commits: ConstructTimelineCommit[]): void {
  timelineHistory = structuredClone(commits);
}

export function mockConstructTimelineFiles(snapshots: ConstructTimelineFileSnapshot[]): void {
  timelineHistory = undefined;
  timelineFileSnapshots = new Map(snapshots.map((snapshot) => [snapshot.sha, structuredClone(snapshot)]));
}

export function mockConstructTimeline(meta?: ConstructTimelineMeta, summary?: ConstructTimelineSummary): void {
  timelineMeta = meta ? structuredClone(meta) : undefined;
  timelineSummary = summary ? structuredClone(summary) : undefined;
}
export function mockConstructInventory(repo: ConstructInventoryRepo, loadingResponses = 0): void {
  inventoryRepo = structuredClone(repo);
  inventoryLoadingResponses = loadingResponses;
}

/** Seed the MaintenancePanel overview + run history for whole-tab stories. */
export function mockMaintenanceOverview(
  overview: unknown,
  runs: unknown[] = [],
): void {
  mockOverview = overview;
  mockRuns = runs;
}

export const electrobun = { rpc: { request } };

/** Seed the story RPC store with a fresh copy of `list`. */
export function mockProposals(list: SubsystemModelProposal[]): void {
  store = list.map((p) => ({ ...p }));
}

export function callReadFile(): Promise<string> {
  return Promise.resolve("");
}
