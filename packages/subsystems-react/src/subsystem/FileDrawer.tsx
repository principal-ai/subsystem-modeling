/**
 * FileDrawer — bottom panel that slides up from the bottom of the graph area
 * to show file / walkthrough code. Opened by sidebar file-tree clicks,
 * declaration links, and walkthrough step focus; content is injected as
 * children by the graph component.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { X } from 'lucide-react';

/** Matches `transition: height …` below — callers that fitView after open
 *  should wait at least this long so the canvas has its reduced height. */
export const FILE_DRAWER_HEIGHT_MS = 200;

/** Bottom panel that slides up from the bottom of the graph area.
 *  Sits in normal flow (canvas shrinks while open, nothing covered)
 *  and animates via height; stays mounted so open/close animates.
 *  `fillHeight` expands to the full graph column (for whole-file reading). */
export function FileDrawer({
  title,
  onClose,
  fillHeight = false,
  suppressEscape = false,
  children,
}: {
  /** Drawer chrome title; `null` closes the drawer. */
  title: string | null;
  onClose: () => void;
  /** When true and open, fill the graph column instead of ~45% height. */
  fillHeight?: boolean;
  /** Skip Escape handling (e.g. while a full-file overlay is on top). */
  suppressEscape?: boolean;
  children?: ReactNode;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const open = title !== null;
  const [closeHover, setCloseHover] = useState(false);

  useEffect(() => {
    if (!open || suppressEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, suppressEscape]);

  return (
    <div
      style={{
        position: 'relative',
        // Above the absolute edge-label overlay (zIndex 5), which spans the
        // whole graph-area container including this panel's slice.
        zIndex: 6,
        flexShrink: 0,
        flex: open && fillHeight ? 1 : undefined,
        height: open ? (fillHeight ? undefined : '45%') : 0,
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.background,
        borderTop: open ? `1px solid ${theme.colors.border}` : 'none',
        transition: `height ${FILE_DRAWER_HEIGHT_MS}ms ease`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderBottom: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
        }}
      >
        <span
          title={title ?? undefined}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            color: muted,
          }}
        >
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          onMouseEnter={() => setCloseHover(true)}
          onMouseLeave={() => setCloseHover(false)}
          aria-label="Close file"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            padding: 0,
            border: 'none',
            borderRadius: 4,
            background: closeHover ? theme.colors.border : 'transparent',
            color: closeHover ? theme.colors.text : muted,
            cursor: 'pointer',
            transition: 'background 120ms ease, color 120ms ease',
          }}
        >
          <X size={14} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </div>
  );
}
