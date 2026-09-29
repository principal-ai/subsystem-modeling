/**
 * MaintainLivePanel — a collapsible, half-height panel that overlays the graph
 * canvas and streams a live agent run's events. Subsystems Studio supplies the
 * state (status/events/total/error) and renders it through
 * `SubsystemComponentGraph`'s `liveEvents` prop; collapsing leaves just the
 * header bar so the graph stays readable.
 */

import { useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { MaintainEventLog, type MaintainEventLogProps } from './MaintainEventLog';

export interface MaintainLivePanelProps extends MaintainEventLogProps {
  /** Start collapsed (header only). @default false */
  defaultCollapsed?: boolean;
}

const HEADER_HEIGHT = 36;

export function MaintainLivePanel({
  title,
  agent,
  sessionId,
  status,
  events,
  total,
  error,
  defaultCollapsed = false,
}: MaintainLivePanelProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const border = theme.colors.border ?? 'rgba(255,255,255,0.12)';
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: collapsed ? HEADER_HEIGHT : '50%',
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.backgroundSecondary ?? theme.colors.background,
        borderTop: `1px solid ${border}`,
        boxShadow: '0 -8px 24px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: HEADER_HEIGHT,
          flexShrink: 0,
          padding: '0 12px',
          border: 'none',
          borderBottom: collapsed ? 'none' : `1px solid ${border}`,
          background: 'transparent',
          color: theme.colors.text,
          fontFamily: theme.fonts.body,
          fontSize: theme.fontSizes[0],
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        <span style={{ fontWeight: 600 }}>Live events</span>
        {agent ? <span style={{ color: muted }}>{agent}</span> : null}
        {status ? <span style={{ color: muted }}>· {status}</span> : null}
        {total > 0 ? <span style={{ color: muted }}>· {total} events</span> : null}
        <span style={{ flex: 1 }} />
        {sessionId ? (
          <span style={{ color: muted, fontFamily: theme.fonts.monospace }}>{sessionId}</span>
        ) : null}
      </button>
      {!collapsed ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <MaintainEventLog
            title={title}
            agent={agent}
            sessionId={sessionId}
            status={status}
            events={events}
            total={total}
            error={error}
            showHeader={false}
          />
        </div>
      ) : null}
    </div>
  );
}
