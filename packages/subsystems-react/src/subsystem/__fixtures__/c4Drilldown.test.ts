import { describe, expect, test } from 'bun:test';
import {
  CLI,
  DISK,
  DRILLDOWN_C4_MODEL,
  DRILLDOWN_COMPONENTS,
  DRILLDOWN_DOC,
  DRILLDOWN_EDGES,
  DRILLDOWN_MODEL_SOURCE,
  DRILLDOWN_MEMBERS,
  DRILLDOWN_TRAILS,
  GITHUB,
  HOST,
  RENDERER,
  SITE,
  deriveCodeProcessKeys,
  deriveElementMembers,
  deriveLitC4Edges,
  deriveTrailPlayerElements,
  drilldownMembersOf,
  rollupEdgeTrailRefs,
} from './c4Drilldown';

/**
 * The fixture is the test case for the C4 → component-graph drill-down,
 * grounded in the real, verified model sg-1788913589907-ieokymqg9. Two kinds
 * of truth are asserted:
 *
 *   fidelity — the document half is a faithful copy of the real model, so the
 *   test case is genuinely "pulled from a reviewed subsystem model";
 *
 *   consistency — the assumed-accepted C4 layer's claims (process keys,
 *   memberships, edge provenance) are exactly what the document supports,
 *   which is also the spec for the eventual `buildC4Model` rollup.
 */

const membersOf = (id: string) => drilldownMembersOf(id);

/** Flat list of the steps a C4 edge's refs point at, in document order. */
function stepsOf(edge: (typeof DRILLDOWN_EDGES)[number]) {
  const byId = new Map(DRILLDOWN_TRAILS.map((t) => [t.id, t]));
  return (edge.trailRefs ?? []).flatMap((ref) => {
    const trail = byId.get(ref.trailId);
    if (!trail) return [];
    return ref.stepIndices.map((i) => trail.steps[i]).filter(Boolean);
  });
}

function sortRefs(refs: ReturnType<typeof rollupEdgeTrailRefs>) {
  return [...refs]
    .sort((a, b) => a.trailId.localeCompare(b.trailId))
    .map((r) => ({ ...r, stepIndices: [...r.stepIndices].sort((x, y) => x - y) }));
}

// ---------------------------------------------------------------------------
// Fidelity to the real reviewed model.
// ---------------------------------------------------------------------------

