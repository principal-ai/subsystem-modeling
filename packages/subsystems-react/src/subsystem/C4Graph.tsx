/**
 * C4Graph — a C4 projection of a (composed) subsystem model on React Flow.
 *
 * Feed it an authored `C4Model` and it draws the
 * system as a compound frame, its containers (or components) as boxes, and
 * externals/actors outside the system. `trail` steps render as flow
 * edges. Click a box to list the source components it rolled up.
 *
 * Same interaction language as the other graphs: React Flow + ELK + the shared
 * `GRAPH_NAV_PROPS` chrome. Deliberately small — no measurement passes, no
 * drawers, no trail playback.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Edge,
  EdgeProps,
  Handle,
  MarkerType,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  ViewportPortal,
} from '@xyflow/react';
import { useTheme } from '@principal-ade/industry-theme';
import { Box, Minimize2 } from 'lucide-react';
import { computeElkLayout, pointAlongPath, pointsToSmoothPath } from '../utils/elkLayout';
import { EDGE_LABEL_FONT_SIZE, EDGE_LABEL_HEIGHT, C4_LABEL_WIDTH, estimateEdgeLabelWidth } from '../utils/edgeLabel';
import { deriveC4Groups, protocolColor } from './c4';
import { C4NodeCard, NODE_H, NODE_W, nodeSize, nodeStyle } from './C4NodeCard';
import { TechMark, technologyBrand } from './techIcons';
import type { TechBrand } from './techIcons';
import { GRAPH_CANVAS_CLASS, GRAPH_NAV_PROPS, GraphChrome, GraphLayerStyle } from './graphChrome';
import type { C4Element, C4Model } from './c4';

export interface C4GraphProps {
  model: C4Model;
  onSelectNode?: (id: string | null) => void;
  /**
   * Drill-down. Called from the expand affordance on a container card; the host
   * sets `openContainerId` on the model to swap the box for a frame with its
   * components inside.
   */
  onOpenContainer?: (id: string) => void;
  /** Called from the collapse affordance inside an opened container frame. */
  onCloseContainer?: () => void;
  /**
   * Breathing room around each card, in flow px, applied as ELK spacing (not by
   * inflating the node box — that left the edge lines starting short of the
   * card border). `nodeSpacing` is `2 × gutter`; `edgeNodeSpacing` is `gutter`.
   * @default 28
   */
  gutter?: number;
}

function C4NodeView(
  props: NodeProps<
    Node<{ element: C4Element; selected: boolean; componentCount?: number; onExpand?: () => void }>
  >,
) {
  const { element, selected, componentCount, onExpand } = props.data;
  return (
    <C4NodeCard
      node={element}
      selected={selected}
      componentCount={componentCount ?? 0}
      onExpand={onExpand}
      handles={
        <>
          <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
          <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
        </>
      }
    />
  );
}

/**
 * Edge-label overlay.
 *
 * Drawn as chips in flow space via `<ViewportPortal>` — React Flow applies the
 * viewport transform, so the label chip needs no manual zoom/pan math and can
 * never drift from the edges it sits on. Positions are ELK's computed label
 * anchors (`edgeLabelPositions`), in flow coordinates.
 */
