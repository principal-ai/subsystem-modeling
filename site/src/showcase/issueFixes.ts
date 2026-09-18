/**
 * Side-by-side “issue → fix” examples for the docs hero.
 * Each pair is a small, visual model: left is the failing claim, right is
 * after the remediator landed.
 */
import type {
  SubsystemComponent,
  SubsystemEdgeView,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react'
import type { RemediationLane } from '../pages/maintainer/shared'

export type IssueFixModel = {
  title: string
  components: SubsystemComponent[]
  relations: SubsystemRelation[]
  walkthroughs?: SubsystemWalkthrough[]
}

export type IssueFixExample = {
  id: string
  /** Matches the audit-case tag in docs tables. */
  check: string
  layer: string
  blurb: string
  remediation: Extract<
    RemediationLane,
    'deterministic' | 'issue-fixer' | 'topology-fixer' | 'none'
  >
  graph: {
    edgeView: SubsystemEdgeView
    showEdgeLabels: boolean
    autoPlayWalkthroughs: boolean
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
      id: 'submit-note',
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
      id: 'note-service',
      name: 'NoteService',
      construct: 'function',
      symbol: 'NoteService',
      purl: NOTES,
      file: 'src/NoteService.ts',
      purpose: 'Authored as a function — Graphify infers class.',
      layer: 2,
    },
    {
      id: 'note-service-persist',
      name: 'persist',
      construct: 'method',
      symbol: 'persist',
      purl: NOTES,
      file: 'src/NoteService.ts',
      purpose: 'Instance method on NoteService.',
      layer: 2,
    },
    {
      id: 'note-repository',
      name: 'NoteRepository',
      construct: 'interface',
      symbol: 'NoteRepository',
      purl: NOTES,
      file: 'src/NoteRepository.ts',
      purpose: 'Persistence contract.',
      layer: 3,
    },
  ],
  relations: [
    {
      id: 'e-method-persist',
      from: 'note-service',
      to: 'note-service-persist',
      relationType: 'method',
    },
    {
      id: 'e-impl-repo',
      from: 'note-service',
      to: 'note-repository',
      relationType: 'implements',
    },
  ],
}

const constructFix: IssueFixModel = {
  ...constructIssue,
  components: constructIssue.components.map((c) =>
    c.id === 'note-service'
      ? {
          ...c,
          construct: 'class',
          purpose: 'Owns intake rules — class, matching source.',
        }
      : c,
  ),
}

const relationIssue: IssueFixModel = {
  title: 'Session parse',
  components: [
    {
      id: 'session-reader',
      name: 'SessionReader',
      construct: 'class',
      symbol: 'SessionReader',
      purl: SESSION,
      file: 'src/session/SessionReader.ts',
      purpose: 'Reads a session transcript.',
      layer: 1,
    },
    {
      id: 'session-reader-read',
      name: 'read',
      construct: 'method',
      symbol: 'read',
      purl: SESSION,
      file: 'src/session/SessionReader.ts',
      purpose: 'Loads bytes, then hands off to a parser.',
      layer: 1,
    },
    {
      id: 'old-parser',
      name: 'oldParser',
      construct: 'function',
      symbol: 'oldParser',
      purl: SESSION,
      file: 'src/session/oldParser.ts',
      purpose: 'Deleted target.',
      proposed: true,
      layer: 2,
    },
  ],
  relations: [
    {
      id: 'e-method-read',
      from: 'session-reader',
      to: 'session-reader-read',
      relationType: 'method',
    },
    {
      id: 'e-stale',
      from: 'session-reader-read',
      to: 'old-parser',
      relationType: 'references',
    },
  ],
}

const relationFix: IssueFixModel = {
  title: 'Session parse',
  components: [
    {
      id: 'session-reader',
      name: 'SessionReader',
      construct: 'class',
      symbol: 'SessionReader',
      purl: SESSION,
      file: 'src/session/SessionReader.ts',
      purpose: 'Reads a session transcript.',
      layer: 1,
    },
    {
      id: 'session-reader-read',
      name: 'read',
      construct: 'method',
      symbol: 'read',
      purl: SESSION,
      file: 'src/session/SessionReader.ts',
      purpose: 'Loads bytes, then hands off to a parser.',
      layer: 1,
    },
    {
      id: 'parse-transcript',
      name: 'parseTranscript',
      construct: 'function',
      symbol: 'parseTranscript',
      purl: SESSION,
      file: 'src/session/transcript.ts',
      purpose: 'Replacement parser.',
      layer: 2,
    },
  ],
  relations: [
    {
      id: 'e-method-read',
      from: 'session-reader',
      to: 'session-reader-read',
      relationType: 'method',
    },
    {
      id: 'e-retarget',
      from: 'session-reader-read',
      to: 'parse-transcript',
      relationType: 'references',
    },
  ],
}

