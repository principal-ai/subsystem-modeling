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
  // TEMP: measured size per card, to size squares against real content.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && typeof console !== 'undefined') {
      const r = el.getBoundingClientRect();
      const first = el.firstElementChild as HTMLElement | null;
      console.log(
        '[c4-size]', element.kind, element.id,
        'screen=', Math.round(r.width) + '×' + Math.round(r.height),
        'layout=', (el.offsetWidth || 0) + '×' + (el.offsetHeight || 0),
        'cardLayout=', (first?.offsetWidth || 0) + '×' + (first?.offsetHeight || 0),
      );
    }
  }, [element.id, element.kind, element.label, element.description]);
  return (
    <div ref={ref}>
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
    </div>
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
const edgeTypes = {
  'c4-edge': C4EdgeView,
};

/** Drill-down camera glide, in ms (see `afterLayout`). */
const FLIP_MS = 240;

function Inner({ model, onSelectNode, onOpenContainer, onCloseContainer, gutter = 28 }: C4GraphProps) {
  const { theme } = useTheme();
  const { fitView, getViewport } = useReactFlow();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const [nodes, setNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labelPositions, setLabelPositions] = useState<Map<string, { x: number; y: number }>>(
    () => new Map(),
  );

  const derivedGroups = useMemo(() => deriveC4Groups(model), [model]);

  /** Set by the layout effect; consumed by the `ready` effect to run the fit. */
  const pendingFitRef = useRef(false);

  // Fit the camera AFTER the new nodes are committed (when `ready` flips true),
  // so `fitView` measures the real geometry. Fit the SYSTEM frame explicitly:
  // on a drill-down the drawn nodes are just the opened container's contents,
  // so fitting them would zoom to the container, not the whole system.
  useEffect(() => {
    if (!ready || !pendingFitRef.current) return;
    pendingFitRef.current = false;
    if (typeof console !== 'undefined') console.log('[c4-fit] firing fitView, nodes=', model.nodes.length);
    fitView({ padding: 0.15, duration: FLIP_MS, maxZoom: 1, nodes: [{ id: model.system.id }] });
    if (typeof console !== 'undefined') {
      setTimeout(() => {
        const vp = getViewport?.();
        console.log('[c4-fit] viewport after fit', vp);
      }, FLIP_MS + 50);
    }
  }, [ready, model.system.id, fitView]);

  /** Called once the new layout is committed, from the layout effect. */
  const afterLayout = () => {
    // The camera fit runs from a `ready`-keyed effect (see below), after React
    // has committed the new nodes — fitting earlier measures stale geometry and
    // the camera just snaps.
    if (typeof console !== 'undefined') console.log('[c4-fit] afterLayout, queued');
    pendingFitRef.current = true;
  };

  const layoutKey = useMemo(
    () =>
      [
        ...model.nodes.map((n) => `${n.id}\0${n.parentId ?? ''}\0${n.label}`).sort(),
        ...derivedGroups.map((g) => `${g.id}\0${g.parentId ?? ''}\0${g.memberIds.length}`).sort(),
        ...model.edges.map((e) => `${e.id}\0${e.count}`).sort(),
        `open:${model.openContainerId ?? ''}`,
      ].join('\n'),
    [model, derivedGroups],
  );

  useEffect(() => {
    let alive = true;
    setReady(false);
    if (typeof console !== 'undefined') console.log('[c4-fit] layout effect, open=', model.openContainerId);
    setSelectedId(null);

    // Draw only the elements for this view. A container diagram shows the
    // runtime units (containers, externals, people); components belong to the
    // component view — or to a container that has been opened. Components are
    // always carried on the model (see the side panel), just not drawn here.
    const inView = (n: C4Element): boolean => {
      if (model.view === 'component') return n.kind !== 'container';
      if (n.kind === 'component') {
        // Show a component only when its container is the opened one.
        return (n.container ?? n.parentId) === model.openContainerId;
      }
      if (n.kind === 'container') {
        // An opened container is drawn as a frame, not a box — so it must not
        // also paint as a node, or the box sits inside its own frame.
        return n.id !== model.openContainerId;
      }
      return true;
    };

    // How many components each container groups — computed once here because
    // the card only receives its own element, not the model.
    const childComponentCount = new Map<string, number>();
    for (const n of model.nodes) {
      if (n.kind !== 'component') continue;
      const parent = n.container ?? n.parentId;
      if (parent) childComponentCount.set(parent, (childComponentCount.get(parent) ?? 0) + 1);
    }

    // Layout against the true card size, so ELK's ports sit on the card's
    // border — an inflated box leaves the line starting short of the card edge.
    // The `gutter` becomes ELK spacing instead (see `nodeSpacing` below).
    const rfNodes: Node[] = model.nodes.filter(inView).map((n, i) => {
      const size = nodeSize(n);
      return {
        id: n.id,
        type: 'c4-node',
        // Fallback grid pitch uses the container box — the largest, so the
        // pre-layout positions never overlap. ELK replaces them on success.
        position: { x: (i % 5) * (NODE_W + 44), y: Math.floor(i / 5) * (NODE_H + 44) },
        width: size.width,
        height: size.height,
        ...(n.parentId ? { parentId: n.parentId } : {}),
        data: {
          element: n,
          selected: false,
          componentCount: childComponentCount.get(n.id) ?? 0,
          // Only a container with components can be opened.
          ...(n.kind === 'container' && (childComponentCount.get(n.id) ?? 0) > 0 && onOpenContainer
            ? { onExpand: () => onOpenContainer?.(n.id) }
            : {}),
        },
      };
    });

    const groups = derivedGroups.map((g) => ({
      id: g.id,
      memberIds: g.memberIds,
      ...(g.parentId ? { parentId: g.parentId } : {}),
    }));

    // Band nodes so a flat layout still reads as C4 and frames can't interleave.
    //
    // Flat mode has no ELK parents, so without bands ELK mixes members of
    // different frames across the whole graph — their synthesized bounding
    // boxes then overlap. A partition per frame keeps each frame's members
    // contiguous; people lead, externals trail.
    //
    // Order (ascending = earlier in the layout direction): people, then each
    // frame in model order, then external systems.
    const frameIds = derivedGroups.map((g) => g.id);
    const frameIndex = new Map(frameIds.map((id, i) => [id, i]));
    const partitionByNode = new Map<string, number>(
      model.nodes.map((n) => {
        if (n.kind === 'person') return [n.id, 0];
        if (n.kind === 'external-system') return [n.id, frameIds.length + 1];
        // A node inside a frame shares its frame's band; a frame-less node
        // (a container at container view) gets its own by id order.
        const band = n.parentId ? (frameIndex.get(n.parentId) ?? 0) : (frameIndex.get(n.id) ?? 0);
        return [n.id, 1 + band];
      }),
    );

    // Only draw an edge whose BOTH endpoints are on screen. A hidden component
    // (a closed container's children) must not be an edge endpoint: ELK throws
    // on an edge to a node that isn't in the graph, and React Flow would draw a
    // line to nowhere.
    const drawnIds = new Set(rfNodes.map((n) => n.id));
    const rfEdges: Edge[] = model.edges
      .filter((e) => drawnIds.has(e.source) && drawnIds.has(e.target))
      .map((e) => {
        // Colour keys off the protocol, not the trail verb: on a container
        // diagram the transport is what a reader distinguishes at a glance.
        const color = protocolColor(e.protocol);
        return {
          id: e.id,
          type: 'c4-edge',
          source: e.source,
          target: e.target,
          // The reserved label box and the chip must agree on size, so ELK is
          // given the same text the chip draws (protocol first, then label). The
          // chip itself is the C4EdgeLabels overlay, not this field.
          label: e.protocol ?? e.label,
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
          data: { edge: e, color, path: '' },
        };
      });

    void computeElkLayout(rfNodes, rfEdges, {
      direction: 'RIGHT',
      preserveNodePositions: false,
      groups,
      keepSingletonGroups: true,
      edgeLabels: { enabled: true, placement: 'CENTER', width: C4_LABEL_WIDTH, measure: estimateEdgeLabelWidth },
      // The gutter that used to inflate each node box is now real spacing, so
      // the ports still sit on the card edge.
      nodeSpacing: gutter * 2,
      edgeNodeSpacing: gutter,
      // Between-layer/between-partition gap. This is what keeps the external
      // band clear of the system frame's padding — ELK gives partitions zero
      // default separation. It stacks on top of ELK's reserved label layer, so
      // it is kept modest.
      interLayerSpacing: 40,
      // Draw the system frame as a decoration around the boxes rather than an
      // ELK parent. Nesting made in-frame edges inherit the frame's padding and
      // spacing, so they ran longer than a root-level edge touching the same
      // nodes; flattening gives every edge one spacing.
      flatGroups: true,
      partitionByNode,
    })
      .then((result) => {
        if (!alive) return;
        const positioned = new Map(result.nodes.map((n) => [n.id, n]));
        // Draw each edge along ELK's routed polyline and place its label from
        // the same points — one geometry for the line and the chip.
        const labelPositions = new Map<string, { x: number; y: number }>();
        const withPaths = rfEdges.map((e) => {
          const pts = result.edgePathPoints?.get(e.id);
          if (!pts || pts.length === 0) return e;
          labelPositions.set(e.id, pointAlongPath(pts, 0.5));
          // Rounded corners on ELK's orthogonal route — gentler than raw right
          // angles, and still the exact polyline the label is placed on.
          return { ...e, data: { ...e.data, path: pointsToSmoothPath(pts, 12) } };
        });
        setLabelPositions(labelPositions);
        const builtGroups = new Set(result.groupBounds.keys());
        const groupById = new Map(derivedGroups.map((g) => [g.id, g]));

        const depthOf = (id: string): number => {
          let d = 0;
          let g = groupById.get(id);
          while (g?.parentId) {
            d += 1;
            g = groupById.get(g.parentId);
          }
          return d;
        };

        // Shell positions from flat synthesis are absolute. React Flow reads a
        // child's `position` as relative to its parent, so a shell nested in
        // another shell must be made relative to it.
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
            // A container frame borrows its container node's border colour, so a
            // frame and the box it wraps read as the same thing. Falls back to
            // the accent when no element matches (e.g. a hand-authored group id).
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
                // A container frame shows its technology mark, so the boundary
                // says what it is built with (matching the node's tech row).
                ...(def?.kind !== 'system' && element
                  ? { brand: technologyBrand('technology' in element ? element.technology : undefined) }
                  : {}),
                // An opened container frame can be collapsed by the host.
                ...(def?.kind === 'container' && model.openContainerId === id && onCloseContainer
                  ? { onCollapse: () => onCloseContainer?.() }
                  : {}),
              },
            };
          });

        const leaves = rfNodes.map((n) => {
          const p = positioned.get(n.id);
          // Absolute flow position from the flat layout.
          const abs = p ? p.position : n.position;
          // Re-parent to the shell this node sits in, if any: a component's
          // container, or a container's system frame. React Flow positions a
          // child relative to its parent, so subtract the shell origin.
          let parentId: string | undefined;
          if (n.data && typeof n.data === 'object') {
            const modelNode = (n.data as { element?: C4Element }).element;
            if (modelNode?.parentId && builtGroups.has(modelNode.parentId)) parentId = modelNode.parentId;
          }
          const origin = shellOrigin(parentId);
          const node = { ...n, position: { x: abs.x - origin.x, y: abs.y - origin.y } };
          return (parentId ? { ...node, parentId } : { ...node, parentId: undefined }) as Node;
        });

        setNodes([...shells, ...leaves]);
        setRfEdges(withPaths);
        setReady(true);
        afterLayout();
      })
      .catch((err) => {
        if (!alive) return;
        console.warn('[c4-graph] ELK layout failed, using grid:', err);
        // No shells in the fallback, so a `parentId` would point at a node that
        // isn't in the array — React Flow refuses to position it.
        setNodes(rfNodes.map((n) => ({ ...n, parentId: undefined })));
        setRfEdges(rfEdges);
        setReady(true);
        afterLayout();
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

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
