import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import '@xyflow/react/dist/style.css';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { GraphRendererHandle, PendingChanges } from '../../components/GraphRenderer';
import type { ExtendedCanvas, PVEventSchema } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Components/GraphRenderer',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
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
// Sample Canvas Documents
// ============================================================================

/**
 * Basic canvas with process and data nodes
 */
const sampleCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 70,
      text: 'Input Processor',
      color: '#4A90E2',
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
    {
      id: 'node-2',
      type: 'text',
      x: 300,
      y: 100,
      width: 100,
      height: 100,
      text: 'Database',
      color: '#7B68EE',
      pv: {
        nodeType: 'data',
        shape: 'circle',
        icon: 'Database',
      },
    },
    {
      id: 'node-3',
      type: 'text',
      x: 500,
      y: 100,
      width: 140,
      height: 70,
      text: 'Output Handler',
      color: '#4A90E2',
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'node-1',
      toNode: 'node-2',
      edgeType: 'dataflow',
    },
    {
      id: 'edge-2',
      fromNode: 'node-2',
      toNode: 'node-3',
      edgeType: 'dataflow',
    },
  ],
  name: 'Sample Validation Graph',
  description: 'Example graph configuration',
  edgeTypes: {
    dataflow: {
      style: 'solid',
      color: '#50E3C2',
      directed: true,
    },
    dependency: {
      style: 'dashed',
      color: '#F5A623',
      directed: true,
    },
  },
};

/**
 * Empty canvas
 */
const emptyCanvas: ExtendedCanvas = {
  nodes: [],
  edges: [],
  name: 'Empty Graph',
  edgeTypes: {},
};

/**
 * Single node canvas
 */
const singleNodeCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 70,
      text: 'Input Processor',
      color: '#4A90E2',
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
  ],
  edges: [],
  name: 'Single Node',
  edgeTypes: {},
};

/**
 * Larger canvas with more nodes
 */
const largeCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 70,
      text: 'Input Processor',
      color: '#4A90E2',
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
    {
      id: 'node-2',
      type: 'text',
      x: 300,
      y: 100,
      width: 100,
      height: 100,
      text: 'Database',
      color: '#7B68EE',
      pv: {
        nodeType: 'data',
        shape: 'circle',
        icon: 'Database',
      },
    },
    {
      id: 'node-3',
      type: 'text',
      x: 500,
      y: 100,
      width: 140,
      height: 70,
      text: 'Output Handler',
      color: '#4A90E2',
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
    {
      id: 'node-4',
      type: 'text',
      x: 200,
      y: 250,
      width: 140,
      height: 70,
      text: 'Validator',
      color: '#4A90E2',
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Check',
      },
    },
    {
      id: 'node-5',
      type: 'text',
      x: 400,
      y: 250,
      width: 100,
      height: 100,
      text: 'Cache',
      color: '#7B68EE',
      pv: {
        nodeType: 'data',
        shape: 'circle',
        icon: 'Zap',
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'node-1',
      toNode: 'node-2',
      edgeType: 'dataflow',
    },
    {
      id: 'edge-2',
      fromNode: 'node-2',
      toNode: 'node-3',
      edgeType: 'dataflow',
    },
    {
      id: 'edge-3',
      fromNode: 'node-1',
      toNode: 'node-4',
      edgeType: 'dataflow',
    },
    {
      id: 'edge-4',
      fromNode: 'node-4',
      toNode: 'node-5',
      edgeType: 'dataflow',
    },
  ],
  name: 'Large Graph',
  edgeTypes: {
    dataflow: {
      style: 'solid',
      color: '#50E3C2',
      directed: true,
    },
  },
};

/**
 * Service architecture canvas (richer example)
 */
const serviceArchitectureCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'client',
      type: 'text',
      x: 100,
      y: 200,
      width: 120,
      height: 120,
      text: '# Client',
      color: 5, // cyan preset
      pv: {
        nodeType: 'client',
        shape: 'circle',
        icon: 'User',
        states: {
          idle: { color: '#94a3b8', icon: 'User' },
          connected: { color: '#22c55e', icon: 'UserCheck' },
          error: { color: '#ef4444', icon: 'UserX' },
        },
      },
    },
    {
      id: 'api-server',
      type: 'text',
      x: 350,
      y: 180,
      width: 200,
      height: 140,
      text: '# API Server\n\nHandles REST endpoints',
      color: 6, // purple preset
      pv: {
        nodeType: 'api-server',
        shape: 'rectangle',
        icon: 'Server',
        states: {
          idle: { color: '#94a3b8' },
          processing: { color: '#3b82f6' },
          error: { color: '#ef4444' },
        },
      },
    },
    {
      id: 'database',
      type: 'text',
      x: 620,
      y: 200,
      width: 150,
      height: 100,
      text: '# Database',
      color: 4, // green preset
      pv: {
        nodeType: 'database',
        shape: 'hexagon',
        icon: 'Database',
      },
    },
    {
      id: 'cache',
      type: 'text',
      x: 350,
      y: 380,
      width: 140,
      height: 80,
      text: '# Cache',
      color: 2, // orange preset
      pv: {
        nodeType: 'cache',
        shape: 'diamond',
        icon: 'Zap',
      },
    },
  ],
  edges: [
    {
      id: 'client-to-api',
      fromNode: 'client',
      toNode: 'api-server',
      fromSide: 'right',
      toSide: 'left',
      label: 'HTTP',
      pv: {
        edgeType: 'http-request',
      },
    },
    {
      id: 'api-to-db',
      fromNode: 'api-server',
      toNode: 'database',
      fromSide: 'right',
      toSide: 'left',
      label: 'SQL',
      pv: {
        edgeType: 'db-query',
      },
    },
    {
      id: 'api-to-cache',
      fromNode: 'api-server',
      toNode: 'cache',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'GET/SET',
      edgeType: 'cache-access',
    },
  ],
  name: 'Simple Service Architecture',
  description: 'A basic client-server architecture with caching',
  edgeTypes: {
    'http-request': {
      style: 'solid',
      color: '#3b82f6',
      width: 3,
      directed: true,
      animation: {
        type: 'flow',
        duration: 1500,
      },
    },
    'db-query': {
      style: 'dashed',
      color: '#22c55e',
      width: 2,
      directed: true,
    },
    'cache-access': {
      style: 'dotted',
      color: '#f97316',
      width: 2,
      directed: true,
      animation: {
        type: 'pulse',
        duration: 1000,
      },
    },
  },
  display: {
    layout: 'manual',
    animations: {
      enabled: true,
      speed: 1.0,
    },
  },
};

// ============================================================================
// Stories
// ============================================================================

const DefaultTemplate = () => (
  <div style={{ width: '100%', height: '600px' }}>
    <GraphRenderer canvas={sampleCanvas} />
  </div>
);

export const Default: Story = {
  render: () => <DefaultTemplate />,
};

const EmptyGraphTemplate = () => (
  <div style={{ width: '100%', height: '600px' }}>
    <GraphRenderer canvas={emptyCanvas} />
  </div>
);

export const EmptyGraph: Story = {
  render: () => <EmptyGraphTemplate />,
};

const SingleNodeTemplate = () => (
  <div style={{ width: '100%', height: '600px' }}>
    <GraphRenderer canvas={singleNodeCanvas} />
  </div>
);

export const SingleNode: Story = {
  render: () => <SingleNodeTemplate />,
};

const LargeGraphTemplate = () => (
  <div style={{ width: '100%', height: '600px' }}>
    <GraphRenderer canvas={largeCanvas} />
  </div>
);

export const LargeGraph: Story = {
  render: () => <LargeGraphTemplate />,
};

const ServiceArchitectureTemplate = () => (
  <div style={{ width: '100%', height: '600px' }}>
    <GraphRenderer canvas={serviceArchitectureCanvas} />
  </div>
);

