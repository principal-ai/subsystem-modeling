/**
 * Declaration anchoring — start-line + single-line content hash.
 *
 * Graphify emits `source_location: "L42"` (declaration start line). We capture
 * that line's normalized text as a fingerprint to detect drift without end-line
 * spans or graphify changes.
 */

/** Persisted anchor for a subsystem component's source declaration. */
export interface SubsystemDeclarationRef {
  /** Repo-root-relative path (matches `component.file`). */
  file: string;
  /** 1-based declaration start line (from graphify `source_location`). */
  startLine: number;
  /** SHA-256 of {@link normalizeDeclarationLine} output, truncated to 32 hex chars. */
  lineHash: string;
  /** Graphify node id when captured from an exact anchor. */
  graphifyNodeId?: string;
  /** ISO timestamp when this ref was recorded. */
  capturedAt: string;
  /** Repo revision at capture time (optional). */
  revision?: {
    headSha: string;
    dirtyHash?: string | null;
  };
}

export type DeclarationFreshness =
  | 'valid'
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
  /** Scroll/highlight this 1-based line (declaration start). */
  startLine?: number;
}
