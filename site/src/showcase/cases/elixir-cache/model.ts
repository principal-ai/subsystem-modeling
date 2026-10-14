import type {
  SubsystemComponent,
  SubsystemTrail,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/elixir-cache';

export const components: SubsystemComponent[] = [
  {
    alias: 'application',
    process: 'elixir-cache',
    name: 'Notes.Application',
    construct: 'class',
    symbol: 'Notes.Application',
    role: 'entry',
    framework: 'otp',
    stereotype: 'application',
    purl: PURL,
    file: 'lib/notes/application.ex',
    declarationSpan: {
      startLine: 1,
      endLine: 1,
      contentHash: 'a952f2f7c0ea3280c6a3bc4e9ad554e4',
    },
    module: 'lib/notes/application.ex',
    purpose: 'OTP application — starts the supervisor tree.',
    layer: 1,
  },
  {
    alias: 'cache',
    process: 'elixir-cache',
    name: 'Notes.Cache',
    construct: 'class',
    symbol: 'Notes.Cache',
    framework: 'otp',
    stereotype: 'gen_server',
    purl: PURL,
    file: 'lib/notes/cache.ex',
    declarationSpan: {
      startLine: 1,
      endLine: 1,
      contentHash: 'd50e5a1104f8c4ff10f238cfe40931bc',
    },
    module: 'lib/notes/cache.ex',
    purpose: 'GenServer — sync get, async put; restarted on crash.',
    layer: 2,
  },
  {
    alias: 'client',
    process: 'elixir-cache',
    name: 'Notes.Client',
    construct: 'class',
    symbol: 'Notes.Client',
    purl: PURL,
    file: 'lib/notes/client.ex',
    declarationSpan: {
      startLine: 1,
      endLine: 1,
      contentHash: 'a57958f54d0ccc51e00ba5b913288b93',
    },
    module: 'lib/notes/client.ex',
    purpose: 'Call-site helper used by other processes.',
    layer: 2,
  },
  {
    alias: 'Supervisor',
    name: 'Notes.Supervisor',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'OTP supervisor — one_for_one restarts the cache.',
    layer: 3,
  },
];

export const trails = [
  {
    "id": "tl-boot",
    "title": "Boot under supervisor",
    "steps": [
      {
        "from": "application",
        "to": "Supervisor",
        "mechanism": "calls",
        "file": "lib/notes/application.ex",
        "span": {
          "startLine": 12,
          "endLine": 12,
          "contentHash": "222fcd84e1d0977c107e17a1ae26c33f"
        },
        "purl": PURL,
        "symbol": "Supervisor.start_link",
        "annotation": "Application starts the supervision tree."
      },
      {
        "from": "application",
        "to": "cache",
        "mechanism": "registers-into",
        "file": "lib/notes/application.ex",
        "span": {
          "startLine": 8,
          "endLine": 8,
          "contentHash": "86deaf4444e8cb8a208029f6d528d2b6"
        },
        "purl": PURL,
        "symbol": "Notes.Cache",
        "annotation": "Cache listed as a child spec."
      },
      {
        "from": "Supervisor",
        "to": "cache",
        "mechanism": "watches",
        "file": "lib/notes/cache.ex",
        "span": {
          "startLine": 7,
          "endLine": 7,
          "contentHash": "681bb3a1b0bf31f4f5641a4fff1649af"
        },
        "purl": PURL,
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
        "span": {
          "startLine": 4,
          "endLine": 4,
          "contentHash": "1247fe12e8b76fb0a5deeaf49315f99f"
        },
        "purl": PURL,
        "symbol": "Cache.get",
        "annotation": "Client issues a call."
      },
      {
        "from": "client",
        "to": "cache",
        "mechanism": "calls",
        "file": "lib/notes/cache.ex",
        "span": {
          "startLine": 11,
          "endLine": 11,
          "contentHash": "e649b731bc5f5f207addc5e77e9879d9"
        },
        "purl": PURL,
        "symbol": "GenServer.call",
        "annotation": "Synchronous request into the GenServer."
      },
      {
        "from": "client",
        "to": "cache",
        "mechanism": "calls",
        "file": "lib/notes/cache.ex",
        "span": {
          "startLine": 21,
          "endLine": 21,
          "contentHash": "7cfa77cebede71c9d7858b5091b9e254"
        },
        "purl": PURL,
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
        "span": {
          "startLine": 7,
          "endLine": 7,
          "contentHash": "a64dca6aca5a8489868f31fafece2b86"
        },
        "purl": PURL,
        "symbol": "Cache.put",
        "annotation": "Client casts a write."
      },
      {
        "from": "client",
        "to": "cache",
        "mechanism": "calls",
        "file": "lib/notes/cache.ex",
        "span": {
          "startLine": 13,
          "endLine": 13,
          "contentHash": "80ce1b342ce051ab78d3b23fb350e55b"
        },
        "purl": PURL,
        "symbol": "GenServer.cast",
        "annotation": "Asynchronous message — no reply."
      },
      {
        "from": "client",
        "to": "cache",
        "mechanism": "calls",
        "file": "lib/notes/cache.ex",
        "span": {
          "startLine": 26,
          "endLine": 26,
          "contentHash": "865556d5933d92a79b450b3b712313be"
        },
        "purl": PURL,
        "symbol": "handle_cast",
        "annotation": "Server updates its map state."
      }
    ]
  }
] as SubsystemTrail[];

export const title = 'Elixir GenServer cache';
export const description =
  'OTP **Application → Supervisor → GenServer** cache: sync `call` gets, async `cast` puts, crash-restarted by the supervisor. Open **Trails** for boot, get, and put.';
