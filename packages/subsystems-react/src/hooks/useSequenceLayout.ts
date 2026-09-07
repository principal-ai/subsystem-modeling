/**
 * React hook for sequence diagram layout
 *
 * Computes swimlane-based positioning for events. Lanes default to the first
 * dotted segment of each event name. Callers can drill deeper by passing
 * `openedNamespaces`: any prefix listed there has its events pushed one level
 * deeper, so its children appear as their own lanes instead of being grouped
 * under the parent.
 */

import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';

/**
 * Input event for sequence layout
 */
export interface SequenceEvent {
  /** Unique event identifier */
  id: string;
  /** Event name with namespace (e.g., "auth.validation.started") */
  name: string;
  /** Optional display label (defaults to name) */
  label?: string;
  /** Optional event type for styling */
  type?: string;
  /** Whether this is a move event (crosses participant boundaries) */
  moveEvent?: boolean;
  /** Participant this event belongs to (for move events, this is the target) */
  participant?: string;
  /**
   * Optional source-file path this event originated from, expressed
   * relative to the repository root (e.g.
   * `auth-server/src/lib/auth-provider.ts`). Surfaced on the React Flow
   * node `data` so downstream renderers (file-city overlays, jump-to-source,
   * IDE bridges) can react to selection without reaching into `data`.
   */
  sourcePath?: string;
  /** Additional data to pass through to the node */
  data?: Record<string, unknown>;
}

/**
 * Input edge for sequence layout
 */
export interface SequenceEdge {
  /** Unique edge identifier */
  id: string;
  /** Source event ID */
  fromEvent: string;
  /** Target event ID */
  toEvent: string;
  /** Optional edge label */
  label?: string;
  /** Optional edge type for styling */
  type?: string;
}

/**
 * Swimlane information computed from events
 */
export interface Swimlane {
  /** Namespace identifier for this lane */
  namespace: string;
  /** Display label for the lane header (last segment of the namespace) */
  label: string;
  /** X position of the lane center */
  x: number;
  /** Parent namespace (one segment shallower), if any */
  parentNamespace?: string;
  /** Whether this lane's namespace is in `openedNamespaces` (its events have been drilled deeper) */
  isOpened: boolean;
  /** Whether the immediate parent namespace is opened (this lane only exists because its parent was drilled into) */
  isParentOpened: boolean;
  /** Whether any event extends strictly past this lane's namespace (so opening would split it further) */
  canExpand: boolean;
  /** Events directly assigned to this lane */
  eventIds: string[];
}

/**
 * Options for sequence layout
 */
export interface UseSequenceLayoutOptions {
  /**
   * Namespace prefixes whose events should be drilled one segment deeper.
   * Pass an array or a Set. Each entry is a dotted prefix (e.g. `auth` or
   * `auth.user`). When listed, events under that prefix land in lanes one
   * level deeper than the prefix, instead of all sharing the prefix lane.
   * Drilling is recursive: list both `auth` and `auth.user` to drill twice.
   */
  openedNamespaces?: string[] | Set<string>;

  /**
   * Explicit left-to-right order for lanes, by resolved namespace. Listed
   * namespaces are placed first in the given order; any lanes not present in
   * the list fall back to first-event order (the order in which their first
   * event appears in `events`). Unknown entries are ignored.
   */
  laneOrder?: string[];

  /**
   * Width of each swimlane
   * @default 250
   */
  laneWidth?: number;

  /**
   * Gap between swimlanes
   * @default 10
   */
  laneGap?: number;

  /**
   * Vertical spacing between events
   * @default 80
   */
  eventSpacing?: number;

  /**
   * Height reserved for lane headers
   * @default 60
   */
  headerHeight?: number;

  /**
   * Node marker width
   * @default 14
   */
  nodeWidth?: number;

  /**
   * Node marker height
   * @default 14
   */
  nodeHeight?: number;
}

/**
 * A header cell for an opened ancestor namespace, sitting above the leaf
 * lanes it groups. Rendered as a row in the header strip.
 */
