/**
 * Template Renderer
 *
 * Renders workflow templates into human-readable text using
 * OTEL events, selected scenarios, and template expressions.
 */

import type {
  WorkflowTemplate,
  WorkflowScenario,
  OtelEvent,
  WorkflowResult,
  WorkflowContext,
  SpanTreeNode,
  FormattingOptions,
} from './types';
import { getEventTemplateString } from './types';
import { parseTemplate, ParsedTemplate, type TemplateContext, type TemplateData } from './template-parser';
import { selectScenario, computeAggregates } from './scenario-matcher';

/**
 * Build @span data from span attributes for template access
 *
 * Flattens dot-notation keys to nested objects so templates can use:
 * {{@span.output.status}} to access span attribute "output.status"
 */
function buildSpanData(spanAttributes?: Record<string, unknown>): TemplateData | undefined {
  if (!spanAttributes || Object.keys(spanAttributes).length === 0) {
    return undefined;
  }

  const span: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(spanAttributes)) {
    if (key.includes('.')) {
      // Nested key: convert "output.status" -> { output: { status: value } }
      const parts = key.split('.');
      let current: Record<string, unknown> = span;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
          current[parts[i]] = {};
        }
        current = current[parts[i]] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
    } else {
      span[key] = value;
    }
  }

  return { span };
}

/**
 * Build a nested context object from flat dot-notation attributes.
 * Converts { 'user.name': 'John' } to { user: { name: 'John' } }
 */
function buildContextFromAttributes(attributes?: Record<string, unknown>): Record<string, unknown> {
  if (!attributes || Object.keys(attributes).length === 0) {
    return {};
  }

  const context: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let current: Record<string, unknown> = context;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
          current[parts[i]] = {};
        }
        current = current[parts[i]] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
    } else {
      context[key] = value;
    }
  }

  return context;
}

/**
 * Render a template string using an OtelEvent's attributes.
 *
 * This is the recommended way to render event templates in UI components.
 * It handles:
 * - Building nested context from event.attributes for {{variable}} access
 * - Building @span data from event.spanAttributes for {{@span.variable}} access
 * - Returns ParsedTemplate with segments for proper variable highlighting
 *
 * @param template - Template string with {{variables}}
 * @param event - Optional OtelEvent providing attribute data
 * @returns ParsedTemplate with segments indicating resolved/unresolved variables
 *
 * @example
 * // With event data
 * const parsed = renderEventTemplate("User {{user.name}} logged in", event);
 * parsed.segments.forEach(seg => {
 *   if (seg.type === 'variable') {
 *     // Style based on seg.resolved
 *   }
 * });
 *
 * // Without event (preview mode) - variables remain unresolved
 * const preview = renderEventTemplate("User {{user.name}} logged in");
 */
export function renderEventTemplate(template: string, event?: OtelEvent): ParsedTemplate {
  const context = buildContextFromAttributes(event?.attributes);
  const spanData = buildSpanData(event?.spanAttributes);

  return parseTemplate(template, context as TemplateContext, spanData);
}

/**
 * Render a workflow from a template and events
 *
 * Main entry point for workflow generation.
 *
 * @param template - Workflow template
 * @param events - Collected OTEL events
 * @returns Rendered workflow
 */
export function renderWorkflow(template: WorkflowTemplate, events: OtelEvent[]): WorkflowResult {
  // Compute aggregates for scenario matching and templates
  const aggregates = computeAggregates(events);

  // Select scenario
  const matchResult = selectScenario(template, events);

  // Handle no match case
  if (!matchResult.recommendedScenario) {
    return {
      text: 'No workflow scenario could be matched to this trace.',
      scenarioId: 'no-match',
      metadata: {
        eventCount: events.length,
        spanCount: events.filter((e) => e.type === 'span').length,
        logCount: events.filter((e) => e.type === 'log').length,
      },
    };
  }

  const scenario = matchResult.recommendedScenario.scenario;

  // Build context
  const context: WorkflowContext = {
    template,
    scenario,
    events,
    aggregates,
    formatting: {
      indentPerLevel: '  ',
      timestampFormat: 'HH:mm:ss.SSS',
      showTimestamps: false,
      showDuration: true,
      showSpanIds: false,
      showAttributes: 'matched',
      ...template.formatting,
    },
  };

  // Build span tree for hierarchical rendering
  context.spanTree = buildSpanTree(events, template.showLogsPerSpan);

  // Render workflow
  const text = renderScenario(context);

  // Build metadata
  const spans = events.filter((e) => e.type === 'span');
  const logs = events.filter((e) => e.type === 'log');
  const timestamps = events.map((e) => normalizeTimestamp(e.timestamp)).filter((t) => !isNaN(t));

  return {
    text,
    scenarioId: scenario.id,
    metadata: {
      eventCount: events.length,
      spanCount: spans.length,
      logCount: logs.length,
      timeRange:
        timestamps.length > 0
          ? {
              start: Math.min(...timestamps),
              end: Math.max(...timestamps),
            }
          : undefined,
    },
  };
}

