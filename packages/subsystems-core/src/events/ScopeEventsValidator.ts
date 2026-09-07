/**
 * Scope Events Validator
 *
 * Validates that each instrumentation scope documented in architecture.scopes.canvas
 * has a corresponding {scope-name}.events.canvas file documenting its event vocabulary.
 */

import type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
import type { ExtendedCanvas, OtelScopeNode } from '../types/canvas';

/**
 * Scope events validation context
 */
export interface ScopeEventsValidationContext {
  /** The scopes canvas (if found) */
  scopesCanvas?: ExtendedCanvas;

  /** Path to the scopes canvas file */
  scopesCanvasPath?: string;

  /** Base path for resolving relative paths */
  basePath: string;
}

/**
 * Scope events validation violation
 */
export interface ScopeEventsViolation {
  /** Rule ID that detected this violation */
  ruleId: string;

  /** Severity level */
  severity: 'error' | 'warn';

  /** Scope name */
  scope: string;

  /** Expected file path */
  expectedPath: string;

  /** Human-readable description of what's wrong */
  message: string;

  /** Why this matters */
  impact: string;

  /** How to fix it */
  suggestion: string;
}

/**
 * Scope events validation result
 */
export interface ScopeEventsValidationResult {
  /** Whether validation passed (no errors) */
  valid: boolean;

  /** List of violations found */
  violations: ScopeEventsViolation[];

  /** Summary of events canvas coverage */
  coverage: {
    /** Total owned scopes from library.yaml */
    totalScopes: number;
    /** Scopes with events canvas files */
    scopesWithEvents: string[];
    /** Scopes missing events canvas */
    scopesMissingEvents: string[];
  };
}

/**
 * Convert scope name to events canvas filename
 * e.g., "backlog.md.cli" -> "backlog-md-cli.events.canvas"
 */
function scopeToEventsCanvasFilename(scope: string): string {
  return `${scope.replace(/\./g, '-')}.events.canvas`;
}

/**
 * Validates that scopes have corresponding events canvas files
 */
export class ScopeEventsValidator {
  constructor(private fsAdapter: FileSystemAdapter) {}

  /**
   * Validate that each scope documented in scopes canvas has an events canvas
   */
  async validate(context: ScopeEventsValidationContext): Promise<ScopeEventsValidationResult> {
    const violations: ScopeEventsViolation[] = [];
    const { scopesCanvas, scopesCanvasPath, basePath } = context;

    const scopesWithEvents: string[] = [];
    const scopesMissingEvents: string[] = [];

    // If no scopes canvas, nothing to validate
    if (!scopesCanvas) {
      return {
        valid: true,
        violations: [],
        coverage: {
          totalScopes: 0,
          scopesWithEvents: [],
          scopesMissingEvents: [],
        },
      };
    }

    // Extract scope nodes from the canvas
    const scopeNodes = (scopesCanvas.nodes || []).filter(
      (node): node is OtelScopeNode => node.type === 'otel-scope'
    );

    // Check each scope for corresponding events canvas
    for (const scopeNode of scopeNodes) {
      const scope = scopeNode.otel?.scope;
      if (!scope) continue;

      const eventsCanvasFilename = scopeToEventsCanvasFilename(scope);
      const eventsCanvasPath = this.fsAdapter.join(basePath, '.principal-views', eventsCanvasFilename);
      const relativePath = `.principal-views/${eventsCanvasFilename}`;

      if (await this.fsAdapter.exists(eventsCanvasPath)) {
        scopesWithEvents.push(scope);
      } else {
        scopesMissingEvents.push(scope);
        violations.push({
          ruleId: 'scope-events-canvas-required',
          severity: 'warn',
          scope,
          expectedPath: relativePath,
          message: `Scope "${scope}" is missing an events canvas`,
          impact: `Event vocabulary for scope "${scope}" is not documented. This makes it impossible to:
- Understand what events the scope emits
- Validate event flows match actual code
- Track event schema changes over time
- Generate documentation for implementers`,
          suggestion: `Create ${relativePath} that documents:
- Event namespaces (groups of related events like "validation", "file", etc.)
- Events within each namespace with their attributes
- Adjacency relationships (which event namespaces connect in workflows)

See architecture.events.md for conventions.`,
        });
      }
    }

    return {
      valid: violations.filter(v => v.severity === 'error').length === 0,
      violations,
      coverage: {
        totalScopes: scopeNodes.length,
        scopesWithEvents,
        scopesMissingEvents,
      },
    };
  }
}
