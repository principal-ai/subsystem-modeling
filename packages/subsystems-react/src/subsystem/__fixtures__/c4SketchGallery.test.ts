import { describe, expect, test } from 'bun:test';
import type { C4Container } from '../c4';
import { C4_SKETCH_DESCRIPTION_MAX } from '../c4Sketch';
import {
  CONTAINER_MATRIX_SKETCH,
  DESCRIPTION_BOUNDARY_SKETCH,
  MAINTENANCE_BRIDGE_SKETCH,
  OPENBOT_SKETCH,
  STUDIO_SKETCH,
} from './c4SketchGallery';

const containers = (sketch: { model: { nodes: Array<{ kind: string }> } }) =>
  sketch.model.nodes.filter((node): node is C4Container => node.kind === 'container');

describe('C4 sketch gallery fixtures', () => {
  test('the studio sketch carries the shipped system containers', () => {
    const labels = containers(STUDIO_SKETCH).map((c) => c.label);
    expect(labels).toEqual([
      'Studio host',
      'Studio renderer',
      'Principal CLI',
      'Site — web',
      'Model store',
    ]);
    const store = containers(STUDIO_SKETCH).find((c) => c.label === 'Model store');
    expect(store?.containerKind).toBe('data-store');
    expect(containers(STUDIO_SKETCH).every((c) => c.state === 'proposed')).toBe(true);
  });

  test('the real sketches keep their authored container counts', () => {
    expect(containers(OPENBOT_SKETCH)).toHaveLength(12);
    expect(containers(MAINTENANCE_BRIDGE_SKETCH)).toHaveLength(6);
    expect(OPENBOT_SKETCH.notes?.length ?? 0).toBeGreaterThan(0);
    expect(MAINTENANCE_BRIDGE_SKETCH.notes?.length ?? 0).toBeGreaterThan(0);
  });

  test('the matrix covers kind, state, technology, and member-count variants', () => {
    const rows = containers(CONTAINER_MATRIX_SKETCH);
    expect(rows.length).toBe(7);
    expect(new Set(rows.map((c) => c.containerKind))).toEqual(
      new Set(['application', 'data-store']),
    );
    expect(new Set(rows.map((c) => c.state))).toEqual(
      new Set(['accepted', 'proposed']),
    );
    expect(rows.some((c) => c.technology === '')).toBe(true);
    expect(rows.some((c) => c.label.length > 50)).toBe(true);
    expect(rows.some((c) => c.label === 'Crowded container')).toBe(true);
    expect(rows.some((c) => c.label === 'Empty but accepted')).toBe(true);
  });

  test('descriptions stay inside the 200-character contract', () => {
    for (const sketch of [
      STUDIO_SKETCH,
      CONTAINER_MATRIX_SKETCH,
      DESCRIPTION_BOUNDARY_SKETCH,
    ]) {
      expect((sketch.description ?? '').length).toBeLessThanOrEqual(
        C4_SKETCH_DESCRIPTION_MAX,
      );
    }
    expect(DESCRIPTION_BOUNDARY_SKETCH.description?.length).toBeGreaterThan(180);
    expect(DESCRIPTION_BOUNDARY_SKETCH.notes?.length ?? 0).toBeGreaterThan(200);
  });
});