const hopIssue: IssueFixModel = {
  title: 'Checkout',
  components: [
    {
      id: 'web-client',
      name: 'Web client',
      construct: 'external',
      file: '',
      purl: 'external',
      layer: 1,
    },
    {
      id: 'checkout-api',
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
      id: 'old-cart',
      name: 'legacyCart',
      construct: 'store',
      symbol: 'legacyCart',
      purl: CHECKOUT,
      file: 'src/checkout/legacyCart.ts',
      purpose: 'Removed store — hop still names it.',
      proposed: true,
      layer: 3,
    },
    {
      id: 'cart-store',
      name: 'cartStore',
      construct: 'store',
      symbol: 'cartStore',
      purl: CHECKOUT,
      file: 'src/checkout/cartStore.ts',
      purpose: 'Current cart state.',
      layer: 3,
    },
    {
      id: 'stripe',
      name: 'Stripe',
      construct: 'external',
      role: 'service',
      file: '',
      purl: 'external',
      layer: 4,
    },
  ],
  relations: [],
  walkthroughs: [
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
        },
        {
          from: 'checkout-api',
          to: 'old-cart',
          mechanism: 'writes',
          file: 'src/checkout/api.ts',
          line: 12,
        },
        {
          from: 'checkout-api',
          to: 'stripe',
          mechanism: 'calls',
          file: 'src/checkout/api.ts',
          line: 24,
        },
      ],
    },
  ],
}

const hopFix: IssueFixModel = {
  title: 'Checkout',
  components: hopIssue.components.filter((c) => c.id !== 'old-cart'),
  relations: [],
  walkthroughs: [
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
          to: 'stripe',
          mechanism: 'calls',
          file: 'src/checkout/api.ts',
          line: 24,
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
      'Graphify’s structure says class; the model still claims function. issue-fixer reads source and proposes the construct — never one-click adopt.',
    remediation: 'issue-fixer',
    graph: {
      edgeView: 'relations',
      showEdgeLabels: true,
      autoPlayWalkthroughs: false,
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
    id: 'broken-endpoint',
    check: 'broken relation endpoints',
    layer: 'Static topology',
    blurb:
      'From or to names a component that was deleted. topology-fixer proposes drop or retarget; you confirm.',
    remediation: 'topology-fixer',
    graph: {
      edgeView: 'relations',
      showEdgeLabels: true,
      autoPlayWalkthroughs: false,
    },
    issue: {
      caption: 'references still points at deleted oldParser.',
      snippet: `{
  "id": "e-stale",
  "from": "session-reader-read",
  "to": "old-parser",   // ← gone from components[]
  "relationType": "references"
}`,
      model: relationIssue,
    },
    fix: {
      caption: 'Endpoint retargeted to parseTranscript.',
      snippet: `{
  "id": "e-retarget",
  "from": "session-reader-read",
  "to": "parse-transcript",
  "relationType": "references"
}`,
      model: relationFix,
    },
  },
  {
    id: 'broken-hop',
    check: 'broken hop endpoints',
    layer: 'Walkthrough',
    blurb:
      'A hop still names a store that was replaced. Same family as a broken relation, but the edge is a walkthrough step. Walkthrough audit is next — this is the shape of the fix once hops can be retargeted.',
    remediation: 'none',
    graph: {
      edgeView: 'walkthroughs',
      showEdgeLabels: true,
      autoPlayWalkthroughs: true,
    },
    issue: {
      caption: 'writes hop still names legacyCart.',
      snippet: `{
  "from": "checkout-api",
  "to": "old-cart",     // ← store removed
  "mechanism": "writes",
  "file": "src/checkout/api.ts",
  "line": 12
}`,
      model: hopIssue,
    },
    fix: {
      caption: 'Hop retargeted to cartStore.',
      snippet: `{
  "from": "checkout-api",
  "to": "cart-store",
  "mechanism": "writes",
  "file": "src/checkout/api.ts",
  "line": 12
}`,
      model: hopFix,
    },
  },
]
