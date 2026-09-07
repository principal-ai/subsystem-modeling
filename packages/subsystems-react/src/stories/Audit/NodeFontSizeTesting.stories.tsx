import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import type { Theme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Audit/NodeFontSizeTesting',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof GraphRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Create custom themes with different font sizes
 */
const createThemeWithFontSize = (baseFontSize: number): Theme => ({
  ...defaultEditorTheme,
  fontSizes: [baseFontSize, baseFontSize + 2, baseFontSize + 4, baseFontSize + 6, baseFontSize + 8, baseFontSize + 12, baseFontSize + 20, baseFontSize + 36, baseFontSize + 52, baseFontSize + 84],
});

const TEXT_SAMPLES = {
  veryShort: 'Init',
  short: 'File Parsed',
  medium: 'Validation Started',
  long: 'Canvas Validated Successfully',
  veryLong: 'Complete Validation Process',
};

const DIMENSIONS = {
  compact: { width: 160, height: 80 },
  standard: { width: 200, height: 100 },
  wide: { width: 240, height: 100 },
  tall: { width: 200, height: 120 },
  large: { width: 240, height: 120 },
};

/**
 * Font size comparison grid - same dimensions, different font sizes
 */
export const FontSizeGrid: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const fontSizes = [
      { label: '10px', size: 10 },
      { label: '12px (current)', size: 12 },
      { label: '14px', size: 14 },
      { label: '16px', size: 16 },
      { label: '18px', size: 18 },
    ];

    const textSamples = [
      { label: 'Very Short', text: TEXT_SAMPLES.veryShort },
      { label: 'Short', text: TEXT_SAMPLES.short },
      { label: 'Medium', text: TEXT_SAMPLES.medium },
      { label: 'Long', text: TEXT_SAMPLES.long },
      { label: 'Very Long', text: TEXT_SAMPLES.veryLong },
    ];

    return (
      <div style={{ padding: '32px', fontFamily: theme.fonts.body }}>
        <h1 style={{
          marginBottom: '16px',
          fontFamily: theme.fonts.heading,
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Font Size Impact on Readability
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
          maxWidth: '1000px',
        }}>
          Testing font sizes from 10px to 18px with various text lengths. All nodes are 200×100 (standard size), no icons.
        </p>

        {/* Column headers */}
        <div style={{
          marginBottom: '16px',
          paddingLeft: '180px',
          display: 'flex',
          gap: '40px',
        }}>
          {fontSizes.map(fs => (
            <div
              key={fs.size}
              style={{
                width: 200,
                textAlign: 'center',
                fontSize: theme.fontSizes[1],
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.textSecondary,
                fontFamily: theme.fonts.monospace,
              }}
            >
              {fs.label}
            </div>
          ))}
        </div>

        {/* Rows */}
        {textSamples.map((sample, rowIdx) => (
          <div key={rowIdx} style={{ marginBottom: '32px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
            }}>
              {/* Row label */}
              <div style={{
                width: '180px',
                paddingTop: '40px',
                paddingRight: '20px',
              }}>
                <div style={{
                  fontSize: theme.fontSizes[1],
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.textSecondary,
                  marginBottom: '4px',
                }}>
                  {sample.label}
                </div>
                <div style={{
                  fontSize: theme.fontSizes[0],
                  fontFamily: theme.fonts.monospace,
                  color: theme.colors.textMuted,
                }}>
                  "{sample.text}"
                </div>
              </div>

              {/* Font size variations */}
              <div style={{ display: 'flex', gap: '40px' }}>
                {fontSizes.map(fs => {
                  const customTheme = createThemeWithFontSize(fs.size);
                  const canvas: ExtendedCanvas = {
                    nodes: [{
                      id: `${rowIdx}-${fs.size}`,
                      type: 'text',
                      x: 50,
                      y: 50,
                      width: 200,
                      height: 100,
                      text: sample.text,
                      color: '#3b82f6',
                      pv: {
                        name: sample.text,
                        shape: 'roundedRect',
                        // NO icon
                      },
                    }],
                    edges: [],
                  };

                  return (
                    <div
                      key={fs.size}
                      style={{
                        backgroundColor: theme.colors.background,
                        border: `2px solid ${theme.colors.border}`,
                        borderRadius: '6px',
                        overflow: 'hidden',
                      }}
                    >
                      <ThemeProvider theme={customTheme}>
                        <GraphRenderer
                          canvas={canvas}
                          height={200}
                          width={300}
                        />
                      </ThemeProvider>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        <div style={{
          marginTop: '40px',
          padding: '24px',
          backgroundColor: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '8px',
        }}>
          <h3 style={{
            marginBottom: '12px',
            fontSize: theme.fontSizes[3],
            color: theme.colors.text,
          }}>
            Observations
          </h3>
          <ul style={{
            fontSize: theme.fontSizes[1],
            color: theme.colors.textSecondary,
            lineHeight: 1.8,
            paddingLeft: '20px',
          }}>
            <li><strong>10px:</strong> Very compact, may be hard to read at a glance</li>
            <li><strong>12px (current):</strong> Good balance for dense workflows</li>
            <li><strong>14px:</strong> More readable, slightly more space needed</li>
            <li><strong>16px:</strong> Very readable, but may feel cramped in standard dimensions</li>
            <li><strong>18px:</strong> Maximum readability, requires larger node dimensions</li>
          </ul>
        </div>
      </div>
    );
  },
};

/**
 * Dimension variations with different font sizes
 */
export const DimensionsVsFontSize: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const testCases = [
      {
        title: 'Compact Nodes (160×80)',
        dimensions: DIMENSIONS.compact,
        bestFontSizes: [10, 12],
      },
      {
        title: 'Standard Nodes (200×100) - Current',
        dimensions: DIMENSIONS.standard,
        bestFontSizes: [12, 14],
      },
      {
        title: 'Wide Nodes (240×100)',
        dimensions: DIMENSIONS.wide,
        bestFontSizes: [12, 14, 16],
      },
      {
        title: 'Tall Nodes (200×120)',
        dimensions: DIMENSIONS.tall,
        bestFontSizes: [12, 14, 16],
      },
      {
        title: 'Large Nodes (240×120)',
        dimensions: DIMENSIONS.large,
        bestFontSizes: [14, 16, 18],
      },
    ];

    const sampleText = 'Validation Started';

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Optimal Font Size for Each Dimension
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
        }}>
          Finding the best font sizes for different node dimensions. Text: "{sampleText}"
        </p>

        {testCases.map((testCase, idx) => (
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
              <h3 style={{
                fontSize: theme.fontSizes[3],
                color: theme.colors.text,
              }}>
                {testCase.title}
              </h3>
              <div style={{
                fontSize: theme.fontSizes[1],
                fontFamily: theme.fonts.monospace,
                color: theme.colors.textMuted,
              }}>
                Recommended: {testCase.bestFontSizes.join('px, ')}px
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: '24px',
              flexWrap: 'wrap',
            }}>
              {[10, 12, 14, 16, 18].map(fontSize => {
                const customTheme = createThemeWithFontSize(fontSize);
                const isRecommended = testCase.bestFontSizes.includes(fontSize);
                const canvas: ExtendedCanvas = {
                  nodes: [{
                    id: `${idx}-${fontSize}`,
                    type: 'text',
                    x: 50,
                    y: 50,
                    width: testCase.dimensions.width,
                    height: testCase.dimensions.height,
                    text: sampleText,
                    color: '#3b82f6',
                    pv: {
                      name: sampleText,
                      shape: 'roundedRect',
                    },
                  }],
                  edges: [],
                };

                return (
                  <div key={fontSize} style={{ position: 'relative' }}>
                    {isRecommended && (
                      <div style={{
                        position: 'absolute',
                        top: -10,
                        right: -10,
                        backgroundColor: theme.colors.success,
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: theme.fontSizes[0],
                        fontWeight: theme.fontWeights.bold,
                        zIndex: 10,
                      }}>
                        ✓
                      </div>
                    )}
                    <div style={{
                      marginBottom: '8px',
                      fontSize: theme.fontSizes[1],
                      fontFamily: theme.fonts.monospace,
                      color: isRecommended ? theme.colors.success : theme.colors.textMuted,
                      fontWeight: isRecommended ? theme.fontWeights.semibold : theme.fontWeights.normal,
                    }}>
                      {fontSize}px
                    </div>
                    <div style={{
                      backgroundColor: theme.colors.background,
                      border: `2px solid ${isRecommended ? theme.colors.success : theme.colors.border}`,
                      borderRadius: '6px',
                      overflow: 'hidden',
                    }}>
                      <ThemeProvider theme={customTheme}>
                        <GraphRenderer
                          canvas={canvas}
                          height={testCase.dimensions.height + 100}
                          width={testCase.dimensions.width + 100}
                        />
                      </ThemeProvider>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  },
};

/**
 * Real workflow with different font sizes
 */
export const WorkflowFontComparison: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const fontSizes = [
      { label: '12px (Current)', size: 12 },
      { label: '14px (Larger)', size: 14 },
      { label: '16px (Maximum)', size: 16 },
    ];

    const events = [
      { name: 'Analysis Started', color: '#22c55e' },
      { name: 'File Parsed', color: '#3b82f6' },
      { name: 'Type Detected', color: '#f59e0b' },
      { name: 'Canvas Validated', color: '#8b5cf6' },
      { name: 'Results Aggregated', color: '#f59e0b' },
      { name: 'Validation Complete', color: '#22c55e' },
    ];

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Workflow Font Size Comparison
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
        }}>
          Same validation workflow with different font sizes. All nodes are 200×100, no icons.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '32px',
        }}>
          {fontSizes.map(fs => {
            const customTheme = createThemeWithFontSize(fs.size);
            const canvas: ExtendedCanvas = {
              nodes: events.map((event, idx) => ({
                id: `${fs.size}-${idx}`,
                type: 'text',
                x: 100,
                y: 80 + idx * 150,
                width: 200,
                height: 100,
                text: event.name,
                color: event.color,
                pv: {
                  name: event.name,
                  shape: 'roundedRect',
                  otel: {
                    kind: 'event',
                    category: idx === 0 || idx === 5 ? 'lifecycle' : 'operation',
                  },
                },
              })),
              edges: events.slice(0, -1).map((_, idx) => ({
                id: `edge-${fs.size}-${idx}`,
                fromNode: `${fs.size}-${idx}`,
                toNode: `${fs.size}-${idx + 1}`,
                fromSide: 'bottom' as const,
                toSide: 'top' as const,
              })),
            };

            return (
              <div key={fs.size}>
                <h3 style={{
                  fontSize: theme.fontSizes[3],
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.text,
                  marginBottom: '12px',
                }}>
                  {fs.label}
                </h3>
                <div style={{
                  backgroundColor: theme.colors.background,
                  border: `2px solid ${theme.colors.border}`,
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  <ThemeProvider theme={customTheme}>
                    <GraphRenderer
                      canvas={canvas}
                      height={1000}
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
            Font Size Recommendations
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
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ color: theme.colors.primary }}>12px (Current Default)</strong>
                <div style={{ paddingLeft: '20px', color: theme.colors.textSecondary }}>
                  • Best for dense workflows with many nodes<br/>
                  • Maximizes canvas space efficiency<br/>
                  • Good for technical/developer audiences<br/>
                  • Requires good screen resolution
                </div>
              </div>
            </div>
            <div>
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ color: theme.colors.primary }}>14px (Balanced)</strong>
                <div style={{ paddingLeft: '20px', color: theme.colors.textSecondary }}>
                  • Improved readability without major space cost<br/>
                  • Good for presentations and documentation<br/>
                  • Works well on various screen sizes<br/>
                  • Sweet spot for most use cases
                </div>
              </div>
            </div>
            <div>
              <div>
                <strong style={{ color: theme.colors.primary }}>16px (Maximum Readability)</strong>
                <div style={{ paddingLeft: '20px', color: theme.colors.textSecondary }}>
                  • Maximum readability and accessibility<br/>
                  • Best for presentations and demos<br/>
                  • Requires larger node dimensions<br/>
                  • May need wider canvas (240×120)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Side-by-side: Font size vs Node dimension matrix
 */
export const FontSizeDimensionMatrix: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const dimensions = [
      { label: '160×80', ...DIMENSIONS.compact },
      { label: '200×100', ...DIMENSIONS.standard },
      { label: '240×120', ...DIMENSIONS.large },
    ];

    const fontSizes = [
      { label: '12px', size: 12 },
      { label: '14px', size: 14 },
      { label: '16px', size: 16 },
    ];

    const sampleTexts = [
      'File Parsed',
      'Validation Started',
      'Canvas Validated',
    ];

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Font Size × Dimension Matrix
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
        }}>
          Complete matrix showing all combinations of font sizes and node dimensions. No icons.
        </p>

        {/* Column headers */}
        <div style={{
          marginBottom: '16px',
          paddingLeft: '140px',
          display: 'flex',
          gap: '60px',
        }}>
          {dimensions.map(dim => (
            <div
              key={dim.label}
              style={{
                width: dim.width + 100,
                textAlign: 'center',
                fontSize: theme.fontSizes[1],
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.textSecondary,
                fontFamily: theme.fonts.monospace,
              }}
            >
              {dim.label}
            </div>
          ))}
        </div>

        {/* Rows by font size */}
        {fontSizes.map(fs => (
          <div key={fs.size} style={{ marginBottom: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              {/* Font size label */}
              <div style={{
                width: '140px',
                paddingTop: '100px',
                paddingRight: '20px',
              }}>
                <div style={{
                  fontSize: theme.fontSizes[2],
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.text,
                  fontFamily: theme.fonts.monospace,
                }}>
                  {fs.label}
                </div>
              </div>

              {/* Dimension variations */}
              <div style={{ display: 'flex', gap: '60px' }}>
                {dimensions.map(dim => {
                  const customTheme = createThemeWithFontSize(fs.size);
                  const canvas: ExtendedCanvas = {
                    nodes: sampleTexts.map((text, idx) => ({
                      id: `${fs.size}-${dim.label}-${idx}`,
                      type: 'text',
                      x: 50,
                      y: 50 + idx * (dim.height + 20),
                      width: dim.width,
                      height: dim.height,
                      text,
                      color: '#3b82f6',
                      pv: {
                        name: text,
                        shape: 'roundedRect',
                      },
                    })),
                    edges: [],
                  };

                  return (
                    <div
                      key={dim.label}
                      style={{
                        backgroundColor: theme.colors.background,
                        border: `2px solid ${theme.colors.border}`,
                        borderRadius: '6px',
                        overflow: 'hidden',
                      }}
                    >
                      <ThemeProvider theme={customTheme}>
                        <GraphRenderer
                          canvas={canvas}
                          height={450}
                          width={dim.width + 100}
                        />
                      </ThemeProvider>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        <div style={{
          marginTop: '40px',
          padding: '24px',
          backgroundColor: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '8px',
        }}>
          <h3 style={{
            marginBottom: '16px',
            fontSize: theme.fontSizes[3],
            color: theme.colors.text,
          }}>
            Best Combinations
          </h3>
          <div style={{
            fontSize: theme.fontSizes[1],
            color: theme.colors.text,
            lineHeight: 1.8,
          }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>160×80:</strong> <span style={{ color: theme.colors.success }}>12px</span> (compact workflows)
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>200×100:</strong> <span style={{ color: theme.colors.success }}>12px, 14px</span> (standard, versatile)
            </div>
            <div>
              <strong>240×120:</strong> <span style={{ color: theme.colors.success }}>14px, 16px</span> (large, readable)
            </div>
          </div>
        </div>
      </div>
    );
  },
};
