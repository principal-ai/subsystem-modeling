import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { SubsystemGroupNode } from '../../../subsystem/nodes';
import type {
  SubsystemComponent,
  SubsystemGraphNode,
  SubsystemProcessRegion,
} from '../../../subsystem/model';
import { graphSpecFromEdges } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/ModuleBadges',
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

const PURL = 'pkg:github/principal-ai/subsystem-modeling';
const DEEP_NODES = 'packages/subsystems-react/src/subsystem/nodes.tsx';
const DEEP_VIEWS = 'packages/subsystems-studio/src/mainview/views/AnalysisView.tsx';

/**
 * Components sharing a deep `module` path — long enough that the collapsed
 * badge must flip to `first/…/last`; clicking grows the badge, not the frame.
 */
const deepComponents: SubsystemComponent[] = [
  {
    alias: 'node-comp',
    name: 'SubsystemComponentNode',
    construct: 'function',
    symbol: 'SubsystemComponentNode',
    file: DEEP_NODES,
    module: DEEP_NODES,
    purl: PURL,
    purpose: 'Leaf component renderer',
  },
  {
    alias: 'group-comp',
    name: 'SubsystemGroupNode',
    construct: 'function',
    symbol: 'SubsystemGroupNode',
    file: DEEP_NODES,
    module: DEEP_NODES,
    purl: PURL,
    purpose: 'Boundary frame renderer',
  },
  {
    alias: 'edge-comp',
    name: 'SubsystemEdge',
    construct: 'function',
    symbol: 'SubsystemEdge',
    file: DEEP_NODES,
    module: DEEP_NODES,
    purl: PURL,
    purpose: 'Edge renderer',
  },
  {
    alias: 'analysis',
    name: 'AnalysisView',
    construct: 'function',
    symbol: 'AnalysisView',
    file: DEEP_VIEWS,
    module: DEEP_VIEWS,
    purl: PURL,
    purpose: 'Renders an analysis',
  },
  {
    alias: 'layers',
    name: 'LayersProvider',
    construct: 'function',
    symbol: 'LayersProvider',
    file: DEEP_VIEWS,
    module: DEEP_VIEWS,
    purl: PURL,
    purpose: 'Provides the layer UI',
  },
  {
    alias: 'use-drawings',
    name: 'useDrawingsHost',
    construct: 'function',
    symbol: 'useDrawingsHost',
    file: DEEP_VIEWS,
    module: DEEP_VIEWS,
    purl: PURL,
    purpose: 'Subscribes to drawing updates',
    framework: 'react',
    stereotype: 'hook',
  },
];

const deepEdges = graphSpecFromEdges([
  ['node-comp', 'group-comp', 'references'],
  ['edge-comp', 'group-comp', 'references'],
  ['analysis', 'layers', 'references'],
  ['use-drawings', 'analysis', 'references'],
  ['analysis', 'node-comp', 'references'],
]);

/** Collapsed module badges show `first/…/last`. Click one to expand the full
 *  path (just the badge grows — the module frame stays put). */
export const DeepModulePaths: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Deep module paths"
        description={
          'Module badges never spill past their frame while collapsed. A path that would overflow collapses to `first/…/last`; ' +
          'click the badge to expand the full path (the badge widens past the frame edge — the frame itself stays put), click again to collapse it back.'
        }
        components={deepComponents}
        relations={deepEdges.relations}
        walkthroughs={deepEdges.walkthroughs}
      />
    </div>
  ),
};

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