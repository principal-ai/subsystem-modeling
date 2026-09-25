import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemAggregateGraph } from '../../../subsystem/SubsystemAggregateGraph';
import {
  aggregateFrames,
  aggregateEdges,
  aggregateHubs,
} from './aggregateViewFixture';

const meta = {
  title: 'Subsystem/AggregateGraph/AggregateFrameGraph',
  component: SubsystemAggregateGraph,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof SubsystemAggregateGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Frame-level aggregate: process/module boxes with deduped walkthrough flows.
// Same stack as the component graph (React Flow + ELK), purpose-built nodes.
// Hover highlights the neighborhood; click selects and lists members.
// ---------------------------------------------------------------------------

function AggregateFrameDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <SubsystemAggregateGraph
          frames={aggregateFrames}
          edges={aggregateEdges}
          hubs={aggregateHubs}
          title="Combined graph"
          onSelectFrame={(id) => setSelected(id)}
          onOpenFile={(path) => console.log('[story] open file:', path)}
        />
      </div>
      <div style={{ padding: '4px 12px', fontFamily: 'monospace', fontSize: 12, color: '#aaa', borderTop: '1px solid #333', display: 'flex', gap: 24 }}>
        <span>selected: {selected ?? '(none)'}</span>
        <span>frames: {aggregateFrames.length} hubs: {aggregateHubs.length} edges: {aggregateEdges.length}</span>
      </div>
    </div>
  );
}

export const AggregateFrames: Story = {
  render: () => <AggregateFrameDemo />,
};
