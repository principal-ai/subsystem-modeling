/**
 * SubsystemModelTransition — a sibling of `SubsystemComponentGraph` that
 * presents ONE subsystem as a sequence of steps (e.g. constructs → static
 * topology → dynamic topology → walkthrough) and animates between them.
 *
 * Same look as the component graph: it reuses the same node / frame / edge
 * components and the edge-label chrome, so only the motion is new. Each step is
 * laid out with `buildSubsystemGraph`; nodes and frames are flattened to
 * absolute rects and position + size + opacity are interpolated on a rAF tween.
 * The viewport refits to the incoming layout at the start of a transition, and
 * the graph's real (ELK-routed, mechanism-colored) edges appear once it settles.
 */

import { useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import {
  Background,
  EdgeLabelRenderer,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTheme } from '@principal-ade/industry-theme';
import {
  buildSubsystemGraph,
  edgeColor,
  MECHANISM_DESCRIPTIONS,
  walkthroughStepGraphEdgeId,
  type SubsystemEdgeProvenance,
  type SubsystemGraphNode,
  type SubsystemModelDocument,
  type SubsystemWalkthrough,
} from './model';
import {
  hexWithAlpha,
  SubsystemCallbacksProvider,
  SubsystemComponentNode,
  SubsystemEdge,
  SubsystemGroupNode,
} from './nodes';
import { GRAPH_CANVAS_CLASS, GRAPH_NAV_PROPS, GraphChrome } from './graphChrome';
import {
  EDGE_LABEL_CLOUD_EXTRA_TOP,
  EDGE_LABEL_CLOUD_PATH,
  EDGE_LABEL_FONT_SIZE,
  EDGE_LABEL_HEIGHT,
  EDGE_LABEL_WIDTH,
} from '../utils/edgeLabel';

/** One step of the transition — a full model plus its view options. */
export interface SubsystemTransitionStep {
  model: SubsystemModelDocument;
  /** `path` derives directory frames and nests modules under them. */
  moduleNesting?: 'exact' | 'path';
  /** Show mechanism labels on edges. @default true */
  showEdgeLabels?: boolean;
  /** Explicit boundary frame colors (region key → hex); host override. */
  boundaryColors?: Record<string, string>;
  /**
   * Cycle this step's walkthrough hops: focus each step (dim non-participants,
   * number the labels, frame the step). Typically only the walkthrough layer.
   */
  autoPlayWalkthroughs?: boolean;
  /** Show the focused walkthrough's title chip (with step ticks). */
  showWalkthroughTitle?: boolean;
}

export interface SubsystemModelTransitionProps {
  steps: SubsystemTransitionStep[];
  /** Which step is shown. Controlled by the host (its nav / timer). */
  activeIndex: number;
  /** Tween duration, ms. @default 950 */
  durationMs?: number;
  /** fitView padding for the viewport refit. @default 0.18 */
  fitPadding?: number;
  /** Called when a node is clicked. */
  onSelect?: (componentAlias: string) => void;
  /** How an autoplayed walkthrough step reads. @default 'focus' */
  walkthroughStepMode?: 'focus' | 'dim';
  /** Dwell per walkthrough step while autoplaying, ms. @default 4000 */
  walkthroughAutoPlayIntervalMs?: number;
  className?: string;
  style?: CSSProperties;
}

/** Graph edge look (ELK orth path) + the mechanism label the graph overlays. */
function TransitionEdge(props: EdgeProps) {
  const { theme } = useTheme();
  const data = props.data as
    | {
        mechanism?: string;
        provenance?: SubsystemEdgeProvenance;
        labelX?: number;
        labelY?: number;
        stepNos?: number[];
        dimmed?: boolean;
      }
    | undefined;
  const mechanism = data?.mechanism ?? 'uses';
  const color = edgeColor({ mechanism, provenance: data?.provenance });
  const text = data?.stepNos?.length
    ? `${data.stepNos.map((n) => `${n}:`).join(' ')} ${mechanism}`
    : mechanism;
  const verifiable =
    data?.provenance === 'graphify' ||
    MECHANISM_DESCRIPTIONS.find(([m]) => m === mechanism)?.[2] !== false;
  const labelBg = theme.colors.backgroundSecondary ?? theme.colors.background;
  const showLabel = data?.labelX != null && data?.labelY != null;
  return (
    <>
      <EdgeRenderer {...props} />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${data!.labelX}px, ${data!.labelY}px)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: EDGE_LABEL_WIDTH,
              height: EDGE_LABEL_HEIGHT,
              boxSizing: 'border-box',
              padding: '7px 8px',
              pointerEvents: 'none',
              opacity: data?.dimmed ? 0.15 : 1,
            }}
          >
            {verifiable ? (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 4,
                  border: `0.5px solid ${color}`,
                  background: labelBg,
                }}
              />
            ) : (
              <svg
                aria-hidden
                width={EDGE_LABEL_WIDTH}
                height={EDGE_LABEL_HEIGHT + EDGE_LABEL_CLOUD_EXTRA_TOP}
                viewBox={`0 0 ${EDGE_LABEL_WIDTH} ${EDGE_LABEL_HEIGHT + EDGE_LABEL_CLOUD_EXTRA_TOP}`}
                style={{ position: 'absolute', left: 0, top: -EDGE_LABEL_CLOUD_EXTRA_TOP }}
              >
                <path
                  d={EDGE_LABEL_CLOUD_PATH}
                  fill={labelBg}
                  stroke={hexWithAlpha(color, 0.75)}
                  strokeWidth={1.2}
                  strokeLinejoin="round"
                />
              </svg>
            )}
            <span
              style={{
                position: 'relative',
                display: 'block',
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
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes: NodeTypes = {
  'subsystem-component': SubsystemComponentNode,
  'subsystem-group': SubsystemGroupNode,
};
const edgeTypes: EdgeTypes = { 'subsystem-edge': TransitionEdge };

/** `SubsystemEdge` narrows its props; render it through a permissive alias. */
const EdgeRenderer = SubsystemEdge as unknown as ComponentType<EdgeProps>;

type Rect = { x: number; y: number; w: number; h: number };
type Live = Rect & { o: number };
type StepMeta = { type: 'subsystem-component' | 'subsystem-group'; data: Record<string, unknown> };
type StepLayout = {
  rects: Map<string, Rect>;
  meta: Map<string, StepMeta>;
  order: string[];
  edges: Edge[];
};

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function flatten(
  result: Awaited<ReturnType<typeof buildSubsystemGraph>>,
  boundaryColors?: Record<string, string>,
): StepLayout {
  const rects = new Map<string, Rect>();
  const meta = new Map<string, StepMeta>();
  const order: string[] = [];
  const nodes: SubsystemGraphNode[] = [
    ...result.nodes.filter((n) => n.type === 'subsystem-group'),
    ...result.nodes.filter((n) => n.type !== 'subsystem-group'),
  ];
  for (const n of nodes) {
    const r = result.absoluteRects.get(n.id);
    if (!r) continue;
    rects.set(n.id, { x: r.x, y: r.y, w: r.width, h: r.height });
    const data = { ...((n.data ?? {}) as Record<string, unknown>) };
    if (n.type === 'subsystem-group' && boundaryColors) {
      const key = (data as { region?: { key?: string } }).region?.key;
      if (key && boundaryColors[key] != null) data.color = boundaryColors[key];
    }
    meta.set(n.id, { type: n.type as StepMeta['type'], data });
    order.push(n.id);
  }
  return { rects, meta, order, edges: result.edges as unknown as Edge[] };
}

function TransitionInner({
  steps,
  activeIndex,
  durationMs = 950,
  fitPadding = 0.18,
  onSelect,
  walkthroughStepMode = 'focus',
  walkthroughAutoPlayIntervalMs = 4000,
  className,
  style,
}: SubsystemModelTransitionProps) {
  const { theme } = useTheme();
  const { fitBounds } = useReactFlow();
  // React Flow only owns a size once its pane has mounted + measured; fitting
  // before that clamps the view. Gate the fit on RF's own dimensions.
  const rfSized = useStore((s) => (s.width ?? 0) > 0 && (s.height ?? 0) > 0);
  const [layouts, setLayouts] = useState<StepLayout[] | null>(null);
  const [display, setDisplay] = useState<Map<string, Live>>(new Map());
  const [settled, setSettled] = useState(false);
  // React Flow can't fit until its pane has a real size; the first mount often
  // reports 0, which clamped the initial fit (right-hand nodes cut off).
  const [sized, setSized] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef(display);
  displayRef.current = display;
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSized(true);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Lay out every step whenever the steps prop changes (identity-keyed).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const next: StepLayout[] = [];
      for (const s of steps) {
        const result = await buildSubsystemGraph(s.model, {
          showSingletonFrames: true,
          moduleNesting: s.moduleNesting,
          showEdgeLabels: s.showEdgeLabels ?? true,
        });
        next.push(flatten(result, s.boundaryColors));
      }
      if (alive) setLayouts(next);
    })();
    return () => {
      alive = false;
    };
  }, [steps]);

  // Tween to the active step; refit; hide edges until settled.
  useEffect(() => {
    if (!layouts) return;
    const step = layouts[activeIndex];
    if (!step) return;
    setSettled(false);

    const start = new Map(displayRef.current);
    const ids = new Set<string>([...start.keys(), ...step.rects.keys()]);
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const e = ease(t);
      const next = new Map<string, Live>();
      for (const id of ids) {
        const cur = start.get(id);
        const tgt = step.rects.get(id);
        if (tgt) {
          const from = cur ?? { ...tgt, o: 0 };
          next.set(id, {
            x: lerp(from.x, tgt.x, e),
            y: lerp(from.y, tgt.y, e),
            w: lerp(from.w, tgt.w, e),
            h: lerp(from.h, tgt.h, e),
            o: lerp(from.o ?? 0, 1, e),
          });
        } else if (cur) {
          next.set(id, { ...cur, o: lerp(cur.o, 0, e) });
        }
      }
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setSettled(true);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [layouts, activeIndex, durationMs]);

  // Refit the viewport to the active step — once the pane is sized, and on every
  // step change. Kept separate so the initial fit waits for a real pane size.
  useEffect(() => {
    if (!sized || !rfSized || !layouts) return;
    const step = layouts[activeIndex];
    if (!step) return;
    const rects = [...step.rects.values()];
    if (rects.length === 0) return;
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    fitBounds(
      { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      { padding: fitPadding, duration: durationMs },
    );
  }, [sized, rfSized, layouts, activeIndex, fitPadding, durationMs, fitBounds]);

  const unionMeta = useMemo(() => {
    const m = new Map<string, StepMeta>();
    for (const s of layouts ?? []) for (const [id, meta] of s.meta) if (!m.has(id)) m.set(id, meta);
    return m;
  }, [layouts]);

  const activeLayout = layouts?.[activeIndex];

  // Walkthrough step focus: cycle the active step's hops, dim non-participants,
  // number the labels, and (in `focus` mode) frame the step.
  const activeStepDef = steps[activeIndex];
  const activeWalkthroughs = activeStepDef?.model.walkthroughs;
  const autoPlaySteps =
    activeStepDef?.autoPlayWalkthroughs === true && (activeWalkthroughs?.length ?? 0) > 0;
  const hopList = useMemo(() => {
    const out: Array<{
      edgeId: string;
      from: string;
      to: string;
      stepNo: number;
      total: number;
      walkthroughId: string;
      walkthroughTitle: string;
    }> = [];
    for (const wt of (activeWalkthroughs ?? []) as SubsystemWalkthrough[]) {
      wt.steps.forEach((s, i) => {
        out.push({
          edgeId: walkthroughStepGraphEdgeId(s),
          from: s.from,
          to: s.to,
          stepNo: i + 1,
          total: wt.steps.length,
          walkthroughId: wt.id,
          walkthroughTitle: wt.title,
        });
      });
    }
    return out;
  }, [activeWalkthroughs]);
  const [stepPointer, setStepPointer] = useState(0);
  useEffect(() => {
    setStepPointer(0);
  }, [activeIndex, hopList.length]);
  useEffect(() => {
    if (!autoPlaySteps || hopList.length === 0) return;
    // Pointer 0 = whole flow (no step focus); 1..N = each hop, then wraps.
    const t = window.setInterval(
      () => setStepPointer((p) => (p + 1) % (hopList.length + 1)),
      Math.max(600, walkthroughAutoPlayIntervalMs),
    );
    return () => window.clearInterval(t);
  }, [autoPlaySteps, hopList.length, walkthroughAutoPlayIntervalMs]);
  const focusedHop =
    autoPlaySteps && hopList.length > 0 && stepPointer > 0
      ? hopList[(stepPointer - 1) % hopList.length]
      : undefined;
  const stepNoByEdge = useMemo(() => {
    // Unique step numbers per edge — a hop reused across walkthroughs (e.g. a
    // shared `capture-event` call) would otherwise stack `4: 4: 4:`.
    const m = new Map<string, number[]>();
    for (const h of hopList) {
      const arr = m.get(h.edgeId) ?? [];
      if (!arr.includes(h.stepNo)) arr.push(h.stepNo);
      m.set(h.edgeId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a - b);
    return m;
  }, [hopList]);
  const focusParticipants = useMemo(
    () => (focusedHop ? new Set([focusedHop.from, focusedHop.to]) : null),
    [focusedHop],
  );

  const nodes: Node[] = useMemo(() => {
    const activeOrder = new Set(activeLayout?.order ?? []);
    const ids = [...display.entries()]
      .filter(([id, r]) => r.o > 0.01 || activeOrder.has(id))
      .map(([id]) => id);
    ids.sort((a, b) => {
      const ga = unionMeta.get(a)?.type === 'subsystem-group' ? 0 : 1;
      const gb = unionMeta.get(b)?.type === 'subsystem-group' ? 0 : 1;
      return ga - gb;
    });
    const out: Node[] = [];
    for (const id of ids) {
      const meta = unionMeta.get(id);
      const rect = display.get(id);
      if (!meta || !rect) continue;
      out.push({
        id,
        type: meta.type,
        position: { x: rect.x, y: rect.y },
        width: rect.w,
        height: rect.h,
        data: meta.data,
        draggable: false,
        selectable: false,
        style: {
          opacity:
            rect.o * (focusParticipants && !focusParticipants.has(id) ? 0.18 : 1),
        },
      } as Node);
    }
    return out;
  }, [display, activeLayout, unionMeta, focusParticipants]);

  // Real graph edges once settled; step focus adds hop numbers and dims the
  // non-focused hops.
  const edges: Edge[] = useMemo(() => {
    if (!settled) return [];
    const list = activeLayout?.edges ?? [];
    const numbering = autoPlaySteps && hopList.length > 0;
    if (!numbering && !focusedHop) return list;
    return list.map((e) => {
      // Number every hop while autoplaying (whole view included); dim only the
      // hops other than the focused one.
      const stepNos = numbering ? stepNoByEdge.get(e.id) : undefined;
      const dimmed = focusedHop ? e.id !== focusedHop.edgeId : false;
      if (!stepNos && !dimmed) return e;
      return {
        ...e,
        data: { ...(e.data as object), stepNos, dimmed },
      } as Edge;
    });
  }, [settled, activeLayout, focusedHop, stepNoByEdge, autoPlaySteps, hopList.length]);

  // Camera: frame a focused hop's endpoints, or the whole graph during the
  // "whole flow" phase.
  useEffect(() => {
    if (walkthroughStepMode !== 'focus' || !settled || !sized || !rfSized || !autoPlaySteps)
      return;
    if (!activeLayout) return;
    const rects = focusedHop
      ? [focusedHop.from, focusedHop.to]
          .map((id) => activeLayout.rects.get(id))
          .filter((r): r is Rect => !!r)
      : [...activeLayout.rects.values()];
    if (rects.length === 0) return;
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    fitBounds(
      { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      { padding: focusedHop ? 0.3 : fitPadding, duration: durationMs },
    );
  }, [
    walkthroughStepMode,
    focusedHop,
    settled,
    sized,
    rfSized,
    activeLayout,
    durationMs,
    fitBounds,
    autoPlaySteps,
    fitPadding,
  ]);

  const callbacks = useMemo(() => (onSelect ? { onSelect } : {}), [onSelect]);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: theme.colors.background,
        ...style,
      }}
    >
      {!layouts ? null : (
        <SubsystemCallbacksProvider value={callbacks}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            className={GRAPH_CANVAS_CLASS}
            {...GRAPH_NAV_PROPS}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            style={{ width: '100%', height: '100%', background: theme.colors.background }}
          >
            <Background />
            <GraphChrome />
          </ReactFlow>
        </SubsystemCallbacksProvider>
      )}
      {activeStepDef?.showWalkthroughTitle && focusedHop && (
        <div
          aria-label={`${focusedHop.walkthroughTitle}, step ${focusedHop.stepNo} of ${focusedHop.total}`}
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            minWidth: 160,
            maxWidth: '60%',
            display: 'flex',
            flexDirection: 'column',
            background: theme.colors.backgroundSecondary ?? theme.colors.background,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 6,
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            overflow: 'hidden',
            opacity: 0.95,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div
            style={{
              padding: '5px 14px',
              fontSize: theme.fontSizes[2] ?? theme.fontSizes[1],
              fontWeight: 600,
              fontFamily: theme.fonts.monospace,
              color: theme.colors.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'center',
            }}
          >
            {focusedHop.walkthroughTitle}
          </div>
          {focusedHop.total > 0 && (
            <div style={{ display: 'flex', gap: 3, padding: '0 6px 5px' }} aria-hidden="true">
              {Array.from({ length: focusedHop.total }, (_, i) => {
                const n = i + 1;
                const active = n === focusedHop.stepNo;
                const done = n < focusedHop.stepNo;
                return (
                  <span
                    key={n}
                    style={{
                      flex: 1,
                      height: 2,
                      borderRadius: 1,
                      background: active
                        ? (theme.colors.accent ?? theme.colors.primary ?? theme.colors.text)
                        : done
                          ? (theme.colors.textSecondary ?? theme.colors.text)
                          : (theme.colors.border ?? 'rgba(127,127,127,0.45)'),
                      opacity: active ? 1 : done ? 0.75 : 0.4,
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SubsystemModelTransition(props: SubsystemModelTransitionProps) {
  return (
    <ReactFlowProvider>
      <TransitionInner {...props} />
    </ReactFlowProvider>
  );
}
