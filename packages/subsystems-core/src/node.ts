/**
 * @principal-ai/subsystems-core/node
 * Node.js-specific exports (require Node.js runtime)
 *
 * This entry point includes all functionality that depends on Node.js modules
 * such as fs, path, glob, and other Node.js-only dependencies.
 *
 * The main entry point ('@principal-ai/subsystems-core') exports browser-safe
 * functionality that works in any environment. Use this /node entry point when you
 * need Node.js-specific utilities like buildFileTreeFromDirectory.
 */

// Export all types (safe in all environments)
export * from './types';

// File-per-topic store (~/.principal/topics) — node:fs only. The browser-safe
// topic types it reads/writes are also re-exported here for node consumers.
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

// Export core classes (Node.js processing)
export { EventProcessor } from './EventProcessor';
export type { ProcessingResult } from './EventProcessor';

export { ValidationEngine } from './ValidationEngine';

export { ConfigurationValidator } from './ConfigurationValidator';
export type {
  ConfigurationValidationError,
  ConfigurationValidationResult,
} from './ConfigurationValidator';

// Export helpers
export { GraphInstrumentationHelper } from './helpers/GraphInstrumentationHelper';

// Export path-based processing (Milestone 1 & 2)
export { PathBasedEventProcessor } from './PathBasedEventProcessor';
export type { LogEntry } from './PathBasedEventProcessor';

// Export path utilities
export { PathMatcher } from './utils/PathMatcher';
export { GraphConverter } from './utils/GraphConverter';

// Export Canvas types and converter
export * from './types/canvas';
export { CanvasConverter } from './utils/CanvasConverter';
export type { ReactFlowNode, ReactFlowEdge } from './utils/CanvasConverter';

// Export telemetry event validation
export { EventValidator, createValidatedEmitter, EventValidationError } from './telemetry/event-validator';
export type { ValidationResult } from './telemetry/event-validator';

// Export telemetry coverage analysis (re-exported from main for convenience)
export { analyzeCoverage } from './telemetry/coverage';
export type {
  CoverageMetrics,
  FileInstrumentation,
  PackageCoverageMetrics,
} from './telemetry/coverage';

// Export code generation (Node.js only - file system operations)
export { generateTypes, TypeScriptGenerator, generatorRegistry } from './codegen/type-generator';
export type { CodegenOptions, CodegenResult, CodeGenerator } from './codegen/type-generator';

// Export trace-to-canvas conversion
export { traceToCanvas, traceToCanvasJson } from './utils/TraceToCanvas';
export type {
  TraceSpan,
  TraceExport,
  TraceToCanvasOptions,
  TraceCanvasResult,
} from './utils/TraceToCanvas';

// Export session management (Event Recording System)
export { SessionManager } from './SessionManager';
export type {
  SessionStatus,
  SessionResult,
  SessionMetadata,
  EventSession,
  CreateSessionOptions,
  EndSessionOptions,
  SessionChangeCallback,
  SessionManagerConfig,
} from './SessionManager';

// Export event recorder service
export { EventRecorderService } from './EventRecorderService';
export type {
  ProtocolMessageType,
  ProtocolMessage,
  SessionStartMessage,
  SessionEndMessage,
  LogMessage,
  LogBatchMessage,
  PingMessage,
  PongMessage,
  ErrorMessage,
  AckMessage,
  IncomingMessage,
  OutgoingMessage,
  RecordingMode,
  EventCallback,
  EventBatchCallback,
  ConnectionState,
  EventRecorderServiceConfig,
} from './EventRecorderService';

// Export configuration loading (Node.js only - file system)
export { ConfigurationLoader } from './ConfigurationLoader';
export type { ConfigurationFile, ConfigurationLoadResult } from './ConfigurationLoader';
export { parseYaml, isYamlFile, getConfigNameFromFilename } from './utils/YamlParser';
export type { YamlParseResult } from './utils/YamlParser';

// Export component library support (Node.js only - file system)
export { LibraryLoader } from './LibraryLoader';

// Export event registry (for cross-canvas event lookup)
export { EventRegistry } from './registry/EventRegistry';
export type { EventSource } from './registry/EventRegistry';

// Export opencode event retrieval (Node.js only - SQLite)
export { OpenCodeEventStore, defaultOpenCodeDBPath } from './opencode/OpenCodeEventStore';
export type { OpenCodeRawEvent, OpenCodeSessionEvents, OpenCodeEventRetriever, OpenCodeStoreOptions, SessionSummary, SessionListResult } from './opencode/types';

// Export shared, agent-agnostic session listing/fetch/normalization (Node.js only)
export { listAgentSessions, detectAgent, fetchRawEvents } from './opencode/agent-sessions';
export type { AgentSessionSummary, AgentSessionMeta, SupportedSessionAgent } from './opencode/agent-sessions';

