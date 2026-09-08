/**
 * @principal-ai/subsystems-core/node
 * Node.js-specific exports (require Node.js runtime)
 *
 * Agent sessions, OpenCode SQLite store, topic storage, and the shared
 * session pipeline. Prefer `@principal-ai/subsystems-core/pipeline` in Bun
 * (no better-sqlite3 native binding).
 */

export * from './types';

// File-per-topic store (~/.principal/topics) — node:fs only
export {
  TopicStore,
  PRINCIPAL_DIR,
  TOPICS_DIR,
  LEGACY_TOPICS_BLOB,
} from './storage/topicStore';
export type {
  TopicIndexEntry,
  TopicCreate,
  TopicUpdate,
  MigrationResult,
} from './storage/topicStore';
export { publishedFromDraft } from './storage/topic-types';
export type {
  DraftTopic,
  PublishedTopic,
  PublishProjection,
  TopicStatus,
  TopicAsset,
  TopicCreator,
} from './storage/topic-types';

// OpenCode event retrieval (Node.js only - SQLite)
export { OpenCodeEventStore, defaultOpenCodeDBPath } from './opencode/OpenCodeEventStore';
export type {
  OpenCodeRawEvent,
  OpenCodeSessionEvents,
  OpenCodeEventRetriever,
  OpenCodeStoreOptions,
  SessionSummary,
  SessionListResult,
} from './opencode/types';

// Shared, agent-agnostic session listing / fetch / normalization
export { listAgentSessions, detectAgent, fetchRawEvents } from './opencode/agent-sessions';
export type {
  AgentSessionSummary,
  AgentSessionMeta,
  SupportedSessionAgent,
} from './opencode/agent-sessions';

// Frozen-fixture generator (Node.js — git walk-up)
export { buildAgentSessionFixture } from './agent-sessions/fixture';
export type {
  AgentSessionFixture,
  AgentSessionFixtureMeta,
  AgentSessionFixtureRepo,
  AgentSessionFixtureSummary,
  FixtureAgentSessionEvent,
  FixtureHighlightLayer,
  FixtureLayerItem,
} from './agent-sessions/fixture';

// Pure session pipeline (also available via /pipeline without sqlite)
export {
  NodePathNormalizationAdapter,
  normalizeEvents,
  normalizeEventsWithAdapter,
  accumulateEvents,
  collectRepositories,
  opencodeRowsToUniversalEvents,
} from './opencode/pipeline';
export type { OpenCodeEventRow } from './opencode/pipeline';
