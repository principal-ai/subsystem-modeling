import { describe, expect, test } from 'bun:test';
import { validateAreaScopeDisjoint } from './validateAreaScopeDisjoint';
import type { AuxiliaryManifest } from '../types/auxiliary';
import type { ExtendedCanvas } from '../types/canvas';

function scopesCanvas(nodes: Array<{ scope: string; paths?: string[] }>): ExtendedCanvas {
  return {
    nodes: nodes.map((n, i) => ({
      id: `s${i}`,
      type: 'otel-scope',
      description: `${n.scope} scope`,
      ...(n.paths !== undefined ? { paths: n.paths } : {}),
      otel: { scope: n.scope },
      x: 0, y: 0, width: 100, height: 50,
    })),
    edges: [],
  } as ExtendedCanvas;
}

describe('validateAreaScopeDisjoint', () => {
  test('returns no violations when areas and scopes are disjoint', () => {
    const manifest: AuxiliaryManifest = {
      areas: [{ name: 'Docs', paths: ['docs'], description: 'd' }],
    };
    const violations = validateAreaScopeDisjoint({
      manifest,
      scopesCanvas: scopesCanvas([{ scope: 'core', paths: ['packages/subsystems-core/src'] }]),
    });
    expect(violations).toHaveLength(0);
  });

  test('flags exact overlap with a scope path', () => {
    const manifest: AuxiliaryManifest = {
      areas: [{ name: 'Core', paths: ['packages/subsystems-core/src'], description: 'd' }],
    };
    const violations = validateAreaScopeDisjoint({
      manifest,
      scopesCanvas: scopesCanvas([{ scope: 'core', paths: ['packages/subsystems-core/src'] }]),
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe('auxiliary-area-scope-overlap');
  });

  test('flags parent-child overlap (area covering a scope path)', () => {
    const manifest: AuxiliaryManifest = {
      areas: [{ name: 'All', paths: ['packages'], description: 'd' }],
    };
    const violations = validateAreaScopeDisjoint({
      manifest,
      scopesCanvas: scopesCanvas([{ scope: 'core', paths: ['packages/subsystems-core/src'] }]),
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe('auxiliary-area-scope-overlap');
  });

  test('flags parent-child overlap (scope path covering an area)', () => {
    const manifest: AuxiliaryManifest = {
      areas: [{ name: 'Inner', paths: ['packages/subsystems-core/src/docs'], description: 'd' }],
    };
    const violations = validateAreaScopeDisjoint({
      manifest,
      scopesCanvas: scopesCanvas([{ scope: 'core', paths: ['packages/subsystems-core/src'] }]),
    });
    expect(violations).toHaveLength(1);
  });

  test('no scopes canvas means no cross-check', () => {
    const manifest: AuxiliaryManifest = {
      areas: [{ name: 'Docs', paths: ['docs'], description: 'd' }],
    };
    const violations = validateAreaScopeDisjoint({ manifest });
    expect(violations).toHaveLength(0);
  });

  test('scopes without paths impose no constraint', () => {
    const manifest: AuxiliaryManifest = {
      areas: [{ name: 'Docs', paths: ['docs'], description: 'd' }],
    };
    const violations = validateAreaScopeDisjoint({
      manifest,
      scopesCanvas: scopesCanvas([{ scope: 'core' }]),
    });
    expect(violations).toHaveLength(0);
  });
});
