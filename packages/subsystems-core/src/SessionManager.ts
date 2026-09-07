/**
 * SessionManager - Manages event recording sessions
 *
 * Sessions group events by test case or recording context.
 * Each session contains a sequence of GraphEvents that can be
 * replayed through the EventControllerPanel.
 */

import type { GraphEvent } from './types';

/**
 * Session status
 */
export type SessionStatus = 'recording' | 'completed' | 'error';

/**
 * Session result when completed
 */
export type SessionResult = 'pass' | 'fail' | 'skip';

/**
 * Metadata associated with a session
 */
export interface SessionMetadata {
  /** Test file path */
  testFile?: string;

  /** Test case name */
  testName?: string;

  /** Test suite name */
  testSuite?: string;

  /** Custom tags for filtering */
  tags?: string[];

  /** Test result (set when session completes) */
  result?: SessionResult;

  /** Error message if test failed */
  error?: string;

  /** Duration in milliseconds */
  duration?: number;
}

/**
 * An event recording session
 */
export interface EventSession {
  /** Unique session identifier */
  id: string;

  /** Human-readable name (e.g., test name) */
  name: string;

  /** When recording started */
  startedAt: number;

  /** When recording ended (undefined if still recording) */
  endedAt?: number;

  /** Status of the session */
  status: SessionStatus;

  /** Recorded events */
  events: GraphEvent[];

  /** Session metadata */
  metadata: SessionMetadata;
}

/**
 * Options for creating a session
 */
export interface CreateSessionOptions {
  /** Session name */
  name: string;

  /** Optional metadata */
  metadata?: SessionMetadata;

  /** Optional custom ID (auto-generated if not provided) */
  id?: string;
}

/**
 * Options for ending a session
 */
export interface EndSessionOptions {
  /** Test result */
  result?: SessionResult;

  /** Error message if failed */
  error?: string;
}

/**
 * Session change callback
 */
export type SessionChangeCallback = (sessions: EventSession[]) => void;

/**
 * SessionManager configuration
 */
export interface SessionManagerConfig {
  /** Maximum events per session (default: 10000) */
  maxEventsPerSession?: number;

  /** Maximum number of sessions to keep (default: 100) */
  maxSessions?: number;

  /** Auto-cleanup sessions older than this (ms, default: 3600000 = 1 hour) */
  sessionRetention?: number;

  /** Whether to auto-cleanup old sessions (default: true) */
  autoCleanup?: boolean;
}

/**
 * Manages event recording sessions
 */
