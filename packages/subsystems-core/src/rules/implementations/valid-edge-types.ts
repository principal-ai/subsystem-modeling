/**
 * Rule: valid-edge-types
 * Ensures edgeTypes have required fields and valid values
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

/**
 * Valid style values for edges
 */
const VALID_STYLES = ['solid', 'dashed', 'dotted', 'animated'] as const;

/**
 * Valid animation types
 */
const VALID_ANIMATION_TYPES = ['flow', 'pulse', 'particle', 'glow'] as const;

/**
 * Valid label positions
 */
const VALID_LABEL_POSITIONS = ['start', 'middle', 'end'] as const;

/**
 * Valid data schema field types
 */
const VALID_DATA_TYPES = ['string', 'number', 'boolean', 'object', 'array'] as const;

export const validEdgeTypes: GraphRule = {
  id: 'valid-edge-types',
  name: 'Valid Edge Types',
  description: 'edgeTypes must have required fields and valid values',
  impact: 'Invalid edge types will cause rendering errors or unexpected behavior',
  severity: 'error',
  category: 'schema',
  enabled: true,
  fixable: false,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    if (!configuration.edgeTypes) {
      violations.push({
        ruleId: 'valid-edge-types',
        severity: 'error',
        file: configPath,
        path: 'edgeTypes',
        message: 'Configuration is missing edgeTypes section',
        impact: 'No edges can be defined without edgeTypes',
        suggestion: 'Add an edgeTypes section with at least one edge type definition',
        fixable: false,
      });
      return violations;
    }

    if (Object.keys(configuration.edgeTypes).length === 0) {
      violations.push({
        ruleId: 'valid-edge-types',
        severity: 'error',
        file: configPath,
        path: 'edgeTypes',
        message: 'edgeTypes section is empty',
        impact: 'No edges can be defined without at least one edge type',
        suggestion: 'Add at least one edge type definition',
        fixable: false,
      });
      return violations;
    }

    for (const [typeId, edgeType] of Object.entries(configuration.edgeTypes)) {
      const basePath = `edgeTypes.${typeId}`;

      // Check required style field
      if (!edgeType.style) {
        violations.push({
          ruleId: 'valid-edge-types',
          severity: 'error',
          file: configPath,
          path: `${basePath}.style`,
          message: `Edge type "${typeId}" is missing required "style" field`,
          impact: 'Edge cannot be rendered without a style',
          suggestion: `Add a style field. Valid values: ${VALID_STYLES.join(', ')}`,
          fixable: false,
        });
      } else if (!VALID_STYLES.includes(edgeType.style as (typeof VALID_STYLES)[number])) {
        violations.push({
          ruleId: 'valid-edge-types',
          severity: 'error',
          file: configPath,
          path: `${basePath}.style`,
          message: `Edge type "${typeId}" has invalid style "${edgeType.style}"`,
          impact: 'Edge may not render correctly',
          suggestion: `Valid styles: ${VALID_STYLES.join(', ')}`,
          fixable: false,
        });
      }

      // Check width is a number if provided
      if (edgeType.width !== undefined && typeof edgeType.width !== 'number') {
        violations.push({
          ruleId: 'valid-edge-types',
          severity: 'error',
          file: configPath,
          path: `${basePath}.width`,
          message: `Edge type "${typeId}" width must be a number`,
          impact: 'Edge width may not render correctly',
          suggestion: 'Provide width as a number (e.g., 2)',
          fixable: false,
        });
      }

      // Check directed is a boolean if provided
      if (edgeType.directed !== undefined && typeof edgeType.directed !== 'boolean') {
        violations.push({
          ruleId: 'valid-edge-types',
          severity: 'error',
          file: configPath,
          path: `${basePath}.directed`,
          message: `Edge type "${typeId}" directed must be a boolean`,
          impact: 'Edge direction may not work correctly',
          suggestion: 'Provide directed as true or false',
          fixable: false,
        });
      }

      // Check animated is a boolean if provided
      if (edgeType.animated !== undefined && typeof edgeType.animated !== 'boolean') {
        violations.push({
          ruleId: 'valid-edge-types',
          severity: 'error',
          file: configPath,
          path: `${basePath}.animated`,
          message: `Edge type "${typeId}" animated must be a boolean`,
          impact: 'Edge animation may not work correctly',
          suggestion: 'Provide animated as true or false',
          fixable: false,
        });
      }

      // Check label configuration
      if (edgeType.label) {
        if (typeof edgeType.label !== 'object' || edgeType.label === null) {
          violations.push({
            ruleId: 'valid-edge-types',
            severity: 'error',
            file: configPath,
            path: `${basePath}.label`,
            message: `Edge type "${typeId}" label must be an object`,
            impact: 'Edge label configuration is invalid',
            suggestion:
              'Provide label as { field?: string, position?: "start" | "middle" | "end" }',
            fixable: false,
          });
        } else {
          if (edgeType.label.position !== undefined) {
            if (
              !VALID_LABEL_POSITIONS.includes(
                edgeType.label.position as (typeof VALID_LABEL_POSITIONS)[number]
              )
            ) {
              violations.push({
                ruleId: 'valid-edge-types',
                severity: 'error',
                file: configPath,
                path: `${basePath}.label.position`,
                message: `Edge type "${typeId}" has invalid label position "${edgeType.label.position}"`,
                impact: 'Label may not appear in expected position',
                suggestion: `Valid positions: ${VALID_LABEL_POSITIONS.join(', ')}`,
                fixable: false,
              });
            }
          }
        }
      }

      // Check animation configuration
      if (edgeType.animation) {
        if (typeof edgeType.animation !== 'object' || edgeType.animation === null) {
          violations.push({
            ruleId: 'valid-edge-types',
            severity: 'error',
            file: configPath,
            path: `${basePath}.animation`,
            message: `Edge type "${typeId}" animation must be an object`,
            impact: 'Edge animation configuration is invalid',
            suggestion:
              'Provide animation as { type: "flow" | "pulse" | "particle" | "glow", duration?: number }',
            fixable: false,
          });
        } else {
          // Check animation type
          if (!edgeType.animation.type) {
            violations.push({
              ruleId: 'valid-edge-types',
              severity: 'error',
              file: configPath,
              path: `${basePath}.animation.type`,
              message: `Edge type "${typeId}" animation is missing required "type" field`,
              impact: 'Animation cannot run without a type',
              suggestion: `Add a type field. Valid values: ${VALID_ANIMATION_TYPES.join(', ')}`,
              fixable: false,
            });
          } else if (
            !VALID_ANIMATION_TYPES.includes(
              edgeType.animation.type as (typeof VALID_ANIMATION_TYPES)[number]
            )
          ) {
            violations.push({
              ruleId: 'valid-edge-types',
              severity: 'error',
              file: configPath,
              path: `${basePath}.animation.type`,
              message: `Edge type "${typeId}" has invalid animation type "${edgeType.animation.type}"`,
              impact: 'Animation may not work correctly',
              suggestion: `Valid animation types: ${VALID_ANIMATION_TYPES.join(', ')}`,
              fixable: false,
            });
          }

          // Check animation duration
          if (
            edgeType.animation.duration !== undefined &&
            typeof edgeType.animation.duration !== 'number'
          ) {
            violations.push({
              ruleId: 'valid-edge-types',
              severity: 'error',
              file: configPath,
              path: `${basePath}.animation.duration`,
              message: `Edge type "${typeId}" animation duration must be a number`,
              impact: 'Animation timing may not work correctly',
              suggestion: 'Provide duration as a number in milliseconds',
              fixable: false,
            });
          }
        }
      }

      // Check dataSchema field types
      if (edgeType.dataSchema) {
        for (const [fieldName, fieldDef] of Object.entries(edgeType.dataSchema)) {
          if (!fieldDef.type) {
            violations.push({
              ruleId: 'valid-edge-types',
              severity: 'error',
              file: configPath,
              path: `${basePath}.dataSchema.${fieldName}.type`,
              message: `Data schema field "${fieldName}" in edge type "${typeId}" is missing "type"`,
              impact: 'Data validation will not work for this field',
              suggestion: `Add a type field. Valid values: ${VALID_DATA_TYPES.join(', ')}`,
              fixable: false,
            });
          } else if (
            !VALID_DATA_TYPES.includes(fieldDef.type as (typeof VALID_DATA_TYPES)[number])
          ) {
            violations.push({
              ruleId: 'valid-edge-types',
              severity: 'error',
              file: configPath,
              path: `${basePath}.dataSchema.${fieldName}.type`,
              message: `Invalid data type "${fieldDef.type}" for field "${fieldName}" in edge type "${typeId}"`,
              impact: 'Data validation may fail',
              suggestion: `Valid types: ${VALID_DATA_TYPES.join(', ')}`,
              fixable: false,
            });
          }
        }
      }
    }

    return violations;
  },
};