export const ServiceArchitecture: Story = {
  render: () => <ServiceArchitectureTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Service Architecture** - A realistic example showing:
- Multiple node shapes (circle, rectangle, hexagon, diamond)
- Edge types with different styles (solid, dashed, dotted)
- Edge animations (flow, pulse)
- State definitions for dynamic coloring
        `,
      },
    },
  },
};

// Interactive story with editable mode
const EditableTemplate = () => {
  const graphRef = React.useRef<GraphRendererHandle>(null);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [lastSavedChanges, setLastSavedChanges] = React.useState<PendingChanges | null>(null);

  const handleSave = () => {
    const changes = graphRef.current?.getPendingChanges();
    if (changes?.hasChanges) {
      console.log('Saving changes:', changes);
      setLastSavedChanges(changes);
    }
  };

  const handleReset = () => {
    graphRef.current?.resetEditState();
    setHasChanges(false);
    setLastSavedChanges(null);
  };

  return (
    <div>
      <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
        <strong>Interactive Graph Editor</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li>Drag nodes to reposition them</li>
            <li>Drag from a node handle to another node to create an edge</li>
            <li>Click an edge to view info and delete it</li>
            <li>Click a node to view info, edit name/type, or delete it</li>
          </ul>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            style={{
              padding: '6px 12px',
              backgroundColor: hasChanges ? '#4A90E2' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: hasChanges ? 'pointer' : 'not-allowed',
            }}
          >
            Save Changes
          </button>
          <button
            onClick={handleReset}
            style={{
              padding: '6px 12px',
              backgroundColor: '#f0f0f0',
              color: '#333',
              border: '1px solid #ccc',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
          {hasChanges && (
            <span style={{ fontSize: 12, color: '#f5a623', fontStyle: 'italic' }}>
              Unsaved changes
            </span>
          )}
        </div>
        {lastSavedChanges && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: '#666' }}>
              Last saved changes:
            </div>
            <pre
              style={{
                marginTop: 4,
                fontSize: 10,
                backgroundColor: '#fff',
                padding: 8,
                borderRadius: 4,
                maxHeight: 150,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(lastSavedChanges, null, 2)}
            </pre>
          </div>
        )}
      </div>
      <div style={{ width: '100%', height: '500px' }}>
        <GraphRenderer
          ref={graphRef}
          canvas={sampleCanvas}
          editable={true}
          onPendingChangesChange={setHasChanges}
        />
      </div>
    </div>
  );
};

export const Editable: Story = {
  render: () => <EditableTemplate />,
  parameters: {
    docs: {
      description: {
        story:
          'Full editing mode with internal state management. Drag nodes, create/delete edges, delete nodes, and edit node properties. Changes are tracked internally and can be retrieved via the ref when saving.',
      },
    },
  },
};

const ServiceArchitectureEditableTemplate = () => {
  const graphRef = React.useRef<GraphRendererHandle>(null);
  const [hasChanges, setHasChanges] = React.useState(false);

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#f0f9ff',
          borderRadius: 4,
          border: '1px solid #3b82f6',
        }}
      >
        <strong style={{ color: '#1e40af' }}>Service Architecture + Editing</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#1e40af' }}>
          This graph is rendered from an ExtendedCanvas document. You can edit it interactively.
          {hasChanges && <span style={{ marginLeft: 8, color: '#f97316' }}>(unsaved changes)</span>}
        </div>
      </div>
      <div style={{ width: '100%', height: '500px' }}>
        <GraphRenderer
          ref={graphRef}
          canvas={serviceArchitectureCanvas}
          editable={true}
          onPendingChangesChange={setHasChanges}
        />
      </div>
    </div>
  );
};

export const ServiceArchitectureEditable: Story = {
  render: () => <ServiceArchitectureEditableTemplate />,
  parameters: {
    docs: {
      description: {
        story:
          'Service architecture canvas with editing enabled. Edit nodes, create edges, and track changes.',
      },
    },
  },
};

// ============================================================================
// OTEL Log Association Canvas
// ============================================================================

/**
 * OTEL Log Association architecture canvas
 * Demonstrates OTEL badges, tooltips, and info panel integration
 */
const otelLogAssociationCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'otel-log',
      type: 'text',
      text: 'OtelLog',
      x: -304,
      y: 147,
      width: 120,
      height: 118,
      pv: {
        nodeType: 'otel-type',
        name: 'OtelLog',
        description:
          'OpenTelemetry log record with timestamp, severity, body, resource, and trace context',
        otel: {
          kind: 'type',
          category: 'log',
        },
        shape: 'rectangle',
        icon: 'FileText',
        fill: '#4A90E2',
      },
    },
    {
      id: 'otel-resource',
      type: 'text',
      text: 'OtelResource',
      x: -305,
      y: 316,
      width: 120,
      height: 117,
      pv: {
        nodeType: 'otel-type',
        name: 'OtelResource',
        description: 'OTEL resource attributes like service.name, k8s.*, deployment.*',
        otel: {
          kind: 'type',
          category: 'resource',
        },
        shape: 'rectangle',
        icon: 'Box',
        fill: '#4A90E2',
      },
    },
    {
      id: 'canvas-scope',
      type: 'text',
      text: 'CanvasScope',
      x: -77,
      y: -48,
      width: 130,
      height: 118,
      pv: {
        nodeType: 'service',
        name: 'CanvasScope',
        description: 'Filters which logs are relevant to this canvas based on resource attributes',
        shape: 'hexagon',
        icon: 'Filter',
        fill: '#9B59B6',
      },
    },
    {
      id: 'log-router',
      type: 'text',
      text: 'LogRouter',
      x: -80,
      y: 150,
      width: 130,
      height: 118,
      pv: {
        nodeType: 'otel-service',
        name: 'LogRouter',
        description:
          'Routes incoming OTEL logs to canvas nodes based on scope and resourceMatch criteria',
        otel: {
          kind: 'service',
          category: 'router',
        },
        shape: 'hexagon',
        icon: 'GitBranch',
        fill: '#7ED321',
      },
    },
    {
      id: 'resource-matcher',
      type: 'text',
      text: 'ResourceMatcher',
      x: -82,
      y: 440,
      width: 130,
      height: 119,
      pv: {
        nodeType: 'service',
        name: 'ResourceMatcher',
        description: 'Matches log resources against node resourceMatch criteria',
        otel: {
          kind: 'service',
          category: 'match',
        },
        shape: 'hexagon',
        icon: 'Search',
        fill: '#7ED321',
      },
    },
    {
      id: 'resource-match',
      type: 'text',
      text: 'ResourceMatch',
      x: 179,
      y: 445,
      width: 120,
      height: 117,
      pv: {
        nodeType: 'otel-type',
        name: 'ResourceMatch',
        description: 'Criteria for matching OTEL resources to canvas nodes',
        otel: {
          kind: 'type',
          category: 'match',
        },
        shape: 'rectangle',
        icon: 'Target',
        fill: '#4A90E2',
      },
    },
    {
      id: 'match-operator',
      type: 'text',
      text: 'MatchOperator',
      x: 178,
      y: 632,
      width: 120,
      height: 117,
      pv: {
        nodeType: 'otel-type',
        name: 'MatchOperator',
        description: 'Matching operators: exact, glob, regex, exists, oneOf',
        otel: {
          kind: 'type',
          category: 'match',
        },
        shape: 'diamond',
        icon: 'Code',
        fill: '#F5A623',
      },
    },
    {
      id: 'canvas-node',
      type: 'text',
      text: 'Canvas Node',
      x: 172,
      y: 277,
      width: 132,
      height: 121,
      pv: {
        nodeType: 'service',
        name: 'Canvas Node',
        description: 'A node in the canvas that can receive routed logs',
        shape: 'rectangle',
        icon: 'Square',
        fill: '#00BCD4',
      },
    },
    {
      id: 'routing-result',
      type: 'text',
      text: 'LogRoutingResult',
      x: 169,
      y: 80,
      width: 150,
      height: 135,
      pv: {
        nodeType: 'otel-type',
        name: 'LogRoutingResult',
        description: 'Result of routing a log: routed, orphaned, or out-of-scope',
        otel: {
          kind: 'type',
          category: 'audit',
        },
        shape: 'rectangle',
        icon: 'CheckCircle',
        fill: '#4A90E2',
      },
    },
    {
      id: 'audit-collector',
      type: 'text',
      text: 'AuditCollector',
      x: 380,
      y: 150,
      width: 130,
      height: 117,
      pv: {
        nodeType: 'otel-service',
        name: 'AuditCollector',
        description:
          'Tracks routing metrics, orphaned logs, silent nodes, and generates coverage reports',
        otel: {
          kind: 'service',
          category: 'collector',
        },
        shape: 'hexagon',
        icon: 'BarChart2',
        fill: '#7ED321',
      },
    },
    {
      id: 'orphaned-log',
      type: 'text',
      text: 'OrphanedLog',
      x: 618,
      y: 150,
      width: 127,
      height: 118,
      pv: {
        nodeType: 'otel-type',
        name: 'OrphanedLog',
        description:
          'Logs that matched canvas scope but no node resourceMatch - indicates missing nodes or misconfiguration',
        otel: {
          kind: 'type',
          category: 'audit',
        },
        shape: 'rectangle',
        icon: 'AlertTriangle',
        fill: '#D0021B',
      },
    },
    {
      id: 'audit-report',
      type: 'text',
      text: 'AuditReport',
      x: 618,
      y: 288,
      width: 124,
      height: 123,
      pv: {
        nodeType: 'otel-type',
        name: 'AuditReport',
        description: 'Coverage report with node activity, orphans, and recommendations',
        otel: {
          kind: 'type',
          category: 'audit',
        },
        shape: 'rectangle',
        icon: 'FileText',
        fill: '#4A90E2',
      },
    },
  ],
  edges: [
    {
      id: 'log-to-router',
      fromNode: 'otel-log',
      toNode: 'log-router',
      fromSide: 'right',
      toSide: 'left',
      label: 'route()',
      edgeType: 'http-request',
    },
    {
      id: 'router-checks-scope',
      fromNode: 'log-router',
      toNode: 'canvas-scope',
      fromSide: 'top',
      toSide: 'bottom',
      label: 'isInScope()',
      edgeType: 'http-request',
    },
    {
      id: 'router-uses-matcher',
      fromNode: 'log-router',
      toNode: 'resource-matcher',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'match()',
      edgeType: 'http-request',
    },
    {
      id: 'matcher-uses-match',
      fromNode: 'resource-matcher',
      toNode: 'resource-match',
      fromSide: 'right',
      toSide: 'left',
      label: 'criteria',
      edgeType: 'db-query',
    },
    {
      id: 'match-has-operator',
      fromNode: 'resource-match',
      toNode: 'match-operator',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'operators',
      edgeType: 'db-query',
    },
    {
      id: 'router-to-node',
      fromNode: 'log-router',
      toNode: 'canvas-node',
      fromSide: 'right',
      toSide: 'left',
      label: 'routed',
      edgeType: 'http-request',
    },
    {
      id: 'router-returns-result',
      fromNode: 'log-router',
      toNode: 'routing-result',
      fromSide: 'right',
      toSide: 'left',
      label: 'returns',
      edgeType: 'http-request',
    },
    {
      id: 'result-to-audit',
      fromNode: 'routing-result',
      toNode: 'audit-collector',
      fromSide: 'right',
      toSide: 'left',
      label: 'track()',
      edgeType: 'http-request',
    },
    {
      id: 'audit-tracks-orphans',
      fromNode: 'audit-collector',
      toNode: 'orphaned-log',
      fromSide: 'right',
      toSide: 'left',
      label: 'unmatched',
      edgeType: 'db-query',
    },
    {
      id: 'audit-generates-report',
      fromNode: 'audit-collector',
      toNode: 'audit-report',
      fromSide: 'right',
      toSide: 'left',
      label: 'generate()',
      edgeType: 'db-query',
    },
    {
      id: 'node-has-match',
      fromNode: 'canvas-node',
      toNode: 'resource-match',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'resourceMatch',
      edgeType: 'db-query',
    },
    {
      id: 'log-has-resource',
      fromNode: 'otel-log',
      toNode: 'otel-resource',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'resource',
      edgeType: 'db-query',
    },
  ],
  name: 'OTEL Log Association Architecture',
  description: 'Shows how OtelLog flows through LogRouter to Canvas Nodes, with audit tracking',
  nodeTypes: {
    service: {
      label: 'Component',
      description: 'System component',
      shape: 'hexagon',
    },
    'otel-type': {
      label: 'Type',
      description: 'TypeScript type or interface representing OTEL concepts',
      shape: 'rectangle',
    },
    'otel-service': {
      label: 'Service',
      description: 'Runtime service component for OTEL processing',
      shape: 'hexagon',
    },
  },
  edgeTypes: {
    'http-request': {
      label: 'Flow',
      style: 'solid',
      color: '#4A90E2',
      directed: true,
    },
    'db-query': {
      label: 'Reference',
      style: 'dashed',
      color: '#999',
      directed: true,
    },
  },
};

const OtelLogAssociationTemplate = () => (
  <div style={{ width: '100%', height: '800px' }}>
    <GraphRenderer canvas={otelLogAssociationCanvas} />
  </div>
);

export const OtelLogAssociation: Story = {
  render: () => <OtelLogAssociationTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**OTEL Log Association Architecture** - Demonstrates the new OTEL visualization features:
- **OTEL Badges**: Circular badges (T/S/I) in the top-right corner of nodes indicating Type, Service, or Instance
- **Hover Tooltips**: Hover over any node to see the OTEL kind, category, NEW indicator, and description
- **Node Info Panel**: Click a node to see the OpenTelemetry section in the info panel

Color coding:
- **Blue (T)**: Type nodes - TypeScript types/interfaces
- **Green (S)**: Service nodes - Runtime services
- **Purple (I)**: Instance nodes - Specific running instances
        `,
      },
    },
  },
};

