import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas, ExtendedCanvasNode } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Nodes/NodeNameFallbacks',
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
 * Component to show node definition and explain the fallback
 */
const FallbackExample: React.FC<{
  title: string;
  scenario: string;
  nodeDefinition: ExtendedCanvasNode;
  expectedDisplay: string;
  explanation: string;
}> = ({ title, scenario, nodeDefinition, expectedDisplay, explanation }) => {
  const theme = defaultEditorTheme;

  const canvas: ExtendedCanvas = {
    nodes: [nodeDefinition],
    edges: [],
  };

  return (
    <div style={{
      marginBottom: '32px',
      padding: '24px',
      backgroundColor: theme.colors.surface,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: '8px',
    }}>
      <h3 style={{
        marginBottom: '8px',
        fontSize: theme.fontSizes[3],
        fontWeight: theme.fontWeights.semibold,
        color: theme.colors.text,
      }}>
        {title}
      </h3>
      <p style={{
        marginBottom: '16px',
        fontSize: theme.fontSizes[1],
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
      }}>
        {scenario}
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
            lineHeight: 1.5,
          }}>
            {JSON.stringify(nodeDefinition, null, 2)}
          </pre>
        </div>

        {/* Middle: Explanation */}
        <div>
          <div style={{
            marginBottom: '8px',
            fontSize: theme.fontSizes[1],
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.textSecondary,
          }}>
            Fallback Logic
          </div>
          <div style={{
            backgroundColor: theme.colors.backgroundSecondary,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '6px',
            padding: '12px',
            fontSize: theme.fontSizes[0],
            color: theme.colors.textMuted,
            lineHeight: 1.6,
          }}>
            {explanation}
          </div>
          <div style={{
            marginTop: '12px',
            padding: '12px',
            backgroundColor: theme.colors.backgroundTertiary,
            border: `2px solid ${theme.colors.primary}`,
            borderRadius: '6px',
          }}>
            <div style={{
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.bold,
              color: theme.colors.primary,
              marginBottom: '4px',
            }}>
              Expected Display:
            </div>
            <div style={{
              fontSize: theme.fontSizes[2],
              fontFamily: theme.fonts.monospace,
              color: theme.colors.text,
            }}>
              "{expectedDisplay}"
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
            height: '200px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <GraphRenderer
              canvas={canvas}
              height={200}
              width="100%"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Shows all name fallback scenarios
 */
