import { describe, expect, test } from 'bun:test';
import {
  findUnassigned,
  isRuntimeConstruct,
  suggestContainerKind,
  proposeElements,
  verificationIssues,
  verifyProcessBoundaries,
} from './c4Evidence';
import type { C4MemberView } from './c4Evidence';
import type { C4Container, C4Element } from './c4';

const REPO = 'pkg:github/acme/repo';

function member(over: Partial<C4MemberView> & { alias: string }): C4MemberView {
  return { construct: 'function', purl: `${REPO}#src/x.ts`, ...over };
}

describe('isRuntimeConstruct', () => {
  test('only code that runs can be inside a deployable unit', () => {
    expect(isRuntimeConstruct('function')).toBe(true);
    expect(isRuntimeConstruct('class')).toBe(true);
    expect(isRuntimeConstruct('custom_entity')).toBe(true);
  });

  test('types, stores, and externals do not run', () => {
    for (const c of ['interface', 'type_alias', 'enum', 'store', 'external', 'method']) {
      expect(isRuntimeConstruct(c)).toBe(false);
    }
  });
});

describe('findUnassigned', () => {
  test('returns runtime components that state no process', () => {
    const out = findUnassigned([
      member({ alias: 'a' }),
      member({ alias: 'b', process: 'p1' }),
      member({ alias: 'i', construct: 'interface' }),
    ]);
    expect(out.map((m) => m.alias)).toEqual(['a']);
  });
});

describe('suggestContainerKind', () => {
  test('disk- or externally-backed stores make a data store', () => {
    for (const storage of ['disk', 'external']) {
      const members = [
        member({ alias: 'a' }),
        member({ alias: 's', construct: 'store', declaration: { kind: 'store', storage } }),
      ];
      expect(suggestContainerKind(members)).toBe('data-store');
    }
  });

  test('in-memory state stays an application, not a data store', () => {
    const members = [
      member({ alias: 'a' }),
      member({ alias: 's', construct: 'store', declaration: { kind: 'store', storage: 'memory' } }),
    ];
    expect(suggestContainerKind(members)).toBe('application');
  });

  test('defaults to application when the evidence is thin', () => {
    expect(suggestContainerKind([member({ alias: 'a' })])).toBe('application');
  });

  test('there is no library answer, even for a library-shaped group', () => {
    // The kinds are application | data-store. A package of interfaces still
    // comes back `application`; the library verdict is the propose gate's
    // business (no proposal at all), not this function's.
    const members = [member({ alias: 'a', construct: 'interface' })];
    expect(suggestContainerKind(members)).toBe('application');
  });
});

