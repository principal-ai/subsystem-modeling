/**
 * Direction wiring for the layered layout.
 *
 * ELK itself can't run under bun's test runner (elkjs wants a Web Worker, so
 * `computeElkLayout` falls back to manual positions), which makes the rendered
 * geometry identical in every direction. What is testable — and what actually
 * decides the axis — is the mapping from the canvas option onto
 * `elk.direction`, so that is what these tests pin.
 */
import { describe, expect, test } from 'bun:test';
import { elkDirectionFor } from './model';

describe('elkDirectionFor', () => {
  test('horizontal flow lays layers left-to-right', () => {
    expect(elkDirectionFor('horizontal', true)).toBe('RIGHT');
  });

  test('vertical flow lays layers top-to-bottom', () => {
    expect(elkDirectionFor('vertical', true)).toBe('DOWN');
  });

  test('edge-less containment keeps its DOWN + grid treatment either way', () => {
    expect(elkDirectionFor('horizontal', false)).toBe('DOWN');
    expect(elkDirectionFor('vertical', false)).toBe('DOWN');
  });
});
