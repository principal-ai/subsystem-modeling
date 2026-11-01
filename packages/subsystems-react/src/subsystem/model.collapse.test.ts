import { describe, expect, test } from 'bun:test';
import { buildSubsystemGraph, collapseBoundaryGroups, type BoundaryLayoutGroup, type SubsystemGraphEdge, type SubsystemGraphNode, type SubsystemProcessRegion } from './model';
import { NODE_H, NODE_W } from './containerCard';

function region(kind: SubsystemProcessRegion['kind'], key: string, members: string[]): SubsystemProcessRegion {
  return { kind, key, label: key, memberAliases: members } as SubsystemProcessRegion;
}
function leaf(id: string, parentId?: string): SubsystemGraphNode {
  return {
    id,
    type: 'subsystem-component',
    position: { x: 0, y: 0 },
    data: {} as never,
    ...(parentId ? { parentId } : {}),
  } as SubsystemGraphNode;
}
function edge(from: string, to: string, mechanism = 'calls'): SubsystemGraphEdge {
  return {
    id: `${from}--${mechanism}-->${to}`,
    source: from,
    target: to,
    data: { mechanism, refs: [`${from}:${to}`] } as never,
  } as SubsystemGraphEdge;
}

// package P holds process A (a1, a2) and leaf p1; process B (b1) stands alone.
const groups: BoundaryLayoutGroup[] = [
  { id: 'package:P', region: region('package', 'P', ['a1', 'a2', 'p1']), memberAliases: ['process:A', 'p1'] },
  { id: 'process:A', region: region('process', 'A', ['a1', 'a2']), memberAliases: ['a1', 'a2'], parentId: 'package:P' },
  { id: 'process:B', region: region('process', 'B', ['b1']), memberAliases: ['b1'] },
  { id: 'module:m', region: region('module', 'm', ['b1']), memberAliases: ['b1'], parentId: 'process:B' },
];
const nodes = [leaf('a1', 'process:A'), leaf('a2', 'process:A'), leaf('p1', 'package:P'), leaf('b1', 'module:m')];
const edges = [edge('a1', 'a2'), edge('a1', 'b1'), edge('a2', 'b1'), edge('a2', 'b1', 'uses'), edge('p1', 'a1'), edge('b1', 'p1')];

describe('collapseBoundaryGroups', () => {
  test('nothing collapsed → inputs pass through', () => {
    const out = collapseBoundaryGroups(nodes, edges, groups, new Set());
    expect(out.nodes).toHaveLength(4);
    expect(out.edges).toHaveLength(6);
    expect(out.collapsedRegions).toEqual([]);
  });

  test('a module id is ignored — only card frames collapse', () => {
    const out = collapseBoundaryGroups(nodes, edges, groups, new Set(['module:m']));
    expect(out.nodes).toHaveLength(4);
    expect(out.groups).toHaveLength(4);
  });

  test('a collapsed process becomes a card, its members leave, lines roll up', () => {
    const out = collapseBoundaryGroups(nodes, edges, groups, new Set(['process:A']));
    const ids = out.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['b1', 'p1', 'process:A']);
    const card = out.nodes.find((n) => n.id === 'process:A')!;
    expect(card.type).toBe('subsystem-group');
    expect(card.width).toBe(NODE_W);
    expect(card.height).toBe(NODE_H);
    expect(card.parentId).toBe('package:P');
    expect((card.data as { collapsed?: boolean }).collapsed).toBe(true);
    // The card is no longer an ELK parent; the package now holds the card.
    expect(out.groups.map((g) => g.id)).toEqual(['package:P', 'process:B', 'module:m']);
    expect(out.groups[0]!.memberAliases).toEqual(['process:A', 'p1']);
    expect(out.collapsedRegions.map((r) => r.key)).toEqual(['A']);

    const byId = new Map(out.edges.map((e) => [e.id, e]));
    // a1→a2 was internal: gone.
    expect(byId.has('a1--calls-->a2')).toBe(false);
    // a1→b1 and a2→b1 fold to one `calls` line; a2→b1 `uses` stays its own.
    const calls = byId.get('process:A--calls-->b1')!;
    expect(calls.data?.rolledUp).toBe(2);
    expect(calls.data?.rolledUpIds).toEqual(['a1--calls-->b1', 'a2--calls-->b1']);
    expect(calls.data?.refs).toEqual(['a1:b1', 'a2:b1']);
    expect(byId.get('process:A--uses-->b1')?.data?.rolledUp).toBe(1);
    // p1→a1 re-targets the card; b1→p1 is untouched and keeps its id.
    expect(byId.get('p1--calls-->process:A')?.target).toBe('process:A');
    expect(byId.get('b1--calls-->p1')?.data?.rolledUp).toBeUndefined();
    expect(out.edges).toHaveLength(4);
  });

  test('a collapsed package swallows the process nested inside it', () => {
    const out = collapseBoundaryGroups(nodes, edges, groups, new Set(['package:P', 'process:A']));
    expect(out.nodes.map((n) => n.id).sort()).toEqual(['b1', 'package:P']);
    const card = out.nodes.find((n) => n.id === 'package:P')!;
    expect(card.parentId).toBeUndefined();
    expect(out.groups.map((g) => g.id)).toEqual(['process:B', 'module:m']);
    expect(out.collapsedRegions.map((r) => r.key)).toEqual(['P']);
    const ids = out.edges.map((e) => e.id).sort();
    expect(ids).toEqual(['b1--calls-->package:P', 'package:P--calls-->b1', 'package:P--uses-->b1']);
  });

  test('does not mutate its inputs', () => {
    const before = JSON.stringify({ nodes, edges, groups });
    collapseBoundaryGroups(nodes, edges, groups, new Set(['package:P']));
    expect(JSON.stringify({ nodes, edges, groups })).toBe(before);
  });
});

