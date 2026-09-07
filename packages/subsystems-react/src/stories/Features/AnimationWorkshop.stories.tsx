import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlow, ReactFlowProvider, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CustomNode } from '../../nodes/CustomNode';
import { CustomEdge } from '../../edges/CustomEdge';
import type { CustomNodeData } from '../../nodes/CustomNode';
import type { CustomEdgeData } from '../../edges/CustomEdge';
import type { NodeTypeDefinition, EdgeTypeDefinition } from '@principal-ai/subsystems-core';
import React from 'react';

const meta = {
  title: 'Features/AnimationWorkshop',
  component: ReactFlow,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ReactFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

// Define custom node and edge types
const nodeTypes = {
  custom: CustomNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

// Sample type definitions
const processNodeType: NodeTypeDefinition = {
  shape: 'rectangle',
  color: '#4A90E2',
  icon: 'Settings',
  dataSchema: {
    name: { type: 'string', required: true, displayInLabel: true },
  },
};

const dataNodeType: NodeTypeDefinition = {
  shape: 'circle',
  color: '#7B68EE',
  icon: 'Database',
  dataSchema: {
    name: { type: 'string', required: true, displayInLabel: true },
  },
};

const edgeTypeDefinition: EdgeTypeDefinition = {
  style: 'solid',
  color: '#50E3C2',
  directed: true,
  width: 2,
  animation: {
    type: 'flow',
    color: '#00D9FF',
  },
};

/**
 * Story 1: Edge Flow Animations
 * Demonstrates forward, backward, and bidirectional flow animations
 */
export const EdgeFlowAnimations: Story = {
  render: () => (
    <ReactFlowProvider>
      <div style={{ width: '100vw', height: '100vh' }}>
        <ReactFlow
          nodes={[
            {
              id: 'node-1',
              type: 'custom',
              position: { x: 100, y: 100 },
              data: {
                label: 'Source',
                typeDefinition: processNodeType,
                data: { name: 'Source' },
              } as CustomNodeData,
            },
            {
              id: 'node-2',
              type: 'custom',
              position: { x: 400, y: 100 },
              data: {
                label: 'Target',
                typeDefinition: dataNodeType,
                data: { name: 'Target' },
              } as CustomNodeData,
            },
            {
              id: 'node-3',
              type: 'custom',
              position: { x: 100, y: 250 },
              data: {
                label: 'Backward',
                typeDefinition: processNodeType,
                data: { name: 'Backward' },
              } as CustomNodeData,
            },
            {
              id: 'node-4',
              type: 'custom',
              position: { x: 400, y: 250 },
              data: {
                label: 'Backward Target',
                typeDefinition: dataNodeType,
                data: { name: 'Backward Target' },
              } as CustomNodeData,
            },
            {
              id: 'node-5',
              type: 'custom',
              position: { x: 100, y: 400 },
              data: {
                label: 'Bidirectional A',
                typeDefinition: processNodeType,
                data: { name: 'Bidirectional A' },
              } as CustomNodeData,
            },
            {
              id: 'node-6',
              type: 'custom',
              position: { x: 400, y: 400 },
              data: {
                label: 'Bidirectional B',
                typeDefinition: dataNodeType,
                data: { name: 'Bidirectional B' },
              } as CustomNodeData,
            },
          ]}
          edges={[
            {
              id: 'edge-1',
              source: 'node-1',
              target: 'node-2',
              type: 'custom',
              label: 'Forward Flow',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'flow',
                animationDirection: 'forward',
                animationDuration: 1000,
              } as CustomEdgeData,
            },
            {
              id: 'edge-2',
              source: 'node-3',
              target: 'node-4',
              type: 'custom',
              label: 'Backward Flow',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'flow',
                animationDirection: 'backward',
                animationDuration: 1000,
              } as CustomEdgeData,
            },
            {
              id: 'edge-3',
              source: 'node-5',
              target: 'node-6',
              type: 'custom',
              label: 'Bidirectional Flow',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'flow',
                animationDirection: 'bidirectional',
                animationDuration: 2000,
              } as CustomEdgeData,
            },
          ]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  ),
};

