import type { NodeState, EdgeState, CanvasSide } from '@principal-ai/subsystems-core';

/**
 * Swaps the orientation of a graph from horizontal to vertical or vice versa.
 * This swaps x/y coordinates and adjusts edge connection sides accordingly.
 */
export function swapGraphOrientation(
  nodes: NodeState[],
  edges: EdgeState[]
): { nodes: NodeState[]; edges: EdgeState[] } {
  return {
    nodes: swapNodePositions(nodes),
    edges: swapEdgeSides(edges),
  };
}

/**
 * Swaps x and y positions for all nodes
 */
export function swapNodePositions(nodes: NodeState[]): NodeState[] {
  return nodes.map(node => ({
    ...node,
    position: node.position ? {
      x: node.position.y,
      y: node.position.x,
    } : undefined,
  }));
}

/**
 * Swaps edge connection sides to match the new orientation
 * Both sides rotate clockwise: top → right → bottom → left → top
 */
export function swapEdgeSides(edges: EdgeState[]): EdgeState[] {
  return edges.map(edge => {
    const data = edge.data as Record<string, unknown> | undefined;
    const fromSide = data?.fromSide as CanvasSide | undefined;
    const toSide = data?.toSide as CanvasSide | undefined;

    const rotatedFromSide = rotateClockwise(fromSide);
    const rotatedToSide = rotateClockwise(toSide);

    // Only include fromSide/toSide if they have defined values (not undefined)
    const newData = { ...edge.data } as Record<string, unknown>;
    if (rotatedFromSide !== undefined) {
      newData.fromSide = rotatedFromSide;
    }
    if (rotatedToSide !== undefined) {
      newData.toSide = rotatedToSide;
    }

    return {
      ...edge,
      data: newData as EdgeState['data'],
    };
  });
}

/**
 * Rotates a side clockwise: top → right → bottom → left → top
 */
function rotateClockwise(side?: CanvasSide): CanvasSide | undefined {
  if (!side) return undefined;

  const clockwiseMap: Record<CanvasSide, CanvasSide> = {
    top: 'right',
    right: 'bottom',
    bottom: 'left',
    left: 'top',
  };

  return clockwiseMap[side];
}
