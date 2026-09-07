import '@xyflow/react/dist/style.css';
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { components, edges } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/GraphTitle',
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

const graphOnlyComponents = components([
  ['entry', 'checkoutApi', 'function', 'src/checkout/api.ts', 'pkg:github/you/your-app', 'Handles cart requests.', 'checkoutApi'],
  ['store', 'cartStore', 'store', 'src/checkout/cartStore.ts', 'pkg:github/you/your-app', 'Retained cart state.', 'cartStore'],
  ['stripe', 'Stripe', 'external', '', 'external', undefined, undefined],
  ['caller', 'Web client', 'external', '', 'external', undefined, undefined],
]);

const graphOnlyEdges = edges([
  ['caller', 'entry', 'calls'],
  ['entry', 'store', 'writes'],
  ['entry', 'stripe', 'calls'],
]);

function GraphOnly() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={graphOnlyComponents}
        edges={graphOnlyEdges}
        graphTitle="Checkout"
        hideSidebar
      />
    </div>
  );
}

/** The hero configuration: no sidebar, subsystem name as a canvas chip. */
export const GraphOnlyWithTitle: Story = {
  render: () => <GraphOnly />,
};

/** graphTitle also works alongside the full sidebar (chip + sidebar title). */
export const WithSidebar: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={graphOnlyComponents}
        edges={graphOnlyEdges}
        title="Checkout"
        description="A small e-commerce checkout subsystem: an HTTP entry point that writes to retained cart state and calls out to Stripe."
        graphTitle="Checkout"
      />
    </div>
  ),
};
