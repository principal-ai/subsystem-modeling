/**
 * WalkthroughsPanel — the sidebar's flows panel: the ordered list of a
 * subsystem's walkthroughs, each rendered as a collapsible `WalkthroughFlow`
 * row. Extracted from `SubsystemComponentGraph`'s `Inner` so the panel (and the
 * drag-to-reorder controller it hosts) is a component boundary of its own.
 *
 * Ordering is authored order: the list renders `walkthroughs` in array order.
 * When `onReorder` is supplied, each row grows a grip in its header and dropping
 * a row onto another emits the reordered array (see `reorderWalkthroughs`); the
 * host owns persistence.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Check, ChevronDown, Copy, GripVertical, Pause, Play } from 'lucide-react';
import {
  PROPOSED_COLOR,
  reorderTargetIndex,
  reorderWalkthroughs,
  walkthroughStepGraphEdgeId,
  type SubsystemWalkthrough,
} from './model';
import { buildStepBrief } from './walkthroughBrief';

/** Pause (ms) between steps when a walkthrough autoplays. */
export const WALKTHROUGH_PLAY_PAUSE_MS = 2500;

/** How long a step's copy button flashes its "copied" checkmark (ms). */
export const STEP_COPY_FEEDBACK_MS = 2000;

/** Square size (px) of a walkthrough header's Play/Collapse control. */
const WALKTHROUGH_CONTROL_SIZE = 34;

/** Drag state handed to a row's grip while a reorder is in flight. */
interface WalkthroughReorderHandle {
  index: number;
  isDragging: boolean;
  onDragStart: (index: number, e: ReactDragEvent) => void;
  onDragEnd: () => void;
}

/** One collapsible walkthrough in the sidebar's flows panel. Clicking the
 *  title: closed → open + select; open with a step selected → select the whole
 *  flow (deselect the step, stay open); open with the whole flow selected →
 *  close + clear focus. The right-aligned close button collapses without
 *  selecting. A step row focuses that step's edge. */
