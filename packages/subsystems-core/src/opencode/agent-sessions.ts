import {
  ClineSessionReader,
  CodexSessionReader,
  CursorSessionReader,
  GrokSessionReader,
  PiSessionReader,
  type UniversalAgentSessionEvent,
} from "@principal-ai/agent-monitoring";
import { OpenCodeEventStore } from "./OpenCodeEventStore";
import {
  NodePathNormalizationAdapter,
  accumulateEvents,
  collectRepositories,
  normalizeEvents,
  normalizeEventsWithAdapter,
  opencodeRowsToUniversalEvents,
} from "./pipeline";

export {
  NodePathNormalizationAdapter,
  normalizeEvents,
  normalizeEventsWithAdapter,
  accumulateEvents,
  collectRepositories,
};

/**
 * Shared, agent-agnostic session access: list + fetch across Cline, opencode,
 * pi, Grok, and Codex, normalizing raw events into repo-aware universal events.
 *
 * This is the single source of truth for CLI and principal-studio session pulling.
 * opencode listing delegates to `OpenCodeEventStore.listSessionsWithSummaries()`,
 * which already builds parent/child groups and excludes subagent (child) sessions
 * from the standalone list.
 */

export type SupportedSessionAgent =
  | "cline"
  | "codex"
  | "cursor"
  | "opencode"
  | "pi"
  | "grok"
  | "unknown";

export interface AgentSessionSummary {
  agent: SupportedSessionAgent;
  sessionId: string;
  title: string;
  createdAt: string;
  eventCount: number;
  isFinished: boolean;
  parentID?: string;
}

export interface AgentSessionMeta {
  sessionName: string;
  sessionTask: string;
  workingDirectory: string;
  createdAt?: string;
}

const clineReader = new ClineSessionReader();
const piReader = new PiSessionReader();
const grokReader = new GrokSessionReader();
const codexReader = new CodexSessionReader();
const cursorReader = new CursorSessionReader();

function isClineSession(sessionId: string): boolean {
  return clineReader.readSession(sessionId) !== null;
}

function isPiSession(sessionId: string): boolean {
  return piReader.readSession(sessionId) !== null;
}

function isGrokSession(sessionId: string): boolean {
  return grokReader.readSession(sessionId) !== null;
}

function isCodexSession(sessionId: string): boolean {
  return codexReader.readSession(sessionId) !== null;
}

function isCursorSession(sessionId: string): boolean {
  return cursorReader.readSession(sessionId) !== null;
}

/** List Cline CLI sessions from the durable on-disk transcript. */
function listClineSessions(): AgentSessionSummary[] {
  return clineReader.listSessions().map((record) => {
    const meta = record.metadata;
    const promptText = (meta.prompt ?? "").trim();
    const title =
      promptText.length > 0
        ? promptText.length > 80
          ? `${promptText.slice(0, 80)}…`
          : promptText
        : "Cline session";
    return {
      agent: "cline" as const,
      sessionId: record.sessionId,
      title,
      createdAt: meta.started_at ?? "",
      eventCount: clineReader.readMessages(record.sessionId)?.messages.length ?? 0,
      isFinished: meta.status === "completed" || meta.status === "failed",
    };
  });
}

/** List pi CLI sessions from the durable on-disk JSONL transcripts. */
function listPiSessions(): AgentSessionSummary[] {
  return piReader.listSessions().map((record) => {
    const promptText = (record.firstPrompt ?? "").trim();
    const title =
      promptText.length > 0
        ? promptText.length > 80
          ? `${promptText.slice(0, 80)}…`
          : promptText
        : "pi session";
    return {
      agent: "pi" as const,
      sessionId: record.sessionId,
      title,
      createdAt: record.header.timestamp ?? "",
      eventCount: record.messageCount,
      // pi transcripts carry no finished marker; the principal-studio appends a
      // synthesized session-end event at read time.
      isFinished: false,
    };
  });
}

/** List Grok Build sessions from ~/.grok/sessions durable JSONL. */
function listGrokSessions(): AgentSessionSummary[] {
  return grokReader.listSessions().map((record) => {
    return {
      agent: "grok" as const,
      sessionId: record.sessionId,
      title: record.title || "Grok session",
      createdAt: record.createdAt,
      eventCount: record.messageCount,
      isFinished: false,
      parentID: record.parentSessionId,
    };
  });
}

/** List Codex sessions from durable rollout JSONL. */
function listCodexSessions(): AgentSessionSummary[] {
  return codexReader.listSessions().map((record) => ({
    agent: "codex" as const,
    sessionId: record.sessionId,
    title: record.firstPrompt || "Codex session",
    createdAt:
      typeof record.meta.timestamp === "string"
        ? record.meta.timestamp
        : new Date(record.lastActivity).toISOString(),
    eventCount: record.messageCount,
    isFinished: false,
  }));
}

/** List Cursor IDE agent chats from ~/.cursor/chats. */
function listCursorSessions(): AgentSessionSummary[] {
  return cursorReader.listSessions().map((record) => ({
    agent: "cursor" as const,
    sessionId: record.sessionId,
    title: record.title || "Cursor session",
    createdAt: record.createdAt || new Date(record.lastActivity).toISOString(),
    eventCount: record.messageCount,
    isFinished: false,
  }));
}

/**
 * List opencode sessions, top-level only by default. Delegates to the store's
 * grouped `listSessionsWithSummaries()` which excludes subagent (child) sessions.
 */
