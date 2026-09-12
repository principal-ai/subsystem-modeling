import type {
  SubsystemComponent,
  SubsystemComponentEdge,
  SubsystemRelation,
  SubsystemRelationType,
  SubsystemWalkthrough,
  SubsystemWalkthroughMechanism,
} from '../../../subsystem/model';
import { derivedGraphEdgeId } from '../../../subsystem/model';
import type { GraphifyComponentDetail } from '../../../graphify';

// ---------------------------------------------------------------------------
// Build a subsystem graph from a compact spec - helpers
// ---------------------------------------------------------------------------
export function components(
  spec: Array<[id: string, name: string, construct: SubsystemComponent['construct'], file: string, purl: string, purpose?: string, symbol?: string, declaration?: GraphifyComponentDetail]>,
): SubsystemComponent[] {
  return spec.map(([id, name, construct, file, purl, purpose, symbol, declaration]) => ({
    id,
    name,
    construct,
    file,
    purl,
    purpose,
    symbol,
    declaration,
  }));
}

const RELATION_TYPES = new Set<string>([
  'imports',
  'extends',
  'inherits',
  'implements',
  'mixes_in',
  'method',
  'references',
  'contains',
]);

export function relations(
  spec: Array<[from: string, to: string, relationType: SubsystemRelationType, refs?: string[]]>,
): SubsystemRelation[] {
  return spec.map(([from, to, relationType, refs], i) => ({
    id: `r${i}`,
    from,
    to,
    relationType,
    refs,
  }));
}

/** Story helper: one walkthrough whose hops derive Set B display edges. */
export function walkthroughFromHops(
  id: string,
  title: string,
  hops: Array<[from: string, to: string, mechanism: SubsystemWalkthroughMechanism, file: string, line: number]>,
): SubsystemWalkthrough {
  return {
    id,
    title,
    steps: hops.map(([from, to, mechanism, file, line]) => ({
      from,
      to,
      mechanism,
      file,
      line,
    })),
  };
}

/** @deprecated story helper — prefer `relations` + `walkthroughFromHops`. */
export function edges(
  spec: Array<[from: string, to: string, mechanism: SubsystemComponentEdge['mechanism'], refs?: string[]]>,
): SubsystemComponentEdge[] {
  return spec.map(([from, to, mechanism, refs], i) => ({
    id: `e${i}`,
    from,
    to,
    mechanism,
    refs,
  }));
}

/** Split mixed mechanism lists into relations + optional walkthrough for stories. */
export function graphSpecFromEdges(
  spec: Array<[from: string, to: string, mechanism: SubsystemComponentEdge['mechanism'], refs?: string[]]>,
): { relations: SubsystemRelation[]; walkthroughs?: SubsystemWalkthrough[] } {
  const rels: SubsystemRelation[] = [];
  const hops: SubsystemWalkthrough['steps'] = [];
  for (const [from, to, mechanism, refs] of spec) {
    if (RELATION_TYPES.has(mechanism)) {
      rels.push({
        id: derivedGraphEdgeId(from, to, mechanism as SubsystemRelationType),
        from,
        to,
        relationType: mechanism as SubsystemRelationType,
        refs,
      });
    } else {
      hops.push({
        from,
        to,
        mechanism: mechanism as SubsystemWalkthroughMechanism,
        file: 'story-placeholder.ts',
        line: 1,
      });
    }
  }
  return {
    relations: rels,
    walkthroughs:
      hops.length > 0
        ? [{ id: 'story-hops', title: 'Story hops', steps: hops }]
        : undefined,
  };
}

export const readerDetail: GraphifyComponentDetail = {
  kind: 'class',
  methods: [
    { nodeId: 'm1', name: 'normalize', returnType: 'SessionEvent[]' },
    { nodeId: 'm2', name: 'readSession', parameters: [{ type: 'string' }], returnType: 'SessionRecord' },
    { nodeId: 'm3', name: 'toUniversalEvents', returnType: 'UniversalEvent[]' },
  ],
  properties: [{ name: 'sessionId', type: 'string' }],
  extends: [],
  implements: ['SessionReaderLike'],
  instantiations: [{ nodeId: 'caller1', name: 'capture-session' }],
  references: [{ nodeId: 'ref1', name: 'supported-agents', context: 'type' }],
};

// ---------------------------------------------------------------------------
// Single package (no consumers) - the investigate-and-pin pattern.
// Conveys the idea via LAYERS: readers (input) → accumulator (processing).
// ---------------------------------------------------------------------------
export const investigateOnlyComponents: SubsystemComponent[] = [
  {
    id: 'v1',
    name: 'V1EventBridgeProcessor',
    construct: 'class',
    file: 'src/event-processing/V1EventBridge.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'normalizes V1 DB rows into universal events',
    symbol: 'V1EventBridgeProcessor',
  },
  {
    id: 'v2',
    name: 'V2EventBridgeProcessor',
    construct: 'class',
    file: 'src/event-processing/V2EventBridge.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'normalizes V2 durable events into universal events',
    symbol: 'V2EventBridgeProcessor',
  },
  {
    id: 'input',
    name: 'RepoNormalizedUniversalAgentSessionEvent',
    construct: 'interface',
    file: 'types/RepoNormalizedUniversalAgentSessionEvent.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'the subsystem\u2019s input type — a repo-normalized universal event the readers produce and the accumulator consumes',
    symbol: 'RepoNormalizedUniversalAgentSessionEvent',
  },
  {
    id: 'acc',
    name: 'accumulateToAgentSessionEvents',
    construct: 'function',
    file: 'src/accumulateToAgentSessionEvents.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'folds normalized events into agent session events',
    symbol: 'accumulateToAgentSessionEvents',
  },
  {
    id: 'out',
    name: 'AgentSessionEvent',
    construct: 'interface',
    file: 'types/AgentSessionEvent.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'output event shape',
    symbol: 'AgentSessionEvent',
    declaration: {
      kind: 'type',
      properties: [
        { name: 'sessionId', type: 'string' },
        { name: 'description', type: 'string' },
      ],
      usedBy: [{ nodeId: 'acc', name: 'accumulateToAgentSessionEvents', context: 'return_type' }],
      implementors: [],
    } satisfies GraphifyComponentDetail,
  },
];

const investigateSpec = graphSpecFromEdges([
  ['v1', 'input', 'produces'],
  ['v2', 'input', 'produces'],
  ['input', 'acc', 'feeds'],
  ['acc', 'out', 'produces'],
]);

export const investigateOnlyRelations = investigateSpec.relations;
export const investigateOnlyWalkthroughs = investigateSpec.walkthroughs;

/** @deprecated use investigateOnlyRelations + investigateOnlyWalkthroughs */
export const investigateOnlyEdges: SubsystemComponentEdge[] = edges([
  ['v1', 'input', 'produces'],
  ['v2', 'input', 'produces'],
  ['input', 'acc', 'feeds'],
  ['acc', 'out', 'produces'],
]);
