import '@xyflow/react/dist/style.css';
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { SubsystemIssueList, type SubsystemIssue } from '../../../subsystem/IssueList';
import { components, graphSpecFromEdges } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/Issues',
  component: SubsystemComponentGraph,
  parameters: {
    layout: 'fullscreen',
  },
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

const ISSUES: SubsystemIssue[] = [
  {
    id: 'i1',
    severity: 'error',
    kind: 'missing_file',
    message: 'File src/checkout/cartStore.ts is not present on disk (repo pkg:github/you/your-app).',
    target: { kind: 'component', id: 'store', label: 'cartStore' },
    fix: { label: 'Use graphify file' },
  },
  {
    id: 'i2',
    severity: 'error',
    kind: 'construct_mismatch',
    message: 'Claimed function but graphify infers class.',
    target: { kind: 'component', id: 'entry', label: 'checkoutApi' },
  },
  {
    id: 'i3',
    severity: 'info',
    kind: 'signature_unconfirmed',
    message: 'Named parameter types are not present in the graphify cache.',
    target: { kind: 'component', id: 'entry', label: 'checkoutApi' },
  },
  {
    id: 'i4',
    severity: 'error',
    kind: 'topology_broken_endpoint',
    message: 'Relationship endpoint "store" does not resolve to a component.',
    target: { kind: 'relation', id: 'r1', label: 'checkoutApi → cartStore', detail: 'writes' },
  },
  {
    id: 'i5',
    severity: 'info',
    kind: 'boundary_module_file_mismatch',
    message: 'Module "src/checkout" contains a file outside its declared root.',
    target: { kind: 'module', id: 'src/checkout', label: 'src/checkout' },
  },
  {
    id: 'i6',
    severity: 'info',
    kind: 'walkthrough',
    message: 'Step 2 references a line that moved (was :42).',
    target: {
      kind: 'step',
      id: 'flow-1',
      label: 'Checkout',
      detail: 'step 2',
      stepIndex: 1,
    },
  },
  {
    id: 'i7',
    severity: 'info',
    kind: 'boundary_process_nest_disagree',
    message:
      'module "src/host/main.ts" members claim different processes: "host", "renderer"',
    target: { kind: 'module', id: 'src/host/main.ts', label: 'src/host/main.ts' },
  },
  {
    id: 'i17',
    severity: 'error',
    kind: 'symbol_ambiguous',
    message: 'Multiple Graphify nodes match readSession (3 candidates)',
    target: { kind: 'component', id: 'session-reader', label: 'SessionReader' },
  },
  {
    id: 'i18',
    severity: 'info',
    kind: 'symbol_unmatched',
    message: 'No Graphify node matches symbol persistSession in src/session/SessionStore.ts',
    target: { kind: 'component', id: 'session-store', label: 'SessionStore' },
  },
  {
    id: 'i9',
    severity: 'error',
    kind: 'stale_declaration',
    message: 'Declaration moved since capture — recorded start line 42, now 57.',
    target: { kind: 'component', id: 'session-store', label: 'SessionStore' },
    fix: { label: 'Re-pin declaration' },
  },
  {
    id: 'i10',
    severity: 'info',
    kind: 'construct_unconfirmed',
    message: 'Graphify anchored the node but left the construct unclassified (interface vs type alias).',
    target: { kind: 'component', id: 'host-info', label: 'HostInfo' },
  },
  {
    id: 'i11',
    severity: 'error',
    kind: 'signature_mismatch',
    message: 'Claimed (req: HostInfo) => Session; Graphify has (string) => void.',
    target: { kind: 'component', id: 'entry', label: 'checkoutApi' },
  },
  {
    id: 'i13',
    severity: 'info',
    kind: 'repo_unresolved',
    message: 'Repo pkg:github/acme/worker is not available locally — clone it to verify its components',
    target: { kind: 'repo', id: 'pkg:github/acme/worker', label: 'pkg:github/acme/worker' },
  },
  {
    id: 'i19',
    severity: 'info',
    kind: 'graphify_unavailable',
    message: 'Graphify cache missing for pkg:github/you/your-app — build it to verify constructs and anchors',
    target: { kind: 'repo', id: 'pkg:github/you/your-app', label: 'pkg:github/you/your-app' },
  },
  {
    id: 'i14',
    severity: 'info',
    kind: 'topology_import_unconfirmed',
    message: 'No import edge from checkoutApi to cartStore found in Graphify.',
    target: { kind: 'relation', id: 'r1', label: 'checkoutApi → cartStore', detail: 'references' },
  },
  {
    id: 'i15',
    severity: 'info',
    kind: 'topology_relation_unconfirmed',
    message: 'Graphify found no inheritance evidence for FileSessionStore → SessionStore.',
    target: { kind: 'relation', id: 'r2', label: 'FileSessionStore → SessionStore', detail: 'extends' },
  },
];

const graphComponents = components([
  ['entry', 'checkoutApi', 'function', 'src/checkout/api.ts', 'pkg:github/you/your-app', 'Handles cart requests.', 'checkoutApi'],
  ['store', 'cartStore', 'store', 'src/checkout/cartStore.ts', 'pkg:github/you/your-app', 'Retained cart state.', 'cartStore'],
  ['stripe', 'Stripe', 'external', '', 'external', undefined, undefined],
]);

const graphEdges = graphSpecFromEdges([
  ['entry', 'store', 'writes'],
  ['entry', 'stripe', 'calls'],
]);

/** The catalogue, grouped by verification layer. */
export const List: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', width: 380, height: '100vh', borderRight: '1px solid #333' }}>
      <SubsystemIssueList
        issues={ISSUES}
        onSelectIssue={() => {}}
        onApplyFix={() => {}}
      />
    </div>
  ),
};

/** All four layers clean — the happy state. */
export const AllGood: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', width: 380, height: '100vh', borderRight: '1px solid #333' }}>
      <SubsystemIssueList issues={[]} />
    </div>
  ),
};

/** In place: diagnostics active, so the sidebar bottom panel is the issue list. */
export const GraphWithIssues: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={graphComponents}
        relations={graphEdges.relations}
        walkthroughs={graphEdges.walkthroughs}
        title="Checkout"
        description="A small e-commerce checkout subsystem."
        diagnostic={{
          status: 'issues',
          issueCount: ISSUES.filter((i) => i.severity === 'error').length,
          onToggle: () => {},
        }}
        issues={ISSUES}
        onSelectIssue={() => {}}
        onApplyIssueFix={() => {}}
      />
    </div>
  ),
};
