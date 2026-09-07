import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Audit/DiamondBadges',
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
 * Canvas showing diamond badge positioning at diamond corners
 */
const diamondBadgesCanvas: ExtendedCanvas = {
  nodes: [
    // Diamond with status badge (top point)
    {
      id: 'diamond-status',
      type: 'text',
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      text: 'Status',
      color: 2, // orange
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'GitBranch',
        status: 'draft',
      },
    },
    // Diamond with sources badge (right point)
    {
      id: 'diamond-sources',
      type: 'text',
      x: 280,
      y: 100,
      width: 100,
      height: 100,
      text: 'Sources',
      color: 4, // green
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'FileCode',
        sources: ['src/decisions/router.ts'],
      },
    },
    // Diamond with boundary outbound badge (right point)
    {
      id: 'diamond-boundary-out',
      type: 'text',
      x: 460,
      y: 100,
      width: 100,
      height: 100,
      text: 'Out',
      color: 5, // cyan
      pv: {
        nodeType: 'boundary',
        shape: 'diamond',
        icon: 'ArrowUpRight',
        boundary: {
          direction: 'outbound',
          node: { 'pv.event.name': 'external.call' },
        },
      },
    },
    // Diamond with boundary inbound badge (left point)
    {
      id: 'diamond-boundary-in',
      type: 'text',
      x: 640,
      y: 100,
      width: 100,
      height: 100,
      text: 'In',
      color: 5, // cyan
      pv: {
        nodeType: 'boundary',
        shape: 'diamond',
        icon: 'ArrowDownLeft',
        boundary: {
          direction: 'inbound',
          node: { 'pv.event.name': 'webhook.received' },
        },
      },
    },
    // Diamond with both status and sources badges
    {
      id: 'diamond-both',
      type: 'text',
      x: 100,
      y: 280,
      width: 100,
      height: 100,
      text: 'Both',
      color: 6, // purple
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'Layers',
        status: 'approved',
        sources: ['src/core/decision.ts'],
      },
    },
    // Larger diamond with badges
    {
      id: 'diamond-large',
      type: 'text',
      x: 280,
      y: 250,
      width: 150,
      height: 150,
      text: 'Large',
      color: 2,
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'Maximize',
        status: 'implemented',
        sources: ['src/large.ts'],
      },
    },
    // Small diamond with badges
    {
      id: 'diamond-small',
      type: 'text',
      x: 500,
      y: 290,
      width: 70,
      height: 70,
      text: 'S',
      color: 4,
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'Minimize',
        status: 'draft',
        sources: ['src/small.ts'],
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Diamond Badge Positioning',
    description: 'Demonstrates badge placement at diamond corners',
    edgeTypes: {},
  },
};

