/**
 * React hook for ELK layout integration
 *
 * Provides automatic edge routing with circuit-board style paths.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { computeElkLayout, type ElkLayoutOptions } from '../utils/elkLayout';

export interface UseElkLayoutOptions extends ElkLayoutOptions {
  /**
   * Whether ELK layout is enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Debounce delay in ms before recomputing layout
   * @default 100
   */
  debounceMs?: number;
}

export interface UseElkLayoutResult {
  /** Edge paths computed by ELK, keyed by edge ID */
  edgePaths: Map<string, string>;
  /** Edge label positions computed by ELK, keyed by edge ID */
  edgeLabelPositions: Map<string, { x: number; y: number }>;
  /** Whether layout is currently being computed */
  isLayouting: boolean;
  /** Any error that occurred during layout */
  error: Error | null;
  /** Manually trigger a layout recomputation */
  recomputeLayout: () => void;
}

/**
 * Hook for computing ELK layout for edges
 *
 * @param nodes - xyflow nodes
 * @param edges - xyflow edges
 * @param options - Layout options
 * @returns Layout result with edge paths
 *
 * @example
 * ```tsx
 * const { edgePaths, isLayouting } = useElkLayout(nodes, edges, {
 *   routingStyle: 'orthogonal',
 *   edgeSpacing: 15,
 * });
 * ```
 */
export function useElkLayout(
  nodes: Node[],
  edges: Edge[],
  options: UseElkLayoutOptions = {}
): UseElkLayoutResult {
  const { enabled = true, debounceMs = 100, ...layoutOptions } = options;

  const [edgePaths, setEdgePaths] = useState<Map<string, string>>(new Map());
  const [edgeLabelPositions, setEdgeLabelPositions] = useState<Map<string, { x: number; y: number }>>(
    new Map()
  );
  const [isLayouting, setIsLayouting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<boolean>(false);
  const hasComputedRef = useRef<string | null>(null);

  // Create stable refs for nodes and edges
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  // Create a stable reference to layout options
  const optionsRef = useRef(layoutOptions);
  optionsRef.current = layoutOptions;

  // Create a stable key based on node/edge structure
  const layoutKey = useMemo(() => {
    const nodeKey = nodes.map(n => `${n.id}:${n.position.x}:${n.position.y}:${n.width ?? 0}:${n.height ?? 0}`).join('|');
    const edgeKey = edges.map(e => `${e.id}:${e.source}:${e.target}`).join('|');
    return `${enabled}:${nodeKey}:${edgeKey}`;
  }, [enabled, nodes, edges]);

  // Compute layout when key changes
  useEffect(() => {
    // Skip if already computed for this key
    if (hasComputedRef.current === layoutKey) {
      return;
    }

    if (!enabled || nodesRef.current.length === 0) {
      setEdgePaths(new Map());
      setEdgeLabelPositions(new Map());
      hasComputedRef.current = layoutKey;
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    abortRef.current = false;

    timeoutRef.current = setTimeout(async () => {
      setIsLayouting(true);
      setError(null);

      try {
        const result = await computeElkLayout(nodesRef.current, edgesRef.current, optionsRef.current);

        if (abortRef.current) return;

        setEdgePaths(result.edgePaths);
        setEdgeLabelPositions(result.edgeLabelPositions);
        hasComputedRef.current = layoutKey;
      } catch (err) {
        if (!abortRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          console.error('ELK layout error:', err);
        }
      } finally {
        if (!abortRef.current) {
          setIsLayouting(false);
        }
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      abortRef.current = true;
    };
  }, [layoutKey, enabled, debounceMs]);

  const recomputeLayout = useCallback(() => {
    hasComputedRef.current = null; // Force recompute
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // Trigger effect by invalidating the key check
    setIsLayouting(true);
  }, []);

  return {
    edgePaths,
    edgeLabelPositions,
    isLayouting,
    error,
    recomputeLayout,
  };
}

/**
 * Apply ELK-computed paths to edges
 *
 * This utility injects the ELK path data into edge data so CustomEdge can use it.
 *
 * @param edges - Original edges
 * @param edgePaths - ELK-computed paths
 * @param edgeLabelPositions - ELK-computed label positions
 * @returns Edges with ELK path data injected
 */
export function applyElkPathsToEdges<T extends Edge>(
  edges: T[],
  edgePaths: Map<string, string>,
  edgeLabelPositions: Map<string, { x: number; y: number }>
): T[] {
  return edges.map((edge) => {
    const elkPath = edgePaths.get(edge.id);
    const elkLabelPosition = edgeLabelPositions.get(edge.id);

    if (elkPath) {
      return {
        ...edge,
        data: {
          ...edge.data,
          elkPath,
          elkLabelPosition,
        },
      };
    }

    return edge;
  });
}
