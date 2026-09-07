import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { MultiCanvasRenderer } from '../../components/MultiCanvasRenderer';
import type { MultiCanvasLayout } from '../../components/MultiCanvasRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Components/MultiCanvasRenderer',
  component: MultiCanvasRenderer,
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
} satisfies Meta<typeof MultiCanvasRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================================================
// Sample Canvases
// ============================================================================

const authFlowCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'login',
      type: 'text',
      x: 0,
      y: 0,
      width: 120,
      height: 60,
      text: 'Login',
      color: '#4A90E2',
      pv: { nodeType: 'process', shape: 'rectangle', icon: 'User' },
    },
    {
      id: 'validate',
      type: 'text',
      x: 170,
      y: 0,
      width: 120,
      height: 60,
      text: 'Validate',
      color: '#F5A623',
      pv: { nodeType: 'process', shape: 'rectangle', icon: 'Shield' },
    },
    {
      id: 'session',
      type: 'text',
      x: 340,
      y: 0,
      width: 120,
      height: 60,
      text: 'Session',
      color: '#7ED321',
      pv: { nodeType: 'data', shape: 'rectangle', icon: 'Key' },
    },
  ],
  edges: [
    { id: 'e1', fromNode: 'login', toNode: 'validate', pv: { edgeType: 'flow' } },
    { id: 'e2', fromNode: 'validate', toNode: 'session', pv: { edgeType: 'flow' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Authentication Flow',
  },
};

const dataProcessingCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'input',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      text: 'Input',
      color: '#7B68EE',
      pv: { nodeType: 'data', shape: 'circle', icon: 'Download' },
    },
    {
      id: 'transform',
      type: 'text',
      x: 150,
      y: 15,
      width: 140,
      height: 70,
      text: 'Transform',
      color: '#4A90E2',
      pv: { nodeType: 'process', shape: 'rectangle', icon: 'Settings' },
    },
    {
      id: 'output',
      type: 'text',
      x: 340,
      y: 0,
      width: 100,
      height: 100,
      text: 'Output',
      color: '#7B68EE',
      pv: { nodeType: 'data', shape: 'circle', icon: 'Upload' },
    },
  ],
  edges: [
    { id: 'e1', fromNode: 'input', toNode: 'transform', pv: { edgeType: 'dataflow' } },
    { id: 'e2', fromNode: 'transform', toNode: 'output', pv: { edgeType: 'dataflow' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Data Processing Pipeline',
  },
};

const notificationCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'event',
      type: 'text',
      x: 0,
      y: 30,
      width: 100,
      height: 60,
      text: 'Event',
      color: '#F5A623',
      pv: { nodeType: 'trigger', shape: 'rectangle', icon: 'Zap' },
    },
    {
      id: 'router',
      type: 'text',
      x: 150,
      y: 0,
      width: 100,
      height: 100,
      text: 'Router',
      color: '#4A90E2',
      pv: { nodeType: 'process', shape: 'diamond', icon: 'GitBranch' },
    },
    {
      id: 'email',
      type: 'text',
      x: 300,
      y: -30,
      width: 100,
      height: 50,
      text: 'Email',
      color: '#7ED321',
      pv: { nodeType: 'action', shape: 'rectangle', icon: 'Mail' },
    },
    {
      id: 'sms',
      type: 'text',
      x: 300,
      y: 40,
      width: 100,
      height: 50,
      text: 'SMS',
      color: '#7ED321',
      pv: { nodeType: 'action', shape: 'rectangle', icon: 'MessageSquare' },
    },
    {
      id: 'push',
      type: 'text',
      x: 300,
      y: 110,
      width: 100,
      height: 50,
      text: 'Push',
      color: '#7ED321',
      pv: { nodeType: 'action', shape: 'rectangle', icon: 'Bell' },
    },
  ],
  edges: [
    { id: 'e1', fromNode: 'event', toNode: 'router', pv: { edgeType: 'flow' } },
    { id: 'e2', fromNode: 'router', toNode: 'email', pv: { edgeType: 'flow' } },
    { id: 'e3', fromNode: 'router', toNode: 'sms', pv: { edgeType: 'flow' } },
    { id: 'e4', fromNode: 'router', toNode: 'push', pv: { edgeType: 'flow' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Notification System',
  },
};

const monitoringCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'metrics',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      text: 'Metrics',
      color: '#4A90E2',
      pv: { nodeType: 'data', shape: 'rectangle', icon: 'BarChart2' },
    },
    {
      id: 'alert',
      type: 'text',
      x: 150,
      y: 0,
      width: 100,
      height: 60,
      text: 'Alert',
      color: '#D0021B',
      pv: { nodeType: 'process', shape: 'rectangle', icon: 'AlertTriangle' },
    },
  ],
  edges: [
    { id: 'e1', fromNode: 'metrics', toNode: 'alert', pv: { edgeType: 'flow' } },
  ],
  pv: {
    version: '1.0.0',
    name: 'Monitoring',
  },
};

