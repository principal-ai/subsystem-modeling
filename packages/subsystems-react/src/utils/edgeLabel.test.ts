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
  estimateEdgeLabelWidth,
} from './edgeLabel';

describe('estimateEdgeLabelWidth', () => {
  test('grows with the text', () => {
    expect(estimateEdgeLabelWidth('file I/O')).toBeGreaterThan(estimateEdgeLabelWidth('RPC'));
  });

  test('clamps a very short label to a readable minimum', () => {
    expect(estimateEdgeLabelWidth('')).toBe(48);
    expect(estimateEdgeLabelWidth('a')).toBe(48);
  });

  test('fits the longest C4 protocol we render', () => {
    // A rough sanity ceiling: 'file I/O' plus chip padding must sit under the
    // shared fixed width, or C4 would be wider than the box it replaced.
    expect(estimateEdgeLabelWidth('file I/O')).toBeLessThan(EDGE_LABEL_WIDTH);
  });
});

describe('edge-label geometry', () => {
  test('the reserved run is the chip plus clearance on both sides', () => {
    // The reserved label box carries the chip width plus the side padding,
    // because ELK's CENTER_LAYER adds no clearance of its own.
    expect(EDGE_LABEL_EDGE_GAP).toBe(
      EDGE_LABEL_WIDTH + EDGE_LABEL_SIDE_PADDING * 2,
    );
  });
});