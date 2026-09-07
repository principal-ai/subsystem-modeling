/**
 * TraceOrchestrator - Coordinates the complete trace matching pipeline
 *
 * Pipeline:
 * 1. Parse OTLP trace → extract resources and scopes
 * 2. For each scope → lookup VersionSnapshot from registry
 * 3. Match spans against workflows/scenarios
 * 4. Categorize results into three categories
 */

import type { OtelExportTraceServiceRequest, OtelSpanData } from '../types/otel';
import type {
  RegisteredTrace,
  StoryboardRegistryInterface,
  TraceResource,
  ScenarioMatch,
  StoryboardMatch,
  UnmatchedSpans,
  UnmatchedSpan,
  ValidationIssue,
  MatchedSpan,
  OrphanedSpan,
  ScopeLookupResult,
} from '../types/registered-trace';
import type { DiscoveredStoryboardWithContent, DiscoveredWorkflowWithContent, DiscoveredCanvasWithContent } from '../discovery/types';
import type { ExtendedCanvas } from '../types/canvas';
import { OtlpTraceParser } from '../parsers/OtlpTraceParser';
import { SpanMatcher } from '../matchers/SpanMatcher';
import { selectScenario } from '../workflow/scenario-matcher';
import type { OtelEvent } from '../workflow/types';

/**
 * Span with associated scope information
 */
interface ScopeSpan {
  scopeName: string;
  scopeVersion: string;
  spanId: string;
  spanName: string;
  traceId: string;
  parentSpanId?: string;
  startTime: number;
  endTime: number;
  duration: number;
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes: Record<string, unknown>;
  }>;
  status: { code: number; message?: string };
}

/**
 * Scope with its VersionSnapshot (storyboards)
 */
interface ScopeWithStoryboards {
  scopeName: string;
  scopeVersion: string;
  lookupResult: ScopeLookupResult;
  spanIds: string[];
}

/**
 * Orchestrator configuration
 */
export interface TraceOrchestratorConfig {
  registry: StoryboardRegistryInterface;
  enableValidation?: boolean;
}

/**
 * Main orchestrator for trace matching
 */
export class TraceOrchestrator {
  private parser: OtlpTraceParser;

  constructor(private config: TraceOrchestratorConfig) {
    this.parser = new OtlpTraceParser();
  }

  /**
   * Process an OTLP trace through the complete matching pipeline
   */
  async processTrace(otlpData: OtelExportTraceServiceRequest): Promise<RegisteredTrace> {
    // Step 1: Parse trace to extract resources and basic info
    const resources = this.parser.extractResources(otlpData);
    const traceInfo = this.parser.extractTraceInfo(otlpData);

    // Step 2: For each scope, lookup storyboards from registry
    const scopeStoryboards = await this.lookupStoryboardsForScopes(resources);

    // Step 3: Extract all spans with scope information
    const allSpans = this.extractAllSpans(otlpData, resources);

    // Step 4: Match spans against storyboards
    const { scenarioMatches, storyboardMatches, unmatchedSpans } = await this.matchSpans(
      allSpans,
      scopeStoryboards
    );

    // Step 5: Validate if enabled
    const validationIssues = this.config.enableValidation
      ? this.validateMatches(scenarioMatches, storyboardMatches)
      : undefined;

    // Step 6: Build final RegisteredTrace
    const registeredTrace: RegisteredTrace = {
      traceId: traceInfo.traceId,
      name: traceInfo.name,
      startTime: traceInfo.startTime,
      endTime: traceInfo.endTime,
      duration: traceInfo.duration,
      spanCount: traceInfo.spanCount,
      hasErrors: traceInfo.hasErrors,
      resources,
      scenarioMatches,
      storyboardMatches,
      unmatchedSpans,
      validationIssues,
      otlpData, // Include original OTLP data
    };

    return registeredTrace;
  }

  /**
   * Lookup storyboards from registry for each scope
   */
  private async lookupStoryboardsForScopes(
    resources: TraceResource[]
  ): Promise<ScopeWithStoryboards[]> {
    const results: ScopeWithStoryboards[] = [];

    for (const resource of resources) {
      for (const scopeInfo of resource.scopes) {
        const lookupResult = await this.config.registry.lookupByScope(
          {
            name: scopeInfo.scope.name,
            version: scopeInfo.scope.version,
          },
          {
            attributes: resource.attributes,
          }
        );

        results.push({
          scopeName: scopeInfo.scope.name,
          scopeVersion: scopeInfo.scope.version,
          lookupResult,
          spanIds: scopeInfo.spanIds,
        });
      }
    }

    return results;
  }

