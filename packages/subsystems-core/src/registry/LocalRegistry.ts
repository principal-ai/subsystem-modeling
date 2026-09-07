/**
 * LocalRegistry - Browser-safe registry for local workspaces
 *
 * Features:
 * - Uses FileTree abstraction (browser-safe)
 * - No version registry lookups (uses FileTree directly)
 * - Cache invalidation via external triggers
 * - Supports multiple registered workspaces
 * - Auto-discovers scope names from library.yaml resources
 *
 * Note: File watching must be handled externally by calling invalidateCache()
 * when .principal-views files change.
 */

import type { FileTree, FileSystemAdapter } from '@principal-ai/repository-abstraction';
import type { StoryboardRegistryInterface, ScopeLookupResult } from '../types/registered-trace';
import type { VersionSnapshot } from '../types/version-registry';
import { CanvasDiscovery } from '../discovery/CanvasDiscovery';
import { LibraryDiscovery } from '../discovery/LibraryDiscovery';

/**
 * File reader function type
 */
export type FileReader = (path: string) => Promise<string>;

/**
 * Workspace registration
 */
interface WorkspaceRegistration {
  workspaceId: string;
  fileTree: FileTree;
  fileTreeSha: string; // SHA of the fileTree when scopes were discovered
  serviceNames: string[]; // Service names (from service.name attribute)
  ownedScopes: string[]; // All owned instrumentation scopes
}

/**
 * Local registry for development mode
 */
export class LocalRegistry implements StoryboardRegistryInterface {
  private cache = new Map<string, VersionSnapshot>();
  private workspaces = new Map<string, WorkspaceRegistration>(); // workspaceId → registration
  private scopeToWorkspaceId = new Map<string, string>(); // scopeName → workspaceId
  private discovery: CanvasDiscovery;
  private libraryDiscovery: LibraryDiscovery | null = null;

  constructor(
    private fileReader: FileReader,
    fsAdapter?: FileSystemAdapter
  ) {
    this.discovery = new CanvasDiscovery();
    if (fsAdapter) {
      this.libraryDiscovery = new LibraryDiscovery(fsAdapter);
    }
  }

  /**
   * Register a local workspace
   *
   * Auto-discovers service names and owned scopes from library.yaml resources section.
   * Each service in resources with a service.name becomes a registered scope.
   * Additionally, owned-scopes from each service are mapped to their owning service.
   *
   * File watching should be handled externally. When .principal-views files change,
   * call invalidateCache(scopeName) to rebuild the snapshot.
   *
   * @param fileTree - FileTree for the workspace
   * @returns Array of all registered scope names (services + owned scopes)
   */
  async registerWorkspace(fileTree: FileTree): Promise<string[]> {
    // Use stable identifier: rootPath (repository path) or sha (content hash)
    // Note: metadata.id includes a timestamp suffix making it unique per build,
    // which would cause duplicate registrations on every file tree update
    const workspaceId =
      (fileTree.metadata.sourceInfo?.rootPath as string) || fileTree.sha || fileTree.metadata.id;

    // Check if already registered
    if (this.workspaces.has(workspaceId)) {
      const existing = this.workspaces.get(workspaceId)!;
      const currentSha = fileTree.sha || '';

      // Check if fileTree content changed (different SHA)
      if (existing.fileTreeSha !== currentSha) {
        console.log('[LocalRegistry] Workspace content changed, re-discovering scopes:', {
          workspaceId,
          oldSha: existing.fileTreeSha,
          newSha: currentSha,
        });

        // Re-discover scope names from updated library.yaml
        const { serviceNames, ownedScopes, scopeToServiceMap } = await this.discoverScopesInfo(fileTree);

        // Clear old scope mappings
        for (const scopeName of [...existing.serviceNames, ...existing.ownedScopes]) {
          this.scopeToWorkspaceId.delete(scopeName);
        }

        // Update registration with new scope info
        existing.fileTree = fileTree;
        existing.fileTreeSha = currentSha;
        existing.serviceNames = serviceNames;
        existing.ownedScopes = ownedScopes;

        // Update scope-to-workspace mapping with new scopes
        for (const [scopeName] of scopeToServiceMap) {
          this.scopeToWorkspaceId.set(scopeName, workspaceId);
        }

        console.log('[LocalRegistry] Updated workspace registration:', {
          workspaceId,
          serviceNames,
          ownedScopes,
          fileTreeSha: currentSha,
        });

        return [...new Set([...serviceNames, ...ownedScopes])];
      }

      console.log('[LocalRegistry] Workspace already registered (no changes):', workspaceId);
      // Update the fileTree reference to the latest version
      existing.fileTree = fileTree;
      return [...new Set([...existing.serviceNames, ...existing.ownedScopes])];
    }

    // Auto-discover service names and owned scopes from library.yaml
    const { serviceNames, ownedScopes, scopeToServiceMap } = await this.discoverScopesInfo(fileTree);

    if (serviceNames.length === 0) {
      console.warn('[LocalRegistry] No service names discovered for workspace:', workspaceId);
      console.warn('[LocalRegistry] Make sure library.yaml has a resources section with service.name attributes');
    }

    // Register workspace
    this.workspaces.set(workspaceId, {
      workspaceId,
      fileTree,
      fileTreeSha: fileTree.sha || '',
      serviceNames,
      ownedScopes,
    });

    // Map all scope names (services + owned scopes) to this workspace
    for (const [scopeName] of scopeToServiceMap) {
      this.scopeToWorkspaceId.set(scopeName, workspaceId);
    }

    console.log('[LocalRegistry] Registered workspace:', {
      workspaceId,
      serviceNames,
      ownedScopes,
      fileTreeSha: fileTree.sha,
    });

    return [...new Set([...serviceNames, ...ownedScopes])];
  }

