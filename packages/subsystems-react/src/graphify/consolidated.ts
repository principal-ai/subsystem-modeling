/**
 * Graphify consolidated / drill-down types.
 *
 * graphify stores the graph in flat, normalized form — class vs function vs
 * type is NOT a node attribute (every code node is `file_type: "code"`); it is
 * derived from graph structure. These types rebuild that structure from the raw
 * edges so a UI can show a drill-down modal for a subsystem component or jump
 * to its definition file.
 */

import type {
  GraphifyConfidence,
  GraphifyFileType,
  GraphifyRelation,
} from './types';

/** How a subsystem component resolved to a graphify node. */
export type GraphifyAnchorResolution = 'exact' | 'file-only' | 'ambiguous' | 'missing';

/**
 * The bridge between a facet component and the graphify graph.
 *
 * `nodeId` is reconstructed from the component's `file` + `symbol` via the id
 * slug scheme; `resolution` says how confident that reconstruction is.
 * `source_file` + `source_location` are the "open the definition" primitive.
 */
export interface SubsystemGraphifyAnchor {
  /** Resolved graphify node id. */
  nodeId: string;
  /** PURL of the repo the node lives in (pkg:github/owner/repo). */
  purl: string;
  /** How the anchor resolved — the honesty signal for verification. */
  resolution: GraphifyAnchorResolution;
  /** Human-readable node label from the graph. */
  label: string;
  /** Repo-relative path of the node's source file. */
  source_file: string;
  /** `L<line>` — the line of the definition for a file-open jump. */
  source_location?: string;
  /** Node classification from the graph. */
  file_type: GraphifyFileType;
  /** Leiden community id. */
  community?: number | null;
  /** Human-readable community label. */
  community_name?: string;
}

// ---------------------------------------------------------------------------
// Leaf info types — each backed by a specific graphify edge pattern
// ---------------------------------------------------------------------------

/** A method on a class-like node (`method` edge from the class). */
export interface GraphifyMethodInfo {
  /** The method's own node id. */
  nodeId: string;
  /** Display name from the label (`.get()` → `get`). */
  name: string;
  /** Typed parameters from `references` edges with context `parameter_type`. */
  parameters?: GraphifyParamInfo[];
  /** Return type from a `references` edge with context `return_type`. */
  returnType?: string;
  /** Backing edge target for `returnType`, when the graph had one. */
  returnTypeRef?: GraphifyReferenceInfo;
}

/** A property/field on a class- or type-like node. */
export interface GraphifyPropertyInfo {
  /** Field name — present when graphify emits a `defines` node (C++). */
  name: string;
  /** Field type from a `references` edge with context `field`. */
  type?: string;
  /** Backing edge target for `type`, when the graph had one. */
  typeRef?: GraphifyReferenceInfo;
  /** The field's own node id when it exists (e.g. C++ `defines` nodes). */
  nodeId?: string;
}

/**
 * A single typed parameter of a function (`references` context `parameter_type`).
 *
 * `ref.nodeId` is the resolvable half: it targets the type's definition node
 * when graphify resolved the reference, or a sourceless stub node when the
 * name was ambiguous / external (see `resolveGraphifyTypeRef`).
 */
export interface GraphifyParamInfo {
  /** Parameter name — not captured by graphify; left undefined. */
  name?: string;
  /** Parameter type. */
  type: string;
  /** Backing `references[parameter_type|generic_arg]` edge target. */
  ref?: GraphifyReferenceInfo;
}

/** One call relationship, in either direction. */
export interface GraphifyCallInfo {
  /** The other endpoint's node id (caller for `callers`, callee for `callees`). */
  nodeId: string;
  /** The other endpoint's display label. */
  name: string;
  /** `L<line>` of the call site. */
  source_location?: string;
}

/** A type-name reference to a node (`references` edge with a context). */
export interface GraphifyReferenceInfo {
  /** The referenced node id. */
  nodeId: string;
  /** The referenced node's display label. */
  name: string;
  /** Reference context (e.g. `type`, `field`, `generic_arg`, `attribute`). */
  context?: string;
  /** `L<line>` of the reference site. */
  source_location?: string;
}

/** An import relationship (`imports` / `imports_from` / `re_exports`). */
export interface GraphifyImportInfo {
  /** The imported module/file node id. */
  nodeId: string;
  /** The imported module/file label. */
  name: string;
  /** Which relation carried the import. */
  relation?: GraphifyRelation;
  /** `L<line>` of the import statement. */
  source_location?: string;
}

