/**
 * PierreWalkthroughCodeView — multi-file step snippets via `@pierre/diffs` CodeView.
 *
 * Renders one sliced window per walkthrough step in a single virtualized
 * scroll; when `stepIndex` changes, scrolls that step's site line into view
 * and highlights it via CodeView `selectedLines` (same mechanism as
 * `PierreSnippetView`).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  CodeView,
  type CodeViewHandle,
  type CodeViewItem,
  type CodeViewReactOptions,
  type DiffLineAnnotation,
  type LineAnnotation,
} from '@pierre/diffs/react';
import { Maximize2 } from 'lucide-react';

/** Mirrors Pierre's CodeViewLineSelection (not re-exported from the React entry). */
type CodeViewLineSelection = {
  id: string;
  range: { start: number; end: number };
};
/** Metadata carried on a walkthrough step's line annotation. */
type WalkthroughStepAnnotation = { text: string };
import { useTheme } from '@principal-ade/industry-theme';
import type {
  SubsystemWalkthrough,
  SubsystemWalkthroughStep,
} from '../subsystem/model';
import type { SubsystemOpenFileOptions } from '../subsystem/declarationRef';
import { buildPierreOptions, PIERRE_FILE_STYLE } from './pierreBackground';
import { pierreLangForPath } from './pierreFileLang';
import { resolvePierreSyntaxThemeName } from './pierreSyntaxTheme';
import { fileUnavailableNotice, isFileUnavailableError } from './fileAvailability';
import {
  remapSnippetLineNumbers,
  sliceSnippetWindow,
  type SnippetSlice,
} from './sliceSnippet';

export interface PierreWalkthroughCodeViewProps {
  walkthrough: SubsystemWalkthrough;
  /** Focused step; `null` shows all snippets without scrolling to a step. */
  stepIndex: number | null;
  /** Read a step site; `purl` names the seam site's repo for checkout resolution. */
  readFile: (path: string, purl?: string) => Promise<string>;
  /** Context lines above/below each step site; defaults to 8. */
  contextLines?: number;
  /** Override Pierre's container background. */
  background?: string;
  /** Open the step's full source file (header button or double-click snippet body). */
  onOpenFile?: (path: string, opts?: SubsystemOpenFileOptions) => void;
  /**
   * Aliases of components marked `proposed`. A step whose file can't be read
   * but whose endpoint is proposed reads as "planned" rather than "missing".
   */
  proposedAliases?: ReadonlySet<string>;
}

type FileLoadState =
  | { status: 'loading' }
  | {
      status: 'ready';
      byPath: Map<string, string>;
      /** Paths the host couldn't serve, keyed like `byPath`, with the reason. */
      unavailable: Map<string, string>;
    };

function stepItemId(walkthroughId: string, index: number): string {
  return `${walkthroughId}:${index}`;
}

/** Stable key for a step's file within a repo (mirrors `pathsKey`). */
function siteKey(step: Pick<SubsystemWalkthroughStep, 'purl' | 'file'>): string {
  return `${step.purl}\0${step.file}`;
}

/** Notice shown in place of a snippet whose file the host couldn't read. */
function unavailableNotice(
  step: SubsystemWalkthroughStep,
  error: string,
  proposed: boolean,
): string {
  return isFileUnavailableError(error)
    ? fileUnavailableNotice(step.file, proposed)
    : `Couldn't load ${step.file}: ${error}`;
}

/** A single-line placeholder snippet standing in for an unreadable file. */
function unavailableSlice(notice: string): SnippetSlice {
  return {
    contents: `// ${notice}`,
    sliceStart: 1,
    sliceEnd: 1,
    focusOffset: 1,
  };
}

