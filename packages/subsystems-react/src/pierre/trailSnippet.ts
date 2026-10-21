import type { SubsystemTrailStep } from '../subsystem/model';
import { sliceSnippetWindow, type SnippetSlice } from './sliceSnippet';

/** Show the caller's whole declaration, keeping focus on its call site. */
export function sliceTrailStep(
  contents: string,
  step: SubsystemTrailStep,
  contextLines: number,
): SnippetSlice {
  const site = step.site?.span;
  const start = site?.startLine ?? step.span?.startLine ?? 1;
  const end = site?.endLine ?? step.span?.endLine ?? start;
  return sliceSnippetWindow(
    contents,
    start,
    end,
    site ? 0 : contextLines,
    step.span?.startLine ?? start,
  );
}

/** Convert the complete call range to snippet-local lines, never inventing evidence. */
export function trailCallSelection(
  step: SubsystemTrailStep,
  slice: SnippetSlice,
): { start: number; end: number } | null {
  if (step.span == null) return null;
  const start = Math.max(step.span.startLine, slice.sliceStart);
  const end = Math.min(step.span.endLine, slice.sliceEnd);
  if (start > end) return null;
  return {
    start: start - slice.sliceStart + 1,
    end: end - slice.sliceStart + 1,
  };
}
