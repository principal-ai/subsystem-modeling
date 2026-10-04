/**
 * ELK (Eclipse Layout Kernel) Layout Utility
 *
 * Provides sophisticated edge routing with orthogonal (circuit-board style) paths
 * that don't overlap and run parallel to each other.
 */

import ELK, { type ElkNode, type ElkExtendedEdge, type LayoutOptions } from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';
import {
  EDGE_LABEL_WIDTH,
  EDGE_LABEL_HEIGHT,
  EDGE_LABEL_SIDE_PADDING,
} from './edgeLabel';

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
   * Pull the target end of each edge back from the node border by this many
   * flow px, so the arrowhead tip touches the node without sitting on its
   * border. @default 0
   */
  endpointInset?: number;

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
    /**
     * Width of the reserved label box, in flow px. This is what actually sets
     * the between-layer run for a labelled edge — ELK's CENTER_LAYER creates a
     * label layer of this width, which dominates the layering spacing. Defaults
     * to the shared `EDGE_LABEL_WIDTH`; a caller with shorter labels passes a
     * smaller value to tighten its edges.
     */
    width?: number;
    /**
     * Per-label width, computed from the label text. When supplied, wins over
     * `width` for each edge, so the reserved box tracks content instead of one
     * fixed width. The overlay must use the same function.
     */
    measure?: (text: string) => number;
    /** Height of the reserved label box. Defaults to `EDGE_LABEL_HEIGHT`. */
    height?: number;
  };

  /**
   * Layout direction
   * @default 'RIGHT'
   */
  direction?: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP';

  /**
   * Order same-layer nodes by their source line (ascending) instead of leaving
   * it to the crossing-minimizer. Nodes must carry a `data.component.line`
   * (used when set; nodes without one keep ELK's neutral ordering). Off by
   * default — the generic layered layout is tuned for crossings, and line order
   * only makes sense for graphs that model a source region top-to-bottom.
   * @default false
   */
  orderByLine?: boolean;

  /**
   * Reflow root-level compound frames into a column-major grid after ELK runs:
   * fill each column top-to-bottom, then start the next column to the right.
   * Gives an approximately square shape for edge-less containment graphs, which
   * ELK otherwise packs into one long strip. No effect when edges exist (their
   * routes would need re-routing).
   */
  reflowGrid?: boolean;

  /**
   * Compound groups — each becomes an ELK parent whose `memberIds` are laid
   * out inside it. `memberIds` may be leaf node ids or other group ids
   * (for nesting, e.g. process → module → leaves). Optional `parentId`
   * nests this group under another group; omit for a root-level frame.
   * Members reference their immediate parent via React Flow `parentId`.
   */
  groups?: Array<{ id: string; memberIds: string[]; parentId?: string; minWidth?: number }>;

  /**
   * Keep groups that hold a single leaf instead of dropping them and
   * promoting their member to the parent. A one-child group is still a real
   * boundary — a process with a single module, or a process whose components
   * carry no module — so callers that own the grouping semantics opt in here.
   * Callers must ensure each leaf appears in at most one group, or ELK throws
   * on the duplicate. @default false
   */
  keepSingletonGroups?: boolean;

  /**
   * Lay a group's members out at the root instead of nesting them inside an
   * ELK parent, then synthesize the frame's bounds as the bounding box of its
   * members.
   *
   * A nested frame is a real ELK parent, so edges wholly inside it inherit the
   * frame's padding and its own between-layer spacing on top — which makes an
   * in-frame edge run longer than a root-level one touching the same nodes.
   * Flattening removes that: every edge uses one spacing, and the frame is pure
   * decoration drawn around wherever the members landed.
   *
   * Only for groups whose members need no parent-relative positioning (C4's
   * system frame). @default false
   */
  flatGroups?: boolean;

  /**
   * ELK partition per node id. Nodes are banded by `partition` — ELK places all
   * of partition 0, then partition 1, etc., in the layout direction — so a
   * group of nodes can be kept apart from the rest without nesting them in a
   * parent. C4 uses this to push out-of-boundary nodes (external systems,
   * people) into their own band, away from the framed containers.
   *
   * Requires every laid-out node to have a partition; unknown ids are ignored,
   * unlisted nodes get partition 0. @default undefined (partitioning off)
   */
  partitionByNode?: ReadonlyMap<string, number>;
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
  /**
   * Absolute flow-coord rect for every laid-out node (leaves and groups),
   * including grouped children whose React Flow `position` is parent-relative.
   * Same space as `edgePathPoints`, so callers can union node rects with a
   * route without mixing coordinate systems.
   */
  absoluteRects: Map<string, { x: number; y: number; width: number; height: number }>;
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
 * Point a given fraction along a polyline, by arc length.
 *
 * Using arc length, not the nearest-point snap, is what keeps a label chip on
 * the visual middle of a *bent* route. Nearest-point (`closestPointOnPath`)
 * jumps to whichever segment happens to be nearest the target, so a fanned-out
 * orthogonal route put the chip on a corner near the source node.
 *
 * @public Exported for testing
 */
