import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemComponentEdge } from '../../../subsystem/model';
import type { GraphifyComponentDetail } from '../../../graphify';
import { investigateOnlyComponents, investigateOnlyRelations, investigateOnlyWalkthroughs } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/Appearance',
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

/** Same pipeline as Captures/InvestigateOnly with a narrower `maxNodeWidth` (140) — long names wrap. */
export const NarrowMaxWidth: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={investigateOnlyComponents}
        relations={investigateOnlyRelations} walkthroughs={investigateOnlyWalkthroughs}
        maxNodeWidth={140}
      />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Naming-convention wrap check — one node per common symbol convention.
// ---------------------------------------------------------------------------
const namingConventionComponents: SubsystemComponent[] = [
  {
    id: 'camel',
    name: 'accumulateToAgentSessionEvents',
    construct: 'function',
    file: 'src/event-processing/accumulator.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    symbol: 'accumulateToAgentSessionEvents',
  },
  {
    id: 'snake',
    name: 'repo_normalized_universal_event',
    construct: 'interface',
    file: 'src/event-processing/repo_normalized.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    symbol: 'repo_normalized_universal_event',
  },
  {
    id: 'pascal',
    name: 'RepoNormalizedUniversalAgentSessionEvent',
    construct: 'class',
    file: 'src/event-processing/RepoNormalized.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    symbol: 'RepoNormalizedUniversalAgentSessionEvent',
  },
  {
    id: 'acronym',
    name: 'ProcessSSEStreamForEventToken',
    construct: 'function',
    file: 'src/event-processing/sse.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    symbol: 'ProcessSSEStreamForEventToken',
  },
  {
    id: 'method',
    name: 'normalize',
    construct: 'function',
    file: 'src/session/SessionReader.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    symbol: 'SessionReader.normalize',
  },
  {
    id: 'pkg',
    name: 'principal-studio',
    construct: 'external',
    file: '',
    purl: 'pkg:npm/@principal-ai/subsystems-studio',
    symbol: '',
  },
];


/** Nodes with compact `maxNodeWidth` so the different conventions visibly wrap
 *  at their word boundaries (camelCase, snake_case, PascalCase, acronyms). */
