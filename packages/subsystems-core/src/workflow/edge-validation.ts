/**
 * Edge Validation
 *
 * Validates derived edges from workflows against spans.canvas definitions.
 * Ensures documented span relationships match observed workflow behavior.
 *
 * @see .principal-views/WORKFLOW-SPAN-INTEGRATION.md
 */

import type { ExtendedCanvas, ExtendedCanvasNode } from '../types/canvas';
import { isOtelSpanConventionNode, isStandardCanvasNode } from '../types/canvas';
import type { DerivedEdge } from './edge-derivation';
import { minimatch } from 'minimatch';

/**
 * Span node info extracted from spans.canvas
 */
export interface SpanNodeInfo {
  /** Node ID in the canvas */
  nodeId: string;

  /** Span pattern this node matches (e.g., "validate.*") */
  spanPattern: string;

  /** Human-readable name */
  name?: string;
}

/**
 * Canvas edge info extracted from spans.canvas
 */
export interface CanvasEdgeInfo {
  /** Source node ID */
  fromNodeId: string;

  /** Target node ID */
  toNodeId: string;

  /** Source span pattern */
  fromSpanPattern?: string;

  /** Target span pattern */
  toSpanPattern?: string;
}

/**
 * Edge validation result
 */
export interface EdgeValidationResult {
  /** Edges that are documented in spans.canvas and observed in workflows */
  validEdges: ValidatedEdge[];

  /** Edges observed in workflows but missing from spans.canvas */
  missingEdges: MissingEdge[];

  /** Edges documented in spans.canvas but not observed in any workflow */
  unusedEdges: UnusedEdge[];

  /** Spans referenced in workflows that don't match any spans.canvas node */
  unmatchedSpans: UnmatchedSpan[];

  /** Summary statistics */
  summary: {
    totalDerivedEdges: number;
    totalCanvasEdges: number;
    matchedEdges: number;
    missingEdges: number;
    unusedEdges: number;
    unmatchedSpans: number;
  };
}

/**
 * An edge that passed validation
 */
export interface ValidatedEdge {
  /** Source span name (exact) */
  fromSpan: string;

  /** Target span name (exact) */
  toSpan: string;

  /** Canvas edge it matched */
  canvasEdge: CanvasEdgeInfo;

  /** Workflows where this edge was observed */
  sources: Array<{ workflowFile?: string; scenarioId: string }>;
}

/**
 * An edge observed in workflows but missing from spans.canvas
 */
export interface MissingEdge {
  /** Source span name */
  fromSpan: string;

  /** Target span name */
  toSpan: string;

  /** Source span matched to this node (if any) */
  fromNodeId?: string;

  /** Target span matched to this node (if any) */
  toNodeId?: string;

  /** Workflows where this edge was observed */
  sources: Array<{ workflowFile?: string; scenarioId: string }>;

  /** Reason this edge is missing */
  reason: 'no-edge-in-canvas' | 'span-not-matched';
}

/**
 * An edge documented in spans.canvas but not observed in workflows
 */
export interface UnusedEdge {
  /** Canvas edge */
  canvasEdge: CanvasEdgeInfo;

  /** Canvas file where this edge is defined */
  canvasFile?: string;
}

/**
 * A span referenced in workflows that doesn't match any spans.canvas node
 */
export interface UnmatchedSpan {
  /** Exact span name from workflow */
  spanName: string;

  /** Workflows that reference this span */
  sources: Array<{ workflowFile?: string; scenarioId: string }>;
}

/**
 * Extract span nodes from a spans.canvas file
 *
 * @param canvas - Parsed spans.canvas content
 * @returns Array of span node info
 */
export function extractSpanNodes(canvas: ExtendedCanvas): SpanNodeInfo[] {
  if (!canvas.nodes) {
    return [];
  }

  const spanNodes: SpanNodeInfo[] = [];

  for (const node of canvas.nodes) {
    // Check OTEL span convention nodes (top-level otel.spanPattern)
    if (isOtelSpanConventionNode(node) && node.otel?.spanPattern) {
      spanNodes.push({
        nodeId: node.id,
        spanPattern: node.otel.spanPattern,
        name: node.label,
      });
    }
    // Check standard nodes (pv.otel.spanPattern)
    else if (isStandardCanvasNode(node) && node.pv?.otel?.spanPattern) {
      spanNodes.push({
        nodeId: node.id,
        spanPattern: node.pv.otel.spanPattern,
        name: node.pv.name,
      });
    }
  }

  return spanNodes;
}

/**
 * Extract edges from a spans.canvas file
 *
 * @param canvas - Parsed spans.canvas content
 * @param spanNodes - Map of nodeId to span info
 * @returns Array of canvas edge info
 */
