/**
 * Progressive homepage examples — full showcase models projected into
 * constructs → static topology → dynamic topology → walkthrough.
 */
import type {
  SubsystemComponent,
  SubsystemEdgeView,
  SubsystemRelation,
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
  relations: SubsystemRelation[];
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
     * Which edge vocabulary this layer teaches: `relations` for the topology
     * layers, `walkthroughs` for the runtime-hops layer. The two are never
     * shown together.
     */
    edgeView: SubsystemEdgeView;
    autoPlayWalkthroughs: boolean;
    showWalkthroughTitle: boolean;
  };
};

/** Full portable-ish model fields the home progression needs. */
export type HomeProgressionSource = {
  title: string;
  /** Subsystem-level description, shown as the model overview on every layer. */
  description?: string;
  components: SubsystemComponent[];
  relations: SubsystemRelation[];
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
};

function constructsOnly(components: readonly SubsystemComponent[]): SubsystemComponent[] {
  // Keep `process`: the constructs list sorts by it. Only module frames are
  // dropped (no topology in this layer).
  return components.map(({ module: _m, ...rest }) => rest);
}

function staticView(components: readonly SubsystemComponent[]): SubsystemComponent[] {
  // Static topology = relations only; containment (module) and process are dynamic.
  return components.map(({ process: _p, module: _m, ...rest }) => rest);
}

function dynamicView(components: readonly SubsystemComponent[]): SubsystemComponent[] {
  // Dynamic topology = process (runtime) + module (containment).
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
        relations: [],
        walkthroughs: undefined,
      },
      graph: {
        showEdgeLabels: false,
        edgeView: 'relations',
        autoPlayWalkthroughs: false,
        showWalkthroughTitle: false,
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
        relations: source.relations,
        walkthroughs: undefined,
      },
      graph: {
        showEdgeLabels: true,
        edgeView: 'relations',
        autoPlayWalkthroughs: false,
        showWalkthroughTitle: false,
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
        relations: source.relations,
        walkthroughs: undefined,
      },
      graph: {
        showEdgeLabels: true,
        edgeView: 'relations',
        autoPlayWalkthroughs: false,
        showWalkthroughTitle: false,
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
        relations: source.relations,
        walkthroughs: source.walkthroughs,
      },
      graph: {
        showEdgeLabels: true,
        edgeView: 'walkthroughs',
        autoPlayWalkthroughs: true,
        showWalkthroughTitle: true,
      },
    },
  ];
}

export const homeProgressionExamples: Record<string, HomeProgressionExample> = {
  booking: {
    id: 'booking',
    caseDir: bookingPageCase.caseDir,
    source: {
      title: bookingPageCase.model.title,
      description: bookingPageCase.model.description,
      components: bookingPageCase.model.components,
      relations: bookingPageCase.model.relations,
      walkthroughs: bookingPageCase.model.walkthroughs,
    },
    copy: {
      constructs: {
        blurb: 'Start with the declarations on the booking path.',
        description: 'Layer 1 — constructs only. No map, no processes, no walks yet.',
      },
      'static-topology': {
        blurb: 'Connect them in source — relations.',
        description:
          'Layer 2 — add structural relations. Containment and runtime come next.',
      },
      'dynamic-topology': {
        blurb: 'Mark where each one runs — client vs server.',
        description:
          'Layer 3 — same nodes, framed by process (booking-web/client · booking-web/server), plus module containment.',
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
      relations: tracedApiCase.model.relations,
      walkthroughs: tracedApiCase.model.walkthroughs,
    },
    copy: {
      constructs: {
        blurb: 'Start with the declarations on the request path.',
        description: 'Layer 1 — constructs only. No map, no processes, no walks yet.',
      },
      'static-topology': {
        blurb: 'Connect routes and services in source — relations.',
        description:
          'Layer 2 — add structural relations. Containment and runtime come next.',
      },
      'dynamic-topology': {
        blurb: 'Mark where each one runs — orders-api vs payments-api.',
        description:
          'Layer 3 — same nodes, framed by process (orders-api · payments-api), plus module containment.',
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
