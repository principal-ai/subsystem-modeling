/**
 * Rules Engine Type Definitions
 * Provides types for configuration validation rules
 */

// ============================================================================
// Rule Severity and Categories
// ============================================================================

/**
 * Severity levels following ESLint convention
 * - "off" or 0: Disable rule
 * - "warn" or 1: Warning (doesn't affect exit code)
 * - "error" or 2: Error (exit code 1)
 */
export type RuleSeverity = 'off' | 'warn' | 'error' | 0 | 1 | 2;

/**
 * Normalized severity (string form only)
 */
export type NormalizedSeverity = 'off' | 'warn' | 'error';

/**
 * Rule categories for grouping and filtering
 */
export type RuleCategory = 'schema' | 'reference' | 'structure' | 'pattern' | 'library';

// ============================================================================
// Rule Configuration (RC File)
// ============================================================================

/**
 * Full rule configuration object
 */
export interface RuleConfig {
  /**
   * Rule severity
   * @default "error"
   */
  severity?: RuleSeverity;

  /**
   * Rule-specific options
   */
  options?: Record<string, unknown>;
}

/**
 * VGC Configuration file schema
 */
export interface PrivuConfig {
  /**
   * Schema version for forward compatibility
   */
  $schema?: string;

  /**
   * Extend from a shared configuration
   * Can be a package name or relative path
   */
  extends?: string | string[];

  /**
   * Root flag - stop searching parent directories
   * @default false
   */
  root?: boolean;

  /**
   * Path to default component library
   * Used by library-node-type-match rule
   */
  library?: string;

  /**
   * Glob patterns for configuration files to lint
   * @default [".principal-views/**\/*.yaml", ".principal-views/**\/*.yml", ".principal-views/**\/*.json"]
   */
  include?: string[];

  /**
   * Glob patterns to exclude from linting
   * @default ["**\/node_modules/**", "**\/*.test.*"]
   */
  exclude?: string[];

  /**
   * Rule configurations
   */
  rules?: {
    [ruleId: string]: RuleConfig | RuleSeverity | false;
  };
}

// ============================================================================
// Rule Definition
// ============================================================================

/**
 * Rule-specific options type (varies per rule)
 */
export type RuleOptions = Record<string, unknown>;

/**
 * Definition of a validation rule
 */
export interface GraphRule<TOptions extends RuleOptions = RuleOptions> {
  /**
   * Unique rule identifier (kebab-case)
   */
  id: string;

  /**
   * Human-readable rule name
   */
  name: string;

  /**
   * Brief description of what the rule checks
   */
  description: string;

  /**
   * Explanation of why this rule matters
   */
  impact: string;

  /**
   * Default severity level
   * @default "error"
   */
  severity: NormalizedSeverity;

  /**
   * Rule category for grouping
   */
  category: RuleCategory;

  /**
   * Whether the rule is enabled by default
   * @default true
   */
  enabled: boolean;

  /**
   * Whether the rule supports auto-fix
   * @default false
   */
  fixable: boolean;

  /**
   * Default options for this rule
   */
  defaultOptions?: TOptions;

  /**
   * Execute the rule check
   */
  check: (context: GraphRuleContext<TOptions>) => Promise<GraphRuleViolation[]>;

  /**
   * Optional auto-fix implementation
   */
  fix?: (violation: GraphRuleViolation, context: GraphRuleContext<TOptions>) => Promise<FixResult>;
}

// ============================================================================
// Rule Context
// ============================================================================

import type { GraphConfiguration } from '../types';
import type { ComponentLibrary } from '../types/library';

/**
 * Context passed to rules during evaluation
 */
export interface GraphRuleContext<TOptions extends RuleOptions = RuleOptions> {
  /**
   * The configuration being validated
   */
  configuration: GraphConfiguration;

  /**
   * Optional component library for library rules
   */
  library?: ComponentLibrary;