export const AllFallbackScenarios: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    return (
      <div style={{ padding: '32px', fontFamily: theme.fonts.body }}>
        <h1 style={{
          marginBottom: '16px',
          fontFamily: theme.fonts.heading,
          fontSize: theme.fontSizes[7],
          color: theme.colors.text,
        }}>
          Node Name Fallback Chain
        </h1>
        <p style={{
          marginBottom: '32px',
          fontSize: theme.fontSizes[2],
          color: theme.colors.textSecondary,
          maxWidth: '900px',
        }}>
          This demonstrates the priority order for determining what text displays on a node.
          The system uses a fallback chain: <strong>pv.name → text (first line) → "Text" → node.id</strong>
        </p>

        <FallbackExample
          title="Scenario 1: Both pv.name and text present"
          scenario="pv.name takes priority"
          nodeDefinition={{
            id: "both-present",
            type: "text",
            text: "This Text is Ignored",
            x: 100,
            y: 50,
            width: 180,
            height: 100,
            color: "#4CAF50",
            pv: {
              name: "Custom Name Wins",
              shape: "roundedRect",
              icon: "CheckCircle2"
            }
          }}
          expectedDisplay="Custom Name Wins"
          explanation="When both pv.name and text exist, pv.name takes priority. The text field is ignored for display purposes."
        />

        <FallbackExample
          title="Scenario 2: Only pv.name present"
          scenario="pv.name is used"
          nodeDefinition={{
            id: "only-pv-name",
            type: "text",
            x: 100,
            y: 50,
            width: 180,
            height: 100,
            color: "#2196F3",
            pv: {
              name: "Only PV Name",
              shape: "roundedRect",
              icon: "Tag"
            }
          }}
          expectedDisplay="Only PV Name"
          explanation="When only pv.name exists (text is undefined), pv.name is used directly for display."
        />

        <FallbackExample
          title="Scenario 3: Only text present (single line)"
          scenario="First line of text is used"
          nodeDefinition={{
            id: "only-text",
            type: "text",
            text: "Text Field Name",
            x: 100,
            y: 50,
            width: 180,
            height: 100,
            color: "#FF9800",
            pv: {
              shape: "roundedRect",
              icon: "FileText"
            }
          }}
          expectedDisplay="Text Field Name"
          explanation="When pv.name is missing but text exists, the first line of text is used as the name."
        />

        <FallbackExample
          title="Scenario 4: Only text present (multi-line markdown)"
          scenario="First line extracted, markdown stripped"
          nodeDefinition={{
            id: "multiline-text",
            type: "text",
            text: "# Main Title\n\nThis description is ignored for the name",
            x: 100,
            y: 50,
            width: 180,
            height: 100,
            color: "#9C27B0",
            pv: {
              shape: "roundedRect",
              icon: "Hash"
            }
          }}
          expectedDisplay="Main Title"
          explanation="For multi-line text, only the first line is used as the name. Markdown headers (# symbols) are stripped out."
        />

        <FallbackExample
          title="Scenario 5: Neither pv.name nor text present"
          scenario="Hardcoded fallback 'Text' is used"
          nodeDefinition={{
            id: "neither-present",
            type: "text",
            x: 100,
            y: 50,
            width: 180,
            height: 100,
            color: "#F44336",
            pv: {
              shape: "roundedRect",
              icon: "AlertCircle"
            }
          }}
          expectedDisplay="Text"
          explanation="When both pv.name and text are missing/undefined, the hardcoded fallback 'Text' is used as the name."
        />

        <div style={{
          marginTop: '32px',
          padding: '24px',
          backgroundColor: theme.colors.backgroundSecondary,
          border: `2px solid ${theme.colors.border}`,
          borderRadius: '8px',
        }}>
          <h2 style={{
            marginBottom: '16px',
            fontSize: theme.fontSizes[4],
            color: theme.colors.text,
          }}>
            Complete Fallback Chain
          </h2>
          <div style={{
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[1],
            color: theme.colors.text,
            lineHeight: 2,
          }}>
            <div style={{ color: theme.colors.primary }}>
              1. <strong>pv.name</strong> (highest priority)
            </div>
            <div style={{ paddingLeft: '20px', color: theme.colors.textSecondary }}>
              ↓ if missing
            </div>
            <div style={{ color: theme.colors.primary }}>
              2. <strong>text</strong> (first line, markdown stripped, max 50 chars)
            </div>
            <div style={{ paddingLeft: '20px', color: theme.colors.textSecondary }}>
              ↓ if missing
            </div>
            <div style={{ color: theme.colors.primary }}>
              3. <strong>"Text"</strong> (hardcoded fallback for text nodes)
            </div>
            <div style={{ paddingLeft: '20px', color: theme.colors.textSecondary }}>
              ↓ if NodeState.name somehow missing
            </div>
            <div style={{ color: theme.colors.primary }}>
              4. <strong>node.id</strong> (ultimate fallback in renderer)
            </div>
          </div>

          <div style={{
            marginTop: '20px',
            padding: '16px',
            backgroundColor: theme.colors.backgroundTertiary,
            borderRadius: '6px',
            fontSize: theme.fontSizes[1],
            color: theme.colors.textMuted,
          }}>
            <strong style={{ color: theme.colors.text }}>Code Reference:</strong>
            <div style={{ marginTop: '8px' }}>
              • CanvasConverter.ts:285-307 (text → NodeState.name conversion)
              <br />
              • graphConverter.ts:42 (NodeState.name → node.id fallback)
              <br />
              • CustomNode.tsx:201 (final display)
            </div>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Shows the difference between text and pv.name with identical values
 */
export const TextVsPvName: Story = {
  render: () => {
    const theme = defaultEditorTheme;

    const bothSame: ExtendedCanvas = {
      nodes: [{
        id: "same-value",
        type: "text",
        text: "Analysis Started",
        x: 150,
        y: 100,
        width: 200,
        height: 100,
        color: "#4CAF50",
        pv: {
          name: "Analysis Started",
          shape: "roundedRect",
          icon: "Play"
        }
      }],
      edges: [],
    };

    const different: ExtendedCanvas = {
      nodes: [{
        id: "different-values",
        type: "text",
        text: "Long technical description that gets truncated",
        x: 150,
        y: 100,
        width: 200,
        height: 100,
        color: "#2196F3",
        pv: {
          name: "Short Name",
          shape: "roundedRect",
          icon: "Zap"
        }
      }],
      edges: [],
    };

    return (
      <div style={{ padding: '32px' }}>
        <h2 style={{
          marginBottom: '24px',
          fontSize: theme.fontSizes[6],
          color: theme.colors.text,
        }}>
          Text vs PV.Name Comparison
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '32px',
          marginBottom: '32px',
        }}>
          <div>
            <h3 style={{
              marginBottom: '16px',
              fontSize: theme.fontSizes[3],
              color: theme.colors.text,
            }}>
              When They're the Same
            </h3>
            <p style={{
              marginBottom: '16px',
              fontSize: theme.fontSizes[1],
              color: theme.colors.textSecondary,
            }}>
              In your OTEL canvases, text and pv.name often have the same value. This is redundant but harmless - pv.name takes priority anyway.
            </p>
            <div style={{
              backgroundColor: theme.colors.background,
              border: `2px solid ${theme.colors.border}`,
              borderRadius: '8px',
              padding: '24px',
              height: '250px',
            }}>
              <GraphRenderer canvas={bothSame} height={250} width="100%" />
            </div>
          </div>

          <div>
            <h3 style={{
              marginBottom: '16px',
              fontSize: theme.fontSizes[3],
              color: theme.colors.text,
            }}>
              When They're Different
            </h3>
            <p style={{
              marginBottom: '16px',
              fontSize: theme.fontSizes[1],
              color: theme.colors.textSecondary,
            }}>
              When they differ, pv.name always wins. The text field can contain longer content while pv.name provides a concise display name.
            </p>
            <div style={{
              backgroundColor: theme.colors.background,
              border: `2px solid ${theme.colors.border}`,
              borderRadius: '8px',
              padding: '24px',
              height: '250px',
            }}>
              <GraphRenderer canvas={different} height={250} width="100%" />
            </div>
          </div>
        </div>
      </div>
    );
  },
};
