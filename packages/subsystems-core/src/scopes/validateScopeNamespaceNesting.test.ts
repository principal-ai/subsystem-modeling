import { describe, expect, test } from 'bun:test';
import { validateScopeNamespaceNesting } from './validateScopeNamespaceNesting';
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

function eventsCanvas(namespaces: Array<{ name: string; paths?: string[] }>): ExtendedCanvas {
  return {
    nodes: namespaces.map((ns, i) => ({
      id: `n${i}`,
      type: 'event-namespace',
      namespace: {
        name: ns.name,
        description: `${ns.name} namespace`,
        ...(ns.paths !== undefined ? { paths: ns.paths } : {}),
        events: [],
      },
      x: 0, y: 0, width: 100, height: 50,
    })),
    edges: [],
  } as ExtendedCanvas;
}

describe('validateScopeNamespaceNesting', () => {
  test('passes when every namespace path is covered by its scope path', () => {
    const violations = validateScopeNamespaceNesting({
      scopesCanvas: scopesCanvas([{ scope: 'a', paths: ['packages/subsystems-core/src'] }]),
      eventsCanvases: [
        {
          scope: 'a',
          eventsCanvas: eventsCanvas([
            { name: 'events', paths: ['packages/subsystems-core/src/events'] },
            { name: 'workflow', paths: ['packages/subsystems-core/src/workflow'] },
          ]),
        },
      ],
    });
    expect(violations).toHaveLength(0);
  });

  test('flags namespace paths that escape their scope', () => {
    const violations = validateScopeNamespaceNesting({
      scopesCanvas: scopesCanvas([{ scope: 'a', paths: ['packages/subsystems-core/src'] }]),
      eventsCanvases: [
        {
          scope: 'a',
          eventsCanvas: eventsCanvas([
            { name: 'rogue', paths: ['packages/subsystems-react/src/hooks'] },
          ]),
        },
      ],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe('scopes-namespace-paths-escape');
    expect(violations[0].severity).toBe('error');
    expect(violations[0].message).toContain('rogue');
    expect(violations[0].message).toContain('packages/subsystems-react/src/hooks');
  });

  test('namespace path equal to scope path is covered (not an escape)', () => {
    const violations = validateScopeNamespaceNesting({
      scopesCanvas: scopesCanvas([{ scope: 'a', paths: ['packages/subsystems-core/src'] }]),
      eventsCanvases: [
        {
          scope: 'a',
          eventsCanvas: eventsCanvas([{ name: 'whole', paths: ['packages/subsystems-core/src'] }]),
        },
      ],
    });
    expect(violations).toHaveLength(0);
  });

  test('scope without paths imposes no constraint (opt-out)', () => {
    const violations = validateScopeNamespaceNesting({
      scopesCanvas: scopesCanvas([{ scope: 'a' }]),
      eventsCanvases: [
        {
          scope: 'a',
          eventsCanvas: eventsCanvas([{ name: 'anywhere', paths: ['packages/anywhere/src'] }]),
        },
      ],
    });
    expect(violations).toHaveLength(0);
  });

  test('namespaces without paths are skipped (opt-in per namespace)', () => {
    const violations = validateScopeNamespaceNesting({
      scopesCanvas: scopesCanvas([{ scope: 'a', paths: ['packages/subsystems-core/src'] }]),
      eventsCanvases: [
        {
          scope: 'a',
          eventsCanvas: eventsCanvas([{ name: 'unenforced' }]),
        },
      ],
    });
    expect(violations).toHaveLength(0);
  });

  test('multiple scope paths: namespace covered by any one is allowed', () => {
    const violations = validateScopeNamespaceNesting({
      scopesCanvas: scopesCanvas([
        { scope: 'a', paths: ['packages/subsystems-core/src', 'packages/subsystems-core/generated'] },
      ]),
      eventsCanvases: [
        {
          scope: 'a',
          eventsCanvas: eventsCanvas([
            { name: 'gen', paths: ['packages/subsystems-core/generated/events'] },
          ]),
        },
      ],
    });
    expect(violations).toHaveLength(0);
  });
});
