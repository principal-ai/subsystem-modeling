/**
 * OpenTelemetry Types for Log Association and Trace Matching
 *
 * This module provides:
 * 1. Re-exports of official OTLP types from @opentelemetry/otlp-transformer
 * 2. Helper functions for working with OTLP data structures
 * 3. Application-level types (TraceInfo, WorkflowMatchInfo)
 * 4. Simplified types for logs and basic telemetry (backward compatible)
 *
 * @see https://opentelemetry.io/docs/specs/otel/protocol/otlp/
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/
 * @see https://opentelemetry.io/docs/specs/otel/resource/semantic_conventions/
 */

// =============================================================================
// OTLP Data Structures (JSON Format)
// =============================================================================

/**
 * OTLP attribute value
 *
 * Based on OTLP/JSON specification. Represents a single value which can be
 * a primitive type or a complex structure (array, key-value list).
 */
export interface OtelAnyValue {
  stringValue?: string;
  intValue?: number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values: OtelAnyValue[] };
  kvlistValue?: { values: OtelKeyValue[] };
  bytesValue?: Uint8Array;
}

/**
 * OTLP key-value pair (attribute)
 */
export interface OtelKeyValue {
  key: string;
  value: OtelAnyValue;
}

/**
 * OTLP resource
 *
 * Describes the entity producing telemetry (service, pod, host, etc.)
 */
export interface OtelResourceData {
  attributes: OtelKeyValue[];
  droppedAttributesCount?: number;
}

/**
 * OTLP span event
 */
export interface OtelSpanEvent {
  timeUnixNano: string;
  name: string;
  attributes: OtelKeyValue[];
  droppedAttributesCount?: number;
}

/**
 * OTLP span link
 */
export interface OtelLink {
  traceId: string | Uint8Array;
  spanId: string | Uint8Array;
  traceState?: string;
  attributes: OtelKeyValue[];
  droppedAttributesCount?: number;
}

/**
 * OTLP span status
 */
export interface OtelSpanStatus {
  code: number; // 0 = UNSET, 1 = OK, 2 = ERROR
  message?: string;
}

/**
 * OTLP span
 *
 * Represents a unit of work in a distributed trace.
 */
export interface OtelSpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number; // ESpanKind enum (0-5)
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtelKeyValue[];
  droppedAttributesCount?: number;
  events: OtelSpanEvent[];
  droppedEventsCount?: number;
  links?: OtelLink[];
  droppedLinksCount?: number;
  status: OtelSpanStatus;
}

/**
 * OTLP instrumentation scope
 */
export interface OtelInstrumentationScope {
  name: string;
  version?: string;
  attributes?: OtelKeyValue[];
  droppedAttributesCount?: number;
}

/**
 * OTLP scope spans
 */
export interface OtelScopeSpans {
  scope?: OtelInstrumentationScope;
  spans: OtelSpanData[];
  schemaUrl?: string;
}

/**
 * OTLP resource spans
 */
export interface OtelResourceSpansData {
  resource: OtelResourceData;
  scopeSpans: OtelScopeSpans[];
  schemaUrl?: string;
}

/**
 * OTLP export trace service request
 */
export interface OtelExportTraceServiceRequest {
  resourceSpans: OtelResourceSpansData[];
}

// =============================================================================
// Helper Functions for OTLP Data
// =============================================================================

/**
 * Extract string value from OTEL attribute value
 *
 * @param value - OTEL attribute value
 * @returns String value if present, undefined otherwise
 */
export function getAttributeStringValue(value: OtelAnyValue): string | undefined {
  return value.stringValue ?? undefined;
}

/**
 * Find attribute by key in attribute array
 *
 * @param attributes - Array of OTEL attributes
 * @param key - Attribute key to find
 * @returns Attribute if found, undefined otherwise
 */
export function findAttribute(
  attributes: OtelKeyValue[] | undefined,
  key: string
): OtelKeyValue | undefined {
  return attributes?.find((attr) => attr.key === key);
}

