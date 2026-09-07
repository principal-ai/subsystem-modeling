/**
 * Component Library Types
 *
 * Defines the structure for component libraries (.yaml/.json files)
 * that contain reusable node and edge type definitions.
 *
 * Libraries are separate from canvas files:
 * - Canvas files (.canvas) = actual graph layouts that get rendered
 * - Library files (.yaml/.json) = collections of reusable type definitions
 *
 * When a user adds a component from the library to a canvas,
 * the type definition gets embedded into the node's `pv` field.
 */

import type {
  PVNodeShape,
  PVEdgeStyle,
  PVAnimationType,
  // PVActionPattern removed - see docs/LEGACY_PATH_BASED_PATTERNS.md
  PVNodeState,
  PVEventSchema,
} from './canvas';

// ============================================================================
// Resource Types
// ============================================================================

/**
 * Definition for an instrumentation scope
 *
 * Describes a scope with its color and optional metadata.
 * Used for consistent visual representation across canvases.
 *
 * @deprecated Scope visual metadata is now defined in .scopes.canvas files using OtelScopeNode type.
 * This type is kept for backward compatibility during migration but will be removed in a future version.
 * Use .scopes.canvas files instead of the top-level scopes section in library.yaml.
 */
export interface ScopeDefinition {
  /** Color for nodes belonging to this scope (hex format). Required unless external. */
  color?: string;

  /** Icon identifier (Lucide icons) */
  icon?: string;

  /** Human-readable description of what this scope covers */
  description?: string;

  /**
   * Mark this scope as external - defined in another library/package.
   * External scopes don't require color (they inherit from the defining library).
   */
  external?: boolean;
}

/**
 * Owned scopes: array of scope names that reference top-level scopes
 *
 * Scope definitions are declared in the top-level `scopes` section of library.yaml.
 * Resources reference those scopes by name.
 */
export type OwnedScopes = string[];

/**
 * OTEL resource attributes for a service/component
 *
 * Represents the actual resource attribute values (not match patterns).
 * These are the attributes that would be set when instrumenting the service.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/resource/
 */
export interface ResourceAttributes {
  /** Service identification (required) */
  'service.name': string;

  /** Service version (recommended) */
  'service.version'?: string;

  /** Service namespace (optional) */
  'service.namespace'?: string;

  /** Service instance ID (optional) */
  'service.instance.id'?: string;

  /** Deployment environment (recommended) */
  'deployment.environment'?: string;

  /** Kubernetes namespace */
  'k8s.namespace.name'?: string;

  /** Kubernetes deployment name */
  'k8s.deployment.name'?: string;

  /** Kubernetes pod name */
  'k8s.pod.name'?: string;

  /** Kubernetes container name */
  'k8s.container.name'?: string;

  /** Kubernetes node name */
  'k8s.node.name'?: string;

  /** Database system */
  'db.system'?: string;

  /** Database name */
  'db.name'?: string;

  /** Host name */
  'host.name'?: string;

  /** Host ID */
  'host.id'?: string;

  /** Cloud provider */
  'cloud.provider'?: string;

  /** Cloud region */
  'cloud.region'?: string;

  /** Messaging system */
  'messaging.system'?: string;

  /** Messaging destination name */
  'messaging.destination.name'?: string;

  /**
   * Instrumentation scopes owned by this service
   *
   * Lists the tracer/instrumentation scope names that belong to this service.
   * Spans from these scopes will be matched against this service's storyboards
   * rather than looking up external registries.
   *
   * Scope names must reference scopes defined in the top-level `scopes` section.
   *
   * @example
   * ```yaml
   * scopes:
   *   auth-flow:
   *     color: "#DC2626"
   *     description: "Authentication flow instrumentation"
   *
   * resources:
   *   auth-service:
   *     service.name: "auth-service"
   *     owned-scopes:
   *       - "auth-flow"
   * ```
   */
  'owned-scopes'?: OwnedScopes;

  /** Allow arbitrary OTEL resource attributes */
  [key: string]: string | string[] | undefined;
}


// ============================================================================
// Component Library Root Type
// ============================================================================

/**
 * Root type for a component library file (.yaml or .json).
 *
 * Example library.yaml:
 * ```yaml
 * version: "1.0.0"
 * name: "My Service"
 * description: "OTEL instrumentation configuration"
 *
 * resources:
 *   auth-service:
 *     service.name: "auth-service"
 *     service.version: "1.0.0"
 *     deployment.environment: "production"
 *     owned-scopes:
 *       - "auth-flow"
 *
 * eventSchemas:
 *   user.login.success:
 *     description: "User successfully logged in"
 *     attributes:
 *       user.id:
 *         type: string
 *         required: true
 *       session.id:
 *         type: string
 *         required: true
 * ```
 *
 * Note: Scope visual metadata (colors, icons) are now defined in .scopes.canvas files.
 * The `owned-scopes` field in resources is used for telemetry routing only.
 */
export interface ComponentLibrary {
  /** Library schema version */
  version: string;

  /** Library name */
  name: string;

  /** Library description */
  description?: string;

  /**
   * Service resource registry
   *
   * Defines the services in this package and their expected OTEL resource attributes.
   * Each service configures its own resources at runtime (via env vars or SDK),
   * but declaring them here provides:
   * - Service documentation/registry
   * - Expected resource schema for validation
   * - Dev instrumentation defaults
   * - Canvas node generation
   *
   * The key is a service identifier (used for reference), and the value contains
   * the OTEL resource attributes for that service.
   *
   * @example
   * ```yaml
   * resources:
   *   payment-api:
   *     service.name: "payment-api"
   *     service.version: "1.0.0"
   *     deployment.environment: "development"
   *
   *   payment-worker:
   *     service.name: "payment-worker"
   *     service.version: "1.0.0"
   *     deployment.environment: "development"
   * ```
   */
  resources?: Record<string, ResourceAttributes>;

  /**
   * Reusable event schema definitions
   *
   * Defines event schemas that can be referenced by canvas nodes via `pv.eventRef`.
   * This promotes reusability and consistency across canvases.
   *
   * @example
   * ```yaml
   * eventSchemas:
   *   auth.callback.started:
   *     description: "Authentication callback initiated"
   *     attributes:
   *       session.id:
   *         type: string
   *         required: true
   *         description: "Session identifier"
   * ```
   */
  eventSchemas?: Record<string, Omit<PVEventSchema, 'name'>>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Result of loading a component library
 */
export interface LibraryLoadResult {
  /** Whether the library was loaded successfully */
  success: boolean;

  /** The loaded library (if successful) */
  library?: ComponentLibrary;

  /** Error message (if failed) */
  error?: string;

  /** Path the library was loaded from */
  path: string;
}

/**
 * Options for the library loader
 */
export interface LibraryLoaderOptions {
  /** Base directory to search for library files */
  baseDir?: string;

  /** Custom library file name (default: "library.yaml" or "library.json") */
  fileName?: string;
}
