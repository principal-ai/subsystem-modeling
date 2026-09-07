import React, { useState, useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import '@xyflow/react/dist/style.css';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

// Import canvas files from Backlog.md repository
// Architecture canvases
import scopesCanvasUrl from '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views/architecture.scopes.canvas?url';
import spansCanvasUrl from '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views/architecture.spans.canvas?url';

// Event namespace canvas
import eventsCanvasUrl from '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views/backlog-md.events.canvas?url';

// OTEL workflow canvases
import initOtelCanvasUrl from '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views/init/init.otel.canvas?url';
import taskManagementOtelCanvasUrl from '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views/task-management/task-management.otel.canvas?url';
import decisionManagementOtelCanvasUrl from '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views/decision-management/decision-management.otel.canvas?url';
import cleanupOperationsOtelCanvasUrl from '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views/cleanup-operations/cleanup-operations.otel.canvas?url';
import milestoneManagementOtelCanvasUrl from '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views/milestone-management/milestone-management.otel.canvas?url';
import draftManagementOtelCanvasUrl from '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views/draft-management/draft-management.otel.canvas?url';
import documentManagementOtelCanvasUrl from '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views/document-management/document-management.otel.canvas?url';
import entryPointsOtelCanvasUrl from '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views/entry-points/entry-points.otel.canvas?url';
import searchOperationsOtelCanvasUrl from '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views/search-operations/search-operations.otel.canvas?url';

// Helper to load canvas from URL
async function loadCanvas(url: string): Promise<ExtendedCanvas> {
  const response = await fetch(url);
  return await response.json();
}

// Wrapper component that loads canvas data
function CanvasLoader({
  url,
  children,
  showBackground = false,
  editable = true
}: {
  url: string;
  children: (canvas: ExtendedCanvas) => React.ReactNode;
  showBackground?: boolean;
  editable?: boolean;
}) {
  const [canvas, setCanvas] = useState<ExtendedCanvas | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCanvas(url)
      .then(setCanvas)
      .catch((err) => setError(err.message));
  }, [url]);

  if (error) {
    return <div style={{ padding: 20, color: 'red' }}>Error loading canvas: {error}</div>;
  }

  if (!canvas) {
    return <div style={{ padding: 20 }}>Loading canvas...</div>;
  }

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      {children(canvas)}
    </div>
  );
}

const meta = {
  title: 'RealWorld/BacklogMdCanvases',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ width: '100vw', height: '100vh' }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof GraphRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================================================
// Architecture Canvas Files
// ============================================================================

/**
 * Architecture Scopes Canvas
 *
 * File: architecture.scopes.canvas
 * Type: otel-scope nodes
 * Purpose: Documents instrumentation scopes for the Backlog.md system
 */
export const ArchitectureScopes: Story = {
  render: () => (
    <CanvasLoader url={scopesCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **architecture.scopes.canvas** from the Backlog.md repository.

This canvas shows the instrumentation architecture with:
- **CLI Scope** - Command-line interface operations
- **MCP Server Scope** - Model Context Protocol server integration
- **HTTP Server Scope** - REST API server (draft)
- **Terminal UI Scope** - Interactive terminal interface (draft)
- **Web UI Scope** - React-based browser interface (draft)
- **Backlog.md Core Scope** - Core library for task management

**Node Type:** \`otel-scope\`
**Visual Style:** Rectangle nodes with scope colors
**Status:** Shows implementation status (implemented/draft)

**Use this to:**
- Preview scope architecture visualization
- Verify scope node rendering with status badges
- Test edge relationships between scopes
        `,
      },
    },
  },
};

/**
 * Architecture Spans Canvas
 *
 * File: architecture.spans.canvas
 * Type: otel-span-convention nodes
 * Purpose: Defines span naming conventions and valid parent-child relationships
 */
export const ArchitectureSpans: Story = {
  render: () => (
    <CanvasLoader url={spansCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **architecture.spans.canvas** from the Backlog.md repository.

This canvas documents span naming conventions for user-level workflows:
- Task management operations (create, edit, view, list, complete, archive)
- Milestone operations
- Draft operations
- Document operations
- Decision operations
- Search operations

**Node Type:** \`otel-span-convention\`
**Visual Style:** Hexagon nodes with span patterns
**Metadata:** Includes span kind, parent patterns, and workflow chips

**Use this to:**
- Preview span convention documentation
- Verify hexagon shape rendering for span conventions
- Test workflow chip display
        `,
      },
    },
  },
};

// ============================================================================
// Event Namespace Canvas
// ============================================================================

