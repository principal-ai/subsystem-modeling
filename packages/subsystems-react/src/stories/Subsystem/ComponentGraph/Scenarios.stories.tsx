import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type {
  SubsystemComponent,
  SubsystemComponentEdge,
  SubsystemModelDocument,
} from '../../../subsystem/model';
import type { GraphifyComponentDetail } from '../../../graphify';
import { components, edges } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/Scenarios',
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
// Mermaid diagram rendering pipeline (industry-themed-markdown)
// ---------------------------------------------------------------------------
const mermaidPurl = 'pkg:github/principal-ade/industry-themed-markdown';

const mermaidComponents: SubsystemComponent[] = [
  {
    id: 'input',
    name: 'MarkdownContent',
    construct: 'type_alias',
    file: 'industryMarkdown/components/IndustryMarkdownSlide.tsx',
    purl: mermaidPurl,
    purpose: 'raw markdown string — the slide\u2019s input',
    symbol: 'MarkdownContent',
  },
  {
    id: 'slide',
    name: 'IndustryMarkdownSlide',
    construct: 'class',
    file: 'industryMarkdown/components/IndustryMarkdownSlide.tsx',
    purl: mermaidPurl,
    purpose: 'orchestrator — parses markdown into chunks, maps mermaid chunks to diagrams',
    symbol: 'IndustryMarkdownSlide',
  },
  {
    id: 'chunk',
    name: 'MermaidChunk',
    construct: 'type_alias',
    file: 'industryMarkdown/types/customMarkdownChunks.ts',
    purl: mermaidPurl,
    purpose: 'parsed chunk — code string + id, the slide\u2019s output per mermaid block',
    symbol: 'MermaidChunk',
  },
  {
    id: 'lazy',
    name: 'IndustryLazyMermaidDiagram',
    construct: 'class',
    file: 'industryMarkdown/components/IndustryLazyMermaidDiagram.tsx',
    purl: mermaidPurl,
    purpose: 'IntersectionObserver lazy-loading wrapper \u2014 defers render until scrolled into view',
    symbol: 'IndustryLazyMermaidDiagram',
  },
  {
    id: 'diagram',
    name: 'IndustryMermaidDiagram',
    construct: 'class',
    file: 'industryMarkdown/components/IndustryMermaidDiagram.tsx',
    purl: mermaidPurl,
    purpose: 'core renderer \u2014 picks engine (beautiful-mermaid vs mermaid.js), renders themed SVG',
    symbol: 'IndustryMermaidDiagram',
  },
  {
    id: 'helpers',
    name: 'beautifulMermaid',
    construct: 'module',
    file: 'industryMarkdown/utils/beautifulMermaid.ts',
    purl: mermaidPurl,
    purpose: 'engine detection, theme\u2192options mapping, SVG post-processing',
    symbol: 'beautifulMermaid',
  },
];

const mermaidEdges = edges([
  ['input', 'slide', 'feeds'],
  ['slide', 'chunk', 'produces'],
  ['chunk', 'lazy', 'feeds'],
  ['lazy', 'diagram', 'wraps'],
  ['diagram', 'helpers', 'uses'],
]);

function MermaidDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={mermaidComponents}
        edges={mermaidEdges}
        onSelect={(id) => setSelected(id)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        mermaid diagram rendering pipeline — lazy → render → zoom → modal
        {selected ? ` · selected: ${selected}` : ''}
      </div>
    </div>
  );
}

export const MermaidPipeline: Story = {
  render: () => <MermaidDemo />,
};

// ---------------------------------------------------------------------------
// Multi-repo: two repos → two sidebar trees, one per repo, each under its own
// owner-avatar + repo-name header. Exercises buildRepoGroups grouping,
// cross-repo edges (external stub targets), and per-tree selection.
// ---------------------------------------------------------------------------
const coreLibPurl = 'pkg:github/principal-ai/principal-view-core-library';
const graphifyPurl = 'pkg:github/Graphify-Labs/graphify';

