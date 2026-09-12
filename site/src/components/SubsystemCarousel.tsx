/**
 * SubsystemCarousel — site gallery for flipping through showcase subsystem models.
 *
 * Stage shows one live graph at a time (prev/next). Lives in the site (not the
 * published react package) so chrome can iterate without an npm publish.
 */

import { useCallback, useEffect, useId, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react/dist/subsystem/SubsystemComponentGraph.js';
import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

export interface SubsystemCarouselItem {
  id: string;
  title: string;
  stack?: string;
  complexity?: 'low' | 'medium' | 'high';
  components: SubsystemComponent[];
  relations: SubsystemRelation[];
  walkthroughs?: SubsystemWalkthrough[];
}

export interface SubsystemCarouselProps {
  items: SubsystemCarouselItem[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  showGraph?: boolean;
  stageHeight?: string | number;
}

function clampIndex(i: number, len: number): number {
  if (len <= 0) return 0;
  return ((i % len) + len) % len;
}

export function SubsystemCarousel({
  items,
  selectedId: controlledId,
  onSelect,
  showGraph = true,
  stageHeight = '70vh',
}: SubsystemCarouselProps) {
  const { theme } = useTheme();
  const titleId = useId();
  const [uncontrolledId, setUncontrolledId] = useState(items[0]?.id ?? '');

  const selectedId = controlledId ?? uncontrolledId;
  const selectedIndex = Math.max(
    0,
    items.findIndex((it) => it.id === selectedId),
  );
  const selected = items[selectedIndex] ?? items[0];

  const selectAt = useCallback(
    (index: number) => {
      const next = items[clampIndex(index, items.length)];
      if (!next) return;
      if (controlledId === undefined) setUncontrolledId(next.id);
      onSelect?.(next.id);
    },
    [controlledId, items, onSelect],
  );

  useEffect(() => {
    if (controlledId !== undefined) return;
    if (!items.some((it) => it.id === uncontrolledId) && items[0]) {
      setUncontrolledId(items[0].id);
    }
  }, [controlledId, items, uncontrolledId]);

  const onStageKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectAt(selectedIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectAt(selectedIndex - 1);
    }
  };

  if (!items.length || !selected) {
    return (
      <div style={{ padding: 24, color: theme.colors.textMuted ?? theme.colors.textSecondary }}>
        No subsystem examples.
      </div>
    );
  }

  const border = theme.colors.border ?? 'rgba(127,127,127,0.3)';

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      tabIndex={0}
      onKeyDown={onStageKeyDown}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
        position: 'relative',
        background: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.fonts.body,
        outline: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 16px',
          borderBottom: `1px solid ${border}`,
        }}
      >
        <button
          type="button"
          aria-label="Previous example"
          onClick={() => selectAt(selectedIndex - 1)}
          style={navBtnStyle(theme)}
        >
          <ChevronIcon dir="left" />
        </button>

        <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
          <div id={titleId} style={{ fontWeight: 600, fontSize: 22 }}>
            {selected.title}
          </div>
        </div>

        <button
          type="button"
          aria-label="Next example"
          onClick={() => selectAt(selectedIndex + 1)}
          style={navBtnStyle(theme)}
        >
          <ChevronIcon dir="right" />
        </button>
      </div>

      {showGraph && (
        <div style={{ flex: 1, minHeight: stageHeight, position: 'relative' }}>
          <SubsystemComponentGraph
            key={selected.id}
            components={selected.components}
            relations={selected.relations}
            walkthroughs={selected.walkthroughs}
            title={selected.title}
            hideSidebar
            showEdgeLabels
            autoPlayWalkthroughs
            walkthroughAutoPlayIntervalMs={3200}
            walkthroughStepMode="dim"
            zoomOnWalkthroughFocus={false}
            showWalkthroughTitle
          />
        </div>
      )}
    </div>
  );
}

function navBtnStyle(theme: {
  colors: Record<string, string | undefined>;
}): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 8,
    border: `1px solid ${theme.colors.border ?? 'rgba(127,127,127,0.3)'}`,
    background: theme.colors.surface ?? 'transparent',
    color: theme.colors.text,
    cursor: 'pointer',
  };
}

function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
