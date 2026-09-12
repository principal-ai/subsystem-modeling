/**
 * PierreWalkthroughCodeView — multi-file step snippets via `@pierre/diffs` CodeView.
 *
 * Renders one sliced window per walkthrough step in a single virtualized
 * scroll; when `stepIndex` changes, scrolls that step's site line into view
 * and highlights it via CodeView `selectedLines` (same mechanism as
 * `PierreSnippetView`).
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  CodeView,
  type CodeViewHandle,
  type CodeViewItem,
  type CodeViewReactOptions,
  type DiffLineAnnotation,
  type LineAnnotation,
} from '@pierre/diffs/react';

/** Mirrors Pierre's CodeViewLineSelection (not re-exported from the React entry). */
type CodeViewLineSelection = {
  id: string;
  range: { start: number; end: number };
};
/** Metadata carried on a walkthrough step's line annotation. */
type WalkthroughStepAnnotation = { text: string };
import { useTheme } from '@principal-ade/industry-theme';
import type { SubsystemWalkthrough } from '../subsystem/model';
import { buildPierreOptions, PIERRE_FILE_STYLE } from './pierreBackground';
import {
  pierreCodeViewFileName,
  pierreLangForPath,
} from './pierreFileLang';
import { resolvePierreSyntaxThemeName } from './pierreSyntaxTheme';
import { sliceSnippetWindow, type SnippetSlice } from './sliceSnippet';

export interface PierreWalkthroughCodeViewProps {
  walkthrough: SubsystemWalkthrough;
  /** Focused step; `null` shows all snippets without scrolling to a step. */
  stepIndex: number | null;
  readFile: (path: string) => Promise<string>;
  /** Context lines above/below each step site; defaults to 8. */
  contextLines?: number;
  /** Override Pierre's container background. */
  background?: string;
}

type FileLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; byPath: Map<string, string> };

function stepItemId(walkthroughId: string, index: number): string {
  return `${walkthroughId}:${index}`;
}

