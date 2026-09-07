import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Audit/NodeShapes',
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
 * Canvas showing all available node shapes for visual auditing
 */
const allShapesCanvas: ExtendedCanvas = {
  nodes: [
    // Row 1: Basic shapes
    {
      id: 'rectangle',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 80,
      text: '# Rectangle\nDefault shape',
      color: 6, // purple
      pv: {
        nodeType: 'rectangle-demo',
        shape: 'rectangle',
        icon: 'Square',
      },
    },
    {
      id: 'circle',
      type: 'text',
      x: 300,
      y: 100,
      width: 100,
      height: 100,
      text: '# Circle',
      color: 5, // cyan
      pv: {
        nodeType: 'circle-demo',
        shape: 'circle',
        icon: 'Circle',
      },
    },
    {
      id: 'hexagon',
      type: 'text',
      x: 480,
      y: 100,
      width: 120,
      height: 120,
      text: '# Hexagon',
      color: 4, // green
      pv: {
        nodeType: 'hexagon-demo',
        shape: 'hexagon',
        icon: 'Hexagon',
        size: { width: 120, height: 120 },
      },
    },
    {
      id: 'diamond',
      type: 'text',
      x: 680,
      y: 100,
      width: 70,
      height: 70,
      text: 'Diamond',
      color: 2, // orange
      pv: {
        nodeType: 'diamond-demo',
        shape: 'diamond',
        icon: 'Diamond',
        size: { width: 70, height: 70 },
      },
    },
    {
      id: 'custom',
      type: 'text',
      x: 860,
      y: 100,
      width: 140,
      height: 80,
      text: '# Custom\n(Falls back to rect)',
      color: 1, // red
      pv: {
        nodeType: 'custom-demo',
        shape: 'custom',
        icon: 'Settings',
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Node Shapes Audit',
    description: 'All available node shapes for visual inspection',
    edgeTypes: {},
  },
};

export const AllShapes: Story = {
  args: {
    canvas: allShapesCanvas,
    width: 1100,
    height: 350,
  },
  parameters: {
    docs: {
      description: {
        story: `
**All Node Shapes**

This story displays all 5 available node shapes:
- **Rectangle** - Default shape with rounded corners (borderRadius: 8px)
- **Circle** - Circular nodes (borderRadius: 50%)
- **Hexagon** - Flat-top style using clip-path polygon
- **Diamond** - Diamond shape using clip-path polygon (works with any aspect ratio)
- **Custom** - Placeholder that falls back to rectangle styling
        `,
      },
    },
  },
};

/**
 * Canvas showing shapes with different sizes
 */
const shapeSizesCanvas: ExtendedCanvas = {
  nodes: [
    // Small shapes
    {
      id: 'rect-small',
      type: 'text',
      x: 100,
      y: 80,
      width: 80,
      height: 50,
      text: 'Small',
      color: 6,
      pv: {
        nodeType: 'rect-small',
        shape: 'rectangle',
        size: { width: 80, height: 50 },
      },
    },
    {
      id: 'circle-small',
      type: 'text',
      x: 250,
      y: 80,
      width: 60,
      height: 60,
      text: 'S',
      color: 5,
      pv: {
        nodeType: 'circle-small',
        shape: 'circle',
        size: { width: 60, height: 60 },
      },
    },
    {
      id: 'hex-small',
      type: 'text',
      x: 380,
      y: 80,
      width: 80,
      height: 60,
      text: 'Small',
      color: 4,
      pv: {
        nodeType: 'hex-small',
        shape: 'hexagon',
        size: { width: 80, height: 60 },
      },
    },
    {
      id: 'diamond-small',
      type: 'text',
      x: 520,
      y: 80,
      width: 60,
      height: 60,
      text: 'S',
      color: 2,
      pv: {
        nodeType: 'diamond-small',
        shape: 'diamond',
        size: { width: 60, height: 60 },
      },
    },

    // Medium shapes (default)
    {
      id: 'rect-medium',
      type: 'text',
      x: 100,
      y: 200,
      width: 120,
      height: 70,
      text: 'Medium',
      color: 6,
      pv: {
        nodeType: 'rect-medium',
        shape: 'rectangle',
      },
    },
    {
      id: 'circle-medium',
      type: 'text',
      x: 250,
      y: 200,
      width: 80,
      height: 80,
      text: 'M',
      color: 5,
      pv: {
        nodeType: 'circle-medium',
        shape: 'circle',
      },
    },
    {
      id: 'hex-medium',
      type: 'text',
      x: 380,
      y: 200,
      width: 100,
      height: 80,
      text: 'Medium',
      color: 4,
      pv: {
        nodeType: 'hex-medium',
        shape: 'hexagon',
      },
    },
    {
      id: 'diamond-medium',
      type: 'text',
      x: 520,
      y: 200,
      width: 80,
      height: 80,
      text: 'M',
      color: 2,
      pv: {
        nodeType: 'diamond-medium',
        shape: 'diamond',
      },
    },

    // Large shapes
    {
      id: 'rect-large',
      type: 'text',
      x: 100,
      y: 340,
      width: 180,
      height: 100,
      text: '# Large\nWith content',
      color: 6,
      pv: {
        nodeType: 'rect-large',
        shape: 'rectangle',
        size: { width: 180, height: 100 },
      },
    },
    {
      id: 'circle-large',
      type: 'text',
      x: 250,
      y: 340,
      width: 120,
      height: 120,
      text: 'Large',
      color: 5,
      pv: {
        nodeType: 'circle-large',
        shape: 'circle',
        size: { width: 120, height: 120 },
      },
    },
    {
      id: 'hex-large',
      type: 'text',
      x: 380,
      y: 340,
      width: 140,
      height: 110,
      text: 'Large',
      color: 4,
      pv: {
        nodeType: 'hex-large',
        shape: 'hexagon',
        size: { width: 140, height: 110 },
      },
    },
    {
      id: 'diamond-large',
      type: 'text',
      x: 520,
      y: 340,
      width: 110,
      height: 110,
      text: 'Large',
      color: 2,
      pv: {
        nodeType: 'diamond-large',
        shape: 'diamond',
        size: { width: 110, height: 110 },
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Node Sizes Audit',
    description: 'Node shapes at different sizes',
    edgeTypes: {},
  },
};

export const ShapeSizes: Story = {
  args: {
    canvas: shapeSizesCanvas,
    width: 700,
    height: 550,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Shape Sizes**

Shows each shape at small, medium, and large sizes to verify scaling behavior.
        `,
      },
    },
  },
};

/**
 * Canvas showing shapes with icons
 */
const shapesWithIconsCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'rect-icon',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 80,
      text: 'Server',
      color: 6,
      pv: {
        nodeType: 'server',
        shape: 'rectangle',
        icon: 'Server',
      },
    },
    {
      id: 'circle-icon',
      type: 'text',
      x: 300,
      y: 100,
      width: 100,
      height: 100,
      text: 'User',
      color: 5,
      pv: {
        nodeType: 'user',
        shape: 'circle',
        icon: 'User',
      },
    },
    {
      id: 'hex-icon',
      type: 'text',
      x: 480,
      y: 100,
      width: 140,
      height: 100,
      text: 'Database',
      color: 4,
      pv: {
        nodeType: 'database',
        shape: 'hexagon',
        icon: 'Database',
      },
    },
    {
      id: 'diamond-icon',
      type: 'text',
      x: 680,
      y: 100,
      width: 100,
      height: 100,
      text: 'Cache',
      color: 2,
      pv: {
        nodeType: 'cache',
        shape: 'diamond',
        icon: 'Zap',
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Shapes with Icons',
    description: 'Node shapes with Lucide icons',
    edgeTypes: {},
  },
};

export const ShapesWithIcons: Story = {
  args: {
    canvas: shapesWithIconsCanvas,
    width: 900,
    height: 300,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Shapes with Icons**

Shows each shape with a Lucide icon to verify icon placement and sizing within different shapes.
        `,
      },
    },
  },
};

/**
 * Canvas showing shapes with states
 */
const shapesWithStatesCanvas: ExtendedCanvas = {
  nodes: [
    // Idle state
    {
      id: 'rect-idle',
      type: 'text',
      x: 100,
      y: 80,
      width: 120,
      height: 70,
      text: 'Idle',
      color: 6,
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Box',
        states: {
          idle: { color: '#94a3b8', icon: 'Box' },
          active: { color: '#3b82f6', icon: 'Play' },
          error: { color: '#ef4444', icon: 'AlertCircle' },
        },
      },
    },
    {
      id: 'circle-idle',
      type: 'text',
      x: 280,
      y: 80,
      width: 90,
      height: 90,
      text: 'Idle',
      color: 5,
      pv: {
        nodeType: 'agent',
        shape: 'circle',
        icon: 'User',
        states: {
          idle: { color: '#94a3b8', icon: 'User' },
          active: { color: '#22c55e', icon: 'UserCheck' },
          error: { color: '#ef4444', icon: 'UserX' },
        },
      },
    },
    {
      id: 'hex-idle',
      type: 'text',
      x: 430,
      y: 80,
      width: 120,
      height: 90,
      text: 'Idle',
      color: 4,
      pv: {
        nodeType: 'storage',
        shape: 'hexagon',
        icon: 'Database',
        states: {
          idle: { color: '#94a3b8', icon: 'Database' },
          active: { color: '#22c55e', icon: 'HardDrive' },
          error: { color: '#ef4444', icon: 'Database' },
        },
      },
    },
    {
      id: 'diamond-idle',
      type: 'text',
      x: 600,
      y: 80,
      width: 90,
      height: 90,
      text: 'Idle',
      color: 2,
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'GitBranch',
        states: {
          idle: { color: '#94a3b8', icon: 'GitBranch' },
          active: { color: '#f97316', icon: 'GitCommit' },
          error: { color: '#ef4444', icon: 'GitBranch' },
        },
      },
    },

    // Active state
    {
      id: 'rect-active',
      type: 'text',
      x: 100,
      y: 220,
      width: 120,
      height: 70,
      text: 'Active',
      color: 6,
      pv: {
        nodeType: 'process-active',
        shape: 'rectangle',
        icon: 'Play',
        color: '#3b82f6',
      },
    },
    {
      id: 'circle-active',
      type: 'text',
      x: 280,
      y: 220,
      width: 90,
      height: 90,
      text: 'Active',
      color: 5,
      pv: {
        nodeType: 'agent-active',
        shape: 'circle',
        icon: 'UserCheck',
        color: '#22c55e',
      },
    },
    {
      id: 'hex-active',
      type: 'text',
      x: 430,
      y: 220,
      width: 120,
      height: 90,
      text: 'Active',
      color: 4,
      pv: {
        nodeType: 'storage-active',
        shape: 'hexagon',
        icon: 'HardDrive',
        color: '#22c55e',
      },
    },
    {
      id: 'diamond-active',
      type: 'text',
      x: 600,
      y: 220,
      width: 90,
      height: 90,
      text: 'Active',
      color: 2,
      pv: {
        nodeType: 'decision-active',
        shape: 'diamond',
        icon: 'GitCommit',
        color: '#f97316',
      },
    },

    // Error state
    {
      id: 'rect-error',
      type: 'text',
      x: 100,
      y: 360,
      width: 120,
      height: 70,
      text: 'Error',
      color: 1,
      pv: {
        nodeType: 'process-error',
        shape: 'rectangle',
        icon: 'AlertCircle',
        color: '#ef4444',
      },
    },
    {
      id: 'circle-error',
      type: 'text',
      x: 280,
      y: 360,
      width: 90,
      height: 90,
      text: 'Error',
      color: 1,
      pv: {
        nodeType: 'agent-error',
        shape: 'circle',
        icon: 'UserX',
        color: '#ef4444',
      },
    },
    {
      id: 'hex-error',
      type: 'text',
      x: 430,
      y: 360,
      width: 120,
      height: 90,
      text: 'Error',
      color: 1,
      pv: {
        nodeType: 'storage-error',
        shape: 'hexagon',
        icon: 'Database',
        color: '#ef4444',
      },
    },
    {
      id: 'diamond-error',
      type: 'text',
      x: 600,
      y: 360,
      width: 90,
      height: 90,
      text: 'Error',
      color: 1,
      pv: {
        nodeType: 'decision-error',
        shape: 'diamond',
        icon: 'GitBranch',
        color: '#ef4444',
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Shapes with States',
    description: 'Node shapes in different states (idle, active, error)',
    edgeTypes: {},
  },
};

export const ShapesWithStates: Story = {
  args: {
    canvas: shapesWithStatesCanvas,
    width: 800,
    height: 550,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Shapes with States**

Shows each shape in different visual states:
- **Row 1**: Idle state (gray)
- **Row 2**: Active state (blue/green/orange)
- **Row 3**: Error state (red)
        `,
      },
    },
  },
};

/**
 * Interactive comparison of all shapes side by side
 */
const ShapeComparisonTemplate = () => {
  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 20, fontFamily: 'system-ui' }}>Node Shape Comparison</h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 20,
          marginBottom: 30,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>Rectangle</h4>
          <code style={{ fontSize: 11 }}>shape: 'rectangle'</code>
          <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>borderRadius: 8px</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>Circle</h4>
          <code style={{ fontSize: 11 }}>shape: 'circle'</code>
          <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>borderRadius: 50%</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>Hexagon</h4>
          <code style={{ fontSize: 11 }}>shape: 'hexagon'</code>
          <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>CSS clip-path polygon</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>Diamond</h4>
          <code style={{ fontSize: 11 }}>shape: 'diamond'</code>
          <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>rotate(45deg)</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>Custom</h4>
          <code style={{ fontSize: 11 }}>shape: 'custom'</code>
          <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>Falls back to rectangle</div>
        </div>
      </div>

      <GraphRenderer canvas={allShapesCanvas} width={1100} height={280} />

      <div style={{ marginTop: 30, padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
        <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>Implementation Notes</h4>
        <ul style={{ fontSize: 13, lineHeight: 1.8, margin: 0, paddingLeft: 20 }}>
          <li>
            <strong>Rectangle</strong>: Standard box with 8px border radius
          </li>
          <li>
            <strong>Circle</strong>: Forces equal width/height, 50% border radius
          </li>
          <li>
            <strong>Hexagon</strong>: Flat-top style using{' '}
            <code>clipPath: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)</code>
          </li>
          <li>
            <strong>Diamond</strong>: Uses{' '}
            <code>clipPath: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)</code> - works with any
            aspect ratio
          </li>
          <li>
            <strong>Custom</strong>: Currently renders as rectangle (placeholder for future custom
            shapes)
          </li>
        </ul>
      </div>
    </div>
  );
};

export const ShapeComparison: Story = {
  render: () => <ShapeComparisonTemplate />,
  parameters: {
    docs: {
      description: {
        story: 'Interactive comparison view with implementation details for each shape.',
      },
    },
  },
};

/**
 * Canvas showing shapes with wide aspect ratios (width > height)
 */
const wideShapesCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'rect-wide',
      type: 'text',
      x: 50,
      y: 80,
      width: 280,
      height: 60,
      text: 'Wide Rectangle (280x60)',
      color: 6,
      pv: {
        nodeType: 'rect-wide',
        shape: 'rectangle',
        icon: 'RectangleHorizontal',
      },
    },
    {
      id: 'circle-wide',
      type: 'text',
      x: 380,
      y: 80,
      width: 280,
      height: 60,
      text: 'Wide Circle (280x60)',
      color: 5,
      pv: {
        nodeType: 'circle-wide',
        shape: 'circle',
        icon: 'Circle',
      },
    },
    {
      id: 'hex-wide',
      type: 'text',
      x: 50,
      y: 180,
      width: 280,
      height: 60,
      text: 'Wide Hexagon (280x60)',
      color: 4,
      pv: {
        nodeType: 'hex-wide',
        shape: 'hexagon',
        icon: 'Hexagon',
      },
    },
    {
      id: 'diamond-wide',
      type: 'text',
      x: 380,
      y: 180,
      width: 280,
      height: 60,
      text: 'Wide Diamond (280x60)',
      color: 2,
      pv: {
        nodeType: 'diamond-wide',
        shape: 'diamond',
        icon: 'Diamond',
      },
    },
    // Extra wide versions
    {
      id: 'rect-extra-wide',
      type: 'text',
      x: 50,
      y: 280,
      width: 400,
      height: 50,
      text: 'Extra Wide Rectangle (400x50)',
      color: 6,
      pv: {
        nodeType: 'rect-extra-wide',
        shape: 'rectangle',
        icon: 'RectangleHorizontal',
      },
    },
    {
      id: 'hex-extra-wide',
      type: 'text',
      x: 50,
      y: 360,
      width: 400,
      height: 50,
      text: 'Extra Wide Hexagon (400x50)',
      color: 4,
      pv: {
        nodeType: 'hex-extra-wide',
        shape: 'hexagon',
        icon: 'Hexagon',
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Wide Shapes Audit',
    description: 'Node shapes with wide aspect ratios',
    edgeTypes: {},
  },
};

export const WideShapes: Story = {
  args: {
    canvas: wideShapesCanvas,
    width: 750,
    height: 480,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Wide Aspect Ratio Shapes**

Tests how each shape handles wide aspect ratios (width >> height):
- **Row 1**: Wide shapes at 280x60
- **Row 2**: Wide shapes at 280x60
- **Row 3-4**: Extra wide shapes at 400x50

Use this to audit:
- How circle handles non-square dimensions (should it force square or stretch?)
- How hexagon clip-path scales horizontally
- How diamond rotation works with rectangular dimensions
        `,
      },
    },
  },
};

