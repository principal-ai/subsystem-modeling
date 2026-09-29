/**
 * SubsystemAgentsPanel — the graph sidebar's Agents view: the Maintain agent
 * pipeline, with the stage the router picked next highlighted and runnable.
 *
 * The host supplies the agent rows and the router's pick (`nextAgentId`); this
 * component is presentation + the run trigger only.
 */

import { useTheme } from '@principal-ade/industry-theme';
import { Bot, Play } from 'lucide-react';

export interface SubsystemAgent {
  id: string;
  label: string;
  /** Display group, e.g. `construct` / `static-topology` / `dynamic-topology`. */
  lane?: string;
  /** `issues` (fixer) or `verify` (verifier). */
  mode?: string;
}

export interface SubsystemAgentsPanelProps {
  agents: SubsystemAgent[];
  /** Router's next stage, by agent id. Highlighted and runnable. */
  nextAgentId?: string | null;
  /** A Maintain run is in flight for this model. */
  running?: boolean;
  /** Run the router's next stage. */
  onRun?: () => void;
}

const LANE_LABEL: Record<string, string> = {
  construct: 'Construct',
  'static-topology': 'Static topology',
  'dynamic-topology': 'Dynamic topology',
};

export function SubsystemAgentsPanel({
  agents,
  nextAgentId,
  running,
  onRun,
}: SubsystemAgentsPanelProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const accent = theme.colors.primary ?? '#7dd3fc';

  if (agents.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          color: muted,
          fontFamily: theme.fonts.body,
          fontSize: theme.fontSizes[1],
        }}
      >
        No Maintain agents configured.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {agents.map((agent) => {
        const isNext = nextAgentId === agent.id;
        return (
          <div
            key={agent.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 12px',
              borderBottom: `1px solid ${theme.colors.border}`,
              background: isNext ? `${accent}14` : 'transparent',
            }}
          >
            <Bot
              size={14}
              color={isNext ? accent : muted}
              style={{ flexShrink: 0 }}
              aria-hidden="true"
            />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span
                style={{
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[1],
                  color: isNext ? theme.colors.text : theme.colors.textSecondary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {agent.label}
              </span>
              {agent.lane || agent.mode ? (
                <span style={{ fontSize: theme.fontSizes[0], color: muted }}>
                  {agent.lane ? (LANE_LABEL[agent.lane] ?? agent.lane) : null}
                  {agent.lane && agent.mode ? ' · ' : null}
                  {agent.mode ?? null}
                </span>
              ) : null}
            </div>
            {isNext ? (
              <button
                type="button"
                onClick={() => onRun?.()}
                disabled={running || onRun == null}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 8px',
                  border: `1px solid ${accent}`,
                  borderRadius: 4,
                  background: 'transparent',
                  color: accent,
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[1],
                  cursor: running || onRun == null ? 'default' : 'pointer',
                  opacity: running || onRun == null ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                <Play size={11} />
                {running ? 'Running…' : 'Run'}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
