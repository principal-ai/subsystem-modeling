import React, { useState, useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas, GraphEvent, ComponentLibrary } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

// Helper component that sets initial node states via events
const GraphWithInitialStates: React.FC<{
  canvas: ExtendedCanvas;
  width: number;
  height: number;
  showMinimap: boolean;
  initialStates?: Record<string, string>;
}> = ({ canvas, width, height, showMinimap, initialStates }) => {
  const [events, setEvents] = useState<GraphEvent[]>([]);

  useEffect(() => {
    if (initialStates) {
      const stateEvents: GraphEvent[] = Object.entries(initialStates).map(
        ([nodeId, newState], idx) => ({
          id: `init-state-${idx}`,
          type: 'state_changed',
          timestamp: Date.now(),
          category: 'state' as const,
          payload: { nodeId, newState },
        })
      );
      setEvents(stateEvents);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run only on mount
  }, []);

  return (
    <GraphRenderer
      canvas={canvas}
      width={width}
      height={height}
      showMinimap={showMinimap}
      events={events}
    />
  );
};

const meta = {
  title: 'Audit/ColorPriority',
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

// ============================================================================
// Node Color Priority Story
// Priority: state color > node data color (pv.fill) > node.color > type definition color > default (#888)
// ============================================================================

const nodeColorPriorityCanvas: ExtendedCanvas = {
  nodes: [
    // 1. Default color only (no color specified anywhere)
    {
      id: 'default-only',
      type: 'text',
      x: 100,
      y: 100,
      width: 180,
      height: 100,
      text: 'SOURCE: Default\nEXPECT: Gray',
      pv: {
        nodeType: 'default-demo',
        shape: 'rectangle',
      },
    },
    // 2. Type definition color via node.color
    {
      id: 'node-color',
      type: 'text',
      x: 320,
      y: 100,
      width: 180,
      height: 100,
      text: 'SOURCE: node.color\nEXPECT: BLUE',
      color: '#0000FF',
      pv: {
        nodeType: 'color-demo',
        shape: 'rectangle',
      },
    },
    // 3. pv.fill overrides node.color
    {
      id: 'pv-fill',
      type: 'text',
      x: 540,
      y: 100,
      width: 180,
      height: 100,
      text: 'SOURCE: pv.fill\nEXPECT: GREEN\n(node.color=BLUE ignored)',
      color: '#0000FF', // This should be overridden
      pv: {
        nodeType: 'fill-demo',
        shape: 'rectangle',
        fill: '#00FF00', // This wins
      },
    },
    // 4. State color overrides everything (idle state)
    {
      id: 'state-color-idle',
      type: 'text',
      x: 760,
      y: 100,
      width: 180,
      height: 100,
      text: 'SOURCE: state.idle.color\nEXPECT: RED\n(pv.fill & node.color ignored)',
      color: '#0000FF', // Overridden
      pv: {
        nodeType: 'state-demo',
        shape: 'rectangle',
        fill: '#00FF00', // Overridden
        states: {
          idle: { label: 'Idle', color: '#FF0000' },
          active: { label: 'Active', color: '#FFFF00' },
        },
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Node Color Priority Demo',
    description: 'Shows how node colors are prioritized',
    edgeTypes: {},
  },
};

export const NodeColorPriority: Story = {
  render: () => (
    <GraphWithInitialStates
      canvas={nodeColorPriorityCanvas}
      width={1050}
      height={320}
      showMinimap={false}
      initialStates={{ 'state-color-idle': 'idle' }}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: `
**Node Fill Color Priority** (highest to lowest):

1. **State color** - When a node has an active state with a color defined
2. **pv.fill** - Explicit fill color in the PV extension
3. **node.color** - The standard canvas node color property
4. **Type definition color** - Color defined in the node type
5. **Default** - Falls back to #888

In this demo:
- Node 1: No color specified → uses default #888
- Node 2: Only node.color → shows blue
- Node 3: Both node.color AND pv.fill → pv.fill (green) wins
- Node 4: Has state "idle" with purple color → state color wins over everything
        `,
      },
    },
  },
};

// ============================================================================
// Node Stroke Color Priority Story
// Priority: pv.stroke > type definition stroke > fill color
// ============================================================================

const strokeColorPriorityCanvas: ExtendedCanvas = {
  nodes: [
    // 1. Stroke defaults to fill color
    {
      id: 'stroke-default',
      type: 'text',
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      text: 'SOURCE: Default (=fill)\nEXPECT BORDER: BLUE\n(same as fill color)',
      color: '#0000FF',
      pv: {
        nodeType: 'stroke-default-demo',
        shape: 'rectangle',
      },
    },
    // 2. Explicit stroke color
    {
      id: 'stroke-explicit',
      type: 'text',
      x: 340,
      y: 100,
      width: 200,
      height: 100,
      text: 'SOURCE: pv.stroke\nEXPECT BORDER: RED\n(fill is BLUE)',
      color: '#0000FF', // Fill is blue
      pv: {
        nodeType: 'stroke-explicit-demo',
        shape: 'rectangle',
        stroke: '#FF0000', // But stroke is red
      },
    },
    // 3. Different fill and stroke
    {
      id: 'fill-and-stroke',
      type: 'text',
      x: 580,
      y: 100,
      width: 200,
      height: 100,
      text: 'SOURCE: pv.fill + pv.stroke\nEXPECT BORDER: YELLOW\nEXPECT FILL: GREEN',
      pv: {
        nodeType: 'both-demo',
        shape: 'rectangle',
        fill: '#00FF00',
        stroke: '#FFFF00',
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Stroke Color Priority Demo',
    description: 'Shows how stroke colors are prioritized',
    edgeTypes: {},
  },
};

export const StrokeColorPriority: Story = {
  args: {
    canvas: strokeColorPriorityCanvas,
    width: 880,
    height: 320,
    showMinimap: false,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Node Stroke Color Priority** (highest to lowest):

1. **pv.stroke** - Explicit stroke color in the PV extension
2. **Type definition stroke** - Stroke defined in node type
3. **Fill color** - Falls back to the resolved fill color

In this demo:
- Node 1: No stroke specified → border matches fill color (blue)
- Node 2: Blue fill but red pv.stroke → red border
- Node 3: Green fill with orange stroke → independent colors
        `,
      },
    },
  },
};

// ============================================================================
// Edge Color Priority Story
// Priority: edge.color > edge type definition color > default
// ============================================================================

const edgeColorPriorityCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'source-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 180,
      height: 70,
      text: 'SOURCE: edgeType color\nEXPECT EDGE: BLUE',
      color: '#888888',
      pv: { nodeType: 'source', shape: 'rectangle' },
    },
    {
      id: 'target-1',
      type: 'text',
      x: 450,
      y: 100,
      width: 100,
      height: 70,
      text: 'Target',
      color: '#888888',
      pv: { nodeType: 'target', shape: 'rectangle' },
    },
    {
      id: 'source-2',
      type: 'text',
      x: 100,
      y: 220,
      width: 180,
      height: 70,
      text: 'SOURCE: edge.color\nEXPECT EDGE: RED\n(edgeType=BLUE ignored)',
      color: '#888888',
      pv: { nodeType: 'source', shape: 'rectangle' },
    },
    {
      id: 'target-2',
      type: 'text',
      x: 450,
      y: 220,
      width: 100,
      height: 70,
      text: 'Target',
      color: '#888888',
      pv: { nodeType: 'target', shape: 'rectangle' },
    },
    {
      id: 'source-3',
      type: 'text',
      x: 100,
      y: 340,
      width: 180,
      height: 70,
      text: 'SOURCE: Default\nEXPECT EDGE: Gray',
      color: '#888888',
      pv: { nodeType: 'source', shape: 'rectangle' },
    },
    {
      id: 'target-3',
      type: 'text',
      x: 450,
      y: 340,
      width: 100,
      height: 70,
      text: 'Target',
      color: '#888888',
      pv: { nodeType: 'target', shape: 'rectangle' },
    },
  ],
  edges: [
    // 1. Edge type color only (from edgeTypes definition)
    {
      id: 'edge-type-color',
      fromNode: 'source-1',
      toNode: 'target-1',
      pv: {
        edgeType: 'dataflow', // Uses edgeTypes.dataflow.color = BLUE
      },
    },
    // 2. Edge's own color overrides edge type
    {
      id: 'edge-own-color',
      fromNode: 'source-2',
      toNode: 'target-2',
      color: '#FF0000', // RED - overrides the edge type color
      pv: {
        edgeType: 'dataflow', // Would be blue, but overridden
      },
    },
    // 3. No color specified (default)
    {
      id: 'edge-default',
      fromNode: 'source-3',
      toNode: 'target-3',
      pv: {
        edgeType: 'uncolored', // No color in edge type
      },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Edge Color Priority Demo',
    description: 'Shows how edge colors are prioritized',
    edgeTypes: {
      dataflow: {
        style: 'solid',
        color: '#0000FF', // BLUE
        directed: true,
      },
      uncolored: {
        style: 'dashed',
        directed: true,
        // No color defined
      },
    },
  },
};

export const EdgeColorPriority: Story = {
  args: {
    canvas: edgeColorPriorityCanvas,
    width: 650,
    height: 520,
    showMinimap: false,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Edge Color Priority** (highest to lowest):

1. **edge.color** - The edge's own color property
2. **Edge type definition color** - Color from pv.edgeTypes[type].color
3. **Default** - System default edge color

In this demo:
- Edge 1: Uses "dataflow" type → shows cyan from edgeTypes
- Edge 2: Has edge.color AND uses "dataflow" type → purple (edge.color) wins
- Edge 3: Uses "uncolored" type with no color → default styling
        `,
      },
    },
  },
};

// ============================================================================
// Icon Priority Story
// Priority: node data icon > state icon > type definition icon
// ============================================================================

const iconPriorityCanvas: ExtendedCanvas = {
  nodes: [
    // 1. Type definition icon only
    {
      id: 'icon-type',
      type: 'text',
      x: 100,
      y: 100,
      width: 180,
      height: 100,
      text: 'SOURCE: pv.icon\nEXPECT ICON: Settings',
      color: '#0000FF',
      pv: {
        nodeType: 'icon-type-demo',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
    // 2. State icon (when in a state)
    {
      id: 'icon-state',
      type: 'text',
      x: 320,
      y: 100,
      width: 180,
      height: 100,
      text: 'SOURCE: state.icon\nEXPECT ICON: Check\n(pv.icon=settings ignored)',
      color: '#00FF00',
      pv: {
        nodeType: 'icon-state-demo',
        shape: 'rectangle',
        icon: 'Settings', // Type icon - should be overridden
        states: {
          complete: { label: 'Complete', color: '#00FF00', icon: 'Check' },
        },
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Icon Priority Demo',
    description: 'Shows how icons are prioritized',
    edgeTypes: {},
  },
};

export const IconPriority: Story = {
  render: () => (
    <GraphWithInitialStates
      canvas={iconPriorityCanvas}
      width={600}
      height={320}
      showMinimap={false}
      initialStates={{ 'icon-state': 'complete' }}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: `
**Icon Priority** (highest to lowest):

1. **Node data icon override** - Explicitly set icon in node data
2. **State icon** - Icon from the current state definition
3. **Type definition icon** - Icon from pv.icon

In this demo:
- Node 1: Only has type icon (settings) → shows settings
- Node 2: Has type icon (settings) BUT is in "complete" state with check icon → shows check
        `,
      },
    },
  },
};

// ============================================================================
// Combined Priority Demo - All in One
// ============================================================================

const combinedPriorityCanvas: ExtendedCanvas = {
  nodes: [
    // Row 1 label
    {
      id: 'label-row1',
      type: 'text',
      x: 50,
      y: 50,
      width: 700,
      height: 40,
      text: 'FILL COLOR PRIORITY (low to high): Default → node.color → pv.fill → state.color',
      pv: { nodeType: 'label', shape: 'rectangle' },
    },
    // Lowest priority
    {
      id: 'fill-1',
      type: 'text',
      x: 50,
      y: 120,
      width: 150,
      height: 80,
      text: 'SOURCE: Default\nEXPECT: Gray',
      pv: { nodeType: 'fill-demo', shape: 'rectangle' },
    },
    // node.color
    {
      id: 'fill-2',
      type: 'text',
      x: 230,
      y: 120,
      width: 150,
      height: 80,
      text: 'SOURCE: node.color\nEXPECT: BLUE',
      color: '#0000FF',
      pv: { nodeType: 'fill-demo', shape: 'rectangle' },
    },
    // pv.fill
    {
      id: 'fill-3',
      type: 'text',
      x: 410,
      y: 120,
      width: 150,
      height: 80,
      text: 'SOURCE: pv.fill\nEXPECT: GREEN',
      color: '#0000FF',
      pv: { nodeType: 'fill-demo', shape: 'rectangle', fill: '#00FF00' },
    },
    // state color
    {
      id: 'fill-4',
      type: 'text',
      x: 590,
      y: 120,
      width: 150,
      height: 80,
      text: 'SOURCE: state.color\nEXPECT: RED',
      color: '#0000FF',
      pv: {
        nodeType: 'fill-demo',
        shape: 'rectangle',
        fill: '#00FF00',
        states: { error: { label: 'Error', color: '#FF0000' } },
      },
    },
    // Row 2 label
    {
      id: 'label-row2',
      type: 'text',
      x: 50,
      y: 240,
      width: 500,
      height: 40,
      text: 'STROKE PRIORITY (low to high): fill color → pv.stroke',
      pv: { nodeType: 'label', shape: 'rectangle' },
    },
    // Stroke = fill
    {
      id: 'stroke-1',
      type: 'text',
      x: 50,
      y: 310,
      width: 180,
      height: 80,
      text: 'SOURCE: Default (=fill)\nEXPECT BORDER: BLUE',
      color: '#0000FF',
      pv: { nodeType: 'stroke-demo', shape: 'rectangle' },
    },
    // pv.stroke
    {
      id: 'stroke-2',
      type: 'text',
      x: 260,
      y: 310,
      width: 180,
      height: 80,
      text: 'SOURCE: pv.stroke\nEXPECT BORDER: YELLOW',
      color: '#0000FF',
      pv: { nodeType: 'stroke-demo', shape: 'rectangle', stroke: '#FFFF00' },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Combined Color Priority Demo',
    description: 'Overview of all color priorities',
    edgeTypes: {},
  },
};

export const CombinedPriorityOverview: Story = {
  render: () => (
    <GraphWithInitialStates
      canvas={combinedPriorityCanvas}
      width={850}
      height={480}
      showMinimap={false}
      initialStates={{ 'fill-4': 'error' }}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: `
**Complete Color Priority Reference**

This story shows all color priority chains at a glance:

**Fill Color:** Default (#888) → node.color → pv.fill → State color

**Stroke Color:** Fill color → pv.stroke

Higher priority always wins when multiple values are specified.
        `,
      },
    },
  },
};

// ============================================================================
// Library Color Priority Story
// Priority: library.nodeComponents.color → node.color → pv.fill → state.color
// ============================================================================

const libraryColorTestLibrary: ComponentLibrary = {
  version: '1.0.0',
  name: 'Color Test Library',
  description: 'Library for testing color inheritance',
  resources: {},
  nodeComponents: {
    'service-red': {
      description: 'Service with red color from library',
      shape: 'rectangle',
      color: '#FF0000', // RED from library
      icon: 'Server',
    },
    'service-green': {
      description: 'Service with green color from library',
      shape: 'rectangle',
      color: '#00FF00', // GREEN from library
      icon: 'Database',
    },
    'service-blue': {
      description: 'Service with blue color from library',
      shape: 'rectangle',
      color: '#0000FF', // BLUE from library
      icon: 'Settings',
    },
    'service-purple': {
      description: 'Service with purple color from library',
      shape: 'rectangle',
      color: '#8B00FF', // PURPLE from library
      icon: 'Zap',
    },
  },
  edgeComponents: {
    'flow-orange': {
      description: 'Flow edge with orange color from library',
      style: 'solid',
      color: '#FFA500', // ORANGE from library
      directed: true,
    },
    'flow-cyan': {
      description: 'Flow edge with cyan color from library',
      style: 'solid',
      color: '#00FFFF', // CYAN from library
      directed: true,
    },
  },
};

const libraryColorPriorityCanvas: ExtendedCanvas = {
  nodes: [
    // 1. Library color only (nodeType references library, no other colors)
    {
      id: 'library-only',
      type: 'text',
      x: 100,
      y: 100,
      width: 180,
      height: 100,
      text: 'SOURCE: library\nEXPECT: RED\n(from service-red)',
      pv: {
        nodeType: 'service-red', // Should get RED from library
        shape: 'rectangle',
      },
    },
    // 2. Library color overridden by node.color
    {
      id: 'library-vs-node-color',
      type: 'text',
      x: 320,
      y: 100,
      width: 180,
      height: 100,
      text: 'SOURCE: node.color\nEXPECT: YELLOW\n(library GREEN ignored)',
      color: '#FFFF00', // YELLOW - should override library GREEN
      pv: {
        nodeType: 'service-green', // Would be GREEN, but overridden
        shape: 'rectangle',
      },
    },
    // 3. Library color overridden by pv.fill
    {
      id: 'library-vs-pv-fill',
      type: 'text',
      x: 540,
      y: 100,
      width: 180,
      height: 100,
      text: 'SOURCE: pv.fill\nEXPECT: CYAN\n(library BLUE ignored)',
      pv: {
        nodeType: 'service-blue', // Would be BLUE, but overridden
        shape: 'rectangle',
        fill: '#00FFFF', // CYAN - should override library BLUE
      },
    },
    // 4. Library color overridden by state color
    {
      id: 'library-vs-state',
      type: 'text',
      x: 760,
      y: 100,
      width: 180,
      height: 100,
      text: 'SOURCE: state.color\nEXPECT: ORANGE\n(library PURPLE ignored)',
      pv: {
        nodeType: 'service-purple', // Would be PURPLE, but overridden by state
        shape: 'rectangle',
        states: {
          active: { label: 'Active', color: '#FFA500' }, // ORANGE
        },
      },
    },
    // 5. Another library color node for comparison
    {
      id: 'library-green',
      type: 'text',
      x: 100,
      y: 250,
      width: 180,
      height: 100,
      text: 'SOURCE: library\nEXPECT: GREEN\n(from service-green)',
      pv: {
        nodeType: 'service-green',
        shape: 'rectangle',
      },
    },
    // 6. Library blue for comparison
    {
      id: 'library-blue',
      type: 'text',
      x: 320,
      y: 250,
      width: 180,
      height: 100,
      text: 'SOURCE: library\nEXPECT: BLUE\n(from service-blue)',
      pv: {
        nodeType: 'service-blue',
        shape: 'rectangle',
      },
    },
  ],
  edges: [
    // Edge using library color
    {
      id: 'edge-library-orange',
      fromNode: 'library-green',
      toNode: 'library-blue',
      pv: {
        edgeType: 'flow-orange', // Should get ORANGE from library
      },
    },
    // Edge with library color overridden
    {
      id: 'edge-override',
      fromNode: 'library-only',
      toNode: 'library-vs-node-color',
      color: '#FF00FF', // MAGENTA - overrides library
      pv: {
        edgeType: 'flow-cyan', // Would be CYAN, but overridden
      },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Library Color Priority Demo',
    description: 'Shows how library.yaml colors are applied and overridden',
    edgeTypes: {},
  },
};

// Helper component for library color test
const GraphWithLibrary: React.FC<{
  canvas: ExtendedCanvas;
  library: ComponentLibrary;
  width: number;
  height: number;
  showMinimap: boolean;
  initialStates?: Record<string, string>;
}> = ({ canvas, library, width, height, showMinimap, initialStates }) => {
  const [events, setEvents] = useState<GraphEvent[]>([]);

  useEffect(() => {
    if (initialStates) {
      const stateEvents: GraphEvent[] = Object.entries(initialStates).map(
        ([nodeId, newState], idx) => ({
          id: `init-state-${idx}`,
          type: 'state_changed',
          timestamp: Date.now(),
          category: 'state' as const,
          payload: { nodeId, newState },
        })
      );
      setEvents(stateEvents);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run only on mount
  }, []);

  return (
    <GraphRenderer
      canvas={canvas}
      library={library}
      width={width}
      height={height}
      showMinimap={showMinimap}
      events={events}
    />
  );
};

export const LibraryColorPriority: Story = {
  render: () => (
    <GraphWithLibrary
      canvas={libraryColorPriorityCanvas}
      library={libraryColorTestLibrary}
      width={1050}
      height={450}
      showMinimap={false}
      initialStates={{ 'library-vs-state': 'active' }}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: `
**Library Color Priority** - Tests colors from library.yaml nodeComponents

This story validates that the \`library\` prop correctly provides colors to nodes via nodeType lookup.

**Full Fill Color Priority Chain** (lowest to highest):
1. **Default** - Falls back to #888 gray
2. **Library nodeComponent color** - Color from library.yaml nodeComponents[nodeType].color
3. **node.color** - The standard canvas node color property
4. **pv.fill** - Explicit fill color in the PV extension
5. **state.color** - When a node has an active state with a color defined

**In this demo:**
- Row 1 Node 1: Uses \`service-red\` nodeType → gets RED from library
- Row 1 Node 2: Uses \`service-green\` nodeType but has node.color=YELLOW → YELLOW wins
- Row 1 Node 3: Uses \`service-blue\` nodeType but has pv.fill=CYAN → CYAN wins
- Row 1 Node 4: Uses \`service-purple\` nodeType but is in "active" state → ORANGE wins
- Row 2: Pure library colors (GREEN, BLUE) for visual comparison

**Edge Colors:**
- Bottom edge: Uses \`flow-orange\` edgeType → gets ORANGE from library
- Top edge: Uses \`flow-cyan\` but has edge.color=MAGENTA → MAGENTA wins
        `,
      },
    },
  },
};
