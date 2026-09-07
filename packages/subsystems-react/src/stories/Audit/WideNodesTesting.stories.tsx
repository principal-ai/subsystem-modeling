import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import type { Theme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Audit/WideNodesTesting',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof GraphRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Create theme with 16px base font
 */
const theme16px: Theme = {
  ...defaultEditorTheme,
  fontSizes: [16, 18, 20, 22, 24, 28, 36, 52, 68, 100],
};

/**
 * Large workflow event names for testing
 */
const WORKFLOW_EVENTS = [
  'Analysis Started',
  'FileTree Built',
  'Packages Discovered',
  'Canvases Discovered',
  'Executions Discovered',
  'Library Loaded',
  'Discovery Complete',
  'Validation Started',
  'File Parsed',
  'Type Detected',
  'Canvas Validated',
  'Workflow Validated',
  'Execution Validated',
  'Library Validated',
  'Rules Executed',
  'Results Aggregated',
  'Validation Complete',
  'Validation Error',
  'Config Saved',
  'Report Generated',
];

/**
 * Generate colors based on category
 */
const getEventColor = (name: string): string => {
  if (name.includes('Started')) return '#22c55e';
  if (name.includes('Complete')) return '#22c55e';
  if (name.includes('Error')) return '#ef4444';
  if (name.includes('Validated')) return '#8b5cf6';
  if (name.includes('Discovered')) return '#f59e0b';
  return '#3b82f6';
};

/**
 * Main story: 200×75 with 16px font - Large workflow
 */
export const WideNodes_200x75_ManyNodes: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const canvas: ExtendedCanvas = {
      nodes: WORKFLOW_EVENTS.map((event, idx) => ({
        id: `event-${idx}`,
        type: 'text',
        x: 100,
        y: 80 + idx * 120,
        width: 200,
        height: 75,
        text: event,
        color: getEventColor(event),
        pv: {
          name: event,
          shape: 'roundedRect',
          otel: {
            kind: 'event',
            category: event.includes('Started') || event.includes('Complete') ? 'lifecycle' : 'operation',
          },
        },
      })),
      edges: WORKFLOW_EVENTS.slice(0, -1).map((_, idx) => ({
        id: `edge-${idx}`,
        fromNode: `event-${idx}`,
        toNode: `event-${idx + 1}`,
        fromSide: 'bottom' as const,
        toSide: 'top' as const,
      })),
    };

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Wide Nodes: 200×75 with 16px Font
        </h1>
        <p style={{
          marginBottom: '24px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
          maxWidth: '1000px',
        }}>
          Testing wider aspect ratio (200×75) with 16px font size. This shows {WORKFLOW_EVENTS.length} nodes
          in a complete validation workflow to see how the design scales.
        </p>

        <div style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: theme.colors.surface,
          borderRadius: '8px',
        }}>
          <div style={{
            flex: 1,
            padding: '12px',
            backgroundColor: theme.colors.backgroundSecondary,
            borderRadius: '6px',
          }}>
            <div style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted, marginBottom: '4px' }}>
              Dimensions
            </div>
            <div style={{ fontSize: theme.fontSizes[3], fontFamily: theme.fonts.monospace, color: theme.colors.text }}>
              200 × 75
            </div>
          </div>
          <div style={{
            flex: 1,
            padding: '12px',
            backgroundColor: theme.colors.backgroundSecondary,
            borderRadius: '6px',
          }}>
            <div style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted, marginBottom: '4px' }}>
              Font Size
            </div>
            <div style={{ fontSize: theme.fontSizes[3], fontFamily: theme.fonts.monospace, color: theme.colors.text }}>
              16px
            </div>
          </div>
          <div style={{
            flex: 1,
            padding: '12px',
            backgroundColor: theme.colors.backgroundSecondary,
            borderRadius: '6px',
          }}>
            <div style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted, marginBottom: '4px' }}>
              Aspect Ratio
            </div>
            <div style={{ fontSize: theme.fontSizes[3], fontFamily: theme.fonts.monospace, color: theme.colors.text }}>
              2.67:1
            </div>
          </div>
          <div style={{
            flex: 1,
            padding: '12px',
            backgroundColor: theme.colors.backgroundSecondary,
            borderRadius: '6px',
          }}>
            <div style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted, marginBottom: '4px' }}>
              Nodes
            </div>
            <div style={{ fontSize: theme.fontSizes[3], fontFamily: theme.fonts.monospace, color: theme.colors.text }}>
              {WORKFLOW_EVENTS.length}
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: theme.colors.background,
          border: `2px solid ${theme.colors.border}`,
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          <ThemeProvider theme={theme16px}>
            <GraphRenderer
              canvas={canvas}
              height={2600}
              width="100%"
            />
          </ThemeProvider>
        </div>
      </div>
    );
  },
};

