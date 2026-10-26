/**
 * C4 → component-graph drill-down fixture — grounded in a real, reviewed
 * subsystem model.
 *
 * The document half is `sg-1788913589907-ieokymqg9` "Gist share from Studio"
 * — a verified model for THIS repo (`principal-ai/subsystem-modeling`, 19
 * components, 15/15 verified claims, 7 walkthroughs checked) from
 * `~/.principal/subsystem-models`. Components, trails, and step sites are the
 * model's own, not invented.
 *
 * The C4 half is the "assume they exist" part: a plausible accepted element
 * set built ON TOP of that model — four containers claiming its real process
 * keys, two externals (GitHub Gists API, the shared disk store), and authored
 * Level-3 groupings of real aliases. Everything the C4 layer claims is
 * checkable against the document, and `c4Drilldown.test.ts` asserts it:
 *
 *   - container `process` claims exist in the doc, and membership resolves by
 *     exact key match (`getSubsystemProcessRegions`-style);
 *   - externals carry their one alias; authored components group only real
 *     aliases;
 *   - the container-level edges are EXACTLY the fold of cross-boundary trail
 *     steps (`rollupEdgeTrailRefs`), which is the spec for the eventual
 *     `buildC4Model` rollup;
 *   - the library processes (`subsystems-core/types`, `subsystems-react/ui`)
 *     and the proposed process (`proposed/studio-gist`) are claimed by no
 *     container — the anti-"library" stance, applied to the fixture itself.
 *
 * Note what the accepted fold leaves out on purpose: the renderer container
 * has no incident edges (only the *proposed* trail touches it) and the CLI
 * never writes the store in a trail (the store's description says it *can*,
 * but no trail does it). Both absences are honest.
 */

import type {
  C4Component,
  C4Container,
  C4Edge,
  C4Element,
  C4ExternalSystem,
  C4Model,
  C4TrailRef,
} from '../c4';
import type { SubsystemComponent, SubsystemTrail } from '../model';

/** The real model this fixture is grounded in. */
export const DRILLDOWN_MODEL_SOURCE = {
  /** `~/.principal/subsystem-models/sg-1788913589907-ieokymqg9.json` */
  id: 'sg-1788913589907-ieokymqg9',
  title: 'Gist share from Studio (local store + host gist ref)',
  repo: 'pkg:github/principal-ai/subsystem-modeling',
  repoRoot: '/Users/griever/Developer/principal-ai/subsystem-modeling',
  verifiedCount: 15,
} as const;

export const DRILLDOWN_PURL = 'pkg:github/principal-ai/subsystem-modeling';

/** The system boundary. */
export const SYSTEM = {
  id: 'system:studio',
  label: 'Subsystem Modeling',
  repoKey: DRILLDOWN_PURL,
} as const;

/** `container:studio-host` — claims process key `subsystems-studio/host`. */
export const HOST = 'container:studio-host';
/** `container:studio-renderer` — claims `subsystems-studio/renderer`. */
export const RENDERER = 'container:studio-renderer';
/** `container:principal-cli` — claims `principal-studio-cli`. */
export const CLI = 'container:principal-cli';
/** `container:site-web` — claims `site/web`. */
export const SITE = 'container:site-web';
/** `external:github` — GitHub Gists API. */
export const GITHUB = 'external:github';
/** `external:disk-store` — the shared `~/.principal/subsystem-models` store. */
export const DISK = 'external:disk-store';

const stepPurl = (file: string) => `${DRILLDOWN_PURL}#${file}`;

// ---------------------------------------------------------------------------
// The subsystem model document — verbatim from sg-1788913589907-ieokymqg9.
// ---------------------------------------------------------------------------

