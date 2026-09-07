/**
 * Graphify integration types.
 *
 * Type-compatible view of graphify's graph.json data model for consuming
 * graphify output (nodes, links, hyperedges) inside this library.
 */

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
} from './types';
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
  GraphifyStoreDetail,
  GraphifyComponentDetail,
  GraphifyEdgeRef,
} from './consolidated';
export type {
  GraphifyTypeRefStatus,
  GraphifyTypeRefResolution,
} from './resolve';
export {
  normalizeGraphifyLabel,
  createGraphifyTypeResolver,
  resolveGraphifyTypeRef,
} from './resolve';
export {
  normalizeGraphifyId,
  makeGraphifyId,
  graphifyFileStem,
  normalizeSourcePath,
} from './ids';
export type {
  ComponentAnchorInput,
  ComponentAnchorResult,
} from './anchor';
export {
  resolveComponentAnchor,
  symbolLabelVariants,
} from './anchor';
export type { InferredGraphifyKind, InferGraphifyKindResult } from './kind';
export { inferGraphifyKind, kindsMatch } from './kind';
export type {
  GraphifyInferredSignature,
  ClaimedSignature,
  SignatureCompareResult,
} from './signature';
export {
  extractNamedTypes,
  extractGraphifySignature,
  compareSignatures,
} from './signature';
