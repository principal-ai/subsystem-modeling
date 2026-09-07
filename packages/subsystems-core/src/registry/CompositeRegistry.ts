/**
 * CompositeRegistry - Routes between local and remote registries
 *
 * Decision logic:
 * 1. Check if scope is in local development mode
 * 2. If yes → use LocalRegistry
 * 3. If no → use RemoteRegistry
 *
 * This is the main registry implementation that should be used in production.
 */

import type { FileTree } from '@principal-ai/repository-abstraction';
import type { StoryboardRegistryInterface, ScopeLookupResult } from '../types/registered-trace';
import type { LocalRegistry } from './LocalRegistry';
import type { RemoteRegistry } from './RemoteRegistry';

/**
 * Composite registry that routes to local or remote
 */
export class CompositeRegistry implements StoryboardRegistryInterface {
  constructor(
    private localRegistry: LocalRegistry,
    private remoteRegistry: RemoteRegistry
  ) {}

  async lookupByScope(
    scope: { name: string; version: string },
    resource: { attributes?: Record<string, unknown> }
  ): Promise<ScopeLookupResult> {
    // Check if this is local development
    if (this.isLocalDevelopment(resource, scope)) {
      console.log('[CompositeRegistry] Using LocalRegistry for:', scope.name);
      return this.localRegistry.lookupByScope(scope, resource);
    }

    // Use remote registry for published libraries/services
    console.log('[CompositeRegistry] Using RemoteRegistry for:', scope.name);
    return this.remoteRegistry.lookupByScope(scope, resource);
  }

  /**
   * Determine if this scope is in local development mode
   */
  private isLocalDevelopment(
    resource: { attributes?: Record<string, unknown> },
    scope: { name: string; version: string }
  ): boolean {
    // Check for dev.mode flag
    if (resource.attributes?.['dev.mode'] === true) {
      console.log('[CompositeRegistry] Dev mode detected (dev.mode=true)');
      return true;
    }

    // Check for dev version patterns
    if (
      scope.version?.includes('-dev') ||
      scope.version?.includes('-local') ||
      scope.version === '0.0.0-dev'
    ) {
      console.log('[CompositeRegistry] Dev mode detected (dev version pattern):', scope.version);
      return true;
    }

    return false;
  }

  async listScopes(): Promise<Array<{ name: string; versions: string[] }>> {
    // Combine scopes from both registries
    const localScopes = await this.localRegistry.listScopes();
    const remoteScopes = await this.remoteRegistry.listScopes();

    // Merge, preferring local for conflicts
    const scopeMap = new Map<string, { name: string; versions: string[] }>();

    for (const scope of remoteScopes) {
      scopeMap.set(scope.name, scope);
    }

    for (const scope of localScopes) {
      scopeMap.set(scope.name, scope); // Local overrides remote
    }

    return Array.from(scopeMap.values());
  }

  supportsHotReload(): boolean {
    return this.localRegistry.supportsHotReload();
  }

  /**
   * Get the local registry (for workspace management)
   */
  getLocalRegistry(): LocalRegistry {
    return this.localRegistry;
  }

  /**
   * Get the remote registry (for cache management, etc.)
   */
  getRemoteRegistry(): RemoteRegistry {
    return this.remoteRegistry;
  }

  /**
   * Register a local workspace (convenience method)
   */
  async registerWorkspace(fileTree: FileTree): Promise<string[]> {
    return this.localRegistry.registerWorkspace(fileTree);
  }

  /**
   * Unregister a local workspace (convenience method)
   */
  unregisterWorkspace(scopeName: string): void {
    this.localRegistry.unregisterWorkspace(scopeName);
  }

  /**
   * Get list of registered local workspaces
   */
  getRegisteredWorkspaces(): Array<{ scopeName: string; fileTreeSha: string }> {
    return this.localRegistry.getRegisteredWorkspaces();
  }

  /**
   * Invalidate cache for a workspace (convenience method)
   *
   * Call this when .principal-views files change to trigger rebuild.
   */
  invalidateCache(scopeName: string): void {
    this.localRegistry.invalidateCache(scopeName);
  }

  /**
   * Cleanup: destroy local registry watchers
   */
  destroy(): void {
    this.localRegistry.destroy();
  }
}
