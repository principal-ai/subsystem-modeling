/**
 * MaintainEventLog — presentational live event log for an OpenCode agent run.
 *
 * Renders one row per event as `time type — summary`, with a header carrying
 * title / agent / session id / status / counts. Subsystems Studio's
 * `MaintainEventsView` owns the RPC + subscription wiring and feeds the
 * resulting state in as props; keeping the wiring out of this component lets it
 * render in Storybook and embed in the subsystem graph sidebar.
 */

import { useEffect, useRef, type CSSProperties } from 'react';
import { useTheme } from '@principal-ade/industry-theme';

export interface MaintainEventLogEvent {
  at: number;
  type: string;
  sessionId?: string;
  summary: string;
}

export interface MaintainEventLogProps {
  title?: string;
  agent?: string;
  sessionId?: string;
  status: string;
  events: MaintainEventLogEvent[];
  total: number;
  error?: string | null;
  /** Shown before a session id is known. @default 'Waiting for OpenCode session…' */
  waitingLabel?: string;
  /** Shown once a session exists but no events have arrived. @default 'Waiting for SSE events…' */
  emptyLabel?: string;
  /** Keep the log pinned to the newest event. @default true */
  autoScroll?: boolean;
  /** Render the title/status header above the log. @default true */
  showHeader?: boolean;
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function MaintainEventLog({
  title,
  agent,
  sessionId,
  status,
  events,
  total,
  error,
  waitingLabel = 'Waiting for OpenCode session…',
  emptyLabel = 'Waiting for SSE events…',
  autoScroll = true,
  showHeader = true,
}: MaintainEventLogProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [autoScroll, events.length]);

  if (!sessionId) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: muted,
          fontFamily: theme.fonts.body,
          fontSize: theme.fontSizes[1],
        }}
      >
        {waitingLabel}
      </div>
    );
  }

  const wrap: CSSProperties = {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    padding: 20,
    color: theme.colors.text,
    fontFamily: theme.fonts.body,
    boxSizing: 'border-box',
  };

  return (
    <div style={wrap}>
      {showHeader ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: theme.fontSizes[3], fontWeight: 650 }}>
            {title ?? 'Maintain events'}
          </div>
          <div style={{ marginTop: 4, fontSize: theme.fontSizes[0], color: muted }}>
            {agent ? `${agent} · ` : null}
            {sessionId}
            {' · '}
            <span style={{ fontWeight: 600 }}>{status}</span>
            {' · '}
            {total} events
            {events.length < total ? ` (showing last ${events.length})` : null}
          </div>
          {error ? (
            <div style={{ marginTop: 8, color: theme.colors.error, fontSize: theme.fontSizes[0] }}>
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        ref={logRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          borderRadius: 8,
          border: `1px solid ${theme.colors.border ?? 'rgba(255,255,255,0.12)'}`,
          background: 'rgba(0,0,0,0.25)',
          padding: '10px 12px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: theme.fontSizes[0],
          lineHeight: 1.45,
        }}
      >
        {events.length === 0 ? (
          <div style={{ color: muted }}>{emptyLabel}</div>
        ) : (
          events.map((ev, i) => (
            <div key={`${ev.at}-${ev.type}-${i}`} style={{ marginBottom: 6 }}>
              <span style={{ color: muted }}>{formatTime(ev.at)}</span>{' '}
              <span style={{ color: theme.colors.primary ?? '#8fd' }}>{ev.type}</span>
              {ev.summary && ev.summary !== ev.type ? <span> — {ev.summary}</span> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
