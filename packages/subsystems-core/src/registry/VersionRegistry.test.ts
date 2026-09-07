/**
 * Tests for InMemoryVersionRegistry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryVersionRegistry, createInMemoryVersionRegistry } from './VersionRegistry';
import type { RegisterVersionRequest } from '../types/version-registry';

describe('InMemoryVersionRegistry', () => {
  let registry: InMemoryVersionRegistry;

  beforeEach(() => {
    registry = createInMemoryVersionRegistry();
  });

  describe('register', () => {
    it('should register a new version', async () => {
      const request: RegisterVersionRequest = {
        repositoryUrl: 'https://github.com/test/repo',
        commitSha: 'abc123',
        storyboards: [
          {
            id: 'test-storyboard',
            name: 'Test Storyboard',
            path: '.principal-views/test.otel.canvas',
            basename: 'test',
            scope: 'root',
            canvas: {
              id: 'test',
              name: 'Test',
              path: '.principal-views/test.otel.canvas',
              basename: 'test',
              type: 'otel',
              scope: 'root',
            },
            workflows: [],
          },
        ],
      };

      await registry.register(request);

      const response = await registry.get('https://github.com/test/repo', 'abc123');
      expect(response.found).toBe(true);
      expect(response.snapshot).toBeDefined();
      expect(response.snapshot?.repositoryUrl).toBe('https://github.com/test/repo');
      expect(response.snapshot?.commitSha).toBe('abc123');
      expect(response.snapshot?.storyboards).toHaveLength(1);
      expect(response.snapshot?.registeredAt).toBeDefined();
    });

    it('should overwrite existing version with same repository and commit', async () => {
      const request1: RegisterVersionRequest = {
        repositoryUrl: 'https://github.com/test/repo',
        commitSha: 'abc123',
        storyboards: [],
      };

      const request2: RegisterVersionRequest = {
        repositoryUrl: 'https://github.com/test/repo',
        commitSha: 'abc123',
        storyboards: [
          {
            id: 'new-storyboard',
            name: 'New Storyboard',
            path: '.principal-views/new.otel.canvas',
            basename: 'new',
            scope: 'root',
            canvas: {
              id: 'new',
              name: 'New',
              path: '.principal-views/new.otel.canvas',
              basename: 'new',
              type: 'otel',
              scope: 'root',
            },
            workflows: [],
          },
        ],
      };

      await registry.register(request1);
      await registry.register(request2);

      const response = await registry.get('https://github.com/test/repo', 'abc123');
      expect(response.found).toBe(true);
      expect(response.snapshot?.storyboards).toHaveLength(1);
      expect(response.snapshot?.storyboards[0].id).toBe('new-storyboard');
    });
  });

  describe('get', () => {
    it('should return found=false when version does not exist', async () => {
      const response = await registry.get('https://github.com/test/repo', 'nonexistent');
      expect(response.found).toBe(false);
      expect(response.snapshot).toBeUndefined();
      expect(response.error).toBeDefined();
    });

    it('should return found=true when version exists', async () => {
      const request: RegisterVersionRequest = {
        repositoryUrl: 'https://github.com/test/repo',
        commitSha: 'abc123',
        storyboards: [],
      };

      await registry.register(request);

      const response = await registry.get('https://github.com/test/repo', 'abc123');
      expect(response.found).toBe(true);
      expect(response.snapshot).toBeDefined();
    });
  });

  describe('exists', () => {
    it('should return false when version does not exist', async () => {
      const exists = await registry.exists('https://github.com/test/repo', 'nonexistent');
      expect(exists).toBe(false);
    });

    it('should return true when version exists', async () => {
      const request: RegisterVersionRequest = {
        repositoryUrl: 'https://github.com/test/repo',
        commitSha: 'abc123',
        storyboards: [],
      };

      await registry.register(request);

      const exists = await registry.exists('https://github.com/test/repo', 'abc123');
      expect(exists).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete a version', async () => {
      const request: RegisterVersionRequest = {
        repositoryUrl: 'https://github.com/test/repo',
        commitSha: 'abc123',
        storyboards: [],
      };

      await registry.register(request);
      expect(await registry.exists('https://github.com/test/repo', 'abc123')).toBe(true);

      await registry.delete('https://github.com/test/repo', 'abc123');
      expect(await registry.exists('https://github.com/test/repo', 'abc123')).toBe(false);
    });

    it('should not throw when deleting non-existent version', async () => {
      await expect(
        registry.delete('https://github.com/test/repo', 'nonexistent')
      ).resolves.toBeUndefined();
    });
  });

  describe('listVersions', () => {
    it('should return empty array when no versions exist', async () => {
      const versions = await registry.listVersions('https://github.com/test/repo');
      expect(versions).toEqual([]);
    });

    it('should return all versions for a repository', async () => {
      await registry.register({
        repositoryUrl: 'https://github.com/test/repo',
        commitSha: 'abc123',
        storyboards: [],
      });

      await registry.register({
        repositoryUrl: 'https://github.com/test/repo',
        commitSha: 'def456',
        storyboards: [],
      });

      await registry.register({
        repositoryUrl: 'https://github.com/other/repo',
        commitSha: 'xyz789',
        storyboards: [],
      });

      const versions = await registry.listVersions('https://github.com/test/repo');
      expect(versions).toHaveLength(2);
      expect(versions[0].commitSha).toBe('abc123');
      expect(versions[1].commitSha).toBe('def456');
    });

    it('should return sorted versions', async () => {
      await registry.register({
        repositoryUrl: 'https://github.com/test/repo',
        commitSha: 'zzz',
        storyboards: [],
      });

      await registry.register({
        repositoryUrl: 'https://github.com/test/repo',
        commitSha: 'aaa',
        storyboards: [],
      });

      const versions = await registry.listVersions('https://github.com/test/repo');
      expect(versions[0].commitSha).toBe('aaa');
      expect(versions[1].commitSha).toBe('zzz');
    });
  });

  describe('clear', () => {
    it('should clear all versions', async () => {
      await registry.register({
        repositoryUrl: 'https://github.com/test/repo',
        commitSha: 'abc123',
        storyboards: [],
      });

      expect(registry.size).toBe(1);

      registry.clear();

      expect(registry.size).toBe(0);
      expect(await registry.exists('https://github.com/test/repo', 'abc123')).toBe(false);
    });
  });
});
