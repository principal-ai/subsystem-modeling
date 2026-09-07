import type {
  EdgeEvent,
  GraphEvent,
  GraphState,
  StateEvent,
  ValidationResult,
  ValidationRules,
  Violation,
  Warning,
} from './types';

/**
 * ValidationEngine checks events against defined rules
 */
export class ValidationEngine {
  private rules: ValidationRules;
  private violationCount = 0;
  private warningCount = 0;

  constructor(rules: ValidationRules) {
    this.rules = rules;
  }

  /**
   * Validate an event against all rules
   */
  validate(event: GraphEvent, state: GraphState): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];

    // Check connection rules
    if (event.category === 'edge' && event.operation === 'create') {
      violations.push(...this.validateConnection(event, state));
    }

    // Check state transition rules
    if (event.category === 'state') {
      violations.push(...this.validateStateTransition(event, state));
    }

    // Check if event was expected
    if (event.expected === false) {
      violations.push(this.createUnexpectedEventViolation(event));
    }

    // Update counters
    this.violationCount += violations.filter((v) => v.severity === 'error').length;
    this.warningCount += violations.filter((v) => v.severity === 'warning').length;

    return {
      valid: violations.filter((v) => v.severity === 'error').length === 0,
      violations,
      warnings,
      metrics: {
        totalEvents: 1,
        validEvents: violations.length === 0 ? 1 : 0,
        violations: violations.filter((v) => v.severity === 'error').length,
        warnings: violations.filter((v) => v.severity === 'warning').length,
        unexpectedEvents: event.expected === false ? 1 : 0,
        expectedEventsMissing: 0,
      },
    };
  }

  /**
   * Check constraints across the entire graph state
   */
  checkConstraints(state: GraphState): Violation[] {
    const violations: Violation[] = [];

    // Check cardinality constraints
    if (this.rules.cardinality) {
      for (const [nodeType, rule] of Object.entries(this.rules.cardinality)) {
        const count = Array.from(state.nodes.values()).filter((n) => n.type === nodeType).length;

        if (rule.min !== undefined && count < rule.min) {
          violations.push({
            id: `cardinality-${nodeType}-min`,
            severity: 'error',
            type: 'cardinality',
            description: `Node type '${nodeType}' has ${count} instances but requires at least ${rule.min}`,
          });
        }

        if (rule.max !== undefined && count > rule.max) {
          violations.push({
            id: `cardinality-${nodeType}-max`,
            severity: 'error',
            type: 'cardinality',
            description: `Node type '${nodeType}' has ${count} instances but allows at most ${rule.max}`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Validate connection rules
   */
  private validateConnection(event: GraphEvent, state: GraphState): Violation[] {
    const violations: Violation[] = [];
    const payload = event.payload as EdgeEvent;

    // Get the nodes being connected
    const fromNode = state.nodes.get(payload.from);
    const toNode = state.nodes.get(payload.to);

    if (!fromNode || !toNode) {
      violations.push({
        id: `connection-${event.id}`,
        severity: 'error',
        type: 'connection',
        description: 'Cannot create edge: one or both nodes do not exist',
        event,
        context: {
          edgeId: payload.edgeId,
        },
      });
      return violations;
    }

    // Check if this connection is allowed
    const allowedConnections = state.configuration.allowedConnections || [];
    const isAllowed = allowedConnections.some(
      (rule) =>
        rule.from === fromNode.type && rule.to === toNode.type && rule.via === payload.edgeType
    );

    if (!isAllowed) {
      violations.push({
        id: `connection-${event.id}`,
        severity: 'error',
        type: 'connection',
        description: `Connection from '${fromNode.type}' to '${toNode.type}' via '${payload.edgeType}' is not allowed`,
        event,
        context: {
          edgeId: payload.edgeId,
        },
      });
    }

    return violations;
  }

  /**
   * Validate state transitions
   */
  private validateStateTransition(event: GraphEvent, state: GraphState): Violation[] {
    const violations: Violation[] = [];
    const payload = event.payload as StateEvent;

    const node = state.nodes.get(payload.nodeId);
    if (!node) {
      return violations;
    }

    const transitions = this.rules.stateTransitions?.[node.type];
    if (!transitions) {
      return violations;
    }

    const currentState = payload.previousState || node.state;
    const newState = payload.newState;

    // Find valid transitions from current state
    const validTransition = transitions.find((t) => t.from === currentState);

    if (validTransition && !validTransition.to.includes(newState)) {
      violations.push({
        id: `state-transition-${event.id}`,
        severity: 'error',
        type: 'state',
        description: `Invalid state transition for '${
          node.type
        }': ${currentState} -> ${newState}. Valid transitions: ${validTransition.to.join(', ')}`,
        event,
        context: {
          nodeId: payload.nodeId,
        },
      });
    }

    return violations;
  }

  /**
   * Create violation for unexpected event
   */
  private createUnexpectedEventViolation(event: GraphEvent): Violation {
    return {
      id: `unexpected-${event.id}`,
      severity: 'warning',
      type: 'unexpected_event',
      description: `Unexpected event: ${event.type}`,
      event,
    };
  }
}
