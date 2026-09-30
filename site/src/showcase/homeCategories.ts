/**
 * Progressive homepage examples — full showcase models projected into
 * constructs → static topology → dynamic topology → walkthrough.
 */
import type {
  SubsystemComponent,
  SubsystemEdgeView,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';
import { bookingPageCase } from './cases/booking-page';
import { tracedApiCase } from './cases/traced-api';

export type HomeCategoryId =
  | 'constructs'
  | 'static-topology'
  | 'dynamic-topology'
  | 'walkthrough';

export type HomeCategoryModel = {
  title: string;
  description?: string;
  components: SubsystemComponent[];
  walkthroughs?: SubsystemWalkthrough[];
};

export type HomeCategory = {
  id: HomeCategoryId;
  label: string;
  blurb: string;
  model: HomeCategoryModel;
  graph: {
    showEdgeLabels: boolean;
    /**
     * Which edge vocabulary this layer teaches: `graphify` for the derived
     * containment edges, `walkthroughs` for the runtime-hops layer. The two are
     * never shown together.
     */
    edgeView: SubsystemEdgeView;
    autoPlayWalkthroughs: boolean;
    showWalkthroughTitle: boolean;
    /** Derive directory frames from module paths and nest modules under them. */
    moduleNesting?: 'exact' | 'path';
    /** Explicit boundary frame colors (region key → color); host override. */
    boundaryColors?: Record<string, string>;
  };
};

/** Full portable-ish model fields the home progression needs. */
export type HomeProgressionSource = {
  title: string;
  /** Subsystem-level description, shown as the model overview on every layer. */
  description?: string;
  components: SubsystemComponent[];
  walkthroughs?: SubsystemWalkthrough[];
};

/** Per-example copy for each layer (generic projections + specific blurbs). */
export type HomeProgressionCopy = {
  constructs: { blurb: string; description: string };
  'static-topology': { blurb: string; description: string };
  'dynamic-topology': { blurb: string; description: string };
  walkthrough: { blurb: string; description: string };
};

export type HomeProgressionExample = {
  id: string;
  /** Showcase fixture dir under `site/showcase/<caseDir>/` for file drawers. */
  caseDir: string;
  source: HomeProgressionSource;
  copy: HomeProgressionCopy;
  /**
   * Explicit boundary frame colors keyed by process region key. Overrides the
   * library's derived color so the homepage can pin e.g. client vs server.
   */
  boundaryColors?: Record<string, string>;
};

function constructsOnly(components: readonly SubsystemComponent[]): SubsystemComponent[] {
  // Layer 1: declarations only — no containment (`module`) or process frames.
  return components.map(({ module: _m, process: _p, ...rest }) => rest);
}

function staticView(components: readonly SubsystemComponent[]): SubsystemComponent[] {
  // Static topology = source containment: keep `module`, drop `process`.
  return components.map(({ process: _p, ...rest }) => rest);
}

function dynamicView(components: readonly SubsystemComponent[]): SubsystemComponent[] {
  // Dynamic topology keeps process (runtime) + module (containment); the layer
  // switches the edge vocabulary to runtime seams (walkthrough hops).
  return [...components];
}

const LAYER_LABELS: Record<HomeCategoryId, string> = {
  constructs: 'Constructs',
  'static-topology': 'Static topology',
  'dynamic-topology': 'Dynamic topology',
  walkthrough: 'Walkthrough',
};

/** Project one full model into the four homepage teaching layers. */
export function buildHomeCategories(example: HomeProgressionExample): HomeCategory[] {
  const { source, copy } = example;
  const title = source.title;

  return [
    {
      id: 'constructs',
      label: LAYER_LABELS.constructs,
      blurb: copy.constructs.blurb,
      model: {
        title,
        // The description describes the subsystem, not the constructs layer,
        // so it stays the same across every layer.
        description: source.description,
        components: constructsOnly(source.components),
        walkthroughs: undefined,
      },
      graph: {
        showEdgeLabels: false,
        edgeView: 'graphify',
        autoPlayWalkthroughs: false,
        showWalkthroughTitle: false,
        boundaryColors: example.boundaryColors,
      },
    },
    {
      id: 'static-topology',
      label: LAYER_LABELS['static-topology'],
      blurb: copy['static-topology'].blurb,
      model: {
        title,
        description: source.description,
        components: staticView(source.components),
        walkthroughs: undefined,
      },
      graph: {
        showEdgeLabels: true,
        edgeView: 'graphify',
        autoPlayWalkthroughs: false,
        showWalkthroughTitle: false,
        moduleNesting: 'path',
        boundaryColors: example.boundaryColors,
      },
    },
    {
      id: 'dynamic-topology',
      label: LAYER_LABELS['dynamic-topology'],
      blurb: copy['dynamic-topology'].blurb,
      model: {
        title,
        description: source.description,
        components: dynamicView(source.components),
        // Runtime boundaries only (process over module frames). Edges belong to
        // the walkthrough layer, so no walkthroughs here.
      },
      graph: {
        showEdgeLabels: true,
        edgeView: 'walkthroughs',
        autoPlayWalkthroughs: false,
        showWalkthroughTitle: false,
        moduleNesting: 'path',
        boundaryColors: example.boundaryColors,
      },
    },
    {
      id: 'walkthrough',
      label: LAYER_LABELS.walkthrough,
      blurb: copy.walkthrough.blurb,
      model: {
        title,
        description: source.description,
        components: source.components,
        walkthroughs: source.walkthroughs,
      },
      graph: {
        showEdgeLabels: true,
        edgeView: 'walkthroughs',
        autoPlayWalkthroughs: true,
        showWalkthroughTitle: true,
        moduleNesting: 'path',
        boundaryColors: example.boundaryColors,
      },
    },
  ];
}

export const homeProgressionExamples: Record<string, HomeProgressionExample> = {
  booking: {
    id: 'booking',
    caseDir: bookingPageCase.caseDir,
    // Pin the client/server frames: the library's hash collides on these two
    // keys (both reduce to the same slot), so decide them here instead.
    boundaryColors: {
      'booking-web/client': '#e3b341',
      'booking-web/server': '#6c9eff',
    },
    source: {
      title: bookingPageCase.model.title,
      description: bookingPageCase.model.description,
      components: bookingPageCase.model.components,
      walkthroughs: bookingPageCase.model.walkthroughs,
    },
    copy: {
      constructs: {
        blurb: 'Start with the declarations on the booking path.',
        description: 'Layer 1 — constructs only. No frames, no processes, no walks yet.',
      },
      'static-topology': {
        blurb: 'See the source modules each construct lives in.',
        description:
          'Layer 2 — containment: components grouped into their source modules. Runtime comes next.',
      },
      'dynamic-topology': {
        blurb: 'Same nodes, now framed by the processes they run in.',
        description:
          'Layer 3 — process framing (booking-web/client · booking-web/server) plus module containment. Runtime edges come next.',
      },
      walkthrough: {
        blurb: 'Follow pick, book, and cancel at the real file:line seams.',
        description:
          'Layer 4 — ordered hops (pick / book / cancel) over the map you just built.',
      },
    },
  },
  'traced-api': {
    id: 'traced-api',
    caseDir: tracedApiCase.caseDir,
    source: {
      title: tracedApiCase.model.title,
      description: tracedApiCase.model.description,
      components: tracedApiCase.model.components,
      walkthroughs: tracedApiCase.model.walkthroughs,
    },
    copy: {
      constructs: {
        blurb: 'Start with the declarations on the request path.',
        description: 'Layer 1 — constructs only. No frames, no processes, no walks yet.',
      },
      'static-topology': {
        blurb: 'Group routes and services by the source module that owns them.',
        description:
          'Layer 2 — containment: components grouped into their source modules. Runtime comes next.',
      },
      'dynamic-topology': {
        blurb: 'Same nodes, now framed by the processes they run in.',
        description:
          'Layer 3 — process framing (orders-api · payments-api) plus module containment. Runtime edges come next.',
      },
      walkthrough: {
        blurb: 'Follow a traced GET and POST across the real seams.',
        description:
          'Layer 4 — GET / POST / boot walkthroughs over the map you just built.',
      },
    },
  },
};

/**
 * Active homepage progression. Swap to `'booking'` | `'traced-api'`
 * (or add another entry in `homeProgressionExamples`).
 */
export const ACTIVE_HOME_EXAMPLE_ID: keyof typeof homeProgressionExamples =
  'booking';

export const activeHomeExample =
  homeProgressionExamples[ACTIVE_HOME_EXAMPLE_ID]!;

export const homeCategories: HomeCategory[] = buildHomeCategories(
  activeHomeExample,
);