/**
 * Render a scenario template
 *
 * @param context - Workflow context
 * @returns Rendered text
 */
function renderScenario(context: WorkflowContext): string {
  const { scenario, template, events, aggregates, formatting } = context;
  const parts: string[] = [];

  // Create template evaluation context (merge aggregates and events)
  const evalContext: Record<string, unknown> = {
    ...aggregates,
    events,
    totalEvents: events.length,
  };

  // Introduction
  if (scenario.template.introduction) {
    parts.push(parseTemplate(scenario.template.introduction, evalContext as TemplateContext).toString());
    parts.push(''); // Blank line
  }

  // Main content - hierarchical span tree rendering
  if (context.spanTree) {
    parts.push(renderSpanTree(context.spanTree, scenario, evalContext, formatting));
  }

  // Summary
  if (scenario.template.summary) {
    if (parts.length > 0) {
      parts.push(''); // Blank line before summary
    }
    parts.push(parseTemplate(scenario.template.summary, evalContext as TemplateContext).toString());
  }

  return parts.join('\n');
}

/**
 * Render span tree (hierarchical view)
 *
 * @param tree - Span tree nodes
 * @param scenario - Scenario being rendered
 * @param context - Evaluation context
 * @param formatting - Formatting options
 * @returns Rendered tree text
 */
function renderSpanTree(
  tree: SpanTreeNode[],
  scenario: WorkflowScenario,
  context: Record<string, unknown>,
  formatting: FormattingOptions
): string {
  const parts: string[] = [];

  for (const node of tree) {
    const indent = (formatting.indentPerLevel || '  ').repeat(node.depth);

    // Build context with span attributes as nested objects for Handlebars
    const eventContext = { ...context };

    // Convert flat dot-notation keys to nested objects
    if (node.span.attributes) {
      for (const [key, value] of Object.entries(node.span.attributes)) {
        if (key.includes('.')) {
          // Nested key: convert "skill.name" -> { skill: { name: value } }
          const parts = key.split('.');
          let current: Record<string, unknown> = eventContext;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
              current[parts[i]] = {};
            }
            current = current[parts[i]] as Record<string, unknown>;
          }
          current[parts[parts.length - 1]] = value;
        } else {
          // Simple key
          eventContext[key] = value;
        }
      }
    }

    eventContext.span = node.span;

    // Build @span data from span attributes for template access
    const spanData = buildSpanData(node.span.spanAttributes);

    // Render span
    if (scenario.template.span) {
      const spanText = parseTemplate(scenario.template.span, eventContext as TemplateContext, spanData).toString();
      parts.push(indent + spanText);
    } else if (scenario.template.events?.[node.span.name]) {
      const eventTemplateEntry = scenario.template.events[node.span.name];
      const eventTemplateStr = getEventTemplateString(eventTemplateEntry);
      const eventText = parseTemplate(eventTemplateStr, eventContext as TemplateContext, spanData).toString();
      parts.push(indent + eventText);
    } else {
      // Default span rendering
      parts.push(indent + `→ ${node.span.name}`);
    }

    // Render associated logs
    if (node.logs && node.logs.length > 0) {
      for (const log of node.logs) {
        const logContext = { ...context, log };
        // Use log's spanAttributes if available, otherwise inherit from parent span
        const logSpanData = buildSpanData(log.spanAttributes) || spanData;
        const logText = renderLog(log, scenario, logContext, formatting, logSpanData);
        if (logText) {
          parts.push(indent + (formatting.indentPerLevel || '  ') + logText);
        }
      }
    }

    // Render children
    if (node.children.length > 0 && scenario.template.children !== 'ignore') {
      parts.push(renderSpanTree(node.children, scenario, context, formatting));
    }
  }

  return parts.join('\n');
}

