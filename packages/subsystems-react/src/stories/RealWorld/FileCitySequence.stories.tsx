import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SequenceDiagramRenderer } from '../../components/SequenceDiagramRenderer';
import { WorkflowSequenceDiagram } from '../../components/WorkflowSequenceDiagram';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import workflowData from '../data/file-city-workflows.json';
import type { WorkflowScenario } from '@principal-ai/subsystems-core';

const meta = {
  title: 'RealWorld/FileCitySequence',
  component: SequenceDiagramRenderer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
# File City Image Generation Workflows

This demonstrates the **graph-to-sequence** concepts applied to the File City image generation system.

## Participant Model

Following the sequence-first architecture:

- **Nodes** = Participants (Main Process, Renderer Process)
- **Edges** = Move Events (IPC calls crossing process boundaries)
- **Transform Events** = Internal processing within each participant

## Key Concepts

- **Sequence diagrams are primary** - They show actual execution traces
- **Graphs aggregate sequences** - The canvas shows all possible paths
- **Move vs Transform Events**:
  - **Move**: Data crossing participant boundaries (IPC calls)
  - **Transform**: Internal processing within a participant

See \`/docs/GRAPH_TO_SEQUENCE_CONCEPTS.md\` for the full conceptual model.
        `,
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ height: '100vh', boxSizing: 'border-box' }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof SequenceDiagramRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================================================
// Helper Components
// ============================================================================

interface SequenceWithEventsProps {
  events: SequenceEvent[];
  edges: SequenceEdge[];
  height?: number;
  layoutOptions?: any;
}

const SequenceWithEventsList: React.FC<SequenceWithEventsProps> = ({
  events,
  edges,
  height = 500,
  layoutOptions,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Top Half - Sequence Diagram */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <SequenceDiagramRenderer
          events={events}
          edges={edges}
          height={height}
          layoutOptions={layoutOptions}
        />
      </div>

      {/* Bottom Half - Event List */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        background: '#1e1e1e',
        color: '#d4d4d4',
        fontFamily: 'monospace',
        fontSize: 13,
      }}>
        <div style={{ padding: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#4ec9b0' }}>Event Sequence</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #3e3e3e' }}>
                <th style={{ textAlign: 'left', padding: '8px', color: '#9cdcfe' }}>Order</th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#9cdcfe' }}>Event Name</th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#9cdcfe' }}>Label</th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#9cdcfe' }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => {
                const isMoveEvent = (event as any).moveEvent;
                const participant = event.name.split('.')[0];
                return (
                  <tr key={event.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                    <td style={{ padding: '8px', color: '#b5cea8' }}>{index + 1}</td>
                    <td style={{
                      padding: '8px',
                      color: isMoveEvent ? '#ce9178' : '#dcdcaa',
                      fontWeight: isMoveEvent ? 'bold' : 'normal'
                    }}>
                      {event.name}
                    </td>
                    <td style={{ padding: '8px', color: '#d4d4d4' }}>{event.label}</td>
                    <td style={{
                      padding: '8px',
                      color: isMoveEvent ? '#f48771' : '#569cd6'
                    }}>
                      {isMoveEvent ? '→ Move Event (IPC)' : `Transform (${participant})`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Workflow Stories
// ============================================================================

/**
 * **Happy Path - Cache Hit**
 *
 * Optimal execution path where a cached image already exists.
 *
 * **Flow:**
 * 1. Renderer requests image via IPC
 * 2. Main process checks cache → Hit!
 * 3. Returns cached URL immediately
 * 4. Renderer displays image
 *
 * **Move Events (cross-boundary):**
 * - `main.image_requested` (Renderer → Main)
 * - `renderer.cache_hit` (Main → Renderer)
 */
export const CacheHitFlow: Story = {
  render: () => (
    <SequenceWithEventsList
      events={workflowData.workflows[0].events}
      edges={workflowData.workflows[0].edges}
      height={600}
      layoutOptions={{
        laneWidth: 200,
        eventSpacing: 80,
      }}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Fast path when cached image exists - only 2 IPC calls needed.',
      },
    },
  },
};

/**
 * **Full Generation Flow**
 *
 * Complete execution path when no cached image exists.
 *
 * **Flow:**
 * 1. Renderer requests image via IPC
 * 2. Main process checks cache → Miss
 * 3. Fetches file tree from repository cache
 * 4. Generates new File City visualization
 * 5. Saves to cache
 * 6. Returns generated URL via IPC
 * 7. Renderer displays image
 *
 * **Move Events (cross-boundary):**
 * - `main.image_requested` (Renderer → Main)
 * - `renderer.generation_complete` (Main → Renderer)
 *
 * **Transform Events (internal to Main):**
 * - `cache_checked`, `filetree_fetched`, `generation_started`
 */
export const GenerateNewFlow: Story = {
  render: () => (
    <SequenceWithEventsList
      events={workflowData.workflows[1].events}
      edges={workflowData.workflows[1].edges}
      height={700}
      layoutOptions={{
        laneWidth: 200,
        eventSpacing: 80,
      }}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Full generation path with cache miss - includes image generation.',
      },
    },
  },
};

/**
 * **Error Path - No FileTree**
 *
 * Error handling when file tree is not available.
 *
 * **Flow:**
 * 1. Renderer requests image via IPC
 * 2. Main process checks cache → Miss
 * 3. Attempts to fetch file tree → Not available
 * 4. Skips generation, returns null
 * 5. Renderer displays fallback UI
 *
 * **Move Events:**
 * - `main.image_requested` (Renderer → Main)
 * - `renderer.generation_skipped` (Main → Renderer)
 */
export const NoFileTreeFlow: Story = {
  render: () => (
    <SequenceWithEventsList
      events={workflowData.workflows[2].events}
      edges={workflowData.workflows[2].edges}
      height={600}
      layoutOptions={{
        laneWidth: 200,
        eventSpacing: 80,
      }}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Error handling when repository file tree is unavailable.',
      },
    },
  },
};

