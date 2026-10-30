import { describe, expect, test } from 'bun:test';
import type { C4Model } from './c4';
import type { DecorationDraftC4, SubsystemDecoration } from './decoration';
import { applyDecorationC4 } from './decorationC4';

const base: C4Model = {
  view: 'container',
  system: { id: 'system:app', label: 'App' },
  nodes: [{
    kind: 'container', id: 'container:desktop', label: 'Desktop',
    containerKind: 'application', technology: 'React', state: 'accepted',
  }],
  edges: [],
};

function decoration(c4?: DecorationDraftC4): SubsystemDecoration {
  return {
    version: 1, id: 'dec-sync', title: 'Sync', description: '', trails: [],
    draft: { c4 },
    provenance: { source: 'author', at: '2026-10-26T00:00:00.000Z' },
  };
}

const c4: DecorationDraftC4 = {
  elements: [
    {
      kind: 'component', id: 'component:sync', label: 'Sync coordinator',
      container: 'container:desktop', technology: 'TypeScript', members: ['sync'],
    },
    {
      kind: 'container', id: 'container:worker', label: 'Sync worker',
      containerKind: 'application', technology: 'Bun', process: 'sync-worker',
    },
    {
      kind: 'component', id: 'component:queue', label: 'Upload queue',
      container: 'container:worker', technology: 'TypeScript', members: ['upload'],
    },
  ],
  edges: [{
    id: 'draft:dispatch', source: 'component:sync', target: 'component:queue',
    label: 'Dispatches upload', protocol: 'RPC', mechanisms: ['calls'], count: 1,
  }],
};

describe('applyDecorationC4', () => {
  test('adds proposed containers, components in base/draft containers, and relationships', () => {
    const before = JSON.stringify({ base, c4 });
    const projected = applyDecorationC4(base, decoration(c4));
    expect(projected.nodes).toHaveLength(4);
    expect(projected.nodes[0]?.state).toBe('accepted');
    expect(projected.nodes.slice(1).every((node) => node.state === 'proposed')).toBe(true);
    expect(projected.nodes[2]?.parentId).toBe(base.system.id);
    expect(projected.edges).toEqual(c4.edges!.map((edge) => ({ ...edge, draft: true })));
    expect(projected.nodes[1]).toMatchObject({ container: 'container:desktop', members: ['sync'] });
    expect(projected.nodes[3]).toMatchObject({ container: 'container:worker', members: ['upload'] });
    expect(JSON.stringify({ base, c4 })).toBe(before);
  });

  test('turning the decoration off restores the original base projection', () => {
    expect(applyDecorationC4(base, decoration(c4), false)).toBe(base);
    expect(applyDecorationC4(base, decoration())).toBe(base);
  });

  test('can relate two existing elements without adding boxes', () => {
    const existing: C4Model = {
      ...base,
      nodes: [
        ...base.nodes,
        { kind: 'external-system', id: 'external:remote', label: 'Remote', state: 'accepted' },
      ],
    };
    const edges = [{
      id: 'draft:upload', source: 'container:desktop', target: 'external:remote',
      label: 'Uploads drawing', mechanisms: ['calls'], count: 1,
    }];
    expect(applyDecorationC4(existing, decoration({ edges })).edges)
      .toEqual(edges.map((edge) => ({ ...edge, draft: true })));
  });

  test('marks only decoration relationships as draft without changing their text or the base', () => {
    const baseEdge = {
      id: 'base:flow', source: 'container:desktop', target: 'container:desktop',
      label: 'Existing flow', protocol: 'event', mechanisms: ['produces'], count: 1,
    };
    const withBaseEdge = { ...base, edges: [baseEdge] };
    const projected = applyDecorationC4(withBaseEdge, decoration(c4));
    expect(projected.edges[0]).toBe(baseEdge);
    expect(projected.edges[0]?.draft).toBeUndefined();
    expect(projected.edges[1]).toMatchObject({ draft: true, label: 'Dispatches upload', protocol: 'RPC' });
    expect(c4.edges![0]!.draft).toBeUndefined();
  });

  test('rejects ids that would replace base or draft elements', () => {
    const duplicate = { ...c4.elements![1]!, id: 'container:desktop' };
    expect(() => applyDecorationC4(base, decoration({ elements: [duplicate] })))
      .toThrow('Duplicate C4 element id');
    expect(() => applyDecorationC4(base, decoration({
      elements: [c4.elements![1]!, c4.elements![1]!],
    }))).toThrow('Duplicate C4 element id');
  });

  test('rejects missing containers and conflicting parents', () => {
    expect(() => applyDecorationC4(base, decoration({ elements: [c4.elements![2]!] })))
      .toThrow('Missing C4 container');
    expect(() => applyDecorationC4(base, decoration({
      elements: [{ ...c4.elements![0]!, parentId: 'container:other' }],
    }))).toThrow('Conflicting C4 parent');
    expect(() => applyDecorationC4(base, decoration({
      elements: [{ ...c4.elements![1]!, parentId: 'system:other' }],
    }))).toThrow('Unknown C4 system');
  });

  test('rejects missing edge endpoints and duplicate edge ids', () => {
    expect(() => applyDecorationC4(base, decoration({ edges: c4.edges })))
      .toThrow('Missing C4 endpoint');
    const projected = applyDecorationC4(base, decoration(c4));
    expect(() => applyDecorationC4(projected, decoration({ edges: c4.edges })))
      .toThrow('Duplicate C4 edge id');
  });

  test('supports external systems and people outside the system boundary', () => {
    const projected = applyDecorationC4(base, decoration({
      elements: [
        { kind: 'external-system', id: 'external:remote', label: 'Remote', members: ['remote'] },
        { kind: 'person', id: 'person:author', label: 'Author' },
      ],
    }));
    expect(projected.nodes.slice(1).every((node) => !node.parentId && node.state === 'proposed'))
      .toBe(true);
    expect(() => applyDecorationC4(base, decoration({
      elements: [{ kind: 'person', id: 'person:author', label: 'Author', parentId: base.system.id }],
    }))).toThrow('External C4 element cannot have a parent');
  });
});