describe('proposeElements', () => {
  const rollup = [
    {
      key: 'subsystems-studio/host',
      frameworks: ['bun'],
      members: [
        member({ alias: 'a' }),
        member({ alias: 's', construct: 'store', declaration: { kind: 'store', storage: 'disk' } }),
      ],
    },
    {
      key: 'subsystems-core',
      frameworks: [],
      members: [member({ alias: 'i', construct: 'interface' })],
    },
  ];

  test('a library-shaped boundary gets no proposal — it cannot be discerned into a container', () => {
    // Question 1: code that never runs is not a deployable unit. The concern
    // stands for review; no box is proposed for a person to reject.
    const set = proposeElements({ repoKey: REPO, rollup });
    expect(set.elements.map((e) => e.id)).toEqual(['container:subsystems-studio/host']);
  });

  test('every proposal is a container claiming its key via `process`, never accepted', () => {
    const set = proposeElements({ repoKey: REPO, rollup });
    expect(set.elements.every((e) => e.kind === 'container')).toBe(true);
    expect(set.elements.every((e) => e.state === 'proposed')).toBe(true);
    expect(set.elements.map((e) => (e as C4Container).process)).toEqual(['subsystems-studio/host']);
  });

  test('a key a container already claims is skipped — no duplicates', () => {
    // Question 2: the container exists; proposing another would be the
    // duplicate this module exists to prevent.
    const existing: C4Element[] = [
      {
        kind: 'container',
        containerKind: 'application',
        technology: 'Bun',
        id: 'container:subsystems-studio/host',
        process: 'subsystems-studio/host',
        label: 'studio host',
        state: 'accepted',
      },
    ];
    const set = proposeElements({ repoKey: REPO, rollup, elements: existing });
    expect(set.elements).toHaveLength(0);
  });

  test('the scaffold fabricates no rationale — that is the proposing agent\'s to write', () => {
    const set = proposeElements({
      repoKey: REPO,
      rollup: [{ key: 'app/worker', frameworks: ['bun'], members: [member({ alias: 'w' })] }],
    });
    expect(set.elements[0]!.rationale).toBeUndefined();
  });

  test('proposes strictly one container per key — folding lives in the model, not here', () => {
    // Two keys that are one deployable unit are a model discrepancy: a
    // consolidation proposal rewrites the components' `process` fields first,
    // and proposeElements then naturally proposes one container. The read
    // side never folds.
    const set = proposeElements({
      repoKey: REPO,
      rollup: [
        rollup[0]!,
        {
          key: 'principal-studio/host',
          frameworks: ['electrobun'],
          members: [member({ alias: 'z' })],
        },
      ],
    });
    expect(set.elements).toHaveLength(2);
  });

  test('a key with no framework signal gets an empty technology, not a guess', () => {
    // `technology` is required by the type, and an empty one is reported as a
    // gap. Writing "TypeScript" here would be the derivation this module does
    // not do.
    const set = proposeElements({
      repoKey: REPO,
      rollup: [{ key: 'app/host', frameworks: [], members: [member({ alias: 'a' })] }],
    });
    expect((set.elements[0]! as C4Container).technology).toBe('');
  });

  test('the set is sorted by id, so a review list is stable', () => {
    const set = proposeElements({
      repoKey: REPO,
      rollup: [
        { key: 'b/host', frameworks: ['bun'], members: [member({ alias: 'a' })] },
        { key: 'a/host', frameworks: ['bun'], members: [member({ alias: 'b' })] },
      ],
    });
    expect(set.elements.map((e) => e.id)).toEqual(['container:a/host', 'container:b/host']);
  });
});

