/**
 * Trace to Canvas Converter
 *
 * Converts OpenTelemetry trace data (captured from test runs) into
 * ExtendedCanvas format for visualization.
 */

import type {
  ExtendedCanvas,
  ExtendedCanvasTextNode,
  ExtendedCanvasGroupNode,
  ExtendedCanvasEdge,
  PVNodeShape,
} from '../types/canvas';
import type { OtelSpanKind } from '../types/otel';

// ============================================================================
// Input Types (matches test setup output)
// ============================================================================

/**
 * Span data as exported from test runs
 */
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  name: string;
  kind: string;
  startTime: number;
  endTime: number;
  duration: number;
  resource?: Record<string, string | number | boolean>;
  attributes?: Record<string, string | number | boolean>;
  status?: {
    code: string;
    message?: string;
  };
  events?: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, string | number | boolean>;
  }>;
}

/**
 * Trace export format (from test setup)
 */
export interface TraceExport {
  exportedAt: string;
  serviceName: string;
  spanCount: number;
  spans: TraceSpan[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Options for trace-to-canvas conversion
 */
export interface TraceToCanvasOptions {
  /** Group spans by service into container nodes */
  groupByService?: boolean;

  /** Layout algorithm */
  layout?: 'hierarchical' | 'timeline';

  /** Node dimensions */
  nodeWidth?: number;
  nodeHeight?: number;

  /** Spacing between nodes */
  horizontalSpacing?: number;
  verticalSpacing?: number;

  /** Include span attributes in node data */
  includeAttributes?: boolean;

  /** Filter spans by minimum duration (ms) */
  minDurationMs?: number;

  /** Custom colors by span kind */
  kindColors?: Partial<Record<OtelSpanKind, string>>;
}

const DEFAULT_OPTIONS: Required<TraceToCanvasOptions> = {
  groupByService: true,
  layout: 'hierarchical',
  nodeWidth: 200,
  nodeHeight: 60,
  horizontalSpacing: 50,
  verticalSpacing: 80,
  includeAttributes: true,
  minDurationMs: 0,
  kindColors: {
    SERVER: '#4f46e5', // Indigo
    CLIENT: '#0891b2', // Cyan
    PRODUCER: '#059669', // Emerald
    CONSUMER: '#059669', // Emerald
    INTERNAL: '#6b7280', // Gray
  },
};

// ============================================================================
// Conversion Logic
// ============================================================================

/**
 * Map span kind to node shape
 */
function kindToShape(kind: string): PVNodeShape {
  const shapes: Record<string, PVNodeShape> = {
    SERVER: 'hexagon',
    CLIENT: 'diamond',
    PRODUCER: 'rectangle',
    CONSUMER: 'rectangle',
    INTERNAL: 'circle',
  };
  return shapes[kind] ?? 'rectangle';
}

/**
 * Get service name from span resource
 */
function getServiceName(span: TraceSpan): string {
  return (span.resource?.['service.name'] as string) ?? 'unknown';
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Group spans by trace ID
 */
function groupByTraceId(spans: TraceSpan[]): Map<string, TraceSpan[]> {
  const traces = new Map<string, TraceSpan[]>();
  for (const span of spans) {
    const existing = traces.get(span.traceId) ?? [];
    existing.push(span);
    traces.set(span.traceId, existing);
  }
  return traces;
}

/**
 * Build a tree structure from spans
 */
interface SpanTree {
  span: TraceSpan;
  children: SpanTree[];
  depth: number;
  index: number;
}

function buildSpanTree(spans: TraceSpan[]): SpanTree[] {
  const spanMap = new Map(spans.map((s) => [s.spanId, s]));
  const childMap = new Map<string | undefined, TraceSpan[]>();

  // Group by parent
  for (const span of spans) {
    const parentId = span.parentSpanId ?? undefined;
    const siblings = childMap.get(parentId) ?? [];
    siblings.push(span);
    childMap.set(parentId, siblings);
  }

  // Build tree recursively
  function buildNode(span: TraceSpan, depth: number, index: number): SpanTree {
    const children = (childMap.get(span.spanId) ?? [])
      .sort((a, b) => a.startTime - b.startTime)
      .map((child, i) => buildNode(child, depth + 1, i));
    return { span, children, depth, index };
  }

  // Find roots (spans with no parent or parent not in this trace)
  const roots = spans.filter((s) => !s.parentSpanId || !spanMap.has(s.parentSpanId));

  return roots.sort((a, b) => a.startTime - b.startTime).map((root, i) => buildNode(root, 0, i));
}

/**
 * Calculate hierarchical layout positions
 */
interface LayoutPosition {
  x: number;
  y: number;
}

function calculateHierarchicalLayout(
  trees: SpanTree[],
  options: Required<TraceToCanvasOptions>
): Map<string, LayoutPosition> {
  const positions = new Map<string, LayoutPosition>();
  const { nodeWidth, nodeHeight, horizontalSpacing, verticalSpacing } = options;

  // Track width at each depth level
  const depthWidths = new Map<number, number>();

  function layoutNode(node: SpanTree, offsetX: number): number {
    const { span, children, depth } = node;

    // Get current x position for this depth
    const currentX = depthWidths.get(depth) ?? offsetX;
    const y = depth * (nodeHeight + verticalSpacing);

    if (children.length === 0) {
      // Leaf node
      positions.set(span.spanId, { x: currentX, y });
      depthWidths.set(depth, currentX + nodeWidth + horizontalSpacing);
      return currentX + nodeWidth / 2;
    }

    // Layout children first
    const childCenters: number[] = [];
    for (const child of children) {
      const center = layoutNode(child, currentX);
      childCenters.push(center);
    }

    // Center parent above children
    const minCenter = Math.min(...childCenters);
    const maxCenter = Math.max(...childCenters);
    const parentCenter = (minCenter + maxCenter) / 2;
    const parentX = parentCenter - nodeWidth / 2;

    positions.set(span.spanId, { x: Math.max(currentX, parentX), y });

    // Update depth width if needed
    const newWidth = Math.max(depthWidths.get(depth) ?? 0, parentX + nodeWidth + horizontalSpacing);
    depthWidths.set(depth, newWidth);

    return parentCenter;
  }

  // Layout each tree
  let offsetX = 0;
  for (const tree of trees) {
    layoutNode(tree, offsetX);
    // Add gap between traces
    offsetX = Math.max(...Array.from(depthWidths.values())) + horizontalSpacing;
  }

  return positions;
}

/**
 * Convert a single span to a canvas node
 */
function spanToNode(
  span: TraceSpan,
  position: LayoutPosition,
  options: Required<TraceToCanvasOptions>
): ExtendedCanvasTextNode {
  const { nodeWidth, nodeHeight, kindColors, includeAttributes } = options;
  const statusCode = span.status?.code ?? 'UNSET';

  return {
    id: span.spanId,
    type: 'text',
    x: position.x,
    y: position.y,
    width: nodeWidth,
    height: nodeHeight,
    text: span.name,
    color: statusCode === 'ERROR' ? 1 : undefined, // Red for errors
    pv: {
      nodeType: 'span',
      name: span.name,
      description: formatDuration(span.duration),
      shape: kindToShape(span.kind),
      fill: statusCode === 'ERROR' ? '#ef4444' : kindColors[span.kind as OtelSpanKind],
      states: {
        [statusCode]: {
          color: statusCode === 'OK' ? '#22c55e' : statusCode === 'ERROR' ? '#ef4444' : '#6b7280',
          label: statusCode,
        },
      },
      otel: {
        kind: 'instance',
        category: 'span',
      },
      ...(includeAttributes && span.attributes && Object.keys(span.attributes).length > 0
        ? {
            dataSchema: Object.fromEntries(
              Object.entries(span.attributes).map(([key, value]) => [
                key,
                { type: typeof value as 'string' | 'number' | 'boolean', required: false },
              ])
            ),
          }
        : {}),
    },
  };
}

/**
 * Create edge between parent and child span
 */
function createEdge(
  parentSpanId: string,
  childSpanId: string,
  isCrossService: boolean
): ExtendedCanvasEdge {
  return {
    id: `edge-${parentSpanId}-${childSpanId}`,
    fromNode: parentSpanId,
    toNode: childSpanId,
    fromSide: 'bottom',
    toSide: 'top',
    toEnd: 'arrow',
    pv: {
      edgeType: 'span-child',
      style: isCrossService ? 'dashed' : 'solid',
      width: isCrossService ? 2 : 1,
    },
  };
}

/**
 * Create service group node
 */
function createServiceGroup(
  serviceName: string,
  spans: TraceSpan[],
  positions: Map<string, LayoutPosition>,
  options: Required<TraceToCanvasOptions>
): ExtendedCanvasGroupNode | null {
  const serviceSpans = spans.filter((s) => getServiceName(s) === serviceName);
  if (serviceSpans.length === 0) return null;

  const servicePositions = serviceSpans
    .map((s) => positions.get(s.spanId))
    .filter((p): p is LayoutPosition => p !== undefined);

  if (servicePositions.length === 0) return null;

  const minX = Math.min(...servicePositions.map((p) => p.x));
  const maxX = Math.max(...servicePositions.map((p) => p.x));
  const minY = Math.min(...servicePositions.map((p) => p.y));
  const maxY = Math.max(...servicePositions.map((p) => p.y));

  const padding = 20;

  return {
    id: `service-${serviceName}`,
    type: 'group',
    x: minX - padding,
    y: minY - padding - 30, // Extra space for label
    width: maxX - minX + options.nodeWidth + padding * 2,
    height: maxY - minY + options.nodeHeight + padding * 2 + 30,
    label: serviceName,
    pv: {
      nodeType: 'service',
      name: serviceName,
      icon: 'server',
    },
  };
}

// ============================================================================
// Main Conversion Function
// ============================================================================

/**
 * Result of trace-to-canvas conversion
 */
export interface TraceCanvasResult {
  canvas: ExtendedCanvas;
  stats: {
    traceCount: number;
    spanCount: number;
    serviceCount: number;
    maxDepth: number;
  };
}

/**
 * Convert trace export to ExtendedCanvas
 */
export function traceToCanvas(
  traceExport: TraceExport,
  options: TraceToCanvasOptions = {}
): TraceCanvasResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Filter spans by duration
  const spans = traceExport.spans.filter((s) => s.duration >= opts.minDurationMs);

  if (spans.length === 0) {
    return {
      canvas: {
        name: 'Empty Trace',
        nodes: [],
        edges: [],
      },
      stats: {
        traceCount: 0,
        spanCount: 0,
        serviceCount: 0,
        maxDepth: 0,
      },
    };
  }

  // Group by trace and build trees
  const traceGroups = groupByTraceId(spans);
  const allTrees: SpanTree[] = [];
  for (const traceSpans of traceGroups.values()) {
    allTrees.push(...buildSpanTree(traceSpans));
  }

  // Calculate layout
  const positions = calculateHierarchicalLayout(allTrees, opts);

  // Create span nodes
  const spanNodes: ExtendedCanvasTextNode[] = spans.map((span) => {
    const position = positions.get(span.spanId) ?? { x: 0, y: 0 };
    return spanToNode(span, position, opts);
  });

  // Create edges
  const spanMap = new Map(spans.map((s) => [s.spanId, s]));
  const edges: ExtendedCanvasEdge[] = spans
    .filter((span) => span.parentSpanId && spanMap.has(span.parentSpanId))
    .map((span) => {
      const parent = spanMap.get(span.parentSpanId!)!;
      const isCrossService = getServiceName(span) !== getServiceName(parent);
      return createEdge(span.parentSpanId!, span.spanId, isCrossService);
    });

  // Create service groups if enabled
  const serviceGroups: ExtendedCanvasGroupNode[] = [];
  if (opts.groupByService) {
    const services = new Set(spans.map(getServiceName));
    for (const service of services) {
      const group = createServiceGroup(service, spans, positions, opts);
      if (group) serviceGroups.push(group);
    }
  }

  // Calculate stats
  const maxDepth = Math.max(
    ...allTrees.flatMap(function getDepths(tree: SpanTree): number[] {
      return [tree.depth, ...tree.children.flatMap(getDepths)];
    })
  );

  // Build canvas
  const canvas: ExtendedCanvas = {
    name: `Trace: ${traceExport.serviceName}`,
    nodes: [...serviceGroups, ...spanNodes],
    edges,
    pv: {
      description: `Exported at ${traceExport.exportedAt}`,
      nodeTypes: {
        span: {
          description: 'OpenTelemetry span from trace',
          shape: 'rectangle',
        },
        service: {
          description: 'Service grouping',
          icon: 'server',
          shape: 'rectangle',
        },
      },
      edgeTypes: {
        'span-child': {
          label: 'Child span',
          directed: true,
        },
      },
      display: {
        layout: 'manual', // We've already laid out the nodes
        animations: {
          enabled: true,
          speed: 1,
        },
      },
    },
  };

  return {
    canvas,
    stats: {
      traceCount: traceGroups.size,
      spanCount: spans.length,
      serviceCount: new Set(spans.map(getServiceName)).size,
      maxDepth,
    },
  };
}

/**
 * Convert trace export to canvas and return as JSON string
 */
export function traceToCanvasJson(
  traceExport: TraceExport,
  options: TraceToCanvasOptions = {}
): string {
  const { canvas } = traceToCanvas(traceExport, options);
  return JSON.stringify(canvas, null, 2);
}
