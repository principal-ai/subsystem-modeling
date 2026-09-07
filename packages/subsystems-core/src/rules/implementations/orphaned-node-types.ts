/**
 * Rule: orphaned-node-types
 * Warns when nodeTypes are not used in any connection rule
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

export const orphanedNodeTypes: GraphRule = {
  id: 'orphaned-node-types',
  name: 'Orphaned Node Types',
  description: 'NodeTypes should be used in at least one connection rule',
  impact: 'Orphaned node types may indicate unused or misconfigured types',
  severity: 'error',
  category: 'structure',
  enabled: true,
  fixable: false,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    if (!configuration.nodeTypes || Object.keys(configuration.nodeTypes).length === 0) {
      return violations;
    }

    // Collect all nodeTypes referenced in allowedConnections
    const referencedNodeTypes = new Set<string>();

    if (configuration.allowedConnections) {
      for (const connection of configuration.allowedConnections) {
        if (connection.from) {
          referencedNodeTypes.add(connection.from);
        }
        if (connection.to) {
          referencedNodeTypes.add(connection.to);
        }
      }
    }

    // Check each nodeType
    for (const typeId of Object.keys(configuration.nodeTypes)) {
      if (!referencedNodeTypes.has(typeId)) {
        violations.push({
          ruleId: 'orphaned-node-types',
          severity: 'error',
          file: configPath,
          path: `nodeTypes.${typeId}`,
          message: `Node type "${typeId}" is not used in any connection rule`,
          impact: 'This node type may be unused or misconfigured',
          suggestion: `Add a connection rule using this node type, or remove it if unused`,
          fixable: false,
        });
      }
    }

    return violations;
  },
};
