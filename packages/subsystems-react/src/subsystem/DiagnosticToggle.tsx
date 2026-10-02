/**
 * DiagnosticToggle — the subsystem graph's status + diagnostics-view toggle.
 *
 * A compact button that lives in the sidebar title row (beside the description
 * toggle). It carries the *status* of the graph's last verification pass in its
 * icon color + count, and toggles the sidebar between the diagnostics list and
 * the normal files/trails view. The graph owns that view; this component
 * only surfaces state and calls `onToggle`.
 *
 * Status → color (theme):
 * - `ok`      → success (green)
 * - `issues`  → error   (red)
 * - `gaps`    → warning (amber) — nothing failed, but some claims are unconfirmed
 * - `unknown` → muted   (never checked)
 *
 * `stale` means the inputs changed since the report was produced — the color
 * stays, a hollow ring marks it. `busy` swaps the icon for a spinner.
 */

import { useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { hexWithAlpha } from './nodes';

export type SubsystemDiagnosticStatus = 'ok' | 'issues' | 'gaps' | 'unknown';

export interface SubsystemDiagnostic {
  status: SubsystemDiagnosticStatus;
  /** Count shown beside the icon (e.g. error + warn findings). Hidden when 0/undefined. */
  issueCount?: number;
  /**
   * How many of the open findings carry a one-click deterministic fix (a
   * re-pin, an adoptable signature fill, a unique Graphify file relocate).
   * Badged on the icon so it's visible without expanding the list — the fixes
   * live inside collapsed categories, so the count was previously invisible.
   */
  fixableCount?: number;
  /** Inputs changed since the report was produced. */
  stale?: boolean;
  /** A verification pass is running right now. */
  busy?: boolean;
  /** True while the diagnostics list is showing (pressed state). */
  active?: boolean;
  /** Tooltip / a11y label override; otherwise derived from `status`. */
  title?: string;
  /** Click — toggle the diagnostics list. */
  onToggle?: () => void;
}

/** Resolve the status accent from the active theme. */
export function diagnosticStatusColor(
  status: SubsystemDiagnosticStatus,
  colors: { success: string; error: string; warning: string },
  muted: string,
): string {
  if (status === 'ok') return colors.success;
  if (status === 'issues') return colors.error;
  if (status === 'gaps') return colors.warning;
  return muted;
}

/** Human tooltip for the current diagnostic state. */
export function diagnosticTitle(diagnostic: SubsystemDiagnostic): string {
  if (diagnostic.title) return diagnostic.title;
  const { status, issueCount, fixableCount, stale, busy } = diagnostic;
  let head: string;
  if (status === 'ok') head = 'Diagnostics: no issues';
  else if (status === 'issues')
    head =
      issueCount != null && issueCount > 0
        ? `Diagnostics: ${issueCount} issue${issueCount === 1 ? '' : 's'}`
        : 'Diagnostics: issues found';
  else if (status === 'gaps')
    head =
      issueCount != null && issueCount > 0
        ? `Diagnostics: ${issueCount} unconfirmed`
        : 'Diagnostics: unconfirmed claims';
  else head = 'Diagnostics: not checked yet';
  // Name the one-click count first when there is work a click can close —
  // that's the actionable part of the list.
  const fixable =
    fixableCount != null && fixableCount > 0
      ? `${fixableCount} fixable with one click`
      : '';
  if (busy) return `${head} — checking…`;
  if (stale) return `${head} (stale) — toggle the list${fixable ? `, ${fixable}` : ''}`;
  return `${head} — toggle the list${fixable ? `, ${fixable}` : ''}`;
}

export interface SubsystemDiagnosticToggleProps extends SubsystemDiagnostic {
  /** Icon size in px. @default 14 */
  size?: number;
}

export function SubsystemDiagnosticToggle({
  status,
  issueCount,
  fixableCount = 0,
  stale = false,
  busy = false,
  active = false,
  size = 14,
  onToggle,
  ...rest
}: SubsystemDiagnosticToggleProps) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const color = diagnosticStatusColor(status, theme.colors, muted);
  const label = diagnosticTitle({
    status,
    issueCount,
    fixableCount,
    stale,
    busy,
    active,
    ...rest,
  });
  const showCount = issueCount != null && issueCount > 0;
  // Green regardless of status: this marks "a click fixes this", not severity,
  // and green is the same accent the per-finding Apply button uses.
  const showFixable = fixableCount > 0 && !busy;
  const fixableColor = theme.colors.success ?? '#2da44e';
  const background = active
    ? hexWithAlpha(color, hover ? 0.24 : 0.16)
    : hover
      ? theme.colors.border
      : 'transparent';

  return (
    <>
      {busy && (
        <style>{'@keyframes subsystem-diagnostic-spin{to{transform:rotate(360deg)}}'}</style>
      )}
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={label}
        aria-label={label}
        aria-pressed={active}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 22,
          padding: showCount ? '0 7px 0 6px' : '0 5px',
          border: 'none',
          borderRadius: 4,
          background,
          color,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background 120ms ease, opacity 120ms ease',
          opacity: stale && !busy ? 0.55 : 1,
        }}
      >
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          {busy ? (
            <Loader2 size={size} style={{ animation: 'subsystem-diagnostic-spin 900ms linear infinite' }} />
          ) : (
            <Activity size={size} />
          )}
          {stale && !busy && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 6,
                height: 6,
                borderRadius: '50%',
                border: `1.5px solid ${color}`,
                background: theme.colors.backgroundSecondary ?? theme.colors.background,
              }}
            />
          )}
          {/* Fixable badge — superscript count on the icon's trailing edge.
              Offset up-and-out from the `stale` dot so both read at once;
              the badge is the call to action, the dot only a freshness note. */}
          {showFixable && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: -5,
                right: -8,
                minWidth: 12,
                height: 12,
                padding: '0 3px',
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: fixableColor,
                color: theme.colors.background,
                fontFamily: theme.fonts.monospace,
                fontSize: 9,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {fixableCount > 99 ? '99+' : fixableCount}
            </span>
          )}
        </span>
        {showCount && (
          <span
            style={{
              fontFamily: theme.fonts.monospace,
              fontSize: theme.fontSizes[0],
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            {issueCount}
          </span>
        )}
      </button>
    </>
  );
}