/**
 * Canvas showing shapes with tall aspect ratios (height > width)
 */
const tallShapesCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'rect-tall',
      type: 'text',
      x: 50,
      y: 50,
      width: 80,
      height: 200,
      text: 'Tall Rect',
      color: 6,
      pv: {
        nodeType: 'rect-tall',
        shape: 'rectangle',
        icon: 'RectangleVertical',
      },
    },
    {
      id: 'circle-tall',
      type: 'text',
      x: 180,
      y: 50,
      width: 80,
      height: 200,
      text: 'Tall Circle',
      color: 5,
      pv: {
        nodeType: 'circle-tall',
        shape: 'circle',
        icon: 'Circle',
      },
    },
    {
      id: 'hex-tall',
      type: 'text',
      x: 310,
      y: 50,
      width: 80,
      height: 200,
      text: 'Tall Hex',
      color: 4,
      pv: {
        nodeType: 'hex-tall',
        shape: 'hexagon',
        icon: 'Hexagon',
      },
    },
    {
      id: 'diamond-tall',
      type: 'text',
      x: 440,
      y: 50,
      width: 80,
      height: 200,
      text: 'Tall',
      color: 2,
      pv: {
        nodeType: 'diamond-tall',
        shape: 'diamond',
        icon: 'Diamond',
      },
    },
    // Extra tall versions
    {
      id: 'rect-extra-tall',
      type: 'text',
      x: 570,
      y: 50,
      width: 60,
      height: 280,
      text: 'Extra Tall',
      color: 6,
      pv: {
        nodeType: 'rect-extra-tall',
        shape: 'rectangle',
        icon: 'RectangleVertical',
      },
    },
    {
      id: 'hex-extra-tall',
      type: 'text',
      x: 680,
      y: 50,
      width: 60,
      height: 280,
      text: 'Extra Tall',
      color: 4,
      pv: {
        nodeType: 'hex-extra-tall',
        shape: 'hexagon',
        icon: 'Hexagon',
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Tall Shapes Audit',
    description: 'Node shapes with tall aspect ratios',
    edgeTypes: {},
  },
};

