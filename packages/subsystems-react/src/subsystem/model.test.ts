import { describe, expect, test } from 'bun:test';
import {
  convertSubsystemToNodes,
  convertSubsystemToEdges,
  convertSubsystemToGroups,
  getSubsystemRegions,
  getSubsystemModuleRegions,
  getSubsystemPackageRegions,
  processGroupNodeId,
  moduleGroupNodeId,
  packageGroupNodeId,
  buildBoundaryLayoutGroups,
  buildSubsystemGraph,
  componentPackageKey,
  deriveNameFromSymbol,
  constructBadgeLabel,
  constructBadgeColor,
  FRAMEWORK_BADGE_COLOR,
  rightBadgeLabel,
  nodeMinWidthForBadges,
  estimateBadgeLabelWidth,
  BADGE_EDGE_INSET,
  formatPurl,
  packageColor,
  subsystemGraphLayoutKey,
} from './model';
import type { SubsystemComponent, SubsystemComponentEdge } from './model';

const comps: SubsystemComponent[] = [
  { id: 'reader', name: 'SessionReader', construct: 'class', file: 'SessionReader.ts', purl: 'pkg:github/principal-ai/agent-monitoring' },
  { id: 'transcript', name: 'transcript', construct: 'function', file: 'transcript.ts', purl: 'pkg:github/principal-ai/agent-monitoring' },
];

const relations = [
  { id: 'e1', from: 'transcript', to: 'reader', relationType: 'imports' as const },
  // 'host' is NOT a component — this is the cross-package external case.
  { id: 'e2', from: 'reader', to: 'host', relationType: 'imports' as const, refs: ['bun/index.ts'] },
];

const doc = { components: comps, relations };

