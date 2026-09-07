import React, {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  useViewport,
  applyNodeChanges,
  applyEdgeChanges,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type Node,
  type NodeTypes,
  type Connection,
} from '@xyflow/react';
// CSS import removed - consumers should import '@xyflow/react/dist/style.css' in their app
import type {
  GraphConfiguration,
  NodeState,
  EdgeState,
  Violation,
  GraphEvent,
  NodeEvent,
  EdgeEvent,
  StateEvent,
  ExtendedCanvas,
  ComponentLibrary,
} from '@principal-ai/subsystems-core';
import {
  CanvasConverter,
  buildScopeColorMap,
  buildSpanColorMap,
  resolveEventSpanColor,
  DRAFT_NODE_COLOR,
  DEFAULT_SPAN_COLOR,
  isStandardCanvasNode,
} from '@principal-ai/subsystems-core';
import { useTheme } from '@principal-ade/industry-theme';
import { CustomNode } from '../nodes/CustomNode';
import type { CustomNodeData } from '../nodes/CustomNode';
import { CustomEdge } from '../edges/CustomEdge';
import type { CustomEdgeData } from '../edges/CustomEdge';
import {
  convertToXYFlowNodes,
  convertToXYFlowEdges,
} from '../utils/graphConverter';
import { useElkLayout, applyElkPathsToEdges } from '../hooks/useElkLayout';
import {
  getCanvasBounds,
  calculateInitialViewport,
  type Viewport,
} from '../utils/canvasBounds';
import { GraphEditProvider } from '../contexts/GraphEditContext';
import { useUndoRedo, type HistoryEntry } from '../hooks/useUndoRedo';
import { TooltipPortalContext } from '../contexts/TooltipPortalContext';

// Re-export for backwards compatibility
export { TooltipPortalContext };

/** Position change event for tracking node movements */
export interface NodePositionChange {
  nodeId: string;
  position: { x: number; y: number };
}

/** Dimension change event for tracking node resizing */
export interface NodeDimensionChange {
  nodeId: string;
  dimensions: { width: number; height: number };
}

/** Text change event for tracking inline text edits */
export interface NodeTextChange {
  nodeId: string;
  text: string;
}

/** All pending changes that can be saved */
export interface PendingChanges {
  /** Node position changes */
  positionChanges: NodePositionChange[];
  /** Node dimension changes (from resizing) */
  dimensionChanges: NodeDimensionChange[];
  /** Text changes for text and group nodes */
  textChanges: NodeTextChange[];
  /** Node updates (type, data changes) */
  nodeUpdates: Array<{
    nodeId: string;
    updates: { type?: string; data?: Record<string, unknown> };
  }>;
  /** Deleted node IDs */
  deletedNodeIds: string[];
  /** New edges created (with optional handle info for connection points) */
  createdEdges: Array<{
    from: string;
    to: string;
    type: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
  /** Deleted edges (with full connection info for config removal) */
  deletedEdges: Array<{ from: string; to: string; type: string }>;
  /** Whether there are any changes */
  hasChanges: boolean;
}

/** Ref handle for imperative actions */
export interface GraphRendererHandle {
  /** Get all pending changes */
  getPendingChanges: () => PendingChanges;
  /** Reset edit state to match current props */
  resetEditState: () => void;
  /** Check if there are unsaved changes */
  hasUnsavedChanges: () => boolean;
  /** Whether there are changes that can be undone */
  canUndo: () => boolean;
  /** Whether there are changes that can be redone */
  canRedo: () => boolean;
  /** Undo the last change */
  undo: () => void;
  /** Redo the last undone change */
  redo: () => void;
}

/** Base props shared by all render modes */
interface GraphRendererBaseProps {
  /** Optional violations to highlight */
  violations?: Violation[];

  /**
   * Duration of the fitView animation in milliseconds.
   * Set to 0 for instant positioning (no animation).
   * Defaults to 200.
   */
  fitViewDuration?: number;

  /**
   * Whether to show tooltips on hover for nodes and edges.
   * Defaults to true.
   */
  showTooltips?: boolean;

  /**
   * Optional node ID to highlight (e.g., when playing back execution events).
   * Highlighted nodes will have a special visual treatment.
   */
  highlightedNodeId?: string | null;

  /**
   * Optional list of active node IDs (nodes involved in current execution scenario).
   * Nodes NOT in this list will be dimmed (reduced opacity).
   * If undefined or empty, all nodes are shown at full opacity.
   */
  activeNodeIds?: string[] | null;

  /** Optional configuration name for identification (used with multi-config setups) */
  configName?: string;

  /** Optional class name */
  className?: string;

  /** Optional width */
  width?: number | string;

  /** Optional height */
  height?: number | string;

  /** Whether to show minimap */
  showMinimap?: boolean;

  /** Whether to show controls */
  showControls?: boolean;

  /** Whether to show background */
  showBackground?: boolean;

  /**
   * Background variant style.
   * - 'dots': Small dots pattern
   * - 'lines': Grid lines (default)
   * - 'cross': Cross pattern
   */
  backgroundVariant?: 'dots' | 'lines' | 'cross';

  /**
   * Gap between background pattern elements in pixels.
   * Defaults to 50 for lines/cross, 16 for dots.
   */
  backgroundGap?: number;

  /**
   * Whether to show a center indicator at the canvas origin (0,0).
   * Useful for visualizing where the center point is when items aren't centered.
   * Defaults to false.
   */
  showCenterIndicator?: boolean;

  /** Optional event stream for triggering animations */
  events?: GraphEvent[];

  /** Optional callback when an event is processed */
  onEventProcessed?: (event: GraphEvent) => void;

  /**
   * Whether edit mode is enabled.
   * When true, nodes can be dragged, edited, deleted, and edges can be created/deleted.
   * All changes are tracked internally and can be retrieved via ref.getPendingChanges()
   */
  editable?: boolean;

  /**
   * Callback when pending changes state changes.
   * Called with true when there are unsaved changes, false when there are none.
   * Use this to enable/disable save buttons in the parent component.
   */
  onPendingChangesChange?: (hasChanges: boolean) => void;

  /**
   * Callback when a node is clicked.
   * Receives the node ID and the click event. If provided, overrides default node selection behavior.
   */
  onNodeClick?: (nodeId: string, event: React.MouseEvent) => void;

  /**
   * When set, fits the viewport to show these specific nodes.
   * Useful for focusing on a subset of the graph (e.g., scenario nodes).
   * Pass null/undefined/empty array to use default fitView behavior.
   */
  fitViewToNodeIds?: string[] | null;

  /**
   * Padding around nodes when fitting view to specific nodes.
   * @default 0.2
   */
  fitViewPadding?: number;

  /**
   * Set of node IDs that should be draggable even when editable=false.
   * Useful for allowing specific nodes (like group containers) to be moved
   * while keeping other nodes locked in place.
   */
  draggableNodeIds?: Set<string>;

  /**
   * Callback fired when a node drag operation completes.
   * Receives the node ID and its new position.
   */
  onNodeDragStop?: (nodeId: string, position: { x: number; y: number }) => void;

  /**
   * Callback fired when user presses Cmd+C (Mac) or Ctrl+C (Windows/Linux)
   * with nodes selected. Receives the array of selected node IDs.
   * Use this to implement custom copy behavior.
   */
  onCopy?: (selectedNodeIds: string[]) => void;

  /**
   * Container width in pixels. When provided along with containerHeight,
   * enables calculating the initial viewport synchronously to avoid the
   * "zoom in then animate out" effect on initial render.
   */
  containerWidth?: number;

  /**
   * Container height in pixels. When provided along with containerWidth,
   * enables calculating the initial viewport synchronously to avoid the
   * "zoom in then animate out" effect on initial render.
   */
  containerHeight?: number;

  /**
   * ELK layout configuration for circuit-board style edge routing.
   * When enabled, edges are routed with orthogonal paths that don't overlap.
   */
  elkLayout?: {
    /**
     * Whether ELK layout is enabled
     * @default false
     */
    enabled: boolean;
    /**
     * Edge routing style
     * - 'orthogonal': Circuit-board style with 90-degree angles (default)
     * - 'splines': Smooth curved edges
     * - 'polyline': Straight line segments
     */
    routingStyle?: 'orthogonal' | 'splines' | 'polyline';
    /**
     * Minimum spacing between parallel edges in pixels
     * @default 15
     */
    edgeSpacing?: number;
    /**
     * Spacing between edges and nodes in pixels
     * @default 20
     */
    edgeNodeSpacing?: number;
  };

  /**
   * Scenario-derived edges with sequence information.
   * When provided, edges matching these transitions will show sequence numbers.
   * Use with deriveEdgesFromSequence() from @principal-ai/core to generate these.
   */
  scenarioEdges?: Array<{
    fromSpan: string;
    toSpan: string;
    sequenceNumber: number;
  }>;

  /**
   * Whether to show sequence labels on edges when scenarioEdges is provided.
   * @default true
   */
  showSequenceLabels?: boolean;

}

/** GraphRenderer props - canvas format only */
export interface GraphRendererProps extends GraphRendererBaseProps {
  /** Extended Canvas document */
  canvas: ExtendedCanvas;

  /**
   * Optional component library containing reusable node and edge type definitions.
   * Types from the library are merged with canvas-level types, with canvas types taking precedence.
   * This allows sharing type definitions across multiple canvas files via a library.yaml file.
   */
  library?: ComponentLibrary;

  /**
   * Optional spans canvas containing span convention definitions.
   * Span colors from this canvas are used as fill colors for event nodes.
   * When provided with workflowSpanPattern, events will be colored based on their span.
   */
  spansCanvas?: ExtendedCanvas;

  /**
   * Optional scopes canvas containing scope definitions with colors.
   * Required for scope-based node coloring.
   * Replaces library.scopes (which is now deprecated).
   */
  scopesCanvas?: ExtendedCanvas;

