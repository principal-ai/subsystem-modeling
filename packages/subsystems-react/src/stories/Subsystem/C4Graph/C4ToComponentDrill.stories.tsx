import React, { useCallback, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { C4Graph } from '../../../subsystem/C4Graph';
import { GraphWithSidebar } from '../../../subsystem/GraphWithSidebar';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { TrailsPanel } from '../../../subsystem/TrailsPanel';
import type { C4Edge } from '../../../subsystem/c4';
import {
  DRILLDOWN_C4_MODEL,
  DRILLDOWN_COMPONENTS,
  DRILLDOWN_DOC,
  DRILLDOWN_MEMBERS,
  DRILLDOWN_TRAILS,
  deriveCodeProcessKeys,
  deriveLitC4Edges,
  deriveTrailPlayerElements,
} from '../../../subsystem/__fixtures__/c4Drilldown';

/**
 * Process claims the accepted element set backs with nothing — the
 * anti-library trio (`subsystems-core/types`, `subsystems-react/ui`,
 * `proposed/studio-gist`). The component graph draws these with package
 * chrome (dashed, rounded) instead of the solid runtime chrome a real
 * deployment unit wears: the accepted C4 set is what says "box", and these
 * three have no box.
 */
const CODE_PROCESS_KEYS = deriveCodeProcessKeys(
  DRILLDOWN_C4_MODEL.nodes,
  DRILLDOWN_COMPONENTS,
);

/**
 * The C4 → component-graph drill-down, side by side.
 *
 * The C4 view (top) is the high-level summary: containers, externals, and the
 * rolled-up lines between them. The component graph (bottom) is the
 * implementation: nodes, mechanism edges, and trails — the REAL subsystem
 * model this repo lives under (`sg-1788913589907-ieokymqg9` "Gist share from
 * Studio": 19 components, 15/15 verified claims, 7 walkthroughs checked). The
 * C4 layer assumes the accepted element set on top of it; the two must agree.
 *
 * Interaction under iteration:
 *   - click a C4 edge → it selects, and the story deep-links the component
 *     graph to the first trail that backs the line (`initialTrailId`, via a
 *     remount) — the "edge is the summary, the trail is the implementation"
 *     jump;
 *   - the C4 edge inspector lists every backing trail; clicking one re-targets
 *     the component graph there;
 *   - focusing a trail dims every C4 element whose components don't appear in
 *     it — the two graphs converge on the same cast, and the lines between
 *     dimmed boxes fade with them. Focus can come from either side: a C4 edge
 *     or inspector trail row, or a trail clicked in the component graph's own
 *     Trails panel (reported back up through `onTrailSelect`);
 *   - hovering a *step* row in the Trails panel narrows the C4 dim to that
 *     single hop's `from → to` participants — elements AND lines: an edge
 *     stays lit only if it folds this hop, so a step entirely internal to a
 *     container dims every line while the container stays bright (no drawn
 *     edge represents it). Transient: falls back to the focused trail's cast
 *     on leave (`onTrailStepHover`);
 *   - container cards still open their authored Level-3 components (the
 *     existing C4 drill-down) — orthogonal to the graph-to-graph jump;
 *   - frame chrome agrees too: a process claim the accepted element set
 *     backs with nothing (`subsystems-react/ui`,
 *     `subsystems-core/types`, `proposed/studio-gist`) draws as a package
 *     boundary — rounded, dashed, with the Package glyph — instead of the
 *     solid runtime chrome a deployment unit wears (`codeProcessKeys`,
 *     computed from the same elements the C4 view renders);
 *   - the C4 view is composed with its own sidebar by the story, through the
 *     shared `GraphWithSidebar` wrapper: the sidebar carries the **trails**
 *     (the same `TrailsPanel` the component graph shows) — pick a trail beside
 *     the summary and it dims the C4 to that trail's cast and deep-links the
 *     component graph below. The C4 selection inspector stays the graph's own
 *     floating overlay; the wrapper is the composition point, so the C4 graph
 *     itself stays overlay-only.
 *
 * The status bar below the C4 view shows what the two graphs currently agree
 * on, so the wiring is visible while it is being argued with.
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
  const [selectedEdge, setSelectedEdge] = useState<C4Edge | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // The component graph is deep-linked by remount: `initialTrailId` re-applies
  // on a new id or a remount, so bumping the key is the reliable way to drop a
  // fresh focus. A real host would wire a controlled focus instead.
  const [focusedTrailId, setFocusedTrailId] = useState<string | null>(null);
  const [graphEpoch, setGraphEpoch] = useState(0);
  // C4 elements the current focus (or hovered step) does NOT touch — dimmed
  // upstairs. The companion line-level set below keeps elements and lines in
  // agreement: one source, two render sets.
  const [dimmedElementIds, setDimmedElementIds] = useState<ReadonlySet<string> | null>(null);
  // C4 lines the focus does NOT fold — an internal hop folds into no line,
  // so this dims every edge while its container stays bright.
  const [dimmedEdgeIds, setDimmedEdgeIds] = useState<ReadonlySet<string> | null>(null);
  // The trail step currently hovered in the component graph's panel — its
  // transient preview drives a narrower, step-scoped dim upstairs.
  const [hoveredStep, setHoveredStep] = useState<{ trailId: string; stepIndex: number } | null>(
    null,
  );
  // The C4 sidebar's own trails panel (composed by the story through
  // GraphWithSidebar): which rows have their steps expanded, and which step the
  // row shows focused. The focused trail itself is the shared state above.
  const [c4ExpandedTrails, setC4ExpandedTrails] = useState<Set<string>>(new Set());
  const [c4FocusedStepIndex, setC4FocusedStepIndex] = useState<number | null>(null);

  const model = useMemo(
    () => ({ ...DRILLDOWN_C4_MODEL, openContainerIds: openIds }),
    [openIds],
  );

  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort()));
  }, []);

  const trailTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of DRILLDOWN_TRAILS) map.set(t.id, t.title);
    return map;
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
   * The single source of the C4 emphasis — elements AND lines from one focus
   * (a hovered step wins over the focused trail):
   *
   *   elements — every box that owns no step endpoint dims;
   *   edges    — every line that does NOT fold the focused trail/hop dims. A
   *              step entirely internal to a container folds into no line at
   *              all, so it dims every edge even though its container stays
   *              bright: no drawn edge represents that hop.
   *
   * `null` clears both sets (nothing focused, nothing dimmed).
   */
  const applyDim = useCallback(
    (source: { trailId: string; stepIndex?: number } | null) => {
      if (!source) {
        setDimmedElementIds(null);
        setDimmedEdgeIds(null);
        return;
      }
      const trail = DRILLDOWN_TRAILS.find((t) => t.id === source.trailId);
      const steps =
        !trail
          ? []
          : source.stepIndex != null
            ? trail.steps.slice(source.stepIndex, source.stepIndex + 1)
            : trail.steps;
      const players = deriveTrailPlayerElements(steps, DRILLDOWN_MEMBERS);
      setDimmedElementIds(new Set(allElementIds.filter((id) => !players.has(id))));
      const lit = deriveLitC4Edges(source, DRILLDOWN_C4_MODEL.edges);
      setDimmedEdgeIds(new Set(allEdgeIds.filter((id) => !lit.has(id))));
    },
    [allElementIds, allEdgeIds],
  );

  /** Drop the component graph onto the trail, and dim every C4 element the
   *  trail doesn't touch — the two graphs agreeing on the same focus. */
  const focusTrail = useCallback(
    (trailId: string) => {
      setFocusedTrailId(trailId);
      setGraphEpoch((e) => e + 1);
      applyDim({ trailId });
      setHoveredStep(null);
    },
    [applyDim],
  );

  /**
   * The component graph's own trail focus (its trails panel) reported back up.
   * Mirrors the same agreement without a remount: the graph already focused
   * itself, so the host only syncs the C4 dim + status line.
   */
  const handleGraphTrailSelect = useCallback(
    (ref: { trailId: string; stepIndices?: number[] } | null) => {
      setFocusedTrailId(ref?.trailId ?? null);
      applyDim(ref ? { trailId: ref.trailId } : null);
      setHoveredStep(null);
    },
    [applyDim],
  );

  /**
   * Step-level preview: while a step row is hovered the C4 dim narrows to
   * that single hop's participants (from + to of the hovered step); leaving
   * the row falls back to the focus-level cast — or all-clear, when nothing
   * is focused.
   */
  const handleTrailStepHover = useCallback(
    (ref: { trailId: string; stepIndex: number } | null) => {
      setHoveredStep(ref);
      applyDim(
        ref
          ? { trailId: ref.trailId, stepIndex: ref.stepIndex }
          : focusedTrailId
            ? { trailId: focusedTrailId }
            : null,
      );
    },
    [applyDim, focusedTrailId],
  );

  const clearFocus = useCallback(() => {
    setFocusedTrailId(null);
    setGraphEpoch((e) => e + 1);
    applyDim(null);
    setHoveredStep(null);
  }, [applyDim]);

  /** The trail currently focused in the component graph, for the status line. */
  const focusedTrailTitle = focusedTrailId ? (trailTitles.get(focusedTrailId) ?? focusedTrailId) : null;
  /** The hovered step's `from → to`, for the status line. */
  const hoveredStepDef = hoveredStep
    ? DRILLDOWN_TRAILS.find((t) => t.id === hoveredStep.trailId)?.steps[hoveredStep.stepIndex]
    : undefined;

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
      {/* C4 — the summary level, beside its trails. */}
      <div style={{ flex: '1 1 52%', minHeight: 0, position: 'relative' }}>
        <GraphWithSidebar
          persistKey="c4-drill"
          defaultWidth={320}
          minWidth={240}
          maxWidth={480}
          header={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, color: '#ddd' }}>
                Trails
              </span>
              <span style={{ fontSize: 12, color: '#777', lineHeight: 1.5 }}>
                Pick a trail to dim the C4 to its cast and deep-link the component
                graph below; hover a step to narrow the dim to one hop. An edge
                clicked in the C4 view deep-links here the same way. Dimmed boxes
                are everything the focused trail does not touch — a hop internal
                to a container dims every line.
              </span>
            </div>
          }
          sidebarBody={
            <TrailsPanel
              trails={DRILLDOWN_TRAILS}
              expandedTrails={c4ExpandedTrails}
              focusedTrailId={focusedTrailId}
              focusedStepIndex={c4FocusedStepIndex}
              hoveredTrailStep={hoveredStep}
              onToggleCollapsed={(id) =>
                setC4ExpandedTrails((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onFocusFlow={(tl) => {
                setC4FocusedStepIndex(null);
                focusTrail(tl.id);
              }}
              onClearFocus={() => {
                setC4FocusedStepIndex(null);
                clearFocus();
              }}
              onFocusStep={(tl, stepIndex) => {
                setC4FocusedStepIndex(stepIndex);
                focusTrail(tl.id);
              }}
              onHoverStep={(tl, stepIndex) => {
                setHoveredStep({ trailId: tl.id, stepIndex });
                applyDim({ trailId: tl.id, stepIndex });
              }}
              onHoverFlow={(tl) => {
                setHoveredStep(null);
                applyDim({ trailId: tl.id });
              }}
              onLeaveStep={() => {
                setHoveredStep(null);
                applyDim(focusedTrailId ? { trailId: focusedTrailId } : null);
              }}
            />
          }
        >
          <C4Graph
            model={model}
            onSelectNode={(id) => {
              setSelectedNodeId(id);
              if (id == null) setSelectedEdge(null);
            }}
            onSelectEdge={(edge) => {
              setSelectedEdge(edge);
              if (edge && (edge.trailRefs ?? []).length > 0) {
                // Auto-drill: an edge click lands the component graph on its
                // first backing trail.
                focusTrail(edge.trailRefs![0]!.trailId);
              } else if (!edge) {
                // Deselecting the edge leaves the component graph as it is.
              }
            }}
            onTrailClick={(ref) => focusTrail(ref.trailId)}
            onToggleContainer={toggle}
            dimmedElementIds={dimmedElementIds}
            dimmedEdgeIds={dimmedEdgeIds}
          />
        </GraphWithSidebar>
      </div>

      {/* Status bar — what the two graphs currently agree on. */}
      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '6px 12px',
          fontSize: 12,
          color: '#aaa',
          borderTop: '1px solid #333',
          borderBottom: '1px solid #333',
          background: '#141414',
        }}
      >
        <span>
          c4 edge: {selectedEdge ? `${selectedEdge.source.split(':').pop()} → ${selectedEdge.target.split(':').pop()} (${selectedEdge.protocol})` : '(none)'}
        </span>
        <span>
          component graph focused trail: {focusedTrailTitle ?? '(none)'}
        </span>
        {hoveredStepDef && (
          <span>
            hovered step: {hoveredStepDef.from} → {hoveredStepDef.to}
          </span>
        )}
        {focusedTrailId && (
          <button
            type="button"
            onClick={clearFocus}
            style={{ border: 'none', background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: 12 }}
          >
            clear focus
          </button>
        )}
        <span style={{ color: '#777' }}>
          hover a step row to narrow the dim to one hop (the guidance now also
          lives in the trails sidebar beside the C4 view)
        </span>
      </div>

      {/* The component graph — the implementation level. */}
      <div style={{ flex: '1 1 48%', minHeight: 0, position: 'relative' }}>
        <SubsystemComponentGraph
          key={`${graphEpoch}:${focusedTrailId ?? ''}`}
          title={DRILLDOWN_DOC.title}
          description="The subsystem the C4 view summarizes. Focused trails are the implementation of the selected C4 line. Solid frames are accepted deployment units; dashed frames with a package glyph are code regions the C4 layer gave no container."
          components={DRILLDOWN_COMPONENTS}
          trails={DRILLDOWN_TRAILS}
          initialTrailId={focusedTrailId}
          codeProcessKeys={CODE_PROCESS_KEYS}
          onSelect={(alias) => void alias}
          onTrailSelect={handleGraphTrailSelect}
          onTrailStepHover={handleTrailStepHover}
        />
      </div>
    </div>
  );
}

export const DrillIntoTrails: Story = {
  render: () => <Demo />,
};