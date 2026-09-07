import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas, ComponentLibrary } from '@principal-ai/subsystems-core';

/**
 * =============================================================================
 * OTEL Node Types - Examples
 * =============================================================================
 *
 * This story demonstrates the implemented OTEL canvas node types:
 * - otel-event: Telemetry events in workflows
 * - otel-span-convention: Span naming patterns
 * - otel-scope: Instrumentation scopes
 * - otel-resource: Service/deployment resources
 * - otel-boundary: External system interfaces
 *
 * See: docs/NODE_TYPE_MIGRATION.md for migration details.
 *
 * The new format uses:
 * - Semantic `type` values (otel-event, otel-span-convention, etc.)
 * - `label` for display text (required)
 * - Top-level fields (no `pv` wrapper needed)
 * - Consistent identifier display below label
 */

// =============================================================================
// PROPOSED NEW FORMAT (what we want to migrate to)
// =============================================================================

/**
 * This is what the NEW format would look like.
 * Note: `type` is semantic, no `text` field, no `pv` wrapper
 */
const proposedNewFormat = {
  nodes: [
    // otel-event: Telemetry events in workflows
    {
      type: 'otel-event',
      id: 'analysis-started',
      x: 100,
      y: 100,
      width: 180,
      height: 80,
      color: '4', // green
      label: 'Analysis Started',
      event: {
        name: 'analysis.started',
        attributes: {
          'file.count': { type: 'number', required: true, description: 'Number of files' },
        },
      },
      otel: {
        status: 'implemented',
        scope: 'validation',
        files: ['src/validation/analyzer.ts'],
      },
    },

    // otel-span-convention: Span naming patterns
    {
      type: 'otel-span-convention',
      id: 'validate-span',
      x: 100,
      y: 220,
      width: 180,
      height: 80,
      color: '5', // cyan
      label: 'Validation Operations',
      description: 'All validation-related spans',
      otel: {
        status: 'approved',
        spanPattern: 'validate.*',
        spanKind: 'INTERNAL',
      },
    },

    // otel-scope: Instrumentation scopes
    {
      type: 'otel-scope',
      id: 'validation-scope',
      x: 100,
      y: 340,
      width: 180,
      height: 80,
      color: '6', // purple
      label: 'Validation Scope',
      description: 'Tracer for validation operations',
      otel: {
        status: 'implemented',
        scope: 'validation',
      },
    },

    // otel-resource: Service/deployment resources
    {
      type: 'otel-resource',
      id: 'cli-resource',
      x: 100,
      y: 460,
      width: 180,
      height: 80,
      color: '2', // orange
      label: 'CLI Service',
      description: 'Principal View CLI tool',
      otel: {
        status: 'implemented',
        resourceMatch: {
          'service.name': 'principal-view.cli',
        },
      },
    },

    // otel-boundary: External system interfaces
    {
      type: 'otel-boundary',
      id: 'github-webhook',
      x: 100,
      y: 580,
      width: 180,
      height: 80,
      color: '1', // red
      label: 'GitHub Webhook',
      description: 'Incoming webhook from GitHub',
      otel: {
        status: 'draft',
        origin: 'external',
        references: ['https://docs.github.com/webhooks'],
      },
      boundary: {
        direction: 'inbound',
        node: {
          'pv.event.name': 'webhook.repository-created',
          'pv.event.namespace': 'github',
        },
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'New OTEL Node Types Prototype',
    description: 'Demonstrates the proposed new node type format',
  },
};

// =============================================================================
// LIBRARY: Define scopes for scope-based coloring
// =============================================================================

const libraryWithScopes: ComponentLibrary = {
  version: '1.0.0',
  name: 'OTEL Node Types Library',
  description: 'Scope definitions for OTEL node types',
  scopes: {
    validation: {
      description: 'Validation instrumentation scope',
      color: '#8b5cf6', // purple - matches otel-scope node type
    },
  },
  nodeComponents: {},
  edgeComponents: {},
};

// =============================================================================
// ADAPTER: Convert new format to current format for rendering
// =============================================================================

interface NewFormatNode {
  type: string;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  label: string;
  description?: string;
  icon?: string;
  fill?: string;
  event?: {
    name: string;
    attributes?: Record<string, unknown>;
  };
  otel?: {
    status?: string;
    scope?: string;
    files?: string[];
    spanPattern?: string;
    spanKind?: string;
    resourceMatch?: Record<string, string>;
    origin?: string;
    references?: string[];
  };
  boundary?: {
    direction: string;
    node: Record<string, string>;
  };
}

/**
 * Get the identifier that should be displayed under the label for each node type
 */
function getNodeIdentifier(node: NewFormatNode): string | undefined {
  switch (node.type) {
    case 'otel-event':
      return node.event?.name;
    case 'otel-span-convention':
      return node.otel?.spanPattern;
    case 'otel-scope':
      return node.otel?.scope;
    case 'otel-resource':
      // Show the primary resource match key/value
      if (node.otel?.resourceMatch) {
        const entries = Object.entries(node.otel.resourceMatch);
        if (entries.length > 0) {
          const [key, value] = entries[0];
          return `${key}: ${value}`;
        }
      }
      return undefined;
    case 'otel-boundary':
      return node.boundary?.direction;
    default:
      return undefined;
  }
}

function adaptNewFormatToCurrentFormat(newFormat: {
  nodes: NewFormatNode[];
  edges: unknown[];
  pv: unknown;
}): ExtendedCanvas {
  const nodeTypeToIcon: Record<string, string> = {
    'otel-event': 'Zap',
    'otel-span-convention': 'GitCommit',
    'otel-scope': 'Layers',
    'otel-resource': 'Server',
    'otel-boundary': 'ArrowRightLeft',
  };

  const nodeTypeToShape: Record<string, string> = {
    'otel-event': 'rectangle',
    'otel-span-convention': 'hexagon',
    'otel-scope': 'circle',
    'otel-resource': 'diamond',
    'otel-boundary': 'rectangle',
  };

  return {
    nodes: newFormat.nodes.map((node) => {
      const identifier = getNodeIdentifier(node);

      // For the prototype, we use the existing event.name mechanism to show identifiers
      // by populating a synthetic event object with the identifier as the name.
      // This gives us the same styling (75% size, monospace, 50% opacity) for all node types.
      const syntheticEvent = identifier
        ? { name: identifier, attributes: {} }
        : node.event;

      return {
        id: node.id,
        type: 'text' as const,
        text: node.label,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        color: node.color,
        pv: {
          nodeType: node.type,
          name: node.label, // Just the label, identifier shown via event.name styling
          description: buildDescription(node),
          icon: node.icon || nodeTypeToIcon[node.type] || 'Circle',
          shape: nodeTypeToShape[node.type] || 'rectangle',
          status: node.otel?.status as 'draft' | 'approved' | 'implemented' | undefined,
          otel: node.otel
            ? {
                scope: node.otel.scope,
                files: node.otel.files,
                spanPattern: node.otel.spanPattern,
                spanKind: node.otel.spanKind as
                  | 'UNSPECIFIED'
                  | 'INTERNAL'
                  | 'SERVER'
                  | 'CLIENT'
                  | 'PRODUCER'
                  | 'CONSUMER'
                  | undefined,
                resourceMatch: node.otel.resourceMatch,
              }
            : undefined,
          // Use synthetic event to show identifier with same styling as event names
          event: syntheticEvent,
          boundary: node.boundary as
            | {
                direction: 'inbound' | 'outbound';
                node: Record<string, string>;
              }
            | undefined,
          origin: node.otel?.origin as 'internal' | 'external' | undefined,
          references: node.otel?.references,
        },
      };
    }),
    edges: newFormat.edges as ExtendedCanvas['edges'],
    pv: {
      ...(newFormat.pv as object),
      nodeTypes: {
        'otel-event': {
          label: 'Event',
          description: 'Telemetry event emitted during execution',
          color: '#22c55e',
        },
        'otel-span-convention': {
          label: 'Span Convention',
          description: 'Naming pattern for spans',
          color: '#06b6d4',
        },
        'otel-scope': {
          label: 'Scope',
          description: 'Instrumentation scope (tracer)',
          color: '#8b5cf6',
        },
        'otel-resource': {
          label: 'Resource',
          description: 'Service or deployment resource',
          color: '#f97316',
        },
        'otel-boundary': {
          label: 'Boundary',
          description: 'External system interface',
          color: '#ef4444',
        },
      },
    } as ExtendedCanvas['pv'],
  };
}

function buildDescription(node: NewFormatNode): string {
  const parts: string[] = [];

  if (node.description) {
    parts.push(node.description);
  }

  // Add type-specific info
  if (node.type === 'otel-event' && node.event) {
    parts.push(`\n\n**Event:** \`${node.event.name}\``);
    if (node.event.attributes) {
      const attrs = Object.entries(node.event.attributes)
        .map(([key, val]) => {
          const v = val as { type?: string; required?: boolean; description?: string };
          return `- \`${key}\`: ${v.type || 'unknown'}${v.required ? ' (required)' : ''}`;
        })
        .join('\n');
      parts.push(`\n**Attributes:**\n${attrs}`);
    }
  }

  if (node.type === 'otel-span-convention' && node.otel?.spanPattern) {
    parts.push(`\n\n**Pattern:** \`${node.otel.spanPattern}\``);
    if (node.otel.spanKind) {
      parts.push(`**SpanKind:** ${node.otel.spanKind}`);
    }
  }

  if (node.type === 'otel-scope' && node.otel?.scope) {
    parts.push(`\n\n**Scope:** \`${node.otel.scope}\``);
  }

  if (node.type === 'otel-resource' && node.otel?.resourceMatch) {
    const matches = Object.entries(node.otel.resourceMatch)
      .map(([k, v]) => `- \`${k}\`: ${v}`)
      .join('\n');
    parts.push(`\n\n**Resource Match:**\n${matches}`);
  }

  if (node.type === 'otel-boundary' && node.boundary) {
    parts.push(`\n\n**Direction:** ${node.boundary.direction}`);
  }

  // Add status
  if (node.otel?.status) {
    const statusEmoji: Record<string, string> = {
      draft: '\u{1F4DD}',
      approved: '\u2705',
      implemented: '\u{1F680}',
    };
    parts.push(`\n\n**Status:** ${statusEmoji[node.otel.status] || ''} ${node.otel.status}`);
  }

  return parts.join('');
}

// =============================================================================
// STORIES
// =============================================================================

const meta: Meta = {
  title: 'OTEL/OtelNodeTypesPrototype',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

/**
 * Shows all proposed OTEL node types rendered in the graph.
 *
 * Each node demonstrates:
 * - Semantic type (otel-event, otel-span-convention, etc.)
 * - Required `label` field
 * - Type-specific fields (event, spanPattern, resourceMatch, etc.)
 * - OTEL metadata grouped in `otel` field
 *
 * Hover over nodes to see the full metadata in tooltips.
 */
export const AllNodeTypes: StoryObj = {
  render: () => {
    const canvas = adaptNewFormatToCurrentFormat(
      proposedNewFormat as {
        nodes: NewFormatNode[];
        edges: unknown[];
        pv: unknown;
      }
    );

    return (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ width: '100%', height: '800px' }}>
          <GraphRenderer canvas={canvas} library={libraryWithScopes} initialViewport={{ x: 50, y: 20, zoom: 1 }} />
        </div>
      </ThemeProvider>
    );
  },
};

/**
 * Shows the proposed JSON format for each node type.
 * Use this as a reference for the migration.
 */
export const FormatReference: StoryObj = {
  render: () => {
    // Helper to get identifier for each node type
    const getIdentifier = (node: (typeof proposedNewFormat.nodes)[number]) => {
      const n = node as NewFormatNode;
      switch (n.type) {
        case 'otel-event':
          return n.event?.name;
        case 'otel-span-convention':
          return n.otel?.spanPattern;
        case 'otel-scope':
          return n.otel?.scope;
        case 'otel-resource':
          if (n.otel?.resourceMatch) {
            const [key, value] = Object.entries(n.otel.resourceMatch)[0] || [];
            return key ? `${key}: ${value}` : undefined;
          }
          return undefined;
        case 'otel-boundary':
          return n.boundary?.direction;
        default:
          return undefined;
      }
    };

    return (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ marginBottom: '24px' }}>Proposed OTEL Node Type Formats</h1>
          <p style={{ marginBottom: '24px', color: '#666' }}>
            See <code>docs/NODE_TYPE_MIGRATION.md</code> for full documentation.
          </p>

          {proposedNewFormat.nodes.map((node, i) => {
            const identifier = getIdentifier(node);
            return (
              <div
                key={i}
                style={{
                  marginBottom: '32px',
                  padding: '16px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #e9ecef',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#333' }}>
                      <code>{node.type}</code>
                    </h3>
                  </div>
                  <div
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#fff',
                      border: '2px solid #ddd',
                      borderRadius: '6px',
                      textAlign: 'center',
                      minWidth: '140px',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{node.label}</div>
                    {identifier && (
                      <div style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace', marginTop: '4px' }}>
                        {identifier}
                      </div>
                    )}
                  </div>
                </div>
                <pre
                  style={{
                    backgroundColor: '#1e1e1e',
                    color: '#d4d4d4',
                    padding: '16px',
                    borderRadius: '4px',
                    overflow: 'auto',
                    fontSize: '13px',
                    lineHeight: '1.5',
                  }}
                >
                  {JSON.stringify(node, null, 2)}
                </pre>
              </div>
            );
          })}
        </div>
      </ThemeProvider>
    );
  },
};

/**
 * Side-by-side comparison of old format vs new format.
 */
export const FormatComparison: StoryObj = {
  render: () => {
    const oldFormat = {
      type: 'text',
      text: 'Analysis Started',
      id: 'analysis-started',
      x: 100,
      y: 100,
      width: 180,
      height: 80,
      color: '4',
      pv: {
        nodeType: 'event',
        name: 'Analysis Started',
        description: 'Codebase composition analysis begins',
        status: 'implemented',
        event: {
          name: 'analysis.started',
          description: 'Analysis event',
          attributes: {
            'file.count': { type: 'number', required: true },
          },
        },
        otel: {
          scope: 'validation',
          files: ['src/validation/analyzer.ts'],
        },
      },
    };

    const newFormat = {
      type: 'otel-event',
      id: 'analysis-started',
      x: 100,
      y: 100,
      width: 180,
      height: 80,
      color: '4',
      label: 'Analysis Started',
      event: {
        name: 'analysis.started',
        attributes: {
          'file.count': { type: 'number', required: true, description: 'Number of files' },
        },
      },
      otel: {
        status: 'implemented',
        scope: 'validation',
        files: ['src/validation/analyzer.ts'],
      },
    };

    return (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
          <h1 style={{ marginBottom: '24px' }}>Format Comparison</h1>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <h2 style={{ marginBottom: '16px', color: '#dc3545' }}>
                Old Format (current)
              </h2>
              <ul style={{ marginBottom: '16px', color: '#666' }}>
                <li>
                  <code>type: "text"</code> - not semantic
                </li>
                <li>
                  <code>text</code> field - duplicates pv.name
                </li>
                <li>
                  <code>pv</code> wrapper - extra nesting
                </li>
                <li>
                  <code>pv.description</code> - duplicates event.description
                </li>
              </ul>
              <pre
                style={{
                  backgroundColor: '#1e1e1e',
                  color: '#d4d4d4',
                  padding: '16px',
                  borderRadius: '4px',
                  overflow: 'auto',
                  fontSize: '12px',
                  lineHeight: '1.5',
                }}
              >
                {JSON.stringify(oldFormat, null, 2)}
              </pre>
            </div>

            <div>
              <h2 style={{ marginBottom: '16px', color: '#28a745' }}>
                New Format (proposed)
              </h2>
              <ul style={{ marginBottom: '16px', color: '#666' }}>
                <li>
                  <code>type: "otel-event"</code> - semantic
                </li>
                <li>
                  <code>label</code> - single display field
                </li>
                <li>No <code>pv</code> wrapper - flat structure</li>
                <li>
                  <code>otel</code> - instrumentation metadata only
                </li>
              </ul>
              <pre
                style={{
                  backgroundColor: '#1e1e1e',
                  color: '#d4d4d4',
                  padding: '16px',
                  borderRadius: '4px',
                  overflow: 'auto',
                  fontSize: '12px',
                  lineHeight: '1.5',
                }}
              >
                {JSON.stringify(newFormat, null, 2)}
              </pre>
            </div>
          </div>

          <div style={{ marginTop: '32px', padding: '16px', backgroundColor: '#e8f5e9', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '8px' }}>Key Changes</h3>
            <ul style={{ marginBottom: 0 }}>
              <li><strong>-15 lines</strong> (from 29 to 14 lines)</li>
              <li><strong>No duplication</strong> - single source of truth for label, event name</li>
              <li><strong>Semantic typing</strong> - <code>type</code> describes the node's purpose</li>
              <li><strong>Flat structure</strong> - no more <code>pv.</code> prefix everywhere</li>
            </ul>
          </div>

          <div style={{ marginTop: '32px' }}>
            <h2 style={{ marginBottom: '16px' }}>Node Display: Label + Identifier</h2>
            <p style={{ marginBottom: '16px', color: '#666' }}>
              Each node shows its label plus identifier on the canvas:
            </p>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              {[
                { type: 'otel-event', label: 'Analysis Started', identifier: 'analysis.started' },
                { type: 'otel-span-convention', label: 'Validation Ops', identifier: 'validate.*' },
                { type: 'otel-scope', label: 'Validation', identifier: 'validation' },
                { type: 'otel-resource', label: 'CLI Service', identifier: 'service.name: pv.cli' },
                { type: 'otel-boundary', label: 'GitHub Webhook', identifier: 'inbound' },
              ].map((n, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 20px',
                    backgroundColor: '#fff',
                    border: '2px solid #ddd',
                    borderRadius: '8px',
                    textAlign: 'center',
                    minWidth: '140px',
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#999', marginBottom: '4px' }}>{n.type}</div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{n.label}</div>
                  <div style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace', marginTop: '4px' }}>
                    {n.identifier}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ThemeProvider>
    );
  },
};

/**
 * Interactive workflow example using the new node types.
 */
export const WorkflowExample: StoryObj = {
  render: () => {
    const workflowCanvas = adaptNewFormatToCurrentFormat({
      nodes: [
        {
          type: 'otel-scope',
          id: 'validation-scope',
          x: 50,
          y: 50,
          width: 160,
          height: 70,
          color: '6',
          label: 'Validation',
          description: 'Validation instrumentation scope',
          otel: { status: 'implemented', scope: 'validation' },
        },
        {
          type: 'otel-event',
          id: 'validation-started',
          x: 250,
          y: 50,
          width: 160,
          height: 70,
          color: '4',
          label: 'Validation Started',
          event: { name: 'validation.started', attributes: {} },
          otel: { status: 'implemented', scope: 'validation' },
        },
        {
          type: 'otel-event',
          id: 'file-parsed',
          x: 450,
          y: 50,
          width: 160,
          height: 70,
          color: '4',
          label: 'File Parsed',
          event: {
            name: 'validation.file.parsed',
            attributes: { 'file.path': { type: 'string', required: true } },
          },
          otel: { status: 'implemented', scope: 'validation' },
        },
        {
          type: 'otel-event',
          id: 'validation-complete',
          x: 650,
          y: 50,
          width: 160,
          height: 70,
          color: '4',
          label: 'Validation Complete',
          event: {
            name: 'validation.complete',
            attributes: { 'error.count': { type: 'number', required: true } },
          },
          otel: { status: 'implemented', scope: 'validation' },
        },
        {
          type: 'otel-span-convention',
          id: 'validate-span',
          x: 350,
          y: 170,
          width: 180,
          height: 70,
          color: '5',
          label: 'validate.*',
          description: 'All validation operation spans',
          otel: { status: 'approved', spanPattern: 'validate.*', spanKind: 'INTERNAL' },
        },
      ],
      edges: [
        { id: 'e1', fromNode: 'validation-scope', toNode: 'validation-started', fromSide: 'right', toSide: 'left' },
        { id: 'e2', fromNode: 'validation-started', toNode: 'file-parsed', fromSide: 'right', toSide: 'left' },
        { id: 'e3', fromNode: 'file-parsed', toNode: 'validation-complete', fromSide: 'right', toSide: 'left' },
        { id: 'e4', fromNode: 'validate-span', toNode: 'file-parsed', fromSide: 'top', toSide: 'bottom', label: 'governs' },
      ],
      pv: {
        version: '1.0.0',
        name: 'Validation Workflow',
      },
    } as { nodes: NewFormatNode[]; edges: unknown[]; pv: unknown });

    return (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ width: '100%', height: '400px' }}>
          <GraphRenderer canvas={workflowCanvas} library={libraryWithScopes} initialViewport={{ x: 20, y: 50, zoom: 1 }} />
        </div>
      </ThemeProvider>
    );
  },
};
