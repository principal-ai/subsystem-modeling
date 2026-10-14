import type {
  SubsystemComponent,
  SubsystemTrail,
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
    declarationSpan: {
      startLine: 14,
      endLine: 14,
      contentHash: '3bfb342e89a0430b3fb06e3bf1b715c6',
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
    declarationSpan: {
      startLine: 17,
      endLine: 17,
      contentHash: 'cb7bce65b2d13f68986b2872f384c126',
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
    declarationSpan: {
      startLine: 14,
      endLine: 14,
      contentHash: 'd4220a49abbda8de97f2e47cec94ff58',
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
    declarationSpan: {
      startLine: 25,
      endLine: 25,
      contentHash: 'a1add8dbe3b0b2bea8c7349ae494b814',
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
    declarationSpan: {
      startLine: 12,
      endLine: 12,
      contentHash: '63658d02235079c42f5e09e9f5caebc9',
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
    declarationSpan: {
      startLine: 18,
      endLine: 18,
      contentHash: '31ecd31d2cd6c713b611208e00780908',
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
    declarationSpan: {
      startLine: 10,
      endLine: 10,
      contentHash: '70133960002323402f15af6cc525a636',
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
    declarationSpan: {
      startLine: 10,
      endLine: 10,
      contentHash: 'b71cb3de047c15b5bb42b3a8af62867f',
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
    declarationSpan: {
      startLine: 11,
      endLine: 11,
      contentHash: 'b50ce984321c3b1c0c287edcbef3a68b',
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
    declarationSpan: {
      startLine: 11,
      endLine: 11,
      contentHash: '962380f028cffcf5a5c9a014887d725a',
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

export const trails = [
  {
    "id": "tl-read",
    "title": "GET /orders/{id} (traced)",
    "steps": [
      {
        "from": "read-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/routes/orders.py",
        "span": {
          "startLine": 13,
          "endLine": 13,
          "contentHash": "809e529d3814b76cbc4be2e5be9819be"
        },
        "purl": PURL,
        "symbol": "start_as_current_span(\"orders.read\")",
        "annotation": "Runtime: open the route span (not setup)."
      },
      {
        "from": "read-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/routes/orders.py",
        "span": {
          "startLine": 15,
          "endLine": 15,
          "contentHash": "efb2e79ee1f7dfb247e0a553a4c67661"
        },
        "purl": PURL,
        "symbol": "add_event(\"orders.read.started\")",
        "annotation": "Span event recorded into the TracerProvider."
      },
      {
        "from": "read-order",
        "to": "get-order",
        "mechanism": "calls",
        "file": "app/routes/orders.py",
        "span": {
          "startLine": 16,
          "endLine": 16,
          "contentHash": "e96a76914cfdc926a5a1046b251d2141"
        },
        "purl": PURL,
        "symbol": "get_order",
        "annotation": "Business call under the active span context."
      },
      {
        "from": "get-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/services/order_service.py",
        "span": {
          "startLine": 11,
          "endLine": 11,
          "contentHash": "93cfa8a5b963cc46c3dc9fbaba89490a"
        },
        "purl": PURL,
        "symbol": "start_as_current_span(\"OrderService.get\")",
        "annotation": "Child span — still the same trace."
      },
      {
        "from": "get-order",
        "to": "orders-repo",
        "mechanism": "calls",
        "file": "app/services/order_service.py",
        "span": {
          "startLine": 13,
          "endLine": 13,
          "contentHash": "e8ad73edc47e4651a643ab7584d5dc6d"
        },
        "purl": PURL,
        "symbol": "find_by_id",
        "annotation": "Service delegates to the repo."
      },
      {
        "from": "orders-repo",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/db.py",
        "span": {
          "startLine": 13,
          "endLine": 13,
          "contentHash": "5bc86f6d8f056752381080a341522bc5"
        },
        "purl": PURL,
        "symbol": "start_as_current_span(\"db.orders.find\")",
        "annotation": "DB span + db.query.execute / db.query.done events."
      },
      {
        "from": "orders-repo",
        "to": "Postgres",
        "mechanism": "reads",
        "file": "app/db.py",
        "span": {
          "startLine": 17,
          "endLine": 17,
          "contentHash": "558fb0b7e0b0833ef06ef20416243adb"
        },
        "purl": PURL,
        "symbol": "_ORDERS.get",
        "annotation": "Actual Postgres read (showcase stand-in)."
      },
      {
        "from": "tracer-provider",
        "to": "OTLPCollector",
        "mechanism": "produces",
        "file": "app/telemetry.py",
        "span": {
          "startLine": 22,
          "endLine": 22,
          "contentHash": "45f0df103a2a4fde971d809ba3126f6d"
        },
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
        "span": {
          "startLine": 26,
          "endLine": 26,
          "contentHash": "ffbdf3ca36bbcafe377b12ac4a75a618"
        },
        "purl": PURL,
        "symbol": "start_as_current_span(\"orders.create\")",
        "annotation": "Runtime: route span + orders.create.started event."
      },
      {
        "from": "post-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/routes/orders.py",
        "span": {
          "startLine": 28,
          "endLine": 28,
          "contentHash": "f8b26c9049fac01e277cb0b249fbb5e4"
        },
        "purl": PURL,
        "symbol": "add_event(\"orders.create.started\")",
        "annotation": "Event on the parent span before work begins."
      },
      {
        "from": "post-order",
        "to": "create-order",
        "mechanism": "calls",
        "file": "app/routes/orders.py",
        "span": {
          "startLine": 29,
          "endLine": 29,
          "contentHash": "f86a2fd74a6e3a5138d3a06720232339"
        },
        "purl": PURL,
        "symbol": "create_order",
        "annotation": "Into the service under the active context."
      },
      {
        "from": "create-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/services/order_service.py",
        "span": {
          "startLine": 19,
          "endLine": 19,
          "contentHash": "2a55909faca33d3f3bf925891b53d8bf"
        },
        "purl": PURL,
        "symbol": "start_as_current_span(\"OrderService.create\")",
        "annotation": "Child span for the write path."
      },
      {
        "from": "create-order",
        "to": "capture-payment",
        "mechanism": "calls",
        "file": "app/services/order_service.py",
        "span": {
          "startLine": 21,
          "endLine": 21,
          "contentHash": "a80c7115481af0a30ef30f8ae326d681"
        },
        "purl": PURL,
        "symbol": "capture_payment",
        "annotation": "Payment before persist."
      },
      {
        "from": "capture-payment",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/clients/payments.py",
        "span": {
          "startLine": 12,
          "endLine": 12,
          "contentHash": "fc1554e22d25ea7e6b6967f683dc2c24"
        },
        "purl": PURL,
        "symbol": "start_as_current_span(\"payments.capture\")",
        "annotation": "Outbound span + payments.capture.requested event."
      },
      {
        "from": "capture-payment",
        "to": "handle-capture",
        "mechanism": "calls",
        "file": "app/clients/payments.py",
        "span": {
          "startLine": 16,
          "endLine": 16,
          "contentHash": "62d3ac43ddcd7e34f24cba536a170e22"
        },
        "purl": PURL,
        "symbol": "inject",
        "annotation": "Cross into payments-api — W3C traceparent continues the trace."
      },
      {
        "from": "handle-capture",
        "to": "OTLPCollector",
        "mechanism": "produces",
        "file": "payments/handle_capture.py",
        "span": {
          "startLine": 14,
          "endLine": 14,
          "contentHash": "6a66317929aefd4b8f3099f53b638b6d"
        },
        "purl": PURL,
        "symbol": "start_as_current_span(\"payments.handle\")",
        "annotation": "Downstream span in the payments-api process."
      },
      {
        "from": "create-order",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/services/order_service.py",
        "span": {
          "startLine": 23,
          "endLine": 23,
          "contentHash": "d4323a4ac6d25d260528c3504349911a"
        },
        "purl": PURL,
        "symbol": "add_event(\"service.payment_captured\")",
        "annotation": "Event on the service span after capture returns."
      },
      {
        "from": "create-order",
        "to": "orders-repo",
        "mechanism": "calls",
        "file": "app/services/order_service.py",
        "span": {
          "startLine": 24,
          "endLine": 24,
          "contentHash": "742dc69979a3ce9d0e487cc1c4044a45"
        },
        "purl": PURL,
        "symbol": "insert",
        "annotation": "Persist with payment id."
      },
      {
        "from": "orders-repo",
        "to": "tracer-provider",
        "mechanism": "produces",
        "file": "app/db.py",
        "span": {
          "startLine": 23,
          "endLine": 23,
          "contentHash": "8ffbef410986d0b82ebca39d200e8094"
        },
        "purl": PURL,
        "symbol": "start_as_current_span(\"db.orders.insert\")",
        "annotation": "DB write span + query events into TracerProvider."
      },
      {
        "from": "orders-repo",
        "to": "Postgres",
        "mechanism": "writes",
        "file": "app/db.py",
        "span": {
          "startLine": 29,
          "endLine": 29,
          "contentHash": "afd296c288dafdb2654a15498f8b18e7"
        },
        "purl": PURL,
        "symbol": "_ORDERS[order_id]",
        "annotation": "Actual write (showcase stand-in)."
      },
      {
        "from": "tracer-provider",
        "to": "OTLPCollector",
        "mechanism": "produces",
        "file": "app/telemetry.py",
        "span": {
          "startLine": 22,
          "endLine": 22,
          "contentHash": "45f0df103a2a4fde971d809ba3126f6d"
        },
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
        "span": {
          "startLine": 15,
          "endLine": 15,
          "contentHash": "c1dc67b3fa0d1ba128153219c9ec754f"
        },
        "purl": PURL,
        "symbol": "setup_tracing",
        "annotation": "Once at process start — not per request."
      },
      {
        "from": "setup-tracing",
        "to": "tracer-provider",
        "mechanism": "registers-into",
        "file": "app/telemetry.py",
        "span": {
          "startLine": 20,
          "endLine": 20,
          "contentHash": "8d84888db94a715141687a9be71e209d"
        },
        "purl": PURL,
        "symbol": "TracerProvider",
        "annotation": "Install the in-process sink tracers will produce into."
      },
      {
        "from": "tracer-provider",
        "to": "OTLPCollector",
        "mechanism": "produces",
        "file": "app/telemetry.py",
        "span": {
          "startLine": 21,
          "endLine": 21,
          "contentHash": "726e550b7a40518723dc4272c6dddea1"
        },
        "purl": PURL,
        "symbol": "OTLPSpanExporter",
        "annotation": "Exporter attached; request trails are what actually fill it."
      }
    ]
  }
] as SubsystemTrail[];

export const title = 'Traced HTTP API';

export const description =
  'Python FastAPI orders service with **OpenTelemetry on the request path**: handlers/services/DB open spans into an in-process TracerProvider; capture crosses into **payments-api** with W3C context; finished spans export to OTLP. Open **Trails** for read, create, and boot.';
