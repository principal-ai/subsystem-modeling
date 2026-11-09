import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemTrail } from '../../../subsystem/model';
import fixture from './fixtures/focus-reset-case.json';

const meta = {
  title: 'Canvases/Subsystem/Regression/Focus reset edge bounds',
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

const components = fixture.components as unknown as SubsystemComponent[];
const trails = fixture.trails as unknown as SubsystemTrail[];

export const AuditModel: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flex: '0 0 auto',
          padding: '10px 16px',
          borderBottom: '1px solid #333',
          background: '#141414',
          color: '#ddd',
          font: '12px/1.5 monospace',
        }}
      >
        Regression case: focus any trail, then click its <strong>Collapse</strong> chevron
        to clear focus and fit the overview. The route and labels should remain inside the canvas.
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SubsystemComponentGraph
          components={components}
          trails={trails}
          title="Subsystem audit"
          description="Focus a trail, then collapse it to reset to the full graph."
          showEdgeLabels
        />
      </div>
    </div>
  ),
};
