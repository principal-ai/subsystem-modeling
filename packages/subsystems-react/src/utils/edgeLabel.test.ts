/**
 * Tests for the shared edge-label geometry.
 *
 * The overlay and the ELK reservation both import these values, so the
 * invariants here (fixed box, min edge run covers the box) are what keep
 * rendered labels consistent and non-overlapping.
 */

import { describe, test, expect } from 'bun:test';
import {
  EDGE_LABEL_WIDTH,
  EDGE_LABEL_SIDE_PADDING,
  EDGE_LABEL_EDGE_GAP,
} from './edgeLabel';

describe('edge-label geometry', () => {
  test('the labelled-edge gap is the box plus clearance on both sides', () => {
    expect(EDGE_LABEL_EDGE_GAP).toBe(
      EDGE_LABEL_WIDTH + EDGE_LABEL_SIDE_PADDING * 2,
    );
    expect(EDGE_LABEL_EDGE_GAP).toBeGreaterThan(EDGE_LABEL_WIDTH);
  });
});