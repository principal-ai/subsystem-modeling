import { describe, it, expect } from 'vitest';
import {
  buildScopeColorMapFromCanvas,
  buildScopeColorMap,
  getScopeNamesFromCanvas,
  getScopeNodeFromCanvas,
  DEFAULT_SCOPE_COLOR,
} from '../utils';
import type { ExtendedCanvas, OtelScopeNode } from '../../types/canvas';

describe('buildScopeColorMapFromCanvas', () => {
  it('extracts colors from otel-scope nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'auth',
          type: 'otel-scope',
          x: 0,
          y: 0,
          width: 200,
          height: 80,
          label: 'Auth',
          color: '#3B82F6',
          otel: { scope: 'auth-service' },
        } as OtelScopeNode,
        {
          id: 'payment',
          type: 'otel-scope',
          x: 250,
          y: 0,
          width: 200,
          height: 80,
          label: 'Payment',
          color: '#10B981',
          otel: { scope: 'payment-service' },
        } as OtelScopeNode,
      ],
      edges: [],
    };

    const colorMap = buildScopeColorMapFromCanvas(canvas);

    expect(colorMap).toEqual({
      'auth-service': '#3B82F6',
      'payment-service': '#10B981',
    });
  });

  it('ignores non-otel-scope nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'regular',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'Regular node',
          color: '#FF0000',
        },
        {
          id: 'auth',
          type: 'otel-scope',
          x: 0,
          y: 0,
          width: 200,
          height: 80,
          label: 'Auth',
          color: '#3B82F6',
          otel: { scope: 'auth' },
        } as OtelScopeNode,
      ],
      edges: [],
    };

    const colorMap = buildScopeColorMapFromCanvas(canvas);

    expect(colorMap).toEqual({ auth: '#3B82F6' });
    expect(colorMap).not.toHaveProperty('regular');
  });

  it('uses default color when node has no color', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'auth',
          type: 'otel-scope',
          x: 0,
          y: 0,
          width: 200,
          height: 80,
          label: 'Auth',
          otel: { scope: 'auth' },
        } as OtelScopeNode,
      ],
      edges: [],
    };

    const colorMap = buildScopeColorMapFromCanvas(canvas);

    expect(colorMap.auth).toBe(DEFAULT_SCOPE_COLOR);
  });

  it('handles canvas color presets', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'auth',
          type: 'otel-scope',
          x: 0,
          y: 0,
          width: 200,
          height: 80,
          label: 'Auth',
          color: 1, // Red preset
          otel: { scope: 'auth' },
        } as OtelScopeNode,
      ],
      edges: [],
    };

    const colorMap = buildScopeColorMapFromCanvas(canvas);

    // Red preset should resolve to red hex color
    expect(colorMap.auth).toBe('#ef4444');
  });

  it('returns empty map for undefined canvas', () => {
    const colorMap = buildScopeColorMapFromCanvas(undefined);
    expect(colorMap).toEqual({});
  });

  it('returns empty map for canvas with no nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [],
      edges: [],
    };

    const colorMap = buildScopeColorMapFromCanvas(canvas);
    expect(colorMap).toEqual({});
  });

  it('skips nodes with no otel.scope field', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'invalid',
          type: 'otel-scope',
          x: 0,
          y: 0,
          width: 200,
          height: 80,
          label: 'Invalid',
          color: '#3B82F6',
          // Missing otel.scope
        } as OtelScopeNode,
      ],
      edges: [],
    };

    const colorMap = buildScopeColorMapFromCanvas(canvas);
    expect(colorMap).toEqual({});
  });
});

describe('buildScopeColorMap', () => {
  it('builds color map from scopesCanvas', () => {
    const scopesCanvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'auth',
          type: 'otel-scope',
          x: 0,
          y: 0,
          width: 200,
          height: 80,
          label: 'Auth',
          color: '#3B82F6',
          otel: { scope: 'auth' },
        } as OtelScopeNode,
      ],
      edges: [],
    };

    const colorMap = buildScopeColorMap(scopesCanvas);

    expect(colorMap).toEqual({ auth: '#3B82F6' });
  });

  it('returns empty map when no canvas provided', () => {
    const colorMap = buildScopeColorMap(undefined);

    expect(colorMap).toEqual({});
  });
});

