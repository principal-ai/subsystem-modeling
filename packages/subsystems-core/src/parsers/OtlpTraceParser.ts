/**
 * OTLP Trace Parser
 *
 * Extracts structured data from OTLP traces for scope-based matching.
 *
 * Responsibilities:
 * - Extract resources (service info, attributes)
 * - Extract scopes (instrumentation libraries)
 * - Map spans to their scopes
 * - Extract span events
 * - Convert OTLP timestamps and IDs to usable formats
 */

import type {
  OtelExportTraceServiceRequest,
  OtelResourceSpansData,
  OtelScopeSpans,
  OtelSpanData,
  OtelSpanEvent,
  OtelKeyValue,
  OtelAnyValue,
} from '../types/otel';
import type { TraceResource } from '../types/registered-trace';

/**
 * Extracted span information
 */
export interface ExtractedSpan {
  spanId: string;
  spanName: string;
  parentSpanId?: string;
  traceId: string;
  startTime: number; // milliseconds
  endTime: number; // milliseconds
  duration: number; // milliseconds
  attributes: Record<string, unknown>;
  events: ExtractedEvent[];
  status: {
    code: number;
    message?: string;
  };
  scopeName: string; // Which scope this span belongs to
}

/**
 * Extracted event information
 */
export interface ExtractedEvent {
  name: string;
  timestamp: number; // milliseconds
  attributes: Record<string, unknown>;
}

/**
 * Parser for OTLP traces
 */
export class OtlpTraceParser {
  /**
   * Extract all resources from OTLP trace
   *
   * Returns array of resources, each with their scopes and span mappings.
   */
  extractResources(otlpData: OtelExportTraceServiceRequest): TraceResource[] {
    const resources: TraceResource[] = [];

    for (const resourceSpan of otlpData.resourceSpans || []) {
      const resource = this.extractResource(resourceSpan);
      resources.push(resource);
    }

    return resources;
  }

  /**
   * Extract single resource
   */
  private extractResource(resourceSpan: OtelResourceSpansData): TraceResource {
    const attributes = this.convertAttributes(resourceSpan.resource.attributes);

    // Extract service identifier (for routing)
    const serviceIdentifier = this.extractServiceIdentifier(attributes);

    // Extract service name
    const serviceName = (attributes['service.name'] as string) || 'unknown';

    // Extract all scopes within this resource
    const scopes = this.extractScopes(resourceSpan.scopeSpans || []);

    return {
      serviceIdentifier,
      serviceName,
      attributes,
      scopes,
    };
  }

  /**
   * Extract service identifier for routing
   *
   * Priority: dev.server.url > service.name
   */
  private extractServiceIdentifier(attributes: Record<string, unknown>): string {
    return (
      (attributes['dev.server.url'] as string) ||
      (attributes['service.name'] as string) ||
      'unknown'
    );
  }

  /**
   * Extract all scopes from scopeSpans
   */
  private extractScopes(
    scopeSpans: OtelScopeSpans[]
  ): TraceResource['scopes'] {
    const scopes: TraceResource['scopes'] = [];

    for (const scopeSpan of scopeSpans) {
      const scope = scopeSpan.scope;
      if (!scope) continue;

      // Extract span IDs for this scope
      const spanIds = scopeSpan.spans?.map((span) => span.spanId) || [];

      scopes.push({
        scope: {
          name: scope.name,
          version: scope.version || '0.0.0',
          attributes: scope.attributes
            ? this.convertAttributes(scope.attributes)
            : undefined,
          schemaUrl: scopeSpan.schemaUrl,
        },
        spanIds,
      });
    }

    return scopes;
  }

  /**
   * Get all spans for a specific scope
   */
  getSpansForScope(
    otlpData: OtelExportTraceServiceRequest,
    scopeName: string
  ): ExtractedSpan[] {
    const spans: ExtractedSpan[] = [];

    for (const resourceSpan of otlpData.resourceSpans || []) {
      for (const scopeSpan of resourceSpan.scopeSpans || []) {
        if (scopeSpan.scope?.name === scopeName) {
          for (const span of scopeSpan.spans || []) {
            spans.push(this.extractSpan(span, scopeName));
          }
        }
      }
    }

    return spans;
  }

  /**
   * Extract span information
   */
  private extractSpan(span: OtelSpanData, scopeName: string): ExtractedSpan {
    const startTime = this.nanoToMillis(span.startTimeUnixNano);
    const endTime = this.nanoToMillis(span.endTimeUnixNano);

    return {
      spanId: span.spanId,
      spanName: span.name,
      parentSpanId: span.parentSpanId,
      traceId: span.traceId,
      startTime,
      endTime,
      duration: endTime - startTime,
      attributes: this.convertAttributes(span.attributes),
      events: this.extractEvents(span.events || []),
      status: {
        code: span.status.code,
        message: span.status.message,
      },
      scopeName,
    };
  }

  /**
   * Extract events from span
   */
  extractEvents(events: OtelSpanEvent[]): ExtractedEvent[] {
    return events.map((event) => ({
      name: event.name,
      timestamp: this.nanoToMillis(event.timeUnixNano),
      attributes: this.convertAttributes(event.attributes || []),
    }));
  }

