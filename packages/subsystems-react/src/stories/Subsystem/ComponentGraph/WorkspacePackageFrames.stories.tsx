import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent } from '../../../subsystem/model';
import { graphSpecFromHops } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/WorkspacePackages',
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

const STUDIO = 'pkg:npm/@principal-ai/subsystems-studio';
const REACT = 'pkg:npm/@principal-ai/subsystems-react';
const RENDERER = 'principal-studio/renderer';

/**
 * Workspace-package preview — one repo, two packages.
 *
 * `purl` carries the workspace-package identity (npm purls here), so package
 * frames draw per package instead of one frame per repo. The app package owns
 * the runtime process: only `subsystems-studio` code sits inside
 * `principal-studio/renderer`. The consumed library (`subsystems-react`) is a
 * dependency, not a deployment unit, so it is housed in its own package frame
 * outside that process — reached by cross-package edges instead of nesting.
 *
 * Tree: package → process → module → leaves, with the library package beside
 * the process rather than inside it.
 */
const components: SubsystemComponent[] = [
  // --- packages/subsystems-studio · inside process principal-studio/renderer
  {
    alias: 'model-view',
    name: 'SubsystemModelView',
    construct: 'function',
    symbol: 'SubsystemModelView',
    file: 'packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx',
    module: 'packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx',
    process: RENDERER,
    purl: STUDIO,
    purpose: 'renderer view that opens a subsystem model',
    layer: 0,
  },
  {
    alias: 'read-file',
    name: 'readSubsystemFile',
    construct: 'function',
    symbol: 'readSubsystemFile',
    file: 'packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx',
    module: 'packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx',
    process: RENDERER,
    purl: STUDIO,
    purpose: 'request a file slice for the drawer',
    layer: 1,
  },
  {
    alias: 'get-model',
    name: 'getSubsystemModel',
    construct: 'function',
    symbol: 'getSubsystemModel',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    module: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    process: RENDERER,
    purl: STUDIO,
    purpose: 'load a model document for the view',
    layer: 2,
  },

  // --- packages/subsystems-react · consumed library, housed outside the process
  {
    alias: 'component-graph',
    name: 'SubsystemComponentGraph',
    construct: 'function',
    symbol: 'SubsystemComponentGraph',
    file: 'packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx',
    module: 'packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx',
    purl: REACT,
    purpose: 'the graph canvas the view embeds',
    layer: 1,
  },
  {
    alias: 'file-drawer',
    name: 'FileDrawer',
    construct: 'function',
    symbol: 'FileDrawer',
    file: 'packages/subsystems-react/src/subsystem/FileDrawer.tsx',
    module: 'packages/subsystems-react/src/subsystem/FileDrawer.tsx',
    purl: REACT,
    purpose: 'pierre-backed source drawer',
    layer: 2,
  },
  {
    alias: 'pierre-file-view',
    name: 'PierreFileView',
    construct: 'function',
    symbol: 'PierreFileView',
    file: 'packages/subsystems-react/src/pierre/PierreFileView.tsx',
    module: 'packages/subsystems-react/src/pierre/PierreFileView.tsx',
    purl: REACT,
    purpose: 'renders one file slice',
    layer: 3,
  },
];

const spec = graphSpecFromHops([
  ['read-file', 'get-model', 'calls'],
  ['model-view', 'component-graph', 'uses'],
  ['component-graph', 'file-drawer', 'calls'],
  ['file-drawer', 'pierre-file-view', 'uses'],
]);

export const PackageOwnedProcess: Story = {
  name: 'Package-owned process · library outside',
  args: {
    components,
    walkthroughs: spec.walkthroughs,
    graphTitle: 'Opening a file — app package owns the process',
  },
  render: (args) => (
    <div style={{ width: '100vw', height: '100vh' }}>
      <SubsystemComponentGraph {...args} />
    </div>
  ),
};