export interface ParentHeader {
  /** Full ancestor namespace (always in `openedNamespaces`) */
  namespace: string;
  /** Last segment, for display */
  label: string;
  /** Center x of the cell */
  x: number;
  /** Total span width across the leaf lanes underneath */
  width: number;
  /** 1-based depth in the header strip (1 = topmost row) */
  depth: number;
}

/**
 * Result from sequence layout computation
 */
export interface UseSequenceLayoutResult {
  /** Positioned nodes for React Flow */
  nodes: Node[];
  /** Edges for React Flow */
  edges: Edge[];
  /** Leaf swimlanes — each gets a lifeline and a leaf header row */
  swimlanes: Swimlane[];
  /**
   * Header cells for opened ancestor namespaces. Stack above the leaf
   * headers; depth 1 sits at the top of the header strip.
   */
  parentHeaders: ParentHeader[];
  /** Number of header rows (= max leaf depth). At least 1. */
  headerRows: number;
  /** Total width of the diagram */
  totalWidth: number;
  /** Total height of the diagram */
  totalHeight: number;
}

/**
 * Resolve the lane (namespace prefix) for a given event name, given the set
 * of opened namespaces. Walks segments from depth 1 outward, descending while
 * the current prefix is opened, and stopping at the first prefix that isn't.
 */
function resolveLane(name: string, opened: Set<string>): string {
  const segs = name.split('.');
  let depth = 1;
  while (depth < segs.length) {
    const prefix = segs.slice(0, depth).join('.');
    if (opened.has(prefix)) {
      depth++;
    } else {
      break;
    }
  }
  return segs.slice(0, depth).join('.');
}

/**
 * useSequenceLayout
 *
 * @param events - Events to lay out
 * @param sequenceEdges - Edges connecting events
 * @param options - Layout options (lane sizing, openedNamespaces)
 *
 * @example
 * ```tsx
 * const { nodes, edges, swimlanes } = useSequenceLayout(
 *   [
 *     { id: '1', name: 'auth.validation.started' },
 *     { id: '2', name: 'auth.validation.completed' },
 *     { id: '3', name: 'database.query.executed' },
 *   ],
 *   [
 *     { id: 'e1', fromEvent: '1', toEvent: '2' },
 *     { id: 'e2', fromEvent: '2', toEvent: '3' },
 *   ],
 *   { openedNamespaces: ['auth'] }, // drill `auth` to show validation/token as separate lanes
 * );
 * ```
 */
