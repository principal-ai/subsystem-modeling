import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

// Import captured trace canvas data
import testRunTrace from '../__traces__/test-run.canvas.json';

const meta = {
  title: 'Components/TraceViewer',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
# Trace Viewer

Visualizes OpenTelemetry traces captured from test runs as canvas diagrams.

## How it works

1. Tests are instrumented with OpenTelemetry SDK
2. Spans are collected during test execution
3. At test completion, spans are converted to ExtendedCanvas format
4. The canvas is rendered here for visualization

## Generating new traces

\`\`\`bash
# Run tests with canvas output enabled
OTEL_CANVAS_OUTPUT=true bun run test:core

# Traces are saved to packages/subsystems-core/__traces__/
\`\`\`

## Span visualization

- **Shape** indicates span kind (hexagon=SERVER, diamond=CLIENT, circle=INTERNAL)
- **Color** indicates status (green=OK, red=ERROR, gray=UNSET)
- **Edges** show parent-child relationships (dashed for cross-service calls)
- **Groups** cluster spans by service name
        `,
      },
    },
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
// Stories using captured test traces
// ============================================================================

/**
 * Real trace data captured from test runs.
 * Shows spans grouped by service with hierarchical layout.
 */
export const CapturedTestTrace: Story = {
  args: {
    canvas: testRunTrace as ExtendedCanvas,
    width: 1600,
    height: 400,
  },
  parameters: {
    docs: {
      description: {
        story: 'Trace data captured from running `bun test` with OpenTelemetry instrumentation.',
      },
    },
  },
};

// ============================================================================
// Example trace scenarios for documentation
// ============================================================================

/**
 * Example: Simple HTTP request trace
 */