export const NamingConventions: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={namingConventionComponents}
        relations={[]}
        maxNodeWidth={180}
      />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Kind variations — one column per kind (class / function / type / module /
// external), rows going bare → detailed. Click a node to see its declaration
// panel; type names inside it are clickable when they match another node here.
// ---------------------------------------------------------------------------
const variationPurl = 'pkg:github/principal-ai/agent-monitoring';

const kindVariationComponents: SubsystemComponent[] = [
  // --- class: bare → members only → relationships only
  {
    id: 'cls-bare',
    name: 'SessionStore',
    construct: 'class',
    file: 'src/session/SessionStore.ts',
    purl: variationPurl,
    purpose: 'no drill-down — renders a plain `class SessionStore`',
    symbol: 'SessionStore',
    layer: 1,
  },
  {
    id: 'cls-members',
    name: 'Transcoder',
    construct: 'class',
    file: 'src/session/Transcoder.ts',
    purl: variationPurl,
    purpose: 'members only — methods with typed params + returns, a typed field',
    symbol: 'Transcoder',
    layer: 1,
    declaration: {
      kind: 'class',
      methods: [
        { nodeId: 'tm1', name: 'encode', parameters: [{ type: 'RawFrame' }], returnType: 'Uint8Array' },
        { nodeId: 'tm2', name: 'decode', parameters: [{ type: 'Uint8Array' }], returnType: 'RawFrame' },
        { nodeId: 'tm3', name: 'reset' },
      ],
      properties: [{ name: 'bufferSize', type: 'number' }],
      extends: [],
      implements: [],
      instantiations: [],
      references: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'cls-relations',
    name: 'HttpTransport',
    construct: 'class',
    file: 'src/transport/HttpTransport.ts',
    purl: variationPurl,
    purpose: 'relationships only — extends + implements, constructed-by comment; empty body elides the braces',
    symbol: 'HttpTransport',
    layer: 1,
    declaration: {
      kind: 'class',
      methods: [],
      properties: [],
      extends: ['BaseTransport'],
      implements: ['Transport'],
      instantiations: [{ nodeId: 'x1', name: 'main' }],
      references: [],
    } satisfies GraphifyComponentDetail,
  },

  // --- function: bare → signature only → signature + call relationships
  {
    id: 'fn-bare',
    name: 'bootstrap',
    construct: 'function',
    file: 'src/bootstrap.ts',
    purl: variationPurl,
    purpose: 'no drill-down — renders a plain `function bootstrap()`',
    symbol: 'bootstrap',
    layer: 2,
  },
  {
    id: 'fn-signature',
    name: 'normalizeSession',
    construct: 'function',
    file: 'src/event-processing/normalize.ts',
    purl: variationPurl,
    purpose: 'signature only — named + positional (type-only) params, array return; no callers/callees comments',
    symbol: 'normalizeSession',
    layer: 2,
    declaration: {
      kind: 'function',
      parameters: [
        { name: 'session', type: 'SessionRecord' },
        { type: 'NormalizeOptions' },
      ],
      returnType: 'SessionEvent[]',
      callers: [],
      callees: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'fn-calls',
    name: 'mergeSessions',
    construct: 'function',
    file: 'src/session/merge.ts',
    purl: variationPurl,
    purpose: 'signature + call relationships — union-typed param, generic return, called-by / calls trailing comments',
    symbol: 'mergeSessions',
    layer: 2,
    declaration: {
      kind: 'function',
      parameters: [
        { name: 'sessions', type: 'SessionRecord[]' },
        { name: 'strategy', type: `'append' | 'replace'` },
      ],
      returnType: 'Promise<SessionEvent[]>',
      callers: [{ nodeId: 'c1', name: 'capture-session', source_location: 'L88' }],
      callees: [{ nodeId: 'c2', name: 'toUniversalEvents', source_location: 'L64' }],
    } satisfies GraphifyComponentDetail,
  },

  // --- type: bare → fields only → fields + implementors + used-by
  {
    id: 'ty-bare',
    name: 'RawFrame',
    construct: 'interface',
    file: 'src/session/RawFrame.ts',
    purl: variationPurl,
    purpose: 'no drill-down — renders a plain `interface RawFrame`',
    symbol: 'RawFrame',
    layer: 3,
  },
  {
    id: 'ty-fields',
    name: 'SessionRecord',
    construct: 'interface',
    file: 'src/session/transcript.ts',
    purl: variationPurl,
    purpose: 'fields only — typed interface body, nothing else',
    symbol: 'SessionRecord',
    layer: 3,
    declaration: {
      kind: 'type',
      properties: [
        { name: 'id', type: 'string' },
        { name: 'admittedSeq', type: 'number' },
      ],
      usedBy: [],
      implementors: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'ty-full',
    name: 'Transport',
    construct: 'interface',
    file: 'src/transport/Transport.ts',
    purl: variationPurl,
    purpose: 'full — fields + implemented-by (clicks through to HttpTransport) + used-by comments',
    symbol: 'Transport',
    layer: 3,
    declaration: {
      kind: 'type',
      properties: [{ name: 'name', type: 'string' }],
      usedBy: [{ nodeId: 'u1', name: 'main', context: 'parameter_type' }],
      implementors: ['HttpTransport'],
    } satisfies GraphifyComponentDetail,
  },

  // --- module: bare → exports only → exports + imports
  {
    id: 'mod-bare',
    name: 'transcript',
    construct: 'module',
    file: 'src/session/transcript.ts',
    purl: variationPurl,
    purpose: 'no drill-down — symbol-less module named from its file basename',
    symbol: '',
    layer: 4,
  },
  {
    id: 'mod-exports',
    name: 'paths',
    construct: 'module',
    file: 'src/session/paths.ts',
    purl: variationPurl,
    purpose: 'exports only — export statement + defines comment',
    symbol: '',
    layer: 4,
    declaration: {
      kind: 'module',
      exports: ['extractToolName', 'extractFilePath'],
      imports: [],
      symbols: ['extractToolName', 'extractFilePath'],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'mod-full',
    name: 'index',
    construct: 'module',
    file: 'src/index.ts',
    purl: variationPurl,
    purpose: 'full — import statements + re-export statement + defines comment',
    symbol: '',
    layer: 4,
    declaration: {
      kind: 'module',
      exports: ['SessionReader', 'SessionStore'],
      imports: [{ nodeId: 'i1', name: 'transcript', relation: 'imports' }],
      symbols: ['SessionReader', 'SessionStore'],
    } satisfies GraphifyComponentDetail,
  },

  // --- external: bare → labeled
  {
    id: 'ext-bare',
    name: 'left-pad',
    construct: 'external',
    file: '',
    purl: 'pkg:npm/left-pad',
    purpose: 'no drill-down — renders a plain `external left-pad`',
    symbol: '',
    layer: 5,
  },
  {
    id: 'ext-label',
    name: 'principal-studio',
    construct: 'external',
    file: '',
    purl: 'pkg:npm/@principal-ai/subsystems-studio',
    purpose: 'labeled — the full purl as a quoted string literal',
    symbol: '',
    layer: 5,
    declaration: {
      kind: 'external',
      label: 'pkg:npm/@principal-ai/subsystems-studio',
    } satisfies GraphifyComponentDetail,
  },
];


function KindVariationsDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={kindVariationComponents}
        relations={[]}
        onSelect={(id) => setSelected(id)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        columns: class · function · type · module · external — each goes bare → detailed
        {selected ? ` · selected: ${selected}` : ''}
      </div>
    </div>
  );
}

export const KindVariations: Story = {
  render: () => <KindVariationsDemo />,
};
