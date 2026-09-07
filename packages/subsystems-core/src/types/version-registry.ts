/**
 * Version Registry Types
 *
 * Defines the data structures for storing and retrieving versioned storyboard snapshots.
 * The version registry indexes storyboards by repository URL and commit SHA, allowing
 * traces to reference the exact workflow definitions that were active at the time of execution.
 */

import type { DiscoveredStoryboard } from '../discovery/types';
import type { ComponentLibrary, ResourceAttributes } from './library';

/**
 * Version identifier combining repository URL and commit SHA
 */
export interface VersionIdentifier {
  /** Git repository URL (e.g., "https://github.com/org/repo") */
  repositoryUrl: string;
  /** Git commit SHA (full 40-character hash) */
  commitSha: string;
}

/**
 * Complete snapshot of storyboards at a specific version
 *
 * This should be stored in the version registry when a version is built/deployed,
 * and retrieved when processing traces that reference this version.
 */
export interface VersionSnapshot extends VersionIdentifier {
  /**
   * Complete storyboard definitions as discovered from the codebase at this version.
   * Includes all metadata: canvas info, workflow paths, package names, etc.
   */
  storyboards: DiscoveredStoryboard[];

  /**
   * Library metadata from library.yaml
   *
   * Contains the library name, version, and description for identification.
   */
  library?: Pick<ComponentLibrary, 'version' | 'name' | 'description'>;

  /**
   * Resource definitions with owned-scopes for scope routing
   *
   * Maps resource identifiers to their OTEL resource attributes.
   * The `owned-scopes` field in each resource is used to route
   * instrumentation scopes to this snapshot's storyboards.
   *
   * @example
   * ```yaml
   * resources:
   *   web-ade:
   *     service.name: "web-ade"
   *     owned-scopes:
   *       - "auth-me"
   *       - "@backlog-md/core"
   * ```
   */
  resources?: Record<string, ResourceAttributes>;

  /** When this version was registered */
  registeredAt?: string;

  /** Optional metadata about the build/deployment */
  metadata?: {
    /** Build/deployment environment (e.g., "production", "staging") */
    environment?: string;
    /** Branch name */
    branch?: string;
    /** Git tag if applicable */
    tag?: string;
    /** Additional custom metadata */
    [key: string]: unknown;
  };
}

/**
 * Request to register a new version in the registry
 */
export interface RegisterVersionRequest {
  /** Repository URL */
  repositoryUrl: string;
  /** Commit SHA */
  commitSha: string;
  /** Discovered storyboards from this version */
  storyboards: DiscoveredStoryboard[];
  /** Optional metadata */
  metadata?: VersionSnapshot['metadata'];
}

/**
 * Response from querying the version registry
 */
export interface GetVersionResponse {
  /** Whether the version was found */
  found: boolean;
  /** Version snapshot if found */
  snapshot?: VersionSnapshot;
  /** Error message if not found or error occurred */
  error?: string;
}

/**
 * Version registry interface
 *
 * Implementations might use:
 * - A database (PostgreSQL, MongoDB, etc.)
 * - A key-value store (Redis, DynamoDB)
 * - A file-based registry (S3, local filesystem)
 * - An in-memory cache for testing
 */
export interface VersionRegistry {
  /**
   * Register a new version snapshot
   * @param request - Version registration request
   * @returns Promise that resolves when registered
   */
  register(request: RegisterVersionRequest): Promise<void>;

  /**
   * Get a version snapshot by repository URL and commit SHA
   * @param repositoryUrl - Repository URL
   * @param commitSha - Commit SHA
   * @returns Promise with version snapshot if found
   */
  get(repositoryUrl: string, commitSha: string): Promise<GetVersionResponse>;

  /**
   * Check if a version exists in the registry
   * @param repositoryUrl - Repository URL
   * @param commitSha - Commit SHA
   * @returns Promise with boolean indicating if version exists
   */
  exists(repositoryUrl: string, commitSha: string): Promise<boolean>;

  /**
   * Delete a version from the registry (for cleanup)
   * @param repositoryUrl - Repository URL
   * @param commitSha - Commit SHA
   * @returns Promise that resolves when deleted
   */
  delete?(repositoryUrl: string, commitSha: string): Promise<void>;

  /**
   * List all versions for a repository (optional, for debugging/admin)
   * @param repositoryUrl - Repository URL
   * @returns Promise with array of version identifiers
   */
  listVersions?(repositoryUrl: string): Promise<VersionIdentifier[]>;
}
