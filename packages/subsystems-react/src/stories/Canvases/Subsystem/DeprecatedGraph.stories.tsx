import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent } from '../../../subsystem/model';
import { trailFromSteps } from './fixtures';

const PURL = 'pkg:github/principal-ai/subsystem-modeling';

const meta = {
  title: 'Canvases/Subsystem/Views/Deprecated',
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

// ---------------------------------------------------------------------------
// Full graph: live audit calling a deleted topology audit, which called two
// more deleted helpers. Mirrors the real wedged model.
// ---------------------------------------------------------------------------
const deprecatedComponents: SubsystemComponent[] = [
  {
    alias: 'audit',
    name: 'auditSubsystemModel',
    construct: 'function',
    file: 'src/bun/verify-subsystem-component.ts',
    purl: PURL,
    symbol: 'auditSubsystemModel',
    purpose: 'Deterministic dry-run audit of a stored model',
    role: 'entry',
  },
  {
    alias: 'topology',
    name: 'auditTopologyRelations',
    construct: 'function',
    file: 'src/bun/topology-audit.ts',
    purl: PURL,
    symbol: 'auditTopologyRelations',
    purpose: 'Orchestrates relations[] endpoint checks',
    deprecated: true,
    removedIn: {
      commit: 'e168afc',
      reason: 'Remove topology relations; nest module boundaries by path',
    },
  },
  {
    alias: 'topo-relation',
    name: 'graphifyHasRelationBetween',
    construct: 'function',
    file: 'src/bun/topology-audit.ts',
    purl: PURL,
    symbol: 'graphifyHasRelationBetween',
    purpose: 'True when Graphify records a relation between two nodes',
    deprecated: true,
    removedIn: {
      commit: 'e168afc',
      reason: 'Remove topology relations; nest module boundaries by path',
    },
  },
  {
    alias: 'topo-hints',
    name: 'graphifyHasRelationTowardHints',
    construct: 'function',
    file: 'src/bun/topology-audit.ts',
    purl: PURL,
    symbol: 'graphifyHasRelationTowardHints',
    purpose: 'Relation hints directed at a component',
    deprecated: true,
    removedIn: { commit: 'e168afc' },
  },
  {
    alias: 'boundary',
    name: 'auditBoundaryFields',
    construct: 'function',
    file: 'src/bun/boundary-audit.ts',
    purl: PURL,
    symbol: 'auditBoundaryFields',
    purpose: 'Package/module containment + process checks',
  },
];

const deprecatedTrails = [
  trailFromSteps('audit-steps', 'Audit (dry-run, graphify-backed)', [
    ['audit', 'topology', 'calls', 'src/bun/verify-subsystem-component.ts', 1],
    ['audit', 'boundary', 'calls', 'src/bun/verify-subsystem-component.ts', 1],
    ['topology', 'topo-relation', 'calls', 'src/bun/topology-audit.ts', 1],
    ['topology', 'topo-hints', 'calls', 'src/bun/topology-audit.ts', 1],
  ]),
];

function DeprecatedDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={deprecatedComponents}
        trails={deprecatedTrails}
        onSelect={(id) => setSelected(id)}
      />
      <div style={{ marginTop: 8, padding: '0 12px', fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        Click a slate `deprecated` badge to open the removal provenance
        {selected ? ` · selected: ${selected}` : ''}
      </div>
    </div>
  );
}

/** Full graph: the deleted topology subtree still wired into a live audit. */
export const RemovedSubtree: Story = {
  render: () => <DeprecatedDemo />,
};
