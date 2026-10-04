import React, { useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { C4Graph } from '../../../subsystem/C4Graph';
import type { C4Edge, C4Model, C4Element, C4Container } from '../../../subsystem/c4';

const meta = {
  title: 'Subsystem/C4Graph/C4Container',
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
// A C4 container diagram, hand-built.
//
// Nothing here is derived: the boxes are authored `C4Element`s, and
// the lines are explicit `C4Edge`s — no trails, no rollup. This is the shape a
// caller hands to `C4Graph` once a model has been authored.
//
// The system frame holds the containers and the external systems (C4 draws a
// dependency we do not own inside the boundary); the person sits outside it.
// ---------------------------------------------------------------------------

const SYSTEM = { id: 'system:acme', label: 'Subsystem Modeling', repoKey: 'pkg:github/acme/subsystem-modeling' };

function container(over: Partial<C4Container> & Pick<C4Container, 'id' | 'label'>): C4Element {
  return {
    kind: 'container',
    members: [],
    constructs: [],
    state: 'accepted',
    containerKind: 'application',
    technology: '',
    ...over,
  };
}

const NODES: C4Element[] = [
  container({
    id: 'container:studio-host',
    label: 'Subsystem Studio — host',
    containerKind: 'application',
    technology: 'Bun + Electrobun',
    description: 'Owns the model store on disk and serves the renderer over RPC.',
    parentId: SYSTEM.id,
  }),
  container({
    id: 'container:studio-renderer',
    label: 'Subsystem Studio — renderer',
    containerKind: 'application',
    technology: 'React 19',
    description: 'Renders subsystem models and talks to the host over RPC.',
    parentId: SYSTEM.id,
  }),
  container({
    id: 'container:cli',
    label: 'Subsystem Modeling CLI',
    containerKind: 'application',
    technology: 'Node',
    description: 'Creates and updates models from the terminal.',
    parentId: SYSTEM.id,
  }),
  container({
    id: 'container:model-store',
    label: 'Subsystem model store',
    containerKind: 'data-store',
    technology: 'JSON on disk',
    description: 'Every stored model and the correction queue.',
    parentId: SYSTEM.id,
  }),
  // An external system: someone else's system, drawn OUTSIDE the boundary.
  {
    kind: 'external-system',
    id: 'external:opencode',
    label: 'OpenCode v2 service',
    technology: 'HTTP',
    description: 'Runs the maintain agent sessions this model is edited by.',
    state: 'accepted',
    members: [],
    constructs: [],
  },
  // A person sits outside every system boundary.
  {
    kind: 'person',
    id: 'person:maintainer',
    label: 'Maintain operator',
    description: 'Reviews and accepts the correction proposals.',
    state: 'accepted',
    members: [],
    constructs: [],
  },
  // Components that live inside the host. Not drawn in the container view
  // (`groups` frames only the containers), but carried on the model so the
  // side panel can list them when the host is clicked.
  {
    kind: 'component',
    id: 'component:audit-verification',
    label: 'Audit & verification',
    container: 'container:studio-host',
    parentId: 'container:studio-host',
    technology: 'Bun',
    description: 'Checks a subsystem model and reports what is wrong.',
    state: 'accepted',
    members: ['auditSubsystemModel', 'verifySubsystemComponent', 'verifyModelFiles'],
  },
  {
    kind: 'component',
    id: 'component:maintain-proposals',
    label: 'Maintain & proposals',
    container: 'container:studio-host',
    parentId: 'container:studio-host',
    technology: 'Bun',
    description: 'Runs a maintain agent and records the corrections it proposes.',
    state: 'accepted',
    members: ['maintainSubsystemModel', 'runMaintainAgent', 'createSubsystemModelProposal'],
  },
  {
    kind: 'component',
    id: 'component:model-store',
    label: 'Model store I/O',
    container: 'container:studio-host',
    parentId: 'container:studio-host',
    technology: 'Bun fs',
    description: 'Reads and writes model JSON under ~/.principal.',
    state: 'accepted',
    members: ['getSubsystemModel', 'updateSubsystemModel', 'readFile'],
  },
];

const EDGES: C4Edge[] = [
  {
    id: 'flow:renderer-host',
    source: 'container:studio-renderer',
    target: 'container:studio-host',
    label: 'RPC',
    protocol: 'Electrobun RPC',
    mechanisms: ['calls'],
    count: 1,
  },
  {
    id: 'flow:host-store',
    source: 'container:studio-host',
    target: 'container:model-store',
    label: 'fs · JSON',
    protocol: 'file I/O',
    mechanisms: ['reads', 'writes'],
    count: 2,
  },
  {
    id: 'flow:host-opencode',
    source: 'container:studio-host',
    target: 'external:opencode',
    label: 'HTTPS',
    protocol: 'HTTP',
    mechanisms: ['calls'],
    count: 1,
  },
  {
    id: 'flow:cli-store',
    source: 'container:cli',
    target: 'container:model-store',
    label: 'fs · JSON',
    protocol: 'file I/O',
    mechanisms: ['writes'],
    count: 1,
  },
  {
    id: 'flow:maintainer-renderer',
    source: 'person:maintainer',
    target: 'container:studio-renderer',
    label: 'UI',
    mechanisms: ['uses'],
    count: 1,
  },
];

/**
 * The container-view projection of the authored elements. From here on it is a
 * plain render input: `C4Graph` sizes and lays these out, it does not build any
 * of them.
 */
const containerModel: C4Model = {
  view: 'container',
  system: SYSTEM,
  nodes: NODES,
  edges: EDGES,
};

function Demo() {
  const [selected, setSelected] = useState<string | null>(null);
  const model = useMemo(() => containerModel, []);

  const containers = model.nodes.filter((n) => n.kind === 'container').length;
  const outside = model.nodes.filter(
    (n) => n.kind === 'external-system' || n.kind === 'person',
  ).length;

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <C4Graph model={model} title="Subsystem Modeling" onSelectNode={setSelected} />
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
        <span>
          {containers} containers · {outside} outside
        </span>
        <span>{model.edges.length} lines</span>
        <span>selected: {selected ?? '(none)'}</span>
        <span style={{ color: '#777' }}>boxes and lines are authored, not derived</span>
      </div>
    </div>
  );
}

export const Containers: Story = {
  render: () => <Demo />,
};
