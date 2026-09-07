/**
 * @principal-ai/subsystems-core
 * Browser-safe exports (no Node.js dependencies)
 *
 * This is the main entry point for the package and only includes browser-compatible code.
 * Includes types, canvas utilities, YAML parsing, and workflow rendering.
 *
 * For Node.js-specific functionality (file system utilities, etc.), use:
 * import { ... } from '@principal-ai/subsystems-core/node'
 */

// Import canvas utility functions to re-export (avoids export-from syntax that breaks with exports field)
import {
  isTextNode,
  isFileNode,
  isLinkNode,
  isGroupNode,
  hasPVExtension,
  isStandardCanvasNode,
  isOtelEventNode,
  isOtelSpanConventionNode,
  isOtelScopeNode,
  isOtelResourceNode,
  isOtelBoundaryNode,
  isOtelNode,
  getOtelNodeIdentifier,
  CANVAS_COLOR_PRESETS,
  resolveCanvasColor,
} from './types/canvas';

// Export essential types only
export type {
  GraphConfiguration,
  NodeState,
  EdgeState,
  NodeTypeDefinition,
  EdgeTypeDefinition,
  Violation,
  GraphEvent,
  NodeEvent,
  EdgeEvent,
  StateEvent,
  ComponentLibrary,
  LogLevel,
  GraphMetrics,
  Warning,
  ValidationResult,
  EventStream,
  ConnectionRule,
  ComponentActivityEvent,
  ComponentActionEvent,
  EdgeAnimationEvent,
  PathBasedEvent,
  JsonValue,
  JsonObject,
  ProjectArea,
  AuxiliaryManifest,
  SubsystemConstruct,
  SubsystemComponentRole,
  SubsystemFramework,
  SubsystemStereotype,
  SubsystemEdgeMechanism,
  SubsystemCapture,
  SubsystemDeclarationProvenance,
  SubsystemDeclTokenKind,
  SubsystemDeclToken,
  SubsystemDeclarationRef,
  SubsystemConstructDeclaration,
  SubsystemComponent,
  SubsystemComponentEdge,
  SubsystemThroughlineStep,
  SubsystemThroughline,
  SubsystemRepoRef,
  SubsystemModelDocument,
  SubsystemModelHostBinding,
  SubsystemModelHydrated,
} from './types';

// Auxiliary manifest type guard (browser-safe runtime helper)
export { isAuxiliaryManifest } from './types/auxiliary';

// Subsystem model type guard (browser-safe runtime helper)
export { isSubsystemModelDocument } from './types/subsystem-model';

// Export path-based configuration types (browser-safe)
export type { PathBasedGraphConfiguration } from './types/path-based-config';

// Export configuration types (browser-safe - just TypeScript interfaces)
export type { ConfigurationFile, ConfigurationLoadResult } from './ConfigurationLoader';

// Note: ConfigurationLoader class is Node.js-only and exported from @principal-ai/subsystems-core/node

// Export Canvas types and converter
export type {
  // JSON Canvas Spec types
  CanvasColor,
  CanvasSide,
  CanvasEndpoint,
  CanvasBackgroundStyle,
  CanvasNodeBase,
  CanvasTextNode,
  CanvasFileNode,
  CanvasLinkNode,
  CanvasGroupNode,
  CanvasNode,
  CanvasEdge,
  Canvas,
  // Principal View extension types
  PVAnimationType,
  PVAnimationDirection,
  PVNodeShape,
  PVEdgeStyle,
  PVLogLevel,
  PVNodeState,
  PVOtelKind,
  PVOtelCategory,
  PVOtelSpanMatch,
  PVOtelResourceMatch,
  PVOtelExtension,
  PVEventFieldSchema,
  PVEventSchema,
  PVNodeStatus,
  PVNodeExtension,
  PVEdgeExtension,
  PVPathConfig,
  PVDisplayConfig,
  PVNodeTypeDefinition,
  PVEdgeTypeDefinition,
  PVCanvasExtension,
  // Extended Canvas types
  ExtendedCanvasTextNode,
  ExtendedCanvasFileNode,
  ExtendedCanvasLinkNode,
  ExtendedCanvasGroupNode,
  ExtendedCanvasNode,
  ExtendedCanvasEdge,
  ExtendedCanvas,
  // OTEL Node types
  OtelNodeBase,
  OtelMetadata,
  OtelEventNode,
  OtelSpanConventionNode,
  OtelScopeNode,
  OtelResourceNode,
  OtelBoundaryNode,
  OtelNode,
  // Workflow chip type (for span convention nodes)
  WorkflowChip,
} from './types/canvas';

