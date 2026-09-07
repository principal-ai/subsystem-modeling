/**
 * Example: Using Generated Types
 *
 * This demonstrates how to use generated types for type-safe event emission.
 * Types are generated from canvas schemas using the type generator.
 *
 * Similar to:
 * - GraphQL Code Generator usage
 * - OpenAPI generated client usage
 * - Protobuf generated message usage
 *
 * NOTE: In real code, you would import from the generated types file:
 * ```typescript
 * import type {
 *   GraphConverter,
 *   Validation,
 *   NodeEmitterByName,
 * } from '@generated/graph-converter-execution.types';
 * ```
 *
 * For this example file, we define the types inline to avoid import errors.
 */

/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-explicit-any */
// Types that would be imported from generated file
namespace GraphConverter {
  export interface ConversionStarted {
    name: 'conversion.started';
    attributes: {
      'config.nodeTypes': number;
      'config.edgeTypes': number;
    };
  }

  export interface ConversionComplete {
    name: 'conversion.complete';
    attributes: {
      'result.nodes.count': number;
      'result.edges.count': number;
      'duration.ms'?: number;
    };
  }

  export interface ConversionError {
    name: 'conversion.error';
    attributes: {
      'error.message': string;
      'error.phase'?: string;
    };
  }

  export interface ConversionProcessingNodes {
    name: 'conversion.processingNodes';
    attributes: {
      'nodes.count': number;
    };
  }

  export interface ConversionProcessingEdges {
    name: 'conversion.processingEdges';
    attributes: {
      'edges.count': number;
    };
  }

  export type Event =
    | ConversionStarted
    | ConversionComplete
    | ConversionError
    | ConversionProcessingNodes
    | ConversionProcessingEdges;

  export type EventName =
    | 'conversion.started'
    | 'conversion.processingNodes'
    | 'conversion.processingEdges'
    | 'conversion.complete'
    | 'conversion.error';
}

namespace Validation {
  export interface ValidationStarted {
    name: 'validation.started';
    attributes: {
      'config.size': number;
    };
  }

  export interface ValidationComplete {
    name: 'validation.complete';
    attributes: {
      'validation.passed': boolean;
      'errors.count': number;
    };
  }

  export type Event = ValidationStarted | ValidationComplete;
  export type EventName = 'validation.started' | 'validation.complete';
}

type NodeEmitterByName<TEvent extends { name: string; attributes: Record<string, any> }> = <
  TName extends TEvent['name']
>(
  eventName: TName,
  attributes: Extract<TEvent, { name: TName }>['attributes']
) => void;

/**
 * Example 1: Type-safe event emitter with full event objects
 */
function exampleFullEventEmitter() {
  // Define an emitter that accepts GraphConverter events
  const emit = (event: GraphConverter.Event) => {
    console.log('Event:', event.name);
    console.log('Attributes:', event.attributes);
  };

  // ✅ Valid: all required fields present
  emit({
    name: 'conversion.started',
    attributes: {
      'config.nodeTypes': 2,
      'config.edgeTypes': 1,
    },
  });

  // ✅ Valid: optional field included
  emit({
    name: 'conversion.complete',
    attributes: {
      'result.nodes.count': 5,
      'result.edges.count': 3,
      'duration.ms': 150, // Optional field
    },
  });

  // ❌ TypeScript error: missing required field
  // emit({
  //   name: 'conversion.started',
  //   attributes: {
  //     'config.nodeTypes': 2,
  //     // Missing 'config.edgeTypes' - TypeScript error!
  //   },
  // });

  // ❌ TypeScript error: wrong field type
  // emit({
  //   name: 'conversion.started',
  //   attributes: {
  //     'config.nodeTypes': 'two', // Should be number! TypeScript error!
  //     'config.edgeTypes': 1,
  //   },
  // });

  // ❌ TypeScript error: invalid event name
  // emit({
  //   name: 'conversion.unknown', // Not a valid event! TypeScript error!
  //   attributes: {},
  // });
}

/**
 * Example 2: Type-safe event emitter by name (more ergonomic)
 */
function exampleEventEmitterByName() {
  // Define an emitter that accepts event name + attributes
  const emit = ((eventName: string, attributes: any) => {
    console.log('Event:', eventName);
    console.log('Attributes:', attributes);
  }) as NodeEmitterByName<GraphConverter.Event>;

  // ✅ Valid: TypeScript infers the attributes type based on event name
  emit('conversion.started', {
    'config.nodeTypes': 2,
    'config.edgeTypes': 1,
  });

  // ✅ Valid: TypeScript knows 'duration.ms' is optional for 'conversion.complete'
  emit('conversion.complete', {
    'result.nodes.count': 5,
    'result.edges.count': 3,
  });

  // ✅ Valid: optional field included
  emit('conversion.complete', {
    'result.nodes.count': 5,
    'result.edges.count': 3,
    'duration.ms': 150,
  });

  // ❌ TypeScript error: wrong attributes for this event
  // emit('conversion.started', {
  //   'result.nodes.count': 5, // Wrong attributes! TypeScript error!
  // });

  // ❌ TypeScript error: invalid event name
  // emit('unknown.event', {});
}

