/**
 * Resolve graphify type-name references to their defining nodes.
 *
 * A `references` edge (`parameter_type`, `return_type`, `field`,
 * `generic_arg`) targets either the type's real definition node or a
 * *sourceless stub* graphify left behind when the name could not be uniquely
 * resolved at extraction time (mirrors `_rewire_unique_stub_nodes` there:
 * ambiguous same-label definitions and never-defined names stay stubs).
 *
 * This module applies the same conservative matching from the consumer side so
 * UI click targets can distinguish "jump to definition" from "N candidates"
 * from "not in this corpus".
 */

import type { GraphifyNode } from './types';
import type { GraphifyReferenceInfo } from './consolidated';

/** Outcome of resolving one type reference. */
export type GraphifyTypeRefStatus =
  /** Target node is a real definition — jump to its `source_file`. */
  | 'resolved'
  /** Target was a stub and multiple same-label definitions exist. */
  | 'ambiguous'
  /** Target was a stub and nothing in the corpus defines the name. */
  | 'unresolved'
  /** No nodeId on the ref, or the id is not in the graph. */
  | 'missing';

export interface GraphifyTypeRefResolution {
  status: GraphifyTypeRefStatus;
  /** The definition node when resolved; the stub itself otherwise. */
  node: GraphifyNode | null;
  /** Same-label definitions when the target was an unresolved stub. */
  candidates: GraphifyNode[];
}

/**
 * Mirror graphify's `normalise_callable_label`: trim, strip surrounding
 * parens/leading dots, lowercase. `SessionReader()` and `sessionreader`
 * collapse to the same key.
 */
export function normalizeGraphifyLabel(label: string): string {
  return label
    .trim()
    .replace(/^[()]+|[()]+$/g, '')
    .replace(/^\.+/, '')
    .toLowerCase();
}

const FILE_SUFFIX_RE =
  /\.(py|js|jsx|ts|tsx|mjs|cjs|java|go|rs|rb|php|cs|cpp|cc|c|h|hpp|pas|pp|dpr|swift|kt|scala|dart|lua|pl|pm|ex|exs|zig|vue|svelte)$/i;

function isDefinition(node: GraphifyNode): boolean {
  if (node.file_type !== 'code') return false;
  const file = typeof node.source_file === 'string' ? node.source_file : '';
  if (!file) return false;
  const label = typeof node.label === 'string' ? node.label.trim() : '';
  return !!label && !FILE_SUFFIX_RE.test(label);
}

/** Prebuilt lookup state — build once per graph, resolve many refs. */
export interface GraphifyTypeResolver {
  resolve(nodeId: string | undefined, fallbackLabel?: string): GraphifyTypeRefResolution;
}

export function createGraphifyTypeResolver(nodes: readonly GraphifyNode[]): GraphifyTypeResolver {
  const byId = new Map<string, GraphifyNode>();
  const defsByExactLabel = new Map<string, GraphifyNode[]>();
  const defsByFoldedLabel = new Map<string, GraphifyNode[]>();

  for (const node of nodes) {
    byId.set(String(node.id), node);
    if (!isDefinition(node)) continue;
    const label = String(node.label).trim();
    (defsByExactLabel.get(label) ?? defsByExactLabel.set(label, []).get(label)!).push(node);
    const folded = normalizeGraphifyLabel(label);
    if (!folded) continue;
    (defsByFoldedLabel.get(folded) ?? defsByFoldedLabel.set(folded, []).get(folded)!).push(node);
  }

  function resolve(nodeId: string | undefined, fallbackLabel?: string): GraphifyTypeRefResolution {
    if (!nodeId) return { status: 'missing', node: null, candidates: [] };
    const target = byId.get(nodeId);
    if (!target) return { status: 'missing', node: null, candidates: [] };
    // Real definition (graphify rewired the reference onto it, or it lived in
    // the referencing file all along).
    if (isDefinition(target)) return { status: 'resolved', node: target, candidates: [] };

    // Sourceless stub — try the rewire tiers: exact label, then folded.
    const label = typeof target.label === 'string' && target.label.trim() ? target.label.trim() : (fallbackLabel ?? '');
    let candidates = defsByExactLabel.get(label) ?? [];
    if (candidates.length !== 1) {
      const folded = normalizeGraphifyLabel(label);
      candidates = folded ? (defsByFoldedLabel.get(folded) ?? []) : [];
    }
    if (candidates.length === 1) {
      // Unique match — same fold `_rewire_unique_stub_nodes` performs at
      // extraction time; graphs built before that pass land here instead.
      return { status: 'resolved', node: candidates[0]!, candidates };
    }
    if (candidates.length > 1) return { status: 'ambiguous', node: target, candidates };
    return { status: 'unresolved', node: target, candidates: [] };
  }

  return { resolve };
}

/** One-shot convenience over {@link createGraphifyTypeResolver}. */
export function resolveGraphifyTypeRef(
  nodes: readonly GraphifyNode[],
  ref: Pick<GraphifyReferenceInfo, 'nodeId'> | { nodeId?: string } | undefined,
  fallbackLabel?: string,
): GraphifyTypeRefResolution {
  return createGraphifyTypeResolver(nodes).resolve(ref?.nodeId, fallbackLabel);
}
