/**
 * ELK (Eclipse Layout Kernel) Layout Utility
 *
 * Provides sophisticated edge routing with orthogonal (circuit-board style) paths
 * that don't overlap and run parallel to each other.
 */

import ELK, { type ElkNode, type ElkExtendedEdge, type LayoutOptions } from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';

/** ELK layout options for different routing styles */
export type ElkRoutingStyle = 'orthogonal' | 'splines' | 'polyline';

/** Options for ELK layout */
export interface ElkLayoutOptions {
  /**
   * Edge routing style
   * - 'orthogonal': Circuit-board style with 90-degree angles (default)
   * - 'splines': Smooth curved edges
   * - 'polyline': Straight line segments
   */
  routingStyle?: ElkRoutingStyle;

  /**
   * Whether to preserve manual node positions
   * If true, only edge routing is computed
   * If false, ELK will also position nodes
   * @default true
   */
  preserveNodePositions?: boolean;

  /**
   * Minimum spacing between nodes
   * @default 50
   */
  nodeSpacing?: number;

  /**
   * Minimum spacing between edges
   * @default 8
   */
  edgeSpacing?: number;

  /**
   * Spacing between edge and node
   * @default 10
   */
  edgeNodeSpacing?: number;

  /**
   * Minimum horizontal distance between layers (node-to-node across layers).
   * Controls the gap that prevents nodes in adjacent layers from overlapping.
   * @default 0
   */
  interLayerSpacing?: number;

  /**
   * Reserve space along edges for inline labels so they don't overlap nodes
   * or other edges. When enabled ELK places labels inline on the edge with the
   * given margin model.
   */
  edgeLabels?: {
    /** Whether to reserve label space in the layout. @default true */
    enabled?: boolean;
    /** Placement of inline labels. @default 'CENTER' */
    placement?: 'CENTER' | 'TAIL' | 'HEAD';
  };

  /**
   * Layout direction
   * @default 'RIGHT'
   */
  direction?: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP';

  /**
   * Compound groups — each becomes a nested ELK parent whose `memberIds`
   * are laid out inside it. Members reference the group via React Flow
   * `parentId`; ELK returns parent-relative child positions which this
   * module flattens back to absolute flow coordinates.
   */
  groups?: Array<{ id: string; memberIds: string[] }>;
}

/** Result of ELK layout computation */
export interface ElkLayoutResult {
  /** Nodes with updated positions (if preserveNodePositions is false) */
  nodes: Node[];
  /** Edge paths as SVG path strings, keyed by edge ID */
  edgePaths: Map<string, string>;
  /** Edge label positions, keyed by edge ID */
  edgeLabelPositions: Map<string, { x: number; y: number }>;
  /** Raw ELK path points per edge (for debugging). */
  edgePathPoints: Map<string, Point[]>;
  /** Compound parent bounds from ELK (absolute flow coords), keyed by group id. */
  groupBounds: Map<string, { x: number; y: number; width: number; height: number }>;
}

/** Point in 2D space */
export interface Point {
  x: number;
  y: number;
}

/** ELK edge section with bend points */
interface ElkEdgeSection {
  id: string;
  startPoint: Point;
  endPoint: Point;
  bendPoints?: Point[];
}

/** Extended ELK edge with sections */
interface ElkEdgeWithSections extends ElkExtendedEdge {
  sections?: ElkEdgeSection[];
  /** Id of the compound node whose coordinate frame sections/labels use. */
  container?: string;
}

// Create ELK instance lazily to avoid issues in test environments
let elkInstance: InstanceType<typeof ELK> | null = null;

function getElkInstance(): InstanceType<typeof ELK> {
  if (!elkInstance) {
    elkInstance = new ELK();
  }
  return elkInstance;
}

/**
 * Convert bend points to SVG path string
 * @public Exported for testing
 */
export function pointsToPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }
  return path;
}

/**
 * Convert bend points to smooth orthogonal path with rounded corners
 * @public Exported for testing
 */
