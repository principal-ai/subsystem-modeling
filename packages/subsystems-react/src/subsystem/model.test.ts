import { describe, expect, test } from 'bun:test';
import {
  convertSubsystemToNodes,
  convertSubsystemToEdges,
  convertSubsystemToGroups,
  getSubsystemRegions,
  processGroupNodeId,
  buildSubsystemGraph,
  deriveNameFromSymbol,
  constructBadgeLabel,
  nodeMinWidthForBadges,
  formatPurl,
  packageColor,
  subsystemGraphLayoutKey,
} from './model';
import type { SubsystemComponent, SubsystemComponentEdge } from './model';

const comps: SubsystemComponent[] = [
  { id: 'reader', name: 'SessionReader', kind: 'class', file: 'SessionReader.ts', purl: 'pkg:github/principal-ai/agent-monitoring' },
  { id: 'transcript', name: 'transcript', kind: 'module', file: 'transcript.ts', purl: 'pkg:github/principal-ai/agent-monitoring' },
];

const edges: SubsystemComponentEdge[] = [
  { id: 'e1', from: 'transcript', to: 'reader', mechanism: 'imports' },
  // 'host' is NOT a component — this is the cross-package external case.
  { id: 'e2', from: 'reader', to: 'host', mechanism: 'imports', refs: ['bun/index.ts'] },
];

