/**
 * Tests for useElkLayout hook utilities
 */

import { describe, test, expect } from 'bun:test';
import type { Edge } from '@xyflow/react';
import { applyElkPathsToEdges } from './useElkLayout';

describe('useElkLayout utilities', () => {
  describe('applyElkPathsToEdges', () => {
    const createEdge = (id: string, source: string, target: string): Edge => ({
      id,
      source,
      target,
    });

    test('should return original edges when edgePaths is empty', () => {
      const edges = [createEdge('e1', 'a', 'b')];
      const edgePaths = new Map<string, string>();
      const edgeLabelPositions = new Map<string, { x: number; y: number }>();

      const result = applyElkPathsToEdges(edges, edgePaths, edgeLabelPositions);

      expect(result).toEqual(edges);
      expect(result[0].data?.elkPath).toBeUndefined();
    });

    test('should inject elkPath into edge data', () => {
      const edges = [createEdge('e1', 'a', 'b')];
      const edgePaths = new Map([['e1', 'M 0 0 L 100 100']]);
      const edgeLabelPositions = new Map<string, { x: number; y: number }>();

      const result = applyElkPathsToEdges(edges, edgePaths, edgeLabelPositions);

      expect(result[0].data?.elkPath).toBe('M 0 0 L 100 100');
    });

    test('should inject elkLabelPosition into edge data', () => {
      const edges = [createEdge('e1', 'a', 'b')];
      const edgePaths = new Map([['e1', 'M 0 0 L 100 100']]);
      const edgeLabelPositions = new Map([['e1', { x: 50, y: 50 }]]);

      const result = applyElkPathsToEdges(edges, edgePaths, edgeLabelPositions);

      expect(result[0].data?.elkLabelPosition).toEqual({ x: 50, y: 50 });
    });

    test('should preserve existing edge data', () => {
      const edges: Edge[] = [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          data: { customField: 'value', edgeType: 'flow' },
        },
      ];
      const edgePaths = new Map([['e1', 'M 0 0 L 100 100']]);
      const edgeLabelPositions = new Map<string, { x: number; y: number }>();

      const result = applyElkPathsToEdges(edges, edgePaths, edgeLabelPositions);

      expect(result[0].data?.customField).toBe('value');
      expect(result[0].data?.edgeType).toBe('flow');
      expect(result[0].data?.elkPath).toBe('M 0 0 L 100 100');
    });

    test('should only modify edges that have corresponding paths', () => {
      const edges = [
        createEdge('e1', 'a', 'b'),
        createEdge('e2', 'b', 'c'),
        createEdge('e3', 'c', 'd'),
      ];
      const edgePaths = new Map([
        ['e1', 'M 0 0 L 100 0'],
        ['e3', 'M 200 0 L 300 0'],
        // e2 has no path
      ]);
      const edgeLabelPositions = new Map<string, { x: number; y: number }>();

      const result = applyElkPathsToEdges(edges, edgePaths, edgeLabelPositions);

      expect(result[0].data?.elkPath).toBe('M 0 0 L 100 0');
      expect(result[1].data?.elkPath).toBeUndefined();
      expect(result[2].data?.elkPath).toBe('M 200 0 L 300 0');
    });

    test('should handle edges with undefined data', () => {
      const edges: Edge[] = [
        { id: 'e1', source: 'a', target: 'b', data: undefined },
      ];
      const edgePaths = new Map([['e1', 'M 0 0 L 100 100']]);
      const edgeLabelPositions = new Map([['e1', { x: 50, y: 50 }]]);

      const result = applyElkPathsToEdges(edges, edgePaths, edgeLabelPositions);

      expect(result[0].data?.elkPath).toBe('M 0 0 L 100 100');
      expect(result[0].data?.elkLabelPosition).toEqual({ x: 50, y: 50 });
    });

    test('should return new array without mutating original', () => {
      const edges = [createEdge('e1', 'a', 'b')];
      const edgePaths = new Map([['e1', 'M 0 0 L 100 100']]);
      const edgeLabelPositions = new Map<string, { x: number; y: number }>();

      const result = applyElkPathsToEdges(edges, edgePaths, edgeLabelPositions);

      // Result should be a new array
      expect(result).not.toBe(edges);
      // Original edge should not be modified
      expect(edges[0].data).toBeUndefined();
    });

    test('should handle complex path strings', () => {
      const edges = [createEdge('e1', 'a', 'b')];
      const complexPath = 'M 120 30 L 142 30 Q 150 30 150 38 L 150 72 Q 150 80 158 80 L 250 80';
      const edgePaths = new Map([['e1', complexPath]]);
      const edgeLabelPositions = new Map<string, { x: number; y: number }>();

      const result = applyElkPathsToEdges(edges, edgePaths, edgeLabelPositions);

      expect(result[0].data?.elkPath).toBe(complexPath);
    });

    test('should handle empty edges array', () => {
      const edges: Edge[] = [];
      const edgePaths = new Map([['e1', 'M 0 0 L 100 100']]);
      const edgeLabelPositions = new Map<string, { x: number; y: number }>();

      const result = applyElkPathsToEdges(edges, edgePaths, edgeLabelPositions);

      expect(result).toEqual([]);
    });
  });
});
