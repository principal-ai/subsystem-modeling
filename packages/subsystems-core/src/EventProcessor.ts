import type {
  GraphEvent,
  GraphConfiguration,
  GraphState,
  ValidationResult,
  NodeState,
  EdgeState,
  NodeEvent,
  EdgeEvent,
  StateEvent,
  DataEvent,
  SystemEvent,
} from './types';
import { ValidationEngine } from './ValidationEngine';
import { ConfigurationValidator } from './ConfigurationValidator';

export interface ProcessingResult {
  success: boolean;
  state: GraphState;
  validation: ValidationResult;
  error?: string;
}

/**
 * EventProcessor handles the ingestion and processing of graph events
 */
export class EventProcessor {
  private state: GraphState;
  private validationEngine: ValidationEngine;
  private eventHistory: GraphEvent[] = [];

  constructor(configuration: GraphConfiguration, options?: { validateConfig?: boolean }) {
    // Validate configuration by default (can be disabled for performance)
    if (options?.validateConfig !== false) {
      ConfigurationValidator.validateOrThrow(configuration);
    }

    this.state = {
      nodes: new Map<string, NodeState>(),
      edges: new Map<string, EdgeState>(),
      configuration,
    };
    this.validationEngine = new ValidationEngine(configuration.validation || {});
  }

  /**
   * Process a single graph event
   */
  processEvent(event: GraphEvent): ProcessingResult {
    try {
      // Validate event first
      const validation = this.validateEvent(event);

      // Apply the event to state
      this.applyEvent(event);

      // Store in history
      this.eventHistory.push(event);

      return {
        success: true,
        state: this.state,
        validation,
      };
    } catch (error) {
      return {
        success: false,
        state: this.state,
        validation: {
          valid: false,
          violations: [],
          warnings: [],
          metrics: this.getEmptyMetrics(),
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate an event against configuration rules
   */
  validateEvent(event: GraphEvent): ValidationResult {
    return this.validationEngine.validate(event, this.state);
  }

  /**
   * Get the current graph state
   */
  getGraphState(): GraphState {
    return this.state;
  }

  /**
   * Get event history
   */
  getEventHistory(): GraphEvent[] {
    return [...this.eventHistory];
  }

  /**
   * Reset processor state
   */
  reset(): void {
    this.state.nodes.clear();
    this.state.edges.clear();
    this.eventHistory = [];
  }

  /**
   * Apply event to internal state
   */
  private applyEvent(event: GraphEvent): void {
    const timestamp = event.timestamp;

    switch (event.category) {
      case 'node':
        this.handleNodeEvent(event, timestamp);
        break;
      case 'edge':
        this.handleEdgeEvent(event, timestamp);
        break;
      case 'state':
        this.handleStateEvent(event, timestamp);
        break;
      case 'data':
        this.handleDataEvent(event);
        break;
      case 'system':
        this.handleSystemEvent(event);
        break;
    }
  }

  private handleNodeEvent(event: GraphEvent, timestamp: number): void {
    const payload = event.payload as NodeEvent;

    switch (payload.operation) {
      case 'create':
        this.state.nodes.set(payload.nodeId, {
          id: payload.nodeId,
          type: payload.nodeType,
          name: typeof payload.data?.name === 'string' ? payload.data.name : payload.nodeId,
          data: payload.data || {},
          position: payload.position,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        break;
      case 'update': {
        const existingNode = this.state.nodes.get(payload.nodeId);
        if (existingNode) {
          this.state.nodes.set(payload.nodeId, {
            ...existingNode,
            data: { ...existingNode.data, ...payload.data },
            position: payload.position || existingNode.position,
            updatedAt: timestamp,
          });
        }
        break;
      }
      case 'delete':
        this.state.nodes.delete(payload.nodeId);
        break;
    }
  }

  private handleEdgeEvent(event: GraphEvent, timestamp: number): void {
    const payload = event.payload as EdgeEvent;

    switch (payload.operation) {
      case 'create':
        this.state.edges.set(payload.edgeId, {
          id: payload.edgeId,
          type: payload.edgeType,
          from: payload.from,
          to: payload.to,
          data: payload.data,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        break;
      case 'update': {
        const existingEdge = this.state.edges.get(payload.edgeId);
        if (existingEdge) {
          this.state.edges.set(payload.edgeId, {
            ...existingEdge,
            data: { ...existingEdge.data, ...payload.data },
            updatedAt: timestamp,
          });
        }
        break;
      }
      case 'delete':
        this.state.edges.delete(payload.edgeId);
        break;
      case 'animate':
        // Animation is handled by the UI layer
        break;
    }
  }

  private handleStateEvent(event: GraphEvent, timestamp: number): void {
    const payload = event.payload as StateEvent;
    const node = this.state.nodes.get(payload.nodeId);
    if (node) {
      this.state.nodes.set(payload.nodeId, {
        ...node,
        state: payload.newState,
        data: { ...node.data, ...payload.data },
        updatedAt: timestamp,
      });
    }
  }

  private handleDataEvent(event: GraphEvent): void {
    const payload = event.payload as DataEvent;
    if (payload.targetType === 'node') {
      const node = this.state.nodes.get(payload.targetId);
      if (node) {
        this.state.nodes.set(payload.targetId, {
          ...node,
          data: { ...node.data, ...payload.updates },
          updatedAt: event.timestamp,
        });
      }
    } else {
      const edge = this.state.edges.get(payload.targetId);
      if (edge) {
        this.state.edges.set(payload.targetId, {
          ...edge,
          data: { ...edge.data, ...payload.updates },
          updatedAt: event.timestamp,
        });
      }
    }
  }

  private handleSystemEvent(event: GraphEvent): void {
    const payload = event.payload as SystemEvent;
    if (payload.action === 'reset') {
      this.reset();
    }
  }

  private getEmptyMetrics() {
    return {
      totalEvents: 0,
      validEvents: 0,
      violations: 0,
      warnings: 0,
      unexpectedEvents: 0,
      expectedEventsMissing: 0,
    };
  }
}
