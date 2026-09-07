/**
 * PipelineView Component
 *
 * A state-driven visualization showing data flowing through pipeline stages.
 * Demonstrates the state view pattern with animations.
 */

import React from 'react';
import type {
  PipelineState,
  PipelineEvent,
  PipelineStage,
  EventSource,
  TransitionDefinition,
} from './types';
import { useStateView } from './useStateView';

// =============================================================================
// Reducer
// =============================================================================

const initialPipelineState: PipelineState = {
  stages: {
    disk: { id: 'disk', label: 'Disk', lastEventTime: null, isActive: false },
    watch: { id: 'watch', label: 'Watch', lastEventTime: null, isActive: false },
    cache: { id: 'cache', label: 'Cache', lastEventTime: null, isActive: false, count: 0 },
    event: { id: 'event', label: 'Events', lastEventTime: null, isActive: false, count: 0 },
  },
  repos: new Map(),
  totalEvents: 0,
};

function pipelineReducer(state: PipelineState, event: PipelineEvent): PipelineState {
  const now = event.timestamp;

  switch (event.type) {
    case 'FS_CHANGE':
      return {
        ...state,
        stages: {
          ...state.stages,
          disk: { ...state.stages.disk, lastEventTime: now, isActive: true },
        },
        totalEvents: state.totalEvents + 1,
      };

    case 'WATCH_DETECTED':
      return {
        ...state,
        stages: {
          ...state.stages,
          watch: { ...state.stages.watch, lastEventTime: now, isActive: true },
        },
      };

    case 'CACHE_REBUILD':
    case 'CACHE_HIT': {
      const newRepos = new Map(state.repos);
      if (event.payload.repo) {
        newRepos.set(event.payload.repo, {
          path: event.payload.repo,
          lastEventTime: now,
          lastEventType: event.type,
        });
      }
      return {
        ...state,
        stages: {
          ...state.stages,
          cache: {
            ...state.stages.cache,
            lastEventTime: now,
            isActive: true,
            count: (state.stages.cache.count ?? 0) + 1,
          },
        },
        repos: newRepos,
      };
    }

    case 'EVENT_BROADCAST':
      return {
        ...state,
        stages: {
          ...state.stages,
          event: {
            ...state.stages.event,
            lastEventTime: now,
            isActive: true,
            count: (state.stages.event.count ?? 0) + 1,
          },
        },
      };

    default:
      return state;
  }
}

// =============================================================================
// Transitions
// =============================================================================

const pipelineTransitions: TransitionDefinition[] = [
  { watch: 'stages.disk.lastEventTime', condition: 'changed', animate: 'pulse', target: 'stage-disk' },
  { watch: 'stages.watch.lastEventTime', condition: 'changed', animate: 'pulse', target: 'stage-watch' },
  { watch: 'stages.cache.lastEventTime', condition: 'changed', animate: 'pulse', target: 'stage-cache' },
  { watch: 'stages.event.lastEventTime', condition: 'changed', animate: 'pulse', target: 'stage-event' },
  { watch: 'stages.event.count', condition: 'increased', animate: 'particle-flow', target: 'flow-cache-event' },
];

// =============================================================================
// Sub-Components
// =============================================================================

interface StageBoxProps {
  stage: PipelineStage;
  isAnimating: boolean;
}

function StageBox({ stage, isAnimating }: StageBoxProps) {
  const baseStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 80,
    borderRadius: 8,
    backgroundColor: stage.isActive ? '#3b82f6' : '#374151',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
    transition: 'all 0.3s ease',
    boxShadow: isAnimating ? '0 0 20px rgba(59, 130, 246, 0.8)' : 'none',
    transform: isAnimating ? 'scale(1.05)' : 'scale(1)',
  };

  return (
    <div id={`stage-${stage.id}`} style={baseStyle}>
      <div style={{ fontWeight: 'bold', fontSize: 14 }}>{stage.label}</div>
      {stage.count !== undefined && (
        <div style={{ fontSize: 20, fontWeight: 'bold' }}>{stage.count}</div>
      )}
      {stage.lastEventTime && (
        <div style={{ fontSize: 10, opacity: 0.7 }}>
          {formatTimeAgo(stage.lastEventTime)}
        </div>
      )}
    </div>
  );
}