const multiRepoComponents = components([
  ['resolver', 'resolve.ts', 'module', 'packages/subsystems-react/src/graphify/resolve.ts', coreLibPurl, 'consumer-side resolution mirroring graphify rewire tiers', 'createGraphifyTypeResolver'],
  ['reftypes', 'consolidated.ts', 'module', 'packages/subsystems-react/src/graphify/consolidated.ts', coreLibPurl, 'drill-down payload types carrying ref.nodeId', 'GraphifyParamInfo'],
  ['detail', 'ComponentDeclaration.tsx', 'module', 'packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx', coreLibPurl, 'declaration panel rendering the selected component as code, with clickable type tokens', 'ComponentDeclaration'],
  ['engine', 'engine.py', 'module', 'graphify/extractors/engine.py', graphifyPurl, 'tree-sitter walk emitting references[parameter_type] edges + sourceless stubs', 'ensure_named_node'],
  ['rewire', 'extract.py', 'module', 'graphify/extract.py', graphifyPurl, 'corpus pass folding unique-label stubs onto definitions', '_rewire_unique_stub_nodes'],
]);

const multiRepoEdges = edges([
  ['detail', 'reftypes', 'imports'],
  ['resolver', 'reftypes', 'imports'],
  ['resolver', 'engine', 'references'],
  ['rewire', 'resolver', 'calls'],
]);

function MultiRepoDemo() {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        title="Type-ref resolution across repos"
        description="Two repos → two file trees. Each tree is scoped to its repo's files and headed by the owner avatar + repo name. Cross-repo edges land on external stubs."
        components={multiRepoComponents}
        edges={multiRepoEdges}
      />
    </div>
  );
}

export const MultiRepoTrees: Story = {
  render: () => <MultiRepoDemo />,
};

// ---------------------------------------------------------------------------
// Roles + process boundaries + state-access mechanisms — the principal-studio
// access-surface flow authored with the real fields: `construct: store` for
// the state node, `role: entry` for the two boundary elements, `process`
// regions (grouped by `process ?? purl`), and the
// writes/reads/watches edges. Agents and services carry no process, so they
// sit outside every boundary; the push leg routes THROUGH the IPC entry
// (boundary invariant: inter-process edges terminate at a boundary element).
// ---------------------------------------------------------------------------
const coreLibPurl2 = 'pkg:github/principal-ai/principal-view-core-library';

