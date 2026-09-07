/**
 * Event Validation Tests
 *
 * Demonstrates type-safe event emission with schema validation.
 */

import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { EventValidator, EventValidationError } from '../src/telemetry/event-validator';
import type { ExtendedCanvas } from '../src/types/canvas';
import { startTestSpan, createValidatedSpanEmitter, exportSpans, clearSpans } from './otel-setup';

// Load the canvas with event schemas
const canvasPath = path.join(__dirname, '../../../.principal-views/graph-converter-execution.otel.canvas');
const canvas: ExtendedCanvas = JSON.parse(fs.readFileSync(canvasPath, 'utf-8'));

describe('Event Schema Validation', () => {
  test('should validate events against canvas schema', () => {
    const validator = new EventValidator(canvas);

    // Valid event - should pass
    const validResult = validator.validate('graph-converter', 'conversion.started', {
      'config.nodeTypes': 2,
      'config.edgeTypes': 1,
    });

    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toHaveLength(0);

    // Invalid event - missing required field
    const invalidResult = validator.validate('graph-converter', 'conversion.started', {
      'config.nodeTypes': 2,
      // Missing 'config.edgeTypes'
    });

    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toContain("Required field 'config.edgeTypes' is missing");
  });

  test('should validate event field types', () => {
    const validator = new EventValidator(canvas);

    // Wrong type - string instead of number
    const result = validator.validate('graph-converter', 'conversion.started', {
      'config.nodeTypes': 'two', // Should be number!
      'config.edgeTypes': 1,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("has type 'string' but schema expects 'number'"))).toBe(true);
  });

  test('should allow events with optional fields', () => {
    const validator = new EventValidator(canvas);

    // Optional field present
    const result1 = validator.validate('graph-converter', 'conversion.complete', {
      'result.nodes.count': 5,
      'result.edges.count': 3,
      'duration.ms': 150, // Optional field
    });

    expect(result1.valid).toBe(true);

    // Optional field missing
    const result2 = validator.validate('graph-converter', 'conversion.complete', {
      'result.nodes.count': 5,
      'result.edges.count': 3,
      // duration.ms omitted
    });

    expect(result2.valid).toBe(true);
  });

  test('should reject undefined events', () => {
    const validator = new EventValidator(canvas);

    const result = validator.validate('graph-converter', 'unknown.event', {
      'some.field': 'value',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Event 'unknown.event' is not defined in schema for node 'graph-converter'");
  });

  test('should allow events for nodes without schema (permissive mode)', () => {
    const validator = new EventValidator(canvas);

    // Node that doesn't have event schema
    const result = validator.validate('nonexistent-node', 'any.event', {
      'any.field': 'value',
    });

    // Permissive mode - allows events for nodes without schema
    expect(result.valid).toBe(true);
  });
});

describe('Validated Event Emitter', () => {
  test('should emit valid events successfully', () => {
    clearSpans();

    const span = startTestSpan('validated emission test');
    const emit = createValidatedSpanEmitter(canvas, 'graph-converter', span);

    // This should succeed
    emit('conversion.started', {
      'config.nodeTypes': 2,
      'config.edgeTypes': 1,
    });

    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('conversion.started');
  });

  test('should throw on invalid events in strict mode', () => {
    clearSpans();

    const span = startTestSpan('strict validation test');
    const emit = createValidatedSpanEmitter(canvas, 'graph-converter', span, { strict: true });

    // This should throw - missing required field
    expect(() => {
      emit('conversion.started', {
        'config.nodeTypes': 2,
        // Missing 'config.edgeTypes'
      });
    }).toThrow(EventValidationError);
  });

  test('should warn but not throw in permissive mode', () => {
    clearSpans();

    const span = startTestSpan('permissive validation test');
    const emit = createValidatedSpanEmitter(canvas, 'graph-converter', span, { strict: false });

    // This should warn but not throw
    emit('conversion.started', {
      'config.nodeTypes': 2,
      // Missing 'config.edgeTypes'
    });

    // Event should still be emitted
    expect(span.events).toHaveLength(1);
  });

  test('should allow special metadata fields', () => {
    clearSpans();

    const span = startTestSpan('metadata fields test');
    const emit = createValidatedSpanEmitter(canvas, 'graph-converter', span);

    // code.* fields are special and always allowed
    emit('conversion.started', {
      'config.nodeTypes': 2,
      'config.edgeTypes': 1,
      'code.filepath': 'GraphConverter.ts', // Special field
      'code.lineno': 42, // Special field
      description: 'Starting conversion', // Special field
    });

    expect(span.events).toHaveLength(1);
    expect(span.events[0].attributes['code.filepath']).toBe('GraphConverter.ts');
  });
});

describe('Full Execution Flow with Validation', () => {
  test('should validate entire execution workflow', () => {
    clearSpans();

    const testSpan = startTestSpan('graph conversion with validation', {
      'test.file': 'event-validation.test.ts',
      'test.suite': 'Event Schema Validation',
    });

    try {
      const emit = createValidatedSpanEmitter(canvas, 'graph-converter', testSpan);

      // Emit events following the schema
      emit('conversion.started', {
        'config.nodeTypes': 2,
        'config.edgeTypes': 1,
        'code.filepath': 'GraphConverter.ts',
        'code.lineno': 15,
      });

      emit('conversion.processingNodes', {
        'nodes.count': 2,
        'code.filepath': 'GraphConverter.ts',
        'code.lineno': 28,
      });

      emit('conversion.processingEdges', {
        'edges.count': 1,
        'code.filepath': 'GraphConverter.ts',
        'code.lineno': 45,
      });

      emit('conversion.complete', {
        'result.nodes.count': 2,
        'result.edges.count': 1,
        'duration.ms': 5,
        'code.filepath': 'GraphConverter.ts',
        'code.lineno': 60,
      });

      // All events should be emitted
      expect(testSpan.events).toHaveLength(4);
      expect(testSpan.events.map(e => e.name)).toEqual([
        'conversion.started',
        'conversion.processingNodes',
        'conversion.processingEdges',
        'conversion.complete',
      ]);

      // Export for visualization
      const spans = exportSpans('graph-converter-validated-execution.json');
      expect(spans).toHaveLength(1);
    } finally {
      clearSpans();
    }
  });

  test('should catch schema violations during execution', () => {
    clearSpans();

    const testSpan = startTestSpan('schema violation detection');

    try {
      const emit = createValidatedSpanEmitter(canvas, 'graph-converter', testSpan);

      // First event is valid
      emit('conversion.started', {
        'config.nodeTypes': 2,
        'config.edgeTypes': 1,
      });

      // Second event has wrong type - should throw
      expect(() => {
        emit('conversion.complete', {
          'result.nodes.count': 'five', // Wrong type! Should be number
          'result.edges.count': 3,
        });
      }).toThrow(EventValidationError);

      // Only the first event should be emitted
      expect(testSpan.events).toHaveLength(1);
    } finally {
      clearSpans();
    }
  });
});
