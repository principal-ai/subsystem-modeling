/**
 * Subsystem Model Types
 *
 * Two layers — do not conflate them:
 *
 * 1. **Portable document** (`SubsystemModelDocument`) — the shareable standard.
 *    Schema: `schemas/subsystem-model.schema.json`
 *    (`https://principal-ai.dev/schemas/subsystem-model.schema.json`).
 *
 * 2. **Hydrated envelope** (`SubsystemModelHydrated`) — portable document plus
 *    host/machine binding (local roots, provenance, store ids, verification).
 *    Used by viewers and stores; not part of the portable standard.
 *
 * Ontology: construct = what a node is, framework + stereotype = which
 * framework pattern it plays, role = where it sits, process = where it runs,
 * module = which source file/module the export belongs to,
 * proposed = not yet in source (design / migration placeholder).
 * Package (repo) frames are derived from component `purl` when a graph spans
 * multiple repos — there is no separate `package` field.
 * `symbol` is the code identity; `name` is the display label.
 */

/** What the node IS as a declaration. `module` is not an authored construct —
 *  a module is its own subsystem. `custom_entity` is an authored actor
 *  (Person / agent / queue), not code. */
export type SubsystemConstruct =
  | 'class'
  | 'function'
  | 'method'
  | 'interface'
  | 'type_alias'
  | 'enum'
  | 'store'
  | 'external'
  | 'custom_entity';

/** Where the node sits in the topology, orthogonal to construct. */
export type SubsystemComponentRole = 'entry' | 'service';

/**
 * Actor kind for `construct: custom_entity` (open string).
 * Examples: `Person`, `agent`, `queue`, `slack-channel`.
 * Only meaningful on custom entities.
 */
export type SubsystemEntityKind = string;

/**
 * Framework that owns a stereotype vocabulary (open string).
 * Examples: `react`, `vue`, `nestjs`, `django`, `spring`.
 * Empty when the node is language-only / framework-agnostic.
 */
export type SubsystemFramework = string;

/**
 * Framework-level pattern stamped on a language construct (open string).
 * Examples: `component`, `hook`, `middleware`, `controller`, `guard`.
 * Empty when no framework pattern applies. Pair with `framework` when set.
 */
export type SubsystemStereotype = string;

/**
 * Trail step mechanism — runtime seams with a `file:line` site.
 * Belongs on trail steps; graph edges for these are derived.
 */
export type SubsystemTrailMechanism =
  | 'calls'
  | 'uses'
  | 'feeds'
  | 'produces'
  | 'writes'
  | 'reads'
  | 'watches'
  | 'registers-into';

/**
 * Edge mechanism used by derived display edges / styling. Display edges are
 * derived from trail steps, so this is the trail mechanism.
 */
export type SubsystemEdgeMechanism = SubsystemTrailMechanism;

/**
 * @deprecated No longer used — verification now tracks at the model level
 * via `verifiedAtCommits`. Keeping the type temporarily for migration
 * compatibility; remove once all dependents have updated.
 */
export type SubsystemDeclarationProvenance = 'verified' | 'authored';

/**
 * Provenance for a deprecated component: which commit removed its source, and
 * why. Captured at deprecation time so the model carries its own explanation —
 * the badge that surfaces this must not need a git call to render.
 */
export interface SubsystemComponentRemoval {
  /** Short commit hash of the removal. */
  commit: string;
  /** That commit's subject line, e.g. "Remove topology relations; …". */
  reason?: string;
}

export type SubsystemDeclTokenKind =
  | 'keyword'
  | 'name'
  | 'member'
  | 'type'
  | 'punctuation'
  | 'string'
  | 'newline';

export interface SubsystemDeclToken {
  text: string;
  kind: SubsystemDeclTokenKind;
  /** Optional foreground when pre-tokenized for a theme. */
  color?: string;
}

/** Anchored declaration location (usually from verify tooling). */
export interface SubsystemDeclarationRef {
  file: string;
  startLine: number;
  lineHash: string;
  graphifyNodeId?: string;
  capturedAt: string;
}

export interface SubsystemParamInfo {
  name?: string;
  type: string;
  ref?: SubsystemReferenceInfo;
}

