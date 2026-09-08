import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react';
import { sensorControllerCase } from '../src/showcase/cases/sensor-controller';
import { makeShowcaseRenderers } from '../src/showcase/files.tsx';

const { model, caseDir } = sensorControllerCase;
const showcase = makeShowcaseRenderers(caseDir);

function SensorControllerDemo() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={model.components}
        edges={model.edges}
        throughlines={model.throughlines}
        title={model.title}
        description={model.description}
        renderFileViewer={showcase.renderFileViewer}
        renderThroughlineViewer={showcase.renderThroughlineViewer}
      />
    </div>
  );
}

const meta = {
  // CSF requires a string-literal title (not imported/dynamic).
  title: 'C++/Sensor to actuator',
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

export const SensorToActuator: Story = {
  render: () => <SensorControllerDemo />,
};
