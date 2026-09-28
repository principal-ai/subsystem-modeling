import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { generateDeclarationString } from '../../subsystem/formatDeclaration';
import type { SubsystemComponent } from '../../subsystem/model';

/**
 * StoreValueType — how a store's declared value type renders in the
 * **declaration panel** (the click panel), not on the node.
 *
 * A store is a state declaration, so it declares its type the way every other
 * declaration does: `declaration.valueType` (`Map<string, FeedState>` for a state
 * block, a row type for a table), orthogonal to `declaration.storage`. The
 * rendered string comes from the real `generateStore` in
 * `formatDeclaration.ts` — not a sketch.
 *
 * The node itself is unchanged: title = the state declaration's name, badge =
 * storage backing. The value type is panel-only.
 */
const meta = {
  title: 'Subsystem/StoreValueTypeDeclaration',
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
} satisfies Meta;
export default meta;

type Case = {
  label: string;
  note: string;
  component: SubsystemComponent;
};

const CASES: Case[] = [
  {
    label: 'memory · value type, no named members',
    note: 'The store declares what it holds; nothing else to render.',
    component: {
      id: 'feeds',
      name: 'feeds',
      construct: 'store',
      symbol: 'feeds',
      file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
      purl: 'pkg:github/principal-ai/subsystem-modeling',
      declaration: {
        kind: 'store',
        storage: 'memory',
        properties: [],
        valueType: 'Map<string, OpencodeLiveFeedState>',
      },
    },
  },
  {
    label: 'memory · closure-local state',
    note: 'State created inside a factory, reached through an accessor. Still a declaration.',
    component: {
      id: 'landed',
      name: 'landed',
      construct: 'store',
      symbol: 'landed',
      file: 'packages/subsystems-studio/src/bun/maintainer-probe.ts',
      purl: 'pkg:github/principal-ai/subsystem-modeling',
      declaration: {
        kind: 'store',
        storage: 'memory',
        properties: [],
        valueType: 'Map<string, number>',
      },
    },
  },
  {
    label: 'disk · value type + named members',
    note: 'Members render as a typed body under the value type.',
    component: {
      id: 'runs',
      name: 'runs',
      construct: 'store',
      symbol: 'runs',
      file: 'packages/subsystems-studio/src/bun/subsystem-model-runs.ts',
      purl: 'pkg:github/principal-ai/subsystem-modeling',
      declaration: {
        kind: 'store',
        storage: 'disk',
        valueType: 'SubsystemModelRun[]',
        properties: [{ name: 'runs', type: 'SubsystemModelRun[]' }],
      },
    },
  },
  {
    label: 'memory · no value type → the gap',
    note: 'Says so explicitly — the completeness finding reads this back.',
    component: {
      id: 'tabs',
      name: 'tabs',
      construct: 'store',
      symbol: 'tabs',
      file: 'packages/subsystems-studio/src/bun/index.ts',
      purl: 'pkg:github/principal-ai/subsystem-modeling',
      declaration: { kind: 'store', storage: 'memory', properties: [] },
    },
  },
  {
    label: 'db · row shape, no scalar value type',
    note: 'A table names its row/record type; columns stay as members.',
    component: {
      id: 'session_v2',
      name: 'session_v2',
      construct: 'store',
      symbol: 'session_v2',
      file: 'packages/subsystems-studio/src/bun/maintain-sessions.ts',
      purl: 'pkg:github/principal-ai/subsystem-modeling',
      declaration: {
        kind: 'store',
        storage: 'external',
        properties: [
          { name: 'id', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'agent', type: 'text' },
          { name: 'time_created', type: 'integer' },
        ],
      },
    },
  },
];

function Panel({ component }: { component: SubsystemComponent }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: '10px 12px',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        lineHeight: 1.5,
        color: '#e5e7eb',
        whiteSpace: 'pre-wrap',
        overflowX: 'auto',
      }}
    >
      {generateDeclarationString(component)}
    </pre>
  );
}

export const StoreDeclaration: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div style={{ fontSize: 12, color: '#b0b0b0', lineHeight: 1.7 }}>
        <strong>Rendered by the real <code>generateStore</code>.</strong> A store declares
        its type the way every other declaration does — <code>declaration.valueType</code> —
        and the value type is panel-only, not a node channel. The node stays{' '}
        <code>name → title</code>, <code>storage → badge</code>.
      </div>
      {CASES.map((c) => (
        <div key={c.component.id}>
          <div
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              color: '#f3f4f6',
              marginBottom: 6,
            }}
          >
            {c.label}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>{c.note}</div>
          <Panel component={c.component} />
        </div>
      ))}
    </div>
  ),
};
