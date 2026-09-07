import type {
  SubsystemComponent,
  SubsystemComponentEdge,
} from '../../../subsystem/model';
import type { GraphifyComponentDetail } from '../../../graphify';

// ---------------------------------------------------------------------------
// Build a subsystem graph from a compact spec - helpers
// ---------------------------------------------------------------------------
export function components(
  spec: Array<[id: string, name: string, construct: SubsystemComponent['construct'], file: string, purl: string, purpose?: string, symbol?: string, detail?: GraphifyComponentDetail]>,
): SubsystemComponent[] {
  return spec.map(([id, name, construct, file, purl, purpose, symbol, detail]) => ({
    id,
    name,
    construct,
    file,
    purl,
    purpose,
    symbol,
    detail,
  }));
}

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
    detail: {
      kind: 'type',
      properties: [
        { name: 'eventType', type: 'NormalizedEventType' },
        { name: 'sessionId', type: 'string' },
        { name: 'timestamp', type: 'number' },
      ],
      usedBy: [{ nodeId: 'acc', name: 'accumulateToAgentSessionEvents', context: 'parameter_type' }],
      implementors: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'acc',
    name: 'accumulateToAgentSessionEvents',
    construct: 'function',
    file: 'src/event-processing/accumulator.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'accumulates normalized events into agent session events',
    symbol: 'accumulateToAgentSessionEvents',
  },
  {
    id: 'out',
    name: 'AgentSessionEvent',
    construct: 'interface',
    file: 'src/event-processing/accumulator.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'the subsystem\u2019s output type — an accumulated agent-session event',
    symbol: 'AgentSessionEvent',
    detail: {
      kind: 'type',
      properties: [
        { name: 'sessionName', type: 'string' },
        { name: 'operation', type: 'AgentSessionEventOperation' },
        { name: 'description', type: 'string' },
      ],
      usedBy: [{ nodeId: 'acc', name: 'accumulateToAgentSessionEvents', context: 'return_type' }],
      implementors: [],
    } satisfies GraphifyComponentDetail,
  },
];

export const investigateOnlyEdges: SubsystemComponentEdge[] = edges([
  // Concept-level data flow — the LLM's semantic intent.
  ['v1', 'input', 'produces'],
  ['v2', 'input', 'produces'],
  ['input', 'acc', 'feeds'],
  ['acc', 'out', 'produces'],
]);
