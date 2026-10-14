import type {
  SubsystemComponent,
  SubsystemTrail,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/wasm-interop';

export const components: SubsystemComponent[] = [
  // —— browser/main process ——
  {
    alias: 'run-pipeline',
    process: 'browser/main',
    name: 'runPipeline',
    construct: 'function',
    symbol: 'runPipeline',
    role: 'entry',
    purl: PURL,
    file: 'host/runPipeline.ts',
    declarationSpan: {
      startLine: 13,
      endLine: 13,
      contentHash: 'b865184309bd323b4c56d05c0e4064d8',
    },
    purpose: 'Main-thread entry — orchestrates load → write → worker steps → read.',
    layer: 1,
  },
  {
    alias: 'load-guest',
    process: 'browser/main',
    name: 'loadGuest',
    construct: 'function',
    symbol: 'loadGuest',
    purl: PURL,
    file: 'host/loadGuest.ts',
    declarationSpan: {
      startLine: 12,
      endLine: 12,
      contentHash: 'c03e11bdd1f2f0d110bdaa84e097d1ef',
    },
    purpose: 'Instantiate WASM and wire worker→main imports (host_trace).',
    layer: 2,
  },
  {
    alias: 'write-bytes',
    process: 'browser/main',
    name: 'writeBytes',
    construct: 'function',
    symbol: 'writeBytes',
    purl: PURL,
    file: 'host/memory.ts',
    declarationSpan: {
      startLine: 5,
      endLine: 5,
      contentHash: 'fda28a9feb64fc6659916ef3bdb5ab77',
    },
    purpose: 'Main thread copies input into linear memory (still browser/main).',
    layer: 2,
  },
  {
    alias: 'read-u32',
    process: 'browser/main',
    name: 'readU32',
    construct: 'function',
    symbol: 'readU32',
    purl: PURL,
    file: 'host/memory.ts',
    declarationSpan: {
      startLine: 11,
      endLine: 11,
      contentHash: '9715336e2e1aeeece5718d5676f824e1',
    },
    purpose: 'Main thread reads a result the worker wrote into shared memory.',
    layer: 2,
  },
  {
    alias: 'host-trace',
    process: 'browser/main',
    name: 'host_trace',
    construct: 'function',
    symbol: 'host_trace',
    purl: PURL,
    file: 'host/loadGuest.ts',
    declarationSpan: {
      startLine: 16,
      endLine: 16,
      contentHash: 'a813b9a676c7f97850a19daee24009eb',
    },
    purpose: 'Import the worker calls — wasm/worker → browser/main boundary.',
    layer: 2,
  },

  // —— wasm/worker process ——
  {
    alias: 'normalize',
    process: 'wasm/worker',
    name: 'normalize',
    construct: 'function',
    symbol: 'normalize',
    role: 'entry',
    purl: PURL,
    file: 'guest/src/lib.rs',
    declarationSpan: {
      startLine: 20,
      endLine: 20,
      contentHash: '2d55a72cd0cadae96cf1f249a637f8d0',
    },
    purpose: 'WASM worker entry — in-place normalize; calls host_trace.',
    layer: 3,
  },
  {
    alias: 'checksum',
    process: 'wasm/worker',
    name: 'checksum',
    construct: 'function',
    symbol: 'checksum',
    role: 'entry',
    purl: PURL,
    file: 'guest/src/lib.rs',
    declarationSpan: {
      startLine: 39,
      endLine: 39,
      contentHash: '77d83aac0c0e0933f2aeed379a352a48',
    },
    purpose: 'WASM worker entry — hash normalized bytes; stash OUT_CHECKSUM.',
    layer: 3,
  },

  // —— external ——
  {
    alias: 'WasmRuntime',
    name: 'Wasm runtime',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Browser engine that runs the wasm/worker module.',
    layer: 4,
  },
];

export const trails = [
  {
    "id": "tl-pipeline",
    "title": "Full pipeline (browser/main ↔ wasm/worker)",
    "steps": [
      {
        "from": "run-pipeline",
        "to": "load-guest",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "span": {
          "startLine": 14,
          "endLine": 14,
          "contentHash": "de9147a62a140bfdb72f585935c96d1c"
        },
        "purl": PURL,
        "symbol": "loadGuest",
        "annotation": "Stay on browser/main — load the wasm/worker module."
      },
      {
        "from": "load-guest",
        "to": "WasmRuntime",
        "mechanism": "calls",
        "file": "host/loadGuest.ts",
        "span": {
          "startLine": 13,
          "endLine": 13,
          "contentHash": "a842cf98c6a2d82bf7f85eb916f5f5a8"
        },
        "purl": PURL,
        "symbol": "instantiateStreaming",
        "annotation": "Runtime brings up the wasm/worker process."
      },
      {
        "from": "load-guest",
        "to": "host-trace",
        "mechanism": "registers-into",
        "file": "host/loadGuest.ts",
        "span": {
          "startLine": 16,
          "endLine": 16,
          "contentHash": "a813b9a676c7f97850a19daee24009eb"
        },
        "purl": PURL,
        "symbol": "host_trace",
        "annotation": "Register the worker→main callback before any worker code runs."
      },
      {
        "from": "run-pipeline",
        "to": "write-bytes",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "span": {
          "startLine": 17,
          "endLine": 17,
          "contentHash": "6890d882a096b9ad99451876be449cb2"
        },
        "purl": PURL,
        "symbol": "writeBytes",
        "annotation": "Main thread writes input into shared memory (still browser/main)."
      },
      {
        "from": "run-pipeline",
        "to": "normalize",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "span": {
          "startLine": 20,
          "endLine": 20,
          "contentHash": "26e017b608a86aebb216936d33c4867f"
        },
        "purl": PURL,
        "symbol": "guest.normalize",
        "annotation": "Cross into wasm/worker."
      },
      {
        "from": "normalize",
        "to": "host-trace",
        "mechanism": "calls",
        "file": "guest/src/lib.rs",
        "span": {
          "startLine": 22,
          "endLine": 22,
          "contentHash": "52ab9bf9464427951aad5127f70ee53e"
        },
        "purl": PURL,
        "symbol": "host_trace",
        "annotation": "Worker calls back into browser/main (trace normalize)."
      },
      {
        "from": "run-pipeline",
        "to": "checksum",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "span": {
          "startLine": 21,
          "endLine": 21,
          "contentHash": "ed238fc6b506ff6fae09c781689362b8"
        },
        "purl": PURL,
        "symbol": "guest.checksum",
        "annotation": "Main thread calls the second worker entry (still crossing the boundary)."
      },
      {
        "from": "checksum",
        "to": "host-trace",
        "mechanism": "calls",
        "file": "guest/src/lib.rs",
        "span": {
          "startLine": 41,
          "endLine": 41,
          "contentHash": "557bc4a72a979dfe7daa3b6ca4aad1e9"
        },
        "purl": PURL,
        "symbol": "host_trace",
        "annotation": "Worker→main again for checksum progress."
      },
      {
        "from": "run-pipeline",
        "to": "read-u32",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "span": {
          "startLine": 24,
          "endLine": 24,
          "contentHash": "ee8f60813f934b78fc03dc4a385a30b7"
        },
        "purl": PURL,
        "symbol": "readU32",
        "annotation": "Back on browser/main — read the value the worker stashed."
      }
    ]
  },
  {
    "id": "tl-guest-only",
    "title": "Inside wasm/worker: normalize → checksum",
    "steps": [
      {
        "from": "normalize",
        "to": "host-trace",
        "mechanism": "calls",
        "file": "guest/src/lib.rs",
        "span": {
          "startLine": 20,
          "endLine": 20,
          "contentHash": "2d55a72cd0cadae96cf1f249a637f8d0"
        },
        "purl": PURL,
        "symbol": "normalize",
        "annotation": "Worker entry — mutate the shared buffer in place."
      },
      {
        "from": "checksum",
        "to": "host-trace",
        "mechanism": "calls",
        "file": "guest/src/lib.rs",
        "span": {
          "startLine": 39,
          "endLine": 39,
          "contentHash": "77d83aac0c0e0933f2aeed379a352a48"
        },
        "purl": PURL,
        "symbol": "checksum",
        "annotation": "Second worker entry — hash the normalized slice."
      }
    ]
  }
] as SubsystemTrail[];

export const title = 'Browser main ↔ WASM worker';

export const description =
  'Two clear process regions: **browser/main** (load, memory I/O, orchestrate) and **wasm/worker** (`normalize` → `checksum`). Main calls into the worker; the worker calls back via `host_trace`. Open **Trails** for the full cross-boundary pipeline.';