// Re-export canvas utility functions (imported at top to avoid module resolution issues)
export {
  isTextNode,
  isFileNode,
  isLinkNode,
  isGroupNode,
  hasPVExtension,
  isStandardCanvasNode,
  isOtelEventNode,
  isOtelSpanConventionNode,
  isOtelScopeNode,
  isOtelResourceNode,
  isOtelBoundaryNode,
  isOtelNode,
  getOtelNodeIdentifier,
  CANVAS_COLOR_PRESETS,
  resolveCanvasColor,
};

export { CanvasConverter } from './utils/CanvasConverter';
export type { ReactFlowNode, ReactFlowEdge } from './utils/CanvasConverter';

// Export YAML parsing (browser-compatible)
export { parseYaml, isYamlFile, getConfigNameFromFilename } from './utils/YamlParser';
export type { YamlParseResult } from './utils/YamlParser';

// Export workflow template system (browser-safe)
// Import directly from files to avoid pulling in Node.js validator
export { renderWorkflow, renderEventTemplate } from './workflow/template-renderer';
export { parseTemplate, ParsedTemplate } from './workflow/template-parser';
export type { TemplateSegment, TemplateContext, TemplateValue, TemplateData } from './workflow/template-parser';
export {
  selectScenario,
  getRequiredEvents,
  hasEventMatching,
  computeAggregates,
  getNestedValue,
  setNestedValue,
} from './workflow/scenario-matcher';

// Edge derivation (for sequence numbering on edges)
export type { DerivedEdge } from './workflow/edge-derivation';
export { extractEventSpans, deriveEdgesFromSequence } from './workflow/edge-derivation';
export type {
  WorkflowTemplate,
  WorkflowScenario,
  ScenarioOutcomeType,
  ScenarioTemplate,
  LogTemplates,
  FormattingOptions,
  OtelEvent,
  OtelSignal,
  WorkflowContext,
  WorkflowResult,
  ScenarioMatchResult,
  ScenarioMatchDetail,
  EnhancedScenarioMatchResult,
  WorkflowMatch,
  SpanTreeNode,
  EventTemplate,
} from './workflow/types';
export {
  isEventTemplate,
  getEventTemplateString,
  getEventSpan,
  getWorkflowRootSpan,
} from './workflow/types';

// Export OTEL types (OTLP data structures and helpers)
export type {
  // OTLP data structures (JSON format)
  OtelExportTraceServiceRequest,
  OtelResourceSpansData,
  OtelScopeSpans,
  OtelSpanData,
  OtelResourceData,
  OtelKeyValue,
  OtelAnyValue,
  OtelSpanEvent,
  OtelLink,
  OtelSpanStatus,
  OtelInstrumentationScope,
  // Application-level types
  TraceInfo,
  WorkflowMatchInfo,
  // Simplified types (backward compatible)
  OtelAttributes,
  OtelAttributeValue,
  OtelLog,
  OtelSpan,
  OtelResource,
  OtelSeverity,
  OtelSeverityText,
  OtelSeverityNumber,
} from './types/otel';

// Export registry-aware trace types
export type {
  RegisteredTrace,
  TraceResource,
  MatchedSpan,
  ScenarioMatch,
  OrphanedSpan,
  StoryboardMatch,
  UnmatchedSpan,
  UnmatchedSpans,
  ValidationIssue,
  StoryboardRegistryInterface,
  TraceRegistryMatcher,
  Resource,
  Scope,
  ScopeLookupResult,
} from './types/registered-trace';

// Export OTLP trace parser
export { OtlpTraceParser } from './parsers/OtlpTraceParser';
export type { ExtractedSpan, ExtractedEvent } from './parsers/OtlpTraceParser';

// Export storyboard registries
export { RemoteRegistry } from './registry/RemoteRegistry';
export { LocalRegistry, type FileReader } from './registry/LocalRegistry';
export { CompositeRegistry } from './registry/CompositeRegistry';

// Export trace orchestrator
export { TraceOrchestrator } from './orchestration/TraceOrchestrator';
export type { TraceOrchestratorConfig } from './orchestration/TraceOrchestrator';

