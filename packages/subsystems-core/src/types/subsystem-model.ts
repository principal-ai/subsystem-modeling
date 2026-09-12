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
 * proposed = not yet in source (design / migration placeholder).
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
 * Topology relation type — structural / module / type claims between
 * components. Belongs on `relations[]`, not on walkthrough hops.
 */
export type SubsystemRelationType =
  | 'imports'
  | 'extends'
  | 'inherits'
  | 'implements'
  | 'mixes_in'
  | 'method'
  | 'references'
  | 'contains';

/**
 * Walkthrough hop mechanism — runtime seams with a `file:line` site.
 * Belongs on walkthrough steps; graph edges for these are derived.
 */
export type SubsystemWalkthroughMechanism =
  | 'calls'
  | 'uses'
  | 'feeds'
  | 'produces'
  | 'writes'
  | 'reads'
  | 'watches'
  | 'registers-into';

/**
 * Union used by derived graph edges / styling (topology relationType or
 * walkthrough hop mechanism).
 */
export type SubsystemEdgeMechanism =
  | SubsystemRelationType
  | SubsystemWalkthroughMechanism;

export type SubsystemDeclarationProvenance = 'verified' | 'authored';

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
  revision?: {
    headSha: string;
    dirtyHash?: string | null;
  };
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

export interface SubsystemCallInfo {
  nodeId: string;
  name: string;
  source_location?: string;
}

export interface SubsystemReferenceInfo {
  nodeId: string;
  name: string;
  context?: string;
  source_location?: string;
}

export interface SubsystemImportInfo {
  nodeId: string;
  name: string;
  relation?: string;
  source_location?: string;
}

export interface SubsystemClassDeclaration {
  kind: 'class';
  methods: SubsystemMethodInfo[];
  properties: SubsystemPropertyInfo[];
  extends: string[];
  implements: string[];
  instantiations: SubsystemCallInfo[];
  references: SubsystemReferenceInfo[];
}

export interface SubsystemFunctionDeclaration {
  kind: 'function';
  parameters: SubsystemParamInfo[];
  returnType?: string;
  returnTypeRef?: SubsystemReferenceInfo;
  callers: SubsystemCallInfo[];
  callees: SubsystemCallInfo[];
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
  usedBy: SubsystemReferenceInfo[];
  implementors: string[];
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

export interface SubsystemModuleDeclaration {
  kind: 'module';
  exports: string[];
  imports: SubsystemImportInfo[];
  symbols: string[];
}

export interface SubsystemExternalDeclaration {
  kind: 'external';
  label: string;
}

export interface SubsystemStoreDeclaration {
  kind: 'store';
  /** Where retained state lives / who mediates access. Authored, never
   *  extracted: `memory` (process-lifetime RAM), `disk` (this process
   *  reads/writes files), or `external` (another system — db/service; carries
   *  no `process`). */
  storage?: 'memory' | 'disk' | 'external';
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
  | SubsystemModuleDeclaration
  | SubsystemExternalDeclaration
  | SubsystemStoreDeclaration
  | SubsystemCustomEntityDeclaration;

/** A component node — the named unit, construct-tagged. */
export interface SubsystemComponent {
  id: string;
  /** Display label. Prefer aligning with `symbol` when present. */
  name: string;
  construct: SubsystemConstruct;
  /** Repo-root-relative source path. */
  file: string;
  /** PURL for repo/package grouping. */
  purl: string;
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
  declarationProvenance?: SubsystemDeclarationProvenance;
  tokens?: SubsystemDeclToken[];
  /** Location anchor (file/line/hash) — distinct from `declaration` (shape). */
  declarationRef?: SubsystemDeclarationRef;
}

/** A topology relation between components (structural / module / type). */
export interface SubsystemRelation {
  id: string;
  /** Source component id. */
  from: string;
  /** Target component id (or external label). */
  to: string;
  relationType: SubsystemRelationType;
  /** Concrete file/symbol evidence (often purls). */
  refs?: string[];
}

/**
 * Derived / display graph edge used by renderers. Built from `relations`
 * and/or walkthrough hops — not authored as its own document field.
 */
export interface SubsystemComponentEdge {
  id: string;
  from: string;
  to: string;
  mechanism: SubsystemEdgeMechanism;
  refs?: string[];
}

export interface SubsystemWalkthroughStep {
  /** Source component id. */
  from: string;
  /** Target component id. */
  to: string;
  /** Runtime seam label (Set B). */
  mechanism: SubsystemWalkthroughMechanism;
  file: string;
  /** 1-based line within `file`. */
  line: number;
  /** Frame name for this hop (function/method/symbol). Optional. */
  symbol?: string;
  /**
   * Free-text note anchored to this hop's site line. Optional — informative
   * only, never verified against source; viewers surface it via the codeview's
   * annotation column.
   */
  annotation?: string;
}

/** Ordered runtime walkthrough (one named behavior story). */
export interface SubsystemWalkthrough {
  id: string;
  title: string;
  steps: SubsystemWalkthroughStep[];
}

export interface SubsystemRepoRef {
  owner: string;
  name: string;
}

/**
 * Portable subsystem model — the shareable standard.
 * No host paths, provenance, document-level repo, store ids, or verification.
 * Repo identity lives on each component's `purl`.
 */
export interface SubsystemModelDocument {
  /**
   * Optional pointer to the JSON Schema that describes this file. Lets editors
   * give autocomplete and validation when the field is set.
   */
  $schema?: string;

