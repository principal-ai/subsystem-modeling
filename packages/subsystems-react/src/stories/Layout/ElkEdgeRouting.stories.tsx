import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Layout/ElkEdgeRouting',
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

const createNode = (
  id: string,
  x: number,
  y: number,
  label: string,
  color: 1 | 2 | 3 | 4 | 5 | 6 = 4
) => ({
  id,
  type: 'text' as const,
  x,
  y,
  width: 120,
  height: 60,
  text: label,
  color,
  pv: {
    nodeType: 'component',
    shape: 'rectangle' as const,
  },
});

// =============================================================================
// Level 1: Two nodes, one edge
// =============================================================================
const twoNodeCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a', 0, 0, 'Node A', 5),
    createNode('b', 250, 0, 'Node B', 4),
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Two Nodes',
    edgeTypes: {
      flow: { style: 'solid', color: '#3b82f6', width: 2, directed: true },
    },
  },
};

export const Level1_TwoNodes: Story = {
  args: {
    canvas: twoNodeCanvas,
    width: 500,
    height: 200,
    showBackground: true,
    backgroundVariant: 'dots',
  },
};

export const Level1_TwoNodes_ELK: Story = {
  args: {
    canvas: twoNodeCanvas,
    width: 500,
    height: 200,
    showBackground: true,
    backgroundVariant: 'dots',
    elkLayout: { enabled: true, routingStyle: 'orthogonal' },
  },
};

// =============================================================================
// Level 1b: Two nodes with vertical offset
// =============================================================================
const twoNodeVerticalOffsetCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a', 0, 0, 'Node A', 5),
    createNode('b', 250, 100, 'Node B', 4),
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Two Nodes Vertical Offset',
    edgeTypes: {
      flow: { style: 'solid', color: '#3b82f6', width: 2, directed: true },
    },
  },
};

export const Level1b_TwoNodesVerticalOffset: Story = {
  args: {
    canvas: twoNodeVerticalOffsetCanvas,
    width: 500,
    height: 250,
    showBackground: true,
    backgroundVariant: 'dots',
  },
};

export const Level1b_TwoNodesVerticalOffset_ELK: Story = {
  args: {
    canvas: twoNodeVerticalOffsetCanvas,
    width: 500,
    height: 250,
    showBackground: true,
    backgroundVariant: 'dots',
    elkLayout: { enabled: true, routingStyle: 'orthogonal' },
  },
};

// =============================================================================
// Level 1c: Two nodes stacked vertically (target below source)
// =============================================================================
const twoNodeStackedCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a', 50, 0, 'Node A', 5),
    createNode('b', 50, 120, 'Node B', 4),
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b', fromSide: 'bottom', toSide: 'top', pv: { edgeType: 'flow' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Two Nodes Stacked',
    edgeTypes: {
      flow: { style: 'solid', color: '#3b82f6', width: 2, directed: true },
    },
  },
};

export const Level1c_TwoNodesStacked: Story = {
  args: {
    canvas: twoNodeStackedCanvas,
    width: 300,
    height: 300,
    showBackground: true,
    backgroundVariant: 'dots',
  },
};

export const Level1c_TwoNodesStacked_ELK: Story = {
  args: {
    canvas: twoNodeStackedCanvas,
    width: 300,
    height: 300,
    showBackground: true,
    backgroundVariant: 'dots',
    elkLayout: { enabled: true, routingStyle: 'orthogonal' },
  },
};

// =============================================================================
// Level 1d: Vertical routing with horizontal offset (bottom to top connection)
// Tests vertical-first routing: down → right → up
// =============================================================================
const verticalRoutingCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a', 0, 0, 'Node A', 5),
    createNode('b', 200, 150, 'Node B', 4),
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b', fromSide: 'bottom', toSide: 'top', pv: { edgeType: 'flow' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Vertical Routing',
    edgeTypes: {
      flow: { style: 'solid', color: '#3b82f6', width: 2, directed: true },
    },
  },
};

export const Level1d_VerticalRouting: Story = {
  args: {
    canvas: verticalRoutingCanvas,
    width: 450,
    height: 350,
    showBackground: true,
    backgroundVariant: 'dots',
  },
};

export const Level1d_VerticalRouting_ELK: Story = {
  args: {
    canvas: verticalRoutingCanvas,
    width: 450,
    height: 350,
    showBackground: true,
    backgroundVariant: 'dots',
    elkLayout: { enabled: true, routingStyle: 'orthogonal' },
  },
};

