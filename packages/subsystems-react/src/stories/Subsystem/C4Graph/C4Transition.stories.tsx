import React, { useMemo, useState } from 'react';
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
// Nothing is a frame here: the container stays a card and grows (its own
// width/height transition), and the system frame around it grows with it — also
// by size, since it is a real ELK parent and ELK owns both its origin and its fit.
// Components stay hidden until the grow settles, and the card's description
// returns only after the shrink — hence the two settled states below.
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

function Demo() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const model = useMemo<C4Model>(
    () => ({ view: 'container', system: SYSTEM, nodes: NODES, edges: EDGES, openContainerId: openId }),
    [openId],
  );

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <C4Graph
          model={model}
          onSelectNode={setSelected}
          onOpenContainer={setOpenId}
          onCloseContainer={() => setOpenId(null)}
        />
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
        <span>{openId ? `opened: ${openId}` : 'closed'}</span>
        <span>selected: {selected ?? '(none)'}</span>
        <span style={{ color: '#777' }}>
          the expand icon (bottom-right of the container) opens it, and closes it again
        </span>
      </div>
    </div>
  );
}

export const DrillDown: Story = {
  render: () => <Demo />,
};