/**
 * Get attribute value by key
 *
 * Supports string, number, and boolean values. For complex types
 * (arrays, maps), returns undefined.
 *
 * @param attributes - Array of OTEL attributes
 * @param key - Attribute key to get
 * @returns Attribute value if found and is a primitive type
 *
 * @example
 * ```typescript
 * const attrs: OtelKeyValue[] = [
 *   { key: 'http.method', value: { stringValue: 'GET' } },
 *   { key: 'http.status_code', value: { intValue: 200 } }
 * ];
 *
 * getAttributeValue(attrs, 'http.method'); // 'GET'
 * getAttributeValue(attrs, 'http.status_code'); // 200
 * ```
 */
export function getAttributeValue(
  attributes: OtelKeyValue[] | undefined,
  key: string
): string | number | boolean | undefined {
  const attr = findAttribute(attributes, key);
  if (!attr) return undefined;

  return (
    attr.value.stringValue ??
    attr.value.intValue ??
    attr.value.doubleValue ??
    attr.value.boolValue ??
    undefined
  );
}

/**
 * Convert resource attributes to flat string map
 *
 * Only includes string-valued attributes. Useful for matching
 * and filtering operations.
 *
 * @param resource - OTEL resource
 * @returns Flat object with string key-value pairs
 *
 * @example
 * ```typescript
 * const resource: OtelResourceData = {
 *   attributes: [
 *     { key: 'service.name', value: { stringValue: 'checkout-api' } },
 *     { key: 'deployment.environment', value: { stringValue: 'production' } }
 *   ]
 * };
 *
 * flattenResourceAttributes(resource);
 * // { 'service.name': 'checkout-api', 'deployment.environment': 'production' }
 * ```
 */
export function flattenResourceAttributes(resource: OtelResourceData): Record<string, string> {
  const result: Record<string, string> = {};

  if (!resource.attributes) return result;

  for (const attr of resource.attributes) {
    const value = getAttributeStringValue(attr.value);
    if (value !== undefined) {
      result[attr.key] = value;
    }
  }

  return result;
}

/**
 * Parse OTEL nanosecond timestamp to milliseconds
 *
 * OTLP uses string representation for nanosecond timestamps in JSON format.
 * This converts them to JavaScript milliseconds (standard Date format).
 *
 * @param nanos - Nanosecond timestamp as string
 * @returns Milliseconds since Unix epoch
 *
 * @example
 * ```typescript
 * parseNanoTime('1737835200000000000'); // 1737835200000
 * ```
 */
export function parseNanoTime(nanos: string | number): number {
  const nanosNum = typeof nanos === 'string' ? parseInt(nanos, 10) : nanos;
  return nanosNum / 1_000_000;
}

/**
 * Calculate span duration in milliseconds
 *
 * @param span - OTEL span
 * @returns Duration in milliseconds
 */
export function getSpanDuration(span: OtelSpanData): number {
  const start = parseInt(span.startTimeUnixNano, 10);
  const end = parseInt(span.endTimeUnixNano, 10);
  return (end - start) / 1_000_000;
}

// =============================================================================
// Application-Level Types
// =============================================================================

/**
 * Workflow matching metadata extracted from trace resource attributes
 *
 * Traces can be correlated to storyboards, workflows, and scenarios
 * via resource attributes like pv.storyboard.id, pv.workflow.id, etc.
 */
export interface WorkflowMatchInfo {
  /** Storyboard ID */
  storyboardId: string;
  /** Storyboard name */
  storyboardName: string;
  /** Workflow ID (optional) */
  workflowId?: string;
  /** Workflow name (optional) */
  workflowName?: string;
  /** Scenario ID (optional) */
  scenarioId?: string;
  /** Scenario name (optional) */
  scenarioName?: string;
  /** Canvas node IDs that matched this trace */
  matchedNodeIds?: string[];
}

