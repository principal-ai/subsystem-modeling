/**
 * Storybook fixture for an authored C4 sketch.
 *
 * A standalone hypothesis: containers, a component, an external, a person,
 * and two authored lines. No model or grounding is involved.
 */

import type { C4Sketch } from '../c4Sketch';

const PURL = 'pkg:github/acme/widget';

export const SKETCH_FIXTURE: C4Sketch = {
  id: 'c4s-story',
  title: 'Acme widget architecture',
  repoKeys: [PURL],
  author: 'storybook',
  notes:
    '## About this sketch\n\nThis is an **authored hypothesis** for the Acme widget. It describes the host and worker containers, the store inside the host, and the GitHub integration.\n\n- The worker calls the host over RPC.\n- The host calls GitHub over HTTPS.\n- Nothing here is verified or promoted.',
  createdAt: '2026-10-25T00:00:00.000Z',
  updatedAt: '2026-10-25T00:00:00.000Z',
  model: {
    view: 'container',
    system: { id: 'system:acme', label: 'Acme' },
    nodes: [
      {
        kind: 'container',
        id: 'container:host',
        label: 'Host',
        containerKind: 'application',
        technology: 'Bun',
        process: 'acme/host',
        state: 'proposed',
        description: 'The long-lived host process.',
      },
      {
        kind: 'container',
        id: 'container:worker',
        label: 'Worker',
        containerKind: 'application',
        technology: 'Bun',
        process: 'acme/worker',
        state: 'proposed',
        description: 'The background worker.',
      },
      {
        kind: 'component',
        id: 'component:store',
        label: 'Store',
        container: 'container:host',
        technology: 'Postgres',
        members: ['store', 'ghost'],
        state: 'proposed',
        description: 'Persistence inside the host.',
      },
      {
        kind: 'external-system',
        id: 'external:github',
        label: 'GitHub',
        technology: 'REST',
        members: ['github'],
        state: 'proposed',
        description: 'External source control.',
      },
      {
        kind: 'person',
        id: 'person:dev',
        label: 'Developer',
        state: 'proposed',
        description: 'Uses the system.',
      },
    ],
    edges: [
      {
        id: 'e:host-github',
        source: 'container:host',
        target: 'external:github',
        label: 'HTTPS',
        protocol: 'HTTPS',
        mechanisms: ['calls'],
        count: 1,
      },
      {
        id: 'e:worker-host',
        source: 'container:worker',
        target: 'container:host',
        label: 'RPC',
        protocol: 'RPC',
        mechanisms: ['calls'],
        count: 1,
      },
    ],
  },
};

