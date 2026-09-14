import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/traced-api';
const PAYMENTS_PURL = 'pkg:github/you/payments-api';

export const components: SubsystemComponent[] = [
  {
    id: 'create-app',
    process: 'orders-api',
    name: 'create_app',
    construct: 'function',
    symbol: 'create_app',
    role: 'entry',
    purl: PURL,
    file: 'app/main.py',
    module: 'app/main.py',
    purpose: 'Process entry — boot tracing, then wire FastAPI routes.',
    layer: 1,
  },
  {
    id: 'setup-tracing',
    process: 'orders-api',
    name: 'setup_tracing',
    construct: 'function',
    symbol: 'setup_tracing',
    purl: PURL,
    file: 'app/telemetry.py',
    module: 'app/telemetry.py',
    purpose: 'Boot only — installs TracerProvider + OTLP BatchSpanProcessor.',
    layer: 2,
  },
  {
    id: 'tracer-provider',
    process: 'orders-api',
    name: 'TracerProvider',
    construct: 'store',
    symbol: 'provider',
    purl: PURL,
    file: 'app/telemetry.py',
    module: 'app/telemetry.py',
    purpose: 'In-process span/event sink — every start_as_current_span records here.',
    layer: 2,
  },
  {
    id: 'post-order',
    process: 'orders-api',
    name: 'post_order',
    construct: 'function',
    symbol: 'post_order',
    role: 'entry',
    framework: 'fastapi',
    stereotype: 'route',
    purl: PURL,
    file: 'app/routes/orders.py',
    module: 'app/routes/orders.py',
    purpose: 'HTTP POST /orders — opens orders.create span + events.',
    layer: 2,
  },
  {
    id: 'read-order',
    process: 'orders-api',
    name: 'read_order',
    construct: 'function',
    symbol: 'read_order',
    role: 'entry',
    framework: 'fastapi',
    stereotype: 'route',
    purl: PURL,
    file: 'app/routes/orders.py',
    module: 'app/routes/orders.py',
    purpose: 'HTTP GET /orders/{id} — opens orders.read span + events.',
    layer: 2,
  },
  {
    id: 'create-order',
    process: 'orders-api',
    name: 'create_order',
    construct: 'function',
    symbol: 'create_order',
    purl: PURL,
    file: 'app/services/order_service.py',
    module: 'app/services/order_service.py',
    purpose: 'Create path — child span, payment, persist.',
    layer: 3,
  },
  {
    id: 'get-order',
    process: 'orders-api',
    name: 'get_order',
    construct: 'function',
    symbol: 'get_order',
    purl: PURL,
    file: 'app/services/order_service.py',
    module: 'app/services/order_service.py',
    purpose: 'Read path — child span around the DB load.',
    layer: 3,
  },
  {
    id: 'orders-repo',
    process: 'orders-api',
    name: 'orders_repo',
    construct: 'class',
    symbol: 'orders_repo',
    purl: PURL,
    file: 'app/db.py',
    module: 'app/db.py',
    purpose: 'DB access — query spans + db.query.* events.',
    layer: 3,
  },
  {
    id: 'capture-payment',
    process: 'orders-api',
    name: 'capture_payment',
    construct: 'function',
    symbol: 'capture_payment',
    purl: PURL,
    file: 'app/clients/payments.py',
    module: 'app/clients/payments.py',
    purpose: 'Outbound call — span, events, W3C inject into payments-api.',
    layer: 3,
  },
  {
    id: 'handle-capture',
    process: 'payments-api',
    name: 'handle_capture',
    construct: 'function',
    symbol: 'handle_capture',
    role: 'entry',
    framework: 'fastapi',
    stereotype: 'route',
    purl: PAYMENTS_PURL,
    file: 'payments/handle_capture.py',
    module: 'payments/handle_capture.py',
    purpose: 'Downstream capture endpoint — continues the W3C trace.',
    layer: 3,
  },
  {
    id: 'Postgres',
    name: 'Postgres',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Order rows.',
    layer: 4,
  },
  {
    id: 'OTLPCollector',
    name: 'OTLP collector',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Jaeger / Honeycomb / Grafana — finished spans land here.',
    layer: 4,
  },
];

