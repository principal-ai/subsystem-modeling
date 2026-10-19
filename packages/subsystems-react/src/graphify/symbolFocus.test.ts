import { describe, expect, test } from 'bun:test';
import type { GraphifyEdge, GraphifyNode } from './types';
import { toSymbolFocusedView } from './symbolFocus';

const PURL = 'pkg:github/acme/demo';

function node(
  id: string,
  label: string,
  sourceFile: string,
  extra?: Partial<GraphifyNode>,
): GraphifyNode {
  return {
    id,
    label,
    file_type: 'code',
    source_file: sourceFile,
    source_location: 'L1',
    ...extra,
  };
}

function edge(
  source: string,
  target: string,
  relation: string,
  sourceFile = 'src/a.ts',
  sourceLocation = 'L1',
  extra?: Partial<GraphifyEdge>,
): GraphifyEdge {
  return {
    source,
    target,
    relation,
    confidence: 'EXTRACTED',
    source_file: sourceFile,
    source_location: sourceLocation,
    ...extra,
  };
}

const center = node('c', 'Foo', 'src/a.ts', { source_location: 'L10' });
const method = node('m', '.run()', 'src/a.ts', { source_location: 'L40' });
const sameFileFn = node('sf', 'localHelper()', 'src/a.ts', { source_location: 'L60' });
const otherFileFn = node('of', 'outsideHelper()', 'src/b.ts', { source_location: 'L3' });
const centerFileNode = node('cfile', 'a.ts', 'src/a.ts', { type: 'module' });
const otherFileNode = node('ofile', 'b.ts', 'src/b.ts', { type: 'module' });

const edges = [
  edge('c', 'm', 'method', 'src/a.ts', 'L12'),
  edge('c', 'of', 'calls', 'src/a.ts', 'L15'),
  edge('c', 'cfile', 'contains', 'src/a.ts', 'L1'),
  edge('sf', 'm', 'calls', 'src/a.ts', 'L61'),
  edge('c', 'ghost', 'calls', 'src/a.ts', 'L20'),
];

function project(over: Partial<Parameters<typeof toSymbolFocusedView>[0]> = {}) {
  return toSymbolFocusedView(
    {
      center,
      neighbors: [method, sameFileFn, otherFileFn, centerFileNode, otherFileNode],
      edges,
      ...over,
    },
    { repoPurl: PURL },
  );
}

describe('toSymbolFocusedView', () => {
  test('aliases the center first, then neighbors in input order', () => {
    const { components } = project();
    expect(components.map((c) => c.alias)).toEqual(['center', 'n0', 'n1', 'n2', 'n3']);
  });

  test('strips graphify label decoration from symbols', () => {
    const { components } = project();
    expect(components[0]!.symbol).toBe('Foo');
    expect(components[1]!.symbol).toBe('run');
    expect(components[2]!.symbol).toBe('localHelper');
  });

  test('builds purls from the repo purl and the source file', () => {
    const { components } = project();
    expect(components[0]!.purl).toBe(`${PURL}#src/a.ts`);
    expect(components[3]!.purl).toBe(`${PURL}#src/b.ts`);
  });

  test('drops the file node for the center file and frames the center instead', () => {
    const { components } = project();
    expect(components.some((c) => c.alias === 'n3' && c.symbol === 'a')).toBe(false);
    // The center's file node was second-to-last; the OTHER file node survives.
    expect(components.find((c) => c.alias === 'n3')?.construct).toBe('external');
    expect(components[0]!.module).toBe('src/a.ts');
  });

  test('same-file members join the center frame; other files stand alone', () => {
    const { components } = project();
    const bySymbol = new Map(components.map((c) => [c.symbol, c]));
    expect(bySymbol.get('localHelper')?.module).toBe('src/a.ts');
    expect(bySymbol.get('outsideHelper')?.module).toBeUndefined();
  });

  test('infers constructs, falling back to external when structure is silent', () => {
    const { components } = project();
    const bySymbol = new Map(components.map((c) => [c.symbol, c]));
    expect(bySymbol.get('Foo')?.construct).toBe('class'); // outgoing method edge
    expect(bySymbol.get('run')?.construct).toBe('method'); // incoming method + dot label
    expect(bySymbol.get('outsideHelper')?.construct).toBe('function'); // call-style label
  });

  test('lets the host override the center construct', () => {
    const silent = node('t', 'Thing', 'src/a.ts');
    const inferred = toSymbolFocusedView(
      { center: silent, neighbors: [], edges: [] },
      { repoPurl: PURL },
    );
    expect(inferred.components[0]!.construct).toBe('external');

    const claimed = toSymbolFocusedView(
      { center: silent, neighbors: [], edges: [] },
      { repoPurl: PURL, centerConstruct: 'interface' },
    );
    expect(claimed.components[0]!.construct).toBe('interface');
  });

  test('stamps callees with the call-site line, not their declaration line', () => {
    const { components } = project();
    const bySymbol = new Map(components.map((c) => [c.symbol, c]));
    expect(bySymbol.get('run')?.line).toBe(12);
    expect(bySymbol.get('outsideHelper')?.line).toBe(15);
    // A neighbor the center does not reach keeps its declaration line.
    expect(bySymbol.get('localHelper')?.line).toBe(60);
    expect(bySymbol.get('Foo')?.line).toBe(10);
  });

  test('passes raw verbs through and drops contains edges', () => {
    const { graphifyRelations } = project();
    expect(graphifyRelations.map((r) => r.relation)).toEqual(['method', 'calls', 'calls']);
    expect(graphifyRelations.some((r) => r.relation === 'contains')).toBe(false);
  });

  test('carries refs, call-site line, confidence and context onto relations', () => {
    const { graphifyRelations } = project();
    const method = graphifyRelations[0]!;
    expect(method).toMatchObject({
      from: 'center',
      to: 'n0',
      refs: ['src/a.ts'],
      line: 12,
      confidence: 'EXTRACTED',
    });
  });

  test('drops edges with an endpoint outside the view', () => {
    const { graphifyRelations } = project();
    expect(graphifyRelations).toHaveLength(3);
  });

  test('keeps neighbor-to-neighbor edges', () => {
    const { graphifyRelations } = project();
    expect(graphifyRelations.some((r) => r.from === 'n1' && r.to === 'n0')).toBe(true);
  });
});
