import { describe, expect, test, afterAll } from 'bun:test';
import { GraphConverter } from './GraphConverter';
import type { PathBasedGraphConfiguration } from '../types/path-based-config';
import {
  startTestSpan,
  addEvent,
  endSpan,
  markTestPassed,
  markTestFailed,
  exportSpans,
} from '../../test/otel-setup';

describe('GraphConverter', () => {
  // Export spans after all tests complete
  afterAll(() => {
    exportSpans('graph-converter-test-execution.json');
  });

  test('should convert simple config to nodes and edges', () => {
    const testSpan = startTestSpan('should convert simple config to nodes and edges', {
      'test.file': 'GraphConverter.test.ts',
      'test.suite': 'GraphConverter',
    });

    try {
      // Setup - record as event
      addEvent(testSpan, 'setup.started', {
        description: 'Creating test configuration with 2 nodes and 1 edge',
      });

      const config: PathBasedGraphConfiguration = {
        metadata: {
          name: 'Test Config',
          version: '1.0.0',
        },
        nodeTypes: {
          'node-a': {
            shape: 'circle',
            icon: 'user',
            color: '#3b82f6',
            dataSchema: {},
          },
          'node-b': {
            shape: 'rectangle',
            icon: 'server',
            color: '#8b5cf6',
            dataSchema: {},
          },
        },
        edgeTypes: {
          connection: {
            style: 'solid',
            color: '#64748b',
            width: 2,
            directed: true,
          },
        },
        allowedConnections: [
          {
            from: 'node-a',
            to: 'node-b',
            via: 'connection',
          },
        ],
      };

      addEvent(testSpan, 'setup.complete', {
        'config.nodes': 2,
        'config.edges': 1,
      });

      // Execution - record as event
      // Note: execution happens in GraphConverter.ts, not the test file
      addEvent(testSpan, 'execution.started', {
        action: 'GraphConverter.configToGraph()',
        'code.filepath': 'GraphConverter.ts', // Override: code under test
        'code.lineno': 15,
      });

      const result = GraphConverter.configToGraph(config);

      addEvent(testSpan, 'execution.complete', {
        'result.nodes.count': result.nodes.length,
        'result.edges.count': result.edges.length,
        'code.filepath': 'GraphConverter.ts', // Override: code under test
        'code.lineno': 43,
      });

      // Assertions - record as event
      addEvent(testSpan, 'assertion.started', {
        assertions: 'Verifying nodes and edges structure',
      });

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);

      // Check nodes
      expect(result.nodes[0].id).toBe('node-a');
      expect(result.nodes[0].type).toBe('node-a');
      expect(result.nodes[0].data.shape).toBe('circle');
      expect(result.nodes[0].data.icon).toBe('user');

      expect(result.nodes[1].id).toBe('node-b');
      expect(result.nodes[1].type).toBe('node-b');
      expect(result.nodes[1].data.shape).toBe('rectangle');

      // Check edges
      expect(result.edges[0].from).toBe('node-a');
      expect(result.edges[0].to).toBe('node-b');
      expect(result.edges[0].type).toBe('connection');
      expect(result.edges[0].data.style).toBe('solid');

      addEvent(testSpan, 'assertion.complete', {
        'assertions.passed': 11,
        'assertions.failed': 0,
      });

      markTestPassed(testSpan);
    } catch (error) {
      addEvent(testSpan, 'test.failed', {
        error: (error as Error).message,
      });
      markTestFailed(testSpan, error as Error);
      throw error;
    } finally {
      endSpan(testSpan);
    }
  });

  test('should extract manual positions from node types', () => {
    const testSpan = startTestSpan('should extract manual positions from node types', {
      'test.file': 'GraphConverter.test.ts',
      'test.suite': 'GraphConverter',
    });

    try {
      addEvent(testSpan, 'setup.started', {
        description: 'Creating config with manual node positions',
      });

      const config: PathBasedGraphConfiguration = {
        metadata: {
          name: 'Test Config',
          version: '1.0.0',
        },
        nodeTypes: {
          'node-a': {
            shape: 'circle',
            color: '#3b82f6',
            dataSchema: {},
            position: { x: 100, y: 200 },
          },
          'node-b': {
            shape: 'rectangle',
            color: '#8b5cf6',
            dataSchema: {},
            position: { x: 300, y: 400 },
          },
        },
        edgeTypes: {},
        allowedConnections: [],
      };

      addEvent(testSpan, 'setup.complete', {
        'config.nodes': 2,
        'positions.defined': true,
      });

      addEvent(testSpan, 'execution.started', {
        action: 'GraphConverter.configToGraph()',
        'code.filepath': 'GraphConverter.ts',
        'code.lineno': 15,
      });

      const result = GraphConverter.configToGraph(config);

      addEvent(testSpan, 'execution.complete', {
        'result.nodes.count': result.nodes.length,
        'code.filepath': 'GraphConverter.ts',
        'code.lineno': 43,
      });

      addEvent(testSpan, 'assertion.started', {
        assertions: 'Verifying positions preserved',
      });

      expect(result.nodes[0].position).toEqual({ x: 100, y: 200 });
      expect(result.nodes[1].position).toEqual({ x: 300, y: 400 });

      addEvent(testSpan, 'assertion.complete', {
        'assertions.passed': 2,
        'assertions.failed': 0,
      });

      markTestPassed(testSpan);
    } catch (error) {
      addEvent(testSpan, 'test.failed', {
        error: (error as Error).message,
      });
      markTestFailed(testSpan, error as Error);
      throw error;
    } finally {
      endSpan(testSpan);
    }
  });

  test('should handle nodes without positions', () => {
    const testSpan = startTestSpan('should handle nodes without positions', {
      'test.file': 'GraphConverter.test.ts',
      'test.suite': 'GraphConverter',
    });

    try {
      addEvent(testSpan, 'setup.started', {
        description: 'Creating config without positions',
      });

      const config: PathBasedGraphConfiguration = {
        metadata: {
          name: 'Test Config',
          version: '1.0.0',
        },
        nodeTypes: {
          'node-a': {
            shape: 'circle',
            color: '#3b82f6',
            dataSchema: {},
          },
        },
        edgeTypes: {},
        allowedConnections: [],
      };

      addEvent(testSpan, 'setup.complete', {
        'config.nodes': 1,
        'positions.defined': false,
      });

      addEvent(testSpan, 'execution.started', {
        action: 'GraphConverter.configToGraph()',
        'code.filepath': 'GraphConverter.ts',
        'code.lineno': 15,
      });

      const result = GraphConverter.configToGraph(config);

      addEvent(testSpan, 'execution.complete', {
        'result.nodes.count': result.nodes.length,
        'code.filepath': 'GraphConverter.ts',
        'code.lineno': 43,
      });

      addEvent(testSpan, 'assertion.started', {
        assertions: 'Verifying position is undefined',
      });

      expect(result.nodes[0].position).toBeUndefined();

      addEvent(testSpan, 'assertion.complete', {
        'assertions.passed': 1,
        'assertions.failed': 0,
      });

      markTestPassed(testSpan);
    } catch (error) {
      addEvent(testSpan, 'test.failed', {
        error: (error as Error).message,
      });
      markTestFailed(testSpan, error as Error);
      throw error;
    } finally {
      endSpan(testSpan);
    }
  });

  test('should handle edge animation config', () => {
    const config: PathBasedGraphConfiguration = {
      metadata: {
        name: 'Test Config',
        version: '1.0.0',
      },
      nodeTypes: {
        'node-a': {
          shape: 'circle',
          color: '#3b82f6',
          dataSchema: {},
        },
        'node-b': {
          shape: 'rectangle',
          color: '#8b5cf6',
          dataSchema: {},
        },
      },
      edgeTypes: {
        'animated-flow': {
          style: 'solid',
          color: '#3b82f6',
          width: 3,
          animation: {
            type: 'flow',
            duration: 1500,
            color: '#60a5fa',
          },
        },
      },
      allowedConnections: [
        {
          from: 'node-a',
          to: 'node-b',
          via: 'animated-flow',
        },
      ],
    };

    const result = GraphConverter.configToGraph(config);

    expect(result.edges[0].data.animation).toBeDefined();
    expect(result.edges[0].data.animation?.type).toBe('flow');
    expect(result.edges[0].data.animation?.duration).toBe(1500);
    expect(result.edges[0].data.animation?.color).toBe('#60a5fa');
  });
});