  /**
   * Extract all spans with their scope information
   */
  private extractAllSpans(
    otlpData: OtelExportTraceServiceRequest,
    resources: TraceResource[]
  ): ScopeSpan[] {
    const spans: ScopeSpan[] = [];
    const seenSpanIds = new Set<string>();

    for (const resource of resources) {
      for (const scopeInfo of resource.scopes) {
        const scopeSpans = this.parser.getSpansForScope(otlpData, scopeInfo.scope.name);

        for (const span of scopeSpans) {
          // Deduplicate spans by spanId - getSpansForScope may return same spans
          // when called multiple times for the same scope across different resources
          if (seenSpanIds.has(span.spanId)) {
            continue;
          }
          seenSpanIds.add(span.spanId);

          spans.push({
            scopeName: scopeInfo.scope.name,
            scopeVersion: scopeInfo.scope.version,
            spanId: span.spanId,
            spanName: span.spanName,
            traceId: span.traceId,
            parentSpanId: span.parentSpanId,
            startTime: span.startTime,
            endTime: span.endTime,
            duration: span.duration,
            attributes: span.attributes,
            events: span.events,
            status: span.status,
          });
        }
      }
    }

    return spans;
  }

  /**
   * Match spans against storyboards and categorize results
   *
   * Flow:
   * 1. For each span, find workflows where spanPattern matches span name (exact match)
   * 2. For matched workflows, run scenario matching against span events
   * 3. Categorize into: scenario matches, storyboard matches (orphaned), unmatched
   */
  private async matchSpans(
    spans: ScopeSpan[],
    scopeStoryboards: ScopeWithStoryboards[]
  ): Promise<{
    scenarioMatches: ScenarioMatch[];
    storyboardMatches: StoryboardMatch[];
    unmatchedSpans: UnmatchedSpans;
  }> {
    const scenarioMatches: ScenarioMatch[] = [];
    const storyboardMatches: StoryboardMatch[] = [];
    const unmatchedSpansList: UnmatchedSpan[] = [];

    const matchedSpanIds = new Set<string>();

    // For each scope with storyboards
    for (const scopeWithStoryboards of scopeStoryboards) {
      if (!scopeWithStoryboards.lookupResult.found) {
        // Lookup failed → all spans are unmatched with specific reason
        const scopeSpans = spans.filter((s) => s.scopeName === scopeWithStoryboards.scopeName);
        const reason = scopeWithStoryboards.lookupResult.reason === 'scope_not_owned'
          ? `Scope "${scopeWithStoryboards.scopeName}" is not registered in any owned-scopes. Add it to library.yaml resources.owned-scopes`
          : `Scope "${scopeWithStoryboards.scopeName}" is registered but has no storyboards defined in .principal-views/`;

        for (const span of scopeSpans) {
          unmatchedSpansList.push({
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
            spanName: span.spanName,
            scopeName: span.scopeName,
            scopeVersion: span.scopeVersion,
            timestamp: span.startTime,
            duration: span.duration,
            reason,
            attributes: span.attributes,
          });
          // Mark as processed so we don't add it again in the final loop
          matchedSpanIds.add(span.spanId);
        }
        continue;
      }

      // Get spans for this scope
      const scopeSpans = spans.filter((s) => s.scopeName === scopeWithStoryboards.scopeName);

      // Match against each storyboard's workflows
      for (const storyboard of scopeWithStoryboards.lookupResult.snapshot.storyboards) {
        // Validate that content is loaded
        const sbWithContent = storyboard as DiscoveredStoryboardWithContent;
        if (!this.isStoryboardWithContent(sbWithContent)) {
          console.error('[TraceOrchestrator] Storyboard content not loaded:', storyboard.id);
          continue;
        }

        // Get canvas for node highlighting (optional)
        const canvas = sbWithContent.canvas as DiscoveredCanvasWithContent;
        const spanMatcher = canvas?.content
          ? new SpanMatcher(canvas.content as ExtendedCanvas)
          : null;

        // Match each span against workflows by spanPattern (exact match)
        for (const span of scopeSpans) {
          // Skip if already matched by another storyboard
          if (matchedSpanIds.has(span.spanId)) continue;

          // Find workflow where spanPattern matches span name
          const workflowMatch = await this.matchSpanToWorkflow(
            span,
            sbWithContent,
            scopeWithStoryboards.scopeName,
            spanMatcher
          );

          if (workflowMatch) {
            matchedSpanIds.add(span.spanId);

            if (workflowMatch.type === 'scenario') {
              scenarioMatches.push(workflowMatch.match as ScenarioMatch);
            } else {
              storyboardMatches.push(workflowMatch.match as StoryboardMatch);
            }
          }
        }
      }
    }

    // Collect unmatched spans (spans that didn't match any workflow's spanPattern)
    for (const span of spans) {
      if (!matchedSpanIds.has(span.spanId)) {
        const scopeData = scopeStoryboards.find((s) => s.scopeName === span.scopeName);
        let reason: string;

        if (!scopeData || !scopeData.lookupResult.found) {
          // This shouldn't happen as we already processed these in the loop above,
          // but handle it defensively
          if (scopeData && !scopeData.lookupResult.found) {
            reason = scopeData.lookupResult.reason === 'scope_not_owned'
              ? `Scope "${span.scopeName}" is not registered in any owned-scopes`
              : `Scope "${span.scopeName}" has no storyboards`;
          } else {
            reason = `Scope "${span.scopeName}" not found in trace resources`;
          }
        } else {
          reason = `No workflow spanPattern matched span "${span.spanName}"`;
        }

        unmatchedSpansList.push({
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
          spanName: span.spanName,
          scopeName: span.scopeName,
          scopeVersion: span.scopeVersion,
          timestamp: span.startTime,
          duration: span.duration,
          reason,
          attributes: span.attributes,
        });
      }
    }

    const unmatchedSpans: UnmatchedSpans = {
      spans: unmatchedSpansList,
    };

    return { scenarioMatches, storyboardMatches, unmatchedSpans };
  }

