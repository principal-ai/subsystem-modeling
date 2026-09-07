import React, { useState, useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { swapGraphOrientation } from '../../utils/orientationUtils';
import { CanvasConverter } from '@principal-ai/subsystems-core';

const meta = {
  title: 'Layout/GraphOrientation',
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
 * Canvas with horizontal flow (left to right)
 */
const horizontalCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'start',
      type: 'text',
      x: 100,
      y: 200,
      width: 120,
      height: 80,
      text: 'Start',
      color: 4,
      pv: {
        nodeType: 'process',
        shape: 'circle',
        icon: 'Play',
      },
    },
    {
      id: 'process-1',
      type: 'text',
      x: 300,
      y: 200,
      width: 140,
      height: 80,
      text: 'Process 1',
      color: 6,
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Box',
      },
    },
    {
      id: 'decision',
      type: 'text',
      x: 520,
      y: 200,
      width: 100,
      height: 100,
      text: 'Decision',
      color: 2,
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'GitBranch',
      },
    },
    {
      id: 'process-2a',
      type: 'text',
      x: 700,
      y: 120,
      width: 140,
      height: 80,
      text: 'Process 2A',
      color: 6,
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Box',
      },
    },
    {
      id: 'process-2b',
      type: 'text',
      x: 700,
      y: 280,
      width: 140,
      height: 80,
      text: 'Process 2B',
      color: 6,
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Box',
      },
    },
    {
      id: 'end',
      type: 'text',
      x: 920,
      y: 200,
      width: 120,
      height: 80,
      text: 'End',
      color: 5,
      pv: {
        nodeType: 'process',
        shape: 'circle',
        icon: 'CheckCircle',
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      fromNode: 'start',
      toNode: 'process-1',
      fromSide: 'right',
      toSide: 'left',
      pv: {
        edgeType: 'flow',
      },
    },
    {
      id: 'e2',
      fromNode: 'process-1',
      toNode: 'decision',
      fromSide: 'right',
      toSide: 'left',
      pv: {
        edgeType: 'flow',
      },
    },
    {
      id: 'e3',
      fromNode: 'decision',
      toNode: 'process-2a',
      fromSide: 'top',
      toSide: 'left',
      pv: {
        edgeType: 'flow',
      },
    },
    {
      id: 'e4',
      fromNode: 'decision',
      toNode: 'process-2b',
      fromSide: 'bottom',
      toSide: 'left',
      pv: {
        edgeType: 'flow',
      },
    },
    {
      id: 'e5',
      fromNode: 'process-2a',
      toNode: 'end',
      fromSide: 'right',
      toSide: 'top',
      pv: {
        edgeType: 'flow',
      },
    },
    {
      id: 'e6',
      fromNode: 'process-2b',
      toNode: 'end',
      fromSide: 'right',
      toSide: 'bottom',
      pv: {
        edgeType: 'flow',
      },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Horizontal Flow',
    description: 'Graph with horizontal (left-to-right) orientation',
    edgeTypes: {
      flow: {
        description: 'Flow connection',
        style: 'solid',
        color: '#888',
      },
    },
  },
};

/**
 * Interactive story demonstrating orientation swap
 */
