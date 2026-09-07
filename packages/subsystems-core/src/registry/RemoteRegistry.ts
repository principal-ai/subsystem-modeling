/**
 * RemoteRegistry - Calls web-ade API for published libraries
 *
 * Features:
 * - HTTP caching (immutable schematics)
 * - Handles PURL lookups (published libraries)
 * - Handles customerId + serviceName lookups (services)
 * - Version → commit hash resolution
 */

import type { StoryboardRegistryInterface, ScopeLookupResult } from '../types/registered-trace';
import type { VersionSnapshot } from '../types/version-registry';
import type { ResourceAttributes } from '../types/library';
import { getScopeNames } from '../scopes/utils';

/**
 * Version lookup response from web-ade API
 */
interface VersionLookupResponse {
  found: boolean;
  registration?: {
    customerId: string;
    serviceName: string;
    version: string;
    gitSHA: string;
    repositoryUrl: string;
    environment: string;
    deployedAt: string;
  };
  error?: string;
}

/**
 * Cache entry with expiration
 */
interface CacheEntry {
  snapshot: VersionSnapshot;
  expiresAt: number;
}

/**
 * PURL (Package URL) components
 */
interface PURLComponents {
  ecosystem: string; // npm, pypi, maven, golang
  namespace?: string; // org/scope name
  name: string; // package name
}

/**
 * Remote registry implementation
 */
export class RemoteRegistry implements StoryboardRegistryInterface {
  private cache = new Map<string, CacheEntry>();
  private scopeToSnapshotKey = new Map<string, string>();
  private cacheTTL: number;

  constructor(
    private apiBaseUrl: string,
    cacheTTL: number = 60 * 60 * 1000 // Default: 1 hour
  ) {
    this.cacheTTL = cacheTTL;
  }

  async lookupByScope(
    scope: { name: string; version: string },
    resource: { attributes?: Record<string, unknown> }
  ): Promise<ScopeLookupResult> {
    // First, check if this scope is owned by a cached schematic
    const owningCacheKey = this.scopeToSnapshotKey.get(scope.name);
    if (owningCacheKey) {
      const cached = this.cache.get(owningCacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        console.log('[RemoteRegistry] Scope found via owned-scopes mapping:', {
          scopeName: scope.name,
          cacheKey: owningCacheKey,
        });
        if (cached.snapshot.storyboards.length === 0) {
          return { found: false, reason: 'no_storyboards', scopeName: scope.name };
        }
        return { found: true, snapshot: cached.snapshot };
      }
      // Cache expired, remove stale mapping
      this.scopeToSnapshotKey.delete(scope.name);
    }

    // Check if this is a library (PURL format)
    if (scope.name.startsWith('pkg:')) {
      const snapshot = await this.lookupLibrary(scope.name, scope.version);
      if (!snapshot) {
        return { found: false, reason: 'scope_not_owned', scopeName: scope.name };
      }
      if (snapshot.storyboards.length === 0) {
        return { found: false, reason: 'no_storyboards', scopeName: scope.name };
      }
      return { found: true, snapshot };
    }

    // Otherwise it's a service - need customerId
    const customerId = resource.attributes?.['customer.id'] as string;
    if (!customerId) {
      console.warn(
        '[RemoteRegistry] Service scope requires customer.id in resource attributes:',
        { scopeName: scope.name }
      );
      return { found: false, reason: 'scope_not_owned', scopeName: scope.name };
    }

    const snapshot = await this.lookupService(customerId, scope.name, scope.version);
    if (!snapshot) {
      return { found: false, reason: 'scope_not_owned', scopeName: scope.name };
    }
    if (snapshot.storyboards.length === 0) {
      return { found: false, reason: 'no_storyboards', scopeName: scope.name };
    }
    return { found: true, snapshot };
  }

  /**
   * Lookup published library by PURL
   */
  private async lookupLibrary(purl: string, version: string): Promise<VersionSnapshot | null> {
    try {
      // Parse PURL to extract components
      const components = this.parsePURL(purl);
      if (!components) {
        console.error('[RemoteRegistry] Invalid PURL format:', purl);
        return null;
      }

      // Get repository URL from package registry
      const repoUrl = await this.getPackageRepository(components);
      if (!repoUrl) {
        console.error('[RemoteRegistry] Could not resolve repository for package:', purl);
        return null;
      }

      // Lookup version → commit hash
      const versionInfo = await this.lookupVersionMapping(repoUrl, version);
      if (!versionInfo) {
        return null;
      }

      // Fetch schematic by commit hash
      return this.fetchSchematic(repoUrl, versionInfo.gitSHA);
    } catch (error) {
      console.error('[RemoteRegistry] Library lookup failed:', error);
      return null;
    }
  }

