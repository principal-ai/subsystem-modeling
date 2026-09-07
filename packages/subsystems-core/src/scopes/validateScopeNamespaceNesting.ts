/**
 * Scope-Namespace Nesting Validator
 *
 * Cross-canvas check: every `event-namespace.paths` entry declared in a
 * scope's events canvas must be covered by that scope's own `paths`.
 * Surfaces `scopes-namespace-paths-escape` when a namespace claims a region
 * outside its owning scope.
 *
 * Runs alongside the existing scopes-canvas validation but requires both
 * canvases as input, so it lives outside `ScopesCanvasValidator` (which is
 * single-canvas).
 */

import type { ExtendedCanvas } from '../types/canvas';
import { isOtelScopeNode } from '../types/canvas';
import { pathCovers } from '../events/path-helpers';
import type { ScopesCanvasViolation } from './ScopesCanvasValidator';

/**
 * One events canvas paired with the scope it documents.
 * The mapping comes from the existing scope → events-canvas filename
 * convention (see `ScopeEventsValidator`); callers resolve it before
 * passing it in.
 */
export interface ScopeEventsCanvasPair {
  scope: string;
  eventsCanvas: ExtendedCanvas;
  eventsCanvasPath?: string;
}

export interface ValidateScopeNamespaceNestingInput {
  scopesCanvas: ExtendedCanvas;
  scopesCanvasPath?: string;
  eventsCanvases: readonly ScopeEventsCanvasPair[];
}

/**
 * For every namespace.paths entry, verify it is covered by its scope's paths.
 * Scopes without `paths` impose no constraint (opt-in per scope) and are
 * skipped. Namespaces without `paths` are also skipped — namespace-level
 * enforcement remains independently opt-in.
 */
export function validateScopeNamespaceNesting(
  input: ValidateScopeNamespaceNestingInput,
): ScopesCanvasViolation[] {
  const { scopesCanvas, scopesCanvasPath, eventsCanvases } = input;
  const violations: ScopesCanvasViolation[] = [];

  // Build scope → paths map from the scopes canvas.
  const scopePaths = new Map<string, string[]>();
  for (const node of scopesCanvas.nodes || []) {
    if (!isOtelScopeNode(node)) continue;
    const scope = node.otel?.scope;
    const paths = node.paths;
    if (!scope || !paths || paths.length === 0) continue;
    scopePaths.set(scope, paths);
  }

  // For each events canvas, walk its event-namespace nodes and check that
  // every namespace.paths entry sits inside the owning scope's paths.
  for (const pair of eventsCanvases) {
    const ownerPaths = scopePaths.get(pair.scope);
    if (!ownerPaths) continue; // scope opted out — nothing to check

    for (const node of pair.eventsCanvas.nodes || []) {
      if ((node as any)?.type !== 'event-namespace') continue;
      const ns = (node as any).namespace;
      if (!ns?.name || !Array.isArray(ns.paths) || ns.paths.length === 0) continue;

      for (const declared of ns.paths as string[]) {
        const covered = ownerPaths.some((sp) => pathCovers(sp, declared));
        if (covered) continue;

        violations.push({
          ruleId: 'scopes-namespace-paths-escape',
          severity: 'error',
          file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
          path: `nodes[scope="${pair.scope}"].paths`,
          message: `Namespace "${ns.name}" path "${declared}" escapes the bounds of scope "${pair.scope}" (paths: ${ownerPaths.map((p) => `"${p}"`).join(', ')})`,
          impact: 'A namespace claiming code outside its owning scope breaks the scope→namespace partition; events from that file would be attributed to the wrong scope',
          suggestion: `Either move the namespace path under one of "${pair.scope}"'s paths, or extend the scope to cover the namespace's region. If the code genuinely belongs to a different scope, declare the namespace in that scope's events canvas instead.`,
        });
      }
    }
  }

  return violations;
}
