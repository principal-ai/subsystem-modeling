/**
 * Area / Scope Disjointness Validator
 *
 * Cross-file check: project-area paths declared in
 * `auxiliary.manifest.json` must be disjoint from every scope path declared
 * in `architecture.scopes.canvas`. Areas and scopes carve up the repo into
 * non-overlapping regions — any overlap (parent-child or otherwise) means a
 * file is claimed by both an OTEL scope and an auxiliary area, which makes
 * ownership ambiguous.
 *
 * Mirrors `validateScopeNamespaceNesting`'s cross-canvas pattern: takes both
 * inputs, returns violations.
 */

import type { AuxiliaryManifest } from '../types/auxiliary';
import type { ExtendedCanvas } from '../types/canvas';
import { isOtelScopeNode } from '../types/canvas';
import { pathsOverlap } from '../events/path-helpers';
import type { AuxiliaryManifestViolation } from './AuxiliaryManifestValidator';

export interface ValidateAreaScopeDisjointInput {
  manifest: AuxiliaryManifest;
  manifestPath?: string;
  scopesCanvas?: ExtendedCanvas;
  scopesCanvasPath?: string;
}

const DEFAULT_MANIFEST_PATH = '.principal-views/auxiliary.manifest.json';

export function validateAreaScopeDisjoint(
  input: ValidateAreaScopeDisjointInput,
): AuxiliaryManifestViolation[] {
  const { manifest, scopesCanvas } = input;
  const manifestFile = input.manifestPath || DEFAULT_MANIFEST_PATH;

  if (!scopesCanvas) return [];

  const scopePaths: Array<{ scope: string; path: string }> = [];
  for (const node of scopesCanvas.nodes || []) {
    if (!isOtelScopeNode(node)) continue;
    const scope = node.otel?.scope;
    const paths = node.paths;
    if (!scope || !paths || paths.length === 0) continue;
    for (const p of paths) scopePaths.push({ scope, path: p });
  }

  if (scopePaths.length === 0) return [];

  const violations: AuxiliaryManifestViolation[] = [];
  const areas = manifest.areas || [];

  areas.forEach((area, areaIdx) => {
    (area.paths || []).forEach((areaPath, pathIdx) => {
      for (const sp of scopePaths) {
        const relationship = pathsOverlap(areaPath, sp.path);
        if (relationship === 'none') continue;

        violations.push({
          ruleId: 'auxiliary-area-scope-overlap',
          severity: 'error',
          file: manifestFile,
          path: `areas[${areaIdx}].paths[${pathIdx}]`,
          message: `Area "${area.name}" path "${areaPath}" overlaps scope "${sp.scope}" path "${sp.path}"`,
          impact: 'A file claimed by both an OTEL scope and an auxiliary area has ambiguous ownership — the manifest is meant to catalog regions outside the telemetry surface',
          suggestion: 'Make the area path disjoint from every scope path. If the folder is genuinely runtime code, drop it from the manifest; if it is auxiliary, narrow the scope path or move the folder.',
        });
      }
    });
  });

  return violations;
}
