import React, { useCallback, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { TrailsPanel } from '../../../subsystem/TrailsPanel';
import { initialTrails, OrderHeader } from './reorderFixtures';

const meta = {
  title: 'Canvases/Subsystem/UI Isolation/Reorder',
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
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function PanelOnlyDemo() {
  const [trails, setTrails] = useState(initialTrails);
  // Start collapsed so the drag grips are visible; expanding any row hides them
  // (reordering is only offered when every row is collapsed).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const onToggleCollapsed = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <OrderHeader list={trails} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div
          style={{
            width: 340,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #2a2a2a',
          }}
        >
          <TrailsPanel
            trails={trails}
            expandedTrails={expanded}
            focusedTrailId={null}
            focusedStepIndex={null}
            hoveredTrailStep={null}
            onToggleCollapsed={onToggleCollapsed}
            onFocusFlow={() => {}}
            onClearFocus={() => {}}
            onFocusStep={() => {}}
            onHoverStep={() => {}}
            onHoverFlow={() => {}}
            onLeaveStep={() => {}}
            onReorder={setTrails}
          />
        </div>
      </div>
    </div>
  );
}

export const PanelOnly: Story = {
  render: () => <PanelOnlyDemo />,
};