/**
 * Example 3: Production service with type-safe telemetry
 */
class GraphConverterService {
  private emit: NodeEmitterByName<GraphConverter.Event>;

  constructor(emitter: NodeEmitterByName<GraphConverter.Event>) {
    this.emit = emitter;
  }

  convert(config: { nodeTypes: string[]; edgeTypes: string[] }) {
    // ✅ Type-safe event emission
    this.emit('conversion.started', {
      'config.nodeTypes': config.nodeTypes.length,
      'config.edgeTypes': config.edgeTypes.length,
    });

    try {
      // ... conversion logic

      // ✅ TypeScript ensures all required fields are present
      this.emit('conversion.complete', {
        'result.nodes.count': 10,
        'result.edges.count': 5,
      });
    } catch (error) {
      // ✅ Type-safe error event
      this.emit('conversion.error', {
        'error.message': (error as Error).message,
        'error.phase': 'conversion', // Optional field
      });
    }
  }
}

/**
 * Example 4: Multiple node types
 */
function exampleMultipleNodes() {
  // Can use different event types for different nodes
  const emitValidation = ((name: string, attrs: any) => {
    console.log('Validation:', name, attrs);
  }) as NodeEmitterByName<Validation.Event>;

  const emitConverter = ((name: string, attrs: any) => {
    console.log('Converter:', name, attrs);
  }) as NodeEmitterByName<GraphConverter.Event>;

  // ✅ Each emitter is type-safe to its node's events
  emitValidation('validation.started', {
    'config.size': 100,
  });

  emitConverter('conversion.started', {
    'config.nodeTypes': 2,
    'config.edgeTypes': 1,
  });

  // ❌ TypeScript error: can't use validation events with converter emitter
  // emitConverter('validation.started', {
  //   'config.size': 100,
  // });
}

/**
 * Example 5: Generic event handler with type narrowing
 */
function exampleEventHandler(event: GraphConverter.Event) {
  // TypeScript knows the structure based on event name
  switch (event.name) {
    case 'conversion.started':
      // TypeScript knows event.attributes has 'config.nodeTypes' and 'config.edgeTypes'
      console.log(`Starting conversion with ${event.attributes['config.nodeTypes']} node types`);
      break;

    case 'conversion.complete':
      // TypeScript knows event.attributes has 'result.nodes.count' and 'result.edges.count'
      console.log(`Completed: ${event.attributes['result.nodes.count']} nodes`);
      // TypeScript knows 'duration.ms' might be undefined
      if (event.attributes['duration.ms']) {
        console.log(`Duration: ${event.attributes['duration.ms']}ms`);
      }
      break;

    case 'conversion.error':
      // TypeScript knows event.attributes has 'error.message'
      console.error(`Error: ${event.attributes['error.message']}`);
      break;
  }
}

/**
 * Example 6: Type-safe event name checking
 */
function exampleEventNameChecking(eventName: string) {
  // Type-safe event name validation
  if (isConverterEvent(eventName)) {
    // TypeScript knows eventName is GraphConverter.EventName
    console.log('Valid converter event:', eventName);
  }
}

function isConverterEvent(name: string): name is GraphConverter.EventName {
  const validNames: GraphConverter.EventName[] = [
    'conversion.started',
    'conversion.processingNodes',
    'conversion.processingEdges',
    'conversion.complete',
    'conversion.error',
  ];
  return validNames.includes(name as GraphConverter.EventName);
}

/**
 * Example 7: Integration with event validator
 */
async function exampleWithValidator() {
  const { EventValidator, createValidatedEmitter } = await import('../telemetry/event-validator');
  const fs = await import('fs');

  // Load canvas with schema
  const canvas = JSON.parse(
    fs.readFileSync('.principal-views/graph-converter-execution.otel.canvas', 'utf-8')
  );

  const validator = new EventValidator(canvas);

  // Create validated emitter with generated types
  const emit = createValidatedEmitter(
    validator,
    'graph-converter',
    (eventName, attributes) => {
      console.log('Validated event:', eventName, attributes);
    }
  ) as NodeEmitterByName<GraphConverter.Event>;

  // ✅ Both type-safe (TypeScript) AND runtime validated (EventValidator)
  emit('conversion.started', {
    'config.nodeTypes': 2,
    'config.edgeTypes': 1,
  });

  // ❌ TypeScript error at compile-time
  // ❌ Runtime validation error
  // emit('conversion.started', {
  //   'config.nodeTypes': 'wrong', // TypeScript + runtime error!
  // });
}

export {
  exampleFullEventEmitter,
  exampleEventEmitterByName,
  GraphConverterService,
  exampleMultipleNodes,
  exampleEventHandler,
  exampleEventNameChecking,
  exampleWithValidator,
};
