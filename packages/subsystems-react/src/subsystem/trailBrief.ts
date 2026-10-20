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
  // `calls` means the site is the caller frame. Every other mechanism is a
  // logical hop whose evidence can live in another construct; say so, so an
  // agent does not treat the site symbol as the source component.
  if (step.mechanism !== 'calls') {
    lines.push(`- site role: \`via\``);
  }
  const site = step.span
    ? step.span.startLine === step.span.endLine
      ? `${step.file}:${step.span.startLine}`
      : `${step.file}:${step.span.startLine}-${step.span.endLine}`
    : step.file;
  lines.push(`- site: \`${site}\``);
  if (step.site) {
    const frame = step.site.span.startLine === step.site.span.endLine
      ? `${step.file}:${step.site.span.startLine}`
      : `${step.file}:${step.site.span.startLine}-${step.site.span.endLine}`;
    lines.push(`- site construct: \`${step.site.symbol}\` (${frame})`);
  }
  if (step.target) {
    const targetSpan = step.target.span
      ? step.target.span.startLine === step.target.span.endLine
        ? `:${step.target.span.startLine}`
        : `:${step.target.span.startLine}-${step.target.span.endLine}`
      : '';
    lines.push(`- target: \`${step.target.symbol}\` (${step.target.file}${targetSpan})`);
  }
  lines.push(`- purl: \`${step.purl}\``);
  if (step.annotation != null && step.annotation.length > 0) {
    lines.push(`- note: ${step.annotation}`);
  }
  return lines.join('\n');
}
