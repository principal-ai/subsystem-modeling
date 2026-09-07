/**
 * @principal-ai/visual-validation-react
 * React components for graph-based visual validation framework
 *
 * This library provides UI building blocks for creating graph visualization panels.
 * The actual "panel" application should be built separately using these components.
 */

// Re-export types from core
export type {
  GraphConfiguration,
  GraphEvent,
  GraphMetrics,
  Violation,
  Warning,
  ValidationResult,
  EventStream,
  NodeTypeDefinition,
  EdgeTypeDefinition,
  ConnectionRule,
  NodeState,
  EdgeState,
  ConfigurationFile,
  ConfigurationLoadResult,
  // Library types for loading .principal-views/library.yaml
  ComponentLibrary,
} from '@principal-ai/subsystems-core';

// Export components
export { GraphRenderer } from './components/GraphRenderer';
export type {
  GraphRendererProps,
  GraphRendererHandle,
  NodePositionChange,
  PendingChanges,
} from './components/GraphRenderer';

export { SequenceDiagramRenderer } from './components/SequenceDiagramRenderer';
export type { SequenceDiagramRendererProps } from './components/SequenceDiagramRenderer';

export { WorkflowSequenceDiagram } from './components/WorkflowSequenceDiagram';
export type { WorkflowSequenceDiagramProps } from './components/WorkflowSequenceDiagram';

export { useSequenceLayout } from './hooks/useSequenceLayout';
export type {
  SequenceEvent,
  SequenceEdge,
  Swimlane,
  UseSequenceLayoutOptions,
  UseSequenceLayoutResult,
} from './hooks/useSequenceLayout';

export { MultiCanvasRenderer, mergeCanvases, parseNodeId } from './components/MultiCanvasRenderer';
export type {
  MultiCanvasRendererProps,
  MultiCanvasLayout,
  CanvasPlacement,
} from './components/MultiCanvasRenderer';

export { ConfigurationSelector } from './components/ConfigurationSelector';
export type { ConfigurationSelectorProps } from './components/ConfigurationSelector';

// Export node/edge renderers
export { GenericNode } from './nodes/GenericNode';
export type { GenericNodeProps } from './nodes/GenericNode';

export { CustomNode } from './nodes/CustomNode';
export type { CustomNodeData } from './nodes/CustomNode';

// Export OTEL node components
export {
  OtelSpanConventionNode,
  OtelEventNode,
  OtelScopeNode,
  OtelResourceNode,
  OtelBoundaryNode,
} from './nodes/otel';
export type {
  OtelSpanConventionNodeData,
  OtelEventNodeData,
  OtelScopeNodeData,
  OtelResourceNodeData,
  OtelBoundaryNodeData,
  WorkflowChip,
} from './nodes/otel';

export { GenericEdge } from './edges/GenericEdge';
export type { GenericEdgeProps } from './edges/GenericEdge';

export { CustomEdge } from './edges/CustomEdge';
export type { CustomEdgeData } from './edges/CustomEdge';

// Export tooltip component
export { NodeTooltip } from './components/NodeTooltip';
export type { NodeTooltipProps, OtelInfo } from './components/NodeTooltip';

// Export utilities
export {
  convertToXYFlowNodes,
  convertToXYFlowEdges,
} from './utils/graphConverter';
export type { EdgeStateWithHandles } from './utils/graphConverter';
export { Icon, resolveIcon } from './utils/iconResolver';
export type { IconProps } from './utils/iconResolver';
export {
  swapGraphOrientation,
  swapNodePositions,
  swapEdgeSides,
} from './utils/orientationUtils';
export { getCanvasBounds, getCanvasDisplaySize, calculateInitialViewport } from './utils/canvasBounds';
export type { CanvasBounds, Viewport } from './utils/canvasBounds';

// ELK layout utilities for circuit-board style edge routing
export { computeElkLayout, createElkLayouter } from './utils/elkLayout';
export type { ElkLayoutOptions, ElkLayoutResult, ElkRoutingStyle } from './utils/elkLayout';
export { useElkLayout, applyElkPathsToEdges } from './hooks/useElkLayout';
export type { UseElkLayoutOptions, UseElkLayoutResult } from './hooks/useElkLayout';

// Dashboard components for rendering metrics from dashboard definition files
export {
  DashboardRenderer,
  MetricPanel,
  MetricCard,
  LineChart,
  BarChart,
  SourceLink,
  TimeRangeSelector,
  MockDataProvider,
  createMockDataProvider,
} from './components/dashboard';
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
  DashboardLayout,
  DashboardRow,
  PanelPlacement,
  // Time range types
  TimeRangePreset,
  TimeRange,
  RefreshInterval,
  TimeRangeConfig,
  // Mock data types
  MockMetricData,
  TimeSeriesPoint,
  HistogramData,
  // Runtime types
  MetricData,
  DataProvider,
  // Component props
  DashboardRendererProps,
  MetricPanelProps,
  MetricCardProps,
  LineChartProps,
  BarChartProps,
  SourceLinkProps,
  TimeRangeSelectorProps,
} from './components/dashboard';

