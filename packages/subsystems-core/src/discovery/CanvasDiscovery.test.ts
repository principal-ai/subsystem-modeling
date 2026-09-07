import { describe, expect, test, beforeEach } from 'bun:test';
import { CanvasDiscovery } from './CanvasDiscovery';
import type { DiscoveredCanvasWithContent } from './types';
import type { FileTree, FileInfo, DirectoryInfo } from '@principal-ai/repository-abstraction';

describe('CanvasDiscovery', () => {
  let discovery: CanvasDiscovery;

  beforeEach(() => {
    discovery = new CanvasDiscovery();
  });

  describe('discover() - Canvas Files', () => {
    test('discovers canvas files in repository root', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/my-flow.canvas',
        '.principal-views/api-flow.otel.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.canvases).toHaveLength(2);
      expect(result.canvases[0]).toMatchObject({
        id: 'api-flow.otel', // non-regular types get suffix to prevent ID collisions
        name: 'Api Flow',
        basename: 'api-flow',
        type: 'otel',
        scope: 'root',
        packageName: undefined,
      });
      expect(result.canvases[1]).toMatchObject({
        id: 'my-flow',
        name: 'My Flow',
        basename: 'my-flow',
        type: 'regular',
        scope: 'root',
      });
    });

    test('discovers canvas files in packages with package prefix', async () => {
      const fileTree = createMockFileTree([
        'packages/subsystems-core/.principal-views/auth-flow.canvas',
        'packages/api/.principal-views/request-flow.otel.canvas',
        'packages/subsystems-core/package.json',
        'packages/api/package.json',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (path) => {
          if (path.endsWith('core/package.json')) {
            return JSON.stringify({ name: 'core' });
          }
          if (path.endsWith('api/package.json')) {
            return JSON.stringify({ name: 'api' });
          }
          return '';
        },
      });

      expect(result.canvases).toHaveLength(2);
      expect(result.canvases.map(c => c.id)).toEqual([
        'api/request-flow.otel', // non-regular types get suffix
        'core/auth-flow',
      ]);
      expect(result.canvases[0].packageName).toBe('api');
      expect(result.canvases[1].packageName).toBe('core');
    });

    test('handles mixed root and package canvas files', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/root-flow.canvas',
        'packages/subsystems-core/.principal-views/core-flow.canvas',
        'packages/subsystems-core/package.json',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (path) => {
          if (path.endsWith('package.json')) {
            return JSON.stringify({ name: 'core' });
          }
          return '';
        },
      });

      expect(result.canvases).toHaveLength(2);
      // Package canvases come first
      expect(result.canvases[0].id).toBe('core/core-flow');
      expect(result.canvases[0].scope).toBe('package');
      expect(result.canvases[1].id).toBe('root-flow');
      expect(result.canvases[1].scope).toBe('root');
    });

    test('correctly strips .otel.canvas extension', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/test.otel.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.canvases[0].basename).toBe('test');
      expect(result.canvases[0].type).toBe('otel');
      // ID includes type suffix to prevent collisions with regular canvas of same name
      expect(result.canvases[0].id).toBe('test.otel');
    });

    test('parses canvas content when fileReader and includeContent provided', async () => {
      const mockCanvas = { nodes: [], edges: [], pv: { name: 'Test' } };
      const fileTree = createMockFileTree([
        '.principal-views/test.canvas',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (_path) => JSON.stringify(mockCanvas),
        includeContent: true,
      });

      expect(result.canvases[0]).toHaveProperty('content');
      expect((result.canvases[0] as DiscoveredCanvasWithContent).content).toEqual(mockCanvas);
    });

    test('handles parse errors gracefully', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/bad.canvas',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (_path) => 'invalid json',
        includeContent: true,
      });

      expect(result.canvases).toHaveLength(1);
      // Parse error + required canvas validation error
      expect(result.errors).toHaveLength(2);
      expect(result.errors.some(e => e.path === '.principal-views/bad.canvas' && e.error.includes('JSON'))).toBe(true);
      expect(result.errors.some(e => e.error.includes('Missing required resources.canvas'))).toBe(true);
      // Flat .canvas files are now supported, so no deprecation error
      expect(result.storyboards).toHaveLength(1); // Should create a standalone storyboard
      expect(result.storyboards[0].workflows).toHaveLength(0); // No workflows for flat canvas
    });

    test('discovers hierarchical canvas files in storyboard subdirectories', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/checkout-flow/checkout-flow.otel.canvas',
        '.principal-views/user-flow/user-flow.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.canvases).toHaveLength(2);
      expect(result.canvases[0]).toMatchObject({
        id: 'checkout-flow.otel', // non-regular types get suffix
        name: 'Checkout Flow',
        basename: 'checkout-flow',
        type: 'otel',
        scope: 'root',
      });
      expect(result.canvases[1]).toMatchObject({
        id: 'user-flow',
        name: 'User Flow',
        basename: 'user-flow',
        type: 'regular',
        scope: 'root',
      });
    });

    test('discovers hierarchical canvas files in package subdirectories', async () => {
      const fileTree = createMockFileTree([
        'packages/subsystems-core/.principal-views/auth-flow/auth-flow.canvas',
        'packages/api/.principal-views/request-flow/request-flow.otel.canvas',
        'packages/subsystems-core/package.json',
        'packages/api/package.json',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (path) => {
          if (path.endsWith('core/package.json')) {
            return JSON.stringify({ name: 'core' });
          }
          if (path.endsWith('api/package.json')) {
            return JSON.stringify({ name: 'api' });
          }
          return '';
        },
      });

      expect(result.canvases).toHaveLength(2);
      expect(result.canvases[0]).toMatchObject({
        id: 'api/request-flow.otel', // non-regular types get suffix
        name: 'Request Flow',
        basename: 'request-flow',
        type: 'otel',
        scope: 'package',
        packageName: 'api',
      });
      expect(result.canvases[1]).toMatchObject({
        id: 'core/auth-flow',
        name: 'Auth Flow',
        basename: 'auth-flow',
        type: 'regular',
        scope: 'package',
        packageName: 'core',
      });
    });

    test('handles mixed flat and hierarchical canvas structures', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/flat.canvas',
        '.principal-views/storyboard/hierarchical.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.canvases).toHaveLength(2);
      // Both should be discovered
      expect(result.canvases.map(c => c.basename).sort()).toEqual(['flat', 'hierarchical']);
    });

  });

  describe('caching', () => {
    test('caches package discovery by fileTree SHA', async () => {
      const fileTree = createMockFileTree([
        'packages/subsystems-core/package.json',
      ]);

      let readCount = 0;
      const fileReader = async (_path: string) => {
        readCount++;
        return JSON.stringify({ name: 'core' });
      };

      // First call
      await discovery.discover(fileTree, { fileReader });
      const firstCount = readCount;

      // Second call with same SHA
      await discovery.discover(fileTree, { fileReader });
      const secondCount = readCount;

      // Should not re-read package.json (cached)
      expect(secondCount).toBe(firstCount);
    });

    test('clearCache() invalidates package cache', async () => {
      const fileTree = createMockFileTree([
        'packages/subsystems-core/package.json',
      ]);

      let readCount = 0;
      const fileReader = async (_path: string) => {
        readCount++;
        return JSON.stringify({ name: 'core' });
      };

      await discovery.discover(fileTree, { fileReader });
      const firstCount = readCount;

      discovery.clearCache();

      await discovery.discover(fileTree, { fileReader });
      const secondCount = readCount;

      // Should re-read after cache clear
      expect(secondCount).toBeGreaterThan(firstCount);
    });
  });

  describe('sorting', () => {
    test('sorts package canvases before root canvases', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/zzz-root.canvas',
        'packages/aaa/.principal-views/pkg.canvas',
        'packages/aaa/package.json',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (path) => {
          if (path.includes('package.json')) {
            return JSON.stringify({ name: 'aaa' });
          }
          return '';
        },
      });

      expect(result.canvases[0].id).toBe('aaa/pkg');
      expect(result.canvases[1].id).toBe('zzz-root');
    });

    test('sorts packages alphabetically', async () => {
      const fileTree = createMockFileTree([
        'packages/zzz/.principal-views/file.canvas',
        'packages/aaa/.principal-views/file.canvas',
        'packages/zzz/package.json',
        'packages/aaa/package.json',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (path) => {
          if (path.includes('zzz/package.json')) {
            return JSON.stringify({ name: 'zzz' });
          }
          if (path.includes('aaa/package.json')) {
            return JSON.stringify({ name: 'aaa' });
          }
          return '';
        },
      });

      expect(result.canvases[0].id).toBe('aaa/file');
      expect(result.canvases[1].id).toBe('zzz/file');
    });
  });

  describe('edge cases', () => {
    test('handles empty file tree', async () => {
      const fileTree = createMockFileTree([]);

      const result = await discovery.discover(fileTree);

      expect(result.canvases).toHaveLength(0);
      expect(result.testTraces).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    test('handles files without extensions', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/noextension',
        '__executions__/noextension',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.canvases).toHaveLength(0);
      expect(result.testTraces).toHaveLength(0);
    });
  });

  describe('isRelevantPath()', () => {
    test('returns true for canvas files in .principal-views', () => {
      expect(discovery.isRelevantPath('.principal-views/flow.canvas')).toBe(true);
      expect(discovery.isRelevantPath('.principal-views/flow.otel.canvas')).toBe(true);
    });

    test('returns true for hierarchical canvas files', () => {
      expect(discovery.isRelevantPath('.principal-views/storyboard/flow.canvas')).toBe(true);
      expect(discovery.isRelevantPath('.principal-views/storyboard/flow.otel.canvas')).toBe(true);
    });

    test('returns true for workflow files', () => {
      expect(discovery.isRelevantPath('.principal-views/storyboard/scenario/scenario.workflow.json')).toBe(true);
    });

    test('returns true for test trace files', () => {
      expect(discovery.isRelevantPath('.principal-views/storyboard/scenario/execution-1.otel.json')).toBe(true);
    });

    test('returns true for package-scoped files', () => {
      expect(discovery.isRelevantPath('packages/subsystems-core/.principal-views/flow.canvas')).toBe(true);
      expect(discovery.isRelevantPath('packages/subsystems-core/.principal-views/storyboard/flow.otel.canvas')).toBe(true);
      expect(discovery.isRelevantPath('packages/subsystems-core/.principal-views/storyboard/scenario/scenario.workflow.json')).toBe(true);
    });

    test('returns false for non-.principal-views files', () => {
      expect(discovery.isRelevantPath('src/index.ts')).toBe(false);
      expect(discovery.isRelevantPath('package.json')).toBe(false);
      expect(discovery.isRelevantPath('README.md')).toBe(false);
    });

    test('returns false for unrelated files in .principal-views', () => {
      expect(discovery.isRelevantPath('.principal-views/README.md')).toBe(false);
      expect(discovery.isRelevantPath('.principal-views/config.json')).toBe(false);
    });
  });

  describe('getRelevantPaths()', () => {
    test('returns only relevant paths from file tree', () => {
      const fileTree = createMockFileTree([
        '.principal-views/flow.canvas',
        '.principal-views/storyboard/flow.otel.canvas',
        '.principal-views/storyboard/scenario/scenario.workflow.json',
        '.principal-views/storyboard/scenario/exec.otel.json',
        'src/index.ts',
        'package.json',
        'README.md',
      ]);

      const relevantPaths = discovery.getRelevantPaths(fileTree);

      expect(relevantPaths.size).toBe(4);
      expect(relevantPaths.has('.principal-views/flow.canvas')).toBe(true);
      expect(relevantPaths.has('.principal-views/storyboard/flow.otel.canvas')).toBe(true);
      expect(relevantPaths.has('.principal-views/storyboard/scenario/scenario.workflow.json')).toBe(true);
      expect(relevantPaths.has('.principal-views/storyboard/scenario/exec.otel.json')).toBe(true);
      expect(relevantPaths.has('src/index.ts')).toBe(false);
    });

    test('returns empty set for file tree with no relevant files', () => {
      const fileTree = createMockFileTree([
        'src/index.ts',
        'package.json',
      ]);

      const relevantPaths = discovery.getRelevantPaths(fileTree);

      expect(relevantPaths.size).toBe(0);
    });
  });

  describe('filterRelevantGitChanges()', () => {
    test('filters git status to only relevant files', () => {
      const fileTree = createMockFileTree([
        '.principal-views/flow.canvas',
        '.principal-views/storyboard/flow.otel.canvas',
        'src/index.ts',
      ]);

      const gitStatus = createMockGitStatus({
        modifiedFiles: ['.principal-views/flow.canvas', 'src/index.ts'],
        untrackedFiles: [],
        stagedFiles: [],
        deletedFiles: [],
      });

      const filtered = discovery.filterRelevantGitChanges(fileTree, gitStatus);

      expect(filtered).not.toBeNull();
      expect(filtered!.modifiedFiles).toEqual(['.principal-views/flow.canvas']);
    });

    test('returns null when no relevant changes', () => {
      const fileTree = createMockFileTree([
        '.principal-views/flow.canvas',
        'src/index.ts',
      ]);

      const gitStatus = createMockGitStatus({
        modifiedFiles: ['src/index.ts', 'package.json'],
        untrackedFiles: [],
        stagedFiles: [],
        deletedFiles: [],
      });

      const filtered = discovery.filterRelevantGitChanges(fileTree, gitStatus);

      expect(filtered).toBeNull();
    });

    test('includes new untracked files matching discovery patterns', () => {
      const fileTree = createMockFileTree([
        '.principal-views/existing.canvas',
      ]);

      const gitStatus = createMockGitStatus({
        modifiedFiles: [],
        untrackedFiles: ['.principal-views/new-flow.canvas', 'src/newfile.ts'],
        stagedFiles: [],
        deletedFiles: [],
      });

      const filtered = discovery.filterRelevantGitChanges(fileTree, gitStatus);

      expect(filtered).not.toBeNull();
      expect(filtered!.untrackedFiles).toEqual(['.principal-views/new-flow.canvas']);
    });

    test('includes deleted relevant files', () => {
      const fileTree = createMockFileTree([
        '.principal-views/remaining.canvas',
      ]);

      const gitStatus = createMockGitStatus({
        modifiedFiles: [],
        untrackedFiles: [],
        stagedFiles: [],
        deletedFiles: ['.principal-views/deleted.canvas', 'src/deleted.ts'],
      });

      // Note: deleted files won't be in relevantPaths since they're not in fileTree
      // But the filter should still work based on pattern matching for deleted files
      const filtered = discovery.filterRelevantGitChanges(fileTree, gitStatus);

      // Since .principal-views/deleted.canvas is not in fileTree, it won't be filtered as "existing"
      // This is expected behavior - we can only filter to paths we know about
      expect(filtered).toBeNull();
    });

    test('handles all change types together', () => {
      const fileTree = createMockFileTree([
        '.principal-views/modified.canvas',
        '.principal-views/storyboard/flow.otel.canvas',
        'src/index.ts',
      ]);

      const gitStatus = createMockGitStatus({
        modifiedFiles: ['.principal-views/modified.canvas', 'src/index.ts'],
        untrackedFiles: ['.principal-views/new.canvas', 'src/new.ts'],
        stagedFiles: ['.principal-views/staged.workflow.json'],
        deletedFiles: ['other/deleted.ts'],
      });

      const filtered = discovery.filterRelevantGitChanges(fileTree, gitStatus);

      expect(filtered).not.toBeNull();
      expect(filtered!.modifiedFiles).toEqual(['.principal-views/modified.canvas']);
      expect(filtered!.untrackedFiles).toEqual(['.principal-views/new.canvas']);
      expect(filtered!.stagedFiles).toEqual(['.principal-views/staged.workflow.json']);
      expect(filtered!.deletedFiles).toEqual([]);
    });
  });

  describe('validateRequiredCanvases', () => {
    test('no errors when no canvases exist (no .principal-views)', async () => {
      const fileTree = createMockFileTree([
        'src/index.ts',
      ]);

      const result = await discovery.discover(fileTree);

      // No canvas files means nothing to validate
      expect(result.errors).toHaveLength(0);
    });

    test('error when resources.canvas is missing', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/docs.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      const resourcesError = result.errors.find(e => e.error.includes('Missing required resources.canvas'));
      expect(resourcesError).toBeDefined();
      expect(resourcesError!.path).toBe('.principal-views');
    });

    test('no error when resources.canvas exists but spans.canvas is missing', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/resources.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      const resourcesError = result.errors.find(e => e.error.includes('Missing required resources.canvas'));
      expect(resourcesError).toBeUndefined();

      const spansError = result.errors.find(e => e.error.includes('Missing required spans.canvas'));
      expect(spansError).toBeDefined();
    });

    test('no error when resources.canvas and spans.canvas exist but .otel.canvas is missing', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/resources.canvas',
        '.principal-views/architecture.spans.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      const resourcesError = result.errors.find(e => e.error.includes('Missing required resources.canvas'));
      expect(resourcesError).toBeUndefined();

      const spansError = result.errors.find(e => e.error.includes('Missing required spans.canvas'));
      expect(spansError).toBeUndefined();

      const otelError = result.errors.find(e => e.error.includes('Missing required .otel.canvas'));
      expect(otelError).toBeDefined();
    });

    test('no errors when all required canvases exist', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/resources.canvas',
        '.principal-views/architecture.spans.canvas',
        '.principal-views/my-feature/my-feature.otel.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      const resourcesError = result.errors.find(e => e.error.includes('Missing required resources.canvas'));
      expect(resourcesError).toBeUndefined();

      const spansError = result.errors.find(e => e.error.includes('Missing required spans.canvas'));
      expect(spansError).toBeUndefined();

      const otelError = result.errors.find(e => e.error.includes('Missing required .otel.canvas'));
      expect(otelError).toBeUndefined();
    });

    test('accepts architecture.resources.canvas naming convention', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/architecture.resources.canvas',
        '.principal-views/architecture.spans.canvas',
        '.principal-views/feature/feature.otel.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      const resourcesError = result.errors.find(e => e.error.includes('Missing required resources.canvas'));
      expect(resourcesError).toBeUndefined();
    });

    test('only checks dependency chain - stops at first missing level', async () => {
      // Only resources.canvas is missing - should not report spans or otel errors
      const fileTree = createMockFileTree([
        '.principal-views/docs.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      // Should only have the resources.canvas error
      const resourcesError = result.errors.find(e => e.error.includes('Missing required resources.canvas'));
      expect(resourcesError).toBeDefined();

      // Should NOT have spans or otel errors since we stop at first missing level
      const spansError = result.errors.find(e => e.error.includes('Missing required spans.canvas'));
      expect(spansError).toBeUndefined();

      const otelError = result.errors.find(e => e.error.includes('Missing required .otel.canvas'));
      expect(otelError).toBeUndefined();
    });
  });
});

