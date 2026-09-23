/**
 * PierreFileView — host-injected full-file code view via `@pierre/diffs`.
 *
 * Ported from `@industry-theme/file-city-panel` so subsystem graphs and
 * Storybook can render source without that panel package.
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
import { isFileUnavailableError } from './fileAvailability';
import { scrollFocusLineIntoView } from './scrollAnchor';

export interface PierreFileViewProps {
  filePath: string;
  fileName: string;
  /** Host-supplied file reader (closures bind any path-normalization). */
  readFile: (path: string) => Promise<string>;
  /** Override Pierre's container background. Any CSS color string. */
  background?: string;
  /** 1-based line to highlight and scroll into view after load. */
  focusLine?: number;
}

export function PierreFileView({
  filePath,
  fileName,
  readFile,
  background,
  focusLine,
}: PierreFileViewProps) {
  const { theme } = useTheme();
  const [contents, setContents] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pierre highlights on the main thread with no worker pool: a cold first
  // render paints an empty <pre> and never re-renders once Shiki resolves.
  // Warm the shared highlighter for this file before mounting <File> so the
  // very first render produces content.
  const [highlighterReady, setHighlighterReady] = useState(false);
  const lang = pierreLangForPath(filePath) ?? getFiletypeFromFileName(fileName);

  const fileObject = useMemo(
    () =>
      contents !== null
        ? { name: fileName, contents, lang: pierreLangForPath(filePath) }
        : null,
    [fileName, filePath, contents],
  );

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

  const onPostRender = useCallback(
    (fileContainer: HTMLElement) => {
      if (focusLine == null) return;
      scrollFocusLineIntoView(fileContainer, focusLine);
    },
    [focusLine],
  );

  const options = useMemo(
    () => ({
      ...buildPierreOptions(background),
      ...(focusLine != null ? { onPostRender } : {}),
    }),
    [background, focusLine, onPostRender],
  );

  if (error) {
    // A file with no local checkout is usually a proposed seam that isn't
    // implemented yet — explain that instead of echoing the host error.
    if (isFileUnavailableError(error)) {
      return (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ color: theme.colors.text }}>
            This file isn't in the local checkout for this repo — it may be
            proposed or not yet implemented.
          </span>
          <span
            style={{
              color: theme.colors.textSecondary,
              fontFamily: theme.fonts.monospace,
              fontSize: theme.fontSizes[0],
            }}
          >
            {filePath}
          </span>
        </div>
      );
    }
    return (
      <div style={{ padding: 16, color: theme.colors.error ?? '#e5534b' }}>
        {error}
      </div>
    );
  }
  if (fileObject === null || !highlighterReady) {
    return (
      <div style={{ padding: 16, color: theme.colors.textSecondary }}>
        Loading…
      </div>
    );
  }

  return (
    <File
      file={fileObject}
      options={options}
      selectedLines={
        focusLine != null ? { start: focusLine, end: focusLine } : undefined
      }
      style={PIERRE_FILE_STYLE}
    />
  );
}
