import { EventProcessor } from './EventProcessor';
import type { GraphConfiguration, GraphEvent } from './types';

describe('EventProcessor', () => {
  let testConfig: GraphConfiguration;

  beforeEach(() => {
    testConfig = {
      metadata: {
        name: 'Test System',
        version: '1.0.0',
      },
      nodeTypes: {
        user: {
          shape: 'circle',
          color: '#4CAF50',
          dataSchema: {
            userId: { type: 'string', required: true },
            status: { type: 'string' },
          },
          states: {
            online: { color: '#4CAF50', label: 'Online' },
            offline: { color: '#9E9E9E', label: 'Offline' },
          },
        },
        server: {
          shape: 'hexagon',
          color: '#9C27B0',
          dataSchema: {
            uptime: { type: 'number' },
          },
        },
      },
      edgeTypes: {
        connection: {
          style: 'solid',
          directed: true,
        },
      },
      allowedConnections: [{ from: 'user', to: 'server', via: 'connection' }],
    };
  });

  describe('Node Events', () => {
    it('should create a node', () => {
      const processor = new EventProcessor(testConfig);

      const event: GraphEvent = {
        id: 'evt-1',
        type: 'node_created',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'user-1',
          nodeType: 'user',
          data: { userId: 'alice', status: 'online' },
        },
        expected: true,
      };

      const result = processor.processEvent(event);

      expect(result.success).toBe(true);
      expect(result.state.nodes.has('user-1')).toBe(true);

      const node = result.state.nodes.get('user-1');
      expect(node?.type).toBe('user');
      expect(node?.data.userId).toBe('alice');
    });

    it('should update a node', () => {
      const processor = new EventProcessor(testConfig);

      // Create node first
      processor.processEvent({
        id: 'evt-1',
        type: 'node_created',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'user-1',
          nodeType: 'user',
          data: { userId: 'alice', status: 'offline' },
        },
        expected: true,
      });

      // Update node
      const result = processor.processEvent({
        id: 'evt-2',
        type: 'node_updated',
        timestamp: Date.now(),
        category: 'node',
        operation: 'update',
        payload: {
          operation: 'update',
          nodeId: 'user-1',
          nodeType: 'user',
          data: { status: 'online' },
        },
        expected: true,
      });

      expect(result.success).toBe(true);
      const node = result.state.nodes.get('user-1');
      expect(node?.data.status).toBe('online');
      expect(node?.data.userId).toBe('alice'); // Should preserve existing data
    });

    it('should delete a node', () => {
      const processor = new EventProcessor(testConfig);

      // Create node first
      processor.processEvent({
        id: 'evt-1',
        type: 'node_created',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'user-1',
          nodeType: 'user',
          data: { userId: 'alice' },
        },
        expected: true,
      });

      // Delete node
      const result = processor.processEvent({
        id: 'evt-2',
        type: 'node_deleted',
        timestamp: Date.now(),
        category: 'node',
        operation: 'delete',
        payload: {
          operation: 'delete',
          nodeId: 'user-1',
          nodeType: 'user',
        },
        expected: true,
      });

      expect(result.success).toBe(true);
      expect(result.state.nodes.has('user-1')).toBe(false);
    });
  });

  describe('Edge Events', () => {
    it('should create an edge', () => {
      const processor = new EventProcessor(testConfig);

      // Create nodes first
      processor.processEvent({
        id: 'evt-1',
        type: 'node_created',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'user-1',
          nodeType: 'user',
          data: { userId: 'alice' },
        },
        expected: true,
      });

      processor.processEvent({
        id: 'evt-2',
        type: 'node_created',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'server-1',
          nodeType: 'server',
          data: { uptime: 0 },
        },
        expected: true,
      });

      // Create edge
      const result = processor.processEvent({
        id: 'evt-3',
        type: 'edge_created',
        timestamp: Date.now(),
        category: 'edge',
        operation: 'create',
        payload: {
          operation: 'create',
          edgeId: 'conn-1',
          edgeType: 'connection',
          from: 'user-1',
          to: 'server-1',
        },
        expected: true,
      });

      expect(result.success).toBe(true);
      expect(result.state.edges.has('conn-1')).toBe(true);

      const edge = result.state.edges.get('conn-1');
      expect(edge?.from).toBe('user-1');
      expect(edge?.to).toBe('server-1');
      expect(edge?.type).toBe('connection');
    });

    it('should delete an edge', () => {
      const processor = new EventProcessor(testConfig);

      // Create nodes and edge first
      processor.processEvent({
        id: 'evt-1',
        type: 'node_created',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'user-1',
          nodeType: 'user',
          data: { userId: 'alice' },
        },
        expected: true,
      });

      processor.processEvent({
        id: 'evt-2',
        type: 'node_created',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'server-1',
          nodeType: 'server',
          data: { uptime: 0 },
        },
        expected: true,
      });

      processor.processEvent({
        id: 'evt-3',
        type: 'edge_created',
        timestamp: Date.now(),
        category: 'edge',
        operation: 'create',
        payload: {
          operation: 'create',
          edgeId: 'conn-1',
          edgeType: 'connection',
          from: 'user-1',
          to: 'server-1',
        },
        expected: true,
      });

      // Delete edge
      const result = processor.processEvent({
        id: 'evt-4',
        type: 'edge_deleted',
        timestamp: Date.now(),
        category: 'edge',
        operation: 'delete',
        payload: {
          operation: 'delete',
          edgeId: 'conn-1',
          edgeType: 'connection',
          from: 'user-1',
          to: 'server-1',
        },
        expected: true,
      });

      expect(result.success).toBe(true);
      expect(result.state.edges.has('conn-1')).toBe(false);
    });
  });

  describe('State Events', () => {
    it('should update node state', () => {
      const processor = new EventProcessor(testConfig);

      // Create node first
      processor.processEvent({
        id: 'evt-1',
        type: 'node_created',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'user-1',
          nodeType: 'user',
          data: { userId: 'alice' },
        },
        expected: true,
      });

      // Update state
      const result = processor.processEvent({
        id: 'evt-2',
        type: 'state_changed',
        timestamp: Date.now(),
        category: 'state',
        operation: 'update',
        payload: {
          nodeId: 'user-1',
          newState: 'online',
        },
        expected: true,
      });

      expect(result.success).toBe(true);
      const node = result.state.nodes.get('user-1');
      expect(node?.state).toBe('online');
    });
  });

  describe('System Events', () => {
    it('should reset the graph state', () => {
      const processor = new EventProcessor(testConfig);

      // Create some nodes
      processor.processEvent({
        id: 'evt-1',
        type: 'node_created',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'user-1',
          nodeType: 'user',
          data: { userId: 'alice' },
        },
        expected: true,
      });

      // Reset
      const result = processor.processEvent({
        id: 'evt-2',
        type: 'system_reset',
        timestamp: Date.now(),
        category: 'system',
        operation: 'update',
        payload: {
          action: 'reset',
        },
        expected: true,
      });

      expect(result.success).toBe(true);
      expect(result.state.nodes.size).toBe(0);
      expect(result.state.edges.size).toBe(0);
    });
  });

  describe('Event History', () => {
    it('should track event history', () => {
      const processor = new EventProcessor(testConfig);

      processor.processEvent({
        id: 'evt-1',
        type: 'node_created',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'user-1',
          nodeType: 'user',
          data: { userId: 'alice' },
        },
        expected: true,
      });

      processor.processEvent({
        id: 'evt-2',
        type: 'node_created',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'user-2',
          nodeType: 'user',
          data: { userId: 'bob' },
        },
        expected: true,
      });

      const history = processor.getEventHistory();
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('evt-1');
      expect(history[1].id).toBe('evt-2');
    });
  });
});
