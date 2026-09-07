import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import type { Theme } from '@principal-ade/industry-theme';

const meta = {
  title: 'OTEL/EventNameDisplay',
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
 * Shows event names appearing under display names when they differ
 */
export const EventNameUnderDisplayName: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const canvas: ExtendedCanvas = {
      nodes: [
        // Node where display name matches event name (no sub-text shown)
        {
          id: 'matching-name',
          type: 'text',
          x: 100,
          y: 100,
          width: 200,
          height: 90,
          text: 'analysis.started',
          color: '#22c55e',
          pv: {
            name: 'analysis.started',
            shape: 'roundedRect',
            event: {
              name: 'analysis.started',
              attributes: {
                'repository.path': {
                  type: 'string',
                  required: true,
                },
              },
            },
            otel: {
              kind: 'event',
              category: 'lifecycle',
            },
          },
        },
        // Node where display name differs from event name (shows both)
        {
          id: 'different-name-1',
          type: 'text',
          x: 350,
          y: 100,
          width: 200,
          height: 90,
          text: 'Analysis Started',
          color: '#22c55e',
          pv: {
            name: 'Analysis Started',
            shape: 'roundedRect',
            event: {
              name: 'analysis.started',
              attributes: {
                'repository.path': {
                  type: 'string',
                  required: true,
                },
              },
            },
            otel: {
              kind: 'event',
              category: 'lifecycle',
            },
          },
        },
        // Another example
        {
          id: 'different-name-2',
          type: 'text',
          x: 600,
          y: 100,
          width: 200,
          height: 90,
          text: 'File Parsed',
          color: '#3b82f6',
          pv: {
            name: 'File Parsed',
            shape: 'roundedRect',
            event: {
              name: 'file.parsed',
              attributes: {
                'file.path': {
                  type: 'string',
                  required: true,
                },
              },
            },
            otel: {
              kind: 'event',
              category: 'operation',
            },
          },
        },
        // Node with no event (no sub-text)
        {
          id: 'no-event',
          type: 'text',
          x: 850,
          y: 100,
          width: 200,
          height: 90,
          text: 'Regular Node',
          color: '#6b7280',
          pv: {
            name: 'Regular Node',
            shape: 'roundedRect',
          },
        },
      ],
      edges: [],
    };

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Event Name Display Feature
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
          maxWidth: '1000px',
        }}>
          When a node has both a display name and an event name, and they differ, the event name
          is shown underneath in smaller text (75% size, monospace, 50% opacity).
        </p>

        <div style={{
          marginBottom: '24px',
          padding: '20px',
          backgroundColor: theme.colors.surface,
          borderRadius: '8px',
          border: `1px solid ${theme.colors.border}`,
        }}>
          <h3 style={{
            marginBottom: '12px',
            fontSize: theme.fontSizes[3],
            color: theme.colors.text,
          }}>
            How it Works
          </h3>
          <div style={{
            fontSize: theme.fontSizes[1],
            color: theme.colors.textSecondary,
            lineHeight: 1.8,
          }}>
            <div style={{ marginBottom: '12px' }}>
              <strong>Node 1:</strong> name = "analysis.started", event.name = "analysis.started"
              <br />
              → Shows only: <code style={{
                fontFamily: theme.fonts.monospace,
                backgroundColor: theme.colors.backgroundSecondary,
                padding: '2px 6px',
                borderRadius: '4px',
              }}>analysis.started</code>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>Node 2:</strong> name = "Analysis Started", event.name = "analysis.started"
              <br />
              → Shows: <code style={{
                fontFamily: theme.fonts.monospace,
                backgroundColor: theme.colors.backgroundSecondary,
                padding: '2px 6px',
                borderRadius: '4px',
              }}>Analysis Started</code> (main) + <code style={{
                fontFamily: theme.fonts.monospace,
                backgroundColor: theme.colors.backgroundSecondary,
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: theme.fontSizes[0],
                opacity: 0.6,
              }}>analysis.started</code> (sub)
            </div>
            <div>
              <strong>Node 4:</strong> name = "Regular Node", no event
              <br />
              → Shows only: <code style={{
                fontFamily: theme.fonts.monospace,
                backgroundColor: theme.colors.backgroundSecondary,
                padding: '2px 6px',
                borderRadius: '4px',
              }}>Regular Node</code>
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: theme.colors.background,
          border: `2px solid ${theme.colors.border}`,
          borderRadius: '8px',
          overflow: 'hidden',
          padding: '40px',
        }}>
          <ThemeProvider theme={theme16px}>
            <GraphRenderer
              canvas={canvas}
              height={300}
              width="100%"
            />
          </ThemeProvider>
        </div>
      </div>
    );
  },
};

/**
 * Real validation workflow showing mixed display and event names
 */