// State View components for event-driven state visualization
export { PipelineView, useStateView } from './components/state-view';
export type {
  // Core types
  StateEvent,
  EventSource,
  StateReducer,
  StateDiff,
  TransitionDefinition,
  ActiveAnimation,
  AnimationType,
  ReplayControls,
  StateViewDefinition,
  // Pipeline view types
  PipelineState,
  PipelineStage,
  PipelineRepoState,
  PipelineEvent,
  PipelineEventType,
  // Activity view types
  ActivityState,
  RoomState,
  ActivityEvent,
  ActivityEventType,
  // Quota view types
  QuotaDistributionState,
  UserQuotaState,
  QuotaEvent,
  QuotaEventType,
  // Hook types
  UseStateViewOptions,
  UseStateViewResult,
  // Component props
  PipelineViewProps,
} from './components/state-view';

// Session event diagnostic feed (raw → repo-normalized → accumulated)
export {
  SessionEventFeed,
  SessionEventFeedGrouped,
} from './components/session-events';
export type {
  SessionEventFeedProps,
  SessionEventFeedGroupedProps,
  SessionEventFeedRow,
} from './components/session-events';

// Graphify integration types (graph.json data model)
export type {
  JsonValue,
  GraphifyFileType,
  GraphifyConfidence,
  GraphifyNodeType,
  GraphifyRelation,
  GraphifyNode,
  GraphifyEdge,
  GraphifyHyperedge,
  GraphifyGraphMetadata,
  GraphifyGraph,
} from './graphify';
export type {
  GraphifyAnchorResolution,
  SubsystemGraphifyAnchor,
  GraphifyMethodInfo,
  GraphifyPropertyInfo,
  GraphifyParamInfo,
  GraphifyCallInfo,
  GraphifyReferenceInfo,
  GraphifyImportInfo,
  GraphifyClassDetail,
  GraphifyFunctionDetail,
  GraphifyTypeDetail,
  GraphifyModuleDetail,
  GraphifyExternalDetail,
  GraphifyComponentDetail,
  GraphifyEdgeRef,
} from './graphify';
export type {
  GraphifyTypeRefStatus,
  GraphifyTypeRefResolution,
} from './graphify';
export {
  normalizeGraphifyLabel,
  createGraphifyTypeResolver,
  resolveGraphifyTypeRef,
  normalizeGraphifyId,
  makeGraphifyId,
  graphifyFileStem,
  normalizeSourcePath,
  resolveComponentAnchor,
  symbolLabelVariants,
  inferGraphifyKind,
  kindsMatch,
  extractNamedTypes,
  extractGraphifySignature,
  compareSignatures,
} from './graphify';
export type {
  ComponentAnchorInput,
  ComponentAnchorResult,
  InferredGraphifyKind,
  InferGraphifyKindResult,
  GraphifyInferredSignature,
  ClaimedSignature,
  SignatureCompareResult,
} from './graphify';

// Subsystem component graph
export { SubsystemComponentGraph } from './subsystem/SubsystemComponentGraph';
export type { SubsystemComponentGraphProps, ThroughlineViewerContext } from './subsystem/SubsystemComponentGraph';
export type {
  ComponentVerificationState,
  ComponentVerificationPhase,
  ComponentDeclarationProps,
} from './subsystem/ComponentDeclaration';
export { ComponentDeclaration } from './subsystem/ComponentDeclaration';
export { MECHANISM_COLOR, MECHANISM_STYLE } from './subsystem/model';
export { CONSTRUCT_COLOR, constructColorsFromPierreTheme } from './pierre/constructColors';
export {
  purlRepoKey,
  purlOwnerName,
  buildTreePathMapping,
  buildRepoGroups,
  repoAvatarUrl,
} from './subsystem/paths';
export type {
  TreeEntry,
  TreePathMapping,
  RepoGroup,
} from './subsystem/paths';
export { SubsystemFileTree } from './subsystem/SubsystemFileTree';
export type { SubsystemFileTreeProps } from './subsystem/SubsystemFileTree';
export { GraphLayoutCover } from './subsystem/GraphLayoutCover';
export type { GraphLayoutCoverProps } from './subsystem/GraphLayoutCover';
export type {
  SubsystemComponent,
  SubsystemComponentEdge,
  SubsystemThroughline,
  SubsystemThroughlineStep,
  SubsystemModelDocument,
  SubsystemComponentConstruct,
  SubsystemComponentRole,
  SubsystemFramework,
  SubsystemStereotype,
  SubsystemEdgeMechanism,
} from './subsystem/model';
export {
  constructBadgeLabel,
  deriveNameFromSymbol,
  nodeMinWidthForBadges,
  ROLE_COLOR,
  ROLE_LABEL,
} from './subsystem/model';
export type {
  SubsystemDeclarationRef,
  SubsystemOpenFileOptions,
  DeclarationFreshness,
} from './subsystem/declarationRef';
export {
  parseSourceLocation,
  normalizeDeclarationLine,
  extractDeclarationLine,
  DECLARATION_HASH_ALGO,
} from './subsystem/declarationRef';

// Pierre code views (@pierre/diffs wrappers)
export { PierreFileView, PierreSnippetView, PierreThroughlineCodeView, sliceSnippetWindow, resolvePierreSyntaxThemeName } from './pierre';
export type {
  PierreFileViewProps,
  PierreSnippetViewProps,
  PierreThroughlineCodeViewProps,
  SnippetSlice,
  PierreSyntaxThemeName,
} from './pierre';