// Export OTEL helper functions
export {
  getAttributeStringValue,
  findAttribute,
  getAttributeValue,
  flattenResourceAttributes,
  parseNanoTime,
  getSpanDuration,
  isErrorSeverity,
  isWarnSeverity,
} from './types/otel';

// Export version registry types and implementation
export type {
  VersionIdentifier,
  VersionSnapshot,
  RegisterVersionRequest,
  GetVersionResponse,
  VersionRegistry,
} from './types/version-registry';
export { InMemoryVersionRegistry, createInMemoryVersionRegistry } from './registry/VersionRegistry';

// Export trace aggregation utilities
export { groupSpansByTrace } from './utils/traceAggregation';

// Export RegisteredTrace helper utilities
export {
  getScopeFromScenarioMatch,
  getScopeFromStoryboardMatch,
  getScopeFromUnmatchedSpan,
  getPrimaryScope,
  getAllScopes,
  getMatchedScopes,
  getPartialMatchedScopes,
  getUnmatchedScopes,
  findScopeByName,
  getSpanCountForScope,
  getScopeWithMostSpans,
  scopeHasMatches,
  getScopeMatchSummary,
} from './utils/registeredTraceHelpers';
export type { ScopeInfo } from './utils/registeredTraceHelpers';

// Export span matcher
export { SpanMatcher } from './matchers/SpanMatcher';
export type { SpanMatchResult } from './matchers/SpanMatcher';

// Export canvas, workflow, and test trace discovery (browser-safe)
export { CanvasDiscovery } from './discovery/CanvasDiscovery';
export type {
  DiscoveredCanvas,
  DiscoveredTestTrace,
  DiscoveredWorkflow,
  DiscoveredStoryboard,
  DiscoveredDashboard,
  ReferencedSpan,
  CanvasDiscoveryResult,
  DiscoveryOptions,
  CanvasType,
  TestTraceType,
  DiscoveredCanvasWithContent,
  DiscoveredTestTraceWithContent,
  DiscoveredWorkflowWithContent,
  DiscoveredStoryboardWithContent,
  DiscoveredDashboardWithContent,
  CanvasDiscoveryResultWithContent,
  // File manifest types
  CanvasFileRole,
  CanvasFileOrigin,
  CanvasFileLevel,
  CanvasFile,
  CanvasFileStats,
  StoryboardFileStats,
  CanvasFileManifest,
  WorkflowFileManifest,
  StoryboardFileManifest,
  DiscoveredCanvasWithManifest,
  DiscoveredWorkflowWithManifest,
  DiscoveredStoryboardWithManifest,
} from './discovery/types';

// Export file manifest builders (browser-safe)
export {
  buildCanvasFileManifest,
  buildWorkflowFileManifest,
  buildStoryboardFileManifest,
} from './discovery/CanvasFileManifest';

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

// Export events module (event namespace canvas validation)
export { EventsCanvasValidator, NamespacePathIndex, OtelEventPathsValidator } from './events';
export type {
  EventNamespaceNode,
  EventsCanvasValidationContext,
  EventsCanvasViolation,
  EventsCanvasValidationResult,
  NamespacePathEntry,
  NamespacePathMatch,
  EventsCanvasInput,
  OtelCanvasInput,
  OtelEventPathsValidationContext,
  OtelEventPathsValidationResult,
  OtelEventPathsViolation,
  OtelEventPathsRuleId,
} from './events';

// Export spans module (span conventions + span color utilities)
export {
  DEFAULT_SPAN_COLOR,
  extractSpanConvention,
  extractSpanConventions,
  buildSpanColorMap,
  buildSpanColorMapFromCanvases,
  matchSpanPattern,
  getSpanColor,
  resolveEventSpanColor,
} from './spans';
export type { NormalizedSpanConvention } from './spans';

// Export execution validation (browser-safe - no Node.js dependencies)
export { ExecutionValidator, createExecutionValidator } from './execution/ExecutionValidator';
export type {
  ExecutionData,
  ValidationError,
  ExecutionValidationResult,
} from './execution/ExecutionValidator';

// Export dashboard validation (browser-safe - no Node.js dependencies)
export { DashboardValidator, createDashboardValidator } from './dashboard';
export type {
  DashboardValidationError,
  DashboardValidationResult,
  DashboardValidationContext,
} from './dashboard';