  title: string;
  description?: string;
  components: SubsystemComponent[];
  /** Topology relations (structural / module / type). May be empty. */
  relations: SubsystemRelation[];
  /** Runtime walkthroughs (ordered hops with sites). */
  walkthroughs?: SubsystemWalkthrough[];
}

/**
 * Host/machine fields layered onto a portable document for local use.
 * Not part of the portable standard — viewers and stores own this envelope.
 */
export interface SubsystemModelHostBinding {
  /** Provenance of the model (e.g. `agent:<name>`, `manual`). */
  source?: string;
  /**
   * Optional document-level repo summary for host indexes/listings.
   * Portable identity lives on each component's `purl`.
   */
  repo?: SubsystemRepoRef;
  /**
   * Local filesystem root component `file` paths resolve against.
   * Opt-in; sandboxed reads for single-repo models.
   */
  repoRoot?: string;
  /**
   * Per-repo local roots for multi-repo models, keyed by purl repo key
   * (`pkg:github/owner/name`, fragment stripped).
   */
  repoRoots?: Record<string, string>;
}

/**
 * Hydrated model: portable document + host binding + optional store metadata.
 * Shape used after a host accepts/persists a model for viewing on a machine.
 */
export interface SubsystemModelHydrated
  extends SubsystemModelDocument, SubsystemModelHostBinding {
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
    relations?: unknown;
  };
  return (
    typeof v.title === 'string' &&
    Array.isArray(v.components) &&
    Array.isArray(v.relations)
  );
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
    relations: doc.relations,
  };
  if (doc.$schema) out.$schema = doc.$schema;
  if (doc.description) out.description = doc.description;
  if (doc.walkthroughs) out.walkthroughs = doc.walkthroughs;
  return out;
}

/** Stable id for a derived graph edge from a relation or walkthrough hop. */
export function derivedGraphEdgeId(
  from: string,
  to: string,
  mechanism: SubsystemEdgeMechanism,
): string {
  return `${from}--${mechanism}-->${to}`;
}

/**
 * Build display edges for the graph canvas from topology relations and
 * walkthrough hops (deduped by from/to/mechanism).
 */
export function deriveGraphEdges(doc: {
  relations?: SubsystemRelation[];
  walkthroughs?: SubsystemWalkthrough[];
}): SubsystemComponentEdge[] {
  const byId = new Map<string, SubsystemComponentEdge>();
  for (const r of doc.relations ?? []) {
    const id = r.id || derivedGraphEdgeId(r.from, r.to, r.relationType);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        from: r.from,
        to: r.to,
        mechanism: r.relationType,
        refs: r.refs,
      });
    }
  }
  for (const w of doc.walkthroughs ?? []) {
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