export function pointAlongPath(points: Point[], fraction: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const total = calculatePathLength(points);
  if (total === 0) return points[0];

  let remaining = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg === 0) continue;
    if (remaining <= seg) {
      const t = remaining / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= seg;
  }
  return points[points.length - 1];
}

/**
 * How far along a polyline a point lies, as a 0…1 fraction of arc length.
 * The point is assumed to lie on (or near) the path.
 *
 * @public Exported for testing
 */
export function fractionAlongPath(points: Point[], at: Point): number {
  if (points.length < 2) return 0.5;
  const total = calculatePathLength(points);
  if (total === 0) return 0.5;

  let travelled = 0;
  let bestDist = Infinity;
  let bestTravelled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = seg === 0 ? 0 : Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / (seg * seg)));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const dist = Math.hypot(at.x - px, at.y - py);
    if (dist < bestDist) {
      bestDist = dist;
      bestTravelled = travelled + seg * t;
    }
    travelled += seg;
  }
  return bestTravelled / total;
}

/**
 * Get ELK layout options based on configuration
 */
export function getElkOptions(options: ElkLayoutOptions): LayoutOptions {
  const {
    routingStyle = 'orthogonal',
    nodeSpacing = 50,
    edgeSpacing = 8,
    edgeNodeSpacing = 10,
    interLayerSpacing = 0,
    edgeLabels,
    direction = 'RIGHT',
    orderByLine = false,
  } = options;

  const baseOptions: LayoutOptions = {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    // Keep same-layer ordering stable (not reversed / randomized) so a
    // line-ordered rewrite or ELK's own ordering is predictable.
    'elk.layered.crossingMinimization.semiInteractive': 'true',
    // Spacing
    'elk.spacing.nodeNode': String(nodeSpacing),
    'elk.spacing.edgeEdge': String(edgeSpacing),
    'elk.spacing.edgeNode': String(edgeNodeSpacing),
    'elk.layered.spacing.edgeEdgeBetweenLayers': String(edgeSpacing),
    'elk.layered.spacing.edgeNodeBetweenLayers': String(edgeNodeSpacing),
    // Edges host inline labels and `CENTER_LAYER` already reserves a label
    // layer, so this is EXTRA space stacked on top of that layer — not a
    // replacement for it. Reserving the full label box here double-counts and
    // the run balloons (measured: w=140 + 204 here = 548px between two nodes).
    // `interLayerSpacing` is the only caller-set value; otherwise this is the
    // small clearance the label layer can't express.
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

  // Model order (position hints) so a per-node `data.line` can drive same-layer
  // ordering. ELK honours the `y` of each node as a position hint against the
  // model order.
  if (orderByLine) {
    baseOptions['elk.layered.fixedAlignment'] = 'NONE';
    baseOptions['elk.layered.considerModelOrder.strategy'] = 'NODES_AND_EDGES';
  }

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

/** A group definition accepted by {@link planCompoundGroups}. */
export interface CompoundGroupDef {
  id: string;
  memberIds: string[];
  minWidth?: number;
}

/** Which groups ELK builds, and which it drops. */
export interface CompoundGroupPlan {
  /**
   * Built groups in build order — a group's children always appear before it,
   * so callers can map ids to shells in one forward pass.
   */
  built: Array<{ id: string; childIds: string[]; minWidth?: number }>;
  /**
   * Dropped groups. Their members are promoted into the nearest built
   * ancestor, so callers must clear those members' `parentId`.
   */
  skipped: string[];
}

/**
 * Decide which compound groups survive, independently of the ELK runtime.
 *
 * Groups resolve bottom-up: a group is ready once every member is a leaf or an
 * already-resolved group. A group is dropped when it would hold nothing, or —
 * unless `keepSingletonGroups` — when it holds a single leaf, since a frame
 * wrapped around one box reads worse than the box alone. Callers that keep
 * singletons own the grouping semantics and must guarantee each leaf appears
 * in at most one group, or ELK throws on the duplicate.
 *
 * Pure so the skip rules are testable without an ELK worker.
 */
export function planCompoundGroups(
  groupDefs: CompoundGroupDef[],
  leafIds: Iterable<string>,
  keepSingletonGroups = false,
): CompoundGroupPlan {
  const leaves = new Set(leafIds);
  const byId = new Map(groupDefs.map((g) => [g.id, g]));
  const built: CompoundGroupPlan['built'] = [];
  const skipped = new Set<string>();
  const pending = [...groupDefs];

  /** Leaves below a group, counting through nested groups. */
  const leafDescendantCount = (memberIds: string[]): number => {
    let n = 0;
    for (const mid of memberIds) {
      if (leaves.has(mid)) n += 1;
      else {
        const g = byId.get(mid);
        if (g) n += leafDescendantCount(g.memberIds);
      }
    }
    return n;
  };

  while (pending.length > 0) {
    let progress = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const g = pending[i]!;
      const childIds: string[] = [];
      let ready = true;
      for (const mid of g.memberIds) {
        if (leaves.has(mid)) {
          childIds.push(mid);
          continue;
        }
        if (skipped.has(mid)) {
          // Promote a dropped group's members into this parent.
          const dropped = byId.get(mid);
          if (!dropped) {
            ready = false;
            break;
          }
          for (const sm of dropped.memberIds) {
            if (leaves.has(sm) || built.some((b) => b.id === sm)) childIds.push(sm);
            else if (!skipped.has(sm)) {
              ready = false;
              break;
            }
          }
          if (!ready) break;
          continue;
        }
        if (built.some((b) => b.id === mid)) {
          childIds.push(mid);
          continue;
        }
        if (byId.has(mid)) {
          ready = false;
          break;
        }
        // Unknown id — ignored (external stubs etc. may be absent).
      }
      if (!ready) continue;

      pending.splice(i, 1);
      progress = true;

      if (
        childIds.length < 1 ||
        (!keepSingletonGroups && leafDescendantCount(g.memberIds) < 2)
      ) {
        skipped.add(g.id);
        continue;
      }

      built.push({ id: g.id, childIds, minWidth: g.minWidth });
    }
    if (!progress) {
      // Cycle or unresolved refs — leave the rest unbuilt.
      for (const g of pending) skipped.add(g.id);
      break;
    }
  }

  return { built, skipped: [...skipped] };
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
  const {
    preserveNodePositions = true,
    keepSingletonGroups = false,
    flatGroups = false,
    partitionByNode,
  } = options;
  const edgeLabels = options.edgeLabels;
  const endpointInset = options.endpointInset ?? 0;
  const direction = options.direction ?? 'RIGHT';
  const reflowGrid = options.reflowGrid === true;
  const orderByLine = options.orderByLine ?? false;

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

    // Optional source-line ordering: seed each node's `y` hint from its line so
    // ELK's model-order placement puts lower lines further down within a layer.
    let y = node.position.y;
    if (orderByLine) {
      const line = (node.data as { component?: { line?: number } } | undefined)?.component?.line;
      if (typeof line === 'number') y = line;
    }

    return {
      id: node.id,
      width,
      height,
      x: node.position.x,
      y,
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
        ...(partitionByNode ? { partition: String(partitionByNode.get(node.id) ?? 0) } : {}),
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
    // Reserve the label box. ELK's `CENTER_LAYER` sizes a dedicated label layer
    // from this and adds no clearance of its own, so the box carries the chip
    // width PLUS the clearance we want on each side — that is the only place
    // the side padding can take effect. The overlay draws the chip at the
    // narrower `edgeLabels.width`, centred in this reserved run.
    if (edgeLabels?.enabled !== false && typeof edge.label === 'string') {
      const chipWidth =
        edgeLabels?.measure?.(edge.label) ?? edgeLabels?.width ?? EDGE_LABEL_WIDTH;
      elkEdge.labels = [
        {
          text: edge.label,
          width: chipWidth + EDGE_LABEL_SIDE_PADDING * 2,
          height: edgeLabels?.height ?? EDGE_LABEL_HEIGHT,
        },
      ];
    }
    return elkEdge;
  });

  // Partition leaf nodes into compound parents when groups are given.
  // Group shells themselves are NOT part of `nodes` — they are reconstructed
  // by the caller from `groupBounds`. `memberIds` may reference leaves or
  // other group ids (process → module → leaves).
  const groupDefs = (options.groups ?? []).filter((g) => g.memberIds.length > 0);
  const groupById = new Map(groupDefs.map((g) => [g.id, g]));
  const elkById = new Map(elkNodes.map((n) => [n.id, n]));

  const compoundLayoutOptions: LayoutOptions = {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    // `top` is the header band a boundary badge sits in. It has to clear the
    // badge (~28px tall, and a nested frame's badge can overhang its own top
    // edge by ~13px) plus a gap before the first child.
    'elk.padding': '[top=64,left=24,bottom=24,right=24]',
    'elk.spacing.nodeNode': '40',
    // Edges inside a frame host labels too, so the frame's own layout has to
    // reserve the same room the root does — otherwise a nested graph (C4 puts
    // every box in the system frame) lays its edges out with the label space
    // ignored, and a 140px chip overflows a ~72px gap. `EDGE_LABEL_EDGE_GAP` is
    // the full reserved width (label box + clearance at each end); labels off
    // falls back to a plain between-layer gap.
    'elk.layered.spacing.nodeNodeBetweenLayers': String(
      edgeLabels?.enabled === false
        ? 40
        : (edgeLabels?.width ?? EDGE_LABEL_WIDTH) + EDGE_LABEL_SIDE_PADDING * 2,
    ),
  };
  // Match the root's inline-label reservation, so ELK inside the frame leaves a
  // dedicated label layer rather than routing straight through the chip.
  if (edgeLabels?.enabled !== false) {
    const placement = edgeLabels?.placement ?? 'CENTER';
    compoundLayoutOptions['elk.edgeLabels.inline'] = 'true';
    compoundLayoutOptions['elk.edgeLabels.inlinePlacement'] = placement;
    compoundLayoutOptions['elk.layered.edgeLabels.centerLabelPlacementStrategy'] = 'CENTER_LAYER';
  }

  const plan = planCompoundGroups(groupDefs, elkById.keys(), keepSingletonGroups);
  const skippedGroups = new Set(plan.skipped);
  const builtGroups = new Map<string, ElkNode>();
  // Flat groups are not ELK parents at all: their members lay out at the root,
  // and the frame is synthesized from the members' bounds after layout. This
  // keeps every edge on one spacing instead of inheriting a nested frame's.
  const flatGroupIds = new Set<string>();
  if (flatGroups) {
    for (const g of plan.built) flatGroupIds.add(g.id);
  }
  for (const g of plan.built) {
    if (flatGroups) break;
    const children: ElkNode[] = [];
    for (const cid of g.childIds) {
      const leaf = elkById.get(cid);
      if (leaf) children.push(leaf);
      else {
        const nested = builtGroups.get(cid);
        if (nested) children.push(nested);
      }
    }
    builtGroups.set(g.id, {
      id: g.id,
      children,
      layoutOptions: g.minWidth == null ? compoundLayoutOptions : {
        ...compoundLayoutOptions,
        'elk.nodeSize.constraints': 'MINIMUM_SIZE',
        'elk.nodeSize.minimum': `(${g.minWidth},0)`,
      },
    });
  }

  const groupedLeafIds = new Set<string>();
  const markLeaves = (memberIds: string[]) => {
    for (const mid of memberIds) {
      if (elkById.has(mid)) groupedLeafIds.add(mid);
      else {
        const g = groupById.get(mid);
        if (g && builtGroups.has(g.id)) markLeaves(g.memberIds);
        else if (g && skippedGroups.has(g.id)) markLeaves(g.memberIds);
      }
    }
  };
  for (const [id] of builtGroups) {
    const g = groupById.get(id);
    if (g) markLeaves(g.memberIds);
  }

  const ungroupedElkNodes: ElkNode[] = [];
  for (const n of elkNodes) {
    if (!groupedLeafIds.has(n.id)) ungroupedElkNodes.push(n);
  }

  // Root-level compound parents: built groups with no parent, or whose parent
  // was skipped / never built.
  const elkParents: ElkNode[] = [];
  for (const [id, node] of builtGroups) {
    const g = groupById.get(id);
    const parentId = g?.parentId;
    if (parentId && builtGroups.has(parentId)) continue; // nested inside parent
    elkParents.push(node);
  }
  // Order root-level compounds by model order (the caller's `groups` array), so
  // disconnected sibling frames lay out deterministically — e.g. `app/book`
  // before `lib`. Without this, planCompoundGroups' bottom-up build order
  // decides placement.
  const groupOrder = new Map(groupDefs.map((g, i) => [g.id, i]));
  elkParents.sort(
    (a, b) =>
      (groupOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (groupOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );

  // Create ELK graph
  const rootOptions = getElkOptions(options);
  if (partitionByNode) {
    rootOptions['elk.partitioning.activate'] = 'true';
  }
  if (elkParents.length > 0 || builtGroups.size > 0) {
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
  const elkAbsOffsets = new Map<string, { x: number; y: number }>();
  const elkPositions = new Map<string, { x: number; y: number }>();
  const elkRelativePositions = new Map<string, { x: number; y: number }>();
  const groupBounds = new Map<string, { x: number; y: number; width: number; height: number }>();
  // Absolute rect per node, in the same space as `edgePathPoints`. Uses ELK's
  // own sizes so it's valid before React Flow has measured anything.
  const absoluteRects = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();
  const walkElk = (n: ElkNode, ox: number, oy: number) => {
    const ax = ox + (n.x ?? 0);
    const ay = oy + (n.y ?? 0);
    elkAbsOffsets.set(n.id, { x: ax, y: ay });
    absoluteRects.set(n.id, {
      x: ax,
      y: ay,
      width: n.width ?? 0,
      height: n.height ?? 0,
    });
    for (const c of n.children ?? []) walkElk(c, ax, ay);
  };
  walkElk(layoutedGraph, 0, 0);

  const collectGroupResults = (n: ElkNode, isRootChild: boolean) => {
    const isGroup = builtGroups.has(n.id);
    if (isGroup) {
      // Nested group positions are parent-relative (RF child semantics);
      // root-level groups use absolute coords.
      groupBounds.set(n.id, {
        x: n.x ?? 0,
        y: n.y ?? 0,
        width: n.width ?? 0,
        height: n.height ?? 0,
      });
      for (const c of n.children ?? []) {
        const rx = c.x ?? 0;
        const ry = c.y ?? 0;
        elkRelativePositions.set(c.id, { x: rx, y: ry });
        const abs = elkAbsOffsets.get(c.id) ?? { x: rx, y: ry };
        elkPositions.set(c.id, abs);
        if (builtGroups.has(c.id)) collectGroupResults(c, false);
      }
      return;
    }
    if (isRootChild) {
      elkPositions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
      elkRelativePositions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
    }
  };
  if (layoutedGraph.children) {
    for (const child of layoutedGraph.children) {
      collectGroupResults(child, true);
    }
  }

  // Flat groups: synthesize each frame from the bounding box of its members.
  // `plan.built` is bottom-up, so a nested frame's bounds already exist when its
  // parent is computed — a frame containing frames unions the child frames, not
  // just leaves. Without that, an outer frame (the system) would omit the
  // container frames inside it and mis-size.
  if (flatGroupIds.size > 0) {
    const FLAT_PAD = 24;
    const FLAT_TOP = 64;
    /** Absolute rect of a group member: a leaf rect, or an already-built frame. */
    const rectOf = (id: string) =>
      absoluteRects.get(id) ??
      (() => {
        const b = groupBounds.get(id);
        return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : undefined;
      })();
    for (const g of plan.built) {
      if (!flatGroupIds.has(g.id)) continue;
      const rects = g.childIds
        .map(rectOf)
        .filter((r): r is { x: number; y: number; width: number; height: number } => !!r);
      if (rects.length === 0) continue;
      const minX = Math.min(...rects.map((r) => r.x));
      const minY = Math.min(...rects.map((r) => r.y));
      const maxX = Math.max(...rects.map((r) => r.x + r.width));
      const maxY = Math.max(...rects.map((r) => r.y + r.height));
      groupBounds.set(g.id, {
        x: minX - FLAT_PAD,
        y: minY - FLAT_TOP,
        width: maxX - minX + FLAT_PAD * 2,
        height: maxY - minY + FLAT_TOP + FLAT_PAD,
      });
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
          // Place the chip by arc length, using ELK's label position only as a
          // hint for *how far along* the route it belongs. Snapping to the
          // nearest point (the old behaviour) jumped to whichever segment was
          // nearest the target, which put fanned-out orthogonal labels on a
          // corner near the source instead of the middle of the line.
          const hint = closestPointOnPath(allPoints, { x: lx, y: ly });
          const hintFraction = fractionAlongPath(allPoints, hint);
          const onPath = pointAlongPath(allPoints, hintFraction);
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

        // Pull the target end back from the node border so the arrowhead tip
        // touches the node without overlapping its border.
        if (endpointInset > 0 && allPoints.length >= 2) {
          const end = allPoints[allPoints.length - 1];
          const prev = allPoints[allPoints.length - 2];
          const dx = end.x - prev.x;
          const dy = end.y - prev.y;
          const segLen = Math.hypot(dx, dy);
          if (segLen > endpointInset) {
            const t = (segLen - endpointInset) / segLen;
            allPoints[allPoints.length - 1] = {
              x: prev.x + dx * t,
              y: prev.y + dy * t,
            };
          }
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

  // Optional column-major grid reflow for edge-less containment graphs. ELK
  // packs disconnected root frames into one long strip; fold them into a grid
  // (fill a column top-to-bottom, then start the next column) so the shape
  // approaches a square. Root frames are moved; their descendants (relative
  // group bounds / leaf positions) ride along, and absoluteRects is rebased so
  // hit-testing stays correct.
  if (reflowGrid && edges.length === 0) {
    const rootGroupIds: string[] = [];
    for (const g of groupDefs) {
      if (!builtGroups.has(g.id)) continue;
      if (g.parentId && builtGroups.has(g.parentId)) continue;
      rootGroupIds.push(g.id);
    }
    type GridItem = {
      id: string;
      kind: 'group' | 'leaf';
      x: number;
      y: number;
      w: number;
      h: number;
    };
    const items: GridItem[] = [];
    for (const id of rootGroupIds) {
      const b = groupBounds.get(id);
      if (b) items.push({ id, kind: 'group', x: b.x, y: b.y, w: b.width, h: b.height });
    }
    for (const id of ungroupedElkNodes.map((nd) => nd.id)) {
      const rel = elkRelativePositions.get(id) ?? { x: 0, y: 0 };
      const r = absoluteRects.get(id);
      items.push({ id, kind: 'leaf', x: rel.x, y: rel.y, w: r?.width ?? 160, h: r?.height ?? 60 });
    }
    if (items.length > 1) {
      const count = items.length;
      const rows = Math.max(1, Math.ceil(Math.sqrt(count)));
      const cols = Math.ceil(count / rows);
      const GAP = 80;
      const PAD = 40;
      const colW: number[] = new Array(cols).fill(0);
      const rowH: number[] = new Array(rows).fill(0);
      items.forEach((it, i) => {
        const c = Math.floor(i / rows);
        const r = i % rows;
        colW[c] = Math.max(colW[c] ?? 0, it.w);
        rowH[r] = Math.max(rowH[r] ?? 0, it.h);
      });
      const colX: number[] = [];
      let acc = PAD;
      for (let c = 0; c < cols; c++) {
        colX[c] = acc;
        acc += (colW[c] ?? 0) + GAP;
      }
      const rowY: number[] = [];
      acc = PAD;
      for (let r = 0; r < rows; r++) {
        rowY[r] = acc;
        acc += (rowH[r] ?? 0) + GAP;
      }
      const shiftAbsSubtree = (id: string, dx: number, dy: number) => {
        const ar = absoluteRects.get(id);
        if (ar) absoluteRects.set(id, { ...ar, x: ar.x + dx, y: ar.y + dy });
        const g = groupById.get(id);
        if (!g) return;
        for (const mid of g.memberIds) {
          if (builtGroups.has(mid)) shiftAbsSubtree(mid, dx, dy);
          else {
            const mar = absoluteRects.get(mid);
            if (mar) absoluteRects.set(mid, { ...mar, x: mar.x + dx, y: mar.y + dy });
          }
        }
      };
      const movedLeaves = new Map<string, { x: number; y: number }>();
      items.forEach((it, i) => {
        const c = Math.floor(i / rows);
        const r = i % rows;
        const dx = (colX[c] ?? 0) - it.x;
        const dy = (rowY[r] ?? 0) - it.y;
        if (dx === 0 && dy === 0) return;
        if (it.kind === 'group') {
          const b = groupBounds.get(it.id);
          if (b) groupBounds.set(it.id, { ...b, x: b.x + dx, y: b.y + dy });
          shiftAbsSubtree(it.id, dx, dy);
        } else {
          shiftAbsSubtree(it.id, dx, dy);
          const rel = elkRelativePositions.get(it.id);
          if (rel) movedLeaves.set(it.id, { x: rel.x + dx, y: rel.y + dy });
        }
      });
      if (movedLeaves.size > 0) {
        for (const node of resultNodes) {
          const m = movedLeaves.get(node.id);
          if (m) (node as { position: { x: number; y: number } }).position = m;
        }
      }
    }
  }

  return {
    nodes: resultNodes,
    edgePaths,
    edgeLabelPositions,
    edgePathPoints,
    groupBounds,
    absoluteRects,
  };
}

/**
 * Hook-friendly version that returns a layout function
 */
export function createElkLayouter(options: ElkLayoutOptions = {}) {
  return (nodes: Node[], edges: Edge[]) => computeElkLayout(nodes, edges, options);
}
