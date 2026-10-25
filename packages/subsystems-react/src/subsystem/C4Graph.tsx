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
import type { ComponentType, CSSProperties, ReactNode } from 'react';
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
  COMPONENT_FOOTER_PAD,
  COMPONENT_HEADER_PAD,
  COMPONENT_W,
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
import type { C4Component, C4Edge, C4Element, C4Model, C4TrailRef } from './c4';
import { openContainerSet, openStateKey } from './c4';
import {
  EDGE_DIM_ALPHA,
  hexWithAlpha,
  SubsystemCallbacksProvider,
  SubsystemComponentNode,
  SubsystemEdge,
} from './nodes';
import { FileDrawer, FILE_DRAWER_HEIGHT_MS } from './FileDrawer';
import {
  constructBadgeLabel,
  convertSubsystemToEdges,
  convertSubsystemToNodes,
  deriveNameFromSymbol,
  edgeColor,
  MECHANISM_DESCRIPTIONS,
  rightBadgeLabel,
} from './model';
import type { SubsystemComponent, SubsystemEdgeProvenance, SubsystemTrail } from './model';
import { generateDeclarationString } from './formatDeclaration';
import { componentColor } from '../pierre/constructColors';
import { resolvePierreSyntaxThemeName } from '../pierre/pierreSyntaxTheme';

/**
 * The construct-level subgraph a C4 container hosts when it is opened — the
 * component graph's own material (subsystem components + trail steps), so the
 * constructs render as real `subsystem-component` nodes and `subsystem-edge`
 * edges rather than a summary. Host-resolved and keyed by container id, so the
 * C4 view stays free of the document.
 *
 * The hierarchy it expresses is container → C4 component → construct: a
 * construct whose alias an authored component claims nests under that
 * component (which grows into an ELK parent); one no component claims nests
 * directly under the container.
 */
export interface C4ConstructGraph {
  /** The document components to draw inside this container. */
  components: readonly SubsystemComponent[];
  /** The trails whose steps become the construct edges (restrict to this container). */
  trails: readonly SubsystemTrail[];
  /** Construct alias → the authored C4 component element id that claims it. */
  componentOf?: ReadonlyMap<string, string>;
}

