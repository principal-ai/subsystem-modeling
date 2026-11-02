/**
 * Storybook fixtures for the C4 sketch gallery.
 *
 * The two `OPENBOT_*` / `MAINTENANCE_BRIDGE_*` sketches are the real authored
 * sketches from `~/.principal/c4-sketches`, kept verbatim so the stories
 * exercise the container shapes and edge counts the views actually see.
 *
 * `STUDIO_SKETCH` is this repo's own system drawn at the same level: host,
 * renderer, CLI, site, and the on-disk model store. `CONTAINER_MATRIX_SKETCH`
 * and `DESCRIPTION_BOUNDARY_SKETCH` are deliberate stress rows for the sidebar
 * (kind, state, technology, member count, long labels, 200-char description).
 */

import type {
  C4Component,
  C4Container,
  C4Edge,
  C4ExternalSystem,
  C4Person,
} from '../c4';
import type { C4Sketch } from '../c4Sketch';
import openbot from './c4Sketches/openbot.json';
import maintenanceBridge from './c4Sketches/maintenance-bridge.json';

const PURL = 'pkg:github/principal-ai/subsystem-modeling';

function container(
  over: Partial<C4Container> & Pick<C4Container, 'id' | 'label'>,
): C4Container {
  return {
    kind: 'container',
    containerKind: 'application',
    technology: '',
    state: 'proposed',
    ...over,
  };
}

function component(
  over: Partial<C4Component> & Pick<C4Component, 'id' | 'label' | 'container'>,
): C4Component {
  return {
    kind: 'component',
    technology: '',
    state: 'proposed',
    ...over,
  };
}

function external(
  over: Partial<C4ExternalSystem> & Pick<C4ExternalSystem, 'id' | 'label'>,
): C4ExternalSystem {
  return { kind: 'external-system', state: 'proposed', ...over };
}

function person(
  over: Partial<C4Person> & Pick<C4Person, 'id' | 'label'>,
): C4Person {
  return { kind: 'person', state: 'proposed', ...over };
}

let edgeSeq = 0;
function edge(
  source: string,
  target: string,
  label: string,
  over: Partial<C4Edge> = {},
): C4Edge {
  edgeSeq += 1;
  return {
    id: `e:${edgeSeq}`,
    source,
    target,
    label,
    protocol: label,
    mechanisms: ['calls'],
    count: 1,
    ...over,
  };
}