function C4EdgeLabels({
  positions,
  edges,
}: {
  positions: Map<string, { x: number; y: number }>;
  edges: C4Model['edges'];
}) {
  const { theme } = useTheme();
  const viewport = useViewport();
  const surface = theme.colors.backgroundSecondary ?? theme.colors.background;
  const byId = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {[...positions].map(([id, p]) => {
        const edge = byId.get(id);
        if (!edge) return null;
        const color = protocolColor(edge.protocol);
        const text = edge.protocol ?? edge.label;
        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: p.x * viewport.zoom + viewport.x,
              top: p.y * viewport.zoom + viewport.y,
              transform: `translate(-50%, -50%) scale(${viewport.zoom})`,
              transformOrigin: 'center center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: estimateEdgeLabelWidth(text),
              height: EDGE_LABEL_HEIGHT,
              boxSizing: 'border-box',
              padding: '7px 8px',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 4,
                border: `0.5px solid ${color}`,
                background: surface,
              }}
            />
            <span
              style={{
                position: 'relative',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: EDGE_LABEL_FONT_SIZE,
                lineHeight: 1,
                fontFamily: theme.fonts.monospace,
                fontWeight: 500,
                color,
              }}
            >
              {text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * C4 edge — draws ELK's routed polyline, not React Flow's default bezier.
 *
 * The line and the label chip must share one geometry: the chip is placed from
 * the same `elkPathPoints` this renders. React Flow's built-in edge would curve
 * between handles while the chip sat on ELK's orthogonal route, which is why
 * labels read as "off the line".
 */
function C4EdgeView({ data, markerEnd }: EdgeProps<Edge<{ path?: string; color?: string }>>) {
  const path = data?.path ?? '';
  if (!path) return null;
  return (
    <path
      d={path}
      fill="none"
      stroke={data?.color}
      strokeWidth={1}
      strokeDasharray="6 4"
      markerEnd={markerEnd}
      style={{ pointerEvents: 'none' }}
    />
  );
}

function C4GroupView(
  props: NodeProps<
    Node<{
      label: string;
      kind: 'system' | 'container';
      color: string;
      onCollapse?: () => void;
      brand?: TechBrand;
    }>
  >,
) {
  const { theme } = useTheme();
  const color = props.data.color;
  const isSystem = props.data.kind === 'system';
  const onCollapse = props.data.onCollapse;
  const brand = props.data.brand;
  // A container frame shows its technology mark (React/Bun/Node…) so the
  // boundary says what it is built with, same as the node it wraps. The system
  // frame has no single technology, so it keeps a neutral `Box`.
  const FrameIcon = isSystem || !brand ? Box : undefined;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        borderRadius: 12,
        border: `2px dashed ${color}`,
        background: 'transparent',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          transform: 'translateY(-50%)',
          left: 12,
          zIndex: 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[2],
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          lineHeight: '18px',
          color,
          background: theme.colors.background,
          boxShadow: `0 0 0 1.5px ${theme.colors.background}`,
          border: `2px solid ${color}`,
          borderRadius: 4,
          padding: '4px 10px',
          boxSizing: 'border-box',
          whiteSpace: 'nowrap',
        }}
      >
        {FrameIcon ? (
          <FrameIcon size={13} strokeWidth={2.25} aria-hidden />
        ) : brand ? (
          <TechMark brand={brand} size={14} />
        ) : null}
        {props.data.label}
        {onCollapse && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCollapse();
            }}
            aria-label="Collapse"
            style={{
              pointerEvents: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
              marginLeft: 2,
              padding: 0,
              border: 'none',
              background: 'transparent',
              color,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            <Minimize2 size={12} strokeWidth={2.5} />
          </button>
        )}
      </span>
    </div>
  );
}

const nodeTypes = {
  'c4-node': C4NodeView,
  'c4-group': C4GroupView,
};

/**
 * Box→frame morph for the drill-down. Rendered inside the React Flow viewport
 * (flow coordinates), so it tracks the graph as the camera also glides: a
 * translucent rectangle grows from the container's box rect to its frame rect.
 * Flow space — not screen space — because the camera moves during the swap.
 */
