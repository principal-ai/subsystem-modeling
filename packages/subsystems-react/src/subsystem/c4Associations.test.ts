import { describe, expect, test } from 'bun:test';
import { toC4, indexAssociations } from './toC4';
import type { C4Association, C4AssociationState, C4ElementType } from './toC4';
import { deriveConcerns, suggestMerges, buildAssociations, mergeAssociations, summarizeAssociations } from './c4Associations';
import type { SubsystemModelDocument } from './model';

const REPO = 'pkg:github/acme/repo';

function assoc(over: Partial<C4Association> & { id: string; sourceKeys: string[] }): C4Association {
  return {
    level: 'container',
    label: over.id,
    type: 'application' as C4ElementType,
    state: 'proposed' as C4AssociationState,
    ...over,
  };
}

const doc: SubsystemModelDocument = {
  title: 'test',
  components: [
    { alias: 'a', name: 'Alpha', construct: 'function', file: 'src/a.ts', purl: `${REPO}#src/a.ts`, process: 'p1', framework: 'react' },
    { alias: 'b', name: 'Beta', construct: 'function', file: 'src/b.ts', purl: `${REPO}#src/b.ts`, process: 'p1', framework: 'react' },
    { alias: 's', name: 'Cache', construct: 'store', file: 'src/s.ts', purl: `${REPO}#src/s.ts`, process: 'p1', declaration: { kind: 'store', properties: [] } },
    { alias: 'c', name: 'Gamma', construct: 'function', file: 'src/c.ts', purl: `${REPO}#src/c.ts`, process: 'p2' },
    { alias: 'd', name: 'Delta', construct: 'function', file: 'src/d.ts', purl: `${REPO}#src/d.ts`, process: 'p3' },
    { alias: 'lib', name: 'Lib', construct: 'interface', file: 'src/lib.ts', purl: `${REPO}#src/lib.ts`, process: 'plib' },
    { alias: 'u', name: 'Orphan', construct: 'function', file: 'src/u.ts', purl: `${REPO}#src/u.ts` },
  ],
  trails: [
    {
      id: 'w1',
      title: 'flow',
      steps: [
        { from: 'a', to: 'b', mechanism: 'calls', file: 'src/a.ts', line: 1, purl: `${REPO}#src/a.ts`, symbol: 'Alpha' },
        { from: 'b', to: 'c', mechanism: 'calls', file: 'src/b.ts', line: 1, purl: `${REPO}#src/b.ts`, symbol: 'Beta' },
        { from: 'a', to: 'c', mechanism: 'calls', file: 'src/a.ts', line: 2, purl: `${REPO}#src/a.ts`, symbol: 'Alpha' },
        { from: 'c', to: 'd', mechanism: 'calls', file: 'src/c.ts', line: 1, purl: `${REPO}#src/c.ts`, symbol: 'Gamma' },
        { from: 'd', to: 'u', mechanism: 'calls', file: 'src/d.ts', line: 1, purl: `${REPO}#src/d.ts`, symbol: 'Delta' },
      ],
    },
  ],
};

describe('indexAssociations', () => {
  test('is empty for undefined input', () => {
    expect(indexAssociations(undefined).byKey.size).toBe(0);
  });

  test('maps every claimed source key to its association', () => {
    const { byKey } = indexAssociations([assoc({ id: 'container:x', sourceKeys: ['p1', 'p1b'] })]);
    expect(byKey.get('p1')?.id).toBe('container:x');
    expect(byKey.get('p1b')?.id).toBe('container:x');
  });

  test('accepted outranks proposed for the same key', () => {
    const { byKey } = indexAssociations([
      assoc({ id: 'container:guess', sourceKeys: ['p1'], state: 'proposed' }),
      assoc({ id: 'container:sure', sourceKeys: ['p1'], state: 'accepted' }),
    ]);
    expect(byKey.get('p1')?.id).toBe('container:sure');
  });

  test('reports a contested key rather than silently picking one', () => {
    const { byKey, contested } = indexAssociations([
      assoc({ id: 'container:a', sourceKeys: ['p1'], state: 'accepted' }),
      assoc({ id: 'container:b', sourceKeys: ['p1'], state: 'accepted' }),
    ]);
    expect(byKey.get('p1')?.id).toBe('container:a');
    expect(contested).toEqual([{ key: 'p1', kept: 'container:a', dropped: 'container:b' }]);
  });
});

