import React, { useCallback, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemTrail } from '../../../subsystem/model';
import { components, initialTrails, OrderHeader } from './reorderFixtures';

const meta = {
  title: 'Canvases/Subsystem/Views/Reorder',
  component: SubsystemComponentGraph,
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
} satisfies Meta<typeof SubsystemComponentGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

function ReorderGraphDemo() {
  const [trails, setTrails] = useState(initialTrails);
  const onReorder = useCallback(
    (next: SubsystemTrail[]) => setTrails(next),
    [],
  );

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <OrderHeader list={trails} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <SubsystemComponentGraph
          components={components}
          trails={trails}
          onReorderTrails={onReorder}
          title="drawing-files flows"
          description="Drag the grip at the right of a trail row to reorder it."
          notes="Select a trail to open its steps and focus its components; Back restores the full list and model. The header above mirrors the array order; dropping a row calls `onReorderTrails` with the next array."
        />
      </div>
    </div>
  );
}

export const DragToReorder: Story = {
  render: () => <ReorderGraphDemo />,
};
