import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react';
import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';
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

const relations: SubsystemRelation[] = [];

const walkthroughs: SubsystemWalkthrough[] = [
  {
    id: 'tl-post-order',
    title: 'POST /orders',
    steps: [
      {
        from: 'orders-routes',
        to: 'order-service',
        mechanism: 'calls',
        file: 'src/routes/orders.ts',
        line: 14,
        symbol: "router.post('/orders')",
        annotation: 'Wire boundary — reserves an idempotency key before touching Stripe.',
      },
      {
        from: 'order-service',
        to: 'Redis',
        mechanism: 'writes',
        file: 'src/services/orderService.ts',
        line: 23,
        symbol: 'reserveIdempotencyKey',
        annotation: 'Key lands in Redis first so a crash mid-flight folds into the cached result.',
      },
      {
        from: 'order-service',
        to: 'Stripe',
        mechanism: 'calls',
        file: 'src/services/orderService.ts',
        line: 31,
        symbol: 'capturePayment',
        annotation: 'Only truly irreversible side effect — bound to the reserved key.',
      },
      {
        from: 'order-service',
        to: 'order-repo',
        mechanism: 'calls',
        file: 'src/services/orderService.ts',
        line: 38,
        symbol: 'saveOrder',
        annotation: 'Persist the order with the payment id for reconciliation.',
      },
      {
        from: 'order-repo',
        to: 'Postgres',
        mechanism: 'writes',
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
        relations={relations}
        walkthroughs={walkthroughs}
        title="Orders API"
        description="A typical Express service: a router as the wire boundary, a service class with the business rules, a repository for persistence — and the retained state (Postgres, Redis) plus payment capture (Stripe) as external systems. Open the **Walkthroughs** tab to walk the `POST /orders` request path."
        renderFileViewer={showcase.renderFileViewer}
        renderWalkthroughViewer={showcase.renderWalkthroughViewer}
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