function listOpencodeSessions(dbPath?: string): AgentSessionSummary[] {
  const store = new OpenCodeEventStore({ dbPath });
  try {
    const result = store.listSessionsWithSummaries(50);
    const toSummary = (s: {
      id: string;
      title: string;
      createdAt: string;
      eventCount: number;
      isFinished: boolean;
    }): AgentSessionSummary => ({
      agent: "opencode",
      sessionId: s.id,
      title: s.title,
      createdAt: s.createdAt,
      eventCount: s.eventCount,
      isFinished: s.isFinished,
    });
    const standalone: AgentSessionSummary[] = [
      ...result.standalone.map(toSummary),
      ...result.groups.map((g) => toSummary(g.parent)),
    ];
    // Sort newest-first by createdAt
    return standalone.sort((a, b) =>
      b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0,
    );
  } finally {
    store.close();
  }
}

/** List sessions from all supported agents. Top-level only by default. */
export function listAgentSessions(
  options: { dbPath?: string } = {},
): AgentSessionSummary[] {
  const all: AgentSessionSummary[] = [];
  let firstError: Error | null = null;
  try {
    all.push(...listOpencodeSessions(options.dbPath));
  } catch (err) {
    firstError = err as Error;
  }
  try {
    all.push(...listClineSessions());
  } catch (err) {
    if (!firstError) firstError = err as Error;
  }
  try {
    all.push(...listPiSessions());
  } catch (err) {
    if (!firstError) firstError = err as Error;
  }
  try {
    all.push(...listGrokSessions());
  } catch (err) {
    if (!firstError) firstError = err as Error;
  }
  try {
    all.push(...listCodexSessions());
  } catch (err) {
    if (!firstError) firstError = err as Error;
  }
  try {
    all.push(...listCursorSessions());
  } catch (err) {
    if (!firstError) firstError = err as Error;
  }
  if (all.length === 0 && firstError) {
    throw firstError;
  }
  return all;
}

/** Detect which agent a session id belongs to. */
export function detectAgent(
  sessionId: string,
): "cline" | "opencode" | "pi" | "grok" | "codex" | "cursor" {
  if (isClineSession(sessionId)) return "cline";
  if (isPiSession(sessionId)) return "pi";
  if (isGrokSession(sessionId)) return "grok";
  if (isCodexSession(sessionId)) return "codex";
  if (isCursorSession(sessionId)) return "cursor";
  return "opencode";
}

/**
 * Fetch a session's raw universal events from the appropriate source.
 */
export function fetchRawEvents(
  sessionId: string,
  options: {
    agent?: "cline" | "codex" | "cursor" | "opencode" | "pi" | "grok";
    dbPath?: string;
  } = {},
): {
  agent: "cline" | "codex" | "cursor" | "opencode" | "pi" | "grok";
  events: UniversalAgentSessionEvent[];
  sessionMeta: AgentSessionMeta;
} {
  const agent = options.agent ?? detectAgent(sessionId);
  if (agent === "cline") {
    const record = clineReader.readSession(sessionId);
    const promptText = (record?.metadata.prompt ?? "").trim();
    return {
      agent,
      events: clineReader.toUniversalEvents(sessionId),
      sessionMeta: {
        sessionName: "cline",
        sessionTask:
          (promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText) ||
          "Cline session",
        workingDirectory: record?.metadata.workspace_root ?? record?.metadata.cwd ?? "",
      },
    };
  }
  if (agent === "pi") {
    const record = piReader.readSession(sessionId);
    const promptText = (record?.firstPrompt ?? "").trim();
    return {
      agent,
      events: piReader.toUniversalEvents(sessionId),
      sessionMeta: {
        sessionName: "pi",
        sessionTask:
          (promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText) || "pi session",
        workingDirectory: "",
      },
    };
  }
  if (agent === "grok") {
    const record = grokReader.readSession(sessionId);
    return {
      agent,
      events: grokReader.toUniversalEvents(sessionId),
      sessionMeta: {
        sessionName: "grok",
        sessionTask: record?.title || "Grok session",
        workingDirectory: record?.cwd ?? "",
        createdAt: record?.createdAt,
      },
    };
  }
  if (agent === "codex") {
    const record = codexReader.readSession(sessionId);
    const promptText = (record?.firstPrompt ?? "").trim();
    return {
      agent,
      events: codexReader.toUniversalEvents(sessionId),
      sessionMeta: {
        sessionName: "codex",
        sessionTask:
          (promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText) ||
          "Codex session",
        workingDirectory: record?.cwd ?? "",
        createdAt:
          typeof record?.meta.timestamp === "string"
            ? record.meta.timestamp
            : undefined,
      },
    };
  }
  if (agent === "cursor") {
    const record = cursorReader.readSession(sessionId);
    const promptText = (record?.firstPrompt ?? "").trim();
    return {
      agent,
      events: cursorReader.toUniversalEvents(sessionId),
      sessionMeta: {
        sessionName: "cursor",
        sessionTask:
          record?.title ||
          (promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText) ||
          "Cursor session",
        workingDirectory: record?.cwd ?? "",
        createdAt: record?.createdAt,
      },
    };
  }
  const store = new OpenCodeEventStore({ dbPath: options.dbPath });
  try {
    const { events } = store.readAggregate(sessionId, { limit: 10000 });
    const meta = store.getSessionMeta(sessionId);
    const title =
      meta.title && !meta.title.startsWith("New session") ? meta.title : meta.slug;
    return {
      agent,
      events: opencodeRowsToUniversalEvents(events),
      sessionMeta: {
        sessionName: meta.slug || "opencode",
        sessionTask: title || meta.slug || "opencode",
        workingDirectory: meta.directory,
      },
    };
  } finally {
    store.close();
  }
}