/**
 * Event Namespace Canvas
 *
 * File: backlog-md.events.canvas
 * Type: otel-event nodes
 * Purpose: Shows the vocabulary of events emitted by the system
 */
export const EventNamespace: Story = {
  render: () => (
    <CanvasLoader url={eventsCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} editable={true} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **backlog-md.events.canvas** from the Backlog.md repository.

This canvas shows core system events:
- **Task Events** - task.created, task.updated, task.completed
- **Document Events** - document.created
- **Search Events** - search.executed

**Node Type:** \`otel-event\`
**Visual Style:** Rectangle nodes with event colors
**Metadata:** Event attributes schema with type and required fields

**Event Attributes:**
Each event node documents its attribute schema:
- Attribute names and types
- Required vs optional fields
- Implementation status and scope

**Use this to:**
- Preview event vocabulary documentation
- Verify event node rendering with attributes
- Test event schema tooltips
        `,
      },
    },
  },
};

// ============================================================================
// OTEL Workflow Canvas Files
// ============================================================================

/**
 * Init Workflow Canvas
 *
 * File: init/init.otel.canvas
 * Type: otel-event nodes (workflow)
 * Purpose: Documents the initialization workflow for Backlog.md
 */
export const InitWorkflow: Story = {
  render: () => (
    <CanvasLoader url={initOtelCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **init/init.otel.canvas** workflow from the Backlog.md repository.

This canvas shows the initialization workflow events for setting up a new Backlog.md repository.

**Use this to:**
- Preview workflow event sequences
- Test event-to-event flow visualization
- Verify implementation status badges
        `,
      },
    },
  },
};

/**
 * Task Management Workflow Canvas
 *
 * File: task-management/task-management.otel.canvas
 * Type: otel-event nodes (workflow)
 * Purpose: Comprehensive task management operations
 */
export const TaskManagementWorkflow: Story = {
  render: () => (
    <CanvasLoader url={taskManagementOtelCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **task-management/task-management.otel.canvas** workflow.

This canvas shows comprehensive task management workflows including:
- **Create Task** - Started → Validated → Saved → Committed → Complete
- **Edit Task** - Started → Loaded → Validated → Updated → Committed → Complete
- **View Task** - Started → Loaded → Complete
- **List Tasks** - Started → Loaded → Filtered → Complete
- **Demote Task** - Started → Loaded → Moved → Committed → Complete
- **Archive Task** - Started → Located → Moved → Committed → Complete
- **Complete Task** - Started → Located → Moved → Committed → Complete
- **Error Handling** - Error paths from all workflows

**Node Type:** \`otel-event\`
**Visual Style:** Sequential flow with color-coded event phases
- Green: Start/Complete events
- Blue: Processing events
- Orange: Commit events
- Red: Error events

**Edge Types:**
- **flow** - Normal workflow progression (solid lines)
- **error** - Error paths (dashed red lines)

**Use this to:**
- Preview complex multi-workflow canvases
- Test event sequence rendering
- Verify error path visualization
- Demonstrate real-world workflow complexity
        `,
      },
    },
  },
};

/**
 * Decision Management Workflow Canvas
 *
 * File: decision-management/decision-management.otel.canvas
 * Type: otel-event nodes (workflow)
 * Purpose: Decision tracking and management operations
 */
export const DecisionManagementWorkflow: Story = {
  render: () => (
    <CanvasLoader url={decisionManagementOtelCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **decision-management/decision-management.otel.canvas** workflow.

This canvas shows decision management workflows for tracking architectural and project decisions.

**Use this to:**
- Preview decision tracking workflows
- Test workflow event rendering variations
        `,
      },
    },
  },
};

/**
 * Cleanup Operations Workflow Canvas
 *
 * File: cleanup-operations/cleanup-operations.otel.canvas
 * Type: otel-event nodes (workflow)
 * Purpose: Batch cleanup and maintenance operations
 */
export const CleanupOperationsWorkflow: Story = {
  render: () => (
    <CanvasLoader url={cleanupOperationsOtelCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **cleanup-operations/cleanup-operations.otel.canvas** workflow.

This canvas shows cleanup and maintenance workflows for batch operations.

**Use this to:**
- Preview batch operation workflows
- Test cleanup event visualization
        `,
      },
    },
  },
};

/**
 * Milestone Management Workflow Canvas
 *
 * File: milestone-management/milestone-management.otel.canvas
 * Type: otel-event nodes (workflow)
 * Purpose: Milestone tracking and management operations
 */
