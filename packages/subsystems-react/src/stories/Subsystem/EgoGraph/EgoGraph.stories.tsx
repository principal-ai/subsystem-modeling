/**
 * Ego-graph prototype: reuse the subsystem component nodes to render one
 * graphify symbol at the center plus its real connections.
 *
 * The center + neighbors come from `graphify/__fixtures__/ego-samples.json`
 * (extracted from this repo's cached graph). Each graphify node is mapped onto
 * a `SubsystemComponent`; the graphify edges are passed through the dedicated
 * `graphifyRelations` input, so they render with the separate
 * `GRAPHIFY_RELATION_COLOR` palette — visually distinct from authored subsystem
 * mechanisms — and keep their raw verb as the label (no folding to
 * `references`).
 */
import React from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type {
  SubsystemComponent,
  SubsystemComponentConstruct,
  SubsystemGraphifyRelation,
} from '../../../subsystem/model';
import { inferConstructFromGraphify } from '../../../graphify';
import type { GraphifyEdge, GraphifyNode } from '../../../graphify';
import egoSamples from '../../../graphify/__fixtures__/ego-samples.json';

const meta = {
  title: 'Subsystem/EgoGraph',
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

// ---------------------------------------------------------------------------
// Fixture shape
// ---------------------------------------------------------------------------

type FixtureNode = {
  id: string;
  label: string;
  file_type?: string;
  source_file?: string;
  source_location?: string;
  type?: string;
};

type FixtureEdge = {
  source: string;
  target: string;
  relation: string;
  confidence?: string;
  context?: string;
  source_file?: string;
  source_location?: string;
};

type FixtureCategory = {
  center?: FixtureNode;
  degree?: number;
  neighborCount?: number;
  neighbors?: FixtureNode[];
  edges?: FixtureEdge[];
};

type Category = 'class' | 'function' | 'method' | 'type' | 'module';

const categories = egoSamples.categories as unknown as Record<Category, FixtureCategory>;
const authoredCategories = egoSamples.authoredCategories as unknown as Record<
  string,
  { component: SubsystemComponent }
>;

const REPO_PURL = 'pkg:github/principal-ai/subsystem-modeling';

// ---------------------------------------------------------------------------
// graphify -> subsystem mapping
// ---------------------------------------------------------------------------

/** The fixture center's category, expressed as a subsystem construct. */
const CENTER_CONSTRUCT: Record<Category, SubsystemComponentConstruct> = {
  class: 'class',
  function: 'function',
  method: 'method',
  type: 'interface',
  // Subsystem models draw files as module *frames*, not nodes — there is no
  // `module` construct. Stand in with `external` so the file node still draws.
  module: 'external',
};

/** Coarse graphify-inferred construct -> subsystem construct. */
const INFERRED_TO_CONSTRUCT: Record<string, SubsystemComponentConstruct> = {
  class: 'class',
  function: 'function',
  method: 'method',
  type: 'interface',
  module: 'external',
  unknown: 'external',
};

function parseLine(location?: string): number | undefined {
  const m = /^L(\d+)$/.exec(location ?? '');
  return m ? Number(m[1]) : undefined;
}

function purlFor(sourceFile?: string): string {
  return sourceFile ? `${REPO_PURL}#${sourceFile}` : REPO_PURL;
}

/**
 * Graphify labels carry their own decoration: functions end `name()`, methods
 * start `.name()`. A subsystem `symbol` is the bare code identity and the node
 * renderer re-derives the `()` / `.` decoration itself, so passing a decorated
 * label through would double it (`readFoo()()` → the name printed twice).
 * Strip the graphify decoration and hand back a clean symbol.
 */
function stripGraphifyDecoration(label: string): string {
  let s = label.trim();
  if (s.endsWith('()')) s = s.slice(0, -2);
  if (s.startsWith('.')) s = s.slice(1);
  return s;
}

function toComponent(
  alias: string,
  node: FixtureNode,
  construct: SubsystemComponentConstruct,
  purpose: string,
  lineOverride?: number,
): SubsystemComponent {
  const line = lineOverride ?? parseLine(node.source_location);
  const symbol = stripGraphifyDecoration(node.label);
  return {
    alias,
    name: symbol,
    construct,
    symbol,
    file: node.source_file ?? '',
    purl: purlFor(node.source_file),
    purpose,
    // `line` also seeds ELK's same-layer ordering (orderByLine).
    ...(line != null ? { line } : {}),
    ...(line != null
      ? {
          declarationRef: {
            file: node.source_file ?? '',
            startLine: line,
            lineHash: 'ego-fixture',
            capturedAt: new Date(0).toISOString(),
          },
        }
      : {}),
  };
}

interface EgoGraph {
  components: SubsystemComponent[];
  graphifyRelations: SubsystemGraphifyRelation[];
}

/** Turn one fixture category into a subsystem graph centered on its symbol. */
function toEgoGraph(cat: FixtureCategory, category: Category): EgoGraph {
  const center = cat.center;
  if (!center) return { components: [], graphifyRelations: [] };

  const edges = cat.edges ?? [];
  const neighbors = cat.neighbors ?? [];

  // graphify file nodes (`inferConstructFromGraphify` → 'module') are not
  // symbols — they are the CONTAINER of symbols. The center's own file becomes
  // a `module` boundary (a frame around its members) and its `contains` edges
  // are dropped: membership is expressed by the frame, exactly as an authored
  // model does it. Files reached as neighbors stay as nodes (they are external
  // to the center's file), so only the center's file is framed.
  const isFileNode = (n: FixtureNode): boolean =>
    inferConstructFromGraphify(
      n as unknown as GraphifyNode,
      edges as unknown as GraphifyEdge[],
    ).construct === 'module';

  const centerFile = center.source_file;
  const fileNodeIds = new Set(
    neighbors.filter((n) => isFileNode(n)).map((n) => n.id),
  );
  // Neighbors that live in the center's file stay; the file node for that file
  // is dropped (its containment is now the frame).
  const knotless = neighbors.filter(
    (n) => !(fileNodeIds.has(n.id) && n.source_file === centerFile),
  );

  const aliasById = new Map<string, string>([[center.id, 'center']]);
  knotless.forEach((n, i) => aliasById.set(n.id, `n${i}`));
  const aliasFor = (id: string): string | undefined => aliasById.get(id);

  const centerConstruct = CENTER_CONSTRUCT[category];
  const framedCenter: SubsystemComponent = {
    ...toComponent(
      'center',
      center,
      centerConstruct,
      `graphify center — ${center.label}`,
    ),
    ...(centerConstruct !== 'external' && centerFile ? { module: centerFile } : {}),
  };
  const components: SubsystemComponent[] = [framedCenter];

  // `component.line` is the CALL-SITE line, not the declaration line: the
  // edge's `source_location` on an edge FROM the center (L115, L119, …), which
  // `orderByLine` uses to stack callees in the order the center calls them.
  // (The neighbor's own node `source_location` — where it is declared — is
  // deliberately ignored here; declaration order would read arbitrarily.)
  const callLineByAlias = new Map<string, number>();
  for (const e of edges) {
    const from = aliasFor(e.source);
    const to = aliasFor(e.target);
    const line = parseLine(e.source_location);
    if (from === 'center' && to && line != null) callLineByAlias.set(to, line);
  }

  knotless.forEach((n, i) => {
    const inferred = inferConstructFromGraphify(
      n as unknown as GraphifyNode,
      edges as unknown as GraphifyEdge[],
    ).construct;
    const construct = INFERRED_TO_CONSTRUCT[inferred] ?? 'external';
    const purpose =
      inferred === 'module'
        ? 'graphify file node in ANOTHER file — kept as a node (outside the center frame)'
        : `graphify ${inferred} neighbor (${n.file_type ?? 'code'})`;
    // Members of the center's file join the frame; others stand alone.
    const module = n.source_file === centerFile ? centerFile : undefined;
    const c = toComponent(`n${i}`, n, construct, purpose, callLineByAlias.get(`n${i}`));
    components.push(module ? { ...c, module } : c);
  });

  // Raw graphify edges — passed straight through (no verb folding). The
  // canvas colors them from GRAPHIFY_RELATION_COLOR and draws them dashed.
  // `contains` is dropped: the frame carries containment, not an edge.
  const graphifyRelations: SubsystemGraphifyRelation[] = edges
    .map((e, i): SubsystemGraphifyRelation | null => {
      if (e.relation === 'contains') return null;
      const from = aliasFor(e.source);
      const to = aliasFor(e.target);
      if (!from || !to) return null;
      return {
        id: `g${i}`,
        from,
        to,
        relation: e.relation,
        refs: e.source_file ? [e.source_file] : undefined,
        line: parseLine(e.source_location),
        confidence: e.confidence,
        context: e.context,
      };
    })
    .filter((x): x is SubsystemGraphifyRelation => x != null);

  return { components, graphifyRelations };
}

function EgoDemo({ category, orderByLine }: { category: Category; orderByLine: boolean }) {
  const graph = React.useMemo(() => toEgoGraph(categories[category], category), [category]);
  const cat = categories[category];
  const verbs = [...new Set(graph.graphifyRelations.map((r) => r.relation))];
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={graph.components}
        graphifyRelations={graph.graphifyRelations}
        orderByLine={orderByLine}
        showSingletonFrames
        title={`Ego graph — ${category}`}
        description={`graphify center ${cat.center?.label ?? '?'} · ${cat.degree ?? 0} edges · verbs: ${verbs.join(', ')}${orderByLine ? ' · ordered by call-site line' : ''}`}
        showEdgeLabels
        hideSidebar={false}
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

export const Class: Story = { render: () => <EgoDemo category="class" orderByLine /> };
export const Function: Story = { render: () => <EgoDemo category="function" orderByLine /> };
export const Method: Story = { render: () => <EgoDemo category="method" orderByLine /> };
export const Type: Story = { render: () => <EgoDemo category="type" orderByLine /> };
export const Module: Story = { render: () => <EgoDemo category="module" orderByLine /> };

/** Same centers, ELK's default ordering — compare against the line-ordered set. */
export const MethodReorderOff: Story = {
  render: () => <EgoDemo category="method" orderByLine={false} />,
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
