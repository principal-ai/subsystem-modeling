import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { EventRecorderService } from './EventRecorderService';
import type { ComponentActivityEvent, PathBasedEvent } from './types/path-based-config';
import type {
  SessionStartMessage,
  SessionEndMessage,
  LogMessage,
  LogBatchMessage,
  PingMessage,
  AckMessage,
  ErrorMessage,
} from './EventRecorderService';
import type { PathBasedGraphConfiguration } from './types/path-based-config';
import type { LogEntry } from './PathBasedEventProcessor';
import type { GraphEvent } from './types/index';

describe('EventRecorderService', () => {
  // Sample configuration
  const sampleConfig: PathBasedGraphConfiguration = {
    metadata: {
      name: 'Test System',
      version: '1.0.0',
    },
    nodeTypes: {
      'lock-manager': {
        shape: 'rectangle',
        icon: 'lock',
        color: '#3b82f6',
        dataSchema: {},
        sources: ['lib/lock-manager.ts'],
      },
      'github-api': {
        shape: 'hexagon',
        icon: 'github',
        color: '#22c55e',
        dataSchema: {},
        sources: ['services/github/*.ts'],
      },
    },
    edgeTypes: {},
    allowedConnections: [],
  };

  let service: EventRecorderService;

  beforeEach(() => {
    service = new EventRecorderService({
      graphConfig: sampleConfig,
      recordingMode: 'manual',
    });
  });

  afterEach(() => {
    service.dispose();
  });

  // Helper to create a log entry
  const createLogEntry = (
    message: string,
    file: string,
    level: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ): LogEntry => ({
    message,
    metadata: {
      timestamp: Date.now(),
      level,
      source: { file, line: 1 },
    },
  });

  describe('Direct API', () => {
    describe('Session management', () => {
      it('should start a session', () => {
        const session = service.startSession({ name: 'Test Session' });

        expect(session.id).toMatch(/^session-/);
        expect(session.name).toBe('Test Session');
        expect(session.status).toBe('recording');
        expect(service.recording).toBe(true);
      });

      it('should end a session', () => {
        const session = service.startSession({ name: 'Test Session' });
        service.endSession(session.id, { result: 'pass' });

        const updated = service.getSession(session.id);
        expect(updated?.status).toBe('completed');
        expect(updated?.metadata.result).toBe('pass');
        expect(service.recording).toBe(false);
      });

      it('should end the active session', () => {
        const session = service.startSession({ name: 'Test Session' });
        service.endActiveSession({ result: 'fail', error: 'Test failed' });

        const updated = service.getSession(session.id);
        expect(updated?.status).toBe('completed');
        expect(updated?.metadata.result).toBe('fail');
        expect(updated?.metadata.error).toBe('Test failed');
      });

      it('should list all sessions', () => {
        service.startSession({ name: 'First' });
        service.endActiveSession();
        service.startSession({ name: 'Second' });
        service.endActiveSession();

        const sessions = service.listSessions();
        expect(sessions).toHaveLength(2);
      });
    });

    describe('Log processing', () => {
      it('should not process logs when not recording', () => {
        const log = createLogEntry('Test log', 'lib/lock-manager.ts');
        const events = service.processLog(log);

        expect(events).toHaveLength(0);
      });

      it('should process logs when recording', () => {
        service.startSession({ name: 'Test Session' });

        const log = createLogEntry('Lock acquired', 'lib/lock-manager.ts');
        const events = service.processLog(log);

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('component-activity');
        expect((events[0] as ComponentActivityEvent).componentId).toBe('lock-manager');
      });

      it('should add processed events to active session', () => {
        const session = service.startSession({ name: 'Test Session' });

        service.processLog(createLogEntry('Log 1', 'lib/lock-manager.ts'));
        service.processLog(createLogEntry('Log 2', 'lib/lock-manager.ts'));

        const updated = service.getSession(session.id);
        expect(updated?.events).toHaveLength(2);
      });

      it('should process multiple logs in batch', () => {
        service.startSession({ name: 'Test Session' });

        const logs = [
          createLogEntry('Log 1', 'lib/lock-manager.ts'),
          createLogEntry('Log 2', 'services/github/client.ts'),
        ];

        const events = service.processLogs(logs);
        expect(events).toHaveLength(2);
      });

      it('should emit events to listeners', () => {
        service.startSession({ name: 'Test Session' });

        const receivedEvents: Array<PathBasedEvent | GraphEvent> = [];
        service.onEvent((event) => {
          receivedEvents.push(event);
        });

        service.processLog(createLogEntry('Test log', 'lib/lock-manager.ts'));

        expect(receivedEvents).toHaveLength(1);
      });

      it('should unsubscribe event listener', () => {
        service.startSession({ name: 'Test Session' });

        const receivedEvents: Array<PathBasedEvent | GraphEvent> = [];
        const unsubscribe = service.onEvent((event) => {
          receivedEvents.push(event);
        });

        service.processLog(createLogEntry('Log 1', 'lib/lock-manager.ts'));
        expect(receivedEvents).toHaveLength(1);

        unsubscribe();

        service.processLog(createLogEntry('Log 2', 'lib/lock-manager.ts'));
        expect(receivedEvents).toHaveLength(1); // No new events
      });
    });

    describe('Recording control', () => {
      it('should start and stop recording manually', () => {
        expect(service.recording).toBe(false);

        service.startRecording();
        expect(service.recording).toBe(true);

        service.stopRecording();
        expect(service.recording).toBe(false);
      });
    });
  });

  describe('WebSocket Protocol', () => {
    beforeEach(() => {
      service.registerConnection('conn-1');
    });

    afterEach(() => {
      service.unregisterConnection('conn-1');
    });

    describe('session_start', () => {
      it('should start a session and return ack', () => {
        const message: SessionStartMessage = {
          type: 'session_start',
          timestamp: Date.now(),
          requestId: 'req-1',
          payload: {
            name: 'Test Session',
          },
        };

        const response = service.processMessage(message, 'conn-1') as AckMessage;

        expect(response.type).toBe('ack');
        expect(response.payload.requestId).toBe('req-1');
        expect(response.payload.sessionId).toMatch(/^session-/);
        expect(service.getActiveSession()).toBeDefined();
      });

      it('should start a session with custom ID', () => {
        const message: SessionStartMessage = {
          type: 'session_start',
          timestamp: Date.now(),
          payload: {
            name: 'Test Session',
            id: 'my-session',
          },
        };

        const response = service.processMessage(message, 'conn-1') as AckMessage;

        expect(response.payload.sessionId).toBe('my-session');
      });

      it('should return error for duplicate session ID', () => {
        const message: SessionStartMessage = {
          type: 'session_start',
          timestamp: Date.now(),
          requestId: 'req-1',
          payload: {
            name: 'Test Session',
            id: 'duplicate',
          },
        };

        service.processMessage(message, 'conn-1');
        const response = service.processMessage(message, 'conn-1') as ErrorMessage;

        expect(response.type).toBe('error');
        expect(response.payload.code).toBe('SESSION_START_FAILED');
      });
    });

    describe('session_end', () => {
      it('should end a session and return ack', () => {
        // Start session first
        const startMessage: SessionStartMessage = {
          type: 'session_start',
          timestamp: Date.now(),
          payload: { name: 'Test Session', id: 'test-session' },
        };
        service.processMessage(startMessage, 'conn-1');

        // End session
        const endMessage: SessionEndMessage = {
          type: 'session_end',
          timestamp: Date.now(),
          requestId: 'req-2',
          payload: {
            sessionId: 'test-session',
            result: 'pass',
          },
        };

        const response = service.processMessage(endMessage, 'conn-1') as AckMessage;

        expect(response.type).toBe('ack');
        expect(response.payload.requestId).toBe('req-2');

        const session = service.getSession('test-session');
        expect(session?.status).toBe('completed');
        expect(session?.metadata.result).toBe('pass');
      });

      it('should return error for non-existent session', () => {
        const message: SessionEndMessage = {
          type: 'session_end',
          timestamp: Date.now(),
          payload: {
            sessionId: 'non-existent',
          },
        };

        const response = service.processMessage(message, 'conn-1') as ErrorMessage;

        expect(response.type).toBe('error');
        expect(response.payload.code).toBe('SESSION_END_FAILED');
      });
    });

    describe('log', () => {
      beforeEach(() => {
        const startMessage: SessionStartMessage = {
          type: 'session_start',
          timestamp: Date.now(),
          payload: { name: 'Test Session' },
        };
        service.processMessage(startMessage, 'conn-1');
      });

      it('should process a log message', () => {
        const message: LogMessage = {
          type: 'log',
          timestamp: Date.now(),
          payload: createLogEntry('Lock acquired', 'lib/lock-manager.ts'),
        };

        const receivedEvents: Array<PathBasedEvent | GraphEvent> = [];
        service.onEvent((event) => receivedEvents.push(event));

        service.processMessage(message, 'conn-1');

        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0].type).toBe('component-activity');
      });

      it('should return ack when requestId is provided', () => {
        const message: LogMessage = {
          type: 'log',
          timestamp: Date.now(),
          requestId: 'req-1',
          payload: createLogEntry('Lock acquired', 'lib/lock-manager.ts'),
        };

        const response = service.processMessage(message, 'conn-1') as AckMessage;

        expect(response.type).toBe('ack');
        expect(response.payload.requestId).toBe('req-1');
      });

      it('should return null when no requestId', () => {
        const message: LogMessage = {
          type: 'log',
          timestamp: Date.now(),
          payload: createLogEntry('Lock acquired', 'lib/lock-manager.ts'),
        };

        const response = service.processMessage(message, 'conn-1');
        expect(response).toBeNull();
      });
    });

    describe('log_batch', () => {
      beforeEach(() => {
        const startMessage: SessionStartMessage = {
          type: 'session_start',
          timestamp: Date.now(),
          payload: { name: 'Test Session' },
        };
        service.processMessage(startMessage, 'conn-1');
      });

      it('should process a batch of logs', () => {
        const message: LogBatchMessage = {
          type: 'log_batch',
          timestamp: Date.now(),
          payload: {
            logs: [
              createLogEntry('Log 1', 'lib/lock-manager.ts'),
              createLogEntry('Log 2', 'lib/lock-manager.ts'),
              createLogEntry('Log 3', 'services/github/client.ts'),
            ],
          },
        };

        const receivedEvents: Array<PathBasedEvent | GraphEvent> = [];
        service.onEvent((event) => receivedEvents.push(event));

        service.processMessage(message, 'conn-1');

        expect(receivedEvents).toHaveLength(3);
      });
    });

    describe('ping', () => {
      it('should respond with pong', () => {
        const message: PingMessage = {
          type: 'ping',
          timestamp: Date.now(),
        };

        const response = service.processMessage(message, 'conn-1');

        expect(response?.type).toBe('pong');
      });
    });
  });

  describe('Connection management', () => {
    it('should register and unregister connections', () => {
      service.registerConnection('conn-1');
      expect(service.getConnection('conn-1')).toBeDefined();

      service.unregisterConnection('conn-1');
      expect(service.getConnection('conn-1')).toBeUndefined();
    });

    it('should track connection state', () => {
      service.registerConnection('conn-1');
      const connection = service.getConnection('conn-1');

      expect(connection?.id).toBe('conn-1');
      expect(connection?.connectedAt).toBeLessThanOrEqual(Date.now());
      expect(connection?.activeSessionId).toBeNull();
    });

    it('should associate session with connection', () => {
      service.registerConnection('conn-1');

      const message: SessionStartMessage = {
        type: 'session_start',
        timestamp: Date.now(),
        payload: { name: 'Test Session', id: 'test-session' },
      };

      service.processMessage(message, 'conn-1');

      const connection = service.getConnection('conn-1');
      expect(connection?.activeSessionId).toBe('test-session');
    });

    it('should error session when connection closes unexpectedly', () => {
      service.registerConnection('conn-1');

      const message: SessionStartMessage = {
        type: 'session_start',
        timestamp: Date.now(),
        payload: { name: 'Test Session', id: 'test-session' },
      };

      service.processMessage(message, 'conn-1');
      service.unregisterConnection('conn-1');

      const session = service.getSession('test-session');
      expect(session?.status).toBe('error');
      expect(session?.metadata.error).toContain('Connection closed');
    });

    it('should list all connections', () => {
      service.registerConnection('conn-1');
      service.registerConnection('conn-2');
      service.registerConnection('conn-3');

      const connections = service.getConnections();
      expect(connections).toHaveLength(3);
    });
  });

  describe('Recording modes', () => {
    it('should start recording immediately in continuous mode', () => {
      const continuousService = new EventRecorderService({
        graphConfig: sampleConfig,
        recordingMode: 'continuous',
      });

      expect(continuousService.recording).toBe(true);
      continuousService.dispose();
    });

    it('should not start recording automatically in manual mode', () => {
      expect(service.recording).toBe(false);
    });

    it('should continue recording after session end in continuous mode', () => {
      const continuousService = new EventRecorderService({
        graphConfig: sampleConfig,
        recordingMode: 'continuous',
      });

      const session = continuousService.startSession({ name: 'Test' });
      continuousService.endSession(session.id);

      expect(continuousService.recording).toBe(true);
      continuousService.dispose();
    });
  });

  describe('Statistics', () => {
    it('should return correct stats', () => {
      service.registerConnection('conn-1');
      service.startSession({ name: 'Test Session' });
      service.processLog(createLogEntry('Log 1', 'lib/lock-manager.ts'));
      service.processLog(createLogEntry('Log 2', 'lib/lock-manager.ts'));

      const stats = service.getStats();

      expect(stats.isRecording).toBe(true);
      expect(stats.recordingMode).toBe('manual');
      expect(stats.activeConnections).toBe(1);
      expect(stats.sessions.total).toBe(1);
      expect(stats.sessions.active).toBe(1);
      expect(stats.sessions.totalEvents).toBe(2);
      expect(stats.processor.totalComponents).toBe(2);
    });
  });

  describe('Batch event emission', () => {
    it('should batch events when emitImmediately is false', async () => {
      const batchService = new EventRecorderService({
        graphConfig: sampleConfig,
        recordingMode: 'manual',
        emitImmediately: false,
        batchIntervalMs: 50,
      });

      batchService.startSession({ name: 'Test Session' });

      const receivedBatches: Array<Array<PathBasedEvent | GraphEvent>> = [];
      batchService.onEventBatch((events) => {
        receivedBatches.push(events);
      });

      // Process multiple logs
      batchService.processLog(createLogEntry('Log 1', 'lib/lock-manager.ts'));
      batchService.processLog(createLogEntry('Log 2', 'lib/lock-manager.ts'));
      batchService.processLog(createLogEntry('Log 3', 'lib/lock-manager.ts'));

      // Wait for batch interval
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedBatches.length).toBeGreaterThan(0);
      expect(receivedBatches[0]).toHaveLength(3);

      batchService.dispose();
    });
  });
});
