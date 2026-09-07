/**
 * Rule: valid-node-types
 * Ensures nodeTypes have required fields and valid values
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

/**
 * Valid shape values for nodes
 */
const VALID_SHAPES = ['circle', 'rectangle', 'hexagon', 'diamond', 'custom'] as const;

/**
 * Valid data schema field types
 */
const VALID_DATA_TYPES = ['string', 'number', 'boolean', 'object', 'array'] as const;

export const validNodeTypes: GraphRule = {
  id: 'valid-node-types',
  name: 'Valid Node Types',
  description: 'nodeTypes must have required fields and valid values',
  impact: 'Invalid node types will cause rendering errors or unexpected behavior',
  severity: 'error',
  category: 'schema',
  enabled: true,
  fixable: false,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    if (!configuration.nodeTypes) {
      violations.push({
        ruleId: 'valid-node-types',
        severity: 'error',
        file: configPath,
        path: 'nodeTypes',
        message: 'Configuration is missing nodeTypes section',
        impact: 'No nodes can be defined without nodeTypes',
        suggestion: 'Add a nodeTypes section with at least one node type definition',
        fixable: false,
      });
      return violations;
    }

    if (Object.keys(configuration.nodeTypes).length === 0) {
      violations.push({
        ruleId: 'valid-node-types',
        severity: 'error',
        file: configPath,
        path: 'nodeTypes',
        message: 'nodeTypes section is empty',
        impact: 'No nodes can be defined without at least one node type',
        suggestion: 'Add at least one node type definition',
        fixable: false,
      });
      return violations;
    }

    for (const [typeId, nodeType] of Object.entries(configuration.nodeTypes)) {
      const basePath = `nodeTypes.${typeId}`;

      // Check required description field
      if (!nodeType.description) {
        violations.push({
          ruleId: 'valid-node-types',
          severity: 'error',
          file: configPath,
          path: `${basePath}.description`,
          message: `Node type "${typeId}" is missing required "description" field`,
          impact: 'Node type must have a description explaining its purpose',
          suggestion: 'Add a description field explaining what this node type represents',
          fixable: false,
        });
      }

      // Check required shape field
      if (!nodeType.shape) {
        violations.push({
          ruleId: 'valid-node-types',
          severity: 'error',
          file: configPath,
          path: `${basePath}.shape`,
          message: `Node type "${typeId}" is missing required "shape" field`,
          impact: 'Node cannot be rendered without a shape',
          suggestion: `Add a shape field. Valid values: ${VALID_SHAPES.join(', ')}`,
          fixable: false,
        });
      } else if (!VALID_SHAPES.includes(nodeType.shape as (typeof VALID_SHAPES)[number])) {
        violations.push({
          ruleId: 'valid-node-types',
          severity: 'error',
          file: configPath,
          path: `${basePath}.shape`,
          message: `Node type "${typeId}" has invalid shape "${nodeType.shape}"`,
          impact: 'Node may not render correctly',
          suggestion: `Valid shapes: ${VALID_SHAPES.join(', ')}`,
          fixable: false,
        });
      }

      // Check dataSchema field types
      if (nodeType.dataSchema) {
        for (const [fieldName, fieldDef] of Object.entries(nodeType.dataSchema)) {
          if (!fieldDef.type) {
            violations.push({
              ruleId: 'valid-node-types',
              severity: 'error',
              file: configPath,
              path: `${basePath}.dataSchema.${fieldName}.type`,
              message: `Data schema field "${fieldName}" in node type "${typeId}" is missing "type"`,
              impact: 'Data validation will not work for this field',
              suggestion: `Add a type field. Valid values: ${VALID_DATA_TYPES.join(', ')}`,
              fixable: false,
            });
          } else if (
            !VALID_DATA_TYPES.includes(fieldDef.type as (typeof VALID_DATA_TYPES)[number])
          ) {
            violations.push({
              ruleId: 'valid-node-types',
              severity: 'error',
              file: configPath,
              path: `${basePath}.dataSchema.${fieldName}.type`,
              message: `Invalid data type "${fieldDef.type}" for field "${fieldName}" in node type "${typeId}"`,
              impact: 'Data validation may fail',
              suggestion: `Valid types: ${VALID_DATA_TYPES.join(', ')}`,
              fixable: false,
            });
          }
        }
      }

      // Check states have valid structure
      if (nodeType.states) {
        for (const [stateName, stateDef] of Object.entries(nodeType.states)) {
          // States should be objects (even if empty)
          if (typeof stateDef !== 'object' || stateDef === null) {
            violations.push({
              ruleId: 'valid-node-types',
              severity: 'error',
              file: configPath,
              path: `${basePath}.states.${stateName}`,
              message: `State "${stateName}" in node type "${typeId}" must be an object`,
              impact: 'State definition is invalid',
              suggestion: 'State should be an object with optional color, icon, and label fields',
              fixable: false,
            });
          }
        }
      }

      // Check size has valid structure
      if (nodeType.size) {
        if (typeof nodeType.size.width !== 'number' || typeof nodeType.size.height !== 'number') {
          violations.push({
            ruleId: 'valid-node-types',
            severity: 'error',
            file: configPath,
            path: `${basePath}.size`,
            message: `Node type "${typeId}" size must have numeric width and height`,
            impact: 'Node size may not render correctly',
            suggestion: 'Provide size as { width: number, height: number }',
            fixable: false,
          });
        }
      }

      // Check layout has valid structure
      if (nodeType.layout) {
        if (nodeType.layout.layer !== undefined && typeof nodeType.layout.layer !== 'number') {
          violations.push({
            ruleId: 'valid-node-types',
            severity: 'error',
            file: configPath,
            path: `${basePath}.layout.layer`,
            message: `Node type "${typeId}" layout.layer must be a number`,
            impact: 'Layout layering may not work correctly',
            suggestion: 'Provide layer as a number',
            fixable: false,
          });
        }

        if (nodeType.layout.cluster !== undefined && typeof nodeType.layout.cluster !== 'string') {
          violations.push({
            ruleId: 'valid-node-types',
            severity: 'error',
            file: configPath,
            path: `${basePath}.layout.cluster`,
            message: `Node type "${typeId}" layout.cluster must be a string`,
            impact: 'Cluster grouping may not work correctly',
            suggestion: 'Provide cluster as a string identifier',
            fixable: false,
          });
        }
      }
    }

    return violations;
  },
};
