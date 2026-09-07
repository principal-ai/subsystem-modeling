/**
 * Tests for canvas utility functions
 */

import { describe, it, expect } from 'bun:test';
import {
  resolveCanvasColor,
  CANVAS_COLOR_PRESETS,
  getOtelNodeIdentifier,
  type OtelSpanConventionNode,
  type OtelScopeNode,
  type OtelResourceNode,
  type OtelBoundaryNode,
} from './canvas';

describe('resolveCanvasColor', () => {
  it('should return undefined for undefined input', () => {
    expect(resolveCanvasColor(undefined)).toBeUndefined();
  });

  it('should resolve numeric presets to hex colors', () => {
    expect(resolveCanvasColor(1)).toBe('#ef4444'); // red
    expect(resolveCanvasColor(2)).toBe('#f97316'); // orange
    expect(resolveCanvasColor(3)).toBe('#eab308'); // yellow
    expect(resolveCanvasColor(4)).toBe('#22c55e'); // green
    expect(resolveCanvasColor(5)).toBe('#06b6d4'); // cyan
    expect(resolveCanvasColor(6)).toBe('#8b5cf6'); // purple
  });

  it('should resolve numeric string presets to hex colors (Obsidian format)', () => {
    expect(resolveCanvasColor('1')).toBe('#ef4444'); // red
    expect(resolveCanvasColor('2')).toBe('#f97316'); // orange
    expect(resolveCanvasColor('3')).toBe('#eab308'); // yellow
    expect(resolveCanvasColor('4')).toBe('#22c55e'); // green
    expect(resolveCanvasColor('5')).toBe('#06b6d4'); // cyan
    expect(resolveCanvasColor('6')).toBe('#8b5cf6'); // purple
  });

  it('should return hex strings as-is', () => {
    expect(resolveCanvasColor('#22c55e')).toBe('#22c55e');
    expect(resolveCanvasColor('#f00')).toBe('#f00');
    expect(resolveCanvasColor('#3b82f6')).toBe('#3b82f6');
  });

  it('should return non-numeric strings as-is', () => {
    expect(resolveCanvasColor('red')).toBe('red');
    expect(resolveCanvasColor('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)');
  });

  it('should handle edge cases for numeric strings', () => {
    // Out of range numeric strings should be returned as-is
    expect(resolveCanvasColor('0')).toBe('0');
    expect(resolveCanvasColor('7')).toBe('7');
    expect(resolveCanvasColor('10')).toBe('10');
  });

  it('should verify all preset mappings exist', () => {
    // Ensure all presets 1-6 are defined
    for (let i = 1; i <= 6; i++) {
      expect(CANVAS_COLOR_PRESETS[i]).toBeDefined();
      expect(CANVAS_COLOR_PRESETS[i]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('getOtelNodeIdentifier', () => {
  describe('otel-span-convention nodes', () => {
    it('should return spanPattern for valid nodes', () => {
      const node: OtelSpanConventionNode = {
        id: 'test-span',
        type: 'otel-span-convention',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        otel: {
          spanPattern: 'activity-feed.init',
          spanKind: 'internal',
        },
      };
      expect(getOtelNodeIdentifier(node)).toBe('activity-feed.init');
    });

    it('should handle nodes with missing otel property gracefully', () => {
      // BUG REPRODUCTION: This test demonstrates the crash when otel is undefined
      // The validator CLI crashes with: "Cannot read properties of undefined (reading 'spanPattern')"
      // This happens when a .spans.canvas file has malformed otel-span-convention nodes
      const malformedNode = {
        id: 'malformed-span',
        type: 'otel-span-convention' as const,
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        // otel property is missing - this causes the crash
      } as OtelSpanConventionNode;

      // Currently this throws: Cannot read properties of undefined (reading 'spanPattern')
      // Expected behavior: should return undefined gracefully
      expect(() => getOtelNodeIdentifier(malformedNode)).not.toThrow();
      expect(getOtelNodeIdentifier(malformedNode)).toBeUndefined();
    });
  });

  describe('otel-scope nodes', () => {
    it('should return scope for valid nodes', () => {
      const node: OtelScopeNode = {
        id: 'test-scope',
        type: 'otel-scope',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        otel: {
          scope: 'activity-feed',
        },
      };
      expect(getOtelNodeIdentifier(node)).toBe('activity-feed');
    });

    it('should handle nodes with missing otel property gracefully', () => {
      const malformedNode = {
        id: 'malformed-scope',
        type: 'otel-scope' as const,
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      } as OtelScopeNode;

      expect(() => getOtelNodeIdentifier(malformedNode)).not.toThrow();
      expect(getOtelNodeIdentifier(malformedNode)).toBeUndefined();
    });
  });

  describe('otel-resource nodes', () => {
    it('should return first resource match entry for valid nodes', () => {
      const node: OtelResourceNode = {
        id: 'test-resource',
        type: 'otel-resource',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        otel: {
          resourceMatch: {
            'service.name': 'my-service',
          },
        },
      };
      expect(getOtelNodeIdentifier(node)).toBe('service.name: my-service');
    });

    it('should handle nodes with missing otel property gracefully', () => {
      const malformedNode = {
        id: 'malformed-resource',
        type: 'otel-resource' as const,
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      } as OtelResourceNode;

      expect(() => getOtelNodeIdentifier(malformedNode)).not.toThrow();
      expect(getOtelNodeIdentifier(malformedNode)).toBeUndefined();
    });
  });

  describe('otel-boundary nodes', () => {
    it('should return direction for valid nodes', () => {
      const node: OtelBoundaryNode = {
        id: 'test-boundary',
        type: 'otel-boundary',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        boundary: {
          direction: 'incoming',
        },
      };
      expect(getOtelNodeIdentifier(node)).toBe('incoming');
    });

    it('should handle nodes with missing boundary property gracefully', () => {
      const malformedNode = {
        id: 'malformed-boundary',
        type: 'otel-boundary' as const,
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      } as OtelBoundaryNode;

      expect(() => getOtelNodeIdentifier(malformedNode)).not.toThrow();
      expect(getOtelNodeIdentifier(malformedNode)).toBeUndefined();
    });
  });
});
