import path from "node:path";
import {
  accumulateToAgentSessionEvents,
  type AgentSessionEvent,
  type NormalizedPathInfo,
  type RepoNormalizedUniversalAgentSessionEvent,
} from "@principal-ai/agent-monitoring";

/**
 * Frozen File City agent-session fixture generation.
 *
 * Reproduces the shape the file-city-panel fixture loaders consume
 * (`{ generatedFrom, session, events }`): repo-normalized universal events are
 * accumulated into agent-session events, then layer item paths (repo-relative
 * displayPaths) are rewritten back to absolute paths with a per-repo
 * files/edits manifest. The result is a static snapshot — no pipeline runs at
 * story time.
 */

export interface AgentSessionFixtureMeta {
  sessionName: string;
  sessionTask: string;
  workingDirectory: string;
  createdAt?: string;
}

export interface AgentSessionFixtureRepo {
  repo: string;
  root: string;
  files: number;
  edits: number;
}

export interface AgentSessionFixtureSummary {
  sessionId: string;
  agent: string;
  sessionName: string;
  sessionTask: string;
  workingDirectory: string;
  rawEventCount: number;
  agentEventCount: number;
  repos: AgentSessionFixtureRepo[];
  /** Distinct model ids the session used, in first-use order. */
  models?: string[];
}

export interface FixtureLayerItem {
  path: string;
  type: "file" | "directory";
  renderStrategy?: "border" | "fill" | "glow" | "pattern" | "cover" | "icon" | "custom";
}

export interface FixtureHighlightLayer {
  id: string;
  name: string;
  enabled: boolean;
  color: string;
  opacity?: number;
  borderWidth?: number;
  priority: number;
  dynamic?: boolean;
  items: FixtureLayerItem[];
}

export interface FixtureAgentSessionEvent {
  id: string;
  timestamp: number;
  sessionId: string;
  sessionName: string;
  sessionColor: string;
  operation: AgentSessionEvent["operation"];
  files: string[];
  dependencies: string[];
  description: string;
  layers: FixtureHighlightLayer[];
  contextTokens?: number;
  subagentType?: string;
  childSessionId?: string;
  toolName?: string;
}

export interface AgentSessionFixture {
  generatedFrom: string;
  session: AgentSessionFixtureSummary;
  events: FixtureAgentSessionEvent[];
}

function repoLabel(nf: { repository?: { gitRoot?: string; repo?: string } }): string {
  if (nf.repository?.repo) return nf.repository.repo;
  if (nf.repository?.gitRoot) return path.basename(nf.repository.gitRoot);
  return "";
}

function repoRoot(nf: { repository?: { gitRoot?: string } }): string {
  return nf.repository?.gitRoot ?? "";
}

/**
 * Extract a model id from a model value — agents set it inconsistently
 * (opencode stores `{ providerID, modelID }`-shaped objects, cline / grok /
 * pi store a plain string id).
 */
function modelIdOf(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const key of ["modelID", "id"]) {
      if (typeof o[key] === "string" && (o[key] as string).length > 0) {
        return o[key] as string;
      }
    }
  }
  return undefined;
}

/** Pull the model id from one event — normalized `data.model` first, then the
 *  raw opencode `info` blob (the bridge only copies `info.model` onto
 *  normalized events when the session's created event carried it). */
function eventModelId(e: RepoNormalizedUniversalAgentSessionEvent): string | undefined {
  const direct = modelIdOf(e.data?.["model"]);
  if (direct) return direct;
  const raw = e.raw as { data?: { info?: { model?: unknown } } } | undefined;
  return modelIdOf(raw?.data?.info?.model);
}

/** Distinct model ids across a session's events, in first-seen order. */
function collectModels(events: RepoNormalizedUniversalAgentSessionEvent[]): string[] {
  const seen = new Set<string>();
  const models: string[] = [];
  for (const e of events) {
    const id = eventModelId(e);
    if (id && !seen.has(id)) {
      seen.add(id);
      models.push(id);
    }
  }
  return models;
}

export function buildAgentSessionFixture(options: {
  agent: string;
  sessionId: string;
  sessionMeta: AgentSessionFixtureMeta;
  normalizedEvents: RepoNormalizedUniversalAgentSessionEvent[];
  rawEventCount?: number;
}): AgentSessionFixture {
  const { agent, sessionId, sessionMeta, normalizedEvents, rawEventCount } = options;
  const sessionName = sessionMeta.sessionName || "opencode";
  const agentEvents = accumulateToAgentSessionEvents(normalizedEvents, sessionName);

  // Rewrite layer item paths (repo-relative displayPath) back to absolute
  // paths. Layer snapshots reflect accumulated state across events, so build a
  // global displayPath -> absolutePath map from every event's files/dependencies.
  const repoBreakdown = new Map<string, { root: string; files: Set<string>; edits: Set<string> }>();
  const displayToAbs = new Map<string, string>();

  for (const e of agentEvents) {
    for (const f of [...e.files, ...e.dependencies]) {
      if (typeof f === "object" && f && "displayPath" in f) {
        const nf = f as NormalizedPathInfo;
        if (nf.displayPath && !displayToAbs.has(nf.displayPath)) {
          displayToAbs.set(nf.displayPath, nf.absolutePath);
        }
        const label = repoLabel(nf);
        if (!repoBreakdown.has(label)) {
          repoBreakdown.set(label, { root: repoRoot(nf), files: new Set(), edits: new Set() });
        }
        repoBreakdown.get(label)!.files.add(nf.absolutePath);
        if (!repoBreakdown.get(label)!.root) repoBreakdown.get(label)!.root = repoRoot(nf);
      }
    }
  }

  const events: FixtureAgentSessionEvent[] = agentEvents.map((e) => {
    const files = e.files.map((f) =>
      typeof f === "string" ? f : (f as NormalizedPathInfo).absolutePath,
    );
    const dependencies = e.dependencies.map((f) =>
      typeof f === "string" ? f : (f as NormalizedPathInfo).absolutePath,
    );

    if (e.operation === "editing") {
      for (const f of files) {
        const label = [...repoBreakdown.entries()].find(([, v]) => v.files.has(f))?.[0] ?? "";
        if (!repoBreakdown.has(label)) {
          repoBreakdown.set(label, { root: "", files: new Set(), edits: new Set() });
        }
        repoBreakdown.get(label)!.edits.add(f);
      }
    }

    const layers = e.layers.map((l) => ({
      ...l,
      items: l.items.map((item) => {
        const abs = item.path.startsWith("/") ? item.path : displayToAbs.get(item.path) ?? item.path;
        return { ...item, path: abs };
      }),
    }));

    return { ...e, files, dependencies, layers };
  });

  const session: AgentSessionFixtureSummary = {
    sessionId,
    agent,
    sessionName,
    sessionTask: sessionMeta.sessionTask,
    workingDirectory: sessionMeta.workingDirectory,
    rawEventCount: rawEventCount ?? normalizedEvents.length,
    agentEventCount: events.length,
    repos: [...repoBreakdown.entries()].map(([repo, v]) => ({
      repo,
      root: v.root,
      files: v.files.size,
      edits: v.edits.size,
    })),
    models: collectModels(normalizedEvents),
  };

  return {
    generatedFrom: `${agent} session ${sessionId}`,
    session,
    events,
  };
}
