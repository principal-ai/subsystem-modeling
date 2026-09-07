/**
 * Event Validator
 *
 * Type-safe telemetry event validation against canvas event schemas.
 * Ensures that emitted events match the schema defined in the canvas.
 */

import type { ExtendedCanvas, PVEventSchema } from '../types/canvas';
import { isOtelEventNode, isStandardCanvasNode } from '../types/canvas';
import type { ComponentLibrary } from '../types/library';
import type { JsonValue, JsonObject } from '../types';

/**
 * Validation error for telemetry events
 */
export class EventValidationError extends Error {
  constructor(
    public eventName: string,
    public nodeId: string,
    public errors: string[]
  ) {
    super(`Event validation failed for '${eventName}' on node '${nodeId}':\n${errors.join('\n')}`);
    this.name = 'EventValidationError';
  }
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Event validator that checks events against canvas schema
 */
export class EventValidator {
  private eventSchemasByNode: Map<string, PVEventSchema> = new Map();
  private eventSchemasByName: Map<string, PVEventSchema> = new Map();
  private nodeIdsByBaseId: Map<string, Set<string>> = new Map();
  private library?: ComponentLibrary;

  constructor(canvas: ExtendedCanvas, library?: ComponentLibrary) {
    this.library = library;
    this.indexEventSchemas(canvas);
  }

  /**
   * Index all event schemas from canvas nodes
   */
  private indexEventSchemas(canvas: ExtendedCanvas) {
    if (!canvas.nodes) return;

    for (const node of canvas.nodes) {
      let eventSchema: PVEventSchema | undefined;

      // Check OTEL event node (top-level event/eventRef)
      if (isOtelEventNode(node)) {
        if (node.event) {
          eventSchema = node.event;
        } else if (node.eventRef) {
          eventSchema = this.resolveLibraryEvent(node.eventRef);
          if (!eventSchema) {
            console.warn(
              `Node '${node.id}' references unknown library event '${node.eventRef}'`
            );
            continue;
          }
        }
      }
      // Check standard node (pv.event/pv.eventRef)
      else if (isStandardCanvasNode(node)) {
        if (node.pv?.event) {
          eventSchema = node.pv.event;
        } else if (node.pv?.eventRef) {
          eventSchema = this.resolveLibraryEvent(node.pv.eventRef);
          if (!eventSchema) {
            console.warn(
              `Node '${node.id}' references unknown library event '${node.pv.eventRef}'`
            );
            continue;
          }
        }
      }

      if (eventSchema) {
        // Index by node ID
        this.eventSchemasByNode.set(node.id, eventSchema);

        // Index by event name
        this.eventSchemasByName.set(eventSchema.name, eventSchema);

        // Index by base node ID (strip numeric suffixes like '-2', '-3')
        const baseId = node.id.replace(/-\d+$/, '');
        if (!this.nodeIdsByBaseId.has(baseId)) {
          this.nodeIdsByBaseId.set(baseId, new Set());
        }
        this.nodeIdsByBaseId.get(baseId)!.add(node.id);
      }
    }
  }

  /**
   * Resolve an event schema from library by event name
   */
  private resolveLibraryEvent(eventName: string): PVEventSchema | undefined {
    if (!this.library?.eventSchemas) {
      return undefined;
    }

    const librarySchema = this.library.eventSchemas[eventName];
    if (!librarySchema) {
      return undefined;
    }

    // Convert library schema (without name) to full PVEventSchema
    return {
      name: eventName,
      description: librarySchema.description,
      attributes: librarySchema.attributes,
    };
  }

