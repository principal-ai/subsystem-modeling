import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { ComponentDeclaration } from '../../subsystem/ComponentDeclaration';
import type { SubsystemComponent } from '../../subsystem/model';
import type { GraphifyComponentDetail } from '../../graphify';
import type { SymbolInspection } from '../../subsystem/symbolRefs';

const meta = {
  title: 'Subsystem/ComponentDeclarationSymbols',
  component: ComponentDeclaration,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ maxWidth: '80ch', margin: '0 auto' }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ComponentDeclaration>;
export default meta;

// ---------------------------------------------------------------------------
// Fixture graphify lookups — one per information level. Names absent from the
// map resolve as `missing`, mirroring "nothing in the cached graph".
// ---------------------------------------------------------------------------

const INSPECTIONS: Record<string, SymbolInspection> = {
  RawEvent: {
    symbol: 'RawEvent',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    resolution: 'resolved',
    node: {
      nodeId: 'eventprocessing_types_rawevent',
      label: 'RawEvent',
      sourceFile: 'src/event-processing/types.ts',
      sourceLocation: 'L8',
    },
    declaration: {
      kind: 'type',
      properties: [
        { name: 'id', type: 'string' },
        { name: 'at', type: 'number' },
        { name: 'payload', type: 'unknown' },
      ],
      usedBy: [],
      implementors: [],
    },
  },
  BaseProcessor: {
    symbol: 'BaseProcessor',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    resolution: 'resolved',
    node: {
      nodeId: 'eventprocessing_baseprocessor_baseprocessor',
      label: 'BaseProcessor',
      sourceFile: 'src/event-processing/BaseProcessor.ts',
      sourceLocation: 'L3',
    },
    declaration: {
      kind: 'class',
      methods: [{ nodeId: 'm-run', name: 'run', parameters: [], returnType: 'void' }],
      properties: [],
      extends: [],
      implements: [],
      instantiations: [],
      references: [],
    },
  },
  // Limited: graphify resolved the location but couldn't reconstruct the
  // shape — the card falls back to the source declaration, still offering
  // "Add to references" because the model has no structured declaration.
  ProcessingOptions: {
    symbol: 'ProcessingOptions',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    resolution: 'resolved',
    node: {
      nodeId: 'eventprocessing_types_processingoptions',
      label: 'ProcessingOptions',
      sourceFile: 'src/event-processing/types.ts',
      sourceLocation: 'L21',
    },
    source: {
      file: 'src/event-processing/types.ts',
      startLine: 21,
      text: 'interface ProcessingOptions {\n  retries: number;\n  timeoutMs: number;\n}',
    },
  },
  // Limited: multiple same-label definitions.
  ProcessedEvent: {
    symbol: 'ProcessedEvent',
    resolution: 'ambiguous',
    candidates: [
      { nodeId: 'a1', label: 'ProcessedEvent', sourceFile: 'src/event-processing/types.ts' },
      { nodeId: 'a2', label: 'ProcessedEvent', sourceFile: 'src/legacy/types.ts' },
    ],
  },
  // Limited: referenced but not defined in this corpus (external/ambient type).
  Disposable: {
    symbol: 'Disposable',
    resolution: 'unresolved',
    reason: 'referenced but not defined in this corpus',
  },
  // Limited: nothing in the corpus.
  EventEmitterLike: {
    symbol: 'EventEmitterLike',
    resolution: 'missing',
    reason: 'no matching definition in the cached graph',
  },
  SessionRecord: {
    symbol: 'SessionRecord',
    resolution: 'resolved',
    node: {
      nodeId: 'session_transcript_sessionrecord',
      label: 'SessionRecord',
      sourceFile: 'src/session/transcript.ts',
      sourceLocation: 'L12',
    },
    declaration: {
      kind: 'type',
      properties: [
        { name: 'id', type: 'string' },
        { name: 'admittedSeq', type: 'number' },
        { name: 'events', type: 'SessionEvent[]' },
      ],
      usedBy: [],
      implementors: [],
    },
  },
  'capture-session': {
    symbol: 'capture-session',
    resolution: 'resolved',
    node: {
      nodeId: 'session_capture_capture_session',
      label: 'capture-session()',
      sourceFile: 'src/session/capture.ts',
      sourceLocation: 'L40',
    },
    declaration: {
      kind: 'function',
      parameters: [{ name: 'session', type: 'SessionRecord' }],
      returnType: 'Promise<void>',
      callers: [],
      callees: [],
    },
  },
};

