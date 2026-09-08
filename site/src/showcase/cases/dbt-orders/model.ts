import type {
  SubsystemComponent,
  SubsystemComponentEdge,
} from '@principal-ai/subsystems-react';
import type { SubsystemThroughline } from '@principal-ai/subsystems-react/dist/subsystem/model.js';

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

export const edges: SubsystemComponentEdge[] = [
  { id: 'e0', from: 'stg-orders', to: 'RawOrders', mechanism: 'reads' },
  { id: 'e1', from: 'fct-daily-orders', to: 'stg-orders', mechanism: 'reads' },
  { id: 'e2', from: 'stg-orders', to: 'Warehouse', mechanism: 'writes' },
  { id: 'e3', from: 'fct-daily-orders', to: 'Warehouse', mechanism: 'writes' },
  { id: 'e4', from: 'schema-tests', to: 'stg-orders', mechanism: 'references' },
  { id: 'e5', from: 'schema-tests', to: 'fct-daily-orders', mechanism: 'references' },
];

export const throughlines: SubsystemThroughline[] = [
  {
    id: 'tl-run',
    title: 'dbt run (build models)',
    steps: [
      { edgeId: 'e0', file: 'models/staging/stg_orders.sql', line: 8, symbol: "source('raw','orders')", annotation: 'Staging reads the raw source.' },
      { edgeId: 'e2', file: 'models/staging/stg_orders.sql', line: 2, symbol: 'select', annotation: 'Materialize stg_orders in the warehouse.' },
      { edgeId: 'e1', file: 'models/marts/fct_daily_orders.sql', line: 6, symbol: "ref('stg_orders')", annotation: 'Mart depends on staging via ref().' },
      { edgeId: 'e3', file: 'models/marts/fct_daily_orders.sql', line: 2, symbol: 'select', annotation: 'Materialize daily facts.' },
    ],
  },
  {
    id: 'tl-test',
    title: 'dbt test',
    steps: [
      { edgeId: 'e4', file: 'models/schema.yml', line: 11, symbol: 'unique, not_null', annotation: 'Assert staging grain.' },
      { edgeId: 'e5', file: 'models/schema.yml', line: 17, symbol: 'unique, not_null', annotation: 'Assert mart grain.' },
    ],
  },
];

export const title = 'dbt orders models';
export const description =
  'Data-eng subsystem: **raw source → stg_orders → fct_daily_orders** with schema tests. Not an app — a transform graph. Open **Flows** for `dbt run` and `dbt test`.';
