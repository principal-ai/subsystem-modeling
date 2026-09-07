/**
 * Tests for edge validation against spans.canvas
 */

import {
  extractSpanNodes,
  extractCanvasEdges,
  matchSpanToPattern,
  findMatchingNode,
  validateEdges,
  formatValidationResult,
} from '../edge-validation';
import type { ExtendedCanvas } from '../../types/canvas';
import type { DerivedEdge } from '../edge-derivation';

describe('extractSpanNodes', () => {
  it('extracts nodes with spanPattern', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'cli-command',
          type: 'text',
          text: 'CLI Command',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          pv: {
            nodeType: 'span-convention',
            otel: {
              spanPattern: 'cli.command',
            },
          },
        },
        {
          id: 'validate',
          type: 'text',
          text: 'Validate',
          x: 200,
          y: 0,
          width: 100,
          height: 50,
          pv: {
            nodeType: 'span-convention',
            name: 'Validation',
            otel: {
              spanPattern: 'validate.*',
            },
          },
        },
        {
          id: 'no-span',
          type: 'text',
          text: 'No Span',
          x: 400,
          y: 0,
          width: 100,
          height: 50,
        },
      ],
    };

    const nodes = extractSpanNodes(canvas);

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toEqual({
      nodeId: 'cli-command',
      spanPattern: 'cli.command',
      name: undefined,
    });
    expect(nodes[1]).toEqual({
      nodeId: 'validate',
      spanPattern: 'validate.*',
      name: 'Validation',
    });
  });

  it('returns empty array for canvas without nodes', () => {
    const canvas: ExtendedCanvas = {};
    expect(extractSpanNodes(canvas)).toEqual([]);
  });
});

describe('extractCanvasEdges', () => {
  it('extracts edges with span patterns', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'a',
          type: 'text',
          text: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          pv: { nodeType: 'span', otel: { spanPattern: 'span.a' } },
        },
        {
          id: 'b',
          type: 'text',
          text: 'B',
          x: 200,
          y: 0,
          width: 100,
          height: 50,
          pv: { nodeType: 'span', otel: { spanPattern: 'span.b' } },
        },
      ],
      edges: [
        { id: 'e1', fromNode: 'a', toNode: 'b' },
      ],
    };

    const spanNodes = extractSpanNodes(canvas);
    const edges = extractCanvasEdges(canvas, spanNodes);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      fromNodeId: 'a',
      toNodeId: 'b',
      fromSpanPattern: 'span.a',
      toSpanPattern: 'span.b',
    });
  });

  it('handles missing span patterns', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        { id: 'a', type: 'text', text: 'A', x: 0, y: 0, width: 100, height: 50 },
        {
          id: 'b',
          type: 'text',
          text: 'B',
          x: 200,
          y: 0,
          width: 100,
          height: 50,
          pv: { nodeType: 'span', otel: { spanPattern: 'span.b' } },
        },
      ],
      edges: [
        { id: 'e1', fromNode: 'a', toNode: 'b' },
      ],
    };

    const spanNodes = extractSpanNodes(canvas);
    const edges = extractCanvasEdges(canvas, spanNodes);

    expect(edges).toHaveLength(1);
    expect(edges[0].fromSpanPattern).toBeUndefined();
    expect(edges[0].toSpanPattern).toBe('span.b');
  });
});

describe('matchSpanToPattern', () => {
  it('matches exact span names', () => {
    expect(matchSpanToPattern('cli.command', 'cli.command')).toBe(true);
    expect(matchSpanToPattern('cli.command', 'cli.other')).toBe(false);
  });

  it('matches glob patterns', () => {
    expect(matchSpanToPattern('validate.canvas', 'validate.*')).toBe(true);
    expect(matchSpanToPattern('validate.schema', 'validate.*')).toBe(true);
    expect(matchSpanToPattern('other.canvas', 'validate.*')).toBe(false);
  });

  it('matches multi-segment patterns', () => {
    expect(matchSpanToPattern('api.user.create', 'api.*.*')).toBe(true);
    expect(matchSpanToPattern('api.user', 'api.*.*')).toBe(false);
  });

  it('matches double-star patterns', () => {
    expect(matchSpanToPattern('api.user.create', 'api.**')).toBe(true);
    expect(matchSpanToPattern('api.user', 'api.**')).toBe(true);
    expect(matchSpanToPattern('other.thing', 'api.**')).toBe(false);
  });
});

describe('findMatchingNode', () => {
  const spanNodes = [
    { nodeId: 'cli', spanPattern: 'cli.command', name: 'CLI' },
    { nodeId: 'validate', spanPattern: 'validate.*', name: 'Validate' },
    { nodeId: 'file', spanPattern: 'file.*', name: 'File' },
  ];

  it('finds exact match first', () => {
    const match = findMatchingNode('cli.command', spanNodes);
    expect(match?.nodeId).toBe('cli');
  });

  it('falls back to pattern match', () => {
    const match = findMatchingNode('validate.canvas', spanNodes);
    expect(match?.nodeId).toBe('validate');
  });

  it('returns undefined for no match', () => {
    const match = findMatchingNode('unknown.span', spanNodes);
    expect(match).toBeUndefined();
  });
});

