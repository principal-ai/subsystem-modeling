/**
 * Graphify graph.json schema types.
 *
 * Mirrors the graphify data model (graphify/validate.py, graphify/export.py)
 * so graphify output can be consumed by this library in a type-compatible way.
 */

/** Any JSON-serializable value carried in node/edge metadata. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Node classification (graphify/validate.py VALID_FILE_TYPES). */
export type GraphifyFileType = 'code' | 'document' | 'paper' | 'image' | 'rationale' | 'concept';

/** Edge provenance tag (graphify/validate.py VALID_CONFIDENCES). */
export type GraphifyConfidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

/** Optional semantic kind carried on nodes (e.g. `module`, `namespace`). */
export type GraphifyNodeType = 'module' | 'namespace' | string;

/** Canonical relation verbs emitted by graphify extractors and resolvers. */
export type GraphifyRelation =
  | 'calls'
  | 'imports'
  | 'imports_from'
  | 're_exports'
  | 'references'
  | 'inherits'
  | 'implements'
  | 'mixes_in'
  | 'uses'
  | 'contains'
  | 'defines'
  | 'method'
  | 'decorator'
  | 'rationale_for'
  | 'semantically_similar_to'
  | string;

/**
 * A graphify node.
 *
 * Required fields are enforced by graphify/validate.py:
 * `id`, `label`, `file_type`, `source_file`. The rest are populated by the
 * extractors (`source_location`, optional `type`/`metadata`) and by the build
 * writer (`community`, `community_name`, `norm_label`).
 */
export interface GraphifyNode {
  /** Stable identifier: repo-relative path + symbol names (make_id slug). */
  id: string;
  /** Human-readable name. */
  label: string;
  /** Classification used as the primary node kind. */
  file_type: GraphifyFileType;
  /** Repo-relative path of the source file this node came from. */
  source_file: string;
  /** `L<line>` location, or `''` for sourceless stub nodes. */
  source_location?: string | null;
  /** Optional semantic kind (e.g. `module`, `namespace`). */
  type?: GraphifyNodeType;
  /** Node state / extra node definitions. */
  state?: string;
  /** Arbitrary per-extractor metadata (e.g. `{ kind: "csharp_namespace" }`). */
  metadata?: Record<string, JsonValue>;
  /** Leiden community id, stamped at build time. */
  community?: number | null;
  /** Human-readable community label, stamped at build time. */
  community_name?: string;
  /** Diacritic-stripped lowercased label, stamped at build time. */
  norm_label?: string;
  /** Extra fields tolerated for forward compatibility. */
  [key: string]: unknown;
}

/**
 * A graphify edge.
 *
 * Required fields: `source`, `target`, `relation`, `confidence`, `source_file`.
 * `context` is populated for `references` edges (e.g. `type`, `return_type`,
 * `field`, `generic_arg`).
 */
export interface GraphifyEdge {
  /** Source node id. */
  source: string;
  /** Target node id. */
  target: string;
  /** Canonical relation verb. */
  relation: GraphifyRelation;
  /** Provenance: read directly from source vs. resolved by graphify. */
  confidence: GraphifyConfidence;
  /** Float 0.0-1.0; 1.0 for EXTRACTED, discrete rubric for INFERRED. */
  confidence_score?: number;
  /** Repo-relative path where the relationship was found. */
  source_file: string;
  /** `L<line>` location of the relationship. */
  source_location?: string | null;
  /** Edge weight. */
  weight?: number;
  /** Reference context for `references` edges. */
  context?: string;
  /** Arbitrary per-extractor metadata. */
  metadata?: Record<string, JsonValue>;
  /** Extra fields tolerated for forward compatibility. */
  [key: string]: unknown;
}

/**
 * A graphify hyperedge — a group relationship connecting 3+ nodes.
 *
 * Member list is canonical on `nodes` (aliases `members`/`node_ids` are folded
 * by graphify/export.py build normalization).
 */
export interface GraphifyHyperedge {
  /** Stable identifier. */
  id: string;
  /** Human-readable label. */
  label?: string;
  /** Member node ids (canonical key). */
  nodes: string[];
  /** Group relation verb (e.g. `participate_in`, `implement`, `form`). */
  relation?: GraphifyRelation;
  /** Provenance tag. */
  confidence?: GraphifyConfidence;
  /** Float 0.0-1.0. */
  confidence_score?: number;
  /** Repo-relative path where the relationship was found. */
  source_file?: string;
  /** Extra fields tolerated for forward compatibility. */
  [key: string]: unknown;
}

/** Graph-level metadata stored on the graph (`graph` key). */
export interface GraphifyGraphMetadata {
  directed?: boolean;
  multigraph?: boolean;
  /** Edges may be serialized under `links` (NetworkX node-link) or `edges`. */
  hyperedges?: GraphifyHyperedge[];
  [key: string]: unknown;
}

/**
 * The full graph.json document.
 *
 * graphify writes NetworkX node-link format: nodes under `nodes`, edges under
 * `links`. Older/legacy payloads may use `edges` instead of `links`.
 */
export interface GraphifyGraph {
  /** Graph nodes. */
  nodes: GraphifyNode[];
  /** Graph edges (NetworkX node-link key). */
  links?: GraphifyEdge[];
  /** Legacy alias for `links`. */
  edges?: GraphifyEdge[];
  /** Group relationships connecting 3+ nodes. */
  hyperedges?: GraphifyHyperedge[];
  /** Graph-level metadata (directed, multigraph, hyperedges). */
  graph?: GraphifyGraphMetadata;
  /** Top-level directed flag (NetworkX). */
  directed?: boolean;
  /** Top-level multigraph flag (NetworkX). */
  multigraph?: boolean;
  /** Git HEAD the graph was built against, when available. */
  built_at_commit?: string;
  [key: string]: unknown;
}