export function extractCanvasEdges(
  canvas: ExtendedCanvas,
  spanNodes: SpanNodeInfo[]
): CanvasEdgeInfo[] {
  if (!canvas.edges) {
    return [];
  }

  const nodeMap = new Map(spanNodes.map((n) => [n.nodeId, n]));
  const edges: CanvasEdgeInfo[] = [];

  for (const edge of canvas.edges) {
    const fromNode = nodeMap.get(edge.fromNode);
    const toNode = nodeMap.get(edge.toNode);

    edges.push({
      fromNodeId: edge.fromNode,
      toNodeId: edge.toNode,
      fromSpanPattern: fromNode?.spanPattern,
      toSpanPattern: toNode?.spanPattern,
    });
  }

  return edges;
}

/**
 * Match an exact span name to a span pattern
 *
 * @param spanName - Exact span name (e.g., "validate.canvas")
 * @param pattern - Span pattern (e.g., "validate.*")
 * @returns true if the span matches the pattern
 */
export function matchSpanToPattern(spanName: string, pattern: string): boolean {
  // Exact match
  if (spanName === pattern) {
    return true;
  }

  // Use minimatch for glob pattern matching
  return minimatch(spanName, pattern);
}

/**
 * Find the canvas node that matches a span name
 *
 * @param spanName - Exact span name
 * @param spanNodes - Available span nodes
 * @returns Matching node info or undefined
 */
export function findMatchingNode(
  spanName: string,
  spanNodes: SpanNodeInfo[]
): SpanNodeInfo | undefined {
  // First try exact match
  for (const node of spanNodes) {
    if (node.spanPattern === spanName) {
      return node;
    }
  }

  // Then try pattern match
  for (const node of spanNodes) {
    if (matchSpanToPattern(spanName, node.spanPattern)) {
      return node;
    }
  }

  return undefined;
}

/**
 * Check if a derived edge has a corresponding canvas edge
 *
 * @param derivedEdge - Edge derived from workflow
 * @param canvasEdges - Edges from spans.canvas
 * @param spanNodes - Span nodes from spans.canvas
 * @returns Matching canvas edge or undefined
 */
export function findMatchingCanvasEdge(
  derivedEdge: DerivedEdge,
  canvasEdges: CanvasEdgeInfo[],
  spanNodes: SpanNodeInfo[]
): CanvasEdgeInfo | undefined {
  const fromNode = findMatchingNode(derivedEdge.fromSpan, spanNodes);
  const toNode = findMatchingNode(derivedEdge.toSpan, spanNodes);

  if (!fromNode || !toNode) {
    return undefined;
  }

  // Find canvas edge connecting these nodes
  return canvasEdges.find(
    (edge) => edge.fromNodeId === fromNode.nodeId && edge.toNodeId === toNode.nodeId
  );
}

/**
 * Validate derived edges against spans.canvas
 *
 * @param derivedEdges - Edges derived from workflows
 * @param canvas - Parsed spans.canvas content
 * @param canvasFile - Optional file path for tracking
 * @returns Validation result
 */