describe('validateEdges', () => {
  const canvas: ExtendedCanvas = {
    nodes: [
      {
        id: 'root',
        type: 'text',
        text: 'Root',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        pv: { nodeType: 'span', otel: { spanPattern: 'cli.command' } },
      },
      {
        id: 'validate',
        type: 'text',
        text: 'Validate',
        x: 200,
        y: 0,
        width: 100,
        height: 50,
        pv: { nodeType: 'span', otel: { spanPattern: 'validate.*' } },
      },
      {
        id: 'file',
        type: 'text',
        text: 'File',
        x: 400,
        y: 0,
        width: 100,
        height: 50,
        pv: { nodeType: 'span', otel: { spanPattern: 'file.*' } },
      },
    ],
    edges: [
      { id: 'e1', fromNode: 'root', toNode: 'validate' },
      { id: 'e2', fromNode: 'validate', toNode: 'file' },
    ],
  };

  it('validates matching edges', () => {
    const derivedEdges: DerivedEdge[] = [
      {
        fromSpan: 'cli.command',
        toSpan: 'validate.canvas',
        scenarioId: 'success',
        eventNames: ['start', 'validate'],
      },
    ];

    const result = validateEdges(derivedEdges, canvas);

    expect(result.validEdges).toHaveLength(1);
    expect(result.validEdges[0].fromSpan).toBe('cli.command');
    expect(result.validEdges[0].toSpan).toBe('validate.canvas');
    expect(result.missingEdges).toHaveLength(0);
  });

  it('detects missing edges', () => {
    const derivedEdges: DerivedEdge[] = [
      {
        fromSpan: 'cli.command',
        toSpan: 'file.read', // No edge from root to file in canvas
        scenarioId: 'success',
        eventNames: ['start', 'file'],
      },
    ];

    const result = validateEdges(derivedEdges, canvas);

    expect(result.validEdges).toHaveLength(0);
    expect(result.missingEdges).toHaveLength(1);
    expect(result.missingEdges[0].fromSpan).toBe('cli.command');
    expect(result.missingEdges[0].toSpan).toBe('file.read');
    expect(result.missingEdges[0].fromNodeId).toBe('root');
    expect(result.missingEdges[0].toNodeId).toBe('file');
    expect(result.missingEdges[0].reason).toBe('no-edge-in-canvas');
  });

  it('detects unused canvas edges', () => {
    const derivedEdges: DerivedEdge[] = [
      {
        fromSpan: 'cli.command',
        toSpan: 'validate.canvas',
        scenarioId: 'success',
        eventNames: ['start', 'validate'],
      },
    ];

    const result = validateEdges(derivedEdges, canvas);

    // validate -> file edge is not used
    expect(result.unusedEdges).toHaveLength(1);
    expect(result.unusedEdges[0].canvasEdge.fromNodeId).toBe('validate');
    expect(result.unusedEdges[0].canvasEdge.toNodeId).toBe('file');
  });

  it('detects unmatched spans', () => {
    const derivedEdges: DerivedEdge[] = [
      {
        fromSpan: 'cli.command',
        toSpan: 'unknown.span',
        scenarioId: 'success',
        eventNames: ['start', 'unknown'],
      },
    ];

    const result = validateEdges(derivedEdges, canvas);

    expect(result.unmatchedSpans).toHaveLength(1);
    expect(result.unmatchedSpans[0].spanName).toBe('unknown.span');
  });

  it('aggregates sources for same edge from multiple scenarios', () => {
    const derivedEdges: DerivedEdge[] = [
      {
        fromSpan: 'cli.command',
        toSpan: 'validate.canvas',
        scenarioId: 'success',
        eventNames: ['start', 'validate'],
        workflowFile: 'a.json',
      },
      {
        fromSpan: 'cli.command',
        toSpan: 'validate.canvas',
        scenarioId: 'failure',
        eventNames: ['start', 'validate'],
        workflowFile: 'a.json',
      },
    ];

    const result = validateEdges(derivedEdges, canvas);

    expect(result.validEdges).toHaveLength(1);
    expect(result.validEdges[0].sources).toHaveLength(2);
  });

  it('provides accurate summary', () => {
    const derivedEdges: DerivedEdge[] = [
      {
        fromSpan: 'cli.command',
        toSpan: 'validate.canvas',
        scenarioId: 'success',
        eventNames: ['start', 'validate'],
      },
      {
        fromSpan: 'cli.command',
        toSpan: 'file.read', // Missing edge
        scenarioId: 'success',
        eventNames: ['start', 'file'],
      },
    ];

    const result = validateEdges(derivedEdges, canvas);

    expect(result.summary).toEqual({
      totalDerivedEdges: 2,
      totalCanvasEdges: 2,
      matchedEdges: 1,
      missingEdges: 1,
      unusedEdges: 1, // validate -> file
      unmatchedSpans: 0,
    });
  });
});

describe('formatValidationResult', () => {
  it('formats validation result as readable text', () => {
    const result = {
      validEdges: [
        {
          fromSpan: 'cli.command',
          toSpan: 'validate.canvas',
          canvasEdge: { fromNodeId: 'root', toNodeId: 'validate' },
          sources: [{ scenarioId: 'success' }],
        },
      ],
      missingEdges: [
        {
          fromSpan: 'cli.command',
          toSpan: 'file.read',
          fromNodeId: 'root',
          toNodeId: 'file',
          sources: [{ scenarioId: 'success' }],
          reason: 'no-edge-in-canvas' as const,
        },
      ],
      unusedEdges: [
        {
          canvasEdge: {
            fromNodeId: 'validate',
            toNodeId: 'file',
            fromSpanPattern: 'validate.*',
            toSpanPattern: 'file.*',
          },
        },
      ],
      unmatchedSpans: [],
      summary: {
        totalDerivedEdges: 2,
        totalCanvasEdges: 2,
        matchedEdges: 1,
        missingEdges: 1,
        unusedEdges: 1,
        unmatchedSpans: 0,
      },
    };

    const formatted = formatValidationResult(result);

    expect(formatted).toContain('Edge Validation Results');
    expect(formatted).toContain('✓ cli.command → validate.canvas');
    expect(formatted).toContain('✗ cli.command → file.read');
    expect(formatted).toContain('⚠ validate.* → file.*');
  });
});
