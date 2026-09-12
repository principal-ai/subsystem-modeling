import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { SubsystemComponentNode } from '../../../subsystem/nodes';
import type {
  SubsystemComponent,
  SubsystemComponentEdge,
  SubsystemGraphNode,
} from '../../../subsystem/model';

const meta = {
  title: 'Subsystem/ComponentGraph/Proposed',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <ReactFlowProvider>
          <Story />
        </ReactFlowProvider>
      </ThemeProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PURL = 'pkg:github/principal-ai/subsystem-modeling';

function nodeProps(c: SubsystemComponent): NodeProps<SubsystemGraphNode> {
  return {
    data: { component: c },
    selected: false,
    width: 230,
    height: 84,
  } as unknown as NodeProps<SubsystemGraphNode>;
}

/** Side-by-side single-node spotlights — proposed vs normal vs role combos. */
function NodeSpotlight({
  label,
  component,
}: {
  label: string;
  component: SubsystemComponent;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 260 }}>
      <div
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          color: '#888',
          minHeight: 32,
        }}
      >
        {label}
      </div>
      <div style={{ position: 'relative', height: 110, width: 240 }}>
        <SubsystemComponentNode {...nodeProps(component)} />
      </div>
      <pre
        style={{
          margin: 0,
          fontSize: 10,
          fontFamily: 'ui-monospace, monospace',
          background: '#1a1a1a',
          color: '#ccc',
          padding: 8,
          borderRadius: 4,
          overflow: 'auto',
        }}
      >
        {JSON.stringify(
          {
            construct: component.construct,
            proposed: component.proposed || undefined,
            role: component.role,
            symbol: component.symbol || undefined,
            file: component.file || undefined,
          },
          null,
          2,
        )}
      </pre>
    </div>
  );
}

const spotlightRows: Array<{ label: string; component: SubsystemComponent }> = [
  {
    label: 'normal function (baseline)',
    component: {
      id: 'live-fn',
      name: 'ensureOpencode',
      construct: 'function',
      file: 'src/bun/opencode-v2.ts',
      purl: PURL,
      symbol: 'ensureOpencode',
      purpose: 'Detect / install / update the OpenCode CLI',
    },
  },
  {
    label: 'proposed function — dashed border + right badge',
    component: {
      id: 'prop-fn',
      name: 'OpenCodeV2Lifecycle',
      construct: 'function',
      file: '',
      purl: PURL,
      symbol: 'OpenCodeV2Lifecycle',
      purpose: 'Studio-managed OpenCode V2 detect / install / update',
      proposed: true,
    },
  },
  {
    label: 'proposed class',
    component: {
      id: 'prop-class',
      name: 'MaintainModelAgent',
      construct: 'class',
      file: 'src/bun/maintain-model-agent.ts',
      purl: PURL,
      symbol: 'MaintainModelAgent',
      purpose: 'Planned host agent that drives model maintenance',
      proposed: true,
    },
  },
  {
    label: 'proposed + role: entry (badge shows proposed only)',
    component: {
      id: 'prop-entry',
      name: 'startMaintainFlow',
      construct: 'function',
      file: '',
      purl: PURL,
      symbol: 'startMaintainFlow',
      purpose: 'Planned RPC entry for maintain',
      proposed: true,
      role: 'entry',
    },
  },
  {
    label: 'external (contrast — real outside system)',
    component: {
      id: 'ext',
      name: 'OpenCode CLI',
      construct: 'external',
      file: '',
      purl: 'pkg:npm/@opencode-ai/cli',
      symbol: '',
      purpose: 'External OpenCode product',
      role: 'service',
    },
  },
];

/** Spotlights: proposed badge + dashed border vs normal and external. */
export const Spotlights: Story = {
  render: () => (
    <div
      style={{
        padding: 24,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 28,
        alignItems: 'flex-start',
        minHeight: '100vh',
        boxSizing: 'border-box',
      }}
    >
      {spotlightRows.map((row) => (
        <NodeSpotlight key={row.component.id} {...row} />
      ))}
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Full graph: live seam calling a proposed host lifecycle + real external
// ---------------------------------------------------------------------------
const migrationComponents: SubsystemComponent[] = [
  {
    id: 'audit',
    name: 'auditSubsystemModel',
    construct: 'function',
    file: 'src/bun/verify-subsystem-component.ts',
    purl: PURL,
    symbol: 'auditSubsystemModel',
    purpose: 'Deterministic dry-run audit of a stored model',
    role: 'entry',
  },
  {
    id: 'lifecycle',
    name: 'OpenCodeV2Lifecycle',
    construct: 'function',
    file: '',
    purl: PURL,
    symbol: 'OpenCodeV2Lifecycle',
    purpose: 'Proposed Studio host: detect / install / update / Service.ensure',
    proposed: true,
  },
  {
    id: 'maintain',
    name: 'runMaintainModel',
    construct: 'function',
    file: 'src/bun/maintain-model.ts',
    purl: PURL,
    symbol: 'runMaintainModel',
    purpose: 'Existing maintain agent runner',
  },
  {
    id: 'cli',
    name: '@opencode-ai/cli',
    construct: 'external',
    file: '',
    purl: 'pkg:npm/@opencode-ai/cli@beta',
    symbol: '',
    purpose: 'Real external OpenCode CLI',
    role: 'service',
  },
];

const migrationEdges: SubsystemComponentEdge[] = [
  { id: 'e0', from: 'audit', to: 'maintain', mechanism: 'calls' },
  { id: 'e1', from: 'maintain', to: 'lifecycle', mechanism: 'uses' },
  { id: 'e2', from: 'lifecycle', to: 'cli', mechanism: 'calls' },
];

function MigrationDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={migrationComponents}
        relations={migrationEdges.relations} walkthroughs={migrationEdges.walkthroughs}
        onSelect={(id) => setSelected(id)}
      />
      <div style={{ marginTop: 8, padding: '0 12px', fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        proposed OpenCodeV2Lifecycle between live maintain code and real external CLI
        {selected ? ` · selected: ${selected}` : ''}
      </div>
    </div>
  );
}

/** Full graph: proposed node between live code and a true external. */
export const MigrationPlaceholder: Story = {
  render: () => <MigrationDemo />,
};
