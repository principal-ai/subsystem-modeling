/**
 * PierreTrailCodeView — multi-file step snippets via `@pierre/diffs` CodeView.
 *
 * Renders one sliced window per trail step in a single virtualized
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
import type { TokenEventBase } from '@pierre/diffs';
import { Maximize2 } from 'lucide-react';

/** Mirrors Pierre's CodeViewLineSelection (not re-exported from the React entry). */
type CodeViewLineSelection = {
  id: string;
  range: { start: number; end: number };
};
/** Metadata carried on a trail step's line annotation. */
type TrailStepAnnotation = { text: string };
import { useTheme } from '@principal-ade/industry-theme';
import type {
  SubsystemTrail,
  SubsystemTrailStep,
} from '../subsystem/model';
import type { SubsystemOpenFileOptions } from '../subsystem/declarationRef';
import { buildPierreOptions, PIERRE_FILE_STYLE } from './pierreBackground';
import { pierreLangForPath } from './pierreFileLang';
import { resolvePierreSyntaxThemeName } from './pierreSyntaxTheme';
import { resolveVisibleStepIndex, type VisibleStepRect } from './visibleStep';
import { fileUnavailableNotice, isFileUnavailableError } from './fileAvailability';
import {
  remapSnippetLineNumbers,
  sliceSnippetWindow,
  type SnippetSlice,
} from './sliceSnippet';

/**
 * A token the user clicked or hovered inside a step's snippet. `stepIndex` is
 * the zero-based index of the trail step whose snippet it sits in, so a
 * host can resolve the token against that step's construct endpoints.
 */
export interface TrailSymbolQuery {
  stepIndex: number;
  tokenText: string;
}

/** Ctx item id → step index, for CodeView's `trailId:index` item ids. */
function stepIndexFromItemContext(context: unknown): number | null {
  const id = (context as { item?: { id?: string } } | undefined)?.item?.id;
  if (id == null) return null;
  const index = Number.parseInt(id.split(':').pop() ?? '', 10);
  return Number.isFinite(index) ? index : null;
}

/**
 * Assumed height of the compact file header, in px.
 *
 * Must track the header chrome passed to `buildPierreOptions` (fontSizes[0] at
 * line-height 1.15 plus 2px vertical padding) — CodeView sizes its
 * virtualization window and sticky offset from this, and the library's own
 * default of 44 is more than double the compact header.
 */
const TRAIL_HEADER_HEIGHT = 18;

/** Pointer/dotted-underline affordance for a clickable construct token. */
function paintSymbolToken(el: HTMLElement | undefined, active: boolean): void {
  if (el == null) return;
  el.style.cursor = active ? 'pointer' : '';
  el.style.textDecorationLine = active ? 'underline' : '';
  el.style.textDecorationStyle = active ? 'dotted' : '';
  el.style.textUnderlineOffset = active ? '2px' : '';
}

export interface PierreTrailCodeViewProps {
  trail: SubsystemTrail;
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
   * Fires when scrolling brings a different step to the top of the view, with
   * that step's index. Drives a progress readout that tracks the viewport
   * rather than the selected step. Only fires on change, not per scroll event.
   */
  onVisibleStepChange?: (index: number) => void;
  /**
   * Aliases of components marked `proposed`. A step whose file can't be read
   * but whose endpoint is proposed reads as "planned" rather than "missing".
   */
  proposedAliases?: ReadonlySet<string>;
  /**
   * Resolve a token to a model construct key (e.g. a component alias) for the
   * step its snippet belongs to. Return `null` when the token doesn't name a
   * construct this flow touches. When both this and `onSymbolClick` are set,
   * matching tokens read as clickable (pointer + dotted underline).
   */
  resolveSymbol?: (query: TrailSymbolQuery) => string | null;
  /** Fired when a token resolved by `resolveSymbol` is clicked. */
  onSymbolClick?: (symbol: string, query: TrailSymbolQuery) => void;
}

type FileLoadState =
  | { status: 'loading' }
  | {
      status: 'ready';
      byPath: Map<string, string>;
      /** Paths the host couldn't serve, keyed like `byPath`, with the reason. */
      unavailable: Map<string, string>;
    };

function stepItemId(trailId: string, index: number): string {
  return `${trailId}:${index}`;
}

/** Stable key for a step's file within a repo (mirrors `pathsKey`). */
function siteKey(step: Pick<SubsystemTrailStep, 'purl' | 'file'>): string {
  return `${step.purl}\0${step.file}`;
}

