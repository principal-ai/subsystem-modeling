/**
 * The nesting the drill-down's stability rests on.
 *
 * The 206px "moves down" report was not a FLIP bug or a camera bug — it was the
 * software-system boundary having no position of its own. Flattened, the frame was
 * synthesized as a union of its members' bounds, so it inherited their top edge and
 * slid whenever ELK re-placed one of them. Making it a real ELK parent fixed it,
 * and only because the opened container nests *inside* it.
 *
 * None of this is visible in the rendered output: get the nesting wrong and the
 * graph still draws, just wrong. So it is asserted here instead. `c4GroupDefs` is
 * pure and needs no ELK — the layout half it feeds is covered by the node e2e.
 */
import { describe, expect, test } from 'bun:test';
import { c4GroupDefs, hidesComponentDuringMorph, rebaseGroupBoundsAbsolute, showDescriptionFor } from './C4Graph';
import { openContainerSet, openStateKey } from './c4';
import type { C4Element, C4Model } from './c4';

const SYSTEM = 'system:studio';

const container = (id: string): C4Element => ({
  id,
  kind: 'container',
  label: id,
  parentId: SYSTEM,
});
const component = (id: string, of: string): C4Element => ({
  id,
  kind: 'component',
  label: id,
  container: of,
});

/** A container view: two containers, one of them with components. */
function model(nodes: C4Element[]): C4Model {
  return {
    view: 'container',
    system: { id: SYSTEM, label: 'Studio' },
    nodes,
    edges: [],
  };
}

const HOST = 'container:host';
const NOTES = 'container:notes';
const base = model([
  container(HOST),
  container(NOTES),
  component('cmp:a', HOST),
  component('cmp:b', HOST),
]);

const groupById = (defs: ReturnType<typeof c4GroupDefs>['groups']) =>
  new Map(defs.map((g) => [g.id, g]));

describe('c4GroupDefs — the system boundary', () => {
  test('is a group of its own, even with nothing open', () => {
    const { groups } = c4GroupDefs(base, []);
    expect(groupById(groups).has(SYSTEM)).toBe(true);
  });

  test('holds the containers, and not the things outside the boundary', () => {
    const withOutsiders = model([
      ...base.nodes,
      { id: 'external:github', kind: 'external-system', label: 'GitHub' },
      { id: 'person:dev', kind: 'person', label: 'Dev' },
    ]);
    const system = groupById(c4GroupDefs(withOutsiders, []).groups).get(SYSTEM)!;
    // People and external systems sit outside the boundary — that is what the
    // boundary means — so they must not be laid out as its contents.
    expect(system.memberIds).toEqual([HOST, NOTES]);
  });

  test('is not dropped when a container opens', () => {
    // The frame must not shrink to the opened container: it is the *system*
    // boundary, and the open state adds a container inside it, not replaces it.
    const { groups } = c4GroupDefs(base, [HOST]);
    const system = groupById(groups).get(SYSTEM)!;
    expect(system.memberIds).toContain(HOST);
    expect(system.memberIds).toContain(NOTES);
  });
});

describe('c4GroupDefs — the opened container', () => {
  test('nests inside the system frame, not beside it', () => {
    // The load-bearing assertion. As a sibling it is laid out from the root, the
    // frame is no longer the origin of its contents, and the boundary's corner
    // stops being pinned across the two layouts.
    const { groups } = c4GroupDefs(base, [HOST]);
    const open = groupById(groups).get(HOST)!;
    expect(open.parentId).toBe(SYSTEM);
  });

  test('is drawn as a card as well as laid out as a group', () => {
    // It has a node (the card we click) *and* a group (the parent ELK sizes to
    // hold its components). Without the flag, ELK takes the bare leaf box.
    const open = groupById(c4GroupDefs(base, [HOST]).groups).get(HOST)!;
    expect(open.drawnAsCard).toBe(true);
  });

  test('lists its components, and reserves room for its own chrome', () => {
    const open = groupById(c4GroupDefs(base, [HOST]).groups).get(HOST)!;
    expect(open.memberIds).toEqual(['cmp:a', 'cmp:b']);
    // Its label slot and technology row, so children land below them.
    expect(open.padTop).toBeGreaterThan(0);
    // Never narrower than the closed card: opening only grows the box.
    expect(open.minWidth).toBeGreaterThan(0);
  });

  test('is absent when nothing is open, so the closed card stays a leaf', () => {
    // The closed container is a plain node — no group. The group's whole purpose is
    // to hold components, and there are none in view.
    expect(groupById(c4GroupDefs(base, []).groups).has(HOST)).toBe(false);
  });

  test('adds no group for a container with no components in view', () => {
    const { groups } = c4GroupDefs(model([container(NOTES)]), [NOTES]);
    expect(groupById(groups).has(NOTES)).toBe(false);
  });
});

