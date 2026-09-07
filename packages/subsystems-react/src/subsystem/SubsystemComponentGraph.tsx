/**
 * SubsystemComponentGraph — a clickable, read-only React Flow component graph
 * for a subsystem snapshot.
 *
 * Nodes are positioned with ELK auto-layout (layered, minimized crossings,
 * process-aware compound groups). Components sharing a `process` render
 * inside one labeled boundary frame; nodes without one sit outside every
 * boundary. Clicking a component invokes `onSelect`.
 *
 * This is a focused fork of the package's `GraphRenderer` pipeline (same ELK
 * edge routing, delayed fitView, Background/Controls/MiniMap, node/edge type
 * injection, onNodeClick) adapted to the subsystem model — read-only.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useReactFlow,
  useViewport,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
} from '@xyflow/react';
import { useTheme } from '@principal-ade/industry-theme';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { IndustryMarkdownSlide } from 'themed-markdown';
import {
  buildSubsystemGraph,
  MECHANISM_COLOR,
  MECHANISM_DESCRIPTIONS,
  subsystemGraphLayoutKey,
  type SubsystemComponentEdge,
  type SubsystemComponent,
  type SubsystemEdgeMechanism,
  type SubsystemThroughline,
} from './model';
import type { SubsystemOpenFileOptions } from './declarationRef';
import { SubsystemComponentNode, SubsystemGroupNode, SubsystemEdge, SUBSYSTEM_CALLBACKS, hexWithAlpha, EDGE_DIM_ALPHA, fileMatchForNode, flowElementVisibility } from './nodes';
import { SubsystemFileTree } from './SubsystemFileTree';
import { GraphLayoutCover } from './GraphLayoutCover';
import { ComponentDeclaration } from './ComponentDeclaration';
import type { ComponentVerificationState } from './ComponentDeclaration';
import { FileDrawer } from './FileDrawer';
import { buildRepoGroups, repoAvatarUrl, type RepoGroup } from './paths';

/** Cap screen-space edge labels to this fraction of the edge's on-screen length. */
const EDGE_LABEL_MAX_EDGE_FRACTION = 0.55;
/** Rough monospace width at fontSize 10 + horizontal padding/border. */
const EDGE_LABEL_CHAR_PX = 6.2;
const EDGE_LABEL_PAD_PX = 18;

/** Context passed to `renderThroughlineViewer` when a flow/step is focused. */
export interface ThroughlineViewerContext {
  throughline: SubsystemThroughline;
  /** Focused step index; `null` means the whole flow (no specific step). */
  stepIndex: number | null;
}

type DrawerTarget =
  | { kind: 'file'; file: string; startLine?: number }
  | { kind: 'throughline'; throughlineId: string; stepIndex: number | null };

export interface SubsystemComponentGraphProps {
  components: SubsystemComponent[];
  edges: SubsystemComponentEdge[];
  /**
   * Ordered execution stories over the graph's edges — one throughline per
   * flow. When present the sidebar's bottom half offers a Files/Flows toggle:
   * the flows panel lists each throughline's steps (`symbol` or `file:line`);
   * clicking a flow row toggles its steps; clicking a step focuses that
   * step's edge and (when `renderThroughlineViewer` is set) opens the bottom
   * drawer on that flow's snippets. Opened flows stay on the canvas
   * (unselected ones dimmed); everything else is hidden.
   */
  throughlines?: SubsystemThroughline[];
  onSelect?: (componentId: string) => void;
  /** Called when an edge is clicked (relationship / mechanism + refs seam). */
  onEdgeSelect?: (edge: SubsystemComponentEdge) => void;
  /** Upper bound for node width in px; nodes grow with content up to this,
   *  then the name wraps. Defaults to 300 for components (320 for packages). */
  maxNodeWidth?: number;
  /** Show edge labels (mechanism names) on the graph. @default true */
  showEdgeLabels?: boolean;
  /** Subsystem title displayed in the sidebar. */
  title?: string;
  /**
   * Suppresses the sidebar entirely (title, description, file tree,
   * throughlines) for graph-only embeds. Pair with `graphTitle` to keep the
   * subsystem name visible as an overlay on the canvas.
   */
  hideSidebar?: boolean;
  /**
   * Subsystem title rendered as a non-interactive overlay chip on the graph
   * canvas (top-center). Does not trigger the sidebar — for graph-only
   * embeds that still need to name what they show.
   */
  graphTitle?: string;
  /** Markdown description rendered in the sidebar. */
  description?: string;
  /** Rendered over the graph canvas only (not the title/legend sidebar). */
  canvasOverlay?: ReactNode;
  /** Extra controls at the top of the title/legend sidebar. */
  sidebarExtra?: ReactNode;
  /** Rendered in the sidebar under the description (e.g. selection inspector). */
  sidebarAfterDescription?: ReactNode;
  /**
   * Host-injected reader/renderer for the bottom file drawer, keyed by
   * repo-root-relative path. Opening happens on declaration/file-tree clicks.
   * Keeps this package free of fs and code-view dependencies.
   */
  renderFileViewer?: (file: string, opts?: SubsystemOpenFileOptions) => ReactNode;
  /**
   * Host-injected multi-snippet viewer for a focused throughline. When set,
   * clicking a flow step opens the bottom drawer with this content and
   * updates it as the focused step changes.
   */
  renderThroughlineViewer?: (ctx: ThroughlineViewerContext) => ReactNode;
  /**
   * Legacy component-keyed variant, kept for backward compatibility. When
   * `renderFileViewer` is absent, drawer content resolves via the first
   * component whose `file` matches the opened path.
   */
  renderFileView?: (component: SubsystemComponent) => ReactNode;
  /**
   * Called when a file in the sidebar file tree is clicked (repo-root-relative
   * path). The tree is derived from the components' `file` values.
   */
  onFileSelect?: (file: string) => void;
  /** Verify the selected component against graphify (declaration panel). */
  onVerifyComponent?: (componentId: string) => void;
  /** Live verification status for the selected component. */
  componentVerification?: ComponentVerificationState | null;
}

const nodeTypes: NodeTypes = {
  'subsystem-component': SubsystemComponentNode,
  'subsystem-group': SubsystemGroupNode,
};

const edgeTypes: EdgeTypes = {
  'subsystem-edge': SubsystemEdge,
};

