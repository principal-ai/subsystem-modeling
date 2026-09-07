/**
 * Rule: unreachable-states
 * Warns when states have no entry transitions (cannot be reached)
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

export const unreachableStates: GraphRule = {
  id: 'unreachable-states',
  name: 'Unreachable States',
  description: 'States should have at least one entry transition or be an initial state',
  impact: 'Unreachable states can never be entered and may indicate configuration errors',
  severity: 'error',
  category: 'structure',
  enabled: true,
  fixable: false,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    if (!configuration.nodeTypes) {
      return violations;
    }

    // For each nodeType with states, check if all states are reachable
    for (const [typeId, nodeType] of Object.entries(configuration.nodeTypes)) {
      if (!nodeType.states || Object.keys(nodeType.states).length === 0) {
        continue;
      }

      const stateIds = Object.keys(nodeType.states);

      // If there's only one state, it's implicitly the initial state
      if (stateIds.length <= 1) {
        continue;
      }

      // Get state transitions for this nodeType
      const transitions = configuration.validation?.stateTransitions?.[typeId];

      if (!transitions || !Array.isArray(transitions) || transitions.length === 0) {
        // No transitions defined - all states except the first are unreachable
        // The first state is conventionally the initial state
        for (let i = 1; i < stateIds.length; i++) {
          violations.push({
            ruleId: 'unreachable-states',
            severity: 'error',
            file: configPath,
            path: `nodeTypes.${typeId}.states.${stateIds[i]}`,
            message: `State "${stateIds[i]}" in node type "${typeId}" has no entry transitions`,
            impact: 'This state can never be reached',
            suggestion: `Add a state transition to "${stateIds[i]}" in validation.stateTransitions.${typeId}`,
            fixable: false,
          });
        }
        continue;
      }

      // Build set of states that can be reached (are targets of transitions)
      const reachableStates = new Set<string>();

      // First state is assumed to be the initial state
      reachableStates.add(stateIds[0]);

      // Add all states that are targets of transitions
      for (const transition of transitions) {
        if (Array.isArray(transition.to)) {
          for (const toState of transition.to) {
            reachableStates.add(toState);
          }
        }
      }

      // Check for unreachable states
      for (const stateId of stateIds) {
        if (!reachableStates.has(stateId)) {
          violations.push({
            ruleId: 'unreachable-states',
            severity: 'error',
            file: configPath,
            path: `nodeTypes.${typeId}.states.${stateId}`,
            message: `State "${stateId}" in node type "${typeId}" has no entry transitions`,
            impact: 'This state can never be reached',
            suggestion: `Add a state transition to "${stateId}" in validation.stateTransitions.${typeId}`,
            fixable: false,
          });
        }
      }
    }

    return violations;
  },
};
