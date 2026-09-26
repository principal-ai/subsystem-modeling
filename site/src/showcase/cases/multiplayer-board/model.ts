import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
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
    declarationRef: {
      file: 'app/board/[room]/page.tsx',
      startLine: 11,
      lineHash: 'd7307216d988167ac9fc80e887aecdcf',
      capturedAt: '2025-01-01T00:00:00.000Z',
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
    declarationRef: {
      file: 'lib/usePresence.ts',
      startLine: 10,
      lineHash: '3abe64963de9b555552ca3cf6498c6a1',
      capturedAt: '2025-01-01T00:00:00.000Z',
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
    declarationRef: {
      file: 'convex/shapes.ts',
      startLine: 5,
      lineHash: 'a5a0db2b4a59ec5b7e757e24d682f8a6',
      capturedAt: '2025-01-01T00:00:00.000Z',
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
    declarationRef: {
      file: 'convex/shapes.ts',
      startLine: 16,
      lineHash: '72061a55e1e8b5db98dfc8cfc1f5d106',
      capturedAt: '2025-01-01T00:00:00.000Z',
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
    declarationRef: {
      file: 'convex/presence.ts',
      startLine: 5,
      lineHash: '34c92ffb7f23ecd5c1215eae639ca07f',
      capturedAt: '2025-01-01T00:00:00.000Z',
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
    declarationRef: {
      file: 'convex/presence.ts',
      startLine: 15,
      lineHash: '7c8e294aada54c303ab6921613de7df1',
      capturedAt: '2025-01-01T00:00:00.000Z',
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

export const relations = [] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-draw",
    "title": "Draw a stroke",
    "steps": [
      {
        "from": "board-page",
        "to": "upsert-shape",
        "mechanism": "calls",
        "file": "app/board/[room]/page.tsx",
        "line": 17,
        "purl": PURL,
        "symbol": "upsertShape",
        "annotation": "Local pointer-up becomes a Convex mutation."
      },
      {
        "from": "upsert-shape",
        "to": "Convex",
        "mechanism": "writes",
        "file": "convex/shapes.ts",
        "line": 32,
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
        "line": 12,
        "purl": PURL,
        "symbol": "useQuery(listShapes)",
        "annotation": "Same query subscription every client holds open."
      },
      {
        "from": "list-shapes",
        "to": "Convex",
        "mechanism": "reads",
        "file": "convex/shapes.ts",
        "line": 8,
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
        "line": 14,
        "purl": PURL,
        "symbol": "usePresence",
        "annotation": "Board mounts the presence hook alongside shapes."
      },
      {
        "from": "use-presence",
        "to": "update-presence",
        "mechanism": "calls",
        "file": "lib/usePresence.ts",
        "line": 16,
        "purl": PURL,
        "symbol": "updatePresence",
        "annotation": "Pointer moves publish local cursor position."
      },
      {
        "from": "update-presence",
        "to": "Convex",
        "mechanism": "writes",
        "file": "convex/presence.ts",
        "line": 30,
        "purl": PURL,
        "symbol": "patch",
        "annotation": "Presence row updates in Convex for peers to read."
      },
      {
        "from": "use-presence",
        "to": "list-presence",
        "mechanism": "calls",
        "file": "lib/usePresence.ts",
        "line": 11,
        "purl": PURL,
        "symbol": "useQuery(listPresence)",
        "annotation": "Peers arrive through the reactive presence query."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Multiplayer whiteboard';

export const description =
  'Excalidraw-style Next.js board backed by **Convex**: local strokes upsert shapes, peers see them via reactive queries, and presence tracks live cursors. Open **Walkthroughs** for draw / remote update / presence.';