  /**
   * Validate an event against the schema for a specific node
   */
  validate(
    nodeId: string,
    eventName: string,
    attributes: JsonObject
  ): ValidationResult {
    const errors: string[] = [];

    // First try to find schema by event name (supports multiple events per component)
    const eventSchema = this.eventSchemasByName.get(eventName);

    // If not found by event name, check if the specific node has a schema
    if (!eventSchema) {
      // Check exact node ID first
      const nodeSchema = this.eventSchemasByNode.get(nodeId);
      if (nodeSchema) {
        // Node has a schema, but this event doesn't exist anywhere
        errors.push(`Event '${eventName}' is not defined in schema for node '${nodeId}'`);
        return { valid: false, errors };
      }

      // Check base ID pattern (e.g., "graph-converter" for "graph-converter-1", etc.)
      const baseId = nodeId.replace(/-\d+$/, '');
      if (this.nodeIdsByBaseId.has(baseId)) {
        // Component has schemas defined, but this event doesn't exist
        errors.push(`Event '${eventName}' is not defined in schema for node '${nodeId}'`);
        return { valid: false, errors };
      }

      // No schema defined at all - allow all events (permissive mode)
      return { valid: true, errors: [] };
    }

    // Verify event name matches (this should always be true now, but keeping for safety)
    if (eventSchema.name !== eventName) {
      errors.push(`Event '${eventName}' does not match schema event name '${eventSchema.name}' for node '${nodeId}'`);
      return { valid: false, errors };
    }

    // Validate each field in the schema
    for (const [fieldName, fieldSchema] of Object.entries(eventSchema.attributes)) {
      const value = attributes[fieldName];

      // Check required fields
      if (fieldSchema.required && value === undefined) {
        errors.push(`Required field '${fieldName}' is missing`);
        continue;
      }

      // Skip validation if field is not present and not required
      if (value === undefined) {
        continue;
      }

      // Validate type
      const actualType = this.getValueType(value);
      if (actualType !== fieldSchema.type) {
        errors.push(
          `Field '${fieldName}' has type '${actualType}' but schema expects '${fieldSchema.type}'`
        );
      }
    }

    // Check for unexpected fields (strict mode)
    const schemaFields = new Set(Object.keys(eventSchema.attributes));
    for (const fieldName of Object.keys(attributes)) {
      // Allow special metadata fields
      if (fieldName.startsWith('code.') || fieldName === 'description') {
        continue;
      }

      if (!schemaFields.has(fieldName)) {
        // Just a warning, not an error
        // errors.push(`Unexpected field '${fieldName}' not in schema`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get the type of a value
   */
  private getValueType(value: JsonValue): string {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'object';
    return typeof value;
  }

  /**
   * Get event schema for a node
   */
  getNodeSchema(nodeId: string): PVEventSchema | undefined {
    return this.eventSchemasByNode.get(nodeId);
  }

  /**
   * Get event name for a node
   */
  getNodeEventName(nodeId: string): string | undefined {
    const schema = this.eventSchemasByNode.get(nodeId);
    return schema?.name;
  }

  /**
   * Get all event names for a node (including related nodes with same base ID)
   */
  getNodeEventNames(nodeId: string): string[] {
    const baseId = nodeId.replace(/-\d+$/, '');
    const relatedNodeIds = this.nodeIdsByBaseId.get(baseId);

    if (!relatedNodeIds) {
      const schema = this.eventSchemasByNode.get(nodeId);
      return schema ? [schema.name] : [];
    }

    const eventNames: string[] = [];
    for (const id of Array.from(relatedNodeIds)) {
      const schema = this.eventSchemasByNode.get(id);
      if (schema) {
        eventNames.push(schema.name);
      }
    }
    return eventNames;
  }

  /**
   * Check if a node has event schema defined
   * Supports both exact node IDs and base IDs (without numeric suffixes)
   */
  hasSchema(nodeId: string): boolean {
    // Check exact match first
    if (this.eventSchemasByNode.has(nodeId)) {
      return true;
    }

    // Check base ID pattern (e.g., "graph-converter" matches "graph-converter-1", etc.)
    const baseId = nodeId.replace(/-\d+$/, '');
    return this.nodeIdsByBaseId.has(baseId);
  }
}

/**
 * Create a validated event emitter for a specific node
 *
 * @example
 * ```typescript
 * const emit = createValidatedEmitter(validator, 'graph-converter', span);
 *
 * // Type-safe and runtime-validated
 * emit('conversion.started', {
 *   'config.nodeTypes': nodeTypes.length,
 *   'config.edgeTypes': edgeTypes.length
 * });
 * ```
 */
export function createValidatedEmitter(
  validator: EventValidator,
  nodeId: string,
  addEventFn: (eventName: string, attributes: JsonObject) => void,
  options: { strict?: boolean } = {}
): (eventName: string, attributes: JsonObject) => void {
  return (eventName: string, attributes: JsonObject) => {
    // Validate against schema
    const result = validator.validate(nodeId, eventName, attributes);

    if (!result.valid) {
      if (options.strict !== false) {
        // Strict mode: throw on validation errors
        throw new EventValidationError(eventName, nodeId, result.errors);
      } else {
        // Permissive mode: log warnings but allow the event
        console.warn(
          `Event validation warnings for '${eventName}' on node '${nodeId}':`,
          result.errors
        );
      }
    }

    // Emit the event
    addEventFn(eventName, attributes);
  };
}
