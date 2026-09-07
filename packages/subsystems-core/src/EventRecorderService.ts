/**
 * EventRecorderService - Log ingestion and event recording service
 *
 * This service:
 * 1. Accepts logs via message protocol or direct API
 * 2. Processes logs through PathBasedEventProcessor
 * 3. Manages sessions through SessionManager
 * 4. Emits events to subscribers for visualization
 *
 * The service is transport-agnostic - it handles message parsing and responses
 * but does not implement any specific transport (WebSocket, IPC, etc.).
 * The host application is responsible for the actual transport layer.
 */

import { SessionManager } from './SessionManager';
import type { EventSession, CreateSessionOptions, EndSessionOptions } from './SessionManager';
import { PathBasedEventProcessor } from './PathBasedEventProcessor';
import type { LogEntry } from './PathBasedEventProcessor';
import type { PathBasedGraphConfiguration, PathBasedEvent } from './types/path-based-config';
import type { GraphEvent } from './types';

/**
 * Protocol message types for log ingestion
 */
export type ProtocolMessageType =
  | 'session_start'
  | 'session_end'
  | 'log'
  | 'log_batch'
  | 'ping'
  | 'pong'
  | 'error'
  | 'ack';

/**
 * Base protocol message structure
 */
export interface ProtocolMessage {
  type: ProtocolMessageType;
  timestamp: number;
  requestId?: string;
}

/**
 * Session start message
 */
export interface SessionStartMessage extends ProtocolMessage {
  type: 'session_start';
  payload: {
    name: string;
    id?: string;
    metadata?: {
      testFile?: string;
      testName?: string;
      testSuite?: string;
      tags?: string[];
    };
  };
}

/**
 * Session end message
 */
export interface SessionEndMessage extends ProtocolMessage {
  type: 'session_end';
  payload: {
    sessionId: string;
    result?: 'pass' | 'fail' | 'skip';
    error?: string;
  };
}

/**
 * Single log message
 */
export interface LogMessage extends ProtocolMessage {
  type: 'log';
  payload: LogEntry;
}

/**
 * Batch log message
 */
export interface LogBatchMessage extends ProtocolMessage {
  type: 'log_batch';
  payload: {
    logs: LogEntry[];
  };
}

/**
 * Ping message for keepalive
 */
export interface PingMessage extends ProtocolMessage {
  type: 'ping';
}

/**
 * Pong response
 */
export interface PongMessage extends ProtocolMessage {
  type: 'pong';
}

/**
 * Error response
 */
export interface ErrorMessage extends ProtocolMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    requestId?: string;
  };
}

/**
 * Acknowledgment response
 */
export interface AckMessage extends ProtocolMessage {
  type: 'ack';
  payload: {
    requestId: string;
    sessionId?: string;
  };
}

/**
 * Union type for all incoming messages
 */
export type IncomingMessage =
  | SessionStartMessage
  | SessionEndMessage
  | LogMessage
  | LogBatchMessage
  | PingMessage;

/**
 * Union type for all outgoing messages
 */
export type OutgoingMessage = PongMessage | ErrorMessage | AckMessage;

/**
 * Recording mode
 */
export type RecordingMode = 'auto' | 'manual' | 'continuous';

/**
 * Event callback for processed events
 */
export type EventCallback = (event: PathBasedEvent | GraphEvent) => void;

/**
 * Event batch callback
 */
export type EventBatchCallback = (events: Array<PathBasedEvent | GraphEvent>) => void;

/**
 * Connection state
 */
export interface ConnectionState {
  id: string;
  connectedAt: number;
  lastActivityAt: number;
  activeSessionId: string | null;
}

/**
 * EventRecorderService configuration
 */
export interface EventRecorderServiceConfig {
  /** Graph configuration for PathBasedEventProcessor */
  graphConfig: PathBasedGraphConfiguration;

  /** Recording mode (default: 'manual') */
  recordingMode?: RecordingMode;

  /** Whether to emit events immediately or batch them (default: true) */
  emitImmediately?: boolean;

