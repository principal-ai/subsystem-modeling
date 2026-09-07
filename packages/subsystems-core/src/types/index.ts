/**
 * Core type definitions for the Principal View Framework
 * Based on GENERIC_GRAPH_PANEL_DESIGN.md
 */

// ============================================================================
// JSON-Serializable Types
// ============================================================================

/**
 * Represents any valid JSON value
 * Used for data that needs to be serialized/deserialized (events, telemetry, etc.)
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * JSON object type - a record with JSON-serializable values
 */
export type JsonObject = Record<string, JsonValue>;

// ============================================================================
// Domain-Specific Type Aliases
// ============================================================================

/**
 * Runtime data/properties for a graph node
 * Must conform to the schema defined in NodeTypeDefinition.dataSchema
 */
export type NodeData = JsonObject;

/**
 * Runtime data/properties for a graph edge
 * Must conform to the schema defined in EdgeTypeDefinition.dataSchema
 */
export type EdgeData = JsonObject;

/**
 * Additional metadata attached to events for observability/debugging
 * Examples: source location, stack trace, timing info, state transition details, etc.
 */
export type EventMetadata = JsonObject;

/**
 * Validation constraints for expected events
 * Key-value pairs that define expected properties and their values
 */
export type ValidationConstraints = JsonObject;

// ============================================================================
// Graph Configuration Types
// ============================================================================

export interface GraphConfiguration {
  /** Metadata about the system being visualized */
  metadata: {
    name: string;
    description?: string;
  };

  /** Node type definitions */
  nodeTypes: Record<string, NodeTypeDefinition>;

  /** Edge type definitions */
  edgeTypes: Record<string, EdgeTypeDefinition>;

  /** Allowed connections between node types */
  allowedConnections: ConnectionRule[];

  /** Optional validation rules */
  validation?: ValidationRules;

  /** Display preferences */
  display?: DisplayConfiguration;

  /** Global state definitions (fallback for nodes without specific states) */
  states?: Record<
    string,
    {
      color?: string;
      icon?: string;
      label?: string;
    }
  >;
}

export interface NodeTypeDefinition {
  /** Description of this node type (required) */
  description: string;
  /** Visual representation */
  shape: 'circle' | 'rectangle' | 'hexagon' | 'diamond' | 'custom';
  icon?: string;
  /** Fill color (used as primary node color) */
  color?: string;
  /** Stroke/border color */
  stroke?: string;
  size?: { width: number; height: number };

  /** Data schema for this node type */
  dataSchema: {
    [field: string]: {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required?: boolean;
      displayInLabel?: boolean;
    };
  };

  /** State definitions */
  states?: Record<
    string,
    {
      color?: string;
      icon?: string;
      label?: string;
    }
  >;

  /** Layout hints */
  layout?: {
    layer?: number;
    cluster?: string;
  };
}

export interface EdgeTypeDefinition {
  /** Visual style */
  style: 'solid' | 'dashed' | 'dotted' | 'animated';
  color?: string;
  width?: number;
  directed?: boolean;
  animated?: boolean;

  /** Edge label configuration */
  label?: {
    field?: string;
    position?: 'start' | 'middle' | 'end';
  };

  /** Animation configuration */
  animation?: {
    type: 'flow' | 'pulse' | 'particle' | 'glow';
    duration?: number;
    color?: string;
  };

  /** Data schema for edge metadata - fields to display when edge is clicked */
  dataSchema?: {
    [field: string]: {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      label?: string;
      displayInInfo?: boolean;
    };
  };
}

export interface ConnectionRule {
  from: string; // Node type
  to: string; // Node type
  via: string; // Edge type

  /** Optional constraints */
  constraints?: {
    maxInstances?: number;
    bidirectional?: boolean;
    exclusive?: boolean;
  };
}

export interface ValidationRules {
  /** State transition rules per node type */
  stateTransitions?: Record<
    string,
    Array<{
      from: string;
      to: string[];
    }>
  >;

  /** Global constraints */
  constraints?: Array<{
    id: string;
    description: string;
    check: string;
    severity: 'info' | 'warning' | 'error';
  }>;

  /** Cardinality rules */
  cardinality?: Record<
    string,
    {
      min?: number;
      max?: number;
    }
  >;
}

export interface DisplayConfiguration {
  /** Default layout algorithm */
  layout: 'hierarchical' | 'force-directed' | 'circular' | 'manual';

  /** Color scheme */
  theme?: {
    primary?: string;
    success?: string;
    warning?: string;
    danger?: string;
    info?: string;
  };

  /** Animation preferences */
  animations?: {
    enabled?: boolean;
    speed?: number;
  };
}

// ============================================================================
// Event System Types
// ============================================================================