interface FlowArrowProps {
  id: string;
  isAnimating: boolean;
}

function FlowArrow({ id, isAnimating }: FlowArrowProps) {
  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 40,
    color: isAnimating ? '#3b82f6' : '#6b7280',
    fontSize: 24,
    transition: 'color 0.3s ease',
  };

  return (
    <div id={id} style={style}>
      {isAnimating ? (
        <span style={{ animation: 'pulse 0.5s ease-in-out' }}>→→→</span>
      ) : (
        '→'
      )}
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// =============================================================================
// Main Component
// =============================================================================

export interface PipelineViewProps {
  eventSource: EventSource<PipelineEvent>;
  title?: string;
}

export function PipelineView({ eventSource, title = 'Pipeline View' }: PipelineViewProps) {
  const { state, animations, isReplay, reset } = useStateView<PipelineState, PipelineEvent>({
    initialState: initialPipelineState,
    reducer: pipelineReducer,
    eventSource,
    transitions: pipelineTransitions,
  });

  const isStageAnimating = (stageId: string) =>
    animations.some((a) => a.target === `stage-${stageId}`);

  const isFlowAnimating = (flowId: string) =>
    animations.some((a) => a.target === flowId);

  const containerStyle: React.CSSProperties = {
    fontFamily: 'system-ui, sans-serif',
    backgroundColor: '#1f2937',
    color: 'white',
    padding: 24,
    borderRadius: 12,
    minWidth: 600,
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  };

  const pipelineStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  };

  const statsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 24,
    justifyContent: 'center',
    padding: '16px 0',
    borderTop: '1px solid #374151',
  };

  const statBoxStyle: React.CSSProperties = {
    textAlign: 'center',
  };

  const repoListStyle: React.CSSProperties = {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#111827',
    borderRadius: 8,
    maxHeight: 200,
    overflowY: 'auto',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isReplay && (
            <span style={{ fontSize: 12, color: '#f59e0b' }}>REPLAY</span>
          )}
          <button
            onClick={reset}
            style={{
              padding: '4px 12px',
              borderRadius: 4,
              border: 'none',
              backgroundColor: '#374151',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Pipeline Stages */}
      <div style={pipelineStyle}>
        <StageBox stage={state.stages.disk} isAnimating={isStageAnimating('disk')} />
        <FlowArrow id="flow-disk-watch" isAnimating={isFlowAnimating('flow-disk-watch')} />
        <StageBox stage={state.stages.watch} isAnimating={isStageAnimating('watch')} />
        <FlowArrow id="flow-watch-cache" isAnimating={isFlowAnimating('flow-watch-cache')} />
        <StageBox stage={state.stages.cache} isAnimating={isStageAnimating('cache')} />
        <FlowArrow id="flow-cache-event" isAnimating={isFlowAnimating('flow-cache-event')} />
        <StageBox stage={state.stages.event} isAnimating={isStageAnimating('event')} />
      </div>

      {/* Stats */}
      <div style={statsStyle}>
        <div style={statBoxStyle}>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{state.repos.size}</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Repos</div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{state.stages.cache.count}</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Cache Ops</div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{state.stages.event.count}</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Events</div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{state.totalEvents}</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Total</div>
        </div>
      </div>

      {/* Repo List */}
      {state.repos.size > 0 && (
        <div style={repoListStyle}>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
            Active Repositories
          </div>
          {Array.from(state.repos.values()).map((repo) => (
            <div
              key={repo.path}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                borderBottom: '1px solid #374151',
              }}
            >
              <span style={{ fontSize: 13 }}>{repo.path}</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                {repo.lastEventType} - {formatTimeAgo(repo.lastEventTime)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* CSS for animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
