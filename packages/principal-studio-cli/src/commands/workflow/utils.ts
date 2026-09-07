import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { WorkflowTemplate, OtelEvent } from '@principal-ai/subsystems-core';
import { ExecutionValidator, type ExecutionData } from '@principal-ai/subsystems-core';

/**
 * Load a workflow template from a file
 */
export async function loadWorkflow(filePath: string): Promise<WorkflowTemplate> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as WorkflowTemplate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Workflow file not found: ${filePath}`);
    }
    throw new Error(`Failed to parse workflow file: ${(error as Error).message}`);
  }
}

/**
 * Load execution data from a .otel.json file
 *
 * Automatically handles OTLP standard format conversion via ExecutionValidator.
 */
export async function loadExecution(filePath: string): Promise<ExecutionData> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    // Use ExecutionValidator to handle OTLP format conversion
    const validator = new ExecutionValidator();
    return validator.validateOrThrow(parsed, filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Execution file not found: ${filePath}`);
    }
    throw new Error(`Failed to parse execution file: ${(error as Error).message}`);
  }
}

/**
 * Convert execution data to OtelEvent array format expected by workflow APIs
 */
export function executionToEvents(execution: ExecutionData): OtelEvent[] {
  const events: OtelEvent[] = [];

  for (const span of execution.spans) {
    for (const event of span.events) {
      events.push({
        name: event.name,
        timestamp: event.time,
        type: 'log',
        attributes: {
          ...event.attributes,
          'span.id': span.id,
          'span.name': span.name,
        },
      });
    }
  }

  return events;
}

/**
 * Resolve a file path relative to a base directory
 */
export function resolvePath(filePath: string, baseDir?: string): string {
  if (baseDir) {
    return resolve(baseDir, filePath);
  }
  return resolve(filePath);
}

/**
 * Format a timestamp as human-readable date/time
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format duration in milliseconds
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

/**
 * Group attributes by prefix (e.g., 'auth.method' -> 'auth')
 */
export function groupAttributesByPrefix(
  attributes: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  const grouped: Record<string, Record<string, unknown>> = {};

  for (const [key, value] of Object.entries(attributes)) {
    const parts = key.split('.');
    if (parts.length > 1) {
      const prefix = parts[0];
      if (!grouped[prefix]) {
        grouped[prefix] = {};
      }
      grouped[prefix][key] = value;
    } else {
      if (!grouped['Other']) {
        grouped['Other'] = {};
      }
      grouped['Other'][key] = value;
    }
  }

  return grouped;
}

/**
 * Filter attributes by pattern (supports glob-like patterns)
 */
export function filterAttributes(
  attributes: Record<string, unknown>,
  pattern: string
): Record<string, unknown> {
  const regex = new RegExp(
    '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
  );

  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (regex.test(key)) {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Count events by type/name
 */
export function countEventsByType(events: OtelEvent[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const event of events) {
    const count = counts.get(event.name) || 0;
    counts.set(event.name, count + 1);
  }

  return counts;
}

/**
 * Format attribute value for display
 */
export function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Capitalize first letter of a string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