describe('subsystem graph model', () => {
  test('converts all components to flat component nodes', () => {
    const nodes = convertSubsystemToNodes({ components: comps, edges });
    const components = nodes.filter((n) => n.type === 'subsystem-component');
    expect(components).toHaveLength(comps.length);
    expect(components.every((n) => n.type === 'subsystem-component')).toBe(true);
  });

  test('converts edges with directed markers', () => {
    const converted = convertSubsystemToEdges({ components: comps, edges });
    expect(converted).toHaveLength(2);
    expect(converted[0].source).toBe('transcript');
    expect(converted[0].target).toBe('reader');
  });

  test('buildSubsystemGraph tolerates external components with no file', async () => {
    const withExternal: SubsystemComponent[] = [
      ...comps,
      {
        id: "proposed-watcher",
        name: "watchDir",
        kind: "external",
        // Intentionally omit file/purl — agents often leave these off for externals.
        file: undefined as unknown as string,
        purl: undefined as unknown as string,
      },
    ];
    const { nodes } = await buildSubsystemGraph({
      components: withExternal,
      edges: [{ id: 'e3', from: 'reader', to: 'proposed-watcher', mechanism: 'feeds' }],
    });
    expect(nodes.find((n) => n.id === 'proposed-watcher')).toBeDefined();
  });

  test('buildSubsystemGraph creates external stub nodes for non-component targets', async () => {
    const { nodes, edges: gEdges } = await buildSubsystemGraph({ components: comps, edges });
    const external = nodes.find((n) => n.id === 'external:host');
    expect(external).toBeDefined();
    expect(external!.data.component.construct).toBe('external');
    const crossEdge = gEdges.find((e) => e.target === 'external:host');
    expect(crossEdge).toBeDefined();
  });

  test('buildSubsystemGraph positions nodes via ELK (non-zero coords)', async () => {
    const { nodes } = await buildSubsystemGraph({ components: comps, edges });
    const placed = nodes.filter((n) => n.type === 'subsystem-component' && n.position);
    expect(placed.length).toBeGreaterThan(0);
    // ELK (or the grid fallback) gives finite coordinates.
    for (const n of placed) {
      expect(typeof n.position!.x).toBe('number');
      expect(typeof n.position!.y).toBe('number');
    }
  });

  test('packageColor is deterministic', () => {
    expect(packageColor('agent-monitoring')).toBe(packageColor('agent-monitoring'));
    expect(packageColor('a')).not.toBe(packageColor('b'));
  });

  test('deriveNameFromSymbol is consistent per kind', () => {
    // brace-bodied constructs wear {}; classes render bare; module uses the symbol as-is.
    expect(deriveNameFromSymbol('SessionReader', 'class')).toBe('SessionReader');
    expect(deriveNameFromSymbol('SessionRecord', 'type_alias')).toBe('SessionRecord {}');
    expect(deriveNameFromSymbol('transcript', 'module')).toBe('transcript');
    // falls back to existing name when no symbol (class stays bare).
    expect(deriveNameFromSymbol(undefined, 'class', 'SessionReader')).toBe('SessionReader');
    expect(deriveNameFromSymbol('', 'external', 'principal-studio-host')).toBe('principal-studio-host');
  });

  test('executable constructs wear () on the node', () => {
    expect(deriveNameFromSymbol('createSubsystemGraph', 'function')).toBe('createSubsystemGraph()');
    // methods keep the dotted ownership symbol and wear the parens
    expect(deriveNameFromSymbol('SessionCache.put', 'method')).toBe('SessionCache.put()');
    // already-parenthesized labels don't double up
    expect(deriveNameFromSymbol('run()', 'function')).toBe('run()');
    // data-shaped constructs stay bare
    expect(deriveNameFromSymbol('ROOT', 'store')).toBe('ROOT');
    // brace bodies don't double up
    expect(deriveNameFromSymbol('Foo {}', 'interface')).toBe('Foo {}');
  });

  test('deriveNameFromSymbol uses JSX decoration for component stereotype', () => {
    expect(deriveNameFromSymbol('AnalysisView', 'function', undefined, undefined, 'component')).toBe(
      '<AnalysisView>',
    );
    expect(deriveNameFromSymbol('useDrawingsHost', 'function', undefined, undefined, 'hook')).toBe(
      'useDrawingsHost()',
    );
  });

  test('constructBadgeLabel prefers framework · stereotype over construct', () => {
    expect(
      constructBadgeLabel({
        construct: 'function',
        framework: 'react',
        stereotype: 'component',
      }),
    ).toBe('react · component');
    expect(constructBadgeLabel({ construct: 'function', stereotype: 'hook' })).toBe('hook');
    expect(constructBadgeLabel({ construct: 'function' })).toBe('function');
    expect(constructBadgeLabel({ construct: 'type_alias' })).toBe('type alias');
  });

  test('nodeMinWidthForBadges widens for long construct badges and role pairs', () => {
    const plain = nodeMinWidthForBadges({ construct: 'function' });
    expect(plain).toBe(150);

    const stereotype = nodeMinWidthForBadges({
      construct: 'function',
      framework: 'react',
      stereotype: 'component',
    });
    expect(stereotype).toBeGreaterThan(150);

    const withRole = nodeMinWidthForBadges({
      construct: 'function',
      framework: 'react',
      stereotype: 'component',
      role: 'entry',
    });
    expect(withRole).toBeGreaterThan(stereotype);
  });

  test('deriveNameFromSymbol falls back to file basename for modules', () => {
    expect(deriveNameFromSymbol(undefined, 'module', undefined, 'transcript.ts')).toBe('transcript');
    expect(deriveNameFromSymbol(undefined, 'module', undefined, 'src/event-processors/index.ts')).toBe('index');
    // Symbol wins over file basename.
    expect(deriveNameFromSymbol('CodexRolloutRecord', 'module', undefined, 'transcript.ts')).toBe('CodexRolloutRecord');
    // File basename wins over a supplied name for modules (derivation precedence).
    expect(deriveNameFromSymbol(undefined, 'module', 'MyModule', 'x.ts')).toBe('x');
  });

  test('formatPurl renders the human identity', () => {
    expect(formatPurl('pkg:npm/@principal-ai/core')).toBe('@principal-ai/core');
    expect(formatPurl('pkg:github/principal-ai/agent-monitoring')).toBe('principal-ai/agent-monitoring');
    expect(formatPurl('pkg:npm/left-pad@1.3.0')).toBe('left-pad');
    expect(formatPurl('pkg:gitlab/group/proj?arch=amd64')).toBe('group/proj');
    expect(formatPurl('pkg:generic/local--Users-me-my-app')).toBe('Users-me-my-app (local)');
    // Malformed purls pass through untouched.
    expect(formatPurl('not-a-purl')).toBe('not-a-purl');
  });

  test('getSubsystemRegions groups by process, skipping process-less nodes', () => {
    const regions = getSubsystemRegions({
      components: [
        { id: 'a', name: 'a', construct: 'function', file: 'a.ts', purl: 'pkg:github/acme/app', process: 'app/host' },
        { id: 'b', name: 'b', construct: 'function', file: 'b.ts', purl: 'pkg:github/acme/app', process: 'app/host' },
        { id: 'c', name: 'c', construct: 'function', file: 'c.ts', purl: 'pkg:github/acme/app', process: 'app/renderer' },
        { id: 'd', name: 'd', construct: 'function', file: 'd.ts', purl: 'pkg:github/acme/app' },
      ],
    });
    expect(regions.map((r) => r.key)).toEqual(['app/host', 'app/renderer']);
    expect(regions[0]!.memberIds).toEqual(['a', 'b']);
  });

  test('convertSubsystemToNodes stamps parentId for process members only', () => {
    const nodes = convertSubsystemToNodes({
      components: [
        { id: 'a', name: 'a', construct: 'function', file: 'a.ts', purl: 'pkg:github/acme/app', process: 'app/host' },
        { id: 'd', name: 'd', construct: 'function', file: 'd.ts', purl: 'pkg:github/acme/app' },
      ],
      edges: [],
    });
    expect((nodes.find((n) => n.id === 'a') as { parentId?: string }).parentId).toBe(
      processGroupNodeId('app/host'),
    );
    expect((nodes.find((n) => n.id === 'd') as { parentId?: string }).parentId).toBeUndefined();
  });

  test('convertSubsystemToGroups emits one parent per process', () => {
    const groups = convertSubsystemToGroups({
      components: [
        { id: 'a', name: 'a', construct: 'function', file: 'a.ts', purl: 'pkg:github/acme/app', process: 'app/host' },
        { id: 'b', name: 'b', construct: 'function', file: 'b.ts', purl: 'pkg:github/acme/app', process: 'app/host' },
      ],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe(processGroupNodeId('app/host'));
    expect(groups[0]!.type).toBe('subsystem-group');
  });

  test('buildSubsystemGraph drops singleton process frames (no parentId, no group)', async () => {
    const { nodes, regions } = await buildSubsystemGraph({
      components: [
        { id: 'a', name: 'a', construct: 'function', file: 'a.ts', purl: 'pkg:github/acme/app', process: 'app/host' },
        { id: 'b', name: 'b', construct: 'function', file: 'b.ts', purl: 'pkg:github/acme/app', process: 'app/host' },
        { id: 'solo', name: 'solo', construct: 'function', file: 's.ts', purl: 'pkg:github/acme/app', process: 'app/lonely' },
      ],
      edges: [{ id: 'e1', from: 'a', to: 'b', mechanism: 'calls' }],
    });
    expect(regions.map((r) => r.key)).toEqual(['app/host']);
    expect((nodes.find((n) => n.id === 'solo') as { parentId?: string }).parentId).toBeUndefined();
    expect(nodes.find((n) => n.id === processGroupNodeId('app/lonely'))).toBeUndefined();
  });

  test('subsystemGraphLayoutKey ignores declarationRef-only changes', () => {
    const base = { components: comps, edges };
    const withRef = {
      components: comps.map((c, i) =>
        i === 0
          ? {
              ...c,
              declarationRef: {
                file: c.file,
                startLine: 42,
                lineHash: 'abc',
                capturedAt: new Date(0).toISOString(),
              },
            }
          : c,
      ),
      edges,
    };
    expect(subsystemGraphLayoutKey(base)).toBe(subsystemGraphLayoutKey(withRef));
  });
});