/**
 * Story 2: Edge Particle Animation
 * Shows particle traveling along edges with different speeds
 */
export const EdgeParticleAnimation: Story = {
  render: () => (
    <ReactFlowProvider>
      <div style={{ width: '100vw', height: '100vh' }}>
        <ReactFlow
          nodes={[
            {
              id: 'node-1',
              type: 'custom',
              position: { x: 100, y: 150 },
              data: {
                label: 'Fast',
                typeDefinition: processNodeType,
                data: { name: 'Fast' },
              } as CustomNodeData,
            },
            {
              id: 'node-2',
              type: 'custom',
              position: { x: 400, y: 150 },
              data: {
                label: 'Fast Target',
                typeDefinition: dataNodeType,
                data: { name: 'Fast Target' },
              } as CustomNodeData,
            },
            {
              id: 'node-3',
              type: 'custom',
              position: { x: 100, y: 300 },
              data: {
                label: 'Slow',
                typeDefinition: processNodeType,
                data: { name: 'Slow' },
              } as CustomNodeData,
            },
            {
              id: 'node-4',
              type: 'custom',
              position: { x: 400, y: 300 },
              data: {
                label: 'Slow Target',
                typeDefinition: dataNodeType,
                data: { name: 'Slow Target' },
              } as CustomNodeData,
            },
          ]}
          edges={[
            {
              id: 'edge-1',
              source: 'node-1',
              target: 'node-2',
              type: 'custom',
              label: 'Fast Particle (500ms)',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'particle',
                animationDuration: 500,
                animationDirection: 'forward',
              } as CustomEdgeData,
            },
            {
              id: 'edge-2',
              source: 'node-3',
              target: 'node-4',
              type: 'custom',
              label: 'Slow Particle (2000ms)',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'particle',
                animationDuration: 2000,
                animationDirection: 'forward',
              } as CustomEdgeData,
            },
          ]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  ),
};

/**
 * Story 3: Edge Pulse and Glow
 * Demonstrates pulse and glow effects on edges
 */
export const EdgePulseAndGlow: Story = {
  render: () => (
    <ReactFlowProvider>
      <div style={{ width: '100vw', height: '100vh' }}>
        <ReactFlow
          nodes={[
            {
              id: 'node-1',
              type: 'custom',
              position: { x: 100, y: 150 },
              data: {
                label: 'Pulse Source',
                typeDefinition: processNodeType,
                data: { name: 'Pulse Source' },
              } as CustomNodeData,
            },
            {
              id: 'node-2',
              type: 'custom',
              position: { x: 400, y: 150 },
              data: {
                label: 'Pulse Target',
                typeDefinition: dataNodeType,
                data: { name: 'Pulse Target' },
              } as CustomNodeData,
            },
            {
              id: 'node-3',
              type: 'custom',
              position: { x: 100, y: 300 },
              data: {
                label: 'Glow Source',
                typeDefinition: processNodeType,
                data: { name: 'Glow Source' },
              } as CustomNodeData,
            },
            {
              id: 'node-4',
              type: 'custom',
              position: { x: 400, y: 300 },
              data: {
                label: 'Glow Target',
                typeDefinition: dataNodeType,
                data: { name: 'Glow Target' },
              } as CustomNodeData,
            },
          ]}
          edges={[
            {
              id: 'edge-1',
              source: 'node-1',
              target: 'node-2',
              type: 'custom',
              label: 'Pulse Animation',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'pulse',
                animationDuration: 1500,
              } as CustomEdgeData,
            },
            {
              id: 'edge-2',
              source: 'node-3',
              target: 'node-4',
              type: 'custom',
              label: 'Glow Animation',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'glow',
                animationDuration: 1000,
              } as CustomEdgeData,
            },
          ]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  ),
};

/**
 * Story 4: Node Animations
 * Shows processing pulse, success flash, error shake, and entry animations
 */
