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
