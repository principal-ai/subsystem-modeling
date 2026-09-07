import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'OTEL/EventNameFallback',
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
 * Shows that pv.event.name is NOT used for display name fallback
 */
export const EventNameIgnored: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const scenarios = [
      {
        title: "Standard OTEL Node (pv.name + event.name)",
        description: "Both pv.name and event.name present - pv.name is used for display",
        node: {
          id: "standard-event",
          type: "text",
          text: "Validation Started",
          x: 150,
          y: 100,
          width: 220,
          height: 100,
          color: "#4CAF50",
          pv: {
            name: "Validation Started",  // ← USED for display
            shape: "roundedRect",
            icon: "Play",
            otel: {
              kind: "event",
              category: "lifecycle"
            },
            event: {
              name: "validation.started",  // ← NOT used for display (metadata only)
              attributes: {
                "validation.type": {
                  type: "string",
                  required: true
                }
              }
            }
          }
        },
        displays: "Validation Started",
        eventName: "validation.started",
        fallbackChain: "pv.name → ✅ 'Validation Started'"
      },
      {
        title: "Missing pv.name, has text and event",
        description: "pv.name missing - falls back to text field, NOT event.name",
        node: {
          id: "missing-pv-name",
          type: "text",
          text: "File Parsed",
          x: 150,
          y: 100,
          width: 220,
          height: 100,
          color: "#2196F3",
          pv: {
            // NO pv.name here!
            shape: "roundedRect",
            icon: "FileJson",
            otel: {
              kind: "event",
              category: "operation"
            },
            event: {
              name: "file.parsed",  // ← Still NOT used
              attributes: {
                "file.path": {
                  type: "string",
                  required: true
                }
              }
            }
          }
        },
        displays: "File Parsed",
        eventName: "file.parsed",
        fallbackChain: "pv.name ❌ → text ✅ 'File Parsed'"
      },
      {
        title: "Missing pv.name AND text, has event",
        description: "Both pv.name and text missing - uses 'Text' fallback, NOT event.name",
        node: {
          id: "no-name-or-text",
          type: "text",
          x: 150,
          y: 100,
          width: 220,
          height: 100,
          color: "#FF9800",
          pv: {
            // NO pv.name
            // NO text at root level either
            shape: "roundedRect",
            icon: "AlertCircle",
            otel: {
              kind: "event",
              category: "error"
            },
            event: {
              name: "error.occurred",  // ← STILL not used!
              attributes: {
                "error.type": {
                  type: "string",
                  required: true
                }
              }
            }
          }
        },
        displays: "Text",
        eventName: "error.occurred",
        fallbackChain: "pv.name ❌ → text ❌ → 'Text' ✅"
      },
      {
        title: "Event name could be good display name",
        description: "Even when event.name would make a better display name, it's ignored",
        node: {
          id: "event-name-better",
          type: "text",
          text: "xyz",  // Bad display name
          x: 150,
          y: 100,
          width: 220,
          height: 100,
          color: "#9C27B0",
          pv: {
            // NO pv.name
            shape: "roundedRect",
            icon: "Database",
            event: {
              name: "database.connected",  // ← Would be better, but ignored
              attributes: {}
            }
          }
        },
        displays: "xyz",
        eventName: "database.connected",
        fallbackChain: "pv.name ❌ → text ✅ 'xyz' (even though event.name is better)"
      }
    ];

    return (
      <div style={{ padding: '32px', fontFamily: theme.fonts.body }}>
        <h1 style={{
          marginBottom: '16px',
          fontFamily: theme.fonts.heading,
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Event Names Are NOT Used for Display
        </h1>

        <div style={{
          marginBottom: '32px',
          padding: '20px',
          backgroundColor: theme.colors.backgroundSecondary,
          border: `3px solid ${theme.colors.error}`,
          borderRadius: '8px',
        }}>
          <h2 style={{
            marginBottom: '12px',
            fontSize: theme.fontSizes[4],
            color: theme.colors.error,
          }}>
            ⚠️ Important: pv.event.name is Metadata Only
          </h2>
          <p style={{
            fontSize: theme.fontSizes[2],
            color: theme.colors.text,
            lineHeight: 1.6,
          }}>
            The <code style={{
              backgroundColor: theme.colors.background,
              padding: '2px 6px',
              borderRadius: '4px',
              fontFamily: theme.fonts.monospace,
            }}>pv.event.name</code> field (e.g., "analysis.started", "file.parsed") is
            <strong> NOT part of the display name fallback chain</strong>. It's stored as metadata
            but never shown on the node.
          </p>
          <p style={{
            marginTop: '12px',
            fontSize: theme.fontSizes[1],
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.monospace,
          }}>
            Fallback chain: pv.name → text (first line) → "Text" → node.id
          </p>
        </div>

        {scenarios.map((scenario, idx) => (
          <div
            key={idx}
            style={{
              marginBottom: '32px',
              padding: '24px',
              backgroundColor: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '8px',
            }}
          >
            <h3 style={{
              marginBottom: '8px',
              fontSize: theme.fontSizes[3],
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.text,
            }}>
              Scenario {idx + 1}: {scenario.title}
            </h3>
            <p style={{
              marginBottom: '16px',
              fontSize: theme.fontSizes[1],
              color: theme.colors.textSecondary,
              fontStyle: 'italic',
            }}>
              {scenario.description}
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 300px 1fr',
              gap: '24px',
              alignItems: 'start',
            }}>
              {/* Left: JSON */}
              <div>
                <div style={{
                  marginBottom: '8px',
                  fontSize: theme.fontSizes[1],
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.textSecondary,
                }}>
                  Node Definition
                </div>
                <pre style={{
                  backgroundColor: theme.colors.background,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: theme.fontSizes[0],
                  fontFamily: theme.fonts.monospace,
                  color: theme.colors.text,
                  overflow: 'auto',
                  maxHeight: '400px',
                  lineHeight: 1.5,
                }}>
                  {JSON.stringify(scenario.node, null, 2)}
                </pre>
              </div>

              {/* Middle: Explanation */}
              <div>
                <div style={{
                  marginBottom: '12px',
                  padding: '12px',
                  backgroundColor: theme.colors.backgroundTertiary,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '6px',
                }}>
                  <div style={{
                    fontSize: theme.fontSizes[0],
                    fontWeight: theme.fontWeights.bold,
                    color: theme.colors.textSecondary,
                    marginBottom: '8px',
                  }}>
                    Event Name (metadata):
                  </div>
                  <div style={{
                    fontSize: theme.fontSizes[1],
                    fontFamily: theme.fonts.monospace,
                    color: theme.colors.textMuted,
                    textDecoration: 'line-through',
                  }}>
                    "{scenario.eventName}"
                  </div>
                  <div style={{
                    marginTop: '4px',
                    fontSize: theme.fontSizes[0],
                    color: theme.colors.error,
                  }}>
                    ↑ NOT used for display
                  </div>
                </div>

                <div style={{
                  padding: '12px',
                  backgroundColor: theme.colors.backgroundSecondary,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '6px',
                  fontSize: theme.fontSizes[0],
                  color: theme.colors.textMuted,
                  lineHeight: 1.6,
                  marginBottom: '12px',
                }}>
                  <strong>Fallback Chain:</strong>
                  <div style={{ marginTop: '8px', fontFamily: theme.fonts.monospace }}>
                    {scenario.fallbackChain}
                  </div>
                </div>

                <div style={{
                  padding: '12px',
                  backgroundColor: theme.colors.backgroundTertiary,
                  border: `2px solid ${theme.colors.success}`,
                  borderRadius: '6px',
                }}>
                  <div style={{
                    fontSize: theme.fontSizes[0],
                    fontWeight: theme.fontWeights.bold,
                    color: theme.colors.success,
                    marginBottom: '4px',
                  }}>
                    Actually Displays:
                  </div>
                  <div style={{
                    fontSize: theme.fontSizes[2],
                    fontFamily: theme.fonts.monospace,
                    color: theme.colors.text,
                  }}>
                    "{scenario.displays}"
                  </div>
                </div>
              </div>

              {/* Right: Rendered */}
              <div>
                <div style={{
                  marginBottom: '8px',
                  fontSize: theme.fontSizes[1],
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.textSecondary,
                }}>
                  Rendered Node
                </div>
                <div style={{
                  backgroundColor: theme.colors.background,
                  border: `2px solid ${theme.colors.border}`,
                  borderRadius: '6px',
                  padding: '24px',
                  height: '250px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <GraphRenderer
                    canvas={{
                      nodes: [scenario.node],
                      edges: [],
                    }}
                    height={250}
                    width="100%"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        <div style={{
          marginTop: '40px',
          padding: '24px',
          backgroundColor: theme.colors.backgroundSecondary,
          border: `2px solid ${theme.colors.primary}`,
          borderRadius: '8px',
        }}>
          <h2 style={{
            marginBottom: '16px',
            fontSize: theme.fontSizes[4],
            color: theme.colors.text,
          }}>
            📌 Summary: Event Name vs Display Name
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px',
          }}>
            <div>
              <h3 style={{
                fontSize: theme.fontSizes[2],
                color: theme.colors.primary,
                marginBottom: '12px',
              }}>
                pv.event.name
              </h3>
              <ul style={{
                fontSize: theme.fontSizes[1],
                color: theme.colors.text,
                lineHeight: 1.8,
                paddingLeft: '20px',
              }}>
                <li>Stored as metadata in node.data</li>
                <li>Used for event tracking/telemetry</li>
                <li>Typically kebab-case (e.g., "file.parsed")</li>
                <li><strong style={{ color: theme.colors.error }}>NOT used for display</strong></li>
              </ul>
            </div>

            <div>
              <h3 style={{
                fontSize: theme.fontSizes[2],
                color: theme.colors.primary,
                marginBottom: '12px',
              }}>
                pv.name (Display Name)
              </h3>
              <ul style={{
                fontSize: theme.fontSizes[1],
                color: theme.colors.text,
                lineHeight: 1.8,
                paddingLeft: '20px',
              }}>
                <li>Used for visual display on the node</li>
                <li>Highest priority in fallback chain</li>
                <li>Human-readable (e.g., "File Parsed")</li>
                <li><strong style={{ color: theme.colors.success }}>This is what users see</strong></li>
              </ul>
            </div>
          </div>

          <div style={{
            marginTop: '20px',
            padding: '16px',
            backgroundColor: theme.colors.backgroundTertiary,
            borderRadius: '6px',
          }}>
            <div style={{
              fontSize: theme.fontSizes[1],
              color: theme.colors.text,
              marginBottom: '12px',
            }}>
              <strong>Best Practice:</strong>
            </div>
            <pre style={{
              fontFamily: theme.fonts.monospace,
              fontSize: theme.fontSizes[1],
              color: theme.colors.text,
              lineHeight: 1.6,
            }}>{`{
  "pv": {
    "name": "Validation Started",      // ← For humans
    "event": {
      "name": "validation.started"     // ← For machines
    }
  }
}`}</pre>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Shows what you'd need to do to use event.name as display
 */
export const WorkaroundToUseEventName: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    return (
      <div style={{ padding: '32px' }}>
        <h2 style={{
          marginBottom: '24px',
          fontSize: theme.fontSizes[6],
          color: theme.colors.text,
        }}>
          Workaround: Using Event Name as Display Name
        </h2>

        <p style={{
          marginBottom: '24px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
          maxWidth: '800px',
        }}>
          If you want the event name to show on the node, you must <strong>explicitly set pv.name</strong> to
          the same value. There is no automatic fallback to event.name.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '32px',
        }}>
          <div>
            <h3 style={{
              marginBottom: '16px',
              fontSize: theme.fontSizes[3],
              color: theme.colors.error,
            }}>
              ❌ Won't Show Event Name
            </h3>
            <pre style={{
              backgroundColor: theme.colors.surface,
              border: `2px solid ${theme.colors.error}`,
              borderRadius: '8px',
              padding: '16px',
              fontSize: theme.fontSizes[1],
              fontFamily: theme.fonts.monospace,
              color: theme.colors.text,
              lineHeight: 1.5,
            }}>{`{
  "id": "event-node",
  "type": "text",
  "pv": {
    // Missing pv.name!
    "event": {
      "name": "user.logged.in"
    }
  }
}

// Displays: "Text" (fallback)
// NOT "user.logged.in"`}</pre>
          </div>

          <div>
            <h3 style={{
              marginBottom: '16px',
              fontSize: theme.fontSizes[3],
              color: theme.colors.success,
            }}>
              ✅ Will Show Event Name
            </h3>
            <pre style={{
              backgroundColor: theme.colors.surface,
              border: `2px solid ${theme.colors.success}`,
              borderRadius: '8px',
              padding: '16px',
              fontSize: theme.fontSizes[1],
              fontFamily: theme.fonts.monospace,
              color: theme.colors.text,
              lineHeight: 1.5,
            }}>{`{
  "id": "event-node",
  "type": "text",
  "pv": {
    "name": "user.logged.in", ✓
    "event": {
      "name": "user.logged.in"
    }
  }
}

// Displays: "user.logged.in"
// Because pv.name is set`}</pre>
          </div>
        </div>
      </div>
    );
  },
};
