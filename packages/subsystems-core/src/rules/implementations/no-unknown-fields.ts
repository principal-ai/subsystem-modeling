/**
 * Rule: no-unknown-fields
 * Flags fields that are not defined in the configuration schema
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

/**
 * Allowed fields for each configuration section
 */
const ALLOWED_FIELDS = {
  root: ['metadata', 'nodeTypes', 'edgeTypes', 'allowedConnections', 'validation', 'display'],
  metadata: ['name', 'version', 'description'],
  nodeType: [
    'description',
    'shape',
    'icon',
    'color',
    'stroke',
    'size',
    'dataSchema',
    'states',
    'layout',
    'sources',
    'actions',
  ],
  edgeType: [
    'style',
    'color',
    'width',
    'directed',
    'animated',
    'label',
    'animation',
    'dataSchema',
    'activatedBy',
  ],
  connectionRule: ['from', 'to', 'via', 'constraints'],
  connectionConstraints: ['maxInstances', 'bidirectional', 'exclusive'],
  validation: ['stateTransitions', 'constraints', 'cardinality'],
  display: ['layout', 'theme', 'animations'],
  displayTheme: ['primary', 'success', 'warning', 'danger', 'info'],
  displayAnimations: ['enabled', 'speed'],
  dataSchemaField: ['type', 'required', 'displayInLabel', 'label', 'displayInInfo', 'description', 'placeholder'],
  stateDefinition: ['color', 'icon', 'label'],
  layoutHints: ['layer', 'cluster'],
  edgeLabel: ['field', 'position'],
  edgeAnimation: ['type', 'duration', 'color'],
  nodeSize: ['width', 'height'],
  stateTransition: ['from', 'to'],
  constraint: ['id', 'description', 'check', 'severity'],
  actionPattern: ['pattern', 'event', 'state', 'metadata'],
};

export const noUnknownFields: GraphRule = {
  id: 'no-unknown-fields',
  name: 'No Unknown Fields',
  description: 'Flag fields that are not defined in the configuration schema',
  impact: 'Unknown fields are likely typos and will be ignored',
  severity: 'error',
  category: 'schema',
  enabled: true,
  fixable: true,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    // Check root level fields
    checkFields(
      configuration as unknown as Record<string, unknown>,
      ALLOWED_FIELDS.root,
      '',
      configPath,
      violations
    );

    // Check metadata fields
    if (configuration.metadata) {
      checkFields(
        configuration.metadata as Record<string, unknown>,
        ALLOWED_FIELDS.metadata,
        'metadata',
        configPath,
        violations
      );
    }

    // Check nodeTypes
    if (configuration.nodeTypes) {
      for (const [typeId, nodeType] of Object.entries(configuration.nodeTypes)) {
        const basePath = `nodeTypes.${typeId}`;
        checkFields(
          nodeType as unknown as Record<string, unknown>,
          ALLOWED_FIELDS.nodeType,
          basePath,
          configPath,
          violations
        );

        // Check nested fields in nodeType
        if (nodeType.dataSchema) {
          for (const [fieldName, fieldDef] of Object.entries(nodeType.dataSchema)) {
            checkFields(
              fieldDef as Record<string, unknown>,
              ALLOWED_FIELDS.dataSchemaField,
              `${basePath}.dataSchema.${fieldName}`,
              configPath,
              violations
            );
          }
        }

        if (nodeType.states) {
          for (const [stateName, stateDef] of Object.entries(nodeType.states)) {
            checkFields(
              stateDef as Record<string, unknown>,
              ALLOWED_FIELDS.stateDefinition,
              `${basePath}.states.${stateName}`,
              configPath,
              violations
            );
          }
        }

        if (nodeType.layout) {
          checkFields(
            nodeType.layout as Record<string, unknown>,
            ALLOWED_FIELDS.layoutHints,
            `${basePath}.layout`,
            configPath,
            violations
          );
        }

        if (nodeType.size) {
          checkFields(
            nodeType.size as Record<string, unknown>,
            ALLOWED_FIELDS.nodeSize,
            `${basePath}.size`,
            configPath,
            violations
          );
        }

        // Check actions
        const nodeTypeAny = nodeType as unknown as Record<string, unknown>;
        if (Array.isArray(nodeTypeAny.actions)) {
          (nodeTypeAny.actions as unknown[]).forEach((action: unknown, index: number) => {
            if (typeof action === 'object' && action !== null) {
              checkFields(
                action as Record<string, unknown>,
                ALLOWED_FIELDS.actionPattern,
                `${basePath}.actions[${index}]`,
                configPath,
                violations
              );
            }
          });
        }
      }
    }

    // Check edgeTypes
    if (configuration.edgeTypes) {
      for (const [typeId, edgeType] of Object.entries(configuration.edgeTypes)) {
        const basePath = `edgeTypes.${typeId}`;
        checkFields(
          edgeType as unknown as Record<string, unknown>,
          ALLOWED_FIELDS.edgeType,
          basePath,
          configPath,
          violations
        );

        if (edgeType.label && typeof edgeType.label === 'object') {
          checkFields(
            edgeType.label as Record<string, unknown>,
            ALLOWED_FIELDS.edgeLabel,
            `${basePath}.label`,
            configPath,
            violations
          );
        }

        if (edgeType.animation && typeof edgeType.animation === 'object') {
          checkFields(
            edgeType.animation as Record<string, unknown>,
            ALLOWED_FIELDS.edgeAnimation,
            `${basePath}.animation`,
            configPath,
            violations
          );
        }

        if (edgeType.dataSchema) {
          for (const [fieldName, fieldDef] of Object.entries(edgeType.dataSchema)) {
            checkFields(
              fieldDef as Record<string, unknown>,
              ALLOWED_FIELDS.dataSchemaField,
              `${basePath}.dataSchema.${fieldName}`,
              configPath,
              violations
            );
          }
        }
      }
    }

    // Check allowedConnections
    if (configuration.allowedConnections) {
      configuration.allowedConnections.forEach((rule, index) => {
        const basePath = `allowedConnections[${index}]`;
        checkFields(
          rule as unknown as Record<string, unknown>,
          ALLOWED_FIELDS.connectionRule,
          basePath,
          configPath,
          violations
        );

        if (rule.constraints) {
          checkFields(
            rule.constraints as Record<string, unknown>,
            ALLOWED_FIELDS.connectionConstraints,
            `${basePath}.constraints`,
            configPath,
            violations
          );
        }
      });
    }

    // Check validation
    if (configuration.validation) {
      checkFields(
        configuration.validation as Record<string, unknown>,
        ALLOWED_FIELDS.validation,
        'validation',
        configPath,
        violations
      );

      // Check state transitions
      if (configuration.validation.stateTransitions) {
        for (const [nodeType, transitions] of Object.entries(
          configuration.validation.stateTransitions
        )) {
          if (Array.isArray(transitions)) {
            transitions.forEach((transition, index) => {
              checkFields(
                transition as Record<string, unknown>,
                ALLOWED_FIELDS.stateTransition,
                `validation.stateTransitions.${nodeType}[${index}]`,
                configPath,
                violations
              );
            });
          }
        }
      }

      // Check constraints
      if (
        configuration.validation.constraints &&
        Array.isArray(configuration.validation.constraints)
      ) {
        configuration.validation.constraints.forEach((constraint, index) => {
          checkFields(
            constraint as Record<string, unknown>,
            ALLOWED_FIELDS.constraint,
            `validation.constraints[${index}]`,
            configPath,
            violations
          );
        });
      }
    }

    // Check display
    if (configuration.display) {
      checkFields(
        configuration.display as unknown as Record<string, unknown>,
        ALLOWED_FIELDS.display,
        'display',
        configPath,
        violations
      );

      if (configuration.display.theme) {
        checkFields(
          configuration.display.theme as Record<string, unknown>,
          ALLOWED_FIELDS.displayTheme,
          'display.theme',
          configPath,
          violations
        );
      }

      if (configuration.display.animations) {
        checkFields(
          configuration.display.animations as Record<string, unknown>,
          ALLOWED_FIELDS.displayAnimations,
          'display.animations',
          configPath,
          violations
        );
      }
    }

    return violations;
  },
};

