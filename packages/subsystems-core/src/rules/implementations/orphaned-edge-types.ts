/**
 * Rule: orphaned-edge-types
 * Warns when edgeTypes are not used in any connection rule
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

export const orphanedEdgeTypes: GraphRule = {
  id: 'orphaned-edge-types',
  name: 'Orphaned Edge Types',
  description: 'EdgeTypes should be used in at least one connection rule',
  impact: 'Orphaned edge types may indicate unused or misconfigured types',
  severity: 'error',
  category: 'structure',
  enabled: true,
  fixable: false,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    if (!configuration.edgeTypes || Object.keys(configuration.edgeTypes).length === 0) {
      return violations;
    }

    // Collect all edgeTypes referenced in allowedConnections
    const referencedEdgeTypes = new Set<string>();

    if (configuration.allowedConnections) {
      for (const connection of configuration.allowedConnections) {
        if (connection.via) {
          referencedEdgeTypes.add(connection.via);
        }
      }
    }

    // Check each edgeType
    for (const typeId of Object.keys(configuration.edgeTypes)) {
      if (!referencedEdgeTypes.has(typeId)) {
        violations.push({
          ruleId: 'orphaned-edge-types',
          severity: 'error',
          file: configPath,
          path: `edgeTypes.${typeId}`,
          message: `Edge type "${typeId}" is not used in any connection rule`,
          impact: 'This edge type may be unused or misconfigured',
          suggestion: `Add a connection rule using this edge type, or remove it if unused`,
          fixable: false,
        });
      }
    }

    return violations;
  },
};
