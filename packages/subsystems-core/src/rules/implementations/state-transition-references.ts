/**
 * Rule: state-transition-references
 * Ensures state transitions only reference defined states
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

export const stateTransitionReferences: GraphRule = {
  id: 'state-transition-references',
  name: 'State Transition References',
  description: 'State transitions must reference states defined in nodeTypes',
  impact: 'Invalid state references will cause state validation to fail',
  severity: 'error',
  category: 'reference',
  enabled: true,
  fixable: false,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    if (!configuration.validation?.stateTransitions) {
      return violations;
    }

    // Build a map of nodeType -> defined states
    const statesByNodeType = new Map<string, Set<string>>();

    if (configuration.nodeTypes) {
      for (const [typeId, nodeType] of Object.entries(configuration.nodeTypes)) {
        if (nodeType.states) {
          statesByNodeType.set(typeId, new Set(Object.keys(nodeType.states)));
        }
      }
    }

    // Check each state transition rule
    for (const [nodeTypeId, transitions] of Object.entries(
      configuration.validation.stateTransitions
    )) {
      const basePath = `validation.stateTransitions.${nodeTypeId}`;

      // Check if nodeType exists
      if (!configuration.nodeTypes?.[nodeTypeId]) {
        violations.push({
          ruleId: 'state-transition-references',
          severity: 'error',
          file: configPath,
          path: basePath,
          message: `State transitions defined for undefined nodeType "${nodeTypeId}"`,
          impact: 'These state transitions will never apply',
          suggestion: `Available nodeTypes: ${
            Object.keys(configuration.nodeTypes ?? {}).join(', ') || '(none defined)'
          }`,
          fixable: false,
        });
        continue;
      }

      // Check if nodeType has states defined
      const definedStates = statesByNodeType.get(nodeTypeId);
      if (!definedStates || definedStates.size === 0) {
        violations.push({
          ruleId: 'state-transition-references',
          severity: 'error',
          file: configPath,
          path: basePath,
          message: `State transitions defined for nodeType "${nodeTypeId}" which has no states`,
          impact: 'These state transitions will never apply',
          suggestion: `Add states to nodeTypes.${nodeTypeId}.states`,
          fixable: false,
        });
        continue;
      }

      // Check each transition
      if (Array.isArray(transitions)) {
        for (let i = 0; i < transitions.length; i++) {
          const transition = transitions[i];
          const transitionPath = `${basePath}[${i}]`;

          // Check 'from' state
          if (transition.from && !definedStates.has(transition.from)) {
            const suggestion = findSimilar(transition.from, definedStates);
            violations.push({
              ruleId: 'state-transition-references',
              severity: 'error',
              file: configPath,
              path: `${transitionPath}.from`,
              message: `Transition references undefined state "${transition.from}" in nodeType "${nodeTypeId}"`,
              impact: 'This transition will never match',
              suggestion: suggestion
                ? `Did you mean "${suggestion}"?`
                : `Available states: ${[...definedStates].join(', ')}`,
              fixable: false,
            });
          }

          // Check 'to' states
          if (Array.isArray(transition.to)) {
            for (let j = 0; j < transition.to.length; j++) {
              const toState = transition.to[j];
              if (!definedStates.has(toState)) {
                const suggestion = findSimilar(toState, definedStates);
                violations.push({
                  ruleId: 'state-transition-references',
                  severity: 'error',
                  file: configPath,
                  path: `${transitionPath}.to[${j}]`,
                  message: `Transition references undefined state "${toState}" in nodeType "${nodeTypeId}"`,
                  impact: 'This transition target is invalid',
                  suggestion: suggestion
                    ? `Did you mean "${suggestion}"?`
                    : `Available states: ${[...definedStates].join(', ')}`,
                  fixable: false,
                });
              }
            }
          }
        }
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
