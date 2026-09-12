import '@xyflow/react/dist/style.css';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
// Deep import: the package barrel pulls shiki/markdown and ~5MB into the
// bundle; the subsystem module alone is what the hero needs.
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react/dist/subsystem/SubsystemComponentGraph.js';
import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

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

const relations: SubsystemRelation[] = []

const walkthroughs: SubsystemWalkthrough[] = [
  {
    id: 'wt-checkout',
    title: 'Checkout',
    steps: [
      {
        from: 'Web client',
        to: 'checkout-api',
        mechanism: 'calls',
        file: 'src/checkout/api.ts',
        line: 1,
      },
      {
        from: 'checkout-api',
        to: 'cart-store',
        mechanism: 'writes',
        file: 'src/checkout/api.ts',
        line: 12,
      },
      {
        from: 'checkout-api',
        to: 'Stripe',
        mechanism: 'calls',
        file: 'src/checkout/api.ts',
        line: 24,
      },
    ],
  },
]

export function SubsystemModelCanvas() {
  return (
    <ThemeProvider theme={defaultEditorTheme}>
      <SubsystemComponentGraph
        components={components}
        relations={relations}
        walkthroughs={walkthroughs}
        graphTitle="Checkout"
        hideSidebar
      />
    </ThemeProvider>
  )
}
