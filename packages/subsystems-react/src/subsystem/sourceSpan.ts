/**
 * Source-span anchoring — a content-addressed range of source.
 *
 * A span is `startLine` + `endLine` + a hash of the normalized content across
 * that range. The type is owned by `@principal-ai/subsystems-core` (the
 * portable standard); this module re-exports it and provides the line helpers
 * shared by the renderers and host-side hashing.
 *
 * Graphify emits `source_location: "L42"` (a start line only); the end line is
 * derived by verification, and `hashContentRange` (host-side) produces the
 * `contentHash`.
 */

import type { SubsystemSourceSpan } from '@principal-ai/subsystems-core';

export type { SubsystemSourceSpan };

/**
 * How fresh an anchored span is, as computed by verification.
 *
 * - `full` — the span (start + end + hash) is present and live content matches.
 * - `stale` — present, but the content or position drifted.
 * - `missing` — present, but the range no longer resolves.
 * - `unanchored` — no span captured yet.
 * - `unchecked` — source unreadable / repo unresolved.
 */
export type SpanFreshness =
  | 'full'
  | 'stale'
  | 'missing'
  | 'unanchored'
  | 'unchecked';

export const DECLARATION_HASH_ALGO = 'v1' as const;

/** Parse graphify `source_location` (`"L42"`) → 1-based line number. */
export function parseSourceLocation(loc: string | undefined | null): number | null {
  if (!loc?.trim()) return null;
  const m = /^L(\d+)$/.exec(loc.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** Normalize a source line before hashing (algo v1). */
export function normalizeDeclarationLine(line: string): string {
  return line.replace(/\r$/, '').trimEnd();
}

/** Extract one 1-based line from file content; null when out of range. */
export function extractDeclarationLine(content: string, lineNumber: number): string | null {
  if (lineNumber < 1) return null;
  const lines = content.split(/\r?\n/);
  if (lineNumber > lines.length) return null;
  return lines[lineNumber - 1] ?? null;
}

/** Options when opening a file in the subsystem graph drawer. */
export interface SubsystemOpenFileOptions {
  /** Scroll/highlight this 1-based line (declaration start or trail site). */
  startLine?: number;
  /**
   * End of the anchored span, when the owner carries one. Lets the snippet
   * window show the construct's full extent instead of a single line.
   */
  endLine?: number;
  /**
   * When true with `startLine`, show the whole file scrolled to that line
   * instead of a focused snippet window.
   */
  fullFile?: boolean;
}
