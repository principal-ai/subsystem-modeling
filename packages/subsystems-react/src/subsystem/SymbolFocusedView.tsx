/**
 * SymbolFocusedView — one graphify symbol and its radius-1 neighborhood on the
 * subsystem canvas.
 *
 * This is the public entry point for the "focused symbol" canvas: the host
 * hands over the center node plus the neighbors and edges graphify already
 * extracted, and the view projects them onto the shared component graph
 * (`toSymbolFocusedView`). Edges keep their raw graphify verbs and draw from
 * the graphify palette, so derived facts stay visually distinct from authored
 * subsystem mechanisms.
 *
 * No trails, no drawers for a model: a symbol focus is read, not walked. Hover
 * and select still work, and double-clicking a node opens its file like any
 * other component node.
 */

import { useMemo } from 'react';
import type {
  SymbolFocusedViewInput,
  SymbolFocusedViewOptions,
} from '../graphify/symbolFocus';
import { toSymbolFocusedView } from '../graphify/symbolFocus';
import type { SubsystemComponentGraphProps } from './SubsystemComponentGraph';
import { SubsystemComponentGraph } from './SubsystemComponentGraph';

/**
 * Canvas chrome that is meaningful for a derived, trail-less projection. The
 * authored-model inputs (`components`, `trails`, `graphifyRelations`) and the
 * trail deep-link/playback props are deliberately not forwarded: the view
 * owns them.
 */
type SymbolFocusedViewChrome = Pick<
  SubsystemComponentGraphProps,
  | 'title'
  | 'description'
  | 'orderByLine'
  | 'showEdgeLabels'
  | 'showSingletonFrames'
  | 'hideSidebar'
  | 'hideDrawer'
  | 'maxNodeWidth'
  | 'persistKey'
  | 'onSelect'
  | 'onEdgeSelect'
  | 'onFileSelect'
  | 'componentVerification'
  | 'onInspectSymbol'
  | 'canvasOverlay'
>;

export interface SymbolFocusedViewProps
  extends SymbolFocusedViewInput,
    SymbolFocusedViewOptions,
    SymbolFocusedViewChrome {}

export function SymbolFocusedView({
  center,
  neighbors,
  edges,
  repoPurl,
  centerConstruct,
  ...chrome
}: SymbolFocusedViewProps) {
  const { components, graphifyRelations } = useMemo(
    () =>
      toSymbolFocusedView(
        { center, neighbors, edges },
        { repoPurl, ...(centerConstruct ? { centerConstruct } : {}) },
      ),
    [center, neighbors, edges, repoPurl, centerConstruct],
  );

  return (
    <SubsystemComponentGraph
      components={components}
      graphifyRelations={graphifyRelations}
      {...chrome}
    />
  );
}
