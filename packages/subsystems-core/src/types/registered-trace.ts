/**
 * Registry-aware trace types
 *
 * These types integrate trace data with scope-based registry lookups
 * to provide complete matching, validation, and routing information.
 *
 * Design: Multi-scope aware with three-category matching results
 * - Scenario Matches: Spans where both workflow and scenario matched
 * - Storyboard Matches: Spans where workflow matched but no scenario (orphaned)
 * - Unmatched Spans: Spans that didn't match any workflow
 *
 * See: docs/LIBRARY_TELEMETRY_AND_MATCHING.md for full design
 */

import type { OtelExportTraceServiceRequest } from './otel';
import type { VersionSnapshot } from './version-registry';

/**
 * Resource information from OTLP trace
 */
export interface TraceResource {
  /** Service identifier for routing (e.g., "http://localhost:3000" or "web-ade") */
  serviceIdentifier: string;

  /** Service name from resource attributes */
  serviceName: string;

  /** Resource-level attributes */
  attributes?: Record<string, unknown>;

  /** Scopes within this resource */
  scopes: Array<{
    /** Instrumentation scope */
    scope: {
      /** Scope name (e.g., "web-ade-instrumentation", "pkg:npm/@acme/auth-library") */
      name: string;

      /** Scope version (e.g., "1.0.0") */
      version: string;

      /** Scope attributes */
      attributes?: Record<string, unknown>;

      /** OTLP schema URL */
      schemaUrl?: string;
    };

    /** Span IDs that belong to this scope */
    spanIds: string[];
  }>;
}

/**
 * Matched span information
 */
export interface MatchedSpan {
  /** Span ID */
  spanId: string;

  /** Parent span ID (for hierarchy) */
  parentSpanId?: string;

  /** Span name */
  spanName: string;

  /** Matched canvas node ID */
  nodeId: string;

  /** Start timestamp (milliseconds) */
  timestamp: number;

  /** Duration (milliseconds) */
  duration: number;

  /** Events that were matched from this span */
  events: string[];

  /** Span attributes */
  attributes?: Record<string, unknown>;

  /** Match confidence */
  matchConfidence?: 'exact' | 'pattern' | 'wildcard';
}

/**
 * Category 1: Scenario Match
 * Spans where both workflow and scenario matched
 */
export interface ScenarioMatch {
  /** Storyboard ID that matched */
  storyboardId: string;

  /** Storyboard name (optional, for display) */
  storyboardName?: string;

  /** Workflow ID that matched */
  workflowId: string;

  /** Workflow name (optional, for display) */
  workflowName?: string;

  /** Scenario ID that matched */
  scenarioId: string;

  /** Scope name that this match came from */
  scopeName: string;

  /** Scope version that this match came from */
  scopeVersion?: string;

  /** Spans that matched this scenario */
  matchedSpans: MatchedSpan[];

  /** Scenario coverage percentage (matched events / total required events) */
  coveragePercent?: number;

  /** Was this a full match or partial match? */
  matchType?: 'full' | 'partial';
}

/**
 * Orphaned span information
 */
export interface OrphanedSpan {
  /** Span ID */
  spanId: string;

  /** Parent span ID (for hierarchy) */
  parentSpanId?: string;

  /** Span name */
  spanName: string;

  /** Canvas node ID that the span matched */
  nodeId: string;

  /** Start timestamp (milliseconds) */
  timestamp: number;

  /** Duration (milliseconds) */
  duration: number;

  /** Why did this span not match any scenario? */
  reason: string;

  /** Events that were observed in this span */
  observedEvents: string[];

  /** Events that were expected for scenarios */
  expectedEvents?: string[];

  /** Span attributes */
  attributes?: Record<string, unknown>;
}

/**
 * Category 2: Storyboard Match (Workflow-Orphaned)
 * Spans where workflow matched but events didn't match any scenario
 */
export interface StoryboardMatch {
  /** Storyboard ID that matched */
  storyboardId: string;

  /** Storyboard name (optional, for display) */
  storyboardName?: string;

  /** Workflow ID that matched */
  workflowId: string;

  /** Workflow name (optional, for display) */
  workflowName?: string;

  /** Scope name that this match came from */
  scopeName: string;

  /** Scope version that this match came from */
  scopeVersion?: string;

  /** Spans that matched workflow but no scenario */
  orphanedSpans: OrphanedSpan[];
}

/**
 * Unmatched span information
 */
export interface UnmatchedSpan {
  /** Span ID */
  spanId: string;

  /** Parent span ID (for hierarchy) */
  parentSpanId?: string;

  /** Span name */
  spanName: string;

  /** Scope name this span came from */
  scopeName: string;

  /** Scope version this span came from */
  scopeVersion?: string;

  /** Start timestamp (milliseconds) */
  timestamp: number;

  /** Duration (milliseconds) */
  duration: number;

  /** Why didn't this span match any workflow? */
  reason: string;

  /** Span attributes */
  attributes?: Record<string, unknown>;
}

/**
 * Category 3: Unmatched Spans
 * Spans that didn't match any workflow
 */
export interface UnmatchedSpans {
  /** Spans that didn't match any workflow */
  spans: UnmatchedSpan[];
}

