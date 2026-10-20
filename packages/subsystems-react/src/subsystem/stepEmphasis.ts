/**
 * Step emphasis — PROTOTYPE contract for the "guiding focus" augmentation.
 *
 * A step emphasis is an authored pointer at a walkthrough step: "look here
 * first", with optional markdown guidance explaining why. It is deliberately
 * **not** part of the portable subsystem model and **not** a verification
 * signal — it belongs in a separate, host-owned augmentation document:
 *
 *   `~/.principal/subsystem-model-augmentations/<model-identity>.json`
 *
 * The key question this prototype is here to answer is identity: a step has no
 * id today and steps move. `stepClaimKey` fingerprints the step's *claim*
 * (`from`/`to`/`mechanism`/site/symbol/span), so a mark survives a reorder but
 * stops resolving when the claim itself is edited. Orphaned records are kept
 * (and can be pruned deliberately) rather than silently dropped.
 *
 * The mark is a single star rather than a closed kind vocabulary. `guidance`
 * is markdown so a mark can carry the same kind of prose as a model
 * description — headings, emphasis, links, code — while staying a string.
 *
 * Nothing here is wired to disk yet. The story `Canvases/Subsystem/Step
 * Emphasis` exercises the shape with an in-memory store and a live JSON view.
 */

import type { SubsystemTrail, SubsystemTrailStep } from './model';

export interface StepEmphasisProvenance {
  /** Who authored the mark. Agent marks are expected too. */
  source: 'author' | 'agent';
  /** ISO timestamp. */
  at: string;
  /** Optional human/agent identity. */
  author?: string;
}

/** One mark in the separate augmentation document. */
export interface StepEmphasisRecord {
  /** The trail the step belongs to. */
  trailId: string;
  /**
   * Fingerprint of the step's claim (see `stepClaimKey`). Stable across
   * reorder; changes when the claim changes.
   */
  stepKey: string;
  /** Optional markdown "why look here", rendered like a model description. */
  guidance?: string;
  provenance: StepEmphasisProvenance;
}

/**
 * The whole separate document. `modelId` is the host-store id (or an identity
 * key) — this document is host-local and never rides on the portable model.
 */
export interface StepEmphasisDocument {
  version: 1;
  modelId: string;
  emphasis: StepEmphasisRecord[];
}

/**
 * Lookup key for the UI. `trailId:stepKey` — one flat map is enough for a
 * graph and keeps the panel from re-deriving a nested structure per render.
 */
export type StepEmphasisMap = ReadonlyMap<string, StepEmphasisRecord>;

/** The claim fields a mark is attached to. Deliberately excludes `annotation`. */
function claimFields(step: Pick<SubsystemTrailStep, 'from' | 'to' | 'mechanism' | 'file' | 'symbol' | 'span'>): string[] {
  return [
    step.from,
    step.to,
    step.mechanism,
    step.file,
    step.symbol,
    step.span?.startLine == null ? '' : String(step.span.startLine),
    step.span?.endLine == null ? '' : String(step.span.endLine),
    step.span?.contentHash ?? '',
  ];
}

/**
 * FNV-1a (32-bit) fingerprint. Good enough for a local key: the point is
 * "same claim => same key", not cryptographic resistance. Swap for SHA-256 at
 * the store boundary if marks ever travel between hosts.
 */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Stable content key for a step's claim. */
export function stepClaimKey(
  step: Pick<SubsystemTrailStep, 'from' | 'to' | 'mechanism' | 'file' | 'symbol' | 'span'>,
): string {
  return fnv1a(claimFields(step).join('\u001f'));
}

/** Map key for one step's mark. */
export function emphasisKey(
  trailId: string,
  step: Pick<SubsystemTrailStep, 'from' | 'to' | 'mechanism' | 'file' | 'symbol' | 'span'>,
): string {
  return `${trailId}:${stepClaimKey(step)}`;
}

export function buildStepEmphasisMap(
  records: readonly StepEmphasisRecord[],
): StepEmphasisMap {
  return new Map(records.map((r) => [`${r.trailId}:${r.stepKey}`, r]));
}

export function findStepEmphasis(
  map: StepEmphasisMap | undefined,
  trailId: string,
  step: SubsystemTrailStep,
): StepEmphasisRecord | undefined {
  return map?.get(emphasisKey(trailId, step));
}

/**
 * Records whose step claim no longer exists in the current trails. Kept in the
 * document (so a bad edit does not destroy authored intent) but surfaced so
 * the author can prune them.
 */
export function orphanedEmphasis(
  records: readonly StepEmphasisRecord[],
  trails: readonly SubsystemTrail[],
): StepEmphasisRecord[] {
  const live = new Set<string>();
  for (const trail of trails) {
    for (const step of trail.steps) live.add(emphasisKey(trail.id, step));
  }
  return records.filter((r) => !live.has(`${r.trailId}:${r.stepKey}`));
}

/** Records for one trail, in current step order (for reader surfaces). */
export function emphasisForTrail(
  map: StepEmphasisMap | undefined,
  trail: SubsystemTrail,
): Array<{ stepIndex: number; step: SubsystemTrailStep; record: StepEmphasisRecord }> {
  if (!map) return [];
  const rows: Array<{ stepIndex: number; step: SubsystemTrailStep; record: StepEmphasisRecord }> = [];
  trail.steps.forEach((step, stepIndex) => {
    const record = map.get(emphasisKey(trail.id, step));
    if (record) rows.push({ stepIndex, step, record });
  });
  return rows;
}
