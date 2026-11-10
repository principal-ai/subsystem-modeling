/**
 * Deterministic audit fixes and small completeness predicates.
 *
 * These are pure projections of a verification result into a one-click fix, or
 * of a component into a completeness gap. They are shared so the engine and the
 * UI offer the same repairs.
 */

import type {
  SubsystemComponent,
  SubsystemSourceSpan,
} from '../types/subsystem-model'
import type {
  SubsystemModelAuditFinding,
  SubsystemModelAuditFix,
} from './report'
import type {
  AuditDeclarationCheck,
  AuditSignatureCheck,
} from './verification'

/** Model has no named types; graphify has bags — safe deterministic fill. */
export function isAdoptableEmptyClaimedSignature(sig: {
  claimed: { parameterTypes: string[]; returnTypes: string[] }
  inferred: { parameterTypes: string[]; returnTypes: string[] }
}): boolean {
  const claimedEmpty =
    sig.claimed.parameterTypes.length === 0 &&
    sig.claimed.returnTypes.length === 0
  const inferredHas =
    sig.inferred.parameterTypes.length > 0 || sig.inferred.returnTypes.length > 0
  return claimedEmpty && inferredHas
}

export function adoptGraphifySignatureFixFromVerify(
  sig: AuditSignatureCheck,
): Extract<SubsystemModelAuditFix, { id: 'adopt_graphify_signature' }> | undefined {
  if (!isAdoptableEmptyClaimedSignature(sig)) return undefined
  return {
    id: 'adopt_graphify_signature',
    label: 'Adopt graphify signature types',
    parameterTypes: [...sig.inferred.parameterTypes],
    returnTypes: [...sig.inferred.returnTypes],
  }
}

export function adoptGraphifyFileFixFromVerify(
  component: { file?: string },
  suggest: { file: string },
): Extract<SubsystemModelAuditFix, { id: 'adopt_graphify_file' }> {
  return {
    id: 'adopt_graphify_file',
    label: `Update file to ${suggest.file}`,
    file: suggest.file,
    previousFile: component.file,
  }
}

/**
 * Exact Graphify anchor + a content-preserving move → one-click re-pin.
 *
 * Graphify supplies only the start line, so the candidate span is the stored
 * span shifted to the new start with its length preserved. It is offered only
 * when the shifted range re-hashes to the stored `contentHash` — i.e. the
 * construct moved intact. A changed hash is not a move; it needs the agent lane.
 */
export function adoptGraphifyDeclarationRefFixFromVerify(
  component: { declarationSpan?: SubsystemSourceSpan },
  declaration: AuditDeclarationCheck,
  anchor: { resolution: string } | undefined,
): Extract<
  SubsystemModelAuditFix,
  { id: 'adopt_graphify_declaration_ref' }
> | undefined {
  if (declaration.freshness !== 'stale') return undefined
  if (anchor?.resolution !== 'exact') return undefined
  const repin = declaration.repin
  const stored = component.declarationSpan
  if (!repin || !stored) return undefined
  // Only a content-preserving move is safe to re-pin.
  if (repin.contentHash !== stored.contentHash) return undefined
  if (repin.startLine === stored.startLine) return undefined
  return {
    id: 'adopt_graphify_declaration_ref',
    label: `Re-pin declaration to L${repin.startLine} (was L${stored.startLine})`,
    declarationSpan: repin,
    previousStartLine: stored.startLine,
  }
}

/**
 * A grounded claim with no stored span whose declaration tree-sitter can pin
 * exactly — every structural gate passed, so the derived `[start, end]` range
 * and its content hash are deterministic.
 */
export function adoptTreeSitterSpanFixFromVerify(
  declaration: AuditDeclarationCheck,
): Extract<SubsystemModelAuditFix, { id: 'adopt_tree_sitter_span' }> | undefined {
  const span = declaration.derivation?.span
  if (declaration.derivation?.class !== 'trivial' || !span) return undefined
  return {
    id: 'adopt_tree_sitter_span',
    label: `Capture declaration span L${span.startLine}–${span.endLine}`,
    declarationSpan: span,
  }
}

/** A store's declared value type, normalized. Null when it declares none. */
function storeValueTypeOf(
  declaration: { valueType?: string } | undefined,
): string | null {
  const value = declaration?.valueType
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/**
 * Store completeness — an in-memory store declares the type it holds.
 *
 * A store is a state declaration, so it says what it declares: either a
 * `valueType` (`Map<string, FeedState>`) or named state members. A memory store
 * with neither has no declared type at all. Never a hard failure.
 */
export function storeTypeUndeclared(component: SubsystemComponent): boolean {
  if (component.construct !== 'store') return false
  const declaration = component.declaration
  if (!declaration || declaration.kind !== 'store') return false
  if (declaration.storage !== 'memory') return false
  return (
    !storeValueTypeOf(declaration) && (declaration.properties ?? []).length === 0
  )
}

/**
 * A store whose pinned declaration moved — its declared value type may be out
 * of date. Scoped to stores that declare a value type.
 */
export function storeTypeStale(
  component: SubsystemComponent,
  freshness: string | undefined,
): boolean {
  if (freshness !== 'stale') return false
  const declaration = component.declaration
  if (!declaration || declaration.kind !== 'store') return false
  return storeValueTypeOf(declaration) != null
}

/** The npm package a path is installed from, when it sits in an install root. */
export interface InstalledDependency {
  packageName: string
}

/**
 * The npm package an installed path belongs to — `…/node_modules/@pierre/diffs/dist/x.js`
 * → `@pierre/diffs` — or null when the path is ordinary repo source.
 */
export function installedDependencyPackage(
  file: string | undefined,
): InstalledDependency | null {
  if (!file) return null
  const segments = file.split('/')
  const at = segments.lastIndexOf('node_modules')
  if (at < 0) return null
  const name = segments[at + 1]
  if (!name) return null
  // Scoped names take two segments (`@scope/pkg`); unscoped names end at `.`.
  const scoped = name.startsWith('@') ? segments[at + 2] : undefined
  if (name.startsWith('@') && !scoped) return null
  return { packageName: scoped ? `${name}/${scoped}` : name }
}

/** Keep a parser/runtime failure legible in the audit without dumping paths. */
export function verificationFailureDiagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/\bcall_indirect\b|_ts_parser_new_wasm/i.test(message)) {
    return 'Tree-sitter WASM parser aborted (out-of-bounds indirect call)'
  }
  const name = error instanceof Error && error.name ? error.name : 'Error'
  return `component verification threw ${name}`
}

export function verificationUnavailableFinding(
  purl: string,
  error: unknown,
): SubsystemModelAuditFinding {
  const diagnostic = verificationFailureDiagnostic(error)
  return {
    kind: 'graphify_unavailable',
    severity: 'info',
    purl,
    message: `Source verification aborted for ${purl}: ${diagnostic}. Retry the audit; if it repeats, inspect the host logs.`,
  }
}
