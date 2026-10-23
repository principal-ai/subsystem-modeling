import { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemTrail } from '../../../subsystem/model';
import type { SubsystemIssue } from '../../../subsystem/IssueList';

const components: SubsystemComponent[] = [
  { alias: 'checkout', name: 'Checkout', construct: 'function', file: 'src/checkout.ts', purl: 'pkg:github/acme/app' },
  { alias: 'store', name: 'Store', construct: 'function', file: 'src/store.ts', purl: 'pkg:github/acme/app' },
  { alias: 'report', name: 'Report', construct: 'function', file: 'src/report.ts', purl: 'pkg:github/acme/app' },
  { alias: 'mail', name: 'Mail', construct: 'function', file: 'src/mail.ts', purl: 'pkg:github/acme/app' },
];
const trails: SubsystemTrail[] = [
  { id: 'checkout', title: 'Validate the checkout and persist the customer’s order with all selected items', steps: [
    { from: 'checkout', to: 'store', mechanism: 'calls', file: 'src/checkout.ts',
      purl: 'pkg:github/acme/app', symbol: 'saveCheckout', annotation: 'Persist the checkout.' },
  ] },
  { id: 'report', title: 'Generate the monthly account activity report and deliver it to every subscribed recipient', steps: [
    { from: 'report', to: 'mail', mechanism: 'calls', file: 'src/report.ts',
      purl: 'pkg:github/acme/app', symbol: 'sendReport' },
  ] },
];
const issues: SubsystemIssue[] = [
  { id: 'checkout-symbol', severity: 'error', kind: 'symbol_unmatched',
    message: 'Checkout declaration needs verification.',
    target: { kind: 'component', id: 'checkout', label: 'Checkout' } },
  { id: 'checkout-step', severity: 'error', kind: 'step_span_unconfirmed',
    message: 'Capture the checkout seam.',
    target: { kind: 'step', id: 'checkout', stepIndex: 0, label: 'Checkout → Store' } },
  { id: 'report-symbol', severity: 'error', kind: 'symbol_unmatched',
    message: 'Report declaration needs verification.',
    target: { kind: 'component', id: 'report', label: 'Report' } },
];

function Demo() {
  const [showIssues, setShowIssues] = useState(false);
  return (
    <div style={{ height: '100vh' }}>
      <SubsystemComponentGraph
        title="Trail-scoped sidebar"
        description="Select a trail, then switch between Trails, Files, and Issues. Its header stays visible and each panel shows only that trail’s information. Back clears the trail context."
        components={components}
        trails={trails}
        issues={issues}
        showIssues={showIssues}
        diagnostic={{ status: 'issues', issueCount: issues.length,
          onToggle: () => setShowIssues((value) => !value) }}
        renderFileViewer={(file) => (
          <pre style={{ padding: 16 }}>Source preview: {file}</pre>
        )}
      />
    </div>
  );
}

const meta = {
  title: 'Canvases/Subsystem/TrailSidebarViews',
  component: SubsystemComponentGraph,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => (
    <ThemeProvider theme={defaultEditorTheme}><Story /></ThemeProvider>
  )],
} satisfies Meta<typeof SubsystemComponentGraph>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ScopedPanels: Story = { render: () => <Demo /> };
