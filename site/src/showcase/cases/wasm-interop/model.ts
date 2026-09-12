import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/wasm-interop';

export const components: SubsystemComponent[] = [
  // —— browser/host process ——
  {
    id: 'run-pipeline',
    process: 'browser/host',
    name: 'runPipeline',
    construct: 'function',
    symbol: 'runPipeline',
    role: 'entry',
    purl: PURL,
    file: 'host/runPipeline.ts',
    purpose: 'Host entry — orchestrates load → write → guest steps → read.',
    layer: 1,
  },
  {
    id: 'load-guest',
    process: 'browser/host',
    name: 'loadGuest',
    construct: 'function',
    symbol: 'loadGuest',
    purl: PURL,
    file: 'host/loadGuest.ts',
    purpose: 'Instantiate WASM and wire guest→host imports (host_trace).',
    layer: 2,
  },
  {
    id: 'write-bytes',
    process: 'browser/host',
    name: 'writeBytes',
    construct: 'function',
    symbol: 'writeBytes',
    purl: PURL,
    file: 'host/memory.ts',
    purpose: 'Host copies input into linear memory (still host process).',
    layer: 2,
  },
  {
    id: 'read-u32',
    process: 'browser/host',
    name: 'readU32',
    construct: 'function',
    symbol: 'readU32',
    purl: PURL,
    file: 'host/memory.ts',
    purpose: 'Host reads a result the guest wrote into shared memory.',
    layer: 2,
  },
  {
    id: 'host-trace',
    process: 'browser/host',
    name: 'host_trace',
    construct: 'function',
    symbol: 'host_trace',
    purl: PURL,
    file: 'host/loadGuest.ts',
    purpose: 'Import the guest calls — guest→host boundary.',
    layer: 2,
  },

  // —— wasm/guest process ——
  {
    id: 'normalize',
    process: 'wasm/guest',
    name: 'normalize',
    construct: 'function',
    symbol: 'normalize',
    role: 'entry',
    purl: PURL,
    file: 'guest/src/lib.rs',
    purpose: 'Guest entry — in-place normalize; calls host_trace.',
    layer: 3,
  },
  {
    id: 'checksum',
    process: 'wasm/guest',
    name: 'checksum',
    construct: 'function',
    symbol: 'checksum',
    role: 'entry',
    purl: PURL,
    file: 'guest/src/lib.rs',
    purpose: 'Guest entry — hash normalized bytes; stash OUT_CHECKSUM.',
    layer: 3,
  },

  // —— external ——
  {
    id: 'WasmRuntime',
    name: 'Wasm runtime',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Browser engine that hosts the guest module.',
    layer: 4,
  },
];

export const relations = [] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-pipeline",
    "title": "Full pipeline (host ↔ guest ↔ host)",
    "steps": [
      {
        "from": "run-pipeline",
        "to": "load-guest",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "line": 14,
        "symbol": "loadGuest",
        "annotation": "Stay in browser/host — load the guest module."
      },
      {
        "from": "load-guest",
        "to": "WasmRuntime",
        "mechanism": "calls",
        "file": "host/loadGuest.ts",
        "line": 13,
        "symbol": "instantiateStreaming",
        "annotation": "Runtime brings up the wasm/guest process."
      },
      {
        "from": "load-guest",
        "to": "host-trace",
        "mechanism": "registers-into",
        "file": "host/loadGuest.ts",
        "line": 16,
        "symbol": "host_trace",
        "annotation": "Register the guest→host callback before any guest code runs."
      },
      {
        "from": "run-pipeline",
        "to": "write-bytes",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "line": 17,
        "symbol": "writeBytes",
        "annotation": "Host writes input into shared memory (still browser/host)."
      },
      {
        "from": "run-pipeline",
        "to": "normalize",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "line": 20,
        "symbol": "guest.normalize",
        "annotation": "Cross into wasm/guest."
      },
      {
        "from": "normalize",
        "to": "host-trace",
        "mechanism": "calls",
        "file": "guest/src/lib.rs",
        "line": 22,
        "symbol": "host_trace",
        "annotation": "Guest calls back into browser/host (trace normalize)."
      },
      {
        "from": "run-pipeline",
        "to": "checksum",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "line": 21,
        "symbol": "guest.checksum",
        "annotation": "Host calls the second guest entry (still crossing the boundary)."
      },
      {
        "from": "checksum",
        "to": "host-trace",
        "mechanism": "calls",
        "file": "guest/src/lib.rs",
        "line": 41,
        "symbol": "host_trace",
        "annotation": "Guest→host again for checksum progress."
      },
      {
        "from": "run-pipeline",
        "to": "read-u32",
        "mechanism": "calls",
        "file": "host/runPipeline.ts",
        "line": 24,
        "symbol": "readU32",
        "annotation": "Back in browser/host — read the value the guest stashed."
      }
    ]
  },
  {
    "id": "tl-guest-only",
    "title": "Inside wasm/guest: normalize → checksum",
    "steps": [
      {
        "from": "normalize",
        "to": "host-trace",
        "mechanism": "calls",
        "file": "guest/src/lib.rs",
        "line": 20,
        "symbol": "normalize",
        "annotation": "Guest entry — mutate the shared buffer in place."
      },
      {
        "from": "checksum",
        "to": "host-trace",
        "mechanism": "calls",
        "file": "guest/src/lib.rs",
        "line": 39,
        "symbol": "checksum",
        "annotation": "Second guest entry — hash the normalized slice."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Host ↔ WASM pipeline';

export const description =
  'Two clear process regions: **browser/host** (load, memory I/O, orchestrate) and **wasm/guest** (`normalize` → `checksum`). The host calls into the guest; the guest calls back via `host_trace`. Open **Walkthroughs** for the full cross-boundary pipeline.';
