import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronRight, Route, X } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import type { SubsystemTrail } from './model';
import {
  trailStepDisplay,
  type TrailComponentLabels,
} from './trailStepDisplay';
import { buildTrailStack } from './trailStack';

/**
 * TrailStepsNav — the trails side panel as a two-step slide: a list of trails,
 * and a step pane that slides in from the right when a trail is picked (and
 * back out when focus clears). The counterpart to `TrailsPanel`'s inline
 * expand — same data and callbacks, a push instead of a dropdown.
 *
 * Pure presentation: the host owns the focus state and the canvas response.
 * `onFocusFlow` opens the step pane (and, in the C4 drill, hides the elements
 * the trail does not touch); `onClearFocus` closes it. Hovering a row previews
 * that trail (`onHoverFlow`); hovering a step previews the hop
 * (`onHoverStep`), which the host dims to.
 *
 * Back is a slide, not a swap: clearing the focus leaves the last trail's steps
 * rendered until the pane has finished sliding out, so the detail view is what
 * moves, not a blank pane.
 *
 * Each step row leads with its `annotation` (the free-text note anchored to its
 * site line) as the row's description, with the `symbol` beneath it.
 */

export interface TrailStepsNavProps {
  /** Ordered trails — the list pane. */
  trails: SubsystemTrail[];
  /** Focused trail id, or null for the list pane. */
  focusedTrailId: string | null;
  /** Focused step within the focused trail, or null for the whole flow. */
  focusedStepIndex: number | null;
  /** Hovered trail/step, for the preview highlight (`stepIndex: null` = whole). */
  hoveredTrailStep: { trailId: string; stepIndex: number | null } | null;
  /** Pick a trail: focus the whole flow — this opens the step pane. */
  onFocusFlow: (trail: SubsystemTrail) => void;
  /** Back: clear the focus — this closes the step pane. */
  onClearFocus: () => void;
  onFocusStep: (trail: SubsystemTrail, stepIndex: number) => void;
  onHoverStep: (trail: SubsystemTrail, stepIndex: number) => void;
  onHoverFlow: (trail: SubsystemTrail) => void;
  onLeaveStep: () => void;
  /** Alias → component, for turning hops into human display names. */
  componentByAlias?: TrailComponentLabels;
  /** Slide duration in ms. @default 340 */
  transitionMs?: number;
  /** Optional list content, for hosts with reordering controls. */
  listContent?: ReactNode;
  /** Optional step content, for hosts with copy and guidance controls. */
  renderSteps?: (trail: SubsystemTrail) => ReactNode;
  /** Replace the step body without replacing the selected trail's header. */
  detailContent?: ReactNode;
}

const PANE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  willChange: 'transform',
};

