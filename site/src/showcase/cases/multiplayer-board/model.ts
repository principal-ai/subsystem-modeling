import type {
  SubsystemComponent,
  SubsystemTrail,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/multiplayer-board';

export const components: SubsystemComponent[] = [
  {
    alias: 'board-page',
    process: 'board-web',
    name: 'BoardPage',
    construct: 'function',
    symbol: 'BoardPage',
    role: 'entry',
    framework: 'react',
    stereotype: 'component',
    purl: PURL,
    file: 'app/board/[room]/page.tsx',
    declarationSpan: {
      startLine: 11,
      endLine: 11,
      contentHash: 'd7307216d988167ac9fc80e887aecdcf',
    },
    purpose: 'Excalidraw-style room — draw locally, see peers live.',
    layer: 1,
  },
  {
    alias: 'use-presence',
    process: 'board-web',
    name: 'usePresence',
    construct: 'function',
    symbol: 'usePresence',
    framework: 'react',
    stereotype: 'hook',
    purl: PURL,
    file: 'lib/usePresence.ts',
    declarationSpan: {
      startLine: 10,
      endLine: 10,
      contentHash: '3abe64963de9b555552ca3cf6498c6a1',
    },
    purpose: 'Publish local cursor; subscribe to peer presence.',
    layer: 2,
  },
  {
    alias: 'list-shapes',
    process: 'board-web',
    name: 'listShapes',
    construct: 'function',
    symbol: 'listShapes',
    purl: PURL,
    file: 'convex/shapes.ts',
    declarationSpan: {
      startLine: 5,
      endLine: 5,
      contentHash: 'a5a0db2b4a59ec5b7e757e24d682f8a6',
    },
    purpose: 'Reactive Convex query — peers re-render when shapes change.',
    layer: 2,
  },
  {
    alias: 'upsert-shape',
    process: 'board-web',
    name: 'upsertShape',
    construct: 'function',
    symbol: 'upsertShape',
    purl: PURL,
    file: 'convex/shapes.ts',
    declarationSpan: {
      startLine: 16,
      endLine: 16,
      contentHash: '72061a55e1e8b5db98dfc8cfc1f5d106',
    },
    purpose: 'Convex mutation — write path for a local stroke.',
    layer: 2,
  },
  {
    alias: 'list-presence',
    process: 'board-web',
    name: 'listPresence',
    construct: 'function',
    symbol: 'listPresence',
    purl: PURL,
    file: 'convex/presence.ts',
    declarationSpan: {
      startLine: 5,
      endLine: 5,
      contentHash: '34c92ffb7f23ecd5c1215eae639ca07f',
    },
    purpose: 'Reactive query of who is in the room and where.',
    layer: 2,
  },
  {
    alias: 'update-presence',
    process: 'board-web',
    name: 'updatePresence',
    construct: 'function',
    symbol: 'updatePresence',
    purl: PURL,
    file: 'convex/presence.ts',
    declarationSpan: {
      startLine: 15,
      endLine: 15,
      contentHash: '7c8e294aada54c303ab6921613de7df1',
    },
    purpose: 'Convex mutation — publish cursor position.',
    layer: 2,
  },
  {
    alias: 'Convex',
    name: 'Convex',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Live sync backend — shapes + presence as shared state.',
    layer: 3,
  },
];

export const trails = [
  {
    "id": "tl-draw",
    "title": "Draw a stroke",
    "steps": [
      {
        "from": "board-page",
        "to": "upsert-shape",
        "mechanism": "calls",
        "file": "app/board/[room]/page.tsx",
        "span": {
          "startLine": 17,
          "endLine": 17,
          "contentHash": "63081610280439935202205dbee38b3e"
        },
        "purl": PURL,
        "symbol": "upsertShape",
        "annotation": "Local pointer-up becomes a Convex mutation."
      },
      {
        "from": "upsert-shape",
        "to": "Convex",
        "mechanism": "writes",
        "file": "convex/shapes.ts",
        "span": {
          "startLine": 32,
          "endLine": 32,
          "contentHash": "603cca8dfa1be863ee7e7df44ef83da3"
        },
        "purl": PURL,
        "symbol": "insert",
        "annotation": "Shape lands in Convex — the shared board state."
      }
    ]
  },
  {
    "id": "tl-remote",
    "title": "Remote peer draw",
    "steps": [
      {
        "from": "board-page",
        "to": "list-shapes",
        "mechanism": "calls",
        "file": "app/board/[room]/page.tsx",
        "span": {
          "startLine": 12,
          "endLine": 12,
          "contentHash": "3be5cf68172b8573a9d0dd597b66409c"
        },
        "purl": PURL,
        "symbol": "useQuery(listShapes)",
        "annotation": "Same query subscription every client holds open."
      },
      {
        "from": "list-shapes",
        "to": "Convex",
        "mechanism": "reads",
        "file": "convex/shapes.ts",
        "span": {
          "startLine": 8,
          "endLine": 8,
          "contentHash": "8798ba99ce85a0dae1923f751f70aac0"
        },
        "purl": PURL,
        "symbol": "ctx.db.query",
        "annotation": "Convex pushes an update; React re-renders the canvas list."
      }
    ]
  },
  {
    "id": "tl-presence",
    "title": "Cursor / presence",
    "steps": [
      {
        "from": "board-page",
        "to": "use-presence",
        "mechanism": "calls",
        "file": "app/board/[room]/page.tsx",
        "span": {
          "startLine": 14,
          "endLine": 14,
          "contentHash": "73c2d5b69cd222a9bae67fb63a929bea"
        },
        "purl": PURL,
        "symbol": "usePresence",
        "annotation": "Board mounts the presence hook alongside shapes."
      },
      {
        "from": "use-presence",
        "to": "update-presence",
        "mechanism": "calls",
        "file": "lib/usePresence.ts",
        "span": {
          "startLine": 16,
          "endLine": 16,
          "contentHash": "23827190cdfb4d2da84e5e64ff5441d4"
        },
        "purl": PURL,
        "symbol": "updatePresence",
        "annotation": "Pointer moves publish local cursor position."
      },
      {
        "from": "update-presence",
        "to": "Convex",
        "mechanism": "writes",
        "file": "convex/presence.ts",
        "span": {
          "startLine": 30,
          "endLine": 30,
          "contentHash": "9a1dad23a34229a635efda2ce02f3064"
        },
        "purl": PURL,
        "symbol": "patch",
        "annotation": "Presence row updates in Convex for peers to read."
      },
      {
        "from": "use-presence",
        "to": "list-presence",
        "mechanism": "calls",
        "file": "lib/usePresence.ts",
        "span": {
          "startLine": 11,
          "endLine": 11,
          "contentHash": "ee8777a0069310f9cfaeb03ddcf6edfd"
        },
        "purl": PURL,
        "symbol": "useQuery(listPresence)",
        "annotation": "Peers arrive through the reactive presence query."
      }
    ]
  }
] as SubsystemTrail[];

export const title = 'Multiplayer whiteboard';

export const description =
  'Excalidraw-style Next.js board backed by **Convex**: local strokes upsert shapes, peers see them via reactive queries, and presence tracks live cursors. Open **Trails** for draw / remote update / presence.';
