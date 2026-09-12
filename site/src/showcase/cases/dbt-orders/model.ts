import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/dbt-orders';

export const components: SubsystemComponent[] = [
  {
    id: 'stg-orders',
    process: 'dbt-orders',
    name: 'stg_orders',
    construct: 'function',
    symbol: 'stg_orders',
    role: 'entry',
    framework: 'dbt',
    stereotype: 'model',
    purl: PURL,
    file: 'models/staging/stg_orders.sql',
    purpose: 'Staging model — clean raw orders.',
    layer: 2,
  },
  {
    id: 'fct-daily-orders',
    process: 'dbt-orders',
    name: 'fct_daily_orders',
    construct: 'function',
    symbol: 'fct_daily_orders',
    framework: 'dbt',
    stereotype: 'model',
    purl: PURL,
    file: 'models/marts/fct_daily_orders.sql',
    purpose: 'Mart — daily order facts for consumers.',
    layer: 3,
  },
  {
    id: 'schema-tests',
    process: 'dbt-orders',
    name: 'schema.yml',
    construct: 'module',
    symbol: 'schema',
    framework: 'dbt',
    stereotype: 'tests',
    purl: PURL,
    file: 'models/schema.yml',
    purpose: 'Unique / not_null tests on staging and marts.',
    layer: 3,
  },
  {
    id: 'RawOrders',
    name: 'raw.orders',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Warehouse source table.',
    layer: 1,
  },
  {
    id: 'Warehouse',
    name: 'Warehouse',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Snowflake/BigQuery/Redshift — where models materialize.',
    layer: 4,
  },
];

export const relations = [
  {
    "id": "e4",
    "from": "schema-tests",
    "to": "stg-orders",
    "relationType": "references"
  },
  {
    "id": "e5",
    "from": "schema-tests",
    "to": "fct-daily-orders",
    "relationType": "references"
  }
] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-run",
    "title": "dbt run (build models)",
    "steps": [
      {
        "from": "stg-orders",
        "to": "RawOrders",
        "mechanism": "reads",
        "file": "models/staging/stg_orders.sql",
        "line": 8,
        "symbol": "source('raw','orders')",
        "annotation": "Staging reads the raw source."
      },
      {
        "from": "stg-orders",
        "to": "Warehouse",
        "mechanism": "writes",
        "file": "models/staging/stg_orders.sql",
        "line": 2,
        "symbol": "select",
        "annotation": "Materialize stg_orders in the warehouse."
      },
      {
        "from": "fct-daily-orders",
        "to": "stg-orders",
        "mechanism": "reads",
        "file": "models/marts/fct_daily_orders.sql",
        "line": 6,
        "symbol": "ref('stg_orders')",
        "annotation": "Mart depends on staging via ref()."
      },
      {
        "from": "fct-daily-orders",
        "to": "Warehouse",
        "mechanism": "writes",
        "file": "models/marts/fct_daily_orders.sql",
        "line": 2,
        "symbol": "select",
        "annotation": "Materialize daily facts."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'dbt orders models';
export const description =
  'Data-eng subsystem: **raw source → stg_orders → fct_daily_orders** with schema tests. Not an app — a transform graph. Open **Walkthroughs** for `dbt run` and `dbt test`.';
