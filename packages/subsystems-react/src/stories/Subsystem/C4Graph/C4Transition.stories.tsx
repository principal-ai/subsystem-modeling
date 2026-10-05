import React, { useCallback, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { C4Graph } from '../../../subsystem/C4Graph';
import type { C4Edge, C4Model, C4Element, C4Component, C4Container } from '../../../subsystem/c4';

const meta = {
  title: 'Subsystem/C4Graph/C4Transition',
  component: C4Graph,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof C4Graph>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Drill-down: two layouts, one transition.
//
// Closed, the container is a box. Its expand affordance (bottom-right) opens it,
// and the graph swaps to a *second, already-computed* layout in which the same
// element is an ELK parent — so ELK sizes it to hold its own components, and they
// arrive as nested cards. The same affordance closes it again.
//
// The open state is a *set*, not a single id: each opened container is its own ELK
// parent, and opening one never closes another. So in the second story you can have
// both containers open at once, and the state accumulates — [] → [host] →
// [cli, host] → [host] → []. Closing one leaves the other exactly as it was.
//
// Nothing is a frame here: the container stays a card and grows (its own
// width/height transition), and the system frame around it grows with it — also
// by size, since it is a real ELK parent and ELK owns both its origin and its fit.
// A card's own components stay hidden while *that card* is growing, and its
// description returns only after a shrink — hence the two settled states below.
// A container that was already open keeps its components on screen while a
// different one opens, even though the whole diagram re-flows around it.
//
// The story also carries component→component edges, which the nested layout
// routes inside the parent.
// ---------------------------------------------------------------------------

const SYSTEM = { id: 'system:acme', label: 'Subsystem Modeling', repoKey: 'pkg:github/acme/subsystem-modeling' };
const HOST = 'container:studio-host';

function container(over: Partial<C4Container> & Pick<C4Container, 'id' | 'label'>): C4Element {
  return {
    kind: 'container',
    containerKind: 'application',
    technology: '',
    state: 'accepted',
    members: [],
    constructs: [],
    parentId: SYSTEM.id,
    ...over,
  };
}

function component(
  over: Partial<C4Component> & Pick<C4Component, 'id' | 'label' | 'container'>,
): C4Element {
  return {
    kind: 'component',
    members: [],
    constructs: [],
    state: 'accepted',
    parentId: over.container,
    technology: 'Bun',
    ...over,
  };
}

const NODES: C4Element[] = [
  container({ id: HOST, label: 'Subsystem Studio — host', technology: 'Bun + Electrobun', description: 'The Electron main process.' }),
  component({ id: 'component:audit-verification', label: 'Audit & verification', container: HOST, description: 'Checks a model, reports problems.' }),
  component({ id: 'component:maintain-proposals', label: 'Maintain & proposals', container: HOST, description: 'Runs the maintain agent, records proposals.' }),
  component({ id: 'component:model-store', label: 'Model store I/O', container: HOST, technology: 'Bun fs', description: 'Reads and writes model JSON.' }),
];

function edge(id: string, source: string, target: string, protocol: string): C4Edge {
  return { id, source, target, label: protocol, protocol, mechanisms: [], count: 1 };
}

const EDGES: C4Edge[] = [
  edge('e:audit-store', 'component:audit-verification', 'component:model-store', 'fs · JSON'),
  edge('e:proposals-store', 'component:maintain-proposals', 'component:model-store', 'fs · JSON'),
];

function Demo({ nodes, edges }: { nodes: C4Element[]; edges: C4Edge[] }) {
  // The drill-down is a *set*, not a single id: opening one container never closes
  // another. Held sorted so the model the graph sees is the same set whichever
  // order the cards were clicked — the graph normalizes this too, but the story
  // should not be the thing testing it.
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const model = useMemo<C4Model>(
    () => ({ view: 'container', system: SYSTEM, nodes, edges, openContainerIds: openIds }),
    [openIds, nodes, edges],
  );

  // One verb for both directions, which is the only way a collapse can mean
  // "close *this* one" once several are open.
  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort()));
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <C4Graph model={model} onSelectNode={setSelected} onToggleContainer={toggle} />
      </div>
      <div
        style={{
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          fontFamily: 'monospace',
          fontSize: 12,
          color: '#aaa',
          borderTop: '1px solid #333',
        }}
      >
        <span>{openIds.length ? `opened: ${openIds.join(', ')}` : 'closed'}</span>
        <span>selected: {selected ?? '(none)'}</span>
        <button onClick={() => setOpenIds([])} disabled={!openIds.length}>
          close all
        </button>
        <span style={{ color: '#777' }}>
          the expand icon (bottom-right of a container) opens it, and closes just that one
        </span>
      </div>
    </div>
  );
}

