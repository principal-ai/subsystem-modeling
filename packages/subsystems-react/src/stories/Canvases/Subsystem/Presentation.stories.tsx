import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import {
  SubsystemComponentGraph,
  type SubsystemNodeRect,
} from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemTrail } from '../../../subsystem/model';

/**
 * Presentation-mode harness: the graph as a static, transparent picture a host
 * can composite over its own backdrop and draw into. Exercises `interactive`,
 * `canvasBackground`, `onLayoutReady`, and `onNodeRects` — the overlay below
 * outlines each reported rect and drops a beam from its bottom edge, so a
 * mismatch between the rects and the rendered nodes is visible at a glance.
 */
const meta = {
  title: 'Canvases/Subsystem/Presentation',
  component: SubsystemComponentGraph,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
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

const PURL = 'pkg:github/acme/shop';
const stepPurl = (file: string) => `${PURL}#${file}`;

const components: SubsystemComponent[] = [
  {
    alias: 'web',
    name: 'Web client',
    construct: 'external',
    file: '',
    purl: 'external',
    purpose: 'browser checkout page',
    role: 'service',
  },
  {
    alias: 'checkout-api',
    name: 'checkoutApi',
    construct: 'function',
    file: 'src/checkout/api.ts',
    purl: PURL,
    symbol: 'checkoutApi',
    purpose: 'validates the cart and places the order',
    process: 'shop/server',
    role: 'entry',
  },
  {
    alias: 'cart-store',
    name: 'CartStore',
    construct: 'store',
    file: 'src/cart/cartStore.ts',
    purl: PURL,
    symbol: 'CartStore',
    purpose: 'current cart contents',
    process: 'shop/server',
  },
  {
    alias: 'payments',
    name: 'StripeClient',
    construct: 'class',
    file: 'src/payments/stripeClient.ts',
    purl: PURL,
    symbol: 'StripeClient',
    purpose: 'charges the card',
    process: 'shop/server',
  },
  {
    alias: 'orders-repo',
    name: 'OrdersRepo',
    construct: 'class',
    file: 'src/orders/ordersRepo.ts',
    purl: PURL,
    symbol: 'OrdersRepo',
    purpose: 'persists placed orders',
    process: 'shop/server',
  },
  {
    alias: 'stripe',
    name: 'Stripe',
    construct: 'external',
    file: '',
    purl: 'external',
    purpose: 'payment processor',
    role: 'service',
  },
];

const trails: SubsystemTrail[] = [
  {
    id: 'place-order',
    title: 'Place an order',
    steps: [
      { from: 'web', to: 'checkout-api', mechanism: 'calls', file: 'src/checkout/api.ts', span: { startLine: 12, endLine: 12, contentHash: 'fixture' }, purl: stepPurl('src/checkout/api.ts'), symbol: 'checkoutApi' },
      { from: 'checkout-api', to: 'cart-store', mechanism: 'reads', file: 'src/checkout/api.ts', span: { startLine: 18, endLine: 18, contentHash: 'fixture' }, purl: stepPurl('src/checkout/api.ts'), symbol: 'checkoutApi.loadCart' },
      { from: 'checkout-api', to: 'payments', mechanism: 'calls', file: 'src/checkout/api.ts', span: { startLine: 24, endLine: 24, contentHash: 'fixture' }, purl: stepPurl('src/checkout/api.ts'), symbol: 'checkoutApi.charge' },
      { from: 'payments', to: 'stripe', mechanism: 'calls', file: 'src/payments/stripeClient.ts', span: { startLine: 31, endLine: 31, contentHash: 'fixture' }, purl: stepPurl('src/payments/stripeClient.ts'), symbol: 'StripeClient.charge' },
      { from: 'checkout-api', to: 'orders-repo', mechanism: 'writes', file: 'src/checkout/api.ts', span: { startLine: 30, endLine: 30, contentHash: 'fixture' }, purl: stepPurl('src/checkout/api.ts'), symbol: 'checkoutApi.save' },
    ],
  },
];

const ACCENT = '#2dd4bf';

function PresentationDemo({ interactive, autoPlayTrails }: { interactive: boolean; autoPlayTrails: boolean }) {
  const [rects, setRects] = useState<SubsystemNodeRect[]>([]);
  const [ready, setReady] = useState(false);
  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
        // Host backdrop the transparent canvas should show through to.
        background:
          'radial-gradient(ellipse at 50% 30%, #1b2a3a 0%, #0b1118 70%), ' +
          'repeating-linear-gradient(0deg, transparent 0 39px, rgba(45,212,191,0.08) 39px 40px), ' +
          'repeating-linear-gradient(90deg, transparent 0 39px, rgba(45,212,191,0.08) 39px 40px)',
        backgroundBlendMode: 'normal, screen, screen',
      }}
    >
      <SubsystemComponentGraph
        components={components}
        trails={trails}
        hideSidebar
        hideDrawer
        hideLayoutToggle
        layoutDirection="horizontal"
        edgeView="trails"
        initialTrailId="place-order"
        graphTitle="Checkout"
        interactive={interactive}
        canvasBackground="transparent"
        autoPlayTrails={autoPlayTrails}
        trailStepMode="dim"
        zoomOnTrailFocus={false}
        onLayoutReady={() => setReady(true)}
        onNodeRects={setRects}
      />
      {/* Host overlay fed by onNodeRects: outline + beam per node. */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        {rects.map((r) => (
          <g key={r.alias}>
            <rect
              x={r.x - 3}
              y={r.y - 3}
              width={r.width + 6}
              height={r.height + 6}
              rx={6}
              fill="none"
              stroke={ACCENT}
              strokeOpacity={0.55}
              strokeDasharray="4 4"
            />
            <line
              x1={r.x + r.width / 2}
              y1={r.y + r.height}
              x2={r.x + r.width / 2}
              y2={r.y + r.height + 160}
              stroke={ACCENT}
              strokeOpacity={0.35}
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          fontFamily: 'monospace',
          fontSize: 12,
          color: '#9fb3c8',
          background: 'rgba(0,0,0,0.5)',
          padding: '6px 8px',
          borderRadius: 4,
        }}
      >
        {ready ? `layout ready · ${rects.length} node rects` : 'laying out…'}
      </div>
    </div>
  );
}

/** Static, transparent canvas over a host backdrop; overlay drawn from `onNodeRects`. */
export const Static: Story = {
  args: { components, interactive: false, autoPlayTrails: true },
  argTypes: {
    interactive: { control: 'boolean' },
    autoPlayTrails: { control: 'boolean' },
  },
  render: (args) => (
    <PresentationDemo interactive={args.interactive ?? false} autoPlayTrails={args.autoPlayTrails ?? true} />
  ),
};

/** Same canvas with interaction on — pan/zoom should keep the overlay glued to the nodes. */
export const Interactive: Story = {
  args: { components, interactive: true, autoPlayTrails: false },
  render: (args) => (
    <PresentationDemo interactive={args.interactive ?? true} autoPlayTrails={args.autoPlayTrails ?? false} />
  ),
};
