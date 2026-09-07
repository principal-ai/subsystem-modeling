/**
 * Tests for scenario matching logic
 */

import { selectScenario, hasEventMatching, computeAggregates, getNestedValue } from '../scenario-matcher';
import type { WorkflowTemplate, OtelEvent } from '../types';

describe('hasEventMatching', () => {
  const events: OtelEvent[] = [
    { name: 'conversion.started', timestamp: 0 },
    { name: 'conversion.complete', timestamp: 100 },
    { name: 'rule.completed', timestamp: 50 },
    { name: 'rule.error', timestamp: 75 },
    { name: 'log.info', timestamp: 25, type: 'log', severityText: 'INFO' },
  ];

  it('should match exact event names', () => {
    expect(hasEventMatching(events, 'conversion.started')).toBe(true);
    expect(hasEventMatching(events, 'conversion.complete')).toBe(true);
    expect(hasEventMatching(events, 'nonexistent')).toBe(false);
  });
});

describe('getNestedValue', () => {
  const obj = {
    result: {
      violations: {
        total: 10,
        errors: 5,
      },
    },
    simple: 'value',
  };

  it('should get simple property', () => {
    expect(getNestedValue(obj, 'simple')).toBe('value');
  });

  it('should get nested property', () => {
    expect(getNestedValue(obj, 'result.violations.total')).toBe(10);
    expect(getNestedValue(obj, 'result.violations.errors')).toBe(5);
  });

  it('should return undefined for missing property', () => {
    expect(getNestedValue(obj, 'nonexistent')).toBeUndefined();
    expect(getNestedValue(obj, 'result.missing.path')).toBeUndefined();
  });
});