  /**
   * Match a span against a storyboard's workflows by spanPattern
   *
   * Returns the first workflow where spanPattern === span.spanName,
   * then runs scenario matching on that workflow.
   */
  private async matchSpanToWorkflow(
    span: ScopeSpan,
    storyboard: DiscoveredStoryboardWithContent,
    scopeName: string,
    spanMatcher: SpanMatcher | null
  ): Promise<
    | { type: 'scenario'; match: ScenarioMatch }
    | { type: 'storyboard'; match: StoryboardMatch }
    | null
  > {
    // Try each workflow in the storyboard
    for (const workflow of storyboard.workflows) {
      const wfWithContent = workflow as DiscoveredWorkflowWithContent;
      if (!this.isWorkflowWithContent(wfWithContent)) {
        console.error('[TraceOrchestrator] Workflow content not loaded:', workflow.id);
        continue;
      }

      // Check if span name matches workflow's spanPattern (exact match)
      const spanPattern = wfWithContent.content.spanPattern;
      if (!spanPattern || span.spanName !== spanPattern) {
        continue; // spanPattern doesn't match, try next workflow
      }

      // spanPattern matched! Now run scenario matching

      // Convert span events to OtelEvent format for scenario matcher
      // Include span attributes so templates can access them via @span namespace
      const otelEvents: OtelEvent[] = span.events.map((e) => ({
        name: e.name,
        timestamp: e.timestamp,
        attributes: e.attributes as Record<string, string | number | boolean>,
        spanAttributes: span.attributes as Record<string, string | number | boolean>,
      }));

      // Get matched canvas node IDs (for visualization)
      let matchedNodeIds: string[] = [];
      if (spanMatcher) {
        const otelSpan = this.convertToOtelSpan(span);
        const matchResult = spanMatcher.matchSpan(otelSpan, { attributes: [] });
        matchedNodeIds = matchResult.matchedNodeIds;
      }

      // Run scenario matching
      const scenarioMatchResult = selectScenario(wfWithContent.content, otelEvents);

      if (
        scenarioMatchResult.recommendedScenario &&
        scenarioMatchResult.recommendedScenario.matchPercentage > 0
      ) {
        // Category 1: Scenario Match
        const detail = scenarioMatchResult.recommendedScenario;

        const matchedSpans: MatchedSpan[] = matchedNodeIds.length > 0
          ? matchedNodeIds.map((nodeId) => ({
              spanId: span.spanId,
              parentSpanId: span.parentSpanId,
              spanName: span.spanName,
              nodeId,
              timestamp: span.startTime,
              duration: span.duration,
              events: detail.matchedEventNames,
              attributes: span.attributes,
              matchConfidence: 'exact' as const,
            }))
          : [{
              spanId: span.spanId,
              parentSpanId: span.parentSpanId,
              spanName: span.spanName,
              nodeId: 'workflow-root', // No canvas node matched, use placeholder
              timestamp: span.startTime,
              duration: span.duration,
              events: detail.matchedEventNames,
              attributes: span.attributes,
              matchConfidence: 'exact' as const,
            }];

        return {
          type: 'scenario',
          match: {
            storyboardId: storyboard.id,
            storyboardName: storyboard.name,
            workflowId: wfWithContent.id,
            workflowName: wfWithContent.name,
            scenarioId: detail.scenario.id,
            scopeName,
            scopeVersion: span.scopeVersion,
            matchedSpans,
            coveragePercent: detail.matchPercentage,
            matchType: detail.matchPercentage === 100 ? 'full' : 'partial',
          },
        };
      } else {
        // Category 2: Storyboard Match (workflow matched, but scenario didn't)
        const orphanedSpans: OrphanedSpan[] = [{
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
          spanName: span.spanName,
          nodeId: matchedNodeIds[0] || 'workflow-root',
          timestamp: span.startTime,
          duration: span.duration,
          reason: 'Workflow spanPattern matched but no scenario matched the observed events',
          observedEvents: span.events.map((e) => e.name),
          expectedEvents: wfWithContent.content.scenarios.flatMap(
            (s: { template: { events?: Record<string, unknown> } }) =>
              Object.keys(s.template.events || {})
          ),
          attributes: span.attributes,
        }];

        return {
          type: 'storyboard',
          match: {
            storyboardId: storyboard.id,
            storyboardName: storyboard.name,
            workflowId: wfWithContent.id,
            workflowName: wfWithContent.name,
            scopeName,
            scopeVersion: span.scopeVersion,
            orphanedSpans,
          },
        };
      }
    }

    return null; // No workflow's spanPattern matched this span
  }