export function TrailStepsNav({
  trails,
  focusedTrailId,
  focusedStepIndex,
  hoveredTrailStep,
  onFocusFlow,
  onClearFocus,
  onFocusStep,
  onHoverStep,
  onHoverFlow,
  onLeaveStep,
  componentByAlias,
  transitionMs = 340,
  listContent,
  renderSteps,
  detailContent,
}: TrailStepsNavProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const hoverBg = theme.colors.backgroundHover ?? theme.colors.backgroundSecondary ?? '#232323';
  const transition = `transform ${transitionMs}ms cubic-bezier(0.2, 0, 0, 1)`;

  // Hovering a collapsed row previews the whole trail while nothing is focused;
  // the list pane is the only place that happens.
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  // Hovering the detail title (or the close) lights the close, so the title
  // reads as the same back action.
  const [headerHover, setHeaderHover] = useState(false);

  const focused = trails.find((t) => t.id === focusedTrailId) ?? null;
  const open = focused != null;

  // The step pane is a translated layer, not a mounted/unmounted one: on back,
  // `focused` goes null immediately, which would blank the pane's content the
  // instant the slide-out starts. Hold the last focused trail through the
  // transition, then drop it — slide first, unmount after. A fresh focus lands
  // immediately (and cancels any pending drop).
  const [displayedTrail, setDisplayedTrail] = useState<SubsystemTrail | null>(focused);
  useEffect(() => {
    if (focused) {
      setDisplayedTrail(focused);
      return;
    }
    const timer = setTimeout(() => setDisplayedTrail(null), transitionMs);
    return () => clearTimeout(timer);
  }, [focused, transitionMs]);

  // A focused trail (from the graph side) always lands on the step pane.
  const leaveList = useCallback(() => {
    setHoveredRow(null);
  }, []);

  useEffect(() => {
    if (open) setHoveredRow(null);
    setHeaderHover(false);
  }, [open]);

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      {/* List pane. */}
      <div
        aria-hidden={open}
        style={{
          ...PANE,
          transform: open ? 'translateX(-100%)' : 'translateX(0)',
          transition,
        }}
        onMouseLeave={leaveList}
      >
        {listContent ?? <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 0 12px' }}>
          {trails.map((trail) => {
            const focusedRow = trail.id === focusedTrailId;
            const hovered = hoveredRow === trail.id;
            return (
              <button
                key={trail.id}
                type="button"
                onMouseEnter={() => {
                  setHoveredRow(trail.id);
                  onHoverFlow(trail);
                }}
                onMouseLeave={leaveList}
                onClick={() => onFocusFlow(trail)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  width: '100%',
                  minWidth: 0,
                  padding: '14px 12px',
                  border: 'none',
                  borderRadius: 0,
                  background: focusedRow || hovered ? hoverBg : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 120ms ease',
                }}
              >
                <Route
                  size={14}
                  strokeWidth={2}
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    marginTop: 3,
                    color: focusedRow || hovered ? theme.colors.primary : muted,
                    transition: 'color 120ms ease',
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                    fontSize: theme.fontSizes[1],
                    fontFamily: theme.fonts.monospace,
                    fontWeight: 600,
                    lineHeight: '20px',
                    color: theme.colors.text,
                  }}
                >
                  {trail.title}
                </span>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: theme.fontSizes[0],
                    lineHeight: '20px',
                    fontFamily: theme.fonts.monospace,
                    color: muted,
                  }}
                >
                  {trail.steps.length}
                </span>
                <ChevronRight size={14} strokeWidth={2} style={{ flexShrink: 0, color: muted }} />
              </button>
            );
          })}
        </div>}
      </div>

      {/* Step pane. */}
      <div
        aria-hidden={!open}
        style={{
          ...PANE,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition,
        }}
      >
        {displayedTrail && (
          <>
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                // Left inset + leading cell + gap match the step rows below, so
                // the trail icon and the step numbers share one column.
                padding: '14px 12px',
              }}
            >
              <Route
                size={14}
                strokeWidth={2}
                aria-hidden
                // The focused trail: the icon stays primary, matching the row's
                // hover colour in the list it came from.
                style={{ flexShrink: 0, marginTop: 3, color: theme.colors.primary }}
              />
              {/* The title is the back affordance too: clicking it goes back to
                  the list, like the trailing close. */}
              <button
                type="button"
                onClick={onClearFocus}
                onMouseEnter={() => setHeaderHover(true)}
                onMouseLeave={() => setHeaderHover(false)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  overflowWrap: 'anywhere',
                  fontSize: theme.fontSizes[1],
                  fontFamily: theme.fonts.monospace,
                  fontWeight: 600,
                  lineHeight: '20px',
                  color: theme.colors.text,
                }}
              >
                {displayedTrail.title}
              </button>
              <button
                type="button"
                aria-label="Back to trails"
                title="All trails"
                onClick={onClearFocus}
                onMouseEnter={() => setHeaderHover(true)}
                onMouseLeave={() => setHeaderHover(false)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  width: 24,
                  height: 20,
                  padding: 0,
                  border: 'none',
                  borderRadius: 4,
                  background: headerHover ? (theme.colors.border ?? hoverBg) : 'transparent',
                  color: headerHover ? theme.colors.text : muted,
                  cursor: 'pointer',
                  transition: 'background 120ms ease, color 120ms ease',
                }}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            {detailContent ?? <div
              style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 0 12px' }}
              onMouseLeave={onLeaveStep}
            >
              {renderSteps ? renderSteps(displayedTrail) : displayedTrail.steps.map((step, i) => {
                const active = focusedStepIndex === i;
                const hovered =
                  hoveredTrailStep?.trailId === displayedTrail.id &&
                  hoveredTrailStep.stepIndex === i;
                const display = trailStepDisplay(step, componentByAlias);
                const stackDepth = buildTrailStack(displayedTrail, i, componentByAlias).frames.length;
                return (
                  <button
                    key={`${step.from}->${step.to}-${i}`}
                    type="button"
                    onMouseEnter={() => onHoverStep(displayedTrail, i)}
                    onClick={() => onFocusStep(displayedTrail, i)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      width: '100%',
                      minWidth: 0,
                      padding: `14px 16px 14px ${12 + Math.max(0, stackDepth - 1) * 10}px`,
                      border: 'none',
                      borderRadius: 0,
                      background: active || hovered ? hoverBg : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 120ms ease',
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        // Root steps align with the header icon; nested steps
                        // move the number and text together.
                        width: 14,
                        textAlign: 'center',
                        paddingTop: 1,
                        fontSize: theme.fontSizes[0],
                        fontFamily: theme.fonts.monospace,
                        color: active ? theme.colors.text : muted,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      {step.annotation && (
                        <span
                          style={{
                            minWidth: 0,
                            overflowWrap: 'anywhere',
                            fontSize: theme.fontSizes[1],
                            fontFamily: theme.fonts.monospace,
                            color: theme.colors.primary,
                            lineHeight: 1.35,
                          }}
                        >
                          {step.annotation}
                        </span>
                      )}
                      <span
                        style={{
                          minWidth: 0,
                          overflowWrap: 'anywhere',
                          fontSize: theme.fontSizes[1],
                          fontFamily: theme.fonts.body,
                          color: theme.colors.text,
                        }}
                      >
                        {display.primary}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>}
          </>
        )}
      </div>
    </div>
  );
}