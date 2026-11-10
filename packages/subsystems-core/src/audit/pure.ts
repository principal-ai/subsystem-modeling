/**
 * Browser-safe audit exports.
 *
 * The audit engine and source hashing are Node-only (filesystem, crypto). This
 * barrel holds the pure policy, types, and report rules so the main package
 * entry can re-export them without pulling Node built-ins into a browser
 * bundle. Node consumers use `./audit` for the full surface.
 */

export {
  cacheGraphifyAuditProvider,
  type GraphifyAuditModel,
  type GraphifyAuditEnsureResult,
  type GraphifyAuditPurlReadiness,
  type GraphifyAuditReadiness,
  type GraphifyAuditSnapshot,
  type GraphifyAuditProvider,
} from './graphify-provider'
export type {
  AuditSpanFreshness,
  SubsystemModelAuditFindingKind,
  SubsystemModelAuditSeverity,
  SubsystemModelAuditFix,
  SubsystemModelAuditFixGroup,
  SubsystemModelAuditFinding,
  SubsystemModelAuditCheck,
  SubsystemModelAuditBoundaryCheck,
  SubsystemModelAuditReport,
  SubsystemVerificationLane,
  VerificationLaneStatus,
  SubsystemModelVerificationLayer,
  SubsystemModelVerification,
} from './report'
export {
  auditBoundaryFields,
  auditProcessBacking,
  auditProcessVerification,
  dropUnbackedMissing,
  moduleAgreesWithFile,
  normalizeBoundaryPath,
  requiresProcess,
  type BoundaryAuditFinding,
  type BoundaryAuditResult,
  type BoundaryCheckKind,
  type BoundaryCheckVerdict,
  type BoundaryComponentCheck,
} from './boundary'
export {
  verifyProcessBoundaries,
  type C4AuditElement,
  type C4AuditElementState,
  type C4ProcessBoundaryStatus,
  type C4ProcessVerification,
} from './c4'
export {
  adoptGraphifyDeclarationRefFixFromVerify,
  adoptGraphifyFileFixFromVerify,
  adoptGraphifySignatureFixFromVerify,
  adoptTreeSitterSpanFixFromVerify,
  installedDependencyPackage,
  isAdoptableEmptyClaimedSignature,
  storeTypeStale,
  storeTypeUndeclared,
  verificationFailureDiagnostic,
  verificationUnavailableFinding,
  type InstalledDependency,
} from './fixes'
export { isRepoPurl, purlRepoKey } from './paths'
export {
  auditFixGroups,
  auditIssueCount,
  auditHasIssues,
  auditHasPartialGaps,
  classifyAuditReport,
  isVerifiedConstructCheck,
  summarizeVerification,
  summarizeLanes,
  type SubsystemModelAuditVerdict,
} from './report-logic'
export { callsSiteOutsideFrom, unconnectedComponentFindings } from './trail'
export type {
  AuditAnchorCandidate,
  AuditAnchorCheck,
  AuditComponentVerification,
  AuditConstructCheck,
  AuditDeclarationCheck,
  AuditFileCheck,
  AuditFileSuggestion,
  AuditSignatureCheck,
  AuditSignatureTypes,
} from './verification'
