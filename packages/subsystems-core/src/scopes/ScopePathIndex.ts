/**
 * Scope Path Index
 *
 * Maps a filepath to the `otel-scope` that owns it, using the `paths` field
 * declared on `otel-scope` nodes.
 *
 * Resolution uses the longest-prefix partitioning rule: when multiple scopes
 * have paths covering the same file, the one whose matched path is the most
 * specific (longest after normalization) wins. This naturally supports nested
 * scopes by dotted-name (e.g. `principal-ai.core` and
 * `principal-ai.core.validation`), where the child claims its subtree without
 * stealing the parent's.
 *
 * Pure/browser-safe — no filesystem access, just string comparison.
 */

import { normalizePath, pathCovers } from '../events/path-helpers';

/**
 * One declared scope/paths tuple. Multiple entries may share the same scope
 * if a scope canvas needs to declare more than one region (generated code,
 * platform splits, migration periods).
 */
export interface ScopePathEntry {
  scope: string;
  paths: string[];
  /** Optional — useful for surfacing where a match came from in diagnostics. */
  sourceCanvasPath?: string;
}

/**
 * Result of resolving a file against the index.
 */
export interface ScopePathMatch {
  /** The winning entry (by longest-prefix). */
  entry: ScopePathEntry;
  /** Which of the entry's paths covered the file — the one that won. */
  matchedPath: string;
}

export class ScopePathIndex {
  private entries: ScopePathEntry[] = [];

  /** Register a single scope/paths entry. */
  add(entry: ScopePathEntry): void {
    this.entries.push(entry);
  }

  /** Register many entries at once. */
  addAll(entries: readonly ScopePathEntry[]): void {
    for (const e of entries) this.add(e);
  }

  /**
   * Resolve a filepath to its owning scope.
   * Returns null if no entry has a path covering the file.
   */
  resolve(filepath: string): ScopePathMatch | null {
    const normalizedFile = normalizePath(filepath);
    let best: { entry: ScopePathEntry; matchedPath: string; length: number } | null = null;

    for (const entry of this.entries) {
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

  /**
   * Look up the entry for a specific scope. Returns null when the scope
   * isn't registered — either because its scopes-canvas node omits `paths`
   * (opt-out of enforcement) or because no such scope is declared.
   */
  getEntry(scope: string): ScopePathEntry | null {
    return this.entries.find((e) => e.scope === scope) ?? null;
  }

  /** All scopes present in the index. */
  getScopes(): readonly string[] {
    return Array.from(new Set(this.entries.map((e) => e.scope)));
  }
}
