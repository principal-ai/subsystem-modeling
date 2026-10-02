import '@xyflow/react/dist/style.css';
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import {
  SubsystemDiagnosticToggle,
  type SubsystemDiagnosticStatus,
} from '../../../subsystem/DiagnosticToggle';
import { components, graphSpecFromSteps } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/Diagnostics',
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

const graphComponents = components([
  ['entry', 'checkoutApi', 'function', 'src/checkout/api.ts', 'pkg:github/you/your-app', 'Handles cart requests.', 'checkoutApi'],
  ['store', 'cartStore', 'store', 'src/checkout/cartStore.ts', 'pkg:github/you/your-app', 'Retained cart state.', 'cartStore'],
  ['stripe', 'Stripe', 'external', '', 'external', undefined, undefined],
  ['caller', 'Web client', 'external', '', 'external', undefined, undefined],
]);

const graphEdges = graphSpecFromSteps([
  ['caller', 'entry', 'calls'],
  ['entry', 'store', 'writes'],
  ['entry', 'stripe', 'calls'],
]);

const GRAPH_DESCRIPTION =
  'A small e-commerce checkout subsystem: an HTTP entry point that writes to retained cart state and calls out to Stripe.';

/** Every chip state side by side, for quick visual review. */
export const States: Story = {
  render: () => {
    const rows: Array<{ label: string; status: SubsystemDiagnosticStatus; issueCount?: number; fixableCount?: number; stale?: boolean; busy?: boolean }> = [
      { label: 'ok', status: 'ok' },
      { label: 'ok (stale)', status: 'ok', stale: true },
      { label: 'issues · 3', status: 'issues', issueCount: 3 },
      { label: 'gaps · 2', status: 'gaps', issueCount: 2 },
      { label: 'unknown (never checked)', status: 'unknown' },
      { label: 'issues (busy)', status: 'issues', issueCount: 3, busy: true },
      { label: 'issues · 7, 7 fixable', status: 'issues', issueCount: 7, fixableCount: 7 },
      { label: 'issues · 4, 2 fixable', status: 'issues', issueCount: 4, fixableCount: 2 },
      { label: 'issues · 2, fixable + stale', status: 'issues', issueCount: 2, fixableCount: 2, stale: true },
      { label: 'issues · 120, fixable capped', status: 'issues', issueCount: 120, fixableCount: 120 },
      { label: 'issues (busy) hides badge', status: 'issues', issueCount: 3, fixableCount: 3, busy: true },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 32 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ width: 220, fontFamily: 'monospace', fontSize: 12, opacity: 0.7 }}>
              {row.label}
            </span>
            <SubsystemDiagnosticToggle
              status={row.status}
              issueCount={row.issueCount}
              fixableCount={row.fixableCount}
              stale={row.stale}
              busy={row.busy}
              onToggle={() => {}}
            />
          </div>
        ))}
      </div>
    );
  },
};

/**
 * The real case that motivated the badge: seven re-pin findings, every one a
 * one-click fix the construct-fixer defers to the human. The chip announces
 * them so the deferral isn't silent.
 */
export const GraphFixableBadge: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={graphComponents}
        trails={graphEdges.trails}
        title="Vestigial detail layer vs single-source declaration"
        description={GRAPH_DESCRIPTION}
        diagnostic={{ status: 'issues', issueCount: 7, fixableCount: 7, onToggle: () => {} }}
      />
    </div>
  ),
};

/** The chip in its real home: the sidebar title row, beside the description toggle. */
export const GraphClean: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={graphComponents}
        trails={graphEdges.trails}
        title="Checkout"
        description={GRAPH_DESCRIPTION}
        diagnostic={{ status: 'ok', onToggle: () => {} }}
      />
    </div>
  ),
};

export const GraphWithIssues: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={graphComponents}
        trails={graphEdges.trails}
        title="Checkout"
        description={GRAPH_DESCRIPTION}
        diagnostic={{ status: 'issues', issueCount: 3, onToggle: () => {} }}
      />
    </div>
  ),
};

/** Stale report: the color stays, a hollow ring marks that inputs changed. */
export const GraphStale: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={graphComponents}
        trails={graphEdges.trails}
        title="Checkout"
        description={GRAPH_DESCRIPTION}
        diagnostic={{ status: 'issues', issueCount: 3, stale: true, onToggle: () => {} }}
      />
    </div>
  ),
};

/** No title/description — the chip still anchors the title row at the right. */
export const GraphChipOnly: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={graphComponents}
        trails={graphEdges.trails}
        title="Checkout"
        diagnostic={{ status: 'gaps', issueCount: 2, onToggle: () => {} }}
      />
    </div>
  ),
};
