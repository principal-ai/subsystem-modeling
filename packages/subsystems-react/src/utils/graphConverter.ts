import { MarkerType, type Node, type Edge } from '@xyflow/react';
import type {
  NodeState,
  EdgeState,
  GraphConfiguration,
  Violation,
} from '@principal-ai/subsystems-core';
import type { CustomNodeData } from '../nodes/CustomNode';
import type { CustomEdgeData } from '../edges/CustomEdge';

/**
 * Convert our NodeState to xyflow Node format
 */
export function convertToXYFlowNodes(
  nodes: NodeState[],
  configuration: GraphConfiguration,
  violations: Violation[] = []
): Node<CustomNodeData>[] {
  return nodes.map((node) => {
    let typeDefinition = configuration.nodeTypes[node.type];

    // Warn if node type is not defined in configuration
    if (!typeDefinition) {
      console.warn(`Node type "${node.type}" not found in configuration for node "${node.id}"`);
      // Provide minimal typeDefinition with global states fallback to prevent undefined errors
      typeDefinition = {
        description: '',
        shape: 'rectangle',
        dataSchema: {},
        states: configuration.states,
      };
    } else if (!typeDefinition.states && configuration.states) {
      // If typeDefinition exists but has no states, use global states as fallback
      typeDefinition = {
        ...typeDefinition,
        states: configuration.states,
      };
    }

    const hasViolations = violations.some((v) => v.context?.nodeId === node.id);

    // Groups should render behind other nodes and edges
    const isGroup = node.data?.canvasType === 'group';

    return {
      id: node.id,
      type: 'custom',
      position: node.position || { x: 0, y: 0 },
      // Groups have lower zIndex to render behind other nodes
      // Use 1 for groups, 100 for regular nodes (positive values to avoid event handling issues)
      zIndex: isGroup ? 1 : 100,
      // Apply persisted dimensions if available
      ...(node.width !== undefined ? { width: node.width } : {}),
      ...(node.height !== undefined ? { height: node.height } : {}),
      data: {
        name: node.name || node.id,
        typeDefinition,
        state: node.state,
        hasViolations,
        data: node.data,
      },
    };
  });
}

/** Extended edge state with optional handle information for ReactFlow */
export interface EdgeStateWithHandles extends EdgeState {
  sourceHandle?: string;
  targetHandle?: string;
}

/**
 * Map canvas side to source handle ID
 * Source handles use '-out' suffix
 */
function sideToSourceHandle(side?: string): string | undefined {
  if (!side) return undefined;
  return `${side}-out`;
}

/**
 * Map canvas side to target handle ID
 * Target handles use the side name directly
 */
function sideToTargetHandle(side?: string): string | undefined {
  return side;
}

/**
 * Convert our EdgeState to xyflow Edge format
 */
export function convertToXYFlowEdges(
  edges: (EdgeState | EdgeStateWithHandles)[],
  configuration: GraphConfiguration,
  violations: Violation[] = []
): Edge<CustomEdgeData>[] {
  return edges.map((edge) => {
    const typeDefinition = configuration.edgeTypes[edge.type];

    // Warn if edge type is not defined in configuration
    if (!typeDefinition) {
      console.warn(`Edge type "${edge.type}" not found in configuration for edge "${edge.id}"`);
    }

    const hasViolations = violations.some((v) => v.context?.edgeId === edge.id);
    const edgeWithHandles = edge as EdgeStateWithHandles;

    // Get handle IDs from edge data (fromSide/toSide) or explicit handles
    // If no side specified, default to right->left for left-to-right flow
    const fromSide = edge.data?.fromSide as string | undefined;
    const toSide = edge.data?.toSide as string | undefined;
    const sourceHandle = edgeWithHandles.sourceHandle || sideToSourceHandle(fromSide || 'right');
    const targetHandle = edgeWithHandles.targetHandle || sideToTargetHandle(toSide || 'left');

    // Add arrow marker if edge type is directed
    // Color priority: edge data color > type definition color > default
    const edgeColor = edge.data?.color as string | undefined;
    const markerEnd =
      typeDefinition?.directed !== false
        ? {
            type: MarkerType.ArrowClosed,
            color: edgeColor || typeDefinition?.color || '#888',
            width: 20,
            height: 20,
          }
        : undefined;

    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      sourceHandle,
      targetHandle,
      type: 'custom',
      // Edges should render above groups (zIndex: 1) but below regular nodes (zIndex: 100)
      zIndex: 50,
      animated: typeDefinition?.style === 'animated',
      markerEnd,
      data: {
        typeDefinition,
        hasViolations,
        data: edge.data,
        edgeType: edge.type,
      },
    };
  });
}

