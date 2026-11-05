/**
 * Lines authored between components must survive a collapsed container.
 *
 * A sketch is allowed to draw an edge at the component level. When the
 * container is closed those components are not on screen, and the old
 * `drawnIds.has(source) && drawnIds.has(target)` filter dropped the line
 * outright. The relationship did not go away — it just moved up a level — so
 * the endpoints roll up to their containers instead.
 */
import { describe, expect, test } from 'bun:test';
import { resolveC4EdgeEndpoints } from './C4Graph';
import { MAINTENANCE_BRIDGE_SKETCH } from './__fixtures__/c4SketchGallery';
import type { C4Edge, C4Element } from './c4';

const SYSTEM = 'system:studio';

const NODES: C4Element[] = [
  {
    id: 'container:host',
    kind: 'container',
    label: 'Host',
    containerKind: 'application',
    technology: 'Bun',
    parentId: SYSTEM,
    state: 'accepted',
  },
  {
    id: 'container:web',
    kind: 'container',
    label: 'Web',
    containerKind: 'application',
    technology: 'React',
    parentId: SYSTEM,
    state: 'accepted',
  },
  {
    id: 'component:host-store',
    kind: 'component',
    label: 'Store',
    container: 'container:host',
    technology: 'Bun',
    state: 'accepted',
  },
  {
    id: 'component:host-tabs',
    kind: 'component',
    label: 'Tabs',
    container: 'container:host',
    technology: 'Bun',
    state: 'accepted',
  },
  {
    id: 'component:web-view',
    kind: 'component',
    label: 'View',
    container: 'container:web',
    technology: 'React',
    state: 'accepted',
  },
  {
    id: 'external:github',
    kind: 'external-system',
    label: 'GitHub',
    technology: 'REST',
    state: 'accepted',
  },
];

function edge(id: string, source: string, target: string, label = 'calls'): C4Edge {
  return {
    id,
    source,
    target,
    label,
    protocol: label,
    mechanisms: ['calls'],
    count: 1,
  };
}

const collapsed = new Set(['container:host', 'container:web', 'external:github']);

const endpoints = (
  edges: readonly C4Edge[],
  drawnIds: ReadonlySet<string>,
) =>
  resolveC4EdgeEndpoints(edges, NODES, drawnIds).map(({ edge: e, source, target }) => ({
    id: e.id,
    source,
    target,
  }));

describe('resolveC4EdgeEndpoints — collapsed containers', () => {
  test('rolls a cross-container component line up to its containers', () => {
    // The bug: both components are hidden, so this line used to vanish and the
    // two containers read as unrelated.
    expect(endpoints([edge('e:view-store', 'component:web-view', 'component:host-store')], collapsed))
      .toEqual([{ id: 'e:view-store', source: 'container:web', target: 'container:host' }]);
  });

  test('drops a line wholly inside one closed container', () => {
    // Both endpoints fold to the same container; there is no boundary to cross,
    // so drawing it would be a self-loop on the closed card.
    expect(endpoints([edge('e:tabs-store', 'component:host-tabs', 'component:host-store')], collapsed))
      .toEqual([]);
  });

  test('rolls a component endpoint up to its container against an external', () => {
    expect(endpoints([edge('e:store-github', 'component:host-store', 'external:github')], collapsed))
      .toEqual([{ id: 'e:store-github', source: 'container:host', target: 'external:github' }]);
  });

  test('keeps the real maintenance-bridge cross-container line visible', () => {
    // The sketch authors `binding → progress card` at component level. Both
    // containers start closed, so this line is the only evidence that OpenBot's
    // server feeds its app — and the bug erased it.
    const model = MAINTENANCE_BRIDGE_SKETCH.model;
    const drawn = new Set(
      model.nodes.filter((node) => node.kind !== 'component').map((node) => node.id),
    );
    expect(
      resolveC4EdgeEndpoints(model.edges, model.nodes, drawn).find(
        ({ edge }) => edge.id === 'e:binding-card',
      ),
    ).toEqual(expect.objectContaining({
      source: 'container:openbot-server',
      target: 'container:openbot-app',
    }));
  });

  test('leaves an authored container line unchanged', () => {
    expect(endpoints([edge('e:host-web', 'container:host', 'container:web')], collapsed))
      .toEqual([{ id: 'e:host-web', source: 'container:host', target: 'container:web' }]);
  });

  test('drops an endpoint whose container is not drawn either', () => {
    expect(endpoints([edge('e:missing', 'component:missing', 'container:web')], collapsed))
      .toEqual([]);
  });
});

describe('resolveC4EdgeEndpoints — opened containers', () => {
  const opened = new Set([...collapsed, 'component:web-view']);

  test('keeps a drawn component as the endpoint, on either side', () => {
    // Opening the web container draws its component, so the line stays at its
    // authored level while the still-closed host end rolls up.
    expect(endpoints([edge('e:view-store', 'component:web-view', 'component:host-store')], opened))
      .toEqual([{ id: 'e:view-store', source: 'component:web-view', target: 'container:host' }]);
  });

  test('keeps both component endpoints when both are drawn', () => {
    const bothOpen = new Set([...collapsed, 'component:web-view', 'component:host-store']);
    expect(endpoints([edge('e:view-store', 'component:web-view', 'component:host-store')], bothOpen))
      .toEqual([{ id: 'e:view-store', source: 'component:web-view', target: 'component:host-store' }]);
  });

  test('does not roll a component endpoint up when the component itself is drawn', () => {
    expect(endpoints([edge('e:github-view', 'external:github', 'component:web-view')], opened))
      .toEqual([{ id: 'e:github-view', source: 'external:github', target: 'component:web-view' }]);
  });
});
