import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent } from '../../../subsystem/model';
import { graphSpecFromSteps } from './fixtures';

const meta = {
  title: 'Canvases/Subsystem/Views/ModuleBadges',
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
const DEEP_VIEWS = 'packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx';

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
    alias: 'model-view',
    name: 'SubsystemModelView',
    construct: 'function',
    symbol: 'SubsystemModelView',
    file: DEEP_VIEWS,
    module: DEEP_VIEWS,
    purl: PURL,
    purpose: 'Renders a subsystem model',
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

const deepEdges = graphSpecFromSteps([
  ['node-comp', 'group-comp', 'calls'],
  ['edge-comp', 'group-comp', 'calls'],
  ['model-view', 'layers', 'calls'],
  ['use-drawings', 'model-view', 'calls'],
  ['model-view', 'node-comp', 'calls'],
]);

/** Collapsed module badges show `first/…/last`. Click one to expand the full
 *  path (just the badge grows — the module frame stays put). */
export const DeepModulePaths: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Deep module paths"
        description="Module badges never spill past their frame while collapsed."
        notes={
          'A path that would overflow collapses to `first/…/last`; ' +
          'click the badge to expand the full path (the badge widens past the frame edge — the frame itself stays put), click again to collapse it back.'
        }
        components={deepComponents}
        trails={deepEdges.trails}
      />
    </div>
  ),
};
