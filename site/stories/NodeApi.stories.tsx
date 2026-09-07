import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react';
import type {
  SubsystemComponent,
  SubsystemComponentEdge,
} from '@principal-ai/subsystems-react';
import type { SubsystemThroughline } from '@principal-ai/subsystems-react/dist/subsystem/model.js';
import { makeShowcaseRenderers } from '../src/showcase/files.tsx';

const components: SubsystemComponent[] = [
  {
    id: 'orders-routes',
    process: 'orders-api',
    name: 'orderRoutes',
    construct: 'function',
    symbol: 'orderRouter',
    role: 'entry',
    purl: 'pkg:github/you/orders-api',
    file: 'src/routes/orders.ts',
    purpose: 'Express router — the wire boundary (POST /orders, GET /orders/:id).',
  },
  {
    id: 'order-service',
    process: 'orders-api',
    name: 'OrderService',
    construct: 'class',
    symbol: 'OrderService',
    purl: 'pkg:github/you/orders-api',
    file: 'src/services/orderService.ts',
    purpose: 'Business rules: stock checks, totals, payment capture.',
  },
  {
    id: 'order-repo',
    process: 'orders-api',
    name: 'OrderRepository',
    construct: 'class',
    symbol: 'OrderRepository',
    purl: 'pkg:github/you/orders-api',
    file: 'src/repositories/orderRepository.ts',
    purpose: 'SQL persistence for orders.',
  },
  {
    id: 'Postgres',
    name: 'Postgres',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Retained orders.',
  },
  {
    id: 'Redis',
    name: 'Redis',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Idempotency keys + rate limits.',
  },
  {
    id: 'Stripe',
    name: 'Stripe',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Payment capture.',
  },
];

const edges: SubsystemComponentEdge[] = [
  { id: 'e0', from: 'orders-routes', to: 'order-service', mechanism: 'calls' },
  { id: 'e1', from: 'order-service', to: 'order-repo', mechanism: 'calls' },
  { id: 'e2', from: 'order-service', to: 'Stripe', mechanism: 'calls' },
  { id: 'e3', from: 'order-repo', to: 'Postgres', mechanism: 'writes' },
  { id: 'e4', from: 'order-service', to: 'Redis', mechanism: 'writes' },
  { id: 'e5', from: 'orders-routes', to: 'Redis', mechanism: 'reads' },
];

const throughlines: SubsystemThroughline[] = [
  {
    id: 'tl-post-order',
    title: 'POST /orders',
    steps: [
      {
        edgeId: 'e0',
        file: 'src/routes/orders.ts',
        line: 14,
        symbol: "router.post('/orders')",
        annotation: 'Wire boundary — reserves an idempotency key before touching Stripe.',
      },
      {
        edgeId: 'e4',
        file: 'src/services/orderService.ts',
        line: 23,
        symbol: 'reserveIdempotencyKey',
        annotation: 'Key lands in Redis first so a crash mid-flight folds into the cached result.',
      },
      {
        edgeId: 'e2',
        file: 'src/services/orderService.ts',
        line: 31,
        symbol: 'capturePayment',
        annotation: 'Only truly irreversible side effect — bound to the reserved key.',
      },
      {
        edgeId: 'e1',
        file: 'src/services/orderService.ts',
        line: 38,
        symbol: 'saveOrder',
        annotation: 'Persist the order with the payment id for reconciliation.',
      },
      {
        edgeId: 'e3',
        file: 'src/repositories/orderRepository.ts',
        line: 12,
        symbol: 'insert',
        annotation: 'ON CONFLICT (idempotency_key) DO NOTHING — client retries short-circuit.',
      },
    ],
  },
];

const showcase = makeShowcaseRenderers('orders-api');

function OrdersApiDemo() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={components}
        edges={edges}
        throughlines={throughlines}
        title="Orders API"
        description="A typical Express service: a router as the wire boundary, a service class with the business rules, a repository for persistence — and the retained state (Postgres, Redis) plus payment capture (Stripe) as external systems. Open the **Flows** tab to walk the `POST /orders` request path."
        renderFileViewer={showcase.renderFileViewer}
        renderThroughlineViewer={showcase.renderThroughlineViewer}
      />
    </div>
  );
}

const meta = {
  title: 'Examples/TypeScript/Orders API',
  component: SubsystemComponentGraph,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof SubsystemComponentGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OrdersApi: Story = {
  render: () => <OrdersApiDemo />,
};