/**
 * Aggregated trace information
 *
 * Represents a complete trace with metadata extracted from all its spans.
 * This is a higher-level view than individual spans, useful for trace lists,
 * filtering, and visualization.
 *
 * @example
 * ```typescript
 * const trace: TraceInfo = {
 *   traceId: 'abc123',
 *   name: 'POST /api/checkout',
 *   startTime: 1737835200000,
 *   duration: 150,
 *   spanCount: 5,
 *   serviceNames: ['checkout-api', 'payment-service'],
 *   hasErrors: false,
 *   rootSpanId: 'span1'
 * };
 * ```
 */
export interface TraceInfo {
  /** Trace ID */
  traceId: string;
  /** Trace name (usually root span name) */
  name: string;
  /** Start timestamp in milliseconds */
  startTime: number;
  /** Duration in milliseconds */
  duration: number;
  /** Number of spans in trace */
  spanCount: number;
  /** Unique service names across all spans */
  serviceNames: string[];
  /** True if any span has error status */
  hasErrors: boolean;
  /** Root span ID (if identifiable) */
  rootSpanId?: string;
  /** Workflow matching metadata (if matched) */
  matchedWorkflow?: WorkflowMatchInfo;
}

// =============================================================================
// Simplified Types (Backward Compatible)
// =============================================================================

/**
 * @deprecated Use IAnyValue and helper functions instead
 */

/**
 * OpenTelemetry attribute value type per OTEL spec
 * @see https://opentelemetry.io/docs/specs/otel/common/attribute-naming/
 */
export type OtelAttributeValue = string | number | boolean | string[] | number[] | boolean[];

/**
 * OpenTelemetry attributes (key-value pairs)
 */
export type OtelAttributes = Record<string, OtelAttributeValue>;

/**
 * OTEL Resource - describes the entity producing telemetry
 *
 * Resources are immutable metadata about the source of telemetry.
 * Common attributes follow semantic conventions.
 *
 * @example
 * ```typescript
 * const resource: OtelResource = {
 *   'service.name': 'checkout-api',
 *   'service.namespace': 'checkout',
 *   'deployment.environment': 'production',
 *   'k8s.pod.name': 'checkout-api-7d8f9c6b5d-x2j4k'
 * };
 * ```
 */
export interface OtelResource {
  // Service identification (most common)
  'service.name'?: string;
  'service.namespace'?: string;
  'service.instance.id'?: string;
  'service.version'?: string;

  // Kubernetes
  'k8s.pod.name'?: string;
  'k8s.pod.uid'?: string;
  'k8s.deployment.name'?: string;
  'k8s.namespace.name'?: string;
  'k8s.node.name'?: string;
  'k8s.container.name'?: string;
  'k8s.replicaset.name'?: string;

  // Cloud
  'cloud.provider'?: string;
  'cloud.region'?: string;
  'cloud.availability_zone'?: string;
  'cloud.account.id'?: string;

  // Deployment
  'deployment.environment'?: string;

  // Host
  'host.name'?: string;
  'host.id'?: string;
  'host.type'?: string;

  // Process
  'process.pid'?: number;
  'process.executable.name'?: string;
  'process.runtime.name'?: string;
  'process.runtime.version'?: string;

  // Database (for DB spans/logs)
  'db.system'?: string;
  'db.name'?: string;
  'db.user'?: string;

  // Messaging (for queue spans/logs)
  'messaging.system'?: string;
  'messaging.destination.name'?: string;

  // Allow arbitrary attributes
  [key: string]: string | number | boolean | undefined;
}

/**
 * OTEL Severity levels
 *
 * Can be either text names or numeric values (1-24).
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
 */
export type OtelSeverityText = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
export type OtelSeverityNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24;
export type OtelSeverity = OtelSeverityText | OtelSeverityNumber;

