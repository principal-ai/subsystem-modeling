/**
 * Tests for EventRegistry
 */

import { EventRegistry } from './EventRegistry';
import type { ExtendedCanvas } from '../types/canvas';
import type { ComponentLibrary } from '../types/library';

describe('EventRegistry', () => {
  // ============================================================================
  // Helper Functions
  // ============================================================================

  function createLibrary(eventSchemas: Record<string, { description: string; attributes: Record<string, unknown> }>): ComponentLibrary {
    return {
      version: '1.0.0',
      name: 'Test Library',
      nodeComponents: {},
      edgeComponents: {},
      eventSchemas,
    };
  }

  function createCanvas(events: Array<{ nodeId: string; event?: { name: string }; eventRef?: string }>): ExtendedCanvas {
    return {
      nodes: events.map(({ nodeId, event, eventRef }) => ({
        id: nodeId,
        type: 'text' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: nodeId,
        pv: {
          nodeType: 'test',
          ...(event ? { event: { ...event, description: 'Test event', attributes: {} } } : {}),
          ...(eventRef ? { eventRef } : {}),
        },
      })),
      edges: [],
      pv: {
        version: '1.0.0',
        name: 'Test Canvas',
      },
    };
  }

  // ============================================================================
  // Basic Building Tests
  // ============================================================================

  describe('build', () => {
    it('should build an empty registry when no library or canvases provided', () => {
      const registry = EventRegistry.build(undefined, new Map());

      expect(registry.size).toBe(0);
      expect(registry.getAllEventNames()).toEqual([]);
    });

    it('should index events from library eventSchemas', () => {
      const library = createLibrary({
        'auth.started': { description: 'Auth started', attributes: {} },
        'auth.completed': { description: 'Auth completed', attributes: {} },
      });

      const registry = EventRegistry.build(library, new Map(), 'library.yaml');

      expect(registry.size).toBe(2);
      expect(registry.hasEvent('auth.started')).toBe(true);
      expect(registry.hasEvent('auth.completed')).toBe(true);
    });

    it('should index inline events from canvases', () => {
      const canvas = createCanvas([
        { nodeId: 'node1', event: { name: 'task.created' } },
        { nodeId: 'node2', event: { name: 'task.updated' } },
      ]);

      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('tasks.otel.canvas', canvas);

      const registry = EventRegistry.build(undefined, canvases);

      expect(registry.size).toBe(2);
      expect(registry.hasEvent('task.created')).toBe(true);
      expect(registry.hasEvent('task.updated')).toBe(true);
    });

    it('should index eventRef from canvases', () => {
      const canvas = createCanvas([
        { nodeId: 'node1', eventRef: 'auth.started' },
        { nodeId: 'node2', eventRef: 'auth.completed' },
      ]);

      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('auth.otel.canvas', canvas);

      const registry = EventRegistry.build(undefined, canvases);

      expect(registry.size).toBe(2);
      expect(registry.hasEvent('auth.started')).toBe(true);
      expect(registry.hasEvent('auth.completed')).toBe(true);
    });

    it('should prioritize library events over canvas eventRefs', () => {
      const library = createLibrary({
        'shared.event': { description: 'From library', attributes: {} },
      });

      const canvas = createCanvas([
        { nodeId: 'node1', eventRef: 'shared.event' },
      ]);

      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('test.otel.canvas', canvas);

      const registry = EventRegistry.build(library, canvases, 'library.yaml');

      // Should only have one entry (library takes precedence)
      const sources = registry.findEvent('shared.event');
      expect(sources).toHaveLength(1);
      expect(sources[0].type).toBe('library');
    });

    it('should track events from multiple canvases', () => {
      const canvas1 = createCanvas([
        { nodeId: 'node1', event: { name: 'canvas1.event' } },
      ]);
      const canvas2 = createCanvas([
        { nodeId: 'node2', event: { name: 'canvas2.event' } },
      ]);

      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('canvas1.otel.canvas', canvas1);
      canvases.set('canvas2.otel.canvas', canvas2);

      const registry = EventRegistry.build(undefined, canvases);

      expect(registry.size).toBe(2);
      expect(registry.hasEvent('canvas1.event')).toBe(true);
      expect(registry.hasEvent('canvas2.event')).toBe(true);
    });
  });

  // ============================================================================
  // findEvent Tests
  // ============================================================================

  describe('findEvent', () => {
    it('should return empty array for non-existent event', () => {
      const registry = EventRegistry.build(undefined, new Map());

      expect(registry.findEvent('nonexistent.event')).toEqual([]);
    });

    it('should return library source for library events', () => {
      const library = createLibrary({
        'auth.started': { description: 'Auth started', attributes: {} },
      });

      const registry = EventRegistry.build(library, new Map(), 'path/to/library.yaml');

      const sources = registry.findEvent('auth.started');
      expect(sources).toHaveLength(1);
      expect(sources[0]).toEqual({
        type: 'library',
        path: 'path/to/library.yaml',
        eventSchema: {
          name: 'auth.started',
          description: 'Auth started',
          attributes: {},
        },
      });
    });

    it('should return canvas source for canvas events', () => {
      const canvas = createCanvas([
        { nodeId: 'node1', event: { name: 'task.created' } },
      ]);

      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('tasks.otel.canvas', canvas);

      const registry = EventRegistry.build(undefined, canvases);

      const sources = registry.findEvent('task.created');
      expect(sources).toHaveLength(1);
      expect(sources[0].type).toBe('canvas');
      expect(sources[0].path).toBe('tasks.otel.canvas');
    });

    it('should return library sources first when event exists in both', () => {
      const library = createLibrary({
        'shared.event': { description: 'From library', attributes: {} },
      });

      // Canvas with inline event (same name as library)
      const canvas = createCanvas([
        { nodeId: 'node1', event: { name: 'shared.event' } },
      ]);

      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('test.otel.canvas', canvas);

      const registry = EventRegistry.build(library, canvases, 'library.yaml');

      const sources = registry.findEvent('shared.event');
      expect(sources.length).toBeGreaterThan(0);
      expect(sources[0].type).toBe('library'); // Library comes first
    });

    it('should sort canvas sources alphabetically', () => {
      const canvasZ = createCanvas([{ nodeId: 'n1', event: { name: 'shared.event' } }]);
      const canvasA = createCanvas([{ nodeId: 'n2', event: { name: 'shared.event' } }]);

      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('z-canvas.otel.canvas', canvasZ);
      canvases.set('a-canvas.otel.canvas', canvasA);

      const registry = EventRegistry.build(undefined, canvases);

      const sources = registry.findEvent('shared.event');
      expect(sources).toHaveLength(2);
      expect(sources[0].path).toBe('a-canvas.otel.canvas');
      expect(sources[1].path).toBe('z-canvas.otel.canvas');
    });
  });

  // ============================================================================
  // hasEvent Tests
  // ============================================================================

  describe('hasEvent', () => {
    it('should return false for non-existent event', () => {
      const registry = EventRegistry.build(undefined, new Map());

      expect(registry.hasEvent('nonexistent')).toBe(false);
    });

    it('should return true for existing library event', () => {
      const library = createLibrary({
        'auth.started': { description: 'Auth started', attributes: {} },
      });

      const registry = EventRegistry.build(library, new Map());

      expect(registry.hasEvent('auth.started')).toBe(true);
    });

    it('should return true for existing canvas event', () => {
      const canvas = createCanvas([
        { nodeId: 'node1', event: { name: 'task.created' } },
      ]);

      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('tasks.otel.canvas', canvas);

      const registry = EventRegistry.build(undefined, canvases);

      expect(registry.hasEvent('task.created')).toBe(true);
    });
  });

  // ============================================================================
  // getAllEventNames Tests
  // ============================================================================

  describe('getAllEventNames', () => {
    it('should return empty array for empty registry', () => {
      const registry = EventRegistry.build(undefined, new Map());

      expect(registry.getAllEventNames()).toEqual([]);
    });

    it('should return sorted event names', () => {
      const library = createLibrary({
        'zebra.event': { description: 'Z event', attributes: {} },
        'alpha.event': { description: 'A event', attributes: {} },
        'beta.event': { description: 'B event', attributes: {} },
      });

      const registry = EventRegistry.build(library, new Map());

      expect(registry.getAllEventNames()).toEqual([
        'alpha.event',
        'beta.event',
        'zebra.event',
      ]);
    });

    it('should include events from both library and canvases', () => {
      const library = createLibrary({
        'library.event': { description: 'From library', attributes: {} },
      });

      const canvas = createCanvas([
        { nodeId: 'node1', event: { name: 'canvas.event' } },
      ]);

      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('test.otel.canvas', canvas);

      const registry = EventRegistry.build(library, canvases);

      const names = registry.getAllEventNames();
      expect(names).toContain('library.event');
      expect(names).toContain('canvas.event');
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle canvas with no nodes', () => {
      const canvas: ExtendedCanvas = {
        nodes: [],
        edges: [],
        pv: { version: '1.0.0', name: 'Empty Canvas' },
      };

      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('empty.otel.canvas', canvas);

      const registry = EventRegistry.build(undefined, canvases);

      expect(registry.size).toBe(0);
    });

    it('should handle canvas with nodes without pv extension', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node1',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            text: 'No PV',
            // No pv field
          },
        ],
        edges: [],
        pv: { version: '1.0.0', name: 'Canvas' },
      };

      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('test.otel.canvas', canvas);

      const registry = EventRegistry.build(undefined, canvases);

      expect(registry.size).toBe(0);
    });

    it('should handle library without eventSchemas', () => {
      const library: ComponentLibrary = {
        version: '1.0.0',
        name: 'No Events Library',
        nodeComponents: {},
        edgeComponents: {},
        // No eventSchemas
      };

      const registry = EventRegistry.build(library, new Map());

      expect(registry.size).toBe(0);
    });

    it('should not duplicate events from same canvas', () => {
      const canvas = createCanvas([
        { nodeId: 'node1', event: { name: 'duplicate.event' } },
        { nodeId: 'node2', event: { name: 'duplicate.event' } },
      ]);

      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('test.otel.canvas', canvas);

      const registry = EventRegistry.build(undefined, canvases);

      const sources = registry.findEvent('duplicate.event');
      // Should only have one entry for this canvas
      expect(sources).toHaveLength(1);
    });
  });
});
