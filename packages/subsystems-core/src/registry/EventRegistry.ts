/**
 * EventRegistry - indexes events across library and canvases
 *
 * Provides a centralized registry for looking up where events are defined,
 * enabling improved validation error messages with actionable suggestions.
 */

import type { ComponentLibrary } from '../types/library';
import type { ExtendedCanvas, PVEventSchema } from '../types/canvas';
import { isOtelEventNode, isStandardCanvasNode } from '../types/canvas';

/**
 * Describes where an event is defined
 */
export interface EventSource {
  /** Whether the event is defined in the library or a canvas */
  type: 'library' | 'canvas';
  /** Path to the source file (library.yaml path or canvas path) */
  path: string;
  /** The full event schema if available */
  eventSchema?: PVEventSchema;
}

/**
 * EventRegistry indexes all events across a library and set of canvases.
 *
 * Build order (priority):
 * 1. Library eventSchemas (the intended sharing mechanism)
 * 2. Canvas inline events (pv.event)
 * 3. Canvas eventRefs (pv.eventRef) - these reference library schemas
 *
 * Usage:
 * ```typescript
 * const registry = EventRegistry.build(library, canvases, libraryPath);
 * const sources = registry.findEvent('cleanup.started');
 * if (sources.length > 0) {
 *   // Event found - provide helpful error message
 * }
 * ```
 */
export class EventRegistry {
  private events: Map<string, EventSource[]>;

  private constructor() {
    this.events = new Map();
  }

  /**
   * Build an EventRegistry from a library and set of canvases.
   *
   * @param library - The component library (may be undefined)
   * @param canvases - Map of canvas path to parsed canvas
   * @param libraryPath - Path to the library file (for error messages)
   * @returns A populated EventRegistry
   */
  static build(
    library: ComponentLibrary | undefined,
    canvases: Map<string, ExtendedCanvas>,
    libraryPath?: string
  ): EventRegistry {
    const registry = new EventRegistry();

    // 1. Index library eventSchemas first (priority source)
    if (library?.eventSchemas) {
      const libPath = libraryPath ?? 'library.yaml';
      for (const [eventName, schema] of Object.entries(library.eventSchemas)) {
        const fullSchema: PVEventSchema = {
          name: eventName,
          description: schema.description,
          attributes: schema.attributes,
        };
        registry.addEvent(eventName, {
          type: 'library',
          path: libPath,
          eventSchema: fullSchema,
        });
      }
    }

    // 2. Index canvas events
    for (const [canvasPath, canvas] of canvases) {
      if (!canvas.nodes) continue;

      for (const node of canvas.nodes) {
        // Handle OTEL event nodes (top-level event/eventRef)
        if (isOtelEventNode(node)) {
          // Inline event definition
          if (node.event && typeof node.event === 'object' && node.event.name) {
            registry.addEvent(node.event.name, {
              type: 'canvas',
              path: canvasPath,
              eventSchema: node.event,
            });
          }

          // Event reference
          if (node.eventRef && typeof node.eventRef === 'string') {
            // Only add if not already in registry (library takes priority)
            if (!registry.hasEvent(node.eventRef)) {
              registry.addEvent(node.eventRef, {
                type: 'canvas',
                path: canvasPath,
                // No schema available - it's just a reference
              });
            }
          }
        }
        // Handle standard nodes with pv.event/pv.eventRef
        else if (isStandardCanvasNode(node) && node.pv) {
          // Inline event definition (pv.event)
          if (node.pv.event && typeof node.pv.event === 'object' && node.pv.event.name) {
            registry.addEvent(node.pv.event.name, {
              type: 'canvas',
              path: canvasPath,
              eventSchema: node.pv.event,
            });
          }

          // Event reference (pv.eventRef)
          if (node.pv.eventRef && typeof node.pv.eventRef === 'string') {
            // Only add if not already in registry (library takes priority)
            if (!registry.hasEvent(node.pv.eventRef)) {
              registry.addEvent(node.pv.eventRef, {
                type: 'canvas',
                path: canvasPath,
                // No schema available - it's just a reference
              });
            }
          }
        }
      }
    }

    return registry;
  }

  /**
   * Add an event source to the registry
   */
  private addEvent(eventName: string, source: EventSource): void {
    const existing = this.events.get(eventName) ?? [];
    // Avoid duplicate entries for the same path
    if (!existing.some((s) => s.path === source.path && s.type === source.type)) {
      existing.push(source);
      this.events.set(eventName, existing);
    }
  }

  /**
   * Find all sources where an event is defined.
   * Returns library sources first, then canvas sources.
   *
   * @param eventName - The event name to look up
   * @returns Array of EventSource objects, empty if not found
   */
  findEvent(eventName: string): EventSource[] {
    const sources = this.events.get(eventName) ?? [];
    // Sort: library sources first, then canvases alphabetically
    return [...sources].sort((a, b) => {
      if (a.type === 'library' && b.type !== 'library') return -1;
      if (a.type !== 'library' && b.type === 'library') return 1;
      return a.path.localeCompare(b.path);
    });
  }

  /**
   * Check if an event exists anywhere in the registry.
   *
   * @param eventName - The event name to check
   * @returns true if the event is defined somewhere
   */
  hasEvent(eventName: string): boolean {
    return this.events.has(eventName);
  }

  /**
   * Get all known event names in the registry.
   *
   * @returns Array of event names, sorted alphabetically
   */
  getAllEventNames(): string[] {
    return [...this.events.keys()].sort();
  }

  /**
   * Get the count of registered events.
   */
  get size(): number {
    return this.events.size;
  }
}