// ============================================================================
// Sources Tooltip Canvas
// ============================================================================

/**
 * Canvas demonstrating source file associations in tooltips
 */
const sourcesTooltipCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'auth-service',
      type: 'text',
      x: 100,
      y: 150,
      width: 160,
      height: 100,
      text: '# Auth Service\n\nHandles user authentication',
      color: '#3b82f6',
      pv: {
        nodeType: 'service',
        shape: 'rectangle',
        icon: 'Lock',
        sources: [
          'src/services/auth/AuthService.ts',
          'src/services/auth/TokenManager.ts',
        ],
      },
    },
    {
      id: 'user-controller',
      type: 'text',
      x: 350,
      y: 150,
      width: 160,
      height: 100,
      text: '# User Controller\n\nManages user CRUD operations',
      color: '#8b5cf6',
      pv: {
        nodeType: 'controller',
        shape: 'rectangle',
        icon: 'User',
        sources: [
          'src/controllers/UserController.ts',
        ],
      },
    },
    {
      id: 'database',
      type: 'text',
      x: 600,
      y: 150,
      width: 140,
      height: 100,
      text: '# Database\n\nPostgreSQL instance',
      color: '#22c55e',
      pv: {
        nodeType: 'database',
        shape: 'hexagon',
        icon: 'Database',
        sources: [
          'src/db/connection.ts',
          'src/db/migrations/001_init.sql',
          'src/db/queries/users.ts',
        ],
      },
    },
    {
      id: 'cache-layer',
      type: 'text',
      x: 225,
      y: 320,
      width: 150,
      height: 90,
      text: '# Cache Layer\n\nRedis caching',
      color: '#f59e0b',
      pv: {
        nodeType: 'cache',
        shape: 'diamond',
        icon: 'Zap',
        sources: [
          'src/cache/RedisCache.ts',
          'src/cache/CacheManager.ts',
        ],
      },
    },
    {
      id: 'logger',
      type: 'text',
      x: 450,
      y: 320,
      width: 140,
      height: 90,
      text: '# Logger\n\nCentralized logging',
      color: '#6366f1',
      pv: {
        nodeType: 'utility',
        shape: 'circle',
        icon: 'FileText',
        sources: [
          'src/utils/logger.ts',
        ],
      },
    },
  ],
  edges: [
    {
      id: 'auth-to-user',
      fromNode: 'auth-service',
      toNode: 'user-controller',
      fromSide: 'right',
      toSide: 'left',
      label: 'validates',
      edgeType: 'dataflow',
    },
    {
      id: 'user-to-db',
      fromNode: 'user-controller',
      toNode: 'database',
      fromSide: 'right',
      toSide: 'left',
      label: 'queries',
      edgeType: 'dataflow',
    },
    {
      id: 'auth-to-cache',
      fromNode: 'auth-service',
      toNode: 'cache-layer',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'stores tokens',
      edgeType: 'dataflow',
    },
    {
      id: 'user-to-cache',
      fromNode: 'user-controller',
      toNode: 'cache-layer',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'caches',
      edgeType: 'dataflow',
    },
    {
      id: 'auth-to-logger',
      fromNode: 'auth-service',
      toNode: 'logger',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'logs',
      edgeType: 'logging',
    },
    {
      id: 'user-to-logger',
      fromNode: 'user-controller',
      toNode: 'logger',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'logs',
      edgeType: 'logging',
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Service Architecture with Sources',
    description: 'Demonstrates source file associations in shift-hover tooltips',
    edgeTypes: {
      dataflow: {
        style: 'solid',
        color: '#3b82f6',
        width: 2,
        directed: true,
      },
      logging: {
        style: 'dashed',
        color: '#94a3b8',
        width: 2,
        directed: true,
      },
    },
  },
};

const SourcesInTooltipTemplate = () => {
  return (
    <div style={{ width: '100%', height: '550px' }}>
      <GraphRenderer
        canvas={sourcesTooltipCanvas}
      />
    </div>
  );
};

