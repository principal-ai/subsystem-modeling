import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Audit/BoundaryNodes',
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
 * Canvas showing boundary node visual treatment
 */
const boundaryNodesCanvas: ExtendedCanvas = {
  nodes: [
    // Regular node for comparison
    {
      id: 'regular-node',
      type: 'text',
      x: 100,
      y: 100,
      width: 160,
      height: 80,
      text: '# Regular Node\nSharp corners',
      color: 6, // purple
      pv: {
        nodeType: 'event',
        name: 'Regular Node',
        description: 'A standard event node with sharp corners',
        sources: ['src/events/regular.ts'],
        event: {
          name: 'app.regular-event',
          description: 'Regular event',
          attributes: {},
        },
      },
    },
    // Outbound boundary node
    {
      id: 'outbound-boundary',
      type: 'text',
      x: 350,
      y: 100,
      width: 180,
      height: 80,
      text: '# Host Callback\nPersists layout',
      color: 5, // cyan
      pv: {
        nodeType: 'boundary',
        name: 'onBatchLayoutInitialized',
        description: 'Calls host to persist batch layout data',
        boundary: {
          direction: 'outbound',
          node: {
            'pv.event.name': 'host.batch-layout-initialized',
            'pv.event.namespace': 'collection-host',
          },
        },
      },
    },
    // Inbound boundary node
    {
      id: 'inbound-boundary',
      type: 'text',
      x: 620,
      y: 100,
      width: 180,
      height: 80,
      text: '# Webhook\nRepository created',
      color: 5, // cyan
      pv: {
        nodeType: 'boundary',
        name: 'onRepositoryCreated',
        description: 'Called by GitHub when a repository is created',
        boundary: {
          direction: 'inbound',
          node: {
            'pv.event.name': 'webhook.repository-created',
            'pv.event.namespace': 'github',
          },
        },
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Boundary Nodes Demo',
    description: 'Demonstrates boundary node visual treatment',
    edgeTypes: {},
  },
};

export const BoundaryVsRegular: Story = {
  args: {
    canvas: boundaryNodesCanvas,
    width: 900,
    height: 300,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Boundary Node Visual Treatment**

Boundary nodes represent interaction points where control crosses system edges.
They have distinct visual treatment:

- **Rounded corners** (8px border-radius) to visually distinguish from regular nodes
- **Direction badge** in top-right corner:
  - ↗ (arrow up-right) for **outbound** boundaries - this system calls external
  - ↙ (arrow down-left) for **inbound** boundaries - external calls this system
- **Cyan badge color** (#06b6d4) to match boundary theme
- **No sources badge** since boundary nodes don't have local source files

Compare with the regular node on the left which has:
- Sharp corners (0 border-radius)
- Green "S" sources badge (when sources are defined)
        `,
      },
    },
  },
};

/**
 * Canvas showing boundary nodes in a workflow context
 */
const workflowWithBoundariesCanvas: ExtendedCanvas = {
  nodes: [
    // Internal event
    {
      id: 'batch-save',
      type: 'text',
      x: 100,
      y: 150,
      width: 160,
      height: 70,
      text: '# Batch Save\nSaves regions',
      color: 4, // green
      pv: {
        nodeType: 'event',
        name: 'batch-save',
        event: {
          name: 'collection-map.batch-save',
          description: 'Saved regions to local state',
          attributes: {},
        },
      },
    },
    // Outbound to host
    {
      id: 'host-persist',
      type: 'text',
      x: 350,
      y: 150,
      width: 180,
      height: 70,
      text: '# Host: Persist\nSaves to backend',
      color: 5, // cyan
      pv: {
        nodeType: 'boundary',
        name: 'onBatchLayoutInitialized',
        boundary: {
          direction: 'outbound',
          node: {
            'pv.event.name': 'host.batch-layout-initialized',
          },
        },
      },
    },
    // Another internal event
    {
      id: 'layout-complete',
      type: 'text',
      x: 620,
      y: 150,
      width: 160,
      height: 70,
      text: '# Layout Complete\nUI updated',
      color: 4, // green
      pv: {
        nodeType: 'event',
        name: 'layout-complete',
        event: {
          name: 'collection-map.layout-complete',
          description: 'Layout computation finished',
          attributes: {},
        },
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      fromNode: 'batch-save',
      toNode: 'host-persist',
      fromSide: 'right',
      toSide: 'left',
    },
    {
      id: 'e2',
      fromNode: 'host-persist',
      toNode: 'layout-complete',
      fromSide: 'right',
      toSide: 'left',
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Workflow with Boundaries',
    description: 'Shows boundary nodes in workflow context',
    edgeTypes: {
      default: {
        style: 'solid',
        color: '#888',
        directed: true,
      },
    },
  },
};

export const WorkflowContext: Story = {
  args: {
    canvas: workflowWithBoundariesCanvas,
    width: 900,
    height: 350,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Boundary Nodes in Workflow Context**

This shows how boundary nodes appear in a typical workflow:

1. **Internal Event** (green, sharp corners) - Code we own and instrument
2. **Boundary Node** (cyan, rounded corners) - Calls external system
3. **Internal Event** (green, sharp corners) - Continues after external call

The boundary node visually breaks the flow to indicate control leaving the system.
The ↗ badge indicates this is an outbound call (we call them, they don't call us).
        `,
      },
    },
  },
};

/**
 * Canvas showing different boundary directions
 */
const boundaryDirectionsCanvas: ExtendedCanvas = {
  nodes: [
    // Outbound examples
    {
      id: 'outbound-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 180,
      height: 70,
      text: '# Host Callback\nonBatchLayout',
      color: 5,
      pv: {
        nodeType: 'boundary',
        name: 'onBatchLayout',
        boundary: {
          direction: 'outbound',
          node: { 'pv.event.name': 'host.batch-layout' },
        },
      },
    },
    {
      id: 'outbound-2',
      type: 'text',
      x: 350,
      y: 100,
      width: 180,
      height: 70,
      text: '# API Call\nPOST /payments',
      color: 5,
      pv: {
        nodeType: 'boundary',
        name: 'createPayment',
        boundary: {
          direction: 'outbound',
          node: { 'pv.event.name': 'stripe.payment-created' },
        },
      },
    },
    // Inbound examples
    {
      id: 'inbound-1',
      type: 'text',
      x: 100,
      y: 250,
      width: 180,
      height: 70,
      text: '# Webhook\nrepo.created',
      color: 5,
      pv: {
        nodeType: 'boundary',
        name: 'onRepoCreated',
        boundary: {
          direction: 'inbound',
          node: { 'pv.event.name': 'github.repo-created' },
        },
      },
    },
    {
      id: 'inbound-2',
      type: 'text',
      x: 350,
      y: 250,
      width: 180,
      height: 70,
      text: '# Message\norder.placed',
      color: 5,
      pv: {
        nodeType: 'boundary',
        name: 'onOrderPlaced',
        boundary: {
          direction: 'inbound',
          node: { 'pv.event.name': 'queue.order-placed' },
        },
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Boundary Directions',
    description: 'Outbound vs Inbound boundary nodes',
    edgeTypes: {},
    nodeTypes: {
      boundary: {
        description: 'External system boundary',
        color: '#06b6d4',
      },
    },
  },
};

export const DirectionComparison: Story = {
  args: {
    canvas: boundaryDirectionsCanvas,
    width: 650,
    height: 400,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Outbound vs Inbound Boundaries**

**Top row - Outbound (↗)**
- Host callbacks we invoke
- API calls we make
- Messages we publish

**Bottom row - Inbound (↙)**
- Webhooks that call us
- Queue messages we consume
- Events we subscribe to

The direction badge makes it immediately clear which way control flows across the boundary.
        `,
      },
    },
  },
};