describe('merging (the dedup mechanism)', () => {
  test('two process keys claimed by one id collapse into one box', () => {
    const model = toC4(doc, {
      view: 'container',
      associations: [assoc({ id: 'container:studio-host', sourceKeys: ['p1', 'p2'], state: 'accepted', label: 'Studio Host' })],
    });
    const host = model.nodes.find((n) => n.id === 'container:studio-host');
    expect(host).toBeDefined();
    expect(host!.members.sort()).toEqual(['a', 'b', 'c', 's']);
    expect(model.nodes.filter((n) => n.kind === 'container').map((n) => n.id)).not.toContain('container:p1');
    expect(model.nodes.filter((n) => n.kind === 'container').map((n) => n.id)).not.toContain('container:p2');
  });

  test('the merged box records every key it absorbed, once each', () => {
    const model = toC4(doc, {
      associations: [assoc({ id: 'container:studio-host', sourceKeys: ['p1', 'p2'], state: 'accepted', label: 'Studio Host' })],
    });
    const host = model.nodes.find((n) => n.id === 'container:studio-host')!;
    expect(host.sourceKeys).toEqual(['p1', 'p2']);
  });

  test('a single-key node carries no sourceKeys list', () => {
    const model = toC4(doc, {
      associations: [assoc({ id: 'container:p1', sourceKeys: ['p1'], state: 'accepted' })],
    });
    expect(model.nodes.find((n) => n.id === 'container:p1')!.sourceKeys).toBeUndefined();
  });

  test('edges fold into the merged box and count once', () => {
    const model = toC4(doc, {
      associations: [assoc({ id: 'container:studio-host', sourceKeys: ['p1', 'p2'], state: 'accepted' })],
    });
    // a->b was intra-p1 (dropped); a->c + b->c were p1->p2 and now intra-box.
    expect(model.edges.some((e) => e.source === e.target)).toBe(false);
    // c->d is now studio-host -> p3, exactly one edge.
    const e = model.edges.find((x) => x.source === 'container:studio-host' && x.target === 'container:p3');
    expect(e?.count).toBe(1);
  });

  test('unclaimed keys still render, so the projection works with zero associations', () => {
    const model = toC4(doc, { view: 'container' });
    expect(model.nodes.map((n) => n.id).sort()).toContain('container:p1');
  });
});

describe('rejection', () => {
  test('a rejected container is not drawn', () => {
    const model = toC4(doc, {
      associations: [assoc({ id: 'container:singleton', sourceKeys: ['p3'], state: 'rejected' })],
    });
    expect(model.nodes.find((n) => n.id === 'container:p3')).toBeUndefined();
  });

  test('edges to a rejected container are dropped, not left dangling', () => {
    const model = toC4(doc, {
      associations: [assoc({ id: 'container:singleton', sourceKeys: ['p3'], state: 'rejected' })],
    });
    expect(model.edges.some((e) => e.target === 'container:p3' || e.source === 'container:p3')).toBe(false);
    for (const e of model.edges) {
      expect(model.nodes.some((n) => n.id === e.source)).toBe(true);
      expect(model.nodes.some((n) => n.id === e.target)).toBe(true);
    }
  });

  test('the system group does not list a rejected container', () => {
    const model = toC4(doc, {
      associations: [assoc({ id: 'container:singleton', sourceKeys: ['p3'], state: 'rejected' })],
    });
    const sys = model.groups.find((g) => g.kind === 'system')!;
    expect(sys.memberIds).not.toContain('container:p3');
  });
});

