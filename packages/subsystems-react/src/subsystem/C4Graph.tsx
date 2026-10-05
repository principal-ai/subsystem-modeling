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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { absoluteBoundsOf, computeElkLayout, flowPositionOf, pointAlongPath, pointsToSmoothPath } from '../utils/elkLayout';
import type { CompoundGroupDef, ElkLayoutResult } from '../utils/elkLayout';
import { EDGE_LABEL_FONT_SIZE, EDGE_LABEL_HEIGHT, C4_LABEL_WIDTH, estimateEdgeLabelWidth } from '../utils/edgeLabel';
import { deriveC4Groups, protocolColor, type C4Group } from './c4';
import {
  C4NodeCard,
  NODE_H,
  NODE_W,
  OPEN_FOOTER_PAD,
  OPEN_HEADER_PAD,
  OPEN_SIDE_PAD,
  nodeSize,
  nodeStyle,
} from './C4NodeCard';
import { TechMark, technologyBrand } from './techIcons';
import type { TechBrand } from './techIcons';
import { GRAPH_CANVAS_CLASS, GRAPH_NAV_PROPS, GraphChrome, GraphLayerStyle } from './graphChrome';
import type { C4Element, C4Model } from './c4';
import { openContainerSet, openStateKey } from './c4';

export interface C4GraphProps {
  model: C4Model;
  onSelectNode?: (id: string | null) => void;
  /**
   * Drill-down: add `id` to `model.openContainerIds`, or remove it if it is
   * already open. One verb for both directions, because with several containers
   * open at once "close" is ambiguous — the affordance on an open card has to
   * close *that* card without disturbing the others.
   *
   * This is the verb to use. The two below remain for callers written against
   * the single-container drill-down, and are only consulted when this is absent.
   */
  onToggleContainer?: (id: string) => void;
  /**
   * Drill-down. Called from the expand affordance on a *closed* container card;
   * the host adds `id` to `model.openContainerIds` to swap the box for a grown
   * card with its components inside.
   *
   * @deprecated Prefer {@link C4GraphProps.onToggleContainer}, which also covers
   * the open case.
   */
  onOpenContainer?: (id: string) => void;
  /**
   * Called from the collapse affordance on an opened container card. Closes
   * everything when several containers are open, because it carries no id.
   *
   * @deprecated Prefer {@link C4GraphProps.onToggleContainer}, which closes one.
   */
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
    Node<{
      element: C4Element;
      selected: boolean;
      componentCount?: number;
      onExpand?: () => void;
      /** This container is the open one: ELK sized the box to hold its components. */
      open?: boolean;
      /**
       * False while the drill-down grow/shrink is in flight. The description is
       * hidden for the whole animation and only returns once the box settles.
       */
      settled?: boolean;
      /** FLIP: absolute flow rects — where this card was, and where it now is. */
      growFrom?: FlowRect;
      frameRect?: FlowRect;
    }>
  >,
) {
  const { element, selected, componentCount, onExpand, open, settled, growFrom, frameRect } =
    props.data;
  const grown = open === true;

  // Position-only FLIP. The card resizes through its own `width`/`height`
  // transition, so scaling here would distort the text and fight that transition.
  // A card that only changed *size* has nothing to slide — no transform and no
  // transition, so its resize is the card's own and nothing competes with it.
  const { flipping, placed, dx, dy } = useFlip(growFrom, frameRect);
  const sliding = flipping && (dx !== 0 || dy !== 0);
  // The card takes its box from the React Flow node rather than from its own
  // `nodeSize`, so on the opened container ELK's fitted size drives it — and
  // because the element persists across the swap, the card's own width/height
  // transition *is* the grow. No FLIP needed, and no text distortion.
  //
  // While grown it is taken out of flow: the node box already carries the layout
  // (and is what sibling containers and edges are positioned against), so the
  // card must not compete with it.
  return (
    <div
      style={{
        ...(grown
          ? { position: 'absolute', top: 0, left: 0, width: props.width, height: props.height }
          : {}),
        // Position only — the card's own transition owns the size, so these two
        // compose without either fighting the other.
        transformOrigin: 'top left',
        transform: sliding && !placed ? `translate(${dx}px, ${dy}px)` : 'none',
        transition: sliding && placed ? `transform ${MORPH_MS}ms ease-out` : 'none',
      }}
    >
      <C4NodeCard
        node={element}
        selected={selected}
        componentCount={componentCount ?? 0}
        onExpand={onExpand}
        width={props.width}
        height={props.height}
        showDescription={showDescriptionFor(open, settled)}
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
      /** FLIP: absolute flow rects — where to grow from, and the frame's own. */
      growFrom?: FlowRect;
      frameRect?: FlowRect;
    }>
  >,
) {
  const { theme } = useTheme();
  const color = props.data.color;
  const isSystem = props.data.kind === 'system';
  const onCollapse = props.data.onCollapse;
  const brand = props.data.brand;
  const { growFrom, frameRect } = props.data;

  // Position-only FLIP, same as the cards. The frame resizes through its own
  // width/height transition below, so scaling here would fight it *and* distort
  // what it draws: a scaled dashed border changes weight as it grows, and the
  // label chip's border and text scale with it.
  const { flipping, placed, dx, dy } = useFlip(growFrom, frameRect);
  const sliding = flipping && (dx !== 0 || dy !== 0);

  // A container frame shows its technology mark (React/Bun/Node…) so the
  // boundary says what it is built with, same as the node it wraps. The system
  // frame has no single technology, so it keeps a neutral `Box`.
  const FrameIcon = isSystem || !brand ? Box : undefined;
  return (
    <div
      style={{
        // ELK's own fitted size, as numbers — the same trick the cards use. At
        // `100%` this element inherits the React Flow node box, which snaps to
        // each new layout, and only a scale could disguise that. Transitioning the
        // numbers grows and shrinks the boundary for real, in both directions, and
        // keeps the dashed border a constant weight throughout.
        width: props.width ?? '100%',
        height: props.height ?? '100%',
        // Size is always transitioned; the transform only while sliding, and
        // `transform: none` needs no transition.
        transition: [
          'width 420ms ease-out',
          'height 420ms ease-out',
          ...(sliding && placed ? [`transform ${MORPH_MS}ms ease-out`] : []),
        ].join(', '),
        boxSizing: 'border-box',
        borderRadius: 12,
        border: `2px dashed ${color}`,
        background: 'transparent',
        pointerEvents: 'none',
        transformOrigin: 'top left',
        transform: sliding && !placed ? `translate(${dx}px, ${dy}px)` : 'none',
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

/** Drill-down animation durations, in ms. */
const MORPH_MS = 420;
const CAMERA_MS = 520;
/**
 * When to re-frame the camera after a drill-down: the morph, plus a beat.
 *
 * The extra 60ms is not padding for looks. `fitView` reads the system frame's
 * *measured* size, and that frame's own height transition runs on the same
 * MORPH_MS clock — so asking on the same tick reads it mid-flight and fits to a
 * height that never existed. The beat is for React Flow's resize observer to
 * report the final geometry.
 */
const CAMERA_AFTER_MORPH_MS = MORPH_MS + 60;

/** A fully laid-out open state: the RF nodes/edges and label anchors. */
interface Rendered {
  nodes: Node[];
  edges: Edge[];
  labelPositions: Map<string, { x: number; y: number }>;
  groupBounds: Map<string, { x: number; y: number; width: number; height: number }>;
}

/** Flow-space rect of a box node or a frame, for the drill-down morph. */
interface FlowRect { x: number; y: number; width: number; height: number }

/** A frame's growth for the drill-down morph: its flow rect before → after. */
interface FrameGrow { from: FlowRect; to: FlowRect }

/**
 * Whether committing a layout should also move the camera.
 *
 * A morph — a commit that has rects to FLIP from — must not. Every element
 * already on screen is sliding from the rect the reader last saw it at, and that
 * anchoring *is* the morph; a viewport move on top of it makes each card's
 * on-screen path the sum of two independent animations, so nothing lands where
 * the FLIP said it would. `CAMERA_MS` also outlasts `MORPH_MS`, so the camera
 * would still be drifting for 100ms after the cards had settled — which is what
 * reads as the cards "still moving".
 *
 * A commit with no `grows` is a genuine change: the first paint, a new system, a
 * different element set, or the grid fallback after an ELK failure. There is no
 * continuity to preserve there and the content may genuinely not be on screen, so
 * fit.
 *
 * An *empty* map fits for the same reason — no element is anchoring, so there is
 * nothing a camera move could contradict. Testing the size rather than the
 * identity keeps that total over the whole input domain instead of leaning on a
 * caller convention (`growsFor` happens to hand back `null` rather than an empty
 * map, but nothing forces it to).
 *
 * @param grows the rects to animate from, exactly as `injectGrow` received them.
 */
export function shouldRefitCamera(grows: Map<string, FrameGrow> | null): boolean {
  return !grows || grows.size === 0;
}

/**
 * Whether a card shows its description line.
 *
 * Off for the whole morph: the card is resizing under it, so the line would slide
 * across a moving box.
 *
 * And off for good once the container is grown, which is the half that is easy to
 * get wrong. `settled` alone is not enough — the line comes back the moment the
 * grow finishes, straight into the space the components now occupy. ELK reserves
 * header chrome only (`padTop`), never a description, so the returning line does
 * not push the internals down; it lands on top of the first component.
 */
export function showDescriptionFor(open: boolean | undefined, settled: boolean | undefined): boolean {
  return settled === true && open !== true;
}

/**
 * `groupBounds` with every entry in absolute flow coordinates.
 *
 * `result.groupBounds` is absolute for a root-level group and *parent-relative*
 * for a nested one — two spaces in one map, which is the same trap as
 * `result.nodes`. The opened container is nested (inside the system frame), and
 * `containerRect` reads this map before the node box, so an unrebased entry would
 * be handed to the morph offset by the frame's origin: the container would glide
 * to a place it was never drawn.
 */
export function rebaseGroupBoundsAbsolute(
  result: Pick<ElkLayoutResult, 'absoluteRects' | 'groupBounds'>,
): Map<string, { x: number; y: number; width: number; height: number }> {
  const rebased = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const [id, b] of result.groupBounds) {
    // A flat frame has no node of its own, so `absoluteRects` has no entry and
    // `absoluteBoundsOf` falls back to the entry — already absolute, since it was
    // synthesized from absolute member bounds.
    const abs = absoluteBoundsOf(result, id) ?? b;
    rebased.set(id, { ...b, x: abs.x, y: abs.y });
  }
  return rebased;
}

/**
 * The compound groups one open state hands to ELK: the frames it draws, and the
 * group defs that make ELK lay them out.
 *
 * Exported because the nesting here is the load-bearing part and it is invisible
 * from the rendered output. The opened container sits *inside* the system frame, so
 * the frame is the origin its contents are laid out from — as a sibling, or as a
 * flat union, the frame has no stable corner and the whole boundary slides as
 * ELK re-places its members.
 *
 * Each opened container becomes its own ELK parent, so any number of them can be
 * open at once. They are emitted in sorted order (the order `openContainerSet`
 * gives) purely so the group list — and therefore the layout — is deterministic
 * for a given set.
 */
export function c4GroupDefs(
  model: C4Model,
  openIds?: readonly string[],
): { frames: C4Group[]; groups: CompoundGroupDef[] } {
  // Normalized here rather than trusted from the caller. This function's output is
  // cached under the open *set*, so a repeated id would emit the same group twice
  // (ELK rejects a duplicate id) and a different order would produce a different
  // group list for a diagram that did not change. An explicit argument wins over
  // the model's own field, so a caller driving a state the model does not describe
  // gets exactly that state.
  const resolved = openContainerSet(
    openIds !== undefined ? { openContainerIds: openIds } : model,
  );
  const opened = new Set(resolved);
  // Every frame this layout draws: the system boundary, plus a container frame per
  // container whose components are in view (the component view leans on these).
  // Each *opened* container's frame is dropped — it is drawn as a grown card
  // instead, as an ELK parent below.
  const frames = deriveC4Groups({ ...model, openContainerIds: resolved }).filter(
    (g) => !opened.has(g.id),
  );
  const groups: CompoundGroupDef[] = frames.map((g) => ({
    id: g.id,
    memberIds: g.memberIds,
    ...(g.parentId ? { parentId: g.parentId } : {}),
  }));

  // Opened: the container becomes a real ELK parent so it is sized to hold its
  // components — the "layout B" the closed layout transitions to. Only in the
  // container view: that is where a container is a card, and where the drill-down
  // is offered.
  if (model.view === 'container') {
    for (const openId of resolved) {
      const openMembers = model.nodes
        .filter((n) => n.kind === 'component' && (n.container ?? n.parentId) === openId)
        .map((n) => n.id);
      if (openMembers.length === 0) continue;
      groups.push({
        id: openId,
        memberIds: openMembers,
        // INSIDE the system frame, not beside it. The boundary *is* the system, so
        // a sibling here would draw the opened container outside the very boundary
        // it belongs to.
        parentId: model.system.id,
        // Never narrower than the closed card, so opening only ever grows the box.
        minWidth: NODE_W,
        // Room for the container's own label slot + technology row.
        padTop: OPEN_HEADER_PAD,
        // Room for the collapse affordance, which is absolutely positioned and so
        // takes no space in the card's flow. Without it the fitted height stops at
        // the last component row and that row is drawn through the button.
        padBottom: OPEN_FOOTER_PAD,
        // Breathing room at the sides, so the nested cards read as held inside the
        // container rather than flush with the chrome above them.
        padX: OPEN_SIDE_PAD,
        // Drawn as a card, laid out as a group — both are needed, and only ELK
        // knows which one a bare member id means.
        drawnAsCard: true,
      });
    }
  }

  return { frames, groups };
}

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

/**
 * FLIP between two absolute flow rects: render transformed back onto `from`,
 * then release onto `to`.
 *
 * The step back **must** happen while rendering, not in an effect. An effect runs
 * after the browser has already painted, so the element is painted at its new
 * position for one frame and only then jumps back — a visible teleport, which is
 * the exact thing this hook exists to remove. Adjusting state during render lets
 * React apply the transform in the same commit, so the new position is never
 * painted untransformed.
 *
 * The rects are keyed by value: `injectGrow` mints fresh objects each layout, so
 * comparing identity would re-fire the whole morph on unrelated re-renders.
 */
function useFlip(from: FlowRect | undefined, to: FlowRect | undefined) {
  const key = from && to ? `${from.x},${from.y},${to.x},${to.y}` : '';
  const [lastKey, setLastKey] = useState(key);
  const [placed, setPlaced] = useState(!key);
  if (key !== lastKey) {
    setLastKey(key);
    setPlaced(false);
  }
  useEffect(() => {
    if (!key) return;
    const raf = requestAnimationFrame(() => setPlaced(true));
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return {
    flipping: key !== '',
    placed,
    dx: from && to ? from.x - to.x : 0,
    dy: from && to ? from.y - to.y : 0,
  };
}

/**
 * Whether a nested component is withheld while the diagram is mid-morph.
 *
 * Only for a component whose *own* container is opening or closing right now.
 * A container that was already open is not mid-grow — it is gliding to a new slot
 * because ELK re-flowed the diagram around a different change, and React Flow
 * carries its children along with it. Blanking its components anyway is what
 * makes a multi-container drill-down read as a reset on every click, which is the
 * opposite of the state it is meant to keep.
 *
 * `openIds` and `morphTargets` are sets because both are read once per node per
 * render; a list would be a scan per node.
 */
export function hidesComponentDuringMorph(
  owner: string | undefined,
  openIds: ReadonlySet<string>,
  morphTargets: ReadonlySet<string>,
  settled: boolean,
): boolean {
  // Settled: nothing is withheld. No owner: not nested under a container at all.
  // Not open: its container is a closed card, so there is nothing to sit inside.
  if (settled || !owner || !openIds.has(owner)) return false;
  return morphTargets.has(owner);
}

function Inner({ model, onSelectNode, onToggleContainer, onOpenContainer, onCloseContainer, gutter = 28 }: C4GraphProps) {
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
  /**
   * Prefetched layouts, keyed by {@link openStateKey} of the open set ('' =
   * closed).
   *
   * Capped because the key space grew: with one container open at a time there
   * were exactly N+1 states, but a drill-down that keeps containers open reaches
   * a different set on every click, and the prefetch fans out one step further
   * from each. Map preserves insertion order, so the first key is the oldest —
   * evicting it drops a layout that is furthest from the current state, which is
   * the one least likely to be needed next.
   */
  const layoutCache = useRef(new Map<string, Rendered>());
  /** How many layouts to keep. Sized for a large diagram, not a typical one. */
  const LAYOUT_CACHE_MAX = 64;
  const cacheLayout = (key: string, layout: Rendered) => {
    const cache = layoutCache.current;
    // Re-insert so a cache hit counts as recent use and survives eviction.
    cache.delete(key);
    cache.set(key, layout);
    for (const oldest of cache.keys()) {
      if (cache.size <= LAYOUT_CACHE_MAX) break;
      // Never evict what is on screen: a re-layout of the current state mid-morph
      // would swap the geometry out from under the transition.
      if (oldest === openStateKey(openIds)) continue;
      cache.delete(oldest);
    }
  };
  /**
   * False while the drill-down grow/shrink is in flight. It gates the whole reveal:
   * the opened container's components stay hidden, every card drops its
   * description, and the edges and their labels are withheld — all returning
   * together once the box settles.
   *
   * Driven by one timer keyed to MORPH_MS rather than `transitionend`: the grow
   * is the card's own width/height transition *and* the system frame's
   * transform, so a DOM event would fire twice per open and gate on the wrong
   * property.
   */
  const [settled, setSettled] = useState(true);
  /** Set once the first layout has rendered, so only a real change animates. */
  const paintedRef = useRef(false);
  /** The in-flight settle timer; cancelled if the open state changes again. */
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The post-morph re-frame; see `CAMERA_AFTER_MORPH_MS`. */
  const cameraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The open set rendered last, so a change can morph between the two layouts.
   * The array, not just its key, because the morph needs to know *which*
   * containers changed — see `morphTargetsRef`.
   */
  const prevOpenRef = useRef<string[]>([]);
  /**
   * Containers whose open state is changing *right now* — the symmetric
   * difference of the previous and next open sets.
   *
   * This is what keeps an already-open container from blinking when a second one
   * is opened. The grow is gated per container, not globally: ELK re-lays out the
   * whole diagram, so every root card glides, but only the one being opened or
   * closed has components that are genuinely arriving or leaving. Hiding every
   * nested component for the length of the morph would make each open look like a
   * wholesale reset of the drill-down, which is the opposite of the state the
   * drill-down is supposed to be keeping.
   */
  const morphTargetsRef = useRef<Set<string>>(new Set());

  /**
   * Frame the whole system. Fit the SYSTEM node explicitly rather than the drawn
   * nodes: on a drill-down those are just the opened containers and their
   * components, so fitting them would zoom to a container instead of the system.
   */
  const fitSystem = useCallback(() => {
    fitView({ padding: 0.15, duration: CAMERA_MS, maxZoom: 1, nodes: [{ id: model.system.id }] });
  }, [fitView, model.system.id]);

  /**
   * The one drill-down verb. `onToggleContainer` says which container changed, so
   * the host can add or remove exactly that one; the deprecated pair carries no
   * id on the close side, so it can only close everything — correct for the
   * single-container drill-down it was written for, and the reason it is not the
   * preferred spelling.
   */
  const canToggle = !!(onToggleContainer || onOpenContainer);
  const toggle = useCallback(
    (id: string) => {
      if (onToggleContainer) {
        onToggleContainer(id);
        return;
      }
      if (openContainerSet(model).includes(id)) onCloseContainer?.();
      else onOpenContainer?.(id);
    },
    [onToggleContainer, onOpenContainer, onCloseContainer, model],
  );

  // Fit the camera AFTER the new nodes are committed (when `ready` flips true),
  // so `fitView` measures the real geometry.
  useEffect(() => {
    if (!ready || !pendingFitRef.current) return;
    pendingFitRef.current = false;
    fitSystem();
  }, [ready, fitSystem]);

  /** Called once the new layout is committed, from the layout effect. */
  const afterLayout = (grows: Map<string, FrameGrow> | null) => {
    pendingFitRef.current = shouldRefitCamera(grows);
  };

  // Normalized once and shared by everything downstream — the cache key, the
  // membership tests, and the prefetch. Derived per model rather than inlined,
  // because a permutation of the same set is the same diagram and must not read
  // as a change.
  const openIds = useMemo(() => openContainerSet(model), [model]);
  const openKey = openStateKey(openIds);

  const layoutKey = useMemo(
    () =>
      [
        ...model.nodes.map((n) => `${n.id}\0${n.parentId ?? ''}\0${n.label}`).sort(),
        ...model.edges.map((e) => `${e.id}\0${e.count}`).sort(),
        `open:${openKey}`,
      ].join('\n'),
    [model, openKey],
  );

  /**
   * Build the React Flow inputs for a given open state — everything ELK needs,
   * independent of whether a layout has been run yet. Pure over `openIds`, so it
   * serves both the rendered state and the background prefetch.
   */
  const buildInputs = (openIds: readonly string[]) => {
    const opened = new Set(openIds);
    // Draw only the elements for this view. A container diagram shows the
    // runtime units (containers, externals, people); components belong to the
    // component view — or to a container that has been opened.
    const inView = (n: C4Element): boolean => {
      if (model.view === 'component') return n.kind !== 'container';
      if (n.kind === 'component') return opened.has(n.container ?? n.parentId ?? '');
      // A container is always drawn — it is a card either way. Opened, it grows
      // and nests its components; closed, it is the bare box.
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
      // A component of an opened container nests under *its own* container (a
      // React Flow child), so edges between components can be drawn later.
      // Everything else keeps its authored parentId. The parent is this
      // component's own container, not "the" open one — with several open at once
      // there is no single open one, and nesting everything under the first would
      // put one container's components inside the other.
      const owner = n.kind === 'component' ? (n.container ?? n.parentId) : undefined;
      const nested = owner && opened.has(owner) ? owner : undefined;
      const parentId = nested ?? n.parentId;
      return {
        id: n.id,
        type: 'c4-node',
        position: { x: (i % 5) * (NODE_W + 44), y: Math.floor(i / 5) * (NODE_H + 44) },
        width: size.width,
        height: size.height,
        ...(parentId ? { parentId } : {}),
        // Nested cards are separate node divs in the viewport, so they must be
        // told to paint above the grown container they sit inside — DOM order
        // follows the model, not the containment.
        ...(nested ? { zIndex: 2 } : {}),
        data: {
          element: n,
          selected: false,
          componentCount: childComponentCount.get(n.id) ?? 0,
          // A container with components opens; the same affordance closes it
          // again, so the toggle lives in one place.
          ...(n.kind === 'container' && (childComponentCount.get(n.id) ?? 0) > 0 && canToggle
            ? { onExpand: () => toggle(n.id), open: opened.has(n.id) }
            : {}),
        },
      };
    });

    const { frames, groups } = c4GroupDefs(model, openIds);

    // Bands come from the *frames* only. The opened container is an ELK parent,
    // not a band — treating it as one would push it into its own layer, away from
    // the containers it belongs beside.
    const frameIds = frames.map((g) => g.id);
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

    return { rfNodes, rfEdges, groups, partitionByNode, frames };
  };

  /**
   * Run ELK for one open state and turn the result into React Flow nodes /
   * edges. The heavy step the prefetch caches.
   */
  const layoutFor = async (
    openIds: readonly string[],
    inputs: ReturnType<typeof buildInputs>,
  ): Promise<Rendered> => {
    const { rfNodes, rfEdges, groups, partitionByNode, frames } = inputs;
    const opened = new Set(openIds);
    // The system boundary is a REAL ELK parent: its containers lay out *inside* it,
    // so ELK owns both the frame's origin and its size. That is what holds the
    // boundary's top-left corner steady between the two layouts, which is the whole
    // point of the drill-down. Measured, not assumed — with the frame as a parent,
    // ELK holds the frame at (12,12) and the opened container at (12,202) across
    // both layouts, the container growing 150 -> 556 *downward* while its siblings
    // reflow around it.
    //
    // Synthesized as a flat union instead, the boundary had no position of its own:
    // it inherited its members' top edge, so it slid 206px the moment ELK re-placed
    // one of them, and the FLIP dutifully animated the slide. A union means we own
    // the boundary's geometry; a parent means ELK does.
    //
    // The component view keeps every frame flat. Its container frames nest *inside*
    // the system frame, and flattening a group whose parent is a real group would
    // leave that parent holding a reference to a group ELK never sees.
    const result = await computeElkLayout(rfNodes, rfEdges, {
      direction: 'RIGHT',
      preserveNodePositions: false,
      groups,
      keepSingletonGroups: true,
      edgeLabels: { enabled: true, placement: 'CENTER', width: C4_LABEL_WIDTH, measure: estimateEdgeLabelWidth },
      nodeSpacing: gutter * 2,
      edgeNodeSpacing: gutter,
      interLayerSpacing: 40,
      flatGroups: model.view === 'component' ? true : new Set<string>(),
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

    // `result.groupBounds` mixes coordinate spaces; everything downstream here
    // reads it as absolute, so normalize it once at the boundary.
    const groupBounds = rebaseGroupBoundsAbsolute(result);
    const builtGroups = new Set(groupBounds.keys());
    // The opened containers come back from ELK as parents, so they land in
    // `groupBounds` — but each is drawn as a grown *card*, not a frame. Drop them
    // all from the shells; keep them in `groupBounds` so their nested children can
    // take their coordinates relative to them.
    const shellBounds = new Map(groupBounds);
    for (const openId of openIds) shellBounds.delete(openId);

    const groupById = new Map(frames.map((g) => [g.id, g]));
    const depthOf = (id: string): number => {
      let d = 0;
      let g = groupById.get(id);
      while (g?.parentId) {
        d += 1;
        g = groupById.get(g.parentId);
      }
      return d;
    };

    // Node positions must live in the same space as the edges and the frames:
    // absolute. `flowPositionOf` does the one conversion (and the shells below use
    // the same absolute origin), so nodes, edges and frames cannot disagree.
    const absBoundsOf = (id: string) => absoluteBoundsOf(result, id);
    const parentOriginOf = (id: string | undefined): { x: number; y: number } => {
      if (!id) return { x: 0, y: 0 };
      const r = absBoundsOf(id);
      return r ? { x: r.x, y: r.y } : { x: 0, y: 0 };
    };

    // Only the system frame is emitted today (the drill-down's container frames
    // became grown cards), but the mapping stays keyed off the derived group so a
    // container frame can come back without reshaping this.
    const shells: Node[] = [...shellBounds.keys()]
      .sort((a, b) => depthOf(a) - depthOf(b))
      .map((id) => {
        const def = groupById.get(id);
        const parentId = def?.parentId && builtGroups.has(def.parentId) ? def.parentId : undefined;
        const origin = parentOriginOf(parentId);
        const b = absBoundsOf(id) ?? { x: 0, y: 0, width: 0, height: 0 };
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
            ...(def?.kind === 'container' && opened.has(id)
              ? { onCollapse: () => toggle(id) }
              : {}),
          },
        };
      });

    const leaves = rfNodes.map((n) => {
      let parentId: string | undefined;
      if (n.data && typeof n.data === 'object') {
        const modelNode = (n.data as { element?: C4Element }).element;
        // A component nests under its own container when that container is open —
        // the sibling containers and out-of-boundary nodes in the same layout must
        // not. Reads the component's own owner rather than a single open id,
        // because several containers can be open at once.
        const owner =
          modelNode?.kind === 'component' ? (modelNode.container ?? modelNode.parentId) : undefined;
        const nested = owner && opened.has(owner) ? owner : undefined;
        const candidate = nested ?? modelNode?.parentId;
        if (candidate && builtGroups.has(candidate)) parentId = candidate;
      }
      // `flowPositionOf` covers every node ELK placed; the fallback is for the
      // pathological case of a node ELK did not return at all.
      const abs =
        flowPositionOf(result, n.id, parentId) ??
        positioned.get(n.id)?.position ??
        n.position;
      // An opened container is an ELK parent, so its box is whatever ELK fitted
      // to the nested components — `nodeSize` only knows the closed card.
      const fitted = opened.has(n.id) ? groupBounds.get(n.id) : undefined;
      const node = {
        ...n,
        position: { x: abs.x, y: abs.y },
        ...(fitted ? { width: fitted.width, height: fitted.height } : {}),
      };
      return (parentId ? { ...node, parentId } : { ...node, parentId: undefined }) as Node;
    });

    // `groupBounds`, not `result.groupBounds`: the rebased one. `Rendered` readers
    // all assume absolute.
    return { nodes: [...shells, ...leaves], edges: withPaths, labelPositions, groupBounds };
  };

  /**
   * Stamp each growing element's span onto its node, so its view can FLIP from the
   * old rect to its own. `grows` is keyed by element id, flow-space.
   */
  const injectGrow = (nodes: Node[], grows: Map<string, FrameGrow> | null): Node[] => {
    if (!grows || grows.size === 0) return nodes;
    return nodes.map((n) => {
      const g = grows.get(n.id);
      // A child is hidden until the morph settles, and its absolute position also
      // moves with its parent — one transform on the parent covers both.
      if (!g || n.parentId) return n;
      return n.type === 'c4-group' || n.type === 'c4-node'
        ? { ...n, data: { ...n.data, growFrom: g.from, frameRect: g.to } }
        : n;
    });
  };

  const renderLayout = (r: Rendered, grows: Map<string, FrameGrow> | null) => {
    setNodes(injectGrow(r.nodes, grows));
    setRfEdges(r.edges);
    setLabelPositions(r.labelPositions);
    setReady(true);
    afterLayout(grows);
  };

  // Render the current open state. Uses the prefetched layout when present
  // (instant swap), else computes it now.
  useEffect(() => {
    let alive = true;
    setReady(false);
    setSelectedId(null);
    const openKeyNow = openStateKey(openIds);
    const prevOpen = prevOpenRef.current;
    const inputs = buildInputs(openIds);

    // Only a real open-state change animates; the first paint is already at rest.
    if (paintedRef.current && openStateKey(prevOpen) !== openKeyNow) {
      // The containers in one set and not the other are the ones whose components
      // actually arrive or leave. Recorded as a ref rather than state: it is read
      // during the next render (to decide what to hide) but must not itself
      // schedule a render.
      const before = new Set(prevOpen);
      const after = new Set(openIds);
      morphTargetsRef.current = new Set([
        ...prevOpen.filter((id) => !after.has(id)),
        ...openIds.filter((id) => !before.has(id)),
      ]);
      setSettled(false);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        setSettled(true);
        // The morph is over. Clearing the targets matters: an unrelated re-render
        // afterwards must not find a container still marked mid-morph and hide
        // components that are merely sitting still.
        morphTargetsRef.current = new Set();
      }, MORPH_MS);
      // Re-frame once the grow has landed, not while it is running. The drill-down
      // more than doubles the boundary, so the extent the camera was fitted to no
      // longer contains the content — but moving *during* the morph compounds with
      // the FLIP glide, and every card then travels the sum of two animations
      // instead of the one the FLIP specified (see `shouldRefitCamera`). Waiting
      // out the morph is the honest way to get both.
      if (cameraTimer.current) clearTimeout(cameraTimer.current);
      cameraTimer.current = setTimeout(fitSystem, CAMERA_AFTER_MORPH_MS);
    }
    paintedRef.current = true;

    /**
     * Every element whose rect changes between the previous and new layouts, so
     * boundaries *and* cards grow/shrink and slide together. Empty when nothing
     * changed (e.g. the initial paint).
     *
     * Frames alone are not enough: ELK re-lays out the whole diagram, so every
     * root card moves too. Without a card in this set it keeps its new slot the
     * instant the layout swaps — a teleport, which is the most visible part of a
     * bad morph. Child nodes are excluded: a transform on them would only fight
     * the parent's, which carries the same movement.
     */
    const growsFor = (next: Rendered): Map<string, FrameGrow> | null => {
      if (openStateKey(prevOpen) === openKeyNow) return null;
      const prevLayout = layoutCache.current.get(openStateKey(prevOpen));
      if (!prevLayout) return null;
      const grows = new Map<string, FrameGrow>();
      const rootCardIds = (l: Rendered) =>
        l.nodes.filter((n) => !n.parentId).map((n) => n.id);
      const ids = new Set([
        ...prevLayout.groupBounds.keys(),
        ...next.groupBounds.keys(),
        ...rootCardIds(prevLayout),
        ...rootCardIds(next),
      ]);
      for (const id of ids) {
        const fromRect = containerRect(prevLayout, id);
        const to = containerRect(next, id);
        if (!fromRect || !to) continue;
        if (
          fromRect.x === to.x &&
          fromRect.y === to.y &&
          fromRect.width === to.width &&
          fromRect.height === to.height
        ) {
          continue;
        }
        grows.set(id, { from: fromRect, to });
      }
      return grows.size > 0 ? grows : null;
    };

    const cached = layoutCache.current.get(openKeyNow);
    if (cached) {
      prevOpenRef.current = openIds;
      renderLayout(cached, growsFor(cached));
      return () => {
        alive = false;
      };
    }
    void layoutFor(openIds, inputs)
      .then((r) => {
        if (!alive) return;
        cacheLayout(openKeyNow, r);
        const span = growsFor(r);
        prevOpenRef.current = openIds;
        renderLayout(r, span);
      })
      .catch((err) => {
        if (!alive) return;
        console.warn('[c4-graph] ELK layout failed, using grid:', err);
        setNodes(inputs.rfNodes.map((n) => ({ ...n, parentId: undefined })));
        setRfEdges(inputs.rfEdges);
        setReady(true);
        // A grid's geometry is arbitrary and nothing FLIPped from the previous
        // layout, so this commit genuinely needs a fit.
        afterLayout(null);
      });
    return () => {
      alive = false;
      if (settleTimer.current) {
        clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
      // Same for the re-frame: it outlives the effect that armed it, and firing
      // into an unmounted React Flow instance is a wasted camera move at best.
      if (cameraTimer.current) {
        clearTimeout(cameraTimer.current);
        cameraTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // After the first paint, prefetch the opened layout for every container, so a
  // click swaps to a cached result instead of waiting on ELK.
  useEffect(() => {
    if (model.view !== 'container') return;
    let alive = true;
    const openable = model.nodes.filter(
      (n) => n.kind === 'container' && model.nodes.some((c) => c.kind === 'component' && (c.container ?? c.parentId) === n.id),
    );
    // One click ahead, and only one: opening `c` next means the current set plus
    // `c`. From the closed diagram that is just "open c", so the same rule covers
    // the first click on any container and every one after it — no separate path
    // for "nothing is open yet".
    //
    // Deliberately not the full power set. With N containers that would be 2^N
    // ELK runs and most of them unreachable; N-1 runs per visited state keeps the
    // next click instant, which is the only reason this exists. The cache is
    // capped below because the reachable states now grow with the states visited
    // rather than staying at N.
    const targets = openable
      .filter((c) => !openIds.includes(c.id))
      .map((c) => [...openIds, c.id].sort());
    void (async () => {
      for (const target of targets) {
        if (!alive) return;
        const key = openStateKey(target);
        if (layoutCache.current.has(key)) continue;
        try {
          const r = await layoutFor(target, buildInputs(target));
          if (!alive) return;
          cacheLayout(key, r);
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

  /** The containers open for drill-down, normalized. */
  const openContainerIds = useMemo(() => new Set(openIds), [openIds]);

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        if (n.type !== 'c4-node') return n;
        const element = (n.data as { element?: C4Element } | undefined)?.element;
        const owner = element?.kind === 'component' ? (element.container ?? element.parentId) : undefined;
        // `hidesComponentDuringMorph` owns the rule; see there for why it is
        // per-container rather than global.
        const hidden = hidesComponentDuringMorph(
          owner,
          openContainerIds,
          morphTargetsRef.current,
          settled,
        );
        return {
          ...n,
          ...(hidden ? { hidden: true } : {}),
          data: { ...n.data, selected: n.id === selectedId, settled },
        };
      }),
    // `morphTargetsRef` is a ref, so it cannot be a dependency; `settled` covers
    // it, because the two always change together — targets are written in the same
    // tick that clears `settled`, and cleared in the same tick that restores it.
    [nodes, selectedId, settled, openContainerIds],
  );

  /**
   * An edge's polyline is routed for the *settled* layout, so while the cards are
   * gliding between the two slots the old lines would visibly point at the wrong
   * boxes. Hiding them for the morph is honest and cheap; interpolating the
   * polylines to match is not.
   */
  const displayEdges = useMemo(
    () => (settled ? rfEdges : rfEdges.map((e) => ({ ...e, hidden: true }))),
    [rfEdges, settled],
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: theme.colors.background }}>
      <GraphLayerStyle />
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
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
      {/* Gated on `settled`, like the edges themselves: a chip is anchored to the
          *settled* midpoint of its edge, so showing one while the cards glide leaves
          it pointing at the space between two layouts. It rejoins them, the nested
          components and the descriptions in one reveal. */}
      {ready && settled && labelPositions.size > 0 && (
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
