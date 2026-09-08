import type {
  SubsystemComponent,
  SubsystemComponentEdge,
} from '@principal-ai/subsystems-react';
import type { SubsystemThroughline } from '@principal-ai/subsystems-react/dist/subsystem/model.js';

const PURL = 'pkg:github/you/elixir-cache';

export const components: SubsystemComponent[] = [
  {
    id: 'application',
    process: 'elixir-cache',
    name: 'Notes.Application',
    construct: 'module',
    symbol: 'Notes.Application',
    role: 'entry',
    framework: 'otp',
    stereotype: 'application',
    purl: PURL,
    file: 'lib/notes/application.ex',
    purpose: 'OTP application — starts the supervisor tree.',
    layer: 1,
  },
  {
    id: 'cache',
    process: 'elixir-cache',
    name: 'Notes.Cache',
    construct: 'module',
    symbol: 'Notes.Cache',
    framework: 'otp',
    stereotype: 'gen_server',
    purl: PURL,
    file: 'lib/notes/cache.ex',
    purpose: 'GenServer — sync get, async put; restarted on crash.',
    layer: 2,
  },
  {
    id: 'client',
    process: 'elixir-cache',
    name: 'Notes.Client',
    construct: 'module',
    symbol: 'Notes.Client',
    purl: PURL,
    file: 'lib/notes/client.ex',
    purpose: 'Call-site helper used by other processes.',
    layer: 2,
  },
  {
    id: 'Supervisor',
    name: 'Notes.Supervisor',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'OTP supervisor — one_for_one restarts the cache.',
    layer: 3,
  },
];

export const edges: SubsystemComponentEdge[] = [
  { id: 'e0', from: 'application', to: 'Supervisor', mechanism: 'calls' },
  { id: 'e1', from: 'application', to: 'cache', mechanism: 'registers-into' },
  { id: 'e2', from: 'client', to: 'cache', mechanism: 'calls' },
  { id: 'e3', from: 'Supervisor', to: 'cache', mechanism: 'watches' },
];

export const throughlines: SubsystemThroughline[] = [
  {
    id: 'tl-boot',
    title: 'Boot under supervisor',
    steps: [
      { edgeId: 'e0', file: 'lib/notes/application.ex', line: 12, symbol: 'Supervisor.start_link', annotation: 'Application starts the supervision tree.' },
      { edgeId: 'e1', file: 'lib/notes/application.ex', line: 8, symbol: 'Notes.Cache', annotation: 'Cache listed as a child spec.' },
      { edgeId: 'e3', file: 'lib/notes/cache.ex', line: 7, symbol: 'start_link', annotation: 'Supervisor starts (and can restart) the GenServer.' },
    ],
  },
  {
    id: 'tl-get',
    title: 'Sync get',
    steps: [
      { edgeId: 'e2', file: 'lib/notes/client.ex', line: 4, symbol: 'Cache.get', annotation: 'Client issues a call.' },
      { edgeId: 'e2', file: 'lib/notes/cache.ex', line: 11, symbol: 'GenServer.call', annotation: 'Synchronous request into the GenServer.' },
      { edgeId: 'e2', file: 'lib/notes/cache.ex', line: 21, symbol: 'handle_call', annotation: 'Server replies from process state.' },
    ],
  },
  {
    id: 'tl-put',
    title: 'Async put',
    steps: [
      { edgeId: 'e2', file: 'lib/notes/client.ex', line: 7, symbol: 'Cache.put', annotation: 'Client casts a write.' },
      { edgeId: 'e2', file: 'lib/notes/cache.ex', line: 13, symbol: 'GenServer.cast', annotation: 'Asynchronous message — no reply.' },
      { edgeId: 'e2', file: 'lib/notes/cache.ex', line: 26, symbol: 'handle_cast', annotation: 'Server updates its map state.' },
    ],
  },
];

export const title = 'Elixir GenServer cache';
export const description =
  'OTP **Application → Supervisor → GenServer** cache: sync `call` gets, async `cast` puts, crash-restarted by the supervisor. Open **Flows** for boot, get, and put.';
