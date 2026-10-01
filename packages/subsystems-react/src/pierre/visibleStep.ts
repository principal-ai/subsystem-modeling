/**
 * visibleStep — pick which step a scroll position should report as current.
 *
 * Kept separate from the component so the geometry can be tested directly:
 * the answer depends on how tall the final snippet is relative to the
 * viewport, which is not something to eyeball.
 */

/** A mounted CodeView item reduced to what the choice depends on. */
export interface VisibleStepRect {
  /** Step index parsed from the item id. */
  index: number;
  /** Viewport-relative top edge, in px. */
  top: number;
  /** Viewport-relative bottom edge, in px. */
  bottom: number;
}

/** The scroll container's box plus its scroll metrics, in px. */
export interface VisibleStepViewport {
  top: number;
  bottom: number;
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/** Sub-pixel slack so a bottom edge that lands a hair off still counts. */
export const AT_END_TOLERANCE_PX = 2;

/**
 * Index of the step to report as current.
 *
 * Normally the topmost step still on screen. The exception is the end of the
 * content: when the final snippet is shorter than the viewport, reaching the
 * bottom still leaves the previous step's tail on screen, and reporting that
 * would strand a progress readout one step short of full.
 *
 * 'At the end' is accepted two ways, because either can be the authoritative
 * one depending on how the view is nested:
 *   - the lowest mounted item's bottom edge has entered the container's box, or
 *   - the container's own scroll offset has reached its scroll extent.
 *
 * The second signal is only consulted when the container actually scrolls. If
 * an ancestor scrolls instead, `scrollHeight` equals `clientHeight` and
 * `scrollTop` is pinned at 0, which would otherwise read as 'at the end' from
 * the very first pixel.
 *
 * Returns `null` when nothing measurable is on screen.
 */
export function resolveVisibleStepIndex(
  viewport: VisibleStepViewport,
  rects: readonly VisibleStepRect[],
): number | null {
  let topIndex: number | null = null;
  let lastIndex: number | null = null;
  let lowestBottom = Number.NEGATIVE_INFINITY;

  for (const rect of rects) {
    if (topIndex == null && rect.bottom > viewport.top) topIndex = rect.index;
    if (lastIndex == null || rect.index > lastIndex) lastIndex = rect.index;
    if (rect.bottom > lowestBottom) lowestBottom = rect.bottom;
  }
  if (topIndex == null) return null;

  const reachedLastItem = lowestBottom <= viewport.bottom + AT_END_TOLERANCE_PX;
  const containerScrolls = viewport.scrollHeight > viewport.clientHeight;
  const reachedScrollEnd =
    containerScrolls &&
    viewport.scrollTop + viewport.clientHeight >=
      viewport.scrollHeight - AT_END_TOLERANCE_PX;

  return reachedLastItem || reachedScrollEnd
    ? (lastIndex ?? topIndex)
    : topIndex;
}
