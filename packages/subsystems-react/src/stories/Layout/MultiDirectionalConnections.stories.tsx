import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Layout/MultiDirectionalConnections',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Demonstrates multi-directional edge connections (top, bottom, left, right) and clickable edges with information panels.',
      },
    },
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

// Canvas with multi-directional connections and rich metadata
const multiDirectionalCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'gateway-1',
      type: 'text',
      x: 400,
      y: 50,
      width: 100,
      height: 100,
      text: 'API Gateway',
      color: '#06B6D4',
      pv: {
        nodeType: 'gateway',
        shape: 'diamond',
        icon: 'Network',
      },
    },
    {
      id: 'service-1',
      type: 'text',
      x: 200,
      y: 200,
      width: 140,
      height: 80,
      text: 'Auth Service',
      color: '#4A90E2',
      pv: {
        nodeType: 'service',
        shape: 'rectangle',
        icon: 'Server',
        states: {
          active: { color: '#22C55E', label: 'Active' },
          idle: { color: '#EAB308', label: 'Idle' },
          error: { color: '#EF4444', label: 'Error' },
        },
      },
    },
    {
      id: 'service-2',
      type: 'text',
      x: 600,
      y: 200,
      width: 140,
      height: 80,
      text: 'API Service',
      color: '#4A90E2',
      pv: {
        nodeType: 'service',
        shape: 'rectangle',
        icon: 'Server',
        states: {
          active: { color: '#22C55E', label: 'Active' },
          idle: { color: '#EAB308', label: 'Idle' },
          error: { color: '#EF4444', label: 'Error' },
        },
      },
    },
    {
      id: 'cache-1',
      type: 'text',
      x: 100,
      y: 400,
      width: 120,
      height: 100,
      text: 'Redis Cache',
      color: '#F59E0B',
      pv: {
        nodeType: 'cache',
        shape: 'hexagon',
        icon: 'Zap',
      },
    },
    {
      id: 'database-1',
      type: 'text',
      x: 400,
      y: 400,
      width: 100,
      height: 100,
      text: 'PostgreSQL',
      color: '#7B68EE',
      pv: {
        nodeType: 'database',
        shape: 'circle',
        icon: 'Database',
      },
    },
    {
      id: 'service-3',
      type: 'text',
      x: 700,
      y: 400,
      width: 140,
      height: 80,
      text: 'Notification Service',
      color: '#4A90E2',
      pv: {
        nodeType: 'service',
        shape: 'rectangle',
        icon: 'Bell',
        states: {
          active: { color: '#22C55E', label: 'Active' },
          idle: { color: '#EAB308', label: 'Idle' },
          error: { color: '#EF4444', label: 'Error' },
        },
      },
    },
  ],
  edges: [
    // From top to services (top -> bottom connections)
    {
      id: 'edge-1',
      fromNode: 'gateway-1',
      toNode: 'service-1',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'POST /auth/login',
      pv: { edgeType: 'http' },
    },
    {
      id: 'edge-2',
      fromNode: 'gateway-1',
      toNode: 'service-2',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'GET /api/users',
      pv: { edgeType: 'http' },
    },
    // Horizontal connections (left <-> right)
    {
      id: 'edge-3',
      fromNode: 'service-1',
      toNode: 'service-2',
      fromSide: 'right',
      toSide: 'left',
      label: '/internal/validate',
      pv: { edgeType: 'http' },
    },
    // Services to data layer
    {
      id: 'edge-4',
      fromNode: 'service-1',
      toNode: 'cache-1',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'GET',
      pv: { edgeType: 'cache_access' },
    },
    {
      id: 'edge-5',
      fromNode: 'service-1',
      toNode: 'database-1',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'SELECT users',
      pv: { edgeType: 'database_query' },
    },
    {
      id: 'edge-6',
      fromNode: 'service-2',
      toNode: 'database-1',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'UPDATE sessions',
      pv: { edgeType: 'database_query' },
    },
    {
      id: 'edge-7',
      fromNode: 'service-2',
      toNode: 'service-3',
      fromSide: 'right',
      toSide: 'left',
      label: 'POST /notify',
      pv: { edgeType: 'http' },
    },
    // Cache to database (horizontal)
    {
      id: 'edge-8',
      fromNode: 'cache-1',
      toNode: 'database-1',
      fromSide: 'right',
      toSide: 'left',
      label: 'cache miss',
      pv: { edgeType: 'database_query' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Multi-Directional Connection Demo',
    description: 'Showcasing edges connecting from all sides with rich metadata',
    edgeTypes: {
      http: {
        style: 'solid',
        color: '#22C55E',
        width: 2,
        directed: true,
      },
      database_query: {
        style: 'dashed',
        color: '#7B68EE',
        width: 2,
        directed: true,
      },
      cache_access: {
        style: 'dotted',
        color: '#F59E0B',
        width: 2,
        directed: true,
      },
      websocket: {
        style: 'animated',
        color: '#06B6D4',
        width: 3,
        directed: false,
      },
    },
  },
};

// Canvas with violation highlighting
const canvasWithViolations: ExtendedCanvas = {
  ...multiDirectionalCanvas,
  pv: {
    ...multiDirectionalCanvas.pv!,
    name: 'Connection Demo with Violations',
  },
};

// Minimal view canvas
const minimalCanvas: ExtendedCanvas = {
  nodes: multiDirectionalCanvas.nodes!.slice(0, 4),
  edges: multiDirectionalCanvas.edges!.slice(0, 4),
  pv: {
    ...multiDirectionalCanvas.pv!,
    name: 'Minimal View',
  },
};

// Complex mesh with additional gateway
const complexMeshCanvas: ExtendedCanvas = {
  nodes: [
    ...multiDirectionalCanvas.nodes!,
    {
      id: 'gateway-2',
      type: 'text',
      x: 400,
      y: 600,
      width: 100,
      height: 100,
      text: 'Internal Gateway',
      color: '#06B6D4',
      pv: {
        nodeType: 'gateway',
        shape: 'diamond',
        icon: 'Network',
      },
    },
  ],
  edges: [
    ...multiDirectionalCanvas.edges!,
    {
      id: 'edge-9',
      fromNode: 'database-1',
      toNode: 'gateway-2',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'wss',
      pv: { edgeType: 'websocket' },
    },
  ],
  pv: {
    ...multiDirectionalCanvas.pv!,
    name: 'Complex Mesh',
  },
};

export const Default: Story = {
  args: {
    canvas: multiDirectionalCanvas,
    width: '100%',
    height: '800px',
    showControls: true,
    showBackground: true,
  },
};

export const WithViolations: Story = {
  args: {
    canvas: canvasWithViolations,
    violations: [
      {
        id: 'v1',
        severity: 'error',
        type: 'connection',
        description: 'Unauthorized connection detected',
        context: { edgeId: 'edge-3' },
      },
    ],
    width: '100%',
    height: '800px',
  },
};

export const MinimalView: Story = {
  args: {
    canvas: minimalCanvas,
    width: '100%',
    height: '600px',
    showMinimap: false,
    showControls: true,
    showBackground: true,
  },
};

export const ComplexMesh: Story = {
  args: {
    canvas: complexMeshCanvas,
    width: '100%',
    height: '900px',
  },
};
