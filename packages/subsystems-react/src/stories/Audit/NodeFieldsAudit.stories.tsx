import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Audit/NodeFieldsAudit',
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
 * Canvas showing all visual variations of node fields
 */
const fieldVariationsCanvas: ExtendedCanvas = {
  nodes: [
    // Row 1: Shape variations
    {
      id: 'shape-rect',
      type: 'text',
      x: 80,
      y: 80,
      width: 120,
      height: 80,
      text: '# Rectangle\n\nDefault shape',
      color: '#6366f1',
      pv: {
        nodeType: 'shape-rect',
        shape: 'rectangle',
        icon: 'Square',
        fill: '#6366f1',
        dataSchema: { name: { type: 'string', displayInLabel: true } },
      },
    },
    {
      id: 'shape-circle',
      type: 'text',
      x: 260,
      y: 80,
      width: 100,
      height: 100,
      text: '# Circle\n\nRound shape',
      color: '#8b5cf6',
      pv: {
        nodeType: 'shape-circle',
        shape: 'circle',
        icon: 'Circle',
        fill: '#8b5cf6',
        dataSchema: { name: { type: 'string', displayInLabel: true } },
      },
    },
    {
      id: 'shape-hexagon',
      type: 'text',
      x: 420,
      y: 80,
      width: 120,
      height: 120,
      text: '# Hexagon\n\n6-sided polygon',
      color: '#06b6d4',
      pv: {
        nodeType: 'shape-hexagon',
        shape: 'hexagon',
        icon: 'Hexagon',
        fill: '#06b6d4',
        dataSchema: { name: { type: 'string', displayInLabel: true } },
      },
    },
    {
      id: 'shape-diamond',
      type: 'text',
      x: 600,
      y: 80,
      width: 90,
      height: 90,
      text: '# Diamond\n\nRotated square',
      color: '#f59e0b',
      pv: {
        nodeType: 'shape-diamond',
        shape: 'diamond',
        icon: 'Diamond',
        fill: '#f59e0b',
        dataSchema: { name: { type: 'string', displayInLabel: true } },
      },
    },

    // Row 2: State variations (same node type, different states)
    {
      id: 'state-idle',
      type: 'text',
      x: 80,
      y: 260,
      width: 120,
      height: 80,
      text: 'Idle State',
      color: '#94a3b8',
      pv: {
        nodeType: 'stateful-idle',
        shape: 'rectangle',
        icon: 'Pause',
        fill: '#94a3b8',
        dataSchema: { name: { type: 'string', displayInLabel: true } },
        states: {
          idle: { color: '#94a3b8', icon: 'Pause', label: 'Idle' },
        },
      },
    },
    {
      id: 'state-active',
      type: 'text',
      x: 260,
      y: 260,
      width: 120,
      height: 80,
      text: 'Active State',
      color: '#22c55e',
      pv: {
        nodeType: 'stateful-active',
        shape: 'rectangle',
        icon: 'Play',
        fill: '#22c55e',
        dataSchema: { name: { type: 'string', displayInLabel: true } },
        states: {
          active: { color: '#22c55e', icon: 'Play', label: 'Active' },
        },
      },
    },
    {
      id: 'state-warning',
      type: 'text',
      x: 440,
      y: 260,
      width: 120,
      height: 80,
      text: 'Warning State',
      color: '#f59e0b',
      pv: {
        nodeType: 'stateful-warning',
        shape: 'rectangle',
        icon: 'AlertTriangle',
        fill: '#f59e0b',
        dataSchema: { name: { type: 'string', displayInLabel: true } },
        states: {
          warning: { color: '#f59e0b', icon: 'AlertTriangle', label: 'Warning' },
        },
      },
    },
    {
      id: 'state-error',
      type: 'text',
      x: 620,
      y: 260,
      width: 120,
      height: 80,
      text: 'Error State',
      color: '#ef4444',
      pv: {
        nodeType: 'stateful-error',
        shape: 'rectangle',
        icon: 'XCircle',
        fill: '#ef4444',
        dataSchema: { name: { type: 'string', displayInLabel: true } },
        states: {
          error: { color: '#ef4444', icon: 'XCircle', label: 'Error' },
        },
      },
    },

    // Row 3: With and without icon/state
    {
      id: 'with-icon-state',
      type: 'text',
      x: 80,
      y: 420,
      width: 140,
      height: 100,
      text: 'With Icon & State',
      color: '#3b82f6',
      pv: {
        nodeType: 'full-featured',
        shape: 'rectangle',
        icon: 'Server',
        fill: '#3b82f6',
        dataSchema: { name: { type: 'string', displayInLabel: true } },
        states: {
          online: { color: '#22c55e', icon: 'CheckCircle', label: 'Online' },
        },
      },
    },
    {
      id: 'with-icon-no-state',
      type: 'text',
      x: 280,
      y: 420,
      width: 140,
      height: 100,
      text: 'Icon, No State',
      color: '#8b5cf6',
      pv: {
        nodeType: 'icon-only',
        shape: 'rectangle',
        icon: 'Database',
        fill: '#8b5cf6',
        dataSchema: { name: { type: 'string', displayInLabel: true } },
      },
    },
    {
      id: 'no-icon-with-state',
      type: 'text',
      x: 480,
      y: 420,
      width: 140,
      height: 100,
      text: 'State, No Icon',
      color: '#06b6d4',
      pv: {
        nodeType: 'state-only',
        shape: 'rectangle',
        fill: '#06b6d4',
        dataSchema: { name: { type: 'string', displayInLabel: true } },
        states: {
          pending: { color: '#f59e0b', label: 'Pending' },
        },
      },
    },
    {
      id: 'minimal',
      type: 'text',
      x: 680,
      y: 420,
      width: 140,
      height: 100,
      text: 'Minimal (Label Only)',
      color: '#64748b',
      pv: {
        nodeType: 'minimal',
        shape: 'rectangle',
        fill: '#64748b',
        dataSchema: { name: { type: 'string', displayInLabel: true } },
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Field Variations',
    description: 'All combinations of node fields',
    edgeTypes: {},
  },
};

/**
 * Interactive field reference with documentation
 */
const FieldReferenceTemplate = () => {
  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h2 style={{ marginBottom: 20 }}>Node Card Field Reference</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>
        {/* Left: Visual Reference */}
        <div>
          <h3 style={{ marginBottom: 16, color: '#374151' }}>Visual Structure</h3>
          <div
            style={{
              border: '3px solid #6366f1',
              borderRadius: 8,
              padding: 16,
              backgroundColor: 'white',
              width: 180,
              textAlign: 'center',
              position: 'relative',
            }}
          >
            {/* Stroke/Border annotation */}
            <div
              style={{
                position: 'absolute',
                top: -30,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 10,
                color: '#6366f1',
                fontWeight: 'bold',
              }}
            >
              stroke/border color
            </div>

            {/* Icon */}
            <div
              style={{
                marginBottom: 8,
                padding: 4,
                border: '2px dashed #f97316',
                borderRadius: 4,
              }}
            >
              <div style={{ fontSize: 10, color: '#f97316', marginBottom: 4 }}>ICON</div>
              <span style={{ fontSize: 24 }}>S</span>
            </div>

            {/* Label */}
            <div
              style={{
                marginBottom: 8,
                padding: 4,
                border: '2px dashed #22c55e',
                borderRadius: 4,
              }}
            >
              <div style={{ fontSize: 10, color: '#22c55e', marginBottom: 4 }}>
                LABEL (displayInLabel)
              </div>
              <div style={{ fontWeight: 500 }}>Node Name</div>
            </div>

            {/* State Badge */}
            <div
              style={{
                padding: 4,
                border: '2px dashed #3b82f6',
                borderRadius: 4,
              }}
            >
              <div style={{ fontSize: 10, color: '#3b82f6', marginBottom: 4 }}>STATE BADGE</div>
              <span
                style={{
                  backgroundColor: '#22c55e',
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                }}
              >
                Active
              </span>
            </div>

            {/* Shape annotation */}
            <div
              style={{
                position: 'absolute',
                bottom: -30,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 10,
                color: '#6366f1',
                fontWeight: 'bold',
              }}
            >
              shape: rectangle
            </div>
          </div>
        </div>

        {/* Right: Field Documentation */}
        <div>
          <h3 style={{ marginBottom: 16, color: '#374151' }}>Field Descriptions</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  Field
                </th>
                <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  Source
                </th>
                <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#f97316',
                  }}
                >
                  icon
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  <code>vv.icon</code> or <code>states[state].icon</code>
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  Lucide icon name displayed at top
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#22c55e',
                  }}
                >
                  label
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  <code>dataSchema[field].displayInLabel</code>
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  Main text from data field with displayInLabel=true
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#3b82f6',
                  }}
                >
                  state
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  <code>states[currentState]</code>
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  Badge showing current state with color and label
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#6366f1',
                  }}
                >
                  color
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  <code>vv.color</code> or <code>states[state].color</code>
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  Primary node color (state overrides base)
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#6366f1',
                  }}
                >
                  stroke
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  <code>vv.stroke</code>
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  Border color (defaults to color if not set)
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#6366f1',
                  }}
                >
                  shape
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  <code>vv.shape</code>
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  rectangle | circle | hexagon | diamond | custom
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#6366f1',
                  }}
                >
                  size
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  <code>vv.size</code>
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  {'{width, height}'} for node dimensions
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8, fontWeight: 'bold', color: '#ef4444' }}>hasViolations</td>
                <td style={{ padding: 8 }}>
                  <code>computed</code>
                </td>
                <td style={{ padding: 8 }}>Shows warning indicator when true</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <h3 style={{ marginTop: 30, marginBottom: 16, color: '#374151' }}>Live Examples</h3>
      <GraphRenderer canvas={fieldVariationsCanvas} width={850} height={600} />
    </div>
  );
};