export interface SubsystemPropertyInfo {
  name: string;
  type?: string;
  typeRef?: SubsystemReferenceInfo;
  nodeId?: string;
}

export interface SubsystemMethodInfo {
  nodeId: string;
  name: string;
  parameters?: SubsystemParamInfo[];
  returnType?: string;
  returnTypeRef?: SubsystemReferenceInfo;
}

export interface SubsystemReferenceInfo {
  nodeId: string;
  name: string;
  context?: string;
  source_location?: string;
}

export interface SubsystemClassDeclaration {
  kind: 'class';
  methods: SubsystemMethodInfo[];
  properties: SubsystemPropertyInfo[];
  extends: string[];
  implements: string[];
}

export interface SubsystemFunctionDeclaration {
  kind: 'function';
  parameters: SubsystemParamInfo[];
  returnType?: string;
  returnTypeRef?: SubsystemReferenceInfo;
}

export interface SubsystemMethodDeclaration {
  kind: 'method';
  hostClass: string;
  parameters?: SubsystemParamInfo[];
  returnType?: string;
}

/** One generic type parameter, e.g. `T` or `K extends keyof StudioMessages`. */
export interface SubsystemTypeParamInfo {
  name: string;
  /** Constraint written after `extends` (or language equivalent). */
  constraint?: string;
}

/** A callable/function type: `(params) => returnType`. */
export interface SubsystemCallableTypeInfo {
  parameters?: SubsystemParamInfo[];
  returnType?: string;
}

/** One enum member, with its optional literal value. */
export interface SubsystemEnumMemberInfo {
  name: string;
  value?: string;
}

/**
 * Type-family declaration (interface / type alias / enum). Structured buckets
 * cover common shapes; `rhs` is the verbatim escape hatch when none fit.
 */
export interface SubsystemTypeDeclaration {
  kind: 'type';
  properties: SubsystemPropertyInfo[];
  /** Generic type parameters, e.g. `<K extends keyof StudioMessages>`. */
  generics?: SubsystemTypeParamInfo[];
  /** Callable type — `(params) => returnType`. */
  signature?: SubsystemCallableTypeInfo;
  /** Enum members (name, optional literal value). */
  enumMembers?: SubsystemEnumMemberInfo[];
  /** Alias whose RHS is a plain reference, e.g. `ServerSessionRow[]`. */
  aliasOf?: string;
  /** Simple union of alternatives, e.g. `'started' | 'stopped'`. */
  unionOf?: string[];
  /**
   * Verbatim RHS — escape hatch for shapes the structured fields can't
   * express. Wins over every shape above when set.
   */
  rhs?: string;
}

/**
 * Declaration for `construct: external` — a named dependency with no backing
 * source declaration (a remote API, a CLI, a third-party package). Authored,
 * never extracted.
 *
 * `label` is the short name shown in the declaration block; it falls back to the
 * component's `name` when absent, so a record may carry only `attributes`.
 * `attributes` are authored key/value pairs (endpoints, install commands, a db
 * path) rendered beneath the label, mirroring `custom_entity`.
 *
 * Both are optional because a bare "this depends on X" with nothing more to say
 * is a legitimate model — requiring an empty `attributes: []` would be padding
 * for its own sake.
 */
export interface SubsystemExternalDeclaration {
  kind: 'external';
  label?: string;
  attributes?: SubsystemCustomEntityAttribute[];
}

export interface SubsystemStoreDeclaration {
  kind: 'store';
  /** Where retained state lives / who mediates access. Authored, never
   *  extracted: `memory` (process-lifetime RAM), `disk` (this process
   *  reads/writes files), or `external` (another system — db/service; carries
   *  no `process`). */
  storage?: 'memory' | 'disk' | 'external';
  /**
   * The type of the retained state itself — a store declares its type the way
   * every other declaration does. A state block names its value type
   * (`Map<string, FeedState>`, `Set<Listener>`); a table names its row/record
   * type. Orthogonal to `storage`: an in-memory store still has a value type.
   *
   * Optional because a store with neither a `valueType` nor named `properties`
   * has no declared type — that is a gap the audit can flag, not an error.
   */
  valueType?: string;
  /** Resolvable target of `valueType` — makes the type navigable like a
   *  property's `typeRef`. */
  valueTypeRef?: SubsystemReferenceInfo;
  properties: SubsystemPropertyInfo[];
}