describe('c4GroupDefs — frames', () => {
  test('the opened container is not also drawn as a frame', () => {
    // It is drawn as a grown card. Leaving it in `frames` would draw a frame
    // around the card.
    const { frames } = c4GroupDefs(base, [HOST]);
    expect(frames.map((g) => g.id)).not.toContain(HOST);
  });

  test('frames feed the bands, so they exclude the opened container too', () => {
    // Bands come from frames only. Counting the opened container as a frame would
    // give it its own layer, away from the containers it belongs beside.
    const { frames } = c4GroupDefs(base, [HOST]);
    expect(frames).toEqual([expect.objectContaining({ id: SYSTEM, kind: 'system' })]);
  });

  test('the component view keeps a frame per container with components', () => {
    const componentView: C4Model = { ...base, view: 'component' };
    const { frames } = c4GroupDefs(componentView, []);
    expect(frames.map((g) => g.id)).toContain(HOST);
    // Those frames nest inside the system boundary.
    expect(frames.find((g) => g.id === HOST)?.parentId).toBe(SYSTEM);
  });
});

describe('c4GroupDefs — several containers open at once', () => {
  // The second open container needs components of its own to be a parent at all,
  // so this fixture has two containers that both nest.
  const pair = model([
    container(HOST),
    container(NOTES),
    component('cmp:a', HOST),
    component('cmp:b', HOST),
    component('cmp:x', NOTES),
    component('cmp:y', NOTES),
  ]);

  test('each open container becomes its own parent, holding only its own components', () => {
    const groups = groupById(c4GroupDefs(pair, [HOST, NOTES]).groups);
    // The bug this replaces: nesting both under one parent, or letting the second
    // overwrite the first, puts one container's components inside the other.
    expect(groups.get(HOST)!.memberIds).toEqual(['cmp:a', 'cmp:b']);
    expect(groups.get(NOTES)!.memberIds).toEqual(['cmp:x', 'cmp:y']);
  });

  test('both nest inside the system frame, and neither displaces it', () => {
    const { groups } = c4GroupDefs(pair, [HOST, NOTES]);
    const byId = groupById(groups);
    expect(byId.get(HOST)!.parentId).toBe(SYSTEM);
    expect(byId.get(NOTES)!.parentId).toBe(SYSTEM);
    // The boundary is the system. Growing a second container inside it must not
    // shrink the frame to whichever one is open.
    expect(byId.get(SYSTEM)!.memberIds).toEqual([HOST, NOTES]);
  });

  test('neither is also drawn as a frame', () => {
    const { frames } = c4GroupDefs(pair, [HOST, NOTES]);
    const ids = frames.map((g) => g.id);
    expect(ids).not.toContain(HOST);
    expect(ids).not.toContain(NOTES);
  });

  test('an unopened third container stays a plain leaf', () => {
    const trio = model([
      container(HOST),
      container(NOTES),
      container('container:cache'),
      component('cmp:a', HOST),
      component('cmp:x', NOTES),
      component('cmp:c', 'container:cache'),
    ]);
    const groups = groupById(c4GroupDefs(trio, [HOST, NOTES]).groups);
    expect(groups.has('container:cache')).toBe(false);
  });

  test('the group list is identical whatever order the open set is given in', () => {
    // The cache is keyed on the set, so `[a,b]` and `[b,a]` must produce one
    // layout — which means the defs have to match exactly, order included.
    const forwards = c4GroupDefs(pair, [HOST, NOTES]).groups;
    const backwards = c4GroupDefs(pair, [NOTES, HOST]).groups;
    expect(backwards).toEqual(forwards);
  });

  test('a duplicate id in the open set is not emitted twice', () => {
    // `openContainerIds` is caller-supplied; a repeated id would otherwise become
    // two groups with the same id, which ELK rejects as a duplicate.
    const groups = c4GroupDefs(pair, [HOST, HOST]).groups;
    expect(groups.filter((g) => g.id === HOST)).toHaveLength(1);
  });
});

