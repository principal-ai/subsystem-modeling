import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas, WorkflowChip } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'OTEL/SpanBadges',
  component: GraphRenderer,
  parameters: {
    layout: 'centered',
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

/**
 * Canvas demonstrating all badge types on span convention nodes (hexagons)
 */
const spanBadgesCanvas: ExtendedCanvas = {
  nodes: [
    // Status: Draft (gray D badge)
    {
      id: 'span-draft',
      type: 'text',
      x: 50,
      y: 50,
      width: 180,
      height: 100,
      text: 'Draft Span',
      color: 0, // gray
      pv: {
        nodeType: 'otel-span-convention',
        name: 'Draft Span',
        description: 'Status: draft - shows gray "D" badge at top-left',
        shape: 'hexagon',
        icon: 'GitCommit',
        status: 'draft',
        otel: {
          spanPattern: 'feature.design',
          spanKind: 'INTERNAL',
        },
      },
    },
    // Status: Approved (blue A badge)
    {
      id: 'span-approved',
      type: 'text',
      x: 280,
      y: 50,
      width: 180,
      height: 100,
      text: 'Approved Span',
      color: 5, // cyan
      pv: {
        nodeType: 'otel-span-convention',
        name: 'Approved Span',
        description: 'Status: approved - shows blue "A" badge at top-left',
        shape: 'hexagon',
        icon: 'GitCommit',
        status: 'approved',
        otel: {
          spanPattern: 'feature.approved',
          spanKind: 'INTERNAL',
        },
      },
    },
    // Status: Implemented (green I badge)
    {
      id: 'span-implemented',
      type: 'text',
      x: 510,
      y: 50,
      width: 180,
      height: 100,
      text: 'Implemented Span',
      color: 4, // green
      pv: {
        nodeType: 'otel-span-convention',
        name: 'Implemented Span',
        description: 'Status: implemented - shows green "I" badge at top-left',
        shape: 'hexagon',
        icon: 'GitCommit',
        status: 'implemented',
        otel: {
          spanPattern: 'feature.implemented',
          spanKind: 'INTERNAL',
        },
      },
    },
    // Implemented + Sources (I + S badges)
    {
      id: 'span-with-sources',
      type: 'text',
      x: 50,
      y: 200,
      width: 180,
      height: 100,
      text: 'With Sources',
      color: 4, // green
      pv: {
        nodeType: 'otel-span-convention',
        name: 'With Sources',
        description: 'Implemented with source files - shows "I" badge at top-left and green "S" badge at top-right. Hover to see file paths.',
        shape: 'hexagon',
        icon: 'FileCode',
        status: 'implemented',
        otel: {
          spanPattern: 'feature.process',
          spanKind: 'INTERNAL',
          files: ['src/features/process.ts', 'src/features/handler.ts'],
        },
      },
    },
    // Approved + References (A + R badges)
    {
      id: 'span-with-refs',
      type: 'text',
      x: 280,
      y: 200,
      width: 180,
      height: 100,
      text: 'With References',
      color: 6, // purple
      pv: {
        nodeType: 'otel-span-convention',
        name: 'With References',
        description: 'Approved with references - shows "A" badge at top-left and purple "R" badge at bottom-left. Hover to see reference URLs.',
        shape: 'hexagon',
        icon: 'ExternalLink',
        status: 'approved',
        references: ['https://opentelemetry.io/docs/specs/otel/trace/api/', '@opentelemetry/api'],
        otel: {
          spanPattern: 'http.client.request',
          spanKind: 'CLIENT',
        },
      },
    },
    // All badges: I + S + R
    {
      id: 'span-all-badges',
      type: 'text',
      x: 510,
      y: 200,
      width: 180,
      height: 100,
      text: 'All Badges',
      color: 2, // orange
      pv: {
        nodeType: 'otel-span-convention',
        name: 'All Badges',
        description: 'Implemented with sources and references - shows all three badges: "I" (top-left), "S" (top-right), "R" (bottom-left)',
        shape: 'hexagon',
        icon: 'Layers',
        status: 'implemented',
        references: ['https://docs.example.com/api'],
        otel: {
          spanPattern: 'api.handler',
          spanKind: 'SERVER',
          files: ['src/api/handler.ts'],
        },
      },
    },
    // Boundary: Outbound (arrow badge pointing up-right)
    {
      id: 'boundary-outbound',
      type: 'text',
      x: 50,
      y: 350,
      width: 180,
      height: 100,
      text: 'Outbound Boundary',
      color: 5, // cyan
      pv: {
        nodeType: 'otel-boundary',
        name: 'Outbound Boundary',
        description: 'Outbound boundary span - shows cyan arrow badge pointing up-right on the right edge, indicating calls TO external systems',
        shape: 'hexagon',
        icon: 'ArrowUpRight',
        status: 'implemented',
        boundary: {
          direction: 'outbound',
          node: { 'pv.event.name': 'external.api.response' },
        },
        otel: {
          spanPattern: 'http.client.request',
          spanKind: 'CLIENT',
        },
      },
    },
    // Boundary: Inbound (arrow badge pointing down-left)
    {
      id: 'boundary-inbound',
      type: 'text',
      x: 280,
      y: 350,
      width: 180,
      height: 100,
      text: 'Inbound Boundary',
      color: 5, // cyan
      pv: {
        nodeType: 'otel-boundary',
        name: 'Inbound Boundary',
        description: 'Inbound boundary span - shows cyan arrow badge pointing down-left on the left edge, indicating calls FROM external systems',
        shape: 'hexagon',
        icon: 'ArrowDownLeft',
        status: 'approved',
        boundary: {
          direction: 'inbound',
          node: { 'pv.event.name': 'webhook.payload' },
        },
        otel: {
          spanPattern: 'http.server.request',
          spanKind: 'SERVER',
        },
      },
    },
    // Draft with references only (D + R)
    {
      id: 'span-draft-with-refs',
      type: 'text',
      x: 510,
      y: 350,
      width: 180,
      height: 100,
      text: 'Draft + Refs',
      color: 0, // gray
      pv: {
        nodeType: 'otel-span-convention',
        name: 'Draft + Refs',
        description: 'Draft span with references - shows "D" badge and "R" badge but no "S" badge since not yet implemented',
        shape: 'hexagon',
        icon: 'BookOpen',
        status: 'draft',
        references: ['https://opentelemetry.io/docs/specs/semconv/database/'],
        otel: {
          spanPattern: 'db.query',
          spanKind: 'CLIENT',
        },
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Span Badges Demo',
    description: 'Demonstrates badge types on span convention nodes',
    edgeTypes: {},
  },
};

export const AllBadgeTypes: Story = {
  args: {
    canvas: spanBadgesCanvas,
    width: 750,
    height: 520,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Span Badges Overview**

Badges provide at-a-glance status information on span convention nodes:

| Position | Badge | Color | Meaning |
|----------|-------|-------|---------|
| Top-Left | **D** | Gray | Draft - being designed |
| Top-Left | **A** | Blue | Approved - ready to implement |
| Top-Left | **I** | Green | Implemented - code exists |
| Top-Right | **S** | Green | Has source files linked |
| Bottom-Left | **R** | Purple | Has external references |
| Right Edge | **↗** | Cyan | Outbound boundary |
| Left Edge | **↙** | Cyan | Inbound boundary |

**Row 1**: Status badges only (D, A, I)
**Row 2**: Status + metadata badges (I+S, A+R, I+S+R)
**Row 3**: Boundary badges and combinations
        `,
      },
    },
  },
};

/**
 * Canvas showing implementation lifecycle progression
 */
const lifecycleCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'lifecycle-draft',
      type: 'text',
      x: 50,
      y: 100,
      width: 160,
      height: 90,
      text: 'Planning',
      color: 0,
      pv: {
        nodeType: 'otel-span-convention',
        name: 'Planning',
        description: 'Step 1: Span is being designed',
        shape: 'hexagon',
        icon: 'PenTool',
        status: 'draft',
        otel: {
          spanPattern: 'user.action',
          spanKind: 'INTERNAL',
        },
      },
    },
    {
      id: 'lifecycle-approved',
      type: 'text',
      x: 260,
      y: 100,
      width: 160,
      height: 90,
      text: 'Approved',
      color: 5,
      pv: {
        nodeType: 'otel-span-convention',
        name: 'Approved',
        description: 'Step 2: Design reviewed and approved',
        shape: 'hexagon',
        icon: 'CheckCircle',
        status: 'approved',
        references: ['https://otel.spec/trace'],
        otel: {
          spanPattern: 'user.action',
          spanKind: 'INTERNAL',
        },
      },
    },
    {
      id: 'lifecycle-implemented',
      type: 'text',
      x: 470,
      y: 100,
      width: 160,
      height: 90,
      text: 'Implemented',
      color: 4,
      pv: {
        nodeType: 'otel-span-convention',
        name: 'Implemented',
        description: 'Step 3: Code written and linked',
        shape: 'hexagon',
        icon: 'Code',
        status: 'implemented',
        references: ['https://otel.spec/trace'],
        otel: {
          spanPattern: 'user.action',
          spanKind: 'INTERNAL',
          files: ['src/handlers/user.ts'],
        },
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      fromNode: 'lifecycle-draft',
      toNode: 'lifecycle-approved',
      fromSide: 'right',
      toSide: 'left',
      label: 'review',
    },
    {
      id: 'e2',
      fromNode: 'lifecycle-approved',
      toNode: 'lifecycle-implemented',
      fromSide: 'right',
      toSide: 'left',
      label: 'implement',
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Implementation Lifecycle',
    description: 'Shows badge progression through implementation phases',
    edgeTypes: {
      default: {
        style: 'solid',
        color: '#888',
        directed: true,
      },
    },
  },
};

export const ImplementationLifecycle: Story = {
  args: {
    canvas: lifecycleCanvas,
    width: 700,
    height: 280,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Implementation Lifecycle**

Shows how badges evolve as a span moves through the implementation process:

1. **Planning** (D badge) - Span convention is being designed
2. **Approved** (A + R badges) - Design reviewed, references added
3. **Implemented** (I + S + R badges) - Code written, source files linked

The badges provide immediate visual feedback on implementation progress.
        `,
      },
    },
  },
};

/**
 * Canvas showing boundary spans in a system context
 */
const boundaryCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'internal-service',
      type: 'text',
      x: 250,
      y: 120,
      width: 180,
      height: 90,
      text: 'Internal Service',
      color: 4,
      pv: {
        nodeType: 'otel-span-convention',
        name: 'Internal Service',
        description: 'Internal service span - no boundary badges',
        shape: 'hexagon',
        icon: 'Server',
        status: 'implemented',
        otel: {
          spanPattern: 'service.process',
          spanKind: 'INTERNAL',
          files: ['src/service.ts'],
        },
      },
    },
    {
      id: 'outbound-api',
      type: 'text',
      x: 500,
      y: 50,
      width: 180,
      height: 90,
      text: 'External API',
      color: 5,
      pv: {
        nodeType: 'otel-boundary',
        name: 'External API',
        description: 'Outbound call to external API',
        shape: 'hexagon',
        icon: 'Cloud',
        status: 'implemented',
        boundary: {
          direction: 'outbound',
          node: { 'pv.event.name': 'api.response' },
        },
        otel: {
          spanPattern: 'http.client',
          spanKind: 'CLIENT',
          files: ['src/api/client.ts'],
        },
      },
    },
    {
      id: 'outbound-db',
      type: 'text',
      x: 500,
      y: 190,
      width: 180,
      height: 90,
      text: 'Database',
      color: 5,
      pv: {
        nodeType: 'otel-boundary',
        name: 'Database',
        description: 'Outbound call to database',
        shape: 'hexagon',
        icon: 'Database',
        status: 'implemented',
        boundary: {
          direction: 'outbound',
          node: { 'pv.event.name': 'db.result' },
        },
        otel: {
          spanPattern: 'db.query',
          spanKind: 'CLIENT',
          files: ['src/db/client.ts'],
        },
      },
    },
    {
      id: 'inbound-webhook',
      type: 'text',
      x: 0,
      y: 120,
      width: 180,
      height: 90,
      text: 'Webhook Handler',
      color: 5,
      pv: {
        nodeType: 'otel-boundary',
        name: 'Webhook Handler',
        description: 'Inbound webhook from external system',
        shape: 'hexagon',
        icon: 'Webhook',
        status: 'approved',
        boundary: {
          direction: 'inbound',
          node: { 'pv.event.name': 'webhook.received' },
        },
        otel: {
          spanPattern: 'http.server',
          spanKind: 'SERVER',
        },
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      fromNode: 'inbound-webhook',
      toNode: 'internal-service',
      fromSide: 'right',
      toSide: 'left',
    },
    {
      id: 'e2',
      fromNode: 'internal-service',
      toNode: 'outbound-api',
      fromSide: 'right',
      toSide: 'left',
    },
    {
      id: 'e3',
      fromNode: 'internal-service',
      toNode: 'outbound-db',
      fromSide: 'right',
      toSide: 'left',
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Boundary Spans',
    description: 'Shows boundary badges for system edge spans',
    edgeTypes: {
      default: {
        style: 'dashed',
        color: '#06b6d4',
        directed: true,
      },
    },
  },
};