export const ValidationWorkflowWithEventNames: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node-1',
          type: 'text',
          x: 100,
          y: 80,
          width: 200,
          height: 90,
          text: 'Analysis Started',
          color: '#22c55e',
          pv: {
            name: 'Analysis Started',
            shape: 'roundedRect',
            event: {
              name: 'analysis.started',
              attributes: {},
            },
            otel: { kind: 'event', category: 'lifecycle' },
          },
        },
        {
          id: 'node-2',
          type: 'text',
          x: 100,
          y: 220,
          width: 200,
          height: 90,
          text: 'FileTree Built',
          color: '#3b82f6',
          pv: {
            name: 'FileTree Built',
            shape: 'roundedRect',
            event: {
              name: 'filetree.built',
              attributes: {},
            },
            otel: { kind: 'event', category: 'operation' },
          },
        },
        {
          id: 'node-3',
          type: 'text',
          x: 100,
          y: 360,
          width: 200,
          height: 90,
          text: 'Packages Discovered',
          color: '#f59e0b',
          pv: {
            name: 'Packages Discovered',
            shape: 'roundedRect',
            event: {
              name: 'packages.discovered',
              attributes: {},
            },
            otel: { kind: 'event', category: 'operation' },
          },
        },
        {
          id: 'node-4',
          type: 'text',
          x: 100,
          y: 500,
          width: 200,
          height: 90,
          text: 'Canvases Discovered',
          color: '#8b5cf6',
          pv: {
            name: 'Canvases Discovered',
            shape: 'roundedRect',
            event: {
              name: 'canvases.discovered',
              attributes: {},
            },
            otel: { kind: 'event', category: 'operation' },
          },
        },
        {
          id: 'node-5',
          type: 'text',
          x: 100,
          y: 640,
          width: 200,
          height: 90,
          text: 'Discovery Complete',
          color: '#f59e0b',
          pv: {
            name: 'Discovery Complete',
            shape: 'roundedRect',
            event: {
              name: 'discovery.complete',
              attributes: {},
            },
            otel: { kind: 'event', category: 'operation' },
          },
        },
        {
          id: 'node-6',
          type: 'text',
          x: 100,
          y: 780,
          width: 200,
          height: 90,
          text: 'Validation Started',
          color: '#22c55e',
          pv: {
            name: 'Validation Started',
            shape: 'roundedRect',
            event: {
              name: 'validation.started',
              attributes: {},
            },
            otel: { kind: 'event', category: 'lifecycle' },
          },
        },
        {
          id: 'node-7',
          type: 'text',
          x: 100,
          y: 920,
          width: 200,
          height: 90,
          text: 'Canvas Validated',
          color: '#8b5cf6',
          pv: {
            name: 'Canvas Validated',
            shape: 'roundedRect',
            event: {
              name: 'canvas.validated',
              attributes: {},
            },
            otel: { kind: 'event', category: 'operation' },
          },
        },
        {
          id: 'node-8',
          type: 'text',
          x: 100,
          y: 1060,
          width: 200,
          height: 90,
          text: 'Validation Complete',
          color: '#22c55e',
          pv: {
            name: 'Validation Complete',
            shape: 'roundedRect',
            event: {
              name: 'validation.complete',
              attributes: {},
            },
            otel: { kind: 'event', category: 'lifecycle' },
          },
        },
      ],
      edges: Array.from({ length: 7 }, (_, i) => ({
        id: `edge-${i}`,
        fromNode: `node-${i + 1}`,
        toNode: `node-${i + 2}`,
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
          Validation Workflow with Event Names
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
          maxWidth: '1000px',
        }}>
          Real validation workflow showing human-readable display names with machine-readable event names underneath.
          This combines the best of both worlds: clear labels for humans, technical identifiers for machines.
        </p>

        <div style={{
          marginBottom: '24px',
          padding: '20px',
          backgroundColor: theme.colors.surface,
          borderRadius: '8px',
          border: `2px solid ${theme.colors.primary}`,
        }}>
          <h3 style={{
            marginBottom: '12px',
            fontSize: theme.fontSizes[3],
            color: theme.colors.text,
          }}>
            Design Pattern
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px',
            fontSize: theme.fontSizes[1],
            lineHeight: 1.8,
          }}>
            <div>
              <strong style={{ color: theme.colors.primary }}>Display Name (Top)</strong>
              <ul style={{ paddingLeft: '20px', marginTop: '8px', color: theme.colors.text }}>
                <li>Human-readable</li>
                <li>Title Case formatting</li>
                <li>Clear and descriptive</li>
                <li>Main font size (16px)</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: theme.colors.primary }}>Event Name (Bottom)</strong>
              <ul style={{ paddingLeft: '20px', marginTop: '8px', color: theme.colors.text }}>
                <li>Machine-readable</li>
                <li>kebab-case formatting</li>
                <li>Technical identifier</li>
                <li>Smaller font (12px, 50% opacity)</li>
              </ul>
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
              height={1300}
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
            Benefits
          </h3>
          <ul style={{
            fontSize: theme.fontSizes[1],
            color: theme.colors.textSecondary,
            lineHeight: 1.8,
            paddingLeft: '20px',
          }}>
            <li><strong>Clarity:</strong> Users see friendly names like "Analysis Started"</li>
            <li><strong>Traceability:</strong> Technical event names visible for debugging</li>
            <li><strong>Documentation:</strong> Event schema is self-documenting in the visual</li>
            <li><strong>Flexibility:</strong> Can use different naming conventions for each audience</li>
            <li><strong>Consistency:</strong> Event names match OTEL telemetry data exactly</li>
          </ul>
        </div>
      </div>
    );
  },
};

