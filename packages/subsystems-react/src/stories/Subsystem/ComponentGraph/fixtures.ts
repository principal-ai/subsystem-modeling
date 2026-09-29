import type {
  SubsystemComponent,
  SubsystemComponentEdge,
  SubsystemWalkthrough,
  SubsystemWalkthroughMechanism,
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

/** Story helper: one walkthrough whose hops derive Set B display edges. */
export function walkthroughFromHops(
  id: string,
  title: string,
  hops: Array<[from: string, to: string, mechanism: SubsystemWalkthroughMechanism, file: string, line: number, symbol?: string]>,
): SubsystemWalkthrough {
  return {
    id,
    title,
    steps: hops.map(([from, to, mechanism, file, line, symbol]) => ({
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

/** @deprecated story helper — prefer `graphSpecFromHops` + `walkthroughFromHops`. */
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

/** Turn every spec entry into a walkthrough hop — the sole authored edge form. */
export function graphSpecFromHops(
  spec: Array<[from: string, to: string, mechanism: SubsystemComponentEdge['mechanism']]>,
): { walkthroughs?: SubsystemWalkthrough[] } {
  const hops: SubsystemWalkthrough['steps'] = spec.map(([from, to, mechanism]) => ({
    from,
    to,
    mechanism: mechanism as SubsystemWalkthroughMechanism,
    file: 'story-placeholder.ts',
    line: 1,
    purl: 'pkg:github/storybook/fixture#story-placeholder.ts',
    symbol: from,
  }));
  return {
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

const investigateSpec = graphSpecFromHops([
  ['v1', 'input', 'produces'],
  ['v2', 'input', 'produces'],
  ['input', 'acc', 'feeds'],
  ['acc', 'out', 'produces'],
]);

export const investigateOnlyWalkthroughs = investigateSpec.walkthroughs;

/** @deprecated use investigateOnlyWalkthroughs */
export const investigateOnlyEdges: SubsystemComponentEdge[] = edges([
  ['v1', 'input', 'produces'],
  ['v2', 'input', 'produces'],
  ['input', 'acc', 'feeds'],
  ['acc', 'out', 'produces'],
]);
