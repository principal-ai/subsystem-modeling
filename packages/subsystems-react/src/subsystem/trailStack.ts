/**
 * Derive a call stack for one trail step.
 *
 * A trail is a timeline, not a stack frame dump: steps can return to an
 * ancestor, take sibling calls, or describe a non-call seam (`uses`, `feeds`,
 * …). This module links each `calls` step to the prior call that entered its
 * caller construct, then renders that ancestry as a stack. Non-call steps are
 * annotations on the nearest frame — they are not frames.
 *
 * The links use the resolved `site`/`target` when present, falling back to the
 * component aliases. That keeps the view useful before every step has its
 * construct refs captured.
 */

import type {
  SubsystemTrail,
  SubsystemTrailMechanism,
  SubsystemTrailStep,
} from './model';
import {
  trailComponentLabel,
  type TrailComponentLabels,
} from './trailStepDisplay';

export interface TrailStackFrame {
  /** The step whose call creates this frame. */
  stepIndex: number;
  /** Frame label — the caller construct, or the component alias. */
  label: string;
  /** Component alias of the caller (for focus/selection wiring). */
  componentAlias: string;
  /** The selected step's own frame (innermost). */
  current: boolean;
}

export interface TrailStackAnnotation {
  /** Non-call step attached to the current frame. */
  stepIndex: number;
  mechanism: SubsystemTrailMechanism;
  label: string;
  /** The selected step itself (vs context around it). */
  selected: boolean;
}

export interface TrailStackView {
  /** Outermost → innermost. Empty only for an out-of-range index. */
  frames: TrailStackFrame[];
  /** Non-call seams attached to the current frame. */
  annotations: TrailStackAnnotation[];
  /** True when the selected step is a call frame. */
  isCall: boolean;
  /** The selected call's target, shown as the next frame-to-be. */
  callee?: string;
}

function callerSymbol(step: SubsystemTrailStep): string {
  return step.site?.symbol?.trim() || step.symbol?.trim() || step.from;
}

function calleeSymbol(step: SubsystemTrailStep): string {
  return step.target?.symbol?.trim() || step.to;
}

function callerLabel(
  step: SubsystemTrailStep,
  byAlias?: TrailComponentLabels,
): string {
  return callerSymbol(step) || trailComponentLabel(step.from, byAlias);
}

function calleeLabel(
  step: SubsystemTrailStep,
  byAlias?: TrailComponentLabels,
): string {
  return step.target?.symbol?.trim() || trailComponentLabel(step.to, byAlias);
}

function isCallStep(step: SubsystemTrailStep | undefined): boolean {
  return step?.mechanism === 'calls' && step.proposed !== true;
}

/** Does call `a` lead into the caller of call `b`? */
function leadsInto(a: SubsystemTrailStep, b: SubsystemTrailStep): boolean {
  return a.to === b.from || calleeSymbol(a) === callerSymbol(b);
}

/** The nearest earlier call that entered this step's caller frame. */
function parentCallIndex(
  trail: SubsystemTrail,
  stepIndex: number,
): number | null {
  const child = trail.steps[stepIndex];
  if (!child) return null;
  for (let i = stepIndex - 1; i >= 0; i--) {
    const candidate = trail.steps[i];
    if (!isCallStep(candidate)) continue;
    if (leadsInto(candidate!, child)) return i;
  }
  return null;
}

/** The call chain ending at `stepIndex`, outermost first. */
function callChain(trail: SubsystemTrail, stepIndex: number): number[] {
  const chain: number[] = [];
  const seen = new Set<number>();
  let cursor: number | null = stepIndex;
  while (cursor != null && !seen.has(cursor)) {
    seen.add(cursor);
    chain.unshift(cursor);
    cursor = parentCallIndex(trail, cursor);
  }
  return chain;
}

function framesForChain(
  trail: SubsystemTrail,
  chain: number[],
  selectedStepIndex: number | null,
  byAlias?: TrailComponentLabels,
): TrailStackFrame[] {
  return chain.map((idx) => {
    const step = trail.steps[idx]!;
    return {
      stepIndex: idx,
      label: callerLabel(step, byAlias),
      componentAlias: step.from,
      current: idx === selectedStepIndex,
    };
  });
}

/**
 * The nearest earlier call that shares this non-call step's source component.
 * `uses`/`feeds`/… are dependencies of that frame, not new frames.
 */
function anchorCallIndex(
  trail: SubsystemTrail,
  stepIndex: number,
): number | null {
  const step = trail.steps[stepIndex];
  if (!step) return null;
  const source = callerSymbol(step);
  for (let i = stepIndex - 1; i >= 0; i--) {
    const candidate = trail.steps[i];
    if (!isCallStep(candidate)) continue;
    if (
      candidate!.from === step.from ||
      candidate!.to === step.from ||
      callerSymbol(candidate!) === source ||
      calleeSymbol(candidate!) === source
    ) {
      return i;
    }
  }
  return null;
}

function annotationLabel(
  step: SubsystemTrailStep,
  byAlias?: TrailComponentLabels,
): string {
  return `${step.mechanism} ${calleeLabel(step, byAlias)}`;
}

/**
 * Build the stack at one trail step.
 *
 * - `calls` → the chain of calls into the caller frame, plus the callee as the
 *   next frame (not yet on the stack).
 * - `uses` / data + event seams → the nearest call frame they attach to, with
 *   the seam as an annotation.
 */
export function buildTrailStack(
  trail: SubsystemTrail,
  stepIndex: number,
  byAlias?: TrailComponentLabels,
): TrailStackView {
  const step = trail.steps[stepIndex];
  if (!step) {
    return { frames: [], annotations: [], isCall: false };
  }

  if (isCallStep(step)) {
    const chain = callChain(trail, stepIndex);
    return {
      frames: framesForChain(trail, chain, stepIndex, byAlias),
      annotations: [],
      isCall: true,
      callee: calleeLabel(step, byAlias),
    };
  }

  const anchor = anchorCallIndex(trail, stepIndex);
  if (anchor != null) {
    const chain = callChain(trail, anchor);
    return {
      frames: framesForChain(trail, chain, anchor, byAlias),
      annotations: [
        {
          stepIndex,
          mechanism: step.mechanism,
          label: annotationLabel(step, byAlias),
          selected: true,
        },
      ],
      isCall: false,
    };
  }

  return {
    frames: [
      {
        stepIndex,
        label: callerLabel(step, byAlias),
        componentAlias: step.from,
        current: true,
      },
    ],
    annotations: [
      {
        stepIndex,
        mechanism: step.mechanism,
        label: annotationLabel(step, byAlias),
        selected: true,
      },
    ],
    isCall: false,
  };
}