export const relations = [
  {
    id: 'app-setup',
    from: 'create-app',
    to: 'setup-tracing',
    relationType: 'references',
  },
  {
    id: 'app-post',
    from: 'create-app',
    to: 'post-order',
    relationType: 'references',
  },
  {
    id: 'app-read',
    from: 'create-app',
    to: 'read-order',
    relationType: 'references',
  },
  {
    id: 'setup-provider',
    from: 'setup-tracing',
    to: 'tracer-provider',
    relationType: 'references',
  },
  {
    id: 'post-create',
    from: 'post-order',
    to: 'create-order',
    relationType: 'references',
  },
  {
    id: 'read-get',
    from: 'read-order',
    to: 'get-order',
    relationType: 'references',
  },
  {
    id: 'create-pay',
    from: 'create-order',
    to: 'capture-payment',
    relationType: 'references',
  },
  {
    id: 'create-repo',
    from: 'create-order',
    to: 'orders-repo',
    relationType: 'references',
  },
  {
    id: 'get-repo',
    from: 'get-order',
    to: 'orders-repo',
    relationType: 'references',
  },
  {
    id: 'pay-downstream',
    from: 'capture-payment',
    to: 'handle-capture',
    relationType: 'references',
  },
  {
    id: 'repo-pg',
    from: 'orders-repo',
    to: 'Postgres',
    relationType: 'imports',
  },
  {
    id: 'provider-otlp',
    from: 'tracer-provider',
    to: 'OTLPCollector',
    relationType: 'imports',
  },
] as SubsystemRelation[];

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
        "symbol": "start_as_current_span(\"orders.read\")",
        "annotation": "Runtime: open the route span (not setup)."
      },
      {
        "from": "read-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/routes/orders.py",
        "line": 15,
        "symbol": "add_event(\"orders.read.started\")",
        "annotation": "Span event recorded into the TracerProvider."
      },
      {
        "from": "read-order",
        "to": "get-order",
        "mechanism": "calls",
        "file": "app/routes/orders.py",
        "line": 16,
        "symbol": "get_order",
        "annotation": "Business call under the active span context."
      },
      {
        "from": "get-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/services/order_service.py",
        "line": 11,
        "symbol": "start_as_current_span(\"OrderService.get\")",
        "annotation": "Child span — still the same trace."
      },
      {
        "from": "get-order",
        "to": "orders-repo",
        "mechanism": "calls",
        "file": "app/services/order_service.py",
        "line": 13,
        "symbol": "find_by_id",
        "annotation": "Service delegates to the repo."
      },
      {
        "from": "orders-repo",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/db.py",
        "line": 13,
        "symbol": "start_as_current_span(\"db.orders.find\")",
        "annotation": "DB span + db.query.execute / db.query.done events."
      },
      {
        "from": "orders-repo",
        "to": "Postgres",
        "mechanism": "reads",
        "file": "app/db.py",
        "line": 17,
        "symbol": "_ORDERS.get",
        "annotation": "Actual Postgres read (showcase stand-in)."
      },
      {
        "from": "tracer-provider",
        "to": "OTLPCollector",
        "mechanism": "produces",
        "file": "app/telemetry.py",
        "line": 22,
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
        "symbol": "start_as_current_span(\"orders.create\")",
        "annotation": "Runtime: route span + orders.create.started event."
      },
      {
        "from": "post-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/routes/orders.py",
        "line": 28,
        "symbol": "add_event(\"orders.create.started\")",
        "annotation": "Event on the parent span before work begins."
      },
      {
        "from": "post-order",
        "to": "create-order",
        "mechanism": "calls",
        "file": "app/routes/orders.py",
        "line": 29,
        "symbol": "create_order",
        "annotation": "Into the service under the active context."
      },
      {
        "from": "create-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/services/order_service.py",
        "line": 19,
        "symbol": "start_as_current_span(\"OrderService.create\")",
        "annotation": "Child span for the write path."
      },
      {
        "from": "create-order",
        "to": "capture-payment",
        "mechanism": "calls",
        "file": "app/services/order_service.py",
        "line": 21,
        "symbol": "capture_payment",
        "annotation": "Payment before persist."
      },
      {
        "from": "capture-payment",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/clients/payments.py",
        "line": 12,
        "symbol": "start_as_current_span(\"payments.capture\")",
        "annotation": "Outbound span + payments.capture.requested event."
      },
      {
        "from": "capture-payment",
        "to": "handle-capture",
        "mechanism": "calls",
        "file": "app/clients/payments.py",
        "line": 16,
        "symbol": "inject",
        "annotation": "Cross into payments-api — W3C traceparent continues the trace."
      },
      {
        "from": "handle-capture",
        "to": "OTLPCollector",
        "mechanism": "produces",
        "file": "payments/handle_capture.py",
        "line": 14,
        "symbol": "start_as_current_span(\"payments.handle\")",
        "annotation": "Downstream span in the payments-api process."
      },
      {
        "from": "create-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/services/order_service.py",
        "line": 23,
        "symbol": "add_event(\"service.payment_captured\")",
        "annotation": "Event on the service span after capture returns."
      },
      {
        "from": "create-order",
        "to": "orders-repo",
        "mechanism": "calls",
        "file": "app/services/order_service.py",
        "line": 24,
        "symbol": "insert",
        "annotation": "Persist with payment id."
      },
      {
        "from": "orders-repo",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/db.py",
        "line": 23,
        "symbol": "start_as_current_span(\"db.orders.insert\")",
        "annotation": "DB write span + query events into TracerProvider."
      },
      {
        "from": "orders-repo",
        "to": "Postgres",
        "mechanism": "writes",
        "file": "app/db.py",
        "line": 29,
        "symbol": "_ORDERS[order_id]",
        "annotation": "Actual write (showcase stand-in)."
      },
      {
        "from": "tracer-provider",
        "to": "OTLPCollector",
        "mechanism": "produces",
        "file": "app/telemetry.py",
        "line": 22,
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
        "symbol": "setup_tracing",
        "annotation": "Once at process start — not per request."
      },
      {
        "from": "setup-tracing",
        "to": "tracer-provider",
        "mechanism": "registers-into",
        "file": "app/telemetry.py",
        "line": 20,
        "symbol": "TracerProvider",
        "annotation": "Install the in-process sink tracers will produce into."
      },
      {
        "from": "tracer-provider",
        "to": "OTLPCollector",
        "mechanism": "produces",
        "file": "app/telemetry.py",
        "line": 21,
        "symbol": "OTLPSpanExporter",
        "annotation": "Exporter attached; request walkthroughs are what actually fill it."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Traced HTTP API';

export const description =
  'Python FastAPI orders service with **OpenTelemetry on the request path**: handlers/services/DB open spans into an in-process TracerProvider; capture crosses into **payments-api** with W3C context; finished spans export to OTLP. Open **Walkthroughs** for read, create, and boot.';