/**
 * Compare different heights with 200px width and 16px font
 */
export const HeightComparison_200Width_16pxFont: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const heights = [
      { label: '200×70 (2.86:1)', height: 70, description: 'Very wide, minimal vertical padding' },
      { label: '200×75 (2.67:1)', height: 75, description: 'Wide, compact vertical spacing' },
      { label: '200×80 (2.5:1)', height: 80, description: 'Wide, balanced spacing' },
      { label: '200×85 (2.35:1)', height: 85, description: 'Wide, more vertical breathing room' },
      { label: '200×90 (2.22:1)', height: 90, description: 'Wide, generous vertical spacing' },
    ];

    const sampleEvents = [
      'Analysis Started',
      'File Parsed',
      'Canvas Validated',
      'Results Aggregated',
      'Validation Complete',
    ];

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Height Comparison: 200px Width, 16px Font
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
        }}>
          Testing different heights with fixed 200px width and 16px font to find the optimal aspect ratio.
        </p>

        {heights.map((config, idx) => {
          const canvas: ExtendedCanvas = {
            nodes: sampleEvents.map((event, eventIdx) => ({
              id: `${idx}-${eventIdx}`,
              type: 'text',
              x: 100,
              y: 80 + eventIdx * (config.height + 30),
              width: 200,
              height: config.height,
              text: event,
              color: getEventColor(event),
              pv: {
                name: event,
                shape: 'roundedRect',
              },
            })),
            edges: sampleEvents.slice(0, -1).map((_, eventIdx) => ({
              id: `edge-${idx}-${eventIdx}`,
              fromNode: `${idx}-${eventIdx}`,
              toNode: `${idx}-${eventIdx + 1}`,
              fromSide: 'bottom' as const,
              toSide: 'top' as const,
            })),
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
                alignItems: 'center',
                marginBottom: '16px',
              }}>
                <div>
                  <h3 style={{
                    fontSize: theme.fontSizes[3],
                    fontWeight: theme.fontWeights.semibold,
                    color: theme.colors.text,
                    marginBottom: '4px',
                  }}>
                    {config.label}
                  </h3>
                  <p style={{
                    fontSize: theme.fontSizes[1],
                    color: theme.colors.textSecondary,
                  }}>
                    {config.description}
                  </p>
                </div>
                {config.height === 75 && (
                  <div style={{
                    padding: '6px 12px',
                    backgroundColor: theme.colors.primary,
                    color: theme.colors.background,
                    borderRadius: '4px',
                    fontSize: theme.fontSizes[0],
                    fontWeight: theme.fontWeights.bold,
                  }}>
                    ⭐ Recommended
                  </div>
                )}
              </div>

              <div style={{
                backgroundColor: theme.colors.background,
                border: `2px solid ${config.height === 75 ? theme.colors.primary : theme.colors.border}`,
                borderRadius: '6px',
                overflow: 'hidden',
              }}>
                <ThemeProvider theme={theme16px}>
                  <GraphRenderer
                    canvas={canvas}
                    height={700}
                    width="100%"
                  />
                </ThemeProvider>
              </div>
            </div>
          );
        })}
      </div>
    );
  },
};

/**
 * Side-by-side comparison of current vs proposed
 */
