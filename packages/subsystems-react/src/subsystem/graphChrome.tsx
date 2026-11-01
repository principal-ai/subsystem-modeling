/**
 * Shared navigation surface for read-only graph canvases.
 *
 * Every graph in this package (component graph, aggregate graph) is a React
 * Flow wrapper and must present the same interaction language: drag/scroll to
 * pan, pinch to zoom (never scroll-zoom or double-click-zoom), and the
 * Background + Controls chrome. Spreading `GRAPH_NAV_PROPS` and rendering
 * `<GraphChrome />` keeps them from drifting apart.
 */

import {
  Background,
  BackgroundVariant,
  Controls,
  type ReactFlowProps,
} from '@xyflow/react';

export const GRAPH_NAV_PROPS = {
  minZoom: 0.05,
  maxZoom: 4,
  panOnDrag: true,
  panOnScroll: true,
  zoomOnScroll: false,
  zoomOnPinch: true,
  zoomOnDoubleClick: false,
  nodesDraggable: false,
  elementsSelectable: true,
  selectNodesOnDrag: false,
  nodesConnectable: false,
  edgesReconnectable: false,
} satisfies Partial<ReactFlowProps>;

/**
 * Class on every canvas that spreads `GRAPH_NAV_PROPS`; scopes `GRAPH_LAYER_CSS`
 * so it only touches our canvases.
 *
 * Paint order rides React Flow's own per-element z-indices. The viewport is one
 * stacking context holding the edge layer (one absolutely positioned `<svg>` per
 * edge, `z-index` = the deepest nested endpoint's depth) and the node layer
 * (each node `z-index` = its nesting depth, a child always one above its
 * parent). Neither layer may be lifted as a whole: a boundary frame is a filled
 * container card, so a line between two members has to paint *above* the frame
 * that holds them yet *below* the member cards — and that is exactly the
 * interleave the per-element indices give (edge depth ≥ frame depth, and at
 * equal depth the node layer wins by DOM order).
 */
export const GRAPH_CANVAS_CLASS = 'subsystem-graph-canvas';

/**
 * Applied to the canvas box while a layout-direction flip is in progress.
 *
 * The flip is sequenced in three beats: edges fade out (`LAYOUT_FLIP_EDGE_MS`),
 * the graph re-lays out with nodes sliding to their new slots
 * (`LAYOUT_FLIP_NODE_MS`), then edges fade back in. Hiding the edges first
 * keeps the old routes from cutting across the new layout mid-flight.
 */
export const LAYOUT_FLIP_CLASS = 'subsystem-layout-flipping';

/** Edge fade-out/in duration around a layout flip, ms. */
export const LAYOUT_FLIP_EDGE_MS = 180;

/** Node slide duration to the new layout, ms. */
export const LAYOUT_FLIP_NODE_MS = 320;

export const GRAPH_LAYER_CSS = `
.${GRAPH_CANVAS_CLASS} .react-flow__edges { transition: opacity ${LAYOUT_FLIP_EDGE_MS}ms ease; }
.${LAYOUT_FLIP_CLASS} .react-flow__edges { opacity: 0; }
.${LAYOUT_FLIP_CLASS} .react-flow__node { transition: transform ${LAYOUT_FLIP_NODE_MS}ms cubic-bezier(0.4, 0, 0.2, 1); }
`;

/** Scoped style tag for `GRAPH_LAYER_CSS`; render once beside `<ReactFlow>`. */
export function GraphLayerStyle() {
  return <style>{GRAPH_LAYER_CSS}</style>;
}

/**
 * Overrides for a non-interactive (presentation) canvas; spread after
 * `GRAPH_NAV_PROPS`. Leaves `nodesDraggable` etc. as the shared defaults.
 */
export const STATIC_NAV_PROPS = {
  panOnDrag: false,
  panOnScroll: false,
  zoomOnScroll: false,
  zoomOnPinch: false,
  zoomOnDoubleClick: false,
  elementsSelectable: false,
  preventScrolling: false,
} satisfies Partial<ReactFlowProps>;

/** Background dots + zoom/fit/interactive widget; render inside `<ReactFlow>`. */
export function GraphChrome({
  showBackground = true,
  showControls = true,
}: { showBackground?: boolean; showControls?: boolean } = {}) {
  return (
    <>
      {showBackground && <Background variant={BackgroundVariant.Dots} gap={16} size={1} />}
      {showControls && <Controls showZoom showFitView showInteractive />}
    </>
  );
}
