/**
 * Rule: valid-color-format
 * Ensures all color values are valid hex codes
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

/**
 * Regex for valid hex color codes (#RGB or #RRGGBB)
 */
const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export const validColorFormat: GraphRule = {
  id: 'valid-color-format',
  name: 'Valid Color Format',
  description: 'Color values must be valid hex codes (#RGB or #RRGGBB)',
  impact: 'Invalid colors may render incorrectly or cause visualization errors',
  severity: 'error',
  category: 'schema',
  enabled: true,
  fixable: true,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    // Check nodeTypes colors
    if (configuration.nodeTypes) {
      for (const [typeId, nodeType] of Object.entries(configuration.nodeTypes)) {
        // Check node color
        if (nodeType.color && !isValidColor(nodeType.color)) {
          violations.push(
            createColorViolation(
              configPath,
              `nodeTypes.${typeId}.color`,
              nodeType.color,
              `node type "${typeId}"`
            )
          );
        }

        // Check node stroke color
        if (nodeType.stroke && !isValidColor(nodeType.stroke)) {
          violations.push(
            createColorViolation(
              configPath,
              `nodeTypes.${typeId}.stroke`,
              nodeType.stroke,
              `node type "${typeId}" stroke`
            )
          );
        }

        // Check state colors
        if (nodeType.states) {
          for (const [stateName, stateDef] of Object.entries(nodeType.states)) {
            if (stateDef.color && !isValidColor(stateDef.color)) {
              violations.push(
                createColorViolation(
                  configPath,
                  `nodeTypes.${typeId}.states.${stateName}.color`,
                  stateDef.color,
                  `state "${stateName}" in node type "${typeId}"`
                )
              );
            }
          }
        }
      }
    }

    // Check edgeTypes colors
    if (configuration.edgeTypes) {
      for (const [typeId, edgeType] of Object.entries(configuration.edgeTypes)) {
        // Check edge color
        if (edgeType.color && !isValidColor(edgeType.color)) {
          violations.push(
            createColorViolation(
              configPath,
              `edgeTypes.${typeId}.color`,
              edgeType.color,
              `edge type "${typeId}"`
            )
          );
        }

        // Check animation color
        if (edgeType.animation?.color && !isValidColor(edgeType.animation.color)) {
          violations.push(
            createColorViolation(
              configPath,
              `edgeTypes.${typeId}.animation.color`,
              edgeType.animation.color,
              `animation in edge type "${typeId}"`
            )
          );
        }
      }
    }

    // Check display theme colors
    if (configuration.display?.theme) {
      const theme = configuration.display.theme;
      const themeColors = ['primary', 'success', 'warning', 'danger', 'info'] as const;

      for (const colorKey of themeColors) {
        const colorValue = theme[colorKey];
        if (colorValue && !isValidColor(colorValue)) {
          violations.push(
            createColorViolation(
              configPath,
              `display.theme.${colorKey}`,
              colorValue,
              `theme ${colorKey} color`
            )
          );
        }
      }
    }

    return violations;
  },
};

/**
 * Check if a color value is valid
 */
function isValidColor(color: string): boolean {
  return HEX_COLOR_REGEX.test(color);
}

/**
 * Create a color format violation
 */
function createColorViolation(
  configPath: string | undefined,
  path: string,
  value: string,
  description: string
): GraphRuleViolation {
  return {
    ruleId: 'valid-color-format',
    severity: 'error',
    file: configPath,
    path,
    message: `Invalid color format "${value}" for ${description}`,
    impact: 'Color may not render correctly',
    suggestion: 'Use hex format: #RGB or #RRGGBB (e.g., #3b82f6 or #f00)',
    fixable: true,
    fixData: { path, value, description },
  };
}