export const DrillDown: Story = {
  render: () => <Demo nodes={NODES} edges={EDGES} />,
};

// ---------------------------------------------------------------------------
// Two containers in the boundary, and an external system outside it.
//
// The single-container story cannot show what a drill-down does to the *rest* of
// the diagram, because there is no rest. Here the system holds two containers
// and there is an external system wired to both, so the open state has to answer
// for three things at once:
//
//   - the sibling container has to stay a card and get pushed clear of the
//     growth, rather than being absorbed into it;
//   - the external system has to stay outside the boundary while the boundary
//     grows around a column that is not its own;
//   - both containers can be open at once, and each keeps its own components
//     while the other opens, closes, or grows.
//
// Open them both, then close one: the survivor must not blink. It is still
// gliding to a new slot — the diagram re-flows — but its components stay put
// relative to it, because only the container actually changing open state
// withholds its components during the morph.
//
// The external system is the thing to watch. Band separation was the suspected
// weak spot of an opened container becoming a compound parent under
// INCLUDE_CHILDREN — the concern was that an external would collapse *below* the
// frame union instead of holding its own column beside it. Measured through real
// ELK, it holds: with the external partitioned one band right of the boundary it
// stays right of the frame in both open states. What this topology did expose is
// a crash — an edge crossing the boundary into an opened container named a port
// the group never declared, and ELK rejected the graph.
// ---------------------------------------------------------------------------

const CLI = 'container:principal-cli';

const SIBLING_NODES: C4Element[] = [
  container({ id: HOST, label: 'Subsystem Studio — host', technology: 'Bun + Electrobun', description: 'The Electron main process.' }),
  component({ id: 'component:audit-verification', label: 'Audit & verification', container: HOST, description: 'Checks a model, reports problems.' }),
  component({ id: 'component:maintain-proposals', label: 'Maintain & proposals', container: HOST, description: 'Runs the maintain agent, records proposals.' }),
  component({ id: 'component:model-store', label: 'Model store I/O', container: HOST, technology: 'Bun fs', description: 'Reads and writes model JSON.' }),

  // The second container in the same boundary, and openable on its own terms.
  // A data-store, so opening it also exercises the second container kind.
  container({
    id: CLI,
    label: 'Principal CLI',
    containerKind: 'data-store',
    technology: 'Bun + SQLite',
    description: 'Creates and renders subsystem models.',
  }),
  component({ id: 'component:model-reader', label: 'Model reader', container: CLI, description: 'Parses a model document.' }),
  component({ id: 'component:diagram-writer', label: 'Diagram writer', container: CLI, description: 'Emits ELK-ready nodes and edges.' }),

  // No `parentId`: this one is outside the boundary, which is the point of it.
  {
    kind: 'external-system',
    id: 'external:github',
    label: 'GitHub',
    technology: 'REST',
    state: 'accepted',
    description: 'Repositories and pull requests.',
  },
];

const SIBLING_EDGES: C4Edge[] = [
  edge('e:github-host', 'external:github', HOST, 'HTTPS'),
  edge('e:cli-github', CLI, 'external:github', 'HTTPS'),
  edge('e:audit-store', 'component:audit-verification', 'component:model-store', 'fs · JSON'),
  edge('e:proposals-store', 'component:maintain-proposals', 'component:model-store', 'fs · JSON'),
  edge('e:reader-writer', 'component:model-reader', 'component:diagram-writer', 'in-process'),
];

export const SiblingAndExternal: Story = {
  render: () => <Demo nodes={SIBLING_NODES} edges={SIBLING_EDGES} />,
};
