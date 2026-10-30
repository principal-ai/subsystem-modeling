import { useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import {
  DecorationHeader,
  DecorationPanel,
  type DecorationPanelProps,
  type DecorationPanelSelection,
} from '../../subsystem/DecorationPanel';
import {
  decorationTrailKey,
  type DecorationDraftC4Element,
  type DecorationTrailRef,
  type SubsystemDecoration,
} from '../../subsystem/decoration';
import { applyDecorationC4 } from '../../subsystem/decorationC4';
import { C4Graph, type C4GraphProps } from '../../subsystem/C4Graph';
import type { C4Edge, C4Model } from '../../subsystem/c4';

/**
 * PROTOTYPE: a reading surface alongside an additive C4 projection.
 *
 * The fixture deliberately spans two models (desktop + sync service) and
 * includes one draft trail + draft structure, to show that a decoration is
 * additive and unverified — the base models stay untouched.
 */
const meta = {
  title: 'Components/DecorationPanel',
  component: DecorationPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof DecorationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const decoration: SubsystemDecoration = {
  version: 1,
  id: 'dec-local-first-sync',
  title: 'Local-first sync',
  description: [
    'How a drawing reaches disk **and** the sync service, in the order a reader should follow it.',
    '',
    '- The desktop stays the source of truth for the open tab.',
    '- The service is a projection; it never blocks the save.',
    '',
    '> Dashed boxes and segmented relationship labels are proposals, not verified model claims.',
  ].join('\n'),
  trails: [
    {
      kind: 'base',
      modelId: 'sg-desktop',
      trailId: 'tl-save',
      stepAnchors: [{ stepKey: 'fixture', note: 'Write first; the sync hop is optional.' }],
    },
    { kind: 'base', modelId: 'sg-server', trailId: 'tl-persist' },
    {
      kind: 'draft',
      modelId: 'sg-desktop',
      trail: {
        id: 'tl-planned-sync',
        title: 'Planned sync (draft)',
        steps: [
          {
            from: 'tab',
            to: 'sync-agent',
            mechanism: 'produces',
            file: 'src/components/DrawingTabContent.tsx',
            purl: 'pkg:github/principal-ai/desktop-app#src/components/DrawingTabContent.tsx',
            symbol: 'DrawingTabContent.emitSaved',
          },
          {
            from: 'sync-agent',
            to: 'sync-worker',
            mechanism: 'calls',
            file: 'src/sync/syncAgent.ts',
            purl: 'pkg:github/principal-ai/desktop-app#src/sync/syncAgent.ts',
            symbol: 'SyncAgent.push',
          },
          {
            from: 'sync-worker',
            to: 'sync-service',
            mechanism: 'calls',
            file: 'src/sync/uploadWorker.ts',
            purl: 'pkg:github/principal-ai/desktop-app#src/sync/uploadWorker.ts',
            symbol: 'UploadWorker.upload',
          },
        ],
      },
    },
  ],
  draft: {
    components: [
      {
        alias: 'sync-agent',
        name: 'SyncAgent',
        construct: 'class',
        purpose: 'queues a saved drawing for the sync service',
        process: 'draw-host',
      },
      {
        alias: 'sync-worker',
        name: 'UploadWorker',
        construct: 'class',
        purpose: 'retries uploads without blocking local saves',
        process: 'sync-worker',
      },
    ],
    edges: [
      { from: 'tab', to: 'sync-agent', mechanism: 'produces' },
      { from: 'sync-agent', to: 'sync-worker', mechanism: 'calls' },
      { from: 'sync-worker', to: 'sync-service', mechanism: 'calls' },
    ],
    c4: {
      elements: [
        {
          kind: 'component',
          id: 'component:sync-agent',
          label: 'Sync coordinator',
          container: 'container:desktop',
          technology: 'TypeScript',
          description: 'Queues saved drawings for background upload.',
          members: ['sync-agent'],
        },
        {
          kind: 'container',
          id: 'container:sync-worker',
          label: 'Background sync worker',
          containerKind: 'application',
          technology: 'Bun',
          process: 'sync-worker',
          description: 'Uploads independently of the open desktop tab.',
        },
        {
          kind: 'component',
          id: 'component:upload-worker',
          label: 'Upload queue',
          container: 'container:sync-worker',
          technology: 'TypeScript',
          description: 'Retries pending uploads to the sync service.',
          members: ['sync-worker'],
        },
      ],
      edges: [
        {
          id: 'draft:enqueue',
          source: 'component:save',
          target: 'component:sync-agent',
          label: 'Queues saved drawing',
          protocol: 'event',
          mechanisms: ['produces'],
          count: 1,
          trailRefs: [{ trailId: 'sg-desktop:tl-planned-sync', stepIndices: [0] }],
        },
        {
          id: 'draft:dispatch',
          source: 'component:sync-agent',
          target: 'component:upload-worker',
          label: 'Dispatches upload',
          protocol: 'RPC',
          mechanisms: ['calls'],
          count: 1,
          trailRefs: [{ trailId: 'sg-desktop:tl-planned-sync', stepIndices: [1] }],
        },
        {
          id: 'draft:upload',
          source: 'component:upload-worker',
          target: 'component:persist',
          label: 'Uploads drawing',
          protocol: 'HTTPS',
          mechanisms: ['calls'],
          count: 1,
          trailRefs: [{ trailId: 'sg-desktop:tl-planned-sync', stepIndices: [2] }],
        },
      ],
    },
  },
  provenance: {
    source: 'author',
    author: 'you',
    at: '2026-10-20T12:00:00.000Z',
  },
};

const resolveTrail: NonNullable<DecorationPanelProps['resolveTrail']> = (ref) => {
  if (ref.kind === 'draft') return undefined;
  const key = decorationTrailKey(ref);
  if (key === 'sg-desktop:tl-save') return { title: 'Save drawing', stepCount: 1 };
  if (key === 'sg-server:tl-persist') return { title: 'Persist file', stepCount: 1 };
  return undefined;
};

const modelLabels = new Map([
  ['sg-desktop', 'desktop-app'],
  ['sg-server', 'sync-service'],
]);

const baseC4: C4Model = {
  view: 'container',
  system: { id: 'system:drawings', label: 'Drawing save and sync' },
  nodes: [
    {
      kind: 'container', id: 'container:desktop', label: 'Desktop app',
      containerKind: 'application', technology: 'React', process: 'draw-host',
      description: 'Owns the open drawing and saves locally.', state: 'accepted',
      parentId: 'system:drawings',
    },
    {
      kind: 'component', id: 'component:save', label: 'Drawing save',
      container: 'container:desktop', technology: 'TypeScript',
      members: ['tab'], description: 'Writes the current drawing to disk.', state: 'accepted',
    },
    {
      kind: 'container', id: 'container:server', label: 'Sync service',
      containerKind: 'application', technology: 'Bun', process: 'sync-service',
      description: 'Persists remote drawing projections.', state: 'accepted',
      parentId: 'system:drawings',
    },
    {
      kind: 'component', id: 'component:persist', label: 'Drawing persistence',
      container: 'container:server', technology: 'TypeScript',
      members: ['sync-service'], description: 'Persists an uploaded drawing.', state: 'accepted',
    },
    {
      kind: 'external-system', id: 'external:disk', label: 'File storage',
      technology: 'File I/O', members: ['disk'],
      description: 'Local and server-side drawing files.', state: 'accepted',
    },
  ],
  edges: [
    {
      id: 'base:save', source: 'component:save', target: 'external:disk',
      label: 'Saves locally', protocol: 'File I/O', mechanisms: ['writes'], count: 1,
      trailRefs: [{ trailId: 'sg-desktop:tl-save', stepIndices: [0] }],
    },
    {
      id: 'base:persist', source: 'component:persist', target: 'external:disk',
      label: 'Persists projection', protocol: 'File I/O', mechanisms: ['writes'], count: 1,
      trailRefs: [{ trailId: 'sg-server:tl-persist', stepIndices: [0] }],
    },
  ],
};

const c4ElementLabels = new Map(baseC4.nodes.map((element) => [element.id, element.label]));

function Demo() {
  const [active, setActive] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedDraftItem, setSelectedDraftItem] = useState<DecorationPanelSelection | null>(null);
  const [focusedIds, setFocusedIds] = useState<ReadonlySet<string> | null>(null);
  const [containerFocus, setContainerFocus] = useState<C4GraphProps['containerFocus']>(null);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const projection = useMemo(() => applyDecorationC4(baseC4, decoration, active), [active]);
  const model = useMemo<C4Model>(() => {
    const opened = new Set(openIds);
    const visibleId = (id: string) => {
      const node = projection.nodes.find((element) => element.id === id);
      return node?.kind === 'component' && !opened.has(node.container) ? node.container : id;
    };
    return {
      ...projection,
      openContainerIds: openIds,
      // Fold component relationships onto their container while it is closed.
      edges: projection.edges
        .map((edge) => ({ ...edge, source: visibleId(edge.source), target: visibleId(edge.target) }))
        .filter((edge) => edge.source !== edge.target),
    };
  }, [projection, openIds]);

  const dimmedElementIds = focusedIds
    ? new Set(model.nodes.filter((node) => !focusedIds.has(node.id)).map((node) => node.id))
    : null;
  const dimmedEdgeIds = selectedEdgeId
    ? new Set(model.edges.filter((edge) => edge.id !== selectedEdgeId).map((edge) => edge.id))
    : selected
    ? new Set(model.edges
      .filter((edge) => !edge.trailRefs?.some((ref) => ref.trailId === selected))
      .map((edge) => edge.id))
    : null;

  function focusElements(ids: Iterable<string>, source = projection) {
    const focus = new Set(ids);
    const containers = new Set<string>();
    for (const id of focus) {
      const node = source.nodes.find((element) => element.id === id);
      if (node?.kind === 'component') {
        focus.add(node.container);
        containers.add(node.container);
      }
    }
    setFocusedIds(focus);
    setOpenIds((previous) => [...new Set([...previous, ...containers])]);
  }

  function selectTrail(ref: DecorationTrailRef) {
    setSelectedEdgeId(null);
    setSelectedElementId(null);
    setContainerFocus(null);
    setSelectedDraftItem(null);
    if (!active && ref.kind === 'draft') setActive(true);
    // Use the active projection when selecting a draft while the overlay is off.
    const all = applyDecorationC4(baseC4, decoration);
    const key = decorationTrailKey(ref);
    const edges = all.edges.filter((edge) => edge.trailRefs?.some((trail) => trail.trailId === key));
    setSelected(key);
    focusElements(edges.flatMap((edge) => [edge.source, edge.target]), all);
  }

  function selectC4Element(element: DecorationDraftC4Element) {
    setSelectedEdgeId(null);
    setSelectedElementId(element.id);
    setSelectedDraftItem({ kind: 'c4', id: element.id });
    setActive(true);
    setSelected(null);
    const containerId = element.kind === 'component' ? element.container : element.id;
    focusContainer(containerId, applyDecorationC4(baseC4, decoration));
  }

  function focusContainer(id: string, source = projection) {
    const container = source.nodes.find((node) => node.id === id && node.kind === 'container');
    if (!container) {
      setContainerFocus(null);
      focusElements([id], source);
      return;
    }
    setContainerFocus({ id });
    setFocusedIds(new Set([
      id,
      ...source.nodes
        .filter((node) => node.kind === 'component' && node.container === id)
        .map((node) => node.id),
    ]));
    setOpenIds((previous) => [...new Set([...previous, id])]);
  }

  function toggleActive(next: boolean) {
    setSelectedEdgeId(null);
    setActive(next);
    setSelected(null);
    setFocusedIds(null);
    setSelectedDraftItem(null);
    setContainerFocus(null);
    setSelectedElementId(null);
  }

  function clearFocus() {
    setSelectedEdgeId(null);
    setSelected(null);
    setFocusedIds(null);
    setSelectedDraftItem(null);
    setContainerFocus(null);
    setSelectedElementId(null);
  }

  function selectC4Edge(edge: C4Edge) {
    const all = applyDecorationC4(baseC4, decoration);
    const original = all.edges.find((candidate) => candidate.id === edge.id) ?? edge;
    const isDraft = decoration.draft?.c4?.edges?.some((candidate) => candidate.id === edge.id);
    if (isDraft) setActive(true);
    setSelectedEdgeId(edge.id);
    setSelectedElementId(null);
    setSelected(null);
    setContainerFocus({ ids: [original.source, original.target] });
    setSelectedDraftItem(isDraft ? { kind: 'c4-edge', id: edge.id } : null);
    focusElements([original.source, original.target], all);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f1115' }}>
      <DecorationHeader
        decoration={decoration}
        active={active}
        onToggleActive={toggleActive}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16, color: '#9aa4b2', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>
            <span>{active ? 'Base + decoration' : 'Base architecture only'}</span>
            <span>Solid boxes: base · dashed boxes: draft</span>
            {focusedIds && (
              <button type="button" onClick={clearFocus}>
                Clear focus
              </button>
            )}
          </div>
        }
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ width: 360, flexShrink: 0, height: '100%', borderRight: '1px solid #2a2f3a' }}>
          <DecorationPanel
            decoration={decoration}
            active={active}
            onToggleActive={toggleActive}
            hideHeader
            resolveTrail={resolveTrail}
            modelLabels={modelLabels}
            c4ElementLabels={c4ElementLabels}
            onSelectTrail={selectTrail}
            onSelectDraftC4Element={selectC4Element}
            onSelectDraftC4Edge={selectC4Edge}
            selectedDraftItem={selectedDraftItem}
            onSelectDraftComponent={(component) => {
              const owner = decoration.draft?.c4?.elements?.find(
                (element) => element.kind === 'component' && element.members?.includes(component.alias),
              );
              if (owner) selectC4Element(owner);
              setSelectedDraftItem({ kind: 'component', alias: component.alias });
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <C4Graph
            model={model}
            containerFocus={containerFocus}
            selectedNodeId={selectedElementId}
            selectedEdgeId={selectedEdgeId}
            dimmedElementIds={dimmedElementIds}
            dimmedEdgeIds={dimmedEdgeIds}
            onToggleContainer={(id) => setOpenIds((previous) =>
              previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id])}
            onSelectNode={(id) => {
              setSelectedEdgeId(null);
              setSelectedElementId(id);
              setSelected(null);
              setSelectedDraftItem(
                id && decoration.draft?.c4?.elements?.some((element) => element.id === id)
                  ? { kind: 'c4', id }
                  : null,
              );
              const element = projection.nodes.find((node) => node.id === id);
              if (element) {
                focusContainer(element.kind === 'component' ? element.container : element.id);
              } else {
                setFocusedIds(null);
                setContainerFocus(null);
              }
            }}
            onSelectEdge={(edge) => {
              if (!edge) {
                setSelectedEdgeId(null);
                setSelectedDraftItem((current) => current?.kind === 'c4-edge' ? null : current);
                return;
              }
              selectC4Edge(edge);
            }}
            onTrailClick={(ref) => {
              const trail = decoration.trails.find((candidate) => decorationTrailKey(candidate) === ref.trailId);
              if (trail) selectTrail(trail);
            }}
            hideDrawer
          />
        </div>
      </div>
    </div>
  );
}

export const TwoModels: Story = {
  args: { decoration, active: true, onToggleActive: () => {} },
  render: () => <Demo />,
};
