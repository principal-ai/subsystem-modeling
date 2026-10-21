import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useTheme } from '@principal-ade/industry-theme';

/**
 * GraphSidebar — the side panel of a graph layout, extracted from
 * SubsystemComponentGraph so the panel itself is its own component. The host
 * supplies everything it shows:
 *
 *  - `header` — the upper block (title, actions, description…). Scrollable;
 *    takes the flexible share of the column when `stretchHeader` is set so a
 *    long description can unpack without squeezing the lower panel to death.
 *  - `tabs` + `activeTab`/`onTabChange` — an optional tab strip above the
 *    lower panel. Omit for a single-panel sidebar.
 *  - `sidebarBody` — the lower panel content (the active tab's body).
 *  - `footer` — pinned beneath the scrollable body.
 *
 * The panel is pure chrome — it owns nothing graph-specific (not the selection
 * state, not the trails, not the file tree). That state stays in the graph,
 * because the canvas dims from the same facts the sidebar renders; which is
 * exactly why the chrome — and only the chrome — is what's shared.
 *
 * The right edge is the resize handle. Width is draggable, clamped to
 * `minWidth`/`maxWidth`, and persisted to localStorage under
 * `principal.subsystems.sidebarWidth.<persistKey>` when a `persistKey` is set
 * (controlled widths instead hand every change to `onWidthChange`, and persist
 * nothing).
 *
 * `onDraggingChange` reports drag state so a wrapper (see GraphWithSidebar)
 * can lock its whole row against text selection during a resize.
 */

export interface GraphSidebarTab {
  id: string;
  label: string;
}

export interface GraphSidebarProps {
  /** Upper block of the sidebar: title, actions, description — whatever the
   *  graph wants above the divider. Scrolls when the sidebar is short. */
  header?: ReactNode;
  /** Tab strip above the lower panel. When set, `sidebarBody` renders as the
   *  active tab's body. Omit for a single-panel sidebar. */
  tabs?: ReadonlyArray<GraphSidebarTab>;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Lower panel content — the active tab's body when `tabs` is set. */
  sidebarBody?: ReactNode;
  /** Pinned footer of the lower panel, beneath its scrollable body. */
  footer?: ReactNode;
  /** Hide the sidebar entirely (and the resize handle); nothing renders. */
  hidden?: boolean;
  /** Hide the lower panel so only the header shows. */
  bodyHidden?: boolean;
  /** Give the header the flexible share of the column, pinning the lower
   *  panel at half height (e.g. a description that unpacks on demand). */
  stretchHeader?: boolean;
  /** Controlled sidebar width (px). */
  width?: number;
  onWidthChange?: (width: number) => void;
  /** Uncontrolled starting width; a stored width for `persistKey` wins. */
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Fired when a drag-resize gesture ends (hosts re-fit their canvas here). */
  onResizeEnd?: () => void;
  /** localStorage key the sidebar width persists under. */
  persistKey?: string;
  /** Aria-label for the tab strip. */
  tabListLabel?: string;
  /** Reports drag state so a wrapper can lock its row against selection
   *  while the sidebar is being resized. */
  onDraggingChange?: (dragging: boolean) => void;
}

const DEFAULT_MIN_WIDTH = 240;
const DEFAULT_MAX_WIDTH = 600;
const DEFAULT_WIDTH = 320;
const SIDEBAR_WIDTH_STORAGE_PREFIX = 'principal.subsystems.sidebarWidth.';

