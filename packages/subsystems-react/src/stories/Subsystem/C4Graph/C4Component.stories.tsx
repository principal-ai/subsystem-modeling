import React, { useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { C4Graph } from '../../../subsystem/C4Graph';
import type { C4Edge, C4Group, C4Model, C4Element, C4Component } from '../../../subsystem/c4';

const meta = {
  title: 'Subsystem/C4Graph/C4Component',
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
// A C4 *component* diagram, hand-built.
//
// No single subsystem model owns these groupings — each one is stitched from
// constructs that recur across many models (e.g. `auditSubsystemModel` appears
// in 8). That is exactly why a component is an authored grouping: the evidence
// lives across models, and a principal agent proposes the union while a person
// confirms it.
//
// Two containers are drawn as frames; their components sit inside.
// ---------------------------------------------------------------------------

const SYSTEM = { id: 'system:acme', label: 'Subsystem Modeling', repoKey: 'pkg:github/acme/subsystem-modeling' };
const HOST = 'container:studio-host';
const RENDERER = 'container:studio-renderer';

/** A component at level 3, inside a container. */
function component(
  over: Partial<C4Component> & Pick<C4Component, 'id' | 'label' | 'container'>,
): C4Element {
  return {
    kind: 'component',
    members: [],
    constructs: [],
    state: 'accepted',
    parentId: over.container,
    technology: 'Bun + Electrobun',
    ...over,
  };
}

const NODES: C4Element[] = [
  // --- inside the host ------------------------------------------------------
  component({
    id: 'component:audit-verification',
    label: 'Audit & verification',
    container: HOST,
    technology: 'Bun',
    description: 'Checks a subsystem model and reports what is wrong.',
    // The recurring constructs, stitched across ~8 models. See the story notes.
    members: [
      'auditSubsystemModel', 'verifySubsystemComponent', 'verifyModelFiles',
      'createRegularAuditScheduler', 'applySubsystemModelAuditFix',
      'auditTopologyRelations', 'auditBoundaryFields',
    ],
  }),
  component({
    id: 'component:maintain-proposals',
    label: 'Maintain & proposals',
    container: HOST,
    technology: 'Bun',
    description: 'Runs a maintain agent and records the corrections it proposes.',
    members: [
      'maintainSubsystemModel', 'runMaintainAgent', 'buildMaintainBrief',
      'createSubsystemModelProposal', 'acceptSubsystemModelProposal',
      'autoAcceptProposalIfConfident',
    ],
  }),
  component({
    id: 'component:model-store',
    label: 'Model store I/O',
    container: HOST,
    technology: 'Bun fs',
    description: 'Reads and writes model JSON under ~/.principal.',
    members: [
      'getSubsystemModel', 'listSubsystemModels', 'updateSubsystemModel',
      'createSubsystemModel', 'readFile', 'writeFile', 'touchSubsystemModelOpened',
    ],
  }),
  component({
    id: 'component:session-pipeline',
    label: 'Session pipeline',
    container: HOST,
    technology: 'Bun',
    description: 'Turns raw OpenCode session rows into universal events.',
    members: ['processSessionEvents', 'opencodeRowsToUniversalEvents', 'buildSessionIndex'],
  }),

  // --- inside the renderer --------------------------------------------------
  component({
    id: 'component:graph-view',
    label: 'Graph view',
    container: RENDERER,
    technology: 'React + ELK',
    description: 'Renders the component graph and its layout.',
  }),
  component({
    id: 'component:model-views',
    label: 'Model views',
    container: RENDERER,
    technology: 'React',
    description: 'Lists and opens stored subsystem models.',
  }),
  component({
    id: 'component:agent-sessions',
    label: 'Agent sessions view',
    container: RENDERER,
    technology: 'React',
    description: 'Shows maintain-agent sessions and their timelines.',
  }),
  component({
    id: 'component:rpc-bridge',
    label: 'RPC bridge',
    container: RENDERER,
    technology: 'Electrobun RPC',
    description: 'Talks to the host process over the Electrobun bridge.',
  }),
];

/** The two containers at this level, drawn as frames. */
const GROUPS: C4Group[] = [
  { id: HOST, kind: 'container', label: 'Subsystem Studio — host', parentId: SYSTEM.id, memberIds: NODES.filter((n) => n.parentId === HOST).map((n) => n.id) },
  { id: RENDERER, kind: 'container', label: 'Subsystem Studio — renderer', parentId: SYSTEM.id, memberIds: NODES.filter((n) => n.parentId === RENDERER).map((n) => n.id) },
  { id: SYSTEM.id, kind: 'system', label: SYSTEM.label, memberIds: [HOST, RENDERER] },
];

/** A line between components — protocol-labelled, like the container view. */
function edge(id: string, source: string, target: string, protocol: string): C4Edge {
  return { id, source, target, label: protocol, protocol, mechanisms: [], count: 1 };
}

const EDGES: C4Edge[] = [
  edge('e:views-store', 'component:model-views', 'component:model-store', 'RPC'),
  edge('e:views-audit', 'component:model-views', 'component:audit-verification', 'RPC'),
  edge('e:audit-store', 'component:audit-verification', 'component:model-store', 'fs · JSON'),
  edge('e:proposals-store', 'component:maintain-proposals', 'component:model-store', 'fs · JSON'),
  edge('e:proposals-sessions', 'component:maintain-proposals', 'component:session-pipeline', 'feeds'),
  edge('e:sessions-agent', 'component:agent-sessions', 'component:session-pipeline', 'RPC'),
  edge('e:renderer-host', 'component:rpc-bridge', 'component:model-store', 'RPC'),
  edge('e:views-graph', 'component:model-views', 'component:graph-view', 'calls'),
];

const componentModel: C4Model = {
  view: 'component',
  system: SYSTEM,
  nodes: NODES,
  groups: GROUPS,
  edges: EDGES,
};

function Demo() {
  const [selected, setSelected] = useState<string | null>(null);
  const model = useMemo(() => componentModel, []);
  const components = model.nodes.filter((n) => n.kind === 'component').length;

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
        <span>{components} components in {model.groups.filter((g) => g.kind === 'container').length} containers</span>
        <span>{model.edges.length} lines</span>
        <span>selected: {selected ?? '(none)'}</span>
        <span style={{ color: '#777' }}>each component is a grouping stitched across many models</span>
      </div>
    </div>
  );
}

export const Components: Story = {
  render: () => <Demo />,
};
