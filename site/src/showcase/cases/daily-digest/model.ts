import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/daily-digest';

export const components: SubsystemComponent[] = [
  {
    id: 'daily-digest-main',
    process: 'daily-digest',
    name: 'main',
    construct: 'function',
    symbol: 'main',
    role: 'entry',
    purl: PURL,
    file: 'scripts/dailyDigest.ts',
    purpose: 'Cron entry — fetch, parse, write. One run per schedule tick.',
    layer: 1,
  },
  {
    id: 'fetch-page',
    process: 'daily-digest',
    name: 'fetchPage',
    construct: 'function',
    symbol: 'fetchPage',
    purl: PURL,
    file: 'src/fetchPage.ts',
    purpose: 'HTTP GET for the source URL — the script\'s only network hop.',
    layer: 2,
  },
  {
    id: 'parse-headlines',
    process: 'daily-digest',
    name: 'parseHeadlines',
    construct: 'function',
    symbol: 'parseHeadlines',
    purl: PURL,
    file: 'src/parseHeadlines.ts',
    purpose: 'Pull a short list of headlines out of the raw HTML.',
    layer: 2,
  },
  {
    id: 'write-digest',
    process: 'daily-digest',
    name: 'writeDigest',
    construct: 'function',
    symbol: 'writeDigest',
    purl: PURL,
    file: 'src/writeDigest.ts',
    purpose: 'Append today’s block to the local digest file.',
    layer: 2,
  },
  {
    id: 'Website',
    name: 'Website',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Public page the cron pulls (e.g. HN front page).',
    layer: 3,
  },
  {
    id: 'Filesystem',
    name: 'Filesystem',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Local digest.txt the script appends to.',
    layer: 3,
  },
];

export const relations = [] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-cron-run",
    "title": "Cron runs daily digest",
    "steps": [
      {
        "from": "daily-digest-main",
        "to": "fetch-page",
        "mechanism": "calls",
        "file": "scripts/dailyDigest.ts",
        "line": 17,
        "symbol": "fetchPage",
        "annotation": "Cron invoked main — first hop is the network fetch."
      },
      {
        "from": "fetch-page",
        "to": "Website",
        "mechanism": "reads",
        "file": "src/fetchPage.ts",
        "line": 5,
        "symbol": "fetch",
        "annotation": "One HTTP GET to the public page; no browser required."
      },
      {
        "from": "daily-digest-main",
        "to": "parse-headlines",
        "mechanism": "calls",
        "file": "scripts/dailyDigest.ts",
        "line": 18,
        "symbol": "parseHeadlines",
        "annotation": "Turn raw HTML into a short list of strings."
      },
      {
        "from": "daily-digest-main",
        "to": "write-digest",
        "mechanism": "calls",
        "file": "scripts/dailyDigest.ts",
        "line": 19,
        "symbol": "writeDigest",
        "annotation": "Persist today’s headlines as the run’s side effect."
      },
      {
        "from": "write-digest",
        "to": "Filesystem",
        "mechanism": "writes",
        "file": "src/writeDigest.ts",
        "line": 13,
        "symbol": "appendFile",
        "annotation": "Append a dated block to digest.txt — safe to re-run tomorrow."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Daily page digest';

export const description =
  'A beginner-friendly cron script: schedule fires, the entry fetches a public webpage, parses out headlines, and appends them to a local file. Open the **Walkthroughs** tab to walk one scheduled run.';