export const FieldReference: Story = {
  render: () => <FieldReferenceTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Node Card Field Reference**

This story provides a comprehensive visual guide to all fields displayed on node cards:

**Visual Fields:**
- **icon** - Lucide icon displayed above the label
- **label** - Main text from dataSchema field with \`displayInLabel: true\`
- **state** - Badge showing current state with color and label
- **color** - Primary node color (can be overridden by state)
- **stroke** - Border color (defaults to color)
- **shape** - rectangle, circle, hexagon, diamond, or custom
- **size** - Node dimensions {width, height}
- **hasViolations** - Warning indicator for validation errors
        `,
      },
    },
  },
};

export const AllShapes: Story = {
  args: {
    canvas: fieldVariationsCanvas,
    width: 850,
    height: 600,
  },
  parameters: {
    docs: {
      description: {
        story: `
Shows all node shape variations with different field combinations:
- **Row 1**: Shape types (rectangle, circle, hexagon, diamond)
- **Row 2**: State variations (idle, active, warning, error)
- **Row 3**: Feature combinations (with/without icon and state)
        `,
      },
    },
  },
};

/**
 * Interactive popup panel reference
 */
const PopupReferenceTemplate = () => {
  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h2 style={{ marginBottom: 20 }}>Node Info Panel (Popup) Field Reference</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 30 }}>
        {/* Left: Mock Panel */}
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: 16,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: '2px solid #6366f1',
            }}
          >
            <div style={{ fontWeight: 'bold', fontSize: 14 }}>Node Information</div>
            <span style={{ color: '#666', fontSize: 18, cursor: 'pointer' }}>x</span>
          </div>

          {/* Icon Field */}
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                right: -80,
                top: 0,
                fontSize: 10,
                color: '#f97316',
                fontWeight: 'bold',
              }}
            >
              1. ICON
            </div>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>Icon</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                backgroundColor: '#f5f5f5',
                border: '1px dashed #ccc',
                borderRadius: 4,
              }}
            >
              <span>S</span>
              <span style={{ fontSize: 12 }}>Server</span>
              <span style={{ marginLeft: 'auto', color: '#999', fontSize: 10 }}>edit</span>
            </div>
          </div>

          {/* Type Field */}
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                right: -80,
                top: 0,
                fontSize: 10,
                color: '#22c55e',
                fontWeight: 'bold',
              }}
            >
              2. TYPE
            </div>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>Type</div>
            <div
              style={{
                fontSize: 12,
                padding: '4px 8px',
                backgroundColor: '#6366f1',
                color: 'white',
                borderRadius: 4,
                display: 'inline-block',
              }}
            >
              server (rectangle)
            </div>
          </div>

          {/* State Field */}
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                right: -80,
                top: 0,
                fontSize: 10,
                color: '#3b82f6',
                fontWeight: 'bold',
              }}
            >
              3. STATE
            </div>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>State</div>
            <div
              style={{
                fontSize: 12,
                padding: '4px 8px',
                backgroundColor: '#22c55e',
                color: 'white',
                borderRadius: 4,
                display: 'inline-block',
              }}
            >
              Online
            </div>
          </div>

          {/* Name Field */}
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                right: -80,
                top: 0,
                fontSize: 10,
                color: '#8b5cf6',
                fontWeight: 'bold',
              }}
            >
              4. NAME
            </div>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>Name</div>
            <div
              style={{
                fontSize: 12,
                padding: '4px 8px',
                backgroundColor: '#f5f5f5',
                borderRadius: 4,
                border: '1px dashed #ccc',
              }}
            >
              API Gateway
              <span style={{ marginLeft: 8, color: '#999', fontSize: 10 }}>edit</span>
            </div>
          </div>

          {/* Properties */}
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                right: -100,
                top: 0,
                fontSize: 10,
                color: '#06b6d4',
                fontWeight: 'bold',
              }}
            >
              5. PROPERTIES
            </div>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 8, fontWeight: 'bold' }}>
              Properties
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>description</div>
              <div style={{ fontSize: 12, color: '#333' }}>Main entry point for API</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>port</div>
              <div style={{ fontSize: 12, color: '#333' }}>8080</div>
            </div>
          </div>

          {/* ID */}
          <div
            style={{
              fontSize: 10,
              color: '#999',
              marginTop: 12,
              paddingTop: 8,
              borderTop: '1px solid #eee',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                right: -60,
                top: 8,
                fontSize: 10,
                color: '#64748b',
                fontWeight: 'bold',
              }}
            >
              6. ID
            </div>
            ID: api-gateway-1
          </div>

          {/* Delete Button */}
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                right: -80,
                top: 12,
                fontSize: 10,
                color: '#ef4444',
                fontWeight: 'bold',
              }}
            >
              7. DELETE
            </div>
            <button
              style={{
                marginTop: 12,
                width: '100%',
                padding: '8px 12px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 'bold',
              }}
            >
              Delete Node
            </button>
          </div>
        </div>

        {/* Right: Field Documentation */}
        <div>
          <h3 style={{ marginBottom: 16, color: '#374151' }}>Panel Fields</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  #
                </th>
                <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  Field
                </th>
                <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  Editable?
                </th>
                <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>1</td>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#f97316',
                  }}
                >
                  Icon
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Yes (picker)</td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  Icon selector with 48 common Lucide icons
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>2</td>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#22c55e',
                  }}
                >
                  Type
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Yes (dropdown)</td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  Node type selector from availableNodeTypes
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>3</td>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#3b82f6',
                  }}
                >
                  State
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>No</td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  Current state badge (from node.state)
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>4</td>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#8b5cf6',
                  }}
                >
                  Name
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Yes (inline)</td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  Field with displayInLabel from dataSchema
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>5</td>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#06b6d4',
                  }}
                >
                  Properties
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>No</td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  Other dataSchema fields or all node.data
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>6</td>
                <td
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 'bold',
                    color: '#64748b',
                  }}
                >
                  ID
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>No</td>
                <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  Read-only node identifier
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8 }}>7</td>
                <td style={{ padding: 8, fontWeight: 'bold', color: '#ef4444' }}>Delete</td>
                <td style={{ padding: 8 }}>Action</td>
                <td style={{ padding: 8 }}>Shown only when onDelete prop provided</td>
              </tr>
            </tbody>
          </table>

          <h4 style={{ marginTop: 24, marginBottom: 12, color: '#374151' }}>Edit Mode Notes</h4>
          <ul style={{ fontSize: 13, lineHeight: 1.8, margin: 0, paddingLeft: 20 }}>
            <li>
              <strong>Icon:</strong> Clicking opens a 6x8 grid picker of common icons
            </li>
            <li>
              <strong>Type:</strong> Dropdown only shown if availableNodeTypes has multiple types
            </li>
            <li>
              <strong>Name:</strong> Click to edit inline, press Enter to save, Escape to cancel
            </li>
            <li>
              <strong>Delete:</strong> Only shown if onDelete callback is provided
            </li>
          </ul>
        </div>
      </div>

      <h3 style={{ marginTop: 30, marginBottom: 16, color: '#374151' }}>
        Try It: Click a node to see the info panel
      </h3>
      <GraphRenderer canvas={fieldVariationsCanvas} width={850} height={600} editable={true} />
    </div>
  );
};

export const PopupReference: Story = {
  render: () => <PopupReferenceTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Node Info Panel (Popup) Reference**

When a node is clicked, the NodeInfoPanel displays:
1. **Icon** - Editable with icon picker (48 common Lucide icons)
2. **Type** - Node type with selector dropdown (if multiple types available)
3. **State** - Current state badge with color
4. **Name** - Editable name field (from dataSchema displayInLabel field)
5. **Properties** - Other schema fields or all node data
6. **ID** - Read-only node identifier
7. **Delete Button** - Only shown in edit mode

Click a node in the interactive example below to see the panel.
        `,
      },
    },
  },
};
