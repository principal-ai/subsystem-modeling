import type { GraphConfiguration } from './types';

export interface ConfigurationValidationError {
  type: 'error' | 'warning';
  message: string;
  path: string;
  suggestion?: string;
}

export interface ConfigurationValidationResult {
  valid: boolean;
  errors: ConfigurationValidationError[];
  warnings: ConfigurationValidationError[];
}

/**
 * Validates GraphConfiguration to catch issues early
 * Use this before creating EventProcessor or rendering graphs
 */
export class ConfigurationValidator {
  /**
   * Validate a GraphConfiguration
   */
  static validate(config: GraphConfiguration): ConfigurationValidationResult {
    const errors: ConfigurationValidationError[] = [];
    const warnings: ConfigurationValidationError[] = [];

    // Validate metadata
    if (!config.metadata?.name) {
      errors.push({
        type: 'error',
        message: 'Configuration must have a name',
        path: 'metadata.name',
      });
    }

    // Validate nodeTypes
    if (!config.nodeTypes || Object.keys(config.nodeTypes).length === 0) {
      errors.push({
        type: 'error',
        message: 'Configuration must define at least one node type',
        path: 'nodeTypes',
      });
    } else {
      // Validate each node type
      for (const [typeName, nodeType] of Object.entries(config.nodeTypes)) {
        if (!nodeType.shape) {
          errors.push({
            type: 'error',
            message: `Node type '${typeName}' must have a shape`,
            path: `nodeTypes.${typeName}.shape`,
          });
        }

        if (!nodeType.dataSchema || Object.keys(nodeType.dataSchema).length === 0) {
          warnings.push({
            type: 'warning',
            message: `Node type '${typeName}' has no data schema defined`,
            path: `nodeTypes.${typeName}.dataSchema`,
            suggestion: 'Consider defining data schema for better type safety',
          });
        }

        // Validate states if defined
        if (nodeType.states) {
          for (const [stateName, state] of Object.entries(nodeType.states)) {
            if (!state.label && !state.color && !state.icon) {
              warnings.push({
                type: 'warning',
                message: `State '${stateName}' of node type '${typeName}' has no visual properties`,
                path: `nodeTypes.${typeName}.states.${stateName}`,
                suggestion: 'Add at least one of: label, color, or icon',
              });
            }
          }
        }
      }
    }

    // Validate edgeTypes
    if (!config.edgeTypes || Object.keys(config.edgeTypes).length === 0) {
      errors.push({
        type: 'error',
        message: 'Configuration must define at least one edge type',
        path: 'edgeTypes',
      });
    } else {
      // Validate each edge type
      for (const [typeName, edgeType] of Object.entries(config.edgeTypes)) {
        if (!edgeType.style) {
          errors.push({
            type: 'error',
            message: `Edge type '${typeName}' must have a style`,
            path: `edgeTypes.${typeName}.style`,
          });
        }
      }
    }

    // Validate allowedConnections
    if (!config.allowedConnections || config.allowedConnections.length === 0) {
      warnings.push({
        type: 'warning',
        message: 'No connection rules defined',
        path: 'allowedConnections',
        suggestion: 'Define connection rules to validate graph structure',
      });
    } else {
      const nodeTypeNames = Object.keys(config.nodeTypes);
      const edgeTypeNames = Object.keys(config.edgeTypes);

      config.allowedConnections.forEach((rule, index) => {
        // Check if 'from' node type exists
        if (!nodeTypeNames.includes(rule.from)) {
          errors.push({
            type: 'error',
            message: `Connection rule references undefined node type '${rule.from}'`,
            path: `allowedConnections[${index}].from`,
            suggestion: `Available node types: ${nodeTypeNames.join(', ')}`,
          });
        }

        // Check if 'to' node type exists
        if (!nodeTypeNames.includes(rule.to)) {
          errors.push({
            type: 'error',
            message: `Connection rule references undefined node type '${rule.to}'`,
            path: `allowedConnections[${index}].to`,
            suggestion: `Available node types: ${nodeTypeNames.join(', ')}`,
          });
        }

        // Check if 'via' edge type exists
        if (!edgeTypeNames.includes(rule.via)) {
          errors.push({
            type: 'error',
            message: `Connection rule references undefined edge type '${rule.via}'`,
            path: `allowedConnections[${index}].via`,
            suggestion: `Available edge types: ${edgeTypeNames.join(', ')}`,
          });
        }
      });
    }

    // Validate validation rules if present
    if (config.validation) {
      // Validate state transitions
      if (config.validation.stateTransitions) {
        const nodeTypeNames = Object.keys(config.nodeTypes);

        for (const [nodeType, transitions] of Object.entries(config.validation.stateTransitions)) {
          if (!nodeTypeNames.includes(nodeType)) {
            errors.push({
              type: 'error',
              message: `State transition rule references undefined node type '${nodeType}'`,
              path: `validation.stateTransitions.${nodeType}`,
              suggestion: `Available node types: ${nodeTypeNames.join(', ')}`,
            });
          } else {
            // Check if states exist in node type definition
            const nodeTypeDef = config.nodeTypes[nodeType];
            const definedStates = nodeTypeDef.states ? Object.keys(nodeTypeDef.states) : [];

            transitions.forEach((transition, index) => {
              if (definedStates.length > 0 && !definedStates.includes(transition.from)) {
                warnings.push({
                  type: 'warning',
                  message: `State transition references undefined state '${transition.from}' for node type '${nodeType}'`,
                  path: `validation.stateTransitions.${nodeType}[${index}].from`,
                  suggestion: `Defined states: ${definedStates.join(', ')}`,
                });
              }

              transition.to.forEach((toState) => {
                if (definedStates.length > 0 && !definedStates.includes(toState)) {
                  warnings.push({
                    type: 'warning',
                    message: `State transition references undefined state '${toState}' for node type '${nodeType}'`,
                    path: `validation.stateTransitions.${nodeType}[${index}].to`,
                    suggestion: `Defined states: ${definedStates.join(', ')}`,
                  });
                }
              });
            });
          }
        }
      }

      // Validate cardinality rules
      if (config.validation.cardinality) {
        const nodeTypeNames = Object.keys(config.nodeTypes);

        for (const nodeType of Object.keys(config.validation.cardinality)) {
          if (!nodeTypeNames.includes(nodeType)) {
            errors.push({
              type: 'error',
              message: `Cardinality rule references undefined node type '${nodeType}'`,
              path: `validation.cardinality.${nodeType}`,
              suggestion: `Available node types: ${nodeTypeNames.join(', ')}`,
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate and throw if invalid
   */
  static validateOrThrow(config: GraphConfiguration): void {
    const result = this.validate(config);

    if (!result.valid) {
      const errorMessages = result.errors.map(
        (e) => `  - ${e.path}: ${e.message}${e.suggestion ? ` (${e.suggestion})` : ''}`
      );

      throw new Error(
        `Invalid GraphConfiguration:\n${errorMessages.join('\n')}\n\n` +
          `Found ${result.errors.length} error(s) and ${result.warnings.length} warning(s)`
      );
    }

    // Log warnings
    if (result.warnings.length > 0) {
      console.warn(`Configuration has ${result.warnings.length} warning(s):`);
      result.warnings.forEach((w) => {
        console.warn(`  - ${w.path}: ${w.message}${w.suggestion ? ` (${w.suggestion})` : ''}`);
      });
    }
  }

  /**
   * Get a formatted report of validation results
   */
  static formatReport(result: ConfigurationValidationResult): string {
    const lines: string[] = [];

    if (result.valid) {
      lines.push('✅ Configuration is valid');
    } else {
      lines.push(`❌ Configuration has ${result.errors.length} error(s)`);
    }

    if (result.errors.length > 0) {
      lines.push('\nErrors:');
      result.errors.forEach((e) => {
        lines.push(`  ❌ ${e.path}: ${e.message}`);
        if (e.suggestion) {
          lines.push(`     💡 ${e.suggestion}`);
        }
      });
    }

    if (result.warnings.length > 0) {
      lines.push(`\n⚠️  ${result.warnings.length} warning(s):`);
      result.warnings.forEach((w) => {
        lines.push(`  ⚠️  ${w.path}: ${w.message}`);
        if (w.suggestion) {
          lines.push(`     💡 ${w.suggestion}`);
        }
      });
    }

    return lines.join('\n');
  }
}
