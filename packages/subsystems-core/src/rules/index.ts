/**
 * Rules Engine - Configuration validation for Visual Validation Framework
 *
 * @example
 * ```typescript
 * import { createRulesEngine, builtinRules } from '@principal-ai/subsystems-core/rules';
 *
 * const engine = createRulesEngine(builtinRules);
 * const result = await engine.lint(configuration);
 *
 * if (result.errorCount > 0) {
 *   console.error(`Found ${result.errorCount} errors`);
 *   for (const violation of result.violations) {
 *     console.error(`  ${violation.path}: ${violation.message}`);
 *   }
 * }
 * ```
 */

// Core engine
export { GraphRulesEngine, createRulesEngine } from './engine';

// Types
export type {
  GraphRule,
  GraphRuleContext,
  GraphRuleViolation,
  GraphLintResult,
  LintOptions,
  RuleOptions,
  RuleSeverity,
  NormalizedSeverity,
  RuleCategory,
  RuleConfig,
  PrivuConfig,
  FixResult,
} from './types';

export { normalizeSeverity, isRuleDisabled } from './types';

// Config validation
export {
  validatePrivuConfig,
  getDefaultConfig,
  mergeConfigs,
  formatConfigErrors,
  CONFIG_FILE_NAMES,
  DEFAULT_INCLUDE_PATTERNS,
  DEFAULT_EXCLUDE_PATTERNS,
  VALID_RULE_IDS,
  VALID_SEVERITIES,
  type ConfigValidationError,
  type ConfigValidationResult,
  type ValidRuleId,
} from './config';

// Built-in rules
export {
  builtinRules,
  // Schema rules
  requiredMetadata,
  validNodeTypes,
  validEdgeTypes,
  validColorFormat,
  noUnknownFields,
  // Reference rules
  connectionTypeReferences,
  stateTransitionReferences,
  // Structure rules
  minimumNodeSources,
  orphanedNodeTypes,
  orphanedEdgeTypes,
  unreachableStates,
  deadEndStates,
  // Pattern rules
  validActionPatterns,
  // Rule option types
  type MinimumNodeSourcesOptions,
  type DeadEndStatesOptions,
  type ValidActionPatternsOptions,
} from './implementations';

// Convenience factory that creates an engine with all built-in rules
import { createRulesEngine } from './engine';
import { builtinRules } from './implementations';

/**
 * Create a rules engine pre-configured with all built-in rules
 */
export function createDefaultRulesEngine() {
  return createRulesEngine(builtinRules);
}
