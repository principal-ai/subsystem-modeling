/**
 * End-to-End Integration Test
 *
 * Demonstrates the complete workflow:
 * 1. Canvas defines event schemas
 * 2. Generate TypeScript types from canvas
 * 3. Use generated types for type-safe emission
 * 4. Runtime validation with EventValidator
 * 5. Test that production code emits correct events
 */

import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { generateTypes } from '../src/codegen/type-generator';
import { EventValidator, createValidatedEmitter } from '../src/telemetry/event-validator';
import type { ExtendedCanvas } from '../src/types/canvas';
import { startTestSpan, createValidatedSpanEmitter, clearSpans, type TestSpan } from './otel-setup';

// Load canvas with event schemas
const canvasPath = path.join(__dirname, '../../../.principal-views/graph-converter-execution.otel.canvas');
const canvas: ExtendedCanvas = JSON.parse(fs.readFileSync(canvasPath, 'utf-8'));

describe('End-to-End: Canvas → Types → Validation → Emission', () => {
  test('complete workflow with type generation', () => {
    // STEP 1: Generate types from canvas
    const typeGenResult = generateTypes(canvas, {
      language: 'typescript',
      style: {
        includeDocComments: true,
        strictNullChecks: true,
      },
    });

    expect(typeGenResult.code).toContain('export namespace GraphConverter');
    expect(typeGenResult.code).toContain('export interface ConversionStarted');
    expect(typeGenResult.filename).toBe('graph-converter-execution.types.ts');

    // STEP 2: Create event validator from canvas
    const validator = new EventValidator(canvas);

    expect(validator.hasSchema('graph-converter')).toBe(true);
    expect(validator.getNodeEventNames('graph-converter')).toContain('conversion.started');
    expect(validator.getNodeEventNames('graph-converter')).toContain('conversion.complete');

    // STEP 3: Create type-safe validated emitter
    clearSpans();
    const span = startTestSpan('end-to-end test');
    const emit = createValidatedSpanEmitter(canvas, 'graph-converter', span, {
      strict: true, // Strict mode - throw on validation errors
    });

    // STEP 4: Emit events (type-safe + runtime validated)
    // These would normally use the generated types, but for this test
    // we verify they work correctly

    // Valid event - should pass both TypeScript and runtime validation
    emit('conversion.started', {
      'config.nodeTypes': 2,
      'config.edgeTypes': 1,
    });

    emit('conversion.processingNodes', {
      'nodes.count': 2,
    });

    emit('conversion.processingEdges', {
      'edges.count': 1,
    });

    emit('conversion.complete', {
      'result.nodes.count': 2,
      'result.edges.count': 1,
      'duration.ms': 5,
    });

    // STEP 5: Verify events were emitted correctly
    expect(span.events).toHaveLength(4);
    expect(span.events[0].name).toBe('conversion.started');
    expect(span.events[1].name).toBe('conversion.processingNodes');
    expect(span.events[2].name).toBe('conversion.processingEdges');
    expect(span.events[3].name).toBe('conversion.complete');

    // Verify attributes
    expect(span.events[0].attributes['config.nodeTypes']).toBe(2);
    expect(span.events[0].attributes['config.edgeTypes']).toBe(1);
    expect(span.events[3].attributes['result.nodes.count']).toBe(2);
    expect(span.events[3].attributes['duration.ms']).toBe(5);

    clearSpans();
  });

  test('validation catches schema violations', () => {
    clearSpans();
    const span = startTestSpan('validation error test');
    const emit = createValidatedSpanEmitter(canvas, 'graph-converter', span, {
      strict: true,
    });

    // Valid event first
    emit('conversion.started', {
      'config.nodeTypes': 2,
      'config.edgeTypes': 1,
    });

    // Invalid event - missing required field
    expect(() => {
      emit('conversion.started', {
        'config.nodeTypes': 2,
        // Missing 'config.edgeTypes' - should throw!
      });
    }).toThrow('Event validation failed');

    // Invalid event - wrong type
    expect(() => {
      emit('conversion.complete', {
        'result.nodes.count': 'five', // Should be number!
        'result.edges.count': 3,
      });
    }).toThrow('Event validation failed');

    // Only the first valid event should be emitted
    expect(span.events).toHaveLength(1);

    clearSpans();
  });

  test('production service with validated telemetry', () => {
    // Simulate a production service using the generated types and validation

    class GraphConverterService {
      private emit: ReturnType<typeof createValidatedEmitter>;

      constructor(canvas: ExtendedCanvas, span: TestSpan) {
        const validator = new EventValidator(canvas);
        this.emit = createValidatedEmitter(
          validator,
          'graph-converter',
          (name, attrs) => {
            span.events.push({
              time: Date.now(),
              name,
              attributes: attrs,
            });
          },
          { strict: false } // Permissive in production - log warnings but don't crash
        );
      }

      convert(config: { nodeTypes: string[]; edgeTypes: string[] }) {
        // Emit start event
        this.emit('conversion.started', {
          'config.nodeTypes': config.nodeTypes.length,
          'config.edgeTypes': config.edgeTypes.length,
        });

        // Simulate conversion
        const nodes = config.nodeTypes.map((type) => ({ type }));
        const edges = config.edgeTypes.map((type) => ({ type }));

        // Emit processing events
        this.emit('conversion.processingNodes', {
          'nodes.count': nodes.length,
        });

        this.emit('conversion.processingEdges', {
          'edges.count': edges.length,
        });

        // Emit completion
        this.emit('conversion.complete', {
          'result.nodes.count': nodes.length,
          'result.edges.count': edges.length,
        });

        return { nodes, edges };
      }
    }

    // Test the service
    clearSpans();
    const span = startTestSpan('production service test');
    const service = new GraphConverterService(canvas, span);

    const result = service.convert({
      nodeTypes: ['user', 'product'],
      edgeTypes: ['owns'],
    });

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);

    // Verify telemetry
    expect(span.events).toHaveLength(4);
    expect(span.events[0].name).toBe('conversion.started');
    expect(span.events[3].name).toBe('conversion.complete');

    clearSpans();
  });

  test('multiple nodes with different event schemas', () => {
    const validator = new EventValidator(canvas);

    // GraphConverter node
    expect(validator.getNodeEventNames('graph-converter')).toContain('conversion.started');
    expect(validator.getNodeEventNames('graph-converter')).toContain('conversion.complete');

    // Validation node
    expect(validator.getNodeEventNames('validation')).toContain('validation.started');
    expect(validator.getNodeEventNames('validation')).toContain('validation.complete');

    // GraphOutput node
    expect(validator.getNodeEventNames('graph-output')).toContain('output.created');

    // Each node should have its own schema
    clearSpans();

    const converterSpan = startTestSpan('converter events');
    const converterEmit = createValidatedSpanEmitter(canvas, 'graph-converter', converterSpan);

    converterEmit('conversion.started', {
      'config.nodeTypes': 2,
      'config.edgeTypes': 1,
    });

    const validationSpan = startTestSpan('validation events');
    const validationEmit = createValidatedSpanEmitter(canvas, 'validation', validationSpan);

    validationEmit('validation.started', {
      'config.size': 100,
    });

    const outputSpan = startTestSpan('output events');
    const outputEmit = createValidatedSpanEmitter(canvas, 'graph-output', outputSpan);

    outputEmit('output.created', {
      'output.type': 'NodeState[]',
    });

    expect(converterSpan.events).toHaveLength(1);
    expect(validationSpan.events).toHaveLength(1);
    expect(outputSpan.events).toHaveLength(1);

    clearSpans();
  });

  test('generated types are valid TypeScript', () => {
    const result = generateTypes(canvas, { language: 'typescript' });

    // Check for proper TypeScript constructs
    expect(result.code).toMatch(/export namespace \w+/);
    expect(result.code).toMatch(/export interface \w+/);
    expect(result.code).toMatch(/export type Event =/);
    expect(result.code).toMatch(/export type EventName =/);

    // Check for literal types
    expect(result.code).toContain("name: 'conversion.started'");
    expect(result.code).toContain("name: 'conversion.complete'");

    // Check for optional fields
    expect(result.code).toMatch(/'duration\.ms'\?: number/);

    // Check for required fields (no question mark)
    expect(result.code).toMatch(/'config\.nodeTypes': number/);
    expect(result.code).toMatch(/'config\.edgeTypes': number/);
  });
});