export class SessionManager {
  private sessions: Map<string, EventSession> = new Map();
  private activeSessionId: string | null = null;
  private listeners: Set<SessionChangeCallback> = new Set();
  private config: Required<SessionManagerConfig>;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: SessionManagerConfig = {}) {
    this.config = {
      maxEventsPerSession: config.maxEventsPerSession ?? 10000,
      maxSessions: config.maxSessions ?? 100,
      sessionRetention: config.sessionRetention ?? 3600000, // 1 hour
      autoCleanup: config.autoCleanup ?? true,
    };

    // Start auto-cleanup if enabled
    if (this.config.autoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Notify all listeners of session changes
   */
  private notifyListeners(): void {
    const sessions = this.listSessions();
    for (const listener of this.listeners) {
      try {
        listener(sessions);
      } catch (error) {
        console.error('Session listener error:', error);
      }
    }
  }

  /**
   * Start auto-cleanup interval
   */
  private startAutoCleanup(): void {
    // Clean up every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSessions();
    }, 60000);
  }

  /**
   * Stop auto-cleanup interval
   */
  private stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clean up sessions older than retention period
   */
  private cleanupOldSessions(): void {
    const now = Date.now();
    const cutoff = now - this.config.sessionRetention;

    for (const [id, session] of this.sessions) {
      // Don't cleanup active session
      if (id === this.activeSessionId) continue;

      // Cleanup completed/error sessions past retention
      if (session.status !== 'recording' && session.startedAt < cutoff) {
        this.sessions.delete(id);
      }
    }

    // Enforce max sessions limit
    if (this.sessions.size > this.config.maxSessions) {
      const sortedSessions = Array.from(this.sessions.entries())
        .filter(([id]) => id !== this.activeSessionId)
        .sort((a, b) => a[1].startedAt - b[1].startedAt);

      const toDelete = sortedSessions.slice(0, this.sessions.size - this.config.maxSessions);
      for (const [id] of toDelete) {
        this.sessions.delete(id);
      }
    }

    this.notifyListeners();
  }

  /**
   * Create a new session
   */
  createSession(options: CreateSessionOptions): EventSession {
    const id = options.id || this.generateId();

    // Check if session already exists
    if (this.sessions.has(id)) {
      throw new Error(`Session with ID "${id}" already exists`);
    }

    const session: EventSession = {
      id,
      name: options.name,
      startedAt: Date.now(),
      status: 'recording',
      events: [],
      metadata: options.metadata || {},
    };

    this.sessions.set(id, session);
    this.activeSessionId = id;
    this.notifyListeners();

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(id: string): EventSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get the currently active (recording) session
   */
  getActiveSession(): EventSession | undefined {
    if (!this.activeSessionId) return undefined;
    return this.sessions.get(this.activeSessionId);
  }

  /**
   * List all sessions, sorted by start time (newest first)
   */
  listSessions(): EventSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * Add an event to a session
   */
  addEvent(sessionId: string, event: GraphEvent): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session "${sessionId}" not found`);
    }

    if (session.status !== 'recording') {
      throw new Error(`Session "${sessionId}" is not recording (status: ${session.status})`);
    }

    // Check max events limit
    if (session.events.length >= this.config.maxEventsPerSession) {
      console.warn(
        `Session "${sessionId}" reached max events limit (${this.config.maxEventsPerSession})`
      );
      return;
    }

    session.events.push(event);
    this.notifyListeners();
  }

  /**
   * Add an event to the active session (convenience method)
   */
  addEventToActive(event: GraphEvent): void {
    if (!this.activeSessionId) {
      throw new Error('No active session');
    }
    this.addEvent(this.activeSessionId, event);
  }

  /**
   * End a session
   */
  endSession(sessionId: string, options: EndSessionOptions = {}): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session "${sessionId}" not found`);
    }

    if (session.status !== 'recording') {
      throw new Error(`Session "${sessionId}" is not recording (status: ${session.status})`);
    }

    session.endedAt = Date.now();
    session.status = 'completed';
    session.metadata.result = options.result;
    session.metadata.error = options.error;
    session.metadata.duration = session.endedAt - session.startedAt;

    // Clear active session if this was it
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }

    this.notifyListeners();
  }

  /**
   * End the active session (convenience method)
   */
  endActiveSession(options: EndSessionOptions = {}): void {
    if (!this.activeSessionId) {
      throw new Error('No active session');
    }
    this.endSession(this.activeSessionId, options);
  }

  /**
   * Mark a session as errored
   */
  errorSession(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session "${sessionId}" not found`);
    }

    session.endedAt = Date.now();
    session.status = 'error';
    session.metadata.error = error;
    session.metadata.duration = session.endedAt - session.startedAt;

    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }

    this.notifyListeners();
  }

  /**
   * Delete a session
   */
  deleteSession(id: string): boolean {
    if (this.activeSessionId === id) {
      this.activeSessionId = null;
    }

    const deleted = this.sessions.delete(id);
    if (deleted) {
      this.notifyListeners();
    }
    return deleted;
  }

  /**
   * Clear all sessions
   */
  clearSessions(): void {
    this.sessions.clear();
    this.activeSessionId = null;
    this.notifyListeners();
  }

  /**
   * Export a session to JSON string
   */
  exportSession(id: string): string {
    const session = this.sessions.get(id);

    if (!session) {
      throw new Error(`Session "${id}" not found`);
    }

    return JSON.stringify(session, null, 2);
  }

  /**
   * Import a session from JSON string
   */
  importSession(json: string): EventSession {
    const session = JSON.parse(json) as EventSession;

    // Validate required fields
    if (!session.id || !session.name || !session.events) {
      throw new Error('Invalid session format: missing required fields');
    }

    // Generate new ID if session with same ID exists
    if (this.sessions.has(session.id)) {
      session.id = this.generateId();
    }

    // Mark as completed (imported sessions can't be recorded to)
    session.status = 'completed';

    this.sessions.set(session.id, session);
    this.notifyListeners();

    return session;
  }

  /**
   * Subscribe to session changes
   * Returns unsubscribe function
   */
  onSessionChange(callback: SessionChangeCallback): () => void {
    this.listeners.add(callback);

    // Immediately call with current sessions
    callback(this.listSessions());

    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    totalEvents: number;
    oldestSession: number | null;
    newestSession: number | null;
  } {
    const sessions = this.listSessions();
    const activeSessions = sessions.filter((s) => s.status === 'recording').length;
    const totalEvents = sessions.reduce((sum, s) => sum + s.events.length, 0);

    return {
      totalSessions: sessions.length,
      activeSessions,
      totalEvents,
      oldestSession: sessions.length > 0 ? sessions[sessions.length - 1].startedAt : null,
      newestSession: sessions.length > 0 ? sessions[0].startedAt : null,
    };
  }

  /**
   * Dispose of the session manager
   */
  dispose(): void {
    this.stopAutoCleanup();
    this.listeners.clear();
    this.sessions.clear();
    this.activeSessionId = null;
  }
}
