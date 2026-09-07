/**
 * Scope utility functions
 *
 * Helpers for working with scopes defined in the top-level `scopes` section
 * and referenced by resources via `owned-scopes`.
 */

import type { OwnedScopes, ScopeDefinition } from '../types/library';
import type { ExtendedCanvas, OtelScopeNode } from '../types/canvas';
import { isOtelScopeNode, resolveCanvasColor } from '../types/canvas';

/** Default color for scopes without a defined color */
export const DEFAULT_SCOPE_COLOR = '#6B7280'; // gray-500

/** Default color for draft nodes (no scope) */
export const DRAFT_NODE_COLOR = '#9CA3AF'; // gray-400

/**
 * Normalized scope entry with name and definition
 */
export interface NormalizedScope {
  name: string;
  color: string;
  /** Icon identifier (Lucide icons) */
  icon?: string;
  description?: string;
  /** Whether this scope is defined externally (in another library) */
  external?: boolean;
}

/**
 * Get all scope names from owned-scopes array
 */
export function getScopeNames(scopes: OwnedScopes | undefined): string[] {
  return scopes ?? [];
}

/**
 * Get scope definition by name from library scopes
 */
export function getScopeDefinition(
  libraryScopes: Record<string, ScopeDefinition> | undefined,
  scopeName: string
): ScopeDefinition | undefined {
  return libraryScopes?.[scopeName];
}

/**
 * Get scope color by name from library scopes
 * Returns the defined color, or default color if not found
 */
export function getScopeColor(
  libraryScopes: Record<string, ScopeDefinition> | undefined,
  scopeName: string
): string {
  return libraryScopes?.[scopeName]?.color ?? DEFAULT_SCOPE_COLOR;
}

/**
 * Normalize scope names to NormalizedScope array using library scope definitions
 */
export function normalizeScopes(
  scopeNames: OwnedScopes | undefined,
  libraryScopes: Record<string, ScopeDefinition> | undefined
): NormalizedScope[] {
  if (!scopeNames) return [];

  return scopeNames.map((name) => {
    const definition = libraryScopes?.[name];
    return {
      name,
      color: definition?.color ?? DEFAULT_SCOPE_COLOR,
      icon: definition?.icon,
      description: definition?.description,
      external: definition?.external,
    };
  });
}

/**
 * Get scope icon by name from library scopes
 * Returns the defined icon, or undefined if not found
 */
export function getScopeIcon(
  libraryScopes: Record<string, ScopeDefinition> | undefined,
  scopeName: string
): string | undefined {
  return libraryScopes?.[scopeName]?.icon;
}

/**
 * Build a scope color map from .scopes.canvas
 * Returns a simple name -> color mapping for fast lookups
 *
 * @deprecated The library.scopes parameter has been removed. Use scopesCanvas instead.
 * @param scopesCanvas - Canvas containing scope definitions with colors
 * @returns Map of scope name to color (hex format)
 */
export function buildScopeColorMap(
  scopesCanvas: ExtendedCanvas | undefined
): Record<string, string> {
  return buildScopeColorMapFromCanvas(scopesCanvas);
}

/**
 * Get all scope names defined in library
 */
export function getAllScopeNames(
  library: { scopes?: Record<string, ScopeDefinition> } | undefined
): string[] {
  if (!library?.scopes) return [];
  return Object.keys(library.scopes);
}

/**
 * Build scope color map from .scopes.canvas nodes
 * Extracts color from otel-scope nodes only
 *
 * @param scopesCanvas - Canvas containing scope definitions
 * @returns Map of scope name to color (hex format)
 */
export function buildScopeColorMapFromCanvas(
  scopesCanvas: ExtendedCanvas | undefined
): Record<string, string> {
  const colorMap: Record<string, string> = {};

  if (!scopesCanvas?.nodes) return colorMap;

  for (const node of scopesCanvas.nodes) {
    // Only process otel-scope nodes
    if (!isOtelScopeNode(node)) continue;

    const scopeName = node.otel?.scope;
    if (!scopeName) continue;

    // Get color from node.color field and resolve presets to hex
    const resolvedColor = resolveCanvasColor(node.color);
    if (resolvedColor) {
      colorMap[scopeName] = resolvedColor;
    } else {
      // Use default color if no color specified
      colorMap[scopeName] = DEFAULT_SCOPE_COLOR;
    }
  }

  return colorMap;
}

/**
 * Extract all scope names from a scopes canvas
 *
 * @param scopesCanvas - Canvas containing scope definitions
 * @returns Array of scope names
 */
export function getScopeNamesFromCanvas(
  scopesCanvas: ExtendedCanvas | undefined
): string[] {
  if (!scopesCanvas?.nodes) return [];

  return scopesCanvas.nodes
    .filter(isOtelScopeNode)
    .map(node => node.otel?.scope)
    .filter((scope): scope is string => !!scope);
}

/**
 * Get scope node by scope name
 *
 * @param scopesCanvas - Canvas containing scope definitions
 * @param scopeName - Name of the scope to find
 * @returns The scope node, or undefined if not found
 */
export function getScopeNodeFromCanvas(
  scopesCanvas: ExtendedCanvas | undefined,
  scopeName: string
): OtelScopeNode | undefined {
  if (!scopesCanvas?.nodes) return undefined;

  return scopesCanvas.nodes.find(
    node => isOtelScopeNode(node) && node.otel?.scope === scopeName
  ) as OtelScopeNode | undefined;
}