/**
 * **Error During Generation**
 *
 * Error handling when image generation fails.
 *
 * **Flow:**
 * 1. Renderer requests image via IPC
 * 2. Main process checks cache → Miss
 * 3. Fetches file tree successfully
 * 4. Starts generation → Error occurs
 * 5. Returns error via IPC
 * 6. Renderer displays fallback UI
 *
 * **Move Events:**
 * - `main.image_requested` (Renderer → Main)
 * - `renderer.generation_error` (Main → Renderer)
 */
export const ErrorFlow: Story = {
  render: () => (
    <SequenceWithEventsList
      events={workflowData.workflows[3].events}
      edges={workflowData.workflows[3].edges}
      height={650}
      layoutOptions={{
        laneWidth: 200,
        eventSpacing: 80,
      }}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Error handling when image generation fails unexpectedly.',
      },
    },
  },
};

/**
 * **Comparison View**
 *
 * Side-by-side comparison of cache hit vs full generation.
 * Shows how the same canvas structure supports multiple execution paths.
 */
export const ComparisonView: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #3e3e3e' }}>
        <h3 style={{ margin: '12px', color: '#d4d4d4' }}>Cache Hit (Fast)</h3>
        <div style={{ flex: 1 }}>
          <SequenceDiagramRenderer
            events={workflowData.workflows[0].events}
            edges={workflowData.workflows[0].edges}
            height={600}
            layoutOptions={{
              laneWidth: 180,
              eventSpacing: 70,
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: '12px', color: '#d4d4d4' }}>Generate New (Full)</h3>
        <div style={{ flex: 1 }}>
          <SequenceDiagramRenderer
            events={workflowData.workflows[1].events}
            edges={workflowData.workflows[1].edges}
            height={600}
            layoutOptions={{
              laneWidth: 180,
              eventSpacing: 70,
            }}
          />
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Visual comparison showing branching execution paths from the same canvas.',
      },
    },
  },
};

/**
 * **All Paths Overview**
 *
 * Grid view of all possible execution paths through the system.
 * Demonstrates the canvas as an "aggregation of sequences" - showing
 * the full possibility space that the canvas represents.
 */
