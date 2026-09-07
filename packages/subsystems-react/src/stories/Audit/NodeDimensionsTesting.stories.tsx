import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas, ExtendedCanvasNode } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Audit/NodeDimensionsTesting',
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

/**
 * Text length variations for testing
 */
const TEXT_SAMPLES = {
  veryShort: 'Init',
  short: 'File Parsed',
  medium: 'Validation Started',
  long: 'Canvas Validated Successfully',
  veryLong: 'Complete Analysis And Validation Process',
  extraLong: 'Comprehensive System Validation And Analysis Workflow Process',
};

/**
 * Common dimension presets
 */
const DIMENSIONS = {
  tiny: { width: 100, height: 60 },
  small: { width: 140, height: 80 },
  medium: { width: 180, height: 100 },
  mediumWide: { width: 220, height: 100 },
  large: { width: 200, height: 120 },
  wide: { width: 260, height: 100 },
  tall: { width: 140, height: 140 },
  extraWide: { width: 300, height: 100 },
  square: { width: 150, height: 150 },
};

/**
 * Grid layout helper
 */
const createGrid = (
  rows: { label: string; textKey: keyof typeof TEXT_SAMPLES }[],
  cols: { label: string; dimKey: keyof typeof DIMENSIONS }[],
  startX = 50,
  startY = 100,
  gapX = 40,
  gapY = 40
) => {
  const nodes: ExtendedCanvasNode[] = [];

  rows.forEach((row, rowIdx) => {
    cols.forEach((col, colIdx) => {
      const dim = DIMENSIONS[col.dimKey];
      const text = TEXT_SAMPLES[row.textKey];

      nodes.push({
        id: `${row.textKey}-${col.dimKey}`,
        type: 'text',
        x: startX + colIdx * (Math.max(...Object.values(DIMENSIONS).map(d => d.width)) + gapX),
        y: startY + rowIdx * (Math.max(...Object.values(DIMENSIONS).map(d => d.height)) + gapY),
        width: dim.width,
        height: dim.height,
        text: text,
        color: '#3b82f6',
        pv: {
          name: text,
          shape: 'roundedRect',
          icon: 'Circle',
          otel: {
            kind: 'event',
            category: 'operation',
          },
        },
      });
    });
  });

  return nodes;
};

/**
 * Shows all dimension variations with different text lengths in a comprehensive grid
 */
