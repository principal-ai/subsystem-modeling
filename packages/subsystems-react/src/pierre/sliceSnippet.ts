/** Slice a file's line range with surrounding context for snippet rendering. */

export interface SnippetSlice {
  contents: string;
  sliceStart: number;
  sliceEnd: number;
  /** 1-based line index within `contents` to highlight, or null. */
  focusOffset: number | null;
}

export function sliceSnippetWindow(
  contents: string,
  startLine: number,
  endLine: number,
  contextLines: number,
  focusLine?: number | null,
): SnippetSlice {
  const allLines = contents.split('\n');
  const total = allLines.length;
  const safeStart = Math.max(1, Math.min(startLine, total));
  const safeEnd = Math.max(safeStart, Math.min(endLine, total));
  const sliceStart = Math.max(1, safeStart - contextLines);
  const sliceEnd = Math.min(total, safeEnd + contextLines);
  return {
    contents: allLines.slice(sliceStart - 1, sliceEnd).join('\n'),
    sliceStart,
    sliceEnd,
    focusOffset:
      focusLine == null ? null : Math.max(1, focusLine - sliceStart + 1),
  };
}

/**
 * Remap Pierre gutter numbers from slice-local (1-based) to absolute file lines.
 * Pierre numbers whatever `contents` it receives starting at 1; sliced snippets
 * need `sliceStart` applied so the gutter matches the source file.
 */
export function remapSnippetLineNumbers(
  fileContainer: HTMLElement,
  sliceStart: number,
): void {
  const lineNumberOffset = sliceStart - 1;
  if (lineNumberOffset === 0) return;
  const root = fileContainer.shadowRoot ?? fileContainer;
  const items = root.querySelectorAll(
    '[data-column-number][data-line-index]',
  );
  items.forEach((el) => {
    const idxStr = (el as HTMLElement).dataset.lineIndex;
    if (idxStr == null) return;
    const idx = Number.parseInt(idxStr, 10);
    if (Number.isNaN(idx)) return;
    const display = String(idx + 1 + lineNumberOffset);
    const span = el.querySelector('[data-line-number-content]');
    if (span && span.textContent !== display) {
      span.textContent = display;
    }
  });
}
