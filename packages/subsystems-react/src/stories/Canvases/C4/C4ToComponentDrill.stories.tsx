import React from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { C4ProjectionView } from '../../../subsystem/C4ProjectionView';
import {
  DRILLDOWN_C4_MODEL,
  DRILLDOWN_COMPONENTS,
  DRILLDOWN_DOC,
  DRILLDOWN_MEMBERS,
  DRILLDOWN_TRAILS,
} from '../../../subsystem/__fixtures__/c4Drilldown';

const meta = {
  title: 'Canvases/C4/C4ToComponentDrill',
  component: C4ProjectionView,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof C4ProjectionView>;

export default meta;
type Story = StoryObj<typeof meta>;

const DESCRIPTION =
  'The subsystem this C4 view summarizes. Focusing a trail opens the containers that hold its cast and folds the trail in as real nodes and edges, nested under their C4 component.';

function Demo() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <C4ProjectionView
        model={DRILLDOWN_C4_MODEL}
        components={DRILLDOWN_COMPONENTS}
        trails={DRILLDOWN_TRAILS}
        memberships={DRILLDOWN_MEMBERS}
        title={DRILLDOWN_DOC.title}
        description={DESCRIPTION}
        persistKey="c4-projection-drill"
      />
    </div>
  );
}

export const DrillIntoTrails: Story = {
  render: () => <Demo />,
};
