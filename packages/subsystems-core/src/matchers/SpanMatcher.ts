/**
 * SpanMatcher
 *
 * Efficiently matches incoming OTEL spans to canvas nodes based on
 * declarative matching criteria defined in node metadata.
 *
 * Implements the OTEL Span Matching specification from:
 * .principal-views/OTEL-SPAN-MATCHING.md
 */

import type { ExtendedCanvas, PVOtelExtension } from '../types/canvas';
import { isOtelNode, isStandardCanvasNode } from '../types/canvas';
import type { OtelSpanData, OtelResourceData } from '../types/otel';
import {
  getAttributeValue,
  flattenResourceAttributes,
  parseNanoTime,
  getSpanDuration,
} from '../types/otel';

/**
 * Compiled matching rule for a single canvas node
 */
interface CompiledMatchRule {
  nodeId: string;
  resourceMatchers: ResourceMatcher[];
  spanMatchers: SpanMatcherFn;
}

/**
 * Resource attribute matcher function
 */
type ResourceMatcher = (resourceAttrs: Record<string, string>) => boolean;

/**
 * Span matcher function
 */
type SpanMatcherFn = (span: OtelSpanData) => boolean;

/**
 * Match result containing matched node IDs and metadata
 */
export interface SpanMatchResult {
  /** IDs of nodes that matched this span */
  matchedNodeIds: string[];
  /** Timestamp extracted from span (milliseconds since epoch) */
  timestamp: number;
  /** Span duration in milliseconds */
  duration: number;
}

/**
 * SpanMatcher
 *
 * Efficiently matches incoming OTEL spans to canvas nodes based on
 * declarative matching criteria defined in node metadata.
 *
 * @example
 * ```typescript
 * const canvas = loadCanvas('checkout-flow.otel.canvas.json');
 * const matcher = new SpanMatcher(canvas);
 *
 * // Later, when spans arrive:
 * const result = matcher.matchSpan(span, resource);
 * if (result.matchedNodeIds.length > 0) {
 *   console.log('Matched nodes:', result.matchedNodeIds);
 * }
 * ```
 */
export class SpanMatcher {
  private rules: CompiledMatchRule[] = [];

  /**
   * Create a new SpanMatcher for a canvas
   *
   * @param canvas Canvas with nodes containing OTEL matching criteria
   */
  constructor(canvas: ExtendedCanvas) {
    this.rules = this.compileRules(canvas);
  }

  /**
   * Pre-compile matching rules from canvas nodes
   *
   * This is done once at initialization for performance.
   */
  private compileRules(canvas: ExtendedCanvas): CompiledMatchRule[] {
    const rules: CompiledMatchRule[] = [];

    if (!canvas.nodes) return rules;

    for (const node of canvas.nodes) {
      // Get OTEL metadata from either OTEL nodes (top-level) or standard nodes (pv.otel)
      let otel: PVOtelExtension | undefined;

      if (isOtelNode(node) && node.otel) {
        otel = node.otel as PVOtelExtension;
      } else if (isStandardCanvasNode(node) && node.pv?.otel) {
        otel = node.pv.otel as PVOtelExtension;
      }

      if (!otel) continue;

      const rule: CompiledMatchRule = {
        nodeId: node.id,
        resourceMatchers: [],
        spanMatchers: () => true, // Default: match all spans (will be overridden if spanMatch is specified)
      };

      // Compile resource matchers
      if (otel.resourceMatch) {
        rule.resourceMatchers.push(
          this.compileResourceMatcher(otel.resourceMatch)
        );
      }

      // Compile span matchers
      if (otel.spanMatch) {
        const spanMatcherFns: SpanMatcherFn[] = [];

        // Span name matcher
        if (otel.spanMatch.name) {
          spanMatcherFns.push(
            this.compileSpanNameMatcher(otel.spanMatch.name)
          );
        }

        // Span kind matcher
        if (otel.spanMatch.kind) {
          spanMatcherFns.push(
            this.compileSpanKindMatcher(otel.spanMatch.kind)
          );
        }

        // Span attributes matcher
        if (otel.spanMatch.attributes) {
          spanMatcherFns.push(
            this.compileSpanAttributesMatcher(otel.spanMatch.attributes)
          );
        }

        // Span event matcher
        if (otel.spanMatch.event) {
          spanMatcherFns.push(
            this.compileSpanEventMatcher(otel.spanMatch.event)
          );
        }

        // Combine all span matchers with AND logic
        rule.spanMatchers = (span: OtelSpanData) => {
          return spanMatcherFns.every((matcher) => matcher(span));
        };
      }

      // Only add rule if it has at least one matcher
      if (rule.resourceMatchers.length > 0 || rule.spanMatchers.length > 0) {
        rules.push(rule);
      }
    }

    return rules;
  }

  /**
   * Compile resource attribute matcher
   */
  private compileResourceMatcher(
    resourceMatch: Record<string, string | string[]>
  ): ResourceMatcher {
    return (resourceAttrs: Record<string, string>) => {
      // All specified attributes must match (AND logic)
      return Object.entries(resourceMatch).every(([key, pattern]) => {
        const value = resourceAttrs[key];
        if (!value) return false;

        if (Array.isArray(pattern)) {
          // Match any of the patterns (OR within the array)
          return pattern.some((p) => this.matchPattern(value, p));
        }

        return this.matchPattern(value, pattern);
      });
    };
  }

