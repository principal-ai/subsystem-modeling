/**
 * Rule: valid-action-patterns
 * Ensures action pattern regex is syntactically valid
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation, RuleOptions } from '../types';

/**
 * Options for valid-action-patterns rule
 */
export interface ValidActionPatternsOptions extends RuleOptions {
  /**
   * Enable strict mode - also validates capture group references
   * @default false
   */
  strictMode: boolean;
}

const DEFAULT_OPTIONS: ValidActionPatternsOptions = {
  strictMode: false,
};

export const validActionPatterns: GraphRule<ValidActionPatternsOptions> = {
  id: 'valid-action-patterns',
  name: 'Valid Action Patterns',
  description: 'Action pattern regex must be syntactically valid',
  impact: 'Invalid regex patterns will cause runtime errors during log processing',
  severity: 'error',
  category: 'pattern',
  enabled: true,
  fixable: false,
  defaultOptions: DEFAULT_OPTIONS,

  async check(
    context: GraphRuleContext<ValidActionPatternsOptions>
  ): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath, options } = context;

    if (!configuration.nodeTypes) {
      return violations;
    }

    for (const [typeId, nodeType] of Object.entries(configuration.nodeTypes)) {
      // Check if nodeType has actions (from path-based config extension)
      const nodeTypeAny = nodeType as unknown as Record<string, unknown>;
      const actions = nodeTypeAny.actions;

      if (!Array.isArray(actions)) {
        continue;
      }

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i] as Record<string, unknown>;
        const pattern = action.pattern;
        const basePath = `nodeTypes.${typeId}.actions[${i}]`;

        if (typeof pattern !== 'string') {
          violations.push({
            ruleId: 'valid-action-patterns',
            severity: 'error',
            file: configPath,
            path: `${basePath}.pattern`,
            message: `Action pattern must be a string`,
            impact: 'Pattern matching will fail',
            suggestion: 'Provide a valid regex pattern string',
            fixable: false,
          });
          continue;
        }

        // Test if regex is valid
        try {
          new RegExp(pattern);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          violations.push({
            ruleId: 'valid-action-patterns',
            severity: 'error',
            file: configPath,
            path: `${basePath}.pattern`,
            message: `Invalid regex pattern "${pattern}": ${errorMessage}`,
            impact: 'Pattern matching will fail at runtime',
            suggestion: 'Fix the regex syntax error',
            fixable: false,
          });
          continue;
        }

        // In strict mode, validate capture group references in metadata
        if (options.strictMode) {
          const metadata = action.metadata as Record<string, unknown> | undefined;
          if (metadata) {
            // Extract capture group names from pattern
            const captureGroupNames = extractCaptureGroupNames(pattern);

            for (const [metaKey, metaValue] of Object.entries(metadata)) {
              if (typeof metaValue === 'string' && metaValue.startsWith('$')) {
                const groupName = metaValue.slice(1);
                if (!captureGroupNames.has(groupName)) {
                  violations.push({
                    ruleId: 'valid-action-patterns',
                    severity: 'error',
                    file: configPath,
                    path: `${basePath}.metadata.${metaKey}`,
                    message: `Metadata references undefined capture group "$${groupName}"`,
                    impact: 'Metadata extraction will fail',
                    suggestion: `Available capture groups: ${
                      [...captureGroupNames].join(', ') || '(none)'
                    }`,
                    fixable: false,
                  });
                }
              }
            }
          }
        }
      }
    }

    return violations;
  },
};

/**
 * Extract named capture group names from a regex pattern
 */
function extractCaptureGroupNames(pattern: string): Set<string> {
  const names = new Set<string>();

  // Match named capture groups: (?<name>...)
  const namedGroupRegex = /\(\?<([a-zA-Z_][a-zA-Z0-9_]*)>/g;
  let match;

  while ((match = namedGroupRegex.exec(pattern)) !== null) {
    names.add(match[1]);
  }

  return names;
}
