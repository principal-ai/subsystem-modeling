import type {
  SubsystemComponent,
  SubsystemTrail,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/daily-digest';

export const components: SubsystemComponent[] = [
  {
    alias: 'daily-digest-main',
    process: 'daily-digest',
    name: 'main',
    construct: 'function',
    symbol: 'main',
    role: 'entry',
    purl: PURL,
    file: 'scripts/dailyDigest.ts',
    declarationSpan: {
      startLine: 16,
      endLine: 16,
      contentHash: '7d5d3f63a3bddde40385b3264a1412a9',
    },
    purpose: 'Cron entry — fetch, parse, write. One run per schedule tick.',
    layer: 1,
  },
  {
    alias: 'fetch-page',
    process: 'daily-digest',
    name: 'fetchPage',
    construct: 'function',
    symbol: 'fetchPage',
    purl: PURL,
    file: 'src/fetchPage.ts',
    declarationSpan: {
      startLine: 4,
      endLine: 4,
      contentHash: 'fbca6bf9ceb3536fa58dfbbb1bd94d09',
    },
    purpose: 'HTTP GET for the source URL — the script\'s only network hop.',
    layer: 2,
  },
  {
    alias: 'parse-headlines',
    process: 'daily-digest',
    name: 'parseHeadlines',
    construct: 'function',
    symbol: 'parseHeadlines',
    purl: PURL,
    file: 'src/parseHeadlines.ts',
    declarationSpan: {
      startLine: 7,
      endLine: 7,
      contentHash: 'ed0a6051e8ee4631c52c5270b0c20349',
    },
    purpose: 'Pull a short list of headlines out of the raw HTML.',
    layer: 2,
  },
  {
    alias: 'write-digest',
    process: 'daily-digest',
    name: 'writeDigest',
    construct: 'function',
    symbol: 'writeDigest',
    purl: PURL,
    file: 'src/writeDigest.ts',
    declarationSpan: {
      startLine: 6,
      endLine: 6,
      contentHash: '082b7fef6386079b292cdccdfc970148',
    },
    purpose: 'Append today’s block to the local digest file.',
    layer: 2,
  },
  {
    alias: 'Website',
    name: 'Website',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Public page the cron pulls (e.g. HN front page).',
    layer: 3,
  },
  {
    alias: 'Filesystem',
    name: 'Filesystem',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Local digest.txt the script appends to.',
    layer: 3,
  },
];

export const trails = [
  {
    "id": "tl-cron-run",
    "title": "Cron runs daily digest",
    "steps": [
      {
        "from": "daily-digest-main",
        "to": "fetch-page",
        "mechanism": "calls",
        "file": "scripts/dailyDigest.ts",
        "span": {
          "startLine": 17,
          "endLine": 17,
          "contentHash": "5b4be74ef4ca6fd48953c86c06ecbe8c"
        },
        "purl": PURL,
        "symbol": "fetchPage",
        "annotation": "Cron invoked main — first hop is the network fetch."
      },
      {
        "from": "fetch-page",
        "to": "Website",
        "mechanism": "reads",
        "file": "src/fetchPage.ts",
        "span": {
          "startLine": 5,
          "endLine": 5,
          "contentHash": "43a3d201ec94b8f00a58586ea8681277"
        },
        "purl": PURL,
        "symbol": "fetch",
        "annotation": "One HTTP GET to the public page; no browser required."
      },
      {
        "from": "daily-digest-main",
        "to": "parse-headlines",
        "mechanism": "calls",
        "file": "scripts/dailyDigest.ts",
        "span": {
          "startLine": 18,
          "endLine": 18,
          "contentHash": "b6621bae2a5b3fe3b8b3c07a2bfc24d1"
        },
        "purl": PURL,
        "symbol": "parseHeadlines",
        "annotation": "Turn raw HTML into a short list of strings."
      },
      {
        "from": "daily-digest-main",
        "to": "write-digest",
        "mechanism": "calls",
        "file": "scripts/dailyDigest.ts",
        "span": {
          "startLine": 19,
          "endLine": 19,
          "contentHash": "c1fbb4584e338370d6b291cc74a5d4fa"
        },
        "purl": PURL,
        "symbol": "writeDigest",
        "annotation": "Persist today’s headlines as the run’s side effect."
      },
      {
        "from": "write-digest",
        "to": "Filesystem",
        "mechanism": "writes",
        "file": "src/writeDigest.ts",
        "span": {
          "startLine": 13,
          "endLine": 13,
          "contentHash": "e23273e3e54c9e18863dc5e2dfd66361"
        },
        "purl": PURL,
        "symbol": "appendFile",
        "annotation": "Append a dated block to digest.txt — safe to re-run tomorrow."
      }
    ]
  }
] as SubsystemTrail[];

export const title = 'Daily page digest';

export const description =
  'A beginner-friendly cron script: schedule fires, the entry fetches a public webpage, parses out headlines, and appends them to a local file. Open the **Trails** tab to walk one scheduled run.';
