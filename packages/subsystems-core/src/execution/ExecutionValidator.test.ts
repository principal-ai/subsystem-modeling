import { describe, expect, test } from 'bun:test';
import { ExecutionValidator, convertOtlpToExecutionData } from './ExecutionValidator';
import type { OtlpData, ExecutionData } from './ExecutionValidator';

describe('ExecutionValidator - OTLP Format', () => {
  const validator = new ExecutionValidator();

  test('validates OTLP format with valid data', () => {
    const otlpData: OtlpData = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: 'test-service' },
              },
            ],
            droppedAttributesCount: 0,
          },
          scopeSpans: [
            {
              scope: {
                name: 'test-tracer',
                version: '1.0.0',
              },
              spans: [
                {
                  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
                  spanId: '00f067aa0ba902b7',
                  name: 'test.operation',
                  kind: 1,
                  startTimeUnixNano: '1703548800000000000',
                  endTimeUnixNano: '1703548800050000000',
                  attributes: [
                    {
                      key: 'test.attribute',
                      value: { stringValue: 'test-value' },
                    },
                  ],
                  events: [
                    {
                      timeUnixNano: '1703548800025000000',
                      name: 'test.event',
                      attributes: [
                        {
                          key: 'event.type',
                          value: { stringValue: 'milestone' },
                        },
                      ],
                    },
                  ],
                  status: {
                    code: 1, // OK
                  },
                  droppedAttributesCount: 0,
                  droppedEventsCount: 0,
                  droppedLinksCount: 0,
                  links: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = validator.validate(otlpData);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('validates real OTLP file from add-skill project', () => {
    const otlpData: OtlpData = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: 'add-skill-tests' },
              },
            ],
            droppedAttributesCount: 0,
          },
          scopeSpans: [
            {
              scope: {
                name: 'add-skill-test-tracer',
                version: '1.0.0',
              },
              spans: [
                {
                  traceId: '4941b8042b7aae58f1ccb527f3363453',
                  spanId: '056fdd304e355559',
                  name: 'test: successful-installation-github-shorthand',
                  kind: 0,
                  startTimeUnixNano: '1769059725997000000',
                  endTimeUnixNano: '1769059725997303600',
                  attributes: [],
                  events: [
                    {
                      timeUnixNano: '1769059725997162800',
                      name: 'installation.started',
                      attributes: [
                        {
                          key: 'source',
                          value: { stringValue: 'vercel-labs/agent-skills' },
                        },
                        {
                          key: 'source.type',
                          value: { stringValue: 'github' },
                        },
                        {
                          key: 'has.subpath',
                          value: { boolValue: false },
                        },
                      ],
                    },
                  ],
                  status: {
                    code: 1,
                  },
                  droppedAttributesCount: 0,
                  droppedEventsCount: 0,
                  droppedLinksCount: 0,
                  links: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = validator.validate(otlpData);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects invalid data structure', () => {
    const invalidData = { invalid: 'structure' };

    const result = validator.validate(invalidData);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('rejects array instead of object', () => {
    const invalidData = [];

    const result = validator.validate(invalidData);

    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('should be an object, not an array');
  });
});

describe('convertOtlpToExecutionData', () => {
  test('converts OTLP format to ExecutionData format', () => {
    const otlpData: OtlpData = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: 'my-service' },
              },
            ],
            droppedAttributesCount: 0,
          },
          scopeSpans: [
            {
              scope: {
                name: 'my-tracer',
                version: '2.0.0',
              },
              spans: [
                {
                  traceId: 'abc123',
                  spanId: 'def456',
                  name: 'operation',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  attributes: [
                    {
                      key: 'string.attr',
                      value: { stringValue: 'hello' },
                    },
                    {
                      key: 'int.attr',
                      value: { intValue: 42 },
                    },
                    {
                      key: 'bool.attr',
                      value: { boolValue: true },
                    },
                    {
                      key: 'double.attr',
                      value: { doubleValue: 3.14 },
                    },
                  ],
                  events: [
                    {
                      timeUnixNano: '1500000000',
                      name: 'my.event',
                      attributes: [
                        {
                          key: 'event.data',
                          value: { stringValue: 'data' },
                        },
                      ],
                    },
                  ],
                  status: {
                    code: 1, // OK
                  },
                  droppedAttributesCount: 0,
                  droppedEventsCount: 0,
                  droppedLinksCount: 0,
                  links: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const result: ExecutionData = convertOtlpToExecutionData(otlpData);

    // Check metadata
    expect(result.metadata?.serviceName).toBe('my-service');
    expect(result.metadata?.scopeName).toBe('my-tracer');
    expect(result.metadata?.scopeVersion).toBe('2.0.0');
    expect(result.metadata?.exportedAt).toBeDefined();

    // Check spans
    expect(result.spans).toHaveLength(1);

    const span = result.spans[0];
    expect(span.id).toBe('def456');
    expect(span.name).toBe('operation');
    expect(span.traceId).toBe('abc123');
    expect(span.status).toBe('OK');

    // Check attribute conversion
    expect(span.attributes?.['string.attr']).toBe('hello');
    expect(span.attributes?.['int.attr']).toBe(42);
    expect(span.attributes?.['bool.attr']).toBe(true);
    expect(span.attributes?.['double.attr']).toBe(3.14);

    // Check events
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('my.event');
    expect(span.events[0].attributes['event.data']).toBe('data');

    // Check timestamps (nanoseconds to milliseconds)
    // 1000000000 ns = 1000 ms, 2000000000 ns = 2000 ms
    expect(span.startTime).toBe(1000);
    expect(span.endTime).toBe(2000);
    expect(span.duration).toBe(1000);
  });

  test('converts multiple spans across resources and scopes', () => {
    const otlpData: OtlpData = {
      resourceSpans: [
        {
          resource: {
            attributes: [],
            droppedAttributesCount: 0,
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'trace1',
                  spanId: 'span1',
                  name: 'op1',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  attributes: [],
                  events: [],
                  status: { code: 1 },
                  droppedAttributesCount: 0,
                  droppedEventsCount: 0,
                  droppedLinksCount: 0,
                  links: [],
                },
                {
                  traceId: 'trace1',
                  spanId: 'span2',
                  parentSpanId: 'span1',
                  name: 'op2',
                  kind: 1,
                  startTimeUnixNano: '1500000000',
                  endTimeUnixNano: '1800000000',
                  attributes: [],
                  events: [],
                  status: { code: 1 },
                  droppedAttributesCount: 0,
                  droppedEventsCount: 0,
                  droppedLinksCount: 0,
                  links: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = convertOtlpToExecutionData(otlpData);

    expect(result.spans).toHaveLength(2);
    expect(result.spans[0].id).toBe('span1');
    expect(result.spans[1].id).toBe('span2');
    expect(result.spans[1].parentSpanId).toBe('span1');
  });

  test('handles ERROR status code', () => {
    const otlpData: OtlpData = {
      resourceSpans: [
        {
          resource: {
            attributes: [],
            droppedAttributesCount: 0,
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'trace1',
                  spanId: 'span1',
                  name: 'failed-op',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  attributes: [],
                  events: [],
                  status: {
                    code: 2, // ERROR
                    message: 'Operation failed',
                  },
                  droppedAttributesCount: 0,
                  droppedEventsCount: 0,
                  droppedLinksCount: 0,
                  links: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = convertOtlpToExecutionData(otlpData);

    expect(result.spans[0].status).toBe('ERROR');
  });

  test('handles empty resourceSpans', () => {
    const otlpData: OtlpData = {
      resourceSpans: [],
    };

    const result = convertOtlpToExecutionData(otlpData);

    expect(result.spans).toHaveLength(0);
    expect(result.metadata).toBeDefined();
  });

  test('calculates overall execution time range', () => {
    const otlpData: OtlpData = {
      resourceSpans: [
        {
          resource: {
            attributes: [],
            droppedAttributesCount: 0,
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'trace1',
                  spanId: 'span1',
                  name: 'early-op',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  attributes: [],
                  events: [],
                  status: { code: 1 },
                  droppedAttributesCount: 0,
                  droppedEventsCount: 0,
                  droppedLinksCount: 0,
                  links: [],
                },
                {
                  traceId: 'trace1',
                  spanId: 'span2',
                  name: 'late-op',
                  kind: 1,
                  startTimeUnixNano: '5000000000',
                  endTimeUnixNano: '10000000000',
                  attributes: [],
                  events: [],
                  status: { code: 1 },
                  droppedAttributesCount: 0,
                  droppedEventsCount: 0,
                  droppedLinksCount: 0,
                  links: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = convertOtlpToExecutionData(otlpData);

    // 1000000000 ns = 1000 ms, 10000000000 ns = 10000 ms
    expect(result.metadata?.startTime).toBe(1000); // min start
    expect(result.metadata?.endTime).toBe(10000); // max end
  });

  test('handles complex nested attribute values', () => {
    const otlpData: OtlpData = {
      resourceSpans: [
        {
          resource: {
            attributes: [],
            droppedAttributesCount: 0,
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'trace1',
                  spanId: 'span1',
                  name: 'complex-op',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  attributes: [
                    {
                      key: 'array.attr',
                      value: {
                        arrayValue: {
                          values: [
                            { stringValue: 'a' },
                            { stringValue: 'b' },
                            { intValue: 123 },
                          ],
                        },
                      },
                    },
                    {
                      key: 'nested.object',
                      value: {
                        kvlistValue: {
                          values: [
                            {
                              key: 'nested.key',
                              value: { stringValue: 'nested.value' },
                            },
                          ],
                        },
                      },
                    },
                  ],
                  events: [],
                  status: { code: 1 },
                  droppedAttributesCount: 0,
                  droppedEventsCount: 0,
                  droppedLinksCount: 0,
                  links: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = convertOtlpToExecutionData(otlpData);

    const attrs = result.spans[0].attributes;
    expect(Array.isArray(attrs?.['array.attr'])).toBe(true);
    expect((attrs?.['array.attr'] as unknown[])).toEqual(['a', 'b', 123]);

    expect(typeof attrs?.['nested.object']).toBe('object');
    expect((attrs?.['nested.object'] as Record<string, unknown>)['nested.key']).toBe('nested.value');
  });
});