// Memoized drawer body: only rebuilds children when the open target changes.
// Inner re-renders on every viewport pan/zoom and hover; recreating host
// elements then would churn their readFile closures and flash the file
// viewer's loading state on each render.
const FileDrawerContent = memo(function FileDrawerContent({
  render,
  file,
  startLine,
}: {
  render: (file: string, opts?: SubsystemOpenFileOptions) => ReactNode;
  file: string;
  startLine?: number;
}) {
  return <>{render(file, startLine != null ? { startLine } : undefined)}</>;
});

const ThroughlineDrawerContent = memo(function ThroughlineDrawerContent({
  render,
  throughline,
  stepIndex,
}: {
  render: (ctx: ThroughlineViewerContext) => ReactNode;
  throughline: SubsystemThroughline;
  stepIndex: number | null;
}) {
  return <>{render({ throughline, stepIndex })}</>;
});

interface InnerProps extends SubsystemComponentGraphProps {
  measured: { w: number; h: number } | null;
}

function Inner({ components, edges, throughlines, onSelect, onEdgeSelect, measured: _measured, maxNodeWidth, showEdgeLabels, title, hideSidebar, graphTitle, description, canvasOverlay, sidebarExtra, sidebarAfterDescription, renderFileView, renderFileViewer, renderThroughlineViewer, onFileSelect, onVerifyComponent, componentVerification }: InnerProps) {
  const { theme } = useTheme();
  const { fitView } = useReactFlow();
  const viewport = useViewport();
  const [built, setBuilt] = useState<{ nodes: Node[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });
  const [layoutReady, setLayoutReady] = useState(false);
  const [selected, setSelected] = useState<SubsystemComponent | null>(null);
  /** Bottom drawer: single file or throughline multi-snippet mode. */
  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget | null>(null);
  // Component the pointer is over (null on leave) → transient tree highlight.
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  // Throughline focus — selected flow (or step) is full strength; other
  // opened-flow members stay visible but dimmed; everything else is hidden.
  const [focusedThroughlineId, setFocusedThroughlineId] = useState<string | null>(null);
  // `null` = whole flow focused; a number = that single step's edge focused.
  const [focusedStepIndex, setFocusedStepIndex] = useState<number | null>(null);
  // Sidebar bottom half: which panel is shown when throughlines exist.
  const [sidebarView, setSidebarView] = useState<'files' | 'flows'>(() =>
    throughlines?.length ? 'flows' : 'files',
  );
  // Throughline flows the user has expanded (via the title row). Closed by
  // default so a graph with several flows doesn't dump every step list at once.
  const [expandedThroughlines, setExpandedThroughlines] = useState<Set<string>>(new Set());
  // Sidebar description visibility. Hidden by default so the files/flows
  // panel gets the vertical room; the title-row toggle reveals it.
  const [descriptionVisible, setDescriptionVisible] = useState(false);
  const [descToggleHover, setDescToggleHover] = useState(false);
  // `true` only when a description exists AND the user opened it.
  const showDesc = !!description && descriptionVisible;
  // Ref mirror of `selected` so the SUBSYSTEM_CALLBACKS click handler (a
  // closure over the effect deps) can toggle without a stale value.
  const selectedRef = useRef<SubsystemComponent | null>(null);
  selectedRef.current = selected;
  // Ref mirror of the open file drawer target for tree-click toggle.
  const openFileRef = useRef<{ file: string; startLine?: number } | null>(null);
  const openFile =
    drawerTarget?.kind === 'file' ? drawerTarget.file : null;
  openFileRef.current =
    drawerTarget?.kind === 'file'
      ? { file: drawerTarget.file, startLine: drawerTarget.startLine }
      : null;

  const focusedThroughline = useMemo(() => {
    if (drawerTarget?.kind !== 'throughline' || !throughlines) return null;
    return throughlines.find((t) => t.id === drawerTarget.throughlineId) ?? null;
  }, [drawerTarget, throughlines]);

  const drawerTitle = useMemo(() => {
    if (!drawerTarget) return null;
    if (drawerTarget.kind === 'file') return drawerTarget.file;
    const tl = focusedThroughline;
    if (!tl) return null;
    if (drawerTarget.stepIndex == null) return tl.title;
    const step = tl.steps[drawerTarget.stepIndex];
    if (!step) return tl.title;
    const site = `${step.file.split('/').pop() ?? step.file}:${step.line}`;
    return `${tl.title} · ${site}`;
  }, [drawerTarget, focusedThroughline]);

  // Refresh selected component when the components list updates (e.g. verify
  // writes back declarationRef).
  useEffect(() => {
    if (!selected) return;
    const fresh = components.find((c) => c.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [components, selected]);

  // Pass 1: build with estimated widths so React Flow can measure the DOM.
  // The pane stays hidden until Pass 2 completes. Key off layout-affecting
  // fields only — declarationRef updates after verify must not re-run ELK.
  const layoutKey = useMemo(
    () => subsystemGraphLayoutKey({ components, edges }),
    [components, edges],
  );
  const componentsRef = useRef(components);
  const edgesRef = useRef(edges);
  componentsRef.current = components;
  edgesRef.current = edges;

  useEffect(() => {
    let alive = true;
    pass2DoneRef.current = false;
    measuredDimsRef.current = new Map();
    prevMeasuredSigRef.current = '';
    const doc = { components: componentsRef.current, edges: edgesRef.current };
    void buildSubsystemGraph(doc, { maxNodeWidth, showEdgeLabels })
      .then(({ nodes, edges: e }) => {
        if (!alive) return;
        setBuilt({ nodes, edges: e as Edge[] });
        setLayoutReady(false);
      })
      .catch((err) => {
        console.warn('[subsystem-graph] initial layout failed:', err);
        if (!alive) return;
        // Reveal the cover even on failure so the UI is not stuck forever.
        setBuilt({ nodes: [], edges: [] });
        setLayoutReady(true);
      });
    return () => { alive = false; };
  }, [layoutKey, maxNodeWidth, showEdgeLabels]);

  // Track measured dimensions from React Flow's dimension changes.
  // These arrive as { type: 'dimensions', id, dimensions } in onNodesChange.
  const measuredDimsRef = useRef(new Map<string, { width: number; height: number }>());
  const pendingMeasuredRef = useRef(false);

  // Pass 2: once every leaf node has a measured dimension, re-run ELK.
  // Group parents are sized by ELK, not measured — exclude them or pass 2
  // would wait forever for dimensions that never arrive.
  const prevMeasuredSigRef = useRef('');
  const pass2DoneRef = useRef(false);
  const triggerPass2 = useCallback(() => {
    if (pass2DoneRef.current) return;
    const dims = measuredDimsRef.current;
    const leafNodes = built.nodes.filter((n) => n.type !== 'subsystem-group');
    if (dims.size < leafNodes.length) return;
    const sig = leafNodes.map((n) => `${n.id}:${dims.get(n.id)?.width ?? '?'}`).join(',');
    if (sig.includes('?:')) return;
    if (sig === prevMeasuredSigRef.current) return;
    prevMeasuredSigRef.current = sig;
    pendingMeasuredRef.current = false;
    pass2DoneRef.current = true;

    const measuredWidths = new Map(leafNodes.map((n) => [n.id, dims.get(n.id)!.width]));
    const measuredHeights = new Map(leafNodes.map((n) => [n.id, dims.get(n.id)!.height]));
    let alive = true;
    void buildSubsystemGraph(
      { components, edges },
      { maxNodeWidth, showEdgeLabels, measuredWidths, measuredHeights },
    ).then(({ nodes, edges: e }) => {
      if (!alive) return;
      setBuilt({ nodes, edges: e as Edge[] });
      setLayoutReady(true);
    });
    return () => { alive = false; };
  }, [built.nodes, components, edges, maxNodeWidth, showEdgeLabels]);

  // Node components call SUBSYSTEM_CALLBACKS.onSelect on click (their inner
  // onClick stops React Flow propagation), so wire selection + width through it.
  // Lookup from edge id → the authored SubsystemComponentEdge (for onEdgeSelect).
  const edgeById = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges]);

  // Shared edge-selection logic used by both React Flow's onEdgeClick and the
  // clickable edge label (SUBSYSTEM_CALLBACKS.onEdgeSelect).
  const selectEdge = useCallback(
    (edgeId: string) => {
      if (selectedEdgeIdRef.current === edgeId) {
        setSelectedEdgeId(null);
        return;
      }
      const src = edgeById.get(edgeId);
      setSelectedEdgeId(edgeId);
      // A direct edge selection on the canvas supersedes any throughline focus.
      setFocusedThroughlineId(null);
      setFocusedStepIndex(null);
      if (src) onEdgeSelect?.(src);
    },
    [edgeById, onEdgeSelect],
  );

  useEffect(() => {
    SUBSYSTEM_CALLBACKS.onSelect = (id: string) => {
      const comp = components.find((c) => c.id === id);
      if (comp) {
        // Clicking the already-selected node unselects it (toggle off).
        // Selection is independent of the file drawer — nodes never open it.
        if (selectedRef.current?.id === comp.id) {
          setSelected(null);
          setSelectedEdgeId(null);
          return;
        }
        setSelected(comp);
        setSelectedEdgeId(null);
        setFocusedThroughlineId(null);
        setFocusedStepIndex(null);
        onSelect?.(id);
      }
    };
    SUBSYSTEM_CALLBACKS.onEdgeSelect = selectEdge;
    SUBSYSTEM_CALLBACKS.maxNodeWidth = maxNodeWidth;
    SUBSYSTEM_CALLBACKS.onHover = setHoveredComponentId;
    return () => {
      SUBSYSTEM_CALLBACKS.onSelect = undefined;
      SUBSYSTEM_CALLBACKS.onEdgeSelect = undefined;
      SUBSYSTEM_CALLBACKS.maxNodeWidth = undefined;
      SUBSYSTEM_CALLBACKS.onHover = undefined;
    };
  }, [components, onSelect, maxNodeWidth, selectEdge]);

  const { nodes, edges: convertedEdges } = built;
  const xyflowNodesBase = nodes as Node[];
  const baseEdges = convertedEdges as Edge[];

  // When an edge is selected, dim every other edge + its label to focus it.
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // Ref mirror so `selectEdge` (a useCallback over early deps) can toggle
  // without a stale closure value.
  const selectedEdgeIdRef = useRef<string | null>(null);
  selectedEdgeIdRef.current = selectedEdgeId;
  // Edge ids in throughline focus (an active flow's edge set, or a single
  // step's edge). Used to frame the camera. `null` = no throughline focus.
  const focusEdgeIds = useMemo(() => {
    if (focusedThroughlineId == null || !throughlines) return null;
    const tl = throughlines.find((t) => t.id === focusedThroughlineId);
    if (!tl) return null;
    if (focusedStepIndex != null) {
      const step = tl.steps[focusedStepIndex];
      return step ? new Set([step.edgeId]) : null;
    }
    return new Set(tl.steps.map((s) => s.edgeId));
  }, [throughlines, focusedThroughlineId, focusedStepIndex]);

  // 1-based step numbers per edge of the selected flow (an edge can appear
  // in more than one step).
  const selectedFlowStepNos = useMemo(() => {
    if (focusedThroughlineId == null || !throughlines) return null;
    const tl = throughlines.find((t) => t.id === focusedThroughlineId);
    if (!tl) return null;
    const map = new Map<string, number[]>();
    tl.steps.forEach((s, i) => {
      const list = map.get(s.edgeId) ?? [];
      list.push(i + 1);
      map.set(s.edgeId, list);
    });
    return map;
  }, [throughlines, focusedThroughlineId]);

  // Union of every expanded (opened) throughline's edges — the visible set.
  const openedEdgeIds = useMemo(() => {
    if (!throughlines || expandedThroughlines.size === 0) return null;
    const ids = new Set<string>();
    for (const tl of throughlines) {
      if (!expandedThroughlines.has(tl.id)) continue;
      for (const s of tl.steps) ids.add(s.edgeId);
    }
    return ids.size > 0 ? ids : null;
  }, [throughlines, expandedThroughlines]);

  const endpointsOf = (edgeIds: ReadonlySet<string> | null): Set<string> | null => {
    if (!edgeIds) return null;
    const ids = new Set<string>();
    for (const e of baseEdges) {
      if (!edgeIds.has(e.id)) continue;
      ids.add(e.source);
      ids.add(e.target);
    }
    return ids.size > 0 ? ids : null;
  };
  const openedNodeIds = useMemo(
    () => endpointsOf(openedEdgeIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseEdges, openedEdgeIds],
  );
  // Endpoints of the bright set: the selected step's edge, or the whole flow
  // when no step is focused.
  const brightNodeIds = useMemo(
    () => endpointsOf(focusEdgeIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseEdges, focusEdgeIds],
  );

  // Source + target of the focused step/flow (or a canvas-selected edge). If a
  // file is open, those endpoints stay undimmed even when they don't live in
  // that file.
  const focusNodeIds = useMemo(() => {
    if (brightNodeIds) return brightNodeIds;
    if (selectedEdgeId) {
      const e = baseEdges.find((x) => x.id === selectedEdgeId);
      if (e) return new Set([e.source, e.target]);
    }
    return null;
  }, [baseEdges, brightNodeIds, selectedEdgeId]);

  // While a file is open in the drawer, tag each node with whether its
  // component lives in that file — the node renderer spotlights matches and
  // dims non-matches (mirrors the edge-dimming behavior on selection).
  // Opened-but-unselected members are dimmed; a selected step further dims
  // the rest of its own flow. Nodes not on any opened flow are hidden.
  // `isSelected` rides in data because the node's stopPropagation() keeps
  // React Flow's own selection state from updating.
  const dispNodes = useMemo(() => {
    return xyflowNodesBase.map((n) => {
      // Boundary frames follow their members: hidden when no member is
      // visible, dimmed when members are dimmed. Never selectable.
      if (n.type === 'subsystem-group') {
        const memberIds = ((n.data as { region?: { memberIds?: string[] } } | undefined)?.region?.memberIds) ?? [];
        const vis = flowElementVisibility({
          inOpened: memberIds.some((id) => openedNodeIds?.has(id) === true),
          inSelected: memberIds.some((id) => brightNodeIds?.has(id) === true),
          anyOpened: openedNodeIds != null,
          anySelected: brightNodeIds != null,
        });
        return {
          ...n,
          hidden: vis.hidden,
          selectable: false,
          data: {
            ...(n.data as object),
            ...(vis.dimmed && { dimmed: true }),
          },
        };
      }
      const comp = (n.data as { component?: SubsystemComponent } | undefined)?.component;
      const fileMatch = fileMatchForNode(comp?.file, openFile, focusNodeIds?.has(n.id) === true);
      const isSelected = selected?.id !== undefined && comp?.id === selected.id;
      const vis = flowElementVisibility({
        inOpened: openedNodeIds?.has(n.id) === true,
        inSelected: brightNodeIds?.has(n.id) === true,
        anyOpened: openedNodeIds != null,
        anySelected: brightNodeIds != null,
      });
      if (fileMatch === undefined && !isSelected && !vis.dimmed) {
        const { fileMatch: _f, isSelected: _s, dimmed: _d, ...rest } = n.data as Record<string, unknown>;
        return { ...n, hidden: vis.hidden, data: rest };
      }
      return {
        ...n,
        hidden: vis.hidden,
        data: {
          ...(n.data as object),
          ...(fileMatch !== undefined && { fileMatch }),
          ...(isSelected && { isSelected }),
          ...(vis.dimmed && { dimmed: true }),
        },
      };
    });
  }, [xyflowNodesBase, openFile, selected, focusNodeIds, openedNodeIds, brightNodeIds]);

  const baseNodesKey = useMemo(() => nodes.map((n) => n.id).sort().join(','), [nodes]);
  const baseEdgesKey = useMemo(
    () => convertedEdges.map((e) => e.id).sort().join(','),
    [convertedEdges],
  );

  const dispEdges = useMemo(() => {
    const paint = (e: Edge, dimmed: boolean): Edge => {
      const markerEnd = e.markerEnd;
      const nextMarker =
        dimmed && markerEnd && typeof markerEnd === 'object' && typeof markerEnd.color === 'string'
          ? { ...markerEnd, color: hexWithAlpha(markerEnd.color, EDGE_DIM_ALPHA) }
          : markerEnd;
      return {
        ...e,
        data: { ...(e.data as object), dimmed },
        markerEnd: nextMarker,
      };
    };
    if (openedEdgeIds || focusEdgeIds) {
      return baseEdges.map((e) => {
        const vis = flowElementVisibility({
          inOpened: openedEdgeIds?.has(e.id) === true,
          inSelected: focusEdgeIds?.has(e.id) === true,
          anyOpened: openedEdgeIds != null,
          anySelected: focusEdgeIds != null,
        });
        return { ...paint(e, vis.dimmed), hidden: vis.hidden };
      });
    }
    if (!selectedEdgeId) return baseEdges;
    return baseEdges.map((e) => paint(e, e.id !== selectedEdgeId));
  }, [baseEdges, selectedEdgeId, openedEdgeIds, focusEdgeIds]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Capture dimension changes (React Flow's measurement callback).
      // Group parents are ELK-sized — ignore their measurements.
      const groupIds = new Set(
        dispNodes.filter((n) => n.type === 'subsystem-group').map((n) => n.id),
      );
      for (const ch of changes) {
        if (ch.type === 'dimensions' && ch.dimensions && !groupIds.has(ch.id)) {
          measuredDimsRef.current.set(ch.id, ch.dimensions);
          pendingMeasuredRef.current = true;
        }
      }
      const result = applyNodeChanges(changes, dispNodes);
      // After applying changes, check if we should trigger pass 2.
      if (pendingMeasuredRef.current) {
        // Use microtask so the state update from applyNodeChanges commits first.
        queueMicrotask(() => triggerPass2());
      }
      return result;
    },
    [dispNodes, triggerPass2],
  );
  const onEdgesChange = useCallback(
    (_changes: EdgeChange[]) => dispEdges,
    [dispEdges],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      fitView({ padding: 0.1, includeHiddenNodes: false, minZoom: 0.05, maxZoom: 2, duration: 200 });
    }, 200);
    return () => clearTimeout(t);
  }, [baseNodesKey, baseEdgesKey, fitView]);

  // When the file drawer opens or closes the canvas is resized but the
  // camera stays put — no refit/zoom. Spotlight + dimming already convey
  // which nodes belong to the open file.
  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node: Node) => {
      const comp = (node.data as { component?: SubsystemComponent } | undefined)?.component;
      setSelectedEdgeId(null);
      setFocusedThroughlineId(null);
      setFocusedStepIndex(null);
      if (node.type === 'subsystem-component' && comp) {
        // Clicking the already-selected node unselects it (toggle off).
        // Selection is independent of the file drawer — nodes never open it.
        if (selected?.id === comp.id) {
          setSelected(null);
          return;
        }
        setSelected(comp);
        if (comp.id) onSelect?.(comp.id);
      }
    },
    [onSelect, selected],
  );

  // React Flow's edge click → the same shared selection logic as the label.
  const onEdgeClick = useCallback(
    (_e: ReactMouseEvent, edge: Edge) => {
      selectEdge(edge.id);
    },
    [selectEdge],
  );

  const onPaneClick = useCallback(() => {
    setSelected(null);
    setSelectedEdgeId(null);
    setFocusedThroughlineId(null);
    setFocusedStepIndex(null);
  }, []);

  // Sidebar file trees — one per repo on multi-repo graphs, each under its
  // own owner-avatar header. Clicking a header collapses that repo's tree.
  const repoGroups = useMemo(() => buildRepoGroups(components), [components]);
  const hasThroughlines = useMemo(() => (throughlines?.length ?? 0) > 0, [throughlines]);
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(new Set());
  const toggleRepoCollapsed = useCallback((key: string) => {
    setCollapsedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const treeFiles = useMemo(
    () => repoGroups.groups.flatMap((g) => g.entries.map((e) => e.file)),
    [repoGroups],
  );
  const onTreeSelectFile = useCallback(
    (file: string) => {
      if (openFileRef.current?.file === file && openFileRef.current.startLine == null) {
        setDrawerTarget(null);
        return;
      }
      setDrawerTarget({ kind: 'file', file });
      onFileSelect?.(file);
    },
    [onFileSelect],
  );

  const onOpenDeclarationFile = useCallback(
    (file: string, opts?: SubsystemOpenFileOptions) => {
      const startLine = opts?.startLine;
      if (
        openFileRef.current?.file === file &&
        openFileRef.current.startLine === startLine
      ) {
        setDrawerTarget(null);
        return;
      }
      setDrawerTarget({ kind: 'file', file, startLine });
      onFileSelect?.(file);
    },
    [onFileSelect],
  );

  // Camera helper shared by the throughline interactions: frames the focused
  // edges' endpoint nodes via `fitView({ nodes })`, which uses the store's
  // live positions + measured dims — so the frame always includes BOTH
  // components the edge attaches to (and therefore the edge line between them).
  const fitFocusBounds = useCallback(
    (ids: ReadonlySet<string>) => {
      const nodeIds = new Set<string>();
      for (const e of baseEdges) {
        if (!ids.has(e.id)) continue;
        nodeIds.add(e.source);
        nodeIds.add(e.target);
      }
      if (nodeIds.size === 0) return;
      fitView({
        nodes: [...nodeIds].map((id) => ({ id })),
        padding: 0.25,
        duration: 300,
      });
    },
    [baseEdges, fitView],
  );

  // Focus an entire flow: hide everything but the flow's nodes and edges, and
  // frame the flow on the canvas. Selection state is cleared — the graph now
  // reads as the narrative. No drawer: the code view only opens on a step
  // click. A stale throughline drawer (from a previously focused flow's step)
  // closes; an explicitly opened file drawer stays.
  const focusThroughlineEdges = useCallback(
    (tl: SubsystemThroughline) => {
      setSelected(null);
      setSelectedEdgeId(null);
      setFocusedStepIndex(null);
      setFocusedThroughlineId(tl.id);
      fitFocusBounds(new Set(tl.steps.map((s) => s.edgeId)));
      setDrawerTarget((prev) => (prev?.kind === 'throughline' ? null : prev));
    },
    [fitFocusBounds],
  );

  const clearThroughlineFocus = useCallback(() => {
    setFocusedThroughlineId(null);
    setFocusedStepIndex(null);
    setDrawerTarget((prev) => (prev?.kind === 'throughline' ? null : prev));
  }, []);

  // Focus a single step's edge on the canvas and open/scroll the throughline
  // drawer to that step's snippet.
  const focusThroughlineStep = useCallback(
    (tl: SubsystemThroughline, stepIndex: number) => {
      const step = tl.steps[stepIndex];
      if (!step) return;
      setSelected(null);
      setSelectedEdgeId(null);
      setFocusedStepIndex(stepIndex);
      setFocusedThroughlineId(tl.id);
      fitFocusBounds(new Set([step.edgeId]));
      if (renderThroughlineViewer) {
        setDrawerTarget({
          kind: 'throughline',
          throughlineId: tl.id,
          stepIndex,
        });
      } else {
        setDrawerTarget({
          kind: 'file',
          file: step.file,
          startLine: step.line,
        });
      }
    },
    [fitFocusBounds, renderThroughlineViewer],
  );

  // Arrow keys step through the focused throughline once a step is active
  // (sidebar click or drawer open). Ignores typing targets and chords.
  useEffect(() => {
    if (focusedThroughlineId == null || focusedStepIndex == null || !throughlines) {
      return;
    }
    const tl = throughlines.find((t) => t.id === focusedThroughlineId);
    if (!tl || tl.steps.length === 0) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      let next: number | null = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        next = Math.min(tl.steps.length - 1, focusedStepIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        next = Math.max(0, focusedStepIndex - 1);
      } else {
        return;
      }
      if (next === focusedStepIndex) return;
      e.preventDefault();
      focusThroughlineStep(tl, next);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    focusedThroughlineId,
    focusedStepIndex,
    throughlines,
    focusThroughlineStep,
  ]);

  const toggleThroughlineCollapsed = useCallback((tlId: string) => {
    setExpandedThroughlines((prev) => {
      const next = new Set(prev);
      if (next.has(tlId)) next.delete(tlId);
      else next.add(tlId);
      return next;
    });
  }, []);

  // Filename-badge clicks on nodes open the drawer through the same path as
  // the declaration panel's file link (toggle + tree sync, no start line).
  useEffect(() => {
    SUBSYSTEM_CALLBACKS.onOpenFile = (componentId: string) => {
      const comp = components.find((c) => c.id === componentId);
      if (comp?.file) onOpenDeclarationFile(comp.file);
    };
    return () => {
      SUBSYSTEM_CALLBACKS.onOpenFile = undefined;
    };
  }, [components, onOpenDeclarationFile]);

  // Detail-panel links: related-name clicks select the matching component —
  // resolved by id, name, or symbol (call labels may carry a trailing `()`).
  const resolveRelatedComponent = useCallback(
    (ref: string) => {
      const clean = ref.replace(/\(\)$/, '');
      const comp = components.find(
        (c) =>
          c.id === clean ||
          c.name === clean ||
          c.symbol === clean ||
          c.symbol?.replace(/\(\)$/, '') === clean,
      );
      if (!comp || comp.id === selectedRef.current?.id) return;
      setSelected(comp);
      setSelectedEdgeId(null);
      setFocusedThroughlineId(null);
      setFocusedStepIndex(null);
      onSelect?.(comp.id);
    },
    [components, onSelect],
  );

  // Edge label data for the overlay (rendered OUTSIDE ReactFlow so the pane
  // doesn't intercept pointer events). Uses ELK-computed label midpoints from
  // the actual edge path (not node-center approximations).
  const edgeLabels = useMemo(() => {
    return dispEdges
      .filter((e) => !e.hidden)
      .map((e) => {
        const d = e.data as {
          mechanism?: string;
          dimmed?: boolean;
          labelX?: number;
          labelY?: number;
          pathLength?: number;
        } | undefined;
        return {
          id: e.id,
          mechanism: d?.mechanism ?? 'imports',
          dimmed: d?.dimmed === true,
          midX: d?.labelX ?? 0,
          midY: d?.labelY ?? 0,
          pathLength: d?.pathLength ?? 0,
          stepNos: selectedFlowStepNos?.get(e.id),
        };
      });
  }, [dispEdges, selectedFlowStepNos]);

  // Unique source files across components → sidebar file trees.
  const treeFilePaths = treeFiles;

  // The hovered node's file (null when not hovering / file-less component).
  const hoveredFile = useMemo(() => {
    if (!hoveredComponentId) return null;
    return components.find((c) => c.id === hoveredComponentId)?.file ?? null;
  }, [components, hoveredComponentId]);

  // Drawer content renderer: prefer the path-keyed viewer; fall back to the
  // legacy component-keyed one via a file → first-component lookup.
  const fileViewer = useMemo(() => {
    if (renderFileViewer) return renderFileViewer;
    if (renderFileView) {
      const byFile = new Map(
        components.filter((c) => c.file).map((c) => [c.file, c] as const),
      );
      return (file: string, _opts?: SubsystemOpenFileOptions) => {
        const comp = byFile.get(file);
        return comp ? renderFileView(comp) : null;
      };
    }
    return renderFileViewer;
  }, [renderFileViewer, renderFileView, components]);

  const fileViewerRef = useRef(fileViewer);
  fileViewerRef.current = fileViewer;
  const renderDrawerContent = useCallback(
    (file: string, opts?: SubsystemOpenFileOptions) =>
      fileViewerRef.current?.(file, opts) ?? null,
    [],
  );

  const throughlineViewerRef = useRef(renderThroughlineViewer);
  throughlineViewerRef.current = renderThroughlineViewer;
  const renderThroughlineDrawerContent = useCallback(
    (ctx: ThroughlineViewerContext) =>
      throughlineViewerRef.current?.(ctx) ?? null,
    [],
  );

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'row' }}>
      {/* Sidebar: scrollable title/description on top, files or flows pinned below.
          The description hides by default so files/flows get the room; the
          title-row toggle reveals it, and the lower panel yields back to 50%. */}
      {!hideSidebar && (title || description || sidebarExtra || sidebarAfterDescription || treeFilePaths.length > 0 || hasThroughlines) && (
        <div
          style={{
            width: 340,
            minWidth: 340,
            borderRight: `1px solid ${theme.colors.border}`,
            background: theme.colors.backgroundSecondary ?? theme.colors.background,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              flex: showDesc ? 1 : '0 0 auto',
              minHeight: 0,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
          {sidebarExtra}
          {(title || description) && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              {title && (
                <h2
                  style={{
                    margin: 0,
                    flex: 1,
                    minWidth: 0,
                    fontSize: theme.fontSizes[2],
                    fontWeight: 600,
                    color: theme.colors.text,
                    fontFamily: theme.fonts.monospace,
                  }}
                >
                  {title}
                </h2>
              )}
              {description && (
                <button
                  type="button"
                  aria-expanded={descriptionVisible}
                  aria-label={descriptionVisible ? 'Hide description' : 'Show description'}
                  title={descriptionVisible ? 'Hide description' : 'Show description'}
                  onMouseEnter={() => setDescToggleHover(true)}
                  onMouseLeave={() => setDescToggleHover(false)}
                  onClick={() => setDescriptionVisible((v) => !v)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    padding: 0,
                    border: 'none',
                    borderRadius: 4,
                    background: descToggleHover ? theme.colors.border : 'transparent',
                    color: descToggleHover ? theme.colors.text : (theme.colors.textMuted ?? theme.colors.textSecondary),
                    cursor: 'pointer',
                    transition: 'background 120ms ease, color 120ms ease',
                  }}
                >
                  {descriptionVisible ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
            </div>
          )}
          {description && descriptionVisible && (
            <div style={{ fontSize: theme.fontSizes[0], lineHeight: 1.5 }}>
              <IndustryMarkdownSlide
                content={description}
                slideIdPrefix="subsystem-desc"
                slideIndex={0}
                isVisible={true}
                theme={theme}
                disableScroll={true}
                fontSizeScale={0.9}
                enableKeyboardScrolling={false}
                autoFocusOnVisible={false}
              />
            </div>
          )}
          {sidebarAfterDescription}
          </div>
          {(treeFilePaths.length > 0 || hasThroughlines) && (
            <div
              style={{
                ...(showDesc ? { height: '50%' as const } : { flex: 1, minHeight: 0 }),
                minHeight: 160,
                flexShrink: 0,
                borderTop: `1px solid ${theme.colors.border}`,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {hasThroughlines && (
                <div
                  role="tablist"
                  aria-label="Sidebar view"
                  style={{
                    display: 'flex',
                    width: '100%',
                    flexShrink: 0,
                    borderBottom: `1px solid ${theme.colors.border}`,
                    background: theme.colors.backgroundSecondary ?? theme.colors.background,
                  }}
                >
                  {(['flows', 'files'] as const).map((view) => (
                    <button
                      key={view}
                      type="button"
                      role="tab"
                      aria-selected={sidebarView === view}
                      onClick={() => setSidebarView(view)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 8px',
                        border: 'none',
                        borderRadius: 0,
                        background: sidebarView === view ? theme.colors.background : 'transparent',
                        color:
                          sidebarView === view
                            ? theme.colors.text
                            : theme.colors.textSecondary,
                        fontSize: theme.fontSizes[1],
                        fontFamily: theme.fonts.monospace,
                        textTransform: 'capitalize',
                        cursor: 'pointer',
                      }}
                    >
                      {view}
                    </button>
                  ))}
                </div>
              )}
              {sidebarView === 'flows' && throughlines && throughlines.length > 0 ? (
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    padding: '0 4px 12px',
                  }}
                >
                  {throughlines.map((tl) => (
                    <ThroughlineFlow
                      key={tl.id}
                      throughline={tl}
                      edges={edges}
                      collapsed={!expandedThroughlines.has(tl.id)}
                      active={focusedThroughlineId === tl.id ? { stepIndex: focusedStepIndex } : null}
                      onToggleCollapsed={toggleThroughlineCollapsed}
                      onFocusFlow={focusThroughlineEdges}
                      onClearFocus={clearThroughlineFocus}
                      onFocusStep={focusThroughlineStep}
                    />
                  ))}
                </div>
              ) : treeFilePaths.length > 0 ? (
              <>
              {repoGroups.groups.map((group, i) => {
                const groupKey = group.repoKey ?? '__no-repo__';
                const collapsed = collapsedRepos.has(groupKey);
                return (
                  <div
                    key={groupKey}
                    style={{
                      flex: collapsed ? '0 0 auto' : 1,
                      minHeight: collapsed ? 0 : undefined,
                      display: 'flex',
                      flexDirection: 'column',
                      borderTop: i > 0 ? `1px solid ${theme.colors.border}` : undefined,
                    }}
                  >
                    {repoGroups.multiRepo && (
                      <RepoGroupHeader
                        group={group}
                        collapsed={collapsed}
                        onToggle={() => toggleRepoCollapsed(groupKey)}
                      />
                    )}
                    {!collapsed && (
                      <SubsystemFileTree
                        files={group.entries.map((e) => e.displayPath)}
                        selectedFile={selected?.file ?? openFile}
                        hoveredFile={hoveredFile}
                        onSelectFile={onTreeSelectFile}
                        headerless={repoGroups.multiRepo}
                      />
                    )}
                  </div>
                );
              })}
              </>
              ) : null}
            </div>
          )}
        </div>
      )}
      
      {/* Graph area */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Canvas box — the edge-label overlay and legend anchor here, so
            overlays shift with the canvas, not the labels. */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Edge-label overlay — sits above the ReactFlow pane so clicks land. */}
        {showEdgeLabels !== false && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {edgeLabels.map((lbl) => {
            const mechanism = lbl.mechanism as SubsystemEdgeMechanism;
            const color = MECHANISM_COLOR[mechanism] ?? '#888';
            const verifiable = MECHANISM_DESCRIPTIONS.find(([m]) => m === mechanism)?.[2] ?? true;
            const screenX = lbl.midX * viewport.zoom + viewport.x;
            const screenY = lbl.midY * viewport.zoom + viewport.y;
            const text = lbl.stepNos?.length
              ? `${lbl.stepNos.map((n) => `${n}:`).join(' ')} ${lbl.mechanism}`
              : lbl.mechanism;
            // Labels stay readable at full size until they'd exceed a share of
            // the edge's screen length, then shrink with zoom.
            const estWidth = text.length * EDGE_LABEL_CHAR_PX + EDGE_LABEL_PAD_PX;
            const screenEdgeLen = lbl.pathLength * viewport.zoom;
            const scale =
              lbl.pathLength > 0 && estWidth > 0
                ? Math.min(1, (screenEdgeLen * EDGE_LABEL_MAX_EDGE_FRACTION) / estWidth)
                : 1;
            return (
              <div
                key={lbl.id}
              data-edge-label={lbl.id}
              title={verifiable ? undefined : 'Not directly verifiable with graphify'}
              onClick={(e) => {
                e.stopPropagation();
                selectEdge(lbl.id);
              }}
              style={{
                position: 'absolute',
                left: screenX,
                top: screenY,
                // Center on the flow-space midpoint. Labels live in screen
                // space (fixed size when zoomed out), so top-left anchoring
                // would drift them right/down of the edge as zoom drops.
                transform: `translate(-50%, -50%) scale(${scale})`,
                transformOrigin: 'center center',
                display: 'flex',
                alignItems: 'center',
                fontSize: 10,
                lineHeight: 1,
                fontFamily: theme.fonts.monospace,
                fontWeight: 500,
                color,
                background: 'rgba(21,21,21,0.9)',
                border: verifiable ? `0.5px solid ${color}` : `1px dashed ${color}`,
                borderRadius: verifiable ? 4 : '10px 14px 12px 16px / 14px 10px 16px 12px',
                padding: '3px 8px',
                cursor: 'pointer',
                pointerEvents: 'auto',
                opacity: lbl.dimmed ? 0.15 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {text}
            </div>
          );
        })}
      </div>
      )}
      <ReactFlow
        key={`${baseNodesKey}-${baseEdgesKey}`}
        nodes={dispNodes}
        edges={dispEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.05}
        maxZoom={4}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        elementsSelectable
        selectNodesOnDrag={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        onPaneClick={onPaneClick}
        panOnDrag
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        style={{
          width: '100%',
          height: '100%',
          flex: 1,
          minHeight: 0,
          background: theme.colors.background,
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showZoom showFitView showInteractive />
      </ReactFlow>
      {/* Graph title — non-interactive chip centered at the top of the canvas
          (clear of the top-right declaration card). Lets graph-only embeds
          name the subsystem they show. */}
      {graphTitle && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 6,
            maxWidth: '60%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            padding: '6px 18px',
            fontSize: theme.fontSizes[3],
            fontWeight: 600,
            fontFamily: theme.fonts.monospace,
            color: theme.colors.text,
            background: theme.colors.backgroundSecondary ?? theme.colors.background,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 6,
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
          }}
        >
          {graphTitle}
        </div>
      )}
        {/* Selected-component declaration — floating card over the canvas
            (top-right). The graph never moves for it. */}
        {selected && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: 8,
              width: 'min(560px, 70%)',
              maxHeight: '46%',
              overflowY: 'auto',
              background: theme.colors.background,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}
          >
            <ComponentDeclaration
              component={selected}
              onOpenFile={onOpenDeclarationFile}
              onRelatedSelect={resolveRelatedComponent}
              onVerify={onVerifyComponent}
              verification={componentVerification}
            />
          </div>
        )}
        </div>
      <FileDrawer title={drawerTitle} onClose={() => setDrawerTarget(null)}>
        {drawerTarget?.kind === 'throughline' &&
        focusedThroughline &&
        renderThroughlineViewer ? (
          <ThroughlineDrawerContent
            render={renderThroughlineDrawerContent}
            throughline={focusedThroughline}
            stepIndex={drawerTarget.stepIndex}
          />
        ) : drawerTarget?.kind === 'file' ? (
          <FileDrawerContent
            render={renderDrawerContent}
            file={drawerTarget.file}
            startLine={drawerTarget.startLine}
          />
        ) : null}
      </FileDrawer>
      {/* Startup cover — hides measurement, layout swap, and camera settle. */}
      <GraphLayoutCover revealed={layoutReady} />
      {canvasOverlay}
      </div>
    </div>
  );
}

