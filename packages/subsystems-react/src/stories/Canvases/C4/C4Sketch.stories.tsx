import React from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { C4SketchView } from '../../../subsystem/C4SketchView';
import { SKETCH_FIXTURE } from '../../../subsystem/__fixtures__/c4Sketch';

const meta = {
  title: 'Canvases/C4/C4Sketch',
  component: C4SketchView,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof C4SketchView>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <C4SketchView sketch={SKETCH_FIXTURE} />
    </div>
  );
}

/** A standalone authored sketch: no model, no grounding, no promotion. */
export const Sketch: Story = {
  render: () => <Demo />,
};