/**
 * OTEL Log Record
 *
 * Represents a single log entry with resource context and optional trace correlation.
 *
 * @example
 * ```typescript
 * const log: OtelLog = {
 *   timestamp: Date.now(),
 *   severity: 'INFO',
 *   body: 'Payment processed successfully',
 *   resource: {
 *     'service.name': 'payment-service',
 *     'deployment.environment': 'production'
 *   },
 *   attributes: {
 *     'payment.id': 'pay_123',
 *     'payment.amount': 99.99
 *   },
 *   traceId: 'abc123',
 *   spanId: 'def456'
 * };
 * ```
 */
export interface OtelLog {
  /** Timestamp in milliseconds, nanoseconds, or ISO string */
  timestamp: number | string;

  /** Observed timestamp (when collector received it) */
  observedTimestamp?: number | string;

  /** Severity number (1-24) */
  severity?: OtelSeverity;

  /** Severity text (DEBUG, INFO, etc.) */
  severityText?: string;

  /** Log body - the actual message or structured content */
  body: string | Record<string, unknown>;

  /** Resource describing the source entity */
  resource: OtelResource;

  /** Log attributes (structured data specific to this log) */
  attributes?: OtelAttributes;

  /** Trace ID for correlation */
  traceId?: string;

  /** Span ID for correlation */
  spanId?: string;

  /** Trace flags */
  traceFlags?: number;

  /**
   * Source location (for path-based matching)
   * This extends OTEL with source file information for code coverage analysis.
   */
  source?: {
    file?: string;
    line?: number;
    function?: string;
  };
}

/**
 * OTEL Span Kind
 */
export type OtelSpanKind = 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';

/**
 * OTEL Span Status (simplified, for backward compatibility)
 *
 * @deprecated Use OtelSpanStatus from OTLP data structures instead
 */
export interface OtelSimplifiedSpanStatus {
  code: 'UNSET' | 'OK' | 'ERROR';
  message?: string;
}

/**
 * OTEL Span
 *
 * Represents a unit of work in a distributed trace.
 * Used for trace-based edge derivation between canvas nodes.
 *
 * @example
 * ```typescript
 * const span: OtelSpan = {
 *   traceId: 'abc123',
 *   spanId: 'span1',
 *   parentSpanId: 'span0',
 *   name: 'POST /api/checkout',
 *   kind: 'SERVER',
 *   startTime: Date.now(),
 *   resource: {
 *     'service.name': 'checkout-api'
 *   }
 * };
 * ```
 */
export interface OtelSpan {
  /** Trace ID this span belongs to */
  traceId: string;

  /** Unique span ID */
  spanId: string;

  /** Parent span ID (undefined for root spans) */
  parentSpanId?: string;

  /** Span name (usually operation name) */
  name: string;

  /** Span kind */
  kind: OtelSpanKind;

  /** Start time in milliseconds, nanoseconds, or ISO string */
  startTime: number | string;

  /** End time (undefined if span is still active) */
  endTime?: number | string;

  /** Resource describing the source entity */
  resource: OtelResource;

  /** Span attributes */
  attributes?: OtelAttributes;

  /** Span status */
  status?: OtelSimplifiedSpanStatus;

  /** Events (logs within the span) */
  events?: Array<{
    name: string;
    timestamp: number | string;
    attributes?: OtelAttributes;
  }>;
}

/**
 * Type guard: Check if severity indicates an error
 */
export function isErrorSeverity(severity: OtelSeverity | undefined): boolean {
  if (severity === undefined) return false;
  if (typeof severity === 'string') {
    return severity === 'ERROR' || severity === 'FATAL';
  }
  return severity >= 17; // ERROR starts at 17 in OTEL spec
}

/**
 * Type guard: Check if severity indicates a warning
 */
export function isWarnSeverity(severity: OtelSeverity | undefined): boolean {
  if (severity === undefined) return false;
  if (typeof severity === 'string') {
    return severity === 'WARN';
  }
  return severity >= 13 && severity <= 16; // WARN is 13-16 in OTEL spec
}