export const DimensionsGrid: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const rows = [
      { label: 'Very Short', textKey: 'veryShort' as const },
      { label: 'Short', textKey: 'short' as const },
      { label: 'Medium', textKey: 'medium' as const },
      { label: 'Long', textKey: 'long' as const },
      { label: 'Very Long', textKey: 'veryLong' as const },
      { label: 'Extra Long', textKey: 'extraLong' as const },
    ];

    const cols = [
      { label: 'Tiny\n100×60', dimKey: 'tiny' as const },
      { label: 'Small\n140×80', dimKey: 'small' as const },
      { label: 'Medium\n180×100', dimKey: 'medium' as const },
      { label: 'Wide\n260×100', dimKey: 'wide' as const },
      { label: 'Tall\n140×140', dimKey: 'tall' as const },
    ];

    const canvas: ExtendedCanvas = {
      nodes: createGrid(rows, cols, 220, 150, 60, 60),
      edges: [],
    };

    return (
      <div style={{ padding: '32px', fontFamily: theme.fonts.body }}>
        <h1 style={{
          marginBottom: '16px',
          fontFamily: theme.fonts.heading,
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Node Dimensions & Text Readability Grid
        </h1>
        <p style={{
          marginBottom: '24px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
          maxWidth: '1000px',
        }}>
          Testing various node dimensions with different text lengths. All nodes use 12px font (theme.fontSizes[0]).
          Find the optimal width/height combinations for your use case.
        </p>

        {/* Column headers */}
        <div style={{
          position: 'relative',
          marginBottom: '16px',
          paddingLeft: '160px',
          display: 'flex',
          gap: '60px',
        }}>
          {cols.map(col => (
            <div
              key={col.dimKey}
              style={{
                width: DIMENSIONS[col.dimKey].width,
                textAlign: 'center',
                fontSize: theme.fontSizes[0],
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.textSecondary,
                fontFamily: theme.fonts.monospace,
                whiteSpace: 'pre-line',
              }}
            >
              {col.label}
            </div>
          ))}
        </div>

        {/* Row labels + Canvas */}
        <div style={{ display: 'flex' }}>
          {/* Row labels */}
          <div style={{
            width: '160px',
            paddingTop: '150px',
            display: 'flex',
            flexDirection: 'column',
            gap: '60px',
          }}>
            {rows.map(row => (
              <div
                key={row.textKey}
                style={{
                  height: DIMENSIONS.medium.height,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: theme.fontSizes[1],
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.textSecondary,
                }}
              >
                <div>
                  <div style={{ marginBottom: '4px' }}>{row.label}</div>
                  <div style={{
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.monospace,
                    color: theme.colors.textMuted,
                  }}>
                    "{TEXT_SAMPLES[row.textKey]}"
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Canvas */}
          <div style={{
            backgroundColor: theme.colors.background,
            border: `2px solid ${theme.colors.border}`,
            borderRadius: '8px',
            flex: 1,
          }}>
            <GraphRenderer
              canvas={canvas}
              height={1100}
              width="100%"
            />
          </div>
        </div>

        {/* Legend */}
        <div style={{
          marginTop: '32px',
          padding: '20px',
          backgroundColor: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '8px',
        }}>
          <h3 style={{
            marginBottom: '12px',
            fontSize: theme.fontSizes[3],
            color: theme.colors.text,
          }}>
            Reading Guide
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            fontSize: theme.fontSizes[1],
            color: theme.colors.textSecondary,
          }}>
            <div>
              <strong>✅ Good readability:</strong> Text fits comfortably, no awkward wrapping
            </div>
            <div>
              <strong>⚠️ Tight fit:</strong> Text fits but feels cramped
            </div>
            <div>
              <strong>❌ Too cramped:</strong> Text wraps awkwardly or gets cut off
            </div>
            <div>
              <strong>📏 Too spacious:</strong> Excessive empty space, inefficient use of canvas
            </div>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * OTEL Canvas standard sizes - focused comparison
 */
export const OtelStandardSizes: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const testCases = [
      {
        title: 'validation.otel.canvas Standard (200×100)',
        description: 'Most common size in your validation workflow',
        nodes: [
          { text: 'Analysis Started', width: 200, height: 100, x: 100 },
          { text: 'File Parsed', width: 200, height: 100, x: 350 },
          { text: 'Canvas Validated', width: 200, height: 100, x: 600 },
          { text: 'Validation Complete', width: 200, height: 100, x: 850 },
          { text: 'Very Long Event Name Here', width: 200, height: 100, x: 1100 },
        ],
      },
      {
        title: 'Wider (220×100) - More breathing room',
        description: 'Extra 20px width for longer event names',
        nodes: [
          { text: 'Analysis Started', width: 220, height: 100, x: 100 },
          { text: 'File Parsed', width: 220, height: 100, x: 370 },
          { text: 'Canvas Validated', width: 220, height: 100, x: 640 },
          { text: 'Validation Complete', width: 220, height: 100, x: 910 },
          { text: 'Very Long Event Name Here', width: 220, height: 100, x: 1180 },
        ],
      },
      {
        title: 'Compact (180×90) - Space efficient',
        description: 'Smaller footprint for dense workflows',
        nodes: [
          { text: 'Analysis Started', width: 180, height: 90, x: 100 },
          { text: 'File Parsed', width: 180, height: 90, x: 330 },
          { text: 'Canvas Validated', width: 180, height: 90, x: 560 },
          { text: 'Validation Complete', width: 180, height: 90, x: 790 },
          { text: 'Very Long Event Name Here', width: 180, height: 90, x: 1020 },
        ],
      },
      {
        title: 'Tall (200×120) - Extra vertical space',
        description: 'Better for nodes with state labels or badges',
        nodes: [
          { text: 'Analysis Started', width: 200, height: 120, x: 100 },
          { text: 'File Parsed', width: 200, height: 120, x: 350 },
          { text: 'Canvas Validated', width: 200, height: 120, x: 600 },
          { text: 'Validation Complete', width: 200, height: 120, x: 850 },
          { text: 'Very Long Event Name Here', width: 200, height: 120, x: 1100 },
        ],
      },
    ];

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          OTEL Canvas Standard Sizes Comparison
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
          maxWidth: '900px',
        }}>
          Comparing different standard sizes for OTEL event nodes. All use the same event names to show
          how text fits in each dimension.
        </p>

        {testCases.map((testCase, idx) => {
          const canvas: ExtendedCanvas = {
            nodes: testCase.nodes.map((node, nodeIdx) => ({
              id: `node-${idx}-${nodeIdx}`,
              type: 'text',
              x: node.x,
              y: 100,
              width: node.width,
              height: node.height,
              text: node.text,
              color: '#3b82f6',
              pv: {
                name: node.text,
                shape: 'roundedRect',
                icon: 'Circle',
                otel: {
                  kind: 'event',
                  category: 'operation',
                },
              },
            })),
            edges: [],
          };

          return (
            <div
              key={idx}
              style={{
                marginBottom: '40px',
                padding: '24px',
                backgroundColor: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '8px',
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '16px',
              }}>
                <div>
                  <h3 style={{
                    fontSize: theme.fontSizes[3],
                    fontWeight: theme.fontWeights.semibold,
                    color: theme.colors.text,
                    marginBottom: '4px',
                  }}>
                    {testCase.title}
                  </h3>
                  <p style={{
                    fontSize: theme.fontSizes[1],
                    color: theme.colors.textSecondary,
                  }}>
                    {testCase.description}
                  </p>
                </div>
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: theme.colors.backgroundSecondary,
                  borderRadius: '4px',
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[0],
                  color: theme.colors.textMuted,
                }}>
                  {testCase.nodes[0].width} × {testCase.nodes[0].height}
                </div>
              </div>

              <div style={{
                backgroundColor: theme.colors.background,
                border: `2px solid ${theme.colors.border}`,
                borderRadius: '6px',
                overflow: 'hidden',
              }}>
                <GraphRenderer
                  canvas={canvas}
                  height={300}
                  width="100%"
                />
              </div>
            </div>
          );
        })}

        <div style={{
          marginTop: '32px',
          padding: '24px',
          backgroundColor: theme.colors.backgroundSecondary,
          border: `2px solid ${theme.colors.primary}`,
          borderRadius: '8px',
        }}>
          <h3 style={{
            marginBottom: '16px',
            fontSize: theme.fontSizes[4],
            color: theme.colors.text,
          }}>
            Recommendations
          </h3>
          <div style={{
            fontSize: theme.fontSizes[1],
            color: theme.colors.text,
            lineHeight: 1.8,
          }}>
            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: theme.colors.primary }}>✨ Best for most OTEL events:</strong> 200×100 (current standard)
              <div style={{ paddingLeft: '20px', color: theme.colors.textSecondary }}>
                Good balance of readability and space efficiency
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: theme.colors.primary }}>📏 For longer event names:</strong> 220×100
              <div style={{ paddingLeft: '20px', color: theme.colors.textSecondary }}>
                Prevents cramped text, better for descriptive names
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: theme.colors.primary }}>🎯 For compact workflows:</strong> 180×90
              <div style={{ paddingLeft: '20px', color: theme.colors.textSecondary }}>
                Saves space when you have many nodes
              </div>
            </div>
            <div>
              <strong style={{ color: theme.colors.primary }}>🏷️ With badges/states:</strong> 200×120
              <div style={{ paddingLeft: '20px', color: theme.colors.textSecondary }}>
                Extra vertical space for OTEL badges and state labels
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Different shapes with same dimensions
 */
