import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/multiplayer-board';

export const components: SubsystemComponent[] = [
  {
    id: 'board-page',
    process: 'board-web',
    name: 'BoardPage',
    construct: 'function',
    symbol: 'BoardPage',
    role: 'entry',
    framework: 'react',
    stereotype: 'component',
    purl: PURL,
    file: 'app/board/[room]/page.tsx',
    purpose: 'Excalidraw-style room — draw locally, see peers live.',
    layer: 1,
  },
  {
    id: 'use-presence',
    process: 'board-web',
    name: 'usePresence',
    construct: 'function',
    symbol: 'usePresence',
    framework: 'react',
    stereotype: 'hook',
    purl: PURL,
    file: 'lib/usePresence.ts',
    purpose: 'Publish local cursor; subscribe to peer presence.',
    layer: 2,
  },
  {
    id: 'list-shapes',
    process: 'board-web',
    name: 'listShapes',
    construct: 'function',
    symbol: 'listShapes',
    purl: PURL,
    file: 'convex/shapes.ts',
    purpose: 'Reactive Convex query — peers re-render when shapes change.',
    layer: 2,
  },
  {
    id: 'upsert-shape',
    process: 'board-web',
    name: 'upsertShape',
    construct: 'function',
    symbol: 'upsertShape',
    purl: PURL,
    file: 'convex/shapes.ts',
    purpose: 'Convex mutation — write path for a local stroke.',
    layer: 2,
  },
  {
    id: 'list-presence',
    process: 'board-web',
    name: 'listPresence',
    construct: 'function',
    symbol: 'listPresence',
    purl: PURL,
    file: 'convex/presence.ts',
    purpose: 'Reactive query of who is in the room and where.',
    layer: 2,
  },
  {
    id: 'update-presence',
    process: 'board-web',
    name: 'updatePresence',
    construct: 'function',
    symbol: 'updatePresence',
    purl: PURL,
    file: 'convex/presence.ts',
    purpose: 'Convex mutation — publish cursor position.',
    layer: 2,
  },
  {
    id: 'Convex',
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
        "symbol": "upsertShape",
        "annotation": "Local pointer-up becomes a Convex mutation."
      },
      {
        "from": "upsert-shape",
        "to": "Convex",
        "mechanism": "writes",
        "file": "convex/shapes.ts",
        "line": 32,
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
        "symbol": "useQuery(listShapes)",
        "annotation": "Same query subscription every client holds open."
      },
      {
        "from": "list-shapes",
        "to": "Convex",
        "mechanism": "reads",
        "file": "convex/shapes.ts",
        "line": 8,
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
        "symbol": "usePresence",
        "annotation": "Board mounts the presence hook alongside shapes."
      },
      {
        "from": "use-presence",
        "to": "update-presence",
        "mechanism": "calls",
        "file": "lib/usePresence.ts",
        "line": 16,
        "symbol": "updatePresence",
        "annotation": "Pointer moves publish local cursor position."
      },
      {
        "from": "update-presence",
        "to": "Convex",
        "mechanism": "writes",
        "file": "convex/presence.ts",
        "line": 30,
        "symbol": "patch",
        "annotation": "Presence row updates in Convex for peers to read."
      },
      {
        "from": "use-presence",
        "to": "list-presence",
        "mechanism": "calls",
        "file": "lib/usePresence.ts",
        "line": 11,
        "symbol": "useQuery(listPresence)",
        "annotation": "Peers arrive through the reactive presence query."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Multiplayer whiteboard';

export const description =
  'Excalidraw-style Next.js board backed by **Convex**: local strokes upsert shapes, peers see them via reactive queries, and presence tracks live cursors. Open **Walkthroughs** for draw / remote update / presence.';
