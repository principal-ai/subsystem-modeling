/**
 * Execution File Validator
 *
 * Validates execution files in OTLP (OpenTelemetry Protocol) JSON format.
 * Accepts standard OTLP format and converts it to internal ExecutionData structure.
 */

import type {
  IExportTraceServiceRequest,
  IResourceSpans,
  IScopeSpans,
  ISpan,
  IEvent,
} from '@opentelemetry/otlp-transformer/build/src/trace/internal-types';
import type {
  IAnyValue,
  IKeyValue,
  Fixed64,
} from '@opentelemetry/otlp-transformer/build/src/common/internal-types';

/**
 * OTLP data format (standard OpenTelemetry Protocol format)
 */
export type OtlpData = IExportTraceServiceRequest;

/**
 * Execution data structure (as expected by ExecutionLoader and UI components)
 */
export interface ExecutionData {
  metadata?: {
    status?: string;
    testName?: string;
    sessionId?: string;
    startTime?: number;
    endTime?: number;
    canvasName?: string;
    exportedAt?: string;
    source?: string;
    framework?: string;
    serviceName?: string;
    scopeName?: string;
    scopeVersion?: string;
  };
  spans: Array<{
    id: string;
    name: string;
    traceId?: string;
    parentSpanId?: string;
    startTime?: number;
    endTime?: number;
    duration?: number;
    status?: 'OK' | 'ERROR';
    attributes?: Record<string, unknown>;
    events: Array<{
      time: number;
      name: string;
      attributes: Record<string, unknown>;
    }>;
  }>;
}

/**
 * Validation error details
 */
export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

/**
 * Validation result
 */
export interface ExecutionValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Convert OTLP IAnyValue to simple JavaScript value
 */
function convertOtlpValue(value: IAnyValue): unknown {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.intValue !== undefined) return value.intValue;
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.arrayValue) {
    return value.arrayValue.values.map(convertOtlpValue);
  }
  if (value.kvlistValue) {
    const obj: Record<string, unknown> = {};
    value.kvlistValue.values.forEach(({ key, value: v }) => {
      obj[key] = convertOtlpValue(v);
    });
    return obj;
  }
  if (value.bytesValue !== undefined) return value.bytesValue;
  return null;
}

/**
 * Convert OTLP IKeyValue array to simple key-value object
 */
function convertOtlpAttributes(attributes?: IKeyValue[]): Record<string, unknown> {
  if (!attributes) return {};
  const result: Record<string, unknown> = {};
  attributes.forEach(({ key, value }) => {
    result[key] = convertOtlpValue(value);
  });
  return result;
}

/**
 * Convert Fixed64 (nanoseconds) to milliseconds
 */
function convertNanoToMilli(nano?: Fixed64): number | undefined {
  if (!nano) return undefined;

  // Handle different Fixed64 formats
  if (typeof nano === 'string') {
    const bigNano = BigInt(nano);
    return Number(bigNano / BigInt(1_000_000));
  }
  if (typeof nano === 'number') {
    return Math.floor(nano / 1_000_000);
  }
  // LongBits format: { low: number, high: number }
  if (typeof nano === 'object' && 'low' in nano && 'high' in nano) {
    // Convert high/low to full number (high is upper 32 bits, low is lower 32 bits)
    const fullNano = (nano.high * 0x100000000) + nano.low;
    return Math.floor(fullNano / 1_000_000);
  }
  return undefined;
}

/**
 * Convert OTLP status to simple status string
 */
function convertOtlpStatus(status?: { code?: string | number }): 'OK' | 'ERROR' | undefined {
  if (!status || status.code === undefined) return undefined;

  const code = typeof status.code === 'string' ? status.code : status.code.toString();

  // OTLP status codes: 0 = UNSET, 1 = OK, 2 = ERROR
  if (code === '1' || code === 'OK' || code === 'STATUS_CODE_OK') return 'OK';
  if (code === '2' || code === 'ERROR' || code === 'STATUS_CODE_ERROR') return 'ERROR';

  return undefined;
}

/**
 * Convert span ID from string or Uint8Array to hex string
 */
