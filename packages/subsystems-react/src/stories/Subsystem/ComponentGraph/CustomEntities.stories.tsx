import React from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemComponentEdge } from '../../../subsystem/model';
import type { GraphifyCustomEntityDetail } from '../../../graphify';
import { graphSpecFromEdges } from './fixtures';

/** Authored attributes surfaced in the declaration panel. */
function entityDetail(attributes: Array<[string, string]>): GraphifyCustomEntityDetail {
  return {
    kind: 'custom_entity',
    attributes: attributes.map(([key, value]) => ({ key, value })),
  };
}

// ---------------------------------------------------------------------------
// Custom-entity prototype — the NovaTech work-request chain as it would read
// once the `custom_entity` construct ships. Persons, an agent, and a queue are
// authored as `construct: 'custom_entity'` with an open-string `entityKind`
// (Person / agent / queue); every entity still groups by `process` and flows
// through the same edge vocabulary as code nodes.
// ---------------------------------------------------------------------------

const components: SubsystemComponent[] = [
  {
    id: 'wr',
    name: 'WorkRequester',
    construct: 'custom_entity',
    entityKind: 'Person',
    file: '',
    purl: 'external',
    purpose: 'submits a facilities work request',
    role: 'entry',
    declaration: entityDetail([
      ['vertical', 'buildings'],
      ['escalationPath', 'FacilitiesTechnician → ShiftSupervisor'],
    ]),
  },
  {
    id: 'tech',
    name: 'FacilitiesTechnician',
    construct: 'custom_entity',
    entityKind: 'Person',
    file: '',
    purl: 'pkg:github/novatech/facilities-ops',
    purpose: 'performs repairs, resolves L1 requests',
    process: 'novatech/core-ops',
    layer: 1,
    declaration: entityDetail([
      ['level', 'L1'],
      ['projects', 'HVAC, plumbing'],
    ]),
  },
  {
    id: 'sup',
    name: 'ShiftSupervisor',
    construct: 'custom_entity',
    entityKind: 'Person',
    file: '',
    purl: 'pkg:github/novatech/facilities-ops',
    purpose: 'assigns technicians, approves out-of-scope work',
    process: 'novatech/core-ops',
    layer: 2,
    declaration: entityDetail([
      ['level', 'L2'],
      ['approvalLimit', '$500'],
    ]),
  },
  {
    id: 'mgr',
    name: 'CampusOpsManager',
    construct: 'custom_entity',
    entityKind: 'Person',
    file: '',
    purl: 'pkg:github/novatech/facilities-ops',
    purpose: 'owns the queue, escalates campus-wide issues',
    process: 'novatech/core-ops',
    layer: 3,
    declaration: entityDetail([
      ['level', 'L3'],
      ['approvalLimit', '$5,000'],
    ]),
  },
  {
    id: 'vp',
    name: 'VPOperations',
    construct: 'custom_entity',
    entityKind: 'Person',
    file: '',
    purl: 'pkg:github/novatech/facilities-ops',
    purpose: 'funds large projects, signs off L4 requests',
    process: 'novatech/core-ops',
    layer: 4,
    declaration: entityDetail([
      ['level', 'L4'],
      ['approvalLimit', 'unlimited'],
    ]),
  },
  {
    id: 'agent',
    name: 'OpsInsightAgent',
    construct: 'custom_entity',
    entityKind: 'agent',
    color: '#9d6afb',
    file: '',
    purl: 'pkg:github/novatech/facilities-ops',
    purpose: 'proposes nudges from open-request patterns; never owns the queue',
    process: 'novatech/core-ops',
    layer: 2,
    declaration: entityDetail([
      ['slack', 'novatech/facilities-ops'],
      ['permission', 'propose-only'],
    ]),
  },
  {
    id: 'queue',
    name: 'NudgeQueue',
    construct: 'custom_entity',
    entityKind: 'queue',
    color: '#b48ead',
    file: '',
    purl: 'pkg:github/novatech/facilities-ops',
    purpose: 'holds proposed nudges until a supervisor confirms them',
    process: 'novatech/core-ops',
    layer: 3,
    declaration: entityDetail([
      ['durable', 'postgres + outbox'],
      ['owner', 'CampusOpsManager'],
    ]),
  },
  {
    id: 'store',
    name: 'WorkRequestStore',
    construct: 'store',
    file: 'src/ops/workRequests.ts',
    purl: 'pkg:github/novatech/facilities-ops',
    purpose: 'retained work-request state — submissions, assignments, approvals',
    symbol: 'workRequests',
    process: 'novatech/core-ops',
    layer: 1,
  },
];

const entityGraph = graphSpecFromEdges([
  ['wr', 'store', 'feeds'],
  ['store', 'tech', 'feeds'],
  ['tech', 'sup', 'watches'],
  ['sup', 'queue', 'watches'],
  ['agent', 'store', 'reads'],
  ['agent', 'queue', 'feeds'],
  ['queue', 'mgr', 'feeds'],
  ['mgr', 'vp', 'watches'],
]);

const meta = {
  title: 'Subsystem/ComponentGraph/CustomEntities',
  component: SubsystemComponentGraph,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof SubsystemComponentGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NovaTechWorkRequests: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Custom entities — NovaTech work-request chain"
        description="Persons, an agent, and a queue as `custom_entity` nodes (badge = entityKind). Actors keep the themed coral; the agent and queue wear authored `color` overrides. Click a node for its declaration — `entity 'Name' — kind` plus authored `attributes` (key: value)."
        components={components}
        relations={entityGraph.relations} walkthroughs={entityGraph.walkthroughs}
      />
    </div>
  ),
};