export const SourcesInTooltip: Story = {
  render: () => <SourcesInTooltipTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**[DEPRECATED]** This story previously demonstrated source file associations in tooltips and info panels.

**Note:** The sources display feature has been removed from the node rendering. Nodes can still have source data in their canvas definition, but it will not be displayed in the UI.
        `,
      },
    },
  },
};

const EditModeToggleTemplate = () => {
  const [isEditMode, setIsEditMode] = React.useState(false);
  const graphRef = React.useRef<GraphRendererHandle>(null);
  const [hasChanges, setHasChanges] = React.useState(false);

  const handleSave = () => {
    if (graphRef.current) {
      const changes = graphRef.current.getPendingChanges();
      console.log('Saving changes:', changes);
      alert('Changes saved! Check console for details.');
      graphRef.current.resetEditState();
    }
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#f0f9ff',
          borderRadius: 4,
          border: '1px solid #3b82f6',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            style={{
              padding: '8px 16px',
              backgroundColor: isEditMode ? '#ef4444' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 14,
            }}
          >
            {isEditMode ? '🔓 Exit Edit Mode' : '🔒 Enter Edit Mode'}
          </button>
          {isEditMode && hasChanges && (
            <button
              onClick={handleSave}
              style={{
                padding: '8px 16px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              💾 Save Changes
            </button>
          )}
          <div style={{ fontSize: 13, color: '#1e40af' }}>
            Mode: <strong>{isEditMode ? 'Editable' : 'Read-only'}</strong>
            {isEditMode && hasChanges && (
              <span style={{ marginLeft: 8, color: '#f97316', fontWeight: 'bold' }}>
                (unsaved changes)
              </span>
            )}
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
          Toggle between read-only and edit mode. Try dragging nodes after switching modes to verify
          the NaN error fix.
        </div>
      </div>
      <div style={{ width: '100%', height: '500px' }}>
        <GraphRenderer
          ref={graphRef}
          canvas={sampleCanvas}
          editable={isEditMode}
          onPendingChangesChange={setHasChanges}
        />
      </div>
    </div>
  );
};

export const EditModeToggle: Story = {
  render: () => <EditModeToggleTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Edit Mode Toggle** - Demonstrates toggling between read-only and editable modes without remounting.

This story tests the fix for the NaN coordinate error that occurred when transitioning between modes:
- Click "Enter Edit Mode" to enable editing
- Try dragging nodes (should work without NaN errors)
- Click "Exit Edit Mode" to return to read-only
- Toggle back to edit mode and drag again (should still work)

Previously, this would cause \`NaN\` errors in edge coordinates due to ReactFlow's internal state corruption.
The fix uses \`updateNodeInternals()\` to reset ReactFlow's measurement tracking when entering edit mode.
        `,
      },
    },
  },
};

/**
 * Canvas for demonstrating the selected prop styling
 */
const selectionStylingCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 70,
      text: 'Click Me!',
      color: '#4A90E2',
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'MousePointer',
        eventRef: 'user.clicked',
      },
    },
    {
      id: 'node-2',
      type: 'text',
      x: 300,
      y: 100,
      width: 100,
      height: 100,
      text: 'Or Me!',
      color: '#7B68EE',
      pv: {
        nodeType: 'data',
        shape: 'circle',
        icon: 'Circle',
        eventRef: 'data.processed',
      },
    },
    {
      id: 'node-3',
      type: 'text',
      x: 500,
      y: 100,
      width: 140,
      height: 70,
      text: 'Me Three!',
      color: '#22c55e',
      pv: {
        nodeType: 'process',
        shape: 'hexagon',
        icon: 'Hexagon',
        eventRef: 'workflow.executed',
      },
    },
    {
      id: 'node-4',
      type: 'text',
      x: 200,
      y: 250,
      width: 120,
      height: 120,
      text: 'Diamond',
      color: '#f59e0b',
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'GitBranch',
        eventRef: 'decision.evaluated',
      },
    },
    {
      id: 'node-5',
      type: 'text',
      x: 400,
      y: 250,
      width: 140,
      height: 80,
      text: 'Inline Event',
      color: '#8b5cf6',
      pv: {
        nodeType: 'event',
        shape: 'rectangle',
        icon: 'Zap',
        event: {
          name: 'order.completed',
          description: 'Triggered when an order is successfully completed and payment is confirmed',
          attributes: {
            orderId: { type: 'string', required: true, description: 'Unique order identifier' },
            userId: { type: 'string', required: true, description: 'User who placed the order' },
            amount: { type: 'number', required: true, description: 'Order total amount' },
            timestamp: { type: 'string', description: 'Order completion timestamp' },
          },
        },
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'node-1',
      toNode: 'node-2',
      edgeType: 'dataflow',
    },
    {
      id: 'edge-2',
      fromNode: 'node-2',
      toNode: 'node-3',
      edgeType: 'dataflow',
    },
    {
      id: 'edge-3',
      fromNode: 'node-1',
      toNode: 'node-4',
      edgeType: 'dataflow',
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Selection Styling Demo',
    description: 'Demonstrates ReactFlow selected prop visual styling',
    edgeTypes: {
      dataflow: {
        style: 'solid',
        color: '#50E3C2',
        directed: true,
      },
    },
  },
};

const SelectionStylingTemplate = () => {
  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#f0f9ff',
          borderRadius: 4,
          border: '1px solid #3b82f6',
        }}
      >
        <strong style={{ color: '#1e40af' }}>ReactFlow Selection Styling Demo</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
          <p style={{ margin: '4px 0' }}>
            This demonstrates the <code>selected</code> prop that ReactFlow passes to CustomNode.
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>Visual effects when a node is selected:</strong>
          </p>
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li><strong>2px box-shadow outline</strong> in the node's stroke color</li>
            <li><strong>Resize handles</strong> (only visible in edit mode - not shown in this demo)</li>
          </ul>
          <p style={{ margin: '8px 0 4px 0' }}>
            <strong>Try these interactions:</strong>
          </p>
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li><strong>Click</strong> any node → see the outline appear</li>
            <li><strong>Click another</strong> node → outline moves to new selection</li>
            <li><strong>Click background</strong> → outline disappears</li>
            <li><strong>Shift+Drag</strong> box around multiple nodes → all get outlined</li>
          </ul>
          <p style={{ margin: '8px 0 4px 0', fontSize: 11, fontStyle: 'italic', color: '#64748b' }}>
            Note: The <code>selected</code> prop is purely for visual feedback.
            The info panel uses a separate <code>selectedNodeIds</code> state.
          </p>
        </div>
      </div>
      <div style={{ width: '100%', height: '500px' }}>
        <GraphRenderer
          canvas={selectionStylingCanvas}
          showNodeDetailPanel={false}
        />
      </div>
    </div>
  );
};

export const SelectionStyling: Story = {
  render: () => <SelectionStylingTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Selection Styling** - Demonstrates the visual effects of ReactFlow's \`selected\` prop in read-only mode.

When a node is selected (via click or box selection), ReactFlow sets \`selected={true}\` on the node component.
This triggers visual changes in \`CustomNode\`:

1. **Box-shadow outline** (line 253-254 in CustomNode.tsx):
   - 2px solid outline using the node's stroke color
   - Appears immediately on selection
   - Removed when selection is cleared
   - **Click any node to see the outline appear!**

2. **NodeResizer visibility** (line 441 in CustomNode.tsx):
   - Shows resize handles when \`selected={true}\` AND \`editable={true}\`
   - Not visible in this demo (read-only mode)
   - See the "Editable" story for resize handle demos

**Key Point:** The \`selected\` prop is purely for ReactFlow's visual feedback. It's separate from
\`selectedNodeIds\` state which controls the info panel display.

In this demo, the info panel is hidden (\`showNodeDetailPanel={false}\`) and edit mode is disabled,
so you can focus on just the selection outline effect.
        `,
      },
    },
  },
};

