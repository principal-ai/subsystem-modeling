/**
 * In-Memory Version Registry Implementation
 *
 * This is a simple in-memory implementation of the VersionRegistry interface,
 * useful for testing and development. For production use, implement a persistent
 * backend (database, S3, etc.).
 */

import type {
  VersionRegistry,
  VersionSnapshot,
  RegisterVersionRequest,
  GetVersionResponse,
  VersionIdentifier,
} from '../types/version-registry';

/**
 * In-memory version registry for testing and development
 */
export class InMemoryVersionRegistry implements VersionRegistry {
  private versions: Map<string, VersionSnapshot> = new Map();

  /**
   * Create a unique key for a version
   */
  private getKey(repositoryUrl: string, commitSha: string): string {
    return `${repositoryUrl}@${commitSha}`;
  }

  /**
   * Register a new version snapshot
   */
  async register(request: RegisterVersionRequest): Promise<void> {
    const key = this.getKey(request.repositoryUrl, request.commitSha);

    const snapshot: VersionSnapshot = {
      repositoryUrl: request.repositoryUrl,
      commitSha: request.commitSha,
      storyboards: request.storyboards,
      registeredAt: new Date().toISOString(),
      metadata: request.metadata,
    };

    this.versions.set(key, snapshot);
  }

  /**
   * Get a version snapshot by repository URL and commit SHA
   */
  async get(repositoryUrl: string, commitSha: string): Promise<GetVersionResponse> {
    const key = this.getKey(repositoryUrl, commitSha);
    const snapshot = this.versions.get(key);

    if (!snapshot) {
      return {
        found: false,
        error: `Version not found: ${repositoryUrl}@${commitSha}`,
      };
    }

    return {
      found: true,
      snapshot,
    };
  }

  /**
   * Check if a version exists in the registry
   */
  async exists(repositoryUrl: string, commitSha: string): Promise<boolean> {
    const key = this.getKey(repositoryUrl, commitSha);
    return this.versions.has(key);
  }

  /**
   * Delete a version from the registry
   */
  async delete(repositoryUrl: string, commitSha: string): Promise<void> {
    const key = this.getKey(repositoryUrl, commitSha);
    this.versions.delete(key);
  }

  /**
   * List all versions for a repository
   */
  async listVersions(repositoryUrl: string): Promise<VersionIdentifier[]> {
    const versions: VersionIdentifier[] = [];

    for (const [_key, snapshot] of this.versions.entries()) {
      if (snapshot.repositoryUrl === repositoryUrl) {
        versions.push({
          repositoryUrl: snapshot.repositoryUrl,
          commitSha: snapshot.commitSha,
        });
      }
    }

    return versions.sort((a, b) => a.commitSha.localeCompare(b.commitSha));
  }

  /**
   * Clear all versions (for testing)
   */
  clear(): void {
    this.versions.clear();
  }

  /**
   * Get the number of versions in the registry (for testing)
   */
  get size(): number {
    return this.versions.size;
  }
}

/**
 * Create a new in-memory version registry
 */
export function createInMemoryVersionRegistry(): InMemoryVersionRegistry {
  return new InMemoryVersionRegistry();
}