const inspect = (symbol: string): Promise<SymbolInspection> =>
  new Promise((resolve) =>
    setTimeout(
      () =>
        resolve(
          INSPECTIONS[symbol] ?? {
            symbol,
            resolution: 'missing',
            reason: 'no matching definition in the cached graph',
          },
        ),
      220,
    ),
  );

function Harness({ component }: { component: SubsystemComponent }) {
  const [log, setLog] = useState<string[]>([]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#888' }}>
        Click a dotted-underlined symbol to inspect what graphify has on it.
      </div>
      <ComponentDeclaration
        component={component}
        onInspectSymbol={inspect}
        onAddToModel={(ref, info) =>
          setLog((l) => [`add ${ref.name} (${info?.resolution ?? 'no info'})`, ...l])
        }
        onOpenFile={(file, opts) =>
          setLog((l) => [
            `open ${file}${opts?.startLine ? `:${opts.startLine}` : ''}`,
            ...l,
          ])
        }
      />
      <div
        data-symbol-action-log
        style={{ fontFamily: 'monospace', fontSize: 11, color: '#6a9955', minHeight: 16 }}
      >
        {log.length ? `actions: ${log.join(' · ')}` : 'actions: —'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A class whose declaration references a range of symbols — resolved
// (type/class), thin (unknown construct → "Add to references"), ambiguous,
// unresolved, and missing.
// ---------------------------------------------------------------------------

const classComponent: SubsystemComponent = {
  alias: 'class-event-processor',
  name: 'EventProcessor',
  construct: 'class',
  file: 'src/event-processing/EventProcessor.ts',
  purl: 'pkg:github/principal-ai/agent-monitoring',
  symbol: 'EventProcessor',
  purpose: 'Consumes raw events and emits processed ones.',
  declaration: {
    kind: 'class',
    methods: [
      {
        nodeId: 'm-process',
        name: 'process',
        parameters: [
          { name: 'event', type: 'RawEvent' },
          { name: 'options', type: 'ProcessingOptions' },
        ],
        returnType: 'ProcessedEvent',
      },
      {
        nodeId: 'm-batch',
        name: 'batch',
        parameters: [{ name: 'events', type: 'RawEvent[]' }],
        returnType: 'Promise<ProcessedEvent[]>',
      },
      { nodeId: 'm-dispose', name: 'dispose' },
    ],
    properties: [
      { name: 'queue', type: 'RawEvent[]' },
      { name: 'options', type: 'Required<ProcessingOptions>' },
    ],
    extends: ['BaseProcessor'],
    implements: ['Disposable', 'EventEmitterLike'],
    instantiations: [],
    references: [{ nodeId: 'n-emitter', name: 'EventEmitterLike', context: 'type' }],
  } satisfies GraphifyComponentDetail,
};

export const InspectableSymbols: StoryObj<Record<string, never>> = {
  render: () => <Harness component={classComponent} />,
};

// ---------------------------------------------------------------------------
// A function — callers/callees are clickable too, alongside param/return types.
// ---------------------------------------------------------------------------

const functionComponent: SubsystemComponent = {
  alias: 'fn-normalize',
  name: 'normalize',
  construct: 'function',
  file: 'src/session/SessionReader.ts',
  purl: 'pkg:github/principal-ai/agent-monitoring',
  symbol: 'SessionReader.normalize',
  declaration: {
    kind: 'function',
    parameters: [{ name: 'session', type: 'SessionRecord' }],
    returnType: 'SessionEvent[]',
    callers: [{ nodeId: 'c1', name: 'capture-session', source_location: 'L120' }],
    callees: [{ nodeId: 'c2', name: 'toUniversalEvents', source_location: 'L64' }],
  } satisfies GraphifyComponentDetail,
};

export const CallableRelated: StoryObj<Record<string, never>> = {
  render: () => <Harness component={functionComponent} />,
};