const HighlightedNodeSyncTemplate = () => {
  const [highlightedNodeId, setHighlightedNodeId] = React.useState<string | null>(null);
  const nodeIds = ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'];
  const [currentIndex, setCurrentIndex] = React.useState(0);

  const handleCycleNodes = () => {
    const nextIndex = (currentIndex + 1) % nodeIds.length;
    setCurrentIndex(nextIndex);
    setHighlightedNodeId(nodeIds[nextIndex]);
  };

  const handleClearHighlight = () => {
    setHighlightedNodeId(null);
    setCurrentIndex(0);
  };

  // Mock event registry to demonstrate resolveEventRef
  const resolveEventRef = (eventRef: string) => {
    const eventRegistry: Record<string, PVEventSchema> = {
      'user.clicked': {
        name: 'user.clicked',
        description: 'Triggered when a user clicks on an interactive element',
        attributes: {
          elementId: { type: 'string', required: true, description: 'ID of the clicked element' },
          userId: { type: 'string', required: true, description: 'ID of the user who clicked' },
          timestamp: { type: 'string', required: true, description: 'ISO 8601 timestamp' },
          position: { type: 'object', description: 'Click coordinates (x, y)' },
        },
      },
      'data.processed': {
        name: 'data.processed',
        description: 'Emitted when data processing completes successfully',
        attributes: {
          dataId: { type: 'string', required: true, description: 'Unique identifier for the data' },
          recordsProcessed: { type: 'number', required: true, description: 'Number of records processed' },
          duration: { type: 'number', description: 'Processing time in milliseconds' },
          status: { type: 'string', required: true, description: 'Processing status (success/partial/failed)' },
        },
      },
      'workflow.executed': {
        name: 'workflow.executed',
        description: 'Fired when a workflow completes execution',
        attributes: {
          workflowId: { type: 'string', required: true, description: 'Workflow identifier' },
          executionId: { type: 'string', required: true, description: 'Execution run identifier' },
          steps: { type: 'array', description: 'List of executed step IDs' },
          result: { type: 'object', description: 'Workflow execution result' },
        },
      },
      'decision.evaluated': {
        name: 'decision.evaluated',
        description: 'Published when a decision point is evaluated in the flow',
        attributes: {
          decisionId: { type: 'string', required: true, description: 'Decision point identifier' },
          condition: { type: 'string', description: 'Evaluated condition expression' },
          result: { type: 'boolean', required: true, description: 'Evaluation result' },
          branchTaken: { type: 'string', required: true, description: 'Branch selected (true/false/error)' },
        },
      },
    };

    return eventRegistry[eventRef];
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#f0f9ff',
          borderRadius: 4,
          border: '1px solid #3b82f6',
        }}
      >
        <strong style={{ color: '#1e40af' }}>Highlighted Node Sync Demo</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
          <p style={{ margin: '4px 0' }}>
            This demonstrates how <code>highlightedNodeId</code> automatically syncs with selection
            and shows the node info panel.
          </p>
          <p style={{ margin: '8px 0 4px 0' }}>
            <strong>Current highlighted node:</strong>{' '}
            {highlightedNodeId ? (
              <span style={{ fontFamily: 'monospace', color: '#3b82f6' }}>{highlightedNodeId}</span>
            ) : (
              <span style={{ color: '#94a3b8' }}>None</span>
            )}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={handleCycleNodes}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              Cycle Nodes ({nodeIds[currentIndex]})
            </button>
            <button
              onClick={handleClearHighlight}
              style={{
                padding: '8px 16px',
                backgroundColor: '#94a3b8',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Clear Highlight
            </button>
          </div>
          <p style={{ margin: '12px 0 4px 0', fontSize: 11, fontStyle: 'italic', color: '#64748b' }}>
            When you cycle nodes, watch how:
          </p>
          <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: 11, color: '#64748b' }}>
            <li>The highlighted node gets a <strong>blue glow</strong></li>
            <li>The node is automatically <strong>selected</strong> (selection outline)</li>
            <li>The <strong>info panel shows</strong> at the bottom with node details</li>
          </ul>
        </div>
      </div>
      <div style={{ width: '100%', height: '500px' }}>
        <GraphRenderer
          canvas={selectionStylingCanvas}
          highlightedNodeId={highlightedNodeId}
          showNodeDetailPanel={true}
          resolveEventRef={resolveEventRef}
        />
      </div>
    </div>
  );
};

export const HighlightedNodeSync: Story = {
  render: () => <HighlightedNodeSyncTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Highlighted Node Sync** - Demonstrates automatic synchronization between \`highlightedNodeId\` and selection state.

This simulates what happens during execution playback in the CanvasDetailPanel:

**How it works:**
1. When \`highlightedNodeId\` prop changes, GraphRenderer automatically:
   - Selects that node (adds it to \`selectedNodeIds\`)
   - Shows the node info panel (\`showNodePanel = true\`)
   - Applies both the highlight glow and selection outline

2. This creates a seamless connection between:
   - Workflow events on the left (which set \`highlightedNodeId\`)
   - Visual feedback on the canvas (glow + outline)
   - Node details panel at the bottom (showing node info)

**Use case:**
In the CanvasDetailPanel, when users:
- Click a scenario template → Nodes involved in that scenario are highlighted
- Click a workflow event → The corresponding node on the canvas is highlighted
- Click a node on the canvas → The corresponding workflow event is highlighted

All of these actions update \`highlightedNodeId\`, which now automatically shows the node info panel!
        `,
      },
    },
  },
};

// ============================================================================
// Real-World Test Data: Version Registry Canvas
// ============================================================================

/**
 * Version Registry Canvas from web-ade project
 * Real production canvas showing version registration workflows
 */
