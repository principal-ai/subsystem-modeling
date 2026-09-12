import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/booking-page';

export const components: SubsystemComponent[] = [
  {
    id: 'booking-page',
    process: 'booking-web/client',
    name: 'BookingPage',
    construct: 'function',
    symbol: 'BookingPage',
    role: 'entry',
    framework: 'react',
    stereotype: 'component',
    purl: PURL,
    file: 'app/book/page.tsx',
    purpose: 'Browser UI — calls server actions only; never touches the DB.',
    layer: 1,
  },
  {
    id: 'capture-event',
    process: 'booking-web/client',
    name: 'captureEvent',
    construct: 'function',
    symbol: 'captureEvent',
    purl: PURL,
    file: 'lib/captureEvent.ts',
    purpose: 'Client-side PostHog wrapper for product moments.',
    layer: 2,
  },
  {
    id: 'list-open-slots',
    process: 'booking-web/server',
    name: 'listOpenSlots',
    construct: 'function',
    symbol: 'listOpenSlots',
    role: 'entry',
    framework: 'next',
    stereotype: 'server-action',
    purl: PURL,
    file: 'app/book/actions.ts',
    purpose: 'Server action — wire boundary for loading availability.',
    layer: 2,
  },
  {
    id: 'book-slot',
    process: 'booking-web/server',
    name: 'bookSlot',
    construct: 'function',
    symbol: 'bookSlot',
    role: 'entry',
    framework: 'next',
    stereotype: 'server-action',
    purl: PURL,
    file: 'app/book/actions.ts',
    purpose: 'Server action — wire boundary for confirming a booking.',
    layer: 2,
  },
  {
    id: 'cancel-slot',
    process: 'booking-web/server',
    name: 'cancelSlot',
    construct: 'function',
    symbol: 'cancelSlot',
    role: 'entry',
    framework: 'next',
    stereotype: 'server-action',
    purl: PURL,
    file: 'app/book/actions.ts',
    purpose: 'Server action — wire boundary for releasing a booking.',
    layer: 2,
  },
  {
    id: 'list-slots',
    process: 'booking-web/server',
    name: 'listSlots',
    construct: 'function',
    symbol: 'listSlots',
    purl: PURL,
    file: 'lib/listSlots.ts',
    purpose: 'Server lib — read open slots from the store.',
    layer: 3,
  },
  {
    id: 'create-booking',
    process: 'booking-web/server',
    name: 'createBooking',
    construct: 'function',
    symbol: 'createBooking',
    purl: PURL,
    file: 'lib/createBooking.ts',
    purpose: 'Server lib — persist a reservation.',
    layer: 3,
  },
  {
    id: 'cancel-booking',
    process: 'booking-web/server',
    name: 'cancelBooking',
    construct: 'function',
    symbol: 'cancelBooking',
    purl: PURL,
    file: 'lib/cancelBooking.ts',
    purpose: 'Server lib — mark a booking cancelled.',
    layer: 3,
  },
  {
    id: 'Database',
    name: 'Database',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Slots and bookings (source of truth) — server-only.',
    layer: 4,
  },
  {
    id: 'PostHog',
    name: 'PostHog',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Product analytics from the browser — booking_created, …',
    layer: 4,
  },
];

export const relations = [] as SubsystemRelation[];

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
        "symbol": "listOpenSlots",
        "annotation": "Client calls a server action — not the DB."
      },
      {
        "from": "list-open-slots",
        "to": "list-slots",
        "mechanism": "calls",
        "file": "app/book/actions.ts",
        "line": 14,
        "symbol": "listSlots",
        "annotation": "Server action crosses into server libs."
      },
      {
        "from": "list-slots",
        "to": "Database",
        "mechanism": "reads",
        "file": "lib/listSlots.ts",
        "line": 9,
        "symbol": "findOpen",
        "annotation": "DB read stays on the server."
      },
      {
        "from": "booking-page",
        "to": "capture-event",
        "mechanism": "calls",
        "file": "app/book/page.tsx",
        "line": 19,
        "symbol": "captureEvent('slot_viewed')",
        "annotation": "Analytics fires in the browser after slots return."
      },
      {
        "from": "capture-event",
        "to": "PostHog",
        "mechanism": "calls",
        "file": "lib/captureEvent.ts",
        "line": 7,
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
        "symbol": "bookSlot",
        "annotation": "Confirm — client → server action wire boundary."
      },
      {
        "from": "book-slot",
        "to": "create-booking",
        "mechanism": "calls",
        "file": "app/book/actions.ts",
        "line": 22,
        "symbol": "createBooking",
        "annotation": "Server action delegates to the booking lib."
      },
      {
        "from": "create-booking",
        "to": "Database",
        "mechanism": "writes",
        "file": "lib/createBooking.ts",
        "line": 13,
        "symbol": "insert",
        "annotation": "Persist on the server — source of truth."
      },
      {
        "from": "booking-page",
        "to": "capture-event",
        "mechanism": "calls",
        "file": "app/book/page.tsx",
        "line": 26,
        "symbol": "captureEvent('booking_created')",
        "annotation": "Client records the product moment after success."
      },
      {
        "from": "capture-event",
        "to": "PostHog",
        "mechanism": "calls",
        "file": "lib/captureEvent.ts",
        "line": 7,
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
        "symbol": "cancelSlot",
        "annotation": "Same client→server pattern on the release path."
      },
      {
        "from": "cancel-slot",
        "to": "cancel-booking",
        "mechanism": "calls",
        "file": "app/book/actions.ts",
        "line": 26,
        "symbol": "cancelBooking",
        "annotation": "Server action → server lib."
      },
      {
        "from": "cancel-booking",
        "to": "Database",
        "mechanism": "writes",
        "file": "lib/cancelBooking.ts",
        "line": 7,
        "symbol": "update",
        "annotation": "DB write on the server frees the slot."
      },
      {
        "from": "booking-page",
        "to": "capture-event",
        "mechanism": "calls",
        "file": "app/book/page.tsx",
        "line": 32,
        "symbol": "captureEvent('booking_cancelled')",
        "annotation": "Browser analytics mirrors the cancel."
      },
      {
        "from": "capture-event",
        "to": "PostHog",
        "mechanism": "calls",
        "file": "lib/captureEvent.ts",
        "line": 7,
        "symbol": "captureEvent",
        "annotation": "PostHog booking_cancelled alongside the server update."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Booking page';

export const description =
  'Calendly-style Next.js booking with a real **client / server** split: the browser calls server actions; only the server touches the database. **PostHog** captures product moments in the client. Open **Walkthroughs** for pick / book / cancel.';