export function pointsToSmoothPath(points: Point[], cornerRadius: number = 8): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    // Calculate distances
    const d1 = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
    const d2 = Math.sqrt(Math.pow(next.x - curr.x, 2) + Math.pow(next.y - curr.y, 2));

    // Limit corner radius to half the shorter segment
    const maxRadius = Math.min(d1, d2) / 2;
    const radius = Math.min(cornerRadius, maxRadius);

    if (radius < 1) {
      // Too short for curve, just draw line
      path += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    // Calculate direction vectors
    const dir1 = { x: (curr.x - prev.x) / d1, y: (curr.y - prev.y) / d1 };
    const dir2 = { x: (next.x - curr.x) / d2, y: (next.y - curr.y) / d2 };

    // Calculate arc start and end points
    const arcStart = {
      x: curr.x - dir1.x * radius,
      y: curr.y - dir1.y * radius,
    };
    const arcEnd = {
      x: curr.x + dir2.x * radius,
      y: curr.y + dir2.y * radius,
    };

    // Draw line to arc start, then quadratic curve to arc end
    path += ` L ${arcStart.x} ${arcStart.y}`;
    path += ` Q ${curr.x} ${curr.y} ${arcEnd.x} ${arcEnd.y}`;
  }

  // Final line to last point
  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;

  return path;
}

/**
 * Calculate the midpoint of a path for label positioning
 * @public Exported for testing
 */
export function calculatePathMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  // Calculate total path length
  let totalLength = 0;
  const segmentLengths: number[] = [];

  for (let i = 1; i < points.length; i++) {
    const len = Math.sqrt(
      Math.pow(points[i].x - points[i - 1].x, 2) + Math.pow(points[i].y - points[i - 1].y, 2)
    );
    segmentLengths.push(len);
    totalLength += len;
  }

  // Find midpoint
  const targetLength = totalLength / 2;
  let currentLength = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    if (currentLength + segmentLengths[i] >= targetLength) {
      // Midpoint is on this segment
      const remaining = targetLength - currentLength;
      const ratio = remaining / segmentLengths[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
        y: points[i].y + (points[i + 1].y - points[i].y) * ratio,
      };
    }
    currentLength += segmentLengths[i];
  }

  // Fallback to last point
  return points[points.length - 1];
}

/**
 * Closest point on a polyline to a target (for snapping labels onto the stroke).
 */
export function closestPointOnPath(points: Point[], target: Point): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  let best = points[0];
  let bestDist = Infinity;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / lenSq));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const dist = Math.hypot(target.x - px, target.y - py);
    if (dist < bestDist) {
      bestDist = dist;
      best = { x: px, y: py };
    }
  }

  return best;
}

/**
 * Polyline length in flow-space units (sum of segment lengths).
 * @public Exported for testing
 */
export function calculatePathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/**
 * Get ELK layout options based on configuration
 */
function getElkOptions(options: ElkLayoutOptions): LayoutOptions {
  const {
    routingStyle = 'orthogonal',
    nodeSpacing = 50,
    edgeSpacing = 8,
    edgeNodeSpacing = 10,
    interLayerSpacing = 0,
    edgeLabels,
    direction = 'RIGHT',
  } = options;

  const baseOptions: LayoutOptions = {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    // Spacing
    'elk.spacing.nodeNode': String(nodeSpacing),
    'elk.spacing.edgeEdge': String(edgeSpacing),
    'elk.spacing.edgeNode': String(edgeNodeSpacing),
    'elk.layered.spacing.edgeEdgeBetweenLayers': String(edgeSpacing),
    'elk.layered.spacing.edgeNodeBetweenLayers': String(edgeNodeSpacing),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(interLayerSpacing),
    // Port constraints - edges connect at specific sides
    'elk.portConstraints': 'FIXED_SIDE',
    // Improve orthogonal routing quality
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    // Merge edges going same direction for cleaner routing
    'elk.layered.mergeEdges': 'true',
    // Higher thoroughness = better edge routing (1-100)
    'elk.layered.thoroughness': '50',
  };

  // Reserve space for inline edge labels so they don't overlap nodes/edges.
  if (edgeLabels?.enabled !== false) {
    const placement = edgeLabels?.placement ?? 'CENTER';
    baseOptions['elk.edgeLabels.inline'] = 'true';
    baseOptions['elk.edgeLabels.inlinePlacement'] = placement;
    baseOptions['elk.layered.edgeLabels.centerLabelPlacementStrategy'] = 'CENTER_LAYER';
  }

  // Set edge routing style
  switch (routingStyle) {
    case 'orthogonal':
      baseOptions['elk.edgeRouting'] = 'ORTHOGONAL';
      break;
    case 'splines':
      baseOptions['elk.edgeRouting'] = 'SPLINES';
      break;
    case 'polyline':
      baseOptions['elk.edgeRouting'] = 'POLYLINE';
      break;
  }

  return baseOptions;
}

