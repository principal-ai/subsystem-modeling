/**
 * Shared types for OTEL node components
 */

/**
 * Workflow chip displayed on span convention nodes
 */
export interface WorkflowChip {
  /** Workflow ID for selection/filtering */
  id: string;
  /** Display label (may be truncated) */
  label: string;
  /** Optional color for the chip */
  color?: string;
}

/**
 * Common node data properties shared across all OTEL node types
 */
export interface OtelNodeDataBase {
  /** Node color (hex string or preset number) */
  color?: string;
  /** Scope color for border (from library.yaml owned-scopes) */
  scopeColor?: string;
  /** Span color for fill (from .spans.canvas) */
  spanColor?: string;
  /** Explicit stroke color override */
  stroke?: string;
  /** Icon identifier (Lucide icons) */
  icon?: string;
  /** Implementation status */
  status?: 'draft' | 'approved' | 'implemented';
  /** Description for tooltip */
  description?: string;
  /** Source files where event is instrumented */
  sources?: string[];
  /** External references/documentation */
  references?: string[];
  /** Node-level state definitions */
  states?: Record<string, { color?: string; label?: string; icon?: string }>;
  /** Canvas type (e.g., 'group') */
  canvasType?: string;
  /** Node type identifier */
  nodeType?: string;
}

/**
 * OTEL extension data
 */
export interface OtelExtensionData {
  /** Span pattern for span convention nodes */
  spanPattern?: string;
  /** Scope name for scope nodes */
  scope?: string;
  /** Resource match for resource nodes */
  resourceMatch?: Record<string, string | string[]>;
  /** Files where this is instrumented */
  files?: string[];
}

/**
 * Event data for event nodes
 */
export interface EventData {
  /** Event name */
  name?: string;
  /** Event description */
  description?: string;
  /** Event attributes schema */
  attributes?: Record<string, unknown>;
}

/**
 * Boundary data for boundary nodes
 */
export interface BoundaryData {
  /** Direction of boundary interaction */
  direction?: 'outbound' | 'inbound';
  /** Node query for external system */
  node?: Record<string, string>;
}

/**
 * Props for shared node content component
 */
export interface NodeContentProps {
  /** Display name for the node */
  displayName: string;
  /** Identifier shown below the name (e.g., span pattern, event name) */
  identifier?: string;
  /** Icon identifier */
  icon?: string;
  /** Current state */
  state?: string;
  /** State definitions for label lookup */
  stateDefinitions?: Record<string, { label?: string }>;
  /** Whether node has violations */
  hasViolations?: boolean;
  /** Whether to center text (default true) */
  centered?: boolean;
  /** Workflow chips for span convention nodes */
  workflowChips?: WorkflowChip[];
  /** Callback when a workflow chip is clicked */
  onWorkflowChipClick?: (chipId: string) => void;
  /** Currently selected workflow ID */
  selectedWorkflowId?: string;
}

/**
 * Badge position types
 */
export type BadgePosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom';

/**
 * Props for node badges component
 */
export interface NodeBadgesProps {
  /** Node shape for position calculations */
  shape: 'rectangle' | 'circle' | 'hexagon' | 'diamond';
  /** Implementation status */
  status?: 'draft' | 'approved' | 'implemented';
  /** Source files */
  sourceFiles?: string[];
  /** References */
  references?: string[];
  /** Boundary data (for boundary nodes) */
  boundary?: BoundaryData;
  /** Node opacity for badge visibility */
  opacity?: number;
}
