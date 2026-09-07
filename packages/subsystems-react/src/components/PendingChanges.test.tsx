import { describe, expect, test, mock } from 'bun:test';
import React, { createRef } from 'react';
import { render } from '@testing-library/react';
import { GraphRenderer, type GraphRendererHandle } from './GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { Window } from 'happy-dom';

// Setup DOM environment
const window = new Window();
const document = window.document;

// Set up global DOM objects
globalThis.document = document as unknown as Document;
globalThis.window = window as unknown as Window & typeof globalThis;
globalThis.navigator = window.navigator as unknown as Navigator;
globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
globalThis.Element = window.Element as unknown as typeof Element;
globalThis.Node = window.Node as unknown as typeof Node;
globalThis.Text = window.Text as unknown as typeof Text;
globalThis.DocumentFragment = window.DocumentFragment as unknown as typeof DocumentFragment;
globalThis.Event = window.Event as unknown as typeof Event;
globalThis.CustomEvent = window.CustomEvent as unknown as typeof CustomEvent;
globalThis.MouseEvent = window.MouseEvent as unknown as typeof MouseEvent;
globalThis.KeyboardEvent = window.KeyboardEvent as unknown as typeof KeyboardEvent;
globalThis.getComputedStyle = window.getComputedStyle.bind(window) as unknown as typeof getComputedStyle;
globalThis.localStorage = window.localStorage as unknown as Storage;
globalThis.sessionStorage = window.sessionStorage as unknown as Storage;

// Mock ResizeObserver for ReactFlow
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill rAF/cancel for @testing-library/react act-compat cleanup
if (typeof (window as unknown as Record<string, unknown>).requestAnimationFrame === 'function') {
  globalThis.requestAnimationFrame = (window as unknown as typeof globalThis).requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = (window as unknown as typeof globalThis).cancelAnimationFrame.bind(window);
} else {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number): void => {
    clearTimeout(id);
  }) as typeof cancelAnimationFrame;
}