  /**
   * Type guard to check if storyboard has content loaded
   */
  private isStoryboardWithContent(
    storyboard: DiscoveredStoryboardWithContent
  ): storyboard is DiscoveredStoryboardWithContent {
    const canvas = storyboard.canvas as DiscoveredCanvasWithContent | undefined;
    return canvas?.content !== undefined;
  }

  /**
   * Convert ScopeSpan to OtelSpanData format
   */
  private convertToOtelSpan(span: ScopeSpan): OtelSpanData {
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      name: span.spanName,
      parentSpanId: span.parentSpanId,
      kind: 1, // SPAN_KIND_INTERNAL (default - would be extracted from original OTLP)
      startTimeUnixNano: String(span.startTime * 1000000), // Convert ms back to nanos
      endTimeUnixNano: String(span.endTime * 1000000),
      attributes: Object.entries(span.attributes || {}).map(([key, value]) => ({
        key,
        value: { stringValue: String(value) },
      })),
      events: span.events.map((e) => ({
        timeUnixNano: String(e.timestamp * 1000000),
        name: e.name,
        attributes: Object.entries(e.attributes || {}).map(([key, value]) => ({
          key,
          value: { stringValue: String(value) },
        })),
      })),
      status: span.status,
    };
  }

  /**
   * Type guard to check if workflow has content loaded
   */
  private isWorkflowWithContent(
    workflow: DiscoveredWorkflowWithContent
  ): workflow is DiscoveredWorkflowWithContent {
    return workflow.content !== undefined;
  }

  /**
   * Validate matches for common issues
   */
  private validateMatches(
    scenarioMatches: ScenarioMatch[],
    storyboardMatches: StoryboardMatch[]
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check for duplicate scenario matches (same workflow + scenario matched twice)
    const scenarioKeys = new Set<string>();
    for (const match of scenarioMatches) {
      // Include workflowId in key - different workflows can have same scenarioId (e.g., "success")
      const key = `${match.storyboardId}:${match.workflowId}:${match.scenarioId}:${match.scopeName}`;
      if (scenarioKeys.has(key)) {
        issues.push({
          level: 'warning',
          category: 'matching',
          message: `Duplicate scenario match detected for scope ${match.scopeName}`,
          spanId: match.matchedSpans[0]?.spanId,
          scopeName: match.scopeName,
        });
      }
      scenarioKeys.add(key);
    }

    // Check for orphaned spans with no clear reason
    for (const match of storyboardMatches) {
      for (const orphan of match.orphanedSpans) {
        if (!orphan.reason || orphan.reason.trim() === '') {
          issues.push({
            level: 'warning',
            category: 'matching',
            message: 'Orphaned span has no reason',
            spanId: orphan.spanId,
            scopeName: match.scopeName,
          });
        }
      }
    }

    return issues;
  }
}