/** This repo's system containers, at the C4 container level. */
export const STUDIO_SKETCH: C4Sketch = {
  id: 'c4s-gallery-studio',
  title: 'Subsystem Modeling — system containers',
  repoKeys: [PURL],
  author: 'storybook',
  description:
    'The shipped system: Studio host and renderer, the Principal CLI, the web site, and the on-disk model store they share.',
  notes:
    '## System containers\n\nThis sketch draws the containers this repository actually ships:\n\n- **Studio host** — Bun + Electrobun process that owns the disk store API.\n- **Studio renderer** — React surfaces for the model list and model tabs.\n- **Principal CLI** — the agent-facing author path.\n- **Site — web** — the public gist viewer.\n- **Model store** — JSON files under `~/.principal/subsystem-models`.\n\nEverything is `proposed`: a sketch is a hypothesis, never an accepted element.',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  model: {
    view: 'container',
    system: { id: 'system:subsystem-modeling', label: 'Subsystem Modeling', repoKey: PURL },
    nodes: [
      container({
        id: 'container:studio-host',
        label: 'Studio host',
        technology: 'Bun + Electrobun',
        process: 'subsystems-studio/host',
        description: 'Owns the disk store API: create, update, get, index rows, tab opening.',
      }),
      component({
        id: 'component:host-store',
        label: 'Subsystem model store',
        container: 'container:studio-host',
        technology: 'Bun fs',
      }),
      component({
        id: 'component:host-tabs',
        label: 'Tab opening',
        container: 'container:studio-host',
        technology: 'Bun',
      }),
      container({
        id: 'container:studio-renderer',
        label: 'Studio renderer',
        technology: 'Electrobun + React',
        process: 'subsystems-studio/renderer',
        description: 'Model list and model tab chrome.',
      }),
      component({
        id: 'component:renderer-views',
        label: 'Model views',
        container: 'container:studio-renderer',
        technology: 'React',
      }),
      component({
        id: 'component:renderer-c4',
        label: 'C4 views',
        container: 'container:studio-renderer',
        technology: 'React + React Flow',
      }),
      container({
        id: 'container:principal-cli',
        label: 'Principal CLI',
        technology: 'Bun',
        process: 'principal-studio-cli',
        description: 'Agent-facing author path for subsystem models.',
      }),
      component({
        id: 'component:cli-create',
        label: 'subsystem-model command',
        container: 'container:principal-cli',
        technology: 'Bun',
      }),
      container({
        id: 'container:site-web',
        label: 'Site — web',
        technology: 'React + Vite',
        process: 'site/web',
        description: 'The public gist viewer.',
      }),
      component({
        id: 'component:site-gist',
        label: 'Gist page & loader',
        container: 'container:site-web',
        technology: 'React',
      }),
      container({
        id: 'container:model-store',
        label: 'Model store',
        containerKind: 'data-store',
        technology: 'JSON on disk',
        description: 'Shared on-disk store; not owned by any one process.',
      }),
      external({
        id: 'external:github',
        label: 'GitHub Gists API',
        technology: 'REST',
        members: ['github-gists-api'],
      }),
      person({ id: 'person:maintainer', label: 'Maintainer' }),
    ],
    edges: [
      edge('person:maintainer', 'container:studio-renderer', 'uses'),
      edge('container:studio-renderer', 'container:studio-host', 'RPC'),
      edge('container:principal-cli', 'container:studio-host', 'calls'),
      edge('container:studio-host', 'container:model-store', 'writes'),
      edge('container:studio-host', 'external:github', 'HTTPS'),
      edge('container:site-web', 'external:github', 'reads', { mechanisms: ['reads'] }),
    ],
  },
};

/**
 * One row per drawer/row variant: application vs data-store, accepted vs
 * proposed, technology brand vs missing, long labels, and 0 / 1 / 6 members.
 */
export const CONTAINER_MATRIX_SKETCH: C4Sketch = {
  id: 'c4s-gallery-matrix',
  title: 'Container matrix',
  repoKeys: [PURL],
  author: 'storybook',
  description:
    'Every container-row variant in one sketch: application/data-store, accepted/proposed, known/missing technology, long labels, and zero or many members.',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  model: {
    view: 'container',
    system: { id: 'system:matrix', label: 'Container matrix' },
    nodes: [
      container({
        id: 'container:mono',
        label: 'Bun service',
        technology: 'Bun + Hono',
        state: 'accepted',
        description: 'Accepted application with a known technology brand.',
      }),
      component({
        id: 'component:mono-handler',
        label: 'HTTP handler',
        container: 'container:mono',
        technology: 'Hono',
        state: 'accepted',
      }),
      container({
        id: 'container:draft-worker',
        label: 'Draft worker',
        technology: 'Bun',
        description: 'Proposed application — dashed card and a proposed chip in the row.',
      }),
      component({
        id: 'component:worker-sweep',
        label: 'Routine sweep',
        container: 'container:draft-worker',
        technology: 'Bun',
      }),
      component({
        id: 'component:worker-queue',
        label: 'Queue reader',
        container: 'container:draft-worker',
        technology: 'PostgreSQL',
      }),
      container({
        id: 'container:postgres',
        label: 'PostgreSQL + pgvector',
        containerKind: 'data-store',
        technology: 'PostgreSQL 17 + pgvector',
        state: 'accepted',
        description: 'Accepted data store with a long technology string.',
      }),
      component({
        id: 'component:product-schema',
        label: 'Product schema',
        container: 'container:postgres',
        technology: 'Drizzle + SQL',
        state: 'accepted',
      }),
      container({
        id: 'container:cache',
        label: 'Ephemeral cache',
        containerKind: 'data-store',
        technology: '',
        description: 'Data store with no stated technology — the card shows the gap.',
      }),
      container({
        id: 'container:long-label',
        label: 'An intentionally long container label that has to truncate in the sidebar',
        technology: 'React 19 + Vite + TanStack Router + TypeScript',
        state: 'accepted',
        description: 'Long label and long technology; the row ellipsizes both.',
      }),
      component({
        id: 'component:long-label-view',
        label: 'Router view',
        container: 'container:long-label',
        technology: 'React',
        state: 'accepted',
      }),
      container({
        id: 'container:no-members',
        label: 'Empty but accepted',
        technology: 'Rust',
        state: 'accepted',
        description: 'Zero components — member count reads 0.',
      }),
      container({
        id: 'container:many-members',
        label: 'Crowded container',
        technology: 'Bun',
        state: 'accepted',
        description: 'Six components, for the row count and the opened card.',
      }),
      ...[
        ['orders', 'Orders service', 'Bun'],
        ['billing', 'Billing service', 'Bun'],
        ['audit', 'Audit trail', 'PostgreSQL'],
        ['identity', 'Identity', 'better-auth'],
        ['approvals', 'Approvals', 'Bun'],
        ['delivery', 'Delivery', 'Hono'],
      ].map(([slug, label, technology]) =>
        component({
          id: `component:many-${slug}`,
          label: label!,
          container: 'container:many-members',
          technology: technology!,
          state: 'accepted',
        }),
      ),
    ],
    edges: [
      edge('container:mono', 'container:postgres', 'writes'),
      edge('container:draft-worker', 'container:postgres', 'reads', { mechanisms: ['reads'] }),
      edge('container:mono', 'container:cache', 'caches', { mechanisms: ['writes'] }),
      edge('container:long-label', 'container:mono', 'calls'),
      edge('container:many-members', 'container:postgres', 'writes'),
    ],
  },
};

