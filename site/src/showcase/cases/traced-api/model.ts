import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/traced-api';
const PAYMENTS_PURL = 'pkg:github/you/payments-api';

export const components: SubsystemComponent[] = [
  {
    alias: 'create-app',
    process: 'orders-api',
    name: 'create_app',
    construct: 'function',
    symbol: 'create_app',
    role: 'entry',
    purl: PURL,
    file: 'app/main.py',
    declarationRef: {
      file: 'app/main.py',
      startLine: 14,
      lineHash: '3bfb342e89a0430b3fb06e3bf1b715c6',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/main.py',
    purpose: 'Process entry — boot tracing, then wire FastAPI routes.',
    layer: 1,
  },
  {
    alias: 'setup-tracing',
    process: 'orders-api',
    name: 'setup_tracing',
    construct: 'function',
    symbol: 'setup_tracing',
    purl: PURL,
    file: 'app/telemetry.py',
    declarationRef: {
      file: 'app/telemetry.py',
      startLine: 17,
      lineHash: 'cb7bce65b2d13f68986b2872f384c126',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/telemetry.py',
    purpose: 'Boot only — installs TracerProvider + OTLP BatchSpanProcessor.',
    layer: 2,
  },
  {
    alias: 'tracer-provider',
    process: 'orders-api',
    name: 'TracerProvider',
    construct: 'store',
    symbol: 'provider',
    purl: PURL,
    file: 'app/telemetry.py',
    declarationRef: {
      file: 'app/telemetry.py',
      startLine: 14,
      lineHash: 'd4220a49abbda8de97f2e47cec94ff58',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/telemetry.py',
    purpose: 'In-process span/event sink — every start_as_current_span records here.',
    layer: 2,
  },
  {
    alias: 'post-order',
    process: 'orders-api',
    name: 'post_order',
    construct: 'function',
    symbol: 'post_order',
    role: 'entry',
    framework: 'fastapi',
    stereotype: 'route',
    purl: PURL,
    file: 'app/routes/orders.py',
    declarationRef: {
      file: 'app/routes/orders.py',
      startLine: 25,
      lineHash: 'a1add8dbe3b0b2bea8c7349ae494b814',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/routes/orders.py',
    purpose: 'HTTP POST /orders — opens orders.create span + events.',
    layer: 2,
  },
  {
    alias: 'read-order',
    process: 'orders-api',
    name: 'read_order',
    construct: 'function',
    symbol: 'read_order',
    role: 'entry',
    framework: 'fastapi',
    stereotype: 'route',
    purl: PURL,
    file: 'app/routes/orders.py',
    declarationRef: {
      file: 'app/routes/orders.py',
      startLine: 12,
      lineHash: '63658d02235079c42f5e09e9f5caebc9',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/routes/orders.py',
    purpose: 'HTTP GET /orders/{id} — opens orders.read span + events.',
    layer: 2,
  },
  {
    alias: 'create-order',
    process: 'orders-api',
    name: 'create_order',
    construct: 'function',
    symbol: 'create_order',
    purl: PURL,
    file: 'app/services/order_service.py',
    declarationRef: {
      file: 'app/services/order_service.py',
      startLine: 18,
      lineHash: '31ecd31d2cd6c713b611208e00780908',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/services/order_service.py',
    purpose: 'Create path — child span, payment, persist.',
    layer: 3,
  },
  {
    alias: 'get-order',
    process: 'orders-api',
    name: 'get_order',
    construct: 'function',
    symbol: 'get_order',
    purl: PURL,
    file: 'app/services/order_service.py',
    declarationRef: {
      file: 'app/services/order_service.py',
      startLine: 10,
      lineHash: '70133960002323402f15af6cc525a636',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/services/order_service.py',
    purpose: 'Read path — child span around the DB load.',
    layer: 3,
  },
  {
    alias: 'orders-repo',
    process: 'orders-api',
    name: 'orders_repo',
    construct: 'class',
    symbol: 'orders_repo',
    purl: PURL,
    file: 'app/db.py',
    declarationRef: {
      file: 'app/db.py',
      startLine: 10,
      lineHash: 'b71cb3de047c15b5bb42b3a8af62867f',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/db.py',
    purpose: 'DB access — query spans + db.query.* events.',
    layer: 3,
  },
  {
    alias: 'capture-payment',
    process: 'orders-api',
    name: 'capture_payment',
    construct: 'function',
    symbol: 'capture_payment',
    purl: PURL,
    file: 'app/clients/payments.py',
    declarationRef: {
      file: 'app/clients/payments.py',
      startLine: 11,
      lineHash: 'b50ce984321c3b1c0c287edcbef3a68b',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'app/clients/payments.py',
    purpose: 'Outbound call — span, events, W3C inject into payments-api.',
    layer: 3,
  },
  {
    alias: 'handle-capture',
    process: 'payments-api',
    name: 'handle_capture',
    construct: 'function',
    symbol: 'handle_capture',
    role: 'entry',
    framework: 'fastapi',
    stereotype: 'route',
    purl: PAYMENTS_PURL,
    file: 'payments/handle_capture.py',
    declarationRef: {
      file: 'payments/handle_capture.py',
      startLine: 11,
      lineHash: '962380f028cffcf5a5c9a014887d725a',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'payments/handle_capture.py',
    purpose: 'Downstream capture endpoint — continues the W3C trace.',
    layer: 3,
  },
  {
    alias: 'Postgres',
    name: 'Postgres',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Order rows.',
    layer: 4,
  },
  {
    alias: 'OTLPCollector',
    name: 'OTLP collector',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Jaeger / Honeycomb / Grafana — finished spans land here.',
    layer: 4,
  },
];

export const relations = [] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-read",
    "title": "GET /orders/{id} (traced)",
    "steps": [
      {
        "from": "read-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/routes/orders.py",
        "line": 13,
        "purl": PURL,
        "symbol": "start_as_current_span(\"orders.read\")",
        "annotation": "Runtime: open the route span (not setup)."
      },
      {
        "from": "read-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/routes/orders.py",
        "line": 15,
        "purl": PURL,
        "symbol": "add_event(\"orders.read.started\")",
        "annotation": "Span event recorded into the TracerProvider."
      },
      {
        "from": "read-order",
        "to": "get-order",
        "mechanism": "calls",
        "file": "app/routes/orders.py",
        "line": 16,
        "purl": PURL,
        "symbol": "get_order",
        "annotation": "Business call under the active span context."
      },
      {
        "from": "get-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/services/order_service.py",
        "line": 11,
        "purl": PURL,
        "symbol": "start_as_current_span(\"OrderService.get\")",
        "annotation": "Child span — still the same trace."
      },
      {
        "from": "get-order",
        "to": "orders-repo",
        "mechanism": "calls",
        "file": "app/services/order_service.py",
        "line": 13,
        "purl": PURL,
        "symbol": "find_by_id",
        "annotation": "Service delegates to the repo."
      },
      {
        "from": "orders-repo",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/db.py",
        "line": 13,
        "purl": PURL,
        "symbol": "start_as_current_span(\"db.orders.find\")",
        "annotation": "DB span + db.query.execute / db.query.done events."
      },
      {
        "from": "orders-repo",
        "to": "Postgres",
        "mechanism": "reads",
        "file": "app/db.py",
        "line": 17,
        "purl": PURL,
        "symbol": "_ORDERS.get",
        "annotation": "Actual Postgres read (showcase stand-in)."
      },
      {
        "from": "tracer-provider",
        "to": "OTLPCollector",
        "mechanism": "produces",
        "file": "app/telemetry.py",
        "line": 22,
        "purl": PURL,
        "symbol": "BatchSpanProcessor",
        "annotation": "When spans end, the processor exports them to the OTLP collector."
      }
    ]
  },
  {
    "id": "tl-create",
    "title": "POST /orders (traced + downstream)",
    "steps": [
      {
        "from": "post-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/routes/orders.py",
        "line": 26,
        "purl": PURL,
        "symbol": "start_as_current_span(\"orders.create\")",
        "annotation": "Runtime: route span + orders.create.started event."
      },
      {
        "from": "post-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/routes/orders.py",
        "line": 28,
        "purl": PURL,
        "symbol": "add_event(\"orders.create.started\")",
        "annotation": "Event on the parent span before work begins."
      },
      {
        "from": "post-order",
        "to": "create-order",
        "mechanism": "calls",
        "file": "app/routes/orders.py",
        "line": 29,
        "purl": PURL,
        "symbol": "create_order",
        "annotation": "Into the service under the active context."
      },
      {
        "from": "create-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/services/order_service.py",
        "line": 19,
        "purl": PURL,
        "symbol": "start_as_current_span(\"OrderService.create\")",
        "annotation": "Child span for the write path."
      },
      {
        "from": "create-order",
        "to": "capture-payment",
        "mechanism": "calls",
        "file": "app/services/order_service.py",
        "line": 21,
        "purl": PURL,
        "symbol": "capture_payment",
        "annotation": "Payment before persist."
      },
      {
        "from": "capture-payment",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/clients/payments.py",
        "line": 12,
        "purl": PURL,
        "symbol": "start_as_current_span(\"payments.capture\")",
        "annotation": "Outbound span + payments.capture.requested event."
      },
      {
        "from": "capture-payment",
        "to": "handle-capture",
        "mechanism": "calls",
        "file": "app/clients/payments.py",
        "line": 16,
        "purl": PURL,
        "symbol": "inject",
        "annotation": "Cross into payments-api — W3C traceparent continues the trace."
      },
      {
        "from": "handle-capture",
        "to": "OTLPCollector",
        "mechanism": "produces",
        "file": "payments/handle_capture.py",
        "line": 14,
        "purl": PURL,
        "symbol": "start_as_current_span(\"payments.handle\")",
        "annotation": "Downstream span in the payments-api process."
      },
      {
        "from": "create-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/services/order_service.py",
        "line": 23,
        "purl": PURL,
        "symbol": "add_event(\"service.payment_captured\")",
        "annotation": "Event on the service span after capture returns."
      },
      {
        "from": "create-order",
        "to": "orders-repo",
        "mechanism": "calls",
        "file": "app/services/order_service.py",
        "line": 24,
        "purl": PURL,
        "symbol": "insert",
        "annotation": "Persist with payment id."
      },
      {
        "from": "orders-repo",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/db.py",
        "line": 23,
        "purl": PURL,
        "symbol": "start_as_current_span(\"db.orders.insert\")",
        "annotation": "DB write span + query events into TracerProvider."
      },
      {
        "from": "orders-repo",
        "to": "Postgres",
        "mechanism": "writes",
        "file": "app/db.py",
        "line": 29,
        "purl": PURL,
        "symbol": "_ORDERS[order_id]",
        "annotation": "Actual write (showcase stand-in)."
      },
      {
        "from": "tracer-provider",
        "to": "OTLPCollector",
        "mechanism": "produces",
        "file": "app/telemetry.py",
        "line": 22,
        "purl": PURL,
        "symbol": "BatchSpanProcessor",
        "annotation": "Finished span tree exports to OTLP."
      }
    ]
  },
  {
    "id": "tl-boot",
    "title": "Boot: wire TracerProvider",
    "steps": [
      {
        "from": "create-app",
        "to": "setup-tracing",
        "mechanism": "calls",
        "file": "app/main.py",
        "line": 15,
        "purl": PURL,
        "symbol": "setup_tracing",
        "annotation": "Once at process start — not per request."
      },
      {
        "from": "setup-tracing",
        "to": "tracer-provider",
        "mechanism": "registers-into",
        "file": "app/telemetry.py",
        "line": 20,
        "purl": PURL,
        "symbol": "TracerProvider",
        "annotation": "Install the in-process sink tracers will produce into."
      },
      {
        "from": "tracer-provider",
        "to": "OTLPCollector",
        "mechanism": "produces",
        "file": "app/telemetry.py",
        "line": 21,
        "purl": PURL,
        "symbol": "OTLPSpanExporter",
        "annotation": "Exporter attached; request walkthroughs are what actually fill it."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Traced HTTP API';

export const description =
  'Python FastAPI orders service with **OpenTelemetry on the request path**: handlers/services/DB open spans into an in-process TracerProvider; capture crosses into **payments-api** with W3C context; finished spans export to OTLP. Open **Walkthroughs** for read, create, and boot.';
