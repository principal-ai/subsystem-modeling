import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent } from '../../../subsystem/model';
import { graphSpecFromEdges } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/Modules',
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

const PURL = 'pkg:github/principal-ai/agent-monitoring';

/**
 * Module frames replace `construct: module`. Each export keeps its real
 * construct; shared `module` (the source path) draws the file as a boundary.
 */
const moduleComponents: SubsystemComponent[] = [
  {
    alias: 'record',
    name: 'CodexRolloutRecord',
    construct: 'type_alias',
    symbol: 'CodexRolloutRecord',
    file: 'src/session/transcript.ts',
    module: 'src/session/transcript.ts',
    purl: PURL,
    purpose: 'parsed rollout record shape',
    layer: 1,
  },
  {
    alias: 'is-rollout',
    name: 'isCodexRollout',
    construct: 'function',
    symbol: 'isCodexRollout',
    file: 'src/session/transcript.ts',
    module: 'src/session/transcript.ts',
    purl: PURL,
    purpose: 'type guard for rollout records',
    layer: 1,
  },
  {
    alias: 'parse',
    name: 'parseTranscript',
    construct: 'function',
    symbol: 'parseTranscript',
    file: 'src/session/transcript.ts',
    module: 'src/session/transcript.ts',
    purl: PURL,
    purpose: 'parses session transcript lines',
    layer: 1,
  },
  {
    alias: 'tool-name',
    name: 'extractToolName',
    construct: 'function',
    symbol: 'extractToolName',
    file: 'src/session/paths.ts',
    module: 'src/session/paths.ts',
    purl: PURL,
    purpose: 'pulls tool names from path-like strings',
    layer: 2,
  },
  {
    alias: 'file-path',
    name: 'extractFilePath',
    construct: 'function',
    symbol: 'extractFilePath',
    file: 'src/session/paths.ts',
    module: 'src/session/paths.ts',
    purl: PURL,
    purpose: 'pulls file paths from tool args',
    layer: 2,
  },
  {
    alias: 'reader',
    name: 'SessionReader',
    construct: 'class',
    symbol: 'SessionReader',
    file: 'src/session/SessionReader.ts',
    module: 'src/session/SessionReader.ts',
    purl: PURL,
    purpose: 'normalizes a session into universal events',
    layer: 3,
  },
  {
    alias: 'normalize',
    name: 'normalize',
    construct: 'method',
    symbol: 'SessionReader.normalize',
    file: 'src/session/SessionReader.ts',
    module: 'src/session/SessionReader.ts',
    purl: PURL,
    purpose: 'maps a session into universal events',
    layer: 3,
  },
  {
    alias: 'registry',
    name: 'registerAgent',
    construct: 'function',
    symbol: 'registerAgent',
    file: 'src/supported-agents.ts',
    // Singleton module — no frame (same rule as process: need 2+ members).
    module: 'src/supported-agents.ts',
    purl: PURL,
    purpose: 'registers a supported agent (singleton file — no module frame)',
    layer: 4,
  },
];

const moduleEdges = graphSpecFromEdges([
  ['parse', 'record', 'references'],
  ['is-rollout', 'record', 'references'],
  ['reader', 'normalize', 'method'],
  ['normalize', 'parse', 'calls'],
  ['normalize', 'tool-name', 'calls'],
  ['normalize', 'file-path', 'calls'],
  ['reader', 'registry', 'registers-into'],
]);

export const ModuleBoundaries: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Module boundaries"
        description="Concrete exports keep their real construct. Shared `module` (the source path) draws the file as a dashed frame — not `construct: module`. Singleton modules (registerAgent) stay unframed."
        components={moduleComponents}
        relations={moduleEdges.relations}
        walkthroughs={moduleEdges.walkthroughs}
      />
    </div>
  ),
};

