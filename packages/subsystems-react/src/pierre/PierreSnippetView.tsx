/**
 * PierreSnippetView — focused line-range code view via `@pierre/diffs`.
 *
 * Ported from `@industry-theme/file-city-panel` so subsystem graphs and
 * Storybook can scroll to a declaration line without that panel package.
 *
 * `File.selectedLines` highlights the focus line but does not scroll; we call
 * `scrollIntoView` on the rendered line after Pierre paints.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { File } from '@pierre/diffs/react';
import { useTheme } from '@principal-ade/industry-theme';
import { buildPierreOptions, PIERRE_FILE_STYLE } from './pierreBackground';
import { pierreLangForPath } from './pierreFileLang';
import { sliceSnippetWindow } from './sliceSnippet';

import { scrollAnchorLine } from './scrollAnchor';

function scrollFocusLineIntoView(
  fileContainer: HTMLElement,
  focusOffset: number,
): void {
  const root = fileContainer.shadowRoot ?? fileContainer;
  const anchorLine = scrollAnchorLine(focusOffset);
  const lineEl = root.querySelector(
    `[data-line="${anchorLine}"]`,
  ) as HTMLElement | null;
  lineEl?.scrollIntoView({ block: 'start', behavior: 'auto' });
}

export interface PierreSnippetViewProps {
  filePath: string;
  fileName: string;
  /** First line of the snippet (1-based, inclusive). */
  startLine: number;
  /** Last line of the snippet (1-based, inclusive). */
  endLine: number;
  /** Line to call out as the focus point; defaults to `startLine`. */
  focusLine?: number;
  /** Lines of context above/below the snippet; defaults to 2. */
  contextLines?: number;
  /** Host-supplied file reader. */
  readFile: (path: string) => Promise<string>;
  /** Override Pierre's container background. Any CSS color string. */
  background?: string;
}

export function PierreSnippetView({
  filePath,
  fileName,
  startLine,
  endLine,
  focusLine,
  contextLines = 2,
  readFile,
  background,
}: PierreSnippetViewProps) {
  const { theme } = useTheme();
  const [contents, setContents] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContents(null);
    setError(null);
    void readFile(filePath)
      .then((content) => {
        if (!cancelled) setContents(content);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to read file');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, readFile]);

  const slice = useMemo(() => {
    if (contents == null) return null;
    return sliceSnippetWindow(
      contents,
      startLine,
      endLine,
      contextLines,
      focusLine ?? startLine,
    );
  }, [contents, startLine, endLine, contextLines, focusLine]);

  const fileObject = useMemo(
    () =>
      slice
        ? {
            name: fileName,
            contents: slice.contents,
            lang: pierreLangForPath(filePath),
          }
        : null,
    [fileName, filePath, slice],
  );

  const lineNumberOffset = slice ? slice.sliceStart - 1 : 0;

  const onPostRender = useCallback(
    (fileContainer: HTMLElement) => {
      if (lineNumberOffset !== 0) {
        const root = fileContainer.shadowRoot ?? fileContainer;
        const items = root.querySelectorAll('[data-column-number][data-line-index]');
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
      if (slice?.focusOffset != null) {
        scrollFocusLineIntoView(fileContainer, slice.focusOffset);
      }
    },
    [lineNumberOffset, slice?.focusOffset],
  );

  const options = useMemo(
    () => ({
      ...buildPierreOptions(background),
      onPostRender,
    }),
    [background, onPostRender],
  );

  if (error) {
    return (
      <div style={{ padding: 16, color: theme.colors.error ?? '#e5534b' }}>
        {error}
      </div>
    );
  }
  if (!fileObject || !slice) {
    return (
      <div style={{ padding: 16, color: theme.colors.textSecondary }}>
        Loading…
      </div>
    );
  }

  const rangeLabel =
    slice.sliceStart === slice.sliceEnd
      ? `Line ${slice.sliceStart}`
      : `Lines ${slice.sliceStart}–${slice.sliceEnd}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          padding: '4px 14px 6px',
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[0],
          color: theme.colors.textSecondary,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        {rangeLabel}
      </div>
      <File
        file={fileObject}
        options={options}
        selectedLines={
          slice.focusOffset != null
            ? { start: slice.focusOffset, end: slice.focusOffset }
            : undefined
        }
        style={PIERRE_FILE_STYLE}
      />
    </div>
  );
}
