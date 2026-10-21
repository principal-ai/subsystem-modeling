/**
 * Subsystem decoration — PROTOTYPE contract for the ephemeral, unverified layer.
 *
 * A decoration composes trails from one or more models, carries a markdown
 * description, and may add draft structure. The base model stays verified-only;
 * a decoration is never audited against source.
 *
 * **Each trail ref names its own model.** There is no decoration-level `base`
 * field: a decoration can mix models by construction, and a single-model
 * decoration is just the case where every ref happens to share a `modelId`.
 *
 * A trail can be either:
 * - `base` — a reference to a trail that already exists in a model; or
 * - `draft` — a trail that only exists in the decoration. This is what
 *   migration needs when a base trail depends on draft components: the whole
 *   trail moves into the decoration rather than dangling in the base.
 *
 * The contract is deliberately host-local and not part of the portable
 * subsystem document. If decorations become shareable, `modelId` needs a
 * portable identity key (the local `sg-...` ids are re-minted).
 */

import type { SubsystemTrail, SubsystemTrailMechanism } from './model';

export interface DecorationStepAnchor {
  /** Claim fingerprint of the anchored step (see `stepClaimKey`). */
  stepKey: string;
  /** Optional per-anchor note. The decoration description carries the prose. */
  note?: string;
}

interface DecorationTrailRefBase {
  /** Store-local model id. The trail id is only unique within this model. */
  modelId: string;
  /** Optional step-level anchors inside this trail. */
  stepAnchors?: DecorationStepAnchor[];
}

/** A trail that already exists in the base model. */
export interface DecorationBaseTrailRef extends DecorationTrailRefBase {
  kind: 'base';
  trailId: string;
}

/** A speculative trail that exists only in the decoration. */
export interface DecorationDraftTrailRef extends DecorationTrailRefBase {
  kind: 'draft';
  trail: SubsystemTrail;
}

export type DecorationTrailRef =
  | DecorationBaseTrailRef
  | DecorationDraftTrailRef;

/**
 * Draft structure: a component that does not exist in source yet. No
 * `file`/`symbol` — those are the verification coordinates the base model
 * requires, and a draft component deliberately has none.
 */
export interface DecorationDraftComponent {
  alias: string;
  name: string;
  /** Intended construct shape (`class`, `function`, …). */
  construct?: string;
  purpose?: string;
  module?: string;
  process?: string;
}

/** A speculative edge between base or draft aliases. */
export interface DecorationDraftEdge {
  from: string;
  to: string;
  mechanism: SubsystemTrailMechanism;
}

export interface DecorationDraft {
  components?: DecorationDraftComponent[];
  edges?: DecorationDraftEdge[];
}

export interface DecorationProvenance {
  source: 'author' | 'agent';
  author?: string;
  /** ISO timestamp. */
  at: string;
}

export interface SubsystemDecoration {
  version: 1;
  id: string;
  title: string;
  /** Markdown, rendered like the model description. */
  description: string;
  /**
   * Ordered trails the decoration cares about. Order is the reading order;
   * `modelId` may vary from ref to ref. A trail is either a base ref or a
   * draft trail that lives only here.
   */
  trails: DecorationTrailRef[];
  /** Optional draft delta. Absent = a pure reading path. */
  draft?: DecorationDraft;
  provenance: DecorationProvenance;
}

/** The trail id for either kind of ref. */
export function decorationTrailId(ref: DecorationTrailRef): string {
  return ref.kind === 'base' ? ref.trailId : ref.trail.id;
}

/** Stable key for a trail ref across models. `trailId` alone is not enough. */
export function decorationTrailKey(
  ref: Pick<DecorationTrailRef, 'modelId'> & { trailId?: string; trail?: SubsystemTrail },
): string {
  const trailId = ref.trailId ?? ref.trail?.id ?? '';
  return `${ref.modelId}:${trailId}`;
}

/**
 * Group trail refs by their owning model, preserving first-seen model order
 * and the authored trail order within each group. The UI uses this to render
 * "which trails it cares about" without a separate model list.
 */
export function groupDecorationTrailsByModel(
  refs: readonly DecorationTrailRef[],
): Array<{ modelId: string; trails: DecorationTrailRef[] }> {
  const groups = new Map<string, DecorationTrailRef[]>();
  for (const ref of refs) {
    const existing = groups.get(ref.modelId);
    if (existing) existing.push(ref);
    else groups.set(ref.modelId, [ref]);
  }
  return [...groups].map(([modelId, trails]) => ({ modelId, trails }));
}

/** The distinct models a decoration touches, in first-seen order. */
export function decorationModelIds(
  refs: readonly DecorationTrailRef[],
): string[] {
  return [...new Set(refs.map((ref) => ref.modelId))];
}

export function findDecorationTrail(
  refs: readonly DecorationTrailRef[],
  modelId: string,
  trailId: string,
): DecorationTrailRef | undefined {
  return refs.find(
    (ref) => ref.modelId === modelId && decorationTrailId(ref) === trailId,
  );
}