  /**
   * Optional span pattern for the current workflow context.
   * When provided, event nodes will use the span color from spansCanvas as their fill.
   * This should match a spanPattern from a workflow.json file.
   */
  workflowSpanPattern?: string;
}

// Define custom node types
// Type assertion needed because ReactFlow's NodeTypes expects generic components
// but CustomNode is properly typed with CustomNodeData for type safety internally
const nodeTypes = { custom: CustomNode } as NodeTypes;

// Define custom edge types
// Type assertion needed because ReactFlow's EdgeTypes expects generic components
// but CustomEdge is properly typed with CustomEdgeData for type safety internally
const edgeTypes = { custom: CustomEdge } as EdgeTypes;

// Animation state for nodes and edges
interface AnimationState {
  nodeAnimations: Record<
    string,
    { type: 'pulse' | 'flash' | 'shake' | 'entry'; duration: number; timestamp: number }
  >;
  edgeAnimations: Record<
    string,
    {
      type: 'flow' | 'particle' | 'pulse' | 'glow';
      duration: number;
      direction?: 'forward' | 'backward' | 'bidirectional';
      timestamp: number;
    }
  >;
}

// Alignment guide for visual feedback during node dragging
interface AlignmentGuide {
  /** Orientation of the guide line */
  type: 'horizontal' | 'vertical';
  /** Position in pixels (x for vertical, y for horizontal) */
  position: number;
  /** Optional label describing the alignment (e.g., "Left edge", "Center") */
  label?: string;
}

// Internal edit state tracking
interface EditState {
  positionChanges: Map<string, { x: number; y: number }>;
  dimensionChanges: Map<string, { width: number; height: number }>;
  textChanges: Map<string, string>;
  nodeUpdates: Map<string, { type?: string; data?: Record<string, unknown> }>;
  deletedNodeIds: Set<string>;
  createdEdges: Array<{
    id: string;
    from: string;
    to: string;
    type: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
  deletedEdges: Array<{ id: string; from: string; to: string; type: string }>;
}

const createEmptyEditState = (): EditState => ({
  positionChanges: new Map(),
  dimensionChanges: new Map(),
  textChanges: new Map(),
  nodeUpdates: new Map(),
  deletedNodeIds: new Set(),
  createdEdges: [],
  deletedEdges: [],
});

/**
 * Alignment guides component that renders visual lines when nodes align during drag.
 * Shows vertical lines for horizontal alignment (left/center/right) and
 * horizontal lines for vertical alignment (top/middle/bottom).
 */
const AlignmentGuidesOverlay: React.FC<{
  guides: AlignmentGuide[];
  color: string;
}> = ({ guides, color }) => {
  const { x: viewportX, y: viewportY, zoom } = useViewport();

  if (guides.length === 0) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {guides.map((guide, index) => {
        if (guide.type === 'vertical') {
          // Vertical line (for horizontal alignment)
          const screenX = guide.position * zoom + viewportX;
          return (
            <line
              key={`${guide.type}-${guide.position}-${index}`}
              x1={screenX}
              y1={0}
              x2={screenX}
              y2="100%"
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray="4,4"
              opacity={0.8}
            />
          );
        } else {
          // Horizontal line (for vertical alignment)
          const screenY = guide.position * zoom + viewportY;
          return (
            <line
              key={`${guide.type}-${guide.position}-${index}`}
              x1={0}
              y1={screenY}
              x2="100%"
              y2={screenY}
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray="4,4"
              opacity={0.8}
            />
          );
        }
      })}
    </svg>
  );
};

/**
 * Center indicator component that shows a crosshair at the canvas origin (0,0).
 * Uses viewport transform to position correctly regardless of pan/zoom.
 */
const CenterIndicator: React.FC<{ color: string }> = ({ color }) => {
  const { x, y } = useViewport();

  // Size of the crosshair in screen pixels (stays constant regardless of zoom)
  const size = 20;
  const strokeWidth = 1.5;

  // The viewport transform places origin (0,0) at screen position (x, y)
  const screenX = x;
  const screenY = y;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {/* Vertical line */}
      <line
        x1={screenX}
        y1={screenY - size}
        x2={screenX}
        y2={screenY + size}
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={0.7}
      />
      {/* Horizontal line */}
      <line
        x1={screenX - size}
        y1={screenY}
        x2={screenX + size}
        y2={screenY}
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={0.7}
      />
      {/* Center dot */}
      <circle
        cx={screenX}
        cy={screenY}
        r={3}
        fill={color}
        opacity={0.7}
      />
    </svg>
  );
};

/** Inner component receives normalized legacy format */
/** Ref for undo/redo functions that inner component will populate */
interface UndoRedoFunctionsRef {
  applyUndo: () => void;
  applyRedo: () => void;
}

interface GraphRendererInnerProps {
  configuration: GraphConfiguration;
  nodes: NodeState[];
  edges: EdgeState[];
  violations?: Violation[];
  configName?: string;
  showMinimap?: boolean;
  showControls?: boolean;
  showBackground?: boolean;
  backgroundVariant?: 'dots' | 'lines' | 'cross';
  backgroundGap?: number;
  showCenterIndicator?: boolean;
  showTooltips?: boolean;
  fitViewDuration?: number;
  highlightedNodeId?: string | null;
  activeNodeIds?: string[] | null;
  events?: GraphEvent[];
  onEventProcessed?: (event: GraphEvent) => void;
  editable?: boolean;
  onPendingChangesChange?: (hasChanges: boolean) => void;
  onEditStateChange?: (editState: EditState) => void;
  editStateRef: React.MutableRefObject<EditState>;
  resetVisualStateRef: React.MutableRefObject<(() => void) | null>;
  resetTextChangesVersionRef: React.MutableRefObject<(() => void) | null>;
  undoRedoFunctionsRef: React.MutableRefObject<UndoRedoFunctionsRef | null>;
  pushHistory: (entries: HistoryEntry[]) => void;
  clearHistory: () => void;
  undoFromStack: () => HistoryEntry[] | null;
  redoFromStack: () => HistoryEntry[] | null;
  onNodeClick?: (nodeId: string, event: React.MouseEvent) => void;
  fitViewToNodeIds?: string[] | null;
  fitViewPadding?: number;
  draggableNodeIds?: Set<string>;
  onNodeDragStop?: (nodeId: string, position: { x: number; y: number }) => void;
  onCopy?: (selectedNodeIds: string[]) => void;
  /** Pre-calculated initial viewport to avoid zoom animation on mount */
  initialViewport?: Viewport;
  /** ELK layout configuration for circuit-board style edge routing */
  elkLayout?: {
    enabled: boolean;
    routingStyle?: 'orthogonal' | 'splines' | 'polyline';
    edgeSpacing?: number;
    edgeNodeSpacing?: number;
  };
  /** Scenario-derived edges with sequence information */
  scenarioEdges?: Array<{
    fromSpan: string;
    toSpan: string;
    sequenceNumber: number;
  }>;
  /** Whether to show sequence labels on edges when scenarioEdges is provided */
  showSequenceLabels?: boolean;
}

/**
 * Inner component that uses ReactFlow hooks
 */
