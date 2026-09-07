import { GraphInstrumentationHelper } from './GraphInstrumentationHelper';
import type {
  GraphConfiguration,
  GraphEvent,
  NodeEvent,
  EdgeEvent,
  StateEvent,
  SystemEvent,
} from '../types';

type EventPayload = NodeEvent | EdgeEvent | StateEvent | SystemEvent;

describe('GraphInstrumentationHelper', () => {
  let testConfig: GraphConfiguration;
  let capturedEvents: GraphEvent[];

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

    capturedEvents = [];
  });

  describe('Event Emission', () => {
    it('should emit events through callback', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      helper.emitNodeCreated('user-1', 'user', { userId: 'alice' });

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].type).toBe('node_created');
    });

    it('should allow setting event emitter after construction', () => {
      const helper = new GraphInstrumentationHelper(testConfig);

      helper.setEventEmitter((event) => {
        capturedEvents.push(event);
      });

      helper.emitNodeCreated('user-1', 'user', { userId: 'alice' });

      expect(capturedEvents).toHaveLength(1);
    });
  });

  describe('Node Event Helpers', () => {
    it('should emit node created event', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitNodeCreated('user-1', 'user', { userId: 'alice' });

      expect(event.category).toBe('node');
      expect(event.operation).toBe('create');
      expect(event.type).toBe('node_created');
      expect(event.expected).toBe(true);

      const payload = event.payload as EventPayload;
      expect(payload.nodeId).toBe('user-1');
      expect(payload.nodeType).toBe('user');
      expect(payload.data.userId).toBe('alice');
    });

    it('should emit node created event with position', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitNodeCreated(
        'user-1',
        'user',
        { userId: 'alice' },
        {
          position: { x: 100, y: 200 },
        }
      );

      const payload = event.payload as EventPayload;
      expect(payload.position).toEqual({ x: 100, y: 200 });
    });

    it('should emit node updated event', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitNodeUpdated('user-1', { status: 'online' });

      expect(event.category).toBe('node');
      expect(event.operation).toBe('update');
      expect(event.type).toBe('node_updated');

      const payload = event.payload as EventPayload;
      expect(payload.nodeId).toBe('user-1');
      expect(payload.data.status).toBe('online');
    });

    it('should emit node deleted event', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitNodeDeleted('user-1');

      expect(event.category).toBe('node');
      expect(event.operation).toBe('delete');
      expect(event.type).toBe('node_deleted');

      const payload = event.payload as EventPayload;
      expect(payload.nodeId).toBe('user-1');
    });

    it('should mark events as unexpected when specified', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitNodeCreated(
        'user-1',
        'user',
        { userId: 'alice' },
        {
          expected: false,
        }
      );

      expect(event.expected).toBe(false);
    });
  });

  describe('Edge Event Helpers', () => {
    it('should emit edge created event', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitEdgeCreated('conn-1', 'connection', 'user-1', 'server-1');

      expect(event.category).toBe('edge');
      expect(event.operation).toBe('create');
      expect(event.type).toBe('edge_created');

      const payload = event.payload as EventPayload;
      expect(payload.edgeId).toBe('conn-1');
      expect(payload.edgeType).toBe('connection');
      expect(payload.from).toBe('user-1');
      expect(payload.to).toBe('server-1');
    });

    it('should emit edge created event with data', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitEdgeCreated('conn-1', 'connection', 'user-1', 'server-1', {
        data: { bandwidth: '1gbps' },
      });

      const payload = event.payload as EventPayload;
      expect(payload.data.bandwidth).toBe('1gbps');
    });

    it('should emit edge animated event', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitEdgeAnimated('msg-1', 'message', 'user-1', 'user-2', {
        duration: 500,
        direction: 'forward',
      });

      expect(event.category).toBe('edge');
      expect(event.operation).toBe('animate');
      expect(event.type).toBe('edge_animated');

      const payload = event.payload as EventPayload;
      expect(payload.animation?.duration).toBe(500);
      expect(payload.animation?.direction).toBe('forward');
    });

    it('should emit edge deleted event', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitEdgeDeleted('conn-1');

      expect(event.category).toBe('edge');
      expect(event.operation).toBe('delete');
      expect(event.type).toBe('edge_deleted');
    });
  });

  describe('State Event Helpers', () => {
    it('should emit state change event', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitStateChange('user-1', 'online');

      expect(event.category).toBe('state');
      expect(event.type).toBe('state_changed');

      const payload = event.payload as EventPayload;
      expect(payload.nodeId).toBe('user-1');
      expect(payload.newState).toBe('online');
    });

    it('should emit state change with previous state', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitStateChange('user-1', 'online', {
        previousState: 'offline',
      });

      const payload = event.payload as EventPayload;
      expect(payload.previousState).toBe('offline');
      expect(payload.newState).toBe('online');
    });

    it('should emit state change with additional data', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitStateChange('user-1', 'online', {
        data: { lastSeen: Date.now() },
      });

      const payload = event.payload as EventPayload;
      expect(payload.data.lastSeen).toBeDefined();
    });
  });

  describe('System Event Helpers', () => {
    it('should emit reset event', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitReset();

      expect(event.category).toBe('system');
      expect(event.type).toBe('system_reset');

      const payload = event.payload as EventPayload;
      expect(payload.action).toBe('reset');
    });

    it('should emit pause event', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitPause();

      expect(event.category).toBe('system');
      expect(event.type).toBe('system_pause');

      const payload = event.payload as EventPayload;
      expect(payload.action).toBe('pause');
    });

    it('should emit resume event', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitResume();

      expect(event.category).toBe('system');
      expect(event.type).toBe('system_resume');

      const payload = event.payload as EventPayload;
      expect(payload.action).toBe('resume');
    });
  });

  describe('Event IDs', () => {
    it('should generate unique event IDs', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      helper.emitNodeCreated('user-1', 'user', { userId: 'alice' });
      helper.emitNodeCreated('user-2', 'user', { userId: 'bob' });

      expect(capturedEvents[0].id).not.toBe(capturedEvents[1].id);
    });

    it('should include timestamp in event', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const before = Date.now();
      helper.emitNodeCreated('user-1', 'user', { userId: 'alice' });
      const after = Date.now();

      expect(capturedEvents[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(capturedEvents[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('Metadata Support', () => {
    it('should include metadata in events', () => {
      const helper = new GraphInstrumentationHelper(testConfig, (event) => {
        capturedEvents.push(event);
      });

      const event = helper.emitNodeCreated(
        'user-1',
        'user',
        { userId: 'alice' },
        {
          metadata: {
            source: 'test:line:42',
            tags: ['important', 'user-creation'],
            description: 'Creating test user',
          },
        }
      );

      expect(event.metadata?.source).toBe('test:line:42');
      expect(event.metadata?.tags).toEqual(['important', 'user-creation']);
      expect(event.metadata?.description).toBe('Creating test user');
    });
  });
});
