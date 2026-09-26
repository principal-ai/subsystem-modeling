import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/scheduling-app';

export const components: SubsystemComponent[] = [
  {
    alias: 'booking-page',
    process: 'booking-web/client',
    name: 'BookingPage',
    construct: 'function',
    symbol: 'BookingPage',
    role: 'entry',
    framework: 'react',
    stereotype: 'component',
    purl: PURL,
    file: 'app/book/page.tsx',
    declarationRef: {
      file: 'app/book/page.tsx',
      startLine: 11,
      lineHash: '4c7d47276514c3bac1f63505c8be4c50',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/book/page.tsx',
    purpose: 'Browser UI — calls server actions only; never touches the DB.',
    layer: 1,
    declaration: {
      kind: 'function',
      parameters: [],
      returnType: 'JSX.Element',
      callers: [],
      callees: [],
    },
    declarationProvenance: 'authored',
  },
  {
    alias: 'capture-event',
    process: 'booking-web/client',
    name: 'captureEvent',
    construct: 'function',
    symbol: 'captureEvent',
    purl: PURL,
    file: 'lib/captureEvent.ts',
    declarationRef: {
      file: 'lib/captureEvent.ts',
      startLine: 7,
      lineHash: 'e7541ce8084780a92eb1b388df968737',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'lib/captureEvent.ts',
    purpose: 'Client-side PostHog wrapper for product moments.',
    layer: 2,
    declaration: {
      kind: 'function',
      parameters: [
        { name: 'event', type: 'string' },
        { name: 'properties', type: 'Props' },
      ],
      returnType: 'void',
      callers: [],
      callees: [],
    },
    declarationProvenance: 'authored',
  },
  {
    alias: 'list-open-slots',
    process: 'booking-web/server',
    name: 'listOpenSlots',
    construct: 'function',
    symbol: 'listOpenSlots',
    role: 'entry',
    framework: 'next',
    stereotype: 'server-action',
    purl: PURL,
    file: 'app/book/actions.ts',
    declarationRef: {
      file: 'app/book/actions.ts',
      startLine: 13,
      lineHash: 'a2bbf4ed06fda8c074ebf7b09e734915',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/book/actions.ts',
    purpose: 'Server action — wire boundary for loading availability.',
    layer: 2,
    declaration: {
      kind: 'function',
      parameters: [{ name: 'host', type: 'string' }],
      returnType: 'Promise<Slot[]>',
      callers: [],
      callees: [],
    },
    declarationProvenance: 'authored',
  },
  {
    alias: 'book-slot',
    process: 'booking-web/server',
    name: 'bookSlot',
    construct: 'function',
    symbol: 'bookSlot',
    role: 'entry',
    framework: 'next',
    stereotype: 'server-action',
    purl: PURL,
    file: 'app/book/actions.ts',
    declarationRef: {
      file: 'app/book/actions.ts',
      startLine: 17,
      lineHash: '83c2a721935e6f8d6c8cfa583fb41f9d',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/book/actions.ts',
    purpose: 'Server action — wire boundary for confirming a booking.',
    layer: 2,
    declaration: {
      kind: 'function',
      parameters: [
        {
          name: 'input',
          type: '{ host: string; slotId: string; guestEmail: string }',
        },
      ],
      returnType: 'Promise<{ id: string; host: string; slotId: string; guestEmail: string; status: string }>',
      callers: [],
      callees: [],
    },
    declarationProvenance: 'authored',
  },
  {
    alias: 'cancel-slot',
    process: 'booking-web/server',
    name: 'cancelSlot',
    construct: 'function',
    symbol: 'cancelSlot',
    role: 'entry',
    framework: 'next',
    stereotype: 'server-action',
    purl: PURL,
    file: 'app/book/actions.ts',
    declarationRef: {
      file: 'app/book/actions.ts',
      startLine: 25,
      lineHash: 'f7f044bf7c93176737086987ef0de7b5',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/book/actions.ts',
    purpose: 'Server action — wire boundary for releasing a booking.',
    layer: 2,
    declaration: {
      kind: 'function',
      parameters: [{ name: 'bookingId', type: 'string' }],
      returnType: 'Promise<void>',
      callers: [],
      callees: [],
    },
    declarationProvenance: 'authored',
  },
  {
    alias: 'list-slots',
    process: 'booking-web/server',
    name: 'listSlots',
    construct: 'function',
    symbol: 'listSlots',
    purl: PURL,
    file: 'lib/listSlots.ts',
    declarationRef: {
      file: 'lib/listSlots.ts',
      startLine: 8,
      lineHash: '8bf16b9dbbaff5e811d4bd2053c642c8',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'lib/listSlots.ts',
    purpose: 'Server lib — read open slots from the store.',
    layer: 3,
    declaration: {
      kind: 'function',
      parameters: [{ name: 'host', type: 'string' }],
      returnType: 'Promise<Slot[]>',
      callers: [],
      callees: [],
    },
    declarationProvenance: 'authored',
  },
  {
    alias: 'create-booking',
    process: 'booking-web/server',
    name: 'createBooking',
    construct: 'function',
    symbol: 'createBooking',
    purl: PURL,
    file: 'lib/createBooking.ts',
    declarationRef: {
      file: 'lib/createBooking.ts',
      startLine: 12,
      lineHash: '06bab10f57a6ff1ca04f7d1dd2c9d839',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'lib/createBooking.ts',
    purpose: 'Server lib — persist a reservation.',
    layer: 3,
    declaration: {
      kind: 'function',
      parameters: [{ name: 'input', type: 'CreateBookingInput' }],
      returnType: 'Promise<{ id: string; host: string; slotId: string; guestEmail: string; status: string }>',
      callers: [],
      callees: [],
    },
    declarationProvenance: 'authored',
  },
  {
    alias: 'cancel-booking',
    process: 'booking-web/server',
    name: 'cancelBooking',
    construct: 'function',
    symbol: 'cancelBooking',
    purl: PURL,
    file: 'lib/cancelBooking.ts',
    declarationRef: {
      file: 'lib/cancelBooking.ts',
      startLine: 6,
      lineHash: '646a51577140263c34a7d5d5046e84d9',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'lib/cancelBooking.ts',
    purpose: 'Server lib — mark a booking cancelled.',
    layer: 3,
    declaration: {
      kind: 'function',
      parameters: [{ name: 'bookingId', type: 'string' }],
      returnType: 'Promise<void>',
      callers: [],
      callees: [],
    },
    declarationProvenance: 'authored',
  },
  {
    alias: 'Database',
    name: 'Database',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Slots and bookings (source of truth) — server-only.',
    layer: 4,
    declaration: {
      kind: 'external',
      label: 'Database',
    },
    declarationProvenance: 'authored',
  },
  {
    alias: 'PostHog',
    name: 'PostHog',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Product analytics from the browser — booking_created, …',
    layer: 4,
    declaration: {
      kind: 'external',
      label: 'PostHog',
    },
    declarationProvenance: 'authored',
  },
];

export const relations = [
  {
    id: 'page-list-action',
    from: 'booking-page',
    to: 'list-open-slots',
    relationType: 'references',
  },
  {
    id: 'page-book-action',
    from: 'booking-page',
    to: 'book-slot',
    relationType: 'references',
  },
  {
    id: 'page-cancel-action',
    from: 'booking-page',
    to: 'cancel-slot',
    relationType: 'references',
  },
  {
    id: 'page-capture',
    from: 'booking-page',
    to: 'capture-event',
    relationType: 'references',
  },
  {
    id: 'list-action-lib',
    from: 'list-open-slots',
    to: 'list-slots',
    relationType: 'references',
  },
  {
    id: 'book-action-lib',
    from: 'book-slot',
    to: 'create-booking',
    relationType: 'references',
  },
  {
    id: 'cancel-action-lib',
    from: 'cancel-slot',
    to: 'cancel-booking',
    relationType: 'references',
  },
  {
    id: 'capture-posthog',
    from: 'capture-event',
    to: 'PostHog',
    relationType: 'references',
  },
  {
    id: 'list-db',
    from: 'list-slots',
    to: 'Database',
    relationType: 'references',
  },
  {
    id: 'create-db',
    from: 'create-booking',
    to: 'Database',
    relationType: 'references',
  },
  {
    id: 'cancel-db',
    from: 'cancel-booking',
    to: 'Database',
    relationType: 'references',
  },
] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-pick-slot",
    "title": "Guest picks a slot",
    "steps": [
      {
        "from": "booking-page",
        "to": "list-open-slots",
        "mechanism": "calls",
        "file": "app/book/page.tsx",
        "line": 17,
        "purl": PURL,
        "symbol": "listOpenSlots",
        "annotation": "Client calls a server action — not the DB."
      },
      {
        "from": "list-open-slots",
        "to": "list-slots",
        "mechanism": "calls",
        "file": "app/book/actions.ts",
        "line": 14,
        "purl": PURL,
        "symbol": "listSlots",
        "annotation": "Server action crosses into server libs."
      },
      {
        "from": "list-slots",
        "to": "Database",
        "mechanism": "reads",
        "file": "lib/listSlots.ts",
        "line": 9,
        "purl": PURL,
        "symbol": "findOpen",
        "annotation": "DB read stays on the server."
      },
      {
        "from": "booking-page",
        "to": "capture-event",
        "mechanism": "calls",
        "file": "app/book/page.tsx",
        "line": 19,
        "purl": PURL,
        "symbol": "captureEvent('slot_viewed')",
        "annotation": "Analytics fires in the browser after slots return."
      },
      {
        "from": "capture-event",
        "to": "PostHog",
        "mechanism": "calls",
        "file": "lib/captureEvent.ts",
        "line": 7,
        "purl": PURL,
        "symbol": "captureEvent",
        "annotation": "PostHog from the client — separate from the booking store."
      }
    ]
  },
  {
    "id": "tl-book",
    "title": "Guest books",
    "steps": [
      {
        "from": "booking-page",
        "to": "book-slot",
        "mechanism": "calls",
        "file": "app/book/page.tsx",
        "line": 24,
        "purl": PURL,
        "symbol": "bookSlot",
        "annotation": "Confirm — client → server action wire boundary."
      },
      {
        "from": "book-slot",
        "to": "create-booking",
        "mechanism": "calls",
        "file": "app/book/actions.ts",
        "line": 22,
        "purl": PURL,
        "symbol": "createBooking",
        "annotation": "Server action delegates to the booking lib."
      },
      {
        "from": "create-booking",
        "to": "Database",
        "mechanism": "writes",
        "file": "lib/createBooking.ts",
        "line": 13,
        "purl": PURL,
        "symbol": "insert",
        "annotation": "Persist on the server — source of truth."
      },
      {
        "from": "booking-page",
        "to": "capture-event",
        "mechanism": "calls",
        "file": "app/book/page.tsx",
        "line": 26,
        "purl": PURL,
        "symbol": "captureEvent('booking_created')",
        "annotation": "Client records the product moment after success."
      },
      {
        "from": "capture-event",
        "to": "PostHog",
        "mechanism": "calls",
        "file": "lib/captureEvent.ts",
        "line": 7,
        "purl": PURL,
        "symbol": "captureEvent",
        "annotation": "PostHog booking_created — not the source of truth."
      }
    ]
  },
  {
    "id": "tl-cancel",
    "title": "Guest cancels",
    "steps": [
      {
        "from": "booking-page",
        "to": "cancel-slot",
        "mechanism": "calls",
        "file": "app/book/page.tsx",
        "line": 31,
        "purl": PURL,
        "symbol": "cancelSlot",
        "annotation": "Same client→server pattern on the release path."
      },
      {
        "from": "cancel-slot",
        "to": "cancel-booking",
        "mechanism": "calls",
        "file": "app/book/actions.ts",
        "line": 26,
        "purl": PURL,
        "symbol": "cancelBooking",
        "annotation": "Server action → server lib."
      },
      {
        "from": "cancel-booking",
        "to": "Database",
        "mechanism": "writes",
        "file": "lib/cancelBooking.ts",
        "line": 7,
        "purl": PURL,
        "symbol": "update",
        "annotation": "DB write on the server frees the slot."
      },
      {
        "from": "booking-page",
        "to": "capture-event",
        "mechanism": "calls",
        "file": "app/book/page.tsx",
        "line": 32,
        "purl": PURL,
        "symbol": "captureEvent('booking_cancelled')",
        "annotation": "Browser analytics mirrors the cancel."
      },
      {
        "from": "capture-event",
        "to": "PostHog",
        "mechanism": "calls",
        "file": "lib/captureEvent.ts",
        "line": 7,
        "purl": PURL,
        "symbol": "captureEvent",
        "annotation": "PostHog booking_cancelled alongside the server update."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Booking page';

export const description =
  'Calendly-style Next.js booking with a real **client / server** split: the browser calls server actions; only the server touches the database. **PostHog** captures product moments in the client. Open **Walkthroughs** for pick / book / cancel.';