export const BadgePositioning: Story = {
  args: {
    canvas: diamondBadgesCanvas,
    width: 850,
    height: 500,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Diamond Badge Positioning**

Badges on diamond shapes are positioned at the actual diamond corners (points), not at the rectangular bounding box corners:

- **Status badge** (D/A/I): Positioned at the **LEFT point** of the diamond
- **Sources badge** (S): Positioned at the **RIGHT point** of the diamond
- **Boundary outbound** (↗): Positioned at the **RIGHT point**
- **Boundary inbound** (↙): Positioned at the **LEFT point**

This ensures badges sit directly on the visible shape rather than floating in empty space.

**Row 1**: Individual badge types
**Row 2**: Combined badges and size variations
        `,
      },
    },
  },
};

/**
 * Compare badge positioning across all shapes
 */
const shapeComparisonCanvas: ExtendedCanvas = {
  nodes: [
    // Rectangle with badges
    {
      id: 'rect-badges',
      type: 'text',
      x: 100,
      y: 100,
      width: 120,
      height: 80,
      text: 'Rectangle',
      color: 6,
      pv: {
        nodeType: 'event',
        shape: 'rectangle',
        icon: 'Square',
        status: 'draft',
        sources: ['src/rect.ts'],
      },
    },
    // Circle with badges
    {
      id: 'circle-badges',
      type: 'text',
      x: 280,
      y: 100,
      width: 100,
      height: 100,
      text: 'Circle',
      color: 5,
      pv: {
        nodeType: 'event',
        shape: 'circle',
        icon: 'Circle',
        status: 'approved',
        sources: ['src/circle.ts'],
      },
    },
    // Hexagon with badges
    {
      id: 'hex-badges',
      type: 'text',
      x: 440,
      y: 100,
      width: 120,
      height: 100,
      text: 'Hexagon',
      color: 4,
      pv: {
        nodeType: 'event',
        shape: 'hexagon',
        icon: 'Hexagon',
        status: 'implemented',
        sources: ['src/hex.ts'],
      },
    },
    // Diamond with badges
    {
      id: 'diamond-badges',
      type: 'text',
      x: 620,
      y: 100,
      width: 100,
      height: 100,
      text: 'Diamond',
      color: 2,
      pv: {
        nodeType: 'event',
        shape: 'diamond',
        icon: 'Diamond',
        status: 'draft',
        sources: ['src/diamond.ts'],
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Shape Badge Comparison',
    description: 'Compare badge positioning across all shapes',
    edgeTypes: {},
  },
};

export const ShapeComparison: Story = {
  args: {
    canvas: shapeComparisonCanvas,
    width: 850,
    height: 300,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Badge Positioning Across Shapes**

Compare how badges are positioned on different shapes:

- **Rectangle**: Badges at top-left and top-right corners of the bounding box
- **Circle**: Badges at top-left and top-right corners of the bounding box
- **Hexagon**: Badges at top-left and top-right corners of the bounding box
- **Diamond**: Badges at the LEFT point (status) and RIGHT point (sources) of the diamond shape

The diamond positioning ensures badges appear on the visible shape rather than floating in the empty corners of the bounding box.
        `,
      },
    },
  },
};

/**
 * Diamond boundary nodes in workflow
 */
const diamondWorkflowCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'start',
      type: 'text',
      x: 100,
      y: 150,
      width: 100,
      height: 60,
      text: 'Request',
      color: 4,
      pv: {
        nodeType: 'event',
        shape: 'rectangle',
        icon: 'Play',
      },
    },
    {
      id: 'decision',
      type: 'text',
      x: 280,
      y: 130,
      width: 100,
      height: 100,
      text: 'Route?',
      color: 2,
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'GitBranch',
        status: 'implemented',
      },
    },
    {
      id: 'external-call',
      type: 'text',
      x: 460,
      y: 50,
      width: 100,
      height: 100,
      text: 'API',
      color: 5,
      pv: {
        nodeType: 'boundary',
        shape: 'diamond',
        icon: 'Cloud',
        boundary: {
          direction: 'outbound',
          node: { 'pv.event.name': 'api.call' },
        },
      },
    },
    {
      id: 'internal',
      type: 'text',
      x: 460,
      y: 200,
      width: 100,
      height: 60,
      text: 'Cache',
      color: 4,
      pv: {
        nodeType: 'event',
        shape: 'rectangle',
        icon: 'Database',
        sources: ['src/cache.ts'],
      },
    },
    {
      id: 'end',
      type: 'text',
      x: 640,
      y: 130,
      width: 100,
      height: 100,
      text: 'Done',
      color: 4,
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'CheckCircle',
        status: 'approved',
      },
    },
  ],
  edges: [
    { id: 'e1', fromNode: 'start', toNode: 'decision', fromSide: 'right', toSide: 'left' },
    { id: 'e2', fromNode: 'decision', toNode: 'external-call', fromSide: 'top', toSide: 'left' },
    { id: 'e3', fromNode: 'decision', toNode: 'internal', fromSide: 'bottom', toSide: 'left' },
    { id: 'e4', fromNode: 'external-call', toNode: 'end', fromSide: 'right', toSide: 'top' },
    { id: 'e5', fromNode: 'internal', toNode: 'end', fromSide: 'right', toSide: 'bottom' },
  ],
  pv: {
    version: '1.0.0',
    name: 'Diamond Workflow',
    description: 'Workflow with diamond decision and boundary nodes',
    edgeTypes: {
      default: {
        style: 'solid',
        color: '#888',
        directed: true,
      },
    },
  },
};

