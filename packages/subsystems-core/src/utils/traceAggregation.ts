/**
 * Trace Aggregation Utilities
 *
 * Functions for converting OTLP ResourceSpans to aggregated TraceInfo objects.
 * This provides a higher-level view of traces suitable for UI display and filtering.
 */

import type {
  OtelResourceSpansData,
  OtelSpanData,
  OtelResourceData,
  TraceInfo,
  WorkflowMatchInfo,
} from '../types/otel';
import {
  getAttributeValue,
  parseNanoTime,
} from '../types/otel';

/**
 * Group spans by trace ID and aggregate metadata
 *
 * Converts OTLP ResourceSpans format into TraceInfo objects for easier
 * consumption by UI components. Each trace gets aggregated metadata including
 * duration, error status, and workflow matching information.
 *
 * @param resourceSpans - OTLP resource spans array
 * @returns Array of aggregated trace info objects
 *
 * @example
 * ```typescript
 * const traces = groupSpansByTrace(data.resourceSpans);
 * console.log(`Found ${traces.length} traces`);
 * ```
 */
export function groupSpansByTrace(resourceSpans: OtelResourceSpansData[]): TraceInfo[] {
  // Group spans by trace ID
  const traceMap = new Map<string, {
    spans: OtelSpanData[];
    resources: OtelResourceData[];
  }>();

  for (const resourceSpan of resourceSpans) {
    const resource = resourceSpan.resource;

    for (const scopeSpan of resourceSpan.scopeSpans) {
      for (const span of scopeSpan.spans) {
        const traceId = span.traceId;

        if (!traceMap.has(traceId)) {
          traceMap.set(traceId, {
            spans: [],
            resources: [],
          });
        }

        const trace = traceMap.get(traceId)!;
        trace.spans.push(span);

        // Collect unique resources
        if (!trace.resources.includes(resource)) {
          trace.resources.push(resource);
        }
      }
    }
  }

  // Convert to TraceInfo objects
  const traces: TraceInfo[] = [];

  for (const [traceId, { spans, resources }] of traceMap.entries()) {
    const traceInfo = aggregateTraceInfo(traceId, spans, resources);
    traces.push(traceInfo);
  }

  // Sort by start time (newest first)
  traces.sort((a, b) => b.startTime - a.startTime);

  return traces;
}

/**
 * Aggregate trace metadata from spans and resources
 *
 * @param traceId - Trace ID
 * @param spans - All spans in the trace
 * @param resources - All resources associated with the trace
 * @returns Aggregated trace info
 */
function aggregateTraceInfo(
  traceId: string,
  spans: OtelSpanData[],
  resources: OtelResourceData[]
): TraceInfo {
  // Find root span (no parent)
  const rootSpan = spans.find((s) => !s.parentSpanId);

  // Calculate trace start time (earliest span)
  const startTimes = spans.map((s) => parseNanoTime(s.startTimeUnixNano));
  const startTime = Math.min(...startTimes);

  // Calculate trace end time (latest span)
  const endTimes = spans.map((s) => parseNanoTime(s.endTimeUnixNano));
  const endTime = Math.max(...endTimes);

  // Calculate duration
  const duration = endTime - startTime;

  // Extract service names from resources
  const serviceNames = new Set<string>();
  for (const resource of resources) {
    const serviceName = getAttributeValue(resource.attributes, 'service.name');
    if (serviceName && typeof serviceName === 'string') {
      serviceNames.add(serviceName);
    }
  }

  // Check for errors
  const hasErrors = spans.some((span) => {
    return span.status.code === 2; // ERROR = 2 in status codes
  });

  // Extract workflow matching info from first resource
  const matchedWorkflow = extractWorkflowMatchInfo(resources[0]);

  return {
    traceId,
    name: rootSpan?.name ?? spans[0]?.name ?? 'Unknown',
    startTime,
    duration,
    spanCount: spans.length,
    serviceNames: Array.from(serviceNames),
    hasErrors,
    rootSpanId: rootSpan?.spanId,
    matchedWorkflow,
  };
}

/**
 * Extract workflow matching metadata from resource attributes
 *
 * Looks for Principal View specific attributes like:
 * - pv.storyboard.id
 * - pv.storyboard.name
 * - pv.workflow.id
 * - pv.scenario.id
 *
 * @param resource - OTEL resource
 * @returns Workflow match info if found, undefined otherwise
 */
function extractWorkflowMatchInfo(resource: OtelResourceData): WorkflowMatchInfo | undefined {
  if (!resource?.attributes) return undefined;

  const storyboardId = getAttributeValue(resource.attributes, 'pv.storyboard.id');
  const storyboardName = getAttributeValue(resource.attributes, 'pv.storyboard.name');

  if (!storyboardId || typeof storyboardId !== 'string') return undefined;
  if (!storyboardName || typeof storyboardName !== 'string') return undefined;

  const workflowId = getAttributeValue(resource.attributes, 'pv.workflow.id');
  const workflowName = getAttributeValue(resource.attributes, 'pv.workflow.name');
  const scenarioId = getAttributeValue(resource.attributes, 'pv.scenario.id');
  const scenarioName = getAttributeValue(resource.attributes, 'pv.scenario.name');

  return {
    storyboardId,
    storyboardName,
    workflowId: typeof workflowId === 'string' ? workflowId : undefined,
    workflowName: typeof workflowName === 'string' ? workflowName : undefined,
    scenarioId: typeof scenarioId === 'string' ? scenarioId : undefined,
    scenarioName: typeof scenarioName === 'string' ? scenarioName : undefined,
  };
}
