/**
 * Rule: dead-end-states
 * Warns when states have no exit transitions (except terminal states)
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation, RuleOptions } from '../types';

/**
 * Options for dead-end-states rule
 */
export interface DeadEndStatesOptions extends RuleOptions {
  /**
   * States that are intentionally terminal (no exits expected)
   * @default ["completed", "failed", "terminated", "done", "error", "finished", "end"]
   */
  terminalStates: string[];
}

const DEFAULT_OPTIONS: DeadEndStatesOptions = {
  terminalStates: ['completed', 'failed', 'terminated', 'done', 'error', 'finished', 'end'],
};

export const deadEndStates: GraphRule<DeadEndStatesOptions> = {
  id: 'dead-end-states',
  name: 'Dead End States',
  description: 'States should have exit transitions unless they are terminal states',
  impact: 'Dead-end states may trap entities unexpectedly',
  severity: 'error',
  category: 'structure',
  enabled: true,
  fixable: false,
  defaultOptions: DEFAULT_OPTIONS,

  async check(context: GraphRuleContext<DeadEndStatesOptions>): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath, options } = context;

    const terminalStates = new Set(
      (options.terminalStates ?? DEFAULT_OPTIONS.terminalStates).map((s) => s.toLowerCase())
    );

    if (!configuration.nodeTypes) {
      return violations;
    }

    // For each nodeType with states, check if all non-terminal states have exits
    for (const [typeId, nodeType] of Object.entries(configuration.nodeTypes)) {
      if (!nodeType.states || Object.keys(nodeType.states).length === 0) {
        continue;
      }

      const stateIds = Object.keys(nodeType.states);

      // If there's only one state, no transitions expected
      if (stateIds.length <= 1) {
        continue;
      }

      // Get state transitions for this nodeType
      const transitions = configuration.validation?.stateTransitions?.[typeId];

      // Build set of states that have exit transitions
      const statesWithExits = new Set<string>();

      if (transitions && Array.isArray(transitions)) {
        for (const transition of transitions) {
          if (transition.from) {
            statesWithExits.add(transition.from);
          }
        }
      }

      // Check for dead-end states
      for (const stateId of stateIds) {
        // Skip if this state has exits
        if (statesWithExits.has(stateId)) {
          continue;
        }

        // Skip if this is a known terminal state
        if (terminalStates.has(stateId.toLowerCase())) {
          continue;
        }

        // This is a dead-end state
        violations.push({
          ruleId: 'dead-end-states',
          severity: 'error',
          file: configPath,
          path: `nodeTypes.${typeId}.states.${stateId}`,
          message: `State "${stateId}" in node type "${typeId}" has no exit transitions`,
          impact: 'Entities in this state cannot transition to other states',
          suggestion: `Add a transition from "${stateId}" in validation.stateTransitions.${typeId}, or mark it as a terminal state`,
          fixable: false,
        });
      }
    }

    return violations;
  },
};
