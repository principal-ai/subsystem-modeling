import { describe, it, expect } from 'bun:test';
import {
  getAttributeStringValue,
  findAttribute,
  getAttributeValue,
  flattenResourceAttributes,
  parseNanoTime,
  getSpanDuration,
  isErrorSeverity,
  isWarnSeverity,
  type OtelAnyValue,
  type OtelKeyValue,
  type OtelResourceData,
  type OtelSpanData,
} from './otel';

describe('OTEL Helper Functions', () => {
  describe('getAttributeStringValue', () => {
    it('should extract string value', () => {
      const value: OtelAnyValue = { stringValue: 'test' };
      expect(getAttributeStringValue(value)).toBe('test');
    });

    it('should return undefined for non-string values', () => {
      expect(getAttributeStringValue({ intValue: 123 })).toBeUndefined();
      expect(getAttributeStringValue({ boolValue: true })).toBeUndefined();
      expect(getAttributeStringValue({})).toBeUndefined();
    });
  });

  describe('findAttribute', () => {
    const attributes: OtelKeyValue[] = [
      { key: 'service.name', value: { stringValue: 'test-service' } },
      { key: 'http.status_code', value: { intValue: 200 } },
      { key: 'error', value: { boolValue: false } },
    ];

    it('should find attribute by key', () => {
      const attr = findAttribute(attributes, 'service.name');
      expect(attr).toBeDefined();
      expect(attr?.key).toBe('service.name');
      expect(attr?.value.stringValue).toBe('test-service');
    });

    it('should return undefined for missing key', () => {
      expect(findAttribute(attributes, 'missing.key')).toBeUndefined();
    });

    it('should handle undefined attributes array', () => {
      expect(findAttribute(undefined, 'any.key')).toBeUndefined();
    });
  });

  describe('getAttributeValue', () => {
    const attributes: OtelKeyValue[] = [
      { key: 'http.method', value: { stringValue: 'GET' } },
      { key: 'http.status_code', value: { intValue: 200 } },
      { key: 'response.time', value: { doubleValue: 123.45 } },
      { key: 'success', value: { boolValue: true } },
    ];

    it('should get string values', () => {
      expect(getAttributeValue(attributes, 'http.method')).toBe('GET');
    });

    it('should get integer values', () => {
      expect(getAttributeValue(attributes, 'http.status_code')).toBe(200);
    });

    it('should get double values', () => {
      expect(getAttributeValue(attributes, 'response.time')).toBe(123.45);
    });

    it('should get boolean values', () => {
      expect(getAttributeValue(attributes, 'success')).toBe(true);
    });

    it('should return undefined for missing keys', () => {
      expect(getAttributeValue(attributes, 'missing')).toBeUndefined();
    });

    it('should handle undefined attributes array', () => {
      expect(getAttributeValue(undefined, 'any.key')).toBeUndefined();
    });
  });

  describe('flattenResourceAttributes', () => {
    it('should flatten resource attributes to string map', () => {
      const resource: OtelResourceData = {
        attributes: [
          { key: 'service.name', value: { stringValue: 'checkout-api' } },
          { key: 'deployment.environment', value: { stringValue: 'production' } },
          { key: 'service.version', value: { stringValue: '1.2.3' } },
        ],
      };

      const flattened = flattenResourceAttributes(resource);

      expect(flattened).toEqual({
        'service.name': 'checkout-api',
        'deployment.environment': 'production',
        'service.version': '1.2.3',
      });
    });

    it('should skip non-string attributes', () => {
      const resource: OtelResourceData = {
        attributes: [
          { key: 'service.name', value: { stringValue: 'api' } },
          { key: 'port', value: { intValue: 8080 } },
          { key: 'enabled', value: { boolValue: true } },
        ],
      };

      const flattened = flattenResourceAttributes(resource);

      expect(flattened).toEqual({
        'service.name': 'api',
      });
    });

    it('should handle empty attributes', () => {
      const resource: OtelResourceData = { attributes: [] };
      expect(flattenResourceAttributes(resource)).toEqual({});
    });
  });

  describe('parseNanoTime', () => {
    it('should convert nanoseconds to milliseconds (string input)', () => {
      expect(parseNanoTime('1737835200000000000')).toBe(1737835200000);
      expect(parseNanoTime('1000000000')).toBe(1000);
    });

    it('should convert nanoseconds to milliseconds (number input)', () => {
      expect(parseNanoTime(1737835200000000000)).toBe(1737835200000);
      expect(parseNanoTime(1000000000)).toBe(1000);
    });

    it('should handle zero', () => {
      expect(parseNanoTime('0')).toBe(0);
      expect(parseNanoTime(0)).toBe(0);
    });
  });

  describe('getSpanDuration', () => {
    it('should calculate span duration in milliseconds', () => {
      const span: OtelSpanData = {
        traceId: 'abc123',
        spanId: 'span1',
        name: 'test',
        kind: 2,
        startTimeUnixNano: '1737835200000000000',
        endTimeUnixNano: '1737835200150000000', // 150ms later
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      expect(getSpanDuration(span)).toBeCloseTo(150, 0);
    });

    it('should handle zero duration', () => {
      const span: OtelSpanData = {
        traceId: 'abc123',
        spanId: 'span1',
        name: 'test',
        kind: 2,
        startTimeUnixNano: '1737835200000000000',
        endTimeUnixNano: '1737835200000000000',
        attributes: [],
        events: [],
        status: { code: 1 },
      };

      expect(getSpanDuration(span)).toBe(0);
    });
  });

  describe('isErrorSeverity', () => {
    it('should detect ERROR severity text', () => {
      expect(isErrorSeverity('ERROR')).toBe(true);
      expect(isErrorSeverity('FATAL')).toBe(true);
    });

    it('should detect ERROR severity numbers', () => {
      expect(isErrorSeverity(17)).toBe(true);
      expect(isErrorSeverity(20)).toBe(true);
      expect(isErrorSeverity(24)).toBe(true);
    });

    it('should not detect non-error severities', () => {
      expect(isErrorSeverity('INFO')).toBe(false);
      expect(isErrorSeverity('WARN')).toBe(false);
      expect(isErrorSeverity('DEBUG')).toBe(false);
      expect(isErrorSeverity(12)).toBe(false);
      expect(isErrorSeverity(undefined)).toBe(false);
    });
  });

  describe('isWarnSeverity', () => {
    it('should detect WARN severity text', () => {
      expect(isWarnSeverity('WARN')).toBe(true);
    });

    it('should detect WARN severity numbers', () => {
      expect(isWarnSeverity(13)).toBe(true);
      expect(isWarnSeverity(14)).toBe(true);
      expect(isWarnSeverity(16)).toBe(true);
    });

    it('should not detect non-warn severities', () => {
      expect(isWarnSeverity('INFO')).toBe(false);
      expect(isWarnSeverity('ERROR')).toBe(false);
      expect(isWarnSeverity(12)).toBe(false);
      expect(isWarnSeverity(17)).toBe(false);
      expect(isWarnSeverity(undefined)).toBe(false);
    });
  });
});
