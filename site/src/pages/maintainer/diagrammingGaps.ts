/**
 * Common diagramming gaps — a living list of modeling situations the current
 * vocabulary does not express cleanly, each pointing at the richer diagramming
 * primitive it would need.
 *
 * Kept as plain data (not JSX) on purpose: this module is the durable list an
 * agent can read, and the Diagramming gaps page is one renderer of it.
 */

export type GapStatus = 'covered' | 'partial' | 'open'

export type DiagrammingGap = {
  id: string
  title: string
  /** How it surfaces in a model or an audit. */
  symptom: string
  /** Why the current vocabulary cannot express it cleanly. */
  why: string
  /** How it is handled today. */
  today: string
  /** The richer diagramming primitive this points to. */
  pointsTo: string
  status: GapStatus
  example?: string
}

export const DIAGRAMMING_GAPS: DiagrammingGap[] = [
  {
    id: 'store-behind-accessor',
    title: 'A store behind an accessor (encapsulated state)',
    symptom:
      'A component claims `construct: store`, but its `symbol` resolves to an accessor function (e.g. `getMaintainerProbeRegistry()`); Graphify infers `function` and the audit reports a construct mismatch.',
    why:
      'The retained state is a Map created inside a factory and reached only through the accessor. There is no module-level state declaration to anchor to, so the only addressable symbol is the function that mediates it.',
    today:
      'Graphify’s inferred construct is a structural hint, not ground truth. An accepted, agent-confirmed construct augmentation can now confirm `store` even when Graphify disagrees.',
    pointsTo:
      'A store anchored to a state location (not a declaration), with the accessor modeled as a separate node joined by `reads` / `writes`.',
    status: 'partial',
    example: `// maintainer-probe.ts
const shared = createMaintainerProbeRegistry()  // ← the state (closure-scoped)
export function getMaintainerProbeRegistry() {  // ← what Graphify sees
  return shared
}`,
  },
  {
    id: 'store-value-type',
    title: 'A store’s value type has nowhere to live',
    symptom:
      'A store holds values of a declared type (`OpencodeLiveFeedState`), but the model can only type its `properties[]`, not the store itself.',
    why:
      '`SubsystemStoreDeclaration` carried `storage` + `properties` with no store-level value type. When the state is one anonymous Map, there was no named property to hang the type on.',
    today:
      '`declaration.valueType` (+ `valueTypeRef`) ships, and the declaration panel renders it. An audit gap (`store_type_undeclared`) flags an in-memory store that declares no type, and the construct-verifier authors it. Still open: whether the type is *true* — property types are compared nowhere.',
    pointsTo:
      'A properties/value-type check lane — Graphify’s `field` reference first, an accepted augmentation as the fallback — so a declared type is verified, not just recorded.',
    status: 'partial',
    example: `const feeds = new Map<string, OpencodeLiveFeedState>()
//          └──────── the store's value type ───────┘
// → declaration.valueType, rendered in the click panel`,
  },
  {
    id: 'graphify-vocabulary',
    title: 'Graphify has no vocabulary for store / custom_entity',
    symptom:
      'Structural inference returns `function`, `unknown`, or `module` for nodes the model calls `store` or `custom_entity`.',
    why:
      'Graphify’s inferred construct set is `class | function | method | type | module | unknown`. Retained state and authored actors (Person / agent / queue) are outside it, and a call-style accessor label biases it to `function`.',
    today:
      'Inference is treated as a hint; agent-confirmed augmentations override both silence and disagreement.',
    pointsTo:
      'Either extraction that surfaces state locations, or accepting these as authored constructs whose confirmation is agent-side.',
    status: 'partial',
  },
  {
    id: 'store-two-nodes',
    title: 'A class-mediated store is two nodes, not one',
    symptom:
      'One node claims `store` while the methods that manage it live on the same class — but the honest model is a store node and a class node.',
    why:
      'The taxonomy says a store is state-only; a class that manages access is a SEPARATE node joined by `reads` / `writes`. Nothing draws or verifies that pair yet.',
    today: 'Usually authored as a single node; the mediator stays implicit.',
    pointsTo:
      'Explicit store ↔ accessor / manager relations, drawn and verifiable as a pair.',
    status: 'open',
  },
  {
    id: 'closure-local-anchor',
    title: 'State with no Graphify-addressable declaration',
    symptom:
      'Anchoring a component at a closure-local or private symbol yields a non-exact anchor, so no construct / signature check runs — it lands as a gap, never a confirmation.',
    why:
      'Anchoring matches Graphify definition nodes by symbol label; a `const` inside a factory has no node. Non-exact anchors are skipped before any construct check.',
    today:
      'Treated as unconfirmed. An agent can read the source, but the verifier does not yet consult augmentations for a non-exact anchor.',
    pointsTo:
      'Agent confirmation for non-exact anchors — source-read authority where Graphify is structurally blind.',
    status: 'open',
  },
]