describe('subsystem graph model', () => {
  test('converts all components to flat component nodes', () => {
    const nodes = convertSubsystemToNodes(doc);
    const components = nodes.filter((n) => n.type === 'subsystem-component');
    expect(components).toHaveLength(comps.length);
    expect(components.every((n) => n.type === 'subsystem-component')).toBe(true);
  });

  test('converts edges with directed markers', () => {
    const converted = convertSubsystemToEdges(doc);
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
        construct: "external",
        // Intentionally omit file/purl — agents often leave these off for externals.
        file: undefined as unknown as string,
        purl: undefined as unknown as string,
      },
    ];
    const { nodes } = await buildSubsystemGraph({
      components: withExternal,
      relations: [],
      walkthroughs: [{
        id: 'w1',
        title: 'feed',
        steps: [{ from: 'reader', to: 'proposed-watcher', mechanism: 'feeds', file: 'x.ts', line: 1 }],
      }],
    });
    expect(nodes.find((n) => n.id === 'proposed-watcher')).toBeDefined();
  });

  test('buildSubsystemGraph creates external stub nodes for non-component targets', async () => {
    const { nodes, edges: gEdges } = await buildSubsystemGraph(doc);
    const external = nodes.find((n) => n.id === 'external:host');
    expect(external).toBeDefined();
    expect(external!.data.component.construct).toBe('external');
    const crossEdge = gEdges.find((e) => e.target === 'external:host');
    expect(crossEdge).toBeDefined();
  });

  test('buildSubsystemGraph positions nodes via ELK (non-zero coords)', async () => {
    const { nodes } = await buildSubsystemGraph(doc);
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
    // brace-bodied constructs wear {}; classes render bare.
    expect(deriveNameFromSymbol('SessionReader', 'class')).toBe('SessionReader');
    expect(deriveNameFromSymbol('SessionRecord', 'type_alias')).toBe('SessionRecord {}');
    expect(deriveNameFromSymbol('transcript', 'function')).toBe('transcript()');
    // falls back to existing name when no symbol (class stays bare).
    expect(deriveNameFromSymbol(undefined, 'class', 'SessionReader')).toBe('SessionReader');
    expect(deriveNameFromSymbol('', 'external', 'principal-studio-host')).toBe('principal-studio-host');
    // custom entities render bare — no decoration, name is the identity
    expect(deriveNameFromSymbol(undefined, 'custom_entity', 'FacilitiesTechnician')).toBe('FacilitiesTechnician');
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
    // custom entities wear their entityKind as the badge
    expect(
      constructBadgeLabel({ construct: 'custom_entity', entityKind: 'Person' }),
    ).toBe('Person');
    expect(
      constructBadgeLabel({ construct: 'custom_entity' }),
    ).toBe('custom_entity');
  });

  test('constructBadgeColor uses React brand only for framework stereotype badges', () => {
    expect(
      constructBadgeColor({ framework: 'react', stereotype: 'component' }),
    ).toBe(FRAMEWORK_BADGE_COLOR.react);
    expect(constructBadgeColor({ framework: 'react' })).toBeNull();
    expect(constructBadgeColor({ stereotype: 'hook' })).toBeNull();
    expect(constructBadgeColor({ framework: 'vue', stereotype: 'component' })).toBeNull();
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

    const withProposed = nodeMinWidthForBadges({
      construct: 'function',
      proposed: true,
    });
    expect(withProposed).toBeGreaterThan(plain);

    const withBoth = nodeMinWidthForBadges({
      construct: 'function',
      role: 'entry',
      proposed: true,
    });
    // proposed-only label is shorter than entry · proposed; still wider than plain
    expect(withBoth).toBe(withProposed);

    // The pair floor must leave a real gap between the left and right badge,
    // over and above both insets — regression: the node border was omitted from
    // the floor, and the char width was underestimated, so the two badges met.
    const left = estimateBadgeLabelWidth(constructBadgeLabel({ construct: 'function' }));
    const right = estimateBadgeLabelWidth(rightBadgeLabel({ proposed: true })!);
    expect(withBoth).toBeGreaterThan(left + right + 2 * BADGE_EDGE_INSET);
  });

  test('rightBadgeLabel prefers proposed over role', () => {
    expect(rightBadgeLabel({})).toBeNull();
    expect(rightBadgeLabel({ proposed: true })).toBe('proposed');
    expect(rightBadgeLabel({ role: 'entry' })).toBe('entry');
    expect(rightBadgeLabel({ role: 'service', proposed: true })).toBe('proposed');
  });

  test('deriveNameFromSymbol falls back to existing name when no symbol', () => {
    expect(deriveNameFromSymbol(undefined, 'class', undefined, 'transcript.ts')).toBe('untitled');
    expect(deriveNameFromSymbol(undefined, 'function', 'MyFn', 'x.ts')).toBe('MyFn()');
    // Symbol wins over a supplied name.
    expect(deriveNameFromSymbol('CodexRolloutRecord', 'function', undefined, 'transcript.ts')).toBe(
      'CodexRolloutRecord()',
    );
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
    expect(regions.every((r) => r.kind === 'process')).toBe(true);
    expect(regions[0]!.memberIds).toEqual(['a', 'b']);
  });

  test('getSubsystemModuleRegions groups by module, skipping module-less nodes', () => {
    const regions = getSubsystemModuleRegions({
      components: [
        { id: 'a', name: 'a', construct: 'function', file: 'transcript.ts', purl: 'pkg:github/acme/app', module: 'src/session/transcript.ts' },
        { id: 'b', name: 'b', construct: 'type_alias', file: 'transcript.ts', purl: 'pkg:github/acme/app', module: 'src/session/transcript.ts' },
        { id: 'c', name: 'c', construct: 'function', file: 'paths.ts', purl: 'pkg:github/acme/app', module: 'src/session/paths.ts' },
        { id: 'd', name: 'd', construct: 'function', file: 'other.ts', purl: 'pkg:github/acme/app' },
      ],
    });
    expect(regions.map((r) => r.key)).toEqual([
      'src/session/transcript.ts',
      'src/session/paths.ts',
    ]);
    expect(regions.every((r) => r.kind === 'module')).toBe(true);
    expect(regions[0]!.memberIds).toEqual(['a', 'b']);
  });

  test('convertSubsystemToNodes prefers module parentId over process', () => {
    const nodes = convertSubsystemToNodes({
      components: [
        {
          id: 'a',
          name: 'a',
          construct: 'function',
          file: 'a.ts',
          purl: 'pkg:github/acme/app',
          process: 'app/host',
          module: 'src/a.ts',
        },
        { id: 'd', name: 'd', construct: 'function', file: 'd.ts', purl: 'pkg:github/acme/app' },
      ],
      relations: [],
    });
    expect((nodes.find((n) => n.id === 'a') as { parentId?: string }).parentId).toBe(
      moduleGroupNodeId('src/a.ts'),
    );
    expect((nodes.find((n) => n.id === 'd') as { parentId?: string }).parentId).toBeUndefined();
  });

  test('convertSubsystemToNodes stamps parentId for process members only', () => {
    const nodes = convertSubsystemToNodes({
      components: [
        { id: 'a', name: 'a', construct: 'function', file: 'a.ts', purl: 'pkg:github/acme/app', process: 'app/host' },
        { id: 'd', name: 'd', construct: 'function', file: 'd.ts', purl: 'pkg:github/acme/app' },
      ],
      relations: [],
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

  test('convertSubsystemToGroups nests module frames under a shared process', () => {
    const groups = convertSubsystemToGroups({
      components: [
        {
          id: 'a',
          name: 'a',
          construct: 'function',
          file: 'a.ts',
          purl: 'pkg:github/acme/app',
          process: 'app/host',
          module: 'src/a.ts',
        },
        {
          id: 'b',
          name: 'b',
          construct: 'function',
          file: 'a.ts',
          purl: 'pkg:github/acme/app',
          process: 'app/host',
          module: 'src/a.ts',
        },
      ],
    });
    expect(groups.map((g) => g.id).sort()).toEqual(
      [moduleGroupNodeId('src/a.ts'), processGroupNodeId('app/host')].sort(),
    );
    const mod = groups.find((g) => g.id === moduleGroupNodeId('src/a.ts'));
    expect((mod as { parentId?: string }).parentId).toBe(processGroupNodeId('app/host'));
    const proc = groups.find((g) => g.id === processGroupNodeId('app/host'));
    expect((proc as { parentId?: string }).parentId).toBeUndefined();
  });

  test('buildSubsystemGraph nests module frames inside process frames', async () => {
    const { nodes, regions } = await buildSubsystemGraph({
      components: [
        {
          id: 'boot',
          name: 'boot',
          construct: 'function',
          file: 'main.ts',
          purl: 'pkg:github/acme/app',
          process: 'app/host',
          module: 'src/main.ts',
          symbol: 'boot',
        },
        {
          id: 'create',
          name: 'createHost',
          construct: 'function',
          file: 'main.ts',
          purl: 'pkg:github/acme/app',
          process: 'app/host',
          module: 'src/main.ts',
          symbol: 'createHost',
        },
        {
          id: 'write',
          name: 'writeSession',
          construct: 'function',
          file: 'store.ts',
          purl: 'pkg:github/acme/app',
          process: 'app/host',
          module: 'src/store.ts',
          symbol: 'writeSession',
        },
        {
          id: 'store',
          name: 'SessionStore',
          construct: 'store',
          file: 'store.ts',
          purl: 'pkg:github/acme/app',
          process: 'app/host',
          module: 'src/store.ts',
          symbol: 'SessionStore',
        },
      ],
      relations: [],
    });
    expect(regions.map((r) => r.key).sort()).toEqual(
      ['app/host', 'src/main.ts', 'src/store.ts'].sort(),
    );
    const processNode = nodes.find((n) => n.id === processGroupNodeId('app/host'));
    const mainMod = nodes.find((n) => n.id === moduleGroupNodeId('src/main.ts'));
    const storeMod = nodes.find((n) => n.id === moduleGroupNodeId('src/store.ts'));
    expect(processNode).toBeDefined();
    expect(mainMod).toBeDefined();
    expect(storeMod).toBeDefined();
    expect((mainMod as { parentId?: string }).parentId).toBe(processGroupNodeId('app/host'));
    expect((storeMod as { parentId?: string }).parentId).toBe(processGroupNodeId('app/host'));
    expect((nodes.find((n) => n.id === 'boot') as { parentId?: string }).parentId).toBe(
      moduleGroupNodeId('src/main.ts'),
    );
    expect((nodes.find((n) => n.id === 'store') as { parentId?: string }).parentId).toBe(
      moduleGroupNodeId('src/store.ts'),
    );
  });

  test('buildSubsystemGraph drops singleton process frames (no parentId, no group)', async () => {
    const { nodes, regions } = await buildSubsystemGraph({
      components: [
        { id: 'a', name: 'a', construct: 'function', file: 'a.ts', purl: 'pkg:github/acme/app', process: 'app/host' },
        { id: 'b', name: 'b', construct: 'function', file: 'b.ts', purl: 'pkg:github/acme/app', process: 'app/host' },
        { id: 'solo', name: 'solo', construct: 'function', file: 's.ts', purl: 'pkg:github/acme/app', process: 'app/lonely' },
      ],
      relations: [],
      walkthroughs: [{
        id: 'w1',
        title: 'call',
        steps: [{ from: 'a', to: 'b', mechanism: 'calls', file: 'a.ts', line: 1 }],
      }],
    });
    expect(regions.map((r) => r.key)).toEqual(['app/host']);
    expect((nodes.find((n) => n.id === 'solo') as { parentId?: string }).parentId).toBeUndefined();
    expect(nodes.find((n) => n.id === processGroupNodeId('app/lonely'))).toBeUndefined();
  });

  test('buildSubsystemGraph frames multi-member modules', async () => {
    const { nodes, regions } = await buildSubsystemGraph({
      components: [
        {
          id: 'rec',
          name: 'CodexRolloutRecord',
          construct: 'type_alias',
          file: 'transcript.ts',
          purl: 'pkg:github/acme/app',
          module: 'src/session/transcript.ts',
          symbol: 'CodexRolloutRecord',
        },
        {
          id: 'parse',
          name: 'parseTranscript',
          construct: 'function',
          file: 'transcript.ts',
          purl: 'pkg:github/acme/app',
          module: 'src/session/transcript.ts',
          symbol: 'parseTranscript',
        },
        {
          id: 'solo',
          name: 'lonely',
          construct: 'function',
          file: 'solo.ts',
          purl: 'pkg:github/acme/app',
          module: 'src/solo.ts',
          symbol: 'lonely',
        },
      ],
      relations: [],
    });
    expect(regions.map((r) => r.key)).toEqual(['src/session/transcript.ts']);
    expect(regions[0]!.kind).toBe('module');
    expect((nodes.find((n) => n.id === 'rec') as { parentId?: string }).parentId).toBe(
      moduleGroupNodeId('src/session/transcript.ts'),
    );
    expect((nodes.find((n) => n.id === 'solo') as { parentId?: string }).parentId).toBeUndefined();
    expect(nodes.find((n) => n.id === moduleGroupNodeId('src/session/transcript.ts'))).toBeDefined();
  });

  test('getSubsystemPackageRegions groups by purl repo key, skipping externals', () => {
    const regions = getSubsystemPackageRegions({
      components: [
        { id: 'a', name: 'a', construct: 'function', file: 'a.ts', purl: 'pkg:github/acme/app#a.ts' },
        { id: 'b', name: 'b', construct: 'function', file: 'b.ts', purl: 'pkg:github/acme/app' },
        { id: 'c', name: 'c', construct: 'function', file: 'c.ts', purl: 'pkg:github/other/lib' },
        { id: 'ext', name: 'Stripe', construct: 'external', file: '', purl: 'pkg:npm/stripe' },
      ],
    });
    expect(regions.map((r) => r.key).sort()).toEqual([
      'pkg:github/acme/app',
      'pkg:github/other/lib',
    ].sort());
    expect(regions.every((r) => r.kind === 'package')).toBe(true);
    expect(componentPackageKey({ construct: 'external', purl: 'pkg:npm/stripe' })).toBeUndefined();
  });

  test('buildBoundaryLayoutGroups skips package frames for single-repo graphs', () => {
    const groups = buildBoundaryLayoutGroups({
      components: [
        { id: 'a', name: 'a', construct: 'function', file: 'a.ts', purl: 'pkg:github/acme/app' },
        { id: 'b', name: 'b', construct: 'function', file: 'b.ts', purl: 'pkg:github/acme/app' },
      ],
    });
    expect(groups.filter((g) => g.region.kind === 'package')).toHaveLength(0);
  });

  test('buildBoundaryLayoutGroups frames packages when multi-repo', () => {
    const groups = buildBoundaryLayoutGroups({
      components: [
        { id: 'a', name: 'a', construct: 'function', file: 'a.ts', purl: 'pkg:github/acme/app' },
        { id: 'b', name: 'b', construct: 'function', file: 'b.ts', purl: 'pkg:github/acme/app' },
        { id: 'c', name: 'c', construct: 'function', file: 'c.ts', purl: 'pkg:github/other/lib' },
        { id: 'd', name: 'd', construct: 'function', file: 'd.ts', purl: 'pkg:github/other/lib' },
      ],
    });
    const pkgs = groups.filter((g) => g.region.kind === 'package');
    expect(pkgs.map((g) => g.region.key).sort()).toEqual([
      'pkg:github/acme/app',
      'pkg:github/other/lib',
    ].sort());
  });

  test('buildBoundaryLayoutGroups nests process under package', () => {
    const groups = buildBoundaryLayoutGroups({
      components: [
        {
          id: 'a',
          name: 'a',
          construct: 'function',
          file: 'a.ts',
          purl: 'pkg:github/acme/app',
          process: 'app/host',
        },
        {
          id: 'b',
          name: 'b',
          construct: 'function',
          file: 'b.ts',
          purl: 'pkg:github/acme/app',
          process: 'app/host',
        },
        {
          id: 'c',
          name: 'c',
          construct: 'function',
          file: 'c.ts',
          purl: 'pkg:github/other/lib',
          process: 'lib/worker',
        },
        {
          id: 'd',
          name: 'd',
          construct: 'function',
          file: 'd.ts',
          purl: 'pkg:github/other/lib',
          process: 'lib/worker',
        },
      ],
    });
    const host = groups.find((g) => g.id === processGroupNodeId('app/host'));
    expect(host?.parentId).toBe(packageGroupNodeId('pkg:github/acme/app'));
  });

  test('buildSubsystemGraph nests package → process → module', async () => {
    const { nodes } = await buildSubsystemGraph({
      components: [
        {
          id: 'a1',
          name: 'a1',
          construct: 'function',
          file: 'a.ts',
          purl: 'pkg:github/acme/app',
          process: 'app/host',
          module: 'src/a.ts',
        },
        {
          id: 'a2',
          name: 'a2',
          construct: 'function',
          file: 'a.ts',
          purl: 'pkg:github/acme/app',
          process: 'app/host',
          module: 'src/a.ts',
        },
        {
          id: 'b1',
          name: 'b1',
          construct: 'function',
          file: 'b.ts',
          purl: 'pkg:github/other/lib',
          process: 'lib/worker',
          module: 'src/b.ts',
        },
        {
          id: 'b2',
          name: 'b2',
          construct: 'function',
          file: 'b.ts',
          purl: 'pkg:github/other/lib',
          process: 'lib/worker',
          module: 'src/b.ts',
        },
      ],
      relations: [],
    });
    const pkgA = nodes.find((n) => n.id === packageGroupNodeId('pkg:github/acme/app'));
    const proc = nodes.find((n) => n.id === processGroupNodeId('app/host'));
    const mod = nodes.find((n) => n.id === moduleGroupNodeId('src/a.ts'));
    expect(pkgA).toBeDefined();
    expect((proc as { parentId?: string }).parentId).toBe(
      packageGroupNodeId('pkg:github/acme/app'),
    );
    expect((mod as { parentId?: string }).parentId).toBe(processGroupNodeId('app/host'));
    expect((nodes.find((n) => n.id === 'a1') as { parentId?: string }).parentId).toBe(
      moduleGroupNodeId('src/a.ts'),
    );
  });

  test('packageFrames always draws single-repo package frames when multi-member', () => {
    const groups = buildBoundaryLayoutGroups(
      {
        components: [
          { id: 'a', name: 'a', construct: 'function', file: 'a.ts', purl: 'pkg:github/acme/app' },
          { id: 'b', name: 'b', construct: 'function', file: 'b.ts', purl: 'pkg:github/acme/app' },
        ],
      },
      { packageFrames: 'always' },
    );
    expect(groups.filter((g) => g.region.kind === 'package')).toHaveLength(1);
  });

  test('subsystemGraphLayoutKey ignores declarationRef-only changes', () => {
    const base = doc;
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
      relations,
    };
    expect(subsystemGraphLayoutKey(base)).toBe(subsystemGraphLayoutKey(withRef));
  });
});