describe('getScopeNamesFromCanvas', () => {
  it('extracts all scope names', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'auth',
          type: 'otel-scope',
          x: 0,
          y: 0,
          width: 200,
          height: 80,
          label: 'Auth',
          otel: { scope: 'auth-service' },
        } as OtelScopeNode,
        {
          id: 'payment',
          type: 'otel-scope',
          x: 250,
          y: 0,
          width: 200,
          height: 80,
          label: 'Payment',
          otel: { scope: 'payment-service' },
        } as OtelScopeNode,
      ],
      edges: [],
    };

    const scopeNames = getScopeNamesFromCanvas(canvas);

    expect(scopeNames).toEqual(['auth-service', 'payment-service']);
  });

  it('filters out non-otel-scope nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'text-node',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'Text',
        },
        {
          id: 'auth',
          type: 'otel-scope',
          x: 0,
          y: 0,
          width: 200,
          height: 80,
          label: 'Auth',
          otel: { scope: 'auth' },
        } as OtelScopeNode,
      ],
      edges: [],
    };

    const scopeNames = getScopeNamesFromCanvas(canvas);

    expect(scopeNames).toEqual(['auth']);
    expect(scopeNames).not.toContain('text-node');
  });

  it('returns empty array for undefined canvas', () => {
    expect(getScopeNamesFromCanvas(undefined)).toEqual([]);
  });

  it('returns empty array for canvas with no nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [],
      edges: [],
    };

    expect(getScopeNamesFromCanvas(canvas)).toEqual([]);
  });

  it('filters out nodes without otel.scope', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'valid',
          type: 'otel-scope',
          x: 0,
          y: 0,
          width: 200,
          height: 80,
          label: 'Valid',
          otel: { scope: 'valid-scope' },
        } as OtelScopeNode,
        {
          id: 'invalid',
          type: 'otel-scope',
          x: 250,
          y: 0,
          width: 200,
          height: 80,
          label: 'Invalid',
          // Missing otel.scope
        } as OtelScopeNode,
      ],
      edges: [],
    };

    const scopeNames = getScopeNamesFromCanvas(canvas);

    expect(scopeNames).toEqual(['valid-scope']);
  });
});

describe('getScopeNodeFromCanvas', () => {
  it('finds scope node by name', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'auth',
          type: 'otel-scope',
          x: 0,
          y: 0,
          width: 200,
          height: 80,
          label: 'Auth',
          color: '#3B82F6',
          otel: { scope: 'auth-service' },
        } as OtelScopeNode,
        {
          id: 'payment',
          type: 'otel-scope',
          x: 250,
          y: 0,
          width: 200,
          height: 80,
          label: 'Payment',
          color: '#10B981',
          otel: { scope: 'payment-service' },
        } as OtelScopeNode,
      ],
      edges: [],
    };

    const node = getScopeNodeFromCanvas(canvas, 'auth-service');

    expect(node).toBeDefined();
    expect(node?.id).toBe('auth');
    expect(node?.otel?.scope).toBe('auth-service');
    expect(node?.color).toBe('#3B82F6');
  });

  it('returns undefined for non-existent scope', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'auth',
          type: 'otel-scope',
          x: 0,
          y: 0,
          width: 200,
          height: 80,
          label: 'Auth',
          otel: { scope: 'auth-service' },
        } as OtelScopeNode,
      ],
      edges: [],
    };

    const node = getScopeNodeFromCanvas(canvas, 'non-existent');

    expect(node).toBeUndefined();
  });

  it('returns undefined for undefined canvas', () => {
    const node = getScopeNodeFromCanvas(undefined, 'auth-service');
    expect(node).toBeUndefined();
  });

  it('returns undefined for canvas with no nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [],
      edges: [],
    };

    const node = getScopeNodeFromCanvas(canvas, 'auth-service');
    expect(node).toBeUndefined();
  });
});
