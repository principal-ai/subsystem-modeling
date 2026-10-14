import '@xyflow/react/dist/style.css';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
// Deep import: the package barrel pulls shiki/markdown and ~5MB into the
// bundle; the subsystem module alone is what the hero needs.
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react/dist/subsystem/SubsystemComponentGraph.js';
import type {
  SubsystemComponent,
  SubsystemTrail,
} from '@principal-ai/subsystems-react';

const components: SubsystemComponent[] = [
  {
    alias: 'checkout-api',
    name: 'checkoutApi',
    construct: 'function',
    symbol: 'checkoutApi',
    role: 'entry',
    purl: 'pkg:github/you/your-app',
    file: 'src/checkout/api.ts',
  },
  {
    alias: 'cart-store',
    name: 'cartStore',
    construct: 'store',
    symbol: 'cartStore',
    purl: 'pkg:github/you/your-app',
    file: 'src/checkout/cartStore.ts',
  },
  {
    alias: 'Stripe',
    name: 'Stripe',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
  },
  {
    alias: 'Web client',
    name: 'Web client',
    construct: 'external',
    file: '',
    purl: 'external',
  },
]

const trails: SubsystemTrail[] = [
  {
    id: 'wt-checkout',
    title: 'Checkout',
    steps: [
      {
        from: 'Web client',
        to: 'checkout-api',
        mechanism: 'calls',
        file: 'src/checkout/api.ts',
        span: {
          startLine: 1,
          endLine: 1,
          contentHash: 'edc66d36b0aa68b622e78e9ffe830b00',
        },
        purl: 'external',
        symbol: 'checkoutApi',
      },
      {
        from: 'checkout-api',
        to: 'cart-store',
        mechanism: 'writes',
        file: 'src/checkout/api.ts',
        span: {
          startLine: 12,
          endLine: 12,
          contentHash: '9e242a85bb83b331b7ece1e48b234b1c',
        },
        purl: 'external',
        symbol: 'cartStore',
      },
      {
        from: 'checkout-api',
        to: 'Stripe',
        mechanism: 'calls',
        file: 'src/checkout/api.ts',
        span: {
          startLine: 24,
          endLine: 24,
          contentHash: '111f9d50f5852db9e9b7347b07e0a9fd',
        },
        purl: 'external',
        symbol: 'Stripe',
      },
    ],
  },
]

export function SubsystemModelCanvas() {
  return (
    <ThemeProvider theme={defaultEditorTheme}>
      <SubsystemComponentGraph
        components={components}
        trails={trails}
        graphTitle="Checkout"
        hideSidebar
      />
    </ThemeProvider>
  )
}
