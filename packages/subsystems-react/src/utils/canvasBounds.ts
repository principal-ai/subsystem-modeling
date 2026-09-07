import type { ExtendedCanvas } from '@principal-ai/subsystems-core';

export interface CanvasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 100;

/**
 * Calculate the bounding box of all nodes in a canvas.
 * Returns the min/max coordinates and total dimensions.
 */
export function getCanvasBounds(canvas: ExtendedCanvas): CanvasBounds {
  if (!canvas.nodes || canvas.nodes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: DEFAULT_NODE_WIDTH,
      maxY: DEFAULT_NODE_HEIGHT,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    };
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

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Calculate the initial viewport to fit all nodes within a container.
 * This allows setting defaultViewport on ReactFlow to avoid the
 * "zoom in then animate out" effect.
 *
 * @param bounds - The bounding box of all nodes
 * @param containerWidth - Width of the container in pixels
 * @param containerHeight - Height of the container in pixels
 * @param options - Additional options for padding and zoom limits
 * @returns The viewport { x, y, zoom } to pass to ReactFlow's defaultViewport
 */
export function calculateInitialViewport(
  bounds: CanvasBounds,
  containerWidth: number,
  containerHeight: number,
  options: {
    padding?: number;
    minZoom?: number;
    maxZoom?: number;
  } = {}
): Viewport {
  const { padding = 0.2, minZoom = 0.1, maxZoom = 1.5 } = options;

  // Calculate the zoom level needed to fit the bounds within the container
  // Account for padding by reducing the effective container size
  const effectiveWidth = containerWidth * (1 - padding);
  const effectiveHeight = containerHeight * (1 - padding);

  const zoomX = effectiveWidth / bounds.width;
  const zoomY = effectiveHeight / bounds.height;

  // Use the smaller zoom to ensure both dimensions fit
  let zoom = Math.min(zoomX, zoomY);

  // Clamp to min/max zoom
  zoom = Math.max(minZoom, Math.min(maxZoom, zoom));

  // Calculate the center of the bounds
  const boundsCenterX = bounds.minX + bounds.width / 2;
  const boundsCenterY = bounds.minY + bounds.height / 2;

  // Calculate viewport position to center the bounds
  // ReactFlow viewport x,y represent the offset of the canvas origin from the container's top-left
  const x = containerWidth / 2 - boundsCenterX * zoom;
  const y = containerHeight / 2 - boundsCenterY * zoom;

  return { x, y, zoom };
}

/**
 * Calculate a recommended display size for a canvas cell.
 * Adds padding and enforces minimum dimensions.
 */
export function getCanvasDisplaySize(
  canvas: ExtendedCanvas,
  options: {
    padding?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
  } = {}
): { width: number; height: number } {
  const {
    padding = 100,
    minWidth = 300,
    minHeight = 200,
    maxWidth = 1200,
    maxHeight = 800,
  } = options;

  const bounds = getCanvasBounds(canvas);

  // Add padding to content dimensions
  const contentWidth = bounds.width + padding * 2;
  const contentHeight = bounds.height + padding * 2;

  // Clamp to min/max
  const width = Math.min(maxWidth, Math.max(minWidth, contentWidth));
  const height = Math.min(maxHeight, Math.max(minHeight, contentHeight));

  return { width, height };
}
