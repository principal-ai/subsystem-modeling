import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { components, graphSpecFromEdges, relations } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/Processes',
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

// Three deployment units + one unframed outsider: host and renderer each frame
// two nodes; worker is a one-member process (kept, since singleton frames
// default on); the service has no `process` and sits outside every boundary.
const PROCESS_OF: Record<string, string> = {
  main: 'principal-studio/host',
  store: 'principal-studio/host',
  view: 'principal-studio/renderer',
  bridge: 'principal-studio/renderer',
  worker: 'principal-studio/worker',
};

const processComponents = [
  ...components([
    ['main', 'main', 'function', 'src/host/main.ts', 'pkg:github/principal-ai/principal-studio', 'boots the host process', 'main'],
    ['store', 'SessionStore', 'store', 'src/host/store.ts', 'pkg:github/principal-ai/principal-studio', 'retained host state', 'SessionStore'],
    ['view', 'TrailView', 'function', 'src/renderer/view.tsx', 'pkg:github/principal-ai/principal-studio', 'renders the trail', 'TrailView'],
    ['bridge', 'bridge', 'function', 'src/renderer/bridge.ts', 'pkg:github/principal-ai/principal-studio', 'IPC bridge to the host', 'bridge'],
    ['worker', 'runWorker', 'function', 'src/worker/run.ts', 'pkg:github/principal-ai/principal-studio', 'sole member of the worker process', 'runWorker'],
  ]).map((c) => {
    const process: string | undefined = PROCESS_OF[c.alias];
    return process ? { ...c, process } : c;
  }),
  {
    alias: 'svc',
    name: 'telemetry',
    construct: 'external' as const,
    file: '',
    purl: 'external',
    purpose: 'external telemetry sink (no process, never framed)',
    role: 'service' as const,
  },
];

const processEdges = graphSpecFromEdges([
  ['main', 'store', 'writes'],
  ['main', 'bridge', 'calls'],
  ['bridge', 'view', 'feeds'],
  ['main', 'worker', 'calls'],
  ['main', 'svc', 'uses'],
]);

export const ProcessBoundaries: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Process boundaries"
        description="Host and renderer each render in their own ELK-aware boundary frame. The worker process holds a single node and still gets a frame (singleton frames default on). The telemetry service has no `process` and sits outside every boundary."
        components={processComponents}
        relations={processEdges.relations} walkthroughs={processEdges.walkthroughs}
      />
    </div>
  ),
};