  /**
   * Lookup service by customerId + serviceName
   */
  private async lookupService(
    customerId: string,
    serviceName: string,
    version: string
  ): Promise<VersionSnapshot | null> {
    try {
      // Lookup version → commit hash
      const url = new URL(`${this.apiBaseUrl}/api/versions/lookup`);
      url.searchParams.set('customerId', customerId);
      url.searchParams.set('serviceName', serviceName);
      url.searchParams.set('version', version);

      const response = await fetch(url.toString());
      if (!response.ok) {
        if (response.status === 404) {
          console.log('[RemoteRegistry] Version not found:', { customerId, serviceName, version });
          return null;
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data: VersionLookupResponse = await response.json();
      if (!data.found || !data.registration) {
        return null;
      }

      // Fetch schematic by commit hash
      return this.fetchSchematic(data.registration.repositoryUrl, data.registration.gitSHA);
    } catch (error) {
      console.error('[RemoteRegistry] Service lookup failed:', error);
      return null;
    }
  }

  /**
   * Lookup version mapping (version string → commit hash)
   */
  private async lookupVersionMapping(
    repositoryUrl: string,
    version: string
  ): Promise<{ gitSHA: string; repositoryUrl: string } | null> {
    try {
      // For libraries, we use repositoryUrl + version
      // The API expects this format for published packages
      const url = new URL(`${this.apiBaseUrl}/api/versions/lookup`);
      url.searchParams.set('repositoryUrl', repositoryUrl);
      url.searchParams.set('version', version);

      const response = await fetch(url.toString());
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data: VersionLookupResponse = await response.json();
      if (!data.found || !data.registration) {
        return null;
      }

      return {
        gitSHA: data.registration.gitSHA,
        repositoryUrl: data.registration.repositoryUrl,
      };
    } catch (error) {
      console.error('[RemoteRegistry] Version mapping lookup failed:', error);
      return null;
    }
  }

  /**
   * Fetch schematic by repository URL and commit SHA
   */
  private async fetchSchematic(
    repositoryUrl: string,
    commitSha: string
  ): Promise<VersionSnapshot | null> {
    // Check cache first
    const cacheKey = `${repositoryUrl}@${commitSha}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.snapshot;
    }

    try {
      const url = new URL(`${this.apiBaseUrl}/api/versions/schematic`);
      url.searchParams.set('repositoryUrl', repositoryUrl);
      url.searchParams.set('commitSha', commitSha);

      const response = await fetch(url.toString());
      if (!response.ok) {
        if (response.status === 404) {
          console.log('[RemoteRegistry] Schematic not found:', { repositoryUrl, commitSha });
          return null;
        }
        throw new Error(`API error: ${response.status}`);
      }

      const snapshot: VersionSnapshot = await response.json();

      // Cache the result
      this.cache.set(cacheKey, {
        snapshot,
        expiresAt: Date.now() + this.cacheTTL,
      });

      // Register owned scopes for routing
      if (snapshot.resources) {
        this.registerOwnedScopes(cacheKey, snapshot.resources);
      }

      console.log('[RemoteRegistry] Schematic fetched:', {
        repositoryUrl,
        commitSha,
        storyboardCount: snapshot.storyboards.length,
        ownedScopes: this.getOwnedScopesFromResources(snapshot.resources),
      });

      return snapshot;
    } catch (error) {
      console.error('[RemoteRegistry] Schematic fetch failed:', error);
      return null;
    }
  }

  /**
   * Parse PURL string into components
   *
   * Format: pkg:ecosystem/namespace/name
   * Examples:
   *   pkg:npm/@acme/auth-library
   *   pkg:pypi/acme-auth-library
   *   pkg:maven/com.acme/auth-library
   *   pkg:golang/github.com/acme/auth-lib
   */
  private parsePURL(purl: string): PURLComponents | null {
    const match = purl.match(/^pkg:([^/]+)\/(.+)$/);
    if (!match) {
      return null;
    }

    const ecosystem = match[1];
    const rest = match[2];

    // Handle scoped packages (e.g., @acme/package-name)
    const parts = rest.split('/');
    if (parts.length === 2) {
      return {
        ecosystem,
        namespace: parts[0],
        name: parts[1],
      };
    } else if (parts.length === 1) {
      return {
        ecosystem,
        name: parts[0],
      };
    }

    return null;
  }

  /**
   * Get repository URL from package registry metadata
   *
   * This queries the package registry (npm, pypi, etc.) to get the repository URL.
   */
  private async getPackageRepository(components: PURLComponents): Promise<string | null> {
    try {
      switch (components.ecosystem) {
        case 'npm':
          return this.getNpmRepository(components);
        case 'pypi':
          return this.getPypiRepository(components);
        default:
          console.warn('[RemoteRegistry] Unsupported ecosystem:', components.ecosystem);
          return null;
      }
    } catch (error) {
      console.error('[RemoteRegistry] Package repository lookup failed:', error);
      return null;
    }
  }

  /**
   * Get repository URL from npm registry
   */
  private async getNpmRepository(components: PURLComponents): Promise<string | null> {
    const packageName = components.namespace
      ? `${components.namespace}/${components.name}`
      : components.name;

    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const repoUrl = data.repository?.url || data.repository;

    if (!repoUrl) {
      return null;
    }

    // Clean up git URLs (git+https://github.com/... → https://github.com/...)
    return repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');
  }

  /**
   * Get repository URL from PyPI
   */
  private async getPypiRepository(components: PURLComponents): Promise<string | null> {
    const packageName = components.name;
    const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.info?.project_urls?.Source || data.info?.home_page || null;
  }

  async listScopes(): Promise<Array<{ name: string; versions: string[] }>> {
    console.warn('[RemoteRegistry] listScopes not implemented for remote registry');
    return [];
  }

  supportsHotReload(): boolean {
    return false;
  }

  /**
   * Register a schematic directly (for preloading)
   *
   * This is similar to LocalRegistry's registerWorkspace() - it allows you to
   * preload schematics before traces arrive, so the owned-scopes mapping is
   * already populated when lookupByScope is called.
   *
   * @param snapshot - The VersionSnapshot to register
   * @returns Array of registered scope names (from owned-scopes)
   *
   * @example
   * ```typescript
   * // Fetch schematic from your API
   * const response = await fetch('/api/schematics/my-panel');
   * const snapshot = await response.json();
   *
   * // Register it with RemoteRegistry
   * const scopes = registry.registerSchematic(snapshot);
   * console.log('Registered scopes:', scopes);
   * // Now traces with these scopes will match this schematic's storyboards
   * ```
   */
  registerSchematic(snapshot: VersionSnapshot): string[] {
    const cacheKey = `${snapshot.repositoryUrl}@${snapshot.commitSha}`;

    // Cache the snapshot
    this.cache.set(cacheKey, {
      snapshot,
      expiresAt: Date.now() + this.cacheTTL,
    });

    // Register owned scopes (supports both legacy array and new record format)
    const registeredScopes: string[] = [];
    if (snapshot.resources) {
      for (const [_resourceName, attrs] of Object.entries(snapshot.resources)) {
        const scopeNames = getScopeNames(attrs['owned-scopes']);
        for (const scope of scopeNames) {
          this.scopeToSnapshotKey.set(scope, cacheKey);
          registeredScopes.push(scope);
        }
      }
    }

    console.log('[RemoteRegistry] Registered schematic:', {
      cacheKey,
      storyboardCount: snapshot.storyboards?.length || 0,
      registeredScopes,
    });

    return registeredScopes;
  }

  /**
   * Register owned scopes from a schematic's resources
   *
   * This builds a mapping from instrumentation scope names to their owning
   * schematic cache key. When a trace comes in with a scope listed in
   * `owned-scopes`, we can route it to the correct storyboards without
   * needing a separate lookup.
   */
  private registerOwnedScopes(
    cacheKey: string,
    resources: Record<string, ResourceAttributes>
  ): void {
    for (const [_resourceName, attrs] of Object.entries(resources)) {
      const scopeNames = getScopeNames(attrs['owned-scopes']);
      for (const scope of scopeNames) {
        this.scopeToSnapshotKey.set(scope, cacheKey);
        console.log('[RemoteRegistry] Registered owned scope:', {
          scope,
          cacheKey,
        });
      }
    }
  }

  /**
   * Extract all owned scopes from resources (for logging)
   */
  private getOwnedScopesFromResources(
    resources?: Record<string, ResourceAttributes>
  ): string[] {
    if (!resources) return [];
    const scopes: string[] = [];
    for (const attrs of Object.values(resources)) {
      scopes.push(...getScopeNames(attrs['owned-scopes']));
    }
    return scopes;
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
    this.scopeToSnapshotKey.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; ttl: number; ownedScopesCount: number } {
    return {
      size: this.cache.size,
      ttl: this.cacheTTL,
      ownedScopesCount: this.scopeToSnapshotKey.size,
    };
  }
}
