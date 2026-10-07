import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import type { SubsystemTrail } from './model';

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
  /** Aliases of components marked `proposed` — a row whose steps touch one tints. */
  proposedAliases?: ReadonlySet<string>;
  /** Slide duration in ms. @default 340 */
  transitionMs?: number;
}

const PROPOSED_COLOR = 'darkgoldenrod';

const PANE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  willChange: 'transform',
};

function touchesProposed(trail: SubsystemTrail, proposed?: ReadonlySet<string>): boolean {
  if (!proposed) return false;
  return trail.steps.some((s) => proposed.has(s.from) || proposed.has(s.to));
}

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
  proposedAliases,
  transitionMs = 340,
}: TrailStepsNavProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const hoverBg = theme.colors.backgroundHover ?? theme.colors.backgroundSecondary ?? '#232323';
  const transition = `transform ${transitionMs}ms cubic-bezier(0.2, 0, 0, 1)`;

  // Hovering a collapsed row previews the whole trail while nothing is focused;
  // the list pane is the only place that happens.
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const focused = trails.find((t) => t.id === focusedTrailId) ?? null;
  const open = focused != null;

  // A focused trail (from the graph side) always lands on the step pane.
  const leaveList = useCallback(() => {
    setHoveredRow(null);
  }, []);

  useEffect(() => {
    if (open) setHoveredRow(null);
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
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 0 12px' }}>
          {trails.map((trail) => {
            const proposed = touchesProposed(trail, proposedAliases);
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
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  minWidth: 0,
                  padding: '10px 8px 10px 16px',
                  border: 'none',
                  borderRadius: 0,
                  background: focusedRow || hovered ? hoverBg : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 120ms ease',
                }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: theme.fontSizes[1],
                    fontFamily: theme.fonts.monospace,
                    fontWeight: 600,
                    color: proposed ? PROPOSED_COLOR : theme.colors.text,
                  }}
                >
                  {trail.title}
                </span>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: theme.fontSizes[0],
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
        </div>
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
        {focused && (
          <>
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 8px 6px 6px',
                borderBottom: `1px solid ${theme.colors.border}`,
              }}
            >
              <button
                type="button"
                aria-label="Back to trails"
                title="All trails"
                onClick={onClearFocus}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  padding: 0,
                  border: 'none',
                  borderRadius: 4,
                  background: 'transparent',
                  color: muted,
                  cursor: 'pointer',
                }}
              >
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: theme.fontSizes[1],
                  fontFamily: theme.fonts.monospace,
                  fontWeight: 600,
                  color: touchesProposed(focused, proposedAliases) ? PROPOSED_COLOR : theme.colors.text,
                }}
              >
                {focused.title}
              </span>
            </div>
            <div
              style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 0 12px' }}
              onMouseLeave={onLeaveStep}
            >
              {focused.steps.map((step, i) => {
                const active = focusedStepIndex === i;
                const hovered =
                  hoveredTrailStep?.trailId === focused.id && hoveredTrailStep.stepIndex === i;
                return (
                  <button
                    key={`${step.from}->${step.to}-${i}`}
                    type="button"
                    onMouseEnter={() => onHoverStep(focused, i)}
                    onClick={() => onFocusStep(focused, i)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      minWidth: 0,
                      padding: '8px 16px 8px 17px',
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
                        width: 14,
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
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: theme.fontSizes[1],
                        fontFamily: theme.fonts.monospace,
                        color: theme.colors.text,
                      }}
                    >
                      {step.symbol ?? step.from}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}