describe('End-to-End: Full Development Workflow', () => {
  test('workflow simulation: canvas → codegen → implement → validate', () => {
    // PHASE 1: Design (Canvas with event schemas)
    console.log('📐 Phase 1: Design canvas with event schemas');
    expect(canvas.nodes).toBeDefined();
    expect(canvas.nodes![0].pv?.event).toBeDefined();

    // PHASE 2: Code Generation
    console.log('⚙️  Phase 2: Generate TypeScript types');
    const typeGenResult = generateTypes(canvas, { language: 'typescript' });
    expect(typeGenResult.code.length).toBeGreaterThan(1000);

    // PHASE 3: Implementation (with type-safe emission)
    console.log('💻 Phase 3: Implement with type-safe events');
    clearSpans();
    const span = startTestSpan('implementation test');
    const emit = createValidatedSpanEmitter(canvas, 'graph-converter', span);

    // Emit events (type-safe)
    emit('conversion.started', {
      'config.nodeTypes': 3,
      'config.edgeTypes': 2,
    });

    emit('conversion.complete', {
      'result.nodes.count': 10,
      'result.edges.count': 5,
    });

    // PHASE 4: Validation (in tests)
    console.log('✅ Phase 4: Validate events match schema');
    expect(span.events).toHaveLength(2);

    // Validate first event
    const validator = new EventValidator(canvas);
    const startValidation = validator.validate(
      'graph-converter',
      span.events[0].name,
      span.events[0].attributes
    );
    expect(startValidation.valid).toBe(true);

    // Validate second event
    const completeValidation = validator.validate(
      'graph-converter',
      span.events[1].name,
      span.events[1].attributes
    );
    expect(completeValidation.valid).toBe(true);

    console.log('🎉 All phases complete!');

    clearSpans();
  });
});
