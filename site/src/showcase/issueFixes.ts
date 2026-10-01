/**
 * Side-by-side “issue → fix” examples for the docs hero.
 * Each pair is a small, visual model: left is the failing claim, right is
 * after the remediator landed.
 */
import type {
  SubsystemComponent,
  SubsystemEdgeView,
  SubsystemTrail,
} from '@principal-ai/subsystems-react'
import type { RemediationLane } from '../pages/maintainer/shared'

export type IssueFixModel = {
  title: string
  components: SubsystemComponent[]
  trails?: SubsystemTrail[]
}

export type IssueFixExample = {
  id: string
  /** Matches the audit-case tag in docs tables. */
  check: string
  layer: string
  blurb: string
  remediation: Extract<
    RemediationLane,
    'deterministic' | 'construct-fixer' | 'package-module-fixer' | 'none'
  >
  graph: {
    edgeView: SubsystemEdgeView
    showEdgeLabels: boolean
    autoPlayTrails: boolean
  }
  issue: {
    caption: string
    snippet: string
    model: IssueFixModel
  }
  fix: {
    caption: string
    snippet: string
    model: IssueFixModel
  }
}

const NOTES = 'pkg:github/you/notes-intake'
const SESSION = 'pkg:github/you/session-core'
const CHECKOUT = 'pkg:github/you/your-app'

const constructIssue: IssueFixModel = {
  title: 'Notes intake',
  components: [
    {
      alias: 'submit-note',
      name: 'submitNote',
      construct: 'function',
      symbol: 'submitNote',
      role: 'entry',
      purl: NOTES,
      file: 'src/api/submitNote.ts',
      purpose: 'HTTP entry — validates and hands off.',
      layer: 1,
    },
    {
      alias: 'note-service',
      name: 'NoteService',
      construct: 'function',
      symbol: 'NoteService',
      purl: NOTES,
      file: 'src/NoteService.ts',
      purpose: 'Authored as a function — Graphify infers class.',
      layer: 2,
    },
    {
      alias: 'note-service-persist',
      name: 'persist',
      construct: 'method',
      symbol: 'persist',
      purl: NOTES,
      file: 'src/NoteService.ts',
      purpose: 'Instance method on NoteService.',
      layer: 2,
    },
    {
      alias: 'note-repository',
      name: 'NoteRepository',
      construct: 'interface',
      symbol: 'NoteRepository',
      purl: NOTES,
      file: 'src/NoteRepository.ts',
      purpose: 'Persistence contract.',
      layer: 3,
    },
  ],
}

const constructFix: IssueFixModel = {
  ...constructIssue,
  components: constructIssue.components.map((c) =>
    c.alias === 'note-service'
      ? {
          ...c,
          construct: 'class',
          purpose: 'Owns intake rules — class, matching source.',
        }
      : c,
  ),
}

const moduleIssue: IssueFixModel = {
  title: 'Session parse',
  components: [
    {
      alias: 'session-reader',
      name: 'SessionReader',
      construct: 'class',
      symbol: 'SessionReader',
      purl: SESSION,
      module: 'src/session/SessionReader.ts',
      file: '',
      purpose: 'Reads a session transcript — module claimed with no file anchor.',
      layer: 1,
    },
    {
      alias: 'session-reader-read',
      name: 'read',
      construct: 'method',
      symbol: 'read',
      purl: SESSION,
      module: 'src/session/SessionReader.ts',
      file: 'src/session/SessionReader.ts',
      purpose: 'Loads bytes, then hands off to a parser.',
      layer: 1,
    },
  ],
}

const moduleFix: IssueFixModel = {
  title: 'Session parse',
  components: [
    {
      alias: 'session-reader',
      name: 'SessionReader',
      construct: 'class',
      symbol: 'SessionReader',
      purl: SESSION,
      module: 'src/session/SessionReader.ts',
      file: 'src/session/SessionReader.ts',
      purpose: 'Reads a session transcript.',
      layer: 1,
    },
    {
      alias: 'session-reader-read',
      name: 'read',
      construct: 'method',
      symbol: 'read',
      purl: SESSION,
      module: 'src/session/SessionReader.ts',
      file: 'src/session/SessionReader.ts',
      purpose: 'Loads bytes, then hands off to a parser.',
      layer: 1,
    },
  ],
}