const versionRegistryCanvas: ExtendedCanvas = {
  "name": "Version Registry",
  "description": "Maps customer version strings (semver, git SHA, build numbers) to git commit SHAs for contract-based observability",
  "markdown": ".principal-views/version-registry/version-registry.md",
  "edgeTypes": {
    "flow": {
      "label": "Flow"
    },
    "error": {
      "label": "Error Path"
    },
    "cache": {
      "label": "Cache Path"
    }
  },
  "nodes": [
    {
      "id": "registration-started",
      "type": "text",
      "text": "# Registration Started\n\nVersion registration request received",
      "x": 100,
      "y": 50,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.registration.started",
          "attributes": {}
        },
        "sources": [
          "src/app/api/versions/route.ts"
        ],
        "status": "implemented",
        "otel": {
          "kind": "event",
          "category": "lifecycle"
        },
        "shape": "rectangle",
        "fill": "#22c55e",
        "stroke": "#16a34a",
        "dataSchema": {
          "service.name": {
            "type": "string",
            "required": true
          },
          "version": {
            "type": "string",
            "required": true
          },
          "repository.url": {
            "type": "string",
            "required": true
          },
          "environment": {
            "type": "string",
            "required": true
          },
          "git.sha": {
            "type": "string",
            "required": true
          }
        }
      }
    },
    {
      "id": "registration-validated",
      "type": "text",
      "text": "# Validate Request\n\nRequest validated successfully",
      "x": 89,
      "y": 199,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.registration.validated",
          "attributes": {}
        },
        "sources": [
          "src/lib/version-registry/version-manager.ts"
        ],
        "status": "approved",
        "otel": {
          "kind": "event",
          "category": "operation"
        },
        "shape": "rectangle",
        "fill": "#3b82f6",
        "stroke": "#1d4ed8",
        "dataSchema": {
          "customer.id": {
            "type": "string",
            "required": true
          },
          "service.name": {
            "type": "string",
            "required": true
          },
          "version": {
            "type": "string",
            "required": true
          }
        }
      }
    },
    {
      "id": "registration-s3-stored",
      "type": "text",
      "text": "# Store to S3\n\nVersion mapping stored to S3",
      "x": 92,
      "y": 350,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.registration.s3.stored",
          "attributes": {}
        },
        "sources": [
          "src/lib/version-registry/s3-storage.ts"
        ],
        "status": "draft",
        "otel": {
          "kind": "event",
          "category": "operation"
        },
        "shape": "rectangle",
        "fill": "#3b82f6",
        "stroke": "#1d4ed8",
        "dataSchema": {
          "s3.key": {
            "type": "string",
            "required": true
          },
          "s3.bucket": {
            "type": "string",
            "required": true
          },
          "already.exists": {
            "type": "boolean",
            "required": false
          }
        }
      }
    },
    {
      "id": "schematic-fetching",
      "type": "text",
      "text": "# Fetch Schematic\n\nFetching schematic from GitHub at commit SHA",
      "x": 91,
      "y": 498,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.registration.schematic.fetching",
          "attributes": {}
        },
        "sources": [
          "src/lib/version-registry/version-manager.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "operation"
        },
        "shape": "rectangle",
        "fill": "#3b82f6",
        "stroke": "#1d4ed8",
        "dataSchema": {
          "repository.url": {
            "type": "string",
            "required": true
          },
          "git.sha": {
            "type": "string",
            "required": true
          },
          "schematic.cached": {
            "type": "boolean",
            "required": false
          }
        }
      }
    },
    {
      "id": "schematic-fetched",
      "type": "text",
      "text": "# Schematic Retrieved\n\nSchematic fetched from GitHub successfully",
      "x": 91,
      "y": 649,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.registration.schematic.fetched",
          "attributes": {}
        },
        "sources": [
          "src/lib/version-registry/schematic-fetcher.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "operation"
        },
        "shape": "rectangle",
        "fill": "#3b82f6",
        "stroke": "#1d4ed8",
        "dataSchema": {
          "schematic.id": {
            "type": "string",
            "required": true
          },
          "canvases.count": {
            "type": "number",
            "required": true
          },
          "storyboards.count": {
            "type": "number",
            "required": true
          },
          "workflows.count": {
            "type": "number",
            "required": true
          },
          "errors.count": {
            "type": "number",
            "required": false
          }
        }
      }
    },
    {
      "id": "schematic-stored",
      "type": "text",
      "text": "# Store Schematic\n\nSchematic stored to S3",
      "x": 86,
      "y": 801,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.registration.schematic.stored",
          "attributes": {}
        },
        "sources": [
          "src/lib/version-registry/s3-storage.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "operation"
        },
        "shape": "rectangle",
        "fill": "#3b82f6",
        "stroke": "#1d4ed8",
        "dataSchema": {
          "s3.key": {
            "type": "string",
            "required": true
          },
          "s3.bucket": {
            "type": "string",
            "required": true
          },
          "schematic.id": {
            "type": "string",
            "required": true
          }
        }
      }
    },
    {
      "id": "registration-complete",
      "type": "text",
      "text": "# Registration Complete\n\nVersion registered successfully",
      "x": 97,
      "y": 954,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.registration.complete",
          "attributes": {}
        },
        "sources": [
          "src/app/api/versions/route.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "lifecycle"
        },
        "shape": "rectangle",
        "fill": "#22c55e",
        "stroke": "#16a34a",
        "dataSchema": {
          "registration.id": {
            "type": "string",
            "required": true
          },
          "schematic.id": {
            "type": "string",
            "required": true
          },
          "duration.ms": {
            "type": "number",
            "required": false
          }
        }
      }
    },
    {
      "id": "registration-error",
      "type": "text",
      "text": "# Registration Error\n\nVersion registration failed",
      "x": 410,
      "y": 358,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.registration.error",
          "attributes": {}
        },
        "sources": [
          "src/app/api/versions/route.ts",
          "src/lib/version-registry/version-manager.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "error"
        },
        "shape": "rectangle",
        "fill": "#ef4444",
        "stroke": "#dc2626",
        "dataSchema": {
          "error.type": {
            "type": "string",
            "required": true
          },
          "error.message": {
            "type": "string",
            "required": true
          },
          "error.stage": {
            "type": "string",
            "required": true
          },
          "service.name": {
            "type": "string",
            "required": false
          },
          "version": {
            "type": "string",
            "required": false
          }
        }
      }
    },
    {
      "id": "lookup-started",
      "type": "text",
      "text": "# Lookup Started\n\nVersion lookup request received",
      "x": 1137,
      "y": 172,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.lookup.started",
          "attributes": {}
        },
        "sources": [
          "src/app/api/versions/lookup/route.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "lifecycle"
        },
        "shape": "rectangle",
        "fill": "#22c55e",
        "stroke": "#16a34a",
        "dataSchema": {
          "customer.id": {
            "type": "string",
            "required": true
          },
          "service.name": {
            "type": "string",
            "required": true
          },
          "version": {
            "type": "string",
            "required": true
          },
          "environment": {
            "type": "string",
            "required": true
          }
        }
      }
    },
    {
      "id": "lookup-s3-retrieved",
      "type": "text",
      "text": "# Retrieve from S3\n\nVersion mapping retrieved from S3",
      "x": 1138,
      "y": 386,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.lookup.s3.retrieved",
          "attributes": {}
        },
        "sources": [
          "src/lib/version-registry/s3-storage.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "operation"
        },
        "shape": "rectangle",
        "fill": "#3b82f6",
        "stroke": "#1d4ed8",
        "dataSchema": {
          "s3.key": {
            "type": "string",
            "required": true
          },
          "git.sha": {
            "type": "string",
            "required": true
          },
          "repository.url": {
            "type": "string",
            "required": true
          },
          "deployed.at": {
            "type": "string",
            "required": true
          }
        }
      }
    },
    {
      "id": "lookup-complete",
      "type": "text",
      "text": "# Lookup Complete\n\nVersion lookup successful",
      "x": 1138,
      "y": 596,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.lookup.complete",
          "attributes": {}
        },
        "sources": [
          "src/app/api/versions/lookup/route.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "lifecycle"
        },
        "shape": "rectangle",
        "fill": "#22c55e",
        "stroke": "#16a34a",
        "dataSchema": {
          "git.sha": {
            "type": "string",
            "required": true
          },
          "duration.ms": {
            "type": "number",
            "required": false
          }
        }
      }
    },
    {
      "id": "lookup-not-found",
      "type": "text",
      "text": "# Not Found\n\nVersion not registered",
      "x": 1470,
      "y": 262,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.lookup.not_found",
          "attributes": {}
        },
        "sources": [
          "src/app/api/versions/lookup/route.ts",
          "src/lib/version-registry/s3-storage.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "operation"
        },
        "shape": "rectangle",
        "fill": "#f59e0b",
        "stroke": "#d97706",
        "dataSchema": {
          "customer.id": {
            "type": "string",
            "required": true
          },
          "service.name": {
            "type": "string",
            "required": true
          },
          "version": {
            "type": "string",
            "required": true
          }
        }
      }
    },
    {
      "id": "lookup-error",
      "type": "text",
      "text": "# Lookup Error\n\nVersion lookup failed",
      "x": 1471,
      "y": 93,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.lookup.error",
          "attributes": {}
        },
        "sources": [
          "src/app/api/versions/lookup/route.ts",
          "src/lib/version-registry/version-manager.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "error"
        },
        "shape": "rectangle",
        "fill": "#ef4444",
        "stroke": "#dc2626",
        "dataSchema": {
          "error.type": {
            "type": "string",
            "required": true
          },
          "error.message": {
            "type": "string",
            "required": true
          },
          "error.stage": {
            "type": "string",
            "required": true
          }
        }
      }
    },
    {
      "id": "list-started",
      "type": "text",
      "text": "# List Started\n\nVersion list request received",
      "x": 678,
      "y": 292,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.list.started",
          "attributes": {}
        },
        "sources": [
          "src/app/api/versions/list/route.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "lifecycle"
        },
        "shape": "rectangle",
        "fill": "#22c55e",
        "stroke": "#16a34a",
        "dataSchema": {
          "customer.id": {
            "type": "string",
            "required": true
          }
        }
      }
    },
    {
      "id": "list-s3-retrieved",
      "type": "text",
      "text": "# Fetch All Versions\n\nAll registrations fetched from S3",
      "x": 678,
      "y": 465,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.list.s3.retrieved",
          "attributes": {}
        },
        "sources": [
          "src/lib/version-registry/s3-storage.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "operation"
        },
        "shape": "rectangle",
        "fill": "#3b82f6",
        "stroke": "#2563eb",
        "dataSchema": {
          "customer.id": {
            "type": "string",
            "required": true
          },
          "registration.count": {
            "type": "number",
            "required": true
          }
        }
      }
    },
    {
      "id": "list-complete",
      "type": "text",
      "text": "# List Complete\n\nVersion list successful",
      "x": 678,
      "y": 675,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.list.complete",
          "attributes": {}
        },
        "sources": [
          "src/app/api/versions/list/route.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "lifecycle"
        },
        "shape": "rectangle",
        "fill": "#22c55e",
        "stroke": "#16a34a",
        "dataSchema": {
          "customer.id": {
            "type": "string",
            "required": true
          },
          "registration.count": {
            "type": "number",
            "required": true
          }
        }
      }
    },
    {
      "id": "list-error",
      "type": "text",
      "text": "# List Error\n\nVersion list failed",
      "x": 921,
      "y": 291,
      "width": 200,
      "height": 100,
      "pv": {
        "event": {
          "name": "version.list.error",
          "attributes": {}
        },
        "sources": [
          "src/app/api/versions/list/route.ts",
          "src/lib/version-registry/s3-storage.ts"
        ],
        "otel": {
          "kind": "event",
          "category": "error"
        },
        "shape": "rectangle",
        "fill": "#ef4444",
        "stroke": "#dc2626",
        "dataSchema": {
          "error.type": {
            "type": "string",
            "required": true
          },
          "error.message": {
            "type": "string",
            "required": true
          },
          "error.stage": {
            "type": "string",
            "required": true
          }
        }
      }
    }
  ],
  "edges": [
    {
      "id": "edge-reg-start-to-validate",
      "fromNode": "registration-started",
      "fromSide": "bottom",
      "toNode": "registration-validated",
      "toSide": "top",
      "edgeType": "flow"
    },
    {
      "id": "edge-reg-validate-to-s3",
      "fromNode": "registration-validated",
      "fromSide": "bottom",
      "toNode": "registration-s3-stored",
      "toSide": "top",
      "edgeType": "flow"
    },
    {
      "id": "edge-reg-s3-to-schematic-fetching",
      "fromNode": "registration-s3-stored",
      "fromSide": "bottom",
      "toNode": "schematic-fetching",
      "toSide": "top",
      "edgeType": "flow"
    },
    {
      "id": "edge-schematic-fetching-to-fetched",
      "fromNode": "schematic-fetching",
      "fromSide": "bottom",
      "toNode": "schematic-fetched",
      "toSide": "top",
      "edgeType": "flow"
    },
    {
      "id": "edge-schematic-fetched-to-stored",
      "fromNode": "schematic-fetched",
      "fromSide": "bottom",
      "toNode": "schematic-stored",
      "toSide": "top",
      "edgeType": "flow"
    },
    {
      "id": "edge-schematic-stored-to-complete",
      "fromNode": "schematic-stored",
      "fromSide": "bottom",
      "toNode": "registration-complete",
      "toSide": "top",
      "edgeType": "flow"
    },
    {
      "id": "edge-schematic-fetching-to-error",
      "fromNode": "schematic-fetching",
      "fromSide": "right",
      "toNode": "registration-error",
      "toSide": "left",
      "label": "schematic fetch failed",
      "edgeType": "error"
    },
    {
      "id": "edge-schematic-stored-to-error",
      "fromNode": "schematic-stored",
      "fromSide": "right",
      "toNode": "registration-error",
      "toSide": "left",
      "label": "storage failed",
      "edgeType": "error"
    },
    {
      "id": "edge-reg-start-to-error",
      "fromNode": "registration-started",
      "fromSide": "right",
      "toNode": "registration-error",
      "toSide": "left",
      "label": "validation error",
      "edgeType": "error"
    },
    {
      "id": "edge-reg-validate-to-error",
      "fromNode": "registration-validated",
      "fromSide": "right",
      "toNode": "registration-error",
      "toSide": "left",
      "label": "storage error",
      "edgeType": "error"
    },
    {
      "id": "edge-lookup-start-to-s3",
      "fromNode": "lookup-started",
      "fromSide": "bottom",
      "toNode": "lookup-s3-retrieved",
      "toSide": "top",
      "edgeType": "flow"
    },
    {
      "id": "edge-lookup-s3-to-complete",
      "fromNode": "lookup-s3-retrieved",
      "fromSide": "bottom",
      "toNode": "lookup-complete",
      "toSide": "top",
      "edgeType": "flow"
    },
    {
      "id": "edge-lookup-start-to-not-found",
      "fromNode": "lookup-started",
      "fromSide": "right",
      "toNode": "lookup-not-found",
      "toSide": "left",
      "label": "not registered",
      "edgeType": "error"
    },
    {
      "id": "edge-lookup-start-to-error",
      "fromNode": "lookup-started",
      "fromSide": "right",
      "toNode": "lookup-error",
      "toSide": "left",
      "label": "storage error",
      "edgeType": "error"
    },
    {
      "id": "edge-list-start-to-s3",
      "fromNode": "list-started",
      "fromSide": "bottom",
      "toNode": "list-s3-retrieved",
      "toSide": "top",
      "edgeType": "flow"
    },
    {
      "id": "edge-list-s3-to-complete",
      "fromNode": "list-s3-retrieved",
      "fromSide": "bottom",
      "toNode": "list-complete",
      "toSide": "top",
      "edgeType": "flow"
    },
    {
      "id": "edge-list-start-to-error",
      "fromNode": "list-started",
      "fromSide": "right",
      "toNode": "list-error",
      "toSide": "left",
      "label": "storage error",
      "edgeType": "error"
    }
  ]
};

