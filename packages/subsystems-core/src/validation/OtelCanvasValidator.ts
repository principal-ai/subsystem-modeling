/**
 * OTEL Canvas Validator
 *
 * Validates that OTEL canvas files do not use explicit fill/color fields on event nodes.
 * OTEL event nodes must use scope-based coloring exclusively for consistency.
 */

import type { ExtendedCanvas } from '../types/canvas';
import { isOtelEventNode } from '../types/canvas';

/**
 * OTEL canvas validation violation
 */
export interface OtelCanvasViolation {
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
 * Validates OTEL canvas files
 */
export class OtelCanvasValidator {
  /**
   * Validate an OTEL canvas for explicit color usage on event nodes
   *
   * @param canvas - The canvas to validate
   * @param canvasPath - Path to the canvas file (for error reporting)
   * @returns Array of violations found
   */
  validate(canvas: ExtendedCanvas, canvasPath: string): OtelCanvasViolation[] {
    const violations: OtelCanvasViolation[] = [];

    // Check all nodes in the canvas - only validate otel-event nodes
    for (const node of canvas.nodes || []) {
      if (isOtelEventNode(node)) {
        // Check for deprecated fill field
        if (node.fill !== undefined) {
          const scopeHint = node.otel?.scope || 'your-scope';
          violations.push({
            ruleId: 'otel-event-explicit-fill-color',
            severity: 'error',
            file: canvasPath,
            path: `nodes[id="${node.id}"].fill`,
            message: `OTEL event node "${node.id}" has explicit fill color which is not allowed`,
            impact: 'OTEL event nodes must use scope-based coloring for consistency. Explicit colors defeat this purpose.',
            suggestion: `Remove the "fill" field and set the color on the otel-scope node for "${scopeHint}" in your .scopes.canvas file`,
          });
        }

        // Check for deprecated color field
        if (node.color !== undefined) {
          const scopeHint = node.otel?.scope || 'your-scope';
          violations.push({
            ruleId: 'otel-event-explicit-color',
            severity: 'error',
            file: canvasPath,
            path: `nodes[id="${node.id}"].color`,
            message: `OTEL event node "${node.id}" has explicit color which is not allowed`,
            impact: 'OTEL event nodes must use scope-based coloring for consistency. Explicit colors defeat this purpose.',
            suggestion: `Remove the "color" field and set the color on the otel-scope node for "${scopeHint}" in your .scopes.canvas file`,
          });
        }
      }
    }

    return violations;
  }
}
