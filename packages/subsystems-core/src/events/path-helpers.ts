/**
 * Path helpers shared across events-canvas validators.
 *
 * Paths declared in canvases (namespace `paths`, `otel.files`, etc.) are
 * always repo-relative. These helpers give a consistent notion of
 * canonicalization and prefix-based containment so that separate validators
 * don't drift.
 */

/**
 * Canonicalize a declared path for comparison.
 * Strips leading `./`, trailing slashes, and collapses duplicate slashes.
 */
export function normalizePath(p: string): string {
  return p
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .replace(/\/+/g, '/');
}

/**
 * True when `child` is strictly nested under `parent` (not equal).
 * Both inputs should already be normalized.
 */
export function isPathDescendant(child: string, parent: string): boolean {
  return child.startsWith(parent + '/');
}

/**
 * True when `filepath` is covered by `declaredPath` — either equal to it
 * (file match) or nested under it (folder match). Inputs are normalized
 * internally so callers can pass raw canvas values.
 */
export function pathCovers(declaredPath: string, filepath: string): boolean {
  const d = normalizePath(declaredPath);
  const f = normalizePath(filepath);
  return d === f || isPathDescendant(f, d);
}

/**
 * Classify the relationship between two declared paths.
 * - 'none':      disjoint — no overlap
 * - 'partition': one is strictly a parent of the other — valid nested-namespace case
 *                (longest-prefix wins at runtime, parent/child partition the tree)
 * - 'conflict':  identical, or overlap that isn't a clean parent-child partition
 */
export function pathsOverlap(a: string, b: string): 'none' | 'partition' | 'conflict' {
  const na = normalizePath(a);
  const nb = normalizePath(b);
  if (na === nb) return 'conflict';
  if (isPathDescendant(na, nb) || isPathDescendant(nb, na)) return 'partition';
  return 'none';
}