describe('verifyProcessBoundaries', () => {
  function container(over: Partial<C4Container> & { id: string; process: string }): C4Container {
    return {
      kind: 'container',
      containerKind: 'application',
      technology: 'Bun',
      label: over.id,
      state: 'proposed',
      ...over,
    };
  }

  const rollup = [
    { key: 'app/host', memberAliases: ['a', 'b'] },
    { key: 'app/store', memberAliases: ['s'] },
    { key: 'app/orphan' },
  ];

  test('a key no container claims is unassigned', () => {
    const out = verifyProcessBoundaries({ rollup: [rollup[0]!], elements: [] });
    expect(out[0]).toMatchObject({ key: 'app/host', status: 'unassigned' });
    expect(out[0]!.element).toBeUndefined();
  });

  test('memberAliases pass through for the confirm UI', () => {
    const out = verifyProcessBoundaries({ rollup, elements: [] });
    expect(out[0]!.memberAliases).toEqual(['a', 'b']);
    expect(out[2]!.memberAliases).toEqual([]);
  });

  test('a proposal assigns the boundary and reads as proposed', () => {
    const set = proposeElements({
      repoKey: REPO,
      rollup: [
        { key: 'app/host', frameworks: ['bun'], members: [member({ alias: 'a' }), member({ alias: 'b' })] },
      ],
    });
    const out = verifyProcessBoundaries({
      rollup: [{ key: 'app/host', memberAliases: ['a', 'b'] }],
      elements: set.elements,
    });
    expect(out[0]).toMatchObject({ key: 'app/host', status: 'proposed' });
    expect(out[0]!.element!.id).toBe('container:app/host');
  });

  test('an accepted container verifies the boundary', () => {
    const out = verifyProcessBoundaries({
      rollup: [rollup[0]!],
      elements: [container({ id: 'container:app/host', process: 'app/host', state: 'accepted' })],
    });
    expect(out[0]).toMatchObject({ key: 'app/host', status: 'verified' });
  });

  test('a rejected container marks the boundary rejected', () => {
    const out = verifyProcessBoundaries({
      rollup: [rollup[0]!],
      elements: [container({ id: 'container:app/host', process: 'app/host', state: 'rejected' })],
    });
    expect(out[0]).toMatchObject({ key: 'app/host', status: 'rejected' });
  });

  test('a boundary matches its container by key, nothing else', () => {
    // A near-miss key is not a claimant: no redirect, no fold — if the model
    // says two keys are one unit, the model gets rewritten, not the lookup.
    const out = verifyProcessBoundaries({
      rollup: [{ key: 'legacy/host', memberAliases: ['z'] }],
      elements: [container({ id: 'container:app/host', process: 'app/host', state: 'accepted' })],
    });
    expect(out[0]).toMatchObject({ key: 'legacy/host', status: 'unassigned' });
  });

  test('accepted outranks rejected when two containers claim one key', () => {
    const out = verifyProcessBoundaries({
      rollup: [rollup[0]!],
      elements: [
        container({ id: 'container:a', process: 'app/host', state: 'rejected' }),
        container({ id: 'container:b', process: 'app/host', state: 'accepted' }),
      ],
    });
    expect(out[0]).toMatchObject({ status: 'verified', element: { id: 'container:b' } });
  });

  test('a non-container never claims a boundary', () => {
    // Only containers carry a `process` claim; components point at their
    // parent and cannot verify anything.
    const component: C4Element = {
      kind: 'component',
      container: 'container:app/host',
      technology: 'React',
      label: 'component:a',
      state: 'accepted',
    };
    const out = verifyProcessBoundaries({ rollup: [rollup[0]!], elements: [component] });
    expect(out[0]).toMatchObject({ status: 'unassigned' });
  });
});

describe('verificationIssues — statuses as dynamic-topology findings', () => {
  test('a verified boundary reports nothing — absence only', () => {
    const out = verificationIssues([
      { key: 'app/host', memberAliases: ['a'], status: 'verified' },
    ]);
    expect(out).toHaveLength(0);
  });

  test('an unclaimed boundary is a finding whose fix proposes a container', () => {
    const out = verificationIssues([
      { key: 'app/worker', memberAliases: ['w'], status: 'unassigned' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'process-verification:app/worker',
      severity: 'info',
      kind: 'boundary_process_unassigned',
      target: { kind: 'process', id: 'app/worker' },
      fix: { label: 'Propose container' },
    });
  });

  test('a proposed boundary awaits the decision; its fix accepts the container', () => {
    const out = verificationIssues([
      {
        key: 'app/renderer',
        memberAliases: ['v'],
        status: 'proposed',
        element: { id: 'container:app/renderer', label: 'Studio renderer' } as C4Element,
      },
    ]);
    expect(out[0]).toMatchObject({
      kind: 'boundary_process_proposed',
      fix: { label: 'Accept container' },
    });
    expect(out[0]!.message).toContain('Studio renderer');
  });

  test('a rejected boundary records the declined container and offers no fix', () => {
    const out = verificationIssues([
      {
        key: 'app/worker',
        memberAliases: ['w'],
        status: 'rejected',
        element: { id: 'container:app/worker', label: 'Studio worker' } as C4Element,
      },
    ]);
    expect(out[0]).toMatchObject({
      kind: 'boundary_process_rejected',
      target: { kind: 'process', id: 'app/worker' },
    });
    expect(out[0]!.fix).toBeUndefined();
    expect(out[0]!.message).toContain('rejected');
  });
});
