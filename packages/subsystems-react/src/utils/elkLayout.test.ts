/**
 * Tests for ELK Layout Utility
 *
 * Tests the pure helper functions that don't require the ELK runtime.
 * The computeElkLayout function is tested via Storybook visual tests
 * since ELK requires a web worker environment.
 */

import { describe, test, expect } from 'bun:test';
import {
  pointsToPath,
  pointsToSmoothPath,
  calculatePathMidpoint,
  type Point,
} from './elkLayout';

describe('elkLayout helper functions', () => {
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