export function validateEdges(
  derivedEdges: DerivedEdge[],
  canvas: ExtendedCanvas,
  canvasFile?: string
): EdgeValidationResult {
  const spanNodes = extractSpanNodes(canvas);
  const canvasEdges = extractCanvasEdges(canvas, spanNodes);

  const validEdges: ValidatedEdge[] = [];
  const missingEdges: MissingEdge[] = [];
  const unmatchedSpans: UnmatchedSpan[] = [];
  const matchedCanvasEdges = new Set<string>();

  // Track all unique spans
  const allSpans = new Set<string>();
  for (const edge of derivedEdges) {
    allSpans.add(edge.fromSpan);
    allSpans.add(edge.toSpan);
  }

  // Check each span for matching node
  for (const spanName of allSpans) {
    const matchingNode = findMatchingNode(spanName, spanNodes);
    if (!matchingNode) {
      // Find sources for this span
      const sources: Array<{ workflowFile?: string; scenarioId: string }> = [];
      for (const edge of derivedEdges) {
        if (edge.fromSpan === spanName || edge.toSpan === spanName) {
          sources.push({
            workflowFile: edge.workflowFile,
            scenarioId: edge.scenarioId,
          });
        }
      }

      unmatchedSpans.push({
        spanName,
        sources: deduplicateSources(sources),
      });
    }
  }

  // Validate each derived edge
  for (const derivedEdge of derivedEdges) {
    const fromNode = findMatchingNode(derivedEdge.fromSpan, spanNodes);
    const toNode = findMatchingNode(derivedEdge.toSpan, spanNodes);

    if (!fromNode || !toNode) {
      // Skip if either span doesn't match - already reported as unmatched span
      continue;
    }

    const matchingCanvasEdge = findMatchingCanvasEdge(derivedEdge, canvasEdges, spanNodes);

    if (matchingCanvasEdge) {
      // Valid edge - documented and observed
      const edgeKey = `${matchingCanvasEdge.fromNodeId}->${matchingCanvasEdge.toNodeId}`;
      matchedCanvasEdges.add(edgeKey);

      // Check if we already have this edge in validEdges
      const existingValid = validEdges.find(
        (v) => v.fromSpan === derivedEdge.fromSpan && v.toSpan === derivedEdge.toSpan
      );

      if (existingValid) {
        existingValid.sources.push({
          workflowFile: derivedEdge.workflowFile,
          scenarioId: derivedEdge.scenarioId,
        });
      } else {
        validEdges.push({
          fromSpan: derivedEdge.fromSpan,
          toSpan: derivedEdge.toSpan,
          canvasEdge: matchingCanvasEdge,
          sources: [
            {
              workflowFile: derivedEdge.workflowFile,
              scenarioId: derivedEdge.scenarioId,
            },
          ],
        });
      }
    } else {
      // Missing edge - observed but not documented
      const existingMissing = missingEdges.find(
        (m) => m.fromSpan === derivedEdge.fromSpan && m.toSpan === derivedEdge.toSpan
      );

      if (existingMissing) {
        existingMissing.sources.push({
          workflowFile: derivedEdge.workflowFile,
          scenarioId: derivedEdge.scenarioId,
        });
      } else {
        missingEdges.push({
          fromSpan: derivedEdge.fromSpan,
          toSpan: derivedEdge.toSpan,
          fromNodeId: fromNode.nodeId,
          toNodeId: toNode.nodeId,
          sources: [
            {
              workflowFile: derivedEdge.workflowFile,
              scenarioId: derivedEdge.scenarioId,
            },
          ],
          reason: 'no-edge-in-canvas',
        });
      }
    }
  }

  // Find unused canvas edges
  const unusedEdges: UnusedEdge[] = [];
  for (const canvasEdge of canvasEdges) {
    const edgeKey = `${canvasEdge.fromNodeId}->${canvasEdge.toNodeId}`;
    if (!matchedCanvasEdges.has(edgeKey)) {
      unusedEdges.push({
        canvasEdge,
        canvasFile,
      });
    }
  }

  return {
    validEdges,
    missingEdges,
    unusedEdges,
    unmatchedSpans,
    summary: {
      totalDerivedEdges: derivedEdges.length,
      totalCanvasEdges: canvasEdges.length,
      matchedEdges: validEdges.length,
      missingEdges: missingEdges.length,
      unusedEdges: unusedEdges.length,
      unmatchedSpans: unmatchedSpans.length,
    },
  };
}

/**
 * Deduplicate sources array
 */
function deduplicateSources(
  sources: Array<{ workflowFile?: string; scenarioId: string }>
): Array<{ workflowFile?: string; scenarioId: string }> {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.workflowFile || ''}:${s.scenarioId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Format validation result as human-readable text
 *
 * @param result - Validation result
 * @returns Formatted string
 */
export function formatValidationResult(result: EdgeValidationResult): string {
  const lines: string[] = [];

  lines.push('Edge Validation Results');
  lines.push('=======================');
  lines.push('');

  // Summary
  lines.push(`Summary:`);
  lines.push(`  Derived edges from workflows: ${result.summary.totalDerivedEdges}`);
  lines.push(`  Edges in spans.canvas: ${result.summary.totalCanvasEdges}`);
  lines.push(`  Matched: ${result.summary.matchedEdges}`);
  lines.push(`  Missing from canvas: ${result.summary.missingEdges}`);
  lines.push(`  Unused in canvas: ${result.summary.unusedEdges}`);
  lines.push(`  Unmatched spans: ${result.summary.unmatchedSpans}`);
  lines.push('');

  // Valid edges
  if (result.validEdges.length > 0) {
    lines.push('Valid Edges (documented and observed):');
    for (const edge of result.validEdges) {
      lines.push(`  ✓ ${edge.fromSpan} → ${edge.toSpan}`);
    }
    lines.push('');
  }

  // Missing edges
  if (result.missingEdges.length > 0) {
    lines.push('Missing Edges (observed but not documented):');
    for (const edge of result.missingEdges) {
      lines.push(`  ✗ ${edge.fromSpan} → ${edge.toSpan}`);
      if (edge.fromNodeId && edge.toNodeId) {
        lines.push(`    Suggested: Add edge from "${edge.fromNodeId}" to "${edge.toNodeId}"`);
      }
    }
    lines.push('');
  }

  // Unused edges
  if (result.unusedEdges.length > 0) {
    lines.push('Unused Edges (documented but not observed):');
    for (const edge of result.unusedEdges) {
      const from = edge.canvasEdge.fromSpanPattern || edge.canvasEdge.fromNodeId;
      const to = edge.canvasEdge.toSpanPattern || edge.canvasEdge.toNodeId;
      lines.push(`  ⚠ ${from} → ${to}`);
    }
    lines.push('');
  }

  // Unmatched spans
  if (result.unmatchedSpans.length > 0) {
    lines.push('Unmatched Spans (no matching node in spans.canvas):');
    for (const span of result.unmatchedSpans) {
      lines.push(`  ✗ ${span.spanName}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