const stepIssue: IssueFixModel = {
  title: 'Checkout',
  components: [
    {
      alias: 'web-client',
      name: 'Web client',
      construct: 'external',
      file: '',
      purl: 'external',
      layer: 1,
    },
    {
      alias: 'checkout-api',
      name: 'checkoutApi',
      construct: 'function',
      symbol: 'checkoutApi',
      role: 'entry',
      purl: CHECKOUT,
      file: 'src/checkout/api.ts',
      purpose: 'Checkout handler.',
      layer: 2,
    },
    {
      alias: 'old-cart',
      name: 'legacyCart',
      construct: 'store',
      symbol: 'legacyCart',
      purl: CHECKOUT,
      file: 'src/checkout/legacyCart.ts',
      purpose: 'Removed store — step still names it.',
      proposed: true,
      layer: 3,
    },
    {
      alias: 'cart-store',
      name: 'cartStore',
      construct: 'store',
      symbol: 'cartStore',
      purl: CHECKOUT,
      file: 'src/checkout/cartStore.ts',
      purpose: 'Current cart state.',
      layer: 3,
    },
    {
      alias: 'stripe',
      name: 'Stripe',
      construct: 'external',
      role: 'service',
      file: '',
      purl: 'external',
      layer: 4,
    },
  ],
  trails: [
    {
      id: 'wt-checkout',
      title: 'Checkout',
      steps: [
        {
          from: 'web-client',
          to: 'checkout-api',
          mechanism: 'calls',
          file: 'src/checkout/api.ts',
          line: 1,
          purl: CHECKOUT,
          symbol: 'checkoutApi',
        },
        {
          from: 'checkout-api',
          to: 'old-cart',
          mechanism: 'writes',
          file: 'src/checkout/api.ts',
          line: 12,
          purl: CHECKOUT,
          symbol: 'legacyCart',
        },
        {
          from: 'checkout-api',
          to: 'stripe',
          mechanism: 'calls',
          file: 'src/checkout/api.ts',
          line: 24,
          purl: CHECKOUT,
          symbol: 'Stripe',
        },
      ],
    },
  ],
}

const stepFix: IssueFixModel = {
  title: 'Checkout',
  components: stepIssue.components.filter((c) => c.alias !== 'old-cart'),
  trails: [
    {
      id: 'wt-checkout',
      title: 'Checkout',
      steps: [
        {
          from: 'web-client',
          to: 'checkout-api',
          mechanism: 'calls',
          file: 'src/checkout/api.ts',
          line: 1,
          purl: CHECKOUT,
          symbol: 'checkoutApi',
        },
        {
          from: 'checkout-api',
          to: 'cart-store',
          mechanism: 'writes',
          file: 'src/checkout/api.ts',
          line: 12,
          purl: CHECKOUT,
          symbol: 'cartStore',
        },
        {
          from: 'checkout-api',
          to: 'stripe',
          mechanism: 'calls',
          file: 'src/checkout/api.ts',
          line: 24,
          purl: CHECKOUT,
          symbol: 'Stripe',
        },
      ],
    },
  ],
}

export const ISSUE_FIX_EXAMPLES: IssueFixExample[] = [
  {
    id: 'construct-mismatch',
    check: 'construct ≠ inferred',
    layer: 'Construct',
    blurb:
      'Graphify’s structure says class; the model still claims function. construct-fixer reads source and proposes the construct — never one-click adopt.',
    remediation: 'construct-fixer',
    graph: {
      edgeView: 'graphify',
      showEdgeLabels: true,
      autoPlayTrails: false,
    },
    issue: {
      caption: 'NoteService is authored as a function.',
      snippet: `{
  "id": "note-service",
  "construct": "function",  // ← Graphify infers class
  "symbol": "NoteService",
  "file": "src/NoteService.ts"
}`,
      model: constructIssue,
    },
    fix: {
      caption: 'Construct updated from source — now a class.',
      snippet: `{
  "id": "note-service",
  "construct": "class",
  "symbol": "NoteService",
  "file": "src/NoteService.ts"
}`,
      model: constructFix,
    },
  },
  {
    id: 'module-without-file',
    check: 'module without file',
    layer: 'Static topology',
    blurb:
      'A module membership claim with no file to anchor it. package-module-fixer proposes the file; you confirm.',
    remediation: 'package-module-fixer',
    graph: {
      edgeView: 'graphify',
      showEdgeLabels: true,
      autoPlayTrails: false,
    },
    issue: {
      caption: 'SessionReader claims a module but has no file.',
      snippet: `{
  "id": "session-reader",
  "construct": "class",
  "symbol": "SessionReader",
  "module": "src/session/SessionReader.ts",
  "file": ""   // ← module with no file anchor
}`,
      model: moduleIssue,
    },
    fix: {
      caption: 'File filled from the module path — the frame can draw.',
      snippet: `{
  "id": "session-reader",
  "construct": "class",
  "symbol": "SessionReader",
  "module": "src/session/SessionReader.ts",
  "file": "src/session/SessionReader.ts"
}`,
      model: moduleFix,
    },
  },
  {
    id: 'broken-step',
    check: 'broken step endpoints',
    layer: 'Trail',
    blurb:
      'A step still names a store that was replaced. Same family as a broken containment claim, but the edge is a trail step. Trail audit is next — this is the shape of the fix once steps can be retargeted.',
    remediation: 'none',
    graph: {
      edgeView: 'trails',
      showEdgeLabels: true,
      autoPlayTrails: true,
    },
    issue: {
      caption: 'writes step still names legacyCart.',
      snippet: `{
  "from": "checkout-api",
  "to": "old-cart",     // ← store removed
  "mechanism": "writes",
  "file": "src/checkout/api.ts",
  "line": 12
}`,
      model: stepIssue,
    },
    fix: {
      caption: 'Step retargeted to cartStore.',
      snippet: `{
  "from": "checkout-api",
  "to": "cart-store",
  "mechanism": "writes",
  "file": "src/checkout/api.ts",
  "line": 12
}`,
      model: stepFix,
    },
  },
]
