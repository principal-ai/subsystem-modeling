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
} from "../../src/shared/contract";

type RpcRequest = Record<string, (params?: unknown) => Promise<unknown>>;

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