/**
 * Compute ELK layout for nodes and edges
 *
 * @param nodes - xyflow nodes
 * @param edges - xyflow edges
 * @param options - Layout options
 * @returns Layout result with edge paths
 */
export async function computeElkLayout(
  nodes: Node[],
  edges: Edge[],
  options: ElkLayoutOptions = {}
): Promise<ElkLayoutResult> {
  const { preserveNodePositions = true } = options;
  const edgeLabels = options.edgeLabels;
  const direction = options.direction ?? 'RIGHT';

  // Build a map of original node positions BEFORE passing to ELK
  // (ELK mutates the input nodes in place, so we must save positions first)
  const originalPositions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    originalPositions.set(node.id, { x: node.position.x, y: node.position.y });
  }

  // Convert nodes to ELK format with ports for clean edge routing
  const elkNodes: ElkNode[] = nodes.map((node) => {
    const width = node.measured?.width ?? node.width ?? 200;
    const height = node.measured?.height ?? node.height ?? 100;

    // Optional explicit layout layer, read from node data (e.g. our subsystem
    // components carry `data.component.layer`). Forces ELK to place the node in
    // that layer so the graph reads as a pipeline rather than a guess.
    let layer: number | undefined;
    const nd = node.data as { component?: { layer?: number }; layer?: number } | undefined;
    layer = nd?.layer ?? nd?.component?.layer;

    return {
      id: node.id,
      width,
      height,
      x: node.position.x,
      y: node.position.y,
      // Add ports on each side for edge connections
      ports: [
        { id: `${node.id}_top`, properties: { 'port.side': 'NORTH' } },
        { id: `${node.id}_right`, properties: { 'port.side': 'EAST' } },
        { id: `${node.id}_bottom`, properties: { 'port.side': 'SOUTH' } },
        { id: `${node.id}_left`, properties: { 'port.side': 'WEST' } },
      ],
      properties: {
        'portConstraints': 'FIXED_SIDE',
        ...(layer !== undefined ? { 'layering.layer': String(layer) } : {}),
      },
    };
  });

  // Map handle name to port suffix
  // Handles may have suffixes like "-out" (e.g., "right-out" for source handles)
  const handleToPortSuffix = (handle: string | null | undefined): string | null => {
    if (!handle) return null;
    // Remove -out or -in suffix if present
    const h = handle.toLowerCase().replace(/-out$/, '').replace(/-in$/, '');
    if (h === 'top' || h === 'north') return 'top';
    if (h === 'bottom' || h === 'south') return 'bottom';
    if (h === 'left' || h === 'west') return 'left';
    if (h === 'right' || h === 'east') return 'right';
    return null;
  };

  // Determine which port to use - prefer explicit handles, fallback to position-based
  const getPortSide = (
    sourceId: string,
    targetId: string,
    sourceHandle?: string | null,
    targetHandle?: string | null
  ): { sourcePort: string; targetPort: string } => {
    // Try to use explicit handles first
    const sourceSuffix = handleToPortSuffix(sourceHandle);
    const targetSuffix = handleToPortSuffix(targetHandle);

    if (sourceSuffix && targetSuffix) {
      return {
        sourcePort: `${sourceId}_${sourceSuffix}`,
        targetPort: `${targetId}_${targetSuffix}`,
      };
    }

    // When ELK repositions nodes (preserveNodePositions=false), the initial
    // grid positions are unreliable — use the layout direction instead.
    if (!preserveNodePositions) {
      switch (direction) {
        case 'RIGHT': return { sourcePort: `${sourceId}_right`, targetPort: `${targetId}_left` };
        case 'LEFT':  return { sourcePort: `${sourceId}_left`,  targetPort: `${targetId}_right` };
        case 'DOWN':  return { sourcePort: `${sourceId}_bottom`, targetPort: `${targetId}_top` };
        case 'UP':    return { sourcePort: `${sourceId}_top`,    targetPort: `${targetId}_bottom` };
      }
    }

    // Fallback to position-based calculation (for preserveNodePositions=true)
    const sourcePos = originalPositions.get(sourceId);
    const targetPos = originalPositions.get(targetId);

    if (!sourcePos || !targetPos) {
      return { sourcePort: `${sourceId}_right`, targetPort: `${targetId}_left` };
    }

    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;

    // Determine primary direction
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal movement dominates
      if (dx > 0) {
        return { sourcePort: `${sourceId}_right`, targetPort: `${targetId}_left` };
      } else {
        return { sourcePort: `${sourceId}_left`, targetPort: `${targetId}_right` };
      }
    } else {
      // Vertical movement dominates
      if (dy > 0) {
        return { sourcePort: `${sourceId}_bottom`, targetPort: `${targetId}_top` };
      } else {
        return { sourcePort: `${sourceId}_top`, targetPort: `${targetId}_bottom` };
      }
    }
  };

  // Track routing direction for each edge (true = horizontal-first, false = vertical-first)
  const edgeRoutingDirection = new Map<string, boolean>();

  // Convert edges to ELK format with port references
  const elkEdges: ElkExtendedEdge[] = edges.map((edge) => {
    const { sourcePort, targetPort } = getPortSide(
      edge.source,
      edge.target,
      edge.sourceHandle,
      edge.targetHandle
    );

    // Determine routing direction based on source port
    // right/left ports = horizontal-first, top/bottom ports = vertical-first
    const isHorizontalFirst = sourcePort.endsWith('_right') || sourcePort.endsWith('_left');
    edgeRoutingDirection.set(edge.id, isHorizontalFirst);

    const elkEdge: ElkExtendedEdge = {
      id: edge.id,
      sources: [sourcePort],
      targets: [targetPort],
    };
    // Estimated label size so ELK reserves room to render the inline label
    // without it overlapping nodes or sibling edges.
    if (edgeLabels?.enabled !== false && typeof edge.label === 'string') {
      const text = edge.label;
      const labelWidth = Math.max(20, text.length * 7); // ~7px per mono char
      const labelHeight = 14;
      elkEdge.labels = [{ text, width: labelWidth, height: labelHeight }];
    }
    return elkEdge;
  });

  // Partition leaf nodes into compound parents when groups are given.
  // Group shells themselves are NOT part of `nodes` — they are reconstructed
  // by the caller from `groupBounds`. Only leaf ids in `memberIds` nest.
  const groupDefs = (options.groups ?? []).filter((g) => g.memberIds.length > 0);
  const memberToGroup = new Map<string, string>();
  const groupedLeafIds = new Set<string>();
  for (const g of groupDefs) {
    for (const mid of g.memberIds) {
      if (!memberToGroup.has(mid)) {
        memberToGroup.set(mid, g.id);
        groupedLeafIds.add(mid);
      }
    }
  }
  const elkById = new Map(elkNodes.map((n) => [n.id, n]));
  const ungroupedElkNodes: ElkNode[] = [];
  for (const n of elkNodes) {
    if (!groupedLeafIds.has(n.id)) ungroupedElkNodes.push(n);
  }
  const elkParents: ElkNode[] = [];
  for (const g of groupDefs) {
    const children = g.memberIds
      .map((mid) => elkById.get(mid))
      .filter((n): n is ElkNode => !!n);
    // Skip groups with <2 real members — a single-child frame adds noise;
    // the caller drops the shell and leaves the node top-level.
    if (children.length < 2) {
      for (const c of children) ungroupedElkNodes.push(c);
      memberToGroup.delete(g.memberIds[0]);
      groupedLeafIds.delete(g.memberIds[0]);
      continue;
    }
    elkParents.push({
      id: g.id,
      children,
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': direction,
        'elk.padding': '[top=48,left=24,bottom=24,right=24]',
        'elk.spacing.nodeNode': '40',
      },
    });
  }

  // Create ELK graph
  const rootOptions = getElkOptions(options);
  if (elkParents.length > 0) {
    rootOptions['elk.hierarchyHandling'] = 'INCLUDE_CHILDREN';
  }
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: rootOptions,
    children: [...ungroupedElkNodes, ...elkParents],
    edges: elkEdges,
  };

  // Run ELK layout
  const layoutedGraph = await getElkInstance().layout(elkGraph);

  // Build maps of ELK-computed positions. Nested children report
  // parent-relative coords — flatten to absolute for edges, and keep the
  // relative form for React Flow children (whose position is parent-relative).
  // Absolute offset of every ELK node (parents included), accumulated down
  // the ancestor chain — edge sections/labels are relative to their
  // `container`, so each edge needs its container's absolute offset.
  const elkAbsOffsets = new Map<string, { x: number; y: number }>();
  const elkPositions = new Map<string, { x: number; y: number }>();
  const elkRelativePositions = new Map<string, { x: number; y: number }>();
  const groupBounds = new Map<string, { x: number; y: number; width: number; height: number }>();
  const walkElk = (n: ElkNode, ox: number, oy: number) => {
    const ax = ox + (n.x ?? 0);
    const ay = oy + (n.y ?? 0);
    elkAbsOffsets.set(n.id, { x: ax, y: ay });
    for (const c of n.children ?? []) walkElk(c, ax, ay);
  };
  walkElk(layoutedGraph, 0, 0);
  if (layoutedGraph.children) {
    for (const child of layoutedGraph.children) {
      if (child.children && child.children.length > 0 && groupDefs.some((g) => g.id === child.id)) {
        const gx = child.x ?? 0;
        const gy = child.y ?? 0;
        groupBounds.set(child.id, {
          x: gx,
          y: gy,
          width: child.width ?? 0,
          height: child.height ?? 0,
        });
        for (const grand of child.children) {
          const rx = grand.x ?? 0;
          const ry = grand.y ?? 0;
          elkRelativePositions.set(grand.id, { x: rx, y: ry });
          elkPositions.set(grand.id, { x: gx + rx, y: gy + ry });
        }
      } else {
        elkPositions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
        elkRelativePositions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
      }
    }
  }

  // Extract results
  const edgePaths = new Map<string, string>();
  const edgeLabelPositions = new Map<string, { x: number; y: number }>();
  const edgePathPoints = new Map<string, Point[]>();

  // Process edges
  if (layoutedGraph.edges) {
    for (const edge of layoutedGraph.edges as ElkEdgeWithSections[]) {
      if (edge.sections && edge.sections.length > 0) {
        // Get source and target nodes for this edge
        const sourceId = edges.find(e => e.id === edge.id)?.source;
        const targetId = edges.find(e => e.id === edge.id)?.target;

        // Calculate offset needed to translate from ELK positions to original positions
        // We need to figure out which node each point is closest to and offset accordingly
        const sourceOriginal = sourceId ? originalPositions.get(sourceId) : null;
        const sourceElk = sourceId ? elkPositions.get(sourceId) : null;
        const targetOriginal = targetId ? originalPositions.get(targetId) : null;
        const targetElk = targetId ? elkPositions.get(targetId) : null;

        // Collect all points from sections. Sections (and labels) are
        // relative to the edge's `container` — intra-group edges live in
        // the parent's frame, so translate to root-absolute flow coords.
        const containerOffset = elkAbsOffsets.get(edge.container ?? 'root') ?? { x: 0, y: 0 };
        const allPoints: Point[] = [];

        for (const section of edge.sections) {
          allPoints.push(section.startPoint);
          if (section.bendPoints) {
            allPoints.push(...section.bendPoints);
          }
          allPoints.push(section.endPoint);
        }
        if (containerOffset.x !== 0 || containerOffset.y !== 0) {
          for (const p of allPoints) {
            p.x += containerOffset.x;
            p.y += containerOffset.y;
          }
        }

        // If preserving positions, we need to offset the edge points
        // The edge path is relative to ELK's layout, so we translate it
        if (preserveNodePositions && sourceOriginal && sourceElk && targetOriginal && targetElk) {
          // Calculate the offset from ELK space to original space
          const sourceOffset = {
            x: sourceOriginal.x - sourceElk.x,
            y: sourceOriginal.y - sourceElk.y,
          };
          const targetOffset = {
            x: targetOriginal.x - targetElk.x,
            y: targetOriginal.y - targetElk.y,
          };

          // For orthogonal routing, use index-based offset assignment
          // First point uses source offset, last point uses target offset
          // Middle points use offset based on their position in the path
          const lastIdx = allPoints.length - 1;
          for (let i = 0; i < allPoints.length; i++) {
            // Use path position (index) for interpolation instead of X position
            // This preserves orthogonal segment shapes
            const t = lastIdx > 0 ? i / lastIdx : 0;
            allPoints[i] = {
              x: allPoints[i].x + sourceOffset.x + (targetOffset.x - sourceOffset.x) * t,
              y: allPoints[i].y + sourceOffset.y + (targetOffset.y - sourceOffset.y) * t,
            };
          }
        }

        // Use ELK's native label position (it accounts for node avoidance)
        // and apply the same coordinate offset.
        if (edge.labels && edge.labels.length > 0) {
          const elkLabel = edge.labels[0];
          // ELK reports the label's top-left; convert to center so screen-space
          // overlays can anchor with translate(-50%, -50%) at any zoom.
          let lx = (elkLabel.x ?? 0) + (elkLabel.width ?? 0) / 2 + containerOffset.x;
          let ly = (elkLabel.y ?? 0) + (elkLabel.height ?? 0) / 2 + containerOffset.y;
          if (preserveNodePositions && sourceOriginal && sourceElk && targetOriginal && targetElk) {
            const sourceOffset = {
              x: sourceOriginal.x - sourceElk.x,
              y: sourceOriginal.y - sourceElk.y,
            };
            const targetOffset = {
              x: targetOriginal.x - targetElk.x,
              y: targetOriginal.y - targetElk.y,
            };
            // Interpolate offset based on label position along the edge
            const startX = allPoints[0].x;
            const endX = allPoints[allPoints.length - 1].x;
            const rangeX = Math.abs(endX - startX) || 1;
            const t = Math.min(1, Math.max(0, Math.abs(lx - startX) / rangeX));
            lx += sourceOffset.x + (targetOffset.x - sourceOffset.x) * t;
            ly += sourceOffset.y + (targetOffset.y - sourceOffset.y) * t;
          }
          // Snap onto the polyline stroke. ELK's label box can sit slightly
          // off the route (side selection / reserved label space); we keep
          // its along-edge placement but center on the actual path.
          const onPath = closestPointOnPath(allPoints, { x: lx, y: ly });
          edgeLabelPositions.set(edge.id, onPath);
        }

        // For orthogonal routing with preserved positions, the offset can distort
        // ELK's bend points, so we rebuild the path. Otherwise, use ELK's bends
        // as-is since they already account for label placement and node avoidance.
        if (options.routingStyle === 'orthogonal' && preserveNodePositions) {
          const start = allPoints[0];
          const end = allPoints[allPoints.length - 1];
          const dx = Math.abs(end.x - start.x);
          const dy = Math.abs(end.y - start.y);

          // Get the routing direction for this edge
          const isHorizontalFirst = edgeRoutingDirection.get(edge.id) ?? true;

          // Clear intermediate points and regenerate orthogonal path
          allPoints.length = 0;
          allPoints.push(start);

          // If not aligned horizontally or vertically, insert bend points
          if (dx > 1 && dy > 1) {
            if (isHorizontalFirst) {
              // Horizontal-first: go right/left, then up/down (for left/right port connections)
              const midX = (start.x + end.x) / 2;
              allPoints.push({ x: midX, y: start.y });
              allPoints.push({ x: midX, y: end.y });
            } else {
              // Vertical-first: go up/down, then right/left (for top/bottom port connections)
              const midY = (start.y + end.y) / 2;
              allPoints.push({ x: start.x, y: midY });
              allPoints.push({ x: end.x, y: midY });
            }
          }

          allPoints.push(end);
        }

        // Convert to path
        const path =
          options.routingStyle === 'orthogonal'
            ? pointsToSmoothPath(allPoints, 8)
            : pointsToPath(allPoints);

        edgePaths.set(edge.id, path);
        edgePathPoints.set(edge.id, [...allPoints]);
      }
    }
  }

  // Process nodes (update positions if not preserving). Grouped children use
  // parent-relative coords (React Flow child semantics); everything else uses
  // absolute coords.
  const resultNodes = preserveNodePositions
    ? nodes
    : nodes.map((node) => {
        const rel = elkRelativePositions.get(node.id);
        if (rel) {
          return {
            ...node,
            position: { x: rel.x, y: rel.y },
          };
        }
        return node;
      });

  return {
    nodes: resultNodes,
    edgePaths,
    edgeLabelPositions,
    edgePathPoints,
    groupBounds,
  };
}

/**
 * Hook-friendly version that returns a layout function
 */
export function createElkLayouter(options: ElkLayoutOptions = {}) {
  return (nodes: Node[], edges: Edge[]) => computeElkLayout(nodes, edges, options);
}