// Export telemetry coverage analysis (browser-safe - uses FileTree abstraction)
export { analyzeCoverage } from './telemetry/coverage';
export type {
  CoverageMetrics,
  FileInstrumentation,
  PackageCoverageMetrics,
} from './telemetry/coverage';

// Export path-based processing (browser-safe - Milestone 1 & 2)
export { PathBasedEventProcessor } from './PathBasedEventProcessor';
export type { LogEntry } from './PathBasedEventProcessor';

// Export session management (browser-safe - Event Recording System)
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

// Export event recorder service (browser-safe)
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

// Export component library support (browser-safe - uses FileSystemAdapter abstraction)
export { LibraryLoader } from './LibraryLoader';
export type { ResourceAttributes, ScopeDefinition, OwnedScopes } from './types/library';

// Export library validation (browser-safe - standalone validation functions)
export { validateLibraryStructure } from './validation';
export type {
  LibraryValidationError,
  LibraryValidationErrorType,
  LibraryValidationResult,
} from './validation';

// Export library discovery (browser-safe - uses FileSystemAdapter abstraction)
export { LibraryDiscovery } from './discovery/LibraryDiscovery';
export type {
  DiscoveredLibrary,
  LibraryDiscoveryResult,
} from './discovery/LibraryDiscovery';

// Export storyboard context types and builder (browser-safe)
export type {
  StoryboardReference,
  WorkflowReference,
  ScenarioReference,
  StoryboardContextSliceData,
  EventNodeMap,
  BuildStoryboardContextOptions,
} from './storyboard/index';

// Export dashboard types (browser-safe - for dashboard definition files)
export type {
  // Dashboard definition types
  DashboardDefinition,
  MetricDefinition,
  MetricType,
  MetricSource,
  MetricQuery,
  Derivation,
  TimeGroup,
  AlertDefinition,
  MetricDisplay,
  DisplayComponent,
  // Layout types
  DashboardLayout,
  DashboardRow,
  PanelPlacement,
  // Mock data types
  MockMetricData,
  TimeSeriesPoint,
  HistogramData,
  // Time range types
  TimeRangePreset,
  TimeRange,
  RefreshInterval,
  TimeRangeConfig,
  // Runtime types
  MetricData,
  DataProvider,
} from './types/dashboard';
export {
  buildStoryboardContext,
  buildEventNodeMap,
  getNodeEventName,
  resolveScenarioNodeIds,
  resolveWorkflowNodeIds,
  findNodesMatchingEventPattern,
  getAllNodeIds,
} from './storyboard/index';

// Re-export FileSystemAdapter type from repository-abstraction (for custom adapter implementations)
export type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
export { InMemoryFileSystemAdapter } from '@principal-ai/repository-abstraction';

// Canonical topic storage contract (browser-safe types + Draft->Published
// projection). The file-per-topic store that reads/writes these is node-only;
// import it from '@principal-ai/subsystems-core/node'.
export { publishedFromDraft } from './storage/topic-types';
export type {
  DraftTopic,
  PublishedTopic,
  PublishProjection,
  TopicStatus,
  TopicAsset,
  TopicCreator,
} from './storage/topic-types';

// NOTE: The following require Node.js dependencies and are NOT exported in the main bundle.
// Use '@principal-ai/subsystems-core/node' for Node.js-specific functionality:
//
// - EventProcessor, ValidationEngine, ConfigurationValidator (Node.js processing)
// - OpenCodeEventStore, OpenCodeEventRetriever (opencode event reading)
// - GraphInstrumentationHelper (Node.js utilities)
// - PathMatcher, GraphConverter (Node.js utilities)
// - EventValidator, createValidatedEmitter (Node.js telemetry)
// - generateTypes, TypeScriptGenerator, generatorRegistry (code generation - file system)
// - traceToCanvas, traceToCanvasJson (trace utilities)
// - Rules engine (OpenTelemetry dependencies)
// - NarrativeValidator, createNarrativeValidator (Node.js validator)
// - ExecutionLoader, createExecutionLoader (file system loader)
//
// For building FileTree from filesystem, use FilesystemService from @principal-ai/codebase-composition:
// import { FilesystemService, NodeFileSystemAdapter } from '@principal-ai/codebase-composition/node';
// const service = new FilesystemService(new NodeFileSystemAdapter());
// const fileTree = await service.buildFileSystemTreeFromPath(rootDir);