const accessSurfaceComponents: SubsystemComponent[] = [
  // --- external actor: no process → outside every boundary region
  {
    id: 'agents',
    name: 'agent clients',
    construct: 'external',
    file: '',
    purl: 'pkg:generic/local-agent-clients',
    purpose: 'agents and tooling outside the process — enter only via the HTTP bridge',
    layer: 0,
  },
  // --- principal-studio/host process region
  {
    id: 'http-entry',
    name: 'HTTP bridge :3045',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/http-server.ts',
    purl: coreLibPurl2,
    symbol: 'handleSubsystemModelRequest',
    role: 'entry',
    process: 'principal-studio/host',
    purpose: 'the process\u2019s HTTP surface — request leg only, no push',
    layer: 1,
  },
  {
    id: 'create',
    name: 'createSubsystemModel',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: coreLibPurl2,
    symbol: 'createSubsystemModel',
    process: 'principal-studio/host',
    purpose: 'persists a new graph JSON into the store',
    layer: 2,
  },
  {
    id: 'update',
    name: 'updateSubsystemModel',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: coreLibPurl2,
    symbol: 'updateSubsystemModel',
    process: 'principal-studio/host',
    purpose: 'rewrites an existing graph file on PUT',
    layer: 2,
  },
  {
    id: 'delete',
    name: 'deleteSubsystemModel',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: coreLibPurl2,
    symbol: 'deleteSubsystemModel',
    process: 'principal-studio/host',
    purpose: 'unlinks the graph file and updates the index',
    layer: 2,
  },
  {
    id: 'get',
    name: 'getSubsystemModel',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: coreLibPurl2,
    symbol: 'getSubsystemModel',
    process: 'principal-studio/host',
    purpose: 'reads one stored graph — serves both surfaces',
    layer: 2,
  },
  {
    id: 'watcher',
    name: 'startSubsystemModelDirWatcher',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: coreLibPurl2,
    symbol: 'startSubsystemModelDirWatcher',
    process: 'principal-studio/host',
    purpose: 'fs.watch on the graphs dir — observes, owns nothing',
    layer: 2,
  },
  {
    id: 'store',
    name: 'Graph Store',
    construct: 'store',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: coreLibPurl2,
    process: 'principal-studio/host',
    purpose: 'retained state: <id>.json files + _index.json + in-memory bookkeeping.\nState-only: the access mechanism lives in the accessor nodes.',
    layer: 3,
    detail: {
      kind: 'store',
      properties: [
        { name: 'ROOT', type: 'string' },
        { name: 'INDEX_PATH', type: 'string' },
        { name: 'changeListener', type: 'SubsystemModelChangeListener | null' },
        { name: 'recentSelfWrites', type: 'Map<string, number>' },
        { name: 'dirWatcher', type: 'FSWatcher | null' },
        { name: 'pendingWatchIds', type: 'Set<string>' },
      ],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'broadcast',
    name: 'broadcastSubsystemModelChanged',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/index.ts',
    purl: coreLibPurl2,
    symbol: 'broadcastSubsystemModelChanged',
    process: 'principal-studio/host',
    purpose: 'push leg — sends subsystemModelChanged over Electrobun RPC',
    layer: 4,
  },
  {
    id: 'ipc-entry',
    name: 'StudioMessages',
    construct: 'interface',
    file: 'packages/subsystems-studio/src/shared/contract.ts',
    purl: coreLibPurl2,
    symbol: 'StudioMessages',
    role: 'entry',
    process: 'principal-studio/host',
    purpose: 'the IPC surface — requests in, pushes out (both legs)',
    layer: 4,
  },
  {
    id: 'avatars',
    name: 'resolveAuthorAvatars',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/avatars.ts',
    purl: coreLibPurl2,
    symbol: 'resolveAuthorAvatars',
    process: 'principal-studio/host',
    purpose: 'resolves author avatars — outbound call crossing the boundary',
    layer: 4,
  },
  // --- principal-studio/renderer process region
  {
    id: 'subs',
    name: 'subsystemModelChangeSubscribers',
    construct: 'function',
    file: 'packages/subsystems-studio/src/mainview/rpc.ts',
    purl: coreLibPurl2,
    symbol: 'subsystemModelChangeSubscribers',
    process: 'principal-studio/renderer',
    purpose: 'renderer fan-out Set for subsystemModelChanged payloads',
    layer: 5,
  },
  {
    id: 'open-view',
    name: 'SubsystemModelView',
    construct: 'function',
    file: 'packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx',
    purl: coreLibPurl2,
    symbol: 'SubsystemModelView',
    process: 'principal-studio/renderer',
    purpose: 'open graph tab — requests over the IPC surface, reloads on push',
    layer: 6,
  },
  {
    id: 'list-view',
    name: 'SubsystemModelsView',
    construct: 'function',
    file: 'packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx',
    purl: coreLibPurl2,
    symbol: 'SubsystemModelsView',
    process: 'principal-studio/renderer',
    purpose: 'list tab — requests over the IPC surface, refreshes on push',
    layer: 6,
  },
  // --- external service: no process, identity via purl — the far side of an
  //     outbound crossing
  {
    id: 'github',
    name: 'api.github.com',
    construct: 'external',
    file: '',
    purl: 'pkg:generic/api.github.com',
    role: 'service',
    purpose: 'external service — outbound calls terminate here (far-side boundary element)',
    layer: 6,
  },
];

const accessSurfaceEdges = edges([
  ['agents', 'http-entry', 'calls'],
  ['http-entry', 'create', 'calls'],
  ['http-entry', 'update', 'calls'],
  ['http-entry', 'delete', 'calls'],
  ['http-entry', 'get', 'calls'],
  ['create', 'store', 'writes'],
  ['update', 'store', 'writes'],
  ['delete', 'store', 'writes'],
  ['get', 'store', 'reads'],
  ['watcher', 'store', 'watches'],
  ['store', 'broadcast', 'produces'],
  ['broadcast', 'ipc-entry', 'feeds'],
  ['ipc-entry', 'subs', 'feeds'],
  ['subs', 'open-view', 'feeds'],
  ['subs', 'list-view', 'feeds'],
  ['open-view', 'ipc-entry', 'calls'],
  ['list-view', 'ipc-entry', 'calls'],
  ['avatars', 'github', 'calls'],
]);

function AccessSurfacesDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SubsystemComponentEdge | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        title="Access surfaces, roles, and process boundaries"
        description="Two process regions (host, renderer) + boundary entries; agents and the external service float outside every boundary. Hover for the role badge; click the store to drill into its state-only detail."
        components={accessSurfaceComponents}
        edges={accessSurfaceEdges}
        onSelect={(id) => setSelected(id)}
        onEdgeSelect={(e) => setSelectedEdge(e)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        regions: principal-studio/host · principal-studio/renderer — agents + api.github.com outside every
        boundary · store edges: writes (deep green) / reads (sky) / watches (dashed gray) / produces
        (terracotta)
        {selectedEdge
          ? ` · edge: ${selectedEdge.from} --${selectedEdge.mechanism}--> ${selectedEdge.to}`
          : selected
            ? ` · selected: ${selected}`
            : ''}
      </div>
    </div>
  );
}