export const ShapesWithDimensions: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const shapes: Array<{
      shape: 'rectangle' | 'roundedRect' | 'circle' | 'hexagon' | 'diamond';
      label: string;
    }> = [
      { shape: 'rectangle', label: 'Rectangle' },
      { shape: 'roundedRect', label: 'Rounded Rect' },
      { shape: 'circle', label: 'Circle' },
      { shape: 'hexagon', label: 'Hexagon' },
      { shape: 'diamond', label: 'Diamond' },
    ];

    const dimensions = [
      { label: 'Small (140×80)', width: 140, height: 80 },
      { label: 'Medium (180×100)', width: 180, height: 100 },
      { label: 'Large (220×120)', width: 220, height: 120 },
    ];

    const textSamples = [
      'Init',
      'File Parsed',
      'Validation Complete',
    ];

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Shape & Dimension Combinations
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
        }}>
          How different shapes utilize the same dimensions with varying text lengths.
        </p>

        {dimensions.map((dim, dimIdx) => {
          const canvas: ExtendedCanvas = {
            nodes: shapes.flatMap((shape, shapeIdx) =>
              textSamples.map((text, textIdx) => ({
                id: `${dimIdx}-${shapeIdx}-${textIdx}`,
                type: 'text',
                x: 100 + shapeIdx * (dim.width + 60),
                y: 100 + textIdx * (dim.height + 40),
                width: dim.width,
                height: dim.height,
                text,
                color: ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'][shapeIdx],
                pv: {
                  name: text,
                  shape: shape.shape,
                  icon: 'Circle',
                },
              }))
            ),
            edges: [],
          };

          return (
            <div
              key={dimIdx}
              style={{
                marginBottom: '40px',
                padding: '24px',
                backgroundColor: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '8px',
              }}
            >
              <h3 style={{
                fontSize: theme.fontSizes[3],
                marginBottom: '16px',
                color: theme.colors.text,
              }}>
                {dim.label}
              </h3>

              <div style={{
                display: 'flex',
                gap: '40px',
                marginBottom: '16px',
                paddingLeft: '100px',
              }}>
                {shapes.map(shape => (
                  <div
                    key={shape.shape}
                    style={{
                      width: dim.width,
                      textAlign: 'center',
                      fontSize: theme.fontSizes[1],
                      fontWeight: theme.fontWeights.semibold,
                      color: theme.colors.textSecondary,
                    }}
                  >
                    {shape.label}
                  </div>
                ))}
              </div>

              <div style={{
                backgroundColor: theme.colors.background,
                border: `2px solid ${theme.colors.border}`,
                borderRadius: '6px',
              }}>
                <GraphRenderer
                  canvas={canvas}
                  height={500}
                  width="100%"
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  },
};

/**
 * Real-world OTEL workflow with consistent dimensions
 */
export const RealWorldWorkflow: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const workflows = [
      {
        title: 'Current (200×100) - validation.otel.canvas style',
        width: 200,
        height: 100,
      },
      {
        title: 'Proposed (220×100) - More readable',
        width: 220,
        height: 100,
      },
      {
        title: 'Compact (180×90) - Space efficient',
        width: 180,
        height: 90,
      },
    ];

    const events = [
      { name: 'Analysis Started', color: '#22c55e', y: 50 },
      { name: 'FileTree Built', color: '#3b82f6', y: 200 },
      { name: 'Packages Discovered', color: '#f59e0b', y: 350 },
      { name: 'Discovery Complete', color: '#f59e0b', y: 500 },
      { name: 'Validation Started', color: '#22c55e', y: 650 },
      { name: 'Canvas Validated', color: '#8b5cf6', y: 800 },
      { name: 'Validation Complete', color: '#22c55e', y: 950 },
    ];

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Real Workflow Comparison
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
        }}>
          Same workflow rendered with different node dimensions. Compare overall aesthetics and readability.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '24px',
        }}>
          {workflows.map((workflow, idx) => {
            const canvas: ExtendedCanvas = {
              nodes: events.map((event, eventIdx) => ({
                id: `${idx}-${eventIdx}`,
                type: 'text',
                x: 100,
                y: event.y,
                width: workflow.width,
                height: workflow.height,
                text: event.name,
                color: event.color,
                pv: {
                  name: event.name,
                  shape: 'roundedRect',
                  icon: 'Circle',
                  otel: {
                    kind: 'event',
                    category: eventIdx === 0 || eventIdx === 4 || eventIdx === 6 ? 'lifecycle' : 'operation',
                  },
                  sources: eventIdx % 2 === 0 ? ['src/discovery/CanvasDiscovery.ts'] : undefined,
                },
              })),
              edges: events.slice(0, -1).map((_, eventIdx) => ({
                id: `edge-${idx}-${eventIdx}`,
                fromNode: `${idx}-${eventIdx}`,
                toNode: `${idx}-${eventIdx + 1}`,
                fromSide: 'bottom' as const,
                toSide: 'top' as const,
              })),
            };

            return (
              <div key={idx}>
                <h3 style={{
                  fontSize: theme.fontSizes[2],
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.text,
                  marginBottom: '8px',
                }}>
                  {workflow.title}
                </h3>
                <div style={{
                  fontSize: theme.fontSizes[0],
                  fontFamily: theme.fonts.monospace,
                  color: theme.colors.textMuted,
                  marginBottom: '12px',
                }}>
                  {workflow.width} × {workflow.height}
                </div>
                <div style={{
                  backgroundColor: theme.colors.background,
                  border: `2px solid ${theme.colors.border}`,
                  borderRadius: '6px',
                }}>
                  <GraphRenderer
                    canvas={canvas}
                    height={1200}
                    width="100%"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
};
