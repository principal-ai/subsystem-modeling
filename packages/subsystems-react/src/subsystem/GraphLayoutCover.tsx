/**
 * GraphLayoutCover — opaque overlay that hides a graph's startup sequence
 * (initial measurement render, layout swap, camera settle animation).
 *
 * Must sit inside a `position: relative` ancestor sized to the canvas; it
 * covers exactly that box. Renders covered from mount and fades out
 * `holdMs` after `revealed` flips true, then stays transparent until the
 * next `revealed → false` reset.
 */

import { useEffect, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';

export interface GraphLayoutCoverProps {
  /** True once the final layout is ready and the camera has settled. */
  revealed: boolean;
  /** How long to stay fully opaque after `revealed`. @default 650 */
  holdMs?: number;
  /** Label shown while covered. @default 'Laying out graph…' */
  label?: string;
}

export function GraphLayoutCover({
  revealed,
  holdMs = 650,
  label = 'Laying out graph…',
}: GraphLayoutCoverProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const [coverUp, setCoverUp] = useState(true);

  useEffect(() => {
    if (!revealed) {
      setCoverUp(true);
      return;
    }
    const t = setTimeout(() => setCoverUp(false), holdMs);
    return () => clearTimeout(t);
  }, [revealed, holdMs]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 15,
        background: theme.colors.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: coverUp ? 1 : 0,
        transition: 'opacity 200ms ease',
        pointerEvents: 'none',
      }}
    >
      {coverUp && (
        <span
          style={{
            color: muted,
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
