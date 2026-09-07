/**
 * Resource Matching Types
 *
 * Defines how logs are matched to canvas nodes based on OTEL resource attributes.
 * Supports multiple matching strategies: exact, glob, regex, existence, and oneOf.
 *
 * @example
 * ```yaml
 * # In canvas configuration
 * nodes:
 *   - id: "payment-service"
 *     resourceMatch:
 *       service.name: "payment-*"           # Glob pattern
 *       deployment.environment: "production" # Exact match
 *       db.system: { exists: true }         # Must have db.system attribute
 * ```
 */

/**
 * Exact match operator
 *
 * @example
 * ```typescript
 * const match: ExactMatch = { exact: 'checkout-api' };
 * ```
 */
export interface ExactMatch {
  exact: string;
}

/**
 * Glob pattern match operator
 * Supports * (any characters) and ? (single character)
 *
 * @example
 * ```typescript
 * const match: GlobMatch = { glob: 'payment-*' };  // matches payment-service, payment-worker
 * const match2: GlobMatch = { glob: 'api-?' };     // matches api-1, api-2
 * ```
 */
export interface GlobMatch {
  glob: string;
}

/**
 * Regex pattern match operator
 *
 * @example
 * ```typescript
 * const match: RegexMatch = { regex: '^checkout-.+$' };
 * ```
 */
export interface RegexMatch {
  regex: string;
}

/**
 * Existence check operator
 *
 * @example
 * ```typescript
 * const mustExist: ExistsMatch = { exists: true };   // attribute must be present
 * const mustNotExist: ExistsMatch = { exists: false }; // attribute must be absent
 * ```
 */
export interface ExistsMatch {
  exists: boolean;
}

/**
 * OneOf match operator - matches any of the specified values
 *
 * @example
 * ```typescript
 * const match: OneOfMatch = { oneOf: ['production', 'staging'] };
 * ```
 */
export interface OneOfMatch {
  oneOf: string[];
}

/**
 * Match operator union type
 *
 * Can be one of the structured operators or a plain string (shorthand for exact match).
 *
 * @example
 * ```typescript
 * // These are equivalent:
 * const op1: MatchOperator = 'checkout-api';
 * const op2: MatchOperator = { exact: 'checkout-api' };
 *
 * // Other operators:
 * const glob: MatchOperator = { glob: 'payment-*' };
 * const regex: MatchOperator = { regex: '^api-.+$' };
 * const exists: MatchOperator = { exists: true };
 * const oneOf: MatchOperator = { oneOf: ['prod', 'staging'] };
 * ```
 */
export type MatchOperator = ExactMatch | GlobMatch | RegexMatch | ExistsMatch | OneOfMatch | string;

/**
 * Resource match criteria
 *
 * All specified conditions must match (AND logic).
 * Use for defining which logs should route to a specific node.
 *
 * @example
 * ```typescript
 * const match: ResourceMatch = {
 *   'service.name': 'checkout-api',              // Exact match (shorthand)
 *   'deployment.environment': 'production',      // Exact match (shorthand)
 *   'k8s.namespace.name': { glob: 'checkout-*' } // Glob pattern
 * };
 * ```
 */
export interface ResourceMatch {
  // Service identification (most common matching targets)
  'service.name'?: MatchOperator;
  'service.namespace'?: MatchOperator;
  'service.instance.id'?: MatchOperator;
  'service.version'?: MatchOperator;

  // Deployment
  'deployment.environment'?: MatchOperator;

  // Kubernetes
  'k8s.namespace.name'?: MatchOperator;
  'k8s.deployment.name'?: MatchOperator;
  'k8s.pod.name'?: MatchOperator;
  'k8s.container.name'?: MatchOperator;
  'k8s.node.name'?: MatchOperator;

  // Database
  'db.system'?: MatchOperator;
  'db.name'?: MatchOperator;

  // Host
  'host.name'?: MatchOperator;
  'host.id'?: MatchOperator;

  // Cloud
  'cloud.provider'?: MatchOperator;
  'cloud.region'?: MatchOperator;

  // Messaging
  'messaging.system'?: MatchOperator;
  'messaging.destination.name'?: MatchOperator;

  // Allow arbitrary attribute matching
  [key: string]: MatchOperator | undefined;
}

/**
 * Result of a match attempt
 *
 * Includes the match outcome, specificity score for priority resolution,
 * and details about which criteria matched or failed.
 */
export interface MatchResult {
  /** Whether all criteria matched */
  matched: boolean;

  /**
   * Match specificity score (higher = more specific match)
   *
   * Scoring rules:
   * - Each exact match: +10 points
   * - Each oneOf match: +8 points
   * - Each regex match: +5 points
   * - Each glob match: +3 points
   * - Each exists match: +1 point
   *
   * Used to resolve conflicts when multiple nodes match the same log.
   */
  score: number;

  /** List of criteria keys that matched */
  matchedCriteria: string[];

  /** List of criteria keys that failed (for debugging) */
  failedCriteria?: string[];
}

/**
 * Interface for nodes that support resource-based matching
 *
 * Nodes can have both resourceMatch (OTEL attributes) and sources (file paths).
 * When routing logs, resourceMatch takes priority over sources.
 */
export interface ResourceMatchableNode {
  /** Node identifier */
  id: string;

  /**
   * Resource-based matching criteria (OTEL attributes)
   * Takes priority over sources when both are specified.
   */
  resourceMatch?: ResourceMatch;

  /**
   * Path-based matching (source file globs)
   * Used as fallback when resourceMatch is not specified or doesn't match.
   * Also used for code coverage analysis.
   */
  sources?: string[];
}

// Type guards for match operators

/**
 * Check if operator is an exact match
 */
export function isExactMatch(op: MatchOperator): op is ExactMatch {
  return typeof op === 'object' && 'exact' in op;
}

/**
 * Check if operator is a glob match
 */
export function isGlobMatch(op: MatchOperator): op is GlobMatch {
  return typeof op === 'object' && 'glob' in op;
}

/**
 * Check if operator is a regex match
 */
export function isRegexMatch(op: MatchOperator): op is RegexMatch {
  return typeof op === 'object' && 'regex' in op;
}

/**
 * Check if operator is an exists match
 */
export function isExistsMatch(op: MatchOperator): op is ExistsMatch {
  return typeof op === 'object' && 'exists' in op;
}

/**
 * Check if operator is a oneOf match
 */
export function isOneOfMatch(op: MatchOperator): op is OneOfMatch {
  return typeof op === 'object' && 'oneOf' in op;
}

/**
 * Check if operator is a string shorthand (exact match)
 */
export function isStringShorthand(op: MatchOperator): op is string {
  return typeof op === 'string';
}

/**
 * Normalize a match operator to its canonical form
 */
export function normalizeOperator(
  op: MatchOperator
): ExactMatch | GlobMatch | RegexMatch | ExistsMatch | OneOfMatch {
  if (typeof op === 'string') {
    return { exact: op };
  }
  return op;
}
