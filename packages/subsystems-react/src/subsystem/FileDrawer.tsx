/**
 * FileDrawer — bottom panel that slides up from the bottom of the graph area
 * to show file / walkthrough code. Opened by sidebar file-tree clicks,
 * declaration links, and walkthrough step focus; content is injected as
 * children by the graph component.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { Minimize2, Maximize2, X } from "lucide-react";

/** Matches `transition: height …` below — callers that fitView after open
 *  should wait at least this long so the canvas has its reduced height. */
export const FILE_DRAWER_HEIGHT_MS = 200;

/** Bottom panel that slides up from the bottom of the graph area.
 *  Bottom-anchored with an animated height; an in-flow spacer reserves its
 *  footprint so the canvas shrinks while open (nothing covered). Stays mounted
 *  so open/close/maximize animate. The header's maximize button (or a
 *  double-click) grows it over the whole graph column for whole-file reading. */
export function FileDrawer({
  title,
  onClose,
  fillHeight = false,
  suppressEscape = false,
  hidden = false,
  children,
}: {
  /** Drawer chrome title; `null` closes the drawer. */
  title: string | null;
  onClose: () => void;
  /** When true and open, fill the graph column instead of ~45% height. */
  fillHeight?: boolean;
  /** Skip Escape handling (e.g. while a full-file overlay is on top). */
  suppressEscape?: boolean;
  /** Suppress the drawer entirely — no spacer, no panel (embeds). */
  hidden?: boolean;
  children?: ReactNode;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const open = title !== null && !hidden;
  const [closeHover, setCloseHover] = useState(false);
  const [maxHover, setMaxHover] = useState(false);
  // Full-height mode: the maximize button or double-clicking the header.
  // The panel is always bottom-anchored with an animated height, and a spacer
  // in normal flow reserves its footprint, so maximizing grows it upward over
  // the still-mounted graph instead of snapping to full.
  const [maximized, setMaximized] = useState(false);
  // A closed drawer reopens at the default height, not maximized.
  useEffect(() => {
    if (!open) setMaximized(false);
  }, [open]);
  const fullHeight = open && (maximized || fillHeight);
  // Space the panel takes out of the canvas's flow (0 when it overlays fully).
  const reservedHeight = fullHeight ? 0 : open ? "45%" : 0;

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
      {/* Reserves the drawer's footprint in the column so the canvas shrinks
          while the drawer is open. Animates with the panel, so the boundary
          between graph and code slides smoothly. */}
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          height: reservedHeight,
          transition: `height ${FILE_DRAWER_HEIGHT_MS}ms ease`,
        }}
      />
      {/* The panel — bottom-anchored and grown via `height`, so maximize/fill
          reads as dragging up over the diagram. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          // Above the edge-label overlay (zIndex 5), React Flow, and overlays
          // (zIndex 6–8); 30 lifts it over the whole graph area when maximized.
          zIndex: maximized ? 30 : 6,
          height: open ? (fullHeight ? "100%" : "45%") : 0,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: theme.colors.background,
          borderTop: open ? `1px solid ${theme.colors.border}` : "none",
          transition: `height ${FILE_DRAWER_HEIGHT_MS}ms ease`,
        }}
      >
        <div
          onDoubleClick={() => setMaximized((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderBottom: `1px solid ${theme.colors.border}`,
            flexShrink: 0,
            cursor: "default",
            userSelect: "none",
          }}
        >
          <span
            title={title ?? undefined}
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: theme.fonts.monospace,
              fontSize: theme.fontSizes[0],
              color: muted,
            }}
          >
            {title}
          </span>
          <button
            type="button"
            onClick={() => setMaximized((v) => !v)}
            onMouseEnter={() => setMaxHover(true)}
            onMouseLeave={() => setMaxHover(false)}
            aria-label={maximized ? "Minimize code view" : "Maximize code view"}
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
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {children}
        </div>
      </div>
    </>
  );
}
