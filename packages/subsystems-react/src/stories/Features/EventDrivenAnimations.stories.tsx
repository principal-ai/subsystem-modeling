import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { GraphEvent, ExtendedCanvas } from '@principal-ai/subsystems-core';
import { useState, useEffect } from 'react';
import React from 'react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Features/EventDrivenAnimations',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof GraphRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample canvas for event-driven animations
const sampleCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 70,
      text: 'Source',
      color: '#4A90E2',
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
        states: {
          idle: { label: 'Idle', color: '#888' },
          processing: { label: 'Processing', color: '#4A90E2' },
          completed: { label: 'Completed', color: '#10B981' },
          error: { label: 'Error', color: '#EF4444' },
        },
      },
    },
    {
      id: 'node-2',
      type: 'text',
      x: 300,
      y: 100,
      width: 140,
      height: 70,
      text: 'Processor',
      color: '#4A90E2',
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
        states: {
          idle: { label: 'Idle', color: '#888' },
          processing: { label: 'Processing', color: '#4A90E2' },
          completed: { label: 'Completed', color: '#10B981' },
          error: { label: 'Error', color: '#EF4444' },
        },
      },
    },
    {
      id: 'node-3',
      type: 'text',
      x: 500,
      y: 100,
      width: 100,
      height: 100,
      text: 'Storage',
      color: '#7B68EE',
      pv: {
        nodeType: 'data',
        shape: 'circle',
        icon: 'Database',
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'node-1',
      toNode: 'node-2',
      pv: { edgeType: 'dataflow' },
    },
    {
      id: 'edge-2',
      fromNode: 'node-2',
      toNode: 'node-3',
      pv: { edgeType: 'dataflow' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Event-Driven Animation Demo',
    description: 'Demonstrates event-driven animations',
    edgeTypes: {
      dataflow: {
        style: 'solid',
        color: '#50E3C2',
        directed: true,
      },
    },
  },
};

/**
 * Story: Automatic Event Sequence
 * Demonstrates automatic event playback with animations
 */
const AutomaticEventSequenceRenderer = () => {
  const [events, setEvents] = useState<GraphEvent[]>([]);
  const [eventLog, setEventLog] = useState<string[]>([]);

  useEffect(() => {
    // Define event sequence
    const eventSequence: Array<{ delay: number; event: GraphEvent }> = [
      {
        delay: 500,
        event: {
          id: 'evt-1',
          type: 'edge_animated',
          timestamp: Date.now(),
          category: 'edge',
          operation: 'animate',
          payload: {
            operation: 'animate',
            edgeId: 'edge-1',
            edgeType: 'dataflow',
            from: 'node-1',
            to: 'node-2',
            animation: {
              duration: 1000,
              direction: 'forward' as const,
            },
          },
        },
      },
      {
        delay: 1500,
        event: {
          id: 'evt-2',
          type: 'state_changed',
          timestamp: Date.now(),
          category: 'state',
          operation: 'update',
          payload: {
            nodeId: 'node-2',
            newState: 'processing',
          },
        },
      },
      {
        delay: 3000,
        event: {
          id: 'evt-3',
          type: 'edge_animated',
          timestamp: Date.now(),
          category: 'edge',
          operation: 'animate',
          payload: {
            operation: 'animate',
            edgeId: 'edge-2',
            edgeType: 'dataflow',
            from: 'node-2',
            to: 'node-3',
            animation: {
              duration: 1000,
              direction: 'forward' as const,
            },
          },
        },
      },
      {
        delay: 4000,
        event: {
          id: 'evt-4',
          type: 'state_changed',
          timestamp: Date.now(),
          category: 'state',
          operation: 'update',
          payload: {
            nodeId: 'node-2',
            newState: 'completed',
          },
        },
      },
    ];

    // Play events with delays
    eventSequence.forEach(({ delay, event }) => {
      setTimeout(() => {
        setEvents((prev) => [...prev, event]);
        setEventLog((prev) => [...prev, `${event.type} at ${delay}ms`]);
      }, delay);
    });

    // Loop the sequence
    const loopInterval = setInterval(() => {
      setEvents([]);
      setEventLog(['--- Sequence restart ---']);
      eventSequence.forEach(({ delay, event }) => {
        setTimeout(() => {
          setEvents((prev) => [...prev, event]);
          setEventLog((prev) => [...prev, `${event.type} at ${delay}ms`]);
        }, delay);
      });
    }, 5000);

    return () => clearInterval(loopInterval);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 1 }}>
        <GraphRenderer
          canvas={sampleCanvas}
          events={events}
          width="100%"
          height="100%"
          onEventProcessed={(event) => {
            console.log('Event processed:', event);
          }}
        />
      </div>
      <div
        style={{
          width: '300px',
          backgroundColor: '#f5f5f5',
          padding: '16px',
          overflowY: 'auto',
          borderLeft: '1px solid #ddd',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Event Log</h3>
        <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
          {eventLog.map((log, idx) => (
            <div key={idx} style={{ padding: '4px 0', borderBottom: '1px solid #e0e0e0' }}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const AutomaticEventSequence: Story = {
  render: () => <AutomaticEventSequenceRenderer />,
};

/**
 * Story: Interactive Event Triggers
 * Allows user to manually trigger animation events
 */
const InteractiveEventTriggersRenderer = () => {
  const [events, setEvents] = useState<GraphEvent[]>([]);

  const triggerEdgeAnimation = (edgeId: string) => {
    const event: GraphEvent = {
      id: `evt-${Date.now()}`,
      type: 'edge_animated',
      timestamp: Date.now(),
      category: 'edge',
      operation: 'animate',
      payload: {
        operation: 'animate',
        edgeId,
        edgeType: 'dataflow',
        from: edgeId === 'edge-1' ? 'node-1' : 'node-2',
        to: edgeId === 'edge-1' ? 'node-2' : 'node-3',
        animation: {
          duration: 1000,
          direction: 'forward' as const,
        },
      },
    };
    setEvents((prev) => [...prev, event]);
  };

  const triggerNodeState = (nodeId: string, state: string) => {
    const event: GraphEvent = {
      id: `evt-${Date.now()}`,
      type: 'state_changed',
      timestamp: Date.now(),
      category: 'state',
      operation: 'update',
      payload: {
        nodeId,
        newState: state,
      },
    };
    setEvents((prev) => [...prev, event]);
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 1 }}>
        <GraphRenderer canvas={sampleCanvas} events={events} width="100%" height="100%" />
      </div>
      <div
        style={{
          width: '300px',
          backgroundColor: '#f5f5f5',
          padding: '16px',
          overflowY: 'auto',
          borderLeft: '1px solid #ddd',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Event Controls</h3>

        <div style={{ marginBottom: '24px' }}>
          <h4>Edge Animations</h4>
          <button
            onClick={() => triggerEdgeAnimation('edge-1')}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '8px',
              backgroundColor: '#50E3C2',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Animate Edge 1
          </button>
          <button
            onClick={() => triggerEdgeAnimation('edge-2')}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#50E3C2',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Animate Edge 2
          </button>
        </div>

        <div>
          <h4>Node States</h4>
          <button
            onClick={() => triggerNodeState('node-2', 'processing')}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '8px',
              backgroundColor: '#4A90E2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Set Node 2: Processing
          </button>
          <button
            onClick={() => triggerNodeState('node-2', 'completed')}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '8px',
              backgroundColor: '#10B981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Set Node 2: Completed
          </button>
          <button
            onClick={() => triggerNodeState('node-2', 'error')}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#EF4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Set Node 2: Error
          </button>
        </div>
      </div>
    </div>
  );
};

export const InteractiveEventTriggers: Story = {
  render: () => <InteractiveEventTriggersRenderer />,
};

/**
 * Story: Pipeline Processing Flow
 * Shows a realistic data pipeline with cascading animations
 */
const PipelineProcessingFlowRenderer = () => {
  const [events, setEvents] = useState<GraphEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runPipeline = () => {
    setIsRunning(true);
    setEvents([]);

    // Simulate pipeline execution
    const sequence = [
      { delay: 0, type: 'edge', target: 'edge-1' },
      { delay: 800, type: 'state', target: 'node-2', state: 'processing' },
      { delay: 2500, type: 'edge', target: 'edge-2' },
      { delay: 3200, type: 'state', target: 'node-2', state: 'completed' },
    ];

    sequence.forEach(({ delay, type, target, state }) => {
      setTimeout(() => {
        if (type === 'edge') {
          setEvents((prev) => [
            ...prev,
            {
              id: `evt-${Date.now()}`,
              type: 'edge_animated',
              timestamp: Date.now(),
              category: 'edge',
              operation: 'animate',
              payload: {
                operation: 'animate',
                edgeId: target,
                edgeType: 'dataflow',
                from: target === 'edge-1' ? 'node-1' : 'node-2',
                to: target === 'edge-1' ? 'node-2' : 'node-3',
                animation: {
                  duration: 1000,
                  direction: 'forward' as const,
                },
              },
            },
          ]);
        } else if (type === 'state' && state) {
          setEvents((prev) => [
            ...prev,
            {
              id: `evt-${Date.now()}`,
              type: 'state_changed',
              timestamp: Date.now(),
              category: 'state',
              operation: 'update',
              payload: {
                nodeId: target,
                newState: state,
              },
            },
          ]);
        }
      }, delay);
    });

    setTimeout(() => setIsRunning(false), 4000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div
        style={{
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 style={{ margin: 0 }}>Pipeline Processing Flow</h3>
        <button
          onClick={runPipeline}
          disabled={isRunning}
          style={{
            padding: '12px 24px',
            backgroundColor: isRunning ? '#ccc' : '#4A90E2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          {isRunning ? 'Running...' : 'Run Pipeline'}
        </button>
      </div>
      <div style={{ flex: 1 }}>
        <GraphRenderer canvas={sampleCanvas} events={events} width="100%" height="100%" />
      </div>
    </div>
  );
};

export const PipelineProcessingFlow: Story = {
  render: () => <PipelineProcessingFlowRenderer />,
};