describe('openContainerSet', () => {
  test('is empty when nothing is open, in either spelling', () => {
    expect(openContainerSet({})).toEqual([]);
    expect(openContainerSet({ openContainerId: null })).toEqual([]);
    expect(openContainerSet({ openContainerIds: [] })).toEqual([]);
  });

  test('sorts, so the same set in any order is one cache key', () => {
    // Insertion order would give `[b,a]` and `[a,b]` separate keys, and a second
    // ELK run for a diagram that did not change.
    expect(openContainerSet({ openContainerIds: ['b', 'a'] })).toEqual(['a', 'b']);
    expect(openStateKey(openContainerSet({ openContainerIds: ['b', 'a'] }))).toBe(
      openStateKey(openContainerSet({ openContainerIds: ['a', 'b'] })),
    );
  });

  test('folds the deprecated single id in, and unions it with the set', () => {
    // Both fields set must not lose either: a caller migrating across would
    // silently drop a container from the drill-down.
    expect(openContainerSet({ openContainerId: 'b', openContainerIds: ['a'] })).toEqual(['a', 'b']);
    expect(openContainerSet({ openContainerId: 'a' })).toEqual(['a']);
  });

  test('collapses a duplicate rather than emitting a repeated group', () => {
    expect(openContainerSet({ openContainerIds: ['a', 'a'] })).toEqual(['a']);
    expect(openContainerSet({ openContainerId: 'a', openContainerIds: ['a'] })).toEqual(['a']);
  });

  test('the closed diagram keys as the empty string', () => {
    // `''` is the cache key the closed state has always used; a different
    // sentinel would silently orphan every cached closed layout.
    expect(openStateKey(openContainerSet({}))).toBe('');
  });
});

describe('hidesComponentDuringMorph', () => {
  // The reason the drill-down keeps several containers open: a container that was
  // already open must not blink because a *different* one is changing.
  const HOST = 'container:host';
  const CLI = 'container:notes';
  /** `open` is the full open set; `targets` is only what is changing this tick. */
  const ids = (...v: string[]) => new Set(v);
  const none = new Set<string>();

  test('withholds the components of a container that is opening', () => {
    expect(hidesComponentDuringMorph(HOST, ids(HOST), ids(HOST), false)).toBe(true);
  });

  test('withholds them again while it is closing', () => {
    // Closing is the same transition seen from the other side: the card shrinks
    // and the components must not be visible being squeezed out of it.
    expect(hidesComponentDuringMorph(HOST, ids(HOST), ids(HOST), false)).toBe(true);
  });

  test('keeps them on screen while a *different* container opens', () => {
    // The load-bearing case. HOST is open and unaffected; CLI is arriving.
    expect(hidesComponentDuringMorph(HOST, ids(HOST), ids(CLI), false)).toBe(false);
  });

  test('keeps them on screen while a different container closes', () => {
    // Targets are the symmetric difference, so a closing CLI names only CLI.
    expect(hidesComponentDuringMorph(HOST, ids(HOST), ids(CLI), false)).toBe(false);
  });

  test('withholds them when the container itself is the one closing', () => {
    // HOST stays in the open set for this render — it is still drawn, shrinking —
    // so the open set alone cannot be the test. The target set can.
    expect(hidesComponentDuringMorph(HOST, ids(HOST), ids(HOST, CLI), false)).toBe(true);
  });

  test('shows everything once the morph settles', () => {
    expect(hidesComponentDuringMorph(HOST, ids(HOST), ids(HOST), true)).toBe(false);
  });

  test('shows nothing once the morph settles, even with targets left over', () => {
    // Belt and braces: a stale target set must not outlive the settle, and if it
    // did, settled still wins.
    expect(hidesComponentDuringMorph(HOST, ids(HOST), ids(HOST, CLI), true)).toBe(false);
  });

  test('never withholds a component of a closed container', () => {
    expect(hidesComponentDuringMorph(HOST, ids(CLI), ids(HOST), false)).toBe(false);
  });

  test('never withholds a node with no container', () => {
    // Externals and people have no owner; they are root cards, not nested ones.
    expect(hidesComponentDuringMorph(undefined, ids(HOST), ids(HOST), false)).toBe(false);
  });

  test('settled with nothing open is not hidden either', () => {
    expect(hidesComponentDuringMorph(HOST, none, none, true)).toBe(false);
  });
});

