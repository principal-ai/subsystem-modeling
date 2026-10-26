/**
 * C4SketchView — a standalone authored C4 hypothesis.
 *
 * Pure presentation: the host loads the sketch and passes it in. There is no
 * model comparison, grounding, or promotion here; a sketch is a diagram in its
 * own right.
 */

import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { PencilRuler } from 'lucide-react';
import { IndustryMarkdownSlide } from 'themed-markdown';
import { C4Graph } from './C4Graph';
import { GraphWithSidebar } from './GraphWithSidebar';
import type { C4Sketch } from './c4Sketch';

export interface C4SketchViewProps {
  sketch: C4Sketch;
  /** Controlled open-container ids. Omit to let the view own them. */
  openContainerIds?: readonly string[];
  onOpenContainerIdsChange?: (ids: string[]) => void;
  /** Extra controls in the header. */
  headerActions?: ReactNode;
  /** Sidebar width persistence key. */
  persistKey?: string;
  /** Outer style for the flex fill. */
  style?: CSSProperties;
}

export function C4SketchView({
  sketch,
  openContainerIds,
  onOpenContainerIdsChange,
  headerActions,
  persistKey,
  style,
}: C4SketchViewProps) {
  const { theme } = useTheme();
  const [internalOpenIds, setInternalOpenIds] = useState<string[]>(() =>
    [...(openContainerIds ?? sketch.model.openContainerIds ?? [])].sort(),
  );
  const resolvedOpenIds = openContainerIds
    ? [...openContainerIds]
    : internalOpenIds;
  const setOpenIds = useCallback(
    (next: string[]) => {
      if (!openContainerIds) setInternalOpenIds(next);
      onOpenContainerIdsChange?.(next);
    },
    [onOpenContainerIdsChange, openContainerIds],
  );

  const model = useMemo(
    () => ({ ...sketch.model, openContainerIds: resolvedOpenIds }),
    [resolvedOpenIds, sketch.model],
  );

  const toggleContainer = useCallback(
    (id: string) => {
      setOpenIds(
        resolvedOpenIds.includes(id)
          ? resolvedOpenIds.filter((openId) => openId !== id)
          : [...resolvedOpenIds, id].sort(),
      );
    },
    [resolvedOpenIds, setOpenIds],
  );

  const openAll = useCallback(() => {
    setOpenIds(
      sketch.model.nodes
        .filter((node) => node.kind === 'container')
        .map((node) => node.id)
        .sort(),
    );
  }, [setOpenIds, sketch.model.nodes]);

  const collapseAll = useCallback(() => setOpenIds([]), [setOpenIds]);

  const notes = sketch.notes?.trim();
  const notesPanel = notes ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontFamily: theme.fonts.monospace,
          letterSpacing: 0.4,
          color: theme.colors.textSecondary,
        }}
      >
        ABOUT
      </div>
      <IndustryMarkdownSlide
        content={notes}
        slideIdPrefix={`c4-sketch-notes-${sketch.id}`}
        slideIndex={0}
        isVisible={true}
        theme={theme}
        disableScroll={true}
        disableBasePadding
        enableKeyboardScrolling={false}
        autoFocusOnVisible={false}
      />
    </div>
  ) : null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.background,
        ...style,
      }}
    >
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '12px 16px',
          background: theme.colors.background,
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <div
          style={{
            minWidth: 240,
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <h2
            style={{
              margin: 0,
              minWidth: 0,
              fontSize: theme.fontSizes[2],
              fontWeight: 600,
              color: theme.colors.text,
              fontFamily: theme.fonts.monospace,
              overflowWrap: 'anywhere',
            }}
          >
            {sketch.title}
          </h2>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '1px 7px',
              borderRadius: 4,
              border: '1px solid #e3b341',
              color: '#e3b341',
              fontFamily: theme.fonts.monospace,
              fontSize: 10,
              letterSpacing: 0.4,
              flexShrink: 0,
            }}
          >
            <PencilRuler size={10} aria-hidden="true" />
            SKETCH
          </span>
        </div>
        <div
          style={{
            marginLeft: 'auto',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {headerActions}
          <button
            type="button"
            onClick={openAll}
            style={smallButton(theme, { width: 132 })}
          >
            Open all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            style={smallButton(theme, { width: 132 })}
          >
            Collapse all
          </button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        <GraphWithSidebar
          hidden={!notes}
          stretchHeader
          defaultWidth={320}
          minWidth={240}
          maxWidth={480}
          persistKey={persistKey ?? `c4-sketch-notes-${sketch.id}`}
          header={notesPanel}
        >
          <C4Graph model={model} onToggleContainer={toggleContainer} />
        </GraphWithSidebar>
      </div>
    </div>
  );
}

function smallButton(
  theme: ReturnType<typeof useTheme>['theme'],
  opts: { width?: number } = {},
) {
  return {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    ...(opts.width ? { width: opts.width } : {}),
    height: 34,
    padding: '0 10px',
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
    borderRadius: 6,
    border: `1px solid ${theme.colors.border}`,
    background: 'transparent',
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSizes[1],
    cursor: 'pointer',
  } as const;
}
