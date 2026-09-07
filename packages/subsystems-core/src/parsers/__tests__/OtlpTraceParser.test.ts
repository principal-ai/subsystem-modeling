/**
 * Tests for OtlpTraceParser
 */

import { describe, it, expect } from 'bun:test';
import { OtlpTraceParser } from '../OtlpTraceParser';
import type { OtelExportTraceServiceRequest } from '../../types/otel';

describe('OtlpTraceParser', () => {
  const parser = new OtlpTraceParser();

  // Sample OTLP trace with multiple scopes
  const sampleTrace: OtelExportTraceServiceRequest = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'web-ade' } },
            { key: 'dev.server.url', value: { stringValue: 'http://localhost:3000' } },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: 'web-ade-instrumentation',
              version: '1.0.0',
            },
            spans: [
              {
                traceId: 'trace123',
                spanId: 'span1',
                name: 'handleCheckout',
                kind: 1,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
                attributes: [
                  { key: 'http.method', value: { stringValue: 'POST' } },
                ],
                events: [
                  {
                    timeUnixNano: '1500000000',
                    name: 'checkout.started',
                    attributes: [],
                  },
                ],
                status: { code: 0 },
              },
            ],
          },
          {
            scope: {
              name: 'auth-library',
              version: '2.1.0',
            },
            spans: [
              {
                traceId: 'trace123',
                spanId: 'span2',
                name: 'checkPermissions',
                kind: 1,
                startTimeUnixNano: '1200000000',
                endTimeUnixNano: '1800000000',
                attributes: [],
                events: [],
                status: { code: 0 },
              },
            ],
          },
        ],
      },
    ],
  };

  describe('extractResources', () => {
    it('should extract all resources with scopes', () => {
      const resources = parser.extractResources(sampleTrace);

      expect(resources).toHaveLength(1);
      expect(resources[0].serviceName).toBe('web-ade');
      expect(resources[0].serviceIdentifier).toBe('http://localhost:3000');
      expect(resources[0].scopes).toHaveLength(2);
    });

    it('should extract scope information correctly', () => {
      const resources = parser.extractResources(sampleTrace);
      const scopes = resources[0].scopes;

      expect(scopes[0].scope.name).toBe('web-ade-instrumentation');
      expect(scopes[0].scope.version).toBe('1.0.0');
      expect(scopes[0].spanIds).toEqual(['span1']);

      expect(scopes[1].scope.name).toBe('auth-library');
      expect(scopes[1].scope.version).toBe('2.1.0');
      expect(scopes[1].spanIds).toEqual(['span2']);
    });
  });

  describe('getSpansForScope', () => {
    it('should get spans for a specific scope', () => {
      const spans = parser.getSpansForScope(sampleTrace, 'web-ade-instrumentation');

      expect(spans).toHaveLength(1);
      expect(spans[0].spanName).toBe('handleCheckout');
      expect(spans[0].scopeName).toBe('web-ade-instrumentation');
    });

    it('should extract span events', () => {
      const spans = parser.getSpansForScope(sampleTrace, 'web-ade-instrumentation');

      expect(spans[0].events).toHaveLength(1);
      expect(spans[0].events[0].name).toBe('checkout.started');
    });

    it('should convert timestamps from nano to millis', () => {
      const spans = parser.getSpansForScope(sampleTrace, 'web-ade-instrumentation');

      expect(spans[0].startTime).toBe(1000); // 1000000000 / 1000000
      expect(spans[0].endTime).toBe(2000);
      expect(spans[0].duration).toBe(1000);
    });
  });

  describe('extractTraceInfo', () => {
    it('should extract basic trace information', () => {
      const info = parser.extractTraceInfo(sampleTrace);

      expect(info.traceId).toBe('trace123');
      expect(info.name).toBe('handleCheckout'); // First span
      expect(info.spanCount).toBe(2);
      expect(info.hasErrors).toBe(false);
    });
  });

  describe('convertAttributes', () => {
    it('should convert OTLP attributes to key-value record', () => {
      const attrs = [
        { key: 'string', value: { stringValue: 'hello' } },
        { key: 'int', value: { intValue: 42 } },
        { key: 'bool', value: { boolValue: true } },
      ];

      const result = parser.convertAttributes(attrs);

      expect(result).toEqual({
        string: 'hello',
        int: 42,
        bool: true,
      });
    });
  });

  describe('isLocalDevelopment', () => {
    it('should detect dev.mode flag', () => {
      const devTrace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'dev.mode', value: { boolValue: true } },
              ],
            },
            scopeSpans: [],
          },
        ],
      };

      expect(parser.isLocalDevelopment(devTrace)).toBe(true);
    });

    it('should detect dev version patterns', () => {
      const devTrace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [],
            },
            scopeSpans: [
              {
                scope: {
                  name: 'test-service',
                  version: '0.0.0-dev',
                },
                spans: [],
              },
            ],
          },
        ],
      };

      expect(parser.isLocalDevelopment(devTrace)).toBe(true);
    });

    it('should return false for production traces', () => {
      expect(parser.isLocalDevelopment(sampleTrace)).toBe(false);
    });
  });
});
