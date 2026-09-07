/**
 * SubsystemFileTree — sidebar file tree for a subsystem's components, built
 * on @pierre/trees following the panel repo's SessionFileTreePanel pattern:
 * init-once options + latest-value refs, and a suppress flag around
 * programmatic selection so `onSelectionChange` echoes don't re-open files.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { FileTree, useFileTree } from '@pierre/trees/react';
import { useTheme } from '@principal-ade/industry-theme';

export interface SubsystemFileTreeProps {
  /** Repo-root-relative file paths; duplicates are deduped. */
  files: string[];
  /** File to select/highlight (the drawer-open file). */
  selectedFile?: string | null;
  /** File to transiently highlight while its node is hovered on the graph;
   *  falls back to `selectedFile` when null. */
  hoveredFile?: string | null;
  /** Called when a file row is clicked; upstream toggles the drawer. */
  onSelectFile?: (file: string) => void;
  /** Hide the built-in "Files N" header row — used when an upstream repo
   *  header already labels the tree. */
  headerless?: boolean;
}

/** Fills its parent height by design — pin it with a sized flex container. */
export function SubsystemFileTree({ files, selectedFile, hoveredFile, onSelectFile, headerless }: SubsystemFileTreeProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const paths = useMemo(() => Array.from(new Set(files)).sort(), [files]);

  // Latest-value refs so the stable `onSelectionChange` closure never goes
  // stale — `useFileTree` reads its options once on init.
  const pathSet = useMemo(() => new Set(paths), [paths]);
  const pathSetRef = useRef(pathSet);
  pathSetRef.current = pathSet;
  const onSelectFileRef = useRef(onSelectFile);
  onSelectFileRef.current = onSelectFile;
  const selectedFileRef = useRef<string | null>(selectedFile ?? null);
  selectedFileRef.current = selectedFile ?? null;
  // Suppresses onSelectFile while selection is driven programmatically from
  // the drawer state (`selectedFile`) — no synthetic open/close events.
  const suppressSelectRef = useRef(false);
  const initialPaths = useRef(paths);

  const { model } = useFileTree({
    paths: initialPaths.current,
    initialExpansion: 'open',
    onSelectionChange: (selected) => {
      if (suppressSelectRef.current) return;
      const raw = selected[selected.length - 1] ?? selected[0];
      if (!raw) return;
      // Directory rows carry a trailing slash; only emit for real files.
      const path = raw.endsWith('/') ? raw.slice(0, -1) : raw;
      if (!pathSetRef.current.has(path)) return;
      // Includes re-clicks on the open row — upstream toggles it closed.
      onSelectFileRef.current?.(path);
    },
  });

  // Reconcile the tree's native selection with the OPEN file only. Hover is
  // deliberately NOT folded into selection — pierre's model is single-select,
  // so routing hover through select()/deselect() would steal the highlight
  // from the open file. The hovered row gets its own transient marker instead.
  const lastSyncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastSyncedRef.current === (selectedFile ?? null)) return;
    const prev = lastSyncedRef.current;
    lastSyncedRef.current = selectedFile ?? null;
    suppressSelectRef.current = true;
    try {
      if (prev) model.getItem(prev)?.deselect();
      if (selectedFile) {
        model.getItem(selectedFile)?.select();
        model.scrollToPath(selectedFile);
      }
    } finally {
      suppressSelectRef.current = false;
    }
  }, [model, selectedFile]);

  // Transient hover highlight (e.g. hovering a graph node spotlights its
  // file), independent of selection. Pierre renders rows inside a shadow
  // root, so we resolve the row through shadow boundaries and paint an
  // inline background — document-level <style> tags cannot reach it.
  const treeRef = useRef<HTMLDivElement | null>(null);
  const hoveredRowRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    hoveredRowRef.current?.style.removeProperty('background');
    hoveredRowRef.current = null;
    const target = hoveredFile ?? null;
    if (!target || !pathSetRef.current.has(target)) return;

    // Depth-first walk across shadow roots — handles nested custom elements.
    const roots: Array<Document | ShadowRoot> = [document];
    while (roots.length > 0) {
      const root = roots.shift()!;
      const row = root.querySelector(`[data-item-path="${CSS.escape(target)}"]`);
      if (row instanceof HTMLElement) {
        row.style.background = 'var(--trees-theme-list-hover-bg, rgba(128, 128, 128, 0.25))';
        hoveredRowRef.current = row;
        return;
      }
      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (el.shadowRoot) roots.push(el.shadowRoot);
      }
    }
  }, [hoveredFile]);

  // Re-scope the tree in place when the subsystem's file set changes.
  useEffect(() => {
    model.resetPaths(paths);
  }, [model, paths]);

  // Pierre emits no selection change when the clicked row is already
  // selected — detect re-clicks on the open file's row via focus and let
  // upstream toggle the drawer closed.
  const handleContainerClick = () => {
    const focused = model.getFocusedPath();
    if (!focused) return;
    const path = focused.endsWith('/') ? focused.slice(0, -1) : focused;
    if (path !== selectedFileRef.current) return;
    suppressSelectRef.current = true;
    try {
      onSelectFileRef.current?.(path);
    } finally {
      suppressSelectRef.current = false;
    }
  };

  return (
    <div
      ref={treeRef}
      onClickCapture={handleContainerClick}
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {!headerless && (
        <div
          style={{
            padding: '10px 16px 4px',
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: theme.fontSizes[0] * 0.8,
              fontFamily: theme.fonts.monospace,
              textTransform: 'uppercase',
              color: muted,
              fontWeight: 600,
            }}
          >
            Files
          </span>
          <span style={{ fontSize: theme.fontSizes[0] * 0.8, fontFamily: theme.fonts.monospace, color: muted }}>
            {paths.length}
          </span>
        </div>
      )}
      <FileTree
        model={model}
        style={
          {
            flex: 1,
            minHeight: 0,
            '--trees-padding-inline-override': '8px',
            '--trees-bg-override': 'transparent',
            '--trees-fg-override': theme.colors.text,
            '--trees-fg-muted-override': muted,
            '--trees-accent-override': theme.colors.primary,
            '--trees-font-family-override': theme.fonts.monospace,
            '--trees-font-size-override': `${theme.fontSizes[0]}px`,
            '--trees-theme-list-hover-bg': theme.colors.border,
            '--trees-theme-list-active-selection-bg': theme.colors.border,
          } as CSSProperties
        }
      />
    </div>
  );
}