describe('buildSubsystemGraph collapsed frames', () => {
  const doc = {
    components: [
      { alias: 'a1', name: 'a1', construct: 'function', file: 'a1.ts', purl: 'pkg:github/acme/app', process: 'A' },
      { alias: 'a2', name: 'a2', construct: 'function', file: 'a2.ts', purl: 'pkg:github/acme/app', process: 'A' },
      { alias: 'b1', name: 'b1', construct: 'function', file: 'b1.ts', purl: 'pkg:github/acme/app', process: 'B' },
      { alias: 'b2', name: 'b2', construct: 'function', file: 'b2.ts', purl: 'pkg:github/acme/app', process: 'B' },
    ],
    trails: [{ id: 't', title: 't', steps: [{ from: 'a1', to: 'b1', mechanism: 'calls' }, { from: 'a2', to: 'b2', mechanism: 'calls' }] }],
  } as unknown as Parameters<typeof buildSubsystemGraph>[0];
  const groupIds = (nodes: readonly SubsystemGraphNode[]) =>
    nodes.filter((n) => n.type === 'subsystem-group').map((n) => [n.id, (n.data as { collapsed?: boolean }).collapsed === true]);

  test('cardFramesCollapsed closes every card frame', async () => {
    const built = await buildSubsystemGraph(doc, { cardFramesCollapsed: true });
    expect(groupIds(built.nodes).sort()).toEqual([['process:A', true], ['process:B', true]]);
    expect(built.nodes.some((n) => n.type === 'subsystem-component')).toBe(false);
    expect(built.edges.map((e) => [e.source, e.target, e.data?.rolledUp])).toEqual([['process:A', 'process:B', 2]]);
    expect(built.regions.map((r) => r.key).sort()).toEqual(['A', 'B']);
  });

  test('with cardFramesCollapsed the toggled set names the open frames', async () => {
    const built = await buildSubsystemGraph(doc, { cardFramesCollapsed: true, collapsedGroupIds: new Set(['process:A']) });
    expect(groupIds(built.nodes).sort()).toEqual([['process:A', false], ['process:B', true]]);
  });

  test('without it the toggled set names the closed frames', async () => {
    const built = await buildSubsystemGraph(doc, { collapsedGroupIds: new Set(['process:A']) });
    expect(groupIds(built.nodes).sort()).toEqual([['process:A', true], ['process:B', false]]);
  });
});
