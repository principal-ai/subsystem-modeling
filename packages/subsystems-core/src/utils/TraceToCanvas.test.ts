import { describe, test, expect } from 'bun:test';
import {
  traceToCanvas,
  traceToCanvasJson,
  type TraceExport,
  type TraceSpan,
} from './TraceToCanvas';
import type { ExtendedCanvasTextNode, CanvasGroupNode } from '../types/canvas';

describe('TraceToCanvas', () => {
  const createSpan = (overrides: Partial<TraceSpan> = {}): TraceSpan => ({
    traceId: 'trace-1',
    spanId: 'span-1',
    name: 'test-span',
    kind: 'INTERNAL',
    startTime: 1000,
    endTime: 1050,
    duration: 50,
    resource: { 'service.name': 'test-service' },
    attributes: {},
    status: { code: 'OK' },
    events: [],
    ...overrides,
  });

  const createExport = (spans: TraceSpan[]): TraceExport => ({
    exportedAt: '2025-01-01T00:00:00.000Z',
    serviceName: 'test-service',
    spanCount: spans.length,
    spans,
  });

  describe('basic conversion', () => {
    test('converts single span to canvas', () => {
      const span = createSpan();
      const traceExport = createExport([span]);

      const result = traceToCanvas(traceExport);

      expect(result.canvas.nodes).toHaveLength(2); // 1 span + 1 service group
      expect(result.canvas.edges).toHaveLength(0);
      expect(result.stats.spanCount).toBe(1);
      expect(result.stats.traceCount).toBe(1);
    });

    test('creates text node with correct properties', () => {
      const span = createSpan({
        name: 'HTTP GET /api/users',
        kind: 'SERVER',
        duration: 42.5,
      });
      const traceExport = createExport([span]);

      const result = traceToCanvas(traceExport);

      const spanNode = result.canvas.nodes?.find((n) => n.id === span.spanId);
      expect(spanNode).toBeDefined();
      expect(spanNode?.type).toBe('text');
      expect((spanNode as ExtendedCanvasTextNode).text).toBe('HTTP GET /api/users');
      expect((spanNode as ExtendedCanvasTextNode).pv?.shape).toBe('hexagon'); // SERVER shape
      expect((spanNode as ExtendedCanvasTextNode).pv?.description).toBe('42.50ms');
    });

    test('empty spans returns empty canvas', () => {
      const traceExport = createExport([]);

      const result = traceToCanvas(traceExport);

      expect(result.canvas.nodes).toHaveLength(0);
      expect(result.canvas.edges).toHaveLength(0);
      expect(result.stats.spanCount).toBe(0);
    });
  });

  describe('parent-child relationships', () => {
    test('creates edge between parent and child spans', () => {
      const parentSpan = createSpan({ spanId: 'parent', name: 'parent-op' });
      const childSpan = createSpan({
        spanId: 'child',
        parentSpanId: 'parent',
        name: 'child-op',
      });
      const traceExport = createExport([parentSpan, childSpan]);

      const result = traceToCanvas(traceExport);

      expect(result.canvas.edges).toHaveLength(1);
      const edge = result.canvas.edges?.[0];
      expect(edge?.fromNode).toBe('parent');
      expect(edge?.toNode).toBe('child');
      expect(edge?.pv?.edgeType).toBe('span-child');
    });

    test('creates dashed edge for cross-service calls', () => {
      const parentSpan = createSpan({
        spanId: 'parent',
        resource: { 'service.name': 'service-a' },
      });
      const childSpan = createSpan({
        spanId: 'child',
        parentSpanId: 'parent',
        resource: { 'service.name': 'service-b' },
      });
      const traceExport = createExport([parentSpan, childSpan]);

      const result = traceToCanvas(traceExport);

      const edge = result.canvas.edges?.[0];
      expect(edge?.pv?.style).toBe('dashed');
      expect(edge?.pv?.width).toBe(2);
    });

    test('creates solid edge for same-service calls', () => {
      const parentSpan = createSpan({
        spanId: 'parent',
        resource: { 'service.name': 'same-service' },
      });
      const childSpan = createSpan({
        spanId: 'child',
        parentSpanId: 'parent',
        resource: { 'service.name': 'same-service' },
      });
      const traceExport = createExport([parentSpan, childSpan]);

      const result = traceToCanvas(traceExport);

      const edge = result.canvas.edges?.[0];
      expect(edge?.pv?.style).toBe('solid');
      expect(edge?.pv?.width).toBe(1);
    });
  });

  describe('service grouping', () => {
    test('creates service group node', () => {
      const span = createSpan({
        resource: { 'service.name': 'my-service' },
      });
      const traceExport = createExport([span]);

      const result = traceToCanvas(traceExport, { groupByService: true });

      const groupNode = result.canvas.nodes?.find((n) => n.type === 'group');
      expect(groupNode).toBeDefined();
      expect((groupNode as CanvasGroupNode).label).toBe('my-service');
      expect((groupNode as CanvasGroupNode).pv?.nodeType).toBe('service');
    });

    test('skips service grouping when disabled', () => {
      const span = createSpan();
      const traceExport = createExport([span]);

      const result = traceToCanvas(traceExport, { groupByService: false });

      const groupNodes = result.canvas.nodes?.filter((n) => n.type === 'group');
      expect(groupNodes).toHaveLength(0);
    });

    test('creates multiple service groups', () => {
      const span1 = createSpan({
        spanId: 'span-1',
        resource: { 'service.name': 'service-a' },
      });
      const span2 = createSpan({
        spanId: 'span-2',
        resource: { 'service.name': 'service-b' },
      });
      const traceExport = createExport([span1, span2]);

      const result = traceToCanvas(traceExport);

      expect(result.stats.serviceCount).toBe(2);
      const groupNodes = result.canvas.nodes?.filter((n) => n.type === 'group');
      expect(groupNodes).toHaveLength(2);
    });
  });

  describe('span kind styling', () => {
    test.each([
      ['SERVER', 'hexagon'],
      ['CLIENT', 'diamond'],
      ['PRODUCER', 'rectangle'],
      ['CONSUMER', 'rectangle'],
      ['INTERNAL', 'circle'],
    ])('maps %s kind to %s shape', (kind, expectedShape) => {
      const span = createSpan({ kind });
      const traceExport = createExport([span]);

      const result = traceToCanvas(traceExport);

      const spanNode = result.canvas.nodes?.find((n) => n.id === span.spanId);
      expect((spanNode as ExtendedCanvasTextNode).pv?.shape).toBe(expectedShape);
    });
  });

  describe('error handling', () => {
    test('marks error spans with red color', () => {
      const span = createSpan({
        status: { code: 'ERROR', message: 'Something went wrong' },
      });
      const traceExport = createExport([span]);

      const result = traceToCanvas(traceExport);

      const spanNode = result.canvas.nodes?.find((n) => n.id === span.spanId);
      expect((spanNode as ExtendedCanvasTextNode).pv?.fill).toBe('#ef4444');
      expect((spanNode as ExtendedCanvasTextNode).color).toBe(1); // Red preset
    });
  });

  describe('layout', () => {
    test('positions parent above child', () => {
      const parentSpan = createSpan({ spanId: 'parent' });
      const childSpan = createSpan({ spanId: 'child', parentSpanId: 'parent' });
      const traceExport = createExport([parentSpan, childSpan]);

      const result = traceToCanvas(traceExport);

      const parentNode = result.canvas.nodes?.find((n) => n.id === 'parent');
      const childNode = result.canvas.nodes?.find((n) => n.id === 'child');

      expect(parentNode?.y).toBeLessThan(childNode?.y ?? 0);
    });

    test('calculates max depth correctly', () => {
      const root = createSpan({ spanId: 'root' });
      const child = createSpan({ spanId: 'child', parentSpanId: 'root' });
      const grandchild = createSpan({ spanId: 'grandchild', parentSpanId: 'child' });
      const traceExport = createExport([root, child, grandchild]);

      const result = traceToCanvas(traceExport);

      expect(result.stats.maxDepth).toBe(2);
    });
  });

  describe('filtering', () => {
    test('filters spans by minimum duration', () => {
      const fastSpan = createSpan({ spanId: 'fast', duration: 0.5 });
      const slowSpan = createSpan({ spanId: 'slow', duration: 10 });
      const traceExport = createExport([fastSpan, slowSpan]);

      const result = traceToCanvas(traceExport, { minDurationMs: 1 });

      expect(result.stats.spanCount).toBe(1);
      const spanNodes = result.canvas.nodes?.filter((n) => n.type === 'text');
      expect(spanNodes).toHaveLength(1);
      expect(spanNodes?.[0].id).toBe('slow');
    });
  });

  describe('attributes', () => {
    test('includes attributes when enabled', () => {
      const span = createSpan({
        attributes: {
          'http.method': 'GET',
          'http.status_code': 200,
        },
      });
      const traceExport = createExport([span]);

      const result = traceToCanvas(traceExport, { includeAttributes: true });

      const spanNode = result.canvas.nodes?.find((n) => n.id === span.spanId);
      expect((spanNode as ExtendedCanvasTextNode).pv?.dataSchema).toBeDefined();
      expect((spanNode as ExtendedCanvasTextNode).pv?.dataSchema?.['http.method']).toBeDefined();
    });

    test('excludes attributes when disabled', () => {
      const span = createSpan({
        attributes: { 'http.method': 'GET' },
      });
      const traceExport = createExport([span]);

      const result = traceToCanvas(traceExport, { includeAttributes: false });

      const spanNode = result.canvas.nodes?.find((n) => n.id === span.spanId);
      expect((spanNode as ExtendedCanvasTextNode).pv?.dataSchema).toBeUndefined();
    });
  });

  describe('JSON output', () => {
    test('traceToCanvasJson returns valid JSON', () => {
      const span = createSpan();
      const traceExport = createExport([span]);

      const json = traceToCanvasJson(traceExport);

      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.nodes).toBeDefined();
      expect(parsed.edges).toBeDefined();
      expect(parsed.pv).toBeDefined();
    });
  });

  describe('canvas metadata', () => {
    test('includes canvas extensions', () => {
      const span = createSpan();
      const traceExport = createExport([span]);

      const result = traceToCanvas(traceExport);

      // Name is now at top level
      expect(result.canvas.name).toContain('Trace:');
      // Other metadata remains in pv
      expect(result.canvas.pv?.nodeTypes).toBeDefined();
      expect(result.canvas.pv?.edgeTypes).toBeDefined();
    });
  });
});
