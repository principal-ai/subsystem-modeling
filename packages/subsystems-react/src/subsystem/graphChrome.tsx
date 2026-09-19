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

/** Background dots + zoom/fit/interactive widget; render inside `<ReactFlow>`. */
export function GraphChrome() {
  return (
    <>
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      <Controls showZoom showFitView showInteractive />
    </>
  );
}
