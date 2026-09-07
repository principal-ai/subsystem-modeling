/**
 * Path-based configuration extensions for Milestone 1 & 2
 *
 * These types extend the core GraphConfiguration to support:
 * - Path-based log association (Milestone 1)
 * - Action pattern refinement (Milestone 2)
 * - Resource-based log association (OTEL integration)
 */

import type { ResourceMatch } from './resource-match';
import type { JsonValue, JsonObject } from './index';

/**
 * Log levels (matches logger package)
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Extended node type definition with source path mapping
 */
export interface PathBasedNodeTypeDefinition {
  /** Base node type properties (inherited from NodeTypeDefinition) */
  shape: 'circle' | 'rectangle' | 'hexagon' | 'diamond' | 'custom';
  /** Description of this node type (required) */
  description: string;
  icon?: string;
  color?: string;
  size?: { width: number; height: number };
  dataSchema: {
    [field: string]: {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required?: boolean;
      displayInLabel?: boolean;
    };
  };
  states?: Record<
    string,
    {
      color?: string;
      icon?: string;
      label?: string;
    }
  >;
  layout?: {
    layer?: number;
    cluster?: string;
  };

  /** Manual position for 'manual' layout mode */
  position?: { x: number; y: number };

  /**
   * MILESTONE 1: Source path mapping
   * Exact file paths for log association (glob patterns and line numbers are not supported)
   */
  sources?: string[]; // e.g., ["lib/lock-manager.ts", "lib/branch-aware-lock-manager.ts"]

  /**
   * Resource-based matching for OTEL logs
   *
   * When specified, logs with matching OTEL resource attributes
   * will be routed to this node type. Takes priority over sources.
   *
   * @example
   * ```typescript
   * resourceMatch: {
   *   'service.name': 'checkout-api',
   *   'deployment.environment': 'production'
   * }
   * ```
   */
  resourceMatch?: ResourceMatch;

  // actions removed - see docs/LEGACY_PATH_BASED_PATTERNS.md
  // MILESTONE 2 was superseded by OTEL event schemas
}

// ActionPattern removed - see docs/LEGACY_PATH_BASED_PATTERNS.md
// Use OTEL event schemas in .otel.canvas files instead

/**
 * Extended edge definition with action-based activation (Milestone 2)
 */
export interface PathBasedEdgeTypeDefinition {
  /** Base edge properties */
  style: 'solid' | 'dashed' | 'dotted' | 'animated';
  color?: string;
  width?: number;
  directed?: boolean;
  animated?: boolean;
  label?: {
    field?: string;
    position?: 'start' | 'middle' | 'end';
  };
  animation?: {
    type: 'flow' | 'pulse' | 'particle' | 'glow';
    duration?: number;
    color?: string;
  };

  /** MILESTONE 2: Edge activation triggers */
  activatedBy?: EdgeActivationTrigger[];
}

/**
 * Configuration for activating edges based on component actions
 */
export interface EdgeActivationTrigger {
  /** Action that triggers this edge animation */
  action: string;

  /** Animation type to play */
  animation: 'flow' | 'particle' | 'pulse' | 'glow';

  /** Animation direction */
  direction?: 'forward' | 'backward' | 'bidirectional';

  /** Animation duration in milliseconds */
  duration?: number;
}

/**
 * Extended graph configuration with path-based support
 */
export interface PathBasedGraphConfiguration {
  metadata: {
    name: string;
    description?: string;
  };

  /** Node types with source path mapping */
  nodeTypes: Record<string, PathBasedNodeTypeDefinition>;

  /** Edge types with action-based activation */
  edgeTypes: Record<string, PathBasedEdgeTypeDefinition>;

  /** Allowed connections between node types */
  allowedConnections: Array<{
    from: string;
    to: string;
    via: string;
    constraints?: {
      maxInstances?: number;
      bidirectional?: boolean;
      exclusive?: boolean;
    };
  }>;

  /** Optional validation rules */
  validation?: JsonObject; // Reuse from base types

  /** Display preferences */
  display?: JsonObject; // Reuse from base types

  /** Path-based configuration options */
  pathBasedConfig?: PathBasedConfigOptions;
}

/**
 * Configuration options for path-based log association
 */
export interface PathBasedConfigOptions {
  /** Project root for normalizing paths */
  projectRoot?: string;

  /** Whether to enable source capture (default: true) */
  captureSource?: boolean;

  /** Whether to enable action pattern matching (default: false in M1, true in M2) */
  enableActionPatterns?: boolean;

  /** Default log level for filtering (default: 'info') */
  logLevel?: LogLevel;

  /** Whether to ignore logs without source information (default: false) */
  ignoreUnsourced?: boolean;
}

/**
 * Component activity event (Milestone 1)
 * Generated when a log is associated with a component by source path
 */
export interface ComponentActivityEvent {
  type: 'component-activity';

  /** Component ID (node type) */
  componentId: string;

  /**
   * Instance identifier for multi-instance components.
   * If provided, targets a specific node instance (e.g., "client-1").
   * If undefined, targets the node type as a whole.
   */
  instanceId?: string;

  /** Timestamp of the log */
  timestamp: number;

  /** Log level */
  level: LogLevel;

  /** Log message */
  message: string;

  /** Source location */
  source: {
    file: string;
    line?: number;
    column?: number;
  };

  /** Additional log arguments */
  args?: JsonValue[];
}

/**
 * Component action event (Milestone 2)
 * Generated when a log matches an action pattern
 */
export interface ComponentActionEvent {
  type: 'component-action';

  /** Component ID (node type) */
  componentId: string;

  /**
   * Instance identifier for multi-instance components.
   * If provided, targets a specific node instance (e.g., "client-1").
   * If undefined, targets the node type as a whole.
   */
  instanceId?: string;

  /** Action type (from pattern) */
  action: string;

  /** New state (if specified in pattern) */
  state?: string;

  /** Timestamp of the log */
  timestamp: number;

  /** Extracted metadata from capture groups */
  metadata?: JsonObject;

  /** Source location */
  source: {
    file: string;
    line?: number;
    column?: number;
  };
}

/**
 * Edge animation event (Milestone 2)
 * Generated when a component action triggers edge activation
 */
export interface EdgeAnimationEvent {
  type: 'edge-animation';

  /** Edge ID to animate */
  edgeId: string;

  /** Animation type */
  animation: 'flow' | 'particle' | 'pulse' | 'glow';

  /** Animation direction */
  direction?: 'forward' | 'backward' | 'bidirectional';

  /** Animation duration */
  duration: number;

  /** Timestamp */
  timestamp: number;

  /** Source action that triggered this */
  triggeredBy?: {
    componentId: string;
    action: string;
  };
}

/**
 * Union type of all path-based events
 */
export type PathBasedEvent = ComponentActivityEvent | ComponentActionEvent | EdgeAnimationEvent;
