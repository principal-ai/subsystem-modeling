import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import React from 'react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta: Meta<typeof GraphRenderer> = {
  title: 'Features/MultiConfig',
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
};

export default meta;
type Story = StoryObj<typeof GraphRenderer>;

// ============================================================================
// Sample Canvas Configurations
// ============================================================================

/**
 * Simple Service Architecture Canvas
 */
const simpleServiceCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'api-1',
      type: 'text',
      x: 100,
      y: 150,
      width: 120,
      height: 70,
      text: 'API',
      color: '#4A90E2',
      pv: {
        nodeType: 'api',
        shape: 'rectangle',
        icon: 'Globe',
      },
    },
    {
      id: 'service-1',
      type: 'text',
      x: 300,
      y: 150,
      width: 100,
      height: 100,
      text: 'Service',
      color: '#7ED321',
      pv: {
        nodeType: 'service',
        shape: 'hexagon',
        icon: 'Cog',
      },
    },
    {
      id: 'database-1',
      type: 'text',
      x: 500,
      y: 150,
      width: 80,
      height: 80,
      text: 'Database',
      color: '#BD10E0',
      pv: {
        nodeType: 'database',
        shape: 'circle',
        icon: 'Database',
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'api-1',
      toNode: 'service-1',
      pv: { edgeType: 'api_call' },
    },
    {
      id: 'edge-2',
      fromNode: 'service-1',
      toNode: 'database-1',
      pv: { edgeType: 'data_access' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Simple Service',
    description: 'Basic 3-tier service architecture',
    edgeTypes: {
      api_call: {
        style: 'solid',
        color: '#4A90E2',
        width: 2,
        directed: true,
      },
      data_access: {
        style: 'dashed',
        color: '#BD10E0',
        width: 2,
        directed: true,
      },
    },
  },
};

/**
 * Microservices Architecture Canvas
 */
const microservicesCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'gateway-1',
      type: 'text',
      x: 300,
      y: 50,
      width: 120,
      height: 70,
      text: 'Gateway',
      color: '#00C853',
      pv: {
        nodeType: 'gateway',
        shape: 'rectangle',
        icon: 'Network',
      },
    },
    {
      id: 'auth-1',
      type: 'text',
      x: 100,
      y: 200,
      width: 120,
      height: 70,
      text: 'Auth Service',
      color: '#FF6B6B',
      pv: {
        nodeType: 'auth_service',
        shape: 'rectangle',
        icon: 'Lock',
      },
    },
    {
      id: 'user-1',
      type: 'text',
      x: 300,
      y: 200,
      width: 120,
      height: 70,
      text: 'User Service',
      color: '#4A90E2',
      pv: {
        nodeType: 'user_service',
        shape: 'rectangle',
        icon: 'Users',
      },
    },
    {
      id: 'cache-1',
      type: 'text',
      x: 100,
      y: 350,
      width: 80,
      height: 80,
      text: 'Cache',
      color: '#3498DB',
      pv: {
        nodeType: 'cache',
        shape: 'circle',
        icon: 'Zap',
      },
    },
    {
      id: 'db-1',
      type: 'text',
      x: 300,
      y: 350,
      width: 80,
      height: 80,
      text: 'Database',
      color: '#27AE60',
      pv: {
        nodeType: 'database',
        shape: 'circle',
        icon: 'Database',
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'gateway-1',
      toNode: 'auth-1',
      pv: { edgeType: 'http_request' },
    },
    {
      id: 'edge-2',
      fromNode: 'gateway-1',
      toNode: 'user-1',
      pv: { edgeType: 'http_request' },
    },
    {
      id: 'edge-3',
      fromNode: 'auth-1',
      toNode: 'cache-1',
      pv: { edgeType: 'cache_access' },
    },
    {
      id: 'edge-4',
      fromNode: 'user-1',
      toNode: 'db-1',
      pv: { edgeType: 'http_request' },
    },
  ],
  pv: {
    version: '2.0.0',
    name: 'Microservices',
    description: 'Distributed microservices architecture',
    edgeTypes: {
      http_request: {
        style: 'solid',
        color: '#4A90E2',
        width: 2,
        directed: true,
        animation: {
          type: 'flow',
          duration: 1500,
        },
      },
      cache_access: {
        style: 'dotted',
        color: '#3498DB',
        width: 2,
        directed: true,
      },
    },
  },
};

/**
 * Data Pipeline Canvas
 */
const dataPipelineCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'source-1',
      type: 'text',
      x: 100,
      y: 150,
      width: 120,
      height: 70,
      text: 'Data Source',
      color: '#6C5CE7',
      pv: {
        nodeType: 'data_source',
        shape: 'rectangle',
        icon: 'FileInput',
      },
    },
    {
      id: 'validator-1',
      type: 'text',
      x: 280,
      y: 150,
      width: 90,
      height: 90,
      text: 'Validator',
      color: '#00B894',
      pv: {
        nodeType: 'validator',
        shape: 'diamond',
        icon: 'CheckCircle',
      },
    },
    {
      id: 'transformer-1',
      type: 'text',
      x: 450,
      y: 150,
      width: 100,
      height: 100,
      text: 'Transformer',
      color: '#FD79A8',
      pv: {
        nodeType: 'transformer',
        shape: 'hexagon',
        icon: 'RefreshCw',
      },
    },
    {
      id: 'warehouse-1',
      type: 'text',
      x: 620,
      y: 150,
      width: 80,
      height: 80,
      text: 'Warehouse',
      color: '#0984E3',
      pv: {
        nodeType: 'data_warehouse',
        shape: 'circle',
        icon: 'Database',
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'source-1',
      toNode: 'validator-1',
      pv: { edgeType: 'validation_flow' },
    },
    {
      id: 'edge-2',
      fromNode: 'validator-1',
      toNode: 'transformer-1',
      pv: { edgeType: 'data_flow' },
    },
    {
      id: 'edge-3',
      fromNode: 'transformer-1',
      toNode: 'warehouse-1',
      pv: { edgeType: 'data_flow' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Data Pipeline',
    description: 'ETL data processing pipeline',
    edgeTypes: {
      data_flow: {
        style: 'solid',
        color: '#0984E3',
        width: 3,
        directed: true,
        animation: {
          type: 'flow',
          duration: 2000,
        },
      },
      validation_flow: {
        style: 'solid',
        color: '#00B894',
        width: 2,
        directed: true,
      },
    },
  },
};

// Available configurations
const configurations = [
  { name: 'Simple Service', canvas: simpleServiceCanvas },
  { name: 'Microservices', canvas: microservicesCanvas },
  { name: 'Data Pipeline', canvas: dataPipelineCanvas },
];

// Multi-config switcher component
function MultiConfigDemo() {
  const [selectedConfigName, setSelectedConfigName] = useState(configurations[0].name);

  const selectedConfig = configurations.find((c) => c.name === selectedConfigName);

  if (!selectedConfig) {
    return <div>No configuration selected</div>;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header with configuration selector */}
      <div
        style={{
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderBottom: '1px solid #ddd',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontWeight: 'bold' }}>Configuration:</label>
          <select
            value={selectedConfigName}
            onChange={(e) => setSelectedConfigName(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '14px',
              minWidth: '200px',
            }}
          >
            {configurations.map((config) => (
              <option key={config.name} value={config.name}>
                {config.name}
              </option>
            ))}
          </select>
          <span style={{ color: '#666', fontSize: '12px' }}>
            {selectedConfig.canvas.pv?.description}
          </span>
        </div>
      </div>

      {/* Graph visualization */}
      <div style={{ flex: 1 }}>
        <GraphRenderer canvas={selectedConfig.canvas} showControls showBackground />
      </div>
    </div>
  );
}

// Story: Basic multi-config switcher
export const ConfigurationSwitcher: Story = {
  render: () => <MultiConfigDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates switching between multiple graph configurations. Each configuration has different node types, edge types, and visual styles. Use the dropdown to switch between configurations.',
      },
    },
  },
};

// Side-by-side comparison component
function SideBySideDemo() {
  const [leftConfigName, setLeftConfigName] = useState(configurations[0].name);
  const [rightConfigName, setRightConfigName] = useState(configurations[1].name);

  const leftConfig = configurations.find((c) => c.name === leftConfigName);
  const rightConfig = configurations.find((c) => c.name === rightConfigName);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          gap: '16px',
        }}
      >
        <div style={{ flex: 1 }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
            Left Configuration
          </label>
          <select
            value={leftConfigName}
            onChange={(e) => setLeftConfigName(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '14px',
              width: '100%',
            }}
          >
            {configurations.map((config) => (
              <option key={config.name} value={config.name}>
                {config.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
            Right Configuration
          </label>
          <select
            value={rightConfigName}
            onChange={(e) => setRightConfigName(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '14px',
              width: '100%',
            }}
          >
            {configurations.map((config) => (
              <option key={config.name} value={config.name}>
                {config.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Side by side graphs */}
      <div style={{ flex: 1, display: 'flex' }}>
        {leftConfig && (
          <div style={{ flex: 1, borderRight: '1px solid #ddd' }}>
            <GraphRenderer
              canvas={leftConfig.canvas}
              configName={leftConfigName}
              showMinimap={false}
              showControls
              showBackground
            />
          </div>
        )}
        {rightConfig && (
          <div style={{ flex: 1 }}>
            <GraphRenderer
              canvas={rightConfig.canvas}
              configName={rightConfigName}
              showMinimap={false}
              showControls
              showBackground
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Story: Side-by-side comparison
export const SideBySideComparison: Story = {
  render: () => <SideBySideDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Compare two different graph configurations side-by-side. Useful for understanding architectural differences or analyzing multiple aspects of your system simultaneously.',
      },
    },
  },
};
