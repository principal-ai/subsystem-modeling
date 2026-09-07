/**
 * Principal Views Configuration Loader and Validator
 * Handles loading and validating privu config files
 */

import type { PrivuConfig, RuleSeverity } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Valid config file names in resolution order
 */
export const CONFIG_FILE_NAMES = ['.privurc.yaml', '.privurc.yml', '.privurc.json'] as const;

/**
 * Default include patterns
 */
export const DEFAULT_INCLUDE_PATTERNS = [
  '.principal-views/**/*.yaml',
  '.principal-views/**/*.yml',
  '.principal-views/**/*.json',
];

/**
 * Default exclude patterns
 */
export const DEFAULT_EXCLUDE_PATTERNS = ['**/node_modules/**', '**/*.test.*'];

/**
 * Valid severity values
 */
export const VALID_SEVERITIES: readonly (RuleSeverity | false)[] = [
  'off',
  'warn',
  'error',
  0,
  1,
  2,
  false,
];

/**
 * All valid rule IDs
 */
export const VALID_RULE_IDS = [
  // Schema rules
  'no-unknown-fields',
  'required-metadata',
  'valid-node-types',
  'valid-edge-types',
  'valid-color-format',
  // Reference rules
  'connection-type-references',
  'state-transition-references',
  // Structure rules
  'minimum-node-sources',
  'orphaned-node-types',
  'orphaned-edge-types',
  'unreachable-states',
  'dead-end-states',
  // Pattern rules
  'valid-action-patterns',
] as const;

export type ValidRuleId = (typeof VALID_RULE_IDS)[number];

/**
 * Rule-specific valid options
 */
export const RULE_OPTIONS_SCHEMA: Record<string, string[]> = {
  'minimum-node-sources': ['minimum', 'excludeNodeTypes'],
  'dead-end-states': ['terminalStates'],
  'valid-action-patterns': ['strictMode'],
};

// ============================================================================
// Validation Errors
// ============================================================================

export interface ConfigValidationError {
  path: string;
  message: string;
  suggestion?: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  config?: PrivuConfig;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a VGC configuration object
 */
export function validatePrivuConfig(config: unknown): ConfigValidationResult {
  const errors: ConfigValidationError[] = [];

  if (typeof config !== 'object' || config === null) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Configuration must be an object' }],
    };
  }

  const configObj = config as Record<string, unknown>;

  // Validate known top-level fields
  const validTopLevelFields = [
    '$schema',
    'extends',
    'root',
    'library',
    'include',
    'exclude',
    'rules',
  ];

  for (const key of Object.keys(configObj)) {
    if (!validTopLevelFields.includes(key)) {
      const suggestion = findSimilarString(key, validTopLevelFields);
      errors.push({
        path: key,
        message: `Unknown configuration field "${key}"`,
        suggestion: suggestion ? `Did you mean "${suggestion}"?` : undefined,
      });
    }
  }

  // Validate $schema
  if (configObj.$schema !== undefined && typeof configObj.$schema !== 'string') {
    errors.push({
      path: '$schema',
      message: '$schema must be a string',
    });
  }

  // Validate extends
  if (configObj.extends !== undefined) {
    if (
      typeof configObj.extends !== 'string' &&
      !(Array.isArray(configObj.extends) && configObj.extends.every((e) => typeof e === 'string'))
    ) {
      errors.push({
        path: 'extends',
        message: 'extends must be a string or array of strings',
      });
    }
  }

  // Validate root
  if (configObj.root !== undefined && typeof configObj.root !== 'boolean') {
    errors.push({
      path: 'root',
      message: 'root must be a boolean',
    });
  }

  // Validate library
  if (configObj.library !== undefined && typeof configObj.library !== 'string') {
    errors.push({
      path: 'library',
      message: 'library must be a string path',
    });
  }

  // Validate include
  if (configObj.include !== undefined) {
    if (
      !Array.isArray(configObj.include) ||
      !configObj.include.every((p) => typeof p === 'string')
    ) {
      errors.push({
        path: 'include',
        message: 'include must be an array of strings',
      });
    }
  }

  // Validate exclude
  if (configObj.exclude !== undefined) {
    if (
      !Array.isArray(configObj.exclude) ||
      !configObj.exclude.every((p) => typeof p === 'string')
    ) {
      errors.push({
        path: 'exclude',
        message: 'exclude must be an array of strings',
      });
    }
  }

  // Validate rules
  if (configObj.rules !== undefined) {
    if (typeof configObj.rules !== 'object' || configObj.rules === null) {
      errors.push({
        path: 'rules',
        message: 'rules must be an object',
      });
    } else {
      const rulesErrors = validateRulesConfig(configObj.rules as Record<string, unknown>);
      errors.push(...rulesErrors);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    config: configObj as PrivuConfig,
  };
}

/**
 * Validate the rules section of a VGC config
 */