  /**
   * Path to the configuration file (for error reporting)
   */
  configPath?: string;

  /**
   * Path to the library file (for error reporting)
   */
  libraryPath?: string;

  /**
   * Raw YAML/JSON string (for line number lookup)
   */
  rawContent?: string;

  /**
   * Rule-specific options (merged with defaults)
   */
  options: TOptions;

  /**
   * All rule options from config (for cross-rule access if needed)
   */
  allRuleOptions?: Map<string, RuleOptions>;
}

// ============================================================================
// Rule Violations
// ============================================================================

/**
 * A violation detected by a rule
 */
export interface GraphRuleViolation {
  /**
   * ID of the rule that detected this violation
   */
  ruleId: string;

  /**
   * Severity of this violation
   */
  severity: NormalizedSeverity;

  /**
   * Path to the file containing the violation
   */
  file?: string;

  /**
   * Line number in the file (1-indexed)
   */
  line?: number;

  /**
   * Column number in the file (1-indexed)
   */
  column?: number;

  /**
   * JSON path to the problematic field (e.g., "nodeTypes.service.shape")
   */
  path?: string;

  /**
   * Clear, actionable error message
   */
  message: string;

  /**
   * Explanation of why this matters
   */
  impact: string;

  /**
   * Suggestion for how to fix
   */
  suggestion?: string;

  /**
   * Whether this violation can be auto-fixed
   */
  fixable: boolean;

  /**
   * Data needed for auto-fix
   */
  fixData?: Record<string, unknown>;
}

// ============================================================================
// Lint Results
// ============================================================================

/**
 * Result of running all rules
 */
export interface GraphLintResult {
  /**
   * All violations found
   */
  violations: GraphRuleViolation[];

  /**
   * Count of error-level violations
   */
  errorCount: number;

  /**
   * Count of warning-level violations
   */
  warningCount: number;

  /**
   * Count of fixable violations
   */
  fixableCount: number;

  /**
   * Violations grouped by category
   */
  byCategory: Record<RuleCategory, number>;

  /**
   * Violations grouped by rule ID
   */
  byRule: Record<string, number>;
}

// ============================================================================
// Fix Results
// ============================================================================

/**
 * Result of attempting to fix a violation
 */
export interface FixResult {
  /**
   * Whether the fix was successful
   */
  success: boolean;

  /**
   * Description of what was fixed
   */
  message?: string;

  /**
   * New content after fix (if applicable)
   */
  newContent?: string;

  /**
   * Error message if fix failed
   */
  error?: string;
}

// ============================================================================
// Lint Options
// ============================================================================

/**
 * Options for the lint operation
 */
export interface LintOptions {
  /**
   * Only run these rules (by ID)
   */
  enabledRules?: string[];

  /**
   * Skip these rules (by ID)
   */
  disabledRules?: string[];

  /**
   * Override severity for specific rules
   */
  severityOverrides?: Map<string, NormalizedSeverity>;

  /**
   * Component library for library rules
   */
  library?: ComponentLibrary;

  /**
   * Path to config file (for error reporting)
   */
  configPath?: string;

  /**
   * Path to library file (for error reporting)
   */
  libraryPath?: string;

  /**
   * Raw content for line number reporting
   */
  rawContent?: string;

  /**
   * Rule-specific options
   */
  ruleOptions?: Map<string, RuleOptions>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Normalize severity to string form
 */
export function normalizeSeverity(severity: RuleSeverity): NormalizedSeverity {
  if (typeof severity === 'number') {
    switch (severity) {
      case 0:
        return 'off';
      case 1:
        return 'warn';
      case 2:
        return 'error';
      default:
        return 'error';
    }
  }
  return severity;
}

/**
 * Check if a severity means the rule is disabled
 */
export function isRuleDisabled(severity: RuleSeverity | false | undefined): boolean {
  if (severity === false || severity === 'off' || severity === 0) {
    return true;
  }
  return false;
}