/** A single authored attribute on a custom entity — free-form key/value. */
export interface SubsystemCustomEntityAttribute {
  key: string;
  value: string;
}

/**
 * Declaration for `construct: custom_entity` (an actor — Person/agent/queue).
 * Authored, never extracted: there is no backing source declaration.
 * `attributes` is authored key/value (e.g. `slack`, `permission`, `level`).
 */
export interface SubsystemCustomEntityDeclaration {
  kind: 'custom_entity';
  attributes: SubsystemCustomEntityAttribute[];
}

/** Structured declaration shape of a construct. */
export type SubsystemConstructDeclaration =
  | SubsystemClassDeclaration
  | SubsystemFunctionDeclaration
  | SubsystemMethodDeclaration
  | SubsystemTypeDeclaration
  | SubsystemExternalDeclaration
  | SubsystemStoreDeclaration
  | SubsystemCustomEntityDeclaration;

/** A component node — the named unit, construct-tagged. */
export interface SubsystemComponent {
  /**
   * Model-local stable alias. Referenced by trail `from` /
   * `to`; unique per model. Edges point at the alias, not the location — a
   * file move or symbol rename leaves edges intact. Code identity lives on
   * `purl` + `file` + `symbol` and is what composed (multi-model) views
   * join on, not this field.
   */
  alias: string;
  /** Display label. Prefer aligning with `symbol` when present. */
  name: string;
  construct: SubsystemConstruct;
  /** Repo-root-relative source path. */
  file: string;
  /** PURL for repo/package grouping. Multi-repo graphs draw package frames from distinct purl repo keys. */
  purl: string;
  /**
   * App/repo logo shown on the declaration card in place of the GitHub owner
   * avatar (any image URL or data URI). Optional; typically one image stamped
   * across the components of a repo.
   */
  logo?: string;
  purpose?: string;
  role?: SubsystemComponentRole;
  /**
   * Design / migration placeholder — participates in edges and flows but is
   * not a live source declaration yet. Verification skips source checks until
   * promoted (`proposed` cleared, `file` + `symbol` filled). Orthogonal to
   * `construct` (intended shape) and `role` (topology).
   */
  proposed?: boolean;
  /**
   * The claim was real but its source is gone — deleted or renamed upstream.
   * The inverse of `proposed`: instead of "not built yet", this is "built once,
   * removed since". Verification skips source checks exactly as it does for
   * `proposed`, so a model carrying deprecations is no longer wedged on
   * unfixable `missing_file` findings.
   *
   * This is a transitional marker, not a resting state. A cleanup pass removes
   * the component and repairs the trails that referenced it; the field exists so
   * the evidence survives until then. `removedIn` carries the provenance that
   * makes that judgment reviewable.
   */
  deprecated?: boolean;
  /**
   * Why and when this claim's source went away. `commit` is the short hash of
   * the removal; `reason` is that commit's subject, captured at deprecation time
   * so the model's JSON explains itself without a `git show`.
   */
  removedIn?: SubsystemComponentRemoval;
  /**
   * Framework that owns the stereotype (e.g. `react`, `nestjs`).
   * Orthogonal to `construct` — a React component is still `construct: function`.
   */
  framework?: SubsystemFramework;
  /**
   * Framework pattern this declaration plays (e.g. `component`, `hook`).
   * Prefer this over inventing framework-specific constructs.
   */
  stereotype?: SubsystemStereotype;
  process?: string;
  /**
   * Source-module membership — which file/module this export belongs to
   * (e.g. `src/session/transcript.ts`). Nodes sharing a `module` are drawn
   * inside one boundary frame. Prefer this over inventing a module construct:
   * anchor each export as its real construct (`function` / `class` / …) and
   * set `module` so the file reads as a frame, not a node. Orthogonal to
   * `process` (runtime deployment unit).
   */
  module?: string;
  /** Code identity — real declaration in `file` when set. */
  symbol?: string;
  /**
   * Actor kind for `construct: custom_entity` (e.g. `Person`, `agent`,
   * `queue`), rendered as the node badge. Ignored on code constructs.
   */
  entityKind?: SubsystemEntityKind;
  /**
   * Node + declaration accent override (hex). Wins over the construct-derived
   * color. Typically used to theme a custom entity (agent, queue).
   */
  color?: string;
  layer?: number;
  /** Structured declaration shape of the construct (params, members, …). */
  declaration?: SubsystemConstructDeclaration;
  /**
   * @deprecated No longer used — verification now tracks at the model level
   * via `verifiedAtCommits`. Keeping the field temporarily for migration.
   */
  declarationProvenance?: SubsystemDeclarationProvenance;
  tokens?: SubsystemDeclToken[];
  /** Location anchor (file/line/hash) — distinct from `declaration` (shape). */
  declarationRef?: SubsystemDeclarationRef;
}

