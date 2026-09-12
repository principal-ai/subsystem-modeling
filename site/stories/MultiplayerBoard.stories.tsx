import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react';
import { multiplayerBoardCase } from '../src/showcase/cases/multiplayer-board';
import { makeShowcaseRenderers } from '../src/showcase/files.tsx';

const { model, caseDir } = multiplayerBoardCase;
const showcase = makeShowcaseRenderers(caseDir);

function MultiplayerBoardDemo() {
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
  title: 'TypeScript/Multiplayer whiteboard',
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

export const MultiplayerWhiteboard: Story = {
  render: () => <MultiplayerBoardDemo />,
};
