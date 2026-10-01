/**
 * SubsystemComponentGraph — a clickable, read-only React Flow component graph
 * for a subsystem snapshot.
 *
 * Nodes are positioned with ELK auto-layout (layered, minimized crossings,
 * process-aware compound groups). Components sharing a `process` render
 * inside one labeled boundary frame; nodes without one sit outside every
 * boundary. Clicking a component invokes `onSelect`.
 *
 * When the model has components but no topology or trail edges, the
 * canvas is a constructs catalog (list + signature) instead of a graph.
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
import { FileText, X } from 'lucide-react';
import { IndustryMarkdownSlide } from 'themed-markdown';
import {
  buildSubsystemGraph,
  deriveGraphEdges,
  isConstructsOnlyModel,
  moduleGroupNodeId,
  isTrailMechanism,
  edgeColor,
  MECHANISM_DESCRIPTIONS,
  subsystemGraphLayoutKey,
  trailStepGraphEdgeId,
  type SubsystemComponentEdge,
  type SubsystemComponent,
  type SubsystemEdgeProvenance,
  type SubsystemEdgeView,
  type SubsystemGraphifyRelation,
  type SubsystemNodeIssue,
  type SubsystemRegionIssue,
  type SubsystemTrail,
} from './model';
import { ConstructsCatalog } from './ConstructsCatalog';
import type { SubsystemOpenFileOptions } from './declarationRef';
import {
  SubsystemAgentsPanel,
  type SubsystemAgentsPanelProps,
} from './AgentsPanel';
import {
  MaintainLivePanel,
  type MaintainLivePanelProps,
} from '../components/maintain-events/MaintainLivePanel';
import type { TrailSymbolQuery } from '../pierre/PierreTrailCodeView';
import { SubsystemComponentNode, SubsystemGroupNode, SubsystemEdge, SUBSYSTEM_CALLBACKS, hexWithAlpha, EDGE_DIM_ALPHA, fileMatchForNode, flowElementVisibility, flowNodeVisibility } from './nodes';
import { SubsystemDiagnosticToggle, type SubsystemDiagnostic } from './DiagnosticToggle';
import {
  SubsystemIssueList,
  issueCategory,
  issueKindOrder,
  issueRung,
  ISSUE_KIND_ICON,
  ISSUE_RUNG_ORDER,
  type SubsystemIssue,
  type SubsystemIssueCategory,
} from './IssueList';
import { SubsystemFileTree } from './SubsystemFileTree';
import { GraphLayoutCover } from './GraphLayoutCover';
import { GRAPH_CANVAS_CLASS, GRAPH_NAV_PROPS, GraphChrome, GraphLayerStyle } from './graphChrome';
import { ComponentDeclaration } from './ComponentDeclaration';
import type { ComponentVerificationState } from './ComponentDeclaration';
import type { DeclarationSymbolRef, SymbolInspection } from './symbolRefs';
import { FileDrawer, FILE_DRAWER_HEIGHT_MS } from './FileDrawer';
import { buildRepoGroups, repoAvatarUrl, type RepoGroup } from './paths';
import { TrailsPanel, TRAIL_PLAY_PAUSE_MS } from './TrailsPanel';
import {
  EDGE_LABEL_WIDTH,
  EDGE_LABEL_HEIGHT,
  EDGE_LABEL_FONT_SIZE,
  EDGE_LABEL_CLOUD_PATH,
  EDGE_LABEL_CLOUD_EXTRA_TOP,
} from '../utils/edgeLabel';

/** Context passed to `renderTrailViewer` when a flow/step is focused. */
export interface TrailViewerContext {
  trail: SubsystemTrail;
  /** Focused step index; `null` means the whole flow (no specific step). */
  stepIndex: number | null;
  /** Open a step's full source file over the trail drawer (keeps snippets mounted). */
  onOpenFile: (path: string, opts?: SubsystemOpenFileOptions) => void;
  /**
   * Aliases of components marked `proposed`. A step whose file can't be read
   * but whose endpoint is proposed can be labelled as planned, not missing.
   */
  proposedAliases: ReadonlySet<string>;
  /**
   * Resolve a token in a step's snippet to a construct the step touches (its
   * `from`/`to` component), returning that component's alias. `null` when the
   * token names no touched construct. Forward to the code view so constructs
   * read as clickable.
   */
  resolveSymbol?: (query: TrailSymbolQuery) => string | null;
  /** A clicked construct token — open that construct's declaration line. */
  onSymbolClick?: (symbol: string, query: TrailSymbolQuery) => void;
}

/** Identifiers a token could match to name this component as a construct. */
function constructIdentifiers(comp: SubsystemComponent): string[] {
  const ids = new Set<string>();
  if (comp.name) ids.add(comp.name);
  if (comp.symbol) {
    ids.add(comp.symbol);
    for (const part of comp.symbol.split('.')) {
      if (part) ids.add(part);
    }
  }
  return [...ids];
}

type DrawerTarget =
  | { kind: 'file'; file: string; startLine?: number }
  | { kind: 'trail'; trailId: string; stepIndex: number | null };

/**
 * Per-model UI state persisted to `localStorage`, keyed by `persistKey`.
 * Stores the trail working set (which flows are expanded and which
 * flow/step is selected) and which sidebar/diagnostics tab is showing, so
 * tabbing away from a model and back lands you where you left off. Transient
 * things (hover, drag, camera) are not saved.
 */
interface PersistedViewState {
  expandedTrails?: string[];
  focusedTrailId?: string | null;
  focusedStepIndex?: number | null;
  sidebarWidth?: number;
  sidebarView?: 'files' | 'trails';
  diagnosticsTab?: 'issues' | 'agents';
}

const VIEW_STATE_PREFIX = 'principal.subsystems.viewState.';

function readViewState(key: string | undefined): PersistedViewState {
  if (!key || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(VIEW_STATE_PREFIX + key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as PersistedViewState)
      : {};
  } catch {
    return {};
  }
}

function writeViewState(
  key: string | undefined,
  patch: PersistedViewState,
): void {
  if (!key || typeof window === 'undefined') return;
  try {
    const merged = { ...readViewState(key), ...patch };
    window.localStorage.setItem(VIEW_STATE_PREFIX + key, JSON.stringify(merged));
  } catch {
    // Best-effort: private mode / quota — view state is non-critical.
  }
}

export interface SubsystemComponentGraphProps {
  components: SubsystemComponent[];
  /**
   * Ordered runtime trails — one trail per flow. When present the
   * sidebar's bottom half offers a Files/Trails toggle:
   * the flows panel lists each trail's steps (`symbol` or `file:line`);
   * clicking a flow row toggles its steps; clicking a step focuses that
   * step's edge and (when `renderTrailViewer` is set) opens the bottom
   * drawer on that flow's snippets. Opened flows stay on the canvas
   * (unselected ones dimmed); everything else is hidden.
   */
  trails?: SubsystemTrail[];
  /**
   * graphify-native relations (raw static-graph edges: `imports`, `contains`,
   * `re_exports`, …). Display-only, drawn with the separate
   * `GRAPHIFY_RELATION_COLOR` palette so they read as derived facts, distinct
   * from authored subsystem mechanisms. Visible in the `graphify` edge view.
   */
  graphifyRelations?: readonly SubsystemGraphifyRelation[];
  /**
   * Order same-layer nodes by `component.line` (ascending) instead of ELK's
   * crossing-minimizer — reads a source region top-to-bottom. Components need a
   * `line` for this to have any effect. @default false
   */
  orderByLine?: boolean;
  /**
   * Deep-link target: when set, the matching trail is selected on mount
   * — its steps expanded and its flow focused on the canvas. Hosts use this
   * when opening the graph from a trail row in a list. Re-applies on a
   * new id (or a remount); in-tab selection afterwards stays owned by the
   * graph.
   */
  initialTrailId?: string | null;
  /**
   * Called with the next trail order after a drag in the sidebar's
   * flows panel. When set, each row grows a drag grip and a drop emits the
   * reordered array — the host owns persisting it (the graph stays controlled
   * and never reorders its own prop).
   */
  onReorderTrails?: (next: SubsystemTrail[]) => void;
  onSelect?: (componentAlias: string) => void;
  /** Called when an edge is clicked (relationship / mechanism + refs seam). */
  onEdgeSelect?: (edge: SubsystemComponentEdge) => void;
  /** Upper bound for node width in px; nodes grow with content up to this,
   *  then the name wraps. Defaults to 300 for components (320 for packages). */
  maxNodeWidth?: number;
  /** Show edge labels (mechanism names) on the graph. @default true */
  showEdgeLabels?: boolean;
  /**
   * Keep boundary frames for 1-member process / module / package regions. The
   * singleton rule (frames need 2+ members) drops these, which also hid quiet
   * regions like a one-file process that owns real behaviour. Defaults to true
   * here so the component graph matches the aggregate graph, which always keeps
   * them; pass false to fall back to the 2+ member rule.
   */
  showSingletonFrames?: boolean;
  /**
   * How module frames group.
   * - `exact` (default): one frame per distinct `module` string.
   * - `path`: derive directory frames from `module` path segments and nest
   *   module frames inside them (`src` → `src/session` → module).
   */
  moduleNesting?: 'exact' | 'path';
  /**
   * Which edge source the canvas draws. The graphify and trail sources
   * are disjoint, so a graph carrying both shows one or the other — never
   * both. Edges outside the view are hidden (labels go too).
   * - `graphify`: graphify-native static edges (`imports`, `contains`, …)
   * - `trails`: trail step edges (`calls`, `feeds`, …), including
   *   step numbers when a flow is focused/hovered
   * Leave unset to let the sidebar's Files / Trails tab drive it: Files
   * draws graphify edges, Trails draws runtime steps. Without visible
   * tabs, defaults to `trails`.
   */
  edgeView?: SubsystemEdgeView;
  /** Subsystem title displayed in the sidebar. */
  title?: string;
  /**
   * Suppresses the sidebar entirely (title, description, file tree,
   * trails) for graph-only embeds. Pair with `graphTitle` to keep the
   * subsystem name visible as an overlay on the canvas.
   */
  hideSidebar?: boolean;
  /**
   * How trail step highlighting behaves on the canvas.
   * - `focus` (default): zoom to the step, hide non-participants, open drawer
   * - `dim`: keep the full graph, dim non-participants (same as hovering a step)
   */
  trailStepMode?: 'focus' | 'dim';
  /**
   * When true, cycles trail steps automatically using `dim` highlighting
   * (no zoom, no drawer). Loops across all trails that have steps.
   * Useful for graph-only embeds (`hideSidebar`).
   */
  autoPlayTrails?: boolean;
  /** Pause between autoplay steps in ms. @default 2500 */
  trailAutoPlayIntervalMs?: number;
  /**
   * When false, focusing a trail/step does not call `fitView`.
   * @default true
   */
  zoomOnTrailFocus?: boolean;
  /**
   * Duration (ms) of the camera pan/zoom when a trail step or flow is
   * focused. Higher = a slower, more legible flight between steps.
   * @default 300
   */
  trailFocusDurationMs?: number;
  /**
   * Subsystem title rendered as a non-interactive overlay chip on the graph
   * canvas (top-center). Does not trigger the sidebar — for graph-only
   * embeds that still need to name what they show.
   */
  graphTitle?: string;
  /**
   * When true, shows the active trail's title as a non-interactive
   * overlay chip on the canvas (under `graphTitle` when both are set).
   * Uses the focused or hover-highlighted trail.
   */
  showTrailTitle?: boolean;
  /** Markdown description rendered in the sidebar. */
  description?: string;
  /**
   * Controlled open state for the constructs catalog's description overlay.
   * When provided, the host owns it (e.g. a button in its own header).
   */
  descriptionOpen?: boolean;
  onDescriptionOpenChange?: (open: boolean) => void;
  /** Rendered over the graph canvas only (not the title/legend sidebar). */
  canvasOverlay?: ReactNode;
  /**
   * Live agent-run events to show in a collapsible half-height panel over the
   * graph canvas. Omit (or pass null) to hide it.
   */
  liveEvents?: MaintainLivePanelProps | null;
  /**
   * Maintain agent pipeline for the sidebar's diagnostics area. When set, the
   * issues view grows an Issues / Agents tab bar; the Agents tab lists the
   * agents with the router's next stage runnable.
   */
  agentsPanel?: SubsystemAgentsPanelProps | null;
  /** Extra controls at the top of the title/legend sidebar. */
  sidebarExtra?: ReactNode;
  /** Rendered in the sidebar under the description (e.g. selection inspector). */
  sidebarAfterDescription?: ReactNode;
  /**
   * Diagnostics status chip in the sidebar title row (beside the description
   * toggle). Shows the last verification pass's state as an icon color + count,
   * and toggles the sidebar between the diagnostics list and the normal
   * files/trails view. Omit to hide the chip.
   */
  diagnostic?: SubsystemDiagnostic;
  /**
   * Verification issues for this graph (audit findings). When diagnostics are
   * active the sidebar's bottom panel becomes the issue list instead of the
   * file tree / trails.
   */
  issues?: SubsystemIssue[];
  /**
   * Pin diagnostics mode (controlled). When omitted, the sidebar seeds
   * diagnostics on iff `issues` is non-empty, and the title-row chip toggles it.
   */
  showIssues?: boolean;
  /**
   * When the issues list is active, land it focused on this verification
   * layer: that category expands, the rest start collapsed. Optional — the
   * plain issues view expands everything.
   */
  focusIssueCategory?: SubsystemIssueCategory;
  /**
   * Click an issue. The graph first focuses the target on the canvas itself —
   * a component target is selected and framed (any edge / trail focus
   * that would hide it is cleared), and a
   * module target frames that boundary frame — then this fires so the host can
   * open its own detail. Collapsing the card again reverses that (deselect +
   * zoom out). Other target kinds (flow / repo) have no node to frame and just
   * forward here.
   */
  onSelectIssue?: (issue: SubsystemIssue) => void;
  /** Apply an issue's deterministic fix. */
  onApplyIssueFix?: (issue: SubsystemIssue) => void;
  /** Hover an issue — transiently highlight its target (null on leave). */
  onHoverIssue?: (issue: SubsystemIssue | null) => void;
  /**
   * Host-injected reader/renderer for the bottom file drawer, keyed by
   * repo-root-relative path. Opening happens on declaration/file-tree clicks.
   * Keeps this package free of fs and code-view dependencies.
   */
  renderFileViewer?: (file: string, opts?: SubsystemOpenFileOptions) => ReactNode;
  /**
   * Host-injected multi-snippet viewer for a focused trail. When set,
   * clicking a flow step opens the bottom drawer with this content and
   * updates it as the focused step changes.
   */
  renderTrailViewer?: (ctx: TrailViewerContext) => ReactNode;
  /**
   * Suppress the bottom file/trail drawer entirely. Focusing a step then
   * only frames it on the canvas (and dims the rest) without dropping a snippet
   * panel below — for embeds that want the camera to tell the story. Defaults
   * to false.
   */
  hideDrawer?: boolean;
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
  /** Live verification status for the selected component. */
  componentVerification?: ComponentVerificationState | null;
  /**
   * Referenced-symbol click in the declaration panel → resolve it against the
   * host's graphify cache. The graph supplies the selected component's
   * purl/file so the host can pick the right repo graph; the host returns what
   * graphify knows (declaration / source / candidates).
   */
  onInspectSymbol?: (req: {
    purl: string;
    file: string;
    symbol: string;
    ref: DeclarationSymbolRef;
  }) => Promise<SymbolInspection | null> | SymbolInspection | null;
  /**
   * When set, the graph's trail working set — expanded flows and the
   * selected flow/step — is persisted to `localStorage` under this key and
   * restored on mount. Hosts key it by the model id so each model remembers
   * where the user left off. Omit to keep the state purely in-memory.
   */
  persistKey?: string;
  /**
   * Explicit frame colors for boundary regions, keyed by region key (the
   * component's `process` / `module` value, or the package purl key). A key
   * present here overrides the library's derived `packageColor`. Hosts use this
   * to pin the colors a given surface cares about (e.g. a marketing hero)
   * instead of accepting the hash. Unmapped regions keep the derived color.
   */
  boundaryColors?: Record<string, string>;
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
  fullFile,
}: {
  render: (file: string, opts?: SubsystemOpenFileOptions) => ReactNode;
  file: string;
  startLine?: number;
  fullFile?: boolean;
}) {
  return (
    <>
      {render(
        file,
        startLine != null
          ? { startLine, ...(fullFile ? { fullFile: true } : {}) }
          : undefined,
      )}
    </>
  );
});