/**
 * Derived / display graph edge used by renderers. Built from trail
 * steps — not authored as its own document field.
 */
export interface SubsystemComponentEdge {
  id: string;
  from: string;
  to: string;
  mechanism: SubsystemEdgeMechanism;
}

export interface SubsystemTrailStep {
  /** Source component alias. */
  from: string;
  /** Target component alias. */
  to: string;
  /** Runtime seam label (Set B). */
  mechanism: SubsystemTrailMechanism;
  file: string;
  /** 1-based line within `file`. */
  line: number;
  /**
   * File-anchored purl of the seam site (e.g.
   * `pkg:github/owner/name#path/to/file.ts`), mirroring component `purl`.
   * Required: readers resolve the checkout from this instead of guessing
   * the repo from the step's endpoint components.
   */
  purl: string;
  /**
   * Frame name for this step — the function/method on the stack at the site.
   * Required: the Trails list shows this instead of a bare
   * mechanism + filename fallback.
   */
  symbol: string;
  /**
   * Planned seam — the step describes intended behavior through code that is
   * not written yet. Orthogonal to (and redundant with) the endpoints' own
   * `proposed` flags: a step is proposed when it says so OR either endpoint
   * is proposed. Verification skips source checks either way, and viewers
   * tint it exactly like a proposed node.
   */
  proposed?: boolean;
  /**
   * Free-text note anchored to this step's site line. Optional — informative
   * only, never verified against source; viewers surface it via the codeview's
   * annotation column.
   */
  annotation?: string;
}

/** Ordered runtime trail (one named behavior story). */
export interface SubsystemTrail {
  id: string;
  title: string;
  steps: SubsystemTrailStep[];
}

/**
 * Portable subsystem model — the shareable standard.
 * No host paths, provenance, document-level repo, store ids, or verification.
 * Repo identity lives on each component's `purl`.
 */
/**
 * A pinned commit for one referenced repo. Keyed by `purlRepoKey` (the purl
 * with its fragment stripped). Commit-only — a dirty tree has no reproducible
 * name and is never recorded as a coordinate.
 */
export type PurlCommit = string;

export interface SubsystemModelDocument {
  /**
   * Optional pointer to the JSON Schema that describes this file. Lets editors
   * give autocomplete and validation when the field is set.
   */
  $schema?: string;

  title: string;
  description?: string;
  components: SubsystemComponent[];
  /** Runtime trails (ordered steps with sites). */
  trails?: SubsystemTrail[];
  /**
   * The commit each referenced repo was at when the model was created. The
   * coordinate system for every `file:line` in the document: without it, a
   * line pointer is ambiguous across commits. Immutable after create.
   */
  createdAtCommits?: Record<string, PurlCommit>;
  /**
   * The commit each referenced repo was at when a full audit last passed
   * against a clean referenced state. Absent until an audit earns it.
   */
  verifiedAtCommits?: Record<string, PurlCommit>;
}

/**
 * Hydrated model: portable document + store metadata.
 * Shape used after a host accepts/persists a model for viewing on a machine.
 * Local path binding is resolved from Alexandria (via each component's purl)
 * and repo identity is derived from purls — neither is stored here.
 */