export const NodeAnimations: Story = {
  render: () => (
    <ReactFlowProvider>
      <div style={{ width: '100vw', height: '100vh' }}>
        <ReactFlow
          nodes={[
            {
              id: 'node-1',
              type: 'custom',
              position: { x: 100, y: 100 },
              data: {
                label: 'Processing',
                typeDefinition: processNodeType,
                data: { name: 'Processing' },
                animationType: 'pulse',
                animationDuration: 1500,
              } as CustomNodeData,
            },
            {
              id: 'node-2',
              type: 'custom',
              position: { x: 300, y: 100 },
              data: {
                label: 'Success',
                typeDefinition: dataNodeType,
                data: { name: 'Success' },
                animationType: 'flash',
                animationDuration: 1000,
              } as CustomNodeData,
            },
            {
              id: 'node-3',
              type: 'custom',
              position: { x: 100, y: 250 },
              data: {
                label: 'Error',
                typeDefinition: processNodeType,
                data: { name: 'Error' },
                animationType: 'shake',
                animationDuration: 500,
                hasViolations: true,
              } as CustomNodeData,
            },
            {
              id: 'node-4',
              type: 'custom',
              position: { x: 300, y: 250 },
              data: {
                label: 'Entry',
                typeDefinition: dataNodeType,
                data: { name: 'Entry' },
                animationType: 'entry',
                animationDuration: 600,
              } as CustomNodeData,
            },
          ]}
          edges={[]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  ),
};

/**
 * Story 5: Combined Pipeline Animation
 * Shows a realistic data pipeline with coordinated animations
 */
export const CombinedPipelineAnimation: Story = {
  render: () => (
    <ReactFlowProvider>
      <div style={{ width: '100vw', height: '100vh' }}>
        <ReactFlow
          nodes={[
            {
              id: 'input',
              type: 'custom',
              position: { x: 50, y: 200 },
              data: {
                label: 'Input',
                typeDefinition: { ...processNodeType, color: '#10B981' },
                data: { name: 'Data Input' },
                animationType: 'pulse',
                animationDuration: 2000,
              } as CustomNodeData,
            },
            {
              id: 'validate',
              type: 'custom',
              position: { x: 250, y: 200 },
              data: {
                label: 'Validate',
                typeDefinition: processNodeType,
                data: { name: 'Validator' },
              } as CustomNodeData,
            },
            {
              id: 'transform',
              type: 'custom',
              position: { x: 450, y: 200 },
              data: {
                label: 'Transform',
                typeDefinition: processNodeType,
                data: { name: 'Transformer' },
              } as CustomNodeData,
            },
            {
              id: 'output',
              type: 'custom',
              position: { x: 650, y: 200 },
              data: {
                label: 'Output',
                typeDefinition: { ...dataNodeType, color: '#10B981' },
                data: { name: 'Data Output' },
                animationType: 'flash',
                animationDuration: 1500,
              } as CustomNodeData,
            },
            {
              id: 'error',
              type: 'custom',
              position: { x: 250, y: 350 },
              data: {
                label: 'Error Handler',
                typeDefinition: { ...processNodeType, color: '#EF4444' },
                data: { name: 'Error Handler' },
                animationType: 'shake',
                animationDuration: 400,
                hasViolations: true,
              } as CustomNodeData,
            },
          ]}
          edges={[
            {
              id: 'edge-1',
              source: 'input',
              target: 'validate',
              type: 'custom',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'particle',
                animationDuration: 1000,
                animationDirection: 'forward',
              } as CustomEdgeData,
            },
            {
              id: 'edge-2',
              source: 'validate',
              target: 'transform',
              type: 'custom',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'flow',
                animationDuration: 800,
                animationDirection: 'forward',
              } as CustomEdgeData,
            },
            {
              id: 'edge-3',
              source: 'transform',
              target: 'output',
              type: 'custom',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'particle',
                animationDuration: 1000,
                animationDirection: 'forward',
              } as CustomEdgeData,
            },
            {
              id: 'edge-error',
              source: 'validate',
              target: 'error',
              type: 'custom',
              data: {
                typeDefinition: { ...edgeTypeDefinition, color: '#EF4444' },
                animationType: 'glow',
                animationDuration: 1000,
              } as CustomEdgeData,
            },
          ]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  ),
};

