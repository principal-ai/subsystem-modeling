/**
 * PierreFileView — host-injected full-file code view via `@pierre/diffs`.
 *
 * Ported from `@industry-theme/file-city-panel` so subsystem graphs and
 * Storybook can render source without that panel package.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { File } from '@pierre/diffs/react';
import { useTheme } from '@principal-ade/industry-theme';
import { buildPierreOptions, PIERRE_FILE_STYLE } from './pierreBackground';
import { pierreLangForPath } from './pierreFileLang';
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
    return (
      <div style={{ padding: 16, color: theme.colors.error ?? '#e5534b' }}>
        {error}
      </div>
    );
  }
  if (fileObject === null) {
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
