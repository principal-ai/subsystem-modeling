/**
 * FileDrawer — bottom panel that slides up from the bottom of the graph area
 * to show file / throughline code. Opened by sidebar file-tree clicks,
 * declaration links, and throughline step focus; content is injected as
 * children by the graph component.
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { X } from 'lucide-react';

/** Bottom panel that slides up from the bottom of the graph area.
 *  Sits in normal flow (canvas shrinks while open, nothing covered)
 *  and animates via height; stays mounted so open/close animates. */
export function FileDrawer({
  title,
  onClose,
  children,
}: {
  /** Drawer chrome title; `null` closes the drawer. */
  title: string | null;
  onClose: () => void;
  children?: ReactNode;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const open = title !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      style={{
        position: 'relative',
        // Above the absolute edge-label overlay (zIndex 5), which spans the
        // whole graph-area container including this panel's slice.
        zIndex: 6,
        flexShrink: 0,
        height: open ? '45%' : 0,
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.background,
        borderTop: open ? `1px solid ${theme.colors.border}` : 'none',
        transition: 'height 200ms ease',
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
            background: 'transparent',
            color: theme.colors.text,
            cursor: 'pointer',
          }}
        >
          <X size={14} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </div>
  );
}
