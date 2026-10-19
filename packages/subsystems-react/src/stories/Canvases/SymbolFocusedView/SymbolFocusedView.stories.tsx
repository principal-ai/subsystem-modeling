/**
 * Symbol-focused view — one graphify symbol at the center plus its real
 * connections, drawn on the shared subsystem canvas.
 *
 * The center + neighbors come from
 * `graphify/__fixtures__/symbol-focused-samples.json` (extracted from this
 * repo's cached graph). The stories only supply the focal node and its
 * neighborhood; `SymbolFocusedView` projects them onto component-graph inputs
 * and keeps the raw graphify verbs, so relations draw from the separate
 * `GRAPHIFY_RELATION_COLOR` palette — visually distinct from authored
 * subsystem mechanisms.
 */
import React from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SymbolFocusedView } from '../../../subsystem/SymbolFocusedView';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { GraphifyEdge, GraphifyNode } from '../../../graphify';
import type {
  SubsystemComponent,
  SubsystemComponentConstruct,
} from '../../../subsystem/model';
import symbolSamples from '../../../graphify/__fixtures__/symbol-focused-samples.json';

const meta = {
  title: 'Canvases/SymbolFocusedView',
  component: SymbolFocusedView,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof SymbolFocusedView>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Fixture shape
// ---------------------------------------------------------------------------

type FixtureCategory = {
  center?: GraphifyNode;
  degree?: number;
  neighborCount?: number;
  neighbors?: GraphifyNode[];
  edges?: GraphifyEdge[];
};

type Category = 'class' | 'function' | 'method' | 'type' | 'module';

const categories = symbolSamples.categories as unknown as Record<Category, FixtureCategory>;
const authoredCategories = symbolSamples.authoredCategories as unknown as Record<
  string,
  { component: SubsystemComponent }
>;

const REPO_PURL = 'pkg:github/principal-ai/subsystem-modeling';

/**
 * Constructs graphify's structural inference cannot resolve. Inference reads
 * labels and incident edges only, so a bare type node with no `implements`
 * edge comes back `unknown`; the fixture knows better.
 */
const CENTER_CONSTRUCT_OVERRIDE: Partial<Record<Category, SubsystemComponentConstruct>> = {
  type: 'interface',
};

function SymbolFocusDemo({
  category,
  orderByLine,
}: {
  category: Category;
  orderByLine: boolean;
}) {
  const cat = categories[category];
  if (!cat.center) return null;
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SymbolFocusedView
        center={cat.center}
        neighbors={cat.neighbors ?? []}
        edges={cat.edges ?? []}
        repoPurl={REPO_PURL}
        centerConstruct={CENTER_CONSTRUCT_OVERRIDE[category]}
        orderByLine={orderByLine}
        showSingletonFrames
        showEdgeLabels
        title={`Symbol focused view — ${category}`}
        description={`graphify center ${cat.center.label} · ${cat.degree ?? 0} edges · ${cat.neighborCount ?? 0} neighbors${orderByLine ? ' · ordered by call-site line' : ''}`}
      />
    </div>
  );
}

/** Everything on disk for the center: node + neighbor nodes + raw edges. */
function RawDump({ category }: { category: Category }) {
  const cat = categories[category];
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        fontSize: 12,
        lineHeight: 1.5,
        fontFamily: 'monospace',
        color: '#ddd',
        background: '#111',
        height: '100vh',
        overflow: 'auto',
        boxSizing: 'border-box',
      }}
    >
      {JSON.stringify({ category, ...cat }, null, 2)}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Stories — one per graphify node category
// ---------------------------------------------------------------------------

export const Class: Story = { render: () => <SymbolFocusDemo category="class" orderByLine /> };
export const Function: Story = { render: () => <SymbolFocusDemo category="function" orderByLine /> };
export const Method: Story = { render: () => <SymbolFocusDemo category="method" orderByLine /> };
export const Type: Story = { render: () => <SymbolFocusDemo category="type" orderByLine /> };
export const Module: Story = { render: () => <SymbolFocusDemo category="module" orderByLine /> };

/** Same centers, ELK's default ordering — compare against the line-ordered set. */
export const MethodReorderOff: Story = {
  render: () => <SymbolFocusDemo category="method" orderByLine={false} />,
};

/** The raw extracted data behind each center — no rendering involved. */
export const Raw: Story = { render: () => <RawDump category="class" /> };

// ---------------------------------------------------------------------------
// Authored-only constructs (no graphify node) pulled from the model store
// ---------------------------------------------------------------------------

const authoredComponents: SubsystemComponent[] = [
  authoredCategories.store?.component,
  authoredCategories.external?.component,
  authoredCategories.custom_entity?.component,
].filter(Boolean) as SubsystemComponent[];

/** store / external / custom_entity — authored nodes, no graphify anchor. */
export const AuthoredConstructs: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={authoredComponents}
        title="Authored-only constructs"
        description="store / external / custom_entity — reused cast from stored subsystem models (no graphify node, no edges)."
      />
    </div>
  ),
};