function C4MorphOverlay({ morph, onDone }: { morph: MorphState; onDone: () => void }) {
  const [at, setAt] = useState(morph.from);
  useEffect(() => {
    setAt(morph.from);
    const raf = requestAnimationFrame(() => setAt(morph.to));
    return () => cancelAnimationFrame(raf);
  }, [morph.from, morph.to]);
  return (
    <ViewportPortal>
      <div
        aria-hidden
        onTransitionEnd={onDone}
        style={{
          position: 'absolute',
          left: at.x,
          top: at.y,
          width: at.width,
          height: at.height,
          zIndex: 0,
          pointerEvents: 'none',
          boxSizing: 'border-box',
          borderRadius: 8,
          border: `2px solid ${morph.color}`,
          background: morph.color,
          opacity: 0.16,
          transition: `left ${MORPH_MS}ms ease-out, top ${MORPH_MS}ms ease-out, width ${MORPH_MS}ms ease-out, height ${MORPH_MS}ms ease-out`,
        }}
      />
    </ViewportPortal>
  );
}
const edgeTypes = {
  'c4-edge': C4EdgeView,
};

/** Drill-down animation durations, in ms. */
const MORPH_MS = 420;
const CAMERA_MS = 520;

/** A fully laid-out open state: the RF nodes/edges and label anchors. */
interface Rendered {
  nodes: Node[];
  edges: Edge[];
  labelPositions: Map<string, { x: number; y: number }>;
  groupBounds: Map<string, { x: number; y: number; width: number; height: number }>;
}

/** Flow-space rect of a box node or a frame, for the drill-down morph. */
interface FlowRect { x: number; y: number; width: number; height: number }

/** A transient morph overlay: the container's flow rect from → to. */
interface MorphState { id: string; from: FlowRect; to: FlowRect; color: string }

/** The container's rect in a laid-out state: its box node, or its frame bounds. */
function containerRect(layout: Rendered | undefined, id: string): FlowRect | null {
  if (!layout) return null;
  const frame = layout.groupBounds.get(id);
  if (frame) return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  const node = layout.nodes.find((n) => n.id === id);
  if (!node) return null;
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? 0,
    height: node.height ?? 0,
  };
}