export interface SubsystemModelHydrated extends SubsystemModelDocument {
  /** Store-assigned id when persisted. */
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Host verification result; shape is host-defined. */
  verification?: unknown;
}

/**
 * Type guard: true when the value plausibly conforms to a portable
 * subsystem model. Shallow check — full validation belongs to the schema /
 * host validator.
 */
export function isSubsystemModelDocument(value: unknown): value is SubsystemModelDocument {
  if (!value || typeof value !== 'object') return false;
  const v = value as {
    title?: unknown;
    components?: unknown;
  };
  return typeof v.title === 'string' && Array.isArray(v.components);
}

/**
 * Keep only portable fields — drop host bindings / store metadata if a
 * hydrated record is passed in. Use before writing a gist or any other
 * share surface that must stay schema-clean.
 */
export function toPortableDocument(
  doc: SubsystemModelDocument,
): SubsystemModelDocument {
  const out: SubsystemModelDocument = {
    title: doc.title,
    components: doc.components,
  };
  if (doc.$schema) out.$schema = doc.$schema;
  if (doc.description) out.description = doc.description;
  if (doc.trails) out.trails = doc.trails;
  if (doc.createdAtCommits) out.createdAtCommits = doc.createdAtCommits;
  if (doc.verifiedAtCommits) out.verifiedAtCommits = doc.verifiedAtCommits;
  return out;
}

/** Stable id for a derived graph edge from a trail step. */
export function derivedGraphEdgeId(
  from: string,
  to: string,
  mechanism: SubsystemEdgeMechanism,
): string {
  return `${from}--${mechanism}-->${to}`;
}

/**
 * A derived boundary region — one per distinct non-empty grouping field on
 * the document's components, in first-appearance order. Pure data: viewers
 * add their own frame vocabulary (kinds, node ids) on top.
 */
export interface SubsystemRegionGroup {
  /** The trimmed field value, e.g. `principal-studio/host`. */
  key: string;
  /** Display label; the region grouping uses the key itself. */
  label: string;
  /** Component aliases carrying this key, in document order. */
  memberAliases: string[];
}

/**
 * Derive process boundary regions — one per distinct non-empty `process`
 * value, in first-appearance order. The rollup boundary verification reads:
 * a process key is a deployment-unit claim, and every claim is a boundary
 * someone can accept a container for.
 */
export function getSubsystemProcessRegions(
  doc: { readonly components: readonly SubsystemComponent[] },
): SubsystemRegionGroup[] {
  const byProcess = new Map<string, string[]>();
  for (const c of doc.components) {
    const p = c.process?.trim();
    if (!p) continue;
    const list = byProcess.get(p) ?? [];
    list.push(c.alias);
    byProcess.set(p, list);
  }
  return [...byProcess.entries()].map(([key, memberAliases]) => ({
    key,
    label: key,
    memberAliases,
  }));
}

/**
 * Derive module boundary regions — one per distinct non-empty `module`
 * value, in first-appearance order. Label is the module path (file).
 */
export function getSubsystemModuleRegions(
  doc: { readonly components: readonly SubsystemComponent[] },
): SubsystemRegionGroup[] {
  const byModule = new Map<string, string[]>();
  for (const c of doc.components) {
    const m = c.module?.trim();
    if (!m) continue;
    const list = byModule.get(m) ?? [];
    list.push(c.alias);
    byModule.set(m, list);
  }
  return [...byModule.entries()].map(([key, memberAliases]) => ({
    key,
    label: key,
    memberAliases,
  }));
}

/**
 * Build display edges for the graph canvas from trail steps
 * (deduped by from/to/mechanism).
 */
export function deriveGraphEdges(doc: {
  trails?: SubsystemTrail[];
}): SubsystemComponentEdge[] {
  const byId = new Map<string, SubsystemComponentEdge>();
  for (const w of doc.trails ?? []) {
    for (const step of w.steps) {
      const id = derivedGraphEdgeId(step.from, step.to, step.mechanism);
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          from: step.from,
          to: step.to,
          mechanism: step.mechanism,
        });
      }
    }
  }
  return [...byId.values()];
}
