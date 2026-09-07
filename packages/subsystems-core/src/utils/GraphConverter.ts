/**
 * Utility for converting PathBasedGraphConfiguration to nodes and edges
 */

import type { PathBasedGraphConfiguration } from '../types/path-based-config';
import type { NodeState, EdgeState, JsonValue } from '../types';

/**
 * Converts PathBasedGraphConfiguration to graph state (nodes and edges)
 */
export class GraphConverter {
  /**
   * Convert configuration to nodes and edges
   */
  static configToGraph(config: PathBasedGraphConfiguration): {
    nodes: NodeState[];
    edges: EdgeState[];
  } {
    const nodes: NodeState[] = [];
    const edges: EdgeState[] = [];
    const now = Date.now();

    // Create nodes from nodeTypes
    Object.entries(config.nodeTypes).forEach(([id, nodeType]) => {
      // Build data object, filtering out undefined values
      const data: Record<string, JsonValue> = {
        label: id,
        sources: nodeType.sources || [],
        // actions removed - legacy path-based
      };

      // Add optional properties only if defined
      if (nodeType.shape !== undefined) data.shape = nodeType.shape;
      if (nodeType.icon !== undefined) data.icon = nodeType.icon;
      if (nodeType.color !== undefined) data.color = nodeType.color;
      if (nodeType.size !== undefined) data.size = nodeType.size;

      // Merge in data schema
      Object.assign(data, nodeType.dataSchema);

      nodes.push({
        id,
        type: id,
        name: id,
        data,
        // Extract position if provided in manual layout mode
        position: nodeType.position,
        state: 'idle',
        createdAt: now,
        updatedAt: now,
      });
    });

    // Create edges from allowedConnections
    if (config.allowedConnections) {
      config.allowedConnections.forEach((connection, index) => {
        const edgeType = config.edgeTypes?.[connection.via];

        // Build data object, filtering out undefined values
        const data: Record<string, JsonValue> = {
          label: connection.via,
          style: edgeType?.style || 'solid',
        };

        // Add optional properties only if defined
        if (edgeType?.color !== undefined) data.color = edgeType.color;
        if (edgeType?.width !== undefined) data.width = edgeType.width;
        if (edgeType?.animation !== undefined) data.animation = edgeType.animation as JsonValue;

        edges.push({
          id: `${connection.from}-${connection.to}-${index}`,
          type: connection.via,
          from: connection.from,
          to: connection.to,
          data,
          createdAt: now,
          updatedAt: now,
        });
      });
    }

    return { nodes, edges };
  }
}
