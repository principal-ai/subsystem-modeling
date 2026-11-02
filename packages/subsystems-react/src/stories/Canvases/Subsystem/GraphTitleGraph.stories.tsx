import '@xyflow/react/dist/style.css';
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { components, graphSpecFromSteps } from './fixtures';

const meta = {
  title: 'Canvases/Subsystem/Graphs/GraphTitle',
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

const componentsSpec = components([
  ['entry', 'checkoutApi', 'function', 'src/checkout/api.ts', 'pkg:github/you/your-app', 'Handles cart requests.', 'checkoutApi'],
  ['store', 'cartStore', 'store', 'src/checkout/cartStore.ts', 'pkg:github/you/your-app', 'Retained cart state.', 'cartStore'],
  ['stripe', 'Stripe', 'external', '', 'external', undefined, undefined],
  ['caller', 'Web client', 'external', '', 'external', undefined, undefined],
]);

const edges = graphSpecFromSteps([
  ['caller', 'entry', 'calls'],
  ['entry', 'store', 'writes'],
  ['entry', 'stripe', 'calls'],
]);

/** The hero configuration: no sidebar, subsystem name as a canvas chip. */
export const GraphOnlyWithTitle: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={componentsSpec}
        trails={edges.trails}
        graphTitle="Checkout"
        hideSidebar
      />
    </div>
  ),
};