// =============================================================================
// Level 2: Three nodes in a line
// =============================================================================
const threeNodeCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a', 0, 0, 'Node A', 5),
    createNode('b', 200, 0, 'Node B', 2),
    createNode('c', 400, 0, 'Node C', 4),
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e2', fromNode: 'b', toNode: 'c', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Three Nodes Linear',
    edgeTypes: {
      flow: { style: 'solid', color: '#3b82f6', width: 2, directed: true },
    },
  },
};

export const Level2_ThreeNodesLinear: Story = {
  args: {
    canvas: threeNodeCanvas,
    width: 600,
    height: 200,
    showBackground: true,
    backgroundVariant: 'dots',
  },
};

export const Level2_ThreeNodesLinear_ELK: Story = {
  args: {
    canvas: threeNodeCanvas,
    width: 600,
    height: 200,
    showBackground: true,
    backgroundVariant: 'dots',
    elkLayout: { enabled: true, routingStyle: 'orthogonal' },
  },
};

// =============================================================================
// Level 3: One source, two targets (fan out)
// =============================================================================
const fanOutCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a', 0, 50, 'Source', 5),
    createNode('b', 250, 0, 'Target 1', 4),
    createNode('c', 250, 100, 'Target 2', 4),
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e2', fromNode: 'a', toNode: 'c', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Fan Out',
    edgeTypes: {
      flow: { style: 'solid', color: '#3b82f6', width: 2, directed: true },
    },
  },
};

export const Level3_FanOut: Story = {
  args: {
    canvas: fanOutCanvas,
    width: 500,
    height: 250,
    showBackground: true,
    backgroundVariant: 'dots',
  },
};

export const Level3_FanOut_ELK: Story = {
  args: {
    canvas: fanOutCanvas,
    width: 500,
    height: 250,
    showBackground: true,
    backgroundVariant: 'dots',
    elkLayout: { enabled: true, routingStyle: 'orthogonal' },
  },
};

// =============================================================================
// Level 4: Two sources, one target (fan in)
// =============================================================================
const fanInCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a', 0, 0, 'Source 1', 5),
    createNode('b', 0, 100, 'Source 2', 5),
    createNode('c', 250, 50, 'Target', 4),
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'c', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e2', fromNode: 'b', toNode: 'c', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Fan In',
    edgeTypes: {
      flow: { style: 'solid', color: '#3b82f6', width: 2, directed: true },
    },
  },
};

export const Level4_FanIn: Story = {
  args: {
    canvas: fanInCanvas,
    width: 500,
    height: 250,
    showBackground: true,
    backgroundVariant: 'dots',
  },
};

export const Level4_FanIn_ELK: Story = {
  args: {
    canvas: fanInCanvas,
    width: 500,
    height: 250,
    showBackground: true,
    backgroundVariant: 'dots',
    elkLayout: { enabled: true, routingStyle: 'orthogonal' },
  },
};

// =============================================================================
// Level 5: Diamond (fan out then fan in)
// =============================================================================
const diamondCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a', 0, 50, 'Start', 5),
    createNode('b', 200, 0, 'Path 1', 2),
    createNode('c', 200, 100, 'Path 2', 2),
    createNode('d', 400, 50, 'End', 4),
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e2', fromNode: 'a', toNode: 'c', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e3', fromNode: 'b', toNode: 'd', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e4', fromNode: 'c', toNode: 'd', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Diamond',
    edgeTypes: {
      flow: { style: 'solid', color: '#3b82f6', width: 2, directed: true },
    },
  },
};

export const Level5_Diamond: Story = {
  args: {
    canvas: diamondCanvas,
    width: 600,
    height: 250,
    showBackground: true,
    backgroundVariant: 'dots',
  },
};

export const Level5_Diamond_ELK: Story = {
  args: {
    canvas: diamondCanvas,
    width: 600,
    height: 250,
    showBackground: true,
    backgroundVariant: 'dots',
    elkLayout: { enabled: true, routingStyle: 'orthogonal' },
  },
};

// =============================================================================
// Level 6: Cross connection (edges that would overlap)
// =============================================================================
const crossCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a1', 0, 0, 'A1', 5),
    createNode('a2', 0, 100, 'A2', 5),
    createNode('b1', 300, 0, 'B1', 4),
    createNode('b2', 300, 100, 'B2', 4),
  ],
  edges: [
    // Crossing edges
    { id: 'e1', fromNode: 'a1', toNode: 'b2', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e2', fromNode: 'a2', toNode: 'b1', fromSide: 'right', toSide: 'left', pv: { edgeType: 'signal' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Cross Connection',
    edgeTypes: {
      flow: { style: 'solid', color: '#3b82f6', width: 2, directed: true },
      signal: { style: 'dashed', color: '#ef4444', width: 2, directed: true },
    },
  },
};

