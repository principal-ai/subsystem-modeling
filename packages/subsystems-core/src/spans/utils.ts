/**
 * Span utility functions
 *
 * Helpers for working with span conventions from .spans.canvas files.
 * Span colors are used as fill colors for events emitted within that span.
 */

import type { ExtendedCanvas, ExtendedCanvasNode } from '../types/canvas';
import { isOtelSpanConventionNode, isStandardCanvasNode } from '../types/canvas';

/** Default color for spans without a defined color */
export const DEFAULT_SPAN_COLOR = '#9CA3AF'; // gray-400

/**
 * Normalized span convention entry
 */
export interface NormalizedSpanConvention {
  /** Unique identifier for this span convention */
  id: string;
  /** Pattern to match span names (e.g., "validate.*") */
  spanPattern: string;
  /** Color for this span (used as fill for events) */
  color: string;
  /** Icon identifier (Lucide icons) */
  icon?: string;
  /** Human-readable description */
  description?: string;
  /** Status of the span convention */
  status?: 'draft' | 'approved' | 'implemented';
}

/**
 * Extract span convention from a canvas node
 */
export function extractSpanConvention(node: ExtendedCanvasNode): NormalizedSpanConvention | null {
  // Handle OTEL span convention nodes (top-level otel field)
  if (isOtelSpanConventionNode(node)) {
    const spanPattern = node.otel?.spanPattern;
    if (!spanPattern) return null;

    const color = node.color as string | undefined;
    if (!color) return null;

    return {
      id: node.id,
      spanPattern,
      color,
      icon: node.icon,
      description: node.description,
      status: node.otel?.status,
    };
  }

  // Handle standard nodes with pv.nodeType === 'span-convention'
  if (!isStandardCanvasNode(node)) return null;

  const pv = node.pv;
  if (!pv) return null;

  const nodeType = pv.nodeType;
  if (nodeType !== 'span-convention') return null;

  const otel = pv.otel as { spanPattern?: string; spanKind?: string } | undefined;
  const spanPattern = otel?.spanPattern;
  if (!spanPattern) return null;

  // Get color from node (required for span conventions)
  const color = node.color as string | undefined;
  if (!color) return null;

  // Extract description from node text if present (only text nodes have text)
  let description: string | undefined;
  if ('text' in node && typeof node.text === 'string') {
    const text = node.text;
    // Try to extract description from markdown (lines after the header)
    const lines = text.split('\n');
    const descLines = lines.filter(line => !line.startsWith('#') && line.trim());
    if (descLines.length > 0) {
      description = descLines.join(' ').trim();
    }
  }

  // Get icon from pv.icon (Lucide icon identifier)
  const icon = pv.icon as string | undefined;

  return {
    id: node.id,
    spanPattern,
    color,
    icon,
    description,
    status: pv.status as 'draft' | 'approved' | 'implemented' | undefined,
  };
}

/**
 * Extract all span conventions from a spans.canvas file
 */
export function extractSpanConventions(canvas: ExtendedCanvas): NormalizedSpanConvention[] {
  const conventions: NormalizedSpanConvention[] = [];

  if (!canvas.nodes) return conventions;

  for (const node of canvas.nodes) {
    const convention = extractSpanConvention(node);
    if (convention) {
      conventions.push(convention);
    }
  }

  return conventions;
}

/**
 * Build a span color map from a spans.canvas
 * Returns a map of spanPattern -> color for fast lookups
 */
export function buildSpanColorMap(canvas: ExtendedCanvas | null | undefined): Record<string, string> {
  const colorMap: Record<string, string> = {};

  if (!canvas) return colorMap;

  const conventions = extractSpanConventions(canvas);
  for (const convention of conventions) {
    colorMap[convention.spanPattern] = convention.color;
  }

  return colorMap;
}

/**
 * Build a span color map from multiple spans.canvas files
 * Later files override earlier ones for duplicate patterns
 */
export function buildSpanColorMapFromCanvases(
  canvases: (ExtendedCanvas | null | undefined)[]
): Record<string, string> {
  const colorMap: Record<string, string> = {};

  for (const canvas of canvases) {
    if (!canvas) continue;
    const conventions = extractSpanConventions(canvas);
    for (const convention of conventions) {
      colorMap[convention.spanPattern] = convention.color;
    }
  }

  return colorMap;
}

/**
 * Match a span name to a span pattern
 * Supports exact matches and wildcard patterns (e.g., "validate.*")
 */
export function matchSpanPattern(spanName: string, pattern: string): boolean {
  // Exact match
  if (spanName === pattern) return true;

  // Wildcard pattern (e.g., "validate.*")
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return spanName.startsWith(prefix + '.') || spanName === prefix;
  }

  return false;
}

/**
 * Find the color for a span name by matching against span patterns
 * Returns the first matching pattern's color, or default if none match
 */
export function getSpanColor(
  spanName: string,
  spanColorMap: Record<string, string>
): string {
  // First try exact match
  if (spanColorMap[spanName]) {
    return spanColorMap[spanName];
  }

  // Then try pattern matching
  for (const [pattern, color] of Object.entries(spanColorMap)) {
    if (matchSpanPattern(spanName, pattern)) {
      return color;
    }
  }

  return DEFAULT_SPAN_COLOR;
}

/**
 * Resolve span color for an event based on its workflow's spanPattern
 * This is the primary method for determining event fill color
 */
export function resolveEventSpanColor(
  workflowSpanPattern: string | undefined,
  spanColorMap: Record<string, string>
): string {
  if (!workflowSpanPattern) return DEFAULT_SPAN_COLOR;

  // Direct lookup (pattern as key)
  if (spanColorMap[workflowSpanPattern]) {
    return spanColorMap[workflowSpanPattern];
  }

  return DEFAULT_SPAN_COLOR;
}

/**
 * Build a span icon map from a spans.canvas
 * Returns a map of spanPattern -> icon for fast lookups
 */
export function buildSpanIconMap(canvas: ExtendedCanvas | null | undefined): Record<string, string> {
  const iconMap: Record<string, string> = {};

  if (!canvas) return iconMap;

  const conventions = extractSpanConventions(canvas);
  for (const convention of conventions) {
    if (convention.icon) {
      iconMap[convention.spanPattern] = convention.icon;
    }
  }

  return iconMap;
}

/**
 * Find the icon for a span name by matching against span patterns
 * Returns the first matching pattern's icon, or undefined if none match
 */
export function getSpanIcon(
  spanName: string,
  spanIconMap: Record<string, string>
): string | undefined {
  // First try exact match
  if (spanIconMap[spanName]) {
    return spanIconMap[spanName];
  }

  // Then try pattern matching
  for (const [pattern, icon] of Object.entries(spanIconMap)) {
    if (matchSpanPattern(spanName, pattern)) {
      return icon;
    }
  }

  return undefined;
}