export const MilestoneManagementWorkflow: Story = {
  render: () => (
    <CanvasLoader url={milestoneManagementOtelCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **milestone-management/milestone-management.otel.canvas** workflow.

This canvas shows milestone management workflows for project planning.

**Use this to:**
- Preview milestone workflow visualization
- Test milestone event rendering
        `,
      },
    },
  },
};

/**
 * Draft Management Workflow Canvas
 *
 * File: draft-management/draft-management.otel.canvas
 * Type: otel-event nodes (workflow)
 * Purpose: Draft document management and promotion operations
 */
export const DraftManagementWorkflow: Story = {
  render: () => (
    <CanvasLoader url={draftManagementOtelCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **draft-management/draft-management.otel.canvas** workflow.

This canvas shows draft management workflows including draft creation, promotion, and filesystem operations.

**Use this to:**
- Preview draft workflow visualization
- Test draft promotion event flows
        `,
      },
    },
  },
};

/**
 * Document Management Workflow Canvas
 *
 * File: document-management/document-management.otel.canvas
 * Type: otel-event nodes (workflow)
 * Purpose: Document CRUD operations
 */
export const DocumentManagementWorkflow: Story = {
  render: () => (
    <CanvasLoader url={documentManagementOtelCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **document-management/document-management.otel.canvas** workflow.

This canvas shows document management workflows for creating, viewing, updating, and searching documents.

**Use this to:**
- Preview document workflow visualization
- Test document CRUD event flows
        `,
      },
    },
  },
};

/**
 * Entry Points Workflow Canvas
 *
 * File: entry-points/entry-points.otel.canvas
 * Type: otel-event nodes (workflow)
 * Purpose: System entry point operations (CLI, MCP, HTTP)
 */
export const EntryPointsWorkflow: Story = {
  render: () => (
    <CanvasLoader url={entryPointsOtelCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **entry-points/entry-points.otel.canvas** workflow.

This canvas shows entry point workflows for different interfaces:
- CLI requests
- MCP tool invocations
- HTTP requests
- Completed tasks list

**Use this to:**
- Preview multi-interface entry point visualization
- Test entry point event flows
        `,
      },
    },
  },
};

/**
 * Search Operations Workflow Canvas
 *
 * File: search-operations/search-operations.otel.canvas
 * Type: otel-event nodes (workflow)
 * Purpose: Search and indexing operations
 */
