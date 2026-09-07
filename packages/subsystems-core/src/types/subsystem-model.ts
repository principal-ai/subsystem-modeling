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
 * framework pattern it plays, role = where it sits, process = where it runs.
 * `symbol` is the code identity; `name` is the display label.
 */

/** What the node IS as a declaration. `module` is not an authored construct —
 *  a module is its own subsystem. */
export type SubsystemConstruct =
  | 'class'
  | 'function'
  | 'method'
  | 'interface'
  | 'type_alias'
  | 'enum'
  | 'store'
  | 'external';

/** Where the node sits in the topology, orthogonal to construct. */
export type SubsystemComponentRole = 'entry' | 'service';

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

/** How `from` relates to `to` on an edge. */
export type SubsystemEdgeMechanism =
  | 'imports'
  | 'imports_from'
  | 're_exports'
  | 'defines'
  | 'calls'
  | 'extends'
  | 'inherits'
  | 'implements'
  | 'mixes_in'
  | 'uses'
  | 'method'
  | 'references'
  | 'contains'
  | 'feeds'
  | 'produces'
  | 'writes'
  | 'reads'
  | 'watches'
  | 'registers-into';

export type SubsystemCapture = 'edited' | 'analyzed' | 'referenced';

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

export interface SubsystemTypeDeclaration {
  kind: 'type';
  properties: SubsystemPropertyInfo[];
  usedBy: SubsystemReferenceInfo[];
  implementors: string[];
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
  properties: SubsystemPropertyInfo[];
}

/** Structured declaration shape of a construct. */
export type SubsystemConstructDeclaration =
  | SubsystemClassDeclaration
  | SubsystemFunctionDeclaration
  | SubsystemMethodDeclaration
  | SubsystemTypeDeclaration
  | SubsystemModuleDeclaration
  | SubsystemExternalDeclaration
  | SubsystemStoreDeclaration;

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
  layer?: number;
  capture?: SubsystemCapture;
  /** Structured declaration shape of the construct (params, members, …). */
  declaration?: SubsystemConstructDeclaration;
  declarationProvenance?: SubsystemDeclarationProvenance;
  tokens?: SubsystemDeclToken[];
  /** Location anchor (file/line/hash) — distinct from `declaration` (shape). */
  declarationRef?: SubsystemDeclarationRef;
}

/** A cross-component edge. */
export interface SubsystemComponentEdge {
  id: string;
  /** Source component id. */
  from: string;
  /** Target component id (or external label). */
  to: string;
  mechanism: SubsystemEdgeMechanism;
  /** Concrete file/symbol evidence (often purls). */
  refs?: string[];
}

export interface SubsystemThroughlineStep {
  edgeId: string;
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

/** Ordered execution story over existing edges (one per flow). */
export interface SubsystemThroughline {
  id: string;
  title: string;
  steps: SubsystemThroughlineStep[];
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
  edges: SubsystemComponentEdge[];
  throughlines?: SubsystemThroughline[];
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
    edges?: unknown;
  };
  return (
    typeof v.title === 'string' &&
    Array.isArray(v.components) &&
    Array.isArray(v.edges)
  );
}