  /** Batch interval in ms when emitImmediately is false (default: 100) */
  batchIntervalMs?: number;

  /** SessionManager configuration */
  sessionConfig?: {
    maxEventsPerSession?: number;
    maxSessions?: number;
    sessionRetention?: number;
    autoCleanup?: boolean;
  };
}

/**
 * EventRecorderService - Main service for log ingestion and event recording
 */
export class EventRecorderService {
  private sessionManager: SessionManager;
  private eventProcessor: PathBasedEventProcessor;
  private config: Required<Omit<EventRecorderServiceConfig, 'graphConfig' | 'sessionConfig'>> & {
    graphConfig: PathBasedGraphConfiguration;
  };
  private eventListeners: Set<EventCallback> = new Set();
  private batchListeners: Set<EventBatchCallback> = new Set();
  private eventBuffer: Array<PathBasedEvent | GraphEvent> = [];
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private connections: Map<string, ConnectionState> = new Map();
  private isRecording: boolean = false;

  constructor(config: EventRecorderServiceConfig) {
    this.config = {
      graphConfig: config.graphConfig,
      recordingMode: config.recordingMode ?? 'manual',
      emitImmediately: config.emitImmediately ?? true,
      batchIntervalMs: config.batchIntervalMs ?? 100,
    };

    this.sessionManager = new SessionManager(config.sessionConfig);
    this.eventProcessor = new PathBasedEventProcessor(config.graphConfig);

    // Start batch processing if not emitting immediately
    if (!this.config.emitImmediately) {
      this.startBatchProcessing();
    }

    // In continuous mode, start recording immediately
    if (this.config.recordingMode === 'continuous') {
      this.isRecording = true;
    }
  }

  /**
   * Process an incoming protocol message
   */
  public processMessage(message: IncomingMessage, connectionId: string): OutgoingMessage | null {
    // Update connection activity
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivityAt = Date.now();
    }