function OpenFileHeaderButton({
  file,
  line,
  onOpenFile,
}: {
  file: string;
  line: number;
  onOpenFile: (path: string, opts?: SubsystemOpenFileOptions) => void;
}) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenFile(file, { startLine: line, fullFile: true });
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`Open ${file}`}
      aria-label={`Open full file ${file}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 4,
        background: hover ? theme.colors.border : 'transparent',
        color: hover ? theme.colors.text : theme.colors.textSecondary,
        cursor: 'pointer',
        fontFamily: theme.fonts.monospace,
        fontSize: theme.fontSizes[0],
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      <Maximize2 size={11} />
      Open file
    </button>
  );
}

export function PierreWalkthroughCodeView({
  walkthrough,
  stepIndex,
  readFile,
  contextLines = 8,
  background,
  onOpenFile,
  proposedAliases,
}: PierreWalkthroughCodeViewProps) {
  const { theme, mode } = useTheme();
  const viewRef = useRef<CodeViewHandle<undefined>>(null);
  const [load, setLoad] = useState<FileLoadState>({ status: 'loading' });

  // A hop onto a proposed component is planned work; label its missing file
  // accordingly instead of showing a bare "not found".
  const isProposedStep = useCallback(
    (step: SubsystemWalkthroughStep): boolean =>
      proposedAliases != null &&
      (proposedAliases.has(step.from) || proposedAliases.has(step.to)),
    [proposedAliases],
  );

  const pathsKey = useMemo(() => {
    const keys = [...new Set(walkthrough.steps.map((s) => siteKey(s)))];
    keys.sort();
    return keys.join('\0');
  }, [walkthrough.steps]);

  // Load each site independently: one unreadable step (a proposed seam whose
  // file isn't implemented yet) must not blank the whole walkthrough. Failures
  // are kept per-path and rendered as inline placeholders below.
  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    const sites = [...new Map(walkthrough.steps.map((s) => [siteKey(s), s])).values()];
    void Promise.all(
      sites.map(async (step) => {
        const key = siteKey(step);
        try {
          const contents = await readFile(step.file, step.purl);
          return { key, contents, error: null as string | null };
        } catch (err) {
          return {
            key,
            contents: null,
            error: err instanceof Error ? err.message : 'Failed to read file',
          };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const byPath = new Map<string, string>();
      const unavailable = new Map<string, string>();
      for (const row of results) {
        if (row.contents != null) byPath.set(row.key, row.contents);
        else unavailable.set(row.key, row.error ?? 'Failed to read file');
      }
      setLoad({ status: 'ready', byPath, unavailable });
    });
    return () => {
      cancelled = true;
    };
  }, [walkthrough.id, pathsKey, readFile]);

  const slices = useMemo((): SnippetSlice[] => {
    if (load.status !== 'ready') return [];
    return walkthrough.steps.map((step) => {
      const key = siteKey(step);
      const failure = load.unavailable.get(key);
      if (failure != null) {
        return unavailableSlice(
          unavailableNotice(step, failure, isProposedStep(step)),
        );
      }
      const contents = load.byPath.get(key) ?? '';
      return sliceSnippetWindow(
        contents,
        step.line,
        step.line,
        contextLines,
        step.line,
      );
    });
  }, [load, walkthrough.steps, contextLines, isProposedStep]);

  const items = useMemo((): CodeViewItem<WalkthroughStepAnnotation>[] => {
    if (load.status !== 'ready' || slices.length === 0) return [];
    return walkthrough.steps.map((step, index) => {
      const slice = slices[index]!;
      const focus = slice.focusOffset;
      const key = siteKey(step);
      const failure = load.unavailable.get(key);
      // The placeholder line already carries the reason, so it replaces any
      // authored annotation rather than stacking with it.
      const annotations:
        | LineAnnotation<WalkthroughStepAnnotation>[]
        | undefined =
        failure == null &&
        step.annotation != null &&
        step.annotation.length > 0 &&
        focus != null
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
          name: step.file,
          contents: slice.contents,
          lang: pierreLangForPath(step.file),
          cacheKey: `${walkthrough.id}:${index}:${step.file}:${step.line}:${slice.sliceStart}-${slice.sliceEnd}${failure != null ? ':unavailable' : ''}`,
        },
      };
    });
  }, [load, slices, walkthrough.id, walkthrough.steps, isProposedStep]);

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

  const sliceStartByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < slices.length; i++) {
      map.set(stepItemId(walkthrough.id, i), slices[i]!.sliceStart);
    }
    return map;
  }, [slices, walkthrough.id]);

  const onPostRender = useCallback(
    (
      node: HTMLElement,
      _instance: unknown,
      _phase: unknown,
      context?: { item?: { id?: string } },
    ) => {
      const id = context?.item?.id;
      if (id == null) return;
      const sliceStart = sliceStartByItemId.get(id);
      if (sliceStart == null) return;
      remapSnippetLineNumbers(node, sliceStart);
    },
    [sliceStartByItemId],
  );

  const renderHeaderPrefix = useMemo(() => {
    return (item: CodeViewItem) => {
      const index = Number.parseInt(item.id.split(':').pop() ?? '', 10);
      if (!walkthrough.steps[index]) return null;
      return (
        <span
          style={{
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            color: theme.colors.textSecondary,
            marginRight: 8,
          }}
        >
          {index + 1}.
        </span>
      );
    };
  }, [walkthrough.steps, theme]);

  const renderHeaderMetadata = useMemo(() => {
    return (item: CodeViewItem) => {
      const index = Number.parseInt(item.id.split(':').pop() ?? '', 10);
      const step = walkthrough.steps[index];
      if (!step) return null;
      // Unreadable sites have nothing to open — say so instead of offering a
      // button that would only fail again in the full-file overlay.
      const unavailable =
        load.status === 'ready' && load.unavailable.has(siteKey(step));
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginLeft: 8,
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            color: theme.colors.textSecondary,
          }}
        >
          {unavailable ? (
            <span title="This file isn't in the local checkout">
              not in checkout
            </span>
          ) : (
            <>
              L{step.line}
              {onOpenFile && (
                <OpenFileHeaderButton
                  file={step.file}
                  line={step.line}
                  onOpenFile={onOpenFile}
                />
              )}
            </>
          )}
        </span>
      );
    };
  }, [walkthrough.steps, theme, onOpenFile, load]);

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

  const onLineClick = useCallback(
    (
      props: { event?: { detail?: number } },
      context?: { item?: { id?: string } },
    ) => {
      if (!onOpenFile) return;
      if (props.event?.detail !== 2) return;
      const id = context?.item?.id;
      if (id == null) return;
      const index = Number.parseInt(id.split(':').pop() ?? '', 10);
      const step = walkthrough.steps[index];
      if (!step) return;
      if (load.status === 'ready' && load.unavailable.has(siteKey(step))) return;
      onOpenFile(step.file, { startLine: step.line, fullFile: true });
    },
    [onOpenFile, walkthrough.steps, load],
  );

  const options = useMemo((): CodeViewReactOptions => {
    return {
      theme: {
        dark: resolvePierreSyntaxThemeName('dark'),
        light: resolvePierreSyntaxThemeName('light'),
      },
      stickyHeaders: true,
      disableFileHeader: false,
      layout: { paddingTop: 0, paddingBottom: 0, gap: 4 },
      onPostRender,
      ...(onOpenFile ? { onLineClick } : {}),
      ...(background ? buildPierreOptions(background) : {}),
      ...(mode === 'light' || mode === 'dark' ? { themeType: mode } : {}),
    };
  }, [background, mode, onPostRender, onOpenFile, onLineClick]);

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

  if (load.status === 'loading') {
    return (
      <div style={{ padding: 16, color: theme.colors.textSecondary }}>
        Loading…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div style={{ padding: 16, color: theme.colors.textSecondary }}>
        No steps in this walkthrough.
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
