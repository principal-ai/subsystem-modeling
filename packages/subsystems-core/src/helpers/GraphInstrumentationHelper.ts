import type { GraphConfiguration, GraphEvent, NodeEvent, EdgeEvent, StateEvent, NodeData, EdgeData, EventMetadata } from '../types';

/**
 * Helper class for instrumenting tests with graph events
 * Makes it easy to emit events from tests
 */
export class GraphInstrumentationHelper {
  private configuration: GraphConfiguration;
  private eventEmitter?: (event: GraphEvent) => void;
  private eventCounter = 0;

  constructor(configuration: GraphConfiguration, eventEmitter?: (event: GraphEvent) => void) {
    this.configuration = configuration;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Set the event emitter callback
   */
  setEventEmitter(emitter: (event: GraphEvent) => void): void {
    this.eventEmitter = emitter;
  }

  /**
   * Emit a node creation event
   */
  emitNodeCreated(
    id: string,
    type: string,
    data: NodeData,
    options: {
      expected?: boolean;
      position?: { x: number; y: number };
      metadata?: EventMetadata;
    } = {}
  ): GraphEvent {
    const event: GraphEvent = {
      id: this.generateEventId(),
      type: 'node_created',
      timestamp: Date.now(),
      category: 'node',
      operation: 'create',
      payload: {
        operation: 'create',
        nodeId: id,
        nodeType: type,
        data,
        position: options.position,
      } as NodeEvent,
      expected: options.expected ?? true,
      metadata: options.metadata,
    };

    this.emit(event);
    return event;
  }

  /**
   * Emit a node update event
   */
  emitNodeUpdated(
    id: string,
    updates: NodeData,
    options: { expected?: boolean; metadata?: EventMetadata } = {}
  ): GraphEvent {
    const event: GraphEvent = {
      id: this.generateEventId(),
      type: 'node_updated',
      timestamp: Date.now(),
      category: 'node',
      operation: 'update',
      payload: {
        operation: 'update',
        nodeId: id,
        nodeType: '', // Will be determined from state
        data: updates,
      } as NodeEvent,
      expected: options.expected ?? true,
      metadata: options.metadata,
    };

    this.emit(event);
    return event;
  }

  /**
   * Emit a node deletion event
   */
  emitNodeDeleted(
    id: string,
    options: { expected?: boolean; metadata?: EventMetadata } = {}
  ): GraphEvent {
    const event: GraphEvent = {
      id: this.generateEventId(),
      type: 'node_deleted',
      timestamp: Date.now(),
      category: 'node',
      operation: 'delete',
      payload: {
        operation: 'delete',
        nodeId: id,
        nodeType: '', // Will be determined from state
      } as NodeEvent,
      expected: options.expected ?? true,
      metadata: options.metadata,
    };

    this.emit(event);
    return event;
  }

  /**
   * Emit an edge creation event
   */
  emitEdgeCreated(
    id: string,
    type: string,
    from: string,
    to: string,
    options: {
      expected?: boolean;
      data?: EdgeData;
      metadata?: EventMetadata;
    } = {}
  ): GraphEvent {
    const event: GraphEvent = {
      id: this.generateEventId(),
      type: 'edge_created',
      timestamp: Date.now(),
      category: 'edge',
      operation: 'create',
      payload: {
        operation: 'create',
        edgeId: id,
        edgeType: type,
        from,
        to,
        data: options.data,
      } as EdgeEvent,
      expected: options.expected ?? true,
      metadata: options.metadata,
    };

    this.emit(event);
    return event;
  }

  /**
   * Emit an edge animation event
   */
  emitEdgeAnimated(
    id: string,
    type: string,
    from: string,
    to: string,
    options: {
      duration?: number;
      direction?: 'forward' | 'backward' | 'bidirectional';
      metadata?: EventMetadata;
    } = {}
  ): GraphEvent {
    const event: GraphEvent = {
      id: this.generateEventId(),
      type: 'edge_animated',
      timestamp: Date.now(),
      category: 'edge',
      operation: 'animate',
      payload: {
        operation: 'animate',
        edgeId: id,
        edgeType: type,
        from,
        to,
        animation: {
          duration: options.duration,
          direction: options.direction || 'forward',
        },
      } as EdgeEvent,
      expected: true,
      metadata: options.metadata,
    };

    this.emit(event);
    return event;
  }

  /**
   * Emit an edge deletion event
   */
  emitEdgeDeleted(
    id: string,
    options: { expected?: boolean; metadata?: EventMetadata } = {}
  ): GraphEvent {
    const event: GraphEvent = {
      id: this.generateEventId(),
      type: 'edge_deleted',
      timestamp: Date.now(),
      category: 'edge',
      operation: 'delete',
      payload: {
        operation: 'delete',
        edgeId: id,
        edgeType: '', // Will be determined from state
        from: '',
        to: '',
      } as EdgeEvent,
      expected: options.expected ?? true,
      metadata: options.metadata,
    };

    this.emit(event);
    return event;
  }

  /**
   * Emit a state change event
   */
  emitStateChange(
    nodeId: string,
    newState: string,
    options: {
      previousState?: string;
      expected?: boolean;
      data?: EventMetadata;
      metadata?: EventMetadata;
    } = {}
  ): GraphEvent {
    const event: GraphEvent = {
      id: this.generateEventId(),
      type: 'state_changed',
      timestamp: Date.now(),
      category: 'state',
      operation: 'update',
      payload: {
        nodeId,
        previousState: options.previousState,
        newState,
        data: options.data,
      } as StateEvent,
      expected: options.expected ?? true,
      metadata: options.metadata,
    };

    this.emit(event);
    return event;
  }

  /**
   * Emit a system reset event
   */
  emitReset(): GraphEvent {
    const event: GraphEvent = {
      id: this.generateEventId(),
      type: 'system_reset',
      timestamp: Date.now(),
      category: 'system',
      operation: 'update',
      payload: {
        action: 'reset',
      },
      expected: true,
    };

    this.emit(event);
    return event;
  }

  /**
   * Emit a system pause event
   */
  emitPause(): GraphEvent {
    const event: GraphEvent = {
      id: this.generateEventId(),
      type: 'system_pause',
      timestamp: Date.now(),
      category: 'system',
      operation: 'update',
      payload: {
        action: 'pause',
      },
      expected: true,
    };

    this.emit(event);
    return event;
  }

  /**
   * Emit a system resume event
   */
  emitResume(): GraphEvent {
    const event: GraphEvent = {
      id: this.generateEventId(),
      type: 'system_resume',
      timestamp: Date.now(),
      category: 'system',
      operation: 'update',
      payload: {
        action: 'resume',
      },
      expected: true,
    };

    this.emit(event);
    return event;
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return `evt-${++this.eventCounter}-${Date.now()}`;
  }

  /**
   * Emit an event
   */
  private emit(event: GraphEvent): void {
    if (this.eventEmitter) {
      this.eventEmitter(event);
    }
  }
}