export interface GraphEvent {
  /** Unique event ID */
  id: string;

  /** Event type (user-defined) */
  type: string;

  /** When this event occurred */
  timestamp: number;

  /** Event category */
  category: 'node' | 'edge' | 'state' | 'data' | 'system';

  /** Event operation */
  operation: 'create' | 'update' | 'delete' | 'animate';

  /** Event payload */
  payload: NodeEvent | EdgeEvent | StateEvent | DataEvent | SystemEvent;

  /** Whether this event was expected */
  expected?: boolean;

  /** Optional metadata */
  metadata?: {
    source?: string;
    tags?: string[];
    description?: string;
  };
}

export interface NodeEvent {
  operation: 'create' | 'update' | 'delete';
  nodeId: string;
  nodeType: string;
  data?: NodeData;
  position?: { x: number; y: number };
}

export interface EdgeEvent {
  operation: 'create' | 'update' | 'delete' | 'animate';
  edgeId: string;
  edgeType: string;
  from: string;
  to: string;
  data?: EdgeData;
  animation?: {
    duration?: number;
    direction?: 'forward' | 'backward' | 'bidirectional';
  };
}

export interface StateEvent {
  nodeId: string;
  previousState?: string;
  newState: string;
  data?: EventMetadata;
}

export interface DataEvent {
  targetId: string;
  targetType: 'node' | 'edge';
  updates: JsonObject;
}

export interface SystemEvent {
  action: 'reset' | 'pause' | 'resume' | 'snapshot';
  data?: JsonValue;
}

// ============================================================================
// Event Stream Protocol
// ============================================================================

export interface EventStream {
  /** Configuration (emitted once at start) */
  configuration: GraphConfiguration;

  /** Initial graph state (optional) */
  initialState?: {
    nodes: Array<Omit<NodeState, 'createdAt' | 'updatedAt'>>;
    edges: Array<Omit<EdgeState, 'createdAt' | 'updatedAt'>>;
  };

  /** Stream of events */
  events: GraphEvent[];

  /** Optional expected events for validation */
  expectedEvents?: Array<{
    type: string;
    constraints: ValidationConstraints;
    timing?: { minTime: number; maxTime: number };
  }>;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
  warnings: Warning[];
  metrics: ValidationMetrics;
}

export interface Violation {
  id: string;
  severity: 'warning' | 'error';
  type: 'connection' | 'state' | 'cardinality' | 'constraint' | 'unexpected_event';
  description: string;
  event?: GraphEvent;
  context?: {
    nodeId?: string;
    edgeId?: string;
    rule?: string;
  };
}

export interface Warning {
  id: string;
  type: string;
  message: string;
  event?: GraphEvent;
}

export interface ValidationMetrics {
  totalEvents: number;
  validEvents: number;
  violations: number;
  warnings: number;
  unexpectedEvents: number;
  expectedEventsMissing: number;
}

// ============================================================================
// Graph State Types
// ============================================================================

export interface GraphState {
  nodes: Map<string, NodeState>;
  edges: Map<string, EdgeState>;
  configuration: GraphConfiguration;
}

export interface NodeState {
  id: string;
  type: string;
  /** Display name for this node instance (required) */
  name: string;
  data: NodeData;
  state?: string;
  position?: { x: number; y: number };
  /** Node width (persisted from resize operations) */
  width?: number;
  /** Node height (persisted from resize operations) */
  height?: number;
  createdAt: number;
  updatedAt: number;
}

export interface EdgeState {
  id: string;
  type: string;
  from: string;
  to: string;
  data?: EdgeData;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface GraphMetrics {
  /** Node metrics */
  nodes: {
    total: number;
    byType: Record<string, number>;
    byState: Record<string, number>;
  };

  /** Edge metrics */
  edges: {
    total: number;
    byType: Record<string, number>;
  };

  /** Event metrics */
  events: {
    total: number;
    byCategory: Record<string, number>;
    byType: Record<string, number>;
    rate: number;
  };

  /** Validation metrics */
  validation: {
    violations: number;
    warnings: number;
    unexpectedEvents: number;
    healthScore: number;
  };

  /** Performance metrics */
  performance: {
    renderTime: number;
    eventProcessingTime: number;
    layoutTime: number;
  };
}

// ============================================================================
// Path-Based Configuration Types (Milestone 1 & 2)
// ============================================================================

export * from './path-based-config';

// ============================================================================
// Component Library Types
// ============================================================================

export * from './library';

// ============================================================================
// OpenTelemetry and Resource Matching Types
// ============================================================================

export * from './otel';
export * from './resource-match';
export * from './canvas-scope';
export * from './audit';
export * from './dashboard';
export * from './auxiliary';
export * from './subsystem-model';
