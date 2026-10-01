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
      alias: 'fn-void',
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
      alias: 'fn-one',
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
      alias: 'fn-two',
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
      alias: 'fn-rich',
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
      alias: 'class-empty',
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
      alias: 'class-props',
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
      alias: 'class-rich',
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
      alias: 'type-props',
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
      alias: 'type-empty',
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
    label: 'external',
    component: {
      alias: 'ext',
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
      alias: 'fn-no-symbol',
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
      alias: 'method-normalize',
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
      alias: 'method-dispose',
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

// ---------------------------------------------------------------------------
// Augmentation-sourced declaration — a component whose signature is confirmed
// by an accepted graphify augmentation rather than its own `declaration`.
// `ComponentDeclaration` renders the augmented signature as the declaration,
// indistinguishable from an authored one. The readout under each label shows
// the augmentation claim feeding it.
// ---------------------------------------------------------------------------

const augmentationCases: { label: string; component: SubsystemComponent }[] = [
  {
    label: 'augmented — no own declaration (bare signature today)',
    component: {
      alias: 'aug-bare',
      name: 'TrailsPanel',
      construct: 'function',
      file: 'packages/subsystems-react/src/subsystem/TrailsPanel.tsx',
      purl: 'pkg:github/principal-ai/subsystem-modeling',
      symbol: 'TrailsPanel',
      signatureAugmentation: {
        parameters: [{ type: 'TrailsPanelProps' }],
        returnType: 'JSX.Element',
      },
    },
  },
  {
    label: 'augmented — alongside an authored declaration',
    component: {
      alias: 'aug-with-decl',
      name: 'emitSubsystemModelChange',
      construct: 'function',
      file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
      purl: 'pkg:github/principal-ai/subsystem-modeling',
      symbol: 'emitSubsystemModelChange',
      declaration: {
        kind: 'function',
        parameters: [{ name: 'change', type: 'SubsystemModelChange' }],
        returnType: 'void',
      } satisfies GraphifyComponentDetail,
      signatureAugmentation: {
        parameters: [{ name: 'change', type: 'SubsystemModelChange' }],
        returnType: 'void',
      },
    },
  },
  {
    label: 'baseline — no augmentation',
    component: {
      alias: 'no-aug',
      name: 'reorderTrails',
      construct: 'function',
      file: 'packages/subsystems-react/src/subsystem/model.ts',
      purl: 'pkg:github/principal-ai/subsystem-modeling',
      symbol: 'reorderTrails',
      declaration: {
        kind: 'function',
        parameters: [{ name: 'trails', type: 'SubsystemTrail[]' }],
        returnType: 'SubsystemTrail[]',
      } satisfies GraphifyComponentDetail,
    },
  },
];

export const AugmentedSignature: StoryObj<{ constrained: boolean }> = {
  render: ({ constrained }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {augmentationCases.map((c) => {
        const aug = c.component.signatureAugmentation;
        const params = (aug?.parameters ?? [])
          .map((p) => (p.name ? `${p.name}: ${p.type}` : p.type))
          .join(', ');
        const claim = aug
          ? `(${params})${aug.returnType ? `: ${aug.returnType}` : ''}`
          : '—';
        return (
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
            <div
              data-augmentation-claim
              style={{
                fontFamily: 'monospace',
                fontSize: 11,
                color: aug ? '#6a9955' : '#888',
                marginBottom: 6,
              }}
            >
              {`augmentation: ${claim}`}
            </div>
            <ComponentDeclaration
              component={c.component}
              maxWidth={constrained ? '80ch' : undefined}
            />
          </div>
        );
      })}
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Prettier fallback — when formatting throws (Electrobun's bundled Prettier
// does), the declaration is tokenized unformatted as one long line. This story
// reproduces that path deterministically: an unparseable parameter type makes
// Prettier throw, so `tokenizeComponent` falls back to the raw string. The
// panel must wrap at spaces, never break a token mid-word (`func` / `c`).
// ---------------------------------------------------------------------------

const fallbackCases: { label: string; component: SubsystemComponent }[] = [
  {
    label: 'formatted — long signature (Prettier wraps at printWidth)',
    component: {
      alias: 'fallback-formatted',
      name: 'mergeSessions',
      construct: 'function',
      file: 'src/session/merge.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'mergeSessions',
      declaration: {
        kind: 'function',
        parameters: [
          { name: 'sessions', type: 'SessionRecord[]' },
          { name: 'options', type: 'MergeOptions' },
          { name: 'onConflict', type: '((a: SessionRecord, b: SessionRecord) => SessionRecord)' },
        ],
        returnType: 'Promise<Map<string, SessionEvent[]>>',
        callers: [],
        callees: [],
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'fallback — unformatted single line (Prettier throws on `Array<`)',
    component: {
      alias: 'fallback-raw',
      name: 'mergeSessions',
      construct: 'function',
      file: 'src/session/merge.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'mergeSessions',
      declaration: {
        kind: 'function',
        parameters: [
          { name: 'sessions', type: 'SessionRecord[]' },
          { name: 'options', type: 'MergeOptions' },
          { name: 'onConflict', type: 'Array<' },
        ],
        returnType: 'Promise<Map<string, SessionEvent[]>>',
        callers: [],
        callees: [],
      } satisfies GraphifyComponentDetail,
    },
  },
  {
    label: 'non-JS/TS (python) — Prettier skipped, python grammar',
    component: {
      alias: 'fallback-python',
      name: 'deduplicate_entities',
      construct: 'function',
      file: 'graphify/dedup.py',
      purl: 'pkg:github/graphify-labs/graphify#graphify/dedup.py',
      symbol: 'deduplicate_entities',
      declaration: {
        kind: 'function',
        parameters: [
          { name: 'graph', type: 'nx.MultiDiGraph' },
          { name: 'keep', type: 'bool' },
        ],
        returnType: 'list[tuple[str, object]]',
        callers: [],
        callees: [],
      } satisfies GraphifyComponentDetail,
    },
  },
];

export const UnformattedFallback: StoryObj<{ constrained: boolean }> = {
  render: ({ constrained }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {fallbackCases.map((c) => (
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
          <ComponentDeclaration
            component={c.component}
            maxWidth={constrained ? '80ch' : undefined}
          />
        </div>
      ))}
    </div>
  ),
};
