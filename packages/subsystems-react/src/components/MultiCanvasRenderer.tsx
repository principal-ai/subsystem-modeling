import { useMemo, useCallback, useRef, forwardRef } from 'react';
import type { ExtendedCanvas, ExtendedCanvasNode, ExtendedCanvasEdge } from '@principal-ai/subsystems-core';
import { GraphRenderer } from './GraphRenderer';
import type { GraphRendererProps, GraphRendererHandle } from './GraphRenderer';

// ============================================================================
// Types
// ============================================================================

/**
 * A canvas placement with its position in the combined coordinate space
 */
export interface CanvasPlacement {
  /** Unique identifier for this canvas */
  canvasId: string;
  /** The canvas to include */
  canvas: ExtendedCanvas;
  /** Position offset - all nodes in this canvas will be translated by this amount */
  position: { x: number; y: number };
  /** Optional label for the canvas (for future visual grouping) */
  label?: string;
}

/**
 * Layout configuration for multiple canvases on a single graph
 */
export interface MultiCanvasLayout {
  /** Array of canvas placements with positions */
  placements: CanvasPlacement[];
}

/**
 * Props for the MultiCanvasRenderer component
 */
export interface MultiCanvasRendererProps
  extends Omit<GraphRendererProps, 'canvas' | 'editable'> {
  /** Layout configuration containing canvas placements */
  layout: MultiCanvasLayout;
  /** Callback when layout changes (canvas positions updated) */
  onLayoutChange?: (layout: MultiCanvasLayout) => void;
  /** Whether to show group borders around each canvas (default: true) */
  showGroups?: boolean;
}

// ============================================================================
// Canvas Merging Utilities
// ============================================================================

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 100;
const GROUP_PADDING = 40;

/**
 * Create a prefixed node ID to avoid collisions between canvases
 */
function prefixNodeId(canvasId: string, nodeId: string): string {
  return `${canvasId}:${nodeId}`;
}

/**
 * Calculate the bounding box of nodes in a canvas (relative to canvas origin)
 */
function calculateCanvasBounds(canvas: ExtendedCanvas): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (!canvas.nodes || canvas.nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: DEFAULT_NODE_WIDTH, maxY: DEFAULT_NODE_HEIGHT };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of canvas.nodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const width = node.width ?? DEFAULT_NODE_WIDTH;
    const height = node.height ?? DEFAULT_NODE_HEIGHT;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Merge multiple canvases into a single canvas with position offsets applied.
 * Each canvas gets a group node border with its name as a label.
 * Node IDs are prefixed with canvasId to avoid collisions (format: "canvasId:nodeId").
 * Original IDs can be recovered using parseNodeId().
 */
export function mergeCanvases(
  placements: CanvasPlacement[],
  options: { showGroups?: boolean } = {}
): ExtendedCanvas {
  const { showGroups = true } = options;
  const groupNodes: ExtendedCanvasNode[] = [];
  const mergedNodes: ExtendedCanvasNode[] = [];
  const mergedEdges: ExtendedCanvasEdge[] = [];

  for (const placement of placements) {
    const { canvasId, canvas, position, label } = placement;

    // Calculate bounds for this canvas to create a group node
    if (showGroups && canvas.nodes && canvas.nodes.length > 0) {
      const bounds = calculateCanvasBounds(canvas);
      const groupNode: ExtendedCanvasNode = {
        id: `${canvasId}:__group__`,
        type: 'group',
        label: label ?? canvas.pv?.name ?? canvasId,
        x: position.x + bounds.minX - GROUP_PADDING,
        y: position.y + bounds.minY - GROUP_PADDING,
        width: bounds.maxX - bounds.minX + GROUP_PADDING * 2,
        height: bounds.maxY - bounds.minY + GROUP_PADDING * 2,
      };
      groupNodes.push(groupNode);
    }

    // Process nodes - apply position offset and prefix IDs
    if (canvas.nodes) {
      for (const node of canvas.nodes) {
        const mergedNode: ExtendedCanvasNode = {
          ...node,
          id: prefixNodeId(canvasId, node.id),
          x: (node.x ?? 0) + position.x,
          y: (node.y ?? 0) + position.y,
        };
        mergedNodes.push(mergedNode);
      }
    }

    // Process edges - update node references with prefixed IDs
    if (canvas.edges) {
      for (const edge of canvas.edges) {
        const mergedEdge: ExtendedCanvasEdge = {
          ...edge,
          id: prefixNodeId(canvasId, edge.id),
          fromNode: prefixNodeId(canvasId, edge.fromNode),
          toNode: prefixNodeId(canvasId, edge.toNode),
        };
        mergedEdges.push(mergedEdge);
      }
    }
  }

  // Create merged canvas - group nodes first so they render behind
  const mergedCanvas: ExtendedCanvas = {
    name: 'Multi-Canvas View',
    nodes: [...groupNodes, ...mergedNodes],
    edges: mergedEdges,
  };

  return mergedCanvas;
}