describe('decoration', () => {
  test('carries the confirmed C4 attributes onto the node', () => {
    const model = toC4(doc, {
      associations: [
        assoc({
          id: 'container:p1',
          sourceKeys: ['p1'],
          state: 'accepted',
          label: 'Studio Host',
          type: 'application',
          technology: 'Bun + Electrobun',
          description: 'Runs the audit pipeline and serves the model store.',
        }),
      ],
    });
    const n = model.nodes.find((x) => x.id === 'container:p1')!;
    expect(n.label).toBe('Studio Host');
    expect(n.decoration?.type).toBe('application');
    expect(n.decoration?.technology).toBe('Bun + Electrobun');
    expect(n.decoration?.state).toBe('accepted');
  });

  test('a proposed association still draws, marked as unconfirmed', () => {
    const model = toC4(doc, {
      associations: [assoc({ id: 'container:p1', sourceKeys: ['p1'], state: 'proposed', technology: 'React' })],
    });
    const n = model.nodes.find((x) => x.id === 'container:p1')!;
    expect(n.decoration?.state).toBe('proposed');
    expect(n.decoration?.technology).toBe('React');
  });

  test('in the component view, children nest under the merged container', () => {
    const model = toC4(doc, {
      view: 'component',
      associations: [assoc({ id: 'container:studio-host', sourceKeys: ['p1', 'p2'], state: 'accepted', label: 'Studio Host' })],
    });
    const a = model.nodes.find((n) => n.id === 'component:a')!;
    const c = model.nodes.find((n) => n.id === 'component:c')!;
    expect(a.parentId).toBe('container:studio-host');
    expect(c.parentId).toBe('container:studio-host');
    const frame = model.groups.find((g) => g.id === 'container:studio-host')!;
    expect(frame.label).toBe('Studio Host');
    expect(frame.memberIds.sort()).toEqual(['component:a', 'component:b', 'component:c', 'component:s']);
  });
});

describe('deriveConcerns', () => {
  test('flags a lone member as a singleton', () => {
    const out = deriveConcerns('graphify/extract', [
      { alias: 'x', construct: 'function', purl: `${REPO}#x.ts` },
    ]);
    expect(out.some((c) => c.kind === 'singleton')).toBe(true);
  });

  test('flags a memberless-of-runtime group as library-shaped', () => {
    const out = deriveConcerns(
      'subsystems-core',
      [
        { alias: 'a', construct: 'interface', purl: `${REPO}#a.ts` },
        { alias: 'b', construct: 'type_alias', purl: `${REPO}#b.ts` },
      ],
      { frameworks: [] },
    );
    expect(out.some((c) => c.kind === 'library_shaped')).toBe(true);
  });

  test('flags a runtime container with no technology', () => {
    const out = deriveConcerns('p2', [{ alias: 'c', construct: 'function', purl: `${REPO}#c.ts` }], { frameworks: [] });
    expect(out.some((c) => c.kind === 'missing_technology')).toBe(true);
  });

  test('does not demand technology once a framework is present', () => {
    const out = deriveConcerns('p1', [
      { alias: 'a', construct: 'function', purl: `${REPO}#a.ts` },
      { alias: 'b', construct: 'function', purl: `${REPO}#b.ts` },
    ], { frameworks: ['react'] });
    expect(out.some((c) => c.kind === 'missing_technology')).toBe(false);
  });

  test('flags members spanning two repo keys', () => {
    const out = deriveConcerns('p1', [
      { alias: 'a', construct: 'function', purl: `${REPO}#a.ts` },
      { alias: 'z', construct: 'function', purl: 'pkg:github/other/thing#z.ts' },
    ]);
    expect(out.some((c) => c.kind === 'spans_repos')).toBe(true);
  });

  test('flags a store with no storage kind', () => {
    const out = deriveConcerns('p1', [
      { alias: 'a', construct: 'function', purl: `${REPO}#a.ts` },
      { alias: 's', construct: 'store', purl: `${REPO}#s.ts`, declaration: { kind: 'store', properties: [] } },
    ]);
    expect(out.some((c) => c.kind === 'store_unclassified')).toBe(true);
  });

  test('a healthy container raises nothing', () => {
    const out = deriveConcerns(
      'subsystems-studio/host',
      [
        { alias: 'a', construct: 'function', purl: `${REPO}#a.ts` },
        { alias: 'b', construct: 'function', purl: `${REPO}#b.ts` },
        { alias: 's', construct: 'store', purl: `${REPO}#s.ts`, declaration: { kind: 'store', storage: 'memory', properties: [] } },
      ],
      { frameworks: ['bun'] },
    );
    expect(out).toHaveLength(0);
  });
});