function readStoredWidth(persistKey: string | undefined): number | null {
  if (!persistKey || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_PREFIX + persistKey);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function GraphSidebar({
  header,
  tabs,
  activeTab,
  onTabChange,
  sidebarBody,
  footer,
  hidden = false,
  bodyHidden = false,
  stretchHeader = false,
  width,
  onWidthChange,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = DEFAULT_MIN_WIDTH,
  maxWidth = DEFAULT_MAX_WIDTH,
  onResizeEnd,
  persistKey,
  tabListLabel = 'Sidebar sections',
  onDraggingChange,
}: GraphSidebarProps) {
  const { theme } = useTheme();
  const controlled = width !== undefined;
  const hasTabs = (tabs?.length ?? 0) > 0;
  const sidebarVisible = !hidden;

  // Uncontrolled width: seeded from storage when a persistKey is set, else the
  // default. A new persistKey (a different model) restarts the panel at that
  // model's stored width.
  const [intWidth, setIntWidth] = useState(() => readStoredWidth(persistKey) ?? defaultWidth);
  useEffect(() => {
    if (controlled) return;
    setIntWidth(readStoredWidth(persistKey) ?? defaultWidth);
  }, [persistKey, defaultWidth, controlled]);

  const effectiveWidth = controlled ? (width as number) : intWidth;

  // Drag-resize: capture the grab, track on the document, release on mouseup,
  // persisting only then — not on every mousemove.
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  // Mirror of the current width for the mouseup handler (a closure over the
  // drag-start render would persist the stale start width).
  const currentWidthRef = useRef(effectiveWidth);
  currentWidthRef.current = effectiveWidth;

  const onResizeStart = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      dragStartX.current = e.clientX;
      dragStartWidth.current = effectiveWidth;
      currentWidthRef.current = effectiveWidth;
      setDragging(true);
      onDraggingChange?.(true);
    },
    [effectiveWidth, onDraggingChange],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const next = Math.min(
        Math.max(dragStartWidth.current + (e.clientX - dragStartX.current), minWidth),
        maxWidth,
      );
      if (controlled) {
        onWidthChange?.(next);
      } else {
        setIntWidth(next);
      }
    };
    const onUp = () => {
      setDragging(false);
      onDraggingChange?.(false);
      if (persistKey && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            SIDEBAR_WIDTH_STORAGE_PREFIX + persistKey,
            String(currentWidthRef.current),
          );
        } catch {
          // Storage unavailable — the width just isn't remembered.
        }
      }
      onResizeEnd?.();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging, minWidth, maxWidth, controlled, onWidthChange, onResizeEnd, persistKey, onDraggingChange]);

  if (!sidebarVisible) return null;

  const clampedWidth = Math.min(Math.max(effectiveWidth, minWidth), maxWidth);

  return (
    <>
      <div
        style={{
          width: clampedWidth,
          minWidth: clampedWidth,
          borderRight: `1px solid ${theme.colors.border}`,
          background: theme.colors.backgroundSecondary ?? theme.colors.background,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          userSelect: dragging ? 'none' : undefined,
        }}
      >
        {header != null && (
          <div
            style={{
              flex: stretchHeader ? 1 : '0 0 auto',
              minHeight: 0,
              overflowY: 'auto',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {header}
          </div>
        )}
        {!bodyHidden && (hasTabs || sidebarBody != null || footer != null) && (
          <div
            style={{
              ...(stretchHeader ? { height: '50%' as const } : { flex: 1, minHeight: 0 }),
              minHeight: 160,
              flexShrink: 0,
              borderTop: header != null ? `1px solid ${theme.colors.border}` : undefined,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {hasTabs && (
              <div
                role="tablist"
                aria-label={tabListLabel}
                style={{
                  display: 'flex',
                  width: '100%',
                  flexShrink: 0,
                  borderBottom: `1px solid ${theme.colors.border}`,
                  background: theme.colors.backgroundSecondary ?? theme.colors.background,
                }}
              >
                {tabs!.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => onTabChange?.(tab.id)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '8px 8px',
                      border: 'none',
                      borderRadius: 0,
                      background: activeTab === tab.id ? theme.colors.background : 'transparent',
                      color:
                        activeTab === tab.id ? theme.colors.text : theme.colors.textSecondary,
                      fontSize: theme.fontSizes[1],
                      fontFamily: theme.fonts.monospace,
                      textTransform: 'capitalize',
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {sidebarBody}
            </div>
            {footer}
          </div>
        )}
      </div>

      <div
        onMouseDown={onResizeStart}
        aria-label="Resize sidebar"
        title="Drag to resize"
        style={{
          width: 3,
          flexShrink: 0,
          cursor: 'col-resize',
          background: theme.colors.border,
          transition: 'background 120ms ease',
          zIndex: 1,
        }}
      />
    </>
  );
}