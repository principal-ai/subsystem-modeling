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
 * React Flow mounts its edge SVG (`.react-flow__edges`) and node layer
 * (`.react-flow__nodes`) as sibling containers inside the viewport, both at
 * `z-index: auto`, and leans on DOM order (edges first, nodes second) to keep
 * nodes on top. Nodes carry an inline `z-index: 0`, which on its own does not
 * reliably beat the edge layer, so an edge routing into a boundary frame's top
 * border paints *over* that frame's label. Lift the whole node layer above the
 * edge layer once for every graph that spreads `GRAPH_NAV_PROPS`.
 *
 * Scoped by `GRAPH_CANVAS_CLASS` so it only touches our canvases.
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
.${GRAPH_CANVAS_CLASS} .react-flow__nodes { z-index: 1; }
.${GRAPH_CANVAS_CLASS} .react-flow__edges { transition: opacity ${LAYOUT_FLIP_EDGE_MS}ms ease; }
.${LAYOUT_FLIP_CLASS} .react-flow__edges { opacity: 0; }
.${LAYOUT_FLIP_CLASS} .react-flow__node { transition: transform ${LAYOUT_FLIP_NODE_MS}ms cubic-bezier(0.4, 0, 0.2, 1); }
`;

/** Scoped style tag for `GRAPH_LAYER_CSS`; render once beside `<ReactFlow>`. */
export function GraphLayerStyle() {
  return <style>{GRAPH_LAYER_CSS}</style>;
}

/** Background dots + zoom/fit/interactive widget; render inside `<ReactFlow>`. */
export function GraphChrome() {
  return (
    <>
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      <Controls showZoom showFitView showInteractive />
    </>
  );
}
