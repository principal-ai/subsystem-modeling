/**
 * FileDrawer — bottom or left panel in the graph area
 * showing file / trail code. Opened by sidebar file-tree clicks,
 * declaration links, and trail step focus; content is injected as
 * children by the graph component.
 */

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { Minimize2, Maximize2, X } from "lucide-react";

/** Matches the drawer's size transition; wait this long before fitting the canvas. */
export const FILE_DRAWER_HEIGHT_MS = 200;

/** An in-flow spacer reserves the panel's footprint so it never covers the
 *  canvas. Stays mounted across open/close, maximize, and docking changes. */
export function FileDrawer({
  title,
  onClose,
  placement = "bottom",
  onResizeEnd,
  fillHeight = false,
  suppressEscape = false,
  hidden = false,
  progress = null,
  subheader = null,
  children,
}: {
  /** Drawer chrome title; `null` closes the drawer. */
  title: string | null;
  onClose: () => void;
  /** Left docking requires a row container; bottom docking requires a column. */
  placement?: "bottom" | "left";
  /** Fired when the user finishes dragging the side-docked code view's width. */
  onResizeEnd?: () => void;
  /** When true and open, fill the graph area instead of ~45% of its dock axis. */
  fillHeight?: boolean;
  /** Skip Escape handling (e.g. while a full-file overlay is on top). */
  suppressEscape?: boolean;
  /** Suppress the drawer entirely — no spacer, no panel (embeds). */
  hidden?: boolean;
  /**
   * Segmented progress readout for the drawer content, e.g. trail step 2 of 5.
   * Rendered as one tick per step, filled through the current one. Omit for
   * content with no position (a single file).
   */
  progress?: { index: number; total: number } | null;
  /** Optional chrome row below the title (e.g. the trail call stack). */
  subheader?: ReactNode;
  children?: ReactNode;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const open = title !== null && !hidden;
  const showProgress = progress != null && progress.total > 1;
  const [closeHover, setCloseHover] = useState(false);
  const [maxHover, setMaxHover] = useState(false);
  // Maximize grows over the still-mounted graph along the current dock axis.
  const [maximized, setMaximized] = useState(false);
  // A closed drawer reopens at the default size, not maximized.
  useEffect(() => {
    if (!open) setMaximized(false);
  }, [open]);
  const fullSize = open && (maximized || fillHeight);
  const sideDocked = placement === "left";
  const sizeAxis = sideDocked ? "width" : "height";
  const panelRef = useRef<HTMLDivElement>(null);
  const [widthPercent, setWidthPercent] = useState(45);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef({ x: 0, width: 0, containerWidth: 0 });
  const canResize = open && sideDocked && !fullSize;
  const dockSize = sideDocked ? `${widthPercent}%` : "45%";
  // Space the panel takes out of the canvas's flow (0 when it overlays fully).
  const reservedSize = fullSize ? 0 : open ? dockSize : 0;
  const sizeTransition = resizing ? "none" : `${sizeAxis} ${FILE_DRAWER_HEIGHT_MS}ms ease`;

  const onResizeStart = (event: ReactMouseEvent) => {
    if (!canResize || event.button !== 0) return;
    const panel = panelRef.current;
    const containerWidth = panel?.parentElement?.getBoundingClientRect().width ?? 0;
    if (panel == null || containerWidth <= 0) return;
    event.preventDefault();
    dragStart.current = {
      x: event.clientX,
      width: panel.getBoundingClientRect().width,
      containerWidth,
    };
    setResizing(true);
  };

  useEffect(() => {
    if (!canResize) setResizing(false);
  }, [canResize]);

  useEffect(() => {
    if (!resizing || !canResize) return;
    const { x, width, containerWidth } = dragStart.current;
    // Keep 240px for both code and graph when space permits; split narrow
    // containers evenly rather than giving either pane a negative width.
    const minWidth = Math.min(240, containerWidth / 2);
    const maxWidth = containerWidth - minWidth;
    const onMove = (event: MouseEvent) => {
      const next = Math.min(Math.max(width + event.clientX - x, minWidth), maxWidth);
      setWidthPercent(next / containerWidth * 100);
    };
    const onUp = () => {
      setResizing(false);
      onResizeEnd?.();
    };
    const { userSelect, cursor } = document.body.style;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      document.body.style.userSelect = userSelect;
      document.body.style.cursor = cursor;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [resizing, canResize, onResizeEnd]);

  useEffect(() => {
    if (!open || suppressEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, suppressEscape]);

  return (
    <>
      {/* Reserve the same size along the parent's matching flex axis. */}
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          order: sideDocked ? -1 : undefined,
          [sizeAxis]: reservedSize,
          transition: sizeTransition,
        }}
      />
      <div
        ref={panelRef}
        style={{
          position: "absolute",
          left: 0,
          top: sideDocked ? 0 : undefined,
          right: sideDocked ? undefined : 0,
          bottom: 0,
          // Above the edge-label overlay (zIndex 5), React Flow, and overlays
          // (zIndex 6–8); 30 lifts it over the whole graph area when maximized.
          zIndex: maximized ? 30 : 6,
          width: sideDocked ? (open ? (fullSize ? "100%" : dockSize) : 0) : undefined,
          height: sideDocked ? "100%" : open ? (fullSize ? "100%" : "45%") : 0,
          minWidth: 0,
          minHeight: 0,
          boxSizing: "border-box",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: theme.colors.background,
          borderTop: open && !sideDocked ? `1px solid ${theme.colors.border}` : "none",
          borderRight: open && sideDocked ? `1px solid ${theme.colors.border}` : "none",
          transition: sizeTransition,
        }}
      >
        <div
          onDoubleClick={() => setMaximized((v) => !v)}
          style={{
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            cursor: "default",
            userSelect: "none",
          }}
        >
          {showProgress && progress != null && (
            <div
              role="img"
              aria-label={`Step ${progress.index + 1} of ${progress.total}`}
              style={{
                display: "flex",
                gap: 2,
                flexShrink: 0,
              }}
            >
              {Array.from({ length: progress.total }, (_, i) => (
                <span
                  key={i}
                  style={{
                    flex: 1,
                    height: 2,
                    borderRadius: 1,
                    background:
                      i <= progress.index
                        ? theme.colors.primary
                        : theme.colors.border,
                  }}
                />
              ))}
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              // Top runs deeper than the bottom so the title/label sits
              // optically centered inside the sticky top edge.
              padding: "10px 10px 8px",
              // The header row is the last chrome row now, so its hairline is
              // the boundary with the code below.
              borderBottom: `1px solid ${theme.colors.border}`,
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: theme.fonts.monospace,
                fontSize: theme.fontSizes[1],
                fontWeight: 600,
                color: theme.colors.text,
              }}
            >
              {title}
            </span>
            <button
              type="button"
              onClick={() => setMaximized((v) => !v)}
              onMouseEnter={() => setMaxHover(true)}
              onMouseLeave={() => setMaxHover(false)}
              aria-label={
                maximized ? "Minimize code view" : "Maximize code view"
              }
              aria-pressed={maximized}
              title={maximized ? "Minimize code view" : "Maximize code view"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                padding: 0,
                border: "none",
                borderRadius: 4,
                background: maxHover ? theme.colors.border : "transparent",
                color: maxHover ? theme.colors.text : muted,
                cursor: "pointer",
                transition: "background 120ms ease, color 120ms ease",
              }}
            >
              {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              onMouseEnter={() => setCloseHover(true)}
              onMouseLeave={() => setCloseHover(false)}
              aria-label="Close file"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                padding: 0,
                border: "none",
                borderRadius: 4,
                background: closeHover ? theme.colors.border : "transparent",
                color: closeHover ? theme.colors.text : muted,
                cursor: "pointer",
                transition: "background 120ms ease, color 120ms ease",
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
        {subheader != null && open && (
          <div style={{ flexShrink: 0, minHeight: 0 }}>{subheader}</div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {children}
        </div>
        {canResize && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize code view"
            title="Drag to resize code view"
            onMouseDown={onResizeStart}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: 5,
              cursor: "col-resize",
              background: theme.colors.border,
              zIndex: 2,
            }}
          />
        )}
      </div>
    </>
  );
}
