/**
 * Scopes Canvas Validator
 *
 * Validates that a .scopes.canvas file exists and properly documents
 * all instrumentation scopes declared in library.yaml.
 */

import type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
import type { ExtendedCanvas, ExtendedCanvasNode, OtelScopeNode, isOtelScopeNode } from '../types/canvas';
import { isOtelScopeNode as checkOtelScopeNode } from '../types/canvas';
import { pathsOverlap } from '../events/path-helpers';

/**
 * Scopes canvas validation context
 */
export interface ScopesCanvasValidationContext {
  /** The scopes canvas (if found) */
  scopesCanvas?: ExtendedCanvas;

  /** Path to the scopes canvas file */
  scopesCanvasPath?: string;

  /** Owned scopes from library.yaml */
  ownedScopes: string[];

  /** Base path for resolving relative paths */
  basePath: string;
}

/**
 * Scopes canvas validation violation
 */
export interface ScopesCanvasViolation {
  /** Rule ID that detected this violation */
  ruleId: string;

  /** Severity level */
  severity: 'error' | 'warn';

  /** File path where violation occurred */
  file: string;

  /** JSON path within file (optional) */
  path?: string;

  /** Human-readable description of what's wrong */
  message: string;

  /** Why this matters */
  impact: string;

  /** How to fix it */
  suggestion: string;
}

/**
 * Scopes canvas validation result
 */
export interface ScopesCanvasValidationResult {
  /** Whether validation passed (no errors) */
  valid: boolean;

  /** List of violations found */
  violations: ScopesCanvasViolation[];

  /** Summary of scopes coverage */
  coverage: {
    /** Total owned scopes from library.yaml */
    totalOwnedScopes: number;
    /** Scopes documented in canvas */
    documentedScopes: string[];
    /** Scopes missing from canvas */
    missingScopes: string[];
    /** Scopes in canvas but not in owned-scopes */
    extraScopes: string[];
  };
}

/**
 * Validates scopes canvas files
 */
export class ScopesCanvasValidator {
  constructor(private fsAdapter: FileSystemAdapter) {}

