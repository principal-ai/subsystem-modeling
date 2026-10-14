import type {
  SubsystemComponent,
  SubsystemTrail,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/dbt-orders';

export const components: SubsystemComponent[] = [
  {
    alias: 'stg-orders',
    process: 'dbt-orders',
    name: 'stg_orders',
    construct: 'function',
    symbol: 'stg_orders',
    role: 'entry',
    framework: 'dbt',
    stereotype: 'model',
    purl: PURL,
    file: 'models/staging/stg_orders.sql',
    declarationSpan: {
      startLine: 2,
      endLine: 2,
      contentHash: 'b1a36d25d9633ed2ac04939fcb614ccb',
    },
    module: 'models/staging/stg_orders.sql',
    purpose: 'Staging model — clean raw orders.',
    layer: 2,
  },
  {
    alias: 'fct-daily-orders',
    process: 'dbt-orders',
    name: 'fct_daily_orders',
    construct: 'function',
    symbol: 'fct_daily_orders',
    framework: 'dbt',
    stereotype: 'model',
    purl: PURL,
    file: 'models/marts/fct_daily_orders.sql',
    declarationSpan: {
      startLine: 2,
      endLine: 2,
      contentHash: 'b1a36d25d9633ed2ac04939fcb614ccb',
    },
    module: 'models/marts/fct_daily_orders.sql',
    purpose: 'Mart — daily order facts for consumers.',
    layer: 3,
  },
  {
    alias: 'schema-tests',
    process: 'dbt-orders',
    name: 'schema.yml',
    construct: 'custom_entity',
    symbol: 'schema',
    framework: 'dbt',
    stereotype: 'tests',
    purl: PURL,
    file: 'models/schema.yml',
    declarationSpan: {
      startLine: 3,
      endLine: 3,
      contentHash: '72aa5eaddc0863cbc803bc82043f69ea',
    },
    module: 'models/schema.yml',
    purpose: 'Unique / not_null tests on staging and marts.',
    layer: 3,
  },
  {
    alias: 'RawOrders',
    name: 'raw.orders',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Warehouse source table.',
    layer: 1,
  },
  {
    alias: 'Warehouse',
    name: 'Warehouse',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Snowflake/BigQuery/Redshift — where models materialize.',
    layer: 4,
  },
];

export const trails = [
  {
    "id": "tl-run",
    "title": "dbt run (build models)",
    "steps": [
      {
        "from": "stg-orders",
        "to": "RawOrders",
        "mechanism": "reads",
        "file": "models/staging/stg_orders.sql",
        "span": {
          "startLine": 8,
          "endLine": 8,
          "contentHash": "24d8624647b0fa7b49f6fc498eb2705c"
        },
        "purl": PURL,
        "symbol": "source('raw','orders')",
        "annotation": "Staging reads the raw source."
      },
      {
        "from": "stg-orders",
        "to": "Warehouse",
        "mechanism": "writes",
        "file": "models/staging/stg_orders.sql",
        "span": {
          "startLine": 2,
          "endLine": 2,
          "contentHash": "b1a36d25d9633ed2ac04939fcb614ccb"
        },
        "purl": PURL,
        "symbol": "select",
        "annotation": "Materialize stg_orders in the warehouse."
      },
      {
        "from": "fct-daily-orders",
        "to": "stg-orders",
        "mechanism": "reads",
        "file": "models/marts/fct_daily_orders.sql",
        "span": {
          "startLine": 6,
          "endLine": 6,
          "contentHash": "cf1cdbd1cf9ce6b2460f0f5e8243818a"
        },
        "purl": PURL,
        "symbol": "ref('stg_orders')",
        "annotation": "Mart depends on staging via ref()."
      },
      {
        "from": "fct-daily-orders",
        "to": "Warehouse",
        "mechanism": "writes",
        "file": "models/marts/fct_daily_orders.sql",
        "span": {
          "startLine": 2,
          "endLine": 2,
          "contentHash": "b1a36d25d9633ed2ac04939fcb614ccb"
        },
        "purl": PURL,
        "symbol": "select",
        "annotation": "Materialize daily facts."
      }
    ]
  }
] as SubsystemTrail[];

export const title = 'dbt orders models';
export const description =
  'Data-eng subsystem: **raw source → stg_orders → fct_daily_orders** with schema tests. Not an app — a transform graph. Open **Trails** for `dbt run` and `dbt test`.';
