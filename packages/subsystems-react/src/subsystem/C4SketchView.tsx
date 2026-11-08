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
import { C4Graph } from './C4Graph';
import { C4ContainersPanel } from './C4ContainersPanel';
import { ShareButton } from './ShareButton';
import { DescriptionOverlay } from './DescriptionOverlay';
import { DescriptionPreview } from './DescriptionPreview';
import { GraphWithSidebar } from './GraphWithSidebar';
import type { C4Component, C4Container } from './c4';
import { C4_SKETCH_DESCRIPTION_MAX } from './c4Sketch';
import type { C4Sketch } from './c4Sketch';

export interface C4SketchViewProps {
  sketch: C4Sketch;
  /** Controlled open-container ids. Omit to let the view own them. */
  openContainerIds?: readonly string[];
  onOpenContainerIdsChange?: (ids: string[]) => void;
  /** Extra controls in the header. */
  headerActions?: ReactNode;
  /** Show the standard Share button and delegate its action to the host. */
  onShare?: () => void;
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
  onShare,
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

  /** The container last activated from the sidebar — the camera target. */
  const [focus, setFocus] = useState<{ id: string } | null>(null);

  const containers = useMemo(() => {
    const components = sketch.model.nodes.filter(
      (node): node is C4Component => node.kind === 'component',
    );
    return sketch.model.nodes
      .filter((node): node is C4Container => node.kind === 'container')
      .map((container) => ({
        container,
        open: resolvedOpenIds.includes(container.id),
        members: components.filter(
          (component) =>
            (component.container ?? component.parentId) === container.id,
        ),
      }));
  }, [sketch.model.nodes, resolvedOpenIds]);

  const model = useMemo(
    () => ({ ...sketch.model, openContainerIds: resolvedOpenIds }),
    [resolvedOpenIds, sketch.model],
  );

  const toggleContainer = useCallback(
    (id: string) => {
      if (resolvedOpenIds.includes(id)) {
        setOpenIds(resolvedOpenIds.filter((openId) => openId !== id));
        setFocus((prev) => (prev?.id === id ? null : prev));
      } else {
        setOpenIds([...resolvedOpenIds, id].sort());
      }
    },
    [resolvedOpenIds, setOpenIds],
  );

  const openAll = useCallback(() => {
    setFocus(null);
    setOpenIds(
      sketch.model.nodes
        .filter((node) => node.kind === 'container')
        .map((node) => node.id)
        .sort(),
    );
  }, [setOpenIds, sketch.model.nodes]);

  const collapseAll = useCallback(() => {
    setFocus(null);
    setOpenIds([]);
  }, [setOpenIds]);

  /** Row click: toggle the container's internals and frame it (dropdown). */
  const activateContainer = useCallback(
    (id: string) => {
      if (resolvedOpenIds.includes(id)) {
        setOpenIds(resolvedOpenIds.filter((openId) => openId !== id));
        setFocus((prev) => (prev?.id === id ? null : prev));
      } else {
        setFocus({ id });
        setOpenIds([...resolvedOpenIds, id].sort());
      }
    },
    [resolvedOpenIds, setOpenIds],
  );

  /** Select-only row (no components to expand): just frame the container. */
  const selectContainer = useCallback((id: string) => setFocus({ id }), []);

  const [notesOpen, setNotesOpen] = useState(false);
  const rawDescription = sketch.description?.trim();
  // The store caps the authored description; trim defensively for other hosts.
  const description =
    rawDescription && rawDescription.length > C4_SKETCH_DESCRIPTION_MAX
      ? `${rawDescription.slice(0, C4_SKETCH_DESCRIPTION_MAX - 1)}…`
      : rawDescription;
  const notes = sketch.notes?.trim();
  // The short description owns the top-left slot; a legacy sketch with only
  // notes falls back to a clamped preview of them.
  const preview = description || notes;
  const descriptionPanel = preview ? (
    <DescriptionPreview
      content={preview}
      clamp={!description}
      open={notesOpen}
      onOpen={notes ? () => setNotesOpen(true) : undefined}
      onClose={notes ? () => setNotesOpen(false) : undefined}
      slideIdPrefix={`c4-sketch-description-${sketch.id}`}
    />
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
          {onShare && <ShareButton onClick={onShare} />}
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        <GraphWithSidebar
          defaultWidth={320}
          minWidth={240}
          maxWidth={480}
          persistKey={persistKey ?? `c4-sketch-notes-${sketch.id}`}
          header={descriptionPanel}
          sidebarBody={
            <C4ContainersPanel
              containers={containers}
              activeId={focus?.id ?? null}
              onActivate={activateContainer}
              onSelect={selectContainer}
              onOpenAll={openAll}
              onCloseAll={collapseAll}
            />
          }
        >
          {notes && notesOpen && (
            <DescriptionOverlay
              description={notes}
              title="Overview"
              ariaLabel="Sketch notes"
              slideIdPrefix={`c4-sketch-notes-overlay-${sketch.id}`}
              onClose={() => setNotesOpen(false)}
            />
          )}
          <C4Graph
            model={model}
            onToggleContainer={toggleContainer}
            containerFocus={focus}
          />
        </GraphWithSidebar>
      </div>
    </div>
  );
}
