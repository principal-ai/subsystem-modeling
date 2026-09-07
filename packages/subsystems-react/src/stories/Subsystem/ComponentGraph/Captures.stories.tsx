import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemComponentEdge } from '../../../subsystem/model';
import type { GraphifyComponentDetail } from '../../../graphify';
import { components, edges, readerDetail, investigateOnlyComponents, investigateOnlyEdges } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/Captures',
  component: SubsystemComponentGraph,
  parameters: {
    layout: 'fullscreen',
  },
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

// ---------------------------------------------------------------------------
// Primary: opencode V2 event reader subsystem (agent-monitoring) + consumers
// ---------------------------------------------------------------------------
const v2ReaderComponents = components([
  ['capture', 'capture script', 'function', 'scripts/capture-session.ts', 'pkg:github/principal-ai/agent-monitoring', 'captures a real session for fixtures'],
  ['transcript', 'transcript', 'module', 'transcript.ts', 'pkg:github/principal-ai/agent-monitoring', 'parses session records + type guards'],
  ['paths', 'paths', 'module', 'paths.ts', 'pkg:github/principal-ai/agent-monitoring', 'extracts tool names + file paths'],
  ['reader', 'SessionReader', 'class', 'SessionReader.ts', 'pkg:github/principal-ai/agent-monitoring', 'normalizes a session into universal events', 'SessionReader.normalize', readerDetail],
  ['registry', 'supported-agents', 'module', 'supported-agents.ts', 'pkg:github/principal-ai/agent-monitoring', 'registry of supported agents (the shared seam)', 'registerAgent'],
]);

const v2ReaderEdges = edges([
  ['transcript', 'reader', 'imports'],
  ['paths', 'reader', 'imports'],
  ['capture', 'reader', 'calls'],
  ['reader', 'registry', 'registers-into', ['supported-agents.ts']],
  // Consumer packages - cross-package edges leave the subgraph
  ['reader', 'principal-studio-host', 'imports'],
  ['reader', 'core-sessions', 'imports'],
  ['reader', 'cli-session', 'imports'],
]);

function V2ReaderDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SubsystemComponentEdge | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={v2ReaderComponents}
        edges={v2ReaderEdges}
        onSelect={(id) => setSelected(id)}
        onEdgeSelect={(e) => setSelectedEdge(e)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        {selectedEdge
          ? `edge: ${selectedEdge.from} --${selectedEdge.mechanism}--> ${selectedEdge.to}${selectedEdge.refs?.length ? ` [refs: ${selectedEdge.refs.join(', ')}]` : ''}`
          : selected
            ? `selected: ${selected}`
            : 'click a component or edge to select it'}
      </div>
    </div>
  );
}

export const V2ReaderSubsystem: Story = {
  render: () => <V2ReaderDemo />,
};

// ---------------------------------------------------------------------------
// Investigate-and-pin capture (fixture shared with Appearance/NarrowMaxWidth)
// ---------------------------------------------------------------------------
export const InvestigateOnly: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph components={investigateOnlyComponents} edges={investigateOnlyEdges} />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Minimal (pre-graphify) vs Resolved (post-graphify) — the SAME subsystem,
// showing what the LLM emits (no detail) and what graphify enrichment adds.
// ---------------------------------------------------------------------------

/** The minimal LLM-authored substrate: symbols only, no `detail`. */
const minimalComponents = components([
  ['reader', 'SessionReader', 'class', 'SessionReader.ts', 'pkg:github/principal-ai/agent-monitoring', 'normalizes a session into universal events', 'SessionReader'],
  ['normalize', 'normalize', 'function', 'SessionReader.ts', 'pkg:github/principal-ai/agent-monitoring', 'maps a session into universal events', 'SessionReader.normalize'],
  ['record', 'SessionRecord', 'type', 'transcript.ts', 'pkg:github/principal-ai/agent-monitoring', 'the parsed codex session record', 'SessionRecord'],
  ['transcript', 'transcript', 'module', 'transcript.ts', 'pkg:github/principal-ai/agent-monitoring', 'parses session records + type guards', 'transcript'],
]);

const sharedEdges = edges([
  ['transcript', 'record', 'defines'],
  ['reader', 'normalize', 'method'],
  ['normalize', 'record', 'references'],
]);

