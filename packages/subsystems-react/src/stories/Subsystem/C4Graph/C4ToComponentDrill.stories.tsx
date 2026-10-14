import { useCallback, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { FileText, LayoutDashboard } from 'lucide-react';
import { IndustryMarkdownSlide } from 'themed-markdown';
import { C4Graph } from '../../../subsystem/C4Graph';
import { GraphWithSidebar } from '../../../subsystem/GraphWithSidebar';
import { TrailStepsNav } from '../../../subsystem/TrailStepsNav';
import type { C4ConstructGraph } from '../../../subsystem/C4Graph';
import { deriveGraphEdges, trailStepGraphEdgeId } from '../../../subsystem/model';
import {
  DRILLDOWN_C4_MODEL,
  DRILLDOWN_COMPONENTS,
  DRILLDOWN_DOC,
  DRILLDOWN_ELEMENTS,
  DRILLDOWN_MEMBERS,
  DRILLDOWN_TRAILS,
  deriveLitC4Edges,
  deriveTrailPlayerElements,
} from '../../../subsystem/__fixtures__/c4Drilldown';

/** The model this story is grounded in — shown in the sidebar header. */
const MODEL_DESCRIPTION =
  'The subsystem this C4 view summarizes. Focusing a trail opens the containers that hold its cast and folds the trail in as real nodes and edges, nested under their C4 component.';

/**
 * The C4 → construct drill-down, in one canvas.
 *
 * The C4 view is the high-level summary: containers, externals, and the
 * rolled-up lines between them. Focusing a trail folds the implementation into
 * it — the constructs (the component graph's own `subsystem-component` nodes
 * and `subsystem-edge` edges) are laid out by ELK inside the opened containers
 * and morphed in with them, so the C4 canvas carries both the summary and the
 * implementation. The model is the REAL subsystem model this repo lives under
 * (`sg-1788913589907-ieokymqg9` "Gist share from Studio": 19 components, 15/15
 * verified claims, 7 walkthroughs checked).
 *
 * Interaction:
 *   - click a C4 edge → it selects, and the story focuses the first trail that
 *     backs the line — the "edge is the summary, the trail is the
 *     implementation" jump;
 *   - the C4 edge inspector lists every backing trail; clicking one focuses it;
 *   - focusing a trail HIDES every C4 element whose components don't appear in
 *     it, and OPENS the containers that hold the cast, so the participating
 *     components come in at Level 3 instead of staying a collapsed box;
 *   - each opened container hosts the focused trail's components as real
 *     `subsystem-component` nodes and `subsystem-edge` edges. The constructs
 *     nest under the authored C4 component that claims them (container →
 *     component → construct); one no component claims sits directly in the
 *     container. An edge between constructs in the same container draws as a
 *     subsystem edge; one that would cross containers is left to the C4
 *     container-level line. Clicking a construct opens its **functionality** —
 *     the rendered declaration and its purpose — in the bottom-left panel. The
 *     host resolves it (`constructGraphByContainer`) so the C4 view stays free
 *     of the document;
 *   - hovering a *step* row DIMS the constructs down to that single hop: every
 *     construct except the step's `from`/`to`, and every construct edge except
 *     the step's own, fades (`dimmedConstructIds` / `dimmedConstructEdgeIds`).
 *     Transient: falls back to the focused view on leave;
 *   - the C4 view is composed with its own sidebar through the shared
 *     `GraphWithSidebar` wrapper: the sidebar carries the **trails**. The C4
 *     selection inspector stays the graph's own floating overlay; the wrapper
 *     is the composition point, so the C4 graph itself stays overlay-only.
 *
 * The status bar below the C4 view shows the current selection, so the wiring
 * is visible while it is being argued with.
 */

const meta = {
  title: 'Subsystem/C4Graph/C4ToComponentDrill',
  component: C4Graph,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof C4Graph>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo() {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [focusedTrailId, setFocusedTrailId] = useState<string | null>(null);
  // The trail (or step) currently hovered in the trails panel — its transient
  // preview drives a step-scoped dim. `stepIndex: null` means the whole trail
  // (a collapsed row hover).
  const [hoveredStep, setHoveredStep] = useState<{
    trailId: string;
    stepIndex: number | null;
  } | null>(null);
  // The persistently-focused step (a step click in the sidebar). Drives the
  // sticky construct spotlight and the C4 graph's code drawer; the hover below
  // is the transient preview that shares the same dim.
  const [focusedStep, setFocusedStep] = useState<{
    trailId: string;
    stepIndex: number;
  } | null>(null);
  // The header description, collapsible like the component graph's sidebar.
  const [descriptionVisible, setDescriptionVisible] = useState(true);

  /**
   * EXPERIMENT: when a trail is focused, remove the elements it does not touch
   * from the model outright, so ELK lays the diagram out to the cast alone
   * instead of leaving gaps where the hidden boxes were. `null` = nothing
   * focused, the whole model.
   */
  const trailPlayers = useMemo(() => {
    if (!focusedTrailId) return null;
    const trail = DRILLDOWN_TRAILS.find((t) => t.id === focusedTrailId);
    return trail ? deriveTrailPlayerElements(trail.steps, DRILLDOWN_MEMBERS) : null;
  }, [focusedTrailId]);

  const model = useMemo(() => {
    if (!trailPlayers) return { ...DRILLDOWN_C4_MODEL, openContainerIds: openIds };
    const nodes = DRILLDOWN_C4_MODEL.nodes.filter((n) => trailPlayers.has(n.id));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = DRILLDOWN_C4_MODEL.edges.filter(
      (e) => ids.has(e.source) && ids.has(e.target),
    );
    return { ...DRILLDOWN_C4_MODEL, nodes, edges, openContainerIds: openIds };
  }, [openIds, trailPlayers]);

  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort()));
  }, []);

  const allElementIds = useMemo(
    () => DRILLDOWN_C4_MODEL.nodes.map((n) => n.id),
    [],
  );
  const allEdgeIds = useMemo(
    () => DRILLDOWN_C4_MODEL.edges.map((e) => e.id),
    [],
  );

  /**
   * The C4 containers that hold a component the trail touches — opened when the
   * trail is focused so its cast comes in at Level 3 instead of staying a
   * collapsed container box. A trail whose endpoints no container claims (the
   * anti-library keys) opens nothing.
   */
  const containersForTrail = useCallback((trailId: string): string[] => {
    const trail = DRILLDOWN_TRAILS.find((t) => t.id === trailId);
    if (!trail) return [];
    const aliases = new Set<string>();
    for (const s of trail.steps) {
      aliases.add(s.from);
      aliases.add(s.to);
    }
    const out: string[] = [];
    for (const el of DRILLDOWN_C4_MODEL.nodes) {
      if (el.kind !== 'container') continue;
      const members = DRILLDOWN_MEMBERS[el.id] ?? [];
      if (members.some((a) => aliases.has(a))) out.push(el.id);
    }
    return out;
  }, []);

  /**
   * The containers the *current* trail focus opened — remembered so clearing
   * the focus (or moving to another trail) can close exactly those and leave any
   * the reader opened by hand alone.
   */
  const trailOpenedRef = useRef<Set<string>>(new Set());

  const openContainersForTrail = useCallback(
    (trailId: string) => {
      const ids = containersForTrail(trailId);
      if (ids.length === 0) return;
      trailOpenedRef.current = new Set([...trailOpenedRef.current, ...ids]);
      setOpenIds((prev) => [...new Set([...prev, ...ids])].sort());
    },
    [containersForTrail],
  );

  /** Close the containers the current trail focus opened. */
  const closeTrailContainers = useCallback(() => {
    const opened = trailOpenedRef.current;
    trailOpenedRef.current = new Set();
    if (opened.size === 0) return;
    setOpenIds((prev) => prev.filter((id) => !opened.has(id)));
  }, []);

  /**
   * The single source of the C4 emphasis, derived from the two focus facts —
   * mirroring the component graph:
   *
   *   hidden — an EXPANDED/focused trail removes every element it does not
   *            touch (the analogue of the component graph's opened-flow hide),
   *            lines included; `null` when nothing is focused.
   *   dimmed — the HOVER spotlight (a step, or a whole trail for a collapsed
   *            row) fades everything outside it; `null` when nothing is hovered.
   *
   * A step internal to a container folds into no C4 line, so its hover dims
   * every edge while the container stays bright — no drawn edge represents it.
   *
   * The spotlight is the *selected* step when one is focused (sticky), else the
   * hovered one (transient) — so a step click keeps its implementation lit.
   */
  const activeStep = focusedStep ?? hoveredStep;
  const emphasis = useMemo(() => {
    let hiddenElementIds: ReadonlySet<string> | null = null;
    let hiddenEdgeIds: ReadonlySet<string> | null = null;
    if (focusedTrailId) {
      const trail = DRILLDOWN_TRAILS.find((t) => t.id === focusedTrailId);
      const players = trail
        ? deriveTrailPlayerElements(trail.steps, DRILLDOWN_MEMBERS)
        : new Set<string>();
      hiddenElementIds = new Set(allElementIds.filter((id) => !players.has(id)));
      const lit = deriveLitC4Edges({ trailId: focusedTrailId }, DRILLDOWN_C4_MODEL.edges);
      hiddenEdgeIds = new Set(allEdgeIds.filter((id) => !lit.has(id)));
    }

    let dimmedElementIds: ReadonlySet<string> | null = null;
    let dimmedEdgeIds: ReadonlySet<string> | null = null;
    if (activeStep) {
      const trail = DRILLDOWN_TRAILS.find((t) => t.id === activeStep.trailId);
      const steps =
        !trail
          ? []
          : activeStep.stepIndex != null
            ? trail.steps.slice(activeStep.stepIndex, activeStep.stepIndex + 1)
            : trail.steps;
      const spotlight = deriveTrailPlayerElements(steps, DRILLDOWN_MEMBERS);
      dimmedElementIds = new Set(allElementIds.filter((id) => !spotlight.has(id)));
      const lit = deriveLitC4Edges(
        {
          trailId: activeStep.trailId,
          ...(activeStep.stepIndex != null ? { stepIndex: activeStep.stepIndex } : {}),
        },
        DRILLDOWN_C4_MODEL.edges,
      );
      dimmedEdgeIds = new Set(allEdgeIds.filter((id) => !lit.has(id)));
    }

    return { hiddenElementIds, hiddenEdgeIds, dimmedElementIds, dimmedEdgeIds };
  }, [focusedTrailId, activeStep, allElementIds, allEdgeIds]);

  /**
   * The construct-level subgraph each opened container hosts: the focused
   * trail's referenced components, grouped by the authored C4 component that
   * claims each (so constructs nest container → component → construct), with
   * the trail's steps as their edges. Scoped per container, so an edge that
   * crosses containers is dropped here and stays a C4 container-level line.
   */
  const constructGraphByContainer = useMemo(() => {
    if (!focusedTrailId) return undefined;
    const trail = DRILLDOWN_TRAILS.find((t) => t.id === focusedTrailId);
    if (!trail) return undefined;
    const byAlias = new Map(DRILLDOWN_COMPONENTS.map((c) => [c.alias, c]));
    const referenced = new Set<string>();
    for (const s of trail.steps) {
      referenced.add(s.from);
      referenced.add(s.to);
    }
    const componentOf = new Map<string, string>();
    for (const el of DRILLDOWN_ELEMENTS) {
      if (el.kind === 'component') for (const a of el.members ?? []) componentOf.set(a, el.id);
    }
    const out = new Map<string, C4ConstructGraph>();
    for (const el of DRILLDOWN_ELEMENTS) {
      if (el.kind !== 'container') continue;
      const aliases = (DRILLDOWN_MEMBERS[el.id] ?? []).filter(
        (a) => referenced.has(a) && byAlias.has(a),
      );
      if (aliases.length === 0) continue;
      out.set(el.id, {
        components: aliases.map((a) => byAlias.get(a)!),
        trails: [trail],
        componentOf,
      });
    }
    return out;
  }, [focusedTrailId]);

  /**
   * The construct-level spotlight for the active step, matching the component
   * graph: every construct except the step's `from`/`to`, and every construct
   * edge except the step's own, fades. The C4-element spotlight (`emphasis`)
   * only reaches containers, so this is what narrows the constructs to the hop.
   */
  const constructEmphasis = useMemo(() => {
    const none = { ids: null as ReadonlySet<string> | null, edgeIds: null as ReadonlySet<string> | null };
    if (!activeStep) return none;
    const trail = DRILLDOWN_TRAILS.find((t) => t.id === activeStep.trailId);
    if (!trail) return none;
    const steps =
      activeStep.stepIndex != null ? [trail.steps[activeStep.stepIndex]] : trail.steps;
    const spotlight = new Set<string>();
    const litEdges = new Set<string>();
    for (const s of steps) {
      spotlight.add(s.from);
      spotlight.add(s.to);
      litEdges.add(trailStepGraphEdgeId(s));
    }
    const allAliases = new Set<string>();
    const allEdgeIds = new Set<string>();
    for (const cg of constructGraphByContainer?.values() ?? []) {
      for (const c of cg.components) allAliases.add(c.alias);
      for (const e of deriveGraphEdges({ trails: [...cg.trails] })) allEdgeIds.add(e.id);
    }
    return {
      ids: new Set([...allAliases].filter((a) => !spotlight.has(a))),
      edgeIds: new Set([...allEdgeIds].filter((id) => !litEdges.has(id))),
    };
  }, [activeStep, constructGraphByContainer]);

  /**
   * Focus a trail: the C4 hides non-members, opens the containers that hold
   * them (so the cast shows at Level 3), and the component graph deep-links.
   */
  const focusTrail = useCallback(
    (trailId: string) => {
      setFocusedTrailId(trailId);
      setHoveredStep(null);
      // Swap the previous trail's opened containers for this one's, so moving
      // between trails does not accumulate open boxes.
      closeTrailContainers();
      openContainersForTrail(trailId);
    },
    [openContainersForTrail, closeTrailContainers],
  );

  const clearFocus = useCallback(() => {
    setFocusedTrailId(null);
    setHoveredStep(null);
    // Collapse the containers the focus opened, so Back leaves the diagram as
    // it was rather than with the trail's boxes still expanded.
    closeTrailContainers();
  }, [closeTrailContainers]);

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: defaultEditorTheme.colors.background,
        fontFamily: 'monospace',
      }}
    >
      {/* C4 — the summary and, on focus, the construct implementation. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <GraphWithSidebar
          persistKey="c4-drill"
          defaultWidth={320}
          minWidth={240}
          maxWidth={480}
          header={
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                {/* Icon + title centred as a group, so the icon stays vertically
                    centred when the title wraps. */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LayoutDashboard
                    size={15}
                    strokeWidth={2}
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      color:
                        defaultEditorTheme.colors.textMuted ??
                        defaultEditorTheme.colors.textSecondary,
                    }}
                  />
                  <h2
                    style={{
                      margin: 0,
                      flex: 1,
                      minWidth: 0,
                      fontSize: defaultEditorTheme.fontSizes[2],
                      fontWeight: 600,
                      color: defaultEditorTheme.colors.primary,
                      fontFamily: defaultEditorTheme.fonts.monospace,
                    }}
                  >
                    {DRILLDOWN_DOC.title}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-expanded={descriptionVisible}
                  aria-label={descriptionVisible ? 'Hide description' : 'Show description'}
                  title={descriptionVisible ? 'Hide description' : 'Show description'}
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
                    background: descriptionVisible ? '#333' : 'transparent',
                    color: descriptionVisible ? '#ddd' : '#999',
                    cursor: 'pointer',
                  }}
                >
                  <FileText size={14} />
                </button>
              </div>
              {descriptionVisible && (
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <IndustryMarkdownSlide
                    content={MODEL_DESCRIPTION}
                    slideIdPrefix="c4-desc"
                    slideIndex={0}
                    isVisible={true}
                    theme={defaultEditorTheme}
                    disableScroll={true}
                    disableBasePadding
                    enableKeyboardScrolling={false}
                    autoFocusOnVisible={false}
                  />
                </div>
              )}
            </>
          }
          sidebarBody={
            <TrailStepsNav
              trails={DRILLDOWN_TRAILS}
              focusedTrailId={focusedTrailId}
              focusedStepIndex={
                focusedStep && focusedStep.trailId === focusedTrailId
                  ? focusedStep.stepIndex
                  : null
              }
              hoveredTrailStep={hoveredStep}
              onFocusFlow={(tl) => {
                setFocusedStep(null);
                focusTrail(tl.id);
              }}
              onClearFocus={() => {
                setFocusedStep(null);
                clearFocus();
              }}
              onFocusStep={(tl, stepIndex) => {
                // Toggle: clicking the selected step again clears it.
                setFocusedStep((prev) =>
                  prev && prev.trailId === tl.id && prev.stepIndex === stepIndex
                    ? null
                    : { trailId: tl.id, stepIndex },
                );
                focusTrail(tl.id);
              }}
              onHoverStep={(tl, stepIndex) => {
                setHoveredStep({ trailId: tl.id, stepIndex });
              }}
              onHoverFlow={(tl) => {
                setHoveredStep({ trailId: tl.id, stepIndex: null });
              }}
              onLeaveStep={() => {
                setHoveredStep(null);
              }}
            />
          }
        >
          <C4Graph
            model={model}
            onSelectEdge={(edge) => {
              if (edge && (edge.trailRefs ?? []).length > 0) {
                // Auto-drill: an edge click focuses its first backing trail.
                focusTrail(edge.trailRefs![0]!.trailId);
              }
            }}
            onTrailClick={(ref) => focusTrail(ref.trailId)}
            onToggleContainer={toggle}
            hiddenElementIds={emphasis.hiddenElementIds}
            hiddenEdgeIds={emphasis.hiddenEdgeIds}
            dimmedElementIds={emphasis.dimmedElementIds}
            dimmedEdgeIds={emphasis.dimmedEdgeIds}
            dimmedConstructIds={constructEmphasis.ids}
            dimmedConstructEdgeIds={constructEmphasis.edgeIds}
            constructGraphByContainer={constructGraphByContainer}
            focusedStep={focusedStep}
            onCloseStep={() => setFocusedStep(null)}
          />
        </GraphWithSidebar>
      </div>

    </div>
  );
}

export const DrillIntoTrails: Story = {
  render: () => <Demo />,
};