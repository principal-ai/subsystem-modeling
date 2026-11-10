/**
 * Source-span hashing (Node crypto).
 *
 * The audit compares a stored span's `contentHash` against the live source.
 * The normalization and digest must stay aligned with the viewer's
 * `normalizeDeclarationLine` (algo v1), so this lives in the shared engine and
 * both hosts hash identically.
 */

import { createHash } from 'node:crypto'
import type { SubsystemSourceSpan } from '../types/subsystem-model'

/** Normalize one declaration line before hashing (algo v1). */
export function normalizeDeclarationLine(line: string): string {
  return line.replace(/\r$/, '').trimEnd()
}

/** Parse graphify `source_location` (`"L42"`) → 1-based line number. */
export function parseSourceLocation(
  loc: string | undefined | null,
): number | null {
  if (!loc?.trim()) return null
  const m = /^L(\d+)$/.exec(loc.trim())
  if (!m) return null
  const n = Number.parseInt(m[1]!, 10)
  return Number.isFinite(n) && n >= 1 ? n : null
}

/** Assemble a span from its parts (no I/O). */
export function buildSourceSpan(input: {
  startLine: number
  endLine: number
  contentHash: string
}): SubsystemSourceSpan {
  return {
    startLine: input.startLine,
    endLine: input.endLine,
    contentHash: input.contentHash,
  }
}

/**
 * Hash a range of lines (1-based, inclusive) — the span's content fingerprint.
 * Returns null if the range is invalid or out of bounds.
 */
export function hashContentRange(
  content: string,
  start: number,
  end: number,
): string | null {
  const lines = content.split(/\r?\n/)
  if (start < 1 || end < start || end > lines.length) return null
  const slice = lines
    .slice(start - 1, end)
    .map(normalizeDeclarationLine)
    .join('\n')
  return createHash('sha256').update(slice, 'utf8').digest('hex').slice(0, 32)
}