function WalkthroughFlow({
  walkthrough,
  collapsed,
  active,
  onToggleCollapsed,
  onFocusFlow,
  onClearFocus,
  onFocusStep,
  onHoverStep,
  onHoverFlow,
  onLeaveStep,
  reorder,
  dragActive,
  isHoverSuppressed,
  proposedAliases,
}: {
  walkthrough: SubsystemWalkthrough;
  collapsed: boolean;
  /** `{ stepIndex: null }` = whole flow focused; `{ stepIndex }` = one step. */
  active: { stepIndex: number | null } | null;
  onToggleCollapsed: (tlId: string) => void;
  onFocusFlow: (tl: SubsystemWalkthrough) => void;
  onClearFocus: () => void;
  onFocusStep: (tl: SubsystemWalkthrough, stepIndex: number) => void;
  onHoverStep: (tl: SubsystemWalkthrough, stepIndex: number) => void;
  /** Preview the whole flow on the canvas (used while the row is collapsed). */
  onHoverFlow: (tl: SubsystemWalkthrough) => void;
  onLeaveStep: () => void;
  /** When set, renders a grip in the header that starts a reorder drag. */
  reorder?: WalkthroughReorderHandle;
  /** True while any row is mid-drag; used to reset stale hover styling. */
  dragActive?: boolean;
  /** True just after a drop; ignores the browser's synthetic hover until the pointer moves. */
  isHoverSuppressed?: () => boolean;
  /**
   * Aliases of components marked `proposed`. A row whose steps touch one gets
   * its title tinted, and each such step (index and title) is tinted too
   * (darkgoldenrod, same as the proposed node treatment).
   */
  proposedAliases?: ReadonlySet<string>;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const hoverBg = theme.colors.background;
  const wholeFlowActive = active !== null && active.stepIndex === null;
  // A step is "proposed" when either endpoint is a proposed component.
  const stepProposed = (from: string, to: string) =>
    proposedAliases != null && (proposedAliases.has(from) || proposedAliases.has(to));
  const touchesProposed = walkthrough.steps.some((s) => stepProposed(s.from, s.to));
  const [headerHover, setHeaderHover] = useState(false);
  const [collapseHover, setCollapseHover] = useState(false);
  const [playHover, setPlayHover] = useState(false);
  const [gripHover, setGripHover] = useState(false);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const stepButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Per-step copy affordance: revealed while a row is hovered or holds focus.
  // `focusedStep` tracks focus-within (button or its copy control) so the icon
  // stays put while the pointer or focus moves between them.
  const [focusedStep, setFocusedStep] = useState<number | null>(null);
  const [copyHoverStep, setCopyHoverStep] = useState<number | null>(null);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  // Autoplay: stepping through the flow's steps with a pause between each.
  const [playing, setPlaying] = useState(false);
  const playTimerRef = useRef<number | null>(null);

  const stopPlaying = useCallback(() => {
    if (playTimerRef.current != null) {
      window.clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
    setPlaying(false);
  }, []);

  // Clear any pending timer on unmount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stopPlaying(), []);

  const copyStep = useCallback(
    (stepIndex: number) => {
      const brief = buildStepBrief(walkthrough, stepIndex);
      if (brief.length === 0) return;
      const clipboard = navigator.clipboard;
      if (!clipboard) return;
      void clipboard
        .writeText(brief)
        .then(() => {
          setCopiedStep(stepIndex);
          if (copyTimerRef.current != null) {
            window.clearTimeout(copyTimerRef.current);
          }
          copyTimerRef.current = window.setTimeout(
            () => setCopiedStep(null),
            STEP_COPY_FEEDBACK_MS,
          );
        })
        .catch(() => {
          // best-effort — show nothing when the clipboard is unavailable
        });
    },
    [walkthrough],
  );

  useEffect(
    () => () => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  // Native HTML5 drag suppresses mouse events, so a row hovered when the drag
  // began never gets its mouseleave — its hover styling would stick after the
  // drop. Reset every row's hover whenever a drag starts or ends.
  useEffect(() => {
    setHeaderHover(false);
    setCollapseHover(false);
    setPlayHover(false);
    setGripHover(false);
    setHoveredStep(null);
  }, [dragActive]);

  const startPlaying = useCallback(() => {
    if (collapsed) onToggleCollapsed(walkthrough.id);
    if (active === null || active.stepIndex !== null) onFocusFlow(walkthrough);
    const stepCount = walkthrough.steps.length;
    if (stepCount === 0) return;
    setPlaying(true);
    let i = 0;
    const tick = () => {
      if (i >= stepCount) {
        playTimerRef.current = null;
        setPlaying(false);
        return;
      }
      onFocusStep(walkthrough, i);
      i += 1;
      playTimerRef.current = window.setTimeout(tick, WALKTHROUGH_PLAY_PAUSE_MS);
    };
    tick();
  }, [collapsed, active, onToggleCollapsed, onFocusFlow, walkthrough, onFocusStep]);

  const togglePlay = useCallback(() => {
    if (playing) {
      stopPlaying();
    } else {
      startPlaying();
    }
  }, [playing, stopPlaying, startPlaying]);

  // Keep DOM focus on the active step so the browser focus ring (and
  // subsequent arrow keys) follow arrow navigation, not the originally
  // clicked button.
  useEffect(() => {
    if (active?.stepIndex == null) return;
    stepButtonRefs.current[active.stepIndex]?.focus({ preventScroll: true });
  }, [active?.stepIndex]);

  return (
    <div>
      <div
        onMouseEnter={() => {
          if (isHoverSuppressed?.()) return;
          setHeaderHover(true);
          if (collapsed) onHoverFlow(walkthrough);
        }}
        onMouseLeave={() => {
          setHeaderHover(false);
          if (collapsed) onLeaveStep();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: WALKTHROUGH_CONTROL_SIZE,
          padding: '0 0 0 16px',
          background: wholeFlowActive || headerHover ? hoverBg : 'transparent',
          transition: 'background 120ms ease',
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (collapsed) {
              onToggleCollapsed(walkthrough.id);
              onFocusFlow(walkthrough);
            } else if (active !== null && active.stepIndex === null) {
              // Whole flow already selected → collapse + clear.
              onToggleCollapsed(walkthrough.id);
              onClearFocus();
            } else {
              // Expanded with nothing (or a step) selected → select the whole
              // flow, which deselects any focused step without collapsing.
              onFocusFlow(walkthrough);
            }
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            minWidth: 0,
            padding: 0,
            border: 'none',
            background: 'transparent',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: theme.fontSizes[1],
              fontFamily: theme.fonts.monospace,
              fontWeight: 600,
              color: touchesProposed ? PROPOSED_COLOR : theme.colors.text,
            }}
          >
            {walkthrough.title}
          </span>
        </button>
        {!collapsed && (
          <>
          <button
            type="button"
            aria-label={playing ? `Pause ${walkthrough.title} autoplay` : `Play ${walkthrough.title}`}
            title={playing ? 'Pause' : 'Play through steps'}
            onMouseEnter={() => setPlayHover(true)}
            onMouseLeave={() => setPlayHover(false)}
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              alignSelf: 'stretch',
              width: WALKTHROUGH_CONTROL_SIZE,
              padding: 0,
              border: 'none',
              borderRadius: 0,
              background: playing || playHover ? theme.colors.border : 'transparent',
              color: playing || playHover ? theme.colors.text : muted,
              cursor: 'pointer',
              transition: 'background 120ms ease, color 120ms ease',
            }}
          >
            {playing ? <Pause size={12} strokeWidth={2} /> : <Play size={12} strokeWidth={2} />}
          </button>
          <button
            type="button"
            aria-label={`Collapse ${walkthrough.title}`}
            title="Collapse"
            onMouseEnter={() => setCollapseHover(true)}
            onMouseLeave={() => setCollapseHover(false)}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapsed(walkthrough.id);
              if (active !== null) onClearFocus();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              alignSelf: 'stretch',
              width: WALKTHROUGH_CONTROL_SIZE,
              padding: 0,
              border: 'none',
              borderRadius: 0,
              background: collapseHover ? theme.colors.border : 'transparent',
              color: collapseHover ? theme.colors.text : muted,
              cursor: 'pointer',
              transition: 'background 120ms ease, color 120ms ease',
            }}
          >
            <ChevronDown size={14} strokeWidth={2} />
          </button>
          </>
        )}
        {reorder && (
          <span
            role="button"
            tabIndex={-1}
            draggable
            aria-label={`Reorder ${walkthrough.title}`}
            title="Drag to reorder"
            onMouseEnter={() => {
              if (!isHoverSuppressed?.()) setGripHover(true);
            }}
            onMouseLeave={() => setGripHover(false)}
            onDragStart={(e) => reorder.onDragStart(reorder.index, e)}
            onDragEnd={reorder.onDragEnd}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              flexShrink: 0,
              marginRight: 8,
              padding: '2px 0',
              color: gripHover || reorder.isDragging ? theme.colors.text : muted,
              cursor: reorder.isDragging ? 'grabbing' : 'grab',
              transition: 'color 120ms ease',
            }}
          >
            <GripVertical size={14} strokeWidth={2} />
          </span>
        )}
      </div>
      {!collapsed && (
        <div
          style={{ display: 'flex', flexDirection: 'column' }}
          onMouseLeave={() => {
            setHoveredStep(null);
            onLeaveStep();
          }}
        >
          {walkthrough.steps.map((step, i) => {
            const stepActive = active !== null && active.stepIndex === i;
            const proposed = stepProposed(step.from, step.to);
            const revealed =
              stepActive || hoveredStep === i || focusedStep === i || copiedStep === i;
            const copied = copiedStep === i;
            const copyHovered = copyHoverStep === i;
            return (
              <div
                key={`${walkthroughStepGraphEdgeId(step)}-${i}`}
                style={{ position: 'relative' }}
                onFocus={() => setFocusedStep(i)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setFocusedStep((cur) => (cur === i ? null : cur));
                  }
                }}
              >
                <button
                  ref={(el) => {
                    stepButtonRefs.current[i] = el;
                  }}
                  type="button"
                  title={proposed ? 'Step touches a proposed component' : undefined}
                  onMouseEnter={() => {
                    setHoveredStep(i);
                    onHoverStep(walkthrough, i);
                  }}
                  onClick={() => onFocusStep(walkthrough, i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 0,
                    width: '100%',
                    padding: '8px 36px 8px 17px',
                    textAlign: 'left',
                    borderRadius: 0,
                    border: 'none',
                    outline: 'none',
                    background: stepActive || hoveredStep === i ? hoverBg : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 120ms ease',
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 14,
                      fontSize: theme.fontSizes[0],
                      fontFamily: theme.fonts.monospace,
                      fontWeight: proposed ? 700 : undefined,
                      color: proposed
                        ? PROPOSED_COLOR
                        : stepActive
                          ? theme.colors.text
                          : muted,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: theme.fontSizes[1],
                      fontFamily: theme.fonts.monospace,
                      color: proposed ? PROPOSED_COLOR : theme.colors.text,
                    }}
                  >
                    {step.symbol}
                  </span>
                </button>
                {revealed && (
                  <button
                    type="button"
                    aria-label={`Copy step ${i + 1} of ${walkthrough.title} for an agent`}
                    title={copied ? 'Copied' : 'Copy this step for an agent'}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setCopyHoverStep(i)}
                    onMouseLeave={() =>
                      setCopyHoverStep((cur) => (cur === i ? null : cur))
                    }
                    onClick={() => copyStep(i)}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 'auto',
                      aspectRatio: '1 / 1',
                      padding: 0,
                      border: 'none',
                      borderRadius: 0,
                      background: copied
                        ? 'rgba(16,185,129,0.12)'
                        : copyHovered
                          ? theme.colors.border
                          : 'transparent',
                      color: copied ? '#10b981' : copyHovered ? theme.colors.text : muted,
                      cursor: 'pointer',
                      transition: 'background 120ms ease, color 120ms ease',
                    }}
                  >
                    {copied ? (
                      <Check size={12} strokeWidth={2} />
                    ) : (
                      <Copy size={12} strokeWidth={2} />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface WalkthroughsPanelProps {
  /** Ordered walkthroughs — the list renders them in array order. */
  walkthroughs: SubsystemWalkthrough[];
  /** Ids of the rows whose step lists are expanded. */
  expandedWalkthroughs: Set<string>;
  focusedWalkthroughId: string | null;
  focusedStepIndex: number | null;
  hoveredWalkthroughStep: {
    walkthroughId: string;
    stepIndex: number | null;
  } | null;
  onToggleCollapsed: (tlId: string) => void;
  onFocusFlow: (tl: SubsystemWalkthrough) => void;
  onClearFocus: () => void;
  onFocusStep: (tl: SubsystemWalkthrough, stepIndex: number) => void;
  onHoverStep: (tl: SubsystemWalkthrough, stepIndex: number) => void;
  onHoverFlow: (tl: SubsystemWalkthrough) => void;
  onLeaveStep: () => void;
  /**
   * When set, rows grow a drag grip (and become drop targets) so a drop emits
   * the reordered array. Grips show only while every row is collapsed. Omit
   * for a read-only panel.
   */
  onReorder?: (next: SubsystemWalkthrough[]) => void;
  /**
   * Aliases of components marked `proposed`. A row whose steps touch one gets
   * its title tinted, and each such step (index and title) is tinted too
   * (darkgoldenrod, same as the proposed node treatment).
   */
  proposedAliases?: ReadonlySet<string>;
}

/**
 * The flows panel: a scroll container of `WalkthroughFlow` rows, optionally
 * drag-reorderable. The host owns the array; a drop calls `onReorder` with the
 * next order and the host re-renders with it.
 */
export function WalkthroughsPanel({
  walkthroughs,
  expandedWalkthroughs,
  focusedWalkthroughId,
  focusedStepIndex,
  hoveredWalkthroughStep,
  onToggleCollapsed,
  onFocusFlow,
  onClearFocus,
  onFocusStep,
  onHoverStep,
  onHoverFlow,
  onLeaveStep,
  onReorder,
  proposedAliases,
}: WalkthroughsPanelProps) {
  const { theme } = useTheme();
  // Reordering is offered only while every row is collapsed: the compact list
  // is what you drag, and expanded step lists would make drop targets tall and
  // the landing boundary ambiguous.
  const allCollapsed = walkthroughs.every((w) => !expandedWalkthroughs.has(w.id));
  const reorderable = onReorder != null && allCollapsed;
  // Row being dragged, and the gap the pointer is over (boundaries 0..n
  // between rows). The boundary is where the dragged row will be inserted.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropBoundary, setDropBoundary] = useState<number | null>(null);
  // After a native drag ends the browser fires a mouseenter on whatever sits
  // under the cursor, which would light up a row the user never moved onto.
  // Ignore hover until the pointer actually moves. A ref (not state) so the
  // guard is synchronous — the synthetic event can beat a re-render.
  const suppressHoverRef = useRef(false);
  const hoverClearRef = useRef<(() => void) | null>(null);

  const suppressHoverUntilMove = useCallback(() => {
    suppressHoverRef.current = true;
    if (hoverClearRef.current) return;
    const clear = () => {
      suppressHoverRef.current = false;
      window.removeEventListener('mousemove', clear);
      hoverClearRef.current = null;
    };
    hoverClearRef.current = clear;
    window.addEventListener('mousemove', clear);
  }, []);

  useEffect(
    () => () => {
      if (hoverClearRef.current) {
        window.removeEventListener('mousemove', hoverClearRef.current);
        hoverClearRef.current = null;
      }
    },
    [],
  );

  const resetDrag = useCallback(() => {
    setDragIndex(null);
    setDropBoundary(null);
    suppressHoverUntilMove();
  }, [suppressHoverUntilMove]);

  const handleDragStart = useCallback((index: number, e: ReactDragEvent) => {
    suppressHoverRef.current = false;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires data to be set for a drag to begin.
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  // Pick the boundary nearest the pointer: above the row when over its top
  // half, below it when over the bottom half. The line marks that gap, and the
  // drop inserts there — so the indicator always matches the result.
  const handleDragOver = useCallback(
    (e: ReactDragEvent, index: number) => {
      if (dragIndex == null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const below = e.clientY - rect.top > rect.height / 2;
      setDropBoundary(index + (below ? 1 : 0));
    },
    [dragIndex],
  );

  const handleDrop = useCallback(
    (e: ReactDragEvent) => {
      e.preventDefault();
      const boundary = dropBoundary;
      const from = dragIndex ?? Number(e.dataTransfer.getData('text/plain'));
      resetDrag();
      if (!onReorder || boundary == null || !Number.isInteger(from)) return;
      // Removing the dragged row shifts every boundary after it down one.
      const target = reorderTargetIndex(boundary, from);
      if (target === from) return;
      onReorder(reorderWalkthroughs(walkthroughs, from, target));
    },
    [dragIndex, dropBoundary, onReorder, resetDrag, walkthroughs],
  );

  const accent = theme.colors.accent ?? theme.colors.primary ?? theme.colors.text;
  const isHoverSuppressed = useCallback(() => suppressHoverRef.current, []);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '0 0 12px',
      }}
      onDragEnd={reorderable ? resetDrag : undefined}
    >
      {walkthroughs.map((tl, i) => {
        const isDragging = dragIndex === i;
        // One indicator per boundary: a row's top edge for boundaries above it,
        // the last row's bottom edge for the boundary at the very end.
        const showTop = reorderable && dropBoundary === i;
        const showBottom =
          reorderable &&
          i === walkthroughs.length - 1 &&
          dropBoundary === walkthroughs.length;
        return (
          <div
            key={tl.id}
            data-walkthrough-row={tl.id}
            data-reorder-index={i}
            onDragOver={reorderable ? (e) => handleDragOver(e, i) : undefined}
            onDrop={reorderable ? handleDrop : undefined}
            style={{
              position: 'relative',
              opacity: isDragging ? 0.45 : 1,
              transition: 'opacity 120ms ease',
            }}
          >
            {/* Overlays so the divider/drop line stay visible above the row's
                own (opaque) hover background. Accent paints over the divider. */}
            {i > 0 && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: theme.colors.border,
                  pointerEvents: 'none',
                }}
              />
            )}
            {(showTop || showBottom) && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: 2,
                  zIndex: 2,
                  background: accent,
                  pointerEvents: 'none',
                  ...(showTop ? { top: 0 } : { bottom: 0 }),
                }}
              />
            )}
            <WalkthroughFlow
              walkthrough={tl}
              collapsed={!expandedWalkthroughs.has(tl.id)}
              active={
                focusedWalkthroughId === tl.id
                  ? { stepIndex: focusedStepIndex }
                  : hoveredWalkthroughStep?.walkthroughId === tl.id
                    ? { stepIndex: hoveredWalkthroughStep.stepIndex }
                    : null
              }
              onToggleCollapsed={onToggleCollapsed}
              onFocusFlow={onFocusFlow}
              onClearFocus={onClearFocus}
              onFocusStep={onFocusStep}
              onHoverStep={onHoverStep}
              onHoverFlow={onHoverFlow}
              onLeaveStep={onLeaveStep}
              reorder={
                reorderable
                  ? {
                      index: i,
                      isDragging,
                      onDragStart: handleDragStart,
                      onDragEnd: resetDrag,
                    }
                  : undefined
              }
              dragActive={dragIndex != null}
              isHoverSuppressed={isHoverSuppressed}
              proposedAliases={proposedAliases}
            />
          </div>
        );
      })}
    </div>
  );
}
