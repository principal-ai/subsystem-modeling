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

// ELK layout utilities
export { computeElkLayout, createElkLayouter } from './utils/elkLayout';
export type { ElkLayoutOptions, ElkLayoutResult, ElkRoutingStyle } from './utils/elkLayout';
export { useElkLayout, applyElkPathsToEdges } from './hooks/useElkLayout';
export type { UseElkLayoutOptions, UseElkLayoutResult } from './hooks/useElkLayout';

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