  /**
   * Unregister a workspace (cleanup)
   * @param workspaceId - Workspace ID (rootPath, sha, or metadata.id)
   */
  unregisterWorkspace(workspaceId: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return;
    }

    // Clear cache for all scope names (services + owned scopes)
    const allScopes = [...workspace.serviceNames, ...workspace.ownedScopes];
    for (const scopeName of allScopes) {
      this.cache.delete(scopeName);
      this.scopeToWorkspaceId.delete(scopeName);
    }

    // Remove registration
    this.workspaces.delete(workspaceId);

    console.log('[LocalRegistry] Unregistered workspace:', {
      workspaceId,
      serviceNames: workspace.serviceNames,
      ownedScopes: workspace.ownedScopes,
    });
  }

  async lookupByScope(
    scope: { name: string; version: string },
    _resource: { attributes?: Record<string, unknown> }
  ): Promise<ScopeLookupResult> {
    // Map scope name to workspace ID
    const workspaceId = this.scopeToWorkspaceId.get(scope.name);
    if (!workspaceId) {
      console.log('[LocalRegistry] No workspace registered for scope:', scope.name);
      return { found: false, reason: 'scope_not_owned', scopeName: scope.name };
    }

    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      console.error('[LocalRegistry] Workspace not found:', workspaceId);
      return { found: false, reason: 'scope_not_owned', scopeName: scope.name };
    }

    // Check cache first (cache by scope name for granularity)
    const cacheKey = scope.name;
    if (this.cache.has(cacheKey)) {
      const cachedSnapshot = this.cache.get(cacheKey)!;
      if (cachedSnapshot.storyboards.length === 0) {
        return { found: false, reason: 'no_storyboards', scopeName: scope.name };
      }
      return { found: true, snapshot: cachedSnapshot };
    }

    // Build VersionSnapshot from FileTree
    const snapshot = await this.buildFromFileTree(workspace.fileTree);

    // Cache it
    this.cache.set(cacheKey, snapshot);

    // Check if storyboards were found
    if (snapshot.storyboards.length === 0) {
      return { found: false, reason: 'no_storyboards', scopeName: scope.name };
    }

    return { found: true, snapshot };
  }

  /**
   * Auto-discover service names and owned scopes from library.yaml files
   *
   * Uses LibraryDiscovery to find all library.yaml files across packages
   * and extract service.name and owned-scopes from their resources sections.
   *
   * @param fileTree - FileTree to discover scopes from
   * @returns Object with serviceNames, ownedScopes, and scopeToServiceMap
   */
  private async discoverScopesInfo(fileTree: FileTree): Promise<{
    serviceNames: string[];
    ownedScopes: string[];
    scopeToServiceMap: Map<string, string>;
  }> {
    if (!this.libraryDiscovery) {
      console.warn('[LocalRegistry] No LibraryDiscovery available - provide FileSystemAdapter to constructor');
      return { serviceNames: [], ownedScopes: [], scopeToServiceMap: new Map() };
    }

    try {
      const result = await this.libraryDiscovery.discover(fileTree, {
        fileReader: this.fileReader,
      });

      if (result.errors.length > 0) {
        console.warn('[LocalRegistry] Errors during library discovery:', result.errors);
      }

      // Collect all owned scopes across all services (deduplicated)
      const ownedScopesSet = new Set<string>();
      for (const lib of result.libraries) {
        for (const service of lib.servicesWithScopes) {
          for (const scope of service.ownedScopes) {
            ownedScopesSet.add(scope);
          }
        }
      }
      const ownedScopes = [...ownedScopesSet];

      console.log('[LocalRegistry] Discovered services and scopes:', {
        serviceNames: result.allServiceNames,
        ownedScopes,
        scopeToServiceMapSize: result.scopeToServiceMap.size,
      });

      return {
        serviceNames: result.allServiceNames,
        ownedScopes,
        scopeToServiceMap: result.scopeToServiceMap,
      };
    } catch (error) {
      console.error('[LocalRegistry] Failed to discover scopes:', error);
      return { serviceNames: [], ownedScopes: [], scopeToServiceMap: new Map() };
    }
  }

  /**
   * Build VersionSnapshot from FileTree using CanvasDiscovery
   */
  private async buildFromFileTree(fileTree: FileTree): Promise<VersionSnapshot> {
    // Use CanvasDiscovery to find all storyboards
    const discoveryResult = await this.discovery.discover(fileTree, {
      fileReader: this.fileReader,
      includeContent: true,
    });

    const snapshot: VersionSnapshot = {
      repositoryUrl: 'local',
      commitSha: fileTree.sha || 'dev',
      storyboards: discoveryResult.storyboards,
      registeredAt: new Date().toISOString(),
      metadata: {
        environment: 'development',
        isLocal: true,
      },
    };

    // Log errors if any
    if (discoveryResult.errors.length > 0) {
      console.warn('[LocalRegistry] Discovery errors:', discoveryResult.errors);
    }

    return snapshot;
  }

  /**
   * Invalidate cache for a scope
   *
   * Call this when .principal-views files change to trigger rebuild on next lookup.
   * Debouncing should be handled by external file watcher if needed.
   */
  invalidateCache(scopeName: string): void {
    this.cache.delete(scopeName);
    console.log('[LocalRegistry] Cache invalidated:', scopeName);
  }

  async listScopes(): Promise<Array<{ name: string; versions: string[] }>> {
    const scopes: Array<{ name: string; versions: string[] }> = [];

    for (const workspace of this.workspaces.values()) {
      // Include service names and owned scopes
      const allScopes = [...workspace.serviceNames, ...workspace.ownedScopes];
      for (const scopeName of allScopes) {
        scopes.push({
          name: scopeName,
          versions: ['dev'], // Local workspaces always use 'dev' version
        });
      }
    }

    return scopes;
  }

  supportsHotReload(): boolean {
    return true;
  }

  /**
   * Get list of registered workspaces
   */
  getRegisteredWorkspaces(): Array<{ scopeName: string; fileTreeSha: string }> {
    const workspaces: Array<{ scopeName: string; fileTreeSha: string }> = [];

    for (const workspace of this.workspaces.values()) {
      // Include service names and owned scopes
      const allScopes = [...workspace.serviceNames, ...workspace.ownedScopes];
      for (const scopeName of allScopes) {
        workspaces.push({
          scopeName,
          fileTreeSha: workspace.fileTree.sha || 'unknown',
        });
      }
    }

    return workspaces;
  }

  /**
   * Get all cached VersionSnapshots
   *
   * Returns snapshots that have been built and cached via lookupByScope().
   * Note: This only returns snapshots that have been looked up at least once.
   * Call lookupByScope() for each scope to ensure all snapshots are cached.
   */
  getAllSnapshots(): VersionSnapshot[] {
    return Array.from(this.cache.values());
  }

  /**
   * Get all snapshots for all registered scopes
   *
   * Unlike getAllSnapshots(), this method ensures all registered scopes
   * have their snapshots built and cached before returning.
   * Note: Returns one snapshot per workspace (not per scope).
   */
  async getAllSnapshotsForRegisteredScopes(): Promise<VersionSnapshot[]> {
    const snapshots: VersionSnapshot[] = [];
    const seenWorkspaceIds = new Set<string>();

    for (const workspace of this.workspaces.values()) {
      // Only build one snapshot per workspace
      if (seenWorkspaceIds.has(workspace.workspaceId)) continue;
      seenWorkspaceIds.add(workspace.workspaceId);

      // Use first service name to trigger snapshot build
      const firstServiceName = workspace.serviceNames[0];
      if (firstServiceName) {
        const result = await this.lookupByScope(
          { name: firstServiceName, version: 'dev' },
          {}
        );
        if (result.found) {
          snapshots.push(result.snapshot);
        }
      }
    }

    return snapshots;
  }

  /**
   * Cleanup: clear all state
   */
  destroy(): void {
    console.log('[LocalRegistry] Destroying and clearing state...');

    // Clear state
    this.workspaces.clear();
    this.cache.clear();
    this.discovery.clearCache();
  }
}
