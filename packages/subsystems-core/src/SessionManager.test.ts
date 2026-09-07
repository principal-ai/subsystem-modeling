import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SessionManager, type EventSession } from './SessionManager';
import type { GraphEvent } from './types';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({ autoCleanup: false });
  });

  afterEach(() => {
    manager.dispose();
  });

  // Helper to create a mock event
  const createMockEvent = (id: string): GraphEvent => ({
    id,
    type: 'test_event',
    timestamp: Date.now(),
    category: 'state',
    operation: 'update',
    payload: { nodeId: 'test-node', newState: 'active' },
  });

  describe('createSession', () => {
    it('should create a new session with generated ID', () => {
      const session = manager.createSession({ name: 'Test Session' });

      expect(session.id).toMatch(/^session-/);
      expect(session.name).toBe('Test Session');
      expect(session.status).toBe('recording');
      expect(session.events).toEqual([]);
      expect(session.startedAt).toBeLessThanOrEqual(Date.now());
    });

    it('should create a session with custom ID', () => {
      const session = manager.createSession({
        name: 'Test Session',
        id: 'custom-id',
      });

      expect(session.id).toBe('custom-id');
    });

    it('should create a session with metadata', () => {
      const session = manager.createSession({
        name: 'Test Session',
        metadata: {
          testFile: 'test/foo.test.ts',
          testName: 'should do something',
          tags: ['unit', 'fast'],
        },
      });

      expect(session.metadata.testFile).toBe('test/foo.test.ts');
      expect(session.metadata.testName).toBe('should do something');
      expect(session.metadata.tags).toEqual(['unit', 'fast']);
    });

    it('should throw if session ID already exists', () => {
      manager.createSession({ name: 'First', id: 'duplicate' });

      expect(() => {
        manager.createSession({ name: 'Second', id: 'duplicate' });
      }).toThrow('already exists');
    });

    it('should set the created session as active', () => {
      const session = manager.createSession({ name: 'Test' });
      const active = manager.getActiveSession();

      expect(active).toBeDefined();
      expect(active?.id).toBe(session.id);
    });
  });

  describe('getSession', () => {
    it('should return session by ID', () => {
      const created = manager.createSession({ name: 'Test', id: 'my-id' });
      const fetched = manager.getSession('my-id');

      expect(fetched).toEqual(created);
    });

    it('should return undefined for non-existent ID', () => {
      const fetched = manager.getSession('non-existent');
      expect(fetched).toBeUndefined();
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions', () => {
      const sessions = manager.listSessions();
      expect(sessions).toEqual([]);
    });

    it('should return sessions sorted by start time (newest first)', async () => {
      manager.createSession({ name: 'First' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      manager.createSession({ name: 'Second' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      manager.createSession({ name: 'Third' });

      const sessions = manager.listSessions();

      expect(sessions).toHaveLength(3);
      expect(sessions[0].name).toBe('Third');
      expect(sessions[1].name).toBe('Second');
      expect(sessions[2].name).toBe('First');
    });
  });

  describe('addEvent', () => {
    it('should add event to session', () => {
      const session = manager.createSession({ name: 'Test' });
      const event = createMockEvent('evt-1');

      manager.addEvent(session.id, event);

      const updated = manager.getSession(session.id);
      expect(updated?.events).toHaveLength(1);
      expect(updated?.events[0]).toEqual(event);
    });

    it('should add multiple events in order', () => {
      const session = manager.createSession({ name: 'Test' });

      manager.addEvent(session.id, createMockEvent('evt-1'));
      manager.addEvent(session.id, createMockEvent('evt-2'));
      manager.addEvent(session.id, createMockEvent('evt-3'));

      const updated = manager.getSession(session.id);
      expect(updated?.events).toHaveLength(3);
      expect(updated?.events[0].id).toBe('evt-1');
      expect(updated?.events[1].id).toBe('evt-2');
      expect(updated?.events[2].id).toBe('evt-3');
    });

    it('should throw for non-existent session', () => {
      expect(() => {
        manager.addEvent('non-existent', createMockEvent('evt-1'));
      }).toThrow('not found');
    });

    it('should throw for completed session', () => {
      const session = manager.createSession({ name: 'Test' });
      manager.endSession(session.id);

      expect(() => {
        manager.addEvent(session.id, createMockEvent('evt-1'));
      }).toThrow('not recording');
    });
  });

  describe('addEventToActive', () => {
    it('should add event to active session', () => {
      manager.createSession({ name: 'Test' });
      const event = createMockEvent('evt-1');

      manager.addEventToActive(event);

      const active = manager.getActiveSession();
      expect(active?.events).toHaveLength(1);
    });

    it('should throw when no active session', () => {
      expect(() => {
        manager.addEventToActive(createMockEvent('evt-1'));
      }).toThrow('No active session');
    });
  });

  describe('endSession', () => {
    it('should mark session as completed', () => {
      const session = manager.createSession({ name: 'Test' });
      manager.endSession(session.id);

      const updated = manager.getSession(session.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.endedAt).toBeDefined();
    });

    it('should set result and duration', () => {
      const session = manager.createSession({ name: 'Test' });
      manager.endSession(session.id, { result: 'pass' });

      const updated = manager.getSession(session.id);
      expect(updated?.metadata.result).toBe('pass');
      expect(updated?.metadata.duration).toBeGreaterThanOrEqual(0);
    });

    it('should set error message on failure', () => {
      const session = manager.createSession({ name: 'Test' });
      manager.endSession(session.id, { result: 'fail', error: 'Something went wrong' });

      const updated = manager.getSession(session.id);
      expect(updated?.metadata.result).toBe('fail');
      expect(updated?.metadata.error).toBe('Something went wrong');
    });

    it('should clear active session', () => {
      const session = manager.createSession({ name: 'Test' });
      expect(manager.getActiveSession()).toBeDefined();

      manager.endSession(session.id);
      expect(manager.getActiveSession()).toBeUndefined();
    });

    it('should throw for non-existent session', () => {
      expect(() => {
        manager.endSession('non-existent');
      }).toThrow('not found');
    });

    it('should throw for already completed session', () => {
      const session = manager.createSession({ name: 'Test' });
      manager.endSession(session.id);

      expect(() => {
        manager.endSession(session.id);
      }).toThrow('not recording');
    });
  });

  describe('errorSession', () => {
    it('should mark session as error with message', () => {
      const session = manager.createSession({ name: 'Test' });
      manager.errorSession(session.id, 'Connection failed');

      const updated = manager.getSession(session.id);
      expect(updated?.status).toBe('error');
      expect(updated?.metadata.error).toBe('Connection failed');
      expect(updated?.endedAt).toBeDefined();
    });
  });

  describe('deleteSession', () => {
    it('should delete session', () => {
      const session = manager.createSession({ name: 'Test' });
      expect(manager.getSession(session.id)).toBeDefined();

      const deleted = manager.deleteSession(session.id);
      expect(deleted).toBe(true);
      expect(manager.getSession(session.id)).toBeUndefined();
    });

    it('should return false for non-existent session', () => {
      const deleted = manager.deleteSession('non-existent');
      expect(deleted).toBe(false);
    });

    it('should clear active session if deleted', () => {
      const session = manager.createSession({ name: 'Test' });
      expect(manager.getActiveSession()).toBeDefined();

      manager.deleteSession(session.id);
      expect(manager.getActiveSession()).toBeUndefined();
    });
  });

  describe('clearSessions', () => {
    it('should clear all sessions', () => {
      manager.createSession({ name: 'First' });
      manager.createSession({ name: 'Second' });
      manager.createSession({ name: 'Third' });

      expect(manager.listSessions()).toHaveLength(3);

      manager.clearSessions();

      expect(manager.listSessions()).toHaveLength(0);
      expect(manager.getActiveSession()).toBeUndefined();
    });
  });

  describe('exportSession / importSession', () => {
    it('should export session to JSON', () => {
      const session = manager.createSession({ name: 'Test' });
      manager.addEvent(session.id, createMockEvent('evt-1'));
      manager.endSession(session.id, { result: 'pass' });

      const json = manager.exportSession(session.id);
      const parsed = JSON.parse(json);

      expect(parsed.name).toBe('Test');
      expect(parsed.events).toHaveLength(1);
      expect(parsed.status).toBe('completed');
    });

    it('should import session from JSON', () => {
      const original = manager.createSession({ name: 'Original' });
      manager.addEvent(original.id, createMockEvent('evt-1'));
      manager.endSession(original.id);

      const json = manager.exportSession(original.id);
      manager.clearSessions();

      const imported = manager.importSession(json);

      expect(imported.name).toBe('Original');
      expect(imported.events).toHaveLength(1);
      expect(imported.status).toBe('completed');
    });

    it('should generate new ID if duplicate on import', () => {
      const original = manager.createSession({ name: 'Test', id: 'my-id' });
      manager.endSession(original.id);
      const json = manager.exportSession(original.id);

      const imported = manager.importSession(json);

      expect(imported.id).not.toBe('my-id');
      expect(manager.listSessions()).toHaveLength(2);
    });

    it('should throw for invalid JSON format', () => {
      expect(() => {
        manager.importSession('{}');
      }).toThrow('Invalid session format');
    });
  });

  describe('onSessionChange', () => {
    it('should call listener immediately with current sessions', () => {
      manager.createSession({ name: 'Existing' });

      let received: EventSession[] = [];
      manager.onSessionChange((sessions) => {
        received = sessions;
      });

      expect(received).toHaveLength(1);
      expect(received[0].name).toBe('Existing');
    });

    it('should call listener on session create', () => {
      let callCount = 0;
      manager.onSessionChange(() => {
        callCount++;
      });

      manager.createSession({ name: 'New' });

      expect(callCount).toBe(2); // Initial + create
    });

    it('should call listener on event add', () => {
      const session = manager.createSession({ name: 'Test' });

      let callCount = 0;
      manager.onSessionChange(() => {
        callCount++;
      });

      manager.addEvent(session.id, createMockEvent('evt-1'));

      expect(callCount).toBe(2); // Initial + add
    });

    it('should unsubscribe when returned function is called', () => {
      let callCount = 0;
      const unsubscribe = manager.onSessionChange(() => {
        callCount++;
      });

      expect(callCount).toBe(1); // Initial

      unsubscribe();
      manager.createSession({ name: 'New' });

      expect(callCount).toBe(1); // No additional calls
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      const session1 = manager.createSession({ name: 'First' });
      manager.addEvent(session1.id, createMockEvent('evt-1'));
      manager.addEvent(session1.id, createMockEvent('evt-2'));
      manager.endSession(session1.id);

      const session2 = manager.createSession({ name: 'Second' });
      manager.addEvent(session2.id, createMockEvent('evt-3'));

      const stats = manager.getStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(1);
      expect(stats.totalEvents).toBe(3);
      expect(stats.oldestSession).toBe(session1.startedAt);
      expect(stats.newestSession).toBe(session2.startedAt);
    });

    it('should return null timestamps when no sessions', () => {
      const stats = manager.getStats();

      expect(stats.totalSessions).toBe(0);
      expect(stats.oldestSession).toBeNull();
      expect(stats.newestSession).toBeNull();
    });
  });

  describe('max events limit', () => {
    it('should not add events beyond limit', () => {
      const manager = new SessionManager({
        maxEventsPerSession: 3,
        autoCleanup: false,
      });

      const session = manager.createSession({ name: 'Test' });

      manager.addEvent(session.id, createMockEvent('evt-1'));
      manager.addEvent(session.id, createMockEvent('evt-2'));
      manager.addEvent(session.id, createMockEvent('evt-3'));
      manager.addEvent(session.id, createMockEvent('evt-4')); // Should be ignored

      const updated = manager.getSession(session.id);
      expect(updated?.events).toHaveLength(3);

      manager.dispose();
    });
  });
});
