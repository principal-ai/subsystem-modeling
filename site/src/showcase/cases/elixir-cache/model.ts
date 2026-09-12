import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

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

export const relations = [] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-boot",
    "title": "Boot under supervisor",
    "steps": [
      {
        "from": "application",
        "to": "Supervisor",
        "mechanism": "calls",
        "file": "lib/notes/application.ex",
        "line": 12,
        "symbol": "Supervisor.start_link",
        "annotation": "Application starts the supervision tree."
      },
      {
        "from": "application",
        "to": "cache",
        "mechanism": "registers-into",
        "file": "lib/notes/application.ex",
        "line": 8,
        "symbol": "Notes.Cache",
        "annotation": "Cache listed as a child spec."
      },
      {
        "from": "Supervisor",
        "to": "cache",
        "mechanism": "watches",
        "file": "lib/notes/cache.ex",
        "line": 7,
        "symbol": "start_link",
        "annotation": "Supervisor starts (and can restart) the GenServer."
      }
    ]
  },
  {
    "id": "tl-get",
    "title": "Sync get",
    "steps": [
      {
        "from": "client",
        "to": "cache",
        "mechanism": "calls",
        "file": "lib/notes/client.ex",
        "line": 4,
        "symbol": "Cache.get",
        "annotation": "Client issues a call."
      },
      {
        "from": "client",
        "to": "cache",
        "mechanism": "calls",
        "file": "lib/notes/cache.ex",
        "line": 11,
        "symbol": "GenServer.call",
        "annotation": "Synchronous request into the GenServer."
      },
      {
        "from": "client",
        "to": "cache",
        "mechanism": "calls",
        "file": "lib/notes/cache.ex",
        "line": 21,
        "symbol": "handle_call",
        "annotation": "Server replies from process state."
      }
    ]
  },
  {
    "id": "tl-put",
    "title": "Async put",
    "steps": [
      {
        "from": "client",
        "to": "cache",
        "mechanism": "calls",
        "file": "lib/notes/client.ex",
        "line": 7,
        "symbol": "Cache.put",
        "annotation": "Client casts a write."
      },
      {
        "from": "client",
        "to": "cache",
        "mechanism": "calls",
        "file": "lib/notes/cache.ex",
        "line": 13,
        "symbol": "GenServer.cast",
        "annotation": "Asynchronous message — no reply."
      },
      {
        "from": "client",
        "to": "cache",
        "mechanism": "calls",
        "file": "lib/notes/cache.ex",
        "line": 26,
        "symbol": "handle_cast",
        "annotation": "Server updates its map state."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Elixir GenServer cache';
export const description =
  'OTP **Application → Supervisor → GenServer** cache: sync `call` gets, async `cast` puts, crash-restarted by the supervisor. Open **Walkthroughs** for boot, get, and put.';