/**
 * Story 6: All Animations Showcase
 * Grid layout showing all animation types simultaneously
 */
export const AllAnimationsShowcase: Story = {
  render: () => (
    <ReactFlowProvider>
      <div style={{ width: '100vw', height: '100vh' }}>
        <ReactFlow
          nodes={[
            // Row 1: Edge animations
            {
              id: 'flow-1',
              type: 'custom',
              position: { x: 50, y: 50 },
              data: {
                label: 'Flow',
                typeDefinition: processNodeType,
                data: { name: 'Flow Start' },
              } as CustomNodeData,
            },
            {
              id: 'flow-2',
              type: 'custom',
              position: { x: 200, y: 50 },
              data: {
                label: 'Flow',
                typeDefinition: dataNodeType,
                data: { name: 'Flow End' },
              } as CustomNodeData,
            },

            {
              id: 'particle-1',
              type: 'custom',
              position: { x: 280, y: 50 },
              data: {
                label: 'Particle',
                typeDefinition: processNodeType,
                data: { name: 'Particle Start' },
              } as CustomNodeData,
            },
            {
              id: 'particle-2',
              type: 'custom',
              position: { x: 430, y: 50 },
              data: {
                label: 'Particle',
                typeDefinition: dataNodeType,
                data: { name: 'Particle End' },
              } as CustomNodeData,
            },

            {
              id: 'pulse-1',
              type: 'custom',
              position: { x: 510, y: 50 },
              data: {
                label: 'Pulse',
                typeDefinition: processNodeType,
                data: { name: 'Pulse Start' },
              } as CustomNodeData,
            },
            {
              id: 'pulse-2',
              type: 'custom',
              position: { x: 660, y: 50 },
              data: {
                label: 'Pulse',
                typeDefinition: dataNodeType,
                data: { name: 'Pulse End' },
              } as CustomNodeData,
            },

            // Row 2: Node animations
            {
              id: 'node-pulse',
              type: 'custom',
              position: { x: 100, y: 180 },
              data: {
                label: 'Processing Pulse',
                typeDefinition: processNodeType,
                data: { name: 'Processing' },
                animationType: 'pulse',
                animationDuration: 1500,
              } as CustomNodeData,
            },
            {
              id: 'node-flash',
              type: 'custom',
              position: { x: 300, y: 180 },
              data: {
                label: 'Success Flash',
                typeDefinition: dataNodeType,
                data: { name: 'Success' },
                animationType: 'flash',
                animationDuration: 1000,
              } as CustomNodeData,
            },
            {
              id: 'node-shake',
              type: 'custom',
              position: { x: 500, y: 180 },
              data: {
                label: 'Error Shake',
                typeDefinition: processNodeType,
                data: { name: 'Error' },
                animationType: 'shake',
                animationDuration: 500,
                hasViolations: true,
              } as CustomNodeData,
            },
          ]}
          edges={[
            {
              id: 'e-flow',
              source: 'flow-1',
              target: 'flow-2',
              type: 'custom',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'flow',
                animationDirection: 'forward',
                animationDuration: 1000,
              } as CustomEdgeData,
            },
            {
              id: 'e-particle',
              source: 'particle-1',
              target: 'particle-2',
              type: 'custom',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'particle',
                animationDuration: 1200,
              } as CustomEdgeData,
            },
            {
              id: 'e-pulse',
              source: 'pulse-1',
              target: 'pulse-2',
              type: 'custom',
              data: {
                typeDefinition: edgeTypeDefinition,
                animationType: 'pulse',
                animationDuration: 1500,
              } as CustomEdgeData,
            },
          ]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  ),
};
