import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent } from '../../../subsystem/model';
import { trailFromSteps } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/FrameworkStereotype',
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

const purl = 'pkg:github/principal-ai/principal-view-core-library';

/**
 * Same language construct (`function`) with and without framework stereotypes.
 * Badge text prefers `framework · stereotype` so UI units read as components /
 * hooks instead of plain functions; construct color stays function-indigo.
 */
const reactUiComponents: SubsystemComponent[] = [
  {
    alias: 'create-graph',
    name: 'createSubsystemModel',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl,
    symbol: 'createSubsystemModel',
    purpose: 'language-only helper — no framework / stereotype',
    process: 'principal-studio/host',
    layer: 1,
  },
  {
    alias: 'http-entry',
    name: 'handleSubsystemModelRequest',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/http-server.ts',
    purl,
    symbol: 'handleSubsystemModelRequest',
    purpose: 'HTTP bridge entry — topology role, still no React stereotype',
    role: 'entry',
    process: 'principal-studio/host',
    layer: 1,
  },
  {
    alias: 'sessions-view',
    name: 'AgentSessionsOverviewView',
    construct: 'function',
    file: 'packages/subsystems-studio/src/mainview/views/AgentSessions.tsx',
    purl,
    symbol: 'AgentSessionsOverviewView',
    purpose: 'React view — construct stays function; stereotype labels it',
    framework: 'react',
    stereotype: 'component',
    process: 'principal-studio/renderer',
    layer: 2,
  },
  {
    alias: 'model-view',
    name: 'SubsystemModelView',
    construct: 'function',
    file: 'packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx',
    purl,
    symbol: 'SubsystemModelView',
    purpose: 'another React component alongside a hook',
    framework: 'react',
    stereotype: 'component',
    process: 'principal-studio/renderer',
    layer: 2,
  },
  {
    alias: 'analysis-view',
    name: 'AnalysisView',
    construct: 'function',
    file: 'packages/subsystems-studio/src/mainview/views/AnalysisView.tsx',
    purl,
    symbol: 'AnalysisView',
    purpose: 'React component that consumes the graph document type',
    framework: 'react',
    stereotype: 'component',
    process: 'principal-studio/renderer',
    layer: 2,
  },
  {
    alias: 'drawings-host',
    name: 'useDrawingsHost',
    construct: 'function',
    file: 'packages/subsystems-studio/src/mainview/hooks/useDrawingsHost.ts',
    purl,
    symbol: 'useDrawingsHost',
    purpose: 'React hook — same construct, different stereotype',
    framework: 'react',
    stereotype: 'hook',
    process: 'principal-studio/renderer',
    layer: 2,
  },
  {
    alias: 'graph-doc-type',
    name: 'SubsystemModelDocument',
    construct: 'type_alias',
    file: 'packages/subsystems-core/src/types/subsystem-model.ts',
    purl,
    symbol: 'SubsystemModelDocument',
    purpose: 'type-only — framework / stereotype stay empty',
    layer: 3,
  },
];

const reactUiTrails = [
  trailFromSteps('react-ui-steps', 'React UI steps', [
    ['http-entry', 'create-graph', 'calls', 'packages/subsystems-studio/src/bun/http-server.ts', 1],
    ['sessions-view', 'drawings-host', 'uses', 'packages/subsystems-studio/src/mainview/views/AgentSessions.tsx', 1],
    ['analysis-view', 'graph-doc-type', 'uses', 'packages/subsystems-studio/src/mainview/views/AnalysisView.tsx', 1],
    ['sessions-view', 'analysis-view', 'feeds', 'packages/subsystems-studio/src/mainview/views/AgentSessions.tsx', 2],
  ]),
];

export const ReactComponentsAndHooks: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Framework + stereotype"
        description="construct stays language-shaped (function / type_alias). framework + stereotype label React units as component / hook without inventing a react_component construct. Empty fields mean language-only."
        components={reactUiComponents}
        trails={reactUiTrails}
      />
    </div>
  ),
};

/** Nest-style stereotypes on the same ontology — controller / middleware / guard. */
const nestComponents: SubsystemComponent[] = [
  {
    alias: 'graphs-controller',
    name: 'SubsystemModelsController',
    construct: 'class',
    file: 'src/graphs/graphs.controller.ts',
    purl: 'pkg:github/acme/api',
    symbol: 'SubsystemModelsController',
    purpose: 'Nest HTTP controller',
    framework: 'nestjs',
    stereotype: 'controller',
    role: 'entry',
    layer: 1,
  },
  {
    alias: 'auth-guard',
    name: 'AuthGuard',
    construct: 'class',
    file: 'src/auth/auth.guard.ts',
    purl: 'pkg:github/acme/api',
    symbol: 'AuthGuard',
    purpose: 'request guard',
    framework: 'nestjs',
    stereotype: 'guard',
    layer: 1,
  },
  {
    alias: 'logging-mw',
    name: 'LoggingMiddleware',
    construct: 'function',
    file: 'src/logging/logging.middleware.ts',
    purl: 'pkg:github/acme/api',
    symbol: 'LoggingMiddleware',
    purpose: 'Express-style middleware function under Nest',
    framework: 'nestjs',
    stereotype: 'middleware',
    layer: 1,
  },
  {
    alias: 'graphs-service',
    name: 'GraphsService',
    construct: 'class',
    file: 'src/graphs/graphs.service.ts',
    purl: 'pkg:github/acme/api',
    symbol: 'GraphsService',
    purpose: 'injectable service — stereotype without UI',
    framework: 'nestjs',
    stereotype: 'injectable',
    layer: 2,
  },
];

const nestTrails = [
  trailFromSteps('nest-stack-steps', 'Nest controller stack steps', [
    ['logging-mw', 'auth-guard', 'uses', 'src/logging/logging.middleware.ts', 1],
    ['auth-guard', 'graphs-controller', 'uses', 'src/auth/auth.guard.ts', 1],
    ['graphs-controller', 'graphs-service', 'calls', 'src/graphs/graphs.controller.ts', 1],
  ]),
];

export const NestControllerStack: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Nest framework stereotypes"
        description="Same optional fields work outside React: class/function constructs plus nestjs controller / guard / middleware / injectable stereotypes."
        components={nestComponents}
        trails={nestTrails}
      />
    </div>
  ),
};
