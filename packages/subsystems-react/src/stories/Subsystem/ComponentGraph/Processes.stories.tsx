import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { components, edges } from './fixtures';

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

// Two deployment units + one unframed outsider: host and renderer each get a
// dashed process frame; the service sits outside every boundary.
const processComponents = [
  ...components([
    ['main', 'main', 'function', 'src/host/main.ts', 'pkg:github/principal-ai/principal-studio', 'boots the host process', 'main'],
    ['store', 'SessionStore', 'store', 'src/host/store.ts', 'pkg:github/principal-ai/principal-studio', 'retained host state', 'SessionStore'],
    ['view', 'TrailView', 'function', 'src/renderer/view.tsx', 'pkg:github/principal-ai/principal-studio', 'renders the trail', 'TrailView'],
    ['bridge', 'bridge', 'module', 'src/renderer/bridge.ts', 'pkg:github/principal-ai/principal-studio', 'IPC bridge to the host', 'bridge'],
  ]),
  {
    id: 'svc',
    name: 'telemetry',
    construct: 'external' as const,
    file: '',
    purl: 'external',
    purpose: 'external telemetry sink (no process, never framed)',
    role: 'service' as const,
  },
].map((c, i) =>
  i < 2
    ? { ...c, process: 'principal-studio/host' }
    : i < 4
      ? { ...c, process: 'principal-studio/renderer' }
      : c,
);

const processEdges = edges([
  ['main', 'store', 'writes'],
  ['main', 'bridge', 'calls'],
  ['bridge', 'view', 'feeds'],
  ['main', 'svc', 'uses'],
]);

export const ProcessBoundaries: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Process boundaries"
        description="Host and renderer each render in their own ELK-aware boundary frame. The telemetry service has no `process` and sits outside every boundary."
        components={processComponents}
        edges={processEdges}
      />
    </div>
  ),
};
