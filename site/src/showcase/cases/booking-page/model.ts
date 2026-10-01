import type {
  SubsystemComponent,
  SubsystemTrail,
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

export const trails = [
  {
    "id": "tl-book",
    "title": "Guest books a slot",
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
        "annotation": "PostHog from the client — not the source of truth."
      }
    ]
  }
] as SubsystemTrail[];

export const title = 'Booking page';

export const description =
  'Calendly-style Next.js booking with a real **client / server** split: the browser calls server actions; only the server touches the database. **PostHog** captures product moments in the client. Open **Trails** to follow a booking.';
