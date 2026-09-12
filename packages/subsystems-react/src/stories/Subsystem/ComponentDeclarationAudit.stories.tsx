import React from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { ComponentDeclaration } from '../../subsystem/ComponentDeclaration';
import type { SubsystemComponent } from '../../subsystem/model';
import type { GraphifyComponentDetail } from '../../graphify';

const meta = {
  title: 'Subsystem/ComponentDeclarationAudit',
  component: ComponentDeclaration,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  argTypes: {
    constrained: { control: 'boolean', description: 'Toggle 80ch max-width wrapping' },
  },
  args: {
    constrained: true,
  },
  decorators: [
    (Story, ctx) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ maxWidth: ctx.args.constrained ? '80ch' : 'none', margin: '0 auto' }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ComponentDeclaration>;
export default meta;

// ---------------------------------------------------------------------------
// All cases — one SubsystemComponent per shape, rendered stacked
// ---------------------------------------------------------------------------

const cases: { label: string; component: SubsystemComponent }[] = [
  {
    label: 'function — no params',
    component: {
      id: 'fn-void',
      name: 'flush',
      construct: 'function',
      file: 'src/event-processing/sink.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'flush',
      declaration: {
        kind: 'function',
        parameters: [],
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'function — single param',
    component: {
      id: 'fn-one',
      name: 'normalize',
      construct: 'function',
      file: 'src/session/SessionReader.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'SessionReader.normalize',
      declaration: {
        kind: 'function',
        parameters: [{ name: 'session', type: 'SessionRecord' }],
        returnType: 'SessionEvent[]',
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'function — two params',
    component: {
      id: 'fn-two',
      name: 'normalizeSession',
      construct: 'function',
      file: 'src/event-processing/normalize.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'normalizeSession',
      declaration: {
        kind: 'function',
        parameters: [
          { name: 'session', type: 'SessionRecord' },
          { name: 'limit', type: 'number' },
        ],
        returnType: 'SessionEvent[]',
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'function — rich params (positional, union, callback, generic return)',
    component: {
      id: 'fn-rich',
      name: 'mergeSessions',
      construct: 'function',
      file: 'src/session/merge.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'mergeSessions',
      declaration: {
        kind: 'function',
        parameters: [
          { name: 'sessions', type: 'SessionRecord[]' },
          { type: 'MergeOptions' },
          { name: 'strategy', type: "'append' | 'replace' | 'skip'" },
          { name: 'onConflict', type: '((a: SessionRecord, b: SessionRecord) => SessionRecord)' },
        ],
        returnType: 'Promise<Map<string, SessionEvent[]>>',
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'class — no body',
    component: {
      id: 'class-empty',
      name: 'EmptyClass',
      construct: 'class',
      file: 'src/empty.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'EmptyClass',
      declaration: {
        kind: 'class',
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'class — properties only',
    component: {
      id: 'class-props',
      name: 'Config',
      construct: 'class',
      file: 'src/config.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'Config',
      declaration: {
        kind: 'class',
        properties: [
          { name: 'host', type: 'string' },
          { name: 'port', type: 'number' },
          { name: 'tls', type: 'boolean' },
        ],
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'class — methods + properties + extends + implements',
    component: {
      id: 'class-rich',
      name: 'EventProcessor',
      construct: 'class',
      file: 'src/event-processing/EventProcessor.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'EventProcessor',
      declaration: {
        kind: 'class',
        methods: [
          { name: 'process', parameters: [{ type: 'RawEvent' }, { type: 'ProcessingOptions' }], returnType: 'ProcessedEvent' },
          { name: 'batch', parameters: [{ type: 'RawEvent[]' }], returnType: 'Promise<ProcessedEvent[]>' },
          { name: 'onError', parameters: [{ type: 'Error' }] },
          { name: 'dispose' },
        ],
        properties: [
          { name: 'queue', type: 'RawEvent[]' },
          { name: 'options', type: 'Required<ProcessingOptions>' },
          { name: 'retryLimit', type: 'number' },
        ],
        extends: ['BaseProcessor'],
        implements: ['Disposable', 'EventEmitterLike'],
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'type — properties',
    component: {
      id: 'type-props',
      name: 'SessionRecord',
      construct: 'interface',
      file: 'src/session/transcript.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'SessionRecord',
      declaration: {
        kind: 'type',
        properties: [
          { name: 'id', type: 'string' },
          { name: 'admittedSeq', type: 'number' },
        ],
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'type — no properties',
    component: {
      id: 'type-empty',
      name: 'BrandedId',
      construct: 'interface',
      file: 'src/types.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'BrandedId',
      declaration: {
        kind: 'type',
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'module — imports + exports',
    component: {
      id: 'mod-full',
      name: 'index',
      construct: 'module',
      file: 'src/index.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'index',
      declaration: {
        kind: 'module',
        imports: [
          { name: './session/SessionReader' },
          { name: './event-processing/EventProcessor' },
        ],
        exports: ['SessionReader', 'EventProcessor'],
        symbols: ['SessionReader', 'EventProcessor', 'normalizeSession'],
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'module — no detail (fallback)',
    component: {
      id: 'mod-plain',
      name: 'utils',
      construct: 'module',
      file: 'src/utils.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'utils',
    },
  },
  {
    label: 'external',
    component: {
      id: 'ext',
      name: 'principal-studio',
      construct: 'external',
      file: '',
      purl: 'pkg:npm/@principal-ai/subsystems-studio',
      symbol: '',
      declaration: {
        kind: 'external',
        label: 'pkg:npm/@principal-ai/subsystems-studio',
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'function — no symbol (uses name fallback)',
    component: {
      id: 'fn-no-symbol',
      name: 'anonymousHelper',
      construct: 'function',
      file: 'src/helpers.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      declaration: {
        kind: 'function',
        parameters: [{ name: 'input', type: 'string' }],
        returnType: 'void',
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'method — standalone from class',
    component: {
      id: 'method-normalize',
      name: 'normalize',
      construct: 'method',
      file: 'src/session/SessionReader.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'SessionReader.normalize',
      declaration: {
        kind: 'method',
        hostClass: 'SessionReader',
        parameters: [{ name: 'session', type: 'SessionRecord' }],
        returnType: 'SessionEvent[]',
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'method — no params',
    component: {
      id: 'method-dispose',
      name: 'dispose',
      construct: 'method',
      file: 'src/event-processing/EventProcessor.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'EventProcessor.dispose',
      declaration: {
        kind: 'method',
        hostClass: 'EventProcessor',
      } satisfies GraphifyComponentDetail,
    },
  },
];

// ---------------------------------------------------------------------------
// Story — all cases stacked
// ---------------------------------------------------------------------------

export const AllCases: StoryObj<{ constrained: boolean }> = {
  render: ({ constrained }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {cases.map((c) => (
        <div key={c.label}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#888',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {c.label}
          </div>
          <ComponentDeclaration component={c.component} maxWidth={constrained ? '80ch' : undefined} />
        </div>
      ))}
    </div>
  ),
};
