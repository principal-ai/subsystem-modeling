import { describe, expect, test } from 'bun:test';
import {
  toC4,
  deriveRepoKey,
  labelFromPurl,
  isGroundedComponent,
} from './toC4';
import type { SubsystemModelDocument } from './model';

const REPO = 'pkg:github/acme/repo';

const doc: SubsystemModelDocument = {
  components: [
    { alias: 'a', name: 'Alpha', construct: 'function', file: 'src/a.ts', purl: `${REPO}#src/a.ts`, process: 'p1' },
    { alias: 'b', name: 'Beta', construct: 'function', file: 'src/b.ts', purl: `${REPO}#src/b.ts`, process: 'p1' },
    { alias: 's', name: 'Cache', construct: 'store', file: 'src/s.ts', purl: `${REPO}#src/s.ts`, process: 'p1' },
    { alias: 'c', name: 'Gamma', construct: 'function', file: 'src/c.ts', purl: `${REPO}#src/c.ts`, process: 'p2' },
    { alias: 'x', name: 'Gist API', construct: 'external', file: '', purl: 'external:api.github.com/gists' },
    { alias: 'agent', name: 'Maintenance agent', construct: 'custom_entity', file: '', purl: 'external' },
  ],
  relations: [
    { id: 'r1', from: 'a', to: 'b', relationType: 'method' }, // intra p1
    { id: 'r2', from: 'a', to: 'c', relationType: 'method' },
    { id: 'r3', from: 'b', to: 'c', relationType: 'method' },
    { id: 'r4', from: 'a', to: 'x', relationType: 'method' },
  ],
  walkthroughs: [
    {
      id: 'w1',
      title: 'flow',
      steps: [
        { from: 'b', to: 'c', mechanism: 'calls', file: 'src/b.ts', line: 1, purl: `${REPO}#src/b.ts`, symbol: 'Beta' },
        { from: 'a', to: 'c', mechanism: 'calls', file: 'src/a.ts', line: 2, purl: `${REPO}#src/a.ts`, symbol: 'Alpha' },
        { from: 'a', to: 'agent', mechanism: 'calls', file: 'src/a.ts', line: 3, purl: `${REPO}#src/a.ts`, symbol: 'Alpha' },
      ],
    },
  ],
};

describe('helpers', () => {
  test('deriveRepoKey ignores external purls', () => {
    expect(deriveRepoKey(doc)).toBe(REPO);
  });

  test('labelFromPurl trims scheme and keeps owner/name', () => {
    expect(labelFromPurl('pkg:github/acme/repo#src/a.ts')).toBe('acme/repo');
    expect(labelFromPurl('external:api.github.com/gists')).toBe('api.github.com/gists');
  });

  test('isGroundedComponent excludes externals and entities', () => {
    expect(isGroundedComponent(doc.components[0]!)).toBe(true);
    expect(isGroundedComponent(doc.components[4]!)).toBe(false);
    expect(isGroundedComponent(doc.components[5]!)).toBe(false);
  });
});

describe('container view', () => {
  const model = toC4(doc, { view: 'container', systemLabel: 'Acme' });

  test('system is the repo, containers are processes', () => {
    expect(model.system.id).toBe(`system:${REPO}`);
    expect(model.system.label).toBe('Acme');
    expect(model.nodes.map((n) => n.id).sort()).toEqual(
      [`container:p1`, `container:p2`, `external:external:api.github.com/gists`, `actor:agent`].sort(),
    );
  });

  test('container members and store flag', () => {
    const p1 = model.nodes.find((n) => n.id === 'container:p1')!;
    expect(p1.members.sort()).toEqual(['a', 'b', 's']);
    expect(p1.isStore).toBe(true);
  });

  test('one system group holds the container nodes', () => {
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]!.kind).toBe('system');
    expect(model.groups[0]!.memberIds.sort()).toEqual(['container:p1', 'container:p2']);
  });

  test('edges roll up and intra-container edges drop', () => {
    const byId = Object.fromEntries(model.edges.map((e) => [e.id, e]));
    // a->b is intra-p1 — dropped.
    expect(model.edges.some((e) => e.source === e.target)).toBe(false);
    const rel = byId['relationship:container:p1\u0000container:p2']!;
    expect(rel.kind).toBe('relationship');
    expect(rel.count).toBe(2); // r2 + r3
    const flow = byId['flow:container:p1\u0000container:p2']!;
    expect(flow.count).toBe(2); // a->c + b->c
    expect(byId['relationship:container:p1\u0000external:external:api.github.com/gists']).toBeDefined();
    expect(byId['flow:container:p1\u0000actor:agent']).toBeDefined();
    expect(model.edges).toHaveLength(4);
  });
});

describe('component view', () => {
  const model = toC4(doc, { view: 'component' });

  test('components parent to their container; externals stay root', () => {
    const a = model.nodes.find((n) => n.id === 'component:a')!;
    expect(a.parentId).toBe('container:p1');
    const c = model.nodes.find((n) => n.id === 'component:c')!;
    expect(c.parentId).toBe('container:p2');
    expect(model.nodes.map((n) => n.id).sort()).toEqual(
      ['component:a', 'component:b', 'component:s', 'component:c', 'external:external:api.github.com/gists', 'actor:agent'].sort(),
    );
  });

  test('nested groups: containers nest in the system', () => {
    const p1 = model.groups.find((g) => g.id === 'container:p1')!;
    expect(p1.parentId).toBe(`system:${REPO}`);
    expect(p1.memberIds.sort()).toEqual(['component:a', 'component:b', 'component:s']);
    const system = model.groups.find((g) => g.kind === 'system')!;
    expect(system.memberIds.sort()).toEqual(['container:p1', 'container:p2']);
  });

  test('intra-container but cross-component edges survive', () => {
    // a->b (same container, different components) survives at component level.
    expect(model.edges.some((e) => e.source === 'component:a' && e.target === 'component:b')).toBe(true);
    expect(model.edges.some((e) => e.source === e.target)).toBe(false);
  });
});
