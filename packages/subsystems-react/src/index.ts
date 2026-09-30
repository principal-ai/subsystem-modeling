/**
 * @principal-ai/subsystems-react
 *
 * React UI for Subsystem Models (graph, Pierre code views, graphify helpers)
 * plus session-event feeds used by Subsystems Studio.
 */

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

// Maintain event log — presentational live OpenCode agent-run event feed
export { MaintainEventLog, MaintainLivePanel } from './components/maintain-events';
export type {
  MaintainEventLogEvent,
  MaintainEventLogProps,
  MaintainLivePanelProps,
} from './components/maintain-events';

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
  GraphifyClassDetail,
  GraphifyFunctionDetail,
  GraphifyTypeDetail,
  GraphifyExternalDetail,
  GraphifyCustomEntityDetail,
  GraphifyCustomEntityAttribute,
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
  inferConstructFromGraphify,
  constructsMatch,
  resolveConstructMatch,
  extractNamedTypes,
  extractGraphifySignature,
  compareSignatures,
} from './graphify';
export type {
  ComponentAnchorInput,
  ComponentAnchorResult,
  InferredGraphifyConstruct,
  InferConstructFromGraphifyResult,
  GraphifyInferredSignature,
  ClaimedSignature,
  SignatureCompareResult,
} from './graphify';

// ELK layout utilities
export { computeElkLayout, createElkLayouter } from './utils/elkLayout';
export type { ElkLayoutOptions, ElkLayoutResult, ElkRoutingStyle } from './utils/elkLayout';
export {
  EDGE_LABEL_WIDTH,
  EDGE_LABEL_HEIGHT,
  EDGE_LABEL_FONT_SIZE,
  EDGE_LABEL_SIDE_PADDING,
  EDGE_LABEL_EDGE_GAP,
} from './utils/edgeLabel';
export { useElkLayout, applyElkPathsToEdges } from './hooks/useElkLayout';
export type { UseElkLayoutOptions, UseElkLayoutResult } from './hooks/useElkLayout';

// Subsystem component graph
export { SubsystemComponentGraph } from './subsystem/SubsystemComponentGraph';
export type { SubsystemComponentGraphProps, WalkthroughViewerContext } from './subsystem/SubsystemComponentGraph';
export { SubsystemModelTransition } from './subsystem/SubsystemModelTransition';
export type {
  SubsystemModelTransitionProps,
  SubsystemTransitionStep,
} from './subsystem/SubsystemModelTransition';
export { SubsystemAggregateGraph } from './subsystem/SubsystemAggregateGraph';
export type {
  SubsystemAggregateGraphProps,
  AggregateFrameNode,
  AggregateFrameMember,
  AggregateFrameEdge,
  AggregateHub,
} from './subsystem/SubsystemAggregateGraph';
export { ConstructsCatalog } from './subsystem/ConstructsCatalog';
export type { ConstructsCatalogProps } from './subsystem/ConstructsCatalog';
export type {
  ComponentVerificationState,
  ComponentVerificationPhase,
  ComponentDeclarationProps,
} from './subsystem/ComponentDeclaration';
export { ComponentDeclaration } from './subsystem/ComponentDeclaration';
export { SymbolInspectionCard } from './subsystem/SymbolInspectionCard';
export type { SymbolInspectionCardProps } from './subsystem/SymbolInspectionCard';
export {
  extractDeclarationSymbolRefs,
  isLimitedInspection,
} from './subsystem/symbolRefs';
export type {
  DeclarationSymbolRef,
  SymbolInspection,
  SymbolInspectionResolution,
  SymbolInspectionNode,
  SymbolInspectionSource,
  SymbolInspectionCandidate,
} from './subsystem/symbolRefs';
export {
  SubsystemDiagnosticToggle,
  diagnosticStatusColor,
  diagnosticTitle,
} from './subsystem/DiagnosticToggle';
export type {
  SubsystemDiagnostic,
  SubsystemDiagnosticStatus,
  SubsystemDiagnosticToggleProps,
} from './subsystem/DiagnosticToggle';
export {
  SubsystemIssueList,
  SubsystemIssueCard,
  groupIssuesByTarget,
  groupIssuesByCategory,
  issueCategory,
  issueKindLabel,
  humanizeIssueKind,
  issueKindOrder,
  worstSeverity,
  severityRank,
  SUBSYSTEM_ISSUE_CATEGORIES,
  SUBSYSTEM_ISSUE_CATEGORY_LABEL,
} from './subsystem/IssueList';
export type {
  SubsystemIssue,
  SubsystemIssueSeverity,
  SubsystemIssueTarget,
  SubsystemIssueTargetKind,
  SubsystemIssueCategory,
  SubsystemIssueGroup,
  SubsystemIssueCategoryGroup,
  SubsystemIssueCardProps,
  SubsystemIssueListProps,
} from './subsystem/IssueList';