describe('selectScenario', () => {
  const template: WorkflowTemplate = {
    version: '1.0.0',
    canvas: 'test.otel.canvas',
    name: 'Test Template',
    description: 'Test template for scenario selection',
    scenarioSelection: 'first-match',
    scenarios: [
      {
        id: 'error',
        priority: 1,
        description: 'Error occurred',
        template: {
          introduction: 'Error scenario',
          events: {
            'rule.error': 'Error: {{span.name}}',
          },
        },
      },
      {
        id: 'complete',
        priority: 2,
        description: 'Conversion complete',
        template: {
          introduction: 'Complete scenario',
          events: {
            'conversion.started': 'Started',
            'conversion.complete': 'Complete',
          },
        },
      },
      {
        id: 'partial',
        priority: 3,
        description: 'Partially complete',
        template: {
          introduction: 'Partial scenario',
          events: {
            'conversion.started': 'Started',
          },
        },
      },
      {
        id: 'catch-all',
        priority: 99,
        description: 'Fallback',
        template: {
          introduction: 'Fallback scenario',
          events: {}, // No required events (catch-all)
        },
      },
    ],
  };

  it('should return all full matches sorted by priority', () => {
    const events: OtelEvent[] = [
      { name: 'conversion.started', timestamp: 0 },
      { name: 'conversion.complete', timestamp: 100 },
    ];
    const result = selectScenario(template, events);

    // Both 'complete' and 'partial' should match fully
    expect(result.fullMatches.length).toBe(2);
    expect(result.fullMatches[0].scenario.id).toBe('complete'); // Priority 2
    expect(result.fullMatches[1].scenario.id).toBe('partial'); // Priority 3
    expect(result.fullMatches[0].isFullMatch).toBe(true);
    expect(result.fullMatches[0].matchPercentage).toBe(100);
  });

  it('should recommend highest priority full match', () => {
    const events: OtelEvent[] = [
      { name: 'conversion.started', timestamp: 0 },
      { name: 'conversion.complete', timestamp: 100 },
    ];
    const result = selectScenario(template, events);

    expect(result.recommendedScenario).not.toBeNull();
    expect(result.recommendedScenario?.scenario.id).toBe('complete');
    expect(result.recommendedScenario?.isFullMatch).toBe(true);
  });

  it('should return partial matches when no full match exists', () => {
    const events: OtelEvent[] = [{ name: 'conversion.started', timestamp: 0 }];
    const result = selectScenario(template, events);

    // Only 'partial' matches fully
    expect(result.fullMatches.length).toBe(1);
    expect(result.fullMatches[0].scenario.id).toBe('partial');

    // Partial matches: 'complete' (50%), 'error' (0%), 'catch-all' (0%)
    expect(result.partialMatches.length).toBe(3);
    // Should be sorted by percentage descending, then priority ascending
    expect(result.partialMatches[0].scenario.id).toBe('complete'); // 50%
    expect(result.partialMatches[0].matchPercentage).toBe(50);
  });

  it('should include detailed match information', () => {
    const events: OtelEvent[] = [{ name: 'conversion.started', timestamp: 0 }];
    const result = selectScenario(template, events);

    const partialMatch = result.partialMatches.find((m) => m.scenario.id === 'complete');
    expect(partialMatch).toBeDefined();
    expect(partialMatch?.matchedEventNames).toEqual(['conversion.started']);
    expect(partialMatch?.missingEventNames).toEqual(['conversion.complete']);
    expect(partialMatch?.matchedEventCount).toBe(1);
    expect(partialMatch?.totalRequiredEvents).toBe(2);
  });

  it('should handle catch-all scenarios (zero required events)', () => {
    const events: OtelEvent[] = [{ name: 'unknown.event', timestamp: 0 }];
    const result = selectScenario(template, events);

    // No full matches - all scenarios should be partial
    expect(result.fullMatches.length).toBe(0);

    // Catch-all should be in partial matches
    const catchAll = result.partialMatches.find((m) => m.scenario.id === 'catch-all');
    expect(catchAll).toBeDefined();
    expect(catchAll?.isCatchAll).toBe(true);
    expect(catchAll?.matchPercentage).toBe(0);
    expect(catchAll?.totalRequiredEvents).toBe(0);
  });

  it('should return null when no scenarios exist', () => {
    const emptyTemplate: WorkflowTemplate = {
      ...template,
      scenarios: [],
    };
    const events: OtelEvent[] = [{ name: 'test', timestamp: 0 }];
    const result = selectScenario(emptyTemplate, events);

    expect(result.fullMatches.length).toBe(0);
    expect(result.partialMatches.length).toBe(0);
    expect(result.recommendedScenario).toBeNull();
  });
});

describe('computeAggregates', () => {
  const events: OtelEvent[] = [
    { name: 'conversion.started', timestamp: 0, type: 'span' },
    { name: 'conversion.complete', timestamp: 100, type: 'span', attributes: { 'result.nodes.count': 12 } },
    { name: 'log.info', timestamp: 25, type: 'log', severityNumber: 9 },
    { name: 'log.error', timestamp: 75, type: 'log', severityNumber: 17 },
    { name: 'log.debug', timestamp: 50, type: 'log', severityNumber: 5 },
  ];

  it('should count total events', () => {
    const aggregates = computeAggregates(events);
    expect(aggregates['events.count']).toBe(5);
    expect(aggregates['events.length']).toBe(5);
  });

  it('should count spans', () => {
    const aggregates = computeAggregates(events);
    expect(aggregates['spans.count']).toBe(2);
  });

  it('should count logs by severity', () => {
    const aggregates = computeAggregates(events);
    expect(aggregates['logs.count']).toBe(3);
    expect(aggregates['errorLogs.count']).toBe(1);
    expect(aggregates['debugLogs.count']).toBe(1);
  });

  it('should extract common attributes', () => {
    const aggregates = computeAggregates(events);
    expect(aggregates['result.nodes.count']).toBe(12);
  });

  it('should handle empty events', () => {
    const aggregates = computeAggregates([]);
    expect(aggregates['events.count']).toBe(0);
    expect(aggregates['spans.count']).toBe(0);
    expect(aggregates['logs.count']).toBe(0);
  });
});