/**
 * Extract the original canvas ID and node ID from a merged node ID
 */
export function parseNodeId(
  mergedNodeId: string
): { canvasId: string; nodeId: string } | null {
  const colonIndex = mergedNodeId.indexOf(':');
  if (colonIndex === -1) return null;
  return {
    canvasId: mergedNodeId.substring(0, colonIndex),
    nodeId: mergedNodeId.substring(colonIndex + 1),
  };
}

// ============================================================================
// MultiCanvasRenderer Component
// ============================================================================

/**
 * Renders multiple canvases merged into a single graph view.
 *
 * Each canvas is positioned at its specified offset, and all nodes/edges
 * are combined into a unified viewport. Node IDs are prefixed with their
 * source canvas ID to avoid collisions (format: "canvasId:nodeId").
 *
 * @example
 * ```tsx
 * <MultiCanvasRenderer
 *   layout={{
 *     placements: [
 *       { canvasId: 'auth', canvas: authCanvas, position: { x: 0, y: 0 } },
 *       { canvasId: 'data', canvas: dataCanvas, position: { x: 600, y: 0 } },
 *     ],
 *   }}
 *   showControls
 * />
 * ```
 */
export const MultiCanvasRenderer = forwardRef<
  GraphRendererHandle,
  MultiCanvasRendererProps
>(function MultiCanvasRenderer(
  { layout, onLayoutChange, showGroups = true, ...graphRendererProps },
  ref
) {
  // Track group positions at the start of drag to calculate deltas
  const groupPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Merge all canvases into a single canvas
  const mergedCanvas = useMemo(
    () => mergeCanvases(layout.placements, { showGroups }),
    [layout.placements, showGroups]
  );

  // Calculate group node IDs for dragging
  const draggableNodeIds = useMemo(() => {
    if (!showGroups) return undefined;
    const ids = new Set<string>();
    for (const placement of layout.placements) {
      if (placement.canvas.nodes && placement.canvas.nodes.length > 0) {
        ids.add(`${placement.canvasId}:__group__`);
      }
    }
    return ids.size > 0 ? ids : undefined;
  }, [layout.placements, showGroups]);

  // Store initial group positions whenever layout changes
  useMemo(() => {
    groupPositionsRef.current.clear();
    for (const placement of layout.placements) {
      if (placement.canvas.nodes && placement.canvas.nodes.length > 0) {
        const bounds = calculateCanvasBounds(placement.canvas);
        // Group position = placement position + bounds offset - padding
        groupPositionsRef.current.set(`${placement.canvasId}:__group__`, {
          x: placement.position.x + bounds.minX - GROUP_PADDING,
          y: placement.position.y + bounds.minY - GROUP_PADDING,
        });
      }
    }
  }, [layout.placements]);

  // Handle group drag to update layout positions
  const handleNodeDragStop = useCallback(
    (nodeId: string, newPosition: { x: number; y: number }) => {
      // Only handle group nodes
      if (!nodeId.endsWith(':__group__')) return;
      if (!onLayoutChange) return;

      const parsed = parseNodeId(nodeId);
      if (!parsed) return;
      const { canvasId } = parsed;

      // Get the original group position
      const originalGroupPos = groupPositionsRef.current.get(nodeId);
      if (!originalGroupPos) return;

      // Calculate delta
      const deltaX = newPosition.x - originalGroupPos.x;
      const deltaY = newPosition.y - originalGroupPos.y;

      // Skip if no significant movement
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

      // Create updated layout with new position for this canvas
      const updatedPlacements = layout.placements.map((placement) => {
        if (placement.canvasId === canvasId) {
          return {
            ...placement,
            position: {
              x: placement.position.x + deltaX,
              y: placement.position.y + deltaY,
            },
          };
        }
        return placement;
      });

      onLayoutChange({ placements: updatedPlacements });
    },
    [layout.placements, onLayoutChange]
  );

  return (
    <GraphRenderer
      ref={ref}
      canvas={mergedCanvas}
      editable={false}
      draggableNodeIds={draggableNodeIds}
      onNodeDragStop={handleNodeDragStop}
      {...graphRendererProps}
    />
  );
});