// Maintain agent pipeline panel (graph sidebar diagnostics → Agents tab)
export { SubsystemAgentsPanel } from './subsystem/AgentsPanel';
export type {
  SubsystemAgent,
  SubsystemAgentsPanelProps,
} from './subsystem/AgentsPanel';
export {
  MECHANISM_COLOR,
  MECHANISM_STYLE,
  MECHANISM_FALLBACK_COLOR,
  GRAPHIFY_RELATION_COLOR,
  GRAPHIFY_RELATION_STYLE,
  GRAPHIFY_RELATION_FALLBACK_COLOR,
  edgeColor,
  edgeStrokeStyle,
} from './subsystem/model';
export { BOUNDARY_COLOR, assignBoundaryColors, boundaryFill } from './subsystem/model';
export { CONSTRUCT_COLOR, componentColor, constructColorsFromPierreTheme } from './pierre/constructColors';
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
export {
  WalkthroughsPanel,
  WALKTHROUGH_PLAY_PAUSE_MS,
  STEP_COPY_FEEDBACK_MS,
} from './subsystem/WalkthroughsPanel';
export type { WalkthroughsPanelProps } from './subsystem/WalkthroughsPanel';
export { buildStepBrief } from './subsystem/walkthroughBrief';
export { GraphLayoutCover } from './subsystem/GraphLayoutCover';
export type { GraphLayoutCoverProps } from './subsystem/GraphLayoutCover';
export {
  SubsystemComponentNode,
  SubsystemCallbacksProvider,
} from './subsystem/nodes';
export type { SubsystemGraphCallbacks } from './subsystem/nodes';
export type {
  SubsystemComponent,
  SubsystemGraphNodeData,
  SubsystemComponentEdge,
  SubsystemWalkthrough,
  SubsystemWalkthroughStep,
  SubsystemWalkthroughMechanism,
  SubsystemModelDocument,
  SubsystemComponentConstruct,
  SubsystemComponentRole,
  SubsystemFramework,
  SubsystemStereotype,
  SubsystemEdgeMechanism,
  SubsystemEdgeView,
  SubsystemEdgeProvenance,
  SubsystemGraphifyRelation,
  SubsystemConstructDeclaration,
  SubsystemDeclarationProvenance,
  SubsystemSignatureClaim,
  SubsystemSignatureParameter,
} from './subsystem/model';
export {
  constructBadgeLabel,
  constructBadgeColor,
  rightBadgeLabel,
  rightBadgeColor,
  deriveNameFromSymbol,
  nodeMinWidthForBadges,
  deriveGraphEdges,
  isConstructsOnlyModel,
  derivedGraphEdgeId,
  walkthroughStepGraphEdgeId,
  reorderWalkthroughs,
  reorderTargetIndex,
  isWalkthroughMechanism,
  SUBSYSTEM_WALKTHROUGH_MECHANISMS,
  ROLE_COLOR,
  ROLE_LABEL,
  FRAMEWORK_BADGE_COLOR,
  PROPOSED_COLOR,
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
export {
  setPrettierProvider,
  getPrettierProvider,
} from './subsystem/prettierProvider';
export type { PrettierBundle } from './subsystem/prettierProvider';

// Pierre code views (@pierre/diffs wrappers)
export { PierreFileView, PierreSnippetView, PierreWalkthroughCodeView, sliceSnippetWindow, resolvePierreSyntaxThemeName } from './pierre';
export type {
  PierreFileViewProps,
  PierreSnippetViewProps,
  PierreWalkthroughCodeViewProps,
  SnippetSlice,
  PierreSyntaxThemeName,
} from './pierre';