const OrientationSwapTemplate = () => {
  const [isVertical, setIsVertical] = useState(false);

  const canvas = useMemo(() => {
    if (!isVertical) {
      return horizontalCanvas;
    }

    // Convert canvas to internal format
    const { nodes: nodeStates, edges: edgeStates } =
      CanvasConverter.canvasToGraph(horizontalCanvas);

    // Swap orientation
    const { nodes: swappedNodes, edges: swappedEdges } = swapGraphOrientation(
      nodeStates,
      edgeStates
    );

    // Convert back to canvas format for rendering
    return {
      ...horizontalCanvas,
      nodes: swappedNodes.map((node, idx) => ({
        ...horizontalCanvas.nodes[idx],
        x: node.position?.x ?? 0,
        y: node.position?.y ?? 0,
      })),
      edges: swappedEdges.map((edge, idx) => {
        const data = edge.data as Record<string, unknown> | undefined;
        return {
          ...horizontalCanvas.edges[idx],
          fromSide: (data?.fromSide as 'top' | 'right' | 'bottom' | 'left') ?? 'bottom',
          toSide: (data?.toSide as 'top' | 'right' | 'bottom' | 'left') ?? 'top',
        };
      }),
    };
  }, [isVertical]);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
        <h2 style={{ margin: 0, fontFamily: 'system-ui' }}>Graph Orientation</h2>
        <button
          onClick={() => setIsVertical(!isVertical)}
          style={{
            padding: '8px 16px',
            fontSize: 14,
            fontFamily: 'system-ui',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Switch to {isVertical ? 'Horizontal' : 'Vertical'}
        </button>
        <div style={{ fontSize: 14, color: '#666', fontFamily: 'system-ui' }}>
          Current: <strong>{isVertical ? 'Vertical (Top-to-Bottom)' : 'Horizontal (Left-to-Right)'}</strong>
        </div>
      </div>

      <GraphRenderer
        key={isVertical ? 'vertical' : 'horizontal'}
        canvas={canvas}
        width={isVertical ? 500 : 1100}
        height={isVertical ? 1100 : 500}
      />

      <div style={{ marginTop: 30, padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
        <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>How It Works</h4>
        <ul style={{ fontSize: 13, lineHeight: 1.8, margin: 0, paddingLeft: 20 }}>
          <li>
            <strong>Position Swap</strong>: Swaps x and y coordinates of all nodes
          </li>
          <li>
            <strong>Edge Side Rotation</strong>: Both sides rotate <strong>clockwise</strong>
            <ul style={{ marginTop: 5 }}>
              <li><code>top → right → bottom → left → top</code></li>
              <li>Example: <code>right → left</code> becomes <code>bottom → top</code></li>
            </ul>
          </li>
          <li>
            <strong>Usage</strong>: <code>swapGraphOrientation(nodes, edges)</code>
          </li>
        </ul>
      </div>
    </div>
  );
};

export const InteractiveOrientationSwap: Story = {
  render: () => <OrientationSwapTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Interactive Orientation Swap**

Click the button to toggle between horizontal (left-to-right) and vertical (top-to-bottom) orientations.

The \`swapGraphOrientation\` utility:
1. Swaps x/y coordinates for all node positions
2. Rotates edge connection sides clockwise (both fromSide and toSide)
   - Rotation: top → right → bottom → left → top
   - Example: \`right → left\` becomes \`bottom → top\`
3. Preserves the graph structure while rotating it 90 degrees
        `,
      },
    },
  },
};

/**
 * Horizontal flow example
 */
export const HorizontalFlow: Story = {
  args: {
    canvas: horizontalCanvas,
    width: 1100,
    height: 450,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Horizontal Flow (Left-to-Right)**

Traditional left-to-right flowchart layout:
- Primary flow uses \`right → left\` connections
- Branches use \`top\` and \`bottom\` connections for splitting
- Typical for flowcharts and process diagrams
        `,
      },
    },
  },
};

/**
 * Vertical flow example (using swapped canvas)
 */
const VerticalFlowTemplate = () => {
  const verticalCanvas = useMemo(() => {
    const { nodes: nodeStates, edges: edgeStates } =
      CanvasConverter.canvasToGraph(horizontalCanvas);

    const { nodes: swappedNodes, edges: swappedEdges } = swapGraphOrientation(
      nodeStates,
      edgeStates
    );

    return {
      ...horizontalCanvas,
      pv: {
        ...horizontalCanvas.pv,
        name: 'Vertical Flow',
        description: 'Graph with vertical (top-to-bottom) orientation',
      },
      nodes: swappedNodes.map((node, idx) => ({
        ...horizontalCanvas.nodes[idx],
        x: node.position?.x ?? 0,
        y: node.position?.y ?? 0,
      })),
      edges: swappedEdges.map((edge, idx) => {
        const data = edge.data as Record<string, unknown> | undefined;
        return {
          ...horizontalCanvas.edges[idx],
          fromSide: (data?.fromSide as 'top' | 'right' | 'bottom' | 'left') ?? 'bottom',
          toSide: (data?.toSide as 'top' | 'right' | 'bottom' | 'left') ?? 'top',
        };
      }),
    };
  }, []);

  return <GraphRenderer canvas={verticalCanvas} width={500} height={1100} />;
};

