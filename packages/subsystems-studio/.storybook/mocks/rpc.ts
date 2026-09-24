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
import type { SubsystemModelProposal } from "../../src/shared/contract";

type RpcRequest = Record<string, (params?: unknown) => Promise<unknown>>;

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
  readFile: async () => ({ ok: true, content: "" }),
};

export const electrobun = { rpc: { request } };

/** Seed the story RPC store with a fresh copy of `list`. */
export function mockProposals(list: SubsystemModelProposal[]): void {
  store = list.map((p) => ({ ...p }));
}

export function callReadFile(): Promise<string> {
  return Promise.resolve("");
}
