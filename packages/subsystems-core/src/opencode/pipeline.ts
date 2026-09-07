import {
  PathNormalizationService,
  V1EventBridgeProcessor,
  createAccumulatedState,
  eventOp,
  type RepoNormalizedUniversalAgentSessionEvent,
  type RepositoryInfo,
  type UniversalAgentSessionEvent,
} from "@principal-ai/agent-monitoring";
import { NodePathNormalizationAdapter } from "./node-path-adapter";

export { NodePathNormalizationAdapter };

/**
 * Pure, agent-agnostic session pipeline shared by CLI and principal-studio.
 *
 * This module intentionally imports NO better-sqlite3 / OpenCodeEventStore so
 * it can be loaded in any runtime (the principal-studio runs under Bun, where
 * better-sqlite3's native NAPI binding crashes). Runtime-specific DB access
 * feeds this pipeline; everything after the raw rows are in is shared.
 */

/** A raw opencode event DB row, before JSON decoding of its `data` payload. */
export interface OpenCodeEventRow {
  id: string;
  aggregateId: string;
  seq: number;
  type: string;
  data: string | Record<string, unknown>;
}

/**
 * Convert raw opencode event rows into universal events. Handles both string
 * (SQLite TEXT, unparsed) and already-parsed object `data` payloads.
 */
export function opencodeRowsToUniversalEvents(
  rows: OpenCodeEventRow[],
): UniversalAgentSessionEvent[] {
  const processor = new V1EventBridgeProcessor();
  return rows.map((row) =>
    processor.normalize({
      type: row.type as
        | "session.created.1"
        | "session.updated.1"
        | "message.updated.1"
        | "message.part.updated.1"
        | "message.removed.1",
      data:
        typeof row.data === "string"
          ? (JSON.parse(row.data) as Record<string, unknown>)
          : row.data,
      id: row.id,
      aggregateId: row.aggregateId,
      seq: row.seq,
    }),
  );
}

/** Normalize raw universal events into repo-normalized universal events. */
export async function normalizeEvents(
  events: UniversalAgentSessionEvent[],
  workingDirectory = "",
  knownRoots?: Map<string, RepositoryInfo>,
): Promise<RepoNormalizedUniversalAgentSessionEvent[]> {
  const { normalized } = await normalizeEventsWithAdapter(events, workingDirectory, knownRoots);
  return normalized;
}

/**
 * Like `normalizeEvents`, but also returns the adapter so callers can inspect
 * `adapter.newlyDiscovered` for auto-registration of newly found git roots.
 */
export async function normalizeEventsWithAdapter(
  events: UniversalAgentSessionEvent[],
  workingDirectory = "",
  knownRoots?: Map<string, RepositoryInfo>,
): Promise<{ normalized: RepoNormalizedUniversalAgentSessionEvent[]; adapter: NodePathNormalizationAdapter }> {
  const adapter = new NodePathNormalizationAdapter(knownRoots);
  const service = new PathNormalizationService(adapter);
  const normalized = await service.normalizePathsBatch(events, workingDirectory);
  return { normalized, adapter };
}

/** Compute the accumulated agent-session event rows for a normalized session. */
export function accumulateEvents(
  normalizedEvents: RepoNormalizedUniversalAgentSessionEvent[],
  sessionTitle = "",
): Array<{ normalized: RepoNormalizedUniversalAgentSessionEvent; accumulated: unknown }> {
  const accState = createAccumulatedState(sessionTitle);
  return normalizedEvents.map((normalizedEvent) => ({
    normalized: normalizedEvent,
    accumulated: eventOp(accState, normalizedEvent),
  }));
}

/** Collect the distinct repositories referenced across a normalized session. */
export function collectRepositories(
  normalizedEvents: RepoNormalizedUniversalAgentSessionEvent[],
): RepositoryInfo[] {
  const byRoot = new Map<string, RepositoryInfo>();

  // Event-level repository context uses the RepositoryInfo shape (key: `root`).
  const putEventRepo = (root: string, repo: RepositoryInfo) => {
    byRoot.set(root, {
      root,
      remoteUrl: repo.remoteUrl,
      owner: repo.owner,
      repo: repo.repo,
      branch: repo.branch,
      headCommit: repo.headCommit,
    });
  };

  // Per-file repository uses the NormalizedPathInfo shape (key: `gitRoot`, no
  // branch/headCommit). Normalize into the RepositoryInfo shape.
  const putFileRepo = (
    root: string,
    repo: { remoteUrl?: string; owner?: string; repo?: string },
  ) => {
    const existing = byRoot.get(root);
    byRoot.set(root, {
      root,
      remoteUrl: repo.remoteUrl ?? existing?.remoteUrl,
      owner: repo.owner ?? existing?.owner,
      repo: repo.repo ?? existing?.repo,
      branch: existing?.branch,
      headCommit: existing?.headCommit,
    });
  };

  for (const event of normalizedEvents) {
    if (event.repository?.root) putEventRepo(event.repository.root, event.repository);
    for (const file of event.files ?? []) {
      const fileRepo = file.repository;
      if (fileRepo?.gitRoot) {
        putFileRepo(fileRepo.gitRoot, fileRepo);
      }
    }
  }
  return Array.from(byRoot.values());
}