/** The same subsystem after `resolveSubsystemToGraphify` populates `detail`. */
const resolvedComponents: SubsystemComponent[] = [
  { ...minimalComponents[0], detail: readerDetail },
  {
    ...minimalComponents[1],
    detail: {
      kind: 'function',
      parameters: [{ name: 'session', type: 'SessionRecord' }],
      returnType: 'SessionEvent[]',
      callers: [{ nodeId: 'c1', name: 'capture-session', source_location: 'L120' }],
      callees: [{ nodeId: 'c2', name: 'toUniversalEvents', source_location: 'L64' }],
    } satisfies GraphifyComponentDetail,
  },
  {
    ...minimalComponents[2],
    detail: {
      kind: 'type',
      properties: [
        { name: 'id', type: 'string' },
        { name: 'type', type: 'string' },
      ],
      usedBy: [{ nodeId: 'u1', name: 'normalize', context: 'type' }],
      implementors: ['SessionReaderLike'],
    } satisfies GraphifyComponentDetail,
  },
  {
    ...minimalComponents[3],
    detail: {
      kind: 'module',
      exports: ['CodexRolloutRecord', 'CodexSessionMeta'],
      imports: [{ nodeId: 'i1', name: 'paths', relation: 'imports_from' }],
      symbols: ['CodexRolloutRecord', 'CodexSessionMeta'],
    } satisfies GraphifyComponentDetail,
  },
];

function MinimalVsResolvedDemo({ resolved }: { resolved: boolean }) {
  const [, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={resolved ? resolvedComponents : minimalComponents}
        edges={sharedEdges}
        onSelect={(id) => setSelected(id)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        {resolved
          ? 'post-graphify: click a component to see the enriched GraphifyComponentDetail'
          : 'pre-graphify: LLM-authored symbols only — no detail yet'}
      </div>
    </div>
  );
}

export const MinimalPreGraphify: Story = {
  render: () => <MinimalVsResolvedDemo resolved={false} />,
};

export const ResolvedPostGraphify: Story = {
  render: () => <MinimalVsResolvedDemo resolved />,
};

// ---------------------------------------------------------------------------
// Investigation-derived subsystem — grok session 019fd2a9 (t3code)
// Read-only analysis of "provider / event threading". Components are occupied
// (analyzed, not edited) — no code touched, but a coherent concept was worked.
// ---------------------------------------------------------------------------
const investigationComponents: SubsystemComponent[] = [
  {
    id: 'adapter',
    name: 'OpenCodeAdapter',
    construct: 'module',
    file: 'apps/server/src/provider/Layers/OpenCodeAdapter.ts',
    purl: 'pkg:github/t3code/t3code',
    purpose: 'adapts opencode session/threads + events to the t3 runtime',
    symbol: 'makeOpenCodeAdapter',
    capture: 'analyzed',
    detail: {
      kind: 'module',
      exports: ['makeOpenCodeAdapter', 'OpenCodeAdapterLiveOptions'],
      imports: [{ nodeId: 'i1', name: 'orchestration', relation: 'imports_from' }],
      symbols: ['makeOpenCodeAdapter', 'isOpenCodeNotFound', 'OpenCodeSessionContext'],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'ingestion',
    name: 'ProviderRuntimeIngestion',
    construct: 'module',
    file: 'apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts',
    purl: 'pkg:github/t3code/t3code',
    purpose: 'ingests provider events into the runtime',
    symbol: 'ProviderRuntimeIngestion',
    capture: 'analyzed',
  },
  {
    id: 'contracts',
    name: 'orchestration',
    construct: 'module',
    file: 'packages/contracts/src/orchestration.ts',
    purl: 'pkg:github/t3code/t3code',
    purpose: 'contracts for orchestration/providers',
    symbol: 'ORCHESTRATION_WS_METHODS',
    capture: 'analyzed',
  },
];

const investigationEdges = edges([
  ['adapter', 'contracts', 'imports_from'],
  ['ingestion', 'adapter', 'uses'],
  ['ingestion', 'contracts', 'references'],
]);

function InvestigationDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={investigationComponents}
        edges={investigationEdges}
        onSelect={(id) => setSelected(id)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        read-only investigation snapshot (grok 019fd2a9) — components analyzed, not edited
        {selected ? ` · selected: ${selected}` : ''}
      </div>
    </div>
  );
}

export const InvestigationDerived: Story = {
  render: () => <InvestigationDemo />,
};