function validateRulesConfig(rules: Record<string, unknown>): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  for (const [ruleId, ruleConfig] of Object.entries(rules)) {
    const path = `rules.${ruleId}`;

    // Check if rule ID is valid
    if (!VALID_RULE_IDS.includes(ruleId as ValidRuleId)) {
      const suggestion = findSimilarString(ruleId, [...VALID_RULE_IDS]);
      errors.push({
        path,
        message: `Unknown rule ID "${ruleId}"`,
        suggestion: suggestion ? `Did you mean "${suggestion}"?` : undefined,
      });
      continue;
    }

    // Handle false (disabled)
    if (ruleConfig === false) {
      continue;
    }

    // Handle severity shorthand
    if (typeof ruleConfig === 'string' || typeof ruleConfig === 'number') {
      if (!isValidSeverity(ruleConfig)) {
        errors.push({
          path,
          message: `Invalid severity "${ruleConfig}" for rule "${ruleId}"`,
          suggestion: 'Allowed values: "off", "warn", "error", 0, 1, 2',
        });
      }
      continue;
    }

    // Handle full config object
    if (typeof ruleConfig !== 'object' || ruleConfig === null) {
      errors.push({
        path,
        message: `Rule configuration must be a severity string, number, false, or config object`,
      });
      continue;
    }

    const ruleConfigObj = ruleConfig as Record<string, unknown>;

    // Validate config object fields
    const validRuleConfigFields = ['severity', 'options'];
    for (const key of Object.keys(ruleConfigObj)) {
      if (!validRuleConfigFields.includes(key)) {
        errors.push({
          path: `${path}.${key}`,
          message: `Unknown rule config field "${key}"`,
          suggestion: `Allowed fields: ${validRuleConfigFields.join(', ')}`,
        });
      }
    }

    // Validate severity
    if (ruleConfigObj.severity !== undefined) {
      if (!isValidSeverity(ruleConfigObj.severity)) {
        errors.push({
          path: `${path}.severity`,
          message: `Invalid severity "${ruleConfigObj.severity}"`,
          suggestion: 'Allowed values: "off", "warn", "error", 0, 1, 2',
        });
      }
    }

    // Validate options
    if (ruleConfigObj.options !== undefined) {
      if (typeof ruleConfigObj.options !== 'object' || ruleConfigObj.options === null) {
        errors.push({
          path: `${path}.options`,
          message: 'options must be an object',
        });
      } else {
        // Validate rule-specific options
        const validOptions = RULE_OPTIONS_SCHEMA[ruleId];
        if (validOptions) {
          const optionsObj = ruleConfigObj.options as Record<string, unknown>;
          for (const optionKey of Object.keys(optionsObj)) {
            if (!validOptions.includes(optionKey)) {
              const suggestion = findSimilarString(optionKey, validOptions);
              errors.push({
                path: `${path}.options.${optionKey}`,
                message: `Unknown option "${optionKey}" for rule "${ruleId}"`,
                suggestion: suggestion
                  ? `Did you mean "${suggestion}"?`
                  : `Allowed options: ${validOptions.join(', ')}`,
              });
            }
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Check if a value is a valid severity
 */
function isValidSeverity(value: unknown): value is RuleSeverity {
  return VALID_SEVERITIES.includes(value as RuleSeverity);
}

// ============================================================================
// Default Config
// ============================================================================

/**
 * Get the default VGC configuration
 */
export function getDefaultConfig(): PrivuConfig {
  return {
    root: false,
    include: DEFAULT_INCLUDE_PATTERNS,
    exclude: DEFAULT_EXCLUDE_PATTERNS,
    rules: {},
  };
}

/**
 * Merge configs with proper precedence (later configs override earlier)
 */
export function mergeConfigs(...configs: (PrivuConfig | undefined)[]): PrivuConfig {
  const result = getDefaultConfig();

  for (const config of configs) {
    if (!config) continue;

    if (config.root !== undefined) result.root = config.root;
    if (config.library !== undefined) result.library = config.library;
    if (config.include !== undefined) result.include = config.include;
    if (config.exclude !== undefined) result.exclude = config.exclude;

    // Merge rules
    if (config.rules) {
      result.rules = { ...result.rules, ...config.rules };
    }
  }

  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Find a similar string from a list (for "did you mean" suggestions)
 */
function findSimilarString(input: string, candidates: string[]): string | null {
  const inputLower = input.toLowerCase();
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase();

    // Exact substring match
    if (inputLower.includes(candidateLower) || candidateLower.includes(inputLower)) {
      return candidate;
    }

    // Calculate Levenshtein distance
    const distance = levenshteinDistance(inputLower, candidateLower);

    // Accept if distance is small relative to string length
    if (distance <= 3 && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * Calculate Levenshtein edit distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Format config validation errors for display
 */
export function formatConfigErrors(errors: ConfigValidationError[]): string {
  const lines: string[] = [];

  for (const error of errors) {
    lines.push(`  error  ${error.path || '(root)'}: ${error.message}`);
    if (error.suggestion) {
      lines.push(`         → ${error.suggestion}`);
    }
  }

  lines.push('');
  lines.push(`  ✖ ${errors.length} configuration error${errors.length === 1 ? '' : 's'}`);

  return lines.join('\n');
}
