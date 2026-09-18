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
import {
  getFiletypeFromFileName,
  getHighlighterOptions,
  preloadHighlighter,
} from '@pierre/diffs';
import { useTheme } from '@principal-ade/industry-theme';
import { buildPierreOptions, PIERRE_FILE_STYLE } from './pierreBackground';
import { pierreLangForPath } from './pierreFileLang';
import { remapSnippetLineNumbers, sliceSnippetWindow } from './sliceSnippet';

import { scrollFocusLineIntoView } from './scrollAnchor';

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
  // Warm the shared highlighter before mounting <File>; a cold first render
  // paints an empty <pre> that never re-renders (no worker pool).
  const [highlighterReady, setHighlighterReady] = useState(false);
  const lang = pierreLangForPath(filePath) ?? getFiletypeFromFileName(fileName);

  useEffect(() => {
    let cancelled = false;
    setHighlighterReady(false);
    void preloadHighlighter(getHighlighterOptions(lang, {}))
      .catch(() => {
        // Fall through: let <File> attempt its own (plain-text) render.
      })
      .then(() => {
        if (!cancelled) setHighlighterReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

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

  const onPostRender = useCallback(
    (fileContainer: HTMLElement) => {
      if (slice != null) {
        remapSnippetLineNumbers(fileContainer, slice.sliceStart);
      }
      if (slice?.focusOffset != null) {
        scrollFocusLineIntoView(fileContainer, slice.focusOffset);
      }
    },
    [slice],
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
  if (!fileObject || !slice || !highlighterReady) {
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
