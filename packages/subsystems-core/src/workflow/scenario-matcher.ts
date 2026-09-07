/**
 * Scenario Matching Logic
 *
 * Selects the appropriate workflow scenario based on which events occurred
 * during execution. Uses priority-based, first-match-wins algorithm.
 */

import type {
  WorkflowScenario,
  WorkflowTemplate,
  OtelEvent,
  ScenarioMatchDetail,
  EnhancedScenarioMatchResult,
} from './types';

/**
 * Get required events for a scenario (derived from template.events)
 *
 * @param scenario - Scenario to extract events from
 * @returns Array of event names required for this scenario to match
 */
export function getRequiredEvents(scenario: WorkflowScenario): string[] {
  return Object.keys(scenario.template?.events || {});
}

/**
 * Calculate detailed match information for a scenario
 *
 * @param scenario - Scenario to evaluate
 * @param events - Events from the trace
 * @returns Detailed match information
 */
function calculateMatchDetails(
  scenario: WorkflowScenario,
  events: OtelEvent[]
): ScenarioMatchDetail {
  const requiredEventNames = getRequiredEvents(scenario);
  const totalRequiredEvents = requiredEventNames.length;

  // Edge case: catch-all scenario (no required events)
  if (totalRequiredEvents === 0) {
    return {
      scenario,
      matchPercentage: 0,
      matchedEventCount: 0,
      totalRequiredEvents: 0,
      matchedEventNames: [],
      missingEventNames: [],
      isFullMatch: false,
      isCatchAll: true,
    };
  }

  const matchedEventNames: string[] = [];
  const missingEventNames: string[] = [];

  for (const eventName of requiredEventNames) {
    const hasEvent = events.some((e) => e.name === eventName);

    if (hasEvent) {
      matchedEventNames.push(eventName);
    } else {
      missingEventNames.push(eventName);
    }
  }

  const matchedEventCount = matchedEventNames.length;
  const matchPercentage = (matchedEventCount / totalRequiredEvents) * 100;

  return {
    scenario,
    matchPercentage,
    matchedEventCount,
    totalRequiredEvents,
    matchedEventNames,
    missingEventNames,
    isFullMatch: matchPercentage === 100,
    isCatchAll: false,
  };
}

/**
 * Select matching scenarios from a workflow template
 *
 * Returns ALL scenarios with 100% match (sorted by priority),
 * or partial matches (sorted by % then priority) if no full matches.
 *
 * @param template - Workflow template with scenarios
 * @param events - Collected OTEL events
 * @returns Enhanced match result (never throws)
 */
export function selectScenario(
  template: WorkflowTemplate,
  events: OtelEvent[]
): EnhancedScenarioMatchResult {
  const fullMatches: ScenarioMatchDetail[] = [];
  const partialMatches: ScenarioMatchDetail[] = [];

  // Evaluate all scenarios
  for (const scenario of template.scenarios) {
    const matchDetail = calculateMatchDetails(scenario, events);

    if (matchDetail.isCatchAll) {
      // Catch-all scenarios go to partial matches
      partialMatches.push(matchDetail);
    } else if (matchDetail.isFullMatch) {
      fullMatches.push(matchDetail);
    } else {
      partialMatches.push(matchDetail);
    }
  }

  // Sort full matches by priority (ascending)
  fullMatches.sort((a, b) => a.scenario.priority - b.scenario.priority);

  // Sort partial matches by percentage (descending), then priority (ascending)
  partialMatches.sort((a, b) => {
    const percentDiff = b.matchPercentage - a.matchPercentage;
    if (percentDiff !== 0) return percentDiff;
    return a.scenario.priority - b.scenario.priority;
  });

  // Determine recommended scenario
  const recommendedScenario =
    fullMatches.length > 0 ? fullMatches[0] : partialMatches.length > 0 ? partialMatches[0] : null;

  return {
    fullMatches,
    partialMatches,
    recommendedScenario,
    totalTraceEvents: events.length,
    totalScenariosEvaluated: template.scenarios.length,
  };
}


/**
 * Check if any event matches the given event name (exact match)
 *
 * @param events - Events to search
 * @param eventName - Event name to match (exact string match)
 * @returns True if any event matches the name
 */
export function hasEventMatching(events: OtelEvent[], eventName: string): boolean {
  return events.some((event) => event.name === eventName);
}


/**
 * Get nested value from object using dot notation
 *
 * Supports both nested objects and flat keys with dots in them.
 * First tries the path as a flat key, then tries nested lookup.
 *
 * @param obj - Object to search
 * @param path - Dot-separated path (e.g., "result.violations.total")
 * @returns Value at path, or undefined if not found
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  // First try as a flat key (handles attributes like 'result.violations.total')
  if (path in obj) {
    return obj[path];
  }

  // Then try as nested path
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Set nested value in object using dot notation
 *
 * @param obj - Object to modify
 * @param path - Dot-separated path (e.g., "result.violations.total")
 * @param value - Value to set
 */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}

/**
 * Compute aggregate values from events
 *
 * Provides common aggregations like counts, totals, averages, etc.
 * that can be used in scenario conditions and templates.
 *
 * @param events - Collected OTEL events
 * @returns Aggregate values
 */
export function computeAggregates(events: OtelEvent[]): Record<string, unknown> {
  const aggregates: Record<string, unknown> = {
    // Event counts
    'events.length': events.length,
    'events.count': events.length,

    // Spans
    'spans.count': events.filter((e) => e.type === 'span').length,

    // Logs
    'logs.count': events.filter((e) => e.type === 'log').length,
    'errorLogs.count': events.filter((e) => e.type === 'log' && (e.severityNumber ?? 0) >= 17).length,
    'warnLogs.count': events.filter(
      (e) => e.type === 'log' && (e.severityNumber ?? 0) >= 13 && (e.severityNumber ?? 0) <= 16
    ).length,
    'debugLogs.count': events.filter(
      (e) => e.type === 'log' && (e.severityNumber ?? 0) >= 5 && (e.severityNumber ?? 0) <= 8
    ).length,
  };

  // Extract attributes from summary/completion events for scenario matching
  // These events contain execution-level data (not per-event varying data)
  // Store ONLY as flat keys to avoid conflicts with event-specific attributes
  const summaryEventPatterns = ['.complete', '.summary', '.error', '.started'];
  const summaryEvents = events.filter((e) =>
    summaryEventPatterns.some((pattern) => e.name.endsWith(pattern))
  );

  for (const event of summaryEvents) {
    if (event.attributes) {
      for (const [key, value] of Object.entries(event.attributes)) {
        // Store only in flat structure to match event attribute keys
        // This prevents nested structures from shadowing event-specific attributes
        aggregates[key] = value;
      }
    }
  }

  return aggregates;
}