const VersionRegistryTemplate = () => {
  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#f0fdf4',
          borderRadius: 4,
          border: '1px solid #22c55e',
        }}
      >
        <strong style={{ color: '#15803d' }}>Version Registry Canvas (Real Production Data)</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#166534' }}>
          <p style={{ margin: '4px 0' }}>
            This is a real production canvas from the web-ade project showing a version registry system.
          </p>
          <p style={{ margin: '8px 0 4px 0' }}>
            <strong>Features demonstrated:</strong>
          </p>
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li><strong>16 nodes</strong> across 3 separate workflows (Registration, Lookup, List)</li>
            <li><strong>OTEL event metadata</strong> with dataSchemas defining expected attributes</li>
            <li><strong>Multiple edge types</strong>: flow (normal), error (failure paths), cache</li>
            <li><strong>Color-coded events</strong>: Green (lifecycle), Blue (operation), Red (error), Orange (warning)</li>
            <li><strong>Source file associations</strong> linking events to implementation files</li>
            <li><strong>Complex workflow patterns</strong> including happy paths and error handling</li>
          </ul>
          <p style={{ margin: '8px 0 4px 0' }}>
            <strong>Try clicking nodes</strong> to see their OTEL metadata, dataSchemas, and source files!
          </p>
        </div>
      </div>
      <div style={{ width: '100%', height: '800px' }}>
        <GraphRenderer
          canvas={versionRegistryCanvas}
          showNodeDetailPanel={true}
        />
      </div>
    </div>
  );
};

export const VersionRegistry: Story = {
  render: () => <VersionRegistryTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Version Registry - Real Production Canvas**

This story uses actual production data from the web-ade project's version registry system.
It demonstrates how Principal View handles complex, real-world workflows with:

**Three Main Workflows:**

1. **Registration Flow (Left)**:
   - \`version.registration.started\` → validated → s3.stored → schematic.fetching → schematic.fetched → schematic.stored → complete
   - Handles registering new version mappings from customer version strings to git SHAs
   - Includes error paths for validation, storage, and schematic fetch failures

2. **Lookup Flow (Middle)**:
   - \`version.lookup.started\` → s3.retrieved → complete
   - Retrieves existing version mappings from S3
   - Error paths for not found and lookup failures

3. **List Flow (Right)**:
   - \`version.list.started\` → s3.retrieved → complete
   - Lists all version registrations for a customer
   - Error path for storage errors

**OTEL Integration:**
- Each node has \`pv.event\` with event name and attributes
- \`dataSchema\` defines expected OTEL attributes (type, required, description)
- OTEL categories: lifecycle (green), operation (blue), error (red)
- Source file associations show where events are emitted

**Use Case:**
This canvas serves as the "contract" for version registry observability:
- Developers instrument these events in their code
- Runtime telemetry is validated against these schemas
- Missing or orphaned events are detected automatically
- Coverage reports show which nodes are "silent" vs "active"
        `,
      },
    },
  },
};

// ============================================================================
// Fit View to Nodes Story
// ============================================================================

/**
 * Helper to select random nodes from an array
 */
function selectRandomNodes(allNodeIds: string[], count: number): string[] {
  const shuffled = [...allNodeIds].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, allNodeIds.length));
}

