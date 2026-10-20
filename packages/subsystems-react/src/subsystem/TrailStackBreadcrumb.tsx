/**
 * TrailStackBreadcrumb — the call stack at one trail step.
 *
 * Rendered above the trail code view. `calls` steps form the chain; `uses` and
 * data/event seams are annotations on the nearest frame, never frames of their
 * own. Clicking a frame focuses the step that created it.
 */

import type { CSSProperties } from 'react';
import { ArrowRight, CornerDownRight } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import type { SubsystemTrail } from './model';
import { buildTrailStack } from './trailStack';
import type { TrailComponentLabels } from './trailStepDisplay';

export interface TrailStackBreadcrumbProps {
  trail: SubsystemTrail;
  /** Selected step; the stack is the chain into its caller frame. */
  stepIndex: number;
  /** Alias → component, for human frame/callee labels when no symbol resolves. */
  componentByAlias?: TrailComponentLabels;
  /** Focus a frame's step (usually the trail panel's onFocusStep). */
  onFocusStep?: (stepIndex: number) => void;
}

const chipBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minWidth: 0,
  maxWidth: 260,
  padding: '2px 7px',
  borderRadius: 4,
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export function TrailStackBreadcrumb({
  trail,
  stepIndex,
  componentByAlias,
  onFocusStep,
}: TrailStackBreadcrumbProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const stack = buildTrailStack(trail, stepIndex, componentByAlias);
  if (stack.frames.length === 0) return null;

  return (
    <div
      aria-label={`${
        stack.isCall ? 'Call stack' : 'Trail context'
      } at step ${stepIndex + 1}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
        minHeight: 28,
        padding: '4px 10px',
        overflowX: 'auto',
        borderBottom: `1px solid ${theme.colors.border}`,
        background:
          theme.colors.backgroundSecondary ?? theme.colors.background,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          paddingRight: 2,
          fontSize: 9,
          fontFamily: theme.fonts.body,
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: muted,
        }}
      >
        {stack.isCall ? 'Stack' : 'Context'}
      </span>

      {stack.frames.map((frame, index) => {
        const chipStyle: CSSProperties = {
          ...chipBase,
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[0],
          border: `1px solid ${
            frame.current ? theme.colors.primary : theme.colors.border
          }`,
          background: frame.current ? theme.colors.background : 'transparent',
          color: frame.current ? theme.colors.text : theme.colors.textSecondary,
          fontWeight: frame.current ? 600 : 400,
          cursor: onFocusStep ? 'pointer' : 'default',
          flexShrink: 0,
        };
        const label = (
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {frame.label}
          </span>
        );
        return (
          <span
            key={`${frame.stepIndex}:${index}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {index > 0 && (
              <span aria-hidden style={{ color: muted, fontSize: 11 }}>
                ›
              </span>
            )}
            {onFocusStep ? (
              <button
                type="button"
                onClick={() => onFocusStep(frame.stepIndex)}
                style={chipStyle}
              >
                {label}
              </button>
            ) : (
              <span style={chipStyle}>{label}</span>
            )}
          </span>
        );
      })}

      {stack.callee && (
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <ArrowRight size={11} style={{ color: muted, flexShrink: 0 }} />
          <span
            style={{
              ...chipBase,
              fontFamily: theme.fonts.monospace,
              fontSize: theme.fontSizes[0],
              border: `1px dashed ${theme.colors.border}`,
              color: muted,
              flexShrink: 0,
            }}
          >
            {stack.callee}
          </span>
        </span>
      )}

      {stack.annotations.map((annotation) => (
        <span
          key={`annotation:${annotation.stepIndex}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            flexShrink: 0,
            fontSize: 10,
            fontFamily: theme.fonts.monospace,
            color: muted,
            whiteSpace: 'nowrap',
          }}
        >
          <CornerDownRight size={10} style={{ flexShrink: 0 }} />
          {annotation.label}
        </span>
      ))}
    </div>
  );
}