/**
 * Comparison: Backlog.md style (technical names) vs validation.otel.canvas style (friendly names)
 */
export const NamingStyleComparison: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const events = [
      { display: 'Task Created', event: 'task.create.started' },
      { display: 'File Validated', event: 'task.create.validated' },
      { display: 'Task Saved', event: 'task.create.saved' },
      { display: 'Git Committed', event: 'task.create.committed' },
    ];

    return (
      <div style={{ padding: '32px' }}>
        <h1 style={{
          marginBottom: '16px',
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Naming Style Comparison
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
          maxWidth: '1000px',
        }}>
          Comparing Backlog.md style (technical event names as display) vs validation.otel.canvas style
          (friendly display names with event names shown below).
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '32px',
        }}>
          {/* Backlog.md style */}
          <div>
            <h3 style={{
              marginBottom: '16px',
              fontSize: theme.fontSizes[3],
              color: theme.colors.text,
            }}>
              Backlog.md Style
            </h3>
            <p style={{
              marginBottom: '16px',
              fontSize: theme.fontSizes[1],
              color: theme.colors.textSecondary,
            }}>
              Display name = event name (technical, no sub-text)
            </p>
            <div style={{
              backgroundColor: theme.colors.background,
              border: `2px solid ${theme.colors.border}`,
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <ThemeProvider theme={theme16px}>
                <GraphRenderer
                  canvas={{
                    nodes: events.map((evt, idx) => ({
                      id: `backlog-${idx}`,
                      type: 'text',
                      x: 100,
                      y: 80 + idx * 140,
                      width: 200,
                      height: 90,
                      text: evt.event,
                      color: '#3b82f6',
                      pv: {
                        name: evt.event,
                        shape: 'roundedRect',
                        event: {
                          name: evt.event,
                          attributes: {},
                        },
                      },
                    })),
                    edges: Array.from({ length: events.length - 1 }, (_, i) => ({
                      id: `edge-backlog-${i}`,
                      fromNode: `backlog-${i}`,
                      toNode: `backlog-${i + 1}`,
                      fromSide: 'bottom' as const,
                      toSide: 'top' as const,
                    })),
                  }}
                  height={700}
                  width="100%"
                />
              </ThemeProvider>
            </div>
            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: theme.colors.surface,
              borderRadius: '6px',
              fontSize: theme.fontSizes[1],
              color: theme.colors.textSecondary,
            }}>
              <strong>Best for:</strong> Developer-focused workflows, technical documentation
            </div>
          </div>

          {/* validation.otel.canvas style */}
          <div>
            <h3 style={{
              marginBottom: '16px',
              fontSize: theme.fontSizes[3],
              color: theme.colors.text,
            }}>
              Validation.otel.canvas Style
            </h3>
            <p style={{
              marginBottom: '16px',
              fontSize: theme.fontSizes[1],
              color: theme.colors.textSecondary,
            }}>
              Friendly display name + event name shown below
            </p>
            <div style={{
              backgroundColor: theme.colors.background,
              border: `2px solid ${theme.colors.primary}`,
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <ThemeProvider theme={theme16px}>
                <GraphRenderer
                  canvas={{
                    nodes: events.map((evt, idx) => ({
                      id: `validation-${idx}`,
                      type: 'text',
                      x: 100,
                      y: 80 + idx * 140,
                      width: 200,
                      height: 90,
                      text: evt.display,
                      color: '#3b82f6',
                      pv: {
                        name: evt.display,
                        shape: 'roundedRect',
                        event: {
                          name: evt.event,
                          attributes: {},
                        },
                      },
                    })),
                    edges: Array.from({ length: events.length - 1 }, (_, i) => ({
                      id: `edge-validation-${i}`,
                      fromNode: `validation-${i}`,
                      toNode: `validation-${i + 1}`,
                      fromSide: 'bottom' as const,
                      toSide: 'top' as const,
                    })),
                  }}
                  height={700}
                  width="100%"
                />
              </ThemeProvider>
            </div>
            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: theme.colors.surface,
              borderRadius: '6px',
              fontSize: theme.fontSizes[1],
              color: theme.colors.text,
              border: `2px solid ${theme.colors.primary}`,
            }}>
              <strong>Best for:</strong> User-facing documentation, presentations, broader audiences
            </div>
          </div>
        </div>
      </div>
    );
  },
};