describe('c4Drilldown fixture — faithful copy of sg-1788913589907-ieokymqg9', () => {
  test('doc metadata matches the real model', () => {
    expect(DRILLDOWN_DOC.title).toBe(DRILLDOWN_MODEL_SOURCE.title);
    expect(DRILLDOWN_MODEL_SOURCE.repo).toBe('pkg:github/principal-ai/subsystem-modeling');
    expect(DRILLDOWN_COMPONENTS).toHaveLength(19);
    expect(DRILLDOWN_TRAILS).toHaveLength(3);
  });

  test('component alias → process map is exactly the real model\'s', () => {
    const expected: Array<[string, string | undefined]> = [
      ['site-gist-page', 'site/web'],
      ['gist-load', 'site/web'],
      ['to-portable', 'site/web'],
      ['is-portable', 'subsystems-core/types'],
      ['portable-doc', 'subsystems-core/types'],
      ['host-binding', 'subsystems-core/types'],
      ['github-gists-api', 'external/github'],
      ['react-graph', 'subsystems-react/ui'],
      ['cli-create', 'principal-studio-cli'],
      ['studio-create', 'subsystems-studio/host'],
      ['studio-update', 'subsystems-studio/host'],
      ['studio-get', 'subsystems-studio/host'],
      ['model-disk-store', 'local/disk'],
      ['index-entry', 'subsystems-studio/host'],
      ['studio-list', 'subsystems-studio/renderer'],
      ['studio-model-view', 'subsystems-studio/renderer'],
      ['open-tab', 'subsystems-studio/host'],
      ['gist-share-ui', 'proposed/studio-gist'],
      ['gist-ref', 'proposed/studio-gist'],
    ];
    expect(
      DRILLDOWN_COMPONENTS.map((c) => [c.alias, c.process] as [string, string | undefined]),
    ).toEqual(expected);
  });

  test('trail ids, titles, and step counts match the real model', () => {
    expect(
      DRILLDOWN_TRAILS.map((t) => [t.id, t.title, t.steps.length]),
    ).toEqual([
      ['tl-site-view-gist', 'Someone opens the shared gist on the site', 4],
      ['tl-persist-local-store', 'Persist a local model to ~/.principal/subsystem-models', 4],
      ['tl-proposed-share-gist', 'Proposed: share local model as gist (create or update)', 5],
    ]);
  });

  test('model-level verification state is carried through', () => {
    expect(DRILLDOWN_MODEL_SOURCE.verifiedCount).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Consistency of the assumed-accepted C4 layer.
// ---------------------------------------------------------------------------

describe('c4Drilldown fixture — C4 layer agrees with the document', () => {
  test('every trail step endpoints a component alias that exists', () => {
    const aliases = new Set(DRILLDOWN_COMPONENTS.map((c) => c.alias));
    for (const trail of DRILLDOWN_TRAILS) {
      for (const step of trail.steps) {
        expect(aliases.has(step.from), `${trail.id} step .from`).toBe(true);
        expect(aliases.has(step.to), `${trail.id} step .to`).toBe(true);
      }
    }
  });

  test('every member of every C4 element is a real component alias', () => {
    const aliases = new Set(DRILLDOWN_COMPONENTS.map((c) => c.alias));
    for (const element of DRILLDOWN_C4_MODEL.nodes) {
      const members = element.kind === 'container'
        ? (DRILLDOWN_MEMBERS[element.id] ?? [])
        : (element.members ?? []);
      for (const alias of members) {
        expect(aliases.has(alias), `${element.id} member ${alias}`).toBe(true);
      }
    }
  });

  test('container memberships derive exactly from their process claims', () => {
    const byElement = deriveElementMembers(DRILLDOWN_C4_MODEL.nodes, DRILLDOWN_COMPONENTS);
    expect([...byElement.entries()].sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
      ['component:cli-command', ['cli-create']],
      ['component:host-store', ['studio-create', 'studio-update', 'studio-get', 'index-entry']],
      ['component:host-tabs', ['open-tab']],
      ['component:renderer-views', ['studio-list', 'studio-model-view']],
      ['component:site-gist', ['site-gist-page', 'gist-load', 'to-portable']],
      [CLI, ['cli-create']],
      [SITE, ['site-gist-page', 'gist-load', 'to-portable']],
      [HOST, ['studio-create', 'studio-update', 'studio-get', 'index-entry', 'open-tab']],
      [RENDERER, ['studio-list', 'studio-model-view']],
      [DISK, ['model-disk-store']],
      [GITHUB, ['github-gists-api']],
    ]);
  });

  test('top-level memberships split all claimed components disjointly', () => {
    const seen = new Set<string>();
    for (const id of [HOST, RENDERER, CLI, SITE, GITHUB, DISK]) {
      for (const alias of drilldownMembersOf(id) ?? []) {
        expect(seen.has(alias), `${id} reuses ${alias}`).toBe(false);
        seen.add(alias);
      }
    }
    // 19 components total; the 6 library/proposed ones are intentionally
    // claimed by nothing (asserted next), so 13 sit inside the C4 boxes.
    expect(seen.size).toBe(13);
    const unclaimed = DRILLDOWN_COMPONENTS.map((c) => c.alias).filter((a) => !seen.has(a));
    expect(unclaimed.sort()).toEqual([
      'gist-ref',
      'gist-share-ui',
      'host-binding',
      'is-portable',
      'portable-doc',
      'react-graph',
    ]);
  });

  test('no container claims a library or proposed process — the anti-"library" rule', () => {
    const claimed = new Set(
      DRILLDOWN_C4_MODEL.nodes
        .filter((n) => n.kind === 'container')
        .map((n) => (n as { process?: string }).process)
        .filter((p): p is string => !!p),
    );
    for (const excluded of ['subsystems-core/types', 'subsystems-react/ui', 'proposed/studio-gist']) {
      expect(claimed.has(excluded), `claims ${excluded}`).toBe(false);
    }
    // …and every claim it DOES make exists in the document.
    for (const process of claimed) {
      expect(
        DRILLDOWN_COMPONENTS.some((c) => c.process === process),
        `claim ${process}`,
      ).toBe(true);
    }
  });

  test('the rollup recomputes exactly the hand-authored trailRefs', () => {
    for (const edge of DRILLDOWN_EDGES) {
      const computed = rollupEdgeTrailRefs({
        source: edge.source,
        target: edge.target,
        trails: DRILLDOWN_TRAILS,
        membersOf,
      });
      expect(sortRefs(computed), `${edge.id} rollup`).toEqual(
        sortRefs(edge.trailRefs ?? []),
      );
    }
  });

  test('count is the total referenced steps; mechanisms their distinct verbs', () => {
    for (const edge of DRILLDOWN_EDGES) {
      if ((edge.trailRefs ?? []).length === 0) continue;
      const steps = stepsOf(edge);
      expect(edge.count, `${edge.id} count`).toBe(steps.length);
      const verbs = [...new Set(steps.map((s) => s.mechanism))];
      expect(edge.mechanisms, `${edge.id} mechanisms`).toEqual(verbs);
    }
  });

  test('the proposed trail contributes no accepted edges (its components are not claimed)', () => {
    // The proposed gist-share walkthrough touches host/site/github, but its
    // unclaimed proposed components keep it out of the accepted fold.
    for (const edge of DRILLDOWN_EDGES) {
      for (const ref of edge.trailRefs ?? []) {
        expect(ref.trailId).not.toBe('tl-proposed-share-gist');
      }
    }
  });

  test('the renderer has no incident edges — only the proposed trail would attach lines to it', () => {
    const incident = DRILLDOWN_EDGES.filter(
      (e) => e.source === RENDERER || e.target === RENDERER,
    );
    expect(incident).toEqual([]);
  });

  test('trail players: the containers/externals/parts each walkthrough actually touches', () => {
    const playersOf = (id: string) =>
      deriveTrailPlayerElements(
        DRILLDOWN_TRAILS.find((t) => t.id === id)!.steps,
        DRILLDOWN_MEMBERS,
      );
    const sortIds = (s: Set<string>) => [...s].sort();

    // Site viewer: site page/loader parts + the GitHub API. The site CONTAINER
    // is a player because its process claim owns the aliases — the visible
    // card lights up at container view, and stays lit when opened (its parts
    // are players too).
    expect(sortIds(playersOf('tl-site-view-gist'))).toEqual(
      sortIds(new Set([SITE, 'component:site-gist', GITHUB])),
    );
    // CLI create → host store → disk + tab open: both the CLI and host
    // containers AND the authored parts nested under them play.
    expect(sortIds(playersOf('tl-persist-local-store'))).toEqual(
      sortIds(
        new Set([
          CLI,
          'component:cli-command',
          HOST,
          'component:host-store',
          'component:host-tabs',
          DISK,
        ]),
      ),
    );
    // Proposed share: host + site parts + GitHub; no container for the
    // unclaimed proposed aliases (gist-share-ui, gist-ref) — they light
    // nothing, exactly like the anti-library stance.
    expect(sortIds(playersOf('tl-proposed-share-gist'))).toEqual(
      sortIds(new Set([HOST, 'component:host-store', SITE, 'component:site-gist', GITHUB])),
    );
    // A step between two unclaimed aliases (library/proposed components)
    // contributes no players at all — the dim set is the whole model.
    expect(
      playersOf('tl-site-view-gist').size,
    ).toBeGreaterThan(0);
    expect(
      deriveTrailPlayerElements(
        [{ from: 'react-graph', to: 'gist-ref' }],
        DRILLDOWN_MEMBERS,
      ),
    ).toEqual(new Set());
  });

  test('lit edges: only the lines that carry the focused trail / hovered step', () => {
    const lit = (source: { trailId: string; stepIndex?: number }) =>
      [...deriveLitC4Edges(source, DRILLDOWN_EDGES)].sort();

    // Whole trail → every line its steps fold into.
    expect(lit({ trailId: 'tl-persist-local-store' })).toEqual(['e:cli-host', 'e:host-disk']);
    expect(lit({ trailId: 'tl-site-view-gist' })).toEqual(['e:site-github']);

    // A boundary step lights exactly its folding line.
    expect(lit({ trailId: 'tl-persist-local-store', stepIndex: 0 })).toEqual(['e:cli-host']);
    expect(lit({ trailId: 'tl-persist-local-store', stepIndex: 1 })).toEqual(['e:host-disk']);
    expect(lit({ trailId: 'tl-site-view-gist', stepIndex: 1 })).toEqual(['e:site-github']);

    // A step entirely internal to a container folds into NO line — lit is
    // empty, so every edge dims: no drawn edge represents that hop.
    expect(lit({ trailId: 'tl-persist-local-store', stepIndex: 2 })).toEqual([]); // studio-create → index-entry, both in HOST
    expect(lit({ trailId: 'tl-site-view-gist', stepIndex: 0 })).toEqual([]); // site-gist-page → gist-load, both in SITE
    expect(lit({ trailId: 'tl-site-view-gist', stepIndex: 3 })).toEqual([]); // site → react-graph, unclaimed target

    // The proposed trail is outside the accepted fold: it lights no line.
    expect(lit({ trailId: 'tl-proposed-share-gist' })).toEqual([]);
    expect(lit({ trailId: 'tl-proposed-share-gist', stepIndex: 3 })).toEqual([]);
  });

  test('code process keys: exactly the processes the accepted element set backs with nothing', () => {
    // An element backs a process by claiming the key (containers) or carrying
    // a member whose component claims it (externals, L3 children). What
    // nobody backs draws as a code boundary in the component graph — package
    // chrome, not the solid runtime chrome a deployment unit wears.
    const code = deriveCodeProcessKeys(DRILLDOWN_C4_MODEL.nodes, DRILLDOWN_COMPONENTS);
    expect([...code].sort()).toEqual([
      'proposed/studio-gist',
      'subsystems-core/types',
      'subsystems-react/ui',
    ]);

    // Every process an accepted element covers keeps its runtime chrome:
    // the four container-backed units plus the two store/external systems.
    const runtime = [
      'external/github',
      'local/disk',
      'principal-studio-cli',
      'site/web',
      'subsystems-studio/host',
      'subsystems-studio/renderer',
    ];
    for (const key of runtime) expect(code.has(key)).toBe(false);

    // And the set covers every distinct process in the model — nothing is
    // decided by omission.
    const all = new Set(
      DRILLDOWN_COMPONENTS.map((c) => c.process).filter((p): p is string => Boolean(p)),
    );
    expect(new Set([...all].filter((k) => !code.has(k))).size).toBe(runtime.length);
  });
});