export const AccessSurfacesAndRoles: Story = {
  render: () => <AccessSurfacesDemo />,
};

// ---------------------------------------------------------------------------
// SCENARIO: Store flavors — three ways retained state shows up, rendered with
// `construct: 'store'` (state-block anatomy) in all of them:
//   1. module-state store  — state as module-level consts (principal-studio pattern)
//   2. class-backed store  — a real `class SessionCache` exists in source; the
//      node still renders as a state block (fields only) per the store/accessor
//      separation. OPEN QUESTION: is dropping the class stub the right call
//      when the class declaration is real?
//   3. external shared store — state on disk outside any repo (sqlite). No
//      process → outside every boundary. OPEN QUESTION: does the boundary
//      invariant extend so crossings may terminate at an external store?
// ---------------------------------------------------------------------------
const storeFlavorPurl = 'pkg:github/principal-ai/agent-monitoring';

const storeFlavorComponents: SubsystemComponent[] = [
  // --- flavor 1: module-state store
  {
    id: 'f1-create',
    name: 'createSubsystemModel',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: coreLibPurl2,
    symbol: 'createSubsystemModel',
    process: 'principal-studio/host',
    purpose: 'persists a new graph JSON',
    layer: 1,
  },
  {
    id: 'f1-get',
    name: 'getSubsystemModel',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: coreLibPurl2,
    symbol: 'getSubsystemModel',
    process: 'principal-studio/host',
    purpose: 'reads one stored graph',
    layer: 1,
  },
  {
    id: 'f1-store',
    name: 'Graph Store',
    construct: 'store',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: coreLibPurl2,
    process: 'principal-studio/host',
    purpose: 'module-level state: ROOT, INDEX_PATH, listener + watch bookkeeping',
    layer: 2,
    detail: {
      kind: 'store',
      properties: [
        { name: 'ROOT', type: 'string' },
        { name: 'INDEX_PATH', type: 'string' },
        { name: 'changeListener', type: 'Listener | null' },
      ],
    } satisfies GraphifyComponentDetail,
  },
  // --- flavor 2: class-managed store — TWO nodes, each anchored honestly:
  //     the class (verifiable declaration, methods = access mechanism) and
  //     the state (construct: 'store', the db/state visualization)
  {
    id: 'f2-cache',
    name: 'SessionCache',
    construct: 'class',
    file: 'src/session/SessionCache.ts',
    purl: storeFlavorPurl,
    symbol: 'SessionCache',
    purpose: 'manages access to cached sessions — the verifiable access mechanism',
    layer: 3,
    detail: {
      kind: 'class',
      methods: [
        { nodeId: 'cm1', name: 'put', parameters: [{ type: 'SessionRecord' }] },
        { nodeId: 'cm2', name: 'get', parameters: [{ type: 'string' }], returnType: 'SessionRecord | null' },
        { nodeId: 'cm3', name: 'evict', parameters: [{ type: 'string' }] },
      ],
      properties: [],
      extends: [],
      implements: [],
      instantiations: [],
      references: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'f2-store',
    name: 'Session Cache State',
    construct: 'store',
    file: 'src/session/SessionCache.ts',
    purl: storeFlavorPurl,
    purpose: 'retained state visualized alongside its manager class',
    layer: 4,
    detail: {
      kind: 'store',
      properties: [
        { name: 'sessions', type: 'Map<string, SessionRecord>' },
        { name: 'ttlSeconds', type: 'number' },
      ],
    } satisfies GraphifyComponentDetail,
  },
  // --- flavor 3: external shared store
  {
    id: 'f3-accessor',
    name: 'loadAppState',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/app-state.ts',
    purl: coreLibPurl2,
    symbol: 'loadAppState',
    process: 'principal-studio/host',
    purpose: 'reads app state from the on-disk sqlite db',
    layer: 5,
  },
  {
    id: 'f3-store',
    name: 'app-state.db',
    construct: 'store',
    file: '',
    purl: 'pkg:generic/local--Users-me-.principal-app-state.db',
    purpose: 'sqlite on disk — retained state outside any repo or process',
    layer: 6,
    detail: {
      kind: 'store',
      properties: [
        { name: 'settings', type: 'AppSettingsRow[]' },
        { name: 'schemaVersion', type: 'number' },
      ],
    } satisfies GraphifyComponentDetail,
  },
];

const storeFlavorEdges = edges([
  ['f1-create', 'f1-store', 'writes'],
  ['f1-get', 'f1-store', 'reads'],
  ['f2-cache', 'f2-store', 'writes'],
  ['f3-accessor', 'f3-store', 'reads'],
]);

function StoreFlavorsDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        title="Store flavors"
        description="construct:= the node's verifiable anchor. Class-managed stores are TWO nodes: the manager class (declaration, methods) + the state (store block). Click any node to see its anchor-honest drill-down."
        components={storeFlavorComponents}
        edges={storeFlavorEdges}
        onSelect={(id) => setSelected(id)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        flavor 1: module consts (store node only) · flavor 2: manager class + state node (two-node
        pattern) · flavor 3: external db, crossing terminates at the store (invariant extension —
        refine?)
        {selected ? ` · selected: ${selected}` : ''}
      </div>
    </div>
  );
}