export const Level6_CrossConnection: Story = {
  args: {
    canvas: crossCanvas,
    width: 500,
    height: 250,
    showBackground: true,
    backgroundVariant: 'dots',
  },
};

export const Level6_CrossConnection_ELK: Story = {
  args: {
    canvas: crossCanvas,
    width: 500,
    height: 250,
    showBackground: true,
    backgroundVariant: 'dots',
    elkLayout: { enabled: true, routingStyle: 'orthogonal' },
  },
};

// =============================================================================
// Level 7: Multiple parallel edges (same source/target sides)
// =============================================================================
const parallelCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a', 0, 0, 'Source', 5),
    createNode('b', 300, 0, 'Target', 4),
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b', fromSide: 'right', toSide: 'left', pv: { edgeType: 'data' } },
    { id: 'e2', fromNode: 'a', toNode: 'b', fromSide: 'right', toSide: 'left', pv: { edgeType: 'control' } },
    { id: 'e3', fromNode: 'a', toNode: 'b', fromSide: 'right', toSide: 'left', pv: { edgeType: 'signal' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Parallel Edges',
    edgeTypes: {
      data: { style: 'solid', color: '#3b82f6', width: 2, directed: true },
      control: { style: 'solid', color: '#22c55e', width: 2, directed: true },
      signal: { style: 'dashed', color: '#ef4444', width: 2, directed: true },
    },
  },
};

export const Level7_ParallelEdges: Story = {
  args: {
    canvas: parallelCanvas,
    width: 500,
    height: 200,
    showBackground: true,
    backgroundVariant: 'dots',
  },
};

export const Level7_ParallelEdges_ELK: Story = {
  args: {
    canvas: parallelCanvas,
    width: 500,
    height: 200,
    showBackground: true,
    backgroundVariant: 'dots',
    elkLayout: { enabled: true, routingStyle: 'orthogonal' },
  },
};

// =============================================================================
// Level 8: Complex - 3x3 grid with various connections
// =============================================================================
const complexCanvas: ExtendedCanvas = {
  nodes: [
    // Left column
    createNode('l1', 0, 0, 'L1', 5),
    createNode('l2', 0, 100, 'L2', 5),
    createNode('l3', 0, 200, 'L3', 5),
    // Middle column
    createNode('m1', 200, 50, 'M1', 2),
    createNode('m2', 200, 150, 'M2', 2),
    // Right column
    createNode('r1', 400, 0, 'R1', 4),
    createNode('r2', 400, 100, 'R2', 4),
    createNode('r3', 400, 200, 'R3', 4),
  ],
  edges: [
    // Left to middle
    { id: 'e1', fromNode: 'l1', toNode: 'm1', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e2', fromNode: 'l2', toNode: 'm1', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e3', fromNode: 'l2', toNode: 'm2', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e4', fromNode: 'l3', toNode: 'm2', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    // Middle to right
    { id: 'e5', fromNode: 'm1', toNode: 'r1', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e6', fromNode: 'm1', toNode: 'r2', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e7', fromNode: 'm2', toNode: 'r2', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    { id: 'e8', fromNode: 'm2', toNode: 'r3', fromSide: 'right', toSide: 'left', pv: { edgeType: 'flow' } },
    // Cross connections
    { id: 'e9', fromNode: 'l1', toNode: 'r3', fromSide: 'right', toSide: 'left', pv: { edgeType: 'signal' } },
    { id: 'e10', fromNode: 'l3', toNode: 'r1', fromSide: 'right', toSide: 'left', pv: { edgeType: 'signal' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Complex Graph',
    edgeTypes: {
      flow: { style: 'solid', color: '#3b82f6', width: 2, directed: true },
      signal: { style: 'dashed', color: '#ef4444', width: 2, directed: true },
    },
  },
};

export const Level8_Complex: Story = {
  args: {
    canvas: complexCanvas,
    width: 600,
    height: 350,
    showBackground: true,
    backgroundVariant: 'dots',
  },
};

export const Level8_Complex_ELK: Story = {
  args: {
    canvas: complexCanvas,
    width: 600,
    height: 350,
    showBackground: true,
    backgroundVariant: 'dots',
    elkLayout: { enabled: true, routingStyle: 'orthogonal' },
  },
};