/** Sidebar header for one repo's tree: owner avatar + repo name + file count.
 *  Clicking toggles the tree's visibility. */
function RepoGroupHeader({
  group,
  collapsed,
  onToggle,
}: {
  group: RepoGroup;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  const avatar = repoAvatarUrl(group.repoKey);
  const label = group.repo ?? 'No repo';
  return (
    <div
      role="button"
      aria-expanded={!collapsed}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={collapsed ? 'Show files' : 'Hide files'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px 4px',
        flexShrink: 0,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {avatar ? (
        <img
          src={avatar}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          style={{ borderRadius: 4, flexShrink: 0, background: theme.colors.border }}
        />
      ) : group.owner ? (
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            fontFamily: theme.fonts.monospace,
            color: theme.colors.text,
            background: theme.colors.border,
          }}
        >
          {group.owner.charAt(0).toUpperCase()}
        </span>
      ) : null}
      <span
        style={{
          fontSize: theme.fontSizes[1],
          fontFamily: theme.fonts.monospace,
          color: theme.colors.text,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** One collapsible throughline in the sidebar's flows panel. Clicking the
 *  title: closed → open + select; open and unselected → select; open and
 *  selected → close + clear focus. The right-aligned close button collapses
 *  without selecting. A step row focuses that step's edge. */
function ThroughlineFlow({
  throughline,
  edges,
  collapsed,
  active,
  onToggleCollapsed,
  onFocusFlow,
  onClearFocus,
  onFocusStep,
}: {
  throughline: SubsystemThroughline;
  edges: SubsystemComponentEdge[];
  collapsed: boolean;
  /** `{ stepIndex: null }` = whole flow focused; `{ stepIndex }` = one step. */
  active: { stepIndex: number | null } | null;
  onToggleCollapsed: (tlId: string) => void;
  onFocusFlow: (tl: SubsystemThroughline) => void;
  onClearFocus: () => void;
  onFocusStep: (tl: SubsystemThroughline, stepIndex: number) => void;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const hoverBg = theme.colors.background;
  const edgeById = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges]);
  const wholeFlowActive = active !== null && active.stepIndex === null;
  const [headerHover, setHeaderHover] = useState(false);
  const [closeHover, setCloseHover] = useState(false);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const stepButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep DOM focus on the active step so the browser focus ring (and
  // subsequent arrow keys) follow arrow navigation, not the originally
  // clicked button.
  useEffect(() => {
    if (active?.stepIndex == null) return;
    stepButtonRefs.current[active.stepIndex]?.focus({ preventScroll: true });
  }, [active?.stepIndex]);

  return (
    <div style={{ margin: '4px 0', borderRadius: 8 }}>
      <div
        onMouseEnter={() => setHeaderHover(true)}
        onMouseLeave={() => setHeaderHover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          borderRadius: 6,
          background: wholeFlowActive || headerHover ? hoverBg : 'transparent',
          transition: 'background 120ms ease',
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (collapsed) {
              onToggleCollapsed(throughline.id);
              onFocusFlow(throughline);
            } else if (active === null) {
              onFocusFlow(throughline);
            } else {
              onToggleCollapsed(throughline.id);
              onClearFocus();
            }
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            minWidth: 0,
            padding: '6px 8px',
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: theme.fontSizes[1],
              fontFamily: theme.fonts.monospace,
              fontWeight: 600,
              color: theme.colors.text,
            }}
          >
            {throughline.title}
          </span>
        </button>
        {!collapsed && (
          <button
            type="button"
            aria-label={`Close ${throughline.title}`}
            onMouseEnter={() => setCloseHover(true)}
            onMouseLeave={() => setCloseHover(false)}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapsed(throughline.id);
              if (active !== null) onClearFocus();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: 22,
              height: 22,
              marginRight: 4,
              padding: 0,
              border: 'none',
              borderRadius: 4,
              background: closeHover ? theme.colors.border : 'transparent',
              color: closeHover ? theme.colors.text : muted,
              cursor: 'pointer',
              transition: 'background 120ms ease, color 120ms ease',
            }}
          >
            <X size={12} strokeWidth={2} />
          </button>
        )}
      </div>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {throughline.steps.map((step, i) => {
            const edge = edgeById.get(step.edgeId);
            const mech = edge?.mechanism;
            const color = mech ? MECHANISM_COLOR[mech] : muted;
            const stepActive = active !== null && active.stepIndex === i;
            return (
              <button
                key={`${step.edgeId}-${i}`}
                ref={(el) => {
                  stepButtonRefs.current[i] = el;
                }}
                type="button"
                onMouseEnter={() => setHoveredStep(i)}
                onMouseLeave={() => setHoveredStep(null)}
                onClick={() => onFocusStep(throughline, i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 0,
                  padding: '4px 8px 4px 12px',
                  textAlign: 'left',
                  borderRadius: 6,
                  border: 'none',
                  outline: 'none',
                  background: stepActive || hoveredStep === i ? hoverBg : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 120ms ease',
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 14,
                    fontSize: theme.fontSizes[0] * 0.8,
                    fontFamily: theme.fonts.monospace,
                    color: stepActive ? theme.colors.text : muted,
                  }}
                >
                  {i + 1}
                </span>
                {step.symbol ? (
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: theme.fontSizes[0],
                      fontFamily: theme.fonts.monospace,
                      color: stepActive ? theme.colors.text : muted,
                    }}
                  >
                    {step.symbol}
                  </span>
                ) : (
                  <>
                    <span
                      style={{
                        flexShrink: 0,
                        width: 74,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: theme.fontSizes[0],
                        fontFamily: theme.fonts.monospace,
                        color,
                      }}
                    >
                      {mech ?? step.edgeId}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: theme.fontSizes[0],
                        fontFamily: theme.fonts.monospace,
                        color: stepActive ? theme.colors.text : muted,
                      }}
                    >
                      {step.file.split('/').pop()}
                      <span style={{ opacity: 0.7 }}>:{step.line}</span>
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SubsystemComponentGraph(props: SubsystemComponentGraphProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Measure the container so React Flow always has a real, non-zero pixel size
  // (responsive to the parent; avoids the %→0 blank canvas).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ w: rect.width, h: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ReactFlowProvider>
          <Inner {...props} measured={size} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