export const VerticalFlow: Story = {
  render: () => <VerticalFlowTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Vertical Flow (Top-to-Bottom)**

Top-to-bottom layout using \`swapGraphOrientation\`:
- Primary flow uses \`bottom → top\` connections
- Branches use \`left\` and \`right\` connections for splitting
- Common for hierarchical diagrams and org charts
        `,
      },
    },
  },
};

/**
 * Side-by-side comparison
 */
const SideBySideTemplate = () => {
  const verticalCanvas = useMemo(() => {
    const { nodes: nodeStates, edges: edgeStates } =
      CanvasConverter.canvasToGraph(horizontalCanvas);

    const { nodes: swappedNodes, edges: swappedEdges } = swapGraphOrientation(
      nodeStates,
      edgeStates
    );

    return {
      ...horizontalCanvas,
      nodes: swappedNodes.map((node, idx) => ({
        ...horizontalCanvas.nodes[idx],
        x: node.position?.x ?? 0,
        y: node.position?.y ?? 0,
      })),
      edges: swappedEdges.map((edge, idx) => {
        const data = edge.data as Record<string, unknown> | undefined;
        return {
          ...horizontalCanvas.edges[idx],
          fromSide: (data?.fromSide as 'top' | 'right' | 'bottom' | 'left') ?? 'bottom',
          toSide: (data?.toSide as 'top' | 'right' | 'bottom' | 'left') ?? 'top',
        };
      }),
    };
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 20, fontFamily: 'system-ui' }}>Orientation Comparison</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
        <div>
          <h3 style={{ fontFamily: 'system-ui', marginBottom: 10 }}>
            Horizontal (Left-to-Right)
          </h3>
          <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
            <GraphRenderer canvas={horizontalCanvas} width={550} height={400} />
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: '#666' }}>
            Original orientation with right→left primary flow
          </div>
        </div>

        <div>
          <h3 style={{ fontFamily: 'system-ui', marginBottom: 10 }}>
            Vertical (Top-to-Bottom)
          </h3>
          <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
            <GraphRenderer canvas={verticalCanvas} width={550} height={400} />
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: '#666' }}>
            Swapped orientation with bottom→top primary flow
          </div>
        </div>
      </div>

      <div style={{ marginTop: 30, padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
        <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>
          Edge Side Rotation (Both Clockwise)
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <strong>Clockwise Rotation:</strong>
            <ul style={{ fontSize: 13, lineHeight: 1.8, marginTop: 8, paddingLeft: 20 }}>
              <li><code>top</code> → <code>right</code></li>
              <li><code>right</code> → <code>bottom</code></li>
              <li><code>bottom</code> → <code>left</code></li>
              <li><code>left</code> → <code>top</code></li>
            </ul>
          </div>
          <div>
            <strong>Examples:</strong>
            <ul style={{ fontSize: 13, lineHeight: 1.8, marginTop: 8, paddingLeft: 20 }}>
              <li><code>right → left</code> becomes <code>bottom → top</code></li>
              <li><code>top → left</code> becomes <code>right → top</code></li>
              <li><code>bottom → left</code> becomes <code>left → top</code></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SideBySideComparison: Story = {
  render: () => <SideBySideTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Side-by-Side Comparison**

Visual comparison of the same graph in both orientations, showing how \`swapGraphOrientation\`
transforms the layout while preserving the graph structure and flow logic.
        `,
      },
    },
  },
};
