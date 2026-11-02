import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemGroupNode } from '../../../subsystem/nodes';
import type {
  SubsystemGraphNode,
  SubsystemProcessRegion,
} from '../../../subsystem/model';

const meta = {
  title: 'Canvases/Subsystem/UI Isolation/ModuleBadges',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <ReactFlowProvider>
          <Story />
        </ReactFlowProvider>
      </ThemeProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const DEEP_NODES = 'packages/subsystems-react/src/subsystem/nodes.tsx';
const HARNESS_FRAME_WIDTH = 360;

const harnessRegion: SubsystemProcessRegion = {
  kind: 'module',
  key: DEEP_NODES,
  label: DEEP_NODES,
  memberAliases: ['node-comp', 'group-comp', 'edge-comp'],
};

/** Fixed frame; the badge is the only thing that grows on click. */
function ModuleBadgeHarness() {
  const nodeProps = {
    id: `module:${harnessRegion.key}`,
    data: { region: harnessRegion },
    width: HARNESS_FRAME_WIDTH,
    height: 180,
    selected: false,
  } as unknown as NodeProps<SubsystemGraphNode>;
  return (
    <div
      style={{
        padding: 56,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        height: '100vh',
        boxSizing: 'border-box',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ fontSize: 13, color: '#8a90a0' }}>
        The module frame stays at{' '}
        <span style={{ fontFamily: 'monospace', color: '#d5d9e2' }}>
          {HARNESS_FRAME_WIDTH}px
        </span>
        . Hover a badge and it widens to reveal more of the path text (no
        stretch, no distortion) to show it's clickable. Click to expand the
        full path past the frame's edge, click again to collapse back to{' '}
        <code>first/…/last</code>.
      </div>
      <div style={{ position: 'relative', width: HARNESS_FRAME_WIDTH, minWidth: 0 }}>
        <SubsystemGroupNode {...nodeProps} />
      </div>
    </div>
  );
}

/** Isolated demo: only the badge grows — the module frame never moves. */
export const BadgeOnly: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <ModuleBadgeHarness />,
};