describe('rebaseGroupBoundsAbsolute', () => {
  // Real numbers from the drill-down: the system frame sits at (12,12), and the
  // opened container nests inside it, so ELK reports it 24px/64px in — offset by
  // the frame's own 12,12 plus its 12px padding.
  const result = () => ({
    groupBounds: new Map([
      [SYSTEM, { x: 12, y: 12, width: 298, height: 874 }],
      [HOST, { x: 24, y: 64, width: 250, height: 596 }],
    ]),
    absoluteRects: new Map([
      [SYSTEM, { x: 12, y: 12, width: 298, height: 874 }],
      [HOST, { x: 36, y: 76, width: 250, height: 596 }],
    ]),
  });

  test('lifts a nested group out of its parent origin', () => {
    const rebased = rebaseGroupBoundsAbsolute(result());
    // Unrebased, `containerRect` would read (24,64) and the morph would glide the
    // container to a place it was never drawn.
    expect(rebased.get(HOST)).toEqual({ x: 36, y: 76, width: 250, height: 596 });
  });

  test('leaves a root-level group alone', () => {
    const rebased = rebaseGroupBoundsAbsolute(result());
    expect(rebased.get(SYSTEM)).toEqual({ x: 12, y: 12, width: 298, height: 874 });
  });

  test('keeps a flat frame, which has no node and is already absolute', () => {
    // Flat frames are synthesized from absolute member bounds and have no entry in
    // `absoluteRects` — they must survive rather than drop out.
    const r = result();
    r.groupBounds.set('flat', { x: 12, y: 402, width: 274, height: 150 });
    const rebased = rebaseGroupBoundsAbsolute(r);
    expect(rebased.get('flat')).toEqual({ x: 12, y: 402, width: 274, height: 150 });
  });

  test('does not mutate the layout result', () => {
    // `computeElkLayout`'s own result is read elsewhere in its native mixed space.
    const r = result();
    rebaseGroupBoundsAbsolute(r);
    expect(r.groupBounds.get(HOST)).toEqual({ x: 24, y: 64, width: 250, height: 596 });
  });

  test('keeps every entry — no group is lost in the translation', () => {
    const rebased = rebaseGroupBoundsAbsolute(result());
    expect([...rebased.keys()].sort()).toEqual([SYSTEM, HOST].sort());
  });
});

describe('showDescriptionFor', () => {
  test('a plain card shows its description', () => {
    expect(showDescriptionFor(false, true)).toBe(true);
  });

  test('no description while a morph is in flight', () => {
    // The card is resizing underneath it; the line would slide across a moving box.
    expect(showDescriptionFor(false, false)).toBe(false);
  });

  test('an expanded container never shows it, however long it has settled', () => {
    // The regression: keying only on `settled` brought the line back the moment the
    // grow finished, into the space the components now occupy. ELK reserves header
    // chrome only, so it landed on top of the first component rather than above it.
    expect(showDescriptionFor(true, true)).toBe(false);
    expect(showDescriptionFor(true, false)).toBe(false);
  });

  test('an unset open flag is not "open"', () => {
    // `open` is undefined until the layout stamps it, so `undefined` must not be
    // read as truthy — that would hide descriptions on every card, always.
    expect(showDescriptionFor(undefined, true)).toBe(true);
  });
});
