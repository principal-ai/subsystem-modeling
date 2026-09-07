/**
 * Namespace Path Index
 *
 * Maps (scope, filepath) to the event-namespace that owns the file, using the
 * `paths` field declared on `event-namespace` nodes.
 *
 * Resolution uses the longest-prefix partitioning rule: when multiple
 * namespaces within a scope have paths that cover the same file, the one
 * whose matched path is the most specific (longest after normalization) wins.
 * This naturally supports nested namespaces such as `workflow` and
 * `workflow.scenarios`, where the child claims its subtree without stealing
 * the parent's.
 *
 * Pure/browser-safe — no filesystem access, just string comparison.
 */

import { normalizePath, pathCovers } from './path-helpers';

/**
 * One declared namespace/paths tuple, tagged with the scope it belongs to.
 * Multiple entries may share the same scope (different namespaces in the
 * same events canvas) or the same namespace across scopes (no cross-scope
 * conflict — resolution is scoped).
 */
export interface NamespacePathEntry {
  scope: string;
  namespace: string;
  paths: string[];
  /** Optional — useful for surfacing where a match came from in diagnostics. */
  sourceCanvasPath?: string;
}

/**
 * Result of resolving a file against the index.
 */
export interface NamespacePathMatch {
  /** The winning entry (by longest-prefix). */
  entry: NamespacePathEntry;
  /** Which of the entry's paths covered the file — the one that won. */
  matchedPath: string;
}

export class NamespacePathIndex {
  private entries: NamespacePathEntry[] = [];

  /** Register a single namespace/paths entry. */
  add(entry: NamespacePathEntry): void {
    this.entries.push(entry);
  }

  /** Register many entries at once. */
  addAll(entries: readonly NamespacePathEntry[]): void {
    for (const e of entries) this.add(e);
  }

  /**
   * Resolve a filepath to its owning namespace within a scope.
   * Returns null if no entry in that scope has a path covering the file.
   */
  resolve(scope: string, filepath: string): NamespacePathMatch | null {
    const normalizedFile = normalizePath(filepath);
    let best: { entry: NamespacePathEntry; matchedPath: string; length: number } | null = null;

    for (const entry of this.entries) {
      if (entry.scope !== scope) continue;
      for (const declared of entry.paths) {
        if (!pathCovers(declared, normalizedFile)) continue;
        const normalizedDeclared = normalizePath(declared);
        const length = normalizedDeclared.length;
        if (best === null || length > best.length) {
          best = { entry, matchedPath: declared, length };
        }
      }
    }

    return best ? { entry: best.entry, matchedPath: best.matchedPath } : null;
  }

  /** All entries registered under the given scope (for diagnostics). */
  getScopeEntries(scope: string): readonly NamespacePathEntry[] {
    return this.entries.filter((e) => e.scope === scope);
  }

  /**
   * Look up the entry for a specific (scope, namespace) pair. Returns null
   * when the namespace isn't registered — either because its events-canvas
   * node omits `paths` (opt-out of enforcement) or because no such namespace
   * is declared at all.
   */
  getEntry(scope: string, namespace: string): NamespacePathEntry | null {
    return this.entries.find(
      (e) => e.scope === scope && e.namespace === namespace,
    ) ?? null;
  }

  /** All scopes present in the index. */
  getScopes(): readonly string[] {
    return Array.from(new Set(this.entries.map((e) => e.scope)));
  }
}
