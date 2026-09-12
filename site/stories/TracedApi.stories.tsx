import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react';
import { tracedApiCase } from '../src/showcase/cases/traced-api';
import { makeShowcaseRenderers } from '../src/showcase/files.tsx';

const { model, caseDir } = tracedApiCase;
const showcase = makeShowcaseRenderers(caseDir);

function TracedApiDemo() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={model.components}
        relations={model.relations}
        walkthroughs={model.walkthroughs}
        title={model.title}
        description={model.description}
        renderFileViewer={showcase.renderFileViewer}
        renderWalkthroughViewer={showcase.renderWalkthroughViewer}
      />
    </div>
  );
}

const meta = {
  // CSF requires a string-literal title (not imported/dynamic).
  title: 'Python/Traced HTTP API',
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

export const TracedHttpApi: Story = {
  render: () => <TracedApiDemo />,
};
