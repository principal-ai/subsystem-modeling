import { describe, it, expect } from 'bun:test';
import { groupSpansByTrace } from './traceAggregation';
import type { OtelResourceSpansData } from '../types/otel';

describe('groupSpansByTrace', () => {
  it('should group spans by trace ID', () => {
    const resourceSpans: OtelResourceSpansData[] = [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'checkout-api' } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'test-tracer', version: '1.0.0' },
            spans: [
              {
                traceId: 'trace1',
                spanId: 'span1',
                name: 'GET /api/checkout',
                kind: 2,
                startTimeUnixNano: '1737835200000000000',
                endTimeUnixNano: '1737835200100000000',
                attributes: [],
                events: [],
                status: { code: 1 },
              },
              {
                traceId: 'trace1',
                spanId: 'span2',
                parentSpanId: 'span1',
                name: 'query database',
                kind: 3,
                startTimeUnixNano: '1737835200010000000',
                endTimeUnixNano: '1737835200090000000',
                attributes: [],
                events: [],
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ];

    const traces = groupSpansByTrace(resourceSpans);

    expect(traces).toHaveLength(1);
    expect(traces[0].traceId).toBe('trace1');
    expect(traces[0].spanCount).toBe(2);
    expect(traces[0].name).toBe('GET /api/checkout'); // root span name
  });

  it('should calculate trace duration correctly', () => {
    const resourceSpans: OtelResourceSpansData[] = [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'api' } }],
        },
        scopeSpans: [
          {
            scope: { name: 'test', version: '1.0.0' },
            spans: [
              {
                traceId: 'trace1',
                spanId: 'span1',
                name: 'operation',
                kind: 2,
                startTimeUnixNano: '1000000000000', // 1000ms = 1 second
                endTimeUnixNano: '1000100000000', // 100ms later
                attributes: [],
                events: [],
                status: { code: 1 },
              },
              {
                traceId: 'trace1',
                spanId: 'span2',
                name: 'operation2',
                kind: 2,
                startTimeUnixNano: '1000050000000', // 50ms after start
                endTimeUnixNano: '1000200000000', // 200ms after start
                attributes: [],
                events: [],
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ];

    const traces = groupSpansByTrace(resourceSpans);

    expect(traces[0].startTime).toBe(1000000); // earliest start
    expect(traces[0].duration).toBe(200); // 200ms duration
  });

  it('should detect errors in traces', () => {
    const resourceSpans: OtelResourceSpansData[] = [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'api' } }],
        },
        scopeSpans: [
          {
            scope: { name: 'test', version: '1.0.0' },
            spans: [
              {
                traceId: 'trace1',
                spanId: 'span1',
                name: 'success',
                kind: 2,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
                attributes: [],
                events: [],
                status: { code: 1 }, // OK
              },
              {
                traceId: 'trace1',
                spanId: 'span2',
                name: 'error',
                kind: 2,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
                attributes: [],
                events: [],
                status: { code: 2 }, // ERROR
              },
            ],
          },
        ],
      },
    ];

    const traces = groupSpansByTrace(resourceSpans);

    expect(traces[0].hasErrors).toBe(true);
  });

  it('should extract service names from resources', () => {
    const resourceSpans: OtelResourceSpansData[] = [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'checkout-api' } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'test', version: '1.0.0' },
            spans: [
              {
                traceId: 'trace1',
                spanId: 'span1',
                name: 'op1',
                kind: 2,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
                attributes: [],
                events: [],
                status: { code: 1 },
              },
            ],
          },
        ],
      },
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'payment-service' } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'test', version: '1.0.0' },
            spans: [
              {
                traceId: 'trace1',
                spanId: 'span2',
                name: 'op2',
                kind: 3,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
                attributes: [],
                events: [],
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ];

    const traces = groupSpansByTrace(resourceSpans);

    expect(traces[0].serviceNames).toContain('checkout-api');
    expect(traces[0].serviceNames).toContain('payment-service');
    expect(traces[0].serviceNames).toHaveLength(2);
  });

  it('should extract workflow matching metadata', () => {
    const resourceSpans: OtelResourceSpansData[] = [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'api' } },
            { key: 'pv.storyboard.id', value: { stringValue: 'storyboard-1' } },
            {
              key: 'pv.storyboard.name',
              value: { stringValue: 'Checkout Flow' },
            },
            { key: 'pv.workflow.id', value: { stringValue: 'workflow-1' } },
            { key: 'pv.workflow.name', value: { stringValue: 'Happy Path' } },
            { key: 'pv.scenario.id', value: { stringValue: 'scenario-1' } },
            {
              key: 'pv.scenario.name',
              value: { stringValue: 'Successful Payment' },
            },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'test', version: '1.0.0' },
            spans: [
              {
                traceId: 'trace1',
                spanId: 'span1',
                name: 'operation',
                kind: 2,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
                attributes: [],
                events: [],
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ];

    const traces = groupSpansByTrace(resourceSpans);

    expect(traces[0].matchedWorkflow).toBeDefined();
    expect(traces[0].matchedWorkflow?.storyboardId).toBe('storyboard-1');
    expect(traces[0].matchedWorkflow?.storyboardName).toBe('Checkout Flow');
    expect(traces[0].matchedWorkflow?.workflowId).toBe('workflow-1');
    expect(traces[0].matchedWorkflow?.workflowName).toBe('Happy Path');
    expect(traces[0].matchedWorkflow?.scenarioId).toBe('scenario-1');
    expect(traces[0].matchedWorkflow?.scenarioName).toBe('Successful Payment');
  });

  it('should not extract workflow metadata if storyboard fields are missing', () => {
    const resourceSpans: OtelResourceSpansData[] = [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'api' } },
            { key: 'pv.workflow.id', value: { stringValue: 'workflow-1' } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'test', version: '1.0.0' },
            spans: [
              {
                traceId: 'trace1',
                spanId: 'span1',
                name: 'operation',
                kind: 2,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
                attributes: [],
                events: [],
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ];

    const traces = groupSpansByTrace(resourceSpans);

    expect(traces[0].matchedWorkflow).toBeUndefined();
  });

  it('should handle multiple traces', () => {
    const resourceSpans: OtelResourceSpansData[] = [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'api' } }],
        },
        scopeSpans: [
          {
            scope: { name: 'test', version: '1.0.0' },
            spans: [
              {
                traceId: 'trace1',
                spanId: 'span1',
                name: 'op1',
                kind: 2,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
                attributes: [],
                events: [],
                status: { code: 1 },
              },
              {
                traceId: 'trace2',
                spanId: 'span2',
                name: 'op2',
                kind: 2,
                startTimeUnixNano: '3000000000',
                endTimeUnixNano: '4000000000',
                attributes: [],
                events: [],
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ];

    const traces = groupSpansByTrace(resourceSpans);

    expect(traces).toHaveLength(2);
    // Should be sorted by start time (newest first)
    expect(traces[0].traceId).toBe('trace2');
    expect(traces[1].traceId).toBe('trace1');
  });

  it('should handle empty resource spans', () => {
    const traces = groupSpansByTrace([]);
    expect(traces).toEqual([]);
  });

  it('should identify root span correctly', () => {
    const resourceSpans: OtelResourceSpansData[] = [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'api' } }],
        },
        scopeSpans: [
          {
            scope: { name: 'test', version: '1.0.0' },
            spans: [
              {
                traceId: 'trace1',
                spanId: 'span2',
                parentSpanId: 'span1',
                name: 'child operation',
                kind: 3,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
                attributes: [],
                events: [],
                status: { code: 1 },
              },
              {
                traceId: 'trace1',
                spanId: 'span1',
                name: 'root operation',
                kind: 2,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '3000000000',
                attributes: [],
                events: [],
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ];

    const traces = groupSpansByTrace(resourceSpans);

    expect(traces[0].name).toBe('root operation');
    expect(traces[0].rootSpanId).toBe('span1');
  });
});
