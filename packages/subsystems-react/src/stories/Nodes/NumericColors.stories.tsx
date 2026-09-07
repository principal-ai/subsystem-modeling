import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Nodes/NumericColors',
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

// ============================================================================
// Obsidian Canvas Numeric Color Presets
// Tests both string and number formats for color codes 1-6
// ============================================================================

const obsidianNumericColorsCanvas: ExtendedCanvas = {
  nodes: [
    // Header
    {
      id: 'header',
      type: 'text',
      x: 50,
      y: 20,
      width: 900,
      height: 60,
      text: '# Obsidian Canvas Numeric Color Presets\nTests resolveCanvasColor() support for "1"-"6" strings and 1-6 numbers',
      pv: { nodeType: 'header', shape: 'rectangle' },
    },
    // Row 1: String format (Obsidian Canvas output)
    {
      id: 'string-1',
      type: 'text',
      x: 50,
      y: 120,
      width: 140,
      height: 80,
      text: 'color: "1"\nRed\n#ef4444',
      color: '1', // Obsidian format
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'string-2',
      type: 'text',
      x: 210,
      y: 120,
      width: 140,
      height: 80,
      text: 'color: "2"\nOrange\n#f97316',
      color: '2',
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'string-3',
      type: 'text',
      x: 370,
      y: 120,
      width: 140,
      height: 80,
      text: 'color: "3"\nYellow\n#eab308',
      color: '3',
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'string-4',
      type: 'text',
      x: 530,
      y: 120,
      width: 140,
      height: 80,
      text: 'color: "4"\nGreen\n#22c55e',
      color: '4',
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'string-5',
      type: 'text',
      x: 690,
      y: 120,
      width: 140,
      height: 80,
      text: 'color: "5"\nCyan\n#06b6d4',
      color: '5',
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'string-6',
      type: 'text',
      x: 850,
      y: 120,
      width: 140,
      height: 80,
      text: 'color: "6"\nPurple\n#8b5cf6',
      color: '6',
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    // Label for row 2
    {
      id: 'label-number',
      type: 'text',
      x: 50,
      y: 230,
      width: 900,
      height: 40,
      text: 'Number format (programmatic usage):',
      pv: { nodeType: 'label', shape: 'rectangle' },
    },
    // Row 2: Number format (programmatic)
    {
      id: 'number-1',
      type: 'text',
      x: 50,
      y: 290,
      width: 140,
      height: 80,
      text: 'color: 1\nRed\n#ef4444',
      color: 1,
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'number-2',
      type: 'text',
      x: 210,
      y: 290,
      width: 140,
      height: 80,
      text: 'color: 2\nOrange\n#f97316',
      color: 2,
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'number-3',
      type: 'text',
      x: 370,
      y: 290,
      width: 140,
      height: 80,
      text: 'color: 3\nYellow\n#eab308',
      color: 3,
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'number-4',
      type: 'text',
      x: 530,
      y: 290,
      width: 140,
      height: 80,
      text: 'color: 4\nGreen\n#22c55e',
      color: 4,
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'number-5',
      type: 'text',
      x: 690,
      y: 290,
      width: 140,
      height: 80,
      text: 'color: 5\nCyan\n#06b6d4',
      color: 5,
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'number-6',
      type: 'text',
      x: 850,
      y: 290,
      width: 140,
      height: 80,
      text: 'color: 6\nPurple\n#8b5cf6',
      color: 6,
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    // Label for row 3
    {
      id: 'label-hex',
      type: 'text',
      x: 50,
      y: 400,
      width: 900,
      height: 40,
      text: 'Hex format (standard CSS colors):',
      pv: { nodeType: 'label', shape: 'rectangle' },
    },
    // Row 3: Hex colors (should pass through unchanged)
    {
      id: 'hex-1',
      type: 'text',
      x: 50,
      y: 460,
      width: 140,
      height: 80,
      text: 'color: #ef4444\nRed\n(hex)',
      color: '#ef4444',
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'hex-2',
      type: 'text',
      x: 210,
      y: 460,
      width: 140,
      height: 80,
      text: 'color: #f97316\nOrange\n(hex)',
      color: '#f97316',
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'hex-3',
      type: 'text',
      x: 370,
      y: 460,
      width: 140,
      height: 80,
      text: 'color: #eab308\nYellow\n(hex)',
      color: '#eab308',
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'hex-4',
      type: 'text',
      x: 530,
      y: 460,
      width: 140,
      height: 80,
      text: 'color: #22c55e\nGreen\n(hex)',
      color: '#22c55e',
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'hex-5',
      type: 'text',
      x: 690,
      y: 460,
      width: 140,
      height: 80,
      text: 'color: #06b6d4\nCyan\n(hex)',
      color: '#06b6d4',
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
    {
      id: 'hex-6',
      type: 'text',
      x: 850,
      y: 460,
      width: 140,
      height: 80,
      text: 'color: #8b5cf6\nPurple\n(hex)',
      color: '#8b5cf6',
      pv: { nodeType: 'preset', shape: 'rectangle' },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Numeric Color Presets Demo',
    description: 'Tests Obsidian Canvas numeric color preset support',
    edgeTypes: {},
  },
};

export const ObsidianColorPresets: Story = {
  args: {
    canvas: obsidianNumericColorsCanvas,
    width: 1050,
    height: 620,
    showMinimap: false,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Obsidian Canvas Color Preset Support**

The \`resolveCanvasColor()\` function normalizes three color formats:

1. **String presets** ("1"-"6") - Obsidian Canvas output format
2. **Number presets** (1-6) - Programmatic usage
3. **Hex colors** ("#rrggbb") - Standard CSS format

**Color Mapping:**
- 1 = Red (#ef4444)
- 2 = Orange (#f97316)
- 3 = Yellow (#eab308)
- 4 = Green (#22c55e)
- 5 = Cyan (#06b6d4)
- 6 = Purple (#8b5cf6)

**Why this matters:**
- Obsidian Canvas color picker saves colors as strings ("1"-"6")
- Without conversion, these would be invalid CSS values (transparent/black nodes)
- This allows seamless editing in Obsidian while rendering correctly in React Flow

All three rows should display identical colors, proving the conversion works correctly.
        `,
      },
    },
  },
};

// ============================================================================
// Edge Numeric Colors
// Tests numeric color support on edges
// ============================================================================

const edgeNumericColorsCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'source',
      type: 'text',
      x: 100,
      y: 250,
      width: 150,
      height: 60,
      text: 'Source Node',
      color: '#888888',
      pv: { nodeType: 'source', shape: 'rectangle' },
    },
    {
      id: 'target-1',
      type: 'text',
      x: 400,
      y: 100,
      width: 120,
      height: 60,
      text: 'Target 1\nRed edge',
      color: '#888888',
      pv: { nodeType: 'target', shape: 'rectangle' },
    },
    {
      id: 'target-2',
      type: 'text',
      x: 400,
      y: 200,
      width: 120,
      height: 60,
      text: 'Target 2\nGreen edge',
      color: '#888888',
      pv: { nodeType: 'target', shape: 'rectangle' },
    },
    {
      id: 'target-3',
      type: 'text',
      x: 400,
      y: 300,
      width: 120,
      height: 60,
      text: 'Target 3\nPurple edge',
      color: '#888888',
      pv: { nodeType: 'target', shape: 'rectangle' },
    },
    {
      id: 'target-4',
      type: 'text',
      x: 400,
      y: 400,
      width: 120,
      height: 60,
      text: 'Target 4\nHex orange',
      color: '#888888',
      pv: { nodeType: 'target', shape: 'rectangle' },
    },
  ],
  edges: [
    {
      id: 'edge-string-1',
      fromNode: 'source',
      toNode: 'target-1',
      color: '1', // String format - red
      label: 'color: "1"',
    },
    {
      id: 'edge-number-4',
      fromNode: 'source',
      toNode: 'target-2',
      color: 4, // Number format - green
      label: 'color: 4',
    },
    {
      id: 'edge-string-6',
      fromNode: 'source',
      toNode: 'target-3',
      color: '6', // String format - purple
      label: 'color: "6"',
    },
    {
      id: 'edge-hex',
      fromNode: 'source',
      toNode: 'target-4',
      color: '#f97316', // Hex format - orange
      label: 'color: #f97316',
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Edge Numeric Colors Demo',
    description: 'Tests numeric color support on edges',
    edgeTypes: {},
  },
};

export const EdgeNumericColors: Story = {
  args: {
    canvas: edgeNumericColorsCanvas,
    width: 650,
    height: 580,
    showMinimap: false,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Edge Color Numeric Support**

Edges also support numeric color presets in all three formats:
- String presets from Obsidian ("1"-"6")
- Number presets for programmatic use (1-6)
- Standard hex colors (#rrggbb)

This ensures consistency between node and edge color handling.
        `,
      },
    },
  },
};