function Inner({ model, onSelectNode, onOpenContainer, onCloseContainer, gutter = 28 }: C4GraphProps) {
  const { theme } = useTheme();
  const { fitView } = useReactFlow();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const [nodes, setNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labelPositions, setLabelPositions] = useState<Map<string, { x: number; y: number }>>(
    () => new Map(),
  );

  /** Set by the layout effect; consumed by the `ready` effect to run the fit. */
  const pendingFitRef = useRef(false);
  /** Prefetched layouts, keyed by open-container id ('' = closed). */
  const layoutCache = useRef(new Map<string, Rendered>());
  /** The open id rendered last, so a change can morph between the two layouts. */
  const prevOpenRef = useRef<string | null>(null);
  /** A transient box→frame morph overlay, in flow space (see `C4MorphOverlay`). */
  const [morph, setMorph] = useState<MorphState | null>(null);

  // Fit the camera AFTER the new nodes are committed (when `ready` flips true),
  // so `fitView` measures the real geometry. Fit the SYSTEM frame explicitly:
  // on a drill-down the drawn nodes are just the opened container's contents,
  // so fitting them would zoom to the container, not the whole system.
  useEffect(() => {
    if (!ready || !pendingFitRef.current) return;
    pendingFitRef.current = false;
    fitView({ padding: 0.15, duration: CAMERA_MS, maxZoom: 1, nodes: [{ id: model.system.id }] });
  }, [ready, model.system.id, fitView]);

  /** Called once the new layout is committed, from the layout effect. */
  const afterLayout = () => {
    pendingFitRef.current = true;
  };

  const layoutKey = useMemo(
    () =>
      [
        ...model.nodes.map((n) => `${n.id}\0${n.parentId ?? ''}\0${n.label}`).sort(),
        ...model.edges.map((e) => `${e.id}\0${e.count}`).sort(),
        `open:${model.openContainerId ?? ''}`,
      ].join('\n'),
    [model],
  );

  /**
   * Build the React Flow inputs for a given open state — everything ELK needs,
   * independent of whether a layout has been run yet. Pure over `openId`, so it
   * serves both the rendered state and the background prefetch.
   */
  const buildInputs = (openId: string | null) => {
    // Draw only the elements for this view. A container diagram shows the
    // runtime units (containers, externals, people); components belong to the
    // component view — or to a container that has been opened.
    const inView = (n: C4Element): boolean => {
      if (model.view === 'component') return n.kind !== 'container';
      if (n.kind === 'component') return (n.container ?? n.parentId) === openId;
      if (n.kind === 'container') return n.id !== openId;
      return true;
    };

    const childComponentCount = new Map<string, number>();
    for (const n of model.nodes) {
      if (n.kind !== 'component') continue;
      const parent = n.container ?? n.parentId;
      if (parent) childComponentCount.set(parent, (childComponentCount.get(parent) ?? 0) + 1);
    }

    const rfNodes: Node[] = model.nodes.filter(inView).map((n, i) => {
      const size = nodeSize(n);
      return {
        id: n.id,
        type: 'c4-node',
        position: { x: (i % 5) * (NODE_W + 44), y: Math.floor(i / 5) * (NODE_H + 44) },
        width: size.width,
        height: size.height,
        ...(n.parentId ? { parentId: n.parentId } : {}),
        data: {
          element: n,
          selected: false,
          componentCount: childComponentCount.get(n.id) ?? 0,
          ...(n.kind === 'container' && (childComponentCount.get(n.id) ?? 0) > 0 && onOpenContainer
            ? { onExpand: () => onOpenContainer?.(n.id) }
            : {}),
        },
      };
    });

    const groupsForOpen = deriveC4Groups({ ...model, openContainerId: openId });
    const groups = groupsForOpen.map((g) => ({
      id: g.id,
      memberIds: g.memberIds,
      ...(g.parentId ? { parentId: g.parentId } : {}),
    }));

    const frameIds = groupsForOpen.map((g) => g.id);
    const frameIndex = new Map(frameIds.map((id, i) => [id, i]));
    const partitionByNode = new Map<string, number>(
      model.nodes.map((n) => {
        if (n.kind === 'person') return [n.id, 0];
        if (n.kind === 'external-system') return [n.id, frameIds.length + 1];
        const band = n.parentId ? (frameIndex.get(n.parentId) ?? 0) : (frameIndex.get(n.id) ?? 0);
        return [n.id, 1 + band];
      }),
    );

    const drawnIds = new Set(rfNodes.map((n) => n.id));
    const rfEdges: Edge[] = model.edges
      .filter((e) => drawnIds.has(e.source) && drawnIds.has(e.target))
      .map((e) => {
        const color = protocolColor(e.protocol);
        return {
          id: e.id,
          type: 'c4-edge',
          source: e.source,
          target: e.target,
          label: e.protocol ?? e.label,
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
          data: { edge: e, color, path: '' },
        };
      });

    return { rfNodes, rfEdges, groups, partitionByNode, groupsForOpen };
  };

  /**
   * Run ELK for one open state and turn the result into React Flow nodes /
   * edges. The heavy step the prefetch caches.
   */
  const layoutFor = async (
    openId: string | null,
    inputs: ReturnType<typeof buildInputs>,
  ): Promise<Rendered> => {
    const { rfNodes, rfEdges, groups, partitionByNode, groupsForOpen } = inputs;
    const result = await computeElkLayout(rfNodes, rfEdges, {
      direction: 'RIGHT',
      preserveNodePositions: false,
      groups,
      keepSingletonGroups: true,
      edgeLabels: { enabled: true, placement: 'CENTER', width: C4_LABEL_WIDTH, measure: estimateEdgeLabelWidth },
      nodeSpacing: gutter * 2,
      edgeNodeSpacing: gutter,
      interLayerSpacing: 40,
      flatGroups: true,
      partitionByNode,
    });

    const positioned = new Map(result.nodes.map((n) => [n.id, n]));
    const labelPositions = new Map<string, { x: number; y: number }>();
    const withPaths = rfEdges.map((e) => {
      const pts = result.edgePathPoints?.get(e.id);
      if (!pts || pts.length === 0) return e;
      labelPositions.set(e.id, pointAlongPath(pts, 0.5));
      return { ...e, data: { ...e.data, path: pointsToSmoothPath(pts, 12) } };
    });

    const builtGroups = new Set(result.groupBounds.keys());
    const groupById = new Map(groupsForOpen.map((g) => [g.id, g]));
    const depthOf = (id: string): number => {
      let d = 0;
      let g = groupById.get(id);
      while (g?.parentId) {
        d += 1;
        g = groupById.get(g.parentId);
      }
      return d;
    };

    const shellAbs = new Map(result.groupBounds);
    const shellOrigin = (id: string | undefined): { x: number; y: number } => {
      if (!id) return { x: 0, y: 0 };
      const b = shellAbs.get(id);
      return b ? { x: b.x, y: b.y } : { x: 0, y: 0 };
    };

    const shells: Node[] = [...result.groupBounds.entries()]
      .sort((a, b) => depthOf(a[0]) - depthOf(b[0]))
      .map(([id, b]) => {
        const def = groupById.get(id);
        const parentId = def?.parentId && builtGroups.has(def.parentId) ? def.parentId : undefined;
        const origin = shellOrigin(parentId);
        const element = model.nodes.find((n) => n.id === id);
        const frameColor =
          def?.kind === 'system'
            ? (theme.colors.text ?? '#888')
            : element
              ? nodeStyle(element, theme).color
              : (theme.colors.accent ?? theme.colors.info);
        return {
          id,
          type: 'c4-group',
          position: { x: b.x - origin.x, y: b.y - origin.y },
          width: Math.max(200, b.width),
          height: Math.max(120, b.height),
          draggable: false,
          selectable: false,
          ...(parentId ? { parentId } : {}),
          data: {
            label: def?.label ?? id,
            kind: def?.kind ?? 'container',
            color: frameColor,
            ...(def?.kind !== 'system' && element
              ? { brand: technologyBrand('technology' in element ? element.technology : undefined) }
              : {}),
            ...(def?.kind === 'container' && openId === id && onCloseContainer
              ? { onCollapse: () => onCloseContainer?.() }
              : {}),
          },
        };
      });

    const leaves = rfNodes.map((n) => {
      const p = positioned.get(n.id);
      const abs = p ? p.position : n.position;
      let parentId: string | undefined;
      if (n.data && typeof n.data === 'object') {
        const modelNode = (n.data as { element?: C4Element }).element;
        if (modelNode?.parentId && builtGroups.has(modelNode.parentId)) parentId = modelNode.parentId;
      }
      const origin = shellOrigin(parentId);
      const node = { ...n, position: { x: abs.x - origin.x, y: abs.y - origin.y } };
      return (parentId ? { ...node, parentId } : { ...node, parentId: undefined }) as Node;
    });

    return { nodes: [...shells, ...leaves], edges: withPaths, labelPositions, groupBounds: result.groupBounds };
  };

  const renderLayout = (r: Rendered) => {
    setNodes(injectGrow(r.nodes, morphSpan));
    setRfEdges(r.edges);
    setLabelPositions(r.labelPositions);
    setReady(true);
    afterLayout();
  };

  // Render the current open state. Uses the prefetched layout when present
  // (instant swap), else computes it now.
  useEffect(() => {
    let alive = true;
    setReady(false);
    setSelectedId(null);
    const openId = model.openContainerId ?? null;
    const prevOpen = prevOpenRef.current;
    const inputs = buildInputs(openId);

    /** If the open state changed, arm the box↔frame morph from the two layouts. */
    const armMorph = (next: Rendered) => {
      if (prevOpen === openId) return;
      const id = openId ?? prevOpen;
      const el = id ? model.nodes.find((n) => n.id === id) : undefined;
      if (!id || !el) return;
      const fromLayout = prevOpen === null ? layoutCache.current.get('') : layoutCache.current.get(prevOpen);
      const from = containerRect(fromLayout, id);
      const to = containerRect(next, id);
      if (from && to) {
        setMorph({ id, from, to, color: nodeStyle(el, theme).color });
      }
    };

    const cached = layoutCache.current.get(openId ?? '');
    if (cached) {
      armMorph(cached);
      prevOpenRef.current = openId;
      renderLayout(cached);
      return () => {
        alive = false;
      };
    }
    void layoutFor(openId, inputs)
      .then((r) => {
        if (!alive) return;
        layoutCache.current.set(openId ?? '', r);
        armMorph(r);
        prevOpenRef.current = openId;
        renderLayout(r);
      })
      .catch((err) => {
        if (!alive) return;
        console.warn('[c4-graph] ELK layout failed, using grid:', err);
        setNodes(inputs.rfNodes.map((n) => ({ ...n, parentId: undefined })));
        setRfEdges(inputs.rfEdges);
        setReady(true);
        afterLayout();
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // After the first paint, prefetch the opened layout for every container, so a
  // click swaps to a cached result instead of waiting on ELK.
  useEffect(() => {
    if (model.view !== 'container') return;
    let alive = true;
    const containers = model.nodes.filter(
      (n) => n.kind === 'container' && model.nodes.some((c) => c.kind === 'component' && (c.container ?? c.parentId) === n.id),
    );
    void (async () => {
      for (const c of containers) {
        if (!alive) return;
        if (layoutCache.current.has(c.id)) continue;
        try {
          const inputs = buildInputs(c.id);
          const r = await layoutFor(c.id, inputs);
          if (!alive) return;
          layoutCache.current.set(c.id, r);
        } catch {
          // Prefetch is best-effort; a miss just falls back to compute-on-click.
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, model.view]);

  const selected = useMemo(
    () => model.nodes.find((n) => n.id === selectedId) ?? null,
    [model, selectedId],
  );

  /**
   * The components authored inside the selected element, if it is a container.
   * These are `C4Component`s whose `container` names the selected id (or, once
   * flattened, whose `parentId` does). Shown in the panel so a container can be
   * inspected without zooming the diagram into its components.
   */
  const selectedComponents = useMemo(
    () =>
      selected
        ? model.nodes.filter(
            (n) =>
              n.kind === 'component' &&
              (n.container === selected.id || n.parentId === selected.id),
          )
        : [],
    [model, selected],
  );

  const displayNodes = useMemo(
    () =>
      nodes.map((n) =>
        n.type === 'c4-node'
          ? { ...n, data: { ...n.data, selected: n.id === selectedId } }
          : n,
      ),
    [nodes, selectedId],
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: theme.colors.background }}>
      <GraphLayerStyle />
      <ReactFlow
        nodes={displayNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        className={GRAPH_CANVAS_CLASS}
        {...GRAPH_NAV_PROPS}
        onNodeClick={(_e, node) => {
          if (node.type !== 'c4-node') return;
          const next = node.id === selectedId ? null : node.id;
          setSelectedId(next);
          onSelectNode?.(next);
        }}
        onPaneClick={() => {
          setSelectedId(null);
          onSelectNode?.(null);
        }}
        proOptions={{ hideAttribution: true }}
        // Pin the flow to its container. The label overlay is a sibling sized
        // `inset: 0`, so the two must share an origin or `viewport.y` (measured
        // in the flow's own box) lands the chips off vertically.
        style={{ width: '100%', height: '100%' }}
      >
        <GraphChrome />
        {morph && <C4MorphOverlay morph={morph} onDone={() => setMorph(null)} />}
      </ReactFlow>
      {ready && labelPositions.size > 0 && (
        <C4EdgeLabels positions={labelPositions} edges={model.edges} />
      )}
      {!ready && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: theme.colors.background,
            color: muted,
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
          }}
        >
          Laying out C4 view…
        </div>
      )}
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            // Above the edge-label overlay (zIndex 5), or chips paint over the
            // panel.
            zIndex: 10,
            width: 280,
            maxHeight: 'calc(100% - 24px)',
            overflowY: 'auto',
            background: theme.colors.backgroundSecondary ?? theme.colors.background,
            border: `1px solid ${theme.colors.border ?? '#333'}`,
            borderRadius: 8,
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: theme.fonts.monospace, fontWeight: 600, color: theme.colors.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.label}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                onSelectNode?.(null);
              }}
              aria-label="Clear selection"
              style={{ border: 'none', background: 'transparent', color: muted, cursor: 'pointer', fontSize: theme.fontSizes[2], lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          {/* The sub-line carries the technology — the fact worth reading at a
              glance. Counts are omitted: the list below is already the count,
              and kind/state are on the box itself. A person has no technology,
              so its sub-line is blank. */}
          {selected.kind !== 'person' &&
            (() => {
              const technology = (selected as { technology?: string }).technology;
              return (
                <div
                  style={{
                    fontFamily: theme.fonts.monospace,
                    fontSize: theme.fontSizes[0],
                    color: technology ? muted : (theme.colors.warning ?? '#e8a33a'),
                    margin: '4px 0 8px',
                  }}
                >
                  {technology ?? 'technology: not stated'}
                </div>
              );
            })()}

          {/* The container's own description already shows on the card, so the
              panel only adds what the card omits: the claimed process. */}
          {selected.kind === 'container' && selected.process && (
            <div
              style={{
                fontFamily: theme.fonts.monospace,
                fontSize: theme.fontSizes[0],
                color: muted,
                borderTop: `1px solid ${theme.colors.border ?? '#333'}`,
                paddingTop: 6,
                marginBottom: 8,
                whiteSpace: 'normal',
                lineHeight: 1.4,
              }}
            >
              verifies process: {selected.process}
            </div>
          )}

          {/* Components authored inside this container, listed so the container
              can be inspected without zooming the diagram into them. Inert for
              now — the drill-down hung off them comes later. */}
          {selected.kind === 'container' && selectedComponents.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                borderTop: `1px solid ${theme.colors.border ?? '#333'}`,
                paddingTop: 8,
              }}
            >
              <span
                style={{
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[0],
                  color: muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Components
              </span>
              {selectedComponents.map((c) => (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span
                    title={c.description ?? c.label}
                    style={{
                      fontFamily: theme.fonts.body,
                      color: theme.colors.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.label}
                  </span>
                  <span
                    style={{
                      fontFamily: theme.fonts.monospace,
                      fontSize: theme.fontSizes[0],
                      color: muted,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {'technology' in c && c.technology ? c.technology : c.kind}
                    {(c.members ?? []).length > 0 ? ` · ${(c.members ?? []).length} member${(c.members ?? []).length === 1 ? '' : 's'}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* No components authored: fall back to the raw member aliases, or
              say so plainly when there is nothing inside at all. Same divider +
              header as the authored list, so the panel sections consistently. */}
          {selected.kind === 'container' && selectedComponents.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                borderTop: `1px solid ${theme.colors.border ?? '#333'}`,
                paddingTop: 8,
              }}
            >
              <span
                style={{
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[0],
                  color: muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Components
              </span>
              {(selected.members ?? []).length > 0 ? (
                (selected.members ?? []).map((alias) => (
                  <span
                    key={alias}
                    title={alias}
                    style={{
                      fontFamily: theme.fonts.monospace,
                      fontSize: theme.fontSizes[0],
                      color: theme.colors.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {alias}
                  </span>
                ))
              ) : (
                <span
                  style={{
                    fontFamily: theme.fonts.monospace,
                    fontSize: theme.fontSizes[0],
                    color: muted,
                  }}
                >
                  No components
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function C4Graph(props: C4GraphProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