export const BoundarySpans: Story = {
  args: {
    canvas: boundaryCanvas,
    width: 750,
    height: 350,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Boundary Span Badges**

Boundary spans mark where your system interacts with external systems:

- **↗ Outbound** (right edge): Calls TO external systems (APIs, databases)
- **↙ Inbound** (left edge): Calls FROM external systems (webhooks, events)

Boundary badges **replace** the source badge position since the direction indicator is more important for understanding system topology.

Use boundary spans to identify integration points that need:
- Contract tests
- Timeout handling
- Circuit breakers
- Error recovery strategies
        `,
      },
    },
  },
};

/**
 * Canvas demonstrating workflow chips - showing which workflow.json scenarios
 * reference each span convention
 */
const workflowChipsCanvas = {
  nodes: [
    // Span with multiple workflow associations
    {
      id: 'user-login',
      type: 'otel-span-convention' as const,
      x: 50,
      y: 50,
      width: 200,
      height: 120,
      color: '#8b5cf6',
      label: 'User Login',
      otel: {
        status: 'implemented' as const,
        spanPattern: 'auth.login',
        spanKind: 'SERVER' as const,
        files: ['src/auth/login.ts'],
      },
      workflowChips: [
        { id: 'happy-path', label: 'Happy Path', color: '#22c55e' },
        { id: 'error-handling', label: 'Error Handling', color: '#ef4444' },
        { id: 'rate-limiting', label: 'Rate Limiting', color: '#f97316' },
      ],
    },
    // Span with single workflow
    {
      id: 'token-validate',
      type: 'otel-span-convention' as const,
      x: 300,
      y: 50,
      width: 200,
      height: 120,
      color: '#3b82f6',
      label: 'Token Validation',
      otel: {
        status: 'implemented' as const,
        spanPattern: 'auth.token.validate',
        spanKind: 'INTERNAL' as const,
        files: ['src/auth/token.ts'],
      },
      workflowChips: [
        { id: 'happy-path', label: 'Happy Path', color: '#22c55e' },
      ],
    },
    // Span with many workflows (shows +N more)
    {
      id: 'api-request',
      type: 'otel-span-convention' as const,
      x: 550,
      y: 50,
      width: 200,
      height: 120,
      color: '#06b6d4',
      label: 'API Request',
      otel: {
        status: 'implemented' as const,
        spanPattern: 'http.server.request',
        spanKind: 'SERVER' as const,
        files: ['src/api/handler.ts'],
      },
      workflowChips: [
        { id: 'crud-create', label: 'Create', color: '#22c55e' },
        { id: 'crud-read', label: 'Read', color: '#3b82f6' },
        { id: 'crud-update', label: 'Update', color: '#f97316' },
        { id: 'crud-delete', label: 'Delete', color: '#ef4444' },
        { id: 'batch-ops', label: 'Batch Operations', color: '#8b5cf6' },
      ],
    },
    // Span with no workflow associations
    {
      id: 'db-query',
      type: 'otel-span-convention' as const,
      x: 50,
      y: 220,
      width: 200,
      height: 100,
      color: '#6b7280',
      label: 'Database Query',
      otel: {
        status: 'draft' as const,
        spanPattern: 'db.query',
        spanKind: 'CLIENT' as const,
      },
      // No workflowChips - this span isn't referenced by any workflow yet
    },
    // Span with default colored chips (no color specified)
    {
      id: 'cache-lookup',
      type: 'otel-span-convention' as const,
      x: 300,
      y: 220,
      width: 200,
      height: 100,
      color: '#10b981',
      label: 'Cache Lookup',
      otel: {
        status: 'implemented' as const,
        spanPattern: 'cache.get',
        spanKind: 'INTERNAL' as const,
        files: ['src/cache/client.ts'],
      },
      workflowChips: [
        { id: 'perf-test', label: 'Perf Testing' },
        { id: 'cache-miss', label: 'Cache Miss' },
      ],
    },
  ],
  edges: [
    {
      id: 'e1',
      fromNode: 'user-login',
      toNode: 'token-validate',
      fromSide: 'right',
      toSide: 'left',
    },
    {
      id: 'e2',
      fromNode: 'token-validate',
      toNode: 'api-request',
      fromSide: 'right',
      toSide: 'left',
    },
    {
      id: 'e3',
      fromNode: 'api-request',
      toNode: 'db-query',
      fromSide: 'bottom',
      toSide: 'right',
    },
    {
      id: 'e4',
      fromNode: 'api-request',
      toNode: 'cache-lookup',
      fromSide: 'bottom',
      toSide: 'top',
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Workflow Chips Demo',
    description: 'Demonstrates workflow.json associations on span convention nodes',
    edgeTypes: {
      default: {
        style: 'solid',
        color: '#888',
        directed: true,
      },
    },
  },
};

/**
 * Interactive story showing workflow chip selection
 */
const WorkflowChipsInteractive = () => {
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);

  // Create canvas with click handlers and selection state
  const canvasWithHandlers: ExtendedCanvas = {
    ...workflowChipsCanvas,
    nodes: workflowChipsCanvas.nodes.map((node) => ({
      ...node,
      onWorkflowChipClick: (chipId: string) => {
        setSelectedWorkflow(selectedWorkflow === chipId ? null : chipId);
      },
      selectedWorkflowId: selectedWorkflow,
    })),
  };

  return (
    <div>
      <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: '#f3f4f6', borderRadius: '6px' }}>
        <strong>Selected workflow:</strong>{' '}
        {selectedWorkflow ? (
          <span style={{ color: '#3b82f6' }}>{selectedWorkflow}</span>
        ) : (
          <span style={{ color: '#9ca3af' }}>Click a chip to select</span>
        )}
      </div>
      <GraphRenderer
        canvas={canvasWithHandlers}
        width={800}
        height={400}
      />
    </div>
  );
};

export const WorkflowChips: Story = {
  args: {
    canvas: workflowChipsCanvas as unknown as ExtendedCanvas,
    width: 800,
    height: 400,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Workflow Chips - Associating Spans with Scenarios**

Workflow chips show which \`workflow.json\` scenarios reference each span convention.
This creates a visual link between your span architecture (\`.spans.canvas\`) and
your workflow scenarios (\`.workflow.json\`).

**Features:**
- Colored chips indicate different workflow scenarios
- Max 3 chips shown, with "+N more" for additional workflows
- Chips can be clicked to filter/highlight related spans
- Spans with no workflows appear without chips

**Use cases:**
- See at-a-glance which spans are covered by scenarios
- Identify orphan spans not covered by any workflow
- Navigate between span definitions and their usage
        `,
      },
    },
  },
};

export const WorkflowChipsInteractiveStory: StoryObj = {
  render: () => <WorkflowChipsInteractive />,
  parameters: {
    docs: {
      description: {
        story: `
**Interactive Workflow Selection**

Click on workflow chips to select them. This demonstrates the selection state
that can be used to filter or highlight spans belonging to a specific workflow.
        `,
      },
    },
  },
};