/**
 * Check an object's fields against allowed fields
 */
function checkFields(
  obj: Record<string, unknown>,
  allowedFields: string[],
  path: string,
  configPath: string | undefined,
  violations: GraphRuleViolation[]
): void {
  for (const field of Object.keys(obj)) {
    if (!allowedFields.includes(field)) {
      const suggestion = findSimilarField(field, allowedFields);
      violations.push({
        ruleId: 'no-unknown-fields',
        severity: 'error',
        file: configPath,
        path: path ? `${path}.${field}` : field,
        message: `Unknown field "${field}"${path ? ` in ${path}` : ' at root level'}`,
        impact: 'This field will be ignored and may indicate a configuration error',
        suggestion: suggestion
          ? `Did you mean "${suggestion}"? Allowed fields: ${allowedFields.join(', ')}`
          : `Allowed fields: ${allowedFields.join(', ')}`,
        fixable: true,
        fixData: { path, field, suggestion },
      });
    }
  }
}

/**
 * Find a similar field name for "did you mean" suggestions
 */
function findSimilarField(field: string, allowedFields: string[]): string | null {
  const fieldLower = field.toLowerCase();

  for (const allowed of allowedFields) {
    const allowedLower = allowed.toLowerCase();

    // Check for substring match
    if (fieldLower.includes(allowedLower) || allowedLower.includes(fieldLower)) {
      return allowed;
    }

    // Check for small edit distance (typos)
    if (Math.abs(field.length - allowed.length) <= 2) {
      let differences = 0;
      const minLen = Math.min(fieldLower.length, allowedLower.length);
      for (let i = 0; i < minLen; i++) {
        if (fieldLower[i] !== allowedLower[i]) differences++;
      }
      differences += Math.abs(field.length - allowed.length);
      if (differences <= 2) return allowed;
    }
  }

  return null;
}
