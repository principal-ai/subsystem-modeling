/**
 * Canvas Scope Types
 *
 * Defines which logs are relevant to a canvas. Only logs matching the canvas
 * scope are considered for node routing. This acts as a pre-filter before
 * individual node matching.
 *
 * @example
 * ```yaml
 * # Canvas configuration
 * canvas:
 *   id: "checkout-system"
 *   scope:
 *     deployment.environment: "production"
 *     service.namespace: "checkout"
 *   audit:
 *     enabled: true
 *     orphanThreshold: 100
 *     coverageTarget: 95
 * ```
 */

import type { ResourceMatch } from './resource-match';

/**
 * Canvas scope - filters which logs are processed by this canvas
 *
 * Extends ResourceMatch, so all matching operators are available.
 * All conditions must match for a log to be "in scope" (AND logic).
 *
 * @example
 * ```typescript
 * // Only process production logs from the checkout namespace
 * const scope: CanvasScope = {
 *   'deployment.environment': 'production',
 *   'service.namespace': { oneOf: ['checkout', 'payment'] }
 * };
 * ```
 */
export interface CanvasScope extends ResourceMatch {
  // Inherits all ResourceMatch fields and operators
  // All conditions must match for a log to be "in scope"
}

/**
 * Duration string format
 *
 * Supports common time units: ms, s, m, h, d
 *
 * @example "30s", "5m", "1h", "24h", "7d"
 */
export type DurationString = string;

/**
 * Audit configuration for a canvas
 *
 * Controls how log routing is monitored and reported.
 */
export interface CanvasAuditConfig {
  /**
   * Enable audit collection
   * When enabled, the system tracks:
   * - Log counts per node
   * - Orphaned logs (in scope but unmatched)
   * - Silent nodes (defined but receiving no logs)
   */
  enabled: boolean;

  /**
   * Alert threshold for orphaned logs
   *
   * If the number of orphaned logs exceeds this count within
   * the audit period, an alert or warning is generated.
   *
   * @default undefined (no threshold)
   */
  orphanThreshold?: number;

  /**
   * Duration after which a silent node triggers an alert
   *
   * If a node receives no logs for this duration, it's flagged
   * as potentially misconfigured or the service may be down.
   *
   * @example "1h", "30m", "24h"
   * @default undefined (no alerting)
   */
  silentNodeAlertAfter?: DurationString;

  /**
   * Target coverage percentage (0-100)
   *
   * The expected percentage of in-scope logs that should be
   * routed to nodes. Used for coverage analysis and alerts.
   *
   * @example 95 (expect 95% of logs to match a node)
   * @default undefined (no target)
   */
  coverageTarget?: number;

  /**
   * Maximum number of orphan signatures to track
   *
   * Orphans are grouped by their resource signature. This limits
   * memory usage by capping the number of unique signatures tracked.
   *
   * @default 1000
   */
  maxOrphanSignatures?: number;

  /**
   * Maximum sample logs per orphan signature
   *
   * Number of sample log bodies to keep per orphan group for debugging.
   *
   * @default 5
   */
  maxSamplesPerOrphan?: number;
}

/**
 * Canvas-level configuration for log association
 *
 * Top-level configuration that defines scope and audit settings
 * for a canvas.
 */
export interface CanvasLogAssociation {
  /**
   * Unique canvas identifier
   *
   * Used for routing logs to the correct canvas when multiple
   * canvases are active, and for audit reports.
   */
  id: string;

  /**
   * Scope filter
   *
   * Only logs matching this scope are considered for node routing.
   * If not specified, all logs are in scope.
   */
  scope?: CanvasScope;

  /**
   * Audit configuration
   *
   * If not specified, auditing is disabled.
   */
  audit?: CanvasAuditConfig;
}

/**
 * Default audit configuration values
 */
export const DEFAULT_AUDIT_CONFIG: Partial<CanvasAuditConfig> = {
  maxOrphanSignatures: 1000,
  maxSamplesPerOrphan: 5,
};

/**
 * Parse a duration string to milliseconds
 *
 * @param duration Duration string like "30s", "5m", "1h"
 * @returns Duration in milliseconds, or null if invalid
 *
 * @example
 * ```typescript
 * parseDuration('30s');  // 30000
 * parseDuration('5m');   // 300000
 * parseDuration('1h');   // 3600000
 * parseDuration('24h');  // 86400000
 * ```
 */
export function parseDuration(duration: DurationString): number | null {
  const match = duration.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}