export const CurrentVsProposed: Story = {
  render: () => {
    const theme = defaultEditorTheme;
    const theme12px = defaultEditorTheme;

    const testEvents = WORKFLOW_EVENTS.slice(0, 12); // First 12 events

    const configs = [
      {
        title: 'Current Standard',
        description: '200×100 with 12px font',
        width: 200,
        height: 100,
        theme: theme12px,
        color: theme.colors.textSecondary,
      },
      {
        title: 'Proposed Wide',
        description: '200×75 with 16px font',
        width: 200,
        height: 75,
        theme: theme16px,
        color: theme.colors.primary,
      },
    ];

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Current vs Proposed Wide Design
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
          maxWidth: '1000px',
        }}>
          Direct comparison between current standard (200×100, 12px) and proposed wide design (200×75, 16px).
          Notice the improved readability with larger font while maintaining compact vertical space.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '32px',
        }}>
          {configs.map((config, idx) => {
            const canvas: ExtendedCanvas = {
              nodes: testEvents.map((event, eventIdx) => ({
                id: `${idx}-${eventIdx}`,
                type: 'text',
                x: 100,
                y: 80 + eventIdx * (config.height + 30),
                width: config.width,
                height: config.height,
                text: event,
                color: getEventColor(event),
                pv: {
                  name: event,
                  shape: 'roundedRect',
                  otel: {
                    kind: 'event',
                    category: event.includes('Started') || event.includes('Complete') ? 'lifecycle' : 'operation',
                  },
                },
              })),
              edges: testEvents.slice(0, -1).map((_, eventIdx) => ({
                id: `edge-${idx}-${eventIdx}`,
                fromNode: `${idx}-${eventIdx}`,
                toNode: `${idx}-${eventIdx + 1}`,
                fromSide: 'bottom' as const,
                toSide: 'top' as const,
              })),
            };

            return (
              <div key={idx}>
                <div style={{
                  marginBottom: '16px',
                  padding: '16px',
                  backgroundColor: theme.colors.surface,
                  borderRadius: '8px',
                  border: `2px solid ${config.color}`,
                }}>
                  <h3 style={{
                    fontSize: theme.fontSizes[3],
                    fontWeight: theme.fontWeights.semibold,
                    color: config.color,
                    marginBottom: '4px',
                  }}>
                    {config.title}
                  </h3>
                  <p style={{
                    fontSize: theme.fontSizes[1],
                    color: theme.colors.textSecondary,
                    marginBottom: '12px',
                  }}>
                    {config.description}
                  </p>
                  <div style={{
                    display: 'flex',
                    gap: '16px',
                    fontSize: theme.fontSizes[1],
                    fontFamily: theme.fonts.monospace,
                  }}>
                    <div>
                      <span style={{ color: theme.colors.textMuted }}>Size:</span>{' '}
                      <span style={{ color: theme.colors.text }}>{config.width}×{config.height}</span>
                    </div>
                    <div>
                      <span style={{ color: theme.colors.textMuted }}>Font:</span>{' '}
                      <span style={{ color: theme.colors.text }}>{config.theme.fontSizes[0]}px</span>
                    </div>
                    <div>
                      <span style={{ color: theme.colors.textMuted }}>Ratio:</span>{' '}
                      <span style={{ color: theme.colors.text }}>{(config.width / config.height).toFixed(2)}:1</span>
                    </div>
                  </div>
                </div>

                <div style={{
                  backgroundColor: theme.colors.background,
                  border: `2px solid ${config.color}`,
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  <ThemeProvider theme={config.theme}>
                    <GraphRenderer
                      canvas={canvas}
                      height={1700}
                      width="100%"
                    />
                  </ThemeProvider>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: '40px',
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
            Key Differences
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px',
            fontSize: theme.fontSizes[1],
            color: theme.colors.text,
            lineHeight: 1.8,
          }}>
            <div>
              <strong style={{ color: theme.colors.textSecondary }}>Current (200×100, 12px)</strong>
              <ul style={{ paddingLeft: '20px', marginTop: '8px', color: theme.colors.textSecondary }}>
                <li>More vertical space per node</li>
                <li>Smaller font requires good vision</li>
                <li>Square-ish aspect ratio (2:1)</li>
                <li>More vertical scrolling needed</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: theme.colors.primary }}>Proposed (200×75, 16px)</strong>
              <ul style={{ paddingLeft: '20px', marginTop: '8px', color: theme.colors.text }}>
                <li>✨ 33% larger font for better readability</li>
                <li>✨ 25% less vertical space (more compact)</li>
                <li>✨ Wider aspect ratio (2.67:1)</li>
                <li>✨ Fits more nodes on screen</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Ultra-wide aspect ratios
 */
export const UltraWideRatios: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const configs = [
      { label: '220×70 (3.14:1)', width: 220, height: 70 },
      { label: '240×75 (3.2:1)', width: 240, height: 75 },
      { label: '200×65 (3.08:1)', width: 200, height: 65 },
      { label: '200×75 (2.67:1) ⭐', width: 200, height: 75 },
    ];

    const sampleEvents = [
      'Analysis Started',
      'Packages Discovered',
      'Canvas Validated',
      'Validation Complete',
    ];

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Ultra-Wide Aspect Ratios (16px Font)
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
        }}>
          Exploring very wide aspect ratios (2.67:1 to 3.2:1) with 16px font. These create a more horizontal,
          streamlined appearance.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '32px',
        }}>
          {configs.map((config, idx) => {
            const canvas: ExtendedCanvas = {
              nodes: sampleEvents.map((event, eventIdx) => ({
                id: `${idx}-${eventIdx}`,
                type: 'text',
                x: 100,
                y: 80 + eventIdx * (config.height + 30),
                width: config.width,
                height: config.height,
                text: event,
                color: getEventColor(event),
                pv: {
                  name: event,
                  shape: 'roundedRect',
                },
              })),
              edges: [],
            };

            return (
              <div
                key={idx}
                style={{
                  padding: '20px',
                  backgroundColor: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '8px',
                }}
              >
                <h3 style={{
                  fontSize: theme.fontSizes[2],
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.text,
                  marginBottom: '12px',
                }}>
                  {config.label}
                </h3>

                <div style={{
                  backgroundColor: theme.colors.background,
                  border: `2px solid ${theme.colors.border}`,
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}>
                  <ThemeProvider theme={theme16px}>
                    <GraphRenderer
                      canvas={canvas}
                      height={500}
                      width="100%"
                    />
                  </ThemeProvider>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
};

/**
 * Compare 200×90 specifically against other options
 */
export const Compare_200x90: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const configs = [
      {
        title: 'Current Standard',
        description: '200×100 with 12px font',
        width: 200,
        height: 100,
        theme: defaultEditorTheme,
        ratio: '2:1',
      },
      {
        title: 'Proposed 200×90',
        description: '200×90 with 16px font',
        width: 200,
        height: 90,
        theme: theme16px,
        ratio: '2.22:1',
        highlight: true,
      },
      {
        title: 'Ultra-Wide Option',
        description: '200×75 with 16px font',
        width: 200,
        height: 75,
        theme: theme16px,
        ratio: '2.67:1',
      },
    ];

    const sampleEvents = WORKFLOW_EVENTS.slice(0, 10);

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          200×90 Comparison
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
          maxWidth: '1000px',
        }}>
          Direct comparison of 200×90 (2.22:1 aspect ratio) against current standard and ultra-wide option.
          The 200×90 option balances improved readability (16px font) with generous vertical spacing.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '24px',
        }}>
          {configs.map((config, idx) => {
            const canvas: ExtendedCanvas = {
              nodes: sampleEvents.map((event, eventIdx) => ({
                id: `${idx}-${eventIdx}`,
                type: 'text',
                x: 100,
                y: 80 + eventIdx * (config.height + 30),
                width: config.width,
                height: config.height,
                text: event,
                color: getEventColor(event),
                pv: {
                  name: event,
                  shape: 'roundedRect',
                  otel: {
                    kind: 'event',
                    category: event.includes('Started') || event.includes('Complete') ? 'lifecycle' : 'operation',
                  },
                },
              })),
              edges: sampleEvents.slice(0, -1).map((_, eventIdx) => ({
                id: `edge-${idx}-${eventIdx}`,
                fromNode: `${idx}-${eventIdx}`,
                toNode: `${idx}-${eventIdx + 1}`,
                fromSide: 'bottom' as const,
                toSide: 'top' as const,
              })),
            };

            return (
              <div key={idx}>
                <div style={{
                  marginBottom: '16px',
                  padding: '16px',
                  backgroundColor: config.highlight ? theme.colors.primary : theme.colors.surface,
                  borderRadius: '8px',
                  border: `2px solid ${config.highlight ? theme.colors.primary : theme.colors.border}`,
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px',
                  }}>
                    <h3 style={{
                      fontSize: theme.fontSizes[2],
                      fontWeight: theme.fontWeights.semibold,
                      color: config.highlight ? theme.colors.background : theme.colors.text,
                    }}>
                      {config.title}
                    </h3>
                    {config.highlight && (
                      <div style={{
                        padding: '2px 6px',
                        backgroundColor: theme.colors.background,
                        color: theme.colors.primary,
                        borderRadius: '4px',
                        fontSize: theme.fontSizes[0],
                        fontWeight: theme.fontWeights.bold,
                      }}>
                        ⭐ Testing
                      </div>
                    )}
                  </div>
                  <p style={{
                    fontSize: theme.fontSizes[1],
                    color: config.highlight ? theme.colors.background : theme.colors.textSecondary,
                    marginBottom: '12px',
                  }}>
                    {config.description}
                  </p>
                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.monospace,
                    color: config.highlight ? theme.colors.background : theme.colors.text,
                  }}>
                    <div>Ratio: {config.ratio}</div>
                    <div>•</div>
                    <div>Font: {config.theme.fontSizes[0]}px</div>
                  </div>
                </div>

                <div style={{
                  backgroundColor: theme.colors.background,
                  border: `3px solid ${config.highlight ? theme.colors.primary : theme.colors.border}`,
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  <ThemeProvider theme={config.theme}>
                    <GraphRenderer
                      canvas={canvas}
                      height={1400}
                      width="100%"
                    />
                  </ThemeProvider>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: '40px',
          padding: '24px',
          backgroundColor: theme.colors.surface,
          border: `2px solid ${theme.colors.primary}`,
          borderRadius: '8px',
        }}>
          <h3 style={{
            marginBottom: '16px',
            fontSize: theme.fontSizes[4],
            color: theme.colors.text,
          }}>
            Why 200×90 Works Well
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px',
            fontSize: theme.fontSizes[1],
            lineHeight: 1.8,
          }}>
            <div>
              <strong style={{ color: theme.colors.primary }}>vs. Current (200×100, 12px)</strong>
              <ul style={{ paddingLeft: '20px', marginTop: '8px', color: theme.colors.text }}>
                <li>✨ 33% larger font (12px → 16px)</li>
                <li>✨ 10% less vertical space per node</li>
                <li>✨ Better readability for longer event names</li>
                <li>✨ More modern, accessible design</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: theme.colors.primary }}>vs. Ultra-Wide (200×75, 16px)</strong>
              <ul style={{ paddingLeft: '20px', marginTop: '8px', color: theme.colors.text }}>
                <li>✨ 20% more vertical breathing room</li>
                <li>✨ Less cramped appearance</li>
                <li>✨ Accommodates badges/states better</li>
                <li>✨ More balanced aspect ratio (2.22:1 vs 2.67:1)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Dense workflow - many nodes on one screen
 */