describe('suggestMerges', () => {
  test('groups keys that share a trailing role', () => {
    const out = suggestMerges([
      { key: 'subsystems-studio/host', memberCount: 9 },
      { key: 'principal-studio/host', memberCount: 1 },
      { key: 'subsystems-studio/renderer', memberCount: 5 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('host');
    expect(out[0].keys).toEqual(['principal-studio/host', 'subsystems-studio/host']);
  });

  test('ignores a bare key that has no app/role shape', () => {
    const out = suggestMerges([{ key: 'subsystems-react', memberCount: 2 }, { key: 'subsystems-core', memberCount: 1 }]);
    expect(out).toHaveLength(0);
  });
});

describe('buildAssociations', () => {
  const rollup = [
    {
      key: 'subsystems-studio/host',
      frameworks: ['bun'],
      members: [
        { alias: 'a', construct: 'function', purl: `${REPO}#a.ts` },
        { alias: 's', construct: 'store', purl: `${REPO}#s.ts`, declaration: { kind: 'store', storage: 'disk', properties: [] } },
      ],
    },
    { key: 'subsystems-core', frameworks: [], members: [{ alias: 'i', construct: 'interface', purl: `${REPO}#i.ts` }] },
  ];

  test('proposes one association per derived key, never accepted', () => {
    const set = buildAssociations({ repoKey: REPO, rollup });
    expect(set.associations).toHaveLength(2);
    expect(set.associations.every((a) => a.state === 'proposed')).toBe(true);
  });

  test('infers a data store when a member declares disk storage', () => {
    const set = buildAssociations({ repoKey: REPO, rollup });
    const host = set.associations.find((a) => a.sourceKeys.includes('subsystems-studio/host'))!;
    expect(host.type).toBe('data-store');
  });

  test('infers a library for a memberless-of-runtime group', () => {
    const set = buildAssociations({ repoKey: REPO, rollup });
    const core = set.associations.find((a) => a.sourceKeys.includes('subsystems-core'))!;
    expect(core.type).toBe('library');
  });

  test('carries rationale so a reviewer sees why it was proposed', () => {
    const set = buildAssociations({ repoKey: REPO, rollup });
    const core = set.associations.find((a) => a.sourceKeys.includes('subsystems-core'))!;
    expect(core.rationale).toContain('library');
  });

  test('folds merged keys under one id without duplicating the element', () => {
    const set = buildAssociations({
      repoKey: REPO,
      rollup: [
        ...rollup,
        { key: 'principal-studio/host', frameworks: ['bun'], members: [{ alias: 'z', construct: 'function', purl: `${REPO}#z.ts` }] },
      ],
      merges: [{ id: 'container:studio-host', keys: ['subsystems-studio/host', 'principal-studio/host'] }],
    });
    const hosts = set.associations.filter((a) => a.id === 'container:studio-host');
    expect(hosts).toHaveLength(1);
    expect(hosts[0].sourceKeys.sort()).toEqual(['principal-studio/host', 'subsystems-studio/host']);
  });

  test('the built set, fed back to toC4, merges the graph', () => {
    const set = buildAssociations({
      repoKey: REPO,
      rollup: [
        { key: 'p1', frameworks: ['react'], members: [{ alias: 'a', construct: 'function', purl: `${REPO}#a.ts` }] },
        { key: 'p2', frameworks: ['react'], members: [{ alias: 'c', construct: 'function', purl: `${REPO}#c.ts` }] },
      ],
      merges: [{ id: 'container:studio-host', keys: ['p1', 'p2'] }],
    });
    const model = toC4(doc, { associations: set.associations });
    const host = model.nodes.find((n) => n.id === 'container:studio-host');
    expect(host).toBeDefined();
    // p1 holds a, b and the store s; p2 holds c. The merge takes them all.
    expect(host!.members.sort()).toEqual(['a', 'b', 'c', 's']);
    // Only the rolled-up keys are claimed. Keys the agent never looked at
    // still render as raw derived boxes — a partial association set must
    // never silently drop part of the architecture.
    expect(model.nodes.find((n) => n.id === 'container:p1')).toBeUndefined();
    expect(model.nodes.find((n) => n.id === 'container:p2')).toBeUndefined();
    expect(model.nodes.find((n) => n.id === 'container:p3')).toBeDefined();
  });
});

describe('mergeAssociations', () => {
  // Keys that appear in the shared `doc` fixture above, so the collapse can be
  // checked against a real projection rather than only a reshaped array.
  const set: C4Association[] = [
    assoc({ id: 'container:p1', sourceKeys: ['p1'] }),
    assoc({ id: 'container:p2', sourceKeys: ['p2'] }),
    assoc({ id: 'container:p3', sourceKeys: ['p3'] }),
  ];

  test('folds the named keys into the survivor as one association', () => {
    const out = mergeAssociations(set, ['p1', 'p2']);
    expect(out).toHaveLength(2);
    expect(out.find((a) => a.sourceKeys.includes('p1'))!.sourceKeys.sort()).toEqual(['p1', 'p2']);
  });

  test('the survivor keeps its id, so the box does not get a new identity', () => {
    const out = mergeAssociations(set, ['p1', 'p2']);
    expect(out.some((a) => a.id === 'container:p1')).toBe(true);
    expect(out.some((a) => a.id === 'container:p2')).toBe(false);
  });

  test('keeps source keys as keys — never rewrites one to an element id', () => {
    const out = mergeAssociations(set, ['p1', 'p2']);
    const host = out.find((a) => a.sourceKeys.includes('p1'))!;
    expect(host.sourceKeys.every((k) => !k.startsWith('container:'))).toBe(true);
  });

  test('a merge with nothing to absorb is a no-op', () => {
    expect(mergeAssociations(set, ['p1'])).toHaveLength(3);
    expect(mergeAssociations(set, ['p1', 'p1'])).toHaveLength(3);
  });

  test('is a no-op when only one side is present in the set', () => {
    expect(mergeAssociations(set, ['nope/nothing', 'p2'])).toHaveLength(3);
  });

  test('the side carrying the most keys survives by default', () => {
    const wide: C4Association[] = [
      assoc({ id: 'container:small', sourceKeys: ['app/host'] }),
      assoc({ id: 'container:big', sourceKeys: ['studio/host', 'other/host'] }),
    ];
    const out = mergeAssociations(wide, ['app/host', 'studio/host', 'other/host']);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('container:big');
    expect(out[0].sourceKeys).toHaveLength(3);
  });

  test('member count breaks the tie when each side claims one key', () => {
    // The real case: both host processes hold a single derived key, so key
    // count cannot decide. The 113-component one must survive.
    const hosts: C4Association[] = [
      assoc({ id: 'container:principal-studio/host', sourceKeys: ['principal-studio/host'] }),
      assoc({ id: 'container:subsystems-studio/host', sourceKeys: ['subsystems-studio/host'] }),
    ];
    const counts = new Map([
      ['principal-studio/host', 1],
      ['subsystems-studio/host', 113],
    ]);
    const out = mergeAssociations(hosts, ['principal-studio/host', 'subsystems-studio/host'], undefined, counts);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('container:subsystems-studio/host');
    expect(out[0].sourceKeys).toHaveLength(2);
  });

  test('without member counts the tie falls back to a stable pick', () => {
    const hosts: C4Association[] = [
      assoc({ id: 'container:principal-studio/host', sourceKeys: ['principal-studio/host'] }),
      assoc({ id: 'container:subsystems-studio/host', sourceKeys: ['subsystems-studio/host'] }),
    ];
    const out = mergeAssociations(hosts, ['principal-studio/host', 'subsystems-studio/host']);
    // Deterministic even if it is not the obvious choice.
    expect(out).toHaveLength(1);
    expect(['container:principal-studio/host', 'container:subsystems-studio/host']).toContain(out[0].id);
  });

  test('a caller can still override which side survives', () => {
    const wide: C4Association[] = [
      assoc({ id: 'container:small', sourceKeys: ['app/host'] }),
      assoc({ id: 'container:big', sourceKeys: ['studio/host', 'other/host'] }),
    ];
    const out = mergeAssociations(wide, ['app/host', 'studio/host', 'other/host'], 'app/host');
    expect(out[0].id).toBe('container:small');
    expect(out[0].sourceKeys).toHaveLength(3);
  });

  test('leaves unrelated associations alone', () => {
    const out = mergeAssociations(set, ['p1', 'p2']);
    expect(out.some((a) => a.sourceKeys.includes('p3'))).toBe(true);
  });

  test('does not touch the input set', () => {
    const before = set.length;
    mergeAssociations(set, ['p1', 'p2']);
    expect(set).toHaveLength(before);
  });

  test('the merged set actually collapses the graph', () => {
    const out = mergeAssociations(set, ['p1', 'p2']);
    const model = toC4(doc, { associations: out });
    expect(model.nodes.find((n) => n.id === 'container:p1')).toBeDefined();
    expect(model.nodes.find((n) => n.id === 'container:p2')).toBeUndefined();
    // p1 held a, b and the store s; p2 held c. One box now.
    expect(model.nodes.find((n) => n.id === 'container:p1')!.members.sort()).toEqual(['a', 'b', 'c', 's']);
  });

  test('is idempotent — merging again changes nothing', () => {
    const once = mergeAssociations(set, ['p1', 'p2']);
    expect(mergeAssociations(once, ['p1', 'p2'])).toEqual(once);
  });
});

describe('summarizeAssociations', () => {
  test('counts confirmed, proposed, and unconfirmed derived keys', () => {
    const model = toC4(doc, { view: 'container' });
    const s = summarizeAssociations(model, [
      assoc({ id: 'container:p1', sourceKeys: ['p1'], state: 'accepted', technology: 'React' }),
      assoc({ id: 'container:p2', sourceKeys: ['p2'], state: 'proposed', technology: 'React' }),
    ]);
    expect(s.confirmed).toBe(1);
    expect(s.proposed).toBe(1);
    expect(s.needsDecision).toBeGreaterThan(0);
  });

  test('counts how many keys a merge absorbed', () => {
    const model = toC4(doc, { view: 'container' });
    const s = summarizeAssociations(model, [
      assoc({ id: 'container:host', sourceKeys: ['p1', 'p2', 'p3'], state: 'accepted', technology: 'X' }),
    ]);
    expect(s.mergedAway).toBe(2);
  });

  test('counts containers still missing a technology', () => {
    const model = toC4(doc, { view: 'container' });
    const s = summarizeAssociations(model, []);
    expect(s.missingTechnology).toBe(model.nodes.filter((n) => n.kind === 'container').length);
  });
});