export const AllPathsOverview: Story = {
  render: () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      height: '100vh',
      overflow: 'auto',
      background: '#1e1e1e'
    }}>
      {workflowData.workflows.map((workflow, index) => (
        <div
          key={workflow.id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRight: index % 2 === 0 ? '1px solid #3e3e3e' : 'none',
            borderBottom: index < 2 ? '1px solid #3e3e3e' : 'none'
          }}
        >
          <div style={{ padding: '12px', borderBottom: '1px solid #3e3e3e' }}>
            <h3 style={{ margin: '0 0 4px 0', color: '#d4d4d4' }}>{workflow.name}</h3>
            <p style={{ fontSize: 13, color: '#858585', margin: 0 }}>
              {workflow.description}
            </p>
          </div>
          <div style={{ flex: 1 }}>
            <SequenceDiagramRenderer
              events={workflow.events}
              edges={workflow.edges}
              height={400}
              layoutOptions={{
                laneWidth: 160,
                eventSpacing: 60,
                laneGap: 40,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Complete overview of all execution paths - the "library of possibilities".',
      },
    },
  },
};

/**
 * **Using WorkflowSequenceDiagram Wrapper**
 *
 * Demonstrates the simplified API using the WorkflowSequenceDiagram component.
 * This component automatically handles the conversion from workflow to sequence format.
 */
export const UsingWorkflowWrapper: Story = {
  render: () => {
    // Convert our workflow data to the expected WorkflowScenario format
    const scenario: WorkflowScenario = {
      id: 'cache-hit-flow',
      name: 'Cache Hit Flow',
      description: 'Optimal path where cached image exists',
      events: workflowData.workflows[1].events.map(e => ({
        name: e.name,
        label: e.label,
        moveEvent: e.moveEvent,
        participant: e.participant,
      })),
      edges: workflowData.workflows[1].edges,
      template: {
        events: {},
      },
    };

    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '12px',
          background: '#1e1e1e',
          borderBottom: '1px solid #3e3e3e',
          color: '#d4d4d4'
        }}>
          <h3 style={{ margin: '0 0 4px 0' }}>WorkflowSequenceDiagram Component</h3>
          <p style={{ fontSize: 13, color: '#858585', margin: 0 }}>
            Cleaner API - just pass the workflow scenario and optional canvas
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <WorkflowSequenceDiagram
            scenario={scenario}
            height="100%"
            layoutOptions={{
              laneWidth: 200,
              eventSpacing: 80,
            }}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Simplified API using the WorkflowSequenceDiagram wrapper component.',
      },
    },
  },
};

/**
 * **Interactive Drill-Down**
 *
 * Lanes default to top-level participants. Use the ▶ chevrons on a lane
 * header to drill into its sub-namespaces, and ‹ on a child lane to step
 * back out.
 */
export const InteractiveDrillDown: Story = {
  render: () => {
    const [opened, setOpened] = React.useState<string[]>([]);

    const handleToggle = (namespace: string) => {
      setOpened((prev) =>
        prev.includes(namespace)
          ? prev.filter((n) => n !== namespace)
          : [...prev, namespace]
      );
    };

    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '12px',
          background: '#1e1e1e',
          borderBottom: '1px solid #3e3e3e',
          color: '#d4d4d4',
        }}>
          <strong>Opened:</strong>{' '}
          {opened.length ? opened.join(', ') : 'none (top-level participants)'}
          <p style={{ fontSize: 13, color: '#858585', marginTop: 8, marginBottom: 0 }}>
            ▶ on a lane drills into its sub-namespaces. ‹ on a child lane steps back out.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <SequenceDiagramRenderer
            events={workflowData.workflows[1].events}
            edges={workflowData.workflows[1].edges}
            height={700}
            layoutOptions={{
              openedNamespaces: opened,
              laneWidth: 200,
              eventSpacing: 80,
            }}
            onToggleNamespace={handleToggle}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Drill into participant lanes to reveal their sub-namespaces.',
      },
    },
  },
};