  /**
   * Extract basic trace information
   */
  extractTraceInfo(otlpData: OtelExportTraceServiceRequest): {
    traceId: string;
    name: string;
    startTime: number;
    endTime: number;
    duration: number;
    spanCount: number;
    hasErrors: boolean;
  } {
    const traceId = this.extractTraceId(otlpData);
    const name = this.extractTraceName(otlpData);
    const { startTime, endTime } = this.extractTimeRange(otlpData);
    const spanCount = this.countSpans(otlpData);
    const hasErrors = this.detectErrors(otlpData);

    return {
      traceId,
      name,
      startTime,
      endTime,
      duration: endTime - startTime,
      spanCount,
      hasErrors,
    };
  }

  /**
   * Extract trace ID
   */
  private extractTraceId(otlpData: OtelExportTraceServiceRequest): string {
    const firstSpan = otlpData.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];
    return firstSpan?.traceId || 'unknown';
  }

  /**
   * Extract trace name (root span name)
   */
  private extractTraceName(otlpData: OtelExportTraceServiceRequest): string {
    // Find root span (no parentSpanId) or use first span
    const allSpans = this.getAllSpans(otlpData);
    const rootSpan = allSpans.find((s) => !s.parentSpanId) || allSpans[0];
    return rootSpan?.name || 'Unknown Trace';
  }

  /**
   * Extract time range across all spans
   */
  private extractTimeRange(otlpData: OtelExportTraceServiceRequest): {
    startTime: number;
    endTime: number;
  } {
    let minStart = Number.MAX_SAFE_INTEGER;
    let maxEnd = 0;

    for (const resourceSpan of otlpData.resourceSpans || []) {
      for (const scopeSpan of resourceSpan.scopeSpans || []) {
        for (const span of scopeSpan.spans || []) {
          const start = this.nanoToMillis(span.startTimeUnixNano);
          const end = this.nanoToMillis(span.endTimeUnixNano);
          if (start < minStart) minStart = start;
          if (end > maxEnd) maxEnd = end;
        }
      }
    }

    return {
      startTime: minStart === Number.MAX_SAFE_INTEGER ? Date.now() : minStart,
      endTime: maxEnd || Date.now(),
    };
  }

  /**
   * Count total spans
   */
  private countSpans(otlpData: OtelExportTraceServiceRequest): number {
    let count = 0;
    for (const resourceSpan of otlpData.resourceSpans || []) {
      for (const scopeSpan of resourceSpan.scopeSpans || []) {
        count += scopeSpan.spans?.length || 0;
      }
    }
    return count;
  }

  /**
   * Detect if any span has errors
   */
  private detectErrors(otlpData: OtelExportTraceServiceRequest): boolean {
    for (const resourceSpan of otlpData.resourceSpans || []) {
      for (const scopeSpan of resourceSpan.scopeSpans || []) {
        for (const span of scopeSpan.spans || []) {
          if (span.status.code === 2) {
            // ERROR
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Get all spans from trace (flattened)
   */
  private getAllSpans(otlpData: OtelExportTraceServiceRequest): OtelSpanData[] {
    const spans: OtelSpanData[] = [];
    for (const resourceSpan of otlpData.resourceSpans || []) {
      for (const scopeSpan of resourceSpan.scopeSpans || []) {
        spans.push(...(scopeSpan.spans || []));
      }
    }
    return spans;
  }

  /**
   * Convert OTLP attributes to simple key-value record
   */
  convertAttributes(attrs: OtelKeyValue[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const attr of attrs || []) {
      const value = this.extractAttributeValue(attr.value);
      if (value !== undefined) {
        result[attr.key] = value;
      }
    }

    return result;
  }

  /**
   * Extract value from OTLP AnyValue
   */
  private extractAttributeValue(value: OtelAnyValue): unknown {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.intValue !== undefined) return value.intValue;
    if (value.doubleValue !== undefined) return value.doubleValue;
    if (value.boolValue !== undefined) return value.boolValue;

    // Handle complex types
    if (value.arrayValue) {
      return value.arrayValue.values.map((v) => this.extractAttributeValue(v));
    }

    if (value.kvlistValue) {
      const obj: Record<string, unknown> = {};
      for (const kv of value.kvlistValue.values) {
        obj[kv.key] = this.extractAttributeValue(kv.value);
      }
      return obj;
    }

    if (value.bytesValue) {
      return value.bytesValue;
    }

    return undefined;
  }

  /**
   * Convert nanoseconds to milliseconds
   */
  private nanoToMillis(nanos: string | number): number {
    if (!nanos) return 0;
    const nanosNum = typeof nanos === 'string' ? parseInt(nanos, 10) : nanos;
    return Math.floor(nanosNum / 1_000_000);
  }

  /**
   * Check if trace is in local development mode
   */
  isLocalDevelopment(otlpData: OtelExportTraceServiceRequest): boolean {
    const resources = this.extractResources(otlpData);

    for (const resource of resources) {
      // Check for dev.mode flag
      if (resource.attributes?.['dev.mode'] === true) {
        return true;
      }

      // Check for dev workspace path
      if (resource.attributes?.['dev.workspace.path']) {
        return true;
      }

      // Check for dev version patterns in scopes
      for (const { scope } of resource.scopes) {
        if (
          scope.version?.includes('-dev') ||
          scope.version?.includes('-local') ||
          scope.version === '0.0.0-dev'
        ) {
          return true;
        }
      }
    }

    return false;
  }
}