export const SearchOperationsWorkflow: Story = {
  render: () => (
    <CanvasLoader url={searchOperationsOtelCanvasUrl}>
      {(canvas) => <GraphRenderer canvas={canvas} showBackground={false} />}
    </CanvasLoader>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Renders the **search-operations/search-operations.otel.canvas** workflow.

This canvas shows search and indexing workflows for content discovery.

**Use this to:**
- Preview search workflow visualization
- Test search event flows
        `,
      },
    },
  },
};

// ============================================================================
// Combined Views
// ============================================================================

/**
 * All Canvas Types - Grid View
 *
 * Shows all canvas types in a grid layout for comparison
 */
export const AllCanvasTypesGrid: Story = {
  render: () => {
    const [canvases, setCanvases] = useState<{
      scopes?: ExtendedCanvas;
      spans?: ExtendedCanvas;
      events?: ExtendedCanvas;
      taskManagement?: ExtendedCanvas;
      init?: ExtendedCanvas;
    }>({});

    useEffect(() => {
      Promise.all([
        loadCanvas(scopesCanvasUrl),
        loadCanvas(spansCanvasUrl),
        loadCanvas(eventsCanvasUrl),
        loadCanvas(taskManagementOtelCanvasUrl),
        loadCanvas(initOtelCanvasUrl),
      ]).then(([scopes, spans, events, taskManagement, init]) => {
        setCanvases({ scopes, spans, events, taskManagement, init });
      });
    }, []);

    if (!canvases.scopes) {
      return <div style={{ padding: 20 }}>Loading all canvases...</div>;
    }

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        padding: '20px',
        height: '100vh',
        overflow: 'auto'
      }}>
        <div>
          <h3 style={{ marginTop: 0, fontSize: '16px', marginBottom: '10px' }}>Architecture Scopes</h3>
          <div style={{ height: '300px', border: '1px solid #ccc', borderRadius: '4px' }}>
            <GraphRenderer canvas={canvases.scopes} showBackground={false} />
          </div>
        </div>
        <div>
          <h3 style={{ marginTop: 0, fontSize: '16px', marginBottom: '10px' }}>Architecture Spans</h3>
          <div style={{ height: '300px', border: '1px solid #ccc', borderRadius: '4px' }}>
            {canvases.spans && <GraphRenderer canvas={canvases.spans} showBackground={false} />}
          </div>
        </div>
        <div>
          <h3 style={{ marginTop: 0, fontSize: '16px', marginBottom: '10px' }}>Event Namespace</h3>
          <div style={{ height: '300px', border: '1px solid #ccc', borderRadius: '4px' }}>
            {canvases.events && <GraphRenderer canvas={canvases.events} showBackground={false} />}
          </div>
        </div>
        <div>
          <h3 style={{ marginTop: 0, fontSize: '16px', marginBottom: '10px' }}>Init Workflow</h3>
          <div style={{ height: '300px', border: '1px solid #ccc', borderRadius: '4px' }}>
            {canvases.init && <GraphRenderer canvas={canvases.init} showBackground={false} />}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0, fontSize: '16px', marginBottom: '10px' }}>Task Management Workflow</h3>
          <div style={{ height: '500px', border: '1px solid #ccc', borderRadius: '4px' }}>
            {canvases.taskManagement && <GraphRenderer canvas={canvases.taskManagement} showBackground={false} />}
          </div>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: `
Shows multiple canvas types from the Backlog.md repository in a grid layout.

This view helps:
- Compare visual styling across different canvas types
- Test layout consistency
- Verify theme application across all canvas variations
- Spot visual regressions quickly
- Demonstrate the complete range of canvas file formats

**Canvas Types Shown:**
1. **Architecture Scopes** - System component scopes
2. **Architecture Spans** - Span naming conventions
3. **Event Namespace** - Event vocabulary
4. **Init Workflow** - Initialization events
5. **Task Management Workflow** - Complete task workflow (largest example)
        `,
      },
    },
  },
};

/**
 * All Workflow Canvases - Tabbed View
 *
 * Shows all workflow canvases with a selector
 */
export const AllWorkflowCanvases: Story = {
  render: () => {
    const [selectedWorkflow, setSelectedWorkflow] = useState<string>('task-management');
    const [canvas, setCanvas] = useState<ExtendedCanvas | null>(null);

    const workflows = {
      'init': { url: initOtelCanvasUrl, title: 'Init Workflow' },
      'task-management': { url: taskManagementOtelCanvasUrl, title: 'Task Management' },
      'decision-management': { url: decisionManagementOtelCanvasUrl, title: 'Decision Management' },
      'cleanup-operations': { url: cleanupOperationsOtelCanvasUrl, title: 'Cleanup Operations' },
      'milestone-management': { url: milestoneManagementOtelCanvasUrl, title: 'Milestone Management' },
      'draft-management': { url: draftManagementOtelCanvasUrl, title: 'Draft Management' },
      'document-management': { url: documentManagementOtelCanvasUrl, title: 'Document Management' },
      'entry-points': { url: entryPointsOtelCanvasUrl, title: 'Entry Points' },
      'search-operations': { url: searchOperationsOtelCanvasUrl, title: 'Search Operations' },
    };

    useEffect(() => {
      const workflow = workflows[selectedWorkflow as keyof typeof workflows];
      if (workflow) {
        loadCanvas(workflow.url).then(setCanvas);
      }
    }, [selectedWorkflow]);

    return (
      <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #ccc',
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          backgroundColor: '#f5f5f5'
        }}>
          <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Select Workflow:</label>
          {Object.entries(workflows).map(([key, { title }]) => (
            <button
              key={key}
              onClick={() => setSelectedWorkflow(key)}
              style={{
                padding: '8px 16px',
                backgroundColor: selectedWorkflow === key ? '#3b82f6' : '#fff',
                color: selectedWorkflow === key ? '#fff' : '#000',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: selectedWorkflow === key ? 'bold' : 'normal',
              }}
            >
              {title}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          {canvas ? (
            <GraphRenderer canvas={canvas} showBackground={false} />
          ) : (
            <div style={{ padding: 20 }}>Loading canvas...</div>
          )}
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: `
Interactive view showing all workflow canvases with a selector.

This view helps:
- Browse through all workflow variations
- Compare workflow complexity
- Test workflow canvas rendering across different domains
- Demonstrate the versatility of the .otel.canvas format

**Available Workflows:**
- **Init** - Repository initialization
- **Task Management** - Complete task lifecycle (most complex)
- **Decision Management** - Decision tracking
- **Cleanup Operations** - Batch cleanup
- **Milestone Management** - Project milestones
- **Draft Management** - Draft promotion
- **Document Management** - Document CRUD
- **Entry Points** - System interfaces
- **Search Operations** - Search and indexing
        `,
      },
    },
  },
};