const GraphRendererInner: React.FC<GraphRendererInnerProps> = ({
  configuration,
  nodes: propNodes,
  edges: propEdges,
  violations = [],
  configName: _configName,
  showMinimap = false,
  showControls = true,
  showBackground = true,
  backgroundVariant = 'lines',
  backgroundGap,
  showCenterIndicator = false,
  showTooltips = true,
  fitViewDuration = 200,
  highlightedNodeId,
  activeNodeIds,
  events = [],
  onEventProcessed,
  editable = false,
  onPendingChangesChange,
  onEditStateChange,
  editStateRef,
  resetVisualStateRef,
  resetTextChangesVersionRef,
  undoRedoFunctionsRef,
  pushHistory,
  clearHistory,
  undoFromStack,
  redoFromStack,
  onNodeClick: onNodeClickProp,
  fitViewToNodeIds,
  fitViewPadding = 0.2,
  draggableNodeIds,
  onNodeDragStop: onNodeDragStopProp,
  onCopy,
  initialViewport,
  elkLayout,
  scenarioEdges,
  showSequenceLabels = true,
}) => {
  const { fitView, fitBounds, getNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const { theme } = useTheme();

  // Track shift key state for tooltip control
  const [shiftKeyPressed, setShiftKeyPressed] = useState(false);

  // Track text changes version to force re-renders when text is edited
  const [textChangesVersion, setTextChangesVersion] = useState(0);

  // Track if we're currently processing a node hide operation
  const hidingNodeRef = useRef(false);

  // Setup keyboard event listeners for shift key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftKeyPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftKeyPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Track active animations
  const [animationState, setAnimationState] = useState<AnimationState>({
    nodeAnimations: {},
    edgeAnimations: {},
  });

  // Track alignment guides during drag operations
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);

  // Track selected edges for info panel (supports multi-select)
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());

  // Track selected nodes for info panel (supports multi-select)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

  // Setup keyboard event listener for copy (Cmd+C / Ctrl+C)
  useEffect(() => {
    if (!onCopy) return;

    const handleCopy = (e: KeyboardEvent) => {
      // Check for Cmd+C (Mac) or Ctrl+C (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        if (selectedNodeIds.size > 0) {
          e.preventDefault();
          onCopy(Array.from(selectedNodeIds));
        }
      }
    };

    window.addEventListener('keydown', handleCopy);
    return () => {
      window.removeEventListener('keydown', handleCopy);
    };
  }, [onCopy, selectedNodeIds]);

  // Track hidden nodes (shift-click to toggle)
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());

  // Track pending connection for edge type picker
  const [pendingConnection, setPendingConnection] = useState<{
    from: string;
    to: string;
    sourceHandle?: string;
    targetHandle?: string;
    validTypes: string[];
  } | null>(null);

  // Sync highlightedNodeId to selection state
  useEffect(() => {
    if (highlightedNodeId) {
      setSelectedNodeIds(new Set([highlightedNodeId]));
      // Clear edge selection when highlighting a node
      setSelectedEdgeIds(new Set());
    }
  }, [highlightedNodeId]);

  // ============================================
  // INTERNAL EDIT STATE
  // ============================================

  // Local copies of nodes and edges for editing
  const [localNodes, setLocalNodes] = useState<NodeState[]>(propNodes);
  const [localEdges, setLocalEdges] = useState<EdgeState[]>(propEdges);

  // Track the prop values to detect external changes
  const propNodesKeyRef = useRef(
    propNodes
      .map((n) => n.id)
      .sort()
      .join(',')
  );
  const propEdgesKeyRef = useRef(
    propEdges
      .map((e) => e.id)
      .sort()
      .join(',')
  );

  // Sync local state with props when props change (e.g., config reload)
  // This only happens when the structure changes, not during editing
  useEffect(() => {
    const newNodesKey = propNodes
      .map((n) => n.id)
      .sort()
      .join(',');
    const newEdgesKey = propEdges
      .map((e) => e.id)
      .sort()
      .join(',');

    if (newNodesKey !== propNodesKeyRef.current || newEdgesKey !== propEdgesKeyRef.current) {
      // Debug: Log sync events
      if (process.env.NODE_ENV === 'development') {
        console.log('[GraphRenderer] Syncing local state with props:', {
          prevNodesKey: propNodesKeyRef.current,
          newNodesKey,
          prevEdgesKey: propEdgesKeyRef.current,
          newEdgesKey,
          propNodesCount: propNodes.length,
          propEdgesCount: propEdges.length,
        });
      }
      propNodesKeyRef.current = newNodesKey;
      propEdgesKeyRef.current = newEdgesKey;
      setLocalNodes(propNodes);
      setLocalEdges(propEdges);
      // Reset edit state when props change
      editStateRef.current = createEmptyEditState();
      onEditStateChange?.(editStateRef.current);
      onPendingChangesChange?.(false);
      // Clear animation state to prevent stale animations from affecting new edges
      setAnimationState({ nodeAnimations: {}, edgeAnimations: {} });
      // Clear undo/redo history when props change
      clearHistory();
    }
  }, [propNodes, propEdges, editStateRef, onEditStateChange, onPendingChangesChange]);

  // When draggableNodeIds is provided, positions are managed externally
  // Sync positions from props whenever they change (only when props actually change from parent)
  const propNodesRef = useRef(propNodes);
  useEffect(() => {
    if (!draggableNodeIds || draggableNodeIds.size === 0) return;
    // Only sync if propNodes reference actually changed (from parent update)
    if (propNodesRef.current === propNodes) return;
    propNodesRef.current = propNodes;
    setLocalNodes(propNodes);
  }, [propNodes, draggableNodeIds]);

  // Always use localNodes for rendering - it syncs with props when structure changes
  // and receives state_changed event updates. localEdges only used in edit mode.
  // Filter out deleted nodes in edit mode
  const nodes = editable
    ? localNodes.filter((node) => !editStateRef.current.deletedNodeIds.has(node.id))
    : localNodes;
  const edges = editable ? localEdges : propEdges;

  // Ref to track current xyflow nodes for undo/redo (set later via useEffect)
  const xyflowNodesRef = useRef<Node<CustomNodeData>[]>([]);

  // Ref to capture node positions at drag start (for accurate undo "before" values)
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Helper to check if there are pending changes
  const checkHasChanges = useCallback((state: EditState): boolean => {
    return (
      state.positionChanges.size > 0 ||
      state.dimensionChanges.size > 0 ||
      state.textChanges.size > 0 ||
      state.nodeUpdates.size > 0 ||
      state.deletedNodeIds.size > 0 ||
      state.createdEdges.length > 0 ||
      state.deletedEdges.length > 0
    );
  }, []);

  // Helper to update edit state and notify parent
  const updateEditState = useCallback(
    (updater: (prev: EditState) => EditState) => {
      const newState = updater(editStateRef.current);
      editStateRef.current = newState;
      const hasChanges = checkHasChanges(newState);

      // Debug logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[GraphRenderer] Edit state updated:', {
          positionChanges: newState.positionChanges.size,
          dimensionChanges: newState.dimensionChanges.size,
          textChanges: newState.textChanges.size,
          nodeUpdates: newState.nodeUpdates.size,
          hasChanges,
        });
      }

      onEditStateChange?.(newState);
      onPendingChangesChange?.(hasChanges);
    },
    [editStateRef, onEditStateChange, onPendingChangesChange, checkHasChanges]
  );

  // Handler for node resize end - called from CustomNode via context
  const handleNodeResizeEnd = useCallback(
    (nodeId: string, dimensions: { width: number; height: number }) => {
      if (!editable) return;

      // Capture before dimensions for undo
      const currentNode = xyflowNodesRef.current.find((n) => n.id === nodeId);
      const beforeDimensions = currentNode
        ? { width: currentNode.width ?? 0, height: currentNode.height ?? 0 }
        : { width: 0, height: 0 };

      // Push to history
      pushHistory([
        {
          type: 'dimension',
          nodeId,
          before: beforeDimensions,
          after: dimensions,
        },
      ]);

      updateEditState((prev) => {
        const newDimensions = new Map(prev.dimensionChanges);
        newDimensions.set(nodeId, dimensions);
        return { ...prev, dimensionChanges: newDimensions };
      });
    },
    [editable, updateEditState, pushHistory]
  );

  // Handler for node text change - called from CustomNode via context
  const handleNodeTextChange = useCallback(
    (nodeId: string, text: string) => {
      if (!editable) return;

      // Capture before text for undo
      // For text nodes, the text is in the canvas node's 'text' field
      // For group nodes, it's in the 'label' field
      // We need to look at the original canvas to get the before value
      const beforeText = editStateRef.current.textChanges.get(nodeId) ?? '';

      // Push to history
      pushHistory([
        {
          type: 'text',
          nodeId,
          before: beforeText,
          after: text,
        },
      ]);

      updateEditState((prev) => {
        const newTextChanges = new Map(prev.textChanges);
        newTextChanges.set(nodeId, text);
        return { ...prev, textChanges: newTextChanges };
      });

      // Force re-render by incrementing version
      setTextChangesVersion((v) => v + 1);
    },
    [editable, updateEditState, pushHistory]
  );

  // Handler for deleting selected nodes (Delete/Backspace key)
  const handleDeleteSelectedNodes = useCallback(() => {
    if (!editable || selectedNodeIds.size === 0) return;

    const nodesToDelete = Array.from(selectedNodeIds);
    const historyEntries: HistoryEntry[] = [];

    // Build history entries for each deleted node
    for (const nodeId of nodesToDelete) {
      const node = localNodes.find((n) => n.id === nodeId);
      if (!node) continue;

      historyEntries.push({
        type: 'nodeDelete',
        nodeId,
        nodeData: node,
      });
    }

    // Push all deletions as a single batch
    if (historyEntries.length > 0) {
      pushHistory(historyEntries);

      updateEditState((prev) => {
        const newDeletedNodeIds = new Set(prev.deletedNodeIds);
        nodesToDelete.forEach((id) => newDeletedNodeIds.add(id));
        return { ...prev, deletedNodeIds: newDeletedNodeIds };
      });

      // Clear selection after deletion
      setSelectedNodeIds(new Set());
    }
  }, [editable, selectedNodeIds, localNodes, pushHistory, updateEditState]);

  // Handle toggling node hidden state (Cmd/Ctrl+click)
  // This is exposed via context so CustomNode can call it on mousedown
  // (mousedown works in edit mode where click is intercepted by drag handling)
  const handleToggleNodeHidden = useCallback(
    (nodeId: string) => {
      hidingNodeRef.current = true;

      setHiddenNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        return next;
      });

      // Reset the flag after state update completes
      setTimeout(() => {
        hidingNodeRef.current = false;
      }, 0);
    },
    []
  );

  // Handle hiding all nodes not directly connected to the given node (Cmd/Ctrl+Shift+click)
  // If all unconnected nodes are already hidden, this will unhide them (toggle behavior)
  const handleHideUnconnectedNodes = useCallback(
    (nodeId: string) => {
      hidingNodeRef.current = true;

      // Find all nodes directly connected to this node
      const connectedNodeIds = new Set<string>([nodeId]);
      for (const edge of localEdges) {
        if (edge.from === nodeId) {
          connectedNodeIds.add(edge.to);
        } else if (edge.to === nodeId) {
          connectedNodeIds.add(edge.from);
        }
      }

      // Get all unconnected node IDs
      const unconnectedNodeIds = localNodes
        .map((n) => n.id)
        .filter((id) => !connectedNodeIds.has(id));

      setHiddenNodeIds((prev) => {
        // Check if all unconnected nodes are already hidden
        const allUnconnectedHidden = unconnectedNodeIds.every((id) => prev.has(id));

        if (allUnconnectedHidden) {
          // Toggle off - unhide all unconnected nodes
          const next = new Set(prev);
          for (const id of unconnectedNodeIds) {
            next.delete(id);
          }
          return next;
        } else {
          // Hide all unconnected nodes
          const next = new Set(prev);
          for (const id of unconnectedNodeIds) {
            next.add(id);
          }
          return next;
        }
      });

      // Reset the flag after state update completes
      setTimeout(() => {
        hidingNodeRef.current = false;
      }, 0);
    },
    [localEdges, localNodes]
  );

  // Memoize the context value to prevent unnecessary re-renders
  const graphEditContextValue = useMemo(
    () => ({
      onNodeResizeEnd: handleNodeResizeEnd,
      onNodeTextChange: handleNodeTextChange,
      onToggleNodeHidden: handleToggleNodeHidden,
      onHideUnconnectedNodes: handleHideUnconnectedNodes,
    }),
    [handleNodeResizeEnd, handleNodeTextChange, handleToggleNodeHidden, handleHideUnconnectedNodes]
  );

  // ============================================
  // ALIGNMENT GUIDES
  // ============================================

  /**
   * Detect alignment guides between a dragging node and other nodes
   * @param draggingNodeId - ID of the node being dragged
   * @param nodes - All nodes in the graph
   * @returns Array of alignment guides to display
   */
  const detectAlignmentGuides = useCallback(
    (draggingNodeId: string, nodes: Node<CustomNodeData>[]): AlignmentGuide[] => {
      const threshold = 5; // pixels - how close to snap/show guide
      const guides: AlignmentGuide[] = [];

      const draggingNode = nodes.find((n) => n.id === draggingNodeId);
      if (!draggingNode) return guides;

      const dragLeft = draggingNode.position.x;
      const dragRight = draggingNode.position.x + (draggingNode.width ?? 0);
      const dragCenterX = draggingNode.position.x + (draggingNode.width ?? 0) / 2;
      const dragTop = draggingNode.position.y;
      const dragBottom = draggingNode.position.y + (draggingNode.height ?? 0);
      const dragCenterY = draggingNode.position.y + (draggingNode.height ?? 0) / 2;

      // Check alignment with other nodes
      for (const node of nodes) {
        if (node.id === draggingNodeId) continue;

        const nodeLeft = node.position.x;
        const nodeRight = node.position.x + (node.width ?? 0);
        const nodeCenterX = node.position.x + (node.width ?? 0) / 2;
        const nodeTop = node.position.y;
        const nodeBottom = node.position.y + (node.height ?? 0);
        const nodeCenterY = node.position.y + (node.height ?? 0) / 2;

        // Vertical guides (align horizontally - left/center/right)
        if (Math.abs(dragLeft - nodeLeft) < threshold) {
          guides.push({ type: 'vertical', position: nodeLeft, label: 'Left' });
        } else if (Math.abs(dragCenterX - nodeCenterX) < threshold) {
          guides.push({ type: 'vertical', position: nodeCenterX, label: 'Center' });
        } else if (Math.abs(dragRight - nodeRight) < threshold) {
          guides.push({ type: 'vertical', position: nodeRight, label: 'Right' });
        }

        // Horizontal guides (align vertically - top/middle/bottom)
        if (Math.abs(dragTop - nodeTop) < threshold) {
          guides.push({ type: 'horizontal', position: nodeTop, label: 'Top' });
        } else if (Math.abs(dragCenterY - nodeCenterY) < threshold) {
          guides.push({ type: 'horizontal', position: nodeCenterY, label: 'Middle' });
        } else if (Math.abs(dragBottom - nodeBottom) < threshold) {
          guides.push({ type: 'horizontal', position: nodeBottom, label: 'Bottom' });
        }
      }

      // Remove duplicates (same position guides)
      const uniqueGuides = guides.filter(
        (guide, index, self) =>
          index ===
          self.findIndex((g) => g.type === guide.type && g.position === guide.position)
      );

      return uniqueGuides;
    },
    []
  );

  // ============================================
  // EVENT HANDLERS
  // ============================================

  // Handle edge click (toggle selection, supports Shift for multi-select)
  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (event.shiftKey && editable) {
        // Shift+click: toggle edge in selection
        setSelectedEdgeIds((prev) => {
          const next = new Set(prev);
          if (next.has(edge.id)) {
            next.delete(edge.id);
          } else {
            next.add(edge.id);
          }
          return next;
        });
      } else {
        // Regular click: single select (replace selection)
        const shouldDeselect = selectedEdgeIds.size === 1 && selectedEdgeIds.has(edge.id);
        if (shouldDeselect) {
          setSelectedEdgeIds(new Set());
        } else {
          setSelectedEdgeIds(new Set([edge.id]));
        }
        setSelectedNodeIds(new Set());
      }
    },
    [editable, selectedEdgeIds]
  );

  // Handle node click (toggle selection, supports Cmd/Ctrl for hide/dim)
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Cmd+click (Mac) or Ctrl+click (Windows/Linux): toggle node visibility (hide edges and dim node)
      // Cmd+Shift+click: hide all nodes not directly connected to this node
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();

        if (event.shiftKey) {
          // Cmd/Ctrl+Shift+click: hide unconnected nodes
          handleHideUnconnectedNodes(node.id);
        } else {
          // Cmd/Ctrl+click: toggle single node
          handleToggleNodeHidden(node.id);
        }

        return;
      }

      // Shift+click: toggle node in selection (add/remove from multi-select)
      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();

        setSelectedNodeIds((prev) => {
          const next = new Set(prev);
          if (next.has(node.id)) {
            next.delete(node.id);
          } else {
            next.add(node.id);
          }

          // Update local nodes selection state immediately for edit mode
          if (editable) {
            setXyflowLocalNodes((nodes) =>
              nodes.map((n) => ({
                ...n,
                selected: next.has(n.id),
              }))
            );
          }

          return next;
        });
        return;
      }

      // Regular click: single select (replace selection)
      event.preventDefault();
      event.stopPropagation();

      const shouldDeselect = selectedNodeIds.size === 1 && selectedNodeIds.has(node.id);
      if (shouldDeselect) {
        setSelectedNodeIds(new Set());

        // Update local nodes selection state immediately for edit mode
        if (editable) {
          setXyflowLocalNodes((nodes) =>
            nodes.map((n) => ({
              ...n,
              selected: false,
            }))
          );
        }
      } else {
        setSelectedNodeIds(new Set([node.id]));

        // Update local nodes selection state immediately for edit mode
        if (editable) {
          setXyflowLocalNodes((nodes) =>
            nodes.map((n) => ({
              ...n,
              selected: n.id === node.id,
            }))
          );
        }
      }
      setSelectedEdgeIds(new Set());

      // If custom node click handler is provided, call it after selection is updated
      if (onNodeClickProp) {
        onNodeClickProp(node.id, event);
      }
    },
    [selectedNodeIds, onNodeClickProp, editable, handleToggleNodeHidden, handleHideUnconnectedNodes]
  );


  // Track the last node we fitted to (for toggle behavior)
  const lastFittedNodeRef = useRef<string | null>(null);

  // Handle double-click on node in non-edit mode to fit/focus around it
  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Prevent default zoom behavior
      event.preventDefault();
      event.stopPropagation();

      // Only fit to node in non-edit mode
      if (editable) return;

      // Toggle behavior: if we already fitted to this node, zoom out to full view
      if (lastFittedNodeRef.current === node.id) {
        lastFittedNodeRef.current = null;

        // Calculate bounds for ALL nodes
        const allNodes = getNodes();
        if (allNodes.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

          for (const n of allNodes) {
            const w = n.measured?.width ?? n.width ?? 200;
            const h = n.measured?.height ?? n.height ?? 100;
            minX = Math.min(minX, n.position.x);
            minY = Math.min(minY, n.position.y);
            maxX = Math.max(maxX, n.position.x + w);
            maxY = Math.max(maxY, n.position.y + h);
          }

          fitBounds({
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          }, {
            padding: 0.2,
            duration: fitViewDuration,
          });
        }
        return;
      }

      // Get the node's dimensions (use measured dimensions if available)
      const width = node.measured?.width ?? node.width ?? 200;
      const height = node.measured?.height ?? node.height ?? 100;

      // Fit the view to the node's bounds
      lastFittedNodeRef.current = node.id;
      fitBounds({
        x: node.position.x,
        y: node.position.y,
        width,
        height,
      }, {
        padding: 0.5,
        duration: fitViewDuration,
      });
    },
    [editable, fitBounds, getNodes, fitViewDuration]
  );

  // Handle pane click (clear selection when clicking empty space)
  const onPaneClick = useCallback(() => {
    setSelectedNodeIds(new Set());
    setSelectedEdgeIds(new Set());

    // In edit mode, also update local nodes selection state
    if (editable) {
      setXyflowLocalNodes((nodes) =>
        nodes.map((n) => ({
          ...n,
          selected: false,
        }))
      );
    }
  }, [editable]);

  // Handle selection change from ReactFlow (box selection and clicks)
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      // Ignore selection changes when we're hiding a node
      if (hidingNodeRef.current) {
        return;
      }

      // In edit mode, we manage selection ourselves via onNodeClick
      // Skip handleSelectionChange to avoid ReactFlow overwriting our selection state
      if (editable) {
        return;
      }

      const newSelectedNodeIds = new Set(selectedNodes.map((n) => n.id));

      // Update selection state for read-only mode (for visual feedback)
      setSelectedNodeIds(newSelectedNodeIds);
      setSelectedEdgeIds(new Set(selectedEdges.map((e) => e.id)));
    },
    [editable]
  );


  // Create edge helper
  const createEdge = useCallback(
    (from: string, to: string, type: string, sourceHandle?: string, targetHandle?: string) => {
      const edgeId = `${from}-${to}-${type}-${Date.now()}`;
      const now = Date.now();

      // Add to local state with handle information
      const newEdge: EdgeState & { sourceHandle?: string; targetHandle?: string } = {
        id: edgeId,
        type,
        from,
        to,
        data: {},
        createdAt: now,
        updatedAt: now,
        sourceHandle,
        targetHandle,
      };
      setLocalEdges((prev) => [...prev, newEdge]);

      // Push to history for undo
      pushHistory([
        {
          type: 'edgeCreate',
          edge: newEdge,
        },
      ]);

      // Track the change
      updateEditState((prev) => ({
        ...prev,
        createdEdges: [
          ...prev.createdEdges,
          { id: edgeId, from, to, type, sourceHandle, targetHandle },
        ],
      }));
    },
    [updateEditState, pushHistory]
  );

  // Handle new connection from drag
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!editable || !connection.source || !connection.target) return;

      // Find source and target node types
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return;

      // Find valid edge types for this connection
      const validTypes = configuration.allowedConnections
        .filter((ac) => ac.from === sourceNode.type && ac.to === targetNode.type)
        .map((ac) => ac.via);

      const uniqueTypes = [...new Set(validTypes)];

      if (uniqueTypes.length === 0) {
        console.warn(
          `No valid edge types for connection from ${sourceNode.type} to ${targetNode.type}`
        );
        return;
      }

      if (uniqueTypes.length === 1) {
        // Create edge immediately with handle information
        createEdge(
          connection.source,
          connection.target,
          uniqueTypes[0],
          connection.sourceHandle ?? undefined,
          connection.targetHandle ?? undefined
        );
      } else {
        // Show picker
        setPendingConnection({
          from: connection.source,
          to: connection.target,
          sourceHandle: connection.sourceHandle ?? undefined,
          targetHandle: connection.targetHandle ?? undefined,
          validTypes: uniqueTypes,
        });
      }
    },
    [editable, nodes, configuration.allowedConnections, createEdge]
  );

  // Handle edge type selection from picker
  const handleEdgeTypeSelect = useCallback(
    (type: string) => {
      if (!pendingConnection) return;
      createEdge(
        pendingConnection.from,
        pendingConnection.to,
        type,
        pendingConnection.sourceHandle,
        pendingConnection.targetHandle
      );
      setPendingConnection(null);
    },
    [pendingConnection, createEdge]
  );

  // Cancel edge type picker
  const handleCancelEdgeTypePicker = useCallback(() => {
    setPendingConnection(null);
  }, []);

  // Helper to convert handle ID back to side name
  const handleToSide = useCallback((handle: string | null | undefined, isSource: boolean): string | undefined => {
    if (!handle) return undefined;
    // Source handles are like "right-out", target handles are like "left"
    if (isSource) {
      return handle.replace('-out', '');
    }
    return handle;
  }, []);

  // Track whether reconnection succeeded
  const edgeReconnectSuccessful = useRef(true);

  // Called when user starts dragging an edge endpoint
  const handleReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  // Handle edge reconnection (dragging edge endpoint to new node)
  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!editable || !newConnection.source || !newConnection.target) return;

      // Find the original edge in our local state
      const originalEdge = localEdges.find((e) => e.id === oldEdge.id);
      if (!originalEdge) return;

      // Find source and target nodes for validation
      const sourceNode = nodes.find((n) => n.id === newConnection.source);
      const targetNode = nodes.find((n) => n.id === newConnection.target);
      if (!sourceNode || !targetNode) return;

      // Check if the new connection is valid for this edge type
      // Note: allowedConnections uses node IDs as the from/to values
      const isValidConnection = configuration.allowedConnections.some(
        (ac) =>
          ac.from === sourceNode.id && ac.to === targetNode.id && ac.via === originalEdge.type
      );

      if (!isValidConnection) {
        console.warn(
          `Cannot reconnect: ${originalEdge.type} edge not allowed from ${sourceNode.id} to ${targetNode.id}`
        );
        return;
      }

      // Mark as successful before updating
      edgeReconnectSuccessful.current = true;

      // Convert handles back to sides for edge data
      const newFromSide = handleToSide(newConnection.sourceHandle, true);
      const newToSide = handleToSide(newConnection.targetHandle, false);

      // Update local edges - manually update the edge to preserve its type and id
      setLocalEdges((prev) =>
        prev.map((edge) => {
          if (edge.id === oldEdge.id) {
            // Build data object, filtering out undefined values
            const updatedData = { ...edge.data };
            if (newFromSide !== undefined) updatedData.fromSide = newFromSide;
            if (newToSide !== undefined) updatedData.toSide = newToSide;

            return {
              ...edge,
              from: newConnection.source!,
              to: newConnection.target!,
              sourceHandle: newConnection.sourceHandle ?? undefined,
              targetHandle: newConnection.targetHandle ?? undefined,
              data: updatedData,
              updatedAt: Date.now(),
            };
          }
          return edge;
        })
      );

      // Also update the visual edge state directly to reflect the reconnection immediately
      setXyflowLocalEdges((prev) =>
        prev.map((edge) => {
          if (edge.id === oldEdge.id) {
            return {
              ...edge,
              source: newConnection.source!,
              target: newConnection.target!,
              sourceHandle: newConnection.sourceHandle ?? undefined,
              targetHandle: newConnection.targetHandle ?? undefined,
            };
          }
          return edge;
        })
      );

      // Track the change - remove old edge and add new one
      updateEditState((prev) => {
        // Check if this was a newly created edge
        const createdEdgeIndex = prev.createdEdges.findIndex((e) => e.id === oldEdge.id);

        if (createdEdgeIndex >= 0) {
          // Update the created edge entry
          const newCreatedEdges = [...prev.createdEdges];
          newCreatedEdges[createdEdgeIndex] = {
            ...newCreatedEdges[createdEdgeIndex],
            from: newConnection.source!,
            to: newConnection.target!,
            sourceHandle: newConnection.sourceHandle ?? undefined,
            targetHandle: newConnection.targetHandle ?? undefined,
          };
          return { ...prev, createdEdges: newCreatedEdges };
        }

        // For existing edges, track as delete + create
        const newDeletedEdges = [
          ...prev.deletedEdges,
          {
            id: oldEdge.id,
            from: originalEdge.from,
            to: originalEdge.to,
            type: originalEdge.type,
          },
        ];

        const newCreatedEdges = [
          ...prev.createdEdges,
          {
            id: oldEdge.id,
            from: newConnection.source!,
            to: newConnection.target!,
            type: originalEdge.type,
            sourceHandle: newConnection.sourceHandle ?? undefined,
            targetHandle: newConnection.targetHandle ?? undefined,
          },
        ];

        return { ...prev, deletedEdges: newDeletedEdges, createdEdges: newCreatedEdges };
      });
    },
    [editable, localEdges, nodes, configuration.allowedConnections, updateEditState, handleToSide]
  );

  // Called when reconnection ends (whether successful or not)
  const handleReconnectEnd = useCallback(() => {
    // If reconnection wasn't successful, the edge was dropped in empty space
    // We need to keep the original edge (do nothing, it's still in localEdges)
    // Edge is still in localEdges, no action needed - ReactFlow will re-render with it
    edgeReconnectSuccessful.current = true;
  }, []);

  // ============================================
  // SELECTED ITEMS
  // ============================================

  // Get first selected edge (for single-selection info panel)

  // ============================================
  // ANIMATIONS
  // ============================================

  useEffect(() => {
    if (events.length === 0) return;

    const latestEvent = events[events.length - 1];

    if (latestEvent.operation === 'animate' && latestEvent.category === 'edge') {
      const edgeEvent = latestEvent.payload as EdgeEvent;
      const edgeId = edgeEvent.edgeId;
      const animation = edgeEvent.animation;

      if (animation && edgeId) {
        setAnimationState((prev) => ({
          ...prev,
          edgeAnimations: {
            ...prev.edgeAnimations,
            [edgeId]: {
              type: 'flow',
              duration: animation.duration || 1000,
              direction: animation.direction || 'forward',
              timestamp: Date.now(),
            },
          },
        }));

        const duration = animation.duration || 1000;
        setTimeout(() => {
          setAnimationState((prev) => {
            const newEdgeAnimations = { ...prev.edgeAnimations };
            delete newEdgeAnimations[edgeId];
            return { ...prev, edgeAnimations: newEdgeAnimations };
          });
        }, duration);

        onEventProcessed?.(latestEvent);
      }
    }

    if (latestEvent.category === 'state') {
      const stateEvent = latestEvent.payload as StateEvent;
      const nodeId = stateEvent.nodeId;
      const newState = stateEvent.newState;

      if (nodeId && newState) {
        // Update the node's state
        setLocalNodes((prev) =>
          prev.map((node) => (node.id === nodeId ? { ...node, state: newState } : node))
        );

        // Trigger animation based on state
        const stateToAnimation: Record<string, 'pulse' | 'flash' | 'shake'> = {
          processing: 'pulse',
          completed: 'flash',
          error: 'shake',
        };

        const animationType = stateToAnimation[newState];
        if (animationType) {
          const duration =
            animationType === 'pulse' ? 1500 : animationType === 'flash' ? 1000 : 500;

          setAnimationState((prev) => ({
            ...prev,
            nodeAnimations: {
              ...prev.nodeAnimations,
              [nodeId]: { type: animationType, duration, timestamp: Date.now() },
            },
          }));

          if (animationType !== 'pulse') {
            setTimeout(() => {
              setAnimationState((prev) => {
                const newNodeAnimations = { ...prev.nodeAnimations };
                delete newNodeAnimations[nodeId];
                return { ...prev, nodeAnimations: newNodeAnimations };
              });
            }, duration);
          }
        }

        onEventProcessed?.(latestEvent);
      }
    }

    if (latestEvent.category === 'node' && latestEvent.operation === 'create') {
      const nodeEvent = latestEvent.payload as NodeEvent;
      const nodeId = nodeEvent.nodeId;

      if (nodeId) {
        setAnimationState((prev) => ({
          ...prev,
          nodeAnimations: {
            ...prev.nodeAnimations,
            [nodeId]: { type: 'entry', duration: 600, timestamp: Date.now() },
          },
        }));

        setTimeout(() => {
          setAnimationState((prev) => {
            const newNodeAnimations = { ...prev.nodeAnimations };
            delete newNodeAnimations[nodeId];
            return { ...prev, nodeAnimations: newNodeAnimations };
          });
        }, 600);

        onEventProcessed?.(latestEvent);
      }
    }
  }, [events, onEventProcessed]);

  // ============================================
  // ============================================


  // ============================================
  // XYFLOW CONVERSION
  // ============================================

  const xyflowNodesBase = useMemo(() => {
    const converted = convertToXYFlowNodes(localNodes, configuration, violations);

    return converted.map((node) => {
      const animation = animationState.nodeAnimations[node.id];
      // Apply any pending position changes
      const pendingPosition = editStateRef.current.positionChanges.get(node.id);
      // Apply any pending text changes
      const pendingText = editStateRef.current.textChanges.get(node.id);
      // Allow specific nodes to be draggable even when not in edit mode
      const isDraggable = editable || draggableNodeIds?.has(node.id);
      // When draggableNodeIds is provided, we need to explicitly control each node's draggability
      // because nodesDraggable will be true to allow the specific nodes to drag
      const hasDraggableNodeIds = draggableNodeIds && draggableNodeIds.size > 0;
      // React Flow v12 requires measured dimensions for controlled drag to work
      const dataWidth = typeof node.data?.width === 'number' ? node.data.width : undefined;
      const dataHeight = typeof node.data?.height === 'number' ? node.data.height : undefined;
      const nodeWidth = node.width ?? dataWidth ?? 200;
      const nodeHeight = node.height ?? dataHeight ?? 100;
      return {
        ...node,
        ...(pendingPosition ? { position: pendingPosition } : {}),
        selected: selectedNodeIds.has(node.id),
        // Explicitly set draggable for each node when using draggableNodeIds
        draggable: hasDraggableNodeIds ? isDraggable : (editable || false),
        // Set measured dimensions for React Flow v12 controlled drag
        measured: { width: nodeWidth, height: nodeHeight },
        data: {
          ...node.data,
          editable,
          pendingText,
          tooltipsEnabled: showTooltips,
          shiftKeyPressed,
          isHighlighted: highlightedNodeId === node.id,
          isActive: !activeNodeIds || activeNodeIds.length === 0 || activeNodeIds.includes(node.id),
          isHidden: hiddenNodeIds.has(node.id),
          ...(animation
            ? {
                animationType: animation.type,
                animationDuration: animation.duration,
              }
            : {}),
        } as CustomNodeData,
      };
    });
  }, [localNodes, configuration, violations, animationState.nodeAnimations, editable, showTooltips, highlightedNodeId, activeNodeIds, editStateRef, shiftKeyPressed, selectedNodeIds, hiddenNodeIds, draggableNodeIds, textChangesVersion]);

  const baseNodesKey = useMemo(() => {
    return nodes
      .map((n) => n.id)
      .sort()
      .join(',');
  }, [nodes]);

  const baseEdgesKey = useMemo(() => {
    return edges
      .map((e) => e.id)
      .sort()
      .join(',');
  }, [edges]);

  // Local xyflow nodes state for dragging
  const [xyflowLocalNodes, setXyflowLocalNodes] = useState<Node<CustomNodeData>[]>(xyflowNodesBase);

  // Keep xyflowNodesRef in sync for undo/redo access to current node state
  useEffect(() => {
    xyflowNodesRef.current = xyflowLocalNodes;
  }, [xyflowLocalNodes]);

  // Sync when base node IDs change
  const prevBaseNodesKeyRef = useRef(baseNodesKey);
  useEffect(() => {
    if (prevBaseNodesKeyRef.current !== baseNodesKey) {
      prevBaseNodesKeyRef.current = baseNodesKey;
      setXyflowLocalNodes(xyflowNodesBase);
    }
  }, [baseNodesKey, xyflowNodesBase]);

  // Sync selection state to local nodes when selectedNodeIds changes (edit mode only)
  // Use useLayoutEffect to ensure sync happens before paint (prevents flash)
  const prevSelectedNodeIdsRef = useRef(selectedNodeIds);
  useLayoutEffect(() => {
    if (!editable) return;
    if (prevSelectedNodeIdsRef.current === selectedNodeIds) return;
    prevSelectedNodeIdsRef.current = selectedNodeIds;

    setXyflowLocalNodes((localNodes) =>
      localNodes.map((localNode) => ({
        ...localNode,
        selected: selectedNodeIds.has(localNode.id),
      }))
    );
  }, [editable, selectedNodeIds]);

  // Sync hidden state to local nodes when hiddenNodeIds changes (edit mode only)
  // This ensures isHidden is in sync when we switch back to xyflowNodesBase on exit
  const prevHiddenNodeIdsRef = useRef(hiddenNodeIds);
  useEffect(() => {
    if (!editable) return;
    if (prevHiddenNodeIdsRef.current === hiddenNodeIds) return;
    prevHiddenNodeIdsRef.current = hiddenNodeIds;

    setXyflowLocalNodes((nodes) =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, isHidden: hiddenNodeIds.has(n.id) },
      }))
    );
  }, [editable, hiddenNodeIds]);

  // Sync pending text changes to local nodes when textChangesVersion changes (edit mode only)
  const prevTextChangesVersionRef = useRef(textChangesVersion);
  useEffect(() => {
    if (!editable) return;
    if (prevTextChangesVersionRef.current === textChangesVersion) return;
    prevTextChangesVersionRef.current = textChangesVersion;

    setXyflowLocalNodes((nodes) =>
      nodes.map((n) => {
        const pendingText = editStateRef.current.textChanges.get(n.id);
        return {
          ...n,
          data: { ...n.data, pendingText },
        };
      })
    );
  }, [editable, textChangesVersion]);

  // Also sync when entering edit mode or when base nodes change content
  const prevEditableRef = useRef(editable);
  useEffect(() => {
    if (editable && !prevEditableRef.current) {
      // Entering edit mode - sync positions
      setXyflowLocalNodes(xyflowNodesBase);

      // Reset ReactFlow's internal state for all nodes to prevent NaN errors
      // This ensures ReactFlow remeasures nodes and updates drag tracking
      setTimeout(() => {
        xyflowNodesBase.forEach((node) => {
          updateNodeInternals(node.id);
        });
      }, 0);
    }
    prevEditableRef.current = editable;
  }, [editable, xyflowNodesBase, updateNodeInternals]);

  // Use local nodes state when editable OR when we have draggable nodes (for drag visual updates)
  const hasDraggableNodes = draggableNodeIds && draggableNodeIds.size > 0;
  const xyflowNodes = (editable || hasDraggableNodes) ? xyflowLocalNodes : xyflowNodesBase;

  // Sync xyflowLocalNodes from xyflowNodesBase when draggable nodes are present
  // This ensures React Flow has the correct node state for drag calculations
  const prevHasDraggableNodesRef = useRef(false);
  useEffect(() => {
    const hadDraggableNodes = prevHasDraggableNodesRef.current;
    prevHasDraggableNodesRef.current = hasDraggableNodes || false;

    // When draggable nodes first appear, sync local nodes and update internals
    if (hasDraggableNodes && !hadDraggableNodes) {
      setXyflowLocalNodes(xyflowNodesBase);

      // Give React Flow time to render, then update internals
      setTimeout(() => {
        draggableNodeIds?.forEach((nodeId) => {
          updateNodeInternals(nodeId);
        });
      }, 50);
    }
  }, [hasDraggableNodes, xyflowNodesBase, draggableNodeIds, updateNodeInternals]);


  // Handle node drag to show alignment guides
  const handleNodeDrag = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      // Allow dragging if editable OR if this node is in draggableNodeIds
      const canDrag = editable || draggableNodeIds?.has(node.id);
      if (!canDrag) return;

      // Only show alignment guides in full edit mode
      if (editable) {
        const guides = detectAlignmentGuides(node.id, xyflowNodes);
        setAlignmentGuides(guides);
      }
    },
    [editable, draggableNodeIds, xyflowNodes, detectAlignmentGuides]
  );

  // Clear guides when drag ends and notify parent
  const handleNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      setAlignmentGuides([]);

      // Call the callback if provided (for draggable nodes outside edit mode)
      if (onNodeDragStopProp && node.position) {
        onNodeDragStopProp(node.id, node.position);
      }
    },
    [onNodeDragStopProp]
  );

  // ============================================
  // UNDO/REDO APPLY FUNCTIONS
  // ============================================

  // Apply undo - reverse the effects of history entries
  const applyUndo = useCallback(() => {
    const batch = undoFromStack();
    if (!batch) return;

    // Process entries in reverse order for undo
    for (const entry of batch.slice().reverse()) {
      switch (entry.type) {
        case 'position':
          // Restore previous position
          setXyflowLocalNodes((nodes) =>
            nodes.map((n) =>
              n.id === entry.nodeId
                ? { ...n, position: entry.before }
                : n
            )
          );
          // Update edit state
          updateEditState((prev) => {
            const newPositions = new Map(prev.positionChanges);
            newPositions.set(entry.nodeId, entry.before);
            return { ...prev, positionChanges: newPositions };
          });
          break;

        case 'dimension':
          // Restore previous dimensions
          setXyflowLocalNodes((nodes) =>
            nodes.map((n) =>
              n.id === entry.nodeId
                ? { ...n, width: entry.before.width, height: entry.before.height }
                : n
            )
          );
          // Update edit state
          updateEditState((prev) => {
            const newDimensions = new Map(prev.dimensionChanges);
            newDimensions.set(entry.nodeId, entry.before);
            return { ...prev, dimensionChanges: newDimensions };
          });
          break;

        case 'text':
          // Restore previous text
          // Update edit state
          updateEditState((prev) => {
            const newTextChanges = new Map(prev.textChanges);
            newTextChanges.set(entry.nodeId, entry.before);
            return { ...prev, textChanges: newTextChanges };
          });
          // Force re-render
          setTextChangesVersion((v) => v + 1);
          break;

        case 'nodeDelete':
          // Restore the deleted node
          updateEditState((prev) => {
            const newDeletedNodeIds = new Set(prev.deletedNodeIds);
            newDeletedNodeIds.delete(entry.nodeId);
            return { ...prev, deletedNodeIds: newDeletedNodeIds };
          });
          break;

        case 'edgeCreate':
          // Remove the created edge
          setLocalEdges((edges) => edges.filter((e) => e.id !== entry.edge.id));
          // Update edit state
          updateEditState((prev) => ({
            ...prev,
            createdEdges: prev.createdEdges.filter((e) => e.id !== entry.edge.id),
          }));
          break;

        case 'edgeDelete':
          // Restore the deleted edge
          setLocalEdges((edges) => [...edges, entry.edge]);
          // Update edit state
          updateEditState((prev) => ({
            ...prev,
            deletedEdges: prev.deletedEdges.filter((e) => e.id !== entry.edge.id),
          }));
          break;
      }
    }
  }, [undoFromStack, updateEditState]);

  // Apply redo - re-apply the effects of history entries
  const applyRedo = useCallback(() => {
    const batch = redoFromStack();
    if (!batch) return;

    // Process entries in original order for redo
    for (const entry of batch) {
      switch (entry.type) {
        case 'position':
          // Apply new position
          setXyflowLocalNodes((nodes) =>
            nodes.map((n) =>
              n.id === entry.nodeId
                ? { ...n, position: entry.after }
                : n
            )
          );
          // Update edit state
          updateEditState((prev) => {
            const newPositions = new Map(prev.positionChanges);
            newPositions.set(entry.nodeId, entry.after);
            return { ...prev, positionChanges: newPositions };
          });
          break;

        case 'dimension':
          // Apply new dimensions
          setXyflowLocalNodes((nodes) =>
            nodes.map((n) =>
              n.id === entry.nodeId
                ? { ...n, width: entry.after.width, height: entry.after.height }
                : n
            )
          );
          // Update edit state
          updateEditState((prev) => {
            const newDimensions = new Map(prev.dimensionChanges);
            newDimensions.set(entry.nodeId, entry.after);
            return { ...prev, dimensionChanges: newDimensions };
          });
          break;

        case 'text':
          // Apply new text
          // Update edit state
          updateEditState((prev) => {
            const newTextChanges = new Map(prev.textChanges);
            newTextChanges.set(entry.nodeId, entry.after);
            return { ...prev, textChanges: newTextChanges };
          });
          // Force re-render
          setTextChangesVersion((v) => v + 1);
          break;

        case 'nodeDelete':
          // Re-delete the node
          updateEditState((prev) => {
            const newDeletedNodeIds = new Set(prev.deletedNodeIds);
            newDeletedNodeIds.add(entry.nodeId);
            return { ...prev, deletedNodeIds: newDeletedNodeIds };
          });
          break;

        case 'edgeCreate':
          // Re-create the edge
          setLocalEdges((edges) => [...edges, entry.edge]);
          // Update edit state
          updateEditState((prev) => ({
            ...prev,
            createdEdges: [
              ...prev.createdEdges,
              {
                id: entry.edge.id,
                from: entry.edge.from,
                to: entry.edge.to,
                type: entry.edge.type,
                sourceHandle: entry.edge.sourceHandle,
                targetHandle: entry.edge.targetHandle,
              },
            ],
          }));
          break;

        case 'edgeDelete':
          // Re-delete the edge
          setLocalEdges((edges) => edges.filter((e) => e.id !== entry.edge.id));
          // Update edit state
          updateEditState((prev) => ({
            ...prev,
            deletedEdges: [
              ...prev.deletedEdges,
              {
                id: entry.edge.id,
                from: entry.edge.from,
                to: entry.edge.to,
                type: entry.edge.type,
              },
            ],
          }));
          break;
      }
    }
  }, [redoFromStack, updateEditState]);

  // Keyboard shortcuts for undo/redo and delete
  useEffect(() => {
    if (!editable) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Z (Mac) or Ctrl+Z (Windows/Linux) for undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          // Cmd+Shift+Z for redo
          applyRedo();
        } else {
          applyUndo();
        }
      }
      // Ctrl+Y for redo (Windows)
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        applyRedo();
      }
      // Delete or Backspace to delete selected nodes
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Only delete if not editing text (check if active element is an input/textarea)
        const activeElement = document.activeElement;
        const isEditingText = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
        if (!isEditingText) {
          e.preventDefault();
          handleDeleteSelectedNodes();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editable, applyUndo, applyRedo, handleDeleteSelectedNodes]);

  // Set undo/redo functions in ref for outer component access
  useEffect(() => {
    undoRedoFunctionsRef.current = {
      applyUndo,
      applyRedo,
    };
  }, [applyUndo, applyRedo, undoRedoFunctionsRef]);

  // Handle node changes (drag and resize events)
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const hasDraggableNodes = draggableNodeIds && draggableNodeIds.size > 0;

      // In edit mode, apply all changes
      // When we have draggable nodes, apply position changes for those nodes
      if (!editable && !hasDraggableNodes) return;

      // Filter out selection changes - we manage selection ourselves via selectedNodeIds
      let changesToApply = changes.filter((change) => change.type !== 'select');

      // When not in full edit mode but have draggable nodes,
      // only apply position changes for draggable nodes
      if (!editable && hasDraggableNodes) {
        changesToApply = changesToApply.filter(
          (change) =>
            change.type === 'position' &&
            'id' in change &&
            draggableNodeIds.has(change.id)
        );
      }

      // Only apply changes if there are changes to apply
      if (changesToApply.length > 0) {
        setXyflowLocalNodes((nds) => {
          // For group nodes (ending in :__group__), also move child nodes with same prefix
          const groupPositionChanges = changesToApply.filter(
            (change): change is NodeChange & { type: 'position'; id: string; position: { x: number; y: number } } =>
              change.type === 'position' &&
              'id' in change &&
              typeof change.id === 'string' &&
              change.id.endsWith(':__group__') &&
              'position' in change &&
              change.position !== undefined
          );

          // Calculate deltas for each group
          const groupDeltas = new Map<string, { dx: number; dy: number }>();
          for (const change of groupPositionChanges) {
            const canvasPrefix = change.id.replace(':__group__', ':');
            const currentNode = nds.find((n) => n.id === change.id);
            if (currentNode && change.position) {
              const dx = change.position.x - currentNode.position.x;
              const dy = change.position.y - currentNode.position.y;
              groupDeltas.set(canvasPrefix, { dx, dy });
            }
          }

          // Apply changes but preserve our selection state
          let updated = applyNodeChanges(changesToApply, nds) as Node<CustomNodeData>[];

          // Also apply deltas to child nodes of moved groups
          if (groupDeltas.size > 0) {
            updated = updated.map((node) => {
              // Check if this node belongs to a moved group (but isn't the group itself)
              for (const [prefix, delta] of groupDeltas) {
                if (node.id.startsWith(prefix) && !node.id.endsWith(':__group__')) {
                  return {
                    ...node,
                    position: {
                      x: node.position.x + delta.dx,
                      y: node.position.y + delta.dy,
                    },
                  };
                }
              }
              return node;
            });
          }

          // Restore selection state from our managed selectedNodeIds
          return updated.map((node) => ({
            ...node,
            selected: selectedNodeIds.has(node.id),
          }));
        });
      }

      // Capture positions at drag START for accurate undo "before" values
      const dragStartChanges = changes.filter(
        (change): change is NodeChange & {
          type: 'position';
          id: string;
          dragging: boolean;
        } =>
          change.type === 'position' &&
          'id' in change &&
          'dragging' in change &&
          change.dragging === true
      );

      // For each node that just started dragging, capture its current position
      for (const change of dragStartChanges) {
        if (!dragStartPositionsRef.current.has(change.id)) {
          const currentNode = xyflowNodesRef.current.find((n) => n.id === change.id);
          if (currentNode) {
            dragStartPositionsRef.current.set(change.id, {
              x: currentNode.position.x,
              y: currentNode.position.y,
            });
          }
        }
      }

      // Track position changes on drag END
      const positionChanges = changes.filter(
        (
          change
        ): change is NodeChange & {
          type: 'position';
          id: string;
          position: { x: number; y: number };
          dragging: boolean;
        } =>
          change.type === 'position' &&
          'id' in change &&
          'position' in change &&
          change.position !== undefined &&
          'dragging' in change &&
          change.dragging === false
      );

      // Note: Dimension changes are tracked via onResizeEnd callback in GraphEditContext,
      // not through onNodesChange (which only fires with resizing=true during drag).

      if (positionChanges.length > 0) {
        // Use positions captured at drag start for accurate undo
        const historyEntries: HistoryEntry[] = [];
        for (const change of positionChanges) {
          const beforePos = dragStartPositionsRef.current.get(change.id) ?? { x: 0, y: 0 };
          historyEntries.push({
            type: 'position',
            nodeId: change.id,
            before: beforePos,
            after: {
              x: Math.round(change.position.x),
              y: Math.round(change.position.y),
            },
          });
          // Clear the drag start position for this node
          dragStartPositionsRef.current.delete(change.id);
        }
        pushHistory(historyEntries);

        updateEditState((prev) => {
          const newPositions = new Map(prev.positionChanges);
          for (const change of positionChanges) {
            newPositions.set(change.id, {
              x: Math.round(change.position.x),
              y: Math.round(change.position.y),
            });
          }
          return { ...prev, positionChanges: newPositions };
        });
      }
    },
    [editable, updateEditState, selectedNodeIds, draggableNodeIds, pushHistory]
  );

  // Build lookup map for scenario edge sequence numbers
  const scenarioEdgeSequenceMap = useMemo(() => {
    const map = new Map<string, number>();
    if (scenarioEdges && showSequenceLabels) {
      for (const se of scenarioEdges) {
        map.set(`${se.fromSpan}->${se.toSpan}`, se.sequenceNumber);
      }
    }
    return map;
  }, [scenarioEdges, showSequenceLabels]);

  const xyflowEdgesBase = useMemo(() => {
    const converted = convertToXYFlowEdges(edges, configuration, violations);

    // Filter out edges connected to inactive or hidden nodes
    const filtered = converted.filter(edge => {
      // Filter by hidden nodes (shift-clicked)
      const sourceHidden = hiddenNodeIds.has(edge.source);
      const targetHidden = hiddenNodeIds.has(edge.target);
      if (sourceHidden || targetHidden) {
        return false;
      }

      // Filter by active nodes (scenario playback)
      if (activeNodeIds && activeNodeIds.length > 0) {
        const sourceActive = activeNodeIds.includes(edge.source);
        const targetActive = activeNodeIds.includes(edge.target);
        return sourceActive && targetActive;
      }

      return true;
    });

    const mappedEdges = filtered.map((edge) => {
      const animation = animationState.edgeAnimations[edge.id];
      const isSelected = selectedEdgeIds.has(edge.id);

      // Look up sequence number from scenario edges
      const edgeKey = `${edge.source}->${edge.target}`;
      const sequenceNumber = scenarioEdgeSequenceMap.get(edgeKey);

      return {
        ...edge,
        data: {
          ...edge.data,
          // Inject sequence number into edge data for label rendering
          ...(sequenceNumber !== undefined
            ? {
                data: {
                  ...(edge.data?.data as Record<string, unknown> | undefined),
                  sequenceNumber,
                },
                // Configure label to show sequence number
                typeDefinition: {
                  ...edge.data?.typeDefinition,
                  label: {
                    field: 'sequenceNumber',
                    position: 'middle' as const,
                  },
                },
              }
            : {}),
          tooltipsEnabled: showTooltips,
          shiftKeyPressed,
          ...(animation
            ? {
                animationType: animation.type,
                animationDuration: animation.duration,
                animationDirection: animation.direction,
              }
            : {}),
        } as CustomEdgeData,
        // Preserve edge zIndex from converter (50 = above groups, below nodes)
        // Selected edges get elevated to 1000
        zIndex: isSelected ? 1000 : edge.zIndex,
      };
    });

    // Sort edges so selected ones appear last (on top in SVG)
    return mappedEdges.sort((a, b) => {
      const aSelected = selectedEdgeIds.has(a.id);
      const bSelected = selectedEdgeIds.has(b.id);
      if (aSelected && !bSelected) return 1; // a comes after b (rendered on top)
      if (!aSelected && bSelected) return -1; // b comes after a (rendered on top)
      return 0; // maintain original order
    });
  }, [edges, configuration, violations, animationState.edgeAnimations, showTooltips, selectedEdgeIds, shiftKeyPressed, activeNodeIds, hiddenNodeIds, scenarioEdgeSequenceMap]);

  // ELK layout for circuit-board style edge routing
  const { edgePaths: elkEdgePaths, edgeLabelPositions: elkLabelPositions } = useElkLayout(
    xyflowNodesBase,
    xyflowEdgesBase,
    {
      enabled: elkLayout?.enabled ?? false,
      routingStyle: elkLayout?.routingStyle ?? 'orthogonal',
      edgeSpacing: elkLayout?.edgeSpacing ?? 5,
      edgeNodeSpacing: elkLayout?.edgeNodeSpacing ?? 10,
      preserveNodePositions: true,
    }
  );

  // Apply ELK paths to edges when ELK layout is enabled
  const xyflowEdgesWithElk = useMemo(() => {
    if (!elkLayout?.enabled) {
      return xyflowEdgesBase;
    }
    // Hide edges until ELK has computed paths to prevent flash of default edge routing
    if (elkEdgePaths.size === 0) {
      return [];
    }
    return applyElkPathsToEdges(xyflowEdgesBase, elkEdgePaths, elkLabelPositions);
  }, [elkLayout?.enabled, xyflowEdgesBase, elkEdgePaths, elkLabelPositions]);

  // Local xyflow edges state for reconnection
  const [xyflowLocalEdges, setXyflowLocalEdges] = useState<Edge<CustomEdgeData>[]>(xyflowEdgesWithElk);

  // Create a stable key for ELK paths to detect when they actually change
  const elkPathsKey = useMemo(() => {
    if (!elkLayout?.enabled || elkEdgePaths.size === 0) return '';
    // Create a key from edge IDs and their full paths
    return Array.from(elkEdgePaths.entries())
      .map(([id, path]) => `${id}:${path}`)
      .join('|');
  }, [elkLayout?.enabled, elkEdgePaths]);

  // Sync local edges when base edges or ELK paths change
  const prevSyncKeyRef = useRef({ baseEdgesKey, elkPathsKey });
  useEffect(() => {
    const keyChanged =
      prevSyncKeyRef.current.baseEdgesKey !== baseEdgesKey ||
      prevSyncKeyRef.current.elkPathsKey !== elkPathsKey;

    if (keyChanged && xyflowEdgesWithElk.length > 0) {
      prevSyncKeyRef.current = { baseEdgesKey, elkPathsKey };
      setXyflowLocalEdges(xyflowEdgesWithElk);
    }
  }, [baseEdgesKey, elkPathsKey, xyflowEdgesWithElk]);

  // Set the reset visual state function for use by resetEditState
  // This resets both nodes and edges to their original state
  useEffect(() => {
    resetVisualStateRef.current = () => {
      setXyflowLocalNodes(xyflowNodesBase);
      setXyflowLocalEdges(xyflowEdgesWithElk);
      // Notify parent that changes have been cleared
      onPendingChangesChange?.(false);
    };
  }, [xyflowNodesBase, xyflowEdgesWithElk, onPendingChangesChange]);

  // Set the reset text changes version function for use by resetEditState
  useEffect(() => {
    resetTextChangesVersionRef.current = () => {
      setTextChangesVersion(0);
    };
  }, []);

  // Use local edges in edit mode, base edges otherwise
  const xyflowEdges = editable ? xyflowLocalEdges : xyflowEdgesWithElk;

  // Handle edge changes (selection, reconnection, etc.)
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!editable) return;

      setXyflowLocalEdges((eds) => applyEdgeChanges(changes, eds) as Edge<CustomEdgeData>[]);
    },
    [editable]
  );

  // Fit view on mount and structure changes
  useEffect(() => {
    // Skip default fitView if we have specific nodes to fit to
    if (fitViewToNodeIds && fitViewToNodeIds.length > 0) {
      return;
    }

    // Skip delayed fitView if we have a pre-calculated initial viewport
    if (initialViewport) {
      return;
    }

    const timeoutId = setTimeout(() => {
      fitView({
        padding: 0.2,
        includeHiddenNodes: false,
        minZoom: 0.1,
        maxZoom: 1.5,
        duration: fitViewDuration,
      });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [baseNodesKey, baseEdgesKey, fitView, fitViewDuration, fitViewToNodeIds, initialViewport]);

  // Create a stable key from fitViewToNodeIds for dependency tracking
  const fitViewToNodeIdsKey = useMemo(
    () => (fitViewToNodeIds && fitViewToNodeIds.length > 0 ? fitViewToNodeIds.slice().sort().join(',') : ''),
    [fitViewToNodeIds]
  );

  // Fit view to specific nodes when fitViewToNodeIds changes
  useEffect(() => {
    if (!fitViewToNodeIdsKey || !fitViewToNodeIds || fitViewToNodeIds.length === 0) {
      return;
    }

    // Use a longer timeout to ensure nodes are rendered and measured
    const timeoutId = setTimeout(() => {
      // Get actual node objects from React Flow's internal state
      const allNodes = getNodes();
      const nodeIdsSet = new Set(fitViewToNodeIds);
      const nodesToFit = allNodes.filter((node) => nodeIdsSet.has(node.id));

      if (nodesToFit.length > 0) {
        // Calculate bounding box from node positions
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const node of nodesToFit) {
          const width = node.measured?.width ?? node.width ?? 200;
          const height = node.measured?.height ?? node.height ?? 100;

          minX = Math.min(minX, node.position.x);
          minY = Math.min(minY, node.position.y);
          maxX = Math.max(maxX, node.position.x + width);
          maxY = Math.max(maxY, node.position.y + height);
        }

        const bounds = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };

        fitBounds(bounds, {
          padding: fitViewPadding,
          duration: fitViewDuration,
        });
      }
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [fitViewToNodeIdsKey, fitViewToNodeIds, fitViewPadding, fitView, fitViewDuration, getNodes, fitBounds]);

  // ============================================
  // RENDER
  // ============================================

  return (
    <GraphEditProvider value={graphEditContextValue}>
      <ReactFlow
        key={`${baseNodesKey}-${baseEdgesKey}`}
        nodes={xyflowNodes}
        edges={xyflowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.1}
        maxZoom={4}
        defaultViewport={initialViewport}
        defaultEdgeOptions={{ type: 'custom' }}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={editable || (draggableNodeIds && draggableNodeIds.size > 0)}
        elementsSelectable={editable}
        selectNodesOnDrag={false}
        nodesConnectable={editable}
        edgesReconnectable={editable}
        reconnectRadius={25}
        elevateEdgesOnSelect={true}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onReconnectStart={handleReconnectStart}
        onReconnect={handleReconnect}
        onReconnectEnd={handleReconnectEnd}
        onPaneClick={onPaneClick}
        onSelectionChange={handleSelectionChange}
        panOnDrag={!editable}
        panOnScroll={true}
        zoomOnScroll={false}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        selectionOnDrag={false}
        selectionKeyCode={null}
        multiSelectionKeyCode="Shift"
      >
        {showBackground && (
          <Background
            color={backgroundVariant === 'dots' ? theme.colors.border : theme.colors.textMuted}
            gap={backgroundGap ?? (backgroundVariant === 'dots' ? 16 : 50)}
            size={backgroundVariant === 'dots' ? 1 : 0.5}
            variant={
              backgroundVariant === 'dots'
                ? BackgroundVariant.Dots
                : backgroundVariant === 'lines'
                  ? BackgroundVariant.Lines
                  : BackgroundVariant.Cross
            }
          />
        )}
        {showControls && <Controls showZoom showFitView showInteractive />}
        {showMinimap && (
          <MiniMap
            nodeColor={(node) => {
              const nodeData = node.data as CustomNodeData;
              return nodeData?.typeDefinition?.color || theme.colors.secondary;
            }}
            nodeBorderRadius={2}
            pannable
            zoomable
          />
        )}
        {showCenterIndicator && <CenterIndicator color={theme.colors.textMuted} />}
        {editable && alignmentGuides.length > 0 && (
          <AlignmentGuidesOverlay guides={alignmentGuides} color={theme.colors.primary} />
        )}
      </ReactFlow>



      {pendingConnection && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.colors.background,
            color: theme.colors.text,
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '16px',
            minWidth: '200px',
            zIndex: 1000,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '14px' }}>
            Select Edge Type
          </div>
          <div
            style={{ fontSize: '12px', color: theme.colors.textSecondary, marginBottom: '12px' }}
          >
            {pendingConnection.from} → {pendingConnection.to}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pendingConnection.validTypes.map((type) => {
              const typeDefinition = configuration.edgeTypes[type];
              return (
                <button
                  key={type}
                  onClick={() => handleEdgeTypeSelect(type)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: typeDefinition?.color || theme.colors.secondary,
                    color: theme.colors.background,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    textAlign: 'left',
                  }}
                >
                  {type}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleCancelEdgeTypePicker}
            style={{
              marginTop: '12px',
              width: '100%',
              padding: '8px 12px',
              backgroundColor: theme.colors.surface,
              color: theme.colors.textSecondary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </GraphEditProvider>
  );
};

/**
 * Convert canvas to legacy configuration format for internal use
 *
 * Color Contract:
 * - scopeColor: Used as border color (from .scopes.canvas)
 * - spanColor: Used as fill color (from .spans.canvas based on workflow context)
 */
function useCanvasToLegacy(
  canvas: ExtendedCanvas | undefined,
  library?: ComponentLibrary,
  spansCanvas?: ExtendedCanvas,
  scopesCanvas?: ExtendedCanvas,
  workflowSpanPattern?: string
): {
  configuration: GraphConfiguration;
  nodes: NodeState[];
  edges: EdgeState[];
} | null {
  return useMemo(() => {
    if (!canvas) return null;

    const { nodes, edges } = CanvasConverter.canvasToGraph(canvas);

    // Fix edge types: published core doesn't support top-level edgeType yet
    // Re-map edge types from canvas to support both old (pv.edgeType) and new (edgeType) formats
    const canvasEdgeMap = new Map(canvas.edges?.map(e => [e.id, e]) || []);
    for (const edge of edges) {
      const canvasEdge = canvasEdgeMap.get(edge.id);
      if (canvasEdge) {
        // Support both top-level edgeType (new) and pv.edgeType (deprecated)
        const edgeType = canvasEdge.edgeType || canvasEdge.pv?.edgeType || 'default';
        edge.type = edgeType;
      }
    }

    // Build scope color map from scopes canvas (for fill colors)
    const scopeColorMap = buildScopeColorMap(scopesCanvas);

    // Build span color map from spans canvas (for border colors in workflow context)
    const spanColorMap = buildSpanColorMap(spansCanvas);

    // Resolve span color for current workflow context
    const spanColor = resolveEventSpanColor(workflowSpanPattern, spanColorMap);

    // Inject scope and span colors into nodes
    // - scopeColor: fill/background color (from otel.scope → scopes.canvas)
    // - spanColor: border color in workflow context (from workflow spanPattern → spans.canvas)
    for (const node of nodes) {
      const otel = node.data?.otel as { scope?: string } | undefined;
      const scope = otel?.scope;

      // Determine scope color (for fill/background)
      let nodeScopeColor: string;
      if (scope && scopeColorMap[scope]) {
        // Node has a scope with a defined color - use it as fill color
        nodeScopeColor = scopeColorMap[scope];
      } else {
        // Draft nodes or nodes without scope get the draft color
        nodeScopeColor = DRAFT_NODE_COLOR;
      }

      // Inject both scope and span colors
      node.data = {
        ...node.data,
        scopeColor: nodeScopeColor,
        spanColor: workflowSpanPattern ? spanColor : DEFAULT_SPAN_COLOR,
      };
    }

    // Build GraphConfiguration from canvas
    const nodeTypes: GraphConfiguration['nodeTypes'] = {};
    const edgeTypes: GraphConfiguration['edgeTypes'] = {};

    // Add node types from canvas nodeTypes
    if (canvas.nodeTypes) {
      for (const [id, def] of Object.entries(canvas.nodeTypes)) {
        nodeTypes[id] = {
          description: def.description,
          shape: def.shape || 'rectangle',
          icon: def.icon,
          color: def.color,
          dataSchema: {},
        };
      }
    }

    // Then extract node types from canvas nodes (for nodes that define their own types)
    // Only process standard canvas nodes (OTEL nodes have their types defined separately)
    for (const node of canvas.nodes || []) {
      if (!isStandardCanvasNode(node)) {
        continue;
      }

      const vv = node.pv;
      const nodeType = vv?.nodeType || node.type;

      if (!nodeTypes[nodeType]) {
        // Color priority: vv.fill > node.color > vv.states.idle.color
        const fillColor =
          vv?.fill ||
          (typeof node.color === 'string' ? node.color : undefined) ||
          vv?.states?.idle?.color;

        // Derive description from text content (everything after line 1) for text nodes
        let nodeDescription = `${nodeType} node`;
        if (node.type === 'text' && 'text' in node) {
          const lines = node.text.split('\n');
          const descFromText = lines.slice(1).join('\n').trim();
          if (descFromText) {
            nodeDescription = descFromText;
          }
        }

        nodeTypes[nodeType] = {
          description: nodeDescription,
          shape: vv?.shape || 'rectangle',
          icon: vv?.icon,
          color: fillColor,
          stroke: vv?.stroke,
          size: { width: node.width, height: node.height },
          dataSchema: vv?.dataSchema || {},
          states: vv?.states,
          layout: vv?.layout,
        };
      }
    }

    // Extract edge types from canvas edgeTypes (new) or pv.edgeTypes (deprecated)
    const canvasEdgeTypes = canvas.edgeTypes || canvas.pv?.edgeTypes;
    if (canvasEdgeTypes) {
      for (const [id, def] of Object.entries(canvasEdgeTypes)) {
        edgeTypes[id] = {
          style: def.style || 'solid',
          color: def.color,
          width: def.width,
          directed: def.directed,
          animation: def.animation,
          label: def.labelConfig,
        };
      }
    }

    // Build allowed connections from edges
    const allowedConnections: GraphConfiguration['allowedConnections'] = [];
    for (const edge of canvas.edges || []) {
      // Support both top-level edgeType (new) and pv.edgeType (deprecated)
      const edgeType = edge.edgeType || edge.pv?.edgeType || 'default';

      // Ensure edge type exists
      if (!edgeTypes[edgeType]) {
        edgeTypes[edgeType] = {
          style: 'solid',
          color: typeof edge.color === 'string' ? edge.color : undefined,
          directed: true,
        };
      }

      // Store allowed connections using node IDs
      allowedConnections.push({
        from: edge.fromNode,
        to: edge.toNode,
        via: edgeType,
      });
    }

    // Build display config with required layout field
    const display: GraphConfiguration['display'] = canvas.display
      ? {
          layout: canvas.display.layout || 'manual',
          theme: canvas.display.theme,
          animations: canvas.display.animations,
        }
      : { layout: 'manual' };

    const configuration: GraphConfiguration = {
      metadata: {
        name: canvas.name || 'Untitled',
        description: canvas.description,
      },
      nodeTypes,
      edgeTypes,
      allowedConnections,
      display,
    };

    return { configuration, nodes, edges };
  }, [canvas, library, spansCanvas, scopesCanvas, workflowSpanPattern]);
}

/**
 * Core graph visualization component using xyflow.
 *
 * Accepts an ExtendedCanvas document for rendering.
 *
 * When `editable` is true, the component manages its own edit state internally.
 * Use the ref to get pending changes when the user wants to save:
 *
 * ```tsx
 * <GraphRenderer canvas={myCanvas} />
 *
 * // With edit mode
 * const graphRef = useRef<GraphRendererHandle>(null);
 * <GraphRenderer
 *   ref={graphRef}
 *   canvas={myCanvas}
 *   editable={isEditMode}
 *   onPendingChangesChange={setHasUnsavedChanges}
 * />
 * ```
 */
export const GraphRenderer = forwardRef<GraphRendererHandle, GraphRendererProps>((props, ref) => {
  const {
    canvas,
    library,
    spansCanvas,
    scopesCanvas,
    workflowSpanPattern,
    className,
    width = '100%',
    height = '100%',
    containerWidth,
    containerHeight,
    elkLayout,
    scenarioEdges,
    showSequenceLabels,
  } = props;
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  // Set portal target after mount (ref is null during first render)
  useEffect(() => {
    setPortalTarget(containerRef.current);
  }, []);

  // Convert canvas to internal format (merging library types if provided)
  // Also inject scope colors (for border) and span colors (for fill)
  const canvasData = useCanvasToLegacy(canvas, library, spansCanvas, scopesCanvas, workflowSpanPattern);

  // Calculate initial viewport if container dimensions are provided
  // This avoids the "zoom in then animate out" effect on initial render
  const initialViewport = useMemo(() => {
    if (!containerWidth || !containerHeight || !canvas) {
      return undefined;
    }
    const bounds = getCanvasBounds(canvas);
    return calculateInitialViewport(bounds, containerWidth, containerHeight, {
      padding: 0.2,
      minZoom: 0.1,
      maxZoom: 1.5,
    });
  }, [canvas, containerWidth, containerHeight]);

  // Debug: Log canvas data to help diagnose disappearing edges
  if (process.env.NODE_ENV === 'development') {
    console.log('[GraphRenderer] Canvas data:', {
      hasCanvas: !!canvas,
      canvasEdgesCount: canvas?.edges?.length ?? 0,
      hasCanvasData: !!canvasData,
      convertedNodesCount: canvasData?.nodes.length ?? 0,
      convertedEdgesCount: canvasData?.edges.length ?? 0,
    });
  }

  // Internal edit state ref - must be before any conditional returns
  const editStateRef = useRef<EditState>(createEmptyEditState());

  // Ref to hold the reset visual state function - will be set after xyflowLocalNodes is defined
  const resetVisualStateRef = useRef<(() => void) | null>(null);

  // Ref to hold the reset text changes version function - will be set by inner component
  const resetTextChangesVersionRef = useRef<(() => void) | null>(null);

  // Undo/redo management
  const {
    canUndo: canUndoState,
    canRedo: canRedoState,
    undo: undoFromStack,
    redo: redoFromStack,
    pushHistory,
    clearHistory,
  } = useUndoRedo();

  // Ref to hold undo/redo apply functions - will be set by inner component
  const undoRedoFunctionsRef = useRef<UndoRedoFunctionsRef | null>(null);

  // Expose imperative handle - must be before any conditional returns
  useImperativeHandle(
    ref,
    () => ({
      getPendingChanges: (): PendingChanges => {
        const state = editStateRef.current;
        return {
          positionChanges: Array.from(state.positionChanges.entries()).map(
            ([nodeId, position]) => ({
              nodeId,
              position,
            })
          ),
          dimensionChanges: Array.from(state.dimensionChanges.entries()).map(
            ([nodeId, dimensions]) => ({
              nodeId,
              dimensions,
            })
          ),
          textChanges: Array.from(state.textChanges.entries()).map(
            ([nodeId, text]) => ({
              nodeId,
              text,
            })
          ),
          nodeUpdates: Array.from(state.nodeUpdates.entries()).map(([nodeId, updates]) => ({
            nodeId,
            updates,
          })),
          deletedNodeIds: Array.from(state.deletedNodeIds),
          createdEdges: state.createdEdges.map((e) => ({
            from: e.from,
            to: e.to,
            type: e.type,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          })),
          deletedEdges: state.deletedEdges.map((e) => ({ from: e.from, to: e.to, type: e.type })),
          hasChanges:
            state.positionChanges.size > 0 ||
            state.dimensionChanges.size > 0 ||
            state.textChanges.size > 0 ||
            state.nodeUpdates.size > 0 ||
            state.deletedNodeIds.size > 0 ||
            state.createdEdges.length > 0 ||
            state.deletedEdges.length > 0,
        };
      },
      resetEditState: () => {
        editStateRef.current = createEmptyEditState();
        // Reset text changes version to trigger re-render
        resetTextChangesVersionRef.current?.();
        // Also reset visual state (node positions/dimensions) if available
        resetVisualStateRef.current?.();
        // Clear undo/redo history
        clearHistory();
      },
      hasUnsavedChanges: (): boolean => {
        const state = editStateRef.current;
        return (
          state.positionChanges.size > 0 ||
          state.dimensionChanges.size > 0 ||
          state.textChanges.size > 0 ||
          state.nodeUpdates.size > 0 ||
          state.deletedNodeIds.size > 0 ||
          state.createdEdges.length > 0 ||
          state.deletedEdges.length > 0
        );
      },
      canUndo: () => canUndoState,
      canRedo: () => canRedoState,
      undo: () => undoRedoFunctionsRef.current?.applyUndo(),
      redo: () => undoRedoFunctionsRef.current?.applyRedo(),
    }),
    [canUndoState, canRedoState, clearHistory]
  );

  // Validate we have required data
  if (!canvasData) {
    return (
      <div
        className={className}
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
          color: theme.colors.textSecondary,
        }}
      >
        <p>No canvas data provided.</p>
      </div>
    );
  }

  const { configuration, nodes, edges } = canvasData;


  // Extract only the props that inner component needs
  const {
    violations,
    configName,
    showMinimap,
    showControls,
    showBackground,
    backgroundVariant,
    backgroundGap,
    showCenterIndicator,
    showTooltips,
    fitViewDuration,
    highlightedNodeId,
    activeNodeIds,
    events,
    onEventProcessed,
    editable,
    onPendingChangesChange,
    onNodeClick,
    fitViewToNodeIds,
    fitViewPadding,
    draggableNodeIds,
    onNodeDragStop,
    onCopy,
  } = props;

  // If container dimensions are provided but viewport isn't calculated yet, wait
  // This prevents the flash from rendering with default viewport then re-rendering
  const isWaitingForViewport = (containerWidth !== undefined || containerHeight !== undefined) && !initialViewport;

  if (isWaitingForViewport) {
    return (
      <div ref={containerRef} className={className} style={{ width, height, position: 'relative' }} />
    );
  }

  return (
    <div ref={containerRef} className={className} style={{ width, height, position: 'relative' }}>
      <TooltipPortalContext.Provider value={portalTarget}>
        <ReactFlowProvider>
          <GraphRendererInner
            configuration={configuration}
            nodes={nodes}
            edges={edges}
            violations={violations}
            configName={configName}
            showMinimap={showMinimap}
            showControls={showControls}
            showBackground={showBackground}
            backgroundVariant={backgroundVariant}
            backgroundGap={backgroundGap}
            showCenterIndicator={showCenterIndicator}
            showTooltips={showTooltips}
            fitViewDuration={fitViewDuration}
            highlightedNodeId={highlightedNodeId}
            activeNodeIds={activeNodeIds}
            events={events}
            onEventProcessed={onEventProcessed}
            editable={editable}
            onPendingChangesChange={onPendingChangesChange}
            editStateRef={editStateRef}
            resetVisualStateRef={resetVisualStateRef}
            resetTextChangesVersionRef={resetTextChangesVersionRef}
            undoRedoFunctionsRef={undoRedoFunctionsRef}
            pushHistory={pushHistory}
            clearHistory={clearHistory}
            undoFromStack={undoFromStack}
            redoFromStack={redoFromStack}
            onNodeClick={onNodeClick}
            fitViewToNodeIds={fitViewToNodeIds}
            fitViewPadding={fitViewPadding}
            draggableNodeIds={draggableNodeIds}
            onNodeDragStop={onNodeDragStop}
            onCopy={onCopy}
            initialViewport={initialViewport}
            elkLayout={elkLayout}
            scenarioEdges={scenarioEdges}
            showSequenceLabels={showSequenceLabels}
          />
        </ReactFlowProvider>
      </TooltipPortalContext.Provider>
    </div>
  );
});

GraphRenderer.displayName = 'GraphRenderer';
