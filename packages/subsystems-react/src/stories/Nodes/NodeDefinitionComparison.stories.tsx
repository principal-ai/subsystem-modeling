import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Nodes/NodeDefinitionComparison',
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
 * Component that shows node definition JSON alongside the rendered node
 */
const SideBySideComparison: React.FC<{
  title: string;
  nodeDefinition: Record<string, unknown>;
  canvas: ExtendedCanvas;
  description?: string;
}> = ({ title, nodeDefinition, canvas, description }) => {
  const theme = defaultEditorTheme;

  return (
    <div style={{ padding: '24px', fontFamily: theme.fonts.body }}>
      <h2 style={{
        marginBottom: '8px',
        fontFamily: theme.fonts.heading,
        fontSize: theme.fontSizes[5],
        color: theme.colors.text,
      }}>
        {title}
      </h2>
      {description && (
        <p style={{
          marginBottom: '24px',
          fontSize: theme.fontSizes[1],
          color: theme.colors.textSecondary,
        }}>
          {description}
        </p>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px',
        alignItems: 'start',
      }}>
        {/* Left side - JSON Definition */}
        <div>
          <h3 style={{
            marginBottom: '12px',
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.textSecondary,
          }}>
            Node Definition (JSON)
          </h3>
          <pre style={{
            backgroundColor: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '8px',
            padding: '16px',
            fontSize: theme.fontSizes[1],
            fontFamily: theme.fonts.monospace,
            color: theme.colors.text,
            overflow: 'auto',
            maxHeight: '600px',
            lineHeight: 1.5,
          }}>
            {JSON.stringify(nodeDefinition, null, 2)}
          </pre>
          <div style={{
            marginTop: '12px',
            padding: '12px',
            backgroundColor: theme.colors.backgroundSecondary,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '6px',
            fontSize: theme.fontSizes[0],
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.monospace,
          }}>
            <div><strong>Font Size:</strong> {theme.fontSizes[0]}px (theme.fontSizes[0])</div>
            <div><strong>Font Family:</strong> {theme.fonts.body}</div>
            <div><strong>Font Weight:</strong> {theme.fontWeights.medium} (medium)</div>
          </div>
        </div>

        {/* Right side - Rendered Output */}
        <div>
          <h3 style={{
            marginBottom: '12px',
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.textSecondary,
          }}>
            Rendered Node
          </h3>
          <div style={{
            backgroundColor: theme.colors.background,
            border: `2px solid ${theme.colors.border}`,
            borderRadius: '8px',
            padding: '24px',
            minHeight: '400px',
          }}>
            <GraphRenderer
              canvas={canvas}
              height={400}
              width="100%"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Shows a basic OTEL event node definition alongside its rendered output
 */
export const BasicOtelEventNode: Story = {
  render: () => {
    const nodeDefinition = {
      id: "analysis-started",
      type: "text",
      text: "Analysis Started",
      x: 200,
      y: 150,
      width: 200,
      height: 100,
      color: "#4CAF50",
      pv: {
        name: "Analysis Started",
        description: "Codebase composition analysis begins",
        shape: "roundedRect",
        icon: "Play",
        otel: {
          kind: "event",
          category: "lifecycle"
        },
        event: {
          name: "analysis.started",
          attributes: {
            "repository.path": {
              type: "string",
              description: "Repository root path",
              required: true
            },
            "analysis.type": {
              type: "string",
              description: "Type of analysis (discovery, validation, full)",
              required: true
            }
          }
        },
        sources: [
          "packages/subsystems-core/src/discovery/CanvasDiscovery.ts",
          "packages/principal-studio-cli/src/commands/validate.ts"
        ]
      }
    };

    const canvas: ExtendedCanvas = {
      nodes: [nodeDefinition],
      edges: [],
    };

    return (
      <SideBySideComparison
        title="OTEL Event Node with Sources"
        description="This shows how an OTEL event node is defined in JSON (left) and how it renders in the graph (right). Note the 12px font size for the node name."
        nodeDefinition={nodeDefinition}
        canvas={canvas}
      />
    );
  },
};

/**
 * Shows different node shapes and their definitions
 */
export const NodeShapeComparison: Story = {
  render: () => {
    const nodeDefinitions = [
      {
        id: "circle-node",
        type: "text",
        text: "Circle Shape",
        x: 100,
        y: 150,
        width: 120,
        height: 120,
        color: "#2196F3",
        pv: {
          name: "Circle Node",
          description: "A circular node",
          shape: "circle",
          icon: "Circle",
        }
      },
      {
        id: "hexagon-node",
        type: "text",
        text: "Hexagon Shape",
        x: 300,
        y: 150,
        width: 140,
        height: 140,
        color: "#FF9800",
        pv: {
          name: "Hexagon Node",
          description: "A hexagonal node",
          shape: "hexagon",
          icon: "Hexagon",
        }
      },
      {
        id: "diamond-node",
        type: "text",
        text: "Diamond Shape",
        x: 520,
        y: 150,
        width: 100,
        height: 100,
        color: "#9C27B0",
        pv: {
          name: "Diamond Node",
          description: "A diamond node",
          shape: "diamond",
          icon: "Diamond",
        }
      }
    ];

    const canvas: ExtendedCanvas = {
      nodes: nodeDefinitions,
      edges: [],
    };

    return (
      <div style={{ padding: '24px' }}>
        <h2 style={{
          marginBottom: '24px',
          fontFamily: defaultEditorTheme.fonts.heading,
          fontSize: defaultEditorTheme.fontSizes[6],
          color: defaultEditorTheme.colors.text,
        }}>
          Multiple Node Shapes - Definition vs Rendering
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
        }}>
          {/* Left side - All JSON Definitions */}
          <div>
            <h3 style={{
              marginBottom: '12px',
              fontSize: defaultEditorTheme.fontSizes[2],
              fontWeight: defaultEditorTheme.fontWeights.semibold,
              color: defaultEditorTheme.colors.textSecondary,
            }}>
              Node Definitions (JSON Array)
            </h3>
            <pre style={{
              backgroundColor: defaultEditorTheme.colors.surface,
              border: `1px solid ${defaultEditorTheme.colors.border}`,
              borderRadius: '8px',
              padding: '16px',
              fontSize: defaultEditorTheme.fontSizes[0],
              fontFamily: defaultEditorTheme.fonts.monospace,
              color: defaultEditorTheme.colors.text,
              overflow: 'auto',
              maxHeight: '800px',
              lineHeight: 1.5,
            }}>
              {JSON.stringify(nodeDefinitions, null, 2)}
            </pre>
          </div>

          {/* Right side - Rendered Output */}
          <div>
            <h3 style={{
              marginBottom: '12px',
              fontSize: defaultEditorTheme.fontSizes[2],
              fontWeight: defaultEditorTheme.fontWeights.semibold,
              color: defaultEditorTheme.colors.textSecondary,
            }}>
              Rendered Nodes
            </h3>
            <div style={{
              backgroundColor: defaultEditorTheme.colors.background,
              border: `2px solid ${defaultEditorTheme.colors.border}`,
              borderRadius: '8px',
              padding: '24px',
              height: '800px',
            }}>
              <GraphRenderer
                canvas={canvas}
                height={800}
                width="100%"
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Shows node with state and violations
 */
export const NodeWithStateAndViolations: Story = {
  render: () => {
    const nodeDefinition = {
      id: "validation-error",
      type: "text",
      text: "Validation Error",
      x: 200,
      y: 150,
      width: 200,
      height: 100,
      color: "#F44336",
      pv: {
        name: "Validation Error",
        description: "Validation failed with errors",
        shape: "roundedRect",
        icon: "XCircle",
        otel: {
          kind: "event",
          category: "error"
        },
        event: {
          name: "validation.error",
          attributes: {
            "error.type": {
              type: "string",
              description: "Error type (parse, schema, reference, structure)",
              required: true
            },
            "error.message": {
              type: "string",
              description: "Error message",
              required: true
            }
          }
        },
        sources: [
          "packages/principal-studio-cli/src/commands/validate.ts",
          "packages/subsystems-core/src/ConfigurationValidator.ts"
        ]
      }
    };

    const canvas: ExtendedCanvas = {
      nodes: [nodeDefinition],
      edges: [],
    };

    return (
      <SideBySideComparison
        title="OTEL Event Node - Error State"
        description="Shows an error event node with OTEL metadata and source file badges. The red color (#F44336) is used for error states."
        nodeDefinition={nodeDefinition}
        canvas={canvas}
      />
    );
  },
};

/**
 * Shows the complete workflow nodes from validation.otel.canvas
 */
export const ValidationWorkflowNodes: Story = {
  render: () => {
    const workflowNodes = [
      {
        id: "analysis-started",
        type: "text",
        text: "Analysis Started",
        x: 100,
        y: 50,
        width: 200,
        height: 100,
        color: "#4CAF50",
        pv: {
          name: "Analysis Started",
          shape: "roundedRect",
          icon: "Play",
          otel: { kind: "event", category: "lifecycle" }
        }
      },
      {
        id: "file-parsed",
        type: "text",
        text: "File Parsed",
        x: 100,
        y: 200,
        width: 200,
        height: 100,
        color: "#2196F3",
        pv: {
          name: "File Parsed",
          shape: "roundedRect",
          icon: "FileJson",
          otel: { kind: "event", category: "operation" }
        }
      },
      {
        id: "canvas-validated",
        type: "text",
        text: "Canvas Validated",
        x: 350,
        y: 200,
        width: 200,
        height: 100,
        color: "#9C27B0",
        pv: {
          name: "Canvas Validated",
          shape: "roundedRect",
          icon: "CheckSquare",
          otel: { kind: "event", category: "operation" }
        }
      },
      {
        id: "validation-complete",
        type: "text",
        text: "Validation Complete",
        x: 100,
        y: 350,
        width: 200,
        height: 100,
        color: "#4CAF50",
        pv: {
          name: "Validation Complete",
          shape: "roundedRect",
          icon: "CheckCircle2",
          otel: { kind: "event", category: "lifecycle" }
        }
      }
    ];

    const canvas: ExtendedCanvas = {
      nodes: workflowNodes,
      edges: [
        {
          id: "start-to-parse",
          fromNode: "analysis-started",
          toNode: "file-parsed",
          fromSide: "bottom",
          toSide: "top"
        },
        {
          id: "parse-to-validate",
          fromNode: "file-parsed",
          toNode: "canvas-validated",
          fromSide: "right",
          toSide: "left"
        },
        {
          id: "validate-to-complete",
          fromNode: "file-parsed",
          toNode: "validation-complete",
          fromSide: "bottom",
          toSide: "top"
        }
      ],
    };

    return (
      <div style={{ padding: '24px' }}>
        <h2 style={{
          marginBottom: '24px',
          fontFamily: defaultEditorTheme.fonts.heading,
          fontSize: defaultEditorTheme.fontSizes[6],
          color: defaultEditorTheme.colors.text,
        }}>
          Validation Workflow - OTEL Events
        </h2>
        <p style={{
          marginBottom: '24px',
          fontSize: defaultEditorTheme.fontSizes[1],
          color: defaultEditorTheme.colors.textSecondary,
        }}>
          Example from validation.otel.canvas showing how lifecycle and operation events are defined and rendered.
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
        }}>
          {/* Left side - JSON */}
          <div>
            <h3 style={{
              marginBottom: '12px',
              fontSize: defaultEditorTheme.fontSizes[2],
              fontWeight: defaultEditorTheme.fontWeights.semibold,
              color: defaultEditorTheme.colors.textSecondary,
            }}>
              Workflow Node Definitions
            </h3>
            <pre style={{
              backgroundColor: defaultEditorTheme.colors.surface,
              border: `1px solid ${defaultEditorTheme.colors.border}`,
              borderRadius: '8px',
              padding: '16px',
              fontSize: defaultEditorTheme.fontSizes[0],
              fontFamily: defaultEditorTheme.fonts.monospace,
              color: defaultEditorTheme.colors.text,
              overflow: 'auto',
              maxHeight: '700px',
              lineHeight: 1.5,
            }}>
              {JSON.stringify({ nodes: workflowNodes, edges: canvas.edges }, null, 2)}
            </pre>
          </div>

          {/* Right side - Rendered */}
          <div>
            <h3 style={{
              marginBottom: '12px',
              fontSize: defaultEditorTheme.fontSizes[2],
              fontWeight: defaultEditorTheme.fontWeights.semibold,
              color: defaultEditorTheme.colors.textSecondary,
            }}>
              Rendered Workflow Graph
            </h3>
            <div style={{
              backgroundColor: defaultEditorTheme.colors.background,
              border: `2px solid ${defaultEditorTheme.colors.border}`,
              borderRadius: '8px',
              padding: '24px',
              height: '700px',
            }}>
              <GraphRenderer
                canvas={canvas}
                height={700}
                width="100%"
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
};