export const StoreFlavors: Story = {
  render: () => <StoreFlavorsDemo />,
};

// ---------------------------------------------------------------------------
// SCENARIO: Shared store across processes — state that belongs to neither
// process. The store node carries NO process, so it sits outside every
// boundary; both processes' accessors reach across to it. OPEN QUESTION:
// should shared state sit outside boundaries (as here), or inside an owner
// process with crossings out? And do accessor→shared-store edges satisfy the
// boundary invariant (store as boundary element)?
// ---------------------------------------------------------------------------
const sharedStoreComponents: SubsystemComponent[] = [
  {
    id: 'ss-load',
    name: 'loadSubsystemModel',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: coreLibPurl2,
    symbol: 'getSubsystemModel',
    process: 'principal-studio/host',
    purpose: 'host accessor — reads one stored graph',
    layer: 1,
  },
  {
    id: 'ss-save',
    name: 'saveSubsystemModel',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: coreLibPurl2,
    symbol: 'updateSubsystemModel',
    process: 'principal-studio/host',
    purpose: 'host accessor — rewrites a stored graph',
    layer: 1,
  },
  {
    id: 'ss-watch',
    name: 'startSubsystemModelDirWatcher',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: coreLibPurl2,
    symbol: 'startSubsystemModelDirWatcher',
    process: 'principal-studio/host',
    purpose: 'host watches for external writes (hand edits, other processes)',
    layer: 1,
  },
  {
    id: 'ss-migrate',
    name: 'migrateGraphIndex',
    construct: 'function',
    file: 'packages/principal-studio-cli/src/graph-index.ts',
    purl: coreLibPurl2,
    symbol: 'migrateGraphIndex',
    process: 'principal-cli',
    purpose: 'a second process touches the same state — schema migration',
    layer: 1,
  },
  {
    id: 'ss-store',
    name: '~/.principal/subsystem-models',
    construct: 'store',
    file: '',
    purl: 'pkg:generic/local--Users-me-.principal-subsystem-models',
    purpose: 'file-per-graph + _index.json — shared state owned by no single process',
    layer: 2,
    detail: {
      kind: 'store',
      properties: [
        { name: 'graphs', type: 'Map<graphId, StoredSubsystemModel>' },
        { name: 'index', type: '_index.json cache' },
      ],
    } satisfies GraphifyComponentDetail,
  },
];

