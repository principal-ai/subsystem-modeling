import '@xyflow/react/dist/style.css';
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { components, graphSpecFromSteps } from './fixtures';

const meta = {
  title: 'Canvases/Subsystem/Views/Diagnostics',
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
