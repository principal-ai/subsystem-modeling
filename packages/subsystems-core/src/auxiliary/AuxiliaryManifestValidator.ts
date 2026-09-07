/**
 * Auxiliary Manifest Validator
 *
 * Own-file checks for `.principal-views/auxiliary.manifest.json`:
 *   - area names are unique
 *   - declared paths exist on disk
 *   - paths don't overlap each other (within or across areas)
 *
 * Cross-file overlap with scope paths lives in `validateAreaScopeDisjoint`,
 * mirroring the way `validateScopeNamespaceNesting` handles cross-canvas
 * checks for scopes/namespaces.
 */

import type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
import type { AuxiliaryManifest } from '../types/auxiliary';
import { pathsOverlap } from '../events/path-helpers';

export interface AuxiliaryManifestValidationContext {
  /** Parsed manifest. When absent, validation is a no-op (manifest is optional). */
  manifest?: AuxiliaryManifest;

  /** Path to the manifest file — used in violation messages. */
  manifestPath?: string;

  /** Repo root for resolving area paths against the filesystem. */
  basePath: string;
}

export interface AuxiliaryManifestViolation {
  ruleId: string;
  severity: 'error' | 'warn';
  file: string;
  path?: string;
  message: string;
  impact: string;
  suggestion: string;
}

export interface AuxiliaryManifestValidationResult {
  valid: boolean;
  violations: AuxiliaryManifestViolation[];
}

const DEFAULT_MANIFEST_PATH = '.principal-views/auxiliary.manifest.json';

export class AuxiliaryManifestValidator {
  constructor(private fsAdapter: FileSystemAdapter) {}

  async validate(context: AuxiliaryManifestValidationContext): Promise<AuxiliaryManifestValidationResult> {
    const violations: AuxiliaryManifestViolation[] = [];
    const { manifest, basePath } = context;
    const file = context.manifestPath || DEFAULT_MANIFEST_PATH;

    if (!manifest) {
      return { valid: true, violations };
    }

    const areas = manifest.areas || [];

    // Unique area names
    const seenNames = new Map<string, number>();
    areas.forEach((area, idx) => {
      const count = seenNames.get(area.name) ?? 0;
      seenNames.set(area.name, count + 1);
      if (count === 1) {
        violations.push({
          ruleId: 'auxiliary-area-name-duplicate',
          severity: 'error',
          file,
          path: `areas[${idx}].name`,
          message: `Area name "${area.name}" is declared more than once`,
          impact: 'Duplicate names make diagnostics ambiguous — a violation cannot be tied back to a single area',
          suggestion: 'Rename one of the areas so names are unique across the manifest.',
        });
      }
    });

    // Path existence + collect for overlap pass
    const declaredPaths: Array<{ areaName: string; areaIndex: number; pathIndex: number; path: string }> = [];
    for (let areaIdx = 0; areaIdx < areas.length; areaIdx++) {
      const area = areas[areaIdx];
      const paths = area.paths || [];
      for (let pathIdx = 0; pathIdx < paths.length; pathIdx++) {
        const p = paths[pathIdx];
        declaredPaths.push({ areaName: area.name, areaIndex: areaIdx, pathIndex: pathIdx, path: p });

        const resolved = this.fsAdapter.join(basePath, p);
        if (!(await this.fsAdapter.exists(resolved))) {
          violations.push({
            ruleId: 'auxiliary-area-path-missing',
            severity: 'warn',
            file,
            path: `areas[${areaIdx}].paths[${pathIdx}]`,
            message: `Path "${p}" declared by area "${area.name}" does not exist`,
            impact: 'The manifest documents a folder that is not present in the repository',
            suggestion: 'Verify the path exists relative to the repository root, or remove it from the area declaration.',
          });
        }
      }
    }

    // Path overlap. Unlike scopes, areas have no dotted-name hierarchy, so
    // parent-child nesting between two areas is just as ambiguous as a flat
    // overlap — both are flagged.
    for (let i = 0; i < declaredPaths.length; i++) {
      for (let j = i + 1; j < declaredPaths.length; j++) {
        const a = declaredPaths[i];
        const b = declaredPaths[j];
        const relationship = pathsOverlap(a.path, b.path);
        if (relationship === 'none') continue;

        const sameArea = a.areaName === b.areaName;
        violations.push({
          ruleId: sameArea ? 'auxiliary-area-paths-self-overlap' : 'auxiliary-area-paths-overlap',
          severity: 'error',
          file,
          path: sameArea
            ? `areas[${a.areaIndex}].paths`
            : undefined,
          message: sameArea
            ? `Area "${a.areaName}" declares overlapping paths "${a.path}" and "${b.path}"`
            : `Paths overlap between areas "${a.areaName}" ("${a.path}") and "${b.areaName}" ("${b.path}")`,
          impact: 'Two area declarations covering the same file make ownership ambiguous',
          suggestion: 'Make the paths disjoint. If one folder genuinely sits inside another area, drop the redundant entry.',
        });
      }
    }

    const errors = violations.filter((v) => v.severity === 'error');
    return { valid: errors.length === 0, violations };
  }
}