const sharedStoreEdges = edges([
  ['ss-load', 'ss-store', 'reads'],
  ['ss-save', 'ss-store', 'writes'],
  ['ss-watch', 'ss-store', 'watches'],
  ['ss-migrate', 'ss-store', 'writes'],
]);

function SharedStoreDemo() {
  const [selectedEdge, setSelectedEdge] = useState<SubsystemComponentEdge | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        title="Shared store across processes"
        description="A store with no process sits outside every boundary; accessors from both processes reach across to it."
        components={sharedStoreComponents}
        edges={sharedStoreEdges}
        onEdgeSelect={(e) => setSelectedEdge(e)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        shared state between principal-studio/host and principal-cli — refine: outside boundaries (as
        here) vs owned by one process? do these crossings satisfy the invariant?
        {selectedEdge ? ` · edge: ${selectedEdge.from} --${selectedEdge.mechanism}--> ${selectedEdge.to}` : ''}
      </div>
    </div>
  );
}

export const SharedStoreAcrossProcesses: Story = {
  render: () => <SharedStoreDemo />,
};

// ---------------------------------------------------------------------------
// SCENARIO: Queue as store — ordered retained state. The queue is construct:
// 'store' (state block: pending jobs, depth); producers write, workers read.
// OPEN QUESTION: dequeue REMOVES state — is it `reads` (worker pulls) or
// `writes` (mutates the queue)? Does the verb set need a
// mutation-vs-observation distinction, or is dequeue just both?
// ---------------------------------------------------------------------------
const queueComponents: SubsystemComponent[] = [
  {
    id: 'q-producer',
    name: 'enqueueAnalysisJob',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/analysis-queue.ts',
    purl: coreLibPurl2,
    symbol: 'enqueueAnalysisJob',
    process: 'principal-studio/host',
    purpose: 'pushes a repo-analysis job onto the queue',
    layer: 1,
  },
  {
    id: 'q-queue',
    name: 'Analysis Queue',
    construct: 'store',
    file: 'packages/subsystems-studio/src/bun/analysis-queue.ts',
    purl: coreLibPurl2,
    process: 'principal-studio/host',
    purpose: 'ordered retained state — pending jobs, depth, head pointer',
    layer: 2,
    detail: {
      kind: 'store',
      properties: [
        { name: 'pendingJobs', type: 'AnalysisJob[]' },
        { name: 'depth', type: 'number' },
        { name: 'head', type: 'string | null' },
      ],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'q-worker',
    name: 'Bun.Worker',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/analysis-worker.ts',
    purl: coreLibPurl2,
    symbol: 'spawnAnalysisWorker',
    process: 'principal-studio/host',
    purpose: 'claims the next job and runs the analysis',
    layer: 3,
  },
  {
    id: 'q-results',
    name: 'Analysis Results',
    construct: 'store',
    file: 'packages/subsystems-studio/src/bun/analysis-store.ts',
    purl: coreLibPurl2,
    process: 'principal-studio/host',
    purpose: 'retained results — keyed by repo purl + sha',
    layer: 4,
    detail: {
      kind: 'store',
      properties: [{ name: 'results', type: 'Map<purl, AnalysisResult>' }],
    } satisfies GraphifyComponentDetail,
  },
];

const queueEdges = edges([
  ['q-producer', 'q-queue', 'writes'],
  ['q-worker', 'q-queue', 'reads'],
  ['q-worker', 'q-results', 'writes'],
]);

function QueueAsStoreDemo() {
  const [selectedEdge, setSelectedEdge] = useState<SubsystemComponentEdge | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        title="Queue as store"
        description="Ordered retained state. Stores as pipeline stages: producer writes the queue, the worker reads it and writes results."
        components={queueComponents}
        edges={queueEdges}
        onEdgeSelect={(e) => setSelectedEdge(e)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        refine: dequeue removes state — reads (pull) or writes (mutate)? verb set needs a
        mutation-vs-observation distinction?
        {selectedEdge ? ` · edge: ${selectedEdge.from} --${selectedEdge.mechanism}--> ${selectedEdge.to}` : ''}
      </div>
    </div>
  );
}

export const QueueAsStore: Story = {
  render: () => <QueueAsStoreDemo />,
};

// ---------------------------------------------------------------------------
// SCENARIO: Data ↔ Visualization — the raw SubsystemModelDocument on the left,
// the rendered graph on the right. The JSON is EDITABLE: change a `construct`, add
// a `role`, flip `writes` to `reads`, toggle a `process` — and the graph
// re-renders on the next valid parse. Invalid JSON keeps the last good graph
// and shows the parse error.
// ---------------------------------------------------------------------------
const dataVizDoc: SubsystemModelDocument = {
  components: [
    {
      id: 'agents',
      name: 'agent clients',
      construct: 'external',
      file: '',
      purl: 'pkg:generic/local-agent-clients',
      purpose: 'external actor — no process, outside every boundary',
      layer: 0,
    },
    {
      id: 'http-entry',
      name: 'HTTP bridge :3045',
      construct: 'function',
      file: 'packages/subsystems-studio/src/bun/http-server.ts',
      purl: 'pkg:github/principal-ai/principal-view-core-library',
      symbol: 'handleSubsystemModelRequest',
      role: 'entry',
      process: 'principal-studio/host',
      purpose: 'boundary element — anchored to a real declaration',
      layer: 1,
    },
    {
      id: 'create',
      name: 'createSubsystemModel',
      construct: 'function',
      file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
      purl: 'pkg:github/principal-ai/principal-view-core-library',
      symbol: 'createSubsystemModel',
      process: 'principal-studio/host',
      purpose: 'accessor — plain declaration node',
      layer: 2,
    },
    {
      id: 'store',
      name: 'Graph Store',
      construct: 'store',
      file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
      purl: 'pkg:github/principal-ai/principal-view-core-library',
      process: 'principal-studio/host',
      purpose: 'state-block anatomy — anchored to a state location, not a declaration',
      layer: 3,
      detail: {
        kind: 'store',
        properties: [
          { name: 'ROOT', type: 'string' },
          { name: 'INDEX_PATH', type: 'string' },
        ],
      },
    },
    {
      id: 'get',
      name: 'getSubsystemModel',
      construct: 'function',
      file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
      purl: 'pkg:github/principal-ai/principal-view-core-library',
      symbol: 'getSubsystemModel',
      process: 'principal-studio/host',
      purpose: 'accessor — plain declaration node',
      layer: 2,
    },
    {
      id: 'broadcast',
      name: 'broadcastSubsystemModelChanged',
      construct: 'function',
      file: 'packages/subsystems-studio/src/bun/index.ts',
      purl: 'pkg:github/principal-ai/principal-view-core-library',
      symbol: 'broadcastSubsystemModelChanged',
      process: 'principal-studio/host',
      purpose: 'the store\u2019s change stream leaves as produces',
      layer: 4,
    },
    {
      id: 'cache',
      name: 'SessionCache',
      construct: 'class',
      file: 'src/session/SessionCache.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      symbol: 'SessionCache',
      purpose: 'manager class — the verifiable access mechanism (two-node pattern)',
      layer: 5,
    },
    {
      id: 'cache-state',
      name: 'Session Cache State',
      construct: 'store',
      file: 'src/session/SessionCache.ts',
      purl: 'pkg:github/principal-ai/agent-monitoring',
      purpose: 'its retained state — the db/state visualization',
      layer: 6,
      detail: {
        kind: 'store',
        properties: [{ name: 'sessions', type: 'Map<string, SessionRecord>' }],
      },
    },
  ],
  edges: [
    { id: 'e0', from: 'agents', to: 'http-entry', mechanism: 'calls' },
    { id: 'e1', from: 'http-entry', to: 'create', mechanism: 'calls' },
    { id: 'e2', from: 'create', to: 'store', mechanism: 'writes' },
    { id: 'e3', from: 'get', to: 'store', mechanism: 'reads' },
    { id: 'e4', from: 'store', to: 'broadcast', mechanism: 'produces' },
    { id: 'e5', from: 'cache', to: 'cache-state', mechanism: 'writes' },
  ],
};

function DataVsVisualizationDemo() {
  const [text, setText] = useState(() => JSON.stringify(dataVizDoc, null, 2));
  const [doc, setDoc] = useState<SubsystemModelDocument>(dataVizDoc);
  const [error, setError] = useState<string | null>(null);

  const onChange = (next: string) => {
    setText(next);
    try {
      const parsed = JSON.parse(next) as SubsystemModelDocument;
      if (!Array.isArray(parsed.components) || !Array.isArray(parsed.edges)) {
        throw new Error('document needs `components` and `edges` arrays');
      }
      setDoc(parsed);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', background: '#0f1216' }}>
      <div
        style={{
          width: '38%',
          minWidth: 380,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #333',
          background: '#14171c',
        }}
      >
        <div
          style={{
            padding: '6px 10px',
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#9ca3af',
            borderBottom: '1px solid #333',
          }}
        >
          the data — SubsystemModelDocument (edit → re-renders; invalid JSON keeps last good graph)
        </div>
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            outline: 'none',
            padding: 10,
            fontFamily: 'monospace',
            fontSize: 11,
            lineHeight: 1.5,
            color: '#d8dee9',
            background: 'transparent',
            whiteSpace: 'pre',
          }}
        />
        {error && (
          <div style={{ padding: '4px 10px', fontFamily: 'monospace', fontSize: 11, color: '#e5534b' }}>
            {error}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <SubsystemComponentGraph
          title="the visualization"
          description="Same document, rendered: construct:→ node anatomy, role → topology glyph, process → boundary region, mechanism → edge color/style."
          components={doc.components}
          edges={doc.edges}
        />
      </div>
    </div>
  );
}

export const DataVsVisualization: Story = {
  render: () => <DataVsVisualizationDemo />,
};
