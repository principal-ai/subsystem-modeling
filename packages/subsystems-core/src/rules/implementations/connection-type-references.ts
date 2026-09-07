/**
 * Rule: connection-type-references
 * Ensures allowedConnections only reference existing nodeTypes and edgeTypes
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

export const connectionTypeReferences: GraphRule = {
  id: 'connection-type-references',
  name: 'Connection Type References',
  description: 'allowedConnections must reference existing nodeTypes and edgeTypes',
  impact: 'Invalid references will cause connection validation to fail',
  severity: 'error',
  category: 'reference',
  enabled: true,
  fixable: false,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    if (!configuration.allowedConnections || configuration.allowedConnections.length === 0) {
      return violations;
    }

    // Get defined node and edge types
    const nodeTypeIds = new Set(Object.keys(configuration.nodeTypes ?? {}));
    const edgeTypeIds = new Set(Object.keys(configuration.edgeTypes ?? {}));

    for (let i = 0; i < configuration.allowedConnections.length; i++) {
      const connection = configuration.allowedConnections[i];
      const basePath = `allowedConnections[${i}]`;

      // Check 'from' references a valid nodeType
      if (connection.from && !nodeTypeIds.has(connection.from)) {
        const suggestion = findSimilar(connection.from, nodeTypeIds);
        violations.push({
          ruleId: 'connection-type-references',
          severity: 'error',
          file: configPath,
          path: `${basePath}.from`,
          message: `Connection rule references undefined nodeType "${connection.from}"`,
          impact: 'This connection rule will not match any nodes',
          suggestion: suggestion
            ? `Did you mean "${suggestion}"?`
            : `Available nodeTypes: ${[...nodeTypeIds].join(', ') || '(none defined)'}`,
          fixable: false,
        });
      }

      // Check 'to' references a valid nodeType
      if (connection.to && !nodeTypeIds.has(connection.to)) {
        const suggestion = findSimilar(connection.to, nodeTypeIds);
        violations.push({
          ruleId: 'connection-type-references',
          severity: 'error',
          file: configPath,
          path: `${basePath}.to`,
          message: `Connection rule references undefined nodeType "${connection.to}"`,
          impact: 'This connection rule will not match any nodes',
          suggestion: suggestion
            ? `Did you mean "${suggestion}"?`
            : `Available nodeTypes: ${[...nodeTypeIds].join(', ') || '(none defined)'}`,
          fixable: false,
        });
      }

      // Check 'via' references a valid edgeType
      if (connection.via && !edgeTypeIds.has(connection.via)) {
        const suggestion = findSimilar(connection.via, edgeTypeIds);
        violations.push({
          ruleId: 'connection-type-references',
          severity: 'error',
          file: configPath,
          path: `${basePath}.via`,
          message: `Connection rule references undefined edgeType "${connection.via}"`,
          impact: 'This connection rule will not match any edges',
          suggestion: suggestion
            ? `Did you mean "${suggestion}"?`
            : `Available edgeTypes: ${[...edgeTypeIds].join(', ') || '(none defined)'}`,
          fixable: false,
        });
      }
    }

    return violations;
  },
};

/**
 * Find a similar string from a set (for "did you mean" suggestions)
 */
function findSimilar(input: string, candidates: Set<string>): string | null {
  const inputLower = input.toLowerCase();

  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase();

    // Exact substring match
    if (inputLower.includes(candidateLower) || candidateLower.includes(inputLower)) {
      return candidate;
    }

    // Small edit distance
    if (Math.abs(input.length - candidate.length) <= 2) {
      let differences = 0;
      const minLen = Math.min(inputLower.length, candidateLower.length);
      for (let i = 0; i < minLen; i++) {
        if (inputLower[i] !== candidateLower[i]) differences++;
      }
      differences += Math.abs(input.length - candidate.length);
      if (differences <= 2) return candidate;
    }
  }

  return null;
}
