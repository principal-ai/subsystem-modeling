import type {
  SubsystemComponent,
  SubsystemComponentEdge,
  SubsystemTrail,
  SubsystemTrailMechanism,
} from '../../../subsystem/model';
import type { GraphifyComponentDetail } from '../../../graphify';

// ---------------------------------------------------------------------------
// Build a subsystem graph from a compact spec - helpers
// ---------------------------------------------------------------------------
export function components(
  spec: Array<[alias: string, name: string, construct: SubsystemComponent['construct'], file: string, purl: string, purpose?: string, symbol?: string, declaration?: GraphifyComponentDetail]>,
): SubsystemComponent[] {
  return spec.map(([alias, name, construct, file, purl, purpose, symbol, declaration]) => ({
    alias,
    name,
    construct,
    file,
    purl,
    purpose,
    symbol,
    declaration,
  }));
}

/** Story helper: one trail whose steps derive Set B display edges. */
export function trailFromSteps(
  id: string,
  title: string,
  steps: Array<[from: string, to: string, mechanism: SubsystemTrailMechanism, file: string, line: number, symbol?: string]>,
): SubsystemTrail {
  return {
    id,
    title,
    steps: steps.map(([from, to, mechanism, file, line, symbol]) => ({
      from,
      to,
      mechanism,
      file,
      line,
      purl: `pkg:github/storybook/fixture#${file}`,
      symbol: symbol ?? from,
    })),
  };
}

/** @deprecated story helper — prefer `graphSpecFromSteps` + `trailFromSteps`. */
export function edges(
  spec: Array<[from: string, to: string, mechanism: SubsystemComponentEdge['mechanism']]>,
): SubsystemComponentEdge[] {
  return spec.map(([from, to, mechanism], i) => ({
    id: `e${i}`,
    from,
    to,
    mechanism,
  }));
}

/** Turn every spec entry into a trail step — the sole authored edge form. */
export function graphSpecFromSteps(
  spec: Array<[from: string, to: string, mechanism: SubsystemComponentEdge['mechanism']]>,
): { trails?: SubsystemTrail[] } {
  const steps: SubsystemTrail['steps'] = spec.map(([from, to, mechanism]) => ({
    from,
    to,
    mechanism: mechanism as SubsystemTrailMechanism,
    file: 'story-placeholder.ts',
    line: 1,
    purl: 'pkg:github/storybook/fixture#story-placeholder.ts',
    symbol: from,
  }));
  return {
    trails:
      steps.length > 0
        ? [{ id: 'story-steps', title: 'Story steps', steps: steps }]
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
    alias: 'v1',
    name: 'V1EventBridgeProcessor',
    construct: 'class',
    file: 'src/event-processing/V1EventBridge.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'normalizes V1 DB rows into universal events',
    symbol: 'V1EventBridgeProcessor',
  },
  {
    alias: 'v2',
    name: 'V2EventBridgeProcessor',
    construct: 'class',
    file: 'src/event-processing/V2EventBridge.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'normalizes V2 durable events into universal events',
    symbol: 'V2EventBridgeProcessor',
  },
  {
    alias: 'input',
    name: 'RepoNormalizedUniversalAgentSessionEvent',
    construct: 'interface',
    file: 'types/RepoNormalizedUniversalAgentSessionEvent.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'the subsystem\u2019s input type — a repo-normalized universal event the readers produce and the accumulator consumes',
    symbol: 'RepoNormalizedUniversalAgentSessionEvent',
  },
  {
    alias: 'acc',
    name: 'accumulateToAgentSessionEvents',
    construct: 'function',
    file: 'src/accumulateToAgentSessionEvents.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'folds normalized events into agent session events',
    symbol: 'accumulateToAgentSessionEvents',
  },
  {
    alias: 'out',
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

const investigateSpec = graphSpecFromSteps([
  ['v1', 'input', 'produces'],
  ['v2', 'input', 'produces'],
  ['input', 'acc', 'feeds'],
  ['acc', 'out', 'produces'],
]);

export const investigateOnlyTrails = investigateSpec.trails;

/** @deprecated use investigateOnlyTrails */
export const investigateOnlyEdges: SubsystemComponentEdge[] = edges([
  ['v1', 'input', 'produces'],
  ['v2', 'input', 'produces'],
  ['input', 'acc', 'feeds'],
  ['acc', 'out', 'produces'],
]);
