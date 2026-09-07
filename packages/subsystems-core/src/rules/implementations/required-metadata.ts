/**
 * Rule: required-metadata
 * Ensures configuration has required metadata fields (name, version)
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

export const requiredMetadata: GraphRule = {
  id: 'required-metadata',
  name: 'Required Metadata',
  description: 'Configuration must have name and version in metadata',
  impact: 'Missing metadata makes configurations hard to identify and version',
  severity: 'error',
  category: 'schema',
  enabled: true,
  fixable: false,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    if (!configuration.metadata) {
      violations.push({
        ruleId: 'required-metadata',
        severity: 'error',
        file: configPath,
        path: 'metadata',
        message: 'Configuration is missing metadata section',
        impact: 'Cannot identify or version this configuration',
        suggestion: 'Add a metadata section with name and version fields',
        fixable: false,
      });
      return violations;
    }

    if (!configuration.metadata.name) {
      violations.push({
        ruleId: 'required-metadata',
        severity: 'error',
        file: configPath,
        path: 'metadata.name',
        message: 'Configuration metadata is missing required "name" field',
        impact: 'Cannot identify this configuration',
        suggestion: 'Add a name field to metadata',
        fixable: false,
      });
    }


    return violations;
  },
};