/**
 * Helper to create mock FileTree for testing
 */
function createMockFileTree(paths: string[]): FileTree {
  const allFiles: FileInfo[] = paths.map(path => ({
    path,
    relativePath: path,
    name: path.split('/').pop() || '',
    extension: path.split('.').pop() || '',
    size: 100,
    lastModified: new Date(),
    isDirectory: false,
  }));

  const root: DirectoryInfo = {
    path: '/',
    name: '',
    relativePath: '',
    children: [],
    fileCount: allFiles.length,
    totalSize: allFiles.length * 100,
    depth: 0,
  };

  return {
    sha: 'test-sha-' + Math.random(),
    root,
    allFiles,
    allDirectories: [],
    stats: {
      totalFiles: allFiles.length,
      totalDirectories: 0,
      totalSize: allFiles.length * 100,
      maxDepth: 3,
    },
    metadata: {
      id: 'test',
      timestamp: new Date(),
      sourceType: 'test',
      sourceInfo: {},
    },
  };
}

/**
 * Helper to create mock GitStatusWithFiles for testing
 */
function createMockGitStatus(overrides: {
  modifiedFiles?: string[];
  untrackedFiles?: string[];
  stagedFiles?: string[];
  deletedFiles?: string[];
  createdFiles?: string[];
}) {
  return {
    repoPath: '/test/repo',
    branch: 'main',
    isDirty: true,
    hasUntracked: (overrides.untrackedFiles?.length ?? 0) > 0,
    hasStaged: (overrides.stagedFiles?.length ?? 0) > 0,
    ahead: 0,
    behind: 0,
    watchingEnabled: false,
    modifiedFiles: overrides.modifiedFiles ?? [],
    untrackedFiles: overrides.untrackedFiles ?? [],
    stagedFiles: overrides.stagedFiles ?? [],
    deletedFiles: overrides.deletedFiles ?? [],
    createdFiles: overrides.createdFiles ?? [],
    hash: 'test-hash',
  };
}
