import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { GraphRenderer } from '../../components/GraphRenderer';
import { NodeTooltip } from '../../components/NodeTooltip';

// OTEL Log Association canvas data
const otelCanvas = {
  nodes: [
    {
      id: 'otel-log',
      type: 'text',
      text: 'OtelLog',
      x: -304,
      y: 147,
      width: 120,
      height: 118,
      pv: {
        nodeType: 'otel-type',
        name: 'OtelLog',
        description: `## OpenTelemetry Log Record

A structured log entry containing:
- **Timestamp**: When the log was created
- **Severity**: Log level (INFO, WARN, ERROR)
- **Body**: The actual log message
- **Resource**: Source context
- **Trace Context**: Correlation with traces

\`\`\`typescript
interface OtelLog {
  timestamp: number;
  severity: string;
  body: string;
}
\`\`\``,
        otel: {
          kind: 'type',
          category: 'log',
        },
        shape: 'rectangle',
        icon: 'FileText',
        fill: '#4A90E2',
      },
    },
    {
      id: 'log-router',
      type: 'text',
      text: 'LogRouter',
      x: -80,
      y: 150,
      width: 130,
      height: 118,
      pv: {
        nodeType: 'otel-service',
        name: 'LogRouter',
        description: `### Log Router Service

Routes incoming OTEL logs to canvas nodes based on matching criteria.

**Routing Logic:**
1. Check canvas scope match
2. Apply \`resourceMatch\` patterns
3. Route to matching nodes
4. Collect orphaned logs

> **Note**: Supports multiple match operators including \`exact\`, \`glob\`, and \`regex\`.`,
        otel: {
          kind: 'service',
          category: 'router',
        },
        shape: 'hexagon',
        icon: 'GitBranch',
        fill: '#7ED321',
      },
    },
    {
      id: 'orphaned-log',
      type: 'text',
      text: 'OrphanedLog',
      x: 150,
      y: 150,
      width: 127,
      height: 118,
      pv: {
        nodeType: 'otel-type',
        name: 'OrphanedLog',
        description:
          'Logs that matched canvas scope but no node resourceMatch - indicates missing nodes or misconfiguration',
        otel: {
          kind: 'type',
          category: 'audit',
        },
        shape: 'rectangle',
        icon: 'AlertTriangle',
        fill: '#D0021B',
      },
    },
    {
      id: 'match-operator',
      type: 'text',
      text: 'MatchOperator',
      x: -80,
      y: 300,
      width: 120,
      height: 117,
      pv: {
        nodeType: 'service',
        name: 'MatchOperator',
        description: 'Matching operators: exact, glob, regex, exists, oneOf',
        shape: 'diamond',
        icon: 'Code',
        fill: '#F5A623',
      },
    },
  ],
  edges: [
    {
      id: 'log-to-router',
      fromNode: 'otel-log',
      toNode: 'log-router',
      fromSide: 'right',
      toSide: 'left',
      label: 'route()',
    },
    {
      id: 'router-to-orphan',
      fromNode: 'log-router',
      toNode: 'orphaned-log',
      fromSide: 'right',
      toSide: 'left',
      label: 'unmatched',
    },
    {
      id: 'router-to-operator',
      fromNode: 'log-router',
      toNode: 'match-operator',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'uses',
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'OTEL Components Demo',
    description: 'Demonstrates OTEL badges, tooltips, and info panel',
    nodeTypes: {
      'otel-type': {
        label: 'Type',
        description: 'TypeScript type or interface representing OTEL concepts',
        shape: 'rectangle',
      },
      'otel-service': {
        label: 'Service',
        description: 'Runtime service component for OTEL processing',
        shape: 'hexagon',
      },
      service: {
        label: 'Component',
        description: 'System component',
        shape: 'hexagon',
      },
    },
  },
};

const meta: Meta = {
  title: 'OTEL/OtelComponents',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

/**
 * Shows nodes with OTEL badges (T/S/I circles) and hover tooltips.
 * Hover over any node to see the tooltip with OTEL kind, category, and description.
 */
export const OtelBadgesAndTooltips: StoryObj = {
  render: () => (
    <ThemeProvider theme={defaultEditorTheme}>
      <div style={{ width: '100%', height: '600px' }}>
        <GraphRenderer canvas={otelCanvas} initialViewport={{ x: 200, y: 50, zoom: 1 }} />
      </div>
    </ThemeProvider>
  ),
};

/**
 * Standalone NodeTooltip component demo showing all OTEL kinds.
 */
export const TooltipVariants: StoryObj = {
  render: () => (
    <ThemeProvider theme={defaultEditorTheme}>
      <div style={{ padding: '40px', display: 'flex', gap: '80px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '200px', height: '150px' }}>
          <div
            style={{
              padding: '20px',
              border: '2px solid #4A90E2',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            Type Node (hover below)
          </div>
          <NodeTooltip
            description="OpenTelemetry log record with timestamp, severity, body"
            otel={{ kind: 'type', category: 'log' }}
            visible={true}
          />
        </div>

        <div style={{ position: 'relative', width: '200px', height: '150px' }}>
          <div
            style={{
              padding: '20px',
              border: '2px solid #7ED321',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            Service Node (hover below)
          </div>
          <NodeTooltip
            description="Routes logs to canvas nodes based on resourceMatch"
            otel={{ kind: 'service', category: 'router' }}
            visible={true}
          />
        </div>

        <div style={{ position: 'relative', width: '200px', height: '150px' }}>
          <div
            style={{
              padding: '20px',
              border: '2px solid #9B59B6',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            Instance Node (hover below)
          </div>
          <NodeTooltip
            description="A specific running instance of a service"
            otel={{ kind: 'instance', category: 'runtime', scope: 'auth-flow' }}
            visible={true}
          />
        </div>
      </div>
    </ThemeProvider>
  ),
};

/**
 * Demonstrates tooltips with scope information.
 * Shows how scope names are displayed in the tooltip.
 */
export const TooltipWithScope: StoryObj = {
  render: () => (
    <ThemeProvider theme={defaultEditorTheme}>
      <div style={{ padding: '40px', display: 'flex', gap: '80px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '200px', height: '180px' }}>
          <div
            style={{
              padding: '20px',
              border: '2px solid #DC2626',
              borderRadius: '8px',
              textAlign: 'center',
              backgroundColor: '#DC2626',
              color: 'white',
            }}
          >
            Auth Event
          </div>
          <NodeTooltip
            description="User authentication completed successfully"
            otel={{ kind: 'type', category: 'event', scope: 'auth-flow' }}
            visible={true}
          />
        </div>

        <div style={{ position: 'relative', width: '200px', height: '180px' }}>
          <div
            style={{
              padding: '20px',
              border: '2px solid #2563EB',
              borderRadius: '8px',
              textAlign: 'center',
              backgroundColor: '#2563EB',
              color: 'white',
            }}
          >
            Terminal Event
          </div>
          <NodeTooltip
            description="Command executed in terminal session"
            otel={{ kind: 'type', category: 'event', scope: 'terminal-activity' }}
            visible={true}
          />
        </div>

        <div style={{ position: 'relative', width: '200px', height: '180px' }}>
          <div
            style={{
              padding: '20px',
              border: '2px solid #16A34A',
              borderRadius: '8px',
              textAlign: 'center',
              backgroundColor: '#16A34A',
              color: 'white',
            }}
          >
            Quality Event
          </div>
          <NodeTooltip
            description="Code quality check completed with metrics"
            otel={{ kind: 'type', category: 'event', scope: 'quality-panel' }}
            visible={true}
          />
        </div>
      </div>
    </ThemeProvider>
  ),
};

/**
 * Demonstrates markdown rendering in tooltips with rich formatting.
 * Hold Shift and hover over nodes to see tooltips with markdown content.
 */
export const MarkdownTooltips: StoryObj = {
  render: () => (
    <ThemeProvider theme={defaultEditorTheme}>
      <div style={{ padding: '40px', display: 'flex', gap: '80px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '200px', height: '200px' }}>
          <div
            style={{
              padding: '20px',
              border: '2px solid #4A90E2',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            Lists & Code (hover below)
          </div>
          <NodeTooltip
            description={`# Features

- **Bold text** and *italic text*
- Inline \`code\` formatting
- Multiple levels of formatting

## Code Example
\`\`\`typescript
function example() {
  return "Hello!";
}
\`\`\`
`}
            otel={{ kind: 'type', category: 'example' }}
            visible={true}
          />
        </div>

        <div style={{ position: 'relative', width: '200px', height: '200px' }}>
          <div
            style={{
              padding: '20px',
              border: '2px solid #7ED321',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            Links & Emphasis (hover below)
          </div>
          <NodeTooltip
            description={`## Service Router

This component handles:

1. Log routing
2. Pattern matching
3. Event distribution

**Important**: Uses [regex](https://regex.org) for matching.

> Note: All logs are buffered before routing.`}
            otel={{ kind: 'service', category: 'router' }}
            visible={true}
          />
        </div>

        <div style={{ position: 'relative', width: '200px', height: '200px' }}>
          <div
            style={{
              padding: '20px',
              border: '2px solid #9B59B6',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            Tables (hover below)
          </div>
          <NodeTooltip
            description={`### Configuration

| Property | Type | Default |
|----------|------|---------|
| timeout  | number | 5000 |
| retries  | number | 3 |
| enabled  | boolean | true |

Use \`config.json\` to customize.`}
            otel={{ kind: 'instance', category: 'config' }}
            visible={true}
          />
        </div>
      </div>
    </ThemeProvider>
  ),
};

