import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react';
import type {
  SubsystemComponent,
  SubsystemTrail,
} from '@principal-ai/subsystems-react';
import { makeShowcaseRenderers } from '../src/showcase/files.tsx';

const components: SubsystemComponent[] = [
  {
    alias: 'orders-routes',
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
    alias: 'order-service',
    process: 'orders-api',
    name: 'OrderService',
    construct: 'class',
    symbol: 'OrderService',
    purl: 'pkg:github/you/orders-api',
    file: 'src/services/orderService.ts',
    purpose: 'Business rules: stock checks, totals, payment capture.',
  },
  {
    alias: 'order-repo',
    process: 'orders-api',
    name: 'OrderRepository',
    construct: 'class',
    symbol: 'OrderRepository',
    purl: 'pkg:github/you/orders-api',
    file: 'src/repositories/orderRepository.ts',
    purpose: 'SQL persistence for orders.',
  },
  {
    alias: 'Postgres',
    name: 'Postgres',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Retained orders.',
  },
  {
    alias: 'Redis',
    name: 'Redis',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Idempotency keys + rate limits.',
  },
  {
    alias: 'Stripe',
    name: 'Stripe',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Payment capture.',
  },
];

const trails: SubsystemTrail[] = [
  {
    id: 'tl-post-order',
    title: 'POST /orders',
    steps: [
      {
        from: 'orders-routes',
        to: 'order-service',
        mechanism: 'calls',
        file: 'src/routes/orders.ts',
        span: {
          startLine: 14,
          endLine: 14,
          contentHash: '9ca276dd2ec8993b8720355b396547d4',
        },
        symbol: "router.post('/orders')",
        annotation: 'Wire boundary — reserves an idempotency key before touching Stripe.',
      },
      {
        from: 'order-service',
        to: 'Redis',
        mechanism: 'writes',
        file: 'src/services/orderService.ts',
        span: {
          startLine: 23,
          endLine: 23,
          contentHash: 'f1efc6d5708643e78b1ea18caba72e0f',
        },
        symbol: 'reserveIdempotencyKey',
        annotation: 'Key lands in Redis first so a crash mid-flight folds into the cached result.',
      },
      {
        from: 'order-service',
        to: 'Stripe',
        mechanism: 'calls',
        file: 'src/services/orderService.ts',
        span: {
          startLine: 31,
          endLine: 31,
          contentHash: '534627f6a493352f8735a873f4bbd31f',
        },
        symbol: 'capturePayment',
        annotation: 'Only truly irreversible side effect — bound to the reserved key.',
      },
      {
        from: 'order-service',
        to: 'order-repo',
        mechanism: 'calls',
        file: 'src/services/orderService.ts',
        span: {
          startLine: 38,
          endLine: 38,
          contentHash: 'f7c32347ed7732176d9d4d4c51d71984',
        },
        symbol: 'saveOrder',
        annotation: 'Persist the order with the payment id for reconciliation.',
      },
      {
        from: 'order-repo',
        to: 'Postgres',
        mechanism: 'writes',
        file: 'src/repositories/orderRepository.ts',
        span: {
          startLine: 12,
          endLine: 12,
          contentHash: '5b2b553b8b94659a76a538de0f03887b',
        },
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
        trails={trails}
        title="Orders API"
        description="A typical Express service: a router as the wire boundary, a service class with the business rules, a repository for persistence — and the retained state (Postgres, Redis) plus payment capture (Stripe) as external systems. Open the **Trails** tab to walk the `POST /orders` request path."
        renderFileViewer={showcase.renderFileViewer}
        renderTrailViewer={showcase.renderTrailViewer}
      />
    </div>
  );
}

const meta = {
  title: 'TypeScript/Orders API',
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
