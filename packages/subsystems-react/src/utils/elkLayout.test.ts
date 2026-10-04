/**
 * Tests for ELK Layout Utility
 *
 * Tests the pure helper functions that don't require the ELK runtime, plus
 * the compound-group planner. computeElkLayout itself needs a web worker
 * (elkjs constructs one), so it is covered by Storybook visual tests and by
 * testing planCompoundGroups — the part that decides which frames exist.
 */

import { describe, test, expect } from 'bun:test';
import {
  pointsToPath,
  pointsToSmoothPath,
  calculatePathMidpoint,
  pointAlongPath,
  fractionAlongPath,
  planCompoundGroups,
  getElkOptions,
  type Point,
} from './elkLayout';
import { EDGE_LABEL_WIDTH, EDGE_LABEL_SIDE_PADDING } from './edgeLabel';

describe('planCompoundGroups', () => {
  test('drops a single-leaf group by default and promotes its member', () => {
    const plan = planCompoundGroups(
      [{ id: 'proc', memberIds: ['solo'] }],
      ['solo'],
    );
    expect(plan.built.map((g) => g.id)).toEqual([]);
    expect(plan.skipped).toEqual(['proc']);
  });

  test('keeps a single-leaf group when the caller opts in', () => {
    const plan = planCompoundGroups(
      [{ id: 'proc', memberIds: ['solo'] }],
      ['solo'],
      true,
    );
    expect(plan.skipped).toEqual([]);
    expect(plan.built).toEqual([{ id: 'proc', childIds: ['solo'], minWidth: undefined }]);
  });

  test('keeps a multi-leaf group in both modes', () => {
    const defs = [{ id: 'proc', memberIds: ['a', 'b'] }];
    for (const keep of [false, true]) {
      const plan = planCompoundGroups(defs, ['a', 'b'], keep);
      expect(plan.built.map((g) => g.id)).toEqual(['proc']);
      expect(plan.skipped).toEqual([]);
    }
  });

  test('always drops an empty group even when singletons are kept', () => {
    const plan = planCompoundGroups([{ id: 'proc', memberIds: [] }], ['a'], true);
    expect(plan.built).toEqual([]);
    expect(plan.skipped).toEqual(['proc']);
  });

  test('counts leaves through nested groups', () => {
    // process → module(one leaf) is still a single leaf, so both drop by
    // default even though the process lists one member id.
    const defs = [
      { id: 'mod', memberIds: ['a'] },
      { id: 'proc', memberIds: ['mod'] },
    ];
    expect(planCompoundGroups(defs, ['a']).skipped).toEqual(['mod', 'proc']);
    expect(planCompoundGroups(defs, ['a'], true).built.map((g) => g.id)).toEqual([
      'mod',
      'proc',
    ]);
  });

  test('a two-leaf module keeps its process alive under the default', () => {
    const defs = [
      { id: 'mod', memberIds: ['a', 'b'] },
      { id: 'proc', memberIds: ['mod'] },
    ];
    const plan = planCompoundGroups(defs, ['a', 'b']);
    expect(plan.built.map((g) => g.id)).toEqual(['mod', 'proc']);
    expect(plan.built[1]!.childIds).toEqual(['mod']);
  });

  test('promotes a dropped group member into its built parent', () => {
    // proc contains a singleton module (dropped) plus a bare leaf, so proc
    // still has two leaves and survives; the module's leaf is promoted in.
    const defs = [
      { id: 'mod', memberIds: ['a'] },
      { id: 'proc', memberIds: ['mod', 'b'] },
    ];
    const plan = planCompoundGroups(defs, ['a', 'b']);
    expect(plan.skipped).toEqual(['mod']);
    expect(plan.built.map((g) => g.id)).toEqual(['proc']);
    expect(plan.built[0]!.childIds.sort()).toEqual(['a', 'b']);
  });

  test('builds children before parents', () => {
    const defs = [
      { id: 'pkg', memberIds: ['procA', 'procB'] },
      { id: 'procA', memberIds: ['a1', 'a2'] },
      { id: 'procB', memberIds: ['b1', 'b2'] },
    ];
    const plan = planCompoundGroups(defs, ['a1', 'a2', 'b1', 'b2']);
    const order = plan.built.map((g) => g.id);
    expect(order.indexOf('procA')).toBeLessThan(order.indexOf('pkg'));
    expect(order.indexOf('procB')).toBeLessThan(order.indexOf('pkg'));
  });

  test('drops groups caught in a cycle instead of looping forever', () => {
    const defs = [
      { id: 'x', memberIds: ['y'] },
      { id: 'y', memberIds: ['x'] },
    ];
    const plan = planCompoundGroups(defs, ['a']);
    expect(plan.built).toEqual([]);
    expect(plan.skipped.sort()).toEqual(['x', 'y']);
  });

  test('ignores member ids that match no leaf or group', () => {
    const plan = planCompoundGroups(
      [{ id: 'proc', memberIds: ['a', 'ghost'] }],
      ['a'],
      true,
    );
    expect(plan.built[0]!.childIds).toEqual(['a']);
  });

  test('carries minWidth through to the plan', () => {
    const plan = planCompoundGroups(
      [{ id: 'mod', memberIds: ['a', 'b'], minWidth: 220 }],
      ['a', 'b'],
    );
    expect(plan.built[0]!.minWidth).toBe(220);
  });
});

