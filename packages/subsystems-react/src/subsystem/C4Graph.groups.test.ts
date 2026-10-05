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
import { c4GroupDefs, rebaseGroupBoundsAbsolute, showDescriptionFor } from './C4Graph';
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
    const { groups } = c4GroupDefs(base, null);
    expect(groupById(groups).has(SYSTEM)).toBe(true);
  });

  test('holds the containers, and not the things outside the boundary', () => {
    const withOutsiders = model([
      ...base.nodes,
      { id: 'external:github', kind: 'external-system', label: 'GitHub' },
      { id: 'person:dev', kind: 'person', label: 'Dev' },
    ]);
    const system = groupById(c4GroupDefs(withOutsiders, null).groups).get(SYSTEM)!;
    // People and external systems sit outside the boundary — that is what the
    // boundary means — so they must not be laid out as its contents.
    expect(system.memberIds).toEqual([HOST, NOTES]);
  });

  test('is not dropped when a container opens', () => {
    // The frame must not shrink to the opened container: it is the *system*
    // boundary, and the open state adds a container inside it, not replaces it.
    const { groups } = c4GroupDefs(base, HOST);
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
    const { groups } = c4GroupDefs(base, HOST);
    const open = groupById(groups).get(HOST)!;
    expect(open.parentId).toBe(SYSTEM);
  });

  test('is drawn as a card as well as laid out as a group', () => {
    // It has a node (the card we click) *and* a group (the parent ELK sizes to
    // hold its components). Without the flag, ELK takes the bare leaf box.
    const open = groupById(c4GroupDefs(base, HOST).groups).get(HOST)!;
    expect(open.drawnAsCard).toBe(true);
  });

  test('lists its components, and reserves room for its own chrome', () => {
    const open = groupById(c4GroupDefs(base, HOST).groups).get(HOST)!;
    expect(open.memberIds).toEqual(['cmp:a', 'cmp:b']);
    // Its label slot and technology row, so children land below them.
    expect(open.padTop).toBeGreaterThan(0);
    // Never narrower than the closed card: opening only grows the box.
    expect(open.minWidth).toBeGreaterThan(0);
  });

  test('is absent when nothing is open, so the closed card stays a leaf', () => {
    // The closed container is a plain node — no group. The group's whole purpose is
    // to hold components, and there are none in view.
    expect(groupById(c4GroupDefs(base, null).groups).has(HOST)).toBe(false);
  });

  test('adds no group for a container with no components in view', () => {
    const { groups } = c4GroupDefs(model([container(NOTES)]), NOTES);
    expect(groupById(groups).has(NOTES)).toBe(false);
  });
});

describe('c4GroupDefs — frames', () => {
  test('the opened container is not also drawn as a frame', () => {
    // It is drawn as a grown card. Leaving it in `frames` would draw a frame
    // around the card.
    const { frames } = c4GroupDefs(base, HOST);
    expect(frames.map((g) => g.id)).not.toContain(HOST);
  });

  test('frames feed the bands, so they exclude the opened container too', () => {
    // Bands come from frames only. Counting the opened container as a frame would
    // give it its own layer, away from the containers it belongs beside.
    const { frames } = c4GroupDefs(base, HOST);
    expect(frames).toEqual([expect.objectContaining({ id: SYSTEM, kind: 'system' })]);
  });

  test('the component view keeps a frame per container with components', () => {
    const componentView: C4Model = { ...base, view: 'component' };
    const { frames } = c4GroupDefs(componentView, null);
    expect(frames.map((g) => g.id)).toContain(HOST);
    // Those frames nest inside the system boundary.
    expect(frames.find((g) => g.id === HOST)?.parentId).toBe(SYSTEM);
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
