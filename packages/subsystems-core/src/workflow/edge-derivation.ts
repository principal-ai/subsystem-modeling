/**
 * Edge Derivation from Workflows
 *
 * Extracts span context from workflow event templates and derives
 * expected edges (span transitions) for validation against spans.canvas.
 *
 * @see .principal-views/WORKFLOW-SPAN-INTEGRATION.md
 */

import type { WorkflowTemplate, WorkflowScenario } from './types';
import { isEventTemplate, getEventSpan, getWorkflowRootSpan } from './types';

/**
 * A derived edge representing a span transition observed in a workflow
 */
export interface DerivedEdge {
  /** Source span name (exact) */
  fromSpan: string;

  /** Target span name (exact) */
  toSpan: string;

  /** Workflow file where this edge was observed */
  workflowFile?: string;

  /** Scenario ID where this edge was observed */
  scenarioId: string;

  /** Event names that caused this transition */
  eventNames: string[];

  /** Execution order (1-based) within the scenario */
  sequenceNumber: number;
}

/**
 * Result of edge derivation from a single workflow
 */
export interface WorkflowEdgeDerivationResult {
  /** Workflow name */
  workflowName: string;

  /** Root span for this workflow */
  rootSpan: string | undefined;

  /** All spans referenced in this workflow */
  referencedSpans: string[];

  /** Derived edges per scenario */
  scenarioEdges: Array<{
    scenarioId: string;
    edges: DerivedEdge[];
  }>;
}

/**
 * Result of edge derivation across all workflows
 */
export interface EdgeDerivationResult {
  /** All derived edges (deduplicated) */
  edges: DerivedEdge[];

  /** Per-workflow breakdown */
  workflows: WorkflowEdgeDerivationResult[];

  /** All unique spans referenced across workflows */
  allSpans: string[];
}

/**
 * Extract span context from a workflow's event templates
 *
 * @param scenario - Workflow scenario to analyze
 * @param rootSpan - Default span for events without explicit span
 * @returns Array of { eventName, span } entries in template order
 */
export function extractEventSpans(
  scenario: WorkflowScenario,
  rootSpan: string | undefined
): Array<{ eventName: string; span: string }> {
  const events = scenario.template.events;
  if (!events) {
    return [];
  }

  const result: Array<{ eventName: string; span: string }> = [];

  for (const [eventName, eventTemplate] of Object.entries(events)) {
    const explicitSpan = isEventTemplate(eventTemplate)
      ? getEventSpan(eventTemplate)
      : undefined;

    // Use explicit span if provided, otherwise fall back to rootSpan
    const span = explicitSpan ?? rootSpan;

    if (span) {
      result.push({ eventName, span });
    }
  }

  return result;
}

/**
 * Derive edges from span transitions in event sequence
 *
 * Identifies when consecutive events are in different spans,
 * which represents a potential edge (call relationship).
 *
 * Note: This captures temporal order, not parent-child nesting.
 * We observe "span A was active, then span B was active" but
 * cannot infer nesting without actual trace data.
 *
 * @param eventSpans - Event-span mappings in order
 * @param scenarioId - ID of the scenario being analyzed
 * @returns Array of derived edges
 */
export function deriveEdgesFromSequence(
  eventSpans: Array<{ eventName: string; span: string }>,
  scenarioId: string
): DerivedEdge[] {
  const edges: DerivedEdge[] = [];
  const seenEdges = new Set<string>();
  let sequenceNumber = 0;

  for (let i = 0; i < eventSpans.length - 1; i++) {
    const current = eventSpans[i];
    const next = eventSpans[i + 1];

    // Transition occurs when spans differ
    if (current.span !== next.span) {
      const edgeKey = `${current.span}->${next.span}`;

      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        sequenceNumber++;
        edges.push({
          fromSpan: current.span,
          toSpan: next.span,
          scenarioId,
          eventNames: [current.eventName, next.eventName],
          sequenceNumber,
        });
      }
    }
  }

  return edges;
}

/**
 * Derive all edges from a workflow template
 *
 * @param workflow - Workflow template to analyze
 * @param workflowFile - Optional file path for tracking
 * @returns Edge derivation result for this workflow
 */
export function deriveWorkflowEdges(
  workflow: WorkflowTemplate,
  workflowFile?: string
): WorkflowEdgeDerivationResult {
  const rootSpan = getWorkflowRootSpan(workflow);
  const allSpans = new Set<string>();
  const scenarioEdges: WorkflowEdgeDerivationResult['scenarioEdges'] = [];

  if (rootSpan) {
    allSpans.add(rootSpan);
  }

  for (const scenario of workflow.scenarios) {
    const eventSpans = extractEventSpans(scenario, rootSpan);

    // Collect all referenced spans
    for (const { span } of eventSpans) {
      allSpans.add(span);
    }

    // Derive edges from transitions
    const edges = deriveEdgesFromSequence(eventSpans, scenario.id);

    // Attach workflow file to each edge
    if (workflowFile) {
      for (const edge of edges) {
        edge.workflowFile = workflowFile;
      }
    }

    scenarioEdges.push({
      scenarioId: scenario.id,
      edges,
    });
  }

  return {
    workflowName: workflow.name,
    rootSpan,
    referencedSpans: Array.from(allSpans),
    scenarioEdges,
  };
}

/**
 * Derive edges from multiple workflows
 *
 * @param workflows - Array of { workflow, filePath } pairs
 * @returns Combined edge derivation result
 */
export function deriveEdgesFromWorkflows(
  workflows: Array<{ workflow: WorkflowTemplate; filePath?: string }>
): EdgeDerivationResult {
  const allSpans = new Set<string>();
  const workflowResults: WorkflowEdgeDerivationResult[] = [];
  const edgeMap = new Map<string, DerivedEdge>();

  for (const { workflow, filePath } of workflows) {
    const result = deriveWorkflowEdges(workflow, filePath);
    workflowResults.push(result);

    // Collect spans
    for (const span of result.referencedSpans) {
      allSpans.add(span);
    }

    // Collect and deduplicate edges
    for (const scenarioResult of result.scenarioEdges) {
      for (const edge of scenarioResult.edges) {
        const key = `${edge.fromSpan}->${edge.toSpan}`;

        if (!edgeMap.has(key)) {
          edgeMap.set(key, edge);
        }
      }
    }
  }

  return {
    edges: Array.from(edgeMap.values()),
    workflows: workflowResults,
    allSpans: Array.from(allSpans),
  };
}

/**
 * Group derived edges by source and target for display
 *
 * @param edges - Derived edges to group
 * @returns Map of edge key to list of workflows/scenarios containing it
 */
export function groupEdgesBySources(
  edges: DerivedEdge[]
): Map<string, Array<{ workflowFile?: string; scenarioId: string }>> {
  const grouped = new Map<string, Array<{ workflowFile?: string; scenarioId: string }>>();

  for (const edge of edges) {
    const key = `${edge.fromSpan}->${edge.toSpan}`;
    const sources = grouped.get(key) || [];
    sources.push({
      workflowFile: edge.workflowFile,
      scenarioId: edge.scenarioId,
    });
    grouped.set(key, sources);
  }

  return grouped;
}