/** A description at the 200-character boundary plus long Markdown notes. */
export const DESCRIPTION_BOUNDARY_SKETCH: C4Sketch = {
  id: 'c4s-gallery-description',
  title: 'Description boundary',
  repoKeys: [PURL],
  author: 'storybook',
  description:
    'A deliberately long description that fills the 200-character budget so the sidebar header can be sized at its limit. It names the host, renderer, store, CLI, and sites without needing extended notes!',
  notes:
    '## Overview\n\nThe short description stays at the top of the sidebar and the header is sized by it. This extended document is what **Show more** opens.\n\n### What it covers\n\n- A description at the 200-character cap.\n- Markdown notes long enough to need the overlay.\n- A single container so the sidebar row is the only other content.\n\n### Why it matters\n\nThe cap makes the header height predictable; the extended notes keep the detail out of the canvas until someone asks for it.',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  model: {
    view: 'container',
    system: { id: 'system:boundary', label: 'Description boundary' },
    nodes: [
      container({
        id: 'container:only',
        label: 'Single container',
        technology: 'Bun',
        description: 'The one row under a long description.',
      }),
      component({
        id: 'component:only-handler',
        label: 'Handler',
        container: 'container:only',
        technology: 'Hono',
      }),
    ],
    edges: [],
  },
};

/** The real OpenBot architecture sketch (12 containers, 32 authored edges). */
export const OPENBOT_SKETCH = openbot as unknown as C4Sketch;

/** The real Studio → OpenBot maintenance bridge sketch (6 containers). */
export const MAINTENANCE_BRIDGE_SKETCH = maintenanceBridge as unknown as C4Sketch;

/** Legacy shape: notes only, no short description (tests the fallback preview). */
export const NOTES_ONLY_SKETCH: C4Sketch = {
  ...STUDIO_SKETCH,
  id: 'c4s-gallery-notes-only',
  title: 'Notes only — no description',
  description: undefined,
  notes:
    '## About this sketch\n\nThis sketch has no short description. The sidebar falls back to a clamped preview of these notes, and **Show more** opens the full Markdown in the Overview overlay.\n\n- Use this story to check the legacy shape.\n- Existing sketches with only `notes` keep working.',
};
