/** Lines to keep visible above the focus line when scrolling. */
export const SCROLL_LEADING_LINES = 4;

/** 1-based line in the sliced snippet to align near the top of the viewport. */
export function scrollAnchorLine(
  focusOffset: number,
  leadingLines = SCROLL_LEADING_LINES,
): number {
  if (focusOffset <= 1) return 1;
  return Math.max(1, focusOffset - leadingLines);
}

/** Scroll a Pierre file container so `focusLine` (1-based) sits near the top. */
export function scrollFocusLineIntoView(
  fileContainer: HTMLElement,
  focusLine: number,
): void {
  const root = fileContainer.shadowRoot ?? fileContainer;
  const anchorLine = scrollAnchorLine(focusLine);
  const lineEl = root.querySelector(
    `[data-line="${anchorLine}"]`,
  ) as HTMLElement | null;
  if (!lineEl) return;
  // scrollIntoView also nudges the code pane horizontally (the line is wider
  // than the viewport, so `inline` alignment scrolls it right). Pin it back to
  // the left edge so file/snippet views always open at column 0.
  lineEl.scrollIntoView({ block: 'start', behavior: 'auto' });
  const codeScroller = root.querySelector('code') as HTMLElement | null;
  if (codeScroller) codeScroller.scrollLeft = 0;
}