export function useSequenceLayout(
  events: SequenceEvent[],
  sequenceEdges: SequenceEdge[],
  options: UseSequenceLayoutOptions = {}
): UseSequenceLayoutResult {
  const {
    openedNamespaces,
    laneOrder,
    laneWidth = 250,
    laneGap = 0,
    eventSpacing = 80,
    headerHeight = 60,
    nodeWidth = 14,
    nodeHeight = 14,
  } = options;

  const laneOrderKey = useMemo(
    () => (laneOrder ? laneOrder.join('|') : ''),
    [laneOrder]
  );

  // Normalize openedNamespaces into a stable string for memo dependency
  const openedKey = useMemo(() => {
    if (!openedNamespaces) return '';
    const arr = Array.from(openedNamespaces);
    arr.sort();
    return arr.join('|');
  }, [openedNamespaces]);

  return useMemo(() => {
    if (events.length === 0) {
      return {
        nodes: [],
        edges: [],
        swimlanes: [],
        parentHeaders: [],
        headerRows: 1,
        totalWidth: 0,
        totalHeight: 0,
      };
    }

    const opened = new Set<string>(
      openedKey ? openedKey.split('|') : []
    );

    // Step 1: Resolve each event to a lane prefix
    const eventLane = new Map<string, string>();
    const laneEvents = new Map<string, string[]>();

    for (const event of events) {
      const lane = resolveLane(event.name, opened);
      eventLane.set(event.id, lane);
      if (!laneEvents.has(lane)) {
        laneEvents.set(lane, []);
      }
      laneEvents.get(lane)!.push(event.id);
    }

    // Step 2: Order lanes by first-event appearance (Map preserves insertion
    // order from Step 1). If `laneOrder` is provided, listed namespaces are
    // placed first in the given order; unlisted lanes follow in first-event
    // order. Unknown entries in `laneOrder` are ignored.
    const firstEventOrder = Array.from(laneEvents.keys());
    let laneNames: string[];
    if (laneOrder && laneOrder.length > 0) {
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const ns of laneOrder) {
        if (laneEvents.has(ns) && !seen.has(ns)) {
          ordered.push(ns);
          seen.add(ns);
        }
      }
      for (const ns of firstEventOrder) {
        if (!seen.has(ns)) ordered.push(ns);
      }
      laneNames = ordered;
    } else {
      laneNames = firstEventOrder;
    }

    // canExpand is meaningful only when opening would actually fork the lane
    // into multiple child lanes. If every event in the lane would drill into
    // the same child, drilling is a relabel — hide the chevron.
    const eventsById = new Map<string, SequenceEvent>();
    for (const event of events) eventsById.set(event.id, event);

    const canExpandLane = (laneNs: string, eventIds: string[]): boolean => {
      const augmented = new Set(opened);
      augmented.add(laneNs);
      const seen = new Set<string>();
      for (const eid of eventIds) {
        const event = eventsById.get(eid);
        if (!event) continue;
        seen.add(resolveLane(event.name, augmented));
        if (seen.size > 1) return true;
      }
      return false;
    };

    // Step 3: Build Swimlane records
    const swimlanes: Swimlane[] = laneNames.map((namespace, index) => {
      const x = index * (laneWidth + laneGap) + laneWidth / 2;
      const segs = namespace.split('.');
      const parentNamespace =
        segs.length > 1 ? segs.slice(0, -1).join('.') : undefined;
      const eventIds = laneEvents.get(namespace)!;

      return {
        namespace,
        label: segs[segs.length - 1] || namespace,
        x,
        parentNamespace,
        isOpened: opened.has(namespace),
        isParentOpened: parentNamespace ? opened.has(parentNamespace) : false,
        canExpand: canExpandLane(namespace, eventIds),
        eventIds,
      };
    });

    const laneByNamespace = new Map<string, Swimlane>();
    for (const lane of swimlanes) {
      laneByNamespace.set(lane.namespace, lane);
    }

    // Step 3b: Build parent header cells for opened ancestors. For every leaf
    // lane at depth > 1, walk depths 1..d-1 and aggregate the leaf x-extent
    // under each ancestor.
    const ancestorBounds = new Map<
      string,
      { xMin: number; xMax: number; depth: number }
    >();
    for (const lane of swimlanes) {
      const segs = lane.namespace.split('.');
      const left = lane.x - laneWidth / 2;
      const right = lane.x + laneWidth / 2;
      for (let d = 1; d < segs.length; d++) {
        const ancestorNs = segs.slice(0, d).join('.');
        const existing = ancestorBounds.get(ancestorNs);
        if (existing) {
          existing.xMin = Math.min(existing.xMin, left);
          existing.xMax = Math.max(existing.xMax, right);
        } else {
          ancestorBounds.set(ancestorNs, { xMin: left, xMax: right, depth: d });
        }
      }
    }

    const parentHeaders: ParentHeader[] = Array.from(ancestorBounds.entries())
      .map(([namespace, { xMin, xMax, depth }]) => {
        const segs = namespace.split('.');
        return {
          namespace,
          label: segs[segs.length - 1] || namespace,
          x: (xMin + xMax) / 2,
          width: xMax - xMin,
          depth,
        };
      })
      .sort((a, b) => a.depth - b.depth || a.x - b.x);

    const headerRows = swimlanes.reduce(
      (max, lane) => Math.max(max, lane.namespace.split('.').length),
      1
    );
    const totalHeaderHeight = headerHeight * headerRows;

    // Step 4: Position events on global time layers, below the full header strip
    const nodes: Node[] = [];
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const laneNs = eventLane.get(event.id)!;
      const lane = laneByNamespace.get(laneNs)!;

      const y = totalHeaderHeight + 40 + i * eventSpacing;

      nodes.push({
        id: event.id,
        type: 'sequenceMarker',
        position: {
          x: lane.x - nodeWidth / 2,
          y: y - nodeHeight / 2,
        },
        data: {
          label: event.label || event.name.split('.').pop() || event.name,
          fullName: event.name,
          namespace: laneNs,
          timeLayer: i,
          isMoveEvent: event.moveEvent === true,
          sourcePath: event.sourcePath,
          ...event.data,
        },
        style: {
          width: nodeWidth,
          height: nodeHeight,
        },
      });
    }

    // Step 5: Edges — one per event, looking ahead to the next
    const edges: Edge[] = [];
    for (let i = 0; i < events.length; i++) {
      const currentEvent = events[i];
      const currentLaneNs = eventLane.get(currentEvent.id)!;
      const currentLane = laneByNamespace.get(currentLaneNs)!;

      if (i < events.length - 1) {
        const nextEvent = events[i + 1];
        const nextLaneNs = eventLane.get(nextEvent.id)!;
        const nextLane = laneByNamespace.get(nextLaneNs)!;
        const nextIsMoveEvent = nextEvent.moveEvent === true;
        const crossesLanes = currentLaneNs !== nextLaneNs;

        const edgeLabel =
          currentEvent.label ||
          currentEvent.name.split('.').pop() ||
          currentEvent.name;

        edges.push({
          id: `edge-${currentEvent.id}-to-${nextEvent.id}`,
          source: currentEvent.id,
          target: nextEvent.id,
          type: 'sequenceArrowParticipant',
          label: edgeLabel,
          labelStyle: { fontSize: 12, fontWeight: 500 },
          labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
          data: {
            crossesLanes,
            sourceNamespace: currentLaneNs,
            targetNamespace: nextLaneNs,
            isMoveEvent: nextIsMoveEvent,
            sourceEvent: currentEvent,
            targetEvent: nextEvent,
            sourceParticipantX: currentLane.x,
            targetParticipantX: nextLane.x,
          },
        });
      } else {
        const currentIsMoveEvent = currentEvent.moveEvent === true;
        const edgeLabel =
          currentEvent.label ||
          currentEvent.name.split('.').pop() ||
          currentEvent.name;

        edges.push({
          id: `edge-${currentEvent.id}-end`,
          source: currentEvent.id,
          target: currentEvent.id,
          type: 'sequenceArrowParticipant',
          label: edgeLabel,
          labelStyle: { fontSize: 12, fontWeight: 500 },
          labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
          data: {
            crossesLanes: false,
            sourceNamespace: currentLaneNs,
            targetNamespace: currentLaneNs,
            isMoveEvent: currentIsMoveEvent,
            sourceEvent: currentEvent,
            targetEvent: currentEvent,
            sourceParticipantX: currentLane.x,
            targetParticipantX: currentLane.x,
            isLastEvent: true,
            eventSpacing,
          },
        });
      }
    }

    // Step 6: Compute total dimensions
    const totalWidth =
      swimlanes.length * laneWidth + (swimlanes.length - 1) * laneGap;
    const totalHeight = totalHeaderHeight + 40 + events.length * eventSpacing;

    // Step 7: Boundary nodes so React Flow's fitView covers full width
    if (swimlanes.length > 0) {
      const leftmostLane = swimlanes[0];
      const rightmostLane = swimlanes[swimlanes.length - 1];

      nodes.push(
        {
          id: '__boundary_left__',
          type: 'default',
          position: { x: leftmostLane.x - laneWidth / 2, y: 0 },
          data: {},
          style: { width: 1, height: 1, opacity: 0 },
          draggable: false,
          selectable: false,
        },
        {
          id: '__boundary_right__',
          type: 'default',
          position: { x: rightmostLane.x + laneWidth / 2, y: totalHeight },
          data: {},
          style: { width: 1, height: 1, opacity: 0 },
          draggable: false,
          selectable: false,
        }
      );
    }

    return {
      nodes,
      edges,
      swimlanes,
      parentHeaders,
      headerRows,
      totalWidth,
      totalHeight,
    };
  }, [
    events,
    sequenceEdges,
    openedKey,
    laneOrderKey,
    laneOrder,
    laneWidth,
    laneGap,
    eventSpacing,
    headerHeight,
    nodeWidth,
    nodeHeight,
  ]);
}