    switch (message.type) {
      case 'session_start':
        return this.handleSessionStart(message, connectionId);

      case 'session_end':
        return this.handleSessionEnd(message, connectionId);

      case 'log':
        return this.handleLog(message, connectionId);

      case 'log_batch':
        return this.handleLogBatch(message, connectionId);

      case 'ping':
        return this.handlePing(message);

      default: {
        const exhaustiveCheck: never = message;
        return this.createError(
          'UNKNOWN_MESSAGE_TYPE',
          `Unknown message type: ${(exhaustiveCheck as ProtocolMessage).type}`
        );
      }
    }
  }

  /**
   * Handle session start message
   */
  private handleSessionStart(message: SessionStartMessage, connectionId: string): OutgoingMessage {
    try {
      const session = this.sessionManager.createSession({
        name: message.payload.name,
        id: message.payload.id,
        metadata: message.payload.metadata,
      });

      // Associate session with connection
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.activeSessionId = session.id;
      }

      this.isRecording = true;

      return {
        type: 'ack',
        timestamp: Date.now(),
        payload: {
          requestId: message.requestId || '',
          sessionId: session.id,
        },
      };
    } catch (error) {
      return this.createError(
        'SESSION_START_FAILED',
        error instanceof Error ? error.message : 'Failed to start session',
        message.requestId
      );
    }
  }

  /**
   * Handle session end message
   */
  private handleSessionEnd(message: SessionEndMessage, connectionId: string): OutgoingMessage {
    try {
      this.sessionManager.endSession(message.payload.sessionId, {
        result: message.payload.result,
        error: message.payload.error,
      });

      // Clear session from connection
      const connection = this.connections.get(connectionId);
      if (connection && connection.activeSessionId === message.payload.sessionId) {
        connection.activeSessionId = null;
      }

      // In manual mode, stop recording when session ends
      if (this.config.recordingMode === 'manual') {
        this.isRecording = false;
      }

      return {
        type: 'ack',
        timestamp: Date.now(),
        payload: {
          requestId: message.requestId || '',
          sessionId: message.payload.sessionId,
        },
      };
    } catch (error) {
      return this.createError(
        'SESSION_END_FAILED',
        error instanceof Error ? error.message : 'Failed to end session',
        message.requestId
      );
    }
  }

  /**
   * Handle single log message
   */
  private handleLog(message: LogMessage, _connectionId: string): OutgoingMessage | null {
    if (!this.isRecording) {
      return null; // Silently ignore logs when not recording
    }

    const events = this.eventProcessor.processLog(message.payload);

    // Add events to active session
    const activeSession = this.sessionManager.getActiveSession();
    if (activeSession) {
      for (const event of events) {
        this.sessionManager.addEvent(activeSession.id, event as unknown as GraphEvent);
      }
    }

    // Emit events
    this.emitEvents(events);

    if (message.requestId) {
      return {
        type: 'ack',
        timestamp: Date.now(),
        payload: {
          requestId: message.requestId,
        },
      };
    }

    return null;
  }

  /**
   * Handle batch log message
   */
  private handleLogBatch(message: LogBatchMessage, _connectionId: string): OutgoingMessage | null {
    if (!this.isRecording) {
      return null;
    }

    const events = this.eventProcessor.processLogs(message.payload.logs);

    // Add events to active session
    const activeSession = this.sessionManager.getActiveSession();
    if (activeSession) {
      for (const event of events) {
        this.sessionManager.addEvent(activeSession.id, event as unknown as GraphEvent);
      }
    }

    // Emit events
    this.emitEvents(events);

    if (message.requestId) {
      return {
        type: 'ack',
        timestamp: Date.now(),
        payload: {
          requestId: message.requestId,
        },
      };
    }

    return null;
  }

  /**
   * Handle ping message
   */
  private handlePing(_message: PingMessage): PongMessage {
    return {
      type: 'pong',
      timestamp: Date.now(),
    };
  }

  /**
   * Create an error response
   */
  private createError(code: string, message: string, requestId?: string): ErrorMessage {
    return {
      type: 'error',
      timestamp: Date.now(),
      payload: {
        code,
        message,
        requestId,
      },
    };
  }

  /**
   * Emit events to listeners
   */
  private emitEvents(events: PathBasedEvent[]): void {
    if (events.length === 0) return;

    if (this.config.emitImmediately) {
      // Emit immediately to all listeners
      for (const event of events) {
        for (const listener of this.eventListeners) {
          try {
            listener(event);
          } catch (error) {
            console.error('Event listener error:', error);
          }
        }
      }
    } else {
      // Buffer events for batch emission
      this.eventBuffer.push(...events);
    }
  }

  /**
   * Start batch processing timer
   */
  private startBatchProcessing(): void {
    this.batchTimer = setInterval(() => {
      if (this.eventBuffer.length > 0) {
        const events = [...this.eventBuffer];
        this.eventBuffer = [];

        for (const listener of this.batchListeners) {
          try {
            listener(events);
          } catch (error) {
            console.error('Batch listener error:', error);
          }
        }
      }
    }, this.config.batchIntervalMs);
  }

  /**
   * Stop batch processing timer
   */
  private stopBatchProcessing(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  // === Direct API ===

  /**
   * Process a log entry directly (without protocol message wrapper)
   */
  public processLog(log: LogEntry): PathBasedEvent[] {
    if (!this.isRecording) {
      return [];
    }

    const events = this.eventProcessor.processLog(log);

    // Add events to active session
    const activeSession = this.sessionManager.getActiveSession();
    if (activeSession) {
      for (const event of events) {
        this.sessionManager.addEvent(activeSession.id, event as unknown as GraphEvent);
      }
    }

    // Emit events
    this.emitEvents(events);

    return events;
  }

  /**
   * Process multiple log entries directly (without protocol message wrapper)
   */
  public processLogs(logs: LogEntry[]): PathBasedEvent[] {
    if (!this.isRecording) {
      return [];
    }

    const events = this.eventProcessor.processLogs(logs);

    // Add events to active session
    const activeSession = this.sessionManager.getActiveSession();
    if (activeSession) {
      for (const event of events) {
        this.sessionManager.addEvent(activeSession.id, event as unknown as GraphEvent);
      }
    }

    // Emit events
    this.emitEvents(events);

    return events;
  }

  /**
   * Start a new session directly
   */
  public startSession(options: CreateSessionOptions): EventSession {
    const session = this.sessionManager.createSession(options);
    this.isRecording = true;
    return session;
  }

  /**
   * End a session directly
   */
  public endSession(sessionId: string, options?: EndSessionOptions): void {
    this.sessionManager.endSession(sessionId, options);

    if (this.config.recordingMode === 'manual') {
      this.isRecording = false;
    }
  }

  /**
   * End the active session
   */
  public endActiveSession(options?: EndSessionOptions): void {
    this.sessionManager.endActiveSession(options);

    if (this.config.recordingMode === 'manual') {
      this.isRecording = false;
    }
  }

  /**
   * Start recording (for manual mode)
   */
  public startRecording(): void {
    this.isRecording = true;
  }

  /**
   * Stop recording (for manual mode)
   */
  public stopRecording(): void {
    this.isRecording = false;
  }

  /**
   * Check if currently recording
   */
  public get recording(): boolean {
    return this.isRecording;
  }

  // === Connection Management ===

  /**
   * Register a new connection
   */
  public registerConnection(connectionId: string): void {
    this.connections.set(connectionId, {
      id: connectionId,
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
      activeSessionId: null,
    });
  }

  /**
   * Unregister a connection
   */
  public unregisterConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);

    // End any active session for this connection
    if (connection?.activeSessionId) {
      try {
        this.sessionManager.errorSession(
          connection.activeSessionId,
          'Connection closed unexpectedly'
        );
      } catch {
        // Session may have already ended
      }
    }

    this.connections.delete(connectionId);
  }

  /**
   * Get connection state
   */
  public getConnection(connectionId: string): ConnectionState | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all active connections
   */
  public getConnections(): ConnectionState[] {
    return Array.from(this.connections.values());
  }

  // === Event Subscription ===

  /**
   * Subscribe to individual events
   */
  public onEvent(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  /**
   * Subscribe to event batches
   */
  public onEventBatch(callback: EventBatchCallback): () => void {
    this.batchListeners.add(callback);
    return () => {
      this.batchListeners.delete(callback);
    };
  }

  // === Session Access ===

  /**
   * Get SessionManager for direct access
   */
  public getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get active session
   */
  public getActiveSession(): EventSession | undefined {
    return this.sessionManager.getActiveSession();
  }

  /**
   * Get session by ID
   */
  public getSession(id: string): EventSession | undefined {
    return this.sessionManager.getSession(id);
  }

  /**
   * List all sessions
   */
  public listSessions(): EventSession[] {
    return this.sessionManager.listSessions();
  }

  // === Statistics ===

  /**
   * Get service statistics
   */
  public getStats(): {
    isRecording: boolean;
    recordingMode: RecordingMode;
    activeConnections: number;
    sessions: {
      total: number;
      active: number;
      totalEvents: number;
    };
    processor: {
      totalComponents: number;
      componentsWithSources: number;
      totalSourcePatterns: number;
    };
  } {
    const sessionStats = this.sessionManager.getStats();
    const processorStats = this.eventProcessor.getStats();

    return {
      isRecording: this.isRecording,
      recordingMode: this.config.recordingMode,
      activeConnections: this.connections.size,
      sessions: {
        total: sessionStats.totalSessions,
        active: sessionStats.activeSessions,
        totalEvents: sessionStats.totalEvents,
      },
      processor: {
        totalComponents: processorStats.totalComponents,
        componentsWithSources: processorStats.componentsWithSources,
        totalSourcePatterns: processorStats.totalSourcePatterns,
      },
    };
  }

  /**
   * Dispose of the service
   */
  public dispose(): void {
    this.stopBatchProcessing();
    this.sessionManager.dispose();
    this.eventListeners.clear();
    this.batchListeners.clear();
    this.connections.clear();
    this.eventBuffer = [];
  }
}