  /**
   * Validate a scopes canvas against library.yaml owned-scopes
   */
  async validate(context: ScopesCanvasValidationContext): Promise<ScopesCanvasValidationResult> {
    const violations: ScopesCanvasViolation[] = [];
    const { scopesCanvas, scopesCanvasPath, ownedScopes, basePath } = context;

    // Initialize coverage tracking
    const documentedScopes: string[] = [];
    const missingScopes: string[] = [];
    const extraScopes: string[] = [];

    // Check if scopes canvas exists when owned-scopes are defined
    if (ownedScopes.length > 0 && !scopesCanvas) {
      violations.push({
        ruleId: 'scopes-canvas-required',
        severity: 'error',
        file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
        message: 'Scopes canvas is required when library.yaml defines owned-scopes',
        impact: 'Cannot visualize or validate instrumentation scope boundaries',
        suggestion: `Create a scopes canvas at .principal-views/architecture.scopes.canvas with nodes for each scope:\n` +
          ownedScopes.map(s => `  - ${s}`).join('\n') +
          '\n\nUse type: "otel-scope" with otel.scope set to the scope name.',
      });

      return {
        valid: false,
        violations,
        coverage: {
          totalOwnedScopes: ownedScopes.length,
          documentedScopes: [],
          missingScopes: [...ownedScopes],
          extraScopes: [],
        },
      };
    }

    // If no owned scopes and no canvas, that's fine
    if (ownedScopes.length === 0) {
      return {
        valid: true,
        violations,
        coverage: {
          totalOwnedScopes: 0,
          documentedScopes: [],
          missingScopes: [],
          extraScopes: [],
        },
      };
    }

    // Extract scopes from canvas nodes
    const canvasScopes = this.extractScopesFromCanvas(scopesCanvas!);
    const canvasScopeSet = new Set(canvasScopes.map(s => s.scope));
    const ownedScopeSet = new Set(ownedScopes);

    // Check which scopes are documented
    for (const scope of ownedScopes) {
      if (canvasScopeSet.has(scope)) {
        documentedScopes.push(scope);
      } else {
        missingScopes.push(scope);
      }
    }

    // Check for extra scopes not in owned-scopes
    for (const { scope, nodeId } of canvasScopes) {
      if (!ownedScopeSet.has(scope)) {
        extraScopes.push(scope);
      }
    }

    // Report missing scopes
    if (missingScopes.length > 0) {
      violations.push({
        ruleId: 'scopes-canvas-incomplete',
        severity: 'error',
        file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
        message: `Scopes canvas is missing ${missingScopes.length} scope(s) from library.yaml`,
        impact: 'These scopes are not documented in the scope boundary map',
        suggestion: `Add nodes for the following scopes:\n` +
          missingScopes.map(s => `  - ${s}: Add type: "otel-scope" node with otel.scope: "${s}"`).join('\n'),
      });
    }

    // Report extra scopes (warning, not error)
    if (extraScopes.length > 0) {
      violations.push({
        ruleId: 'scopes-canvas-extra-scopes',
        severity: 'warn',
        file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
        message: `Scopes canvas contains ${extraScopes.length} scope(s) not in library.yaml owned-scopes`,
        impact: 'These scopes may be external or need to be added to library.yaml',
        suggestion: `Either:\n` +
          `  - Add these scopes to owned-scopes in library.yaml: ${extraScopes.join(', ')}\n` +
          `  - Or remove them from the scopes canvas if they are external`,
      });
    }

    // Validate scope nodes have required fields (otel-scope nodes only)
    for (const { scope, nodeId, node } of canvasScopes) {
      // type === 'otel-scope' with top-level description
      const otelScopeNode = node as unknown as OtelScopeNode;
      if (!otelScopeNode.description) {
        violations.push({
          ruleId: 'scopes-canvas-node-description',
          severity: 'warn',
          file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
          path: `nodes[${nodeId}]`,
          message: `Scope node "${scope}" is missing a description`,
          impact: 'Scope documentation is incomplete without a description',
          suggestion: `Add a description field to explain what this scope covers`,
        });
      }
    }

    // Validate scope paths (optional field — enforcement is opt-in per scope).
    // Collects declared paths across scopes to check for cross-scope overlap.
    const declaredPaths: Array<{ scope: string; nodeId: string; path: string }> = [];
    for (const { scope, nodeId, node } of canvasScopes) {
      const otelScopeNode = node as unknown as OtelScopeNode;
      const paths = otelScopeNode.paths;
      if (!paths || paths.length === 0) continue;

      // Warn when a scope declares more than one path — prompt author to
      // confirm the multi-location is intentional (monorepo bundling,
      // generated code, platform splits, migration) rather than accidental.
      if (paths.length > 1) {
        violations.push({
          ruleId: 'scopes-paths-multiple',
          severity: 'warn',
          file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
          path: `nodes[${nodeId}].paths`,
          message: `Scope "${scope}" declares ${paths.length} paths`,
          impact: 'Multiple paths can indicate legitimate cases (monorepo bundling, generated code, platform splits, migration) but often signal that the scope should be split',
          suggestion: 'Confirm the multi-location is intentional. Otherwise consider splitting the scope or grouping the code under a single parent folder.',
        });
      }

      for (const p of paths) {
        declaredPaths.push({ scope, nodeId, path: p });

        // Warn when a declared path does not exist relative to the repo root.
        const resolved = this.fsAdapter.join(basePath, p);
        if (!(await this.fsAdapter.exists(resolved))) {
          violations.push({
            ruleId: 'scopes-paths-missing',
            severity: 'warn',
            file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
            path: `nodes[${nodeId}].paths`,
            message: `Path "${p}" declared by scope "${scope}" does not exist`,
            impact: 'Events emitted under this scope cannot be validated against a real code location',
            suggestion: 'Verify the path exists relative to the repository root, or remove it from the scope declaration.',
          });
        }
      }
    }

    // Cross-scope overlap check. Parent-child path nesting is a valid partition
    // (longest-prefix wins at runtime); any other overlap makes scope ownership
    // of a file ambiguous.
    for (let i = 0; i < declaredPaths.length; i++) {
      for (let j = i + 1; j < declaredPaths.length; j++) {
        const a = declaredPaths[i];
        const b = declaredPaths[j];
        if (a.scope === b.scope) continue;

        const relationship = pathsOverlap(a.path, b.path);
        if (relationship === 'conflict') {
          violations.push({
            ruleId: 'scopes-paths-overlap',
            severity: 'error',
            file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
            message: `Paths overlap between scopes "${a.scope}" ("${a.path}") and "${b.scope}" ("${b.path}")`,
            impact: 'A file covered by two scopes makes scope ownership ambiguous',
            suggestion: 'Separate the paths so they are disjoint, or restructure as parent/child scopes by dotted name (e.g., "principal-ai.core" covering "packages/subsystems-core/src" and "principal-ai.core.validation" covering "packages/subsystems-core/src/validation").',
          });
        }
      }
    }

    const errors = violations.filter(v => v.severity === 'error');

    return {
      valid: errors.length === 0,
      violations,
      coverage: {
        totalOwnedScopes: ownedScopes.length,
        documentedScopes,
        missingScopes,
        extraScopes,
      },
    };
  }

  /**
   * Extract scope information from canvas nodes (otel-scope nodes only)
   */
  private extractScopesFromCanvas(
    canvas: ExtendedCanvas
  ): Array<{ scope: string; nodeId: string; node: ExtendedCanvasNode }> {
    const scopes: Array<{ scope: string; nodeId: string; node: ExtendedCanvasNode }> = [];

    for (const node of canvas.nodes || []) {
      // Only process otel-scope nodes
      if (checkOtelScopeNode(node)) {
        const scope = node.otel?.scope;
        if (scope && typeof scope === 'string') {
          scopes.push({
            scope,
            nodeId: node.id,
            node: node as ExtendedCanvasNode,
          });
        }
      }
      // Legacy pv.otel.scope format is no longer supported
    }

    return scopes;
  }
}