export interface C4GraphProps {
  model: C4Model;
  onSelectNode?: (id: string | null) => void;
  /**
   * Click an edge. Fires with the rolled-up line (and its `trailRefs`
   * provenance when a builder supplied it), or `null` when the selection is
   * cleared — pane click, or clicking a node. This is the drill-down
   * affordance: the host switches the component graph to the contributing
   * trails.
   */
  onSelectEdge?: (edge: C4Edge | null) => void;
  /**
   * Click a trail row in the edge inspector. Hands the ref back so the host
   * can deep-link the component graph to that trail — e.g. via
   * `SubsystemComponentGraph.initialTrailId`. Without this the refs render
   * inert.
   */
  onTrailClick?: (ref: C4TrailRef) => void;
  /**
   * Element ids to fade — everything the focused trail does NOT touch. The
   * host computes the set (trail step aliases → owning element via its
   * membership map); this graph renders the named elements (and the lines
   * between them) at low opacity so the players in the trail stay bright.
   * `null` (or absent) renders everything at full weight.
   */
  dimmedElementIds?: ReadonlySet<string> | null;
  /**
   * Edge ids to fade beyond the endpoint rule — the host's line-level
   * relevance set (edges that do NOT carry the focused trail / hovered step).
   * A step entirely internal to a container folds into no line, so the host
   * can dim every edge even though lit containers remain. Unioned with the
   * own both-endpoints-dimmed rule; the selected edge never dims.
   */
  dimmedEdgeIds?: ReadonlySet<string> | null;
  /**
   * Element ids to remove from the canvas entirely — the focused trail's cast,
   * the C4 analogue of the component graph's opened-flow hide. Unlike
   * `dimmedElementIds` (faded but still drawn), these boxes are not rendered at
   * all, and a line touching one is hidden with it. `null`/absent draws
   * everything. Hover previews dim; an expanded trail hides non-members.
   */
  hiddenElementIds?: ReadonlySet<string> | null;
  /** Edge ids to remove entirely — lines the focused trail does not fold. */
  hiddenEdgeIds?: ReadonlySet<string> | null;
  /**
   * Subsystem-component aliases to fade beyond the container rule — the
   * construct-level spotlight for a hovered step. A construct whose alias is in
   * the set dims even when its container is lit. Absent → constructs dim only
   * with their container.
   */
  dimmedConstructIds?: ReadonlySet<string> | null;
  /** Subsystem edge ids to fade — the construct-level counterpart of `dimmedEdgeIds`. */
  dimmedConstructEdgeIds?: ReadonlySet<string> | null;
  /**
   * The construct-level subgraph to draw inside each opened container — the
   * component graph's subsystem nodes and edges, nested container → C4
   * component → construct. The host resolves it from the model document and the
   * focused trail (restricting edges to the container; a construct edge that
   * crosses containers stays a C4 container-level line). Absent → the container
   * opens as before, with no constructs.
   */
  constructGraphByContainer?: ReadonlyMap<string, C4ConstructGraph>;
  /**
   * The step under persistent focus — the host sets it from a trails-panel step
   * click. The C4 canvas opens a code drawer showing that step's implementation
   * (the trail viewer when supplied, else the file at its line). `null` → no
   * drawer.
   */
  focusedStep?: { trailId: string; stepIndex: number } | null;
  /** Close the step drawer — the host clears `focusedStep`. */
  onCloseStep?: () => void;
  /** Host code viewer for a step's file — the drawer's content. */
  renderFileViewer?: (
    file: string,
    opts?: { startLine?: number; endLine?: number },
  ) => ReactNode;
  /** Host trail viewer; when supplied it replaces the file viewer for a step. */
  renderTrailViewer?: (ctx: { trail: SubsystemTrail; stepIndex: number | null }) => ReactNode;
  /** Suppress the drawer entirely (embeds). */
  hideDrawer?: boolean;
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
      /**
       * True while the host's focused trail does not touch this element — the
       * "players stay bright, the rest fades" emphasis layer. Applied to the
       * whole card (badges and all), never to a single badge on it.
       */
      dimmed?: boolean;
      /** Arriving in this layout — fades in. */
      entering?: boolean;
      /** Gone from this layout — kept for the morph, fades out. */
      leaving?: boolean;
      /** The move/grow waits this long for the fade to finish, in ms. */
      moveDelayMs?: number;
    }>
  >,
) {
  const {
    element,
    selected,
    componentCount,
    onExpand,
    open,
    settled,
    growFrom,
    frameRect,
    dimmed,
    entering,
    leaving,
    moveDelayMs = 0,
  } = props.data;
  const grown = open === true;

  // Position-only FLIP. The card resizes through its own `width`/`height`
  // transition, so scaling here would distort the text and fight that transition.
  // A card that only changed *size* has nothing to slide — no transform and no
  // transition, so its resize is the card's own and nothing competes with it.
  const { flipping, placed, dx, dy } = useFlip(growFrom, frameRect);
  const sliding = flipping && (dx !== 0 || dy !== 0);
  const fade = useFade(entering, leaving);
  const transitions = [
    ...(fade.transition ? [fade.transition] : []),
    ...(sliding && placed ? [`transform ${MORPH_MS}ms ease-out ${moveDelayMs}ms`] : []),
  ];
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
        transition: transitions.length > 0 ? transitions.join(', ') : 'none',
        opacity: fade.opacity,
      }}
    >
      <div
        style={{
          // The dim is a view concern, deliberately below the FLIP transform
          // (which owns position) so the two never fight. The whole card fades —
          // if we ever want to keep a badge lit, that is a different element.
          opacity: dimmed ? 0.22 : 1,
          transition: 'opacity 220ms ease',
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
          transitionDelayMs={moveDelayMs}
          sizeTransitionMs={MORPH_MS}
          handles={
            <>
              <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
              <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
            </>
          }
        />
      </div>
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
  selectedEdgeId,
  dimmedEdgeIds,
  hiddenEdgeIds,
}: {
  positions: Map<string, { x: number; y: number }>;
  edges: C4Model['edges'];
  selectedEdgeId?: string | null;
  dimmedEdgeIds?: ReadonlySet<string> | null;
  hiddenEdgeIds?: ReadonlySet<string> | null;
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
        if (hiddenEdgeIds?.has(edge.id)) return null;
        const color = protocolColor(edge.protocol);
        const text = edge.protocol ?? edge.label;
        const selected = edge.id === selectedEdgeId;
        const dimmed = dimmedEdgeIds?.has(edge.id) === true;
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
              // Fades with its line, on the same beat.
              opacity: dimmed ? 0.25 : 1,
              transition: 'opacity 220ms ease',
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
                // The selected chip echoes the edge's heavier stroke.
                outline: selected ? `1.5px solid ${color}` : 'none',
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
                fontWeight: selected ? 700 : 500,
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
 * Fallback drawer body when the host supplies no file/trail viewer: the step's
 * seam — `from → to`, mechanism, site, symbol, and any annotation. A host with a
 * real code viewer passes `renderFileViewer` / `renderTrailViewer` instead.
 */
function StepDrawerFallback({ step }: { step: SubsystemTrail['steps'][number] }) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  return (
    <div
      style={{
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontFamily: theme.fonts.monospace,
        fontSize: theme.fontSizes[0],
      }}
    >
      <div style={{ color: theme.colors.text }}>
        {step.from} → {step.to}
      </div>
      <div style={{ color: muted }}>
        {step.mechanism} · {step.file}:{step.span?.startLine ?? '?'}
      </div>
      {step.symbol && <div style={{ color: muted }}>{step.symbol}</div>}
      {step.annotation && (
        <div style={{ color: theme.colors.text, fontFamily: theme.fonts.body, marginTop: 4 }}>
          {step.annotation}
        </div>
      )}
    </div>
  );
}

/**
 * Construct-edge label overlay — the mechanism chips for the reused subsystem
 * edges.
 *
 * `SubsystemEdge` draws only the line; the component graph renders its mechanism
 * labels in a separate overlay. So the C4 canvas supplies one too, from the ELK
 * label anchors stamped onto each edge's data (`labelX/labelY`).
 */
function SubsystemEdgeLabels({ edges }: { edges: Edge[] }) {
  const { theme } = useTheme();
  const viewport = useViewport();
  const surface = theme.colors.backgroundSecondary ?? theme.colors.background;
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
      {edges.map((e) => {
        const d = e.data as
          | {
              mechanism?: string;
              provenance?: SubsystemEdgeProvenance;
              labelX?: number;
              labelY?: number;
              dimmed?: boolean;
            }
          | undefined;
        if (d?.labelX == null || d?.labelY == null) return null;
        const mechanism = d.mechanism ?? 'uses';
        const text = mechanism;
        // The same hue the component graph gives its mechanism chips, so a verb
        // reads the same colour on either canvas.
        const color = edgeColor({ mechanism, provenance: d.provenance });
        const labelTitle =
          d.provenance === 'graphify'
            ? 'Derived from graphify (static symbol graph)'
            : MECHANISM_DESCRIPTIONS.find(([m]) => m === mechanism)?.[2] === false
              ? 'Not directly verifiable with graphify'
              : undefined;
        return (
          <div
            key={e.id}
            title={labelTitle}
            style={{
              position: 'absolute',
              left: d.labelX * viewport.zoom + viewport.x,
              top: d.labelY * viewport.zoom + viewport.y,
              transform: `translate(-50%, -50%) scale(${viewport.zoom})`,
              transformOrigin: 'center center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: estimateEdgeLabelWidth(text),
              height: EDGE_LABEL_HEIGHT,
              boxSizing: 'border-box',
              padding: '7px 8px',
              // Fades with its line, on the same beat.
              opacity: d.dimmed === true ? 0.15 : 1,
              transition: 'opacity 220ms ease',
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
 *
 * Two strokes: an invisible wide hit path (the drawn line is 1px, hopeless to
 * click) and the visible one. The selection emphasis is a heavier stroke on
 * the same geometry, so the selected line reads without redrawing the route.
 */
function C4EdgeView({
  data,
  markerEnd,
}: EdgeProps<Edge<{ path?: string; color?: string; selected?: boolean; dimmed?: boolean }>>) {
  const path = data?.path ?? '';
  if (!path) return null;
  const selected = data?.selected === true;
  const dimmed = data?.dimmed === true;
  return (
    <>
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
      />
      <path
        d={path}
        fill="none"
        stroke={data?.color}
        strokeWidth={selected ? 2.5 : 1}
        strokeDasharray="6 4"
        markerEnd={markerEnd}
        style={{ pointerEvents: 'none', opacity: dimmed ? 0.18 : 1, transition: 'opacity 220ms ease' }}
      />
    </>
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
      /** Arriving in this layout — fades in. */
      entering?: boolean;
      /** Gone from this layout — kept for the morph, fades out. */
      leaving?: boolean;
      /** The move/grow waits this long for the fade to finish, in ms. */
      moveDelayMs?: number;
    }>
  >,
) {
  const { theme } = useTheme();
  const color = props.data.color;
  const isSystem = props.data.kind === 'system';
  const onCollapse = props.data.onCollapse;
  const brand = props.data.brand;
  const { growFrom, frameRect, entering, leaving, moveDelayMs = 0 } = props.data;

  // Position-only FLIP, same as the cards. The frame resizes through its own
  // width/height transition below, so scaling here would fight it *and* distort
  // what it draws: a scaled dashed border changes weight as it grows, and the
  // label chip's border and text scale with it.
  const { flipping, placed, dx, dy } = useFlip(growFrom, frameRect);
  const sliding = flipping && (dx !== 0 || dy !== 0);
  const fade = useFade(entering, leaving);

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
          `width ${MORPH_MS}ms ease-out ${moveDelayMs}ms`,
          `height ${MORPH_MS}ms ease-out ${moveDelayMs}ms`,
          ...(fade.transition ? [fade.transition] : []),
          ...(sliding && placed ? [`transform ${MORPH_MS}ms ease-out ${moveDelayMs}ms`] : []),
        ].join(', '),
        opacity: fade.opacity,
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

/**
 * The component graph's own node, wrapped in the C4 canvas's FLIP so a construct
 * glides to its new slot when the layout reflows. On its own it would only mount
 * at the destination — a jump. Position-only, matching the C4 cards.
 */
const SubsystemNode = SubsystemComponentNode as unknown as ComponentType<NodeProps>;

function C4SubsystemNodeView(props: NodeProps) {
  const { growFrom, frameRect, entering, leaving, moveDelayMs = 0 } = props.data as {
    growFrom?: FlowRect;
    frameRect?: FlowRect;
    entering?: boolean;
    leaving?: boolean;
    moveDelayMs?: number;
  };
  const { flipping, placed, dx, dy } = useFlip(growFrom, frameRect);
  const sliding = flipping && (dx !== 0 || dy !== 0);
  const fade = useFade(entering, leaving);
  const transitions = [
    ...(fade.transition ? [fade.transition] : []),
    ...(sliding && placed ? [`transform ${MORPH_MS}ms ease-out ${moveDelayMs}ms`] : []),
  ];
  return (
    <div
      style={{
        transformOrigin: 'top left',
        transform: sliding && !placed ? `translate(${dx}px, ${dy}px)` : 'none',
        transition: transitions.length > 0 ? transitions.join(', ') : 'none',
        opacity: fade.opacity,
      }}
    >
      <SubsystemNode {...props} />
    </div>
  );
}

const nodeTypes = {
  'c4-node': C4NodeView,
  'c4-group': C4GroupView,
  // The component graph's own renderers, reused for the constructs a container
  // hosts. They are context-light (ThemeProvider + a React Flow ancestor), which
  // is why they can ride this canvas instead of a nested one.
  'subsystem-component': C4SubsystemNodeView as never,
};
const edgeTypes = {
  'c4-edge': C4EdgeView,
  'subsystem-edge': SubsystemEdge as never,
};

/** Drill-down animation durations, in ms. */
const MORPH_MS = 420;
const CAMERA_MS = 520;
/**
 * How long cards arriving or leaving take to fade, in ms. The morph is
 * sequenced: the fade runs first, and the surviving cards wait it out before
 * they move and grow (`moveDelayMs` below). So the reveal clock is
 * `FADE_MS + MORPH_MS`, not just `MORPH_MS`.
 */
const FADE_MS = 200;
/**
 * When to re-frame the camera after a drill-down: the sequenced morph (fade,
 * then move), plus a beat.
 *
 * The extra 60ms is not padding for looks. `fitView` reads the system frame's
 * *measured* size, and that frame's own height transition runs on the same
 * MORPH_MS clock — so asking on the same tick reads it mid-flight and fits to a
 * height that never existed. The beat is for React Flow's resize observer to
 * report the final geometry.
 */
const CAMERA_AFTER_MORPH_MS = FADE_MS + MORPH_MS + 60;

/** A fully laid-out open state: the RF nodes/edges and label anchors. */
interface Rendered {
  nodes: Node[];
  edges: Edge[];
  labelPositions: Map<string, { x: number; y: number }>;
  groupBounds: Map<string, { x: number; y: number; width: number; height: number }>;
}

/** Flow-space rect of a box node or a frame, for the drill-down morph. */
export interface FlowRect { x: number; y: number; width: number; height: number }

/** A frame's growth for the drill-down morph: its flow rect before → after. */
export interface FrameGrow { from: FlowRect; to: FlowRect }

/**
 * A node's rect in **absolute** flow space, walking the parent chain.
 *
 * `groupBounds` is already absolute; a leaf's `position` is relative to its
 * parent, so each ancestor's origin is added in turn.
 *
 * The FLIP needs absolute rects, not parent-relative ones. React Flow places a
 * node at its new absolute position (parent origin + relative position) and
 * moves children along with the parent's *wrapper* — while our FLIP transform
 * lives on the node's inner div, which the children do not inherit. So a node's
 * own transform must cover its full absolute delta; rebasing it to the parent
 * would leave it short by exactly the parent's movement (the "subtle drift"
 * before a leaving box disappears).
 */
export function absoluteRectOf(
  layout: {
    nodes: ReadonlyArray<{
      id: string;
      position: { x: number; y: number };
      parentId?: string;
      width?: number | null;
      height?: number | null;
    }>;
    groupBounds: Map<string, { x: number; y: number; width: number; height: number }>;
  },
  id: string,
): FlowRect | null {
  const frame = layout.groupBounds.get(id);
  if (frame) return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  const node = layout.nodes.find((n) => n.id === id);
  if (!node) return null;
  const origin = node.parentId ? absoluteRectOf(layout, node.parentId) : null;
  return {
    x: (origin?.x ?? 0) + node.position.x,
    y: (origin?.y ?? 0) + node.position.y,
    width: node.width ?? 0,
    height: node.height ?? 0,
  };
}

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
 * `absoluteRectOf` reads this map before the node box, so an unrebased entry
 * would be handed to the morph offset by the frame's origin: the container would
 * glide to a place it was never drawn.
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
  constructGraphByContainer?: ReadonlyMap<string, C4ConstructGraph>,
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
      // The constructs this container hosts, grouped under the authored component
      // that claims each (which grows into its own ELK parent below); a construct
      // no component claims nests directly under the container.
      const cg = constructGraphByContainer?.get(openId);
      const byComponent = new Map<string, string[]>();
      const orphans: string[] = [];
      for (const c of cg?.components ?? []) {
        const owner = cg?.componentOf?.get(c.alias);
        if (owner) {
          const list = byComponent.get(owner) ?? [];
          list.push(c.alias);
          byComponent.set(owner, list);
        } else {
          orphans.push(c.alias);
        }
      }
      if (openMembers.length === 0 && orphans.length === 0) continue;
      groups.push({
        id: openId,
        memberIds: [...openMembers, ...orphans],
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
      // A component that claims constructs grows into an ELK parent as well, so
      // its constructs nest inside it (container → component → construct) rather
      // than sitting beside it.
      for (const [componentId, memberIds] of byComponent) {
        if (memberIds.length === 0) continue;
        groups.push({
          id: componentId,
          memberIds,
          parentId: openId,
          minWidth: COMPONENT_W,
          // A component card's header is its label slot + padding; it has no
          // technology row and no collapse affordance.
          padTop: COMPONENT_HEADER_PAD,
          padBottom: COMPONENT_FOOTER_PAD,
          padX: OPEN_SIDE_PAD,
          drawnAsCard: true,
        });
      }
    }
  }

  return { frames, groups };
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
 * Opacity for a card arriving or leaving the layout. An arriving card mounts
 * hidden and fades in; a leaving card is kept (out of the new layout) for the
 * morph, then fades out — a removal reads as a fade, not a pop.
 */
function useFade(entering?: boolean, leaving?: boolean) {
  const animate = entering === true || leaving === true;
  const [shown, setShown] = useState(entering !== true);
  useEffect(() => {
    if (!animate) return;
    const raf = requestAnimationFrame(() => setShown(leaving !== true));
    return () => cancelAnimationFrame(raf);
  }, [animate, entering, leaving]);
  if (!animate) return { opacity: 1, transition: undefined as string | undefined };
  return { opacity: shown ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` };
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

function Inner({ model, onSelectNode, onSelectEdge, onTrailClick, onToggleContainer, onOpenContainer, onCloseContainer, gutter = 28, dimmedElementIds, dimmedEdgeIds, hiddenElementIds, hiddenEdgeIds, dimmedConstructIds, dimmedConstructEdgeIds, constructGraphByContainer, focusedStep, onCloseStep, renderFileViewer, renderTrailViewer, hideDrawer = false }: C4GraphProps) {
  const { theme, mode } = useTheme();
  const { fitView, fitBounds } = useReactFlow();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const [nodes, setNodes] = useState<Node[]>([]);
  /** Latest rendered nodes, for the step-focus camera fit without re-firing on
   *  every layout change. */
  const nodesRef = useRef<Node[]>([]);
  nodesRef.current = nodes;
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // The construct (subsystem component alias) whose functionality (declaration
  // + purpose) is open. Its own panel, so opening a construct never disturbs the
  // node/edge inspector.
  const [selectedConstructAlias, setSelectedConstructAlias] = useState<string | null>(null);
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
      if (oldest === currentCacheKeyRef.current) continue;
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
  /** Drops cards that were kept only to fade out. */
  const leaverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The dim set of the *previous* render, read when a card starts leaving so it
   * fades from the opacity it actually had. A hover preview dims the non-cast
   * boxes; clicking the trail clears the hover, so without this a leaving box
   * would brighten to full before fading.
   */
  const prevDimmedRef = useRef<ReadonlySet<string> | null>(null);
  /**
   * The open set rendered last, so a change can morph between the two layouts.
   * The array, not just its key, because the morph needs to know *which*
   * containers changed — see `morphTargetsRef`.
   */
  const prevOpenRef = useRef<string[]>([]);
  /**
   * The layout-cache key rendered last, and the one on screen now. The key
   * carries the construct counts too (a card's box grows with its rows), so a
   * focus change that keeps the same containers open still misses the cache and
   * recomputes — and the morph reads the previous entry by its own key.
   */
  const prevCacheKeyRef = useRef('');
  const currentCacheKeyRef = useRef('');
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
   * Frame the whole diagram: the system boundary *and* everything drawn outside
   * it.
   *
   * Named explicitly rather than left to the drawn nodes, because on a drill-down
   * those include the opened container's components — fitting all of them would
   * zoom past the boundary into one container's contents. But naming only the
   * boundary is the other half of the mistake: externals and people sit outside
   * it by definition, so fitting the frame alone crops exactly the things the
   * boundary is drawn in contrast to.
   */
  const fitSystem = useCallback(() => {
    const outside = model.nodes
      .filter((n) => n.kind === 'external-system' || n.kind === 'person')
      .map((n) => ({ id: n.id }));
    fitView({
      padding: 0.15,
      duration: CAMERA_MS,
      maxZoom: 1,
      nodes: [{ id: model.system.id }, ...outside],
    });
  }, [fitView, model.system.id, model.nodes]);

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

  // The constructs a container hosts change its layout, so a focus shift that
  // swaps them (same containers open) must recompute — keyed here or the stale
  // box would stand.
  const constructKey = useMemo(
    () =>
      constructGraphByContainer
        ? [...constructGraphByContainer.entries()]
            .map(
              ([id, cg]) =>
                `${id}\0${cg.components.map((c) => c.alias).sort().join(',')}`,
            )
            .sort()
            .join('\n')
        : '',
    [constructGraphByContainer],
  );

  // The model's own shape — which boxes and lines exist. Part of the cache key
  // so a host that filters the model (e.g. down to a focused trail's cast)
  // re-lays-out instead of hitting a stale layout for the same open set.
  const modelKey = useMemo(
    () =>
      [
        ...model.nodes.map((n) => `${n.id}\0${n.parentId ?? ''}\0${n.label}`).sort(),
        ...model.edges.map((e) => `${e.id}\0${e.count}`).sort(),
      ].join('\n'),
    [model],
  );

  const layoutKey = useMemo(
    () => `${modelKey}\nopen:${openKey}\nconstructs:${constructKey}`,
    [modelKey, openKey, constructKey],
  );

  /** The identity of one laid-out state — open set + constructs + model shape. */
  const stateKey = (ids: readonly string[]) =>
    `${openStateKey(ids)}|${constructKey}|${modelKey}`;

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

    // Authored components that claim constructs grow into ELK parents too, so
    // they are drawn as grown cards (absolute box, no description) exactly like
    // an opened container.
    const groupedComponentIds = new Set<string>();
    if (model.view === 'container') {
      for (const openId of openIds) {
        const cg = constructGraphByContainer?.get(openId);
        if (!cg) continue;
        for (const c of cg.components) {
          const owner = cg.componentOf?.get(c.alias);
          if (owner) groupedComponentIds.add(owner);
        }
      }
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
          // A container with components — or with constructs hosted from the
          // model, when no C4 component layer exists — opens; the same
          // affordance closes it again, so the toggle lives in one place.
          ...(n.kind === 'container' &&
          ((childComponentCount.get(n.id) ?? 0) > 0 ||
            (constructGraphByContainer?.get(n.id)?.components.length ?? 0) > 0)
            ? {
                ...(canToggle ? { onExpand: () => toggle(n.id) } : {}),
                open: opened.has(n.id),
              }
            : {}),
          // A component grown to hold its constructs is a drawn-as-card group:
          // no description, absolute box, sized by ELK.
          ...(n.kind === 'component' && groupedComponentIds.has(n.id) ? { open: true } : {}),
        },
      };
    });

    // Constructs: the component graph's own nodes and edges, nested inside their
    // opened container (under the authored component that claims each). Built
    // per container so an edge never crosses containers — a construct edge that
    // would is left to the C4 container-level line.
    const constructEdges: Edge[] = [];
    if (model.view === 'container') {
      for (const openId of openIds) {
        const cg = constructGraphByContainer?.get(openId);
        if (!cg || cg.components.length === 0) continue;
        const subNodes = convertSubsystemToNodes({
          components: [...cg.components],
          trails: [...cg.trails],
        });
        for (const sn of subNodes) {
          const owner = cg.componentOf?.get(sn.id) ?? openId;
          rfNodes.push({
            ...sn,
            parentId: owner,
            zIndex: 3,
            // `c4Owner` is the container this construct belongs to, read by the
            // morph/dim pass; it is not part of the node's own render.
            data: { ...sn.data, c4Owner: openId },
          });
        }
        constructEdges.push(
          ...convertSubsystemToEdges({ components: [...cg.components], trails: [...cg.trails] }),
        );
      }
    }

    const { frames, groups } = c4GroupDefs(model, openIds, constructGraphByContainer);

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
    // Construct edges attach only when both endpoints are drawn — a step to an
    // external, or to a construct in another container, is dropped here and left
    // to the C4 container-level line.
    for (const e of constructEdges) {
      if (drawnIds.has(e.source) && drawnIds.has(e.target)) rfEdges.push(e);
    }

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
      const path = pointsToSmoothPath(pts, 12);
      // The component graph's edge renderer reads `elkPath` (and its label
      // overlay reads `labelX/labelY`); the C4 renderer reads `path`. Set each
      // so the right renderer draws its own route and its own label anchor.
      if (e.type === 'subsystem-edge') {
        const mid = pointAlongPath(pts, 0.5);
        return { ...e, data: { ...e.data, elkPath: path, labelX: mid.x, labelY: mid.y } };
      }
      labelPositions.set(e.id, pointAlongPath(pts, 0.5));
      return { ...e, data: { ...e.data, path } };
    });

    // `result.groupBounds` mixes coordinate spaces; everything downstream here
    // reads it as absolute, so normalize it once at the boundary.
    const groupBounds = rebaseGroupBoundsAbsolute(result);
    const builtGroups = new Set(groupBounds.keys());
    // Every group drawn as a grown *card* (opened containers, and components
    // grown to hold their constructs) comes back from ELK as a parent, so it
    // lands in `groupBounds` — but it is drawn as a card, not a frame. Drop each
    // from the shells; keep them in `groupBounds` so their nested children can
    // take their coordinates relative to them.
    const drawnAsCardIds = new Set(groups.filter((g) => g.drawnAsCard).map((g) => g.id));
    const shellBounds = new Map(groupBounds);
    for (const id of drawnAsCardIds) shellBounds.delete(id);

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
      // The parent is whatever `buildInputs` already stamped on the node — a
      // component's container, or a construct's component/container — kept only
      // when ELK actually built that group (a closed container is not one). This
      // covers the construct nodes too, whose data carries no `element`.
      let parentId: string | undefined;
      if (n.parentId && builtGroups.has(n.parentId)) parentId = n.parentId;
      // `flowPositionOf` covers every node ELK placed; the fallback is for the
      // pathological case of a node ELK did not return at all.
      const abs =
        flowPositionOf(result, n.id, parentId) ??
        positioned.get(n.id)?.position ??
        n.position;
      // A grown card (an opened container, or a component holding its
      // constructs) is an ELK parent, so its box is whatever ELK fitted to its
      // nested children — `nodeSize` only knows the closed card.
      const fitted = drawnAsCardIds.has(n.id) ? groupBounds.get(n.id) : undefined;
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
      if (!g) return n;
      if (n.type !== 'c4-group' && n.type !== 'c4-node' && n.type !== 'subsystem-component') {
        return n;
      }
      // Absolute rects for every node — root or nested. `useFlip` turns them into
      // the absolute delta the node's inner div must travel; React Flow has
      // already moved the wrapper (and its children) to the new absolute slot.
      return { ...n, data: { ...n.data, growFrom: g.from, frameRect: g.to } };
    });
  };

  const renderLayout = (
    r: Rendered,
    grows: Map<string, FrameGrow> | null,
    morph?: { prevNodeIds: Set<string>; leavers: Node[]; moveDelayMs: number },
  ) => {
    // Mark cards that were not in the previous layout so they fade in; keep the
    // previous layout's orphans (leavers) so they fade out instead of popping.
    // Every card also carries the move delay, so the survivors' glide and grow
    // wait for the fade to finish (the sequenced morph).
    const moveDelayMs = morph?.moveDelayMs ?? 0;
    const marked = morph
      ? r.nodes.map((n) => {
          const base = morph.prevNodeIds.has(n.id)
            ? n
            : { ...n, data: { ...n.data, entering: true } };
          return { ...base, data: { ...base.data, moveDelayMs } };
        })
      : r.nodes;
    const leavers = (morph?.leavers ?? []).map((n) => ({
      ...n,
      data: { ...n.data, moveDelayMs },
    }));
    setNodes([...injectGrow(marked, grows), ...leavers]);
    setRfEdges(r.edges);
    setLabelPositions(r.labelPositions);
    setReady(true);
    afterLayout(grows);
  };

  // Render the current open state. Uses the prefetched layout when present
  // (instant swap), else computes it now.
  useEffect(() => {
    let alive = true;
    // Blank the canvas only for the very first paint. A relayout keeps the
    // previous layout on screen until the new one lands — otherwise every trail
    // pick (which changes the open set and the construct graph, so the cache
    // misses) flashed the "Laying out…" overlay.
    if (!paintedRef.current) setReady(false);
    setSelectedId(null);
    const openKeyNow = openStateKey(openIds);
    const cacheKeyNow = stateKey(openIds);
    currentCacheKeyRef.current = cacheKeyNow;
    const prevOpen = prevOpenRef.current;
    const prevCacheKey = prevCacheKeyRef.current;
    // Captured now, not inside `applyLayout`: the layout may compute async, and
    // the tracking effect below clears the ref before that runs. This is the dim
    // set of the render just gone (the hover preview).
    const prevDimmed = prevDimmedRef.current;
    const inputs = buildInputs(openIds);

    // The containers whose open state changed *this* tick — the only ones whose
    // components genuinely arrive or leave. Recorded as a ref rather than state:
    // it is read during the next render (to decide what to hide) but must not
    // itself schedule a render.
    if (paintedRef.current && openStateKey(prevOpen) !== openKeyNow) {
      const before = new Set(prevOpen);
      const after = new Set(openIds);
      morphTargetsRef.current = new Set([
        ...prevOpen.filter((id) => !after.has(id)),
        ...openIds.filter((id) => !before.has(id)),
      ]);
      // Re-frame once the grow has landed, not while it is running. The drill-down
      // more than doubles the boundary, so the extent the camera was fitted to no
      // longer contains the content — but moving *during* the morph compounds with
      // the FLIP glide, and every card then travels the sum of two animations
      // instead of the one the FLIP specified (see `shouldRefitCamera`). Waiting
      // out the morph is the honest way to get both.
      if (cameraTimer.current) clearTimeout(cameraTimer.current);
      cameraTimer.current = setTimeout(fitSystem, CAMERA_AFTER_MORPH_MS);
    } else {
      morphTargetsRef.current = new Set();
    }
    paintedRef.current = true;

    /**
     * Every element whose rect changes between the previous and new layouts, so
     * boundaries *and* cards grow/shrink and slide together. Empty when nothing
     * changed (e.g. the initial paint).
     *
     * This covers *nested* cards too (a container inside the system frame, a
     * component inside a grown container). They are React Flow children, so the
     * FLIP rects are rebased to their parent's origin in `injectGrow` — a
     * transform on a child then composes with the parent's instead of fighting
     * it. Without this, filtering the model to a trail's cast reflowed the
     * surviving containers and they teleported to their new slots.
     */
    const growsFor = (next: Rendered): Map<string, FrameGrow> | null => {
      if (!paintedRef.current) return null;
      const prevLayout = layoutCache.current.get(prevCacheKey);
      if (!prevLayout) return null;
      const grows = new Map<string, FrameGrow>();
      const cardIds = (l: Rendered) => l.nodes.map((n) => n.id);
      const ids = new Set([
        ...prevLayout.groupBounds.keys(),
        ...next.groupBounds.keys(),
        ...cardIds(prevLayout),
        ...cardIds(next),
      ]);
      for (const id of ids) {
        const fromRect = absoluteRectOf(prevLayout, id);
        const to = absoluteRectOf(next, id);
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

    // Commit a new layout: keep the survivors gliding (FLIP), fade in cards the
    // previous layout did not have, and hold the previous layout's orphans for
    // one morph so they fade out rather than pop. Then advance the refs.
    const applyLayout = (r: Rendered) => {
      const prevLayout = layoutCache.current.get(prevCacheKey);
      const span = growsFor(r);
      const prevNodeIds = new Set((prevLayout?.nodes ?? []).map((n) => n.id));
      const nextIds = new Set(r.nodes.map((n) => n.id));
      // A leaving card is rendered as a *root* node pinned to its old absolute
      // rect. Nested under its old parent it would ride that parent's React Flow
      // wrapper — which moves the instant the new layout commits — and drift
      // before it faded. As a root it stays put and just fades.
      const leavers: Node[] = prevLayout
        ? prevLayout.nodes
            .filter((n) => !nextIds.has(n.id))
            .map((n) => {
              const rect = absoluteRectOf(prevLayout, n.id);
              // Keep the dim it had while hovered, so the fade starts from the
              // faded opacity instead of flashing back to full first.
              const el = (n.data as { element?: C4Element } | undefined)?.element;
              const wasDimmed = el ? prevDimmed?.has(el.id) === true : false;
              return {
                ...n,
                parentId: undefined,
                position: rect ? { x: rect.x, y: rect.y } : n.position,
                ...(rect ? { width: rect.width, height: rect.height } : {}),
                data: { ...n.data, leaving: true, ...(wasDimmed ? { dimmed: true } : {}) },
              };
            })
        : [];
      // Only *root* fades (a container arriving or leaving) sequence the move.
      // Nested cards (components, constructs) are withheld by the morph gate
      // while their container grows, so their entering/leaving is not a fade the
      // reader sees — delaying the grow for them would just add a pause.
      const rootEntering = prevLayout
        ? r.nodes.filter((n) => !n.parentId && !prevNodeIds.has(n.id)).length
        : 0;
      const rootLeaving = leavers.filter((n) => !n.parentId).length;
      const moveDelayMs = rootEntering > 0 || rootLeaving > 0 ? FADE_MS : 0;
      // The edges are withheld for the whole sequenced morph — fade, then move,
      // then content. The morphing containers' components are withheld too (see
      // `morphTargetsRef`).
      if (span) {
        setSettled(false);
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => {
          setSettled(true);
          morphTargetsRef.current = new Set();
        }, moveDelayMs + MORPH_MS);
      }
      if (leaverTimer.current) clearTimeout(leaverTimer.current);
      if (leavers.length > 0) {
        const leavingIds = new Set(leavers.map((n) => n.id));
        // A leaver only fades; it does not move, so it is dropped when the fade
        // ends, just before the survivors start to glide.
        leaverTimer.current = setTimeout(() => {
          setNodes((prev) => prev.filter((n) => !leavingIds.has(n.id)));
        }, FADE_MS + 40);
      }
      prevOpenRef.current = openIds;
      prevCacheKeyRef.current = cacheKeyNow;
      renderLayout(
        r,
        span,
        prevLayout ? { prevNodeIds, leavers, moveDelayMs } : undefined,
      );
    };

    const cached = layoutCache.current.get(cacheKeyNow);
    if (cached) {
      applyLayout(cached);
      return () => {
        alive = false;
      };
    }
    void layoutFor(openIds, inputs)
      .then((r) => {
        if (!alive) return;
        cacheLayout(cacheKeyNow, r);
        applyLayout(r);
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
      if (leaverTimer.current) {
        clearTimeout(leaverTimer.current);
        leaverTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // Remember this render's dim set for the *next* commit's leavers. Declared
  // after the layout effect so it runs after it: the layout effect reads the
  // value the previous render left here (a hover dim), before this overwrites
  // it with the now-cleared set.
  useEffect(() => {
    prevDimmedRef.current = dimmedElementIds ?? null;
  });

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
        const key = stateKey(target);
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

  /** Open a construct's functionality, or close it when re-clicked. */
  const selectConstruct = useCallback((alias: string) => {
    setSelectedConstructAlias((cur) => (cur === alias ? null : alias));
  }, []);

  // Scoped to this canvas so the reused component nodes dispatch into this
  // graph's selection instead of a mounted component graph's module callbacks.
  const subsystemCallbacks = useMemo(() => ({ onSelect: selectConstruct }), [selectConstruct]);

  const selected = useMemo(
    () => model.nodes.find((n) => n.id === selectedId) ?? null,
    [model, selectedId],
  );

  /** The rolled-up line under selection, when it is an edge. */
  const selectedEdge = useMemo(
    () => model.edges.find((e) => e.id === selectedEdgeId) ?? null,
    [model, selectedEdgeId],
  );

  /**
   * The step under persistent focus, resolved from the construct graph's trails
   * (the drawer shows its implementation). The host owns the selection.
   */
  const focusedStepInfo = useMemo(() => {
    if (!focusedStep) return null;
    for (const cg of constructGraphByContainer?.values() ?? []) {
      const trail = cg.trails.find((t) => t.id === focusedStep.trailId);
      if (!trail) continue;
      const step = trail.steps[focusedStep.stepIndex];
      if (!step) continue;
      return { trail, step, stepIndex: focusedStep.stepIndex };
    }
    return null;
  }, [focusedStep, constructGraphByContainer]);

  // Frame the focused step's constructs, the way the component graph frames a
  // focused step's edge: box the `from`/`to` node rects (absolute) and fit.
  // Waits out the drawer's height transition so the fit uses the reduced canvas.
  useEffect(() => {
    if (!focusedStepInfo) return;
    const rects: FlowRect[] = [];
    for (const id of [focusedStepInfo.step.from, focusedStepInfo.step.to]) {
      const r = absoluteRectOf({ nodes: nodesRef.current, groupBounds: new Map() }, id);
      if (r) rects.push(r);
    }
    if (rects.length === 0) return;
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.width));
    const maxY = Math.max(...rects.map((r) => r.y + r.height));
    const bounds = {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
    const timer = setTimeout(() => {
      requestAnimationFrame(() => fitBounds(bounds, { padding: 0.2, duration: MORPH_MS }));
    }, FILE_DRAWER_HEIGHT_MS + 20);
    return () => clearTimeout(timer);
    // `nodesRef` is a ref; `settled` re-fires once the constructs have landed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedStepInfo, settled, fitBounds]);

  /**
   * The construct under selection, folded to what the functionality panel
   * shows. Resolved across every container's construct graph (aliases are unique
   * in the document, so at most one matches).
   */
  const selectedConstruct = useMemo(() => {
    if (!selectedConstructAlias) return null;
    for (const cg of constructGraphByContainer?.values() ?? []) {
      const c = cg.components.find((x) => x.alias === selectedConstructAlias);
      if (!c) continue;
      return {
        component: c,
        name: deriveNameFromSymbol(c.symbol, c.construct, c.name, c.file, c.stereotype),
        badge: constructBadgeLabel(c),
        color: componentColor(c, resolvePierreSyntaxThemeName(mode)),
        role: rightBadgeLabel(c),
        declaration: generateDeclarationString(c),
      };
    }
    return null;
  }, [selectedConstructAlias, constructGraphByContainer, mode]);

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
            (n): n is C4Component =>
              n.kind === 'component' &&
              (n.container === selected.id || n.parentId === selected.id),
          )
        : [],
    [model, selected],
  );

  /**
   * A selected container's member aliases, resolved from the construct graph
   * (a container's members are derived, not stored — see `C4ElementBase`). Only
   * populated when the container hosts focused constructs.
   */
  const selectedContainerMembers = useMemo(
    () =>
      selected?.kind === 'container'
        ? (constructGraphByContainer?.get(selected.id)?.components ?? []).map((c) => c.alias)
        : [],
    [selected, constructGraphByContainer],
  );

  /** The containers open for drill-down, normalized. */
  const openContainerIds = useMemo(() => new Set(openIds), [openIds]);

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        // A card kept only to fade out is never hidden or dimmed — it is on its
        // way off screen and must stay visible for the fade.
        if ((n.data as { leaving?: boolean } | undefined)?.leaving) return n;
        // Constructs are the component graph's own nodes. They ride the morph
        // gate of the container that hosts them (they arrive with its grow) and
        // dim with it; the node reads `isSelected` from data because it stops
        // its own click propagation.
        if (n.type === 'subsystem-component') {
          const owner = (n.data as { c4Owner?: string } | undefined)?.c4Owner;
          const hidden = hidesComponentDuringMorph(
            owner,
            openContainerIds,
            morphTargetsRef.current,
            settled,
          );
          // Dim with its container, or on its own when the host spotlights a
          // step's constructs (the component graph's per-component behaviour).
          const ownerDimmed = dimmedElementIds && owner ? dimmedElementIds.has(owner) : false;
          const stepDimmed = dimmedConstructIds?.has(n.id) === true;
          return {
            ...n,
            ...(hidden ? { hidden: true } : {}),
            data: {
              ...n.data,
              dimmed: ownerDimmed || stepDimmed,
              isSelected: n.id === selectedConstructAlias,
            },
          };
        }
        if (n.type !== 'c4-node') return n;
        const element = (n.data as { element?: C4Element } | undefined)?.element;
        const owner = element?.kind === 'component' ? (element.container ?? element.parentId) : undefined;
        // `hidesComponentDuringMorph` owns the morph rule; see there for why it
        // is per-container rather than global. A host `hiddenElementIds` (the
        // focused-trail cast) removes the box outright.
        const hidden =
          hidesComponentDuringMorph(
            owner,
            openContainerIds,
            morphTargetsRef.current,
            settled,
          ) || (element ? hiddenElementIds?.has(element.id) === true : false);
        return {
          ...n,
          ...(hidden ? { hidden: true } : {}),
          data: {
            ...n.data,
            selected: n.id === selectedId,
            settled,
            dimmed: dimmedElementIds
              ? (element ? dimmedElementIds.has(element.id) : false)
              : false,
          },
        };
      }),
    // `morphTargetsRef` is a ref, so it cannot be a dependency; `settled` covers
    // it, because the two always change together — targets are written in the same
    // tick that clears `settled`, and cleared in the same tick that restores it.
    [
      nodes,
      selectedId,
      settled,
      openContainerIds,
      dimmedElementIds,
      dimmedConstructIds,
      hiddenElementIds,
      selectedConstructAlias,
    ],
  );

  /**
   * An edge's polyline is routed for the *settled* layout, so while the cards are
   * gliding between the two slots the old lines would visibly point at the wrong
   * boxes. Hiding them for the morph is honest and cheap; interpolating the
   * polylines to match is not.
   *
   * The dim set is the union of
   *   (a) the own endpoint rule — a line between two dimmed boxes fades with
   *       them, a line into a lit container stays bright on its own; and
   *   (b) the host's line-relevance set — edges that don't carry the focused
   *       trail / hovered step (a step internal to a container folds into no
   *       line at all, so even lines out of the lit container fade).
   *
   * The selected edge never dims: it is the inspector's subject.
   */
  const dimmedEdgeIdSet = useMemo(() => {
    if (!dimmedElementIds && !dimmedEdgeIds) return null;
    const out = new Set<string>();
    if (dimmedElementIds) {
      for (const e of rfEdges) {
        if (dimmedElementIds.has(e.source) && dimmedElementIds.has(e.target)) out.add(e.id);
      }
    }
    if (dimmedEdgeIds) for (const id of dimmedEdgeIds) out.add(id);
    if (selectedEdgeId) out.delete(selectedEdgeId);
    return out;
  }, [dimmedElementIds, dimmedEdgeIds, rfEdges, selectedEdgeId]);

  const hiddenEdgeIdSet = useMemo(() => {
    if (!hiddenElementIds && !hiddenEdgeIds) return null;
    const out = new Set<string>();
    if (hiddenElementIds) {
      // Either endpoint gone → the line has nothing to attach to, so it goes
      // with the box (unlike the dim rule, which needs both endpoints dimmed).
      for (const e of rfEdges) {
        if (hiddenElementIds.has(e.source) || hiddenElementIds.has(e.target)) out.add(e.id);
      }
    }
    if (hiddenEdgeIds) for (const id of hiddenEdgeIds) out.add(id);
    return out;
  }, [hiddenElementIds, hiddenEdgeIds, rfEdges]);

  const displayEdges = useMemo(
    () =>
      rfEdges.map((e) => {
        const hidden = !settled || hiddenEdgeIdSet?.has(e.id) === true;
        const dimmed =
          dimmedEdgeIdSet?.has(e.id) === true ||
          dimmedConstructEdgeIds?.has(e.id) === true;
        // The arrowhead is a shared SVG marker: dimming the stroke (path opacity
        // or colour alpha) leaves it at full colour. Clone the marker with a
        // dimmed colour, as the component graph does.
        const markerEnd = e.markerEnd;
        const nextMarker =
          dimmed && markerEnd && typeof markerEnd === 'object' && typeof markerEnd.color === 'string'
            ? { ...markerEnd, color: hexWithAlpha(markerEnd.color, EDGE_DIM_ALPHA) }
            : markerEnd;
        return {
          ...e,
          ...(hidden ? { hidden: true } : {}),
          markerEnd: nextMarker,
          data: {
            ...e.data,
            selected: e.id === selectedEdgeId,
            dimmed,
          },
        };
      }),
    [rfEdges, settled, selectedEdgeId, dimmedEdgeIdSet, hiddenEdgeIdSet, dimmedConstructEdgeIds],
  );

  /** The construct edges, for their mechanism-label overlay (carries the dim flag). */
  const subsystemLabelEdges = useMemo(
    () => displayEdges.filter((e) => e.type === 'subsystem-edge'),
    [displayEdges],
  );

  // The step drawer: open while a step is focused and a viewer is not hidden.
  const drawerOpen = focusedStepInfo != null && !hideDrawer;
  const drawerTitle = focusedStepInfo
    ? renderTrailViewer
      ? focusedStepInfo.trail.title
      : focusedStepInfo.step.file
    : null;
  const drawerProgress =
    focusedStepInfo && focusedStepInfo.trail.steps.length > 1
      ? { index: focusedStepInfo.stepIndex, total: focusedStepInfo.trail.steps.length }
      : null;

  // The selection panel floats over the canvas in the top-right corner. A host
  // that wants the panel (or anything else) beside the graph wraps the graph in
  // `GraphWithSidebar` itself, so the graph stays overlay-only.
  const selectionPanelStyle: CSSProperties = {
    position: 'absolute',
    top: 12,
    right: 12,
    // Above the edge-label overlay (zIndex 5), or chips paint over the panel.
    zIndex: 10,
    width: 280,
    maxHeight: 'calc(100% - 24px)',
    overflowY: 'auto',
    background: theme.colors.backgroundSecondary ?? theme.colors.background,
    border: `1px solid ${theme.colors.border ?? '#333'}`,
    borderRadius: 8,
    padding: '10px 12px',
  };

  const canvasRoot = (
    <>
      <GraphLayerStyle />
      <SubsystemCallbacksProvider value={subsystemCallbacks}>
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
          setSelectedEdgeId(null);
          setSelectedConstructAlias(null);
          onSelectNode?.(next);
          onSelectEdge?.(null);
        }}
        onEdgeClick={(_e, edge) => {
          const next = edge.id === selectedEdgeId ? null : edge.id;
          setSelectedEdgeId(next);
          // An edge selection replaces the node panel — the two inspectors
          // sharing the corner would fight for it.
          setSelectedId(null);
          setSelectedConstructAlias(null);
          onSelectNode?.(null);
          onSelectEdge?.(next ? (model.edges.find((e) => e.id === next) ?? null) : null);
        }}
        onPaneClick={() => {
          setSelectedId(null);
          setSelectedEdgeId(null);
          setSelectedConstructAlias(null);
          onSelectNode?.(null);
          onSelectEdge?.(null);
        }}
        proOptions={{ hideAttribution: true }}
        // Pin the flow to its container. The label overlay is a sibling sized
        // `inset: 0`, so the two must share an origin or `viewport.y` (measured
        // in the flow's own box) lands the chips off vertically.
        style={{ width: '100%', height: '100%' }}
      >
        <GraphChrome />
      </ReactFlow>
      </SubsystemCallbacksProvider>
      {/* Gated on `settled`, like the edges themselves: a chip is anchored to the
          *settled* midpoint of its edge, so showing one while the cards glide leaves
          it pointing at the space between two layouts. It rejoins them, the nested
          components and the descriptions in one reveal. */}
      {ready && settled && labelPositions.size > 0 && (
        <C4EdgeLabels positions={labelPositions} edges={model.edges} selectedEdgeId={selectedEdgeId} dimmedEdgeIds={dimmedEdgeIdSet} hiddenEdgeIds={hiddenEdgeIdSet} />
      )}
      {ready && settled && subsystemLabelEdges.length > 0 && (
        <SubsystemEdgeLabels edges={subsystemLabelEdges} />
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
    </>
  );
  const selectionPanels = (
    <>
      {selected && (
        <div style={selectionPanelStyle}>
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
                    {c.technology || c.kind}
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
              {selectedContainerMembers.length > 0 ? (
                selectedContainerMembers.map((alias) => (
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

      {selectedEdge && ready && (
        <div style={selectionPanelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: protocolColor(selectedEdge.protocol),
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: theme.fonts.monospace,
                fontWeight: 600,
                color: theme.colors.text,
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedEdge.label}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedEdgeId(null);
                onSelectEdge?.(null);
              }}
              aria-label="Clear selection"
              style={{ border: 'none', background: 'transparent', color: muted, cursor: 'pointer', fontSize: theme.fontSizes[2], lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* The rollup row: what this line folded up. The protocol color the
              card already carries is enough — this is the count + verbs. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              marginTop: 6,
              borderTop: `1px solid ${theme.colors.border ?? '#333'}`,
              paddingTop: 6,
            }}
          >
            {selectedEdge.mechanisms.map((m) => (
              <span
                key={m}
                style={{
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[0],
                  color: theme.colors.text,
                  border: `1px solid ${theme.colors.border ?? '#333'}`,
                  borderRadius: 4,
                  padding: '1px 6px',
                }}
              >
                {m}
              </span>
            ))}
            <span style={{ fontFamily: theme.fonts.monospace, fontSize: theme.fontSizes[0], color: muted }}>
              {selectedEdge.count} {selectedEdge.count === 1 ? 'step' : 'steps'}
            </span>
          </div>

          {/* The drill-down list: the trails this line rolls up, each handed to
              the host for a deep-link into the component graph. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              borderTop: `1px solid ${theme.colors.border ?? '#333'}`,
              paddingTop: 6,
              marginTop: 6,
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
              Backed by trails
            </span>
            {(selectedEdge.trailRefs ?? []).length > 0 ? (
              (selectedEdge.trailRefs ?? []).map((ref) => (
                <button
                  key={ref.trailId}
                  type="button"
                  onClick={() => onTrailClick?.(ref)}
                  disabled={!onTrailClick}
                  title={
                    onTrailClick
                      ? `Focus this trail in the component graph`
                      : 'Trail drill-down needs onTrailClick'
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: onTrailClick ? 'pointer' : 'default',
                    fontFamily: theme.fonts.monospace,
                    fontSize: theme.fontSizes[0],
                  }}
                >
                  <span style={{ color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ref.trailId}
                  </span>
                  <span style={{ color: muted, flexShrink: 0 }}>
                    {ref.stepIndices.length} {ref.stepIndices.length === 1 ? 'step' : 'steps'}
                    {ref.stepIndices.length > 0 ? ` · #${ref.stepIndices.map((i) => i + 1).join(', #')}` : ''}
                  </span>
                </button>
              ))
            ) : (
              <span style={{ fontFamily: theme.fonts.monospace, fontSize: theme.fontSizes[0], color: muted }}>
                Authored line — no trail provenance yet
              </span>
            )}
          </div>
        </div>
      )}

      {/* Construct functionality — a construct row's declaration + purpose,
          opened from a card. Its own bottom-left panel so it never fights the
          top-right node/edge inspector for the corner. */}
      {selectedConstruct && (
        <div
          style={{
            ...selectionPanelStyle,
            top: 'auto',
            bottom: 12,
            left: 12,
            right: 'auto',
            width: 320,
            maxHeight: 'calc(50% - 18px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: selectedConstruct.color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: theme.fonts.monospace,
                fontWeight: 600,
                color: theme.colors.text,
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedConstruct.name}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontFamily: theme.fonts.monospace,
                fontSize: theme.fontSizes[0],
                color: muted,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              {selectedConstruct.badge}
            </span>
            <button
              type="button"
              onClick={() => setSelectedConstructAlias(null)}
              aria-label="Clear construct"
              style={{ border: 'none', background: 'transparent', color: muted, cursor: 'pointer', fontSize: theme.fontSizes[2], lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          {selectedConstruct.component.purpose && (
            <div
              style={{
                marginTop: 6,
                fontFamily: theme.fonts.body,
                fontSize: theme.fontSizes[0],
                color: theme.colors.text,
                lineHeight: 1.4,
              }}
            >
              {selectedConstruct.component.purpose}
            </div>
          )}
          {selectedConstruct.declaration && (
            <pre
              style={{
                marginTop: 6,
                marginBottom: 0,
                padding: '6px 8px',
                borderTop: `1px solid ${theme.colors.border ?? '#333'}`,
                background: theme.colors.background ?? 'transparent',
                color: theme.colors.text,
                fontFamily: theme.fonts.monospace,
                fontSize: theme.fontSizes[0],
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {selectedConstruct.declaration}
            </pre>
          )}
          <div
            style={{
              marginTop: 6,
              fontFamily: theme.fonts.monospace,
              fontSize: theme.fontSizes[0],
              color: muted,
            }}
          >
            {selectedConstruct.component.alias}
            {selectedConstruct.role ? ` · ${selectedConstruct.role}` : ''}
          </div>
        </div>
      )}
    </>
  );
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.background,
      }}
    >
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {canvasRoot}
        {selectionPanels}
      </div>
      <FileDrawer
        title={drawerOpen ? drawerTitle : null}
        onClose={() => onCloseStep?.()}
        hidden={hideDrawer}
        progress={drawerProgress}
      >
        {drawerOpen && focusedStepInfo
          ? renderTrailViewer
            ? renderTrailViewer({
                trail: focusedStepInfo.trail,
                stepIndex: focusedStepInfo.stepIndex,
              })
            : renderFileViewer
              ? renderFileViewer(focusedStepInfo.step.file, {
                  startLine: focusedStepInfo.step.span?.startLine,
                  endLine: focusedStepInfo.step.span?.endLine,
                })
              : <StepDrawerFallback step={focusedStepInfo.step} />
          : null}
      </FileDrawer>
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