export const DRILLDOWN_COMPONENTS: SubsystemComponent[] = [
  {
    alias: 'site-gist-page',
    name: 'Gist',
    construct: 'function',
    role: 'entry',
    file: 'site/src/pages/Gist.tsx',
    purl: stepPurl('site/src/pages/Gist.tsx'),
    symbol: 'Gist',
    purpose: 'Consumer surface: open a public gist URL and render the portable model.',
    process: 'site/web',
    layer: 0,
  },
  {
    alias: 'gist-load',
    name: 'loadSubsystemModelFromGist',
    construct: 'function',
    file: 'site/src/lib/gist.ts',
    purl: stepPurl('site/src/lib/gist.ts'),
    symbol: 'loadSubsystemModelFromGist',
    purpose: 'Fetch and parse a public gist into a portable document (site viewer today).',
    process: 'site/web',
    layer: 1,
  },
  {
    alias: 'to-portable',
    name: 'toPortableDocument',
    construct: 'function',
    file: 'site/src/lib/gist.ts',
    purl: stepPurl('site/src/lib/gist.ts'),
    symbol: 'toPortableDocument',
    purpose: 'Keep only shareable fields — what a gist file must contain.',
    process: 'site/web',
    layer: 2,
  },
  {
    alias: 'is-portable',
    name: 'isSubsystemModelDocument',
    construct: 'function',
    file: 'packages/subsystems-core/src/types/subsystem-model.ts',
    purl: stepPurl('packages/subsystems-core/src/types/subsystem-model.ts'),
    symbol: 'isSubsystemModelDocument',
    purpose: 'Shallow-guard title + components[] + edges[].',
    process: 'subsystems-core/types',
    layer: 2,
  },
  {
    alias: 'portable-doc',
    name: 'SubsystemModelDocument',
    construct: 'interface',
    file: 'packages/subsystems-core/src/types/subsystem-model.ts',
    purl: stepPurl('packages/subsystems-core/src/types/subsystem-model.ts'),
    symbol: 'SubsystemModelDocument',
    purpose: 'Shareable standard — no host paths, store ids, or gist provenance.',
    process: 'subsystems-core/types',
    layer: 3,
  },
  {
    alias: 'host-binding',
    name: 'SubsystemModelHydrated',
    construct: 'interface',
    file: 'packages/subsystems-core/src/types/subsystem-model.ts',
    purl: stepPurl('packages/subsystems-core/src/types/subsystem-model.ts'),
    symbol: 'SubsystemModelHydrated',
    purpose: 'Machine envelope layered onto a portable document for local Studio use.',
    process: 'subsystems-core/types',
    layer: 3,
  },
  {
    alias: 'github-gists-api',
    name: 'GitHub Gists API',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external:api.github.com/gists',
    purpose: 'Create or update a public gist that holds the portable JSON.',
    process: 'external/github',
    layer: 2,
    declaration: {
      kind: 'external',
      attributes: [
        { key: 'read', value: 'GET /gists/{id}' },
        { key: 'create', value: 'POST /gists' },
        { key: 'update', value: 'PATCH /gists/{id}' },
      ],
    },
  },
  {
    alias: 'react-graph',
    name: 'SubsystemComponentGraph',
    construct: 'function',
    file: 'packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx',
    purl: stepPurl('packages/subsystems-react/src/subsystem/SubsystemComponentGraph.tsx'),
    symbol: 'SubsystemComponentGraph',
    purpose: 'Shared graph viewer for site gist pages and Studio model tabs.',
    process: 'subsystems-react/ui',
    layer: 1,
  },
  {
    alias: 'cli-create',
    name: 'createAction',
    construct: 'function',
    role: 'entry',
    file: 'packages/principal-studio-cli/src/commands/subsystem-model.ts',
    purl: stepPurl('packages/principal-studio-cli/src/commands/subsystem-model.ts'),
    symbol: 'createAction',
    purpose: 'Author path: validate payload and persist a new local sg- id.',
    process: 'principal-studio-cli',
    layer: 0,
  },
  {
    alias: 'studio-create',
    name: 'createSubsystemModel',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: stepPurl('packages/subsystems-studio/src/bun/subsystem-model-store.ts'),
    symbol: 'createSubsystemModel',
    purpose: 'Mint sg- id and write the hydrated record into the disk store.',
    process: 'subsystems-studio/host',
    layer: 1,
  },
  {
    alias: 'studio-update',
    name: 'updateSubsystemModel',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: stepPurl('packages/subsystems-studio/src/bun/subsystem-model-store.ts'),
    symbol: 'updateSubsystemModel',
    purpose: 'Patch a local record in place — used to stamp or refresh the host gist ref.',
    process: 'subsystems-studio/host',
    layer: 1,
  },
  {
    alias: 'studio-get',
    name: 'getSubsystemModel',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: stepPurl('packages/subsystems-studio/src/bun/subsystem-model-store.ts'),
    symbol: 'getSubsystemModel',
    purpose: 'Read one hydrated record from the disk store by sg- id.',
    process: 'subsystems-studio/host',
    layer: 1,
  },
  {
    alias: 'model-disk-store',
    name: '~/.principal/subsystem-models',
    construct: 'store',
    file: '',
    purl: 'external:file:~/.principal/subsystem-models',
    purpose:
      'Shared on-disk store (<id>.json + _index.json). Studio host and the CLI both read/write here — the directory is not owned by either process.',
    process: 'local/disk',
    layer: 2,
    declaration: { kind: 'store', properties: [] },
  },
  {
    alias: 'index-entry',
    name: 'indexEntryFor',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
    purl: stepPurl('packages/subsystems-studio/src/bun/subsystem-model-store.ts'),
    symbol: 'indexEntryFor',
    purpose: 'Build the lightweight listing row written into _index.json.',
    process: 'subsystems-studio/host',
    layer: 2,
  },
  {
    alias: 'studio-list',
    name: 'SubsystemModelsView',
    construct: 'function',
    role: 'entry',
    file: 'packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx',
    purl: stepPurl('packages/subsystems-studio/src/mainview/views/SubsystemModelsView.tsx'),
    symbol: 'SubsystemModelsView',
    purpose: 'Studio list of local models — one place a Share as gist action can live.',
    process: 'subsystems-studio/renderer',
    layer: 0,
  },
  {
    alias: 'studio-model-view',
    name: 'SubsystemModelView',
    construct: 'function',
    role: 'entry',
    file: 'packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx',
    purl: stepPurl('packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx'),
    symbol: 'SubsystemModelView',
    purpose: 'Open model tab chrome — alternate home for a per-model Gist button.',
    process: 'subsystems-studio/renderer',
    layer: 0,
  },
  {
    alias: 'open-tab',
    name: 'openSubsystemModelTab',
    construct: 'function',
    file: 'packages/subsystems-studio/src/bun/index.ts',
    purl: stepPurl('packages/subsystems-studio/src/bun/index.ts'),
    symbol: 'openSubsystemModelTab',
    purpose: 'Focus or create a subsystem-model tab for a stored sg- id.',
    process: 'subsystems-studio/host',
    layer: 1,
  },
  {
    alias: 'gist-share-ui',
    name: 'StudioGistShare',
    construct: 'external',
    role: 'entry',
    file: '',
    purl: 'external:proposed',
    purpose: 'Proposed Gist button: publish the local model as a gist, or update the linked one.',
    process: 'proposed/studio-gist',
    layer: 0,
    declaration: {
      kind: 'external',
      attributes: [
        { key: 'surface', value: 'SubsystemModelsView or SubsystemModelView' },
        { key: 'action', value: 'Share as gist / Update gist' },
        { key: 'auth', value: 'GitHub token required for write' },
      ],
    },
  },
  {
    alias: 'gist-ref',
    name: 'StoredGistRef',
    construct: 'external',
    file: '',
    purl: 'external:proposed',
    purpose:
      'Host-only gist id (+ fileName) on the stored record and index so share updates the same gist.',
    process: 'proposed/studio-gist',
    layer: 2,
    declaration: {
      kind: 'external',
      attributes: [
        { key: 'shape', value: 'gist?: { id, fileName? }' },
        { key: 'livesOn', value: 'StoredSubsystemModel + _index entry' },
        { key: 'notIn', value: 'portable SubsystemModelDocument' },
      ],
    },
  },
];