function FileOverlayCloseButton({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClose}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Close file"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        padding: 0,
        border: 'none',
        borderRadius: 4,
        background: hover ? theme.colors.border : 'transparent',
        color: hover ? theme.colors.text : muted,
        cursor: 'pointer',
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      <X size={14} />
    </button>
  );
}

const TrailDrawerContent = memo(function TrailDrawerContent({
  render,
  trail,
  stepIndex,
  onOpenFile,
  proposedAliases,
  resolveSymbol,
  onSymbolClick,
}: {
  render: (ctx: TrailViewerContext) => ReactNode;
  trail: SubsystemTrail;
  stepIndex: number | null;
  onOpenFile: (path: string, opts?: SubsystemOpenFileOptions) => void;
  proposedAliases: ReadonlySet<string>;
  resolveSymbol?: (query: TrailSymbolQuery) => string | null;
  onSymbolClick?: (symbol: string, query: TrailSymbolQuery) => void;
}) {
  return (
    <>
      {render({
        trail,
        stepIndex,
        onOpenFile,
        proposedAliases,
        resolveSymbol,
        onSymbolClick,
      })}
    </>
  );
});

interface InnerProps extends SubsystemComponentGraphProps {
  measured: { w: number; h: number } | null;
}

function Inner({ components, trails, graphifyRelations, orderByLine, initialTrailId, onReorderTrails, onSelect, onEdgeSelect, measured: _measured, maxNodeWidth, showEdgeLabels, showSingletonFrames = true, moduleNesting, edgeView, title, hideSidebar, trailStepMode = 'focus', autoPlayTrails = false, trailAutoPlayIntervalMs = TRAIL_PLAY_PAUSE_MS, zoomOnTrailFocus = true, trailFocusDurationMs = 300, graphTitle, showTrailTitle = false, description, canvasOverlay, sidebarExtra, sidebarAfterDescription, diagnostic, issues, showIssues, focusIssueCategory, onSelectIssue, onApplyIssueFix, onHoverIssue, renderFileView, renderFileViewer, renderTrailViewer, onFileSelect, componentVerification, onInspectSymbol, boundaryColors, hideDrawer = false, persistKey, liveEvents, agentsPanel }: InnerProps) {
  const { theme } = useTheme();
  const { fitView, fitBounds, screenToFlowPosition } = useReactFlow();
  const viewport = useViewport();
  // Restored once per mount from `localStorage` (see `readViewState`). Each
  // graph is its own tab/mount, so `persistKey` is stable for a mount.
  const persisted = useMemo(() => readViewState(persistKey), [persistKey]);
  const graphEdges = useMemo(
    () => deriveGraphEdges({ trails }),
    [trails],
  );
  const [built, setBuilt] = useState<{
    nodes: Node[];
    edges: Edge[];
    absoluteRects: Map<string, { x: number; y: number; width: number; height: number }>;
  }>({
    nodes: [],
    edges: [],
    absoluteRects: new Map(),
  });
  const [layoutReady, setLayoutReady] = useState(false);
  const [selected, setSelected] = useState<SubsystemComponent | null>(null);
  /** Bottom drawer: single file or trail multi-snippet mode. */
  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget | null>(null);
  /** Full-file layer over an open trail drawer — trail stays mounted. */
  const [fileOverlay, setFileOverlay] = useState<{
    file: string;
    startLine?: number;
  } | null>(null);
  // Mirror so step-focus can decide whether to wait for the drawer open
  // transition before fitView (avoids framing against full-height canvas).
  const drawerOpenRef = useRef(false);
  drawerOpenRef.current = drawerTarget != null;
  // Pending deferred fit after opening the drawer; cancelled on re-entry / unmount.
  const pendingFocusFitRef = useRef<number | null>(null);
  // Component the pointer is over (null on leave) → transient tree highlight.
  const [hoveredComponentAlias, setHoveredComponentId] = useState<string | null>(null);
  // Boundary frame hovered on the canvas → highlight the matching folder row in
  // the sidebar file tree, so a frame's place in the repo tree is visible.
  const [hoveredRegion, setHoveredRegion] = useState<{
    kind: string;
    key: string;
  } | null>(null);
  const hoveredBoundaryPath =
    hoveredRegion && (hoveredRegion.kind === 'module' || hoveredRegion.kind === 'directory')
      ? hoveredRegion.key
      : null;
  // Path frames (module / directory) as absolute flow-coord rects, hit-tested
  // on pointer move. A pointer hit-test keeps the frames' interior hoverable
  // WITHOUT an overlay that would block edges / child nodes.
  const pathFrameRects = useMemo(() => {
    const out: Array<{ kind: string; key: string; x: number; y: number; w: number; h: number }> = [];
    for (const n of built.nodes) {
      if (n.type !== 'subsystem-group') continue;
      const region = (n.data as { region?: { kind?: string; key?: string } } | undefined)?.region;
      if (!region?.key || (region.kind !== 'module' && region.kind !== 'directory')) continue;
      const r = built.absoluteRects.get(n.id);
      if (!r) continue;
      out.push({ kind: region.kind, key: region.key, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    return out;
  }, [built.nodes, built.absoluteRects]);
  useEffect(() => {
    if (pathFrameRects.length === 0) return;
    let raf = 0;
    let last: { x: number; y: number } | null = null;
    const overCanvas = (e: MouseEvent): boolean =>
      e.composedPath().some(
        (el) => el instanceof HTMLElement && el.classList.contains(GRAPH_CANVAS_CLASS),
      );
    const onMove = (e: MouseEvent) => {
      if (!overCanvas(e)) {
        last = null;
        setHoveredRegion((prev) => (prev == null ? prev : null));
        return;
      }
      last = { x: e.clientX, y: e.clientY };
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        if (!last) return;
        const p = screenToFlowPosition(last);
        let best: { kind: string; key: string } | null = null;
        let bestArea = Number.POSITIVE_INFINITY;
        for (const f of pathFrameRects) {
          if (p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) {
            const area = f.w * f.h;
            if (area < bestArea) {
              bestArea = area;
              best = { kind: f.kind, key: f.key };
            }
          }
        }
        setHoveredRegion((prev) =>
          prev?.kind === best?.kind && prev?.key === best?.key ? prev : best,
        );
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pathFrameRects, screenToFlowPosition]);
  // Trail focus — selected flow (or step) is full strength; other
  // opened-flow members stay visible but dimmed; everything else is hidden.
  // Restored from the persisted view state when a `persistKey` is set.
  const [focusedTrailId, setFocusedTrailId] = useState<string | null>(
    persisted.focusedTrailId ?? null,
  );
  // `null` = whole flow focused; a number = that single step's edge focused.
  const [focusedStepIndex, setFocusedStepIndex] = useState<number | null>(
    persisted.focusedStepIndex ?? null,
  );
  // Hovered trail in the flows panel: dims every canvas node/edge not
  // involved in the hover preview (or selected ∪ hovered when a step is
  // focused). `stepIndex: null` = whole flow (collapsed title hover);
  // a number = that step. Transient — no drawer. Camera only reframes when
  // a step is already selected.
  const [hoveredTrailStep, setHoveredTrailStep] = useState<{
    trailId: string;
    stepIndex: number | null;
  } | null>(null);
  // Sidebar bottom half: which panel is shown when trails exist.
  // The persisted value is membership-checked rather than trusted: a stale
  // localStorage entry from before the walkthrough->trail rename would match
  // neither panel and render a blank sidebar with no selected tab.
  const [sidebarView, setSidebarView] = useState<'files' | 'trails'>(() => {
    const stored = persisted.sidebarView;
    const restored: 'files' | 'trails' =
      stored === 'files' || stored === 'trails' ? stored : 'trails';
    return trails?.length ? restored : 'files';
  });
  // Diagnostics area tab: issues list vs the Maintain agent pipeline.
  const [diagnosticsTab, setDiagnosticsTab] = useState<'issues' | 'agents'>(
    () => persisted.diagnosticsTab ?? 'issues',
  );
  // One edge source at a time. When the caller doesn't pick, the sidebar's
  // Files / Trails tab picks: Files draws graphify static edges,
  // Trails draws runtime step edges. Without visible tabs (no trails,
  // or a sidebar-less embed) fall back to trail edges.
  const sidebarTabsVisible = !hideSidebar && (trails?.length ?? 0) > 0;
  const resolvedEdgeView: SubsystemEdgeView =
    edgeView ??
    (sidebarTabsVisible
      ? (sidebarView === 'trails' ? 'trails' : 'graphify')
      : (trails?.length ?? 0) > 0
        ? 'trails'
        : (graphifyRelations?.length ?? 0) > 0
          ? 'graphify'
          : 'trails');
  // Trail flows the user has expanded (via the title row). Closed by
  // default so a graph with several flows doesn't dump every step list at once.
  // Restored from the persisted view state when a `persistKey` is set.
  const [expandedTrails, setExpandedTrails] = useState<Set<string>>(
    () => new Set(persisted.expandedTrails ?? []),
  );
  // Sidebar description visibility. Hidden by default so the files/flows
  // panel gets the vertical room; the title-row toggle reveals it.
  const [descriptionVisible, setDescriptionVisible] = useState(false);
  const [descToggleHover, setDescToggleHover] = useState(false);
  // `true` only when a description exists AND the user opened it.
  const showDesc = !!description && descriptionVisible;
  // Sidebar width (px). Draggable via the resize handle between the sidebar
  // and the graph canvas; clamps to sensible bounds while dragging. Restored
  // from the persisted view state when a `persistKey` is set.
  const [sidebarWidth, setSidebarWidth] = useState(persisted.sidebarWidth ?? 450);
  const [sidebarDrag, setSidebarDrag] = useState(false);
  const sidebarDragStartX = useRef(0);
  const sidebarDragStartWidth = useRef(450);
  // Mirror of `sidebarWidth` for the drag-end persist (the mouseup listener
  // closes over the drag-start render).
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const sidebarMinWidth = 240;
  const sidebarMaxWidth = useMemo(
    () => Math.max(Math.min((_measured?.w ?? 680) * 0.5, 600), sidebarMinWidth),
    [_measured?.w],
  );
  // Resize drag: capture the drag state so document-level move/up listeners
  // stay attached for the duration of the gesture, then release on mouseup.
  const onSidebarResizeStart = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      sidebarDragStartX.current = e.clientX;
      sidebarDragStartWidth.current = sidebarWidth;
      setSidebarDrag(true);
    },
    [sidebarWidth],
  );
  useEffect(() => {
    if (!sidebarDrag) return;
    const onMove = (e: globalThis.MouseEvent) => {
      const delta = e.clientX - sidebarDragStartX.current;
      const next = Math.min(
        Math.max(sidebarDragStartWidth.current + delta, sidebarMinWidth),
        sidebarMaxWidth,
      );
      setSidebarWidth(next);
    };
    const onUp = () => {
      setSidebarDrag(false);
      // Persist only on drag end — not on every mousemove.
      writeViewState(persistKey, { sidebarWidth: sidebarWidthRef.current });
      // Re-fit the canvas so the graph re-centers in the new available space.
      requestAnimationFrame(() => fitView());
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [sidebarDrag, sidebarMaxWidth, fitView, persistKey]);
  // Persist the trail working set per model. Each write merges into the
  // stored blob, so the three fields never clobber one another.
  useEffect(() => {
    if (!persistKey) return;
    writeViewState(persistKey, {
      expandedTrails: Array.from(expandedTrails),
    });
  }, [persistKey, expandedTrails]);
  useEffect(() => {
    if (!persistKey) return;
    writeViewState(persistKey, { focusedTrailId });
  }, [persistKey, focusedTrailId]);
  useEffect(() => {
    if (!persistKey) return;
    writeViewState(persistKey, { focusedStepIndex });
  }, [persistKey, focusedStepIndex]);
  useEffect(() => {
    if (!persistKey) return;
    writeViewState(persistKey, { sidebarView });
  }, [persistKey, sidebarView]);
  useEffect(() => {
    if (!persistKey) return;
    writeViewState(persistKey, { diagnosticsTab });
  }, [persistKey, diagnosticsTab]);
  // Ref mirror of `selected` so the SUBSYSTEM_CALLBACKS click handler (a
  // closure over the effect deps) can toggle without a stale value.
  const selectedRef = useRef<SubsystemComponent | null>(null);
  selectedRef.current = selected;
  // The module frame an issue card framed. A module target selects no node and
  // no edge, so nothing else records that focus — without this the canvas has
  // no way to tell a module focus it still owns from one a later click took
  // over, and the camera would stay parked on the region forever.
  const issueModuleFocusRef = useRef<string | null>(null);
  // Ref mirror of the open file drawer target for tree-click toggle.
  const openFileRef = useRef<{ file: string; startLine?: number } | null>(null);
  const openFile =
    fileOverlay?.file ??
    (drawerTarget?.kind === 'file' ? drawerTarget.file : null);
  openFileRef.current = fileOverlay
    ? { file: fileOverlay.file, startLine: fileOverlay.startLine }
    : drawerTarget?.kind === 'file'
      ? { file: drawerTarget.file, startLine: drawerTarget.startLine }
      : null;

  const focusedTrail = useMemo(() => {
    if (drawerTarget?.kind !== 'trail' || !trails) return null;
    return trails.find((t) => t.id === drawerTarget.trailId) ?? null;
  }, [drawerTarget, trails]);
  // Autoplay focus: a sidebar-less embed has no expanded flow to "open", so
  // branding every step as a selection would hide all other nodes. Instead the
  // autoplay sets this (flow id + step) to frame the step and dim the rest —
  // same treatment as hover — without hiding anything. Declared before the
  // overlay memos, which read it to title the canvas chip + step bar.
  const [autoPlayFocus, setAutoPlayFocus] = useState<
    { trailId: string; stepIndex: number } | null
  >(null);
  // Ref mirror of the drawer's trail id so the symbol resolver stays
  // stable across graph re-renders (the drawer is memoized on callback identity).
  const drawerTrailIdRef = useRef<string | null>(null);
  drawerTrailIdRef.current = focusedTrail?.id ?? null;

  // Trail shown on the canvas title chip (focus, hover highlight, or
  // autoplay focus).
  const overlayTrailTitle = useMemo(() => {
    if (!showTrailTitle || !trails?.length) return null;
    const id =
      focusedTrailId ??
      autoPlayFocus?.trailId ??
      hoveredTrailStep?.trailId;
    if (!id) return null;
    return trails.find((t) => t.id === id)?.title ?? null;
  }, [
    showTrailTitle,
    trails,
    focusedTrailId,
    autoPlayFocus,
    hoveredTrailStep,
  ]);

  // Active step for the bottom-of-title progress + annotation chip.
  const overlayTrailStep = useMemo(() => {
    if (!showTrailTitle || !trails?.length) return null;
    const tlId =
      focusedTrailId ??
      autoPlayFocus?.trailId ??
      hoveredTrailStep?.trailId ??
      null;
    let stepIndex: number | null = null;
    if (focusedTrailId != null) {
      stepIndex = focusedStepIndex;
    } else if (autoPlayFocus != null) {
      stepIndex = autoPlayFocus.stepIndex;
    } else if (hoveredTrailStep != null) {
      stepIndex = hoveredTrailStep.stepIndex;
    }
    if (tlId == null || stepIndex == null) return null;
    const tl = trails.find((t) => t.id === tlId);
    const step = tl?.steps[stepIndex];
    if (!step || !tl) return null;
    return {
      index: stepIndex + 1,
      total: tl.steps.length,
      annotation: step.annotation,
    };
  }, [
    showTrailTitle,
    trails,
    focusedTrailId,
    focusedStepIndex,
    autoPlayFocus,
    hoveredTrailStep,
  ]);

  const drawerTitle = useMemo(() => {
    if (!drawerTarget) return null;
    if (drawerTarget.kind === 'file') return drawerTarget.file;
    const tl = focusedTrail;
    if (!tl) return null;
    if (drawerTarget.stepIndex == null) return tl.title;
    const step = tl.steps[drawerTarget.stepIndex];
    if (!step) return tl.title;
    const site = `${step.file.split('/').pop() ?? step.file}:${step.line}`;
    return `${tl.title} · ${site}`;
  }, [drawerTarget, focusedTrail]);

  // Refresh selected component when the components list updates (e.g. verify
  // writes back declarationRef).
  useEffect(() => {
    if (!selected) return;
    const fresh = components.find((c) => c.alias === selected.alias);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [components, selected]);

  // Pass 1: build with estimated widths so React Flow can measure the DOM.
  // The pane stays hidden until Pass 2 completes. Key off layout-affecting
  // fields only — declarationRef updates after verify must not re-run ELK.
  const layoutKey = useMemo(
    () => subsystemGraphLayoutKey({ components, trails, graphifyRelations }),
    [components, trails, graphifyRelations],
  );
  const componentsRef = useRef(components);
  const trailsRef = useRef(trails);
  const graphifyRelationsRef = useRef(graphifyRelations);
  componentsRef.current = components;
  trailsRef.current = trails;
  graphifyRelationsRef.current = graphifyRelations;

  // Track measured dimensions from React Flow's dimension changes.
  // These arrive as { type: 'dimensions', id, dimensions } in onNodesChange.
  // Retained across same-id layoutKey updates so Pass 2 can run without a remount.
  const measuredDimsRef = useRef(new Map<string, { width: number; height: number }>());
  const pendingMeasuredRef = useRef(false);
  const prevMeasuredSigRef = useRef('');
  const pass2DoneRef = useRef(false);
  const pass2GenRef = useRef(0);

  useEffect(() => {
    let alive = true;
    pass2DoneRef.current = false;
    prevMeasuredSigRef.current = '';
    // Bump generation so any in-flight Pass 2 from the prior layoutKey is ignored.
    pass2GenRef.current += 1;
    const doc = {
      components: componentsRef.current,
      trails: trailsRef.current,
    };
    void buildSubsystemGraph(doc, {
      maxNodeWidth,
      showEdgeLabels,
      showSingletonFrames,
      moduleNesting,
      graphifyRelations: graphifyRelationsRef.current,
      orderByLine,
    })
      .then(({ nodes, edges: e, absoluteRects }) => {
        if (!alive) return;
        // Prune dims for removed leaves; keep measurements for stable ids so a
        // live update can finish Pass 2 without waiting on new `dimensions` events.
        const leafIds = new Set(
          nodes.filter((n) => n.type !== 'subsystem-group').map((n) => n.id),
        );
        for (const id of measuredDimsRef.current.keys()) {
          if (!leafIds.has(id)) measuredDimsRef.current.delete(id);
        }
        setBuilt({ nodes, edges: e as Edge[], absoluteRects });
        setLayoutReady(false);
      })
      .catch((err) => {
        console.warn('[subsystem-graph] initial layout failed:', err);
        if (!alive) return;
        // Reveal the cover even on failure so the UI is not stuck forever.
        setBuilt({ nodes: [], edges: [], absoluteRects: new Map() });
        setLayoutReady(true);
      });
    return () => { alive = false; };
  }, [layoutKey, maxNodeWidth, showEdgeLabels, moduleNesting]);

  // Pass 2: once every leaf node has a measured dimension, re-run ELK.
  // Group parents are sized by ELK, not measured — exclude them or pass 2
  // would wait forever for dimensions that never arrive.
  const triggerPass2 = useCallback(() => {
    if (pass2DoneRef.current) return;
    const dims = measuredDimsRef.current;
    const leafNodes = built.nodes.filter((n) => n.type !== 'subsystem-group');
    if (leafNodes.length === 0) {
      pass2DoneRef.current = true;
      setLayoutReady(true);
      return;
    }
    if (dims.size < leafNodes.length) return;
    const sig = leafNodes.map((n) => `${n.id}:${dims.get(n.id)?.width ?? '?'}`).join(',');
    if (sig.includes('?:')) return;
    if (sig === prevMeasuredSigRef.current) return;
    prevMeasuredSigRef.current = sig;
    pendingMeasuredRef.current = false;
    pass2DoneRef.current = true;

    const measuredWidths = new Map(leafNodes.map((n) => [n.id, dims.get(n.id)!.width]));
    const measuredHeights = new Map(leafNodes.map((n) => [n.id, dims.get(n.id)!.height]));
    const gen = ++pass2GenRef.current;
    void buildSubsystemGraph(
      { components, trails },
      { maxNodeWidth, showEdgeLabels, measuredWidths, measuredHeights, showSingletonFrames, moduleNesting, graphifyRelations, orderByLine },
    )
      .then(({ nodes, edges: e, absoluteRects }) => {
        if (gen !== pass2GenRef.current) return;
        setBuilt({ nodes, edges: e as Edge[], absoluteRects });
        setLayoutReady(true);
      })
      .catch((err) => {
        console.warn('[subsystem-graph] measured layout failed:', err);
        if (gen !== pass2GenRef.current) return;
        // Reveal Pass 1 layout rather than leaving the cover up forever.
        setLayoutReady(true);
      });
  }, [built.nodes, components, trails, graphifyRelations, orderByLine, maxNodeWidth, showEdgeLabels, moduleNesting]);

  // After Pass 1 commits, try Pass 2 immediately with retained measurements.
  // Same-id live updates often get no new React Flow `dimensions` events, so
  // waiting only on onNodesChange leaves the cover stuck.
  useEffect(() => {
    if (layoutReady) return;
    if (built.nodes.length === 0) return;
    queueMicrotask(() => triggerPass2());
  }, [built, layoutReady, triggerPass2]);

  // Safety net: never leave the cover up if measurements never arrive (e.g. new
  // leaf ids before remount) and Pass 2 cannot run.
  useEffect(() => {
    if (layoutReady) return;
    if (built.nodes.length === 0) return;
    const t = setTimeout(() => {
      setLayoutReady((ready) => {
        if (ready) return ready;
        console.warn('[subsystem-graph] Pass 2 timed out; revealing Pass 1 layout');
        return true;
      });
    }, 2500);
    return () => clearTimeout(t);
  }, [built, layoutReady]);

  // Node components call SUBSYSTEM_CALLBACKS.onSelect on click (their inner
  // onClick stops React Flow propagation), so wire selection + width through it.
  // Lookup from edge id → the authored SubsystemComponentEdge (for onEdgeSelect).
  const edgeById = useMemo(() => new Map(graphEdges.map((e) => [e.id, e])), [graphEdges]);

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
      // A direct edge selection on the canvas supersedes any trail focus.
      setFocusedTrailId(null);
      setFocusedStepIndex(null);
      if (src) onEdgeSelect?.(src);
    },
    [edgeById, onEdgeSelect],
  );

  useEffect(() => {
    SUBSYSTEM_CALLBACKS.onSelect = (alias: string) => {
      const comp = components.find((c) => c.alias === alias);
      if (comp) {
        // Clicking the already-selected node unselects it (toggle off).
        // Selection is independent of the file drawer — nodes never open it.
        if (selectedRef.current?.alias === comp.alias) {
          setSelected(null);
          setSelectedEdgeId(null);
          return;
        }
        setSelected(comp);
        setSelectedEdgeId(null);
        setFocusedTrailId(null);
        setFocusedStepIndex(null);
        onSelect?.(alias);
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

  // Resolve an issue's component target to the matching node. `id` is the
  // stable alias; `label` may be an alias, name, or symbol. Non-component
  // targets (module / flow / repo) have no single node → null.
  const issueComponent = useCallback(
    (issue: SubsystemIssue): SubsystemComponent | null => {
      const target = issue.target;
      if (target?.kind !== 'component') return null;
      return (
        components.find(
          (c) =>
            (target.id != null && c.alias === target.id) ||
            c.alias === target.label ||
            c.name === target.label ||
            c.symbol === target.label,
        ) ?? null
      );
    },
    [components],
  );

  // A `module` issue target names a boundary frame, so focusing the card frames
  // that region on the canvas. Null when the target names no frame (a singleton
  // dropped from the layout, or a region key nothing declares).
  const issueModuleNodeId = useCallback(
    (issue: SubsystemIssue): string | null => {
      const target = issue.target;
      if (target?.kind !== 'module') return null;
      const key = target.id ?? target.label;
      if (!components.some((c) => c.module?.trim() === key)) return null;
      return moduleGroupNodeId(key);
    },
    [components],
  );

  // A `step` issue target names ONE step of a trail — the trail id in
  // `id`, the 0-based step position in `stepIndex`. Validated against the loaded
  // trails so a finding left over from an edited flow resolves to null
  // rather than framing whatever now happens to sit at that index.
  const issueStep = useCallback(
    (
      issue: SubsystemIssue,
    ): { trail: SubsystemTrail; stepIndex: number } | null => {
      const target = issue.target;
      if (target?.kind !== 'step') return null;
      if (target.id == null || target.stepIndex == null) return null;
      const trail = trails?.find((t) => t.id === target.id);
      if (!trail?.steps[target.stepIndex]) return null;
      return { trail, stepIndex: target.stepIndex };
    },
    [trails],
  );

  // Per-node diagnostics badge: fold each component-targeted finding that maps
  // to a verification rung into one badge per node — worst severity wins, the
  // chip shows the earliest failing rung, and the count tallies the findings.
  const issueBadgeByAlias = useMemo(() => {
    const map = new Map<string, SubsystemNodeIssue>();
    if (!issues?.length) return map;
    for (const issue of issues) {
      const rung = issueRung(issue.kind);
      if (!rung) continue;
      const comp = issueComponent(issue);
      if (!comp) continue;
      const prev = map.get(comp.alias);
      map.set(comp.alias, {
        severity:
          prev?.severity === 'error' || issue.severity === 'error'
            ? 'error'
            : 'info',
        rung:
          prev != null && ISSUE_RUNG_ORDER[prev.rung] <= ISSUE_RUNG_ORDER[rung]
            ? prev.rung
            : rung,
        count: (prev?.count ?? 0) + 1,
      });
    }
    return map;
  }, [issues, issueComponent]);

  // Per-frame diagnostics badge: the same fold, but for findings about a
  // BOUNDARY rather than a construct. Keyed by the region's React Flow node id.
  // Only kinds with a dedicated frame icon qualify (`ISSUE_KIND_ICON`) — a
  // finding with no icon of its own has nothing to badge the frame with, and
  // borrowing its layer's icon would imply the frame is at fault for it.
  const regionIssueByNodeId = useMemo(() => {
    const map = new Map<string, SubsystemRegionIssue>();
    if (!issues?.length) return map;
    for (const issue of issues) {
      const target = issue.target;
      if (target?.kind !== 'module' || !ISSUE_KIND_ICON[issue.kind]) continue;
      const id = moduleGroupNodeId(target.id ?? target.label);
      const prev = map.get(id);
      map.set(id, {
        severity:
          prev?.severity === 'error' || issue.severity === 'error' ? 'error' : 'info',
        kind:
          prev != null && issueKindOrder(prev.kind) <= issueKindOrder(issue.kind)
            ? prev.kind
            : issue.kind,
        count: (prev?.count ?? 0) + 1,
      });
    }
    return map;
  }, [issues]);

  // Expanded verification layers in the diagnostics list. When any layer with
  // findings is expanded, the canvas dims everything that layer does not
  // implicate (see `issueFocus`). The list publishes this through
  // `onExpandedCategoriesChange`; empty while every layer is collapsed.
  const [expandedIssueCategories, setExpandedIssueCategories] = useState<
    SubsystemIssueCategory[]
  >([]);
  // Stable setter — the list re-emits on mount and on every toggle, so compare
  // before storing to avoid churn (and to keep the list effect's dep stable).
  const handleExpandedCategoriesChange = useCallback(
    (cats: SubsystemIssueCategory[]) => {
      setExpandedIssueCategories((prev) =>
        prev.length === cats.length && prev.every((c, i) => c === cats[i])
          ? prev
          : cats,
      );
    },
    [],
  );

  // Resolve a component name / symbol / alias reference to a component alias.
  const resolveAlias = useCallback(
    (ref: string): string | null => {
      const clean = ref.replace(/\(\)$/, '').trim();
      const c = components.find(
        (x) =>
          x.alias === clean ||
          x.name === clean ||
          (x.symbol != null && x.symbol.replace(/\(\)$/, '') === clean),
      );
      return c?.alias ?? null;
    },
    [components],
  );

  // Graph elements implicated by the expanded layers' findings — the bright set
  // the canvas keeps while everything else dims. Derived from each finding's
  // target:
  //   component   → that node
  //   module      → every component in that module
  //   trail → the flow's nodes + its step edges
  //   repo        → every component of that repo
  //   graph       → whole-graph finding; implicates nothing specific
  // Returns null when nothing is expanded, no expanded layer has findings, or
  // the findings implicate nothing — so no dimming is applied.
  const issueFocus = useMemo(() => {
    if (!issues?.length || expandedIssueCategories.length === 0) return null;
    const active = new Set(expandedIssueCategories);
    const activeIssues = issues.filter((i) => active.has(issueCategory(i)));
    if (activeIssues.length === 0) return null;
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    for (const issue of activeIssues) {
      const t = issue.target;
      if (!t) continue; // whole-graph finding — no specific element
      if (t.kind === 'component') {
        const a = resolveAlias(t.id ?? t.label);
        if (a) nodeIds.add(a);
      } else if (t.kind === 'module') {
        const key = t.id ?? t.label;
        const prefix = `${key.replace(/\/$/, '')}/`;
        for (const c of components) {
          if (
            c.module === key ||
            c.file === key ||
            (c.file !== '' && c.file.endsWith(key)) ||
            c.file.startsWith(prefix)
          ) {
            nodeIds.add(c.alias);
          }
        }
      } else if (t.kind === 'trail') {
        const wt = (trails ?? []).find(
          (w) => w.id === t.id || w.title === t.label,
        );
        if (wt) {
          for (const s of wt.steps) {
            nodeIds.add(s.from);
            nodeIds.add(s.to);
            edgeIds.add(trailStepGraphEdgeId(s));
          }
        }
      } else if (t.kind === 'repo') {
        const key = t.id ?? t.label;
        for (const c of components) {
          if (c.purl === key) nodeIds.add(c.alias);
        }
      }
    }
    if (nodeIds.size === 0 && edgeIds.size === 0) return null;
    // An edge whose endpoints both sit in the bright set stays lit too, so a
    // focused cluster doesn't read as isolated nodes.
    for (const e of baseEdges) {
      if (nodeIds.has(e.source) && nodeIds.has(e.target)) edgeIds.add(e.id);
    }
    return { nodeIds, edgeIds };
  }, [issues, expandedIssueCategories, components, trails, resolveAlias]);
  const issueFocusNodeIds = issueFocus?.nodeIds ?? null;
  const issueFocusEdgeIds = issueFocus?.edgeIds ?? null;

  // When an edge is selected, dim every other edge + its label to focus it.
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // Ref mirror so `selectEdge` (a useCallback over early deps) can toggle
  // without a stale closure value.
  const selectedEdgeIdRef = useRef<string | null>(null);
  selectedEdgeIdRef.current = selectedEdgeId;
  // Ref mirrors of the focused step, so `unfocusIssueTarget` (a useCallback
  // over early deps) can tell a step focus it still owns from one the user has
  // since moved elsewhere in the trail panel.
  const focusedStepRef = useRef<{ trailId: string; stepIndex: number } | null>(
    null,
  );
  focusedStepRef.current =
    focusedTrailId != null && focusedStepIndex != null
      ? { trailId: focusedTrailId, stepIndex: focusedStepIndex }
      : null;

  // Edge ids in trail focus (an active flow's edge set, or a single
  // step's edge). Used to frame the camera. `null` = no trail focus.
  const focusEdgeIds = useMemo(() => {    if (autoPlayFocus) {
      const tl = trails?.find((t) => t.id === autoPlayFocus.trailId);
      const step = tl?.steps[autoPlayFocus.stepIndex];
      return step ? new Set([trailStepGraphEdgeId(step)]) : null;
    }
    if (focusedTrailId == null || !trails) return null;
    const tl = trails.find((t) => t.id === focusedTrailId);
    if (!tl) return null;
    if (focusedStepIndex != null) {
      const step = tl.steps[focusedStepIndex];
      return step ? new Set([trailStepGraphEdgeId(step)]) : null;
    }
    return new Set(tl.steps.map((s) => trailStepGraphEdgeId(s)));
  }, [trails, focusedTrailId, focusedStepIndex, autoPlayFocus]);

  // 1-based step numbers per edge of the active flow (focused or
  // hover/autoplay-highlighted). An edge can appear in more than one step.
  const selectedFlowStepNos = useMemo(() => {
    const activeId = focusedTrailId ?? hoveredTrailStep?.trailId;
    if (activeId == null || !trails) return null;
    const tl = trails.find((t) => t.id === activeId);
    if (!tl) return null;
    const map = new Map<string, number[]>();
    tl.steps.forEach((s, i) => {
      const list = map.get(trailStepGraphEdgeId(s)) ?? [];
      list.push(i + 1);
      map.set(trailStepGraphEdgeId(s), list);
    });
    return map;
  }, [trails, focusedTrailId, hoveredTrailStep]);

  // Union of every expanded (opened) trail's edges — the visible set.
  const openedEdgeIds = useMemo(() => {
    if (!trails || expandedTrails.size === 0) return null;
    const ids = new Set<string>();
    for (const tl of trails) {
      if (!expandedTrails.has(tl.id)) continue;
      for (const s of tl.steps) ids.add(trailStepGraphEdgeId(s));
    }
    return ids.size > 0 ? ids : null;
  }, [trails, expandedTrails]);

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
  // Edge/nodes involved in the hovered step or whole flow.
  const hoverEdgeIds = useMemo(() => {
    if (!hoveredTrailStep || !trails) return null;
    const tl = trails.find((t) => t.id === hoveredTrailStep.trailId);
    if (!tl) return null;
    if (hoveredTrailStep.stepIndex == null) {
      return new Set(tl.steps.map((s) => trailStepGraphEdgeId(s)));
    }
    const step = tl.steps[hoveredTrailStep.stepIndex];
    return step ? new Set([trailStepGraphEdgeId(step)]) : null;
  }, [trails, hoveredTrailStep]);
  // While hovering with a *step* already selected, brighten the union of
  // selected + hovered participants. Whole-flow focus (or no focus) keeps
  // the old hover-replace preview so a step hover still dims the rest.
  const previewEdgeIds = useMemo(() => {
    // Autoplay drives focus without a hover, so its step is the preview set.
    if (autoPlayFocus) return focusEdgeIds;
    if (!hoverEdgeIds) return null;
    // While hovering with a *step* already selected, brighten the union of
    // selected + hovered participants; whole-flow focus keeps the old
    // hover-replace preview so a step hover still dims the rest.
    if (focusedStepIndex == null || !focusEdgeIds) return hoverEdgeIds;
    const ids = new Set(hoverEdgeIds);
    for (const id of focusEdgeIds) ids.add(id);
    return ids;
  }, [hoverEdgeIds, focusEdgeIds, focusedStepIndex, autoPlayFocus]);
  const previewNodeIds = useMemo(
    () => endpointsOf(previewEdgeIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseEdges, previewEdgeIds],
  );
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
    // While a step/flow is hovered, hovered participants stay bright; every
    // other node is dimmed (and, when a flow is expanded, hidden). Exception:
    // with no expanded flow at all (a sidebar-less embed) there is nothing to
    // hide toward — everything shows, and focus/hover only dims.
    return xyflowNodesBase.map((n) => {
      // Boundary frames follow their members: hidden when no member is
      // visible, dimmed when members are dimmed. Never selectable.
      if (n.type === 'subsystem-group') {
        const region = (n.data as { region?: { key?: string; memberAliases?: string[] } } | undefined)?.region;
        const memberAliases = region?.memberAliases ?? [];
        // `brightNodeIds` is the focused step's endpoints. It has to be a
        // spotlight member as well as a bright set: without an expanded flow
        // there is no opened set, so dimming has to be driven from the
        // participants or nothing outside the focused step would dim.
        const dimSource = previewNodeIds ?? brightNodeIds ?? issueFocusNodeIds;
        const { hidden, dimmed } = flowNodeVisibility({
          inOpened: memberAliases.some((alias) => openedNodeIds?.has(alias) === true),
          inSelected: memberAliases.some((alias) => brightNodeIds?.has(alias) === true),
          inSpotlight: memberAliases.some((alias) => dimSource?.has(alias) === true),
          anyOpened: openedNodeIds != null,
          anySelected: brightNodeIds != null,
          anySpotlight: dimSource != null,
        });
        // Host override wins over the library's derived frame color.
        const color = region?.key != null ? boundaryColors?.[region.key] : undefined;
        // Boundary findings badge the FRAME, not a member — a region's shape is
        // the fault, so no leaf construct carries it.
        const regionIssue = regionIssueByNodeId.get(n.id);
        return {
          ...n,
          hidden,
          selectable: false,
          data: {
            ...(n.data as object),
            ...(color != null && { color }),
            ...(dimmed && { dimmed: true }),
            ...(regionIssue && { issue: regionIssue }),
          },
        };
      }
      const comp = (n.data as { component?: SubsystemComponent } | undefined)?.component;
      const fileMatch = fileMatchForNode(comp?.file, openFile, focusNodeIds?.has(n.id) === true);
      // Bases selection on the focused step, not the hover preview, so
      // hovering doesn't strip the frame's `isSelected`.
      const isSelected = selected?.alias !== undefined && comp?.alias === selected.alias;
      // `brightNodeIds` (the focused step's endpoints) is a spotlight member as
      // well as a bright set — see the group branch above.
      const dimSource = previewNodeIds ?? brightNodeIds ?? issueFocusNodeIds;
      const { hidden, dimmed } = flowNodeVisibility({
        inOpened: openedNodeIds?.has(n.id) === true,
        inSelected: brightNodeIds?.has(n.id) === true,
        inSpotlight: dimSource?.has(n.id) === true,
        anyOpened: openedNodeIds != null,
        anySelected: brightNodeIds != null,
        anySpotlight: dimSource != null,
      });
      // Component findings key by alias, boundary findings by region node id.
      // The two id spaces are disjoint (`module:` / `process:` are prefixed), so
      // one lookup covers both node kinds.
      const issueBadge =
        issueBadgeByAlias.get(n.id) ?? regionIssueByNodeId.get(n.id);
      if (fileMatch === undefined && !isSelected && !dimmed && !issueBadge) {
        const { fileMatch: _f, isSelected: _s, dimmed: _d, ...rest } = n.data as Record<string, unknown>;
        return { ...n, hidden, data: rest };
      }
      return {
        ...n,
        hidden,
        data: {
          ...(n.data as object),
          ...(fileMatch !== undefined && { fileMatch }),
          ...(isSelected && { isSelected }),
          ...(dimmed && { dimmed: true }),
          ...(issueBadge && { issue: issueBadge }),
        },
      };
    });
  }, [xyflowNodesBase, openFile, selected, focusNodeIds, openedNodeIds, brightNodeIds, previewNodeIds, issueFocusNodeIds, issueBadgeByAlias, regionIssueByNodeId, boundaryColors]);

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
    // Edges outside the selected view are hidden entirely (labels included).
    // graphify-native edges belong to the graphify view (they are static
    // topology, not runtime steps) regardless of their verb.
    const edgeInView = (e: Edge): boolean => {
      const d = e.data as
        | { mechanism?: string; provenance?: SubsystemEdgeProvenance }
        | undefined;
      const mechanism = d?.mechanism ?? 'uses';
      if (resolvedEdgeView === 'graphify') {
        return d?.provenance === 'graphify';
      }
      return isTrailMechanism(mechanism);
    };
    if (openedEdgeIds || focusEdgeIds || previewEdgeIds || issueFocusEdgeIds) {
      return baseEdges.map((e) => {
        const vis = flowElementVisibility({
          inOpened: openedEdgeIds?.has(e.id) === true,
          inSelected: focusEdgeIds?.has(e.id) === true,
          anyOpened: openedEdgeIds != null,
          anySelected: focusEdgeIds != null,
        });
        const dimSource = previewEdgeIds ?? issueFocusEdgeIds;
        const dimmed = dimSource ? vis.hidden || !dimSource.has(e.id) : vis.dimmed;
        const hidden = vis.hidden || !edgeInView(e);
        return { ...paint(e, dimmed), hidden };
      });
    }
    if (selectedEdgeId) {
      return baseEdges.map((e) => ({
        ...paint(e, e.id !== selectedEdgeId),
        hidden: !edgeInView(e),
      }));
    }
    return baseEdges.map((e) => ({ ...e, hidden: !edgeInView(e) }));
  }, [baseEdges, selectedEdgeId, openedEdgeIds, focusEdgeIds, previewEdgeIds, issueFocusEdgeIds, resolvedEdgeView]);

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
      setFocusedTrailId(null);
      setFocusedStepIndex(null);
      if (node.type === 'subsystem-component' && comp) {
        // Clicking the already-selected node unselects it (toggle off).
        // Selection is independent of the file drawer — nodes never open it.
        if (selected?.alias === comp.alias) {
          setSelected(null);
          return;
        }
        setSelected(comp);
        issueModuleFocusRef.current = null;
        if (comp.alias) onSelect?.(comp.alias);
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
    setFocusedTrailId(null);
    setFocusedStepIndex(null);
    issueModuleFocusRef.current = null;
  }, []);

  // Sidebar file trees — one per repo on multi-repo graphs, each under its
  // own owner-avatar header. Clicking a header collapses that repo's tree.
  const repoGroups = useMemo(() => buildRepoGroups(components), [components]);
  const hasTrails = useMemo(() => (trails?.length ?? 0) > 0, [trails]);
  // Aliases of proposed components — the flows panel tints trail titles
  // (and steps) that touch one.
  const proposedAliases = useMemo(
    () => new Set(components.filter((c) => c.proposed).map((c) => c.alias)),
    [components],
  );
  // Diagnostics view in the sidebar. Uncontrolled unless the host pins
  // `showIssues`: the title-row chip toggles it, seeded from issues presence.
  const [diagnosticsOpen, setDiagnosticsOpen] = useState<boolean>(
    showIssues ?? (issues?.length ?? 0) > 0,
  );
  const controlledIssues = showIssues !== undefined;
  const issuesActive = controlledIssues ? showIssues : diagnosticsOpen;
  // Layer focus only applies while the diagnostics list is on screen — closing
  // it clears any dimming the expanded layers were driving.
  useEffect(() => {
    if (!issuesActive) {
      setExpandedIssueCategories([]);
    }
  }, [issuesActive]);
  const toggleIssues = () => {
    if (!controlledIssues) setDiagnosticsOpen((v) => !v);
    diagnostic?.onToggle?.();
  };
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
      setFileOverlay(null);
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
      setFileOverlay(null);
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

  // Double-click a component opens its declaration in the file drawer — the
  // `file` + anchored `declarationRef.startLine` when verify resolved one,
  // else the file top. Uses the same open path as the declaration panel's
  // file link, so the drawer and file tree stay in sync.
  // Boundary region currently framed by a double-click, so a second
  // double-click on the same boundary zooms back out to the whole graph.
  const [focusedBoundaryKey, setFocusedBoundaryKey] = useState<string | null>(null);
  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_e, node: Node) => {
      // Boundary frame → frame its members on the canvas; double-click again to
      // zoom back out. User-initiated, so it ignores the trail zoom gate.
      if (node.type === 'subsystem-group') {
        const key =
          (node.data as { region?: { key?: string } } | undefined)?.region?.key;
        if (!key) return;
        if (focusedBoundaryKey === key) {
          setFocusedBoundaryKey(null);
          fitView({
            padding: 0.1,
            includeHiddenNodes: false,
            minZoom: 0.05,
            maxZoom: 2,
            duration: 300,
          });
          return;
        }
        setFocusedBoundaryKey(key);
        // Frame the boundary node itself (not its members): the frame extends
        // above its topmost member for the label, and fitting members alone
        // clipped that top. The group node carries the full laid-out bounds.
        fitView({
          nodes: [{ id: node.id }],
          padding: 0.25,
          duration: 300,
        });
        return;
      }
      if (node.type !== 'subsystem-component') return;
      const comp = (node.data as { component?: SubsystemComponent } | undefined)?.component;
      if (!comp?.file) return;
      const startLine = comp.declarationRef?.startLine;
      onOpenDeclarationFile(comp.file, startLine != null ? { startLine } : undefined);
    },
    [onOpenDeclarationFile, fitView, focusedBoundaryKey],
  );

  const onOpenFileFromTrail = useCallback(
    (file: string, opts?: SubsystemOpenFileOptions) => {
      setFileOverlay({ file, startLine: opts?.startLine });
      onFileSelect?.(file);
    },
    [onFileSelect],
  );

  const closeFileOverlay = useCallback(() => {
    setFileOverlay(null);
  }, []);

  const closeDrawer = useCallback(() => {
    setFileOverlay(null);
    setDrawerTarget(null);
  }, []);

  const drawerFillHeight =
    drawerTarget?.kind === 'file' && drawerTarget.startLine == null;
  const fileOverlayOpen = fileOverlay != null;
  const collapseCanvas = drawerFillHeight || fileOverlayOpen;

  // Drop the full-file overlay when the underlying trail drawer changes
  // or closes — open-file keeps the same drawerTarget so the snippets stay mounted.
  const trailDrawerKey =
    drawerTarget?.kind === 'trail'
      ? `${drawerTarget.trailId}:${drawerTarget.stepIndex}`
      : null;
  useEffect(() => {
    setFileOverlay(null);
  }, [trailDrawerKey]);

  useEffect(() => {
    if (!fileOverlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFileOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fileOverlayOpen, closeFileOverlay]);

  // Camera helper shared by the trail interactions. Fits the union of
  // the focused edges' endpoint rects AND their routed waypoints — the edge
  // carries its full polyline (`elkPathPoints`, absolute flow coords), so the
  // frame is the line the step actually traces. That keeps a step whose route
  // bulges out around intervening nodes from being clipped at the viewport
  // edge, and it is the edge's own geometry doing the guiding, not fudge
  // padding.
  const fitFocusBounds = useCallback(
    (ids: ReadonlySet<string>) => {
      if (!zoomOnTrailFocus) return;
      const nodeIds = new Set<string>();
      const points: { x: number; y: number }[] = [];
      for (const e of baseEdges) {
        if (!ids.has(e.id)) continue;
        nodeIds.add(e.source);
        nodeIds.add(e.target);
        const pts = (e.data as { elkPathPoints?: { x: number; y: number }[] } | undefined)
          ?.elkPathPoints;
        if (pts?.length) points.push(...pts);
      }
      if (nodeIds.size === 0) return;

      // Box the focused edge(s): endpoint node rects UNION the routed line's
      // waypoints. Both come from the layout in absolute flow coords, so no
      // coordinate-space mixing (React Flow's grouped child `position`s are
      // parent-relative and would skew the box).
      const rects = built.absoluteRects;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const id of nodeIds) {
        const r = rects.get(id);
        if (!r) continue;
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
      }
      for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
      const bounds = {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
      fitBounds(bounds, {
        padding: 0.15,
        duration: trailFocusDurationMs,
      });
    },
    [
      baseEdges,
      built.absoluteRects,
      fitBounds,
      zoomOnTrailFocus,
      trailFocusDurationMs,
    ],
  );

  // A node's laid-out rect in absolute flow coords. `absoluteRects` is the
  // authority; the fallback covers an unparented group node, whose `position` is
  // already absolute. Nested groups are parent-relative, so they are skipped
  // rather than mis-boxed.
  const rectForNode = useCallback(
    (id: string): { x: number; y: number; width: number; height: number } | undefined => {
      const r = built.absoluteRects.get(id);
      if (r) return r;
      const n = built.nodes.find((x) => x.id === id) as
        | {
            position?: { x: number; y: number };
            width?: number;
            height?: number;
            parentId?: string;
          }
        | undefined;
      if (!n?.position || n.parentId) return undefined;
      return {
        x: n.position.x,
        y: n.position.y,
        width: n.width ?? 0,
        height: n.height ?? 0,
      };
    },
    [built.absoluteRects, built.nodes],
  );

  // Frame a set of nodes by their laid-out rects. Unlike `fitFocusBounds` this
  // takes node ids, so it works for boundary frames too — React Flow's own
  // `fitView({ nodes })` can't be relied on for group nodes here, and the rects
  // are already in absolute flow coords (grouped child `position`s are
  // parent-relative and would skew the box).
  const fitNodeRects = useCallback(
    (ids: ReadonlySet<string>, padding: number) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const id of ids) {
        const r = rectForNode(id);
        if (!r) continue;
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
      fitBounds(
        {
          x: minX,
          y: minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
        },
        { padding, duration: trailFocusDurationMs },
      );
    },
    [rectForNode, fitBounds, trailFocusDurationMs],
  );

  // Zoom back out to the full diagram after the last expanded trail
  // closes (visibility restores non-flow nodes that were hidden).
  const fitOverview = useCallback(() => {
    if (!zoomOnTrailFocus) return;
    fitView({
      padding: 0.1,
      includeHiddenNodes: false,
      minZoom: 0.05,
      maxZoom: 2,
      duration: 300,
    });
  }, [fitView, zoomOnTrailFocus]);

  // Focus an entire flow: hide everything but the flow's nodes and edges, and
  // frame the flow on the canvas. Selection state is cleared — the graph now
  // reads as the narrative. No drawer: the code view only opens on a step
  // click. A stale trail drawer (from a previously focused flow's step)
  // closes; an explicitly opened file drawer stays.
  // In `dim` mode: clear step highlight and leave the full graph visible
  // (no zoom / hide) — matching "step away from a hovered step".
  const focusTrailEdges = useCallback(
    (tl: SubsystemTrail) => {
      setSelected(null);
      setSelectedEdgeId(null);
      setHoveredTrailStep(null);
      if (trailStepMode === 'dim') {
        setFocusedStepIndex(null);
        setFocusedTrailId(null);
        setDrawerTarget((prev) => (prev?.kind === 'trail' ? null : prev));
        return;
      }
      setFocusedStepIndex(null);
      setFocusedTrailId(tl.id);
      fitFocusBounds(new Set(tl.steps.map((s) => trailStepGraphEdgeId(s))));
      setDrawerTarget((prev) => (prev?.kind === 'trail' ? null : prev));
    },
    [fitFocusBounds, trailStepMode],
  );

  const clearTrailFocus = useCallback(() => {
    setFocusedTrailId(null);
    setFocusedStepIndex(null);
    setHoveredTrailStep(null);
    setDrawerTarget((prev) => (prev?.kind === 'trail' ? null : prev));
  }, []);

  // Host deep-link: opening the graph from a trail row selects that
  // flow — expand its steps, focus its edges, and switch the sidebar to
  // Trails. Guarded by a ref so a later in-tab selection isn't yanked
  // back; a remount (or a new id) re-applies it.
  const appliedInitialTrailRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialTrailId) return;
    if (appliedInitialTrailRef.current === initialTrailId) return;
    if (!layoutReady || !trails?.length) return;
    const tl = trails.find((t) => t.id === initialTrailId);
    if (!tl) return;
    appliedInitialTrailRef.current = initialTrailId;
    setSidebarView('trails');
    setExpandedTrails((prev) => new Set(prev).add(tl.id));
    focusTrailEdges(tl);
  }, [initialTrailId, layoutReady, trails, focusTrailEdges]);

  // Switching sidebar panels also switches the edge vocabulary. Leaving the
  // Trails panel drops its canvas state (focus, expanded flows, selected
  // edge) so the Files view's topology edges aren't gated by a flow the user
  // can no longer see or un-dim.
  const changeSidebarView = useCallback(
    (view: 'files' | 'trails') => {
      setSidebarView(view);
      if (view === 'trails') return;
      clearTrailFocus();
      setExpandedTrails(new Set());
      setSelectedEdgeId(null);
    },
    [clearTrailFocus],
  );

  // Focus a single step's edge on the canvas and open/scroll the trail
  // drawer to that step's snippet. Clicking the already-focused step clears
  // step focus and returns to whole-flow (high-level) framing.
  // In `dim` mode: only dim non-participants (same as hovering a step) —
  // no camera move, no drawer, no hide.
  const focusTrailStep = useCallback(
    (tl: SubsystemTrail, stepIndex: number) => {
      const step = tl.steps[stepIndex];
      if (!step) return;
      setSelected(null);
      setSelectedEdgeId(null);
      if (trailStepMode === 'dim') {
        setFocusedStepIndex(null);
        setFocusedTrailId(null);
        setHoveredTrailStep({ trailId: tl.id, stepIndex });
        setDrawerTarget((prev) => (prev?.kind === 'trail' ? null : prev));
        return;
      }
      // Toggle: clicking the selected step unselects it (back to whole flow).
      if (focusedTrailId === tl.id && focusedStepIndex === stepIndex) {
        setFocusedStepIndex(null);
        // Pointer is still over the row — keep hover preview so dimming doesn't
        // flash off until mouseleave.
        setHoveredTrailStep({ trailId: tl.id, stepIndex });
        setDrawerTarget((prev) => (prev?.kind === 'trail' ? null : prev));
        if (pendingFocusFitRef.current != null) {
          window.clearTimeout(pendingFocusFitRef.current);
          pendingFocusFitRef.current = null;
        }
        fitFocusBounds(new Set(tl.steps.map((s) => trailStepGraphEdgeId(s))));
        return;
      }
      setFocusedStepIndex(stepIndex);
      setFocusedTrailId(tl.id);
      setHoveredTrailStep(null);
      // Open the drawer before fitting. If it was closed, wait for its height
      // transition so fitView uses the reduced canvas — not full height.
      const drawerWasOpen = drawerOpenRef.current;
      if (renderTrailViewer) {
        setDrawerTarget({
          kind: 'trail',
          trailId: tl.id,
          stepIndex,
        });
      } else {
        setDrawerTarget({
          kind: 'file',
          file: step.file,
          startLine: step.line,
        });
      }
      const edgeIds = new Set([trailStepGraphEdgeId(step)]);
      if (pendingFocusFitRef.current != null) {
        window.clearTimeout(pendingFocusFitRef.current);
        pendingFocusFitRef.current = null;
      }
      if (drawerWasOpen) {
        fitFocusBounds(edgeIds);
      } else {
        pendingFocusFitRef.current = window.setTimeout(() => {
          pendingFocusFitRef.current = null;
          requestAnimationFrame(() => fitFocusBounds(edgeIds));
        }, FILE_DRAWER_HEIGHT_MS + 20);
      }
    },
    [
      fitFocusBounds,
      focusedStepIndex,
      focusedTrailId,
      renderTrailViewer,
      trailStepMode,
    ],
  );

  useEffect(() => {
    return () => {
      if (pendingFocusFitRef.current != null) {
        window.clearTimeout(pendingFocusFitRef.current);
      }
    };
  }, []);

  // While a *step* is selected, hovering another step/flow reframes the
  // camera to the selected ∪ hovered participants. Leaving hover snaps back
  // to the selection alone. No step selected → hover only dims; camera stays
  // at the high-level view. Click-to-focus still owns its own fit (including
  // the drawer-open delay) — this only reacts to previewEdgeIds transitions.
  const prevPreviewEdgeIdsRef = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    const prev = prevPreviewEdgeIdsRef.current;
    prevPreviewEdgeIdsRef.current = previewEdgeIds;

    if (!zoomOnTrailFocus || trailStepMode === 'dim') return;
    // Camera follows hover only when a specific step is already focused (or
    // autoplay is driving an auto-focus).
    if (!autoPlayFocus && (focusedTrailId == null || focusedStepIndex == null)) {
      return;
    }

    if (previewEdgeIds) {
      fitFocusBounds(previewEdgeIds);
      return;
    }
    if (prev != null && focusEdgeIds) {
      fitFocusBounds(focusEdgeIds);
    }
  }, [
    previewEdgeIds,
    focusEdgeIds,
    focusedTrailId,
    focusedStepIndex,
    autoPlayFocus,
    fitFocusBounds,
    zoomOnTrailFocus,
    trailStepMode,
  ]);

  // Graph-only embeds: cycle trail steps. In `focus` mode each step is
  // selected (camera frames it via fitFocusBounds) and, when a trail
  // viewer is supplied, its snippet drawer opens; in `dim` mode it only
  // dim-highlights the step (hover-style) with no camera move.
  useEffect(() => {
    if (!autoPlayTrails || trails == null || trails.length === 0) return;
    if (!layoutReady) return;
    const playable = trails.filter((tl) => tl.steps.length > 0);
    if (playable.length === 0) return;
    // Only run the cycles that can actually be shown in the current edge view.
    const inView = playable.filter((tl) =>
      tl.steps.some((s) => isTrailMechanism(s.mechanism)),
    );
    if (inView.length === 0) return;
    const cyc = inView;

    let cancelled = false;
    let tlIdx = 0;
    let stepIdx = 0;
    let timer: number | null = null;
    const interval = Math.max(400, trailAutoPlayIntervalMs);
    const focusMode = trailStepMode !== 'dim';
    let cleanup = () => {};

    const tick = () => {
      if (cancelled) return;
      const tl = cyc[tlIdx]!;
      setSelected(null);
      setSelectedEdgeId(null);
      if (focusMode) {
        setHoveredTrailStep(null);
        setFocusedTrailId(null);
        setFocusedStepIndex(null);
        setAutoPlayFocus({ trailId: tl.id, stepIndex: stepIdx });
        if (!hideDrawer) {
          const step = tl.steps[stepIdx];
          if (step) {
            if (renderTrailViewer) {
              setDrawerTarget({ kind: 'trail', trailId: tl.id, stepIndex: stepIdx });
            } else {
              setDrawerTarget({ kind: 'file', file: step.file, startLine: step.line });
            }
          }
        }
      } else {
        setAutoPlayFocus(null);
        setFocusedTrailId(null);
        setFocusedStepIndex(null);
        setHoveredTrailStep({ trailId: tl.id, stepIndex: stepIdx });
      }
      stepIdx += 1;
      if (stepIdx >= tl.steps.length) {
        stepIdx = 0;
        tlIdx = (tlIdx + 1) % cyc.length;
      }
      timer = window.setTimeout(tick, interval);
    };

    tick();
    cleanup = () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      setHoveredTrailStep(null);
      setFocusedTrailId(null);
      setFocusedStepIndex(null);
      setAutoPlayFocus(null);
    };
    return cleanup;
  }, [
    autoPlayTrails,
    trails,
    trailAutoPlayIntervalMs,
    layoutReady,
    trailStepMode,
    renderTrailViewer,
    hideDrawer,
  ]);

  // Arrow keys step through the focused trail once a step is active
  // (sidebar click or drawer open). Ignores typing targets and chords.
  useEffect(() => {
    if (focusedTrailId == null || focusedStepIndex == null || !trails) {
      return;
    }
    const tl = trails.find((t) => t.id === focusedTrailId);
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
      focusTrailStep(tl, next);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    focusedTrailId,
    focusedStepIndex,
    trails,
    focusTrailStep,
  ]);

  const toggleTrailCollapsed = useCallback(
    (tlId: string) => {
      const collapsingLast =
        expandedTrails.has(tlId) && expandedTrails.size === 1;

      setExpandedTrails((prev) => {
        const next = new Set(prev);
        if (next.has(tlId)) next.delete(tlId);
        else next.add(tlId);
        return next;
      });

      if (!collapsingLast || !zoomOnTrailFocus) return;

      // Cancel any pending focus fit so it doesn't fight the overview zoom.
      if (pendingFocusFitRef.current != null) {
        window.clearTimeout(pendingFocusFitRef.current);
        pendingFocusFitRef.current = null;
      }

      // Wait for React to commit the collapse (and any clearFocus that follows
      // in the same click handler). If a drawer was open it may be closing —
      // delay so fitView measures the restored canvas height.
      const drawerWasOpen = drawerOpenRef.current;
      pendingFocusFitRef.current = window.setTimeout(
        () => {
          pendingFocusFitRef.current = null;
          requestAnimationFrame(() => fitOverview());
        },
        drawerWasOpen ? FILE_DRAWER_HEIGHT_MS + 20 : 20,
      );
    },
    [expandedTrails, fitOverview, zoomOnTrailFocus],
  );

  // Detail-panel links: related-name clicks select the matching component —
  // resolved by alias, name, or symbol (call labels may carry a trailing `()`).
  const resolveRelatedComponent = useCallback(
    (ref: string) => {
      const clean = ref.replace(/\(\)$/, '');
      const comp = components.find(
        (c) =>
          c.alias === clean ||
          c.name === clean ||
          c.symbol === clean ||
          c.symbol?.replace(/\(\)$/, '') === clean,
      );
      if (!comp || comp.alias === selectedRef.current?.alias) return;
      setSelected(comp);
      setSelectedEdgeId(null);
      setFocusedTrailId(null);
      setFocusedStepIndex(null);
      onSelect?.(comp.alias);
    },
    [components, onSelect],
  );

  // Issue click → select + frame the target on the canvas. Component targets
  // frame their node; other kinds (module / flow / repo) have no single element
  // and just forward. Selections / focus that would hide the target are cleared
  // first, then the camera flies to it on the next frame. The host's
  // `onSelectIssue` still fires afterwards for its own detail.
  const focusIssueTarget = useCallback(
    (issue: SubsystemIssue) => {
      const comp = issueComponent(issue);
      const step = comp ? null : issueStep(issue);
      if (comp) {
        setSelected(comp);
        setSelectedEdgeId(null);
        setFocusedTrailId(null);
        setFocusedStepIndex(null);
        setHoveredTrailStep(null);
        issueModuleFocusRef.current = null;
        onSelect?.(comp.alias);
        requestAnimationFrame(() => {
          fitView({
            nodes: [{ id: comp.alias }],
            padding: 0.4,
            duration: 300,
            minZoom: 0.05,
            maxZoom: 1.5,
          });
        });
      } else if (step) {
        // A step finding focuses the step itself, through the same entry point
        // the trail panel uses — so the drawer, the step numbering, the
        // dim-mode hover preview, and the camera all behave identically whether
        // the step was reached from the panel or from a diagnostics card.
        issueModuleFocusRef.current = null;
        focusTrailStep(step.trail, step.stepIndex);
      } else {
        // Nothing selectable — but a module target names a boundary frame, so
        // frame that region.
        const moduleNodeId = issueModuleNodeId(issue);
        if (moduleNodeId) {
          setSelected(null);
          setSelectedEdgeId(null);
          setFocusedTrailId(null);
          setFocusedStepIndex(null);
          setHoveredTrailStep(null);
          issueModuleFocusRef.current = moduleNodeId;
          requestAnimationFrame(() => {
            fitNodeRects(new Set([moduleNodeId]), 0.4);
          });
        }
      }
      onSelectIssue?.(issue);
    },
    [
      issueComponent,
      issueStep,
      issueModuleNodeId,
      focusTrailStep,
      onSelect,
      onSelectIssue,
      fitView,
      fitNodeRects,
    ],
  );

  // Collapsing the issue card again undoes the focus: drop the node / edge
  // selection (only when it is still this issue's target — another card may
  // have taken it over) and zoom back out to the whole graph. A module target
  // frames a region rather than selecting anything, so its ownership lives in
  // `issueModuleFocusRef`; without this branch a module focus never unwinds and
  // the camera never zooms back out.
  const unfocusIssueTarget = useCallback(
    (issue: SubsystemIssue) => {
      const comp = issueComponent(issue);
      if (comp) {
        if (selectedRef.current?.alias !== comp.alias) return;
        setSelected(null);
        setSelectedEdgeId(null);
      } else {
        const step = issueStep(issue);
        const moduleNodeId = step ? null : issueModuleNodeId(issue);
        if (step) {
          // Only unwind a step focus this card still owns. A dim-mode graph
          // keeps its step focus in hover state instead (owned by the pointer,
          // not the card), and correctly leaves that alone here.
          const owned = focusedStepRef.current;
          if (
            owned?.trailId !== step.trail.id ||
            owned?.stepIndex !== step.stepIndex
          ) {
            return;
          }
          setFocusedTrailId(null);
          setFocusedStepIndex(null);
          setDrawerTarget((prev) => (prev?.kind === 'trail' ? null : prev));
        } else if (moduleNodeId) {
          // Only unwind framing this card still owns.
          if (issueModuleFocusRef.current !== moduleNodeId) return;
          issueModuleFocusRef.current = null;
        } else {
          return;
        }
      }
      requestAnimationFrame(() => {
        fitView({ padding: 0.1, duration: 300, minZoom: 0.05, maxZoom: 2 });
      });
    },
    [issueComponent, issueStep, issueModuleNodeId, fitView],
  );

  // Construct tokens inside a trail snippet. A step's line is an edge
  // between its `from`/`to` components, so a token naming either of those
  // constructs should navigate to that construct's declaration. Index the
  // matchable identifiers per step (`trailId:index`).
  const trailSymbolIndex = useMemo(() => {
    const byAlias = new Map(components.map((c) => [c.alias, c]));
    const index = new Map<string, Map<string, string>>();
    for (const wt of trails ?? []) {
      wt.steps.forEach((step, i) => {
        const tokens = new Map<string, string>();
        for (const alias of [step.from, step.to]) {
          const comp = byAlias.get(alias);
          if (!comp) continue;
          for (const ident of constructIdentifiers(comp)) tokens.set(ident, alias);
        }
        index.set(`${wt.id}:${i}`, tokens);
      });
    }
    return index;
  }, [components, trails]);
  const trailSymbolIndexRef = useRef(trailSymbolIndex);
  trailSymbolIndexRef.current = trailSymbolIndex;

  // Stable resolver: reads the live index + focused trail from refs so
  // the memoized trail drawer isn't rebuilt on every graph render.
  const resolveTrailSymbol = useCallback(
    (query: TrailSymbolQuery): string | null => {
      const trailId = drawerTrailIdRef.current;
      if (trailId == null) return null;
      return (
        trailSymbolIndexRef.current
          .get(`${trailId}:${query.stepIndex}`)
          ?.get(query.tokenText) ?? null
      );
    },
    [],
  );

  // A construct token click navigates to that construct's declaration: open
  // its file at the anchored declaration line (same path as the declaration
  // panel's file link), falling back to the file top when unanchored.
  const openConstructDeclaration = useCallback(
    (alias: string) => {
      const comp = components.find((c) => c.alias === alias);
      if (!comp?.file) return;
      const startLine = comp.declarationRef?.startLine;
      onOpenDeclarationFile(
        comp.file,
        startLine != null ? { startLine } : undefined,
      );
    },
    [components, onOpenDeclarationFile],
  );

  // Edge label data for the overlay (rendered OUTSIDE ReactFlow so the pane
  // doesn't intercept pointer events). Uses ELK-computed label midpoints from
  // the actual edge path (not node-center approximations).
  const edgeLabels = useMemo(() => {
    return dispEdges
      .filter((e) => {
        if (e.hidden) return false;
        const d = e?.data as { dimmed?: boolean } | undefined;
        return !d?.dimmed;
      })
      .map((e) => {
        const d = e.data as {
          mechanism?: string;
          provenance?: SubsystemEdgeProvenance;
          dimmed?: boolean;
          labelX?: number;
          labelY?: number;
          pathLength?: number;
        } | undefined;
        return {
          id: e.id,
          mechanism: d?.mechanism ?? 'uses',
          provenance: d?.provenance,
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
    if (!hoveredComponentAlias) return null;
    return components.find((c) => c.alias === hoveredComponentAlias)?.file ?? null;
  }, [components, hoveredComponentAlias]);

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

  const trailViewerRef = useRef(renderTrailViewer);
  trailViewerRef.current = renderTrailViewer;
  const renderTrailDrawerContent = useCallback(
    (ctx: TrailViewerContext) =>
      trailViewerRef.current?.(ctx) ?? null,
    [],
  );

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'row', userSelect: sidebarDrag ? 'none' : undefined }}>
      {/* Sidebar: scrollable title/description on top, files or flows pinned below.
          The description hides by default so files/flows get the room; the
          title-row toggle reveals it, and the lower panel yields back to 50%. */}
      {!hideSidebar && (title || description || diagnostic || issuesActive || sidebarExtra || sidebarAfterDescription || treeFilePaths.length > 0 || hasTrails) && (
        <div
          style={{
            width: sidebarWidth,
            minWidth: sidebarWidth,
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
          {(title || description || diagnostic) && (
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  flexShrink: 0,
                  // Title's flex:1 already pushes this cluster right; without a
                  // title, keep the actions flush right instead of flush-left.
                  marginLeft: title ? undefined : 'auto',
                }}
              >
                {diagnostic && (
                  <SubsystemDiagnosticToggle
                    {...diagnostic}
                    active={issuesActive}
                    onToggle={toggleIssues}
                  />
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
                      background: descriptionVisible || descToggleHover ? theme.colors.border : 'transparent',
                      color: descriptionVisible || descToggleHover ? theme.colors.text : (theme.colors.textMuted ?? theme.colors.textSecondary),
                      cursor: 'pointer',
                      transition: 'background 120ms ease, color 120ms ease',
                    }}
                  >
                    <FileText size={14} />
                  </button>
                )}
              </div>
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
                disableBasePadding
                enableKeyboardScrolling={false}
                autoFocusOnVisible={false}
              />
            </div>
          )}
          {sidebarAfterDescription}
          </div>
          {(treeFilePaths.length > 0 || hasTrails || issuesActive) && (
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
              {issuesActive ? (
                agentsPanel ? (
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <div
                      role="tablist"
                      aria-label="Diagnostics view"
                      style={{
                        display: 'flex',
                        width: '100%',
                        flexShrink: 0,
                        borderBottom: `1px solid ${theme.colors.border}`,
                        background: theme.colors.backgroundSecondary ?? theme.colors.background,
                      }}
                    >
                      {(['issues', 'agents'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          role="tab"
                          aria-selected={diagnosticsTab === tab}
                          onClick={() => setDiagnosticsTab(tab)}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: '8px 8px',
                            border: 'none',
                            borderRadius: 0,
                            background: diagnosticsTab === tab ? theme.colors.background : 'transparent',
                            color:
                              diagnosticsTab === tab ? theme.colors.text : theme.colors.textSecondary,
                            fontSize: theme.fontSizes[1],
                            fontFamily: theme.fonts.monospace,
                            textTransform: 'capitalize',
                            cursor: 'pointer',
                          }}
                        >
                          {tab === 'issues' ? 'Issues' : 'Agents'}
                        </button>
                      ))}
                    </div>
                    {diagnosticsTab === 'agents' ? (
                      <SubsystemAgentsPanel {...agentsPanel} />
                    ) : (
                      <SubsystemIssueList
                        issues={issues ?? []}
                        focusCategory={focusIssueCategory}
                        onSelectIssue={focusIssueTarget}
                        onDeselectIssue={unfocusIssueTarget}
                        onApplyFix={onApplyIssueFix}
                        onHoverIssue={onHoverIssue}
                        onExpandedCategoriesChange={handleExpandedCategoriesChange}
                      />
                    )}
                  </div>
                ) : (
                  <SubsystemIssueList
                    issues={issues ?? []}
                    focusCategory={focusIssueCategory}
                    onSelectIssue={focusIssueTarget}
                    onDeselectIssue={unfocusIssueTarget}
                    onApplyFix={onApplyIssueFix}
                    onHoverIssue={onHoverIssue}
                    onExpandedCategoriesChange={handleExpandedCategoriesChange}
                  />
                )
              ) : (
                <>
              {hasTrails && (
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
                  {(['trails', 'files'] as const).map((view) => (
                    <button
                      key={view}
                      type="button"
                      role="tab"
                      aria-selected={sidebarView === view}
                      onClick={() => changeSidebarView(view)}
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
                      {view === 'trails' ? 'Trails' : 'Files'}
                    </button>
                  ))}
                </div>
              )}
              {sidebarView === 'trails' && trails && trails.length > 0 ? (
                <TrailsPanel
                  trails={trails}
                  expandedTrails={expandedTrails}
                  focusedTrailId={focusedTrailId}
                  focusedStepIndex={focusedStepIndex}
                  hoveredTrailStep={hoveredTrailStep}
                  onToggleCollapsed={toggleTrailCollapsed}
                  onFocusFlow={focusTrailEdges}
                  onClearFocus={clearTrailFocus}
                  onFocusStep={focusTrailStep}
                  onHoverStep={(tl, i) =>
                    setHoveredTrailStep({ trailId: tl.id, stepIndex: i })
                  }
                  onHoverFlow={(tl) =>
                    setHoveredTrailStep({ trailId: tl.id, stepIndex: null })
                  }
                  onLeaveStep={() => setHoveredTrailStep(null)}
                  onReorder={onReorderTrails}
                  proposedAliases={proposedAliases}
                />
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
                        hoveredFolder={hoveredBoundaryPath}
                        headerless={repoGroups.multiRepo}
                      />
                    )}
                  </div>
                );
              })}
              </>
              ) : null}
                </>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Drag handle between sidebar and canvas — resize the left panel. */}
      {!hideSidebar && (title || description || diagnostic || issuesActive || sidebarExtra || sidebarAfterDescription || treeFilePaths.length > 0 || hasTrails) && (
        <div
          onMouseDown={onSidebarResizeStart}
          aria-label="Resize sidebar"
          title="Drag to resize"
          style={{
            width: 3,
            flexShrink: 0,
            cursor: 'col-resize',
            background: theme.colors.border,
            transition: 'background 120ms ease',
            zIndex: 1,
          }}
        />
      )}

      {/* Graph area */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Canvas box — the edge-label overlay and legend anchor here, so
            overlays shift with the canvas, not the labels. Collapses when the
            file drawer fills the column (whole-file reading). */}
        <div
          style={{
            position: 'relative',
            flex: collapseCanvas ? 0 : 1,
            minHeight: 0,
            height: collapseCanvas ? 0 : undefined,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
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
            const mechanism = lbl.mechanism;
            const isGraphify = lbl.provenance === 'graphify';
            const color = edgeColor({ mechanism, provenance: lbl.provenance });
            // Label chrome stays the crisp rounded box for every edge — graphify
            // provenance is carried by hue (GRAPHIFY_RELATION_COLOR), the dashed
            // stroke, and the tooltip, NOT by the "ambiguous" cloud silhouette
            // (that idiom is reserved for soft authored mechanisms).
            const verifiable = true;
            const labelTitle = isGraphify
              ? 'Derived from graphify (static symbol graph)'
              : MECHANISM_DESCRIPTIONS.find(([m]) => m === mechanism)?.[2] === false
                ? 'Not directly verifiable with graphify'
                : undefined;
            const screenX = lbl.midX * viewport.zoom + viewport.x;
            const screenY = lbl.midY * viewport.zoom + viewport.y;
            const text = lbl.stepNos?.length
              ? `${lbl.stepNos.map((n) => `${n}:`).join(' ')} ${lbl.mechanism}`
              : lbl.mechanism;
            return (
              <div
                key={lbl.id}
              data-edge-label={lbl.id}
              title={labelTitle}
              onClick={(e) => {
                e.stopPropagation();
                selectEdge(lbl.id);
              }}
              style={{
                position: 'absolute',
                left: screenX,
                top: screenY,
                // Center on the flow-space midpoint, and scale with the graph
                // (flow-space size): labels shrink as you zoom out instead of
                // staying fixed-screen-size and dominating the smaller graph.
                transform: `translate(-50%, -50%) scale(${viewport.zoom})`,
                transformOrigin: 'center center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: EDGE_LABEL_WIDTH,
                height: EDGE_LABEL_HEIGHT,
                boxSizing: 'border-box',
                padding: '7px 8px',
                cursor: 'pointer',
                pointerEvents: 'auto',
                opacity: lbl.dimmed ? 0.15 : 1,
              }}
            >
              {/* Background layer. Opaque theme surface (matches the node fill)
                  so the edge line behind is hidden. Verifiable mechanisms get a
                  crisp rounded box; soft / ambiguous ones (uses, feeds,
                  watches …) get a real lobed cloud silhouette — ambiguous, not
                  a dashed proposal (or a pill, which border-radius can only
                  ever make). */}
              {verifiable ? (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 4,
                    border: `0.5px solid ${color}`,
                    background:
                      theme.colors.backgroundSecondary ?? theme.colors.background,
                    pointerEvents: 'none',
                  }}
                />
              ) : (
                <svg
                  aria-hidden
                  width={EDGE_LABEL_WIDTH}
                  height={EDGE_LABEL_HEIGHT + EDGE_LABEL_CLOUD_EXTRA_TOP}
                  viewBox={`0 0 ${EDGE_LABEL_WIDTH} ${EDGE_LABEL_HEIGHT + EDGE_LABEL_CLOUD_EXTRA_TOP}`}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: -EDGE_LABEL_CLOUD_EXTRA_TOP,
                    pointerEvents: 'none',
                  }}
                >
                  <path
                    d={EDGE_LABEL_CLOUD_PATH}
                    fill={theme.colors.backgroundSecondary ?? theme.colors.background}
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
          );
        })}
      </div>
      )}
      <GraphLayerStyle />
      <ReactFlow
        key={`${baseNodesKey}-${baseEdgesKey}`}
        nodes={dispNodes}
        edges={dispEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        className={GRAPH_CANVAS_CLASS}
        {...GRAPH_NAV_PROPS}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={onEdgeClick}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        proOptions={{ hideAttribution: true }}
        onPaneClick={onPaneClick}
        style={{
          width: '100%',
          height: '100%',
          flex: 1,
          minHeight: 0,
          background: theme.colors.background,
        }}
      >
        <GraphChrome />
      </ReactFlow>
      {/* Graph / trail / step titles — non-interactive chips at the top
          of the canvas. Graph-only embeds use these without opening the sidebar. */}
      {(graphTitle || overlayTrailTitle || overlayTrailStep) && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            maxWidth: '70%',
            pointerEvents: 'none',
          }}
        >
          {graphTitle && (
            <div
              style={{
                maxWidth: '100%',
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
              }}
            >
              {graphTitle}
            </div>
          )}
          {overlayTrailTitle && (
            <div
              style={{
                maxWidth: '100%',
                minWidth: overlayTrailStep ? 160 : undefined,
                display: 'flex',
                flexDirection: 'column',
                background: theme.colors.backgroundSecondary ?? theme.colors.background,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 6,
                boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                overflow: 'hidden',
                opacity: 0.95,
              }}
              aria-label={
                overlayTrailStep
                  ? `${overlayTrailTitle}, step ${overlayTrailStep.index} of ${overlayTrailStep.total}`
                  : overlayTrailTitle
              }
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
                {overlayTrailTitle}
              </div>
              {overlayTrailStep && overlayTrailStep.total > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: 3,
                    padding: '0 6px 5px',
                  }}
                  aria-hidden="true"
                >
                  {Array.from({ length: overlayTrailStep.total }, (_, i) => {
                    const n = i + 1;
                    const active = n === overlayTrailStep.index;
                    const done = n < overlayTrailStep.index;
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
                          transition: 'opacity 120ms ease, background 120ms ease',
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {overlayTrailStep?.annotation && (
            <div
              style={{
                maxWidth: '100%',
                padding: '6px 14px',
                background: theme.colors.backgroundSecondary ?? theme.colors.background,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 6,
                boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                textAlign: 'center',
                fontSize: theme.fontSizes[0],
                fontFamily: theme.fonts.body,
                color: theme.colors.textMuted ?? theme.colors.textSecondary,
                lineHeight: 1.35,
              }}
            >
              {overlayTrailStep.annotation}
            </div>
          )}
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
              onInspectSymbol={
                onInspectSymbol
                  ? (symbol, ref) =>
                      onInspectSymbol({
                        purl: selected.purl,
                        file: selected.file,
                        symbol,
                        ref,
                      })
                  : undefined
              }
              verification={componentVerification}
              fileOpen={
                drawerTarget?.kind === 'file' &&
                !!selected.file &&
                selected.file === drawerTarget.file
              }
              declarationOpen={
                drawerTarget?.kind === 'file' &&
                drawerTarget.startLine != null &&
                !!selected.file &&
                selected.file === drawerTarget.file &&
                selected.declarationRef?.startLine === drawerTarget.startLine
              }
            />
          </div>
        )}
        </div>
      <FileDrawer
        title={drawerTitle}
        onClose={closeDrawer}
        fillHeight={drawerFillHeight}
        suppressEscape={fileOverlayOpen}
        hidden={hideDrawer}
      >
        {drawerTarget?.kind === 'trail' &&
        focusedTrail &&
        renderTrailViewer ? (
          <TrailDrawerContent
            render={renderTrailDrawerContent}
            trail={focusedTrail}
            stepIndex={drawerTarget.stepIndex}
            onOpenFile={onOpenFileFromTrail}
            proposedAliases={proposedAliases}
            resolveSymbol={resolveTrailSymbol}
            onSymbolClick={openConstructDeclaration}
          />
        ) : drawerTarget?.kind === 'file' ? (
          <FileDrawerContent
            render={renderDrawerContent}
            file={drawerTarget.file}
            startLine={drawerTarget.startLine}
          />
        ) : null}
      </FileDrawer>
      {fileOverlay && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 8,
            display: 'flex',
            flexDirection: 'column',
            background: theme.colors.background,
            borderLeft: `1px solid ${theme.colors.border}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderBottom: `1px solid ${theme.colors.border}`,
              flexShrink: 0,
            }}
          >
            <span
              title={fileOverlay.file}
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: theme.fonts.monospace,
                fontSize: theme.fontSizes[0],
                color: theme.colors.textMuted ?? theme.colors.textSecondary,
              }}
            >
              {fileOverlay.file}
            </span>
            <FileOverlayCloseButton onClose={closeFileOverlay} />
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <FileDrawerContent
              render={renderDrawerContent}
              file={fileOverlay.file}
              startLine={fileOverlay.startLine}
              fullFile
            />
          </div>
        </div>
      )}
      {/* Startup cover — hides measurement, layout swap, and camera settle. */}
      <GraphLayoutCover revealed={layoutReady} />
      {canvasOverlay}
      {liveEvents ? <MaintainLivePanel {...liveEvents} /> : null}
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

  const constructsOnly = isConstructsOnlyModel({
    components: props.components,
    trails: props.trails,
    graphifyRelations: props.graphifyRelations,
  });

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
        {constructsOnly ? (
          <ConstructsCatalog
            components={props.components}
            onSelect={props.onSelect}
            title={props.title}
            hideSidebar={props.hideSidebar}
            description={props.description}
            descriptionOpen={props.descriptionOpen}
            onDescriptionOpenChange={props.onDescriptionOpenChange}
            diagnostic={props.diagnostic}
            sidebarExtra={props.sidebarExtra}
            sidebarAfterDescription={props.sidebarAfterDescription}
            renderFileViewer={props.renderFileViewer}
            renderFileView={props.renderFileView}
            onFileSelect={props.onFileSelect}
            componentVerification={props.componentVerification}
            onInspectSymbol={props.onInspectSymbol}
          />
        ) : (
          <ReactFlowProvider>
            <Inner {...props} measured={size} />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
