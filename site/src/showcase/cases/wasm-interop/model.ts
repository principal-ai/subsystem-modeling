import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
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
    declarationRef: {
      file: 'host/runPipeline.ts',
      startLine: 13,
      lineHash: 'b865184309bd323b4c56d05c0e4064d8',
      capturedAt: '2025-01-01T00:00:00.000Z',
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
    declarationRef: {
      file: 'host/loadGuest.ts',
      startLine: 12,
      lineHash: 'c03e11bdd1f2f0d110bdaa84e097d1ef',
      capturedAt: '2025-01-01T00:00:00.000Z',
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
    declarationRef: {
      file: 'host/memory.ts',
      startLine: 5,
      lineHash: 'fda28a9feb64fc6659916ef3bdb5ab77',
      capturedAt: '2025-01-01T00:00:00.000Z',
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
    declarationRef: {
      file: 'host/memory.ts',
      startLine: 11,
      lineHash: '9715336e2e1aeeece5718d5676f824e1',
      capturedAt: '2025-01-01T00:00:00.000Z',
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
    declarationRef: {
      file: 'host/loadGuest.ts',
      startLine: 16,
      lineHash: 'a813b9a676c7f97850a19daee24009eb',
      capturedAt: '2025-01-01T00:00:00.000Z',
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
    declarationRef: {
      file: 'guest/src/lib.rs',
      startLine: 20,
      lineHash: '2d55a72cd0cadae96cf1f249a637f8d0',
      capturedAt: '2025-01-01T00:00:00.000Z',
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
    declarationRef: {
      file: 'guest/src/lib.rs',
      startLine: 39,
      lineHash: '77d83aac0c0e0933f2aeed379a352a48',
      capturedAt: '2025-01-01T00:00:00.000Z',
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

export const relations = [] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-pipeline",
    "title": "Full pipeline (browser/main ↔ wasm/worker)",
    "steps": [
      {
        "from": "run-pipeline",
        "to": "load-guest",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "line": 14,
        "purl": PURL,
        "symbol": "loadGuest",
        "annotation": "Stay on browser/main — load the wasm/worker module."
      },
      {
        "from": "load-guest",
        "to": "WasmRuntime",
        "mechanism": "calls",
        "file": "host/loadGuest.ts",
        "line": 13,
        "purl": PURL,
        "symbol": "instantiateStreaming",
        "annotation": "Runtime brings up the wasm/worker process."
      },
      {
        "from": "load-guest",
        "to": "host-trace",
        "mechanism": "registers-into",
        "file": "host/loadGuest.ts",
        "line": 16,
        "purl": PURL,
        "symbol": "host_trace",
        "annotation": "Register the worker→main callback before any worker code runs."
      },
      {
        "from": "run-pipeline",
        "to": "write-bytes",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "line": 17,
        "purl": PURL,
        "symbol": "writeBytes",
        "annotation": "Main thread writes input into shared memory (still browser/main)."
      },
      {
        "from": "run-pipeline",
        "to": "normalize",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "line": 20,
        "purl": PURL,
        "symbol": "guest.normalize",
        "annotation": "Cross into wasm/worker."
      },
      {
        "from": "normalize",
        "to": "host-trace",
        "mechanism": "calls",
        "file": "guest/src/lib.rs",
        "line": 22,
        "purl": PURL,
        "symbol": "host_trace",
        "annotation": "Worker calls back into browser/main (trace normalize)."
      },
      {
        "from": "run-pipeline",
        "to": "checksum",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "line": 21,
        "purl": PURL,
        "symbol": "guest.checksum",
        "annotation": "Main thread calls the second worker entry (still crossing the boundary)."
      },
      {
        "from": "checksum",
        "to": "host-trace",
        "mechanism": "calls",
        "file": "guest/src/lib.rs",
        "line": 41,
        "purl": PURL,
        "symbol": "host_trace",
        "annotation": "Worker→main again for checksum progress."
      },
      {
        "from": "run-pipeline",
        "to": "read-u32",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "line": 24,
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
        "line": 20,
        "purl": PURL,
        "symbol": "normalize",
        "annotation": "Worker entry — mutate the shared buffer in place."
      },
      {
        "from": "checksum",
        "to": "host-trace",
        "mechanism": "calls",
        "file": "guest/src/lib.rs",
        "line": 39,
        "purl": PURL,
        "symbol": "checksum",
        "annotation": "Second worker entry — hash the normalized slice."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Browser main ↔ WASM worker';

export const description =
  'Two clear process regions: **browser/main** (load, memory I/O, orchestrate) and **wasm/worker** (`normalize` → `checksum`). Main calls into the worker; the worker calls back via `host_trace`. Open **Walkthroughs** for the full cross-boundary pipeline.';
