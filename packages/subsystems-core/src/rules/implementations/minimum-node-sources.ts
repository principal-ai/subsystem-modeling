/**
 * Rule: minimum-node-sources
 * Ensures each nodeType has at least a minimum number of references (or sources) defined
 *
 * Note: This rule checks `references` field, with fallback to deprecated `sources` field.
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation, RuleOptions } from '../types';

/**
 * Options for minimum-node-sources rule
 */
export interface MinimumNodeSourcesOptions extends RuleOptions {
  /**
   * Minimum number of references required per nodeType
   * @default 1
   */
  minimum: number;

  /**
   * NodeType IDs to exclude from this check
   * @default []
   */
  excludeNodeTypes: string[];
}

const DEFAULT_OPTIONS: MinimumNodeSourcesOptions = {
  minimum: 1,
  excludeNodeTypes: [],
};

export const minimumNodeSources: GraphRule<MinimumNodeSourcesOptions> = {
  id: 'minimum-node-sources',
  name: 'Minimum Node References',
  description: 'Each nodeType must have at least a minimum number of references defined',
  impact: 'NodeTypes without references cannot be associated with log activity',
  severity: 'error',
  category: 'structure',
  enabled: true,
  fixable: false,
  defaultOptions: DEFAULT_OPTIONS,

  async check(context: GraphRuleContext<MinimumNodeSourcesOptions>): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath, options } = context;

    const minimum = options.minimum ?? DEFAULT_OPTIONS.minimum;
    const excludeNodeTypes = options.excludeNodeTypes ?? DEFAULT_OPTIONS.excludeNodeTypes;

    if (!configuration.nodeTypes) {
      return violations;
    }

    for (const [typeId, nodeType] of Object.entries(configuration.nodeTypes)) {
      // Skip excluded node types
      if (excludeNodeTypes.includes(typeId)) {
        continue;
      }

      // Get references from nodeType, with fallback to deprecated sources
      const nodeTypeAny = nodeType as unknown as Record<string, unknown>;
      const refs = nodeTypeAny.references ?? nodeTypeAny.sources;
      const refCount = Array.isArray(refs) ? refs.length : 0;

      if (refCount < minimum) {
        violations.push({
          ruleId: 'minimum-node-sources',
          severity: 'error',
          file: configPath,
          path: `nodeTypes.${typeId}.references`,
          message:
            refCount === 0
              ? `Node type "${typeId}" has no references defined`
              : `Node type "${typeId}" has ${refCount} reference(s), minimum required is ${minimum}`,
          impact: 'This node type cannot be associated with log activity from source files',
          suggestion: `Add at least ${minimum} reference path(s) to nodeTypes.${typeId}.references`,
          fixable: false,
        });
      }
    }

    return violations;
  },
};