// ---------------------------------------------------------------------------
// Discriminated union — the drill-down payload
// ---------------------------------------------------------------------------

/** A class-like node: owns outgoing `method` edges. */
export interface GraphifyClassDetail {
  kind: 'class';
  /** Methods connected via `method` edges. */
  methods: GraphifyMethodInfo[];
  /** Fields from `defines`/`references` context `field`. */
  properties: GraphifyPropertyInfo[];
  /** `inherits` edge targets. */
  extends: string[];
  /** `implements` edge targets. */
  implements: string[];
  /** Incoming `calls` — graphify models constructor calls as calls into the class. */
  instantiations: GraphifyCallInfo[];
  /** Everywhere the type name is referenced (`references` edges). */
  references: GraphifyReferenceInfo[];
}

/** A function-like node: label ends `name()` with no `method` edges. */
export interface GraphifyFunctionDetail {
  kind: 'function';
  /** Parameter types from `references` context `parameter_type`. */
  parameters: GraphifyParamInfo[];
  /** Return type from `references` context `return_type`. */
  returnType?: string;
  /** Backing edge target for `returnType`, when the graph had one. */
  returnTypeRef?: GraphifyReferenceInfo;
  /** Incoming `calls` edges. */
  callers: GraphifyCallInfo[];
  /** Outgoing `calls` edges. */
  callees: GraphifyCallInfo[];
}

/** A type-like node (interface/struct): revealed by incoming `implements` edges. */
export interface GraphifyTypeDetail {
  kind: 'type';
  /** Struct/interface fields. */
  properties: GraphifyPropertyInfo[];
  /** Nodes referencing this type name. */
  usedBy: GraphifyReferenceInfo[];
  /** Nodes that `inherits`/`implements` this type. */
  implementors: string[];
}

/** A module/file-like node: a `contains` target with a filename label. */
export interface GraphifyModuleDetail {
  kind: 'module';
  /** `re_exports` targets / contained public symbols. */
  exports: string[];
  /** `imports` / `imports_from` relationships. */
  imports: GraphifyImportInfo[];
  /** Symbols contained in the module (`contains` targets). */
  symbols: string[];
}

/** A facet-only component with no graphify node (external consumer stub). */
export interface GraphifyExternalDetail {
  kind: 'external';
  /** Facet-only label; there is no backing graph data. */
  label: string;
}

/**
 * A retained-state node (`kind: 'store'`): state and its contract, no
 * behavior. `kind` is the node's verifiable anchor — a store anchors to a
 * *state location* (module consts, a file or db), not to a declaration.
 * When a class manages the store's access, that is a SEPARATE node
 * (`kind: 'class'`, methods = the access mechanism) joined by
 * `writes`/`reads` — never merged into one hybrid node. This payload
 * renders as state declarations (`declare const …`), never as a class
 * stub.
 */
export interface GraphifyStoreDetail {
  kind: 'store';
  /** The retained state members (module-level consts or class fields). */
  properties: GraphifyPropertyInfo[];
}

/** A standalone method selected from its owning class. */
export interface GraphifyMethodDetail {
  kind: 'method';
  /** The class that owns this method. */
  hostClass: string;
  /** Parameter types from `references` context `parameter_type`. */
  parameters?: GraphifyParamInfo[];
  /** Return type from `references` context `return_type`. */
  returnType?: string;
}

/**
 * The drill-down payload for a subsystem component.
 *
 * The discriminant is derived from graph structure, not read off the node:
 * method edges → class; `()` label + no method edges → function; incoming
 * `implements` → type; else module. `external` covers consumer stubs.
 * `method` covers standalone method components selected from a class.
 */
export type GraphifyComponentDetail =
  | GraphifyClassDetail
  | GraphifyFunctionDetail
  | GraphifyMethodDetail
  | GraphifyTypeDetail
  | GraphifyModuleDetail
  | GraphifyExternalDetail
  | GraphifyStoreDetail;

/** A raw graphify edge backing a facet claim (verification + provenance). */
export interface GraphifyEdgeRef {
  source: string;
  target: string;
  relation: GraphifyRelation;
  confidence: GraphifyConfidence;
  confidence_score?: number;
  source_file: string;
  source_location?: string;
}