export const DRILLDOWN_TRAILS: SubsystemTrail[] = [
  {
    id: 'tl-site-view-gist',
    title: 'Someone opens the shared gist on the site',
    steps: [
      {
        from: 'site-gist-page',
        to: 'gist-load',
        mechanism: 'calls',
        file: 'site/src/pages/Gist.tsx',
        span: { startLine: 67, endLine: 67, contentHash: 'fixture' },
        symbol: 'Gist.load',
        annotation: 'Consumer lands on /gist?gist=... — the end of a Studio share.',
        purl: stepPurl('site/src/pages/Gist.tsx'),
      },
      {
        from: 'gist-load',
        to: 'github-gists-api',
        mechanism: 'calls',
        file: 'site/src/lib/gist.ts',
        span: { startLine: 94, endLine: 94, contentHash: 'fixture' },
        symbol: 'loadSubsystemModelFromGist',
        annotation: 'Read the public gist JSON (no Studio disk involved).',
        purl: stepPurl('site/src/lib/gist.ts'),
      },
      {
        from: 'gist-load',
        to: 'to-portable',
        mechanism: 'calls',
        file: 'site/src/lib/gist.ts',
        span: { startLine: 154, endLine: 154, contentHash: 'fixture' },
        symbol: 'loadSubsystemModelFromGist',
        annotation: 'Only portable fields are shown — host gist refs never travel in the file.',
        purl: stepPurl('site/src/lib/gist.ts'),
      },
      {
        from: 'site-gist-page',
        to: 'react-graph',
        mechanism: 'uses',
        file: 'site/src/pages/Gist.tsx',
        span: { startLine: 184, endLine: 184, contentHash: 'fixture' },
        symbol: 'Gist',
        annotation: 'Render the shared model in the browser.',
        purl: stepPurl('site/src/pages/Gist.tsx'),
      },
    ],
  },
  {
    id: 'tl-persist-local-store',
    title: 'Persist a local model to ~/.principal/subsystem-models',
    steps: [
      {
        from: 'cli-create',
        to: 'studio-create',
        mechanism: 'calls',
        file: 'packages/principal-studio-cli/src/commands/subsystem-model.ts',
        span: { startLine: 186, endLine: 186, contentHash: 'fixture' },
        symbol: 'createAction',
        annotation: 'CLI/agent create path — always a new local sg- id today.',
        purl: stepPurl('packages/principal-studio-cli/src/commands/subsystem-model.ts'),
      },
      {
        from: 'studio-create',
        to: 'model-disk-store',
        mechanism: 'writes',
        file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
        span: { startLine: 929, endLine: 929, contentHash: 'fixture' },
        symbol: 'createSubsystemModel',
        annotation:
          'Host create writes a record into the shared ~/.principal/subsystem-models directory (CLI can write the same store).',
        purl: stepPurl('packages/subsystems-studio/src/bun/subsystem-model-store.ts'),
      },
      {
        from: 'studio-create',
        to: 'index-entry',
        mechanism: 'writes',
        file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
        span: { startLine: 951, endLine: 951, contentHash: 'fixture' },
        symbol: 'createSubsystemModel',
        annotation: 'Mirror listing fields into _index.json.',
        purl: stepPurl('packages/subsystems-studio/src/bun/subsystem-model-store.ts'),
      },
      {
        from: 'cli-create',
        to: 'open-tab',
        mechanism: 'calls',
        file: 'packages/principal-studio-cli/src/commands/subsystem-model.ts',
        span: { startLine: 205, endLine: 205, contentHash: 'fixture' },
        symbol: 'createAction',
        annotation: 'Open the local model in Studio.',
        purl: stepPurl('packages/principal-studio-cli/src/commands/subsystem-model.ts'),
      },
    ],
  },
  {
    id: 'tl-proposed-share-gist',
    title: 'Proposed: share local model as gist (create or update)',
    steps: [
      {
        from: 'gist-share-ui',
        to: 'studio-get',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
        span: { startLine: 919, endLine: 919, contentHash: 'fixture' },
        symbol: 'getSubsystemModel',
        annotation: 'Load the hydrated local record from the disk store.',
        purl: 'external:proposed#packages/subsystems-studio/src/bun/subsystem-model-store.ts',
      },
      {
        from: 'gist-share-ui',
        to: 'to-portable',
        mechanism: 'calls',
        file: 'site/src/lib/gist.ts',
        span: { startLine: 161, endLine: 161, contentHash: 'fixture' },
        symbol: 'toPortableDocument',
        annotation: 'Strip host fields so the gist file is portable-only.',
        purl: 'external:proposed#site/src/lib/gist.ts',
      },
      {
        from: 'index-entry',
        to: 'gist-ref',
        mechanism: 'reads',
        file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
        span: { startLine: 849, endLine: 849, contentHash: 'fixture' },
        symbol: 'indexEntryFor',
        annotation: 'Index/host gist ref decides PATCH existing gist vs POST a new one.',
        purl: stepPurl('packages/subsystems-studio/src/bun/subsystem-model-store.ts'),
      },
      {
        from: 'gist-share-ui',
        to: 'github-gists-api',
        mechanism: 'calls',
        file: 'site/src/lib/gist.ts',
        span: { startLine: 94, endLine: 94, contentHash: 'fixture' },
        symbol: 'loadSubsystemModelFromGist',
        annotation: 'POST /gists (first share) or PATCH /gists/{id} (subsequent) — token required.',
        purl: 'external:proposed#site/src/lib/gist.ts',
      },
      {
        from: 'gist-share-ui',
        to: 'studio-update',
        mechanism: 'calls',
        file: 'packages/subsystems-studio/src/bun/subsystem-model-store.ts',
        span: { startLine: 957, endLine: 957, contentHash: 'fixture' },
        symbol: 'updateSubsystemModel',
        annotation:
          'Stamp gist.id on the local record + index so the next share updates in place.',
        purl: 'external:proposed#packages/subsystems-studio/src/bun/subsystem-model-store.ts',
      },
    ],
  },
];

