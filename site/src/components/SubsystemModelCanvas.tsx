import '@xyflow/react/dist/style.css';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
// Deep import: the package barrel pulls shiki/markdown and ~5MB into the
// bundle; the subsystem module alone is what the hero needs.
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react/dist/subsystem/SubsystemComponentGraph.js';
import type { SubsystemComponent, SubsystemComponentEdge } from '@principal-ai/subsystems-react';

const components: SubsystemComponent[] = [
  {
    id: 'checkout-api',
    name: 'checkoutApi',
    construct: 'function',
    symbol: 'checkoutApi',
    role: 'entry',
    purl: 'pkg:github/you/your-app',
    file: 'src/checkout/api.ts',
  },
  {
    id: 'cart-store',
    name: 'cartStore',
    construct: 'store',
    symbol: 'cartStore',
    purl: 'pkg:github/you/your-app',
    file: 'src/checkout/cartStore.ts',
  },
  {
    id: 'Stripe',
    name: 'Stripe',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
  },
  {
    id: 'Web client',
    name: 'Web client',
    construct: 'external',
    file: '',
    purl: 'external',
  },
]

const edges: SubsystemComponentEdge[] = [
  { id: 'e0', from: 'Web client', to: 'checkout-api', mechanism: 'calls' },
  { id: 'e1', from: 'checkout-api', to: 'cart-store', mechanism: 'writes' },
  { id: 'e2', from: 'checkout-api', to: 'Stripe', mechanism: 'calls' },
]

export function SubsystemModelCanvas() {
  return (
    <ThemeProvider theme={defaultEditorTheme}>
      <SubsystemComponentGraph
        components={components}
        edges={edges}
        graphTitle="Checkout"
        hideSidebar
      />
    </ThemeProvider>
  )
}