export const WorkflowWithDiamonds: Story = {
  args: {
    canvas: diamondWorkflowCanvas,
    width: 850,
    height: 400,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Diamond Nodes in Workflow Context**

Shows diamond-shaped decision and boundary nodes in a realistic workflow:

1. **Request** starts the flow
2. **Route?** diamond decision point with status badge at left point
3. **API** diamond boundary node with outbound badge at right point
4. **Cache** rectangle for internal operation
5. **Done** diamond with status badge at left point

The badges on diamond nodes are positioned at the actual points of the diamond shape.
        `,
      },
    },
  },
};

/**
 * Canvas demonstrating the new files (S) and references (R) badges
 */
const filesAndReferencesCanvas: ExtendedCanvas = {
  nodes: [
    // Node with otel.files only (S badge)
    {
      id: 'files-only',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 80,
      text: 'Files Only',
      color: 4, // green
      pv: {
        nodeType: 'event',
        shape: 'rectangle',
        icon: 'FileCode',
        otel: {
          kind: 'type',
          files: ['src/auth/login.ts', 'src/auth/logout.ts'],
        },
      },
    },
    // Node with references only (R badge)
    {
      id: 'refs-only',
      type: 'text',
      x: 300,
      y: 100,
      width: 140,
      height: 80,
      text: 'Refs Only',
      color: 6, // purple
      pv: {
        nodeType: 'event',
        shape: 'rectangle',
        icon: 'ExternalLink',
        references: ['@opentelemetry/api', 'https://opentelemetry.io/docs'],
      },
    },
    // Node with both files and references (S + R badges)
    {
      id: 'both-badges',
      type: 'text',
      x: 500,
      y: 100,
      width: 140,
      height: 80,
      text: 'Both Badges',
      color: 2, // orange
      pv: {
        nodeType: 'event',
        shape: 'rectangle',
        icon: 'Layers',
        otel: {
          kind: 'service',
          files: ['src/api/handler.ts'],
        },
        references: ['@principal-ai/core'],
      },
    },
    // Diamond with files
    {
      id: 'diamond-files',
      type: 'text',
      x: 100,
      y: 250,
      width: 100,
      height: 100,
      text: 'Files',
      color: 4,
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'FileCode',
        otel: {
          kind: 'type',
          files: ['src/router.ts'],
        },
      },
    },
    // Diamond with references
    {
      id: 'diamond-refs',
      type: 'text',
      x: 280,
      y: 250,
      width: 100,
      height: 100,
      text: 'Refs',
      color: 6,
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'ExternalLink',
        references: ['https://docs.example.com'],
      },
    },
    // Diamond with both
    {
      id: 'diamond-both',
      type: 'text',
      x: 460,
      y: 250,
      width: 100,
      height: 100,
      text: 'Both',
      color: 2,
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'Layers',
        otel: {
          kind: 'instance',
          files: ['src/decision.ts'],
        },
        references: ['@some/package'],
      },
    },
    // Circle with both badges
    {
      id: 'circle-both',
      type: 'text',
      x: 640,
      y: 250,
      width: 100,
      height: 100,
      text: 'Circle',
      color: 5,
      pv: {
        nodeType: 'event',
        shape: 'circle',
        icon: 'Circle',
        otel: {
          kind: 'service',
          files: ['src/service.ts'],
        },
        references: ['https://api.docs.com'],
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Files and References Badges',
    description: 'Demonstrates otel.files (S) and references (R) badges',
    edgeTypes: {},
  },
};

export const FilesAndReferences: Story = {
  args: {
    canvas: filesAndReferencesCanvas,
    width: 850,
    height: 450,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Files (S) and References (R) Badges**

Two types of badges indicate different metadata:

- **S badge** (green): Shows source files where the event is instrumented (\`pv.otel.files\`)
- **R badge** (purple): Shows external references like packages or documentation (\`pv.references\`)

**Row 1 - Rectangles:**
- Files Only: Has \`otel.files\` → shows S badge
- Refs Only: Has \`references\` → shows R badge
- Both Badges: Has both → shows S and R badges side by side

**Row 2 - Other Shapes:**
- Diamond, Circle shapes with various badge combinations

Hover over nodes to see the full file paths and reference URLs in the tooltip.
        `,
      },
    },
  },
};