/**
 * Render a log event
 *
 * @param log - Log event
 * @param scenario - Scenario being rendered
 * @param context - Evaluation context
 * @param formatting - Formatting options
 * @param spanData - Optional span data for @span template access
 * @returns Rendered log text
 */
function renderLog(
  log: OtelEvent,
  scenario: WorkflowScenario,
  context: Record<string, unknown>,
  _formatting: FormattingOptions,
  spanData?: TemplateData
): string | undefined {
  // Check for severity-specific template
  if (scenario.template.logs) {
    const severity = getSeverityLevel(log.severityNumber);
    const logTemplate = scenario.template.logs[severity] || scenario.template.logs.default;
    if (logTemplate) {
      return parseTemplate(logTemplate, context as TemplateContext, spanData).toString();
    }
  }

  // Check for event-specific template
  const logEventKey = `log.${log.severityText?.toLowerCase()}`;
  if (scenario.template.events?.[logEventKey]) {
    const logEventTemplate = getEventTemplateString(scenario.template.events[logEventKey]);
    return parseTemplate(logEventTemplate, context as TemplateContext, spanData).toString();
  }

  // Default log rendering
  return `[${log.severityText || 'LOG'}] ${log.body}`;
}

/**
 * Get severity level name from severity number
 *
 * @param severityNumber - OTEL severity number (1-24)
 * @returns Severity level name
 */
function getSeverityLevel(severityNumber?: number): keyof NonNullable<WorkflowScenario['template']['logs']> {
  if (!severityNumber) return 'info';
  if (severityNumber >= 21) return 'fatal';
  if (severityNumber >= 17) return 'error';
  if (severityNumber >= 13) return 'warn';
  if (severityNumber >= 9) return 'info';
  if (severityNumber >= 5) return 'debug';
  return 'trace';
}

/**
 * Build span tree from events
 *
 * @param events - All events
 * @param includeLogsPerSpan - Whether to attach logs to spans
 * @returns Span tree
 */
function buildSpanTree(events: OtelEvent[], includeLogsPerSpan = false): SpanTreeNode[] {
  const spans = events.filter((e) => e.type === 'span');
  const logs = includeLogsPerSpan ? events.filter((e) => e.type === 'log') : [];

  // Build map of spans by ID
  const spanMap = new Map<string, SpanTreeNode>();
  for (const span of spans) {
    if (span.spanId) {
      spanMap.set(span.spanId, {
        span,
        children: [],
        logs: [],
        depth: 0,
      });
    }
  }

  // Attach logs to spans
  if (includeLogsPerSpan) {
    for (const log of logs) {
      if (log.spanId && spanMap.has(log.spanId)) {
        spanMap.get(log.spanId)!.logs!.push(log);
      }
    }
  }

  // Build tree structure
  const roots: SpanTreeNode[] = [];
  for (const node of spanMap.values()) {
    if (node.span.parentSpanId && spanMap.has(node.span.parentSpanId)) {
      const parent = spanMap.get(node.span.parentSpanId)!;
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Normalize timestamp to milliseconds
 *
 * @param timestamp - Timestamp (number or ISO string)
 * @returns Milliseconds since epoch
 */
function normalizeTimestamp(timestamp: string | number): number {
  if (typeof timestamp === 'number') {
    // Assume milliseconds if < 10^12, otherwise nanoseconds
    return timestamp < 1e12 ? timestamp : timestamp / 1e6;
  }
  return new Date(timestamp).getTime();
}

/**
 * Format timestamp
 *
 * @param timestamp - Timestamp to format
 * @param format - Format string (simplified, only supports HH:mm:ss.SSS)
 * @returns Formatted timestamp
 */
function formatTimestamp(timestamp: string | number, format: string): string {
  const ms = normalizeTimestamp(timestamp);
  const date = new Date(ms);

  if (format === 'HH:mm:ss.SSS') {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  // Fallback to ISO string
  return date.toISOString();
}