/** Process → module → export nesting (host / renderer). */
const nestedComponents: SubsystemComponent[] = [
  {
    alias: 'boot',
    name: 'boot',
    construct: 'function',
    symbol: 'boot',
    role: 'entry',
    file: 'src/host/main.ts',
    module: 'src/host/main.ts',
    process: 'principal-studio/host',
    purl: 'pkg:github/principal-ai/principal-studio',
    purpose: 'Boots the host process',
    layer: 1,
  },
  {
    alias: 'create-host',
    name: 'createHost',
    construct: 'function',
    symbol: 'createHost',
    file: 'src/host/main.ts',
    module: 'src/host/main.ts',
    process: 'principal-studio/host',
    purl: 'pkg:github/principal-ai/principal-studio',
    purpose: 'Constructs the host runtime',
    layer: 1,
  },
  {
    alias: 'session-store',
    name: 'SessionStore',
    construct: 'store',
    symbol: 'SessionStore',
    file: 'src/host/store.ts',
    module: 'src/host/store.ts',
    process: 'principal-studio/host',
    purl: 'pkg:github/principal-ai/principal-studio',
    purpose: 'Retained host session state',
    layer: 2,
  },
  {
    alias: 'write-session',
    name: 'writeSession',
    construct: 'function',
    symbol: 'writeSession',
    file: 'src/host/store.ts',
    module: 'src/host/store.ts',
    process: 'principal-studio/host',
    purl: 'pkg:github/principal-ai/principal-studio',
    purpose: 'Mutates SessionStore',
    layer: 2,
  },
  {
    alias: 'bridge',
    name: 'bridge',
    construct: 'function',
    symbol: 'bridge',
    role: 'entry',
    file: 'src/renderer/bridge.ts',
    module: 'src/renderer/bridge.ts',
    process: 'principal-studio/renderer',
    purl: 'pkg:github/principal-ai/principal-studio',
    purpose: 'Renderer IPC entry',
    layer: 3,
  },
  {
    alias: 'post-to-host',
    name: 'postToHost',
    construct: 'function',
    symbol: 'postToHost',
    file: 'src/renderer/bridge.ts',
    module: 'src/renderer/bridge.ts',
    process: 'principal-studio/renderer',
    purl: 'pkg:github/principal-ai/principal-studio',
    purpose: 'Sends a message to the host',
    layer: 3,
  },
  {
    alias: 'trail-view',
    name: 'TrailView',
    construct: 'function',
    symbol: 'TrailView',
    framework: 'react',
    stereotype: 'component',
    file: 'src/renderer/view.tsx',
    module: 'src/renderer/view.tsx',
    process: 'principal-studio/renderer',
    purl: 'pkg:github/principal-ai/principal-studio',
    purpose: 'Renders the trail',
    layer: 4,
  },
  {
    alias: 'use-trail',
    name: 'useTrail',
    construct: 'function',
    symbol: 'useTrail',
    framework: 'react',
    stereotype: 'hook',
    file: 'src/renderer/view.tsx',
    module: 'src/renderer/view.tsx',
    process: 'principal-studio/renderer',
    purl: 'pkg:github/principal-ai/principal-studio',
    purpose: 'Subscribes the view to trail updates',
    layer: 4,
  },
  {
    alias: 'telemetry',
    name: 'telemetry',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'External sink — outside every frame',
    layer: 5,
  },
];

const nestedEdges = graphSpecFromEdges([
  ['boot', 'write-session', 'references'],
  ['trail-view', 'bridge', 'references'],
  ['trail-view', 'use-trail', 'references'],
  ['boot', 'create-host', 'calls'],
  ['create-host', 'write-session', 'calls'],
  ['write-session', 'session-store', 'writes'],
  ['bridge', 'boot', 'calls'],
  ['trail-view', 'post-to-host', 'calls'],
  ['boot', 'telemetry', 'uses'],
]);

export const ProcessAndModuleNesting: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Process × module nesting"
        description="process frames wrap module frames wrap exports. Leaves parent to module:; module groups parent to process: when every member shares that process."
        components={nestedComponents}
        relations={nestedEdges.relations}
        walkthroughs={nestedEdges.walkthroughs}
      />
    </div>
  ),
};