export function PierreWalkthroughCodeView({
  walkthrough,
  stepIndex,
  readFile,
  contextLines = 8,
  background,
}: PierreWalkthroughCodeViewProps) {
  const { theme, mode } = useTheme();
  const viewRef = useRef<CodeViewHandle<undefined>>(null);
  const [load, setLoad] = useState<FileLoadState>({ status: 'loading' });

  const pathsKey = useMemo(() => {
    const paths = [...new Set(walkthrough.steps.map((s) => s.file))];
    paths.sort();
    return paths.join('\0');
  }, [walkthrough.steps]);

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    const paths = [...new Set(walkthrough.steps.map((s) => s.file))];
    void Promise.all(
      paths.map(async (path) => {
        const contents = await readFile(path);
        return [path, contents] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setLoad({ status: 'ready', byPath: new Map(entries) });
      })
      .catch((err) => {
        if (cancelled) return;
        setLoad({
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to read files',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [walkthrough.id, pathsKey, readFile]);

  const slices = useMemo((): SnippetSlice[] => {
    if (load.status !== 'ready') return [];
    return walkthrough.steps.map((step) => {
      const contents = load.byPath.get(step.file) ?? '';
      return sliceSnippetWindow(
        contents,
        step.line,
        step.line,
        contextLines,
        step.line,
      );
    });
  }, [load, walkthrough.steps, contextLines]);

const items = useMemo((): CodeViewItem<WalkthroughStepAnnotation>[] => {
    if (load.status !== 'ready' || slices.length === 0) return [];
    return walkthrough.steps.map((step, index) => {
      const slice = slices[index]!;
      const focus = slice.focusOffset;
      const annotations:
        | LineAnnotation<WalkthroughStepAnnotation>[]
        | undefined =
        step.annotation != null && step.annotation.length > 0 && focus != null
          ? [
              {
                lineNumber: focus,
                metadata: { text: step.annotation },
              },
            ]
          : undefined;
      return {
        id: stepItemId(walkthrough.id, index),
        type: 'file' as const,
        version: 1,
        annotations,
        file: {
          name: pierreCodeViewFileName(step.file, index),
          contents: slice.contents,
          lang: pierreLangForPath(step.file),
          cacheKey: `${walkthrough.id}:${index}:${step.file}:${step.line}:${slice.sliceStart}-${slice.sliceEnd}`,
        },
      };
    });
  }, [load, slices, walkthrough.id, walkthrough.steps]);

  const selectedLines = useMemo((): CodeViewLineSelection | null => {
    if (stepIndex == null || stepIndex < 0 || stepIndex >= slices.length) {
      return null;
    }
    const focus = slices[stepIndex]?.focusOffset;
    if (focus == null) return null;
    return {
      id: stepItemId(walkthrough.id, stepIndex),
      range: { start: focus, end: focus },
    };
  }, [stepIndex, slices, walkthrough.id]);

  const renderHeaderPrefix = useMemo(() => {
    return (item: CodeViewItem) => {
      const index = Number.parseInt(item.id.split(':').pop() ?? '', 10);
      const step = walkthrough.steps[index];
      if (!step) return null;
      const label =
        step.symbol != null && step.symbol.length > 0
          ? step.symbol
          : `step ${index + 1}`;
      return (
        <span
          style={{
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            color: theme.colors.textSecondary,
            marginRight: 8,
          }}
        >
          {index + 1}. {label}
        </span>
      );
    };
  }, [walkthrough.steps, theme]);

  const renderHeaderMetadata = useMemo(() => {
    return (item: CodeViewItem) => {
      const index = Number.parseInt(item.id.split(':').pop() ?? '', 10);
      const step = walkthrough.steps[index];
      if (!step) return null;
      return (
        <span
          style={{
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            color: theme.colors.textSecondary,
            marginLeft: 8,
          }}
        >
          L{step.line}
        </span>
      );
    };
  }, [walkthrough.steps, theme]);

  const renderAnnotation = useMemo(() => {
    return (
      annotation:
        | LineAnnotation<WalkthroughStepAnnotation>
        | DiffLineAnnotation<WalkthroughStepAnnotation>,
      item: CodeViewItem<WalkthroughStepAnnotation>,
    ) => {
      const index = Number.parseInt(item.id.split(':').pop() ?? '', 10);
      const step = walkthrough.steps[index];
      const text = annotation.metadata?.text;
      if (!text || !step) return null;
      return (
        <span
          style={{
            display: 'inline-block',
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            color: theme.colors.textSecondary,
            fontStyle: 'italic',
            opacity: 0.9,
          }}
        >
          {text}
        </span>
      );
    };
  }, [walkthrough.steps, theme]);

  const options = useMemo((): CodeViewReactOptions => {
    return {
      theme: {
        dark: resolvePierreSyntaxThemeName('dark'),
        light: resolvePierreSyntaxThemeName('light'),
      },
      stickyHeaders: true,
      disableFileHeader: false,
      layout: { paddingTop: 8, paddingBottom: 16, gap: 12 },
      ...(background ? buildPierreOptions(background) : {}),
      ...(mode === 'light' || mode === 'dark' ? { themeType: mode } : {}),
    };
  }, [background, mode]);

  useEffect(() => {
    if (load.status !== 'ready' || stepIndex == null) return;
    if (stepIndex < 0 || stepIndex >= walkthrough.steps.length) return;
    const focus = slices[stepIndex]?.focusOffset;
    if (focus == null) return;
    const id = stepItemId(walkthrough.id, stepIndex);
    const t = window.setTimeout(() => {
      viewRef.current?.scrollTo({
        type: 'line',
        id,
        lineNumber: focus,
        align: 'center',
      });
    }, 50);
    return () => window.clearTimeout(t);
  }, [
    load.status,
    stepIndex,
    walkthrough.id,
    walkthrough.steps.length,
    slices,
    items.length,
  ]);

  if (load.status === 'error') {
    return (
      <div style={{ padding: 16, color: theme.colors.error ?? '#e5534b' }}>
        {load.message}
      </div>
    );
  }
  if (load.status === 'loading' || items.length === 0) {
    return (
      <div style={{ padding: 16, color: theme.colors.textSecondary }}>
        Loading…
      </div>
    );
  }

  const CodeViewLoose = CodeView as unknown as (props: Record<string, unknown>) => ReactElement;

  return (
    <CodeViewLoose
      ref={viewRef}
      items={items}
      options={options}
      selectedLines={selectedLines}
      renderHeaderPrefix={renderHeaderPrefix}
      renderHeaderMetadata={renderHeaderMetadata}
      renderAnnotation={renderAnnotation}
      style={{ ...PIERRE_FILE_STYLE, height: '100%', overflow: 'auto' }}
    />
  );
}
