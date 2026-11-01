import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent } from '../../../subsystem/model';
import { components, graphSpecFromSteps } from './fixtures';

const meta = {
  title: 'Canvases/Subsystem/ContainerFrames',
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

const HOST = 'principal-studio/host';
const RENDERER = 'principal-studio/renderer';
const DB = 'principal-studio/db';

const PROCESS_OF: Record<string, string> = {
  main: HOST,
  store: HOST,
  view: RENDERER,
  bridge: RENDERER,
  panel: RENDERER,
  db: DB,
};

/**
 * Process frames drawn as container cards — the same header a C4 container
 * wears: label, kind glyph, technology row, member count. The renderer states
 * no technology through `regionDetails`, so it reads React off its members'
 * `framework`; the database is a data store, so it wears the database glyph.
 */
const containerComponents: SubsystemComponent[] = [
  ...components([
    ['main', 'main', 'function', 'src/host/main.ts', 'pkg:github/principal-ai/principal-studio', 'boots the host process', 'main'],
    ['store', 'SessionStore', 'store', 'src/host/store.ts', 'pkg:github/principal-ai/principal-studio', 'retained host state', 'SessionStore'],
    ['view', 'TrailView', 'function', 'src/renderer/view.tsx', 'pkg:github/principal-ai/principal-studio', 'renders the trail', 'TrailView'],
    ['panel', 'DetailPanel', 'function', 'src/renderer/panel.tsx', 'pkg:github/principal-ai/principal-studio', 'inspects the selected step', 'DetailPanel'],
    ['bridge', 'bridge', 'function', 'src/renderer/bridge.ts', 'pkg:github/principal-ai/principal-studio', 'IPC bridge to the host', 'bridge'],
    ['db', 'sessions', 'store', 'src/db/sessions.ts', 'pkg:github/principal-ai/principal-studio', 'session rows', 'sessions'],
  ]).map((c) => {
    const process: string | undefined = PROCESS_OF[c.alias];
    const withProcess = process ? { ...c, process } : c;
    return c.alias === 'view' || c.alias === 'panel'
      ? { ...withProcess, framework: 'react', stereotype: 'component' }
      : withProcess;
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

const containerEdges = graphSpecFromSteps([
  ['main', 'store', 'writes'],
  ['main', 'bridge', 'calls'],
  ['bridge', 'view', 'feeds'],
  ['view', 'panel', 'calls'],
  ['store', 'db', 'writes'],
  ['main', 'svc', 'uses'],
]);

export const ProcessCards: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Container frames"
        description="Process frames draw as container cards. The host states Bun through `regionDetails` and takes the Bun hue; the renderer derives React from its members' `framework`; the database is a data store and wears the database glyph."
        components={containerComponents}
        trails={containerEdges.trails}
        regionDetails={{
          [HOST]: {
            technology: 'Bun + Electrobun',
            description: 'Owns the session store and brokers IPC for the renderer.',
          },
          [DB]: {
            technology: 'SQLite',
            containerKind: 'data-store',
            description: 'Local session database.',
          },
        }}
      />
    </div>
  ),
};

export const UnstatedTechnology: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Unstated technology"
        description="No `regionDetails`: frames with no known member framework fall back to their kind in the technology row and keep the per-key hue, so several unstated processes stay distinguishable."
        components={containerComponents}
        trails={containerEdges.trails}
      />
    </div>
  ),
};

export const StartOpen: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Start open"
        description="Frames start closed by default; `defaultFramesCollapsed={false}` lays every process frame out from the start. Close one from its card, by double-click, or from the Containers list in the sidebar switch."
        components={containerComponents}
        trails={containerEdges.trails}
        defaultFramesCollapsed={false}
        regionDetails={{
          [HOST]: { technology: 'Bun + Electrobun' },
          [DB]: { technology: 'SQLite', containerKind: 'data-store' },
        }}
      />
    </div>
  ),
};
