/**
 * C4ProjectionView — a model-derived C4 diagram with its trails in a left
 * sidebar.
 *
 * The host supplies the authored/composed `C4Model`, the subsystem components
 * and trails it was projected from, and the element → member-alias map. This
 * component owns the trail focus, the resulting emphasis, the construct-level
 * drill-down, and the open-container state (controlled or uncontrolled).
 *
 * It is deliberately data-only: no RPC, no store reads. Studio passes a
 * projection built from a stored model; Storybook passes a fixture.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { IndustryMarkdownSlide } from 'themed-markdown';
import { C4Graph } from './C4Graph';
import type { C4ConstructGraph, C4GraphProps } from './C4Graph';
import { GraphWithSidebar } from './GraphWithSidebar';
import { TrailStepsNav } from './TrailStepsNav';
import {
  deriveLitC4Edges,
  deriveTrailPlayerElements,
} from './c4TrailFocus';
import { deriveGraphEdges, trailStepGraphEdgeId } from './model';
import type { C4Element, C4Model } from './c4';
import type { SubsystemComponent, SubsystemTrail } from './model';
import type { TrailComponentLabels } from './trailStepDisplay';

export interface C4ProjectionViewProps {
  /** The C4 projection to draw. */
  model: C4Model;
  /** Subsystem components behind the model, for the construct drill-down. */
  components: readonly SubsystemComponent[];
  /** Ordered trails shown in the left sidebar. */
  trails: readonly SubsystemTrail[];
  /** C4 element id → member aliases. Container membership comes from `process`. */
  memberships: Readonly<Record<string, readonly string[]>>;
  /** Sidebar heading. Falls back to the system label. */
  title?: string;
  /** Optional Markdown description under the heading. */
  description?: string;
  /** Extra controls in the sidebar header (source badge, refresh, …). */
  headerActions?: ReactNode;
  /**
   * Controlled open-container ids. Omit to let the view own them. Pass an empty
   * array to start collapsed.
   */
  openContainerIds?: readonly string[];
  onOpenContainerIdsChange?: (ids: string[]) => void;
  /** Fired when a trail is focused or cleared. */
  onTrailSelect?: (
    ref: { trailId: string; stepIndices?: number[] } | null,
  ) => void;
  /** Fired when a trail step is hovered or unhovered. */
  onTrailStepHover?: (
    ref: { trailId: string; stepIndex: number } | null,
  ) => void;
  /** Host code viewer for a focused step. */
  renderFileViewer?: C4GraphProps['renderFileViewer'];
  /** Host trail viewer; replaces the file viewer when supplied. */
  renderTrailViewer?: C4GraphProps['renderTrailViewer'];
  /** Suppress the C4 step drawer entirely. */
  hideDrawer?: boolean;
  /** Sidebar width persistence key. */
  persistKey?: string;
  /** Outer style for the flex fill. */
  style?: CSSProperties;
}

function parentIdsOf(model: C4Model): Map<string, string> {
  const parents = new Map<string, string>();
  for (const node of model.nodes) {
    const parent =
      node.kind === 'component' ? (node.container ?? node.parentId) : node.parentId;
    if (parent) parents.set(node.id, parent);
  }
  return parents;
}

/** Include every ancestor of a player, so a filtered model never orphans a child. */
function withAncestors(
  players: ReadonlySet<string>,
  parents: ReadonlyMap<string, string>,
): Set<string> {
  const out = new Set(players);
  for (const id of players) {
    let parent = parents.get(id);
    while (parent && !out.has(parent)) {
      out.add(parent);
      parent = parents.get(parent);
    }
  }
  return out;
}

function containersForTrail(
  trail: SubsystemTrail | undefined,
  model: C4Model,
  memberships: C4ProjectionViewProps['memberships'],
): string[] {
  if (!trail) return [];
  const aliases = new Set<string>();
  for (const step of trail.steps) {
    aliases.add(step.from);
    aliases.add(step.to);
  }
  return model.nodes
    .filter(
      (node): node is Extract<C4Element, { kind: 'container' }> =>
        node.kind === 'container' &&
        (memberships[node.id] ?? []).some((alias) => aliases.has(alias)),
    )
    .map((node) => node.id);
}