export const DenseWorkflowView: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    // Create a branching workflow with many nodes
    const canvas: ExtendedCanvas = {
      nodes: [
        // Main flow
        ...WORKFLOW_EVENTS.slice(0, 10).map((event, idx) => ({
          id: `main-${idx}`,
          type: 'text',
          x: 100,
          y: 80 + idx * 140,
          width: 200,
          height: 90,
          text: event,
          color: getEventColor(event),
          pv: {
            name: event,
            shape: 'roundedRect',
            otel: { kind: 'event' as const, category: 'operation' as const },
          },
        })),
        // Branch 1
        ...['Config Loaded', 'Settings Validated', 'Plugins Initialized'].map((event, idx) => ({
          id: `branch1-${idx}`,
          type: 'text',
          x: 400,
          y: 220 + idx * 140,
          width: 200,
          height: 90,
          text: event,
          color: '#8b5cf6',
          pv: {
            name: event,
            shape: 'roundedRect',
          },
        })),
        // Branch 2
        ...['Cache Checked', 'Cache Hit', 'Data Loaded'].map((event, idx) => ({
          id: `branch2-${idx}`,
          type: 'text',
          x: 700,
          y: 220 + idx * 140,
          width: 200,
          height: 90,
          text: event,
          color: '#f59e0b',
          pv: {
            name: event,
            shape: 'roundedRect',
          },
        })),
        // Final nodes
        ...['Merge Results', 'Final Validation', 'Complete'].map((event, idx) => ({
          id: `final-${idx}`,
          type: 'text',
          x: 400,
          y: 780 + idx * 140,
          width: 200,
          height: 90,
          text: event,
          color: getEventColor(event),
          pv: {
            name: event,
            shape: 'roundedRect',
          },
        })),
      ],
      edges: [
        // Main flow edges
        ...Array.from({ length: 9 }, (_, i) => ({
          id: `main-edge-${i}`,
          fromNode: `main-${i}`,
          toNode: `main-${i + 1}`,
          fromSide: 'bottom' as const,
          toSide: 'top' as const,
        })),
        // Branch edges
        { id: 'to-branch1', fromNode: 'main-2', toNode: 'branch1-0', fromSide: 'right' as const, toSide: 'left' as const },
        { id: 'branch1-1', fromNode: 'branch1-0', toNode: 'branch1-1', fromSide: 'bottom' as const, toSide: 'top' as const },
        { id: 'branch1-2', fromNode: 'branch1-1', toNode: 'branch1-2', fromSide: 'bottom' as const, toSide: 'top' as const },
        { id: 'to-branch2', fromNode: 'main-2', toNode: 'branch2-0', fromSide: 'right' as const, toSide: 'left' as const },
        { id: 'branch2-1', fromNode: 'branch2-0', toNode: 'branch2-1', fromSide: 'bottom' as const, toSide: 'top' as const },
        { id: 'branch2-2', fromNode: 'branch2-1', toNode: 'branch2-2', fromSide: 'bottom' as const, toSide: 'top' as const },
        // Merge edges
        { id: 'to-merge', fromNode: 'main-5', toNode: 'final-0', fromSide: 'right' as const, toSide: 'left' as const },
        { id: 'branch1-merge', fromNode: 'branch1-2', toNode: 'final-0', fromSide: 'bottom' as const, toSide: 'left' as const },
        { id: 'branch2-merge', fromNode: 'branch2-2', toNode: 'final-0', fromSide: 'bottom' as const, toSide: 'right' as const },
        { id: 'final-1', fromNode: 'final-0', toNode: 'final-1', fromSide: 'bottom' as const, toSide: 'top' as const },
        { id: 'final-2', fromNode: 'final-1', toNode: 'final-2', fromSide: 'bottom' as const, toSide: 'top' as const },
      ],
    };

    const totalNodes = canvas.nodes.length;

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Dense Workflow: {totalNodes} Nodes
        </h1>
        <p style={{
          marginBottom: '24px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
          maxWidth: '1000px',
        }}>
          Complex branching workflow with {totalNodes} nodes using 200×90 dimensions and 16px font.
          This tests how the balanced aspect ratio handles a realistic, dense workflow with multiple branches.
        </p>

        <div style={{
          marginBottom: '24px',
          padding: '20px',
          backgroundColor: theme.colors.surface,
          borderRadius: '8px',
          border: `2px solid ${theme.colors.primary}`,
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
          }}>
            <div>
              <div style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}>Total Nodes</div>
              <div style={{ fontSize: theme.fontSizes[4], fontFamily: theme.fonts.monospace, color: theme.colors.text }}>
                {totalNodes}
              </div>
            </div>
            <div>
              <div style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}>Node Size</div>
              <div style={{ fontSize: theme.fontSizes[4], fontFamily: theme.fonts.monospace, color: theme.colors.text }}>
                200×90
              </div>
            </div>
            <div>
              <div style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}>Font Size</div>
              <div style={{ fontSize: theme.fontSizes[4], fontFamily: theme.fonts.monospace, color: theme.colors.text }}>
                16px
              </div>
            </div>
            <div>
              <div style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}>Branches</div>
              <div style={{ fontSize: theme.fontSizes[4], fontFamily: theme.fonts.monospace, color: theme.colors.text }}>
                3
              </div>
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: theme.colors.background,
          border: `2px solid ${theme.colors.border}`,
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          <ThemeProvider theme={theme16px}>
            <GraphRenderer
              canvas={canvas}
              height={1600}
              width="100%"
            />
          </ThemeProvider>
        </div>

        <div style={{
          marginTop: '32px',
          padding: '20px',
          backgroundColor: theme.colors.surface,
          borderRadius: '8px',
        }}>
          <h3 style={{
            marginBottom: '12px',
            fontSize: theme.fontSizes[3],
            color: theme.colors.text,
          }}>
            Benefits of 200×90 with 16px Font
          </h3>
          <ul style={{
            fontSize: theme.fontSizes[1],
            color: theme.colors.textSecondary,
            lineHeight: 1.8,
            paddingLeft: '20px',
          }}>
            <li>Balanced aspect ratio (2.22:1) - wider than traditional but not extreme</li>
            <li>Generous vertical spacing accommodates 16px font comfortably</li>
            <li>10% less vertical space than current 200×100 while improving readability</li>
            <li>16px font remains highly readable even with many nodes</li>
            <li>Streamlined appearance reduces visual clutter</li>
            <li>Better use of modern widescreen displays</li>
          </ul>
        </div>
      </div>
    );
  },
};