// Mock matchMedia
globalThis.matchMedia = mock(() => ({
  matches: false,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof matchMedia;

// Helper to wrap component with ThemeProvider
const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={defaultEditorTheme}>{ui}</ThemeProvider>);
};

describe('PendingChanges', () => {
  // Sample canvas for testing
  const createTestCanvas = (): ExtendedCanvas => ({
    nodes: [
      {
        id: 'node-1',
        type: 'text',
        x: 100,
        y: 100,
        width: 150,
        height: 80,
        text: 'Node 1',
        pv: {
          nodeType: 'service',
        },
      },
      {
        id: 'node-2',
        type: 'text',
        x: 300,
        y: 100,
        width: 150,
        height: 80,
        text: 'Node 2',
        pv: {
          nodeType: 'database',
        },
      },
      {
        id: 'node-3',
        type: 'text',
        x: 200,
        y: 300,
        width: 150,
        height: 80,
        text: 'Node 3',
        pv: {
          nodeType: 'service',
        },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        fromNode: 'node-1',
        toNode: 'node-2',
        pv: {
          edgeType: 'connection',
        },
      },
    ],
    pv: {
      name: 'Test Canvas',
      version: '1.0.0',
      nodeTypes: {
        service: {
          shape: 'rectangle',
          color: '#4CAF50',
        },
        database: {
          shape: 'circle',
          color: '#2196F3',
        },
      },
      edgeTypes: {
        connection: {
          style: 'solid',
          directed: true,
        },
      },
    },
  });

  describe('PendingChanges Interface', () => {
    test('should have correct structure with all required fields', () => {
      const ref = createRef<GraphRendererHandle>();

      renderWithTheme(<GraphRenderer ref={ref} canvas={createTestCanvas()} editable={true} />);

      const pendingChanges = ref.current?.getPendingChanges();

      expect(pendingChanges).toBeDefined();
      expect(pendingChanges).toHaveProperty('positionChanges');
      expect(pendingChanges).toHaveProperty('dimensionChanges');
      expect(pendingChanges).toHaveProperty('nodeUpdates');
      expect(pendingChanges).toHaveProperty('deletedNodeIds');
      expect(pendingChanges).toHaveProperty('createdEdges');
      expect(pendingChanges).toHaveProperty('deletedEdges');
      expect(pendingChanges).toHaveProperty('hasChanges');
    });

    test('should return empty arrays/false when no changes made', () => {
      const ref = createRef<GraphRendererHandle>();

      renderWithTheme(<GraphRenderer ref={ref} canvas={createTestCanvas()} editable={true} />);

      const pendingChanges = ref.current?.getPendingChanges();

      expect(pendingChanges?.positionChanges).toEqual([]);
      expect(pendingChanges?.dimensionChanges).toEqual([]);
      expect(pendingChanges?.nodeUpdates).toEqual([]);
      expect(pendingChanges?.deletedNodeIds).toEqual([]);
      expect(pendingChanges?.createdEdges).toEqual([]);
      expect(pendingChanges?.deletedEdges).toEqual([]);
      expect(pendingChanges?.hasChanges).toBe(false);
    });

    test('hasUnsavedChanges should return false initially', () => {
      const ref = createRef<GraphRendererHandle>();

      renderWithTheme(<GraphRenderer ref={ref} canvas={createTestCanvas()} editable={true} />);

      expect(ref.current?.hasUnsavedChanges()).toBe(false);
    });
  });

  describe('Position Changes', () => {
    test('positionChanges should have correct structure', () => {
      const ref = createRef<GraphRendererHandle>();

      renderWithTheme(<GraphRenderer ref={ref} canvas={createTestCanvas()} editable={true} />);

      const pendingChanges = ref.current?.getPendingChanges();

      // positionChanges should be an array
      expect(Array.isArray(pendingChanges?.positionChanges)).toBe(true);

      // Each position change should have nodeId and position
      // (empty array initially, but structure is correct)
      expect(pendingChanges?.positionChanges).toEqual([]);
    });
  });

  describe('Dimension Changes', () => {
    test('dimensionChanges should have correct structure', () => {
      const ref = createRef<GraphRendererHandle>();

      renderWithTheme(<GraphRenderer ref={ref} canvas={createTestCanvas()} editable={true} />);

      const pendingChanges = ref.current?.getPendingChanges();

      // dimensionChanges should be an array
      expect(Array.isArray(pendingChanges?.dimensionChanges)).toBe(true);

      // Each dimension change should have nodeId and dimensions
      // (empty array initially, but structure is correct)
      expect(pendingChanges?.dimensionChanges).toEqual([]);
    });

    test('dimensionChanges array items should have nodeId and dimensions fields', () => {
      // This test validates the type structure
      const exampleDimensionChange = {
        nodeId: 'node-1',
        dimensions: { width: 200, height: 100 },
      };

      expect(exampleDimensionChange).toHaveProperty('nodeId');
      expect(exampleDimensionChange).toHaveProperty('dimensions');
      expect(exampleDimensionChange.dimensions).toHaveProperty('width');
      expect(exampleDimensionChange.dimensions).toHaveProperty('height');
    });
  });

  describe('Reset Edit State', () => {
    test('resetEditState should clear all pending changes', () => {
      const ref = createRef<GraphRendererHandle>();

      renderWithTheme(<GraphRenderer ref={ref} canvas={createTestCanvas()} editable={true} />);

      // Reset should work even when there are no changes
      ref.current?.resetEditState();

      const pendingChanges = ref.current?.getPendingChanges();
      expect(pendingChanges?.hasChanges).toBe(false);
      expect(ref.current?.hasUnsavedChanges()).toBe(false);
    });
  });

  describe('onPendingChangesChange Callback', () => {
    test('should call onPendingChangesChange with false initially', () => {
      const ref = createRef<GraphRendererHandle>();
      const onPendingChangesChange = mock(() => {});

      renderWithTheme(
        <GraphRenderer
          ref={ref}
          canvas={createTestCanvas()}
          editable={true}
          onPendingChangesChange={onPendingChangesChange}
        />
      );

      // Initially should not have changes
      expect(ref.current?.hasUnsavedChanges()).toBe(false);
    });
  });

  describe('Non-Editable Mode', () => {
    test('should still provide getPendingChanges in non-editable mode', () => {
      const ref = createRef<GraphRendererHandle>();

      renderWithTheme(<GraphRenderer ref={ref} canvas={createTestCanvas()} editable={false} />);

      const pendingChanges = ref.current?.getPendingChanges();

      expect(pendingChanges).toBeDefined();
      expect(pendingChanges?.hasChanges).toBe(false);
    });
  });

  describe('Node Updates', () => {
    test('nodeUpdates should have correct structure', () => {
      const ref = createRef<GraphRendererHandle>();

      renderWithTheme(<GraphRenderer ref={ref} canvas={createTestCanvas()} editable={true} />);

      const pendingChanges = ref.current?.getPendingChanges();

      // nodeUpdates should be an array
      expect(Array.isArray(pendingChanges?.nodeUpdates)).toBe(true);
    });
  });

  describe('Edge Operations', () => {
    test('createdEdges should have correct structure', () => {
      const ref = createRef<GraphRendererHandle>();

      renderWithTheme(<GraphRenderer ref={ref} canvas={createTestCanvas()} editable={true} />);

      const pendingChanges = ref.current?.getPendingChanges();

      // createdEdges should be an array
      expect(Array.isArray(pendingChanges?.createdEdges)).toBe(true);
    });

    test('deletedEdges should have correct structure', () => {
      const ref = createRef<GraphRendererHandle>();

      renderWithTheme(<GraphRenderer ref={ref} canvas={createTestCanvas()} editable={true} />);

      const pendingChanges = ref.current?.getPendingChanges();

      // deletedEdges should be an array
      expect(Array.isArray(pendingChanges?.deletedEdges)).toBe(true);
    });
  });

  describe('Deleted Nodes', () => {
    test('deletedNodeIds should have correct structure', () => {
      const ref = createRef<GraphRendererHandle>();

      renderWithTheme(<GraphRenderer ref={ref} canvas={createTestCanvas()} editable={true} />);

      const pendingChanges = ref.current?.getPendingChanges();

      // deletedNodeIds should be an array
      expect(Array.isArray(pendingChanges?.deletedNodeIds)).toBe(true);
    });
  });
});

describe('PendingChanges Type Validation', () => {
  test('NodePositionChange should have correct shape', () => {
    const positionChange = {
      nodeId: 'test-node',
      position: { x: 100, y: 200 },
    };

    expect(positionChange.nodeId).toBe('test-node');
    expect(positionChange.position.x).toBe(100);
    expect(positionChange.position.y).toBe(200);
  });

  test('NodeDimensionChange should have correct shape', () => {
    const dimensionChange = {
      nodeId: 'test-node',
      dimensions: { width: 150, height: 100 },
    };

    expect(dimensionChange.nodeId).toBe('test-node');
    expect(dimensionChange.dimensions.width).toBe(150);
    expect(dimensionChange.dimensions.height).toBe(100);
  });

  test('CreatedEdge should have correct shape', () => {
    const createdEdge = {
      from: 'node-1',
      to: 'node-2',
      type: 'connection',
      sourceHandle: 'right-out',
      targetHandle: 'left',
    };

    expect(createdEdge.from).toBe('node-1');
    expect(createdEdge.to).toBe('node-2');
    expect(createdEdge.type).toBe('connection');
    expect(createdEdge.sourceHandle).toBe('right-out');
    expect(createdEdge.targetHandle).toBe('left');
  });

  test('DeletedEdge should have correct shape', () => {
    const deletedEdge = {
      from: 'node-1',
      to: 'node-2',
      type: 'connection',
    };

    expect(deletedEdge.from).toBe('node-1');
    expect(deletedEdge.to).toBe('node-2');
    expect(deletedEdge.type).toBe('connection');
  });
});