/**
 * Validation issue found during matching
 */
export interface ValidationIssue {
  /** Issue severity */
  level: 'error' | 'warning' | 'info';

  /** Issue category */
  category: 'registry' | 'version' | 'matching' | 'data' | 'scope';

  /** Human-readable message */
  message: string;

  /** Affected span ID (if span-specific) */
  spanId?: string;

  /** Affected scope name (if scope-specific) */
  scopeName?: string;

  /** Suggested fix */
  suggestion?: string;
}

/**
 * Registry-aware trace with scope-based matching
 *
 * This is the primary output of the trace matching system.
 * It contains:
 * - Multi-resource, multi-scope trace information
 * - Three categories of matching results
 * - Validation issues
 * - Original OTLP data for details
 */
export interface RegisteredTrace {
  // ============================================================================
  // Core Trace Identity
  // ============================================================================

  /** Unique trace ID */
  traceId: string;

  /** Trace name (typically root span name) */
  name: string;

  /** Start timestamp (milliseconds) */
  startTime: number;

  /** End timestamp (milliseconds) */
  endTime: number;

  /** Duration (milliseconds) */
  duration: number;

  /** Total number of spans in this trace */
  spanCount: number;

  /** Has any span with error status */
  hasErrors: boolean;

  // ============================================================================
  // Multi-Resource, Multi-Scope Structure
  // ============================================================================

  /**
   * Resources in this trace
   * A trace can contain multiple resources (e.g., multiple services)
   * Each resource can have multiple scopes (e.g., service + libraries)
   */
  resources: TraceResource[];

  // ============================================================================
  // Three-Category Matching Results
  // ============================================================================

  /**
   * Category 1: Scenario Matches
   * Spans where both workflow and scenario matched (✅)
   */
  scenarioMatches: ScenarioMatch[];

  /**
   * Category 2: Storyboard Matches (Workflow-Orphaned)
   * Spans where workflow matched but events didn't match any scenario (⚠️)
   */
  storyboardMatches: StoryboardMatch[];

  /**
   * Category 3: Unmatched Spans
   * Spans that didn't match any workflow (❌)
   */
  unmatchedSpans: UnmatchedSpans;

  // ============================================================================
  // Validation & Diagnostics
  // ============================================================================

  /** Validation issues found during matching */
  validationIssues?: ValidationIssue[];

  // ============================================================================
  // Raw Data Reference
  // ============================================================================

  /** Reference to full OTLP data (if needed for details view) */
  otlpData?: OtelExportTraceServiceRequest;
}

/**
 * Result of a scope lookup operation
 *
 * Provides detailed information about why a lookup succeeded or failed,
 * enabling better error messages and diagnostics.
 */
export type ScopeLookupResult =
  | { found: true; snapshot: VersionSnapshot }
  | { found: false; reason: 'scope_not_owned'; scopeName: string }
  | { found: false; reason: 'no_storyboards'; scopeName: string };

/**
 * Interface for storyboard registry
 *
 * This is the main registry interface that supports scope-based lookups.
 * It can route to either local development registry (file-based, hot-reload)
 * or remote registry (API-based, cached).
 */
export interface StoryboardRegistryInterface {
  /**
   * Look up schematics by scope name and version
   *
   * This is the primary lookup method for the new scope-based matching.
   *
   * For published libraries (PURL):
   *   scopeName: "pkg:npm/@acme/auth-library"
   *   scopeVersion: "2.1.0"
   *
   * For services:
   *   scopeName: "checkout-service"
   *   scopeVersion: "v1.2.3"
   *   resource.attributes must contain "customer.id"
   *
   * Returns a ScopeLookupResult indicating success or failure with reason.
   */
  lookupByScope(
    scope: { name: string; version: string },
    resource: { attributes?: Record<string, unknown> }
  ): Promise<ScopeLookupResult>;

  /**
   * List all registered scopes
   *
   * Returns array of scope names and their available versions.
   */
  listScopes(): Promise<
    Array<{
      name: string;
      versions: string[];
    }>
  >;

  /**
   * Check if registry supports hot-reloading (local development mode)
   */
  supportsHotReload(): boolean;
}

/**
 * Interface for trace registry matcher
 *
 * Converts OTLP traces to RegisteredTrace with full scope-based matching.
 */
export interface TraceRegistryMatcher {
  /**
   * Match a trace against the registry
   *
   * This is the main entry point for trace matching:
   * 1. Extract scopes from OTLP trace
   * 2. Lookup schematics for each scope from registry
   * 3. Match spans to workflows
   * 4. Match events to scenarios
   * 5. Categorize results into three buckets
   * 6. Return RegisteredTrace with all matching information
   */
  matchTrace(otlpData: OtelExportTraceServiceRequest): Promise<RegisteredTrace>;
}

/**
 * Resource information extracted from OTLP
 */
export interface Resource {
  /** Resource attributes */
  attributes: Record<string, unknown>;

  /** Dropped attributes count */
  droppedAttributesCount?: number;
}

/**
 * Scope information extracted from OTLP
 */
export interface Scope {
  /** Scope name */
  name: string;

  /** Scope version */
  version?: string;

  /** Scope attributes */
  attributes?: Record<string, unknown>;
}