/** Notice shown in place of a snippet whose file the host couldn't read. */
function unavailableNotice(
  step: SubsystemTrailStep,
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

export function PierreTrailCodeView({
  trail,
  stepIndex,
  readFile,
  contextLines = 8,
  background,
  onOpenFile,
  onVisibleStepChange,
  proposedAliases,
  resolveSymbol,
  onSymbolClick,
}: PierreTrailCodeViewProps) {
  const { theme, mode } = useTheme();
  const viewRef = useRef<CodeViewHandle<undefined>>(null);
  // CodeView's scroll container — also the box we measure items against.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [load, setLoad] = useState<FileLoadState>({ status: 'loading' });

  // Keep the newest symbol callbacks in refs so the Pierre options object stays
  // stable (host callbacks are recreated per render).
  const resolveSymbolRef = useRef(resolveSymbol);
  resolveSymbolRef.current = resolveSymbol;
  const onSymbolClickRef = useRef(onSymbolClick);
  onSymbolClickRef.current = onSymbolClick;
  const onVisibleStepChangeRef = useRef(onVisibleStepChange);
  onVisibleStepChangeRef.current = onVisibleStepChange;
  const visibleStepRef = useRef<number | null>(null);

  // Report which step the viewport is on. The geometry lives in `visibleStep` so
  // it can be tested — the answer depends on how tall the final snippet is
  // relative to the viewport, which is not something to eyeball.
  const reportVisibleStep = useCallback(() => {
    const container = containerRef.current;
    const viewer = viewRef.current?.getInstance();
    if (container == null || viewer == null) return;
    const rect = container.getBoundingClientRect();
    const rects: VisibleStepRect[] = [];
    for (const rendered of viewer.getRenderedItems()) {
      const index = Number.parseInt(rendered.id.split(':').pop() ?? '', 10);
      if (!Number.isFinite(index)) continue;
      const itemRect = rendered.element.getBoundingClientRect();
      rects.push({ index, top: itemRect.top, bottom: itemRect.bottom });
    }
    const next = resolveVisibleStepIndex(
      {
        top: rect.top,
        bottom: rect.bottom,
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
        scrollHeight: container.scrollHeight,
      },
      rects,
    );
    if (next == null || next === visibleStepRef.current) return;
    visibleStepRef.current = next;
    onVisibleStepChangeRef.current?.(next);
  }, []);

  const onCodeViewScroll = useCallback(() => {
    reportVisibleStep();
  }, [reportVisibleStep]);

  // A step onto a proposed component is planned work; label its missing file
  // accordingly instead of showing a bare "not found".
  const isProposedStep = useCallback(
    (step: SubsystemTrailStep): boolean =>
      proposedAliases != null &&
      (proposedAliases.has(step.from) || proposedAliases.has(step.to)),
    [proposedAliases],
  );

  const pathsKey = useMemo(() => {
    const keys = [...new Set(trail.steps.map((s) => siteKey(s)))];
    keys.sort();
    return keys.join('\0');
  }, [trail.steps]);

  // Load each site independently: one unreadable step (a proposed seam whose
  // file isn't implemented yet) must not blank the whole trail. Failures
  // are kept per-path and rendered as inline placeholders below.
  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    const sites = [...new Map(trail.steps.map((s) => [siteKey(s), s])).values()];
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
  }, [trail.id, pathsKey, readFile]);

  const slices = useMemo((): SnippetSlice[] => {
    if (load.status !== 'ready') return [];
    return trail.steps.map((step) => {
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
  }, [load, trail.steps, contextLines, isProposedStep]);

  const items = useMemo((): CodeViewItem<TrailStepAnnotation>[] => {
    if (load.status !== 'ready' || slices.length === 0) return [];
    return trail.steps.map((step, index) => {
      const slice = slices[index]!;
      const focus = slice.focusOffset;
      const key = siteKey(step);
      const failure = load.unavailable.get(key);
      // The placeholder line already carries the reason, so it replaces any
      // authored annotation rather than stacking with it.
      const annotations:
        | LineAnnotation<TrailStepAnnotation>[]
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
        id: stepItemId(trail.id, index),
        type: 'file' as const,
        version: 1,
        annotations,
        file: {
          name: step.file,
          contents: slice.contents,
          lang: pierreLangForPath(step.file),
          cacheKey: `${trail.id}:${index}:${step.file}:${step.line}:${slice.sliceStart}-${slice.sliceEnd}${failure != null ? ':unavailable' : ''}`,
        },
      };
    });
  }, [load, slices, trail.id, trail.steps, isProposedStep]);

  const selectedLines = useMemo((): CodeViewLineSelection | null => {
    if (stepIndex == null || stepIndex < 0 || stepIndex >= slices.length) {
      return null;
    }
    const focus = slices[stepIndex]?.focusOffset;
    if (focus == null) return null;
    return {
      id: stepItemId(trail.id, stepIndex),
      range: { start: focus, end: focus },
    };
  }, [stepIndex, slices, trail.id]);

  const sliceStartByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < slices.length; i++) {
      map.set(stepItemId(trail.id, i), slices[i]!.sliceStart);
    }
    return map;
  }, [slices, trail.id]);

  const onPostRender = useCallback(
    (
      node: HTMLElement,
      _instance: unknown,
      _phase: unknown,
      context?: { item?: { id?: string } },
    ) => {
      const id = context?.item?.id;
      // Item-level renders don't move the viewport, but the first paint does
      // decide which step is on screen.
      reportVisibleStep();
      if (id == null) return;
      const sliceStart = sliceStartByItemId.get(id);
      if (sliceStart == null) return;
      remapSnippetLineNumbers(node, sliceStart);
    },
    [sliceStartByItemId, reportVisibleStep],
  );

  // No step numbers in the file header: the sidebar already numbers the steps,
  // and the drawer header carries a segmented progress readout.

  const renderHeaderMetadata = useMemo(() => {
    return (item: CodeViewItem) => {
      const index = Number.parseInt(item.id.split(':').pop() ?? '', 10);
      const step = trail.steps[index];
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
  }, [trail.steps, theme, onOpenFile, load]);

  const renderAnnotation = useMemo(() => {
    return (
      annotation:
        | LineAnnotation<TrailStepAnnotation>
        | DiffLineAnnotation<TrailStepAnnotation>,
      item: CodeViewItem<TrailStepAnnotation>,
    ) => {
      const index = Number.parseInt(item.id.split(':').pop() ?? '', 10);
      const step = trail.steps[index];
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
  }, [trail.steps, theme]);

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
      const step = trail.steps[index];
      if (!step) return;
      if (load.status === 'ready' && load.unavailable.has(siteKey(step))) return;
      onOpenFile(step.file, { startLine: step.line, fullFile: true });
    },
    [onOpenFile, trail.steps, load],
  );

  // Per-token interactions for construct navigation. Only wired when the host
  // supplies both callbacks; providing them also switches Pierre into its
  // token-transformer render path (pointer events land on token spans).
  const symbolHandlers = useMemo((): Partial<CodeViewReactOptions> => {
    if (resolveSymbol == null || onSymbolClick == null) return {};
    const resolveAt = (
      props: TokenEventBase,
      context: unknown,
    ): { symbol: string; query: TrailSymbolQuery } | null => {
      const stepIndex = stepIndexFromItemContext(context);
      const tokenText = props?.tokenText;
      if (stepIndex == null || !tokenText) return null;
      const symbol = resolveSymbolRef.current?.({ stepIndex, tokenText });
      return symbol == null ? null : { symbol, query: { stepIndex, tokenText } };
    };
    return {
      onTokenClick: (props, _event, context) => {
        const hit = resolveAt(props, context);
        if (hit) onSymbolClickRef.current?.(hit.symbol, hit.query);
      },
      onTokenEnter: (props, _event, context) => {
        if (resolveAt(props, context)) paintSymbolToken(props.tokenElement, true);
      },
      onTokenLeave: (props) => paintSymbolToken(props.tokenElement, false),
    };
  }, [resolveSymbol, onSymbolClick]);

  const options = useMemo((): CodeViewReactOptions => {
    return {
      theme: {
        dark: resolvePierreSyntaxThemeName('dark'),
        light: resolvePierreSyntaxThemeName('light'),
      },
      stickyHeaders: true,
      // CodeView never injects `unsafeCSS` into its own shadow root, but it
      // forwards the option to each file item (CODE_VIEW_FILE_OPTION_KEYS),
      // which does — so this retints the file surfaces and headers. It cannot
      // reach CodeView's host, hence the spread only carries
      // PIERRE_BASE_OPTIONS and `disableFileHeader` must follow it.
      ...buildPierreOptions(background, {
        background: theme.colors.backgroundSecondary,
        fontSize: `${theme.fontSizes[0]}px`,
        lineHeight: '1.15',
        padding: '2px 8px',
      }),
      disableFileHeader: false,
      // The library assumes a 44px header (DEFAULT_VIRTUAL_FILE_METRICS); the
      // compact chrome above is ~18px. CodeView uses this for its
      // virtualization window and sticky offset, so leaving it at 44 drifts.
      itemMetrics: { diffHeaderHeight: TRAIL_HEADER_HEIGHT },
      layout: { paddingTop: 0, paddingBottom: 0, gap: 4 },
      onPostRender,
      ...(onOpenFile ? { onLineClick } : {}),
      ...symbolHandlers,
      ...(mode === 'light' || mode === 'dark' ? { themeType: mode } : {}),
    };
  }, [background, theme.colors.backgroundSecondary, theme.fontSizes, mode, onPostRender, onOpenFile, onLineClick, symbolHandlers]);

  useEffect(() => {
    if (load.status !== 'ready' || stepIndex == null) return;
    if (stepIndex < 0 || stepIndex >= trail.steps.length) return;
    const focus = slices[stepIndex]?.focusOffset;
    if (focus == null) return;
    const id = stepItemId(trail.id, stepIndex);
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
    trail.id,
    trail.steps.length,
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
        No steps in this trail.
      </div>
    );
  }

  const CodeViewLoose = CodeView as unknown as (props: Record<string, unknown>) => ReactElement;

  return (
    <CodeViewLoose
      ref={viewRef}
      containerRef={containerRef}
      items={items}
      options={options}
      onScroll={onCodeViewScroll}
      selectedLines={selectedLines}
      renderHeaderMetadata={renderHeaderMetadata}
      renderAnnotation={renderAnnotation}
      style={{ ...PIERRE_FILE_STYLE, height: '100%', overflow: 'auto' }}
    />
  );
}
