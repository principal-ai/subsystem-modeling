import type { SubsystemSourceSpan } from '../types/subsystem-model'

export type AuditSpanFreshness =
  | 'full'
  | 'stale'
  | 'missing'
  | 'unanchored'
  | 'unchecked'

export type SubsystemModelAuditFindingKind =
  | 'missing_file'
  | 'component_unconnected'
  | 'symbol_ambiguous'
  | 'symbol_unmatched'
  | 'trail'
  | 'construct_span_stale'
  | 'construct_span_unconfirmed'
  | 'construct_span_capturable'
  | 'construct_mismatch'
  | 'construct_unconfirmed'
  | 'store_type_undeclared'
  | 'store_type_stale'
  | 'signature_mismatch'
  | 'signature_unconfirmed'
  | 'step_span_unconfirmed'
  | 'step_span_stale'
  | 'step_site_outside_from'
  | 'step_site_unconfirmed'
  | 'step_site_mismatch'
  | 'step_site_stale'
  | 'step_target_mismatch'
  | 'step_target_stale'
  | 'repo_unresolved'
  | 'graphify_unavailable'
  | 'third_party_path'
  | 'boundary_module_file_mismatch'
  | 'boundary_process_nest_disagree'
  | 'boundary_process_missing'
  | 'boundary_process_unassigned'
  | 'boundary_process_proposed'
  | 'boundary_process_rejected'
  | 'boundary_process_unbacked'

export type SubsystemModelAuditSeverity = 'error' | 'info'

export type SubsystemModelAuditFix =
  | {
      id: 'adopt_graphify_signature'
      label: string
      parameterTypes: string[]
      returnTypes: string[]
    }
  | {
      id: 'adopt_graphify_file'
      label: string
      file: string
      previousFile?: string
    }
  | {
      id: 'adopt_graphify_declaration_ref'
      label: string
      declarationSpan: SubsystemSourceSpan
      previousStartLine?: number
    }
  | {
      id: 'adopt_tree_sitter_span'
      label: string
      declarationSpan: SubsystemSourceSpan
    }

export interface SubsystemModelAuditFixGroup {
  fixId: SubsystemModelAuditFix['id']
  count: number
}

export interface SubsystemModelAuditFinding {
  kind: SubsystemModelAuditFindingKind
  severity: SubsystemModelAuditSeverity
  componentAlias?: string
  componentName?: string
  moduleKey?: string
  processKey?: string
  purl?: string
  trailId?: string
  step?: number
  message: string
  fix?: SubsystemModelAuditFix
}

export interface SubsystemModelAuditCheck {
  componentAlias: string
  componentName?: string
  construct?: string
  symbol?: string
  file?: string
  fileExists: boolean | null
  symbolDeclared: boolean | null
  declarationFreshness?: AuditSpanFreshness | 'n/a'
  constructMatch?: boolean | null
  constructClaimed?: string
  constructInferred?: string
  constructEvidence?: string[]
  signature?: 'match' | 'mismatch' | 'skipped' | 'augmented' | 'n/a'
  storeType?: 'declared' | 'undeclared' | 'stale' | 'n/a'
  anchor?: 'exact' | 'file-only' | 'ambiguous' | 'missing' | 'n/a'
  graphify: 'confirmed' | 'weak' | 'unavailable' | 'skipped'
  verdict: 'ok' | 'issue' | 'skipped'
  note?: string
}

export interface SubsystemModelAuditBoundaryCheck {
  componentAlias: string
  componentName?: string
  kind:
    | 'module_file'
    | 'process_nest'
    | 'process_claim'
    | 'process_container'
    | 'skipped'
  module?: string
  file?: string
  process?: string
  verdict: 'ok' | 'issue' | 'gap' | 'skipped'
  note?: string
}

export interface SubsystemModelAuditReport {
  graphId: string
  title: string
  checkedAt: string
  needsUpdate: boolean
  summary: {
    components: number
    filesVerified: number
    symbolsVerified: number
    declarationsFresh: number
    constructsMatched: number
    signaturesMatched: number
    anchorsExact: number
    graphifyConfirmed: number
    externalsSkipped: number
    missingFiles: number
    missingSymbols: number
    trailFailures: number
    stepsUnconfirmed: number
    stepsStale: number
    stepsVerified: number
    staleDeclarations: number
    constructMismatches: number
    signatureMismatches: number
    weakAnchors: number
    unresolved: number
    ok: number
    modulesClaimed: number
    moduleFileOk: number
    moduleFileMismatch: number
    processNestsChecked: number
    processNestOk: number
    processNestDisagree: number
    processRequired: number
    processClaimed: number
    processMissing: number
  }
  checks: SubsystemModelAuditCheck[]
  boundaryChecks?: SubsystemModelAuditBoundaryCheck[]
  findings: SubsystemModelAuditFinding[]
}

export type SubsystemVerificationLane =
  | 'construct'
  | 'static-topology'
  | 'dynamic-topology'
  | 'trail'

export type VerificationLaneStatus =
  | 'verified'
  | 'partial'
  | 'issues'
  | 'blocked'
  | 'none'

export interface SubsystemModelVerificationLayer {
  verified: number
  open: number
  blocked: number
  na: number
  coverage: number
  blocking: number
}

export interface SubsystemModelVerification {
  verified: number
  open: number
  blocked: number
  na: number
  coverage: number
  blocking: number
  byLayer: {
    construct: SubsystemModelVerificationLayer
    boundary: SubsystemModelVerificationLayer
    topology: SubsystemModelVerificationLayer
  }
}
