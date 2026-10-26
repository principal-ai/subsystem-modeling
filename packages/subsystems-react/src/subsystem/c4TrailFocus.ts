/**
 * C4 trail focus — the pure read-side helpers shared by the C4 projection view
 * and its stories.
 *
 * These do not own state: a host decides which trail/step is focused and asks
 * which elements and lines that focus touches.
 */

import type { C4Edge } from './c4';
import type { SubsystemTrailStep } from './model';

/**
 * The C4 elements a trail touches — every element that owns a step endpoint.
 *
 * Because a container's process-claim membership AND the authored components
 * nested inside it can both claim an alias, both end up in the set: the
 * container is the visible card at container view, its components are the
 * visible cards when it is open, so either view stays honest.
 */
export function deriveTrailPlayerElements(
  steps: readonly SubsystemTrailStep[],
  members: Readonly<Record<string, readonly string[]>>,
): Set<string> {
  const byAlias = new Map<string, string[]>();
  for (const [elementId, aliases] of Object.entries(members)) {
    for (const alias of aliases) {
      const list = byAlias.get(alias);
      if (list) list.push(elementId);
      else byAlias.set(alias, [elementId]);
    }
  }
  const players = new Set<string>();
  for (const step of steps) {
    for (const id of byAlias.get(step.from) ?? []) players.add(id);
    for (const id of byAlias.get(step.to) ?? []) players.add(id);
  }
  return players;
}

/**
 * The C4 edges that carry a focus — a whole trail, or one specific step.
 *
 * An edge is lit iff its authored `trailRefs` cover the source. A step entirely
 * internal to a container folds into no C4 line, so its focus lights nothing —
 * which is honest: no drawn edge represents that hop.
 */
export function deriveLitC4Edges(
  source: { trailId: string; stepIndex?: number },
  edges: readonly C4Edge[],
): Set<string> {
  const lit = new Set<string>();
  for (const edge of edges) {
    for (const ref of edge.trailRefs ?? []) {
      if (ref.trailId !== source.trailId) continue;
      if (source.stepIndex == null || ref.stepIndices.includes(source.stepIndex)) {
        lit.add(edge.id);
        break;
      }
    }
  }
  return lit;
}