function convertSpanId(id: string | Uint8Array): string {
  if (typeof id === 'string') return id;
  // Convert Uint8Array to hex string
  return Array.from(id)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert OTLP format to ExecutionData format
 */
export function convertOtlpToExecutionData(otlp: OtlpData): ExecutionData {
  const allSpans: ExecutionData['spans'] = [];
  let serviceName: string | undefined;
  let scopeName: string | undefined;
  let scopeVersion: string | undefined;
  let minStartTime: number | undefined;
  let maxEndTime: number | undefined;

  if (!otlp.resourceSpans) {
    return { spans: [] };
  }

  // Extract data from nested OTLP structure
  otlp.resourceSpans.forEach((resourceSpan: IResourceSpans) => {
    // Extract service name from resource attributes
    if (resourceSpan.resource?.attributes) {
      const attrs = convertOtlpAttributes(resourceSpan.resource.attributes);
      serviceName = serviceName || (attrs['service.name'] as string);
    }

    resourceSpan.scopeSpans.forEach((scopeSpan: IScopeSpans) => {
      // Extract scope information
      scopeName = scopeName || scopeSpan.scope?.name;
      scopeVersion = scopeVersion || scopeSpan.scope?.version;

      (scopeSpan.spans || []).forEach((span: ISpan) => {
        const startTime = convertNanoToMilli(span.startTimeUnixNano);
        const endTime = convertNanoToMilli(span.endTimeUnixNano);

        // Track overall execution time range
        if (startTime !== undefined) {
          minStartTime = minStartTime === undefined ? startTime : Math.min(minStartTime, startTime);
        }
        if (endTime !== undefined) {
          maxEndTime = maxEndTime === undefined ? endTime : Math.max(maxEndTime, endTime);
        }

        const duration = startTime !== undefined && endTime !== undefined
          ? endTime - startTime
          : undefined;

        allSpans.push({
          id: convertSpanId(span.spanId),
          name: span.name,
          traceId: convertSpanId(span.traceId),
          parentSpanId: span.parentSpanId ? convertSpanId(span.parentSpanId) : undefined,
          startTime,
          endTime,
          duration,
          status: convertOtlpStatus(span.status),
          attributes: convertOtlpAttributes(span.attributes),
          events: (span.events || []).map((event: IEvent) => ({
            time: convertNanoToMilli(event.timeUnixNano) || 0,
            name: event.name,
            attributes: convertOtlpAttributes(event.attributes),
          })),
        });
      });
    });
  });

  return {
    metadata: {
      serviceName,
      scopeName,
      scopeVersion,
      startTime: minStartTime,
      endTime: maxEndTime,
      exportedAt: new Date().toISOString(),
    },
    spans: allSpans,
  };
}

/**
 * Type guard helper: shape of potential OTLP data before validation
 */
interface PotentialOtlpData {
  resourceSpans?: unknown;
}

/**
 * Check if data is in OTLP format
 */
function isOtlpFormat(data: unknown): data is OtlpData {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const potentialOtlp = data as PotentialOtlpData;
  return 'resourceSpans' in data && Array.isArray(potentialOtlp.resourceSpans);
}

/**
 * Validator for execution files
 */
export class ExecutionValidator {
  /**
   * Validate execution data structure
   *
   * Accepts both OTLP format (standard OpenTelemetry Protocol) and internal ExecutionData format.
   * OTLP format will be automatically converted to ExecutionData format before validation.
   */
  validate(data: unknown, filePath?: string): ExecutionValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check if data is an object
    if (!data || typeof data !== 'object') {
      errors.push({
        path: filePath || 'root',
        message: 'Execution data must be an object',
        severity: 'error',
        suggestion: 'Expected OTLP format: { "resourceSpans": [...] }',
      });
      return { valid: false, errors, warnings };
    }

    // Check if it's an array (common mistake)
    if (Array.isArray(data)) {
      errors.push({
        path: filePath || 'root',
        message: 'Execution data should be an object, not an array',
        severity: 'error',
        suggestion: 'Use OTLP format: { "resourceSpans": [...] }',
      });
      return { valid: false, errors, warnings };
    }

    // Detect and convert OTLP format to ExecutionData format
    let execution: Partial<ExecutionData>;
    if (isOtlpFormat(data)) {
      try {
        execution = convertOtlpToExecutionData(data);
      } catch (error) {
        errors.push({
          path: filePath || 'root',
          message: `Failed to convert OTLP format: ${(error as Error).message}`,
          severity: 'error',
          suggestion: 'Ensure the OTLP data is properly formatted',
        });
        return { valid: false, errors, warnings };
      }
    } else {
      execution = data as Partial<ExecutionData>;
    }

    // Check required fields
    if (!execution.spans) {
      errors.push({
        path: 'spans',
        message: 'Missing required "spans" array',
        severity: 'error',
        suggestion: 'Add "spans" property with array of span objects',
      });
      return { valid: false, errors, warnings };
    }

    if (!Array.isArray(execution.spans)) {
      errors.push({
        path: 'spans',
        message: '"spans" must be an array',
        severity: 'error',
        suggestion: 'Change "spans" to an array of span objects',
      });
      return { valid: false, errors, warnings };
    }

    // Validate metadata if present
    if (execution.metadata !== undefined) {
      if (typeof execution.metadata !== 'object' || execution.metadata === null) {
        errors.push({
          path: 'metadata',
          message: '"metadata" must be an object',
          severity: 'error',
        });
      } else {
        // Validate metadata fields
        const meta = execution.metadata;
        if (meta.startTime !== undefined && typeof meta.startTime !== 'number') {
          errors.push({
            path: 'metadata.startTime',
            message: '"startTime" must be a number (timestamp)',
            severity: 'error',
          });
        }
        if (meta.endTime !== undefined && typeof meta.endTime !== 'number') {
          errors.push({
            path: 'metadata.endTime',
            message: '"endTime" must be a number (timestamp)',
            severity: 'error',
          });
        }
      }
    }

    // Validate each span
    execution.spans.forEach((span, index) => {
      const spanPath = `spans[${index}]`;

      // Check span is an object
      if (!span || typeof span !== 'object') {
        errors.push({
          path: spanPath,
          message: 'Span must be an object',
          severity: 'error',
        });
        return;
      }

      // Required fields
      if (!span.id) {
        errors.push({
          path: `${spanPath}.id`,
          message: 'Span is missing required "id" field',
          severity: 'error',
          suggestion: `Add unique ID like "span-${index + 1}"`,
        });
      } else if (typeof span.id !== 'string') {
        errors.push({
          path: `${spanPath}.id`,
          message: 'Span "id" must be a string',
          severity: 'error',
        });
      }

      if (!span.name) {
        errors.push({
          path: `${spanPath}.name`,
          message: 'Span is missing required "name" field',
          severity: 'error',
        });
      } else if (typeof span.name !== 'string') {
        errors.push({
          path: `${spanPath}.name`,
          message: 'Span "name" must be a string',
          severity: 'error',
        });
      }

      if (!span.events) {
        errors.push({
          path: `${spanPath}.events`,
          message: 'Span is missing required "events" array',
          severity: 'error',
          suggestion: 'Add "events" array (can be empty [])',
        });
      } else if (!Array.isArray(span.events)) {
        errors.push({
          path: `${spanPath}.events`,
          message: 'Span "events" must be an array',
          severity: 'error',
        });
      } else {
        // Validate events
        span.events.forEach((event, eventIndex) => {
          const eventPath = `${spanPath}.events[${eventIndex}]`;

          if (!event || typeof event !== 'object') {
            errors.push({
              path: eventPath,
              message: 'Event must be an object',
              severity: 'error',
            });
            return;
          }

          if (!event.name) {
            errors.push({
              path: `${eventPath}.name`,
              message: 'Event is missing required "name" field',
              severity: 'error',
            });
          }

          if (event.time === undefined) {
            errors.push({
              path: `${eventPath}.time`,
              message: 'Event is missing required "time" field',
              severity: 'error',
            });
          } else if (typeof event.time !== 'number') {
            errors.push({
              path: `${eventPath}.time`,
              message: 'Event "time" must be a number (timestamp)',
              severity: 'error',
            });
          }

          if (!event.attributes) {
            warnings.push({
              path: `${eventPath}.attributes`,
              message: 'Event is missing "attributes" object',
              severity: 'warning',
              suggestion: 'Add empty object {} if no attributes needed',
            });
          } else if (
            typeof event.attributes !== 'object' ||
            Array.isArray(event.attributes)
          ) {
            errors.push({
              path: `${eventPath}.attributes`,
              message: 'Event "attributes" must be an object',
              severity: 'error',
            });
          }
        });
      }

      // Optional fields validation
      if (span.startTime !== undefined && typeof span.startTime !== 'number') {
        errors.push({
          path: `${spanPath}.startTime`,
          message: 'Span "startTime" must be a number (timestamp)',
          severity: 'error',
        });
      }

      if (span.endTime !== undefined && typeof span.endTime !== 'number') {
        errors.push({
          path: `${spanPath}.endTime`,
          message: 'Span "endTime" must be a number (timestamp)',
          severity: 'error',
        });
      }

      if (span.duration !== undefined && typeof span.duration !== 'number') {
        errors.push({
          path: `${spanPath}.duration`,
          message: 'Span "duration" must be a number',
          severity: 'error',
        });
      }

      if (span.status !== undefined) {
        if (span.status !== 'OK' && span.status !== 'ERROR') {
          errors.push({
            path: `${spanPath}.status`,
            message: 'Span "status" must be either "OK" or "ERROR"',
            severity: 'error',
          });
        }
      }

      if (span.attributes !== undefined) {
        if (
          typeof span.attributes !== 'object' ||
          Array.isArray(span.attributes)
        ) {
          errors.push({
            path: `${spanPath}.attributes`,
            message: 'Span "attributes" must be an object',
            severity: 'error',
          });
        }
      }
    });

    // Check for duplicate span IDs
    const spanIds = new Set<string>();
    execution.spans.forEach((span, index) => {
      if (span.id && spanIds.has(span.id)) {
        warnings.push({
          path: `spans[${index}].id`,
          message: `Duplicate span ID: "${span.id}"`,
          severity: 'warning',
          suggestion: 'Span IDs should be unique within an execution',
        });
      }
      if (span.id) {
        spanIds.add(span.id);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate and throw if invalid
   *
   * Returns converted ExecutionData (OTLP format is automatically converted)
   */
  validateOrThrow(data: unknown, filePath?: string): ExecutionData {
    const result = this.validate(data, filePath);

    if (!result.valid) {
      const errorMessages = result.errors.map(
        (e) => `${e.path}: ${e.message}${e.suggestion ? ` (${e.suggestion})` : ''}`
      );
      throw new Error(
        `Invalid execution data:\n${errorMessages.join('\n')}`
      );
    }

    // Convert OTLP format if needed
    if (isOtlpFormat(data)) {
      return convertOtlpToExecutionData(data);
    }

    return data as ExecutionData;
  }

  /**
   * Format validation result as human-readable report
   */
  formatReport(result: ExecutionValidationResult): string {
    const lines: string[] = [];

    if (result.valid && result.warnings.length === 0) {
      lines.push('✓ Execution data is valid');
      return lines.join('\n');
    }

    if (result.errors.length > 0) {
      lines.push('✗ Validation failed with errors:\n');
      result.errors.forEach((error) => {
        lines.push(`  ERROR: ${error.path}`);
        lines.push(`    ${error.message}`);
        if (error.suggestion) {
          lines.push(`    → ${error.suggestion}`);
        }
        lines.push('');
      });
    }

    if (result.warnings.length > 0) {
      lines.push('⚠ Warnings:\n');
      result.warnings.forEach((warning) => {
        lines.push(`  WARN: ${warning.path}`);
        lines.push(`    ${warning.message}`);
        if (warning.suggestion) {
          lines.push(`    → ${warning.suggestion}`);
        }
        lines.push('');
      });
    }

    return lines.join('\n');
  }
}

/**
 * Create a new execution validator instance
 */
export function createExecutionValidator(): ExecutionValidator {
  return new ExecutionValidator();
}