const FitViewToNodesTemplate = () => {
  // Get all node IDs from the version registry canvas
  const allNodeIds = versionRegistryCanvas.nodes.map((n) => n.id);

  const [selectedNodeIds, setSelectedNodeIds] = React.useState<string[]>([]);
  const [nodeCount, setNodeCount] = React.useState(3);

  const handleSelectRandom = () => {
    const randomNodes = selectRandomNodes(allNodeIds, nodeCount);
    setSelectedNodeIds(randomNodes);
  };

  const handleClear = () => {
    setSelectedNodeIds([]);
  };

  // Pre-defined scenarios for quick testing
  const handleSelectRegistrationFlow = () => {
    setSelectedNodeIds([
      'registration-started',
      'registration-validated',
      'registration-s3-stored',
      'schematic-fetching',
      'schematic-fetched',
      'schematic-stored',
      'registration-complete',
    ]);
  };

  const handleSelectErrorNodes = () => {
    setSelectedNodeIds([
      'registration-error',
      'lookup-error',
      'list-error',
      'lookup-not-found',
    ]);
  };

  const handleSelectLookupFlow = () => {
    setSelectedNodeIds([
      'lookup-started',
      'lookup-s3-retrieved',
      'lookup-complete',
    ]);
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#f0f9ff',
          borderRadius: 4,
          border: '1px solid #3b82f6',
        }}
      >
        <strong style={{ color: '#1e40af' }}>Fit View to Specific Nodes</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
          <p style={{ margin: '4px 0' }}>
            This demonstrates the <code>fitViewToNodeIds</code> prop that zooms/pans the viewport
            to show only the specified nodes.
          </p>
          <p style={{ margin: '8px 0 4px 0' }}>
            <strong>Currently showing:</strong>{' '}
            {selectedNodeIds.length > 0 ? (
              <span style={{ fontFamily: 'monospace', color: '#3b82f6' }}>
                {selectedNodeIds.length} nodes: [{selectedNodeIds.join(', ')}]
              </span>
            ) : (
              <span style={{ color: '#94a3b8' }}>All nodes (default fitView)</span>
            )}
          </p>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#475569' }}>
            Random count:
            <select
              value={nodeCount}
              onChange={(e) => setNodeCount(Number(e.target.value))}
              style={{
                marginLeft: 4,
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid #cbd5e1',
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={handleSelectRandom}
            style={{
              padding: '6px 12px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 'bold',
            }}
          >
            Select Random Nodes
          </button>
          <button
            onClick={handleClear}
            style={{
              padding: '6px 12px',
              backgroundColor: '#94a3b8',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Clear (Show All)
          </button>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center' }}>Quick scenarios:</span>
          <button
            onClick={handleSelectRegistrationFlow}
            style={{
              padding: '4px 10px',
              backgroundColor: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Registration Flow (7 nodes)
          </button>
          <button
            onClick={handleSelectLookupFlow}
            style={{
              padding: '4px 10px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Lookup Flow (3 nodes)
          </button>
          <button
            onClick={handleSelectErrorNodes}
            style={{
              padding: '4px 10px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Error Nodes (4 nodes)
          </button>
        </div>
      </div>
      <div style={{ width: '100%', height: '600px' }}>
        <GraphRenderer
          canvas={versionRegistryCanvas}
          fitViewToNodeIds={selectedNodeIds.length > 0 ? selectedNodeIds : undefined}
          fitViewPadding={0.1}
          activeNodeIds={selectedNodeIds.length > 0 ? selectedNodeIds : undefined}
          showNodeDetailPanel={true}
        />
      </div>
    </div>
  );
};

export const FitViewToNodes: Story = {
  render: () => <FitViewToNodesTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Fit View to Specific Nodes** - Demonstrates the \`fitViewToNodeIds\` prop for focusing on subsets of a graph.

**Use Cases:**
- **Scenario Playback**: When playing back a workflow scenario, fit the view to show only the nodes involved
- **Search Results**: When searching for specific events, zoom to show matching nodes
- **Error Investigation**: Focus on error paths without manually panning/zooming
- **Step-by-Step Tutorials**: Highlight different parts of the graph as users progress

**How It Works:**
1. Pass an array of node IDs to \`fitViewToNodeIds\`
2. The viewport animates to fit those specific nodes
3. Pass \`undefined\` or empty array to return to default behavior (fit all nodes)

**Props:**
- \`fitViewToNodeIds\`: Array of node IDs to fit in view
- \`fitViewPadding\`: Padding around the nodes (default: 0.2)

**In This Demo:**
- Select random nodes to see how the view adjusts
- Try the pre-defined scenarios (Registration Flow, Lookup Flow, Error Nodes)
- Clear selection to fit all nodes again
        `,
      },
    },
  },
};

// ============================================================================
// Initial Viewport Comparison Story
// ============================================================================

const InitialViewportComparisonTemplate = () => {
  const [key, setKey] = React.useState(0);

  const handleRemount = () => {
    setKey((k) => k + 1);
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#fef3c7',
          borderRadius: 4,
          border: '1px solid #f59e0b',
        }}
      >
        <strong style={{ color: '#92400e' }}>Initial Viewport Comparison</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#78350f' }}>
          <p style={{ margin: '4px 0' }}>
            Compare the loading behavior with and without pre-calculated viewport dimensions.
          </p>
          <p style={{ margin: '8px 0 4px 0' }}>
            <strong>Left:</strong> Default behavior - starts at zoom=1, then animates to fit
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>Right:</strong> With <code>containerWidth</code>/<code>containerHeight</code> - instant correct positioning
          </p>
          <button
            onClick={handleRemount}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              backgroundColor: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 14,
            }}
          >
            Remount Both (to see initial load behavior)
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: '#fee2e2',
              borderRadius: '4px 4px 0 0',
              border: '1px solid #fca5a5',
              borderBottom: 'none',
              fontSize: 12,
              fontWeight: 'bold',
              color: '#991b1b',
            }}
          >
            Without containerWidth/Height (animated)
          </div>
          <div
            key={`animated-${key}`}
            style={{ width: '100%', height: '500px', border: '1px solid #fca5a5' }}
          >
            <GraphRenderer canvas={versionRegistryCanvas} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: '#dcfce7',
              borderRadius: '4px 4px 0 0',
              border: '1px solid #86efac',
              borderBottom: 'none',
              fontSize: 12,
              fontWeight: 'bold',
              color: '#166534',
            }}
          >
            With containerWidth/Height (instant)
          </div>
          <div
            key={`instant-${key}`}
            style={{ width: '100%', height: '500px', border: '1px solid #86efac' }}
          >
            <GraphRenderer
              canvas={versionRegistryCanvas}
              containerWidth={600}
              containerHeight={500}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const InitialViewportComparison: Story = {
  render: () => <InitialViewportComparisonTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Initial Viewport Comparison** - Demonstrates the difference between default and pre-calculated viewport behavior.

**The Problem:**
By default, React Flow renders at zoom=1 centered at origin, then after ~100ms calls \`fitView()\` with a 200ms animation.
This creates a visible "zoom in then zoom out" effect on initial load.

**The Solution:**
When you provide \`containerWidth\` and \`containerHeight\` props, the component calculates the correct viewport
(zoom level and pan position) synchronously before the first render. This eliminates the animation entirely.

**How to Use:**
\`\`\`tsx
<GraphRenderer
  canvas={myCanvas}
  containerWidth={800}   // Your container's width in pixels
  containerHeight={600}  // Your container's height in pixels
/>
\`\`\`

**When to Use:**
- When you know the container dimensions ahead of time (fixed layouts)
- When the container size comes from a layout system (CSS grid, flexbox with known dimensions)
- When you want to eliminate any visual "settling" on initial load

**When NOT to Use:**
- When container dimensions are dynamic/unknown until mount
- When using percentage-based sizing without a parent with known dimensions
- In these cases, the default delayed fitView behavior is still appropriate
        `,
      },
    },
  },
};

// ============================================================================
// ELK Layout with Edit Mode
// ============================================================================

const elkEditableCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'a',
      type: 'text',
      x: 50,
      y: 50,
      width: 120,
      height: 60,
      text: 'Node A',
      color: 5,
      pv: { nodeType: 'component', shape: 'rectangle' },
    },
    {
      id: 'b',
      type: 'text',
      x: 250,
      y: 50,
      width: 120,
      height: 60,
      text: 'Node B',
      color: 4,
      pv: { nodeType: 'component', shape: 'rectangle' },
    },
    {
      id: 'c',
      type: 'text',
      x: 250,
      y: 180,
      width: 120,
      height: 60,
      text: 'Node C',
      color: 2,
      pv: { nodeType: 'component', shape: 'rectangle' },
    },
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b', fromSide: 'right', toSide: 'left', edgeType: 'flow' },
    { id: 'e2', fromNode: 'a', toNode: 'c', fromSide: 'bottom', toSide: 'left', edgeType: 'flow' },
  ],
  pv: {
    version: '1.0.0',
    name: 'ELK Editable Test',
    edgeTypes: {
      flow: { style: 'solid', color: '#3b82f6', width: 2, directed: true },
    },
    nodeTypes: {
      component: { color: '#4A90E2' },
    },
  },
};

const ElkEditModeTemplate = () => {
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [hasChanges, setHasChanges] = React.useState(false);
  const graphRef = React.useRef<GraphRendererHandle>(null);

  return (
    <div style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px', background: '#f0f0f0', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button
          onClick={() => setIsEditMode(!isEditMode)}
          style={{
            padding: '8px 16px',
            background: isEditMode ? '#ef4444' : '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {isEditMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
        </button>
        {isEditMode && hasChanges && (
          <>
            <button
              onClick={() => {
                graphRef.current?.getPendingChanges();
                setHasChanges(false);
              }}
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
            <button
              onClick={() => {
                graphRef.current?.resetEditState();
                setHasChanges(false);
              }}
              style={{
                padding: '8px 16px',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Discard
            </button>
          </>
        )}
        <span style={{ marginLeft: 'auto', color: '#666' }}>
          {isEditMode ? 'Drag nodes to test edge routing' : 'Click Edit to enable node dragging'}
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <GraphRenderer
          ref={graphRef}
          canvas={elkEditableCanvas}
          width="100%"
          height="100%"
          editable={isEditMode}
          onPendingChangesChange={setHasChanges}
          showBackground={true}
          backgroundVariant="dots"
          elkLayout={{ enabled: true, routingStyle: 'orthogonal' }}
        />
      </div>
    </div>
  );
};

export const ElkLayoutEditMode: Story = {
  render: () => <ElkEditModeTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**ELK Layout with Edit Mode** - Tests orthogonal edge routing with editable nodes.

**Test Cases:**
1. Enter edit mode and drag Node A - edges should maintain connection points and reroute
2. Drag Node C - bottom-to-left edge should stay connected correctly
3. Save/Discard should preserve or reset positions
4. Edges should not disappear when entering edit mode
        `,
      },
    },
  },
};
