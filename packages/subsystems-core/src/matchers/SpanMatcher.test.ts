import { describe, it, expect } from 'bun:test';
import { SpanMatcher } from './SpanMatcher';
import type { ExtendedCanvas } from '../types/canvas';
import type { OtelSpanData, OtelResourceData } from '../types/otel';

describe('SpanMatcher', () => {
  describe('exact span name matching', () => {
    it('should match exact span names', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  name: 'validateUser',
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const span: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'validateUser',
        kind: 2,
        startTimeUnixNano: '1000000000000', // 1000ms = 1 second in nanoseconds
        endTimeUnixNano: '1000100000000', // 100ms later
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      const result = matcher.matchSpan(span, resource);

      expect(result.matchedNodeIds).toContain('node1');
      expect(result.duration).toBe(100); // 100ms
      expect(result.timestamp).toBe(1000000); // 1000 seconds
    });

    it('should not match different span names', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  name: 'validateUser',
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const span: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'differentOperation',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      const result = matcher.matchSpan(span, resource);

      expect(result.matchedNodeIds).toEqual([]);
    });
  });

  describe('glob pattern matching', () => {
    it('should match glob patterns in span names', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  name: 'GET /api/*',
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const span1: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'GET /api/users',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const span2: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span2',
        name: 'GET /api/products',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const span3: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span3',
        name: 'POST /api/users',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      expect(matcher.matchSpan(span1, resource).matchedNodeIds).toContain(
        'node1'
      );
      expect(matcher.matchSpan(span2, resource).matchedNodeIds).toContain(
        'node1'
      );
      expect(matcher.matchSpan(span3, resource).matchedNodeIds).toEqual([]);
    });

    it('should match wildcard pattern', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  name: '*',
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const span: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'any operation',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      expect(matcher.matchSpan(span, resource).matchedNodeIds).toContain(
        'node1'
      );
    });
  });

  describe('array of span names matching', () => {
    it('should match any of the provided span names', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  name: ['GET /api/users', 'POST /api/users'],
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const span1: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'GET /api/users',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const span2: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span2',
        name: 'POST /api/users',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const span3: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span3',
        name: 'DELETE /api/users',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      expect(matcher.matchSpan(span1, resource).matchedNodeIds).toContain(
        'node1'
      );
      expect(matcher.matchSpan(span2, resource).matchedNodeIds).toContain(
        'node1'
      );
      expect(matcher.matchSpan(span3, resource).matchedNodeIds).toEqual([]);
    });
  });

  describe('span kind matching', () => {
    it('should match span kind', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  kind: 'SPAN_KIND_SERVER',
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const serverSpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'operation',
        kind: 2, // SERVER
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const clientSpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span2',
        name: 'operation',
        kind: 3, // CLIENT
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      expect(matcher.matchSpan(serverSpan, resource).matchedNodeIds).toContain(
        'node1'
      );
      expect(matcher.matchSpan(clientSpan, resource).matchedNodeIds).toEqual(
        []
      );
    });

    it('should match multiple span kinds', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  kind: ['SPAN_KIND_SERVER', 'SPAN_KIND_CLIENT'],
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const serverSpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'operation',
        kind: 2, // SERVER
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const clientSpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span2',
        name: 'operation',
        kind: 3, // CLIENT
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const internalSpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span3',
        name: 'operation',
        kind: 1, // INTERNAL
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      expect(matcher.matchSpan(serverSpan, resource).matchedNodeIds).toContain(
        'node1'
      );
      expect(matcher.matchSpan(clientSpan, resource).matchedNodeIds).toContain(
        'node1'
      );
      expect(matcher.matchSpan(internalSpan, resource).matchedNodeIds).toEqual(
        []
      );
    });
  });

  describe('span attributes matching', () => {
    it('should match span attributes', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  attributes: {
                    'http.method': 'GET',
                    'http.route': '/api/users',
                  },
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const matchingSpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'operation',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [
          { key: 'http.method', value: { stringValue: 'GET' } },
          { key: 'http.route', value: { stringValue: '/api/users' } },
        ],
        events: [],
        status: { code: 1 },
      };

      const nonMatchingSpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span2',
        name: 'operation',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [
          { key: 'http.method', value: { stringValue: 'POST' } },
          { key: 'http.route', value: { stringValue: '/api/users' } },
        ],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      expect(
        matcher.matchSpan(matchingSpan, resource).matchedNodeIds
      ).toContain('node1');
      expect(
        matcher.matchSpan(nonMatchingSpan, resource).matchedNodeIds
      ).toEqual([]);
    });

    it('should match wildcard attribute values', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  attributes: {
                    'db.system': 'postgresql',
                    'db.operation': '*', // Any operation
                  },
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const querySpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'db query',
        kind: 3,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [
          { key: 'db.system', value: { stringValue: 'postgresql' } },
          { key: 'db.operation', value: { stringValue: 'SELECT' } },
        ],
        events: [],
        status: { code: 1 },
      };

      const insertSpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span2',
        name: 'db insert',
        kind: 3,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [
          { key: 'db.system', value: { stringValue: 'postgresql' } },
          { key: 'db.operation', value: { stringValue: 'INSERT' } },
        ],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      expect(matcher.matchSpan(querySpan, resource).matchedNodeIds).toContain(
        'node1'
      );
      expect(matcher.matchSpan(insertSpan, resource).matchedNodeIds).toContain(
        'node1'
      );
    });
  });

  describe('span event matching', () => {
    it('should match span events by name', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  event: {
                    name: 'exception',
                  },
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const spanWithException: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'operation',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [
          {
            timeUnixNano: '1500000000',
            name: 'exception',
            attributes: [],
          },
        ],
        status: { code: 2 },
      };

      const spanWithoutException: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span2',
        name: 'operation',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      expect(
        matcher.matchSpan(spanWithException, resource).matchedNodeIds
      ).toContain('node1');
      expect(
        matcher.matchSpan(spanWithoutException, resource).matchedNodeIds
      ).toEqual([]);
    });

    it('should match span events by attributes', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  event: {
                    name: 'exception',
                    attributes: {
                      'exception.type': 'ValidationError',
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const matchingSpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'operation',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [
          {
            timeUnixNano: '1500000000',
            name: 'exception',
            attributes: [
              {
                key: 'exception.type',
                value: { stringValue: 'ValidationError' },
              },
            ],
          },
        ],
        status: { code: 2 },
      };

      const nonMatchingSpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span2',
        name: 'operation',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [
          {
            timeUnixNano: '1500000000',
            name: 'exception',
            attributes: [
              {
                key: 'exception.type',
                value: { stringValue: 'DatabaseError' },
              },
            ],
          },
        ],
        status: { code: 2 },
      };

      const resource: OtelResourceData = { attributes: [] };

      expect(
        matcher.matchSpan(matchingSpan, resource).matchedNodeIds
      ).toContain('node1');
      expect(
        matcher.matchSpan(nonMatchingSpan, resource).matchedNodeIds
      ).toEqual([]);
    });
  });

  describe('resource matching', () => {
    it('should match resource attributes', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                resourceMatch: {
                  'service.name': 'checkout-api',
                  'deployment.environment': 'production',
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const span: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'operation',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const matchingResource: OtelResourceData = {
        attributes: [
          { key: 'service.name', value: { stringValue: 'checkout-api' } },
          {
            key: 'deployment.environment',
            value: { stringValue: 'production' },
          },
        ],
      };

      const nonMatchingResource: OtelResourceData = {
        attributes: [
          { key: 'service.name', value: { stringValue: 'other-service' } },
          {
            key: 'deployment.environment',
            value: { stringValue: 'production' },
          },
        ],
      };

      expect(
        matcher.matchSpan(span, matchingResource).matchedNodeIds
      ).toContain('node1');
      expect(
        matcher.matchSpan(span, nonMatchingResource).matchedNodeIds
      ).toEqual([]);
    });

    it('should match resource attribute wildcards', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                resourceMatch: {
                  'service.name': '*-api',
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const span: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'operation',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const resource1: OtelResourceData = {
        attributes: [
          { key: 'service.name', value: { stringValue: 'checkout-api' } },
        ],
      };

      const resource2: OtelResourceData = {
        attributes: [
          { key: 'service.name', value: { stringValue: 'payment-api' } },
        ],
      };

      const resource3: OtelResourceData = {
        attributes: [
          { key: 'service.name', value: { stringValue: 'frontend-app' } },
        ],
      };

      expect(matcher.matchSpan(span, resource1).matchedNodeIds).toContain(
        'node1'
      );
      expect(matcher.matchSpan(span, resource2).matchedNodeIds).toContain(
        'node1'
      );
      expect(matcher.matchSpan(span, resource3).matchedNodeIds).toEqual([]);
    });
  });

  describe('combined matching (resource AND span)', () => {
    it('should require both resource and span match', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                resourceMatch: {
                  'service.name': 'checkout-api',
                },
                spanMatch: {
                  name: 'POST /checkout',
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const matchingResource: OtelResourceData = {
        attributes: [
          { key: 'service.name', value: { stringValue: 'checkout-api' } },
        ],
      };

      const nonMatchingResource: OtelResourceData = {
        attributes: [
          { key: 'service.name', value: { stringValue: 'payment-api' } },
        ],
      };

      const matchingSpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'POST /checkout',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const nonMatchingSpan: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span2',
        name: 'GET /products',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      // Both resource and span match
      expect(
        matcher.matchSpan(matchingSpan, matchingResource).matchedNodeIds
      ).toContain('node1');

      // Resource matches but span doesn't
      expect(
        matcher.matchSpan(nonMatchingSpan, matchingResource).matchedNodeIds
      ).toEqual([]);

      // Span matches but resource doesn't
      expect(
        matcher.matchSpan(matchingSpan, nonMatchingResource).matchedNodeIds
      ).toEqual([]);

      // Neither matches
      expect(
        matcher.matchSpan(nonMatchingSpan, nonMatchingResource).matchedNodeIds
      ).toEqual([]);
    });
  });

  describe('multiple nodes', () => {
    it('should match multiple nodes', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  name: 'GET /api/*',
                },
              },
            },
          },
          {
            id: 'node2',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  kind: 'SPAN_KIND_SERVER',
                },
              },
            },
          },
          {
            id: 'node3',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  name: 'POST /api/*',
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const span: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'GET /api/users',
        kind: 2, // SERVER
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      const result = matcher.matchSpan(span, resource);

      expect(result.matchedNodeIds).toContain('node1');
      expect(result.matchedNodeIds).toContain('node2');
      expect(result.matchedNodeIds).not.toContain('node3');
    });
  });

  describe('getStats', () => {
    it('should return matcher statistics', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                resourceMatch: {
                  'service.name': 'api',
                },
                spanMatch: {
                  name: 'operation',
                },
              },
            },
          },
          {
            id: 'node2',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                spanMatch: {
                  kind: 'SPAN_KIND_SERVER',
                },
              },
            },
          },
          {
            id: 'node3',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pv: {
              otel: {
                resourceMatch: {
                  'service.name': 'other',
                },
              },
            },
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);
      const stats = matcher.getStats();

      expect(stats.totalRules).toBe(3);
      expect(stats.rulesWithResourceMatch).toBe(2);
      expect(stats.rulesWithSpanMatch).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty canvas', () => {
      const canvas: ExtendedCanvas = { nodes: [] };
      const matcher = new SpanMatcher(canvas);

      const span: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'operation',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      expect(matcher.matchSpan(span, resource).matchedNodeIds).toEqual([]);
    });

    it('should handle nodes without otel extension', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        ],
      };

      const matcher = new SpanMatcher(canvas);

      const span: OtelSpanData = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'operation',
        kind: 2,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      const resource: OtelResourceData = { attributes: [] };

      expect(matcher.matchSpan(span, resource).matchedNodeIds).toEqual([]);
    });
  });
});