const httpRequestTrace: ExtendedCanvas = {
  nodes: [
    {
      id: 'service-api',
      type: 'group',
      x: -20,
      y: -50,
      width: 540,
      height: 250,
      label: 'api-service',
      pv: {
        nodeType: 'service',
        name: 'api-service',
        icon: 'server',
      },
    },
    {
      id: 'span-1',
      type: 'text',
      x: 0,
      y: 0,
      width: 200,
      height: 60,
      text: 'HTTP GET /users',
      pv: {
        nodeType: 'span',
        name: 'HTTP GET /users',
        description: '45.2ms',
        shape: 'hexagon',
        fill: '#4f46e5',
        states: { OK: { color: '#22c55e', label: 'OK' } },
        otel: { kind: 'instance', category: 'span' },
      },
    },
    {
      id: 'span-2',
      type: 'text',
      x: 50,
      y: 100,
      width: 200,
      height: 60,
      text: 'Auth.validate',
      pv: {
        nodeType: 'span',
        name: 'Auth.validate',
        description: '12.1ms',
        shape: 'circle',
        fill: '#6b7280',
        states: { OK: { color: '#22c55e', label: 'OK' } },
        otel: { kind: 'instance', category: 'span' },
      },
    },
    {
      id: 'span-3',
      type: 'text',
      x: 300,
      y: 100,
      width: 200,
      height: 60,
      text: 'DB.query',
      pv: {
        nodeType: 'span',
        name: 'DB.query',
        description: '23.4ms',
        shape: 'diamond',
        fill: '#0891b2',
        states: { OK: { color: '#22c55e', label: 'OK' } },
        otel: { kind: 'instance', category: 'span' },
        dataSchema: {
          'db.statement': { type: 'string', required: false },
          'db.rows_affected': { type: 'number', required: false },
        },
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'span-1',
      toNode: 'span-2',
      fromSide: 'bottom',
      toSide: 'top',
      toEnd: 'arrow',
      pv: { edgeType: 'span-child', style: 'solid' },
    },
    {
      id: 'edge-2',
      fromNode: 'span-1',
      toNode: 'span-3',
      fromSide: 'bottom',
      toSide: 'top',
      toEnd: 'arrow',
      pv: { edgeType: 'span-child', style: 'solid' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'HTTP Request Trace',
    description: 'Example trace showing a typical HTTP request flow',
    nodeTypes: {
      span: { description: 'OpenTelemetry span', shape: 'rectangle' },
      service: { description: 'Service grouping', icon: 'server', shape: 'rectangle' },
    },
    edgeTypes: {
      'span-child': { label: 'Child span', directed: true },
    },
    display: {
      layout: 'manual',
      animations: { enabled: true, speed: 1 },
    },
  },
};

export const HTTPRequestFlow: Story = {
  args: {
    canvas: httpRequestTrace,
    width: 600,
    height: 300,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Example trace showing a typical HTTP request with authentication and database query.',
      },
    },
  },
};

/**
 * Example: Cross-service call trace
 */
const crossServiceTrace: ExtendedCanvas = {
  nodes: [
    {
      id: 'service-frontend',
      type: 'group',
      x: -20,
      y: -50,
      width: 240,
      height: 130,
      label: 'frontend',
      pv: { nodeType: 'service', name: 'frontend', icon: 'monitor' },
    },
    {
      id: 'service-api',
      type: 'group',
      x: 280,
      y: -50,
      width: 240,
      height: 130,
      label: 'api-gateway',
      pv: { nodeType: 'service', name: 'api-gateway', icon: 'server' },
    },
    {
      id: 'service-db',
      type: 'group',
      x: 580,
      y: -50,
      width: 240,
      height: 130,
      label: 'user-service',
      pv: { nodeType: 'service', name: 'user-service', icon: 'database' },
    },
    {
      id: 'span-fe',
      type: 'text',
      x: 0,
      y: 0,
      width: 200,
      height: 60,
      text: 'fetchUsers()',
      pv: {
        nodeType: 'span',
        name: 'fetchUsers()',
        description: '120ms',
        shape: 'circle',
        fill: '#6b7280',
        otel: { kind: 'instance', category: 'span' },
      },
    },
    {
      id: 'span-api',
      type: 'text',
      x: 300,
      y: 0,
      width: 200,
      height: 60,
      text: 'GET /api/users',
      pv: {
        nodeType: 'span',
        name: 'GET /api/users',
        description: '95ms',
        shape: 'hexagon',
        fill: '#4f46e5',
        otel: { kind: 'instance', category: 'span' },
      },
    },
    {
      id: 'span-db',
      type: 'text',
      x: 600,
      y: 0,
      width: 200,
      height: 60,
      text: 'users.findAll()',
      pv: {
        nodeType: 'span',
        name: 'users.findAll()',
        description: '45ms',
        shape: 'diamond',
        fill: '#0891b2',
        otel: { kind: 'instance', category: 'span' },
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'span-fe',
      toNode: 'span-api',
      toEnd: 'arrow',
      pv: { edgeType: 'span-child', style: 'dashed', width: 2 },
    },
    {
      id: 'edge-2',
      fromNode: 'span-api',
      toNode: 'span-db',
      toEnd: 'arrow',
      pv: { edgeType: 'span-child', style: 'dashed', width: 2 },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Cross-Service Trace',
    description: 'Trace spanning multiple services with dashed edges for cross-service calls',
    nodeTypes: {
      span: { description: 'OpenTelemetry span', shape: 'rectangle' },
      service: { description: 'Service grouping', icon: 'server', shape: 'rectangle' },
    },
    edgeTypes: {
      'span-child': { label: 'Child span', directed: true },
    },
  },
};

export const CrossServiceCall: Story = {
  args: {
    canvas: crossServiceTrace,
    width: 900,
    height: 200,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Trace showing calls across three services. Dashed edges indicate cross-service boundaries.',
      },
    },
  },
};

/**
 * Example: Error trace
 */
const errorTrace: ExtendedCanvas = {
  nodes: [
    {
      id: 'span-1',
      type: 'text',
      x: 0,
      y: 0,
      width: 200,
      height: 60,
      text: 'processOrder()',
      color: 1, // Red preset
      pv: {
        nodeType: 'span',
        name: 'processOrder()',
        description: '234ms',
        shape: 'circle',
        fill: '#ef4444',
        states: { ERROR: { color: '#ef4444', label: 'ERROR' } },
        otel: { kind: 'instance', category: 'span' },
      },
    },
    {
      id: 'span-2',
      type: 'text',
      x: 0,
      y: 100,
      width: 200,
      height: 60,
      text: 'validatePayment()',
      color: 1,
      pv: {
        nodeType: 'span',
        name: 'validatePayment()',
        description: '89ms',
        shape: 'diamond',
        fill: '#ef4444',
        states: { ERROR: { color: '#ef4444', label: 'ERROR' } },
        otel: { kind: 'instance', category: 'span' },
        dataSchema: {
          'error.type': { type: 'string', required: false },
          'error.message': { type: 'string', required: false },
        },
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'span-1',
      toNode: 'span-2',
      fromSide: 'bottom',
      toSide: 'top',
      toEnd: 'arrow',
      color: 1,
      pv: { edgeType: 'span-child', style: 'solid' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Error Trace',
    description: 'Trace showing an error propagating up the call stack',
    nodeTypes: {
      span: { description: 'OpenTelemetry span', shape: 'rectangle' },
    },
    edgeTypes: {
      'span-child': { label: 'Child span', directed: true },
    },
  },
};

export const ErrorPropagation: Story = {
  args: {
    canvas: errorTrace,
    width: 300,
    height: 250,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Trace showing how an error in a child span propagates to the parent. Red nodes indicate ERROR status.',
      },
    },
  },
};