// ============================================================================
// Stories
// ============================================================================

/**
 * Two canvases side by side on the same graph
 */
const twoCanvasLayout: MultiCanvasLayout = {
  placements: [
    { canvasId: 'auth', canvas: authFlowCanvas, position: { x: 0, y: 0 } },
    { canvasId: 'data', canvas: dataProcessingCanvas, position: { x: 600, y: 0 } },
  ],
};

export const TwoCanvasesSideBySide: Story = {
  args: {
    layout: twoCanvasLayout,
    showControls: true,
    showBackground: true,
  },
};

/**
 * Four canvases arranged in a 2x2 grid pattern
 */
const fourCanvasLayout: MultiCanvasLayout = {
  placements: [
    { canvasId: 'auth', canvas: authFlowCanvas, position: { x: 0, y: 0 } },
    { canvasId: 'data', canvas: dataProcessingCanvas, position: { x: 600, y: 0 } },
    { canvasId: 'notify', canvas: notificationCanvas, position: { x: 0, y: 200 } },
    { canvasId: 'monitor', canvas: monitoringCanvas, position: { x: 600, y: 200 } },
  ],
};

export const FourCanvasesGrid: Story = {
  args: {
    layout: fourCanvasLayout,
    showControls: true,
    showBackground: true,
  },
};

/**
 * Canvases stacked vertically
 */
const verticalLayout: MultiCanvasLayout = {
  placements: [
    { canvasId: 'auth', canvas: authFlowCanvas, position: { x: 0, y: 0 } },
    { canvasId: 'data', canvas: dataProcessingCanvas, position: { x: 0, y: 150 } },
    { canvasId: 'notify', canvas: notificationCanvas, position: { x: 0, y: 300 } },
  ],
};

export const VerticalStack: Story = {
  args: {
    layout: verticalLayout,
    showControls: true,
    showBackground: true,
  },
};

/**
 * Single canvas (baseline comparison)
 */
const singleCanvasLayout: MultiCanvasLayout = {
  placements: [
    { canvasId: 'notify', canvas: notificationCanvas, position: { x: 0, y: 0 } },
  ],
};

export const SingleCanvas: Story = {
  args: {
    layout: singleCanvasLayout,
    showControls: true,
    showBackground: true,
  },
};

/**
 * With minimap enabled to navigate the combined view
 */
export const WithMinimap: Story = {
  args: {
    layout: fourCanvasLayout,
    showControls: true,
    showMinimap: true,
    showBackground: true,
  },
};

/**
 * Without group borders - just the nodes merged together
 */
export const WithoutGroups: Story = {
  args: {
    layout: fourCanvasLayout,
    showControls: true,
    showBackground: true,
    showGroups: false,
  },
};

/**
 * Draggable groups - drag the group borders to rearrange canvases
 */
export const DraggableGroups: Story = {
  render: () => {
    const [layout, setLayout] = React.useState<MultiCanvasLayout>(fourCanvasLayout);

    const handleLayoutChange = React.useCallback((newLayout: MultiCanvasLayout) => {
      console.log('Layout changed:', newLayout.placements.map(p => ({
        canvasId: p.canvasId,
        position: p.position,
      })));
      setLayout(newLayout);
    }, []);

    return (
      <div style={{ width: '100%', height: '100%' }}>
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 100,
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: 4,
          fontSize: 12,
        }}>
          Drag the group borders to move entire canvases
        </div>
        <MultiCanvasRenderer
          layout={layout}
          onLayoutChange={handleLayoutChange}
          showControls
          showBackground
        />
      </div>
    );
  },
};