describe('elkLayout helper functions', () => {
  describe('getElkOptions — label-aware between-layer spacing', () => {
    test('does not stack spacing on top of ELK’s reserved label layer', () => {
      // CENTER_LAYER already reserves the label; adding the box width here
      // double-counts and balloons the run (measured 548px for 140 + 204).
      const opts = getElkOptions({ edgeLabels: { enabled: true, placement: 'CENTER' } });
      expect(opts['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('0');
    });

    test('an explicit interLayerSpacing still wins', () => {
      const opts = getElkOptions({ interLayerSpacing: 120, edgeLabels: { enabled: true } });
      expect(opts['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('120');
    });
  });

  describe('pointAlongPath / fractionAlongPath', () => {
    const bent: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];

    test('half is the arc-length midpoint, not a corner', () => {
      // Total length 200; half is 100 along, which is the corner (100,0).
      const mid = pointAlongPath(bent, 0.5);
      expect(mid).toEqual({ x: 100, y: 0 });
    });

    test('a fraction lands on the correct segment', () => {
      // 0.75 of 200 = 150 → 50 down the second segment.
      expect(pointAlongPath(bent, 0.75)).toEqual({ x: 100, y: 50 });
      // 0.25 of 200 = 50 → half along the first segment.
      expect(pointAlongPath(bent, 0.25)).toEqual({ x: 50, y: 0 });
    });

    test('clamps and handles degenerate input', () => {
      expect(pointAlongPath(bent, -1)).toEqual({ x: 0, y: 0 });
      expect(pointAlongPath(bent, 2)).toEqual({ x: 100, y: 100 });
      expect(pointAlongPath([{ x: 5, y: 5 }], 0.5)).toEqual({ x: 5, y: 5 });
    });

    test('fractionAlongPath inverts pointAlongPath', () => {
      const at = pointAlongPath(bent, 0.75);
      expect(fractionAlongPath(bent, at)).toBeCloseTo(0.75, 5);
    });
  });

  describe('pointsToPath', () => {
    test('should return empty string for empty array', () => {
      expect(pointsToPath([])).toBe('');
    });

    test('should return M command for single point', () => {
      const points: Point[] = [{ x: 10, y: 20 }];
      expect(pointsToPath(points)).toBe('M 10 20');
    });

    test('should return M and L commands for two points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ];
      expect(pointsToPath(points)).toBe('M 0 0 L 100 50');
    });

    test('should handle multiple points with L commands', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 100 },
        { x: 100, y: 100 },
      ];
      expect(pointsToPath(points)).toBe('M 0 0 L 50 0 L 50 100 L 100 100');
    });

    test('should handle decimal coordinates', () => {
      const points: Point[] = [
        { x: 10.5, y: 20.75 },
        { x: 30.25, y: 40.125 },
      ];
      expect(pointsToPath(points)).toBe('M 10.5 20.75 L 30.25 40.125');
    });
  });

  describe('pointsToSmoothPath', () => {
    test('should return empty string for empty array', () => {
      expect(pointsToSmoothPath([])).toBe('');
    });

    test('should return M command for single point', () => {
      const points: Point[] = [{ x: 10, y: 20 }];
      expect(pointsToSmoothPath(points)).toBe('M 10 20');
    });

    test('should return straight line for two points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ];
      expect(pointsToSmoothPath(points)).toBe('M 0 0 L 100 50');
    });

    test('should include quadratic curves for three or more points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 100 },
        { x: 100, y: 100 },
      ];
      const path = pointsToSmoothPath(points);

      // Should start with M
      expect(path).toMatch(/^M 0 0/);
      // Should contain Q (quadratic curve) for rounded corners
      expect(path).toContain('Q');
      // Should end near the last point
      expect(path).toContain('100 100');
    });

    test('should respect cornerRadius parameter', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ];

      const smallRadius = pointsToSmoothPath(points, 4);
      const largeRadius = pointsToSmoothPath(points, 16);

      // Both should be valid paths but with different curves
      expect(smallRadius).toMatch(/^M/);
      expect(largeRadius).toMatch(/^M/);
      // They should be different due to different radii
      expect(smallRadius).not.toBe(largeRadius);
    });

    test('should handle very short segments gracefully', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 2, y: 0 }, // Very short segment
        { x: 2, y: 100 },
      ];
      const path = pointsToSmoothPath(points, 8);

      // Should not throw and should produce a valid path
      expect(path).toMatch(/^M/);
    });
  });

  describe('calculatePathMidpoint', () => {
    test('should return origin for empty array', () => {
      expect(calculatePathMidpoint([])).toEqual({ x: 0, y: 0 });
    });

    test('should return the point for single point', () => {
      const points: Point[] = [{ x: 50, y: 75 }];
      expect(calculatePathMidpoint(points)).toEqual({ x: 50, y: 75 });
    });

    test('should return midpoint for two points on horizontal line', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];
      const midpoint = calculatePathMidpoint(points);
      expect(midpoint.x).toBeCloseTo(50, 5);
      expect(midpoint.y).toBeCloseTo(0, 5);
    });

    test('should return midpoint for two points on vertical line', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ];
      const midpoint = calculatePathMidpoint(points);
      expect(midpoint.x).toBeCloseTo(0, 5);
      expect(midpoint.y).toBeCloseTo(50, 5);
    });

    test('should return midpoint for diagonal line', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ];
      const midpoint = calculatePathMidpoint(points);
      expect(midpoint.x).toBeCloseTo(50, 5);
      expect(midpoint.y).toBeCloseTo(50, 5);
    });

    test('should calculate midpoint along multi-segment path', () => {
      // L-shaped path: right then down
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },  // First segment: 100 units
        { x: 100, y: 100 }, // Second segment: 100 units
      ];
      // Total length: 200, midpoint at 100 units
      // First segment ends at 100 units, so midpoint is at end of first segment
      const midpoint = calculatePathMidpoint(points);
      expect(midpoint.x).toBeCloseTo(100, 5);
      expect(midpoint.y).toBeCloseTo(0, 5);
    });

    test('should handle unequal segment lengths', () => {
      // Path with unequal segments
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 30, y: 0 },  // First segment: 30 units
        { x: 30, y: 90 }, // Second segment: 90 units
      ];
      // Total length: 120, midpoint at 60 units
      // First segment is 30 units, so midpoint is 30 units into second segment
      // At y = 0 + 30 = 30
      const midpoint = calculatePathMidpoint(points);
      expect(midpoint.x).toBeCloseTo(30, 5);
      expect(midpoint.y).toBeCloseTo(30, 5);
    });
  });

  describe('edge path generation scenarios', () => {
    test('straight horizontal edge between two nodes', () => {
      // Simulates edge from node at (0,0) width 120 to node at (250,0)
      // Edge should connect right side of first node (x=120) to left side of second (x=250)
      // Both at vertical center (y=30 for height 60)
      const points: Point[] = [
        { x: 120, y: 30 },
        { x: 250, y: 30 },
      ];

      const path = pointsToPath(points);
      expect(path).toBe('M 120 30 L 250 30');

      const labelPos = calculatePathMidpoint(points);
      expect(labelPos.x).toBeCloseTo(185, 5); // (120 + 250) / 2
      expect(labelPos.y).toBeCloseTo(30, 5);
    });

    test('orthogonal edge with one bend', () => {
      // Edge that goes right then down (L-shaped)
      const points: Point[] = [
        { x: 120, y: 30 },  // Start: right side of first node
        { x: 185, y: 30 },  // Bend point
        { x: 185, y: 130 }, // End: left side of second node
      ];

      const smoothPath = pointsToSmoothPath(points, 8);

      // Should have a quadratic curve at the bend
      expect(smoothPath).toContain('Q');
      // Should start at first point
      expect(smoothPath).toMatch(/^M 120 30/);
    });

    test('orthogonal edge with two bends', () => {
      // Edge that goes: right, down, right (S-shaped or step pattern)
      const points: Point[] = [
        { x: 120, y: 30 },
        { x: 150, y: 30 },
        { x: 150, y: 80 },
        { x: 250, y: 80 },
      ];

      const smoothPath = pointsToSmoothPath(points, 8);

      // Should have quadratic curves at both bends
      const qCount = (smoothPath.match(/Q/g) || []).length;
      expect(qCount).toBe(2);
    });
  });
});