function buildConstructGraphs(opts: {
  model: C4Model;
  components: readonly SubsystemComponent[];
  trails: readonly SubsystemTrail[];
  memberships: C4ProjectionViewProps['memberships'];
  focusedTrailId: string | null;
}): ReadonlyMap<string, C4ConstructGraph> | undefined {
  if (!opts.focusedTrailId) return undefined;
  const trail = opts.trails.find((t) => t.id === opts.focusedTrailId);
  if (!trail) return undefined;

  const byAlias = new Map(opts.components.map((c) => [c.alias, c]));
  const referenced = new Set<string>();
  for (const step of trail.steps) {
    referenced.add(step.from);
    referenced.add(step.to);
  }
  const componentOf = new Map<string, string>();
  for (const element of opts.model.nodes) {
    if (element.kind !== 'component') continue;
    for (const alias of element.members ?? []) componentOf.set(alias, element.id);
  }

  const out = new Map<string, C4ConstructGraph>();
  for (const element of opts.model.nodes) {
    if (element.kind !== 'container') continue;
    const aliases = (opts.memberships[element.id] ?? []).filter(
      (alias) => referenced.has(alias) && byAlias.has(alias),
    );
    if (aliases.length === 0) continue;
    out.set(element.id, {
      components: aliases.map((alias) => byAlias.get(alias)!),
      trails: [trail],
      componentOf,
    });
  }
  return out.size > 0 ? out : undefined;
}

function constructEmphasis(
  activeStep: { trailId: string; stepIndex: number } | null,
  trails: readonly SubsystemTrail[],
  constructGraphs: ReadonlyMap<string, C4ConstructGraph> | undefined,
): {
  ids: ReadonlySet<string> | null;
  edgeIds: ReadonlySet<string> | null;
} {
  if (!activeStep) return { ids: null, edgeIds: null };
  const trail = trails.find((t) => t.id === activeStep.trailId);
  if (!trail) return { ids: null, edgeIds: null };
  const step = trail.steps[activeStep.stepIndex];
  if (!step) return { ids: null, edgeIds: null };
  const steps = [step];
  const spotlight = new Set<string>();
  const litEdges = new Set<string>();
  for (const step of steps) {
    spotlight.add(step.from);
    spotlight.add(step.to);
    litEdges.add(trailStepGraphEdgeId(step));
  }
  if (!constructGraphs) return { ids: null, edgeIds: null };

  const allAliases = new Set<string>();
  const allEdgeIds = new Set<string>();
  for (const graph of constructGraphs.values()) {
    for (const component of graph.components) allAliases.add(component.alias);
    for (const edge of deriveGraphEdges({ trails: [...graph.trails] })) {
      allEdgeIds.add(edge.id);
    }
  }
  return {
    ids: new Set([...allAliases].filter((alias) => !spotlight.has(alias))),
    edgeIds: new Set([...allEdgeIds].filter((id) => !litEdges.has(id))),
  };
}