// Export the frozen-fixture generator (Node.js only — runs git walk-up)
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

// Export the pure, runtime-agnostic session pipeline (no SQLite dependency)
export {
  NodePathNormalizationAdapter,
  normalizeEvents,
  normalizeEventsWithAdapter,
  accumulateEvents,
  collectRepositories,
  opencodeRowsToUniversalEvents,
} from './opencode/pipeline';
export type { OpenCodeEventRow } from './opencode/pipeline';

// Re-export FileSystemAdapter from repository-abstraction
export type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
export { InMemoryFileSystemAdapter } from '@principal-ai/repository-abstraction';

// Export rules engine (Node.js only - OpenTelemetry dependencies)
export * from './rules';

// Export workflow template system (full system including Node.js validator)
export {
  renderWorkflow,
  parseTemplate,
  ParsedTemplate,
  selectScenario,
  getRequiredEvents,
  hasEventMatching,
  computeAggregates,
  getNestedValue,
  setNestedValue,
  createWorkflowValidator,
  WorkflowValidator,
} from './workflow';
export type {
  TemplateSegment,
  WorkflowTemplate,
  WorkflowScenario,
  ScenarioTemplate,
  LogTemplates,
  FormattingOptions,
  OtelEvent,
  OtelSignal,
  WorkflowContext,
  WorkflowResult,
  ScenarioMatchResult,
  SpanTreeNode,
  WorkflowValidationContext,
  WorkflowViolation,
  WorkflowValidationResult,
} from './workflow';

// Export canvas, workflow, and test trace discovery
export { CanvasDiscovery } from './discovery/CanvasDiscovery';
export type {
  DiscoveredCanvas,
  DiscoveredTestTrace,
  CanvasDiscoveryResult,
  DiscoveryOptions,
  CanvasType,
  TestTraceType,
  DiscoveredCanvasWithContent,
  DiscoveredTestTraceWithContent,
  CanvasDiscoveryResultWithContent,
} from './discovery/types';

// Export library discovery
export { LibraryDiscovery } from './discovery/LibraryDiscovery';
export type {
  DiscoveredLibrary,
  LibraryDiscoveryResult,
  LibraryValidationError,
  LibraryValidationErrorType,
} from './discovery/LibraryDiscovery';

// Export execution validation
export { ExecutionValidator, createExecutionValidator } from './execution/ExecutionValidator';
export type {
  ExecutionData,
  ValidationError,
  ExecutionValidationResult,
} from './execution/ExecutionValidator';

// Export dashboard validation
export { DashboardValidator, createDashboardValidator } from './dashboard';
export type {
  DashboardValidationError,
  DashboardValidationResult,
  DashboardValidationContext,
} from './dashboard';

// Export execution loading (Node.js only - file system)
export { ExecutionLoader, createExecutionLoader } from './execution/ExecutionLoader';
export type {
  ExecutionFile,
  ExecutionLoadResult,
} from './execution/ExecutionLoader';

// Export scopes module (canvas validation + scope utilities)
export {
  ScopesCanvasValidator,
  ScopePathIndex,
  validateScopeNamespaceNesting,
  DEFAULT_SCOPE_COLOR,
  DRAFT_NODE_COLOR,
  getScopeNames,
  getScopeDefinition,
  getScopeColor,
  normalizeScopes,
  buildScopeColorMap,
  getAllScopeNames,
} from './scopes';
export type {
  ScopesCanvasValidationContext,
  ScopesCanvasValidationResult,
  ScopesCanvasViolation,
  ScopePathEntry,
  ScopePathMatch,
  ScopeEventsCanvasPair,
  ValidateScopeNamespaceNestingInput,
  NormalizedScope,
} from './scopes';

// Export auxiliary module (manifest validation for non-OTEL project regions)
export {
  AuxiliaryManifestValidator,
  validateAreaScopeDisjoint,
} from './auxiliary';
export type {
  AuxiliaryManifestValidationContext,
  AuxiliaryManifestValidationResult,
  AuxiliaryManifestViolation,
  ValidateAreaScopeDisjointInput,
} from './auxiliary';

// Export events module (canvas validation)
export {
  EventsCanvasValidator,
  ScopeEventsValidator,
  NamespacePathIndex,
  OtelEventPathsValidator,
} from './events';
export type {
  EventsCanvasValidationContext,
  EventsCanvasValidationResult,
  EventsCanvasViolation,
  ScopeEventsValidationContext,
  ScopeEventsValidationResult,
  ScopeEventsViolation,
  NamespacePathEntry,
  NamespacePathMatch,
  EventsCanvasInput,
  OtelCanvasInput,
  OtelEventPathsValidationContext,
  OtelEventPathsValidationResult,
  OtelEventPathsViolation,
  OtelEventPathsRuleId,
} from './events';
