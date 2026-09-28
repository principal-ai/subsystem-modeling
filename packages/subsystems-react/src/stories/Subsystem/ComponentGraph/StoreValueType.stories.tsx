import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { ThemeProvider, defaultEditorTheme, useTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentNode } from '../../../subsystem/nodes';
import type { GraphifyComponentDetail } from '../../../graphify';
import type { SubsystemComponent, SubsystemGraphNode } from '../../../subsystem/model';

/**
 * StoreValueType — proposal sketch (not wired yet).
 *
 * A store is a state declaration, so it should name and type itself like every
 * other declaration. `SubsystemStoreDeclaration` has no field for a store's value
 * type today; the value type lives in the **declaration panel** (see the
 * `Subsystem/StoreValueTypeDeclaration` story), shown when the node is clicked —
 * NOT as a node subtitle.
 *
 *   title    = the state declaration's name (the variable name) — already shipped
 *   badge    = storage backing (memory / disk / db) — already shipped
 *   valueType = declaration panel only (no node channel)
 *
 * Cases also contrast what a wrong anchor renders: a store whose anchor is the
 * accessor shows the accessor's name instead of the state's.
 */
const meta = {
  title: 'Subsystem/ComponentGraph/StoreValueType',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <ReactFlowProvider>
          <Story />
        </ReactFlowProvider>
      </ThemeProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PURL = 'pkg:github/principal-ai/subsystem-modeling';
const NODE_W = 230;
const NODE_H = 92;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * A store component with the *proposed* `valueType` field. The field is not in
 * the schema yet, so it is carried here as `declaration.valueType` (the shape we
 * intend to land) and read directly by this story graph.
 */
type ProposedStoreComponent = SubsystemComponent & {
  declaration: GraphifyComponentDetail & { valueType?: string };
};

function nodeProps(
  component: SubsystemComponent,
  opts?: { selected?: boolean; width?: number; height?: number },
): NodeProps<SubsystemGraphNode> {
  return {
    data: { component },
    selected: opts?.selected ?? false,
    width: opts?.width ?? NODE_W,
    height: opts?.height ?? NODE_H,
  } as unknown as NodeProps<SubsystemGraphNode>;
}

// ---------------------------------------------------------------------------
// Fixtures — the 23-store audit shapes, rendered with the proposed channels.
// ---------------------------------------------------------------------------

const CASES: Array<{ label: string; note: string; component: ProposedStoreComponent }> = [
  {
    label: 'memory · declares its value type',
    note: 'title = state name · subtitle = value type · badge = memory.',
    component: {
      alias: 'feeds',
      name: 'feeds',
      construct: 'store',
      file: 'packages/subsystems-studio/src/bun/opencode-v2-live.ts',
      purl: PURL,
      symbol: 'feeds',
      declaration: {
        kind: 'store',
        storage: 'memory',
        properties: [],
        valueType: 'Map<string, OpencodeLiveFeedState>',
      } as GraphifyComponentDetail & { valueType: string },
    },
  },
  {
    label: 'memory · closure-local (no addressable symbol)',
    note: 'state is a factory-local Map; anchor is non-exact → agent-confirmed store.',
    component: {
      alias: 'landed',
      name: 'landed',
      construct: 'store',
      file: 'packages/subsystems-studio/src/bun/maintainer-probe.ts',
      purl: PURL,
      symbol: 'landed',
      declaration: {
        kind: 'store',
        storage: 'memory',
        properties: [],
        valueType: 'Map<string, number>',
      } as GraphifyComponentDetail & { valueType: string },
    },
  },
  {
    label: 'memory · no value type (the gap)',
    note: 'subtitle shows a muted `type: ?` — the completeness finding made visible.',
    component: {
      alias: 'tabs',
      name: 'tabs',
      construct: 'store',
      file: 'packages/subsystems-studio/src/bun/index.ts',
      purl: PURL,
      symbol: 'tabs',
      declaration: {
        kind: 'store',
        storage: 'memory',
        properties: [],
      } as GraphifyComponentDetail,
    },
  },
  {
    label: 'disk · value type',
    note: 'run log on the filesystem — badge reads `disk`.',
    component: {
      alias: 'runs',
      name: 'runs',
      construct: 'store',
      file: 'packages/subsystems-studio/src/bun/subsystem-model-runs.ts',
      purl: PURL,
      symbol: 'runs',
      declaration: {
        kind: 'store',
        storage: 'disk',
        properties: [],
        valueType: 'SubsystemModelRun[]',
      } as GraphifyComponentDetail & { valueType: string },
    },
  },
  {
    label: 'db · row / members shape',
    note: 'table name as title; value type is the row shape (members[]).',
    component: {
      alias: 'session_v2',
      name: 'session_v2',
      construct: 'store',
      file: 'packages/subsystems-studio/src/bun/maintain-sessions.ts',
      purl: PURL,
      symbol: 'session_v2',
      declaration: {
        kind: 'store',
        storage: 'external',
        properties: [
          { name: 'id', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'agent', type: 'text' },
          { name: 'time_created', type: 'integer' },
        ],
      } as GraphifyComponentDetail,
    },
  },
];

/**
 * Renders the component node as it should appear: title = the state
 * declaration's name, badge = storage backing. The value type is intentionally
 * NOT shown here — it belongs to the declaration panel (see
 * `Subsystem/StoreValueTypeDeclaration`), shown when the node is clicked.
 */
function StoreNode({ component }: { component: ProposedStoreComponent }) {
  return (
    <div style={{ position: 'relative', width: NODE_W, height: NODE_H }}>
      <SubsystemComponentNode {...nodeProps(component)} />
    </div>
  );
}

function Cell({
  label,
  note,
  component,
}: {
  label: string;
  note: string;
  component: ProposedStoreComponent;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const valueType = component.declaration?.valueType;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: muted }}>{label}</div>
      <div style={{ position: 'relative', width: NODE_W, height: NODE_H, margin: '14px 0 16px' }}>
        <StoreNode component={component} />
      </div>
      <div style={{ fontSize: 10, fontFamily: MONO, color: muted, lineHeight: 1.5 }}>
        {note}
        <br />
        panel: {valueType ?? '(no value type — gap)'}
      </div>
    </div>
  );
}

/** Store nodes: title = state name, badge = storage. Value type lives in the panel. */
export const StoreValueType: Story = {
  render: () => (
    <div style={{ padding: 32, minHeight: '100vh', boxSizing: 'border-box' }}>
      <Header
        title="Store nodes"
        lines={[
          'A store is a state declaration, so its node names it: title = the state declaration (the variable name). The storage badge (memory / disk / db) shows how it persists.',
          'The value type is not a node channel — it belongs to the declaration panel, shown when the node is clicked (see Subsystem/StoreValueTypeDeclaration).',
          'The caption under each node shows what the declaration panel renders for it.',
        ]}
      />
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '40px 28px',
          alignItems: 'flex-start',
          marginTop: 28,
        }}
      >
        {CASES.map((c) => (
          <Cell key={c.component.alias} label={c.label} note={c.note} component={c.component} />
        ))}
      </div>
    </div>
  ),
};

function Header({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <div
        style={{
          fontSize: 12,
          fontFamily: MONO,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: '#a0a0a0',
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: '#b0b0b0' }}>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