export function C4ProjectionView({
  model,
  components,
  trails,
  memberships,
  title,
  description,
  headerActions,
  openContainerIds,
  onOpenContainerIdsChange,
  onTrailSelect,
  onTrailStepHover,
  renderFileViewer,
  renderTrailViewer,
  hideDrawer = false,
  persistKey,
  style,
}: C4ProjectionViewProps) {
  const { theme } = useTheme();
  const [internalOpenIds, setInternalOpenIds] = useState<string[]>(() =>
    [...(openContainerIds ?? model.openContainerIds ?? [])].sort(),
  );
  const resolvedOpenIds = openContainerIds
    ? [...openContainerIds]
    : internalOpenIds;
  const setOpenIds = useCallback(
    (next: string[]) => {
      if (!openContainerIds) setInternalOpenIds(next);
      onOpenContainerIdsChange?.(next);
    },
    [onOpenContainerIdsChange, openContainerIds],
  );

  const [focusedTrailId, setFocusedTrailId] = useState<string | null>(null);
  const [hoveredStep, setHoveredStep] = useState<{
    trailId: string;
    stepIndex: number | null;
  } | null>(null);
  const [focusedStep, setFocusedStep] = useState<{
    trailId: string;
    stepIndex: number;
  } | null>(null);
  const trailOpenedRef = useRef<Set<string>>(new Set());

  const parents = useMemo(() => parentIdsOf(model), [model]);
  const allElementIds = useMemo(
    () => model.nodes.map((node) => node.id),
    [model],
  );
  const allEdgeIds = useMemo(
    () => model.edges.map((edge) => edge.id),
    [model],
  );
  const componentByAlias = useMemo<TrailComponentLabels>(
    () => new Map(components.map((component) => [component.alias, component])),
    [components],
  );

  const focusedTrail = focusedTrailId
    ? trails.find((trail) => trail.id === focusedTrailId)
    : undefined;
  const trailPlayers = useMemo(
    () =>
      focusedTrail
        ? withAncestors(
            deriveTrailPlayerElements(focusedTrail.steps, memberships),
            parents,
          )
        : null,
    [focusedTrail, memberships, parents],
  );

  const renderedModel = useMemo(() => {
    if (!trailPlayers) {
      return { ...model, openContainerIds: resolvedOpenIds };
    }
    const nodes = model.nodes.filter((node) => trailPlayers.has(node.id));
    const ids = new Set(nodes.map((node) => node.id));
    const edges = model.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    );
    return { ...model, nodes, edges, openContainerIds: resolvedOpenIds };
  }, [model, resolvedOpenIds, trailPlayers]);

  const containers = useCallback(
    (trailId: string) => {
      const trail = trails.find((t) => t.id === trailId);
      return containersForTrail(trail, model, memberships);
    },
    [memberships, model, trails],
  );

  const focusTrail = useCallback(
    (trailId: string) => {
      const previouslyOpened = trailOpenedRef.current;
      const nextTrailContainers = containers(trailId);
      trailOpenedRef.current = new Set(nextTrailContainers);
      const next = [
        ...new Set([
          ...resolvedOpenIds.filter((id) => !previouslyOpened.has(id)),
          ...nextTrailContainers,
        ]),
      ].sort();
      setFocusedTrailId(trailId);
      setHoveredStep(null);
      setOpenIds(next);
      onTrailSelect?.({ trailId });
    },
    [containers, onTrailSelect, resolvedOpenIds, setOpenIds],
  );

  const clearFocus = useCallback(() => {
    const opened = trailOpenedRef.current;
    trailOpenedRef.current = new Set();
    setFocusedTrailId(null);
    setHoveredStep(null);
    if (opened.size > 0) {
      setOpenIds(resolvedOpenIds.filter((id) => !opened.has(id)));
    }
    onTrailSelect?.(null);
  }, [onTrailSelect, resolvedOpenIds, setOpenIds]);

  const toggleContainer = useCallback(
    (id: string) => {
      setOpenIds(
        resolvedOpenIds.includes(id)
          ? resolvedOpenIds.filter((openId) => openId !== id)
          : [...resolvedOpenIds, id].sort(),
      );
    },
    [resolvedOpenIds, setOpenIds],
  );

  const activeStep = focusedStep ?? hoveredStep;
  const emphasis = useMemo(() => {
    let hiddenElementIds: ReadonlySet<string> | null = null;
    let hiddenEdgeIds: ReadonlySet<string> | null = null;
    if (focusedTrail) {
      const players = trailPlayers ?? new Set<string>();
      hiddenElementIds = new Set(
        allElementIds.filter((id) => !players.has(id)),
      );
      const lit = deriveLitC4Edges(
        { trailId: focusedTrail.id },
        model.edges,
      );
      hiddenEdgeIds = new Set(allEdgeIds.filter((id) => !lit.has(id)));
    }

    let dimmedElementIds: ReadonlySet<string> | null = null;
    let dimmedEdgeIds: ReadonlySet<string> | null = null;
    if (activeStep) {
      const trail = trails.find((t) => t.id === activeStep.trailId);
      const steps =
        !trail
          ? []
          : activeStep.stepIndex != null
            ? trail.steps.slice(activeStep.stepIndex, activeStep.stepIndex + 1)
            : trail.steps;
      const spotlight = deriveTrailPlayerElements(steps, memberships);
      dimmedElementIds = new Set(
        allElementIds.filter((id) => !spotlight.has(id)),
      );
      const lit = deriveLitC4Edges(
        {
          trailId: activeStep.trailId,
          ...(activeStep.stepIndex != null
            ? { stepIndex: activeStep.stepIndex }
            : {}),
        },
        model.edges,
      );
      dimmedEdgeIds = new Set(allEdgeIds.filter((id) => !lit.has(id)));
    }

    return {
      hiddenElementIds,
      hiddenEdgeIds,
      dimmedElementIds,
      dimmedEdgeIds,
    };
  }, [
    activeStep,
    allEdgeIds,
    allElementIds,
    focusedTrail,
    memberships,
    model.edges,
    trailPlayers,
    trails,
  ]);

  const constructGraphs = useMemo(
    () =>
      buildConstructGraphs({
        model,
        components,
        trails,
        memberships,
        focusedTrailId,
      }),
    [components, focusedTrailId, memberships, model, trails],
  );

  const constructStage = useMemo(
    () =>
      constructEmphasis(
        activeStep && activeStep.stepIndex != null
          ? { trailId: activeStep.trailId, stepIndex: activeStep.stepIndex }
          : null,
        trails,
        constructGraphs,
      ),
    [activeStep, constructGraphs, trails],
  );

  const openAll = useCallback(() => {
    setOpenIds(
      model.nodes
        .filter((node) => node.kind === 'container')
        .map((node) => node.id)
        .sort(),
    );
  }, [model, setOpenIds]);

  const collapseAll = useCallback(() => {
    setOpenIds([]);
  }, [setOpenIds]);

  const sidebarHeader = description ? (
    <div style={{ fontSize: theme.fontSizes[0], lineHeight: 1.5 }}>
      <IndustryMarkdownSlide
        content={description}
        slideIdPrefix="c4-projection-desc"
        slideIndex={0}
        isVisible={true}
        theme={theme}
        disableScroll={true}
        disableBasePadding
        enableKeyboardScrolling={false}
        autoFocusOnVisible={false}
      />
    </div>
  ) : null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.background,
        ...style,
      }}
    >
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: theme.colors.background,
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <h2
          style={{
            margin: 0,
            minWidth: 0,
            flex: 1,
            fontSize: theme.fontSizes[2],
            fontWeight: 600,
            color: theme.colors.text,
            fontFamily: theme.fonts.monospace,
            overflowWrap: 'anywhere',
          }}
        >
          {title ?? model.system.label}
        </h2>
        <div
          style={{
            marginLeft: 'auto',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {headerActions}
          <button type="button" onClick={openAll} style={smallButton(theme)}>
            Open all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            style={smallButton(theme)}
          >
            Collapse all
          </button>
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <GraphWithSidebar
          persistKey={persistKey}
          defaultWidth={320}
          minWidth={240}
          maxWidth={480}
          headerMaxHeight="30%"
          header={sidebarHeader}
          sidebarBody={
            <TrailStepsNav
              trails={[...trails]}
              focusedTrailId={focusedTrailId}
              focusedStepIndex={
                focusedStep && focusedStep.trailId === focusedTrailId
                  ? focusedStep.stepIndex
                  : null
              }
              hoveredTrailStep={hoveredStep}
              componentByAlias={componentByAlias}
              onFocusFlow={(trail) => {
                setFocusedStep(null);
                focusTrail(trail.id);
              }}
              onClearFocus={() => {
                setFocusedStep(null);
                clearFocus();
              }}
              onFocusStep={(trail, stepIndex) => {
                setFocusedStep((prev) =>
                  prev &&
                  prev.trailId === trail.id &&
                  prev.stepIndex === stepIndex
                    ? null
                    : { trailId: trail.id, stepIndex },
                );
                focusTrail(trail.id);
              }}
              onHoverStep={(trail, stepIndex) => {
                setHoveredStep({ trailId: trail.id, stepIndex });
                onTrailStepHover?.({ trailId: trail.id, stepIndex });
              }}
              onHoverFlow={(trail) => {
                setHoveredStep({ trailId: trail.id, stepIndex: null });
                onTrailStepHover?.(null);
              }}
              onLeaveStep={() => {
                setHoveredStep(null);
                onTrailStepHover?.(null);
              }}
            />
          }
        >
          <C4Graph
            model={renderedModel}
            onSelectEdge={(edge) => {
              const refs = edge?.trailRefs ?? [];
              if (refs.length > 0) focusTrail(refs[0]!.trailId);
            }}
            onTrailClick={(ref) => focusTrail(ref.trailId)}
            onToggleContainer={toggleContainer}
            hiddenElementIds={emphasis.hiddenElementIds}
            hiddenEdgeIds={emphasis.hiddenEdgeIds}
            dimmedElementIds={emphasis.dimmedElementIds}
            dimmedEdgeIds={emphasis.dimmedEdgeIds}
            dimmedConstructIds={constructStage.ids}
            dimmedConstructEdgeIds={constructStage.edgeIds}
            constructGraphByContainer={constructGraphs}
            focusedStep={focusedStep}
            onCloseStep={() => setFocusedStep(null)}
            renderFileViewer={renderFileViewer}
            renderTrailViewer={renderTrailViewer}
            hideDrawer={hideDrawer}
          />
        </GraphWithSidebar>
      </div>
    </div>
  );
}

function smallButton(theme: ReturnType<typeof useTheme>['theme']) {
  return {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 132,
    height: 34,
    padding: '0 12px',
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
    borderRadius: 6,
    border: `1px solid ${theme.colors.border}`,
    background: 'transparent',
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSizes[1],
    cursor: 'pointer',
  } as const;
}
