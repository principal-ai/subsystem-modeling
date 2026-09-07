/**
 * Simple Test Span Collector
 *
 * Lightweight span collection for test execution visualization.
 * Collects span data that can be exported to JSON for Storybook.
 *
 * Integrates with EventValidator to ensure emitted events match canvas schema.
 */

import fs from 'fs';
import path from 'path';
import type { ExtendedCanvas } from '../src/types/canvas';
import { EventValidator, createValidatedEmitter } from '../src/telemetry/event-validator';

// Span event structure
interface SpanEvent {
  time: number;
  name: string;
  attributes: Record<string, string | number | boolean>;
}

// Span data structure
interface TestSpan {
  id: string;
  name: string;
  parentId?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  status: 'OK' | 'ERROR';
  errorMessage?: string;
}

// In-memory span storage
const collectedSpans: TestSpan[] = [];
let spanIdCounter = 0;

/**
 * Start a test span
 */
export function startTestSpan(
  testName: string,
  attributes?: Record<string, string | number>
) {
  const span: TestSpan = {
    id: `span-${++spanIdCounter}`,
    name: testName,
    startTime: Date.now(),
    attributes: {
      'span.kind': 'test.case',
      'test.name': testName,
      'test.framework': 'bun',
      ...attributes,
    },
    events: [],
    status: 'OK',
  };

  collectedSpans.push(span);
  return span;
}

/**
 * Extract file and line information from stack trace
 */
function getCallerInfo(): { filepath: string; lineno: number } | null {
  const stack = new Error().stack;
  if (!stack) return null;

  const lines = stack.split('\n');
  // Skip first 3 lines: Error, getCallerInfo, addEvent
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    // Match patterns like: at /path/to/file.ts:123:45 or (file.ts:123:45)
    const match = line.match(/\(([^)]+):(\d+):\d+\)/) || line.match(/at\s+([^:]+):(\d+):\d+/);
    if (match) {
      const fullPath = match[1];
      // Extract just the filename from the full path
      const filepath = fullPath.split('/').pop() || fullPath;
      const lineno = parseInt(match[2], 10);
      return { filepath, lineno };
    }
  }
  return null;
}

/**
 * Add an event to a span (captures what happened during test execution)
 *
 * Automatically captures file/line from stack trace, but you can override
 * to specify the actual code being executed (e.g., the file under test)
 */
export function addEvent(
  span: TestSpan,
  eventName: string,
  attributes?: Record<string, string | number | boolean>
) {
  const callerInfo = getCallerInfo();

  span.events.push({
    time: Date.now(),
    name: eventName,
    attributes: {
      ...(callerInfo ? {
        'code.filepath': callerInfo.filepath,
        'code.lineno': callerInfo.lineno,
      } : {}),
      ...attributes, // attributes can override filepath/lineno
    },
  });
}

/**
 * Create a validated event emitter for a test span
 *
 * Validates events against the canvas schema for the specified node.
 * Throws EventValidationError if events don't match schema (in strict mode).
 *
 * @param canvas - The canvas containing event schemas
 * @param nodeId - The node ID to validate events against
 * @param span - The test span to add events to
 * @param options - Validation options (strict: true by default in tests)
 *
 * @example
 * ```typescript
 * const canvas = loadCanvas('my-execution-flow.canvas');
 * const span = startTestSpan('my test');
 * const emit = createValidatedSpanEmitter(canvas, 'graph-converter', span);
 *
 * // Type-safe and validated against canvas schema
 * emit('conversion.started', {
 *   'config.nodeTypes': 2,
 *   'config.edgeTypes': 1
 * });
 * ```
 */
export function createValidatedSpanEmitter(
  canvas: ExtendedCanvas,
  nodeId: string,
  span: TestSpan,
  options: { strict?: boolean } = { strict: true }
): (eventName: string, attributes?: Record<string, string | number | boolean>) => void {
  const validator = new EventValidator(canvas);

  return createValidatedEmitter(
    validator,
    nodeId,
    (eventName, attributes) => addEvent(span, eventName, attributes),
    options
  );
}

/**
 * End a span
 */
export function endSpan(span: TestSpan) {
  span.endTime = Date.now();
  span.duration = span.endTime - span.startTime;
}

/**
 * Mark test as passed
 */
export function markTestPassed(span: TestSpan) {
  span.status = 'OK';
  span.attributes['test.result'] = 'pass';
}

/**
 * Mark test as failed
 */
export function markTestFailed(span: TestSpan, error: Error) {
  span.status = 'ERROR';
  span.attributes['test.result'] = 'fail';
  span.attributes['test.error'] = error.message;
  span.errorMessage = error.message;
}

/**
 * Set span attribute
 */
export function setSpanAttribute(span: TestSpan, key: string, value: string | number | boolean) {
  span.attributes[key] = value;
}

/**
 * Export collected spans to JSON file for visualization
 */
export function exportSpans(filename: string) {
  // End any spans that weren't ended
  collectedSpans.forEach((span) => {
    if (!span.endTime) {
      endSpan(span);
    }
  });

  // Skip writing the file unless explicitly opted in. The fixture is consumed
  // only by Storybook stories and doesn't need to be regenerated on every test run.
  if (process.env.OTEL_TRACE_EXPORT !== 'true') {
    return collectedSpans;
  }

  const outputPath = path.join(
    __dirname,
    '../../react/src/stories/data',
    filename
  );

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(collectedSpans, null, 2));

  console.log(`✅ Exported ${collectedSpans.length} spans to ${outputPath}`);

  return collectedSpans;
}

/**
 * Clear collected spans
 */
export function clearSpans() {
  collectedSpans.length = 0;
  spanIdCounter = 0;
}
