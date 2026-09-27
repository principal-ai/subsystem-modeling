/**
 * walkthroughBrief — build a paste-ready markdown brief for a single
 * walkthrough step so a reviewer can hand one hop to an agent without
 * transcribing it by hand.
 *
 * The unit of handoff is one hop, not the whole flow. A bare hop is ambiguous
 * on its own — the same `from`/`to`/`mechanism` can repeat across flows — so the
 * brief also carries the flow it belongs to and its position within it, plus
 * the exact seam site (`symbol`, `file:line`, `purl`) that resolves the
 * checkout.
 */

import type { SubsystemWalkthrough } from './model';

/**
 * Markdown brief for `walkthrough.steps[stepIndex]`. Returns `''` when the
 * index is out of range so a caller can treat it as "nothing to copy".
 */
export function buildStepBrief(
  walkthrough: SubsystemWalkthrough,
  stepIndex: number,
): string {
  const step = walkthrough.steps[stepIndex];
  if (!step) return '';
  const lines: string[] = [];
  lines.push(
    `Walkthrough: ${walkthrough.title} (${walkthrough.id}) — step ${stepIndex + 1}/${walkthrough.steps.length}`,
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
