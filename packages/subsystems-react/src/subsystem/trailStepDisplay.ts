/**
 * How a trail step reads in the Trails panel.
 *
 * A step is one seam, but the panel shows the logical hop and the site in a
 * single wrapping line:
 *
 * - `calls` — the caller frame (the site construct).
 * - `uses` — `from uses to`, where `to` is the precise target when resolved.
 * - Everything else — `from mechanism to`.
 *
 * The evidence site lives in the code view and the stack breadcrumb; the
 * sidebar row stays one line so it can wrap instead of truncating.
 */

import type { SubsystemTrailStep, SubsystemTrailMechanism } from './model';

/** The slice of a component the labels need — keeps fixtures light. */
export interface TrailComponentLabelSource {
  alias: string;
  name?: string;
  symbol?: string;
}

/** Alias → component, for turning model-local aliases into display names. */
export type TrailComponentLabels = ReadonlyMap<string, TrailComponentLabelSource>;

/** One row's primary text. */
export interface TrailStepDisplay {
  mechanism: SubsystemTrailMechanism;
  /** The line that names the step: caller frame for `calls`, hop otherwise. */
  primary: string;
}

/** Display label for a component alias; falls back to the alias. */
export function trailComponentLabel(
  alias: string,
  byAlias?: TrailComponentLabels,
): string {
  const component = byAlias?.get(alias);
  const label = component?.name?.trim() || component?.symbol?.trim();
  return label || alias;
}

/**
 * Build the single display line for one step.
 *
 * The resolved target (`step.target.symbol`) is the precise callee, while `to`
 * is only a component alias and can be a whole class/store. Prefer the target.
 */
export function trailStepDisplay(
  step: SubsystemTrailStep,
  byAlias?: TrailComponentLabels,
): TrailStepDisplay {
  const from = trailComponentLabel(step.from, byAlias);
  const to = step.target?.symbol?.trim() || trailComponentLabel(step.to, byAlias);
  const siteSymbol = step.site?.symbol?.trim() || step.symbol?.trim() || from;

  if (step.mechanism === 'calls') {
    return { mechanism: step.mechanism, primary: siteSymbol };
  }
  if (step.mechanism === 'uses') {
    return { mechanism: step.mechanism, primary: `${from} uses ${to}` };
  }
  return {
    mechanism: step.mechanism,
    primary: `${from} ${step.mechanism} ${to}`,
  };
}
