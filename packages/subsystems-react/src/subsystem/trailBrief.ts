/**
 * trailBrief — build a paste-ready markdown brief for a single
 * trail step so a reviewer can hand one step to an agent without
 * transcribing it by hand.
 *
 * The unit of handoff is one step, not the whole flow. A bare step is ambiguous
 * on its own — the same `from`/`to`/`mechanism` can repeat across flows — so the
 * brief also carries the flow it belongs to and its position within it, plus
 * the exact seam site (`symbol`, `file:line`, `purl`) that resolves the
 * checkout.
 */

import type { SubsystemTrail } from './model';

/**
 * Markdown brief for `trail.steps[stepIndex]`. Returns `''` when the
 * index is out of range so a caller can treat it as "nothing to copy".
 */
export function buildStepBrief(
  trail: SubsystemTrail,
  stepIndex: number,
): string {
  const step = trail.steps[stepIndex];
  if (!step) return '';
  const lines: string[] = [];
  lines.push(
    `Trail: ${trail.title} (${trail.id}) — step ${stepIndex + 1}/${trail.steps.length}`,
  );
  lines.push('');
  lines.push(`- from: \`${step.from}\``);
  lines.push(`- to: \`${step.to}\``);
  lines.push(`- mechanism: \`${step.mechanism}\``);
  lines.push(`- symbol: \`${step.symbol}\``);
  lines.push(`- site: \`${step.file}:${step.line}\``);
  lines.push(`- purl: \`${step.purl}\``);
  if (step.annotation != null && step.annotation.length > 0) {
    lines.push(`- note: ${step.annotation}`);
  }
  return lines.join('\n');
}
