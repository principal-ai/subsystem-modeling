import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { PierreFileView, PierreSnippetView } from '../../../pierre';
import type { SubsystemComponent, SubsystemComponentEdge } from '../../../subsystem/model';
import type { SubsystemOpenFileOptions } from '../../../subsystem/declarationRef';
import type { GraphifyComponentDetail } from '../../../graphify';
import componentDeclarationSource from '../../../subsystem/ComponentDeclaration.tsx?raw';
import resolveSource from '../../../graphify/resolve.ts?raw';
import { readerDetail } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/DetailPanel',
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
// One node per GraphifyComponentDetail kind — what each looks like + drills down
// ---------------------------------------------------------------------------
const detailKindComponents: SubsystemComponent[] = [
  {
    id: 'detail-class',
    name: 'SessionReader',
    construct: 'class',
    file: 'src/session/SessionReader.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'class-like: owns outgoing method edges',
    symbol: '',
    detail: readerDetail,
  },
  {
    id: 'detail-method',
    name: 'normalize',
    construct: 'function',
    file: 'src/session/SessionReader.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'a class method — the specific thing this session focused on',
    symbol: 'SessionReader.normalize',
    detail: {
      kind: 'function',
      parameters: [{ name: 'session', type: 'SessionRecord' }],
      returnType: 'SessionEvent[]',
      callers: [{ nodeId: 'c1', name: 'capture-session', source_location: 'L120' }],
      callees: [{ nodeId: 'c2', name: 'toUniversalEvents', source_location: 'L64' }],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'detail-fn',
    name: 'normalizeSession',
    construct: 'function',
    file: 'src/event-processing/normalize.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'function-like: label ends () with no method edges',
    symbol: 'normalizeSession',
    detail: {
      kind: 'function',
      parameters: [
        { name: 'session', type: 'SessionRecord' },
        { name: 'limit', type: 'number' },
      ],
      returnType: 'SessionEvent[]',
      callers: [{ nodeId: 'c1', name: 'SessionReader.normalize', source_location: 'L120' }],
      callees: [{ nodeId: 'c2', name: 'toUniversalEvents', source_location: 'L64' }],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'detail-fn-rich',
    name: 'mergeSessions',
    construct: 'function',
    file: 'src/session/merge.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'multi-param signature — named, positional (graphify captures types only), union types, generic return',
    symbol: 'mergeSessions',
    detail: {
      kind: 'function',
      parameters: [
        { name: 'sessions', type: 'SessionRecord[]' },
        { type: 'MergeOptions' },
        { name: 'strategy', type: `'append' | 'replace' | 'skip'` },
        { name: 'onConflict', type: '((a: SessionRecord, b: SessionRecord) => SessionRecord)' },
      ],
      returnType: 'Promise<Map<string, SessionEvent[]>>',
      callers: [
        { nodeId: 'c1', name: 'capture-session', source_location: 'L88' },
        { nodeId: 'c3', name: 'backfill', source_location: 'L210' },
      ],
      callees: [{ nodeId: 'c2', name: 'toUniversalEvents', source_location: 'L64' }],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'detail-fn-void',
    name: 'flush',
    construct: 'function',
    file: 'src/event-processing/sink.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'no parameters, no return type — the barest function signature',
    symbol: 'flush',
    detail: {
      kind: 'function',
      parameters: [],
      callers: [{ nodeId: 'c4', name: 'EventProcessor.dispose', source_location: 'L142' }],
      callees: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'detail-class-rich',
    name: 'EventProcessor',
    construct: 'class',
    file: 'src/event-processing/EventProcessor.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'class with fully-typed members — method params + returns, field types, extends + implements',
    symbol: 'EventProcessor',
    detail: {
      kind: 'class',
      methods: [
        { nodeId: 'rm1', name: 'process', parameters: [{ type: 'RawEvent' }, { type: 'ProcessingOptions' }], returnType: 'ProcessedEvent' },
        { nodeId: 'rm2', name: 'batch', parameters: [{ type: 'RawEvent[]' }], returnType: 'Promise<ProcessedEvent[]>' },
        { nodeId: 'rm3', name: 'onError', parameters: [{ type: 'Error' }] },
        { nodeId: 'rm4', name: 'dispose' },
      ],
      properties: [
        { name: 'queue', type: 'RawEvent[]' },
        { name: 'options', type: 'Required<ProcessingOptions>' },
        { name: 'retryLimit', type: 'number' },
      ],
      extends: ['BaseProcessor'],
      implements: ['Disposable', 'EventEmitterLike'],
      instantiations: [
        { nodeId: 'x1', name: 'main' },
        { nodeId: 'x2', name: 'worker-pool' },
      ],
      references: [{ nodeId: 'x3', name: 'pipeline', context: 'type' }],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'detail-type',
    name: 'SessionRecord',
    construct: 'interface',
    file: 'src/session/transcript.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'type-like: revealed by incoming implements edges',
    symbol: 'SessionRecord',
    detail: {
      kind: 'type',
      properties: [
        { name: 'id', type: 'string' },
        { name: 'admittedSeq', type: 'number' },
      ],
      usedBy: [{ nodeId: 'u1', name: 'normalizeSession', context: 'type' }],
      implementors: ['SessionReaderLike'],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'detail-module',
    name: 'CodexRolloutRecord',
    construct: 'interface',
    file: 'src/session/transcript.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'a type symbol that lives in the transcript module; the node is the symbol, the file is its location',
    symbol: 'CodexRolloutRecord',
    detail: {
      kind: 'type',
      properties: [
        { name: 'type', type: 'string' },
        { name: 'id', type: 'string' },
      ],
      usedBy: [{ nodeId: 'u1', name: 'isCodexRolloutRecord', context: 'type' }],
      implementors: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'detail-external',
    // name = the package's name after the namespace; namespace shown above.
    name: 'principal-studio',
    construct: 'external',
    file: '',
    purl: 'pkg:npm/@principal-ai/subsystems-studio',
    purpose: 'an npm package consumer — the whole package as a node',
    symbol: '',
    detail: {
      kind: 'external',
      label: 'pkg:npm/@principal-ai/subsystems-studio',
    } satisfies GraphifyComponentDetail,
  },
];

const detailKindEdges: SubsystemComponentEdge[] = [];

function DetailKindsDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={detailKindComponents}
        edges={detailKindEdges}
        onSelect={(id) => setSelected(id)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        {selected ? `selected: ${selected}` : 'click a component to see its GraphifyComponentDetail'}
      </div>
    </div>
  );
}

export const DetailKinds: Story = {
  render: () => <DetailKindsDemo />,
};

// ---------------------------------------------------------------------------
// Declaration line open — Pierre snippet/file views + declarationRef.
// Click the ComponentDeclaration node → toggle file → click path or L251.
// ---------------------------------------------------------------------------
const storyFileContents: Record<string, string> = {
  'packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx': componentDeclarationSource,
  'packages/subsystems-react/src/graphify/resolve.ts': resolveSource,
};

const declarationOpenComponents: SubsystemComponent[] = [
  {
    id: 'detail',
    name: 'ComponentDeclaration',
    construct: 'module',
    file: 'packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx',
    purl: 'pkg:github/principal-ai/principal-view-core-library',
    purpose: 'declaration panel — click file or L251 to open the drawer at the export line',
    symbol: 'ComponentDeclaration',
    declarationRef: {
      file: 'packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx',
      startLine: 251,
      lineHash: 'storybook-placeholder',
      capturedAt: new Date(0).toISOString(),
    },
  },
  {
    id: 'resolver',
    name: 'resolve.ts',
    construct: 'module',
    file: 'packages/subsystems-react/src/graphify/resolve.ts',
    purl: 'pkg:github/principal-ai/principal-view-core-library',
    purpose: 'graphify type-ref resolver (second file for tree navigation)',
    symbol: 'resolveGraphifyTypeRef',
    declarationRef: {
      file: 'packages/subsystems-react/src/graphify/resolve.ts',
      startLine: 1,
      lineHash: 'storybook-placeholder',
      capturedAt: new Date(0).toISOString(),
    },
  },
];

function readStoryFile(path: string): Promise<string> {
  const content = storyFileContents[path];
  if (content == null) {
    return Promise.reject(new Error(`No story fixture for ${path}`));
  }
  return Promise.resolve(content);
}

function DeclarationLineOpenDemo() {
  const renderFileViewer = (file: string, opts?: SubsystemOpenFileOptions) => {
    const startLine = opts?.startLine;
    if (startLine != null) {
      return (
        <PierreSnippetView
          filePath={file}
          fileName={file.split('/').pop() ?? file}
          startLine={startLine}
          endLine={startLine}
          focusLine={startLine}
          contextLines={40}
          readFile={readStoryFile}
        />
      );
    }
    return (
      <PierreFileView
        filePath={file}
        fileName={file.split('/').pop() ?? file}
        readFile={readStoryFile}
      />
    );
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        title="Declaration line open (Storybook)"
        description="Uses bundled ?raw fixtures + PierreSnippetView from this package. Select ComponentDeclaration, toggle file, click the path or L251."
        components={declarationOpenComponents}
        edges={[]}
        renderFileViewer={renderFileViewer}
      />
    </div>
  );
}

export const DeclarationLineOpen: Story = {
  render: () => <DeclarationLineOpenDemo />,
};
