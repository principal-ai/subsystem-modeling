import type { Meta, StoryObj } from '@storybook/react';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  PipelineView,
  type PipelineEvent,
  type EventSource,
  type PipelineEventType,
} from '../../components/state-view';

const meta = {
  title: 'Components/StateView',
  component: PipelineView,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PipelineView>;

export default meta;
type Story = StoryObj<typeof meta>;

// =============================================================================
// Event Simulation Helpers
// =============================================================================

function createPipelineEvent(
  type: PipelineEventType,
  payload: PipelineEvent['payload'] = {}
): PipelineEvent {
  return {
    type,
    timestamp: Date.now(),
    payload,
  };
}

function simulatePipelineFlow(
  emit: (event: PipelineEvent) => void,
  repo: string
) {
  // Simulate: FS change -> Watch -> Cache -> Event
  const delays = [0, 100, 200, 350];

  setTimeout(() => emit(createPipelineEvent('FS_CHANGE', { repo })), delays[0]);
  setTimeout(() => emit(createPipelineEvent('WATCH_DETECTED', { repo })), delays[1]);
  setTimeout(() => emit(createPipelineEvent('CACHE_REBUILD', { repo, slice: 'fileTree' })), delays[2]);
  setTimeout(() => emit(createPipelineEvent('EVENT_BROADCAST', { repo, eventType: 'commit' })), delays[3]);
}

// =============================================================================
// Live Event Source (simulated)
// =============================================================================

function useLiveEventSource(): {
  eventSource: EventSource<PipelineEvent>;
  triggerEvent: (type: PipelineEventType, payload?: PipelineEvent['payload']) => void;
  triggerFlow: (repo: string) => void;
} {
  const listenersRef = useRef<Set<(event: PipelineEvent) => void>>(new Set());

  const eventSource: EventSource<PipelineEvent> = {
    mode: 'live',
    subscribe: (handler) => {
      listenersRef.current.add(handler);
      return () => listenersRef.current.delete(handler);
    },
  };

  const emit = useCallback((event: PipelineEvent) => {
    listenersRef.current.forEach((handler) => handler(event));
  }, []);

  const triggerEvent = useCallback(
    (type: PipelineEventType, payload: PipelineEvent['payload'] = {}) => {
      emit(createPipelineEvent(type, payload));
    },
    [emit]
  );

  const triggerFlow = useCallback(
    (repo: string) => {
      simulatePipelineFlow(emit, repo);
    },
    [emit]
  );

  return { eventSource, triggerEvent, triggerFlow };
}

// =============================================================================
// Replay Event Source
// =============================================================================

interface ReplayEventSourceOptions {
  events: PipelineEvent[];
  speed?: number;
}

function useReplayEventSource({ events, speed = 1 }: ReplayEventSourceOptions): {
  eventSource: EventSource<PipelineEvent>;
  controls: {
    play: () => void;
    pause: () => void;
    reset: () => void;
    isPlaying: boolean;
  };
} {
  const listenersRef = useRef<Set<(event: PipelineEvent) => void>>(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const indexRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const eventSource: EventSource<PipelineEvent> = {
    mode: 'replay',
    subscribe: (handler) => {
      listenersRef.current.add(handler);
      return () => listenersRef.current.delete(handler);
    },
  };

  const emit = useCallback((event: PipelineEvent) => {
    // Update timestamp to "now" for display purposes
    const adjustedEvent = { ...event, timestamp: Date.now() };
    listenersRef.current.forEach((handler) => handler(adjustedEvent));
  }, []);

  const playNext = useCallback(() => {
    if (indexRef.current >= events.length) {
      setIsPlaying(false);
      return;
    }

    const currentEvent = events[indexRef.current];
    emit(currentEvent);
    indexRef.current++;

    if (indexRef.current < events.length) {
      const nextEvent = events[indexRef.current];
      const delay = (nextEvent.timestamp - currentEvent.timestamp) / speed;
      timeoutRef.current = setTimeout(playNext, Math.max(50, delay));
    } else {
      setIsPlaying(false);
    }
  }, [events, speed, emit]);

  const play = useCallback(() => {
    if (isPlaying) return;
    setIsPlaying(true);
    playNext();
  }, [isPlaying, playNext]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    pause();
    indexRef.current = 0;
  }, [pause]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return {
    eventSource,
    controls: { play, pause, reset, isPlaying },
  };
}

// =============================================================================
// Stories
// =============================================================================

/**
 * Interactive demo with manual event triggering.
 * Click buttons to simulate events flowing through the pipeline.
 */
export const Interactive: Story = {
  render: () => {
    const { eventSource, triggerEvent, triggerFlow } = useLiveEventSource();
    const [selectedRepo, setSelectedRepo] = useState('myorg/backend');

    const repos = ['myorg/backend', 'myorg/frontend', 'myorg/shared-lib'];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PipelineView eventSource={eventSource} title="Repository Monitoring Pipeline" />

        {/* Control Panel */}
        <div
          style={{
            padding: 16,
            backgroundColor: '#111827',
            borderRadius: 8,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12 }}>
            Event Controls
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 4,
                border: 'none',
                backgroundColor: '#374151',
                color: 'white',
              }}
            >
              {repos.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>

            <button
              onClick={() => triggerFlow(selectedRepo)}
              style={{
                padding: '8px 16px',
                borderRadius: 4,
                border: 'none',
                backgroundColor: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Simulate Full Flow
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => triggerEvent('FS_CHANGE', { repo: selectedRepo })}
              style={buttonStyle('#10b981')}
            >
              FS Change
            </button>
            <button
              onClick={() => triggerEvent('WATCH_DETECTED', { repo: selectedRepo })}
              style={buttonStyle('#6366f1')}
            >
              Watch Detect
            </button>
            <button
              onClick={() => triggerEvent('CACHE_REBUILD', { repo: selectedRepo, slice: 'fileTree' })}
              style={buttonStyle('#f59e0b')}
            >
              Cache Rebuild
            </button>
            <button
              onClick={() => triggerEvent('EVENT_BROADCAST', { repo: selectedRepo, eventType: 'commit' })}
              style={buttonStyle('#ef4444')}
            >
              Event Broadcast
            </button>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Auto-playing demo that continuously simulates pipeline activity.
 */
export const AutoSimulation: Story = {
  render: () => {
    const { eventSource, triggerFlow } = useLiveEventSource();
    const [isRunning, setIsRunning] = useState(true);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const repos = ['myorg/backend', 'myorg/frontend', 'myorg/shared-lib', 'myorg/docs'];

    useEffect(() => {
      if (isRunning) {
        intervalRef.current = setInterval(() => {
          const randomRepo = repos[Math.floor(Math.random() * repos.length)];
          triggerFlow(randomRepo);
        }, 1500);
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [isRunning, triggerFlow]);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PipelineView eventSource={eventSource} title="Auto-Simulation" />

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => setIsRunning(!isRunning)}
            style={{
              padding: '8px 24px',
              borderRadius: 4,
              border: 'none',
              backgroundColor: isRunning ? '#ef4444' : '#10b981',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            {isRunning ? 'Stop Simulation' : 'Start Simulation'}
          </button>
        </div>
      </div>
    );
  },
};

/**
 * Replay mode - plays back a recorded sequence of events.
 */
export const Replay: Story = {
  render: () => {
    // Pre-recorded events
    const recordedEvents: PipelineEvent[] = [
      { type: 'FS_CHANGE', timestamp: 0, payload: { repo: 'myorg/backend' } },
      { type: 'WATCH_DETECTED', timestamp: 100, payload: { repo: 'myorg/backend' } },
      { type: 'CACHE_REBUILD', timestamp: 200, payload: { repo: 'myorg/backend', slice: 'fileTree' } },
      { type: 'EVENT_BROADCAST', timestamp: 350, payload: { repo: 'myorg/backend', eventType: 'commit' } },

      { type: 'FS_CHANGE', timestamp: 800, payload: { repo: 'myorg/frontend' } },
      { type: 'WATCH_DETECTED', timestamp: 900, payload: { repo: 'myorg/frontend' } },
      { type: 'CACHE_HIT', timestamp: 950, payload: { repo: 'myorg/frontend', slice: 'fileTree' } },
      { type: 'EVENT_BROADCAST', timestamp: 1000, payload: { repo: 'myorg/frontend', eventType: 'branch-switch' } },

      { type: 'FS_CHANGE', timestamp: 1500, payload: { repo: 'myorg/backend' } },
      { type: 'WATCH_DETECTED', timestamp: 1600, payload: { repo: 'myorg/backend' } },
      { type: 'CACHE_REBUILD', timestamp: 1700, payload: { repo: 'myorg/backend', slice: 'packages' } },
      { type: 'EVENT_BROADCAST', timestamp: 1850, payload: { repo: 'myorg/backend', eventType: 'dirty-change' } },
    ];

    const { eventSource, controls } = useReplayEventSource({
      events: recordedEvents,
      speed: 1,
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PipelineView eventSource={eventSource} title="Replay Mode" />

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            padding: 16,
            backgroundColor: '#111827',
            borderRadius: 8,
          }}
        >
          <button
            onClick={controls.isPlaying ? controls.pause : controls.play}
            style={{
              padding: '8px 24px',
              borderRadius: 4,
              border: 'none',
              backgroundColor: controls.isPlaying ? '#f59e0b' : '#10b981',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            {controls.isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={controls.reset}
            style={{
              padding: '8px 24px',
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

        <div style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>
          Replaying {recordedEvents.length} recorded events
        </div>
      </div>
    );
  },
};

// Helper style function
function buttonStyle(color: string): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 4,
    border: 'none',
    backgroundColor: color,
    color: 'white',
    cursor: 'pointer',
    fontSize: 12,
  };
}