  /**
   * Compile span name matcher
   */
  private compileSpanNameMatcher(
    namePattern: string | string[]
  ): SpanMatcherFn {
    const patterns = Array.isArray(namePattern) ? namePattern : [namePattern];

    return (span: OtelSpanData) => {
      return patterns.some((pattern) => this.matchPattern(span.name, pattern));
    };
  }

  /**
   * Compile span kind matcher
   */
  private compileSpanKindMatcher(
    kindPattern: string | string[]
  ): SpanMatcherFn {
    const kindStrings = Array.isArray(kindPattern) ? kindPattern : [kindPattern];

    // Convert string span kinds to numeric ESpanKind values
    const kinds = kindStrings.map((k) => this.spanKindToNumber(k));

    return (span: OtelSpanData) => {
      return kinds.includes(span.kind);
    };
  }

  /**
   * Convert string span kind to ESpanKind number
   */
  private spanKindToNumber(kind: string): number {
    const kindMap: Record<string, number> = {
      'SPAN_KIND_UNSPECIFIED': 0,
      'SPAN_KIND_INTERNAL': 1,
      'SPAN_KIND_SERVER': 2,
      'SPAN_KIND_CLIENT': 3,
      'SPAN_KIND_PRODUCER': 4,
      'SPAN_KIND_CONSUMER': 5,
    };
    return kindMap[kind] ?? 0;
  }

  /**
   * Compile span attributes matcher
   */
  private compileSpanAttributesMatcher(
    attributesMatch: Record<string, string | string[]>
  ): SpanMatcherFn {
    return (span: OtelSpanData) => {
      // All specified attributes must match (AND logic)
      return Object.entries(attributesMatch).every(([key, pattern]) => {
        const value = getAttributeValue(span.attributes, key);
        if (value === undefined) return false;

        const valueStr = String(value);

        if (Array.isArray(pattern)) {
          return pattern.some((p) => this.matchPattern(valueStr, p));
        }

        return this.matchPattern(valueStr, pattern);
      });
    };
  }

  /**
   * Compile span event matcher
   */
  private compileSpanEventMatcher(
    eventMatch: {
      name?: string | string[];
      attributes?: Record<string, string | string[]>;
    }
  ): SpanMatcherFn {
    return (span: OtelSpanData) => {
      if (!span.events || span.events.length === 0) return false;

      // At least one event must match
      return span.events.some((event) => {
        // Match event name if specified
        if (eventMatch.name) {
          const namePatterns = Array.isArray(eventMatch.name)
            ? eventMatch.name
            : [eventMatch.name];

          const nameMatches = namePatterns.some((pattern) =>
            this.matchPattern(event.name, pattern)
          );

          if (!nameMatches) return false;
        }

        // Match event attributes if specified
        if (eventMatch.attributes) {
          const attrsMatch = Object.entries(eventMatch.attributes).every(
            ([key, pattern]) => {
              const value = getAttributeValue(event.attributes, key);
              if (value === undefined) return false;

              const valueStr = String(value);

              if (Array.isArray(pattern)) {
                return pattern.some((p) => this.matchPattern(valueStr, p));
              }

              return this.matchPattern(valueStr, pattern);
            }
          );

          if (!attrsMatch) return false;
        }

        return true;
      });
    };
  }

  /**
   * Match a value against a pattern
   *
   * Supports:
   * - Wildcard: "*" matches anything
   * - Glob patterns: "GET /api/*" matches "GET /api/users"
   * - Exact match: "validateUser" matches only "validateUser"
   */
  private matchPattern(value: string, pattern: string): boolean {
    // Wildcard matches everything
    if (pattern === '*') return true;

    // Exact match (fast path)
    if (!pattern.includes('*')) {
      return value === pattern;
    }

    // Glob pattern matching
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*'); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }

  /**
   * Match a span against all canvas nodes
   *
   * @param span OTEL span to match
   * @param resource OTEL resource associated with the span
   * @returns Match result with matched node IDs and metadata
   */
  public matchSpan(span: OtelSpanData, resource: OtelResourceData): SpanMatchResult {
    const matchedNodeIds: string[] = [];
    const resourceAttrs = flattenResourceAttributes(resource);

    for (const rule of this.rules) {
      // Check if all resource matchers pass
      const resourceMatch = rule.resourceMatchers.every((matcher) =>
        matcher(resourceAttrs)
      );

      // Check if span matchers pass
      const spanMatch = rule.spanMatchers(span);

      // Node matches if both resource AND span criteria match
      if (resourceMatch && spanMatch) {
        matchedNodeIds.push(rule.nodeId);
      }
    }

    return {
      matchedNodeIds,
      timestamp: parseNanoTime(span.startTimeUnixNano),
      duration: getSpanDuration(span),
    };
  }

  /**
   * Get statistics about the compiled rules
   *
   * Useful for debugging and performance analysis.
   */
  public getStats(): {
    totalRules: number;
    rulesWithResourceMatch: number;
    rulesWithSpanMatch: number;
  } {
    return {
      totalRules: this.rules.length,
      rulesWithResourceMatch: this.rules.filter((r) => r.resourceMatchers.length > 0).length,
      rulesWithSpanMatch: this.rules.filter((r) => r.spanMatchers.length > 0).length,
    };
  }
}