export const DRILLDOWN_DOC = {
  title: DRILLDOWN_MODEL_SOURCE.title,
  components: DRILLDOWN_COMPONENTS,
  trails: DRILLDOWN_TRAILS,
} as const;

// ---------------------------------------------------------------------------
// Membership: containers resolve from their `process` claim exactly like the
// product's `getSubsystemProcessRegions` join; externals and authored
// components carry their members explicitly.
// ---------------------------------------------------------------------------

export type ElementMembership = ReadonlyMap<string, readonly string[]>;

/**
 * The fixture's membership lookup: C4 element id → component aliases.
 * Containers claim a `process` key (members = doc components with that key);
 * externals and authored components carry `members` on the element.
 */
export function deriveElementMembers(
  elements: readonly C4Element[],
  components: readonly SubsystemComponent[] = DRILLDOWN_COMPONENTS,
): ElementMembership {
  const byProcess = new Map<string, string[]>();
  for (const c of components) {
    if (!c.process) continue;
    let list = byProcess.get(c.process);
    if (!list) {
      list = [];
      byProcess.set(c.process, list);
    }
    list.push(c.alias);
  }
  const out = new Map<string, readonly string[]>();
  for (const el of elements) {
    if (el.kind === 'container' && el.process) {
      out.set(el.id, byProcess.get(el.process) ?? []);
    } else if ((el.kind === 'component' || el.kind === 'external-system') && el.members) {
      out.set(el.id, el.members);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The authored C4 element set — the "assume they exist" part, but every claim
// is checkable against the verified document above.
// ---------------------------------------------------------------------------

function container(
  over: Partial<C4Container> & Pick<C4Container, 'id' | 'label' | 'process'>,
): C4Element {
  return {
    kind: 'container',
    containerKind: 'application',
    technology: 'Bun',
    state: 'accepted',
    parentId: SYSTEM.id,
    ...over,
  };
}

function component(
  over: Partial<C4Component> & Pick<C4Component, 'id' | 'label' | 'container'>,
): C4Element {
  return {
    kind: 'component',
    members: [],
    state: 'accepted',
    parentId: over.container,
    technology: 'Bun',
    ...over,
  };
}

function external(
  over: Partial<C4ExternalSystem> & Pick<C4ExternalSystem, 'id' | 'label'>,
): C4Element {
  return {
    kind: 'external-system',
    members: [],
    state: 'accepted',
    technology: 'REST',
    ...over,
  };
}

export const DRILLDOWN_ELEMENTS: C4Element[] = [
  container({
    id: HOST,
    label: 'Studio host',
    process: 'subsystems-studio/host',
    technology: 'Bun + Electrobun',
    description: 'Bun process owning the disk store API: create/update/get, index rows, tab opening.',
  }),
  component({
    id: 'component:host-store',
    label: 'Subsystem model store',
    container: HOST,
    members: ['studio-create', 'studio-update', 'studio-get', 'index-entry'],
    technology: 'Bun fs',
    description: 'The subsystem-model-store.ts API surface.',
  }),
  component({
    id: 'component:host-tabs',
    label: 'Tab opening',
    container: HOST,
    members: ['open-tab'],
    technology: 'Bun',
    description: 'Focus or create a subsystem-model tab.',
  }),
  container({
    id: RENDERER,
    label: 'Studio renderer',
    process: 'subsystems-studio/renderer',
    technology: 'Electrobun',
    description: 'Model list and model tab chrome — where a Share-as-gist action would sit.',
  }),
  component({
    id: 'component:renderer-views',
    label: 'Model views',
    container: RENDERER,
    members: ['studio-list', 'studio-model-view'],
    technology: 'Electrobun',
    description: 'The two model surfaces in the renderer.',
  }),
  container({
    id: CLI,
    label: 'Principal CLI',
    process: 'principal-studio-cli',
    technology: 'Bun',
    description: "Agent-facing author path: the subsystem-model create command.",
  }),
  component({
    id: 'component:cli-command',
    label: 'subsystem-model command',
    container: CLI,
    members: ['cli-create'],
    technology: 'Bun',
    description: 'The create subcommand.',
  }),
  container({
    id: SITE,
    label: 'Site — web',
    process: 'site/web',
    technology: 'React',
    description: 'The public /gist viewer — the consumer of the shared file.',
  }),
  component({
    id: 'component:site-gist',
    label: 'Gist page & loader',
    container: SITE,
    members: ['site-gist-page', 'gist-load', 'to-portable'],
    technology: 'React',
    description: '/gist page + fetch/parse + portable strip.',
  }),
  external({
    id: GITHUB,
    label: 'GitHub Gists API',
    members: ['github-gists-api'],
    technology: 'REST',
    description: 'Create or update a public gist that holds the portable JSON.',
  }),
  external({
    id: DISK,
    label: '~/.principal/subsystem-models',
    members: ['model-disk-store'],
    technology: 'JSON files',
    description: 'Shared on-disk store; not owned by any single process.',
  }),
];

function edge(
  over: Pick<C4Edge, 'id' | 'source' | 'target' | 'label'> &
    Partial<Pick<C4Edge, 'protocol' | 'mechanisms' | 'count' | 'trailRefs'>>,
): C4Edge {
  return {
    protocol: over.label,
    mechanisms: [],
    count: 0,
    ...over,
  };
}

/**
 * The container-level edges — the fold of every cross-boundary trail step.
 * Hand-authored `trailRefs` must agree with what `rollupEdgeTrailRefs`
 * computes; `c4Drilldown.test.ts` asserts the agreement.
 *
 * The renderer has no incident line (only the proposed trail touches it) and
 * the CLI never writes the store in a trail — both absences are real.
 */
export const DRILLDOWN_EDGES: C4Edge[] = [
  edge({
    id: 'e:site-github',
    source: SITE,
    target: GITHUB,
    label: 'HTTPS',
    protocol: 'HTTPS · GET /gists/{id}',
    mechanisms: ['calls'],
    count: 1,
    trailRefs: [{ trailId: 'tl-site-view-gist', stepIndices: [1] }],
  }),
  edge({
    id: 'e:cli-host',
    source: CLI,
    target: HOST,
    label: 'RPC',
    protocol: 'RPC',
    mechanisms: ['calls'],
    count: 2,
    trailRefs: [{ trailId: 'tl-persist-local-store', stepIndices: [0, 3] }],
  }),
  edge({
    id: 'e:host-disk',
    source: HOST,
    target: DISK,
    label: 'fs · JSON',
    protocol: 'fs · JSON',
    mechanisms: ['writes'],
    count: 1,
    trailRefs: [{ trailId: 'tl-persist-local-store', stepIndices: [1] }],
  }),
];

/** The drawable C4 projection — container view, closed. */
export const DRILLDOWN_C4_MODEL: C4Model = {
  view: 'container',
  system: SYSTEM,
  nodes: DRILLDOWN_ELEMENTS,
  edges: DRILLDOWN_EDGES,
};

/** Widely-readable form of the derived memberships, for tests and callers. */
export const DRILLDOWN_MEMBERS: Readonly<Record<string, readonly string[]>> =
  Object.fromEntries(deriveElementMembers(DRILLDOWN_ELEMENTS)) as Readonly<
    Record<string, readonly string[]>
  >;

export function drilldownMembersOf(elementId: string): ReadonlySet<string> | undefined {
  const members = DRILLDOWN_MEMBERS[elementId];
  return members ? new Set(members) : undefined;
}

// ---------------------------------------------------------------------------
// The rollup prototype — the read side a `buildC4Model` will do for real.
// ---------------------------------------------------------------------------

/**
 * Which trail steps cross between two elements' member sets — the provenance
 * of a rolled-up C4 edge. Pure, and the spec the fixture's hand-authored
 * `trailRefs` are asserted against.
 *
 * `membersOf` decides membership so callers can serve containers (via their
 * `process` claims), externals (single alias), or any future element kind
 * without this function knowing how membership is stored.
 */
export function rollupEdgeTrailRefs(opts: {
  source: string;
  target: string;
  trails: readonly SubsystemTrail[];
  membersOf: (elementId: string) => ReadonlySet<string> | undefined;
}): C4TrailRef[] {
  const byTrail = new Map<string, number[]>();
  for (const trail of opts.trails) {
    const sourceMembers = opts.membersOf(opts.source) ?? new Set<string>();
    const targetMembers = opts.membersOf(opts.target) ?? new Set<string>();
    trail.steps.forEach((step, index) => {
      if (sourceMembers.has(step.from) && targetMembers.has(step.to)) {
        const list = byTrail.get(trail.id) ?? [];
        list.push(index);
        byTrail.set(trail.id, list);
      }
    });
  }
  return [...byTrail.entries()].map(([trailId, stepIndices]) => ({ trailId, stepIndices }));
}

/**
 * Trail-focus helpers live in production code now (`c4TrailFocus.ts`); keep
 * these re-exports so the fixture's tests and the drill story can import them
 * from the same place they always did.
 */
export {
  deriveLitC4Edges,
  deriveTrailPlayerElements,
} from '../c4TrailFocus';

/**
 * Process claims the accepted C4 element set backs NOT at all — the set the
 * host hands the component graph so those frames draw as code boundaries.
 *
 * An element backs a process when it claims the key outright (a container's
 * `process` claim) or carries a member whose component claims it (externals
 * and L3 children carry explicit members). What nobody backs is code
 * organisation in the accepted model's eyes — the shared libraries
 * (`subsystems-react/ui`, `subsystems-core/types`) and the unbuilt proposal
 * (`proposed/studio-gist`), exactly the anti-library trio above. Those frames
 * forgo the solid runtime chrome ("deployment unit") and draw with package
 * chrome — rounded, dashed — while keeping their process identity for issue
 * targeting.
 */
export function deriveCodeProcessKeys(
  elements: readonly C4Element[],
  components: readonly SubsystemComponent[],
): Set<string> {
  const backed = new Set<string>();
  const processByAlias = new Map(components.map((c) => [c.alias, c.process]));
  for (const el of elements) {
    if (el.kind === 'container' && el.process) backed.add(el.process);
    if (el.kind !== 'component' && el.kind !== 'external-system') continue;
    for (const alias of el.members ?? []) {
      const p = processByAlias.get(alias);
      if (p) backed.add(p);
    }
  }
  const keys = new Set<string>();
  for (const c of components) if (c.process) keys.add(c.process);
  return new Set([...keys].filter((k) => !backed.has(k)));
}