/**
 * Structural shape of one component-verification result as the audit engine
 * consumes it.
 *
 * The concrete verifier lives in the host (filesystem, Graphify, tree-sitter).
 * The engine only reads these fields, so the host result is assignable without
 * the engine depending on host code.
 */

import type { SubsystemSourceSpan } from '../types/subsystem-model'
import type { AuditSpanFreshness } from './report'

export interface AuditFileCheck {
  exists: boolean
  symbolDeclared?: boolean | null
  repoRoot?: string
}

export interface AuditFileSuggestion {
  file: string
  nodeId?: string
  label?: string
}

export interface AuditAnchorCandidate {
  nodeId: string
  label: string
  source_file?: string
  source_location?: string
}

export interface AuditAnchorCheck {
  resolution: 'exact' | 'file-only' | 'ambiguous' | 'missing'
  nodeId?: string
  label?: string
  source_file?: string
  source_location?: string
  candidates?: AuditAnchorCandidate[]
}

export interface AuditConstructCheck {
  claimed: string
  inferred: 'class' | 'function' | 'method' | 'type' | 'module' | 'unknown'
  /** true = match, false = known mismatch, null = unconfirmed. */
  match: boolean | null
  evidence?: string[]
  /** Agent-confirmed construct that cleared a gap. */
  augmented?: string
}

export interface AuditSignatureTypes {
  parameterTypes: string[]
  returnTypes: string[]
  inlineParameters?: number
}

export interface AuditSignatureCheck {
  match: boolean
  skipped: boolean
  reason?: string
  skipCode?: string
  claimed: AuditSignatureTypes
  inferred: AuditSignatureTypes
  /** Agent-extracted, human-confirmed signature. */
  augmented?: {
    parameters: Array<{ type: string; optional?: boolean }>
    returnType?: string
  }
}

export interface AuditDeclarationCheck {
  freshness: AuditSpanFreshness
  span?: SubsystemSourceSpan
  liveContentHash?: string
  /** Content-preserving re-pin candidate. */
  repin?: SubsystemSourceSpan
  derivation?: {
    class: 'deterministic' | 'trivial' | 'ambiguous' | 'unknown' | 'skipped'
    endLine?: number
    span?: SubsystemSourceSpan
    failedGates?: string[]
    evidence?: string[]
  }
}

export interface AuditComponentVerification {
  ok: boolean
  error?: string
  code?: string
  componentAlias?: string
  file?: AuditFileCheck
  fileSuggest?: AuditFileSuggestion
  fileCandidates?: AuditFileSuggestion[]
  cache?: {
    status: 'ready' | 'missing' | 'unavailable'
    purl: string
    repoRoot?: string
  }
  anchor?: AuditAnchorCheck
  construct?: AuditConstructCheck
  signature?: AuditSignatureCheck
  declaration?: AuditDeclarationCheck
  storeTypeUndeclared?: boolean
}
