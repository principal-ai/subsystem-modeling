/**
 * Homepage: left nav of standard layers + one live subsystem model per layer.
 * Auto-advances with a progress indicator; pauses while the graph is in use.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import { ThemeProvider, defaultEditorTheme, useTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react/dist/subsystem/SubsystemComponentGraph.js';
import {
  activeHomeExample,
  homeCategories,
  type HomeCategoryId,
} from '../showcase/homeCategories';
import { makeShowcaseRenderers } from '../showcase/files';

const LAYER_DWELL_MS = 10_000;
const WALKTHROUGH_STEP_MS = 4_500;

function walkthroughCycleMs(
  walkthroughs: { steps: unknown[] }[] | undefined,
): number {
  if (!walkthroughs?.length) return LAYER_DWELL_MS;
  const steps = walkthroughs.reduce((n, w) => n + w.steps.length, 0);
  if (steps === 0) return LAYER_DWELL_MS;
  // Autoplay shows the first step immediately, then waits interval between steps;
  // one full pass through all steps takes steps * interval before it would loop.
  return steps * WALKTHROUGH_STEP_MS;
}

function ExplorerInner() {
  const { theme } = useTheme();
  const [selectedId, setSelectedId] = useState<HomeCategoryId>('constructs');
  // Sticky pause: interacting with the graph pauses auto-advance and it does
  // NOT resume on its own — the play button (or picking another layer) resumes.
  const [paused, setPaused] = useState(false);
  // Transient pause: while the cursor is over the graph, auto-advance freezes
  // and resumes on leave (so hovering to inspect doesn't get advanced away).
  const [hovering, setHovering] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const remainingRef = useRef(LAYER_DWELL_MS);
  const fileRenderers = useMemo(
    () => makeShowcaseRenderers(activeHomeExample.caseDir),
    [],
  );

  const selectedIndex = Math.max(
    0,
    homeCategories.findIndex((c) => c.id === selectedId),
  );
  const selected = homeCategories[selectedIndex] ?? homeCategories[0]!;
  // Frozen = explicitly paused (sticky) or hovered (transient).
  const isPaused = paused || hovering;

  const dwellMs = useMemo(() => {
    if (selected.id === 'walkthrough') {
      return walkthroughCycleMs(selected.model.walkthroughs);
    }
    return LAYER_DWELL_MS;
  }, [selected]);

  // Reset countdown whenever the active layer or its dwell changes.
  useEffect(() => {
    remainingRef.current = dwellMs;
    setProgress(0);
    setDescriptionOpen(false);
  }, [selectedId, dwellMs]);

  // Drive progress + advance; freeze while paused (e.g. graph interaction).
  useEffect(() => {
    if (isPaused) return;

    const start = Date.now();
    const startRemaining = remainingRef.current;
    let raf = 0;

    const tick = () => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, startRemaining - elapsed);
      remainingRef.current = left;
      setProgress(dwellMs <= 0 ? 1 : 1 - left / dwellMs);
      if (left <= 0) {
        const next = homeCategories[(selectedIndex + 1) % homeCategories.length]!;
        setSelectedId(next.id);
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [isPaused, selectedId, dwellMs, selectedIndex]);

  const pauseForInteraction = () => {
    setPaused(true);
  };

  const border = theme.colors.border ?? 'rgba(127,127,127,0.3)';

  return (
    <div className="home-explorer">
      <nav className="home-explorer-nav" aria-label="Subsystem model layers">
        <div className="home-explorer-nav-header">
          <p className="home-explorer-nav-label">Modeling a Subsystem</p>
          <button
            type="button"
            className="home-explorer-play-toggle"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Play auto-advance' : 'Pause auto-advance'}
            title={paused ? 'Play' : 'Pause'}
          >
            {paused ? (
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M4 2.5v11l9-5.5-9-5.5z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
        <ul className="home-explorer-nav-list">
          {homeCategories.map((cat) => {
            const active = cat.id === selected.id;
            return (
              <li
                key={cat.id}
                className={
                  active
                    ? 'home-explorer-nav-row home-explorer-nav-row--active'
                    : 'home-explorer-nav-row'
                }
              >
                <button
                  type="button"
                  className={
                    active
                      ? 'home-explorer-nav-item home-explorer-nav-item--active'
                      : 'home-explorer-nav-item'
                  }
                  aria-current={active ? 'true' : undefined}
                  aria-expanded={active}
                  onClick={() => {
                    setPaused(false);
                    setSelectedId(cat.id);
                  }}
                >
                  {cat.label}
                </button>
                <div
                  className={
                    active
                      ? 'home-explorer-blurb-slot home-explorer-blurb-slot--open'
                      : 'home-explorer-blurb-slot'
                  }
                >
                  <div className="home-explorer-blurb-slot-inner">
                    <p className="home-explorer-blurb">{cat.blurb}</p>
                  </div>
                </div>
                {active ? (
                  <div
                    className={
                      isPaused
                        ? 'home-explorer-progress home-explorer-progress--paused'
                        : 'home-explorer-progress'
                    }
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                    aria-label={
                      isPaused
                        ? 'Auto-advance paused'
                        : 'Progress toward next layer'
                    }
                  >
                    <div
                      className="home-explorer-progress-bar"
                      style={{ transform: `scaleX(${progress})` }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        className="home-explorer-stage"
        style={{ borderColor: border, background: theme.colors.background }}
      >
        <div
          className="home-explorer-stage-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <h2 className="home-explorer-stage-title">{selected.model.title}</h2>
          {selected.id === 'constructs' && selected.model.description && (
            <button
              type="button"
              className="home-explorer-description-toggle"
              onClick={() => {
                setPaused(true);
                setDescriptionOpen((v) => !v);
              }}
              aria-expanded={descriptionOpen}
              aria-label={
                descriptionOpen ? 'Hide description' : 'Show description'
              }
              title={descriptionOpen ? 'Hide description' : 'Show description'}
            >
              Description
            </button>
          )}
        </div>
        <div
          className="home-explorer-graph"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onPointerDown={pauseForInteraction}
          onWheel={pauseForInteraction}
        >
          <SubsystemComponentGraph
            key={selected.id}
            components={selected.model.components}
            relations={selected.model.relations}
            walkthroughs={selected.model.walkthroughs}
            title={selected.model.title}
            hideSidebar
            description={selected.model.description}
            descriptionOpen={descriptionOpen}
            onDescriptionOpenChange={setDescriptionOpen}
            showEdgeLabels={selected.graph.showEdgeLabels}
            edgeView={selected.graph.edgeView}
            autoPlayWalkthroughs={selected.graph.autoPlayWalkthroughs}
            walkthroughAutoPlayIntervalMs={WALKTHROUGH_STEP_MS}
            walkthroughStepMode="focus"
            zoomOnWalkthroughFocus
            walkthroughFocusDurationMs={900}
            showWalkthroughTitle={selected.graph.showWalkthroughTitle}
            boundaryColors={selected.graph.boundaryColors}
            renderFileViewer={fileRenderers.renderFileViewer}
            renderWalkthroughViewer={fileRenderers.renderWalkthroughViewer}
          />
        </div>
      </div>
    </div>
  );
}

export function HomeCategoryExplorer() {
  return (
    <ThemeProvider theme={defaultEditorTheme}>
      <ExplorerInner />
    </ThemeProvider>
  );
}
