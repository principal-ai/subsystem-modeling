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
  lineEl?.scrollIntoView({ block: 'start', behavior: 'auto' });
}