export const TallShapes: Story = {
  args: {
    canvas: tallShapesCanvas,
    width: 800,
    height: 400,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Tall Aspect Ratio Shapes**

Tests how each shape handles tall aspect ratios (height >> width):
- **Columns 1-4**: Tall shapes at 80x200
- **Columns 5-6**: Extra tall shapes at 60x280

Use this to audit:
- How circle handles non-square dimensions
- How hexagon clip-path scales vertically
- How diamond rotation works with tall rectangular dimensions
- Text/icon placement in narrow vertical spaces
        `,
      },
    },
  },
};

/**
 * Canvas showing extreme aspect ratios for stress testing
 */
const extremeAspectRatiosCanvas: ExtendedCanvas = {
  nodes: [
    // Very wide row
    {
      id: 'rect-very-wide',
      type: 'text',
      x: 50,
      y: 50,
      width: 500,
      height: 40,
      text: 'Very Wide Rectangle (500x40) - Testing extreme horizontal stretch',
      color: 6,
      pv: {
        nodeType: 'rect-very-wide',
        shape: 'rectangle',
      },
    },
    {
      id: 'hex-very-wide',
      type: 'text',
      x: 50,
      y: 120,
      width: 500,
      height: 40,
      text: 'Very Wide Hexagon (500x40) - Testing clip-path at extremes',
      color: 4,
      pv: {
        nodeType: 'hex-very-wide',
        shape: 'hexagon',
      },
    },
    // Very tall column
    {
      id: 'rect-very-tall',
      type: 'text',
      x: 600,
      y: 50,
      width: 50,
      height: 300,
      text: 'Very Tall',
      color: 6,
      pv: {
        nodeType: 'rect-very-tall',
        shape: 'rectangle',
      },
    },
    {
      id: 'hex-very-tall',
      type: 'text',
      x: 700,
      y: 50,
      width: 50,
      height: 300,
      text: 'Very Tall',
      color: 4,
      pv: {
        nodeType: 'hex-very-tall',
        shape: 'hexagon',
      },
    },
    // Circle and diamond with extreme ratios (should these enforce square?)
    {
      id: 'circle-extreme-wide',
      type: 'text',
      x: 50,
      y: 200,
      width: 200,
      height: 40,
      text: 'Circle Wide?',
      color: 5,
      pv: {
        nodeType: 'circle-extreme-wide',
        shape: 'circle',
      },
    },
    {
      id: 'diamond-extreme-wide',
      type: 'text',
      x: 300,
      y: 200,
      width: 200,
      height: 40,
      text: 'Diamond Wide?',
      color: 2,
      pv: {
        nodeType: 'diamond-extreme-wide',
        shape: 'diamond',
      },
    },
    {
      id: 'circle-extreme-tall',
      type: 'text',
      x: 50,
      y: 280,
      width: 50,
      height: 120,
      text: 'Tall?',
      color: 5,
      pv: {
        nodeType: 'circle-extreme-tall',
        shape: 'circle',
      },
    },
    {
      id: 'diamond-extreme-tall',
      type: 'text',
      x: 150,
      y: 280,
      width: 50,
      height: 120,
      text: 'Tall?',
      color: 2,
      pv: {
        nodeType: 'diamond-extreme-tall',
        shape: 'diamond',
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Extreme Aspect Ratios',
    description: 'Stress testing node shapes with extreme dimensions',
    edgeTypes: {},
  },
};

export const ExtremeAspectRatios: Story = {
  args: {
    canvas: extremeAspectRatiosCanvas,
    width: 800,
    height: 450,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Extreme Aspect Ratios (Stress Test)**

Tests shapes at extreme aspect ratios to identify edge cases:
- **500x40**: Very wide shapes
- **50x300**: Very tall shapes
- Circle with non-square dimensions (should it enforce square or stretch?)

Key questions to answer:
1. Does circle force equal width/height or stretch?
2. Does hexagon clip-path degrade gracefully at extremes?
3. Does diamond clip-path work correctly at extremes?
4. Is text readable in narrow/short shapes?
        `,
      },
    },
  },
};
