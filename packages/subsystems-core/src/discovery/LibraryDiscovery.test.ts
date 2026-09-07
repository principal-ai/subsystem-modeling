import { describe, expect, test, beforeEach } from 'bun:test';
import { LibraryDiscovery } from './LibraryDiscovery';
import type { FileTree, FileInfo, DirectoryInfo, FileSystemAdapter } from '@principal-ai/repository-abstraction';

describe('LibraryDiscovery', () => {
  let discovery: LibraryDiscovery;
  let mockFsAdapter: FileSystemAdapter;

  beforeEach(() => {
    mockFsAdapter = createMockFsAdapter({});
    discovery = new LibraryDiscovery(mockFsAdapter);
  });

  describe('scopes canvas validation', () => {
    test('adds error when library has owned-scopes but no .scopes.canvas file', async () => {
      const libraryYaml = `
version: '1.0'
name: test-library
scopes:
  scope-a:
    color: "#ff0000"
  scope-b:
    color: "#00ff00"
nodeComponents:
  box: { shape: rectangle }
edgeComponents:
  connection: {}
resources:
  my-service:
    service.name: my-service
    owned-scopes:
      - scope-a
      - scope-b
`;
      mockFsAdapter = createMockFsAdapter({
        '/.principal-views': { isDir: true, contents: ['library.yaml'] },
        '/.principal-views/library.yaml': { content: libraryYaml },
      });
      discovery = new LibraryDiscovery(mockFsAdapter);

      const fileTree = createMockFileTree([
        '.principal-views/library.yaml',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('scopes-canvas-required');
      expect(result.errors[0].message).toContain('owned-scopes');
      expect(result.errors[0].message).toContain('scope-a');
      expect(result.errors[0].message).toContain('scope-b');
    });

    test('no error when library has owned-scopes and .scopes.canvas exists', async () => {
      const libraryYaml = `
version: '1.0'
name: test-library
scopes:
  scope-a:
    color: "#ff0000"
nodeComponents:
  box: { shape: rectangle }
edgeComponents:
  connection: {}
resources:
  my-service:
    service.name: my-service
    owned-scopes:
      - scope-a
`;
      mockFsAdapter = createMockFsAdapter({
        '/.principal-views': { isDir: true, contents: ['library.yaml', 'architecture.scopes.canvas'] },
        '/.principal-views/library.yaml': { content: libraryYaml },
        '/.principal-views/architecture.scopes.canvas': { content: '{}' },
      });
      discovery = new LibraryDiscovery(mockFsAdapter);

      const fileTree = createMockFileTree([
        '.principal-views/library.yaml',
        '.principal-views/architecture.scopes.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      // No scopes-canvas-required errors
      const scopesErrors = result.errors.filter(e => e.type === 'scopes-canvas-required');
      expect(scopesErrors).toHaveLength(0);
    });

    test('no error when library has no owned-scopes', async () => {
      const libraryYaml = `
version: '1.0'
name: test-library
nodeComponents:
  box: { shape: rectangle }
edgeComponents:
  connection: {}
resources:
  my-service:
    service.name: my-service
`;
      mockFsAdapter = createMockFsAdapter({
        '/.principal-views': { isDir: true, contents: ['library.yaml'] },
        '/.principal-views/library.yaml': { content: libraryYaml },
      });
      discovery = new LibraryDiscovery(mockFsAdapter);

      const fileTree = createMockFileTree([
        '.principal-views/library.yaml',
      ]);

      const result = await discovery.discover(fileTree);

      // No errors
      expect(result.errors).toHaveLength(0);
    });

    test('validates scope references exist in top-level scopes', async () => {
      const libraryYaml = `
version: '1.0'
name: test-library
scopes:
  scope-a:
    color: "#ff0000"
  scope-b:
    color: "#00ff00"
nodeComponents:
  box: { shape: rectangle }
edgeComponents:
  connection: {}
resources:
  my-service:
    service.name: my-service
    owned-scopes:
      - scope-a
      - scope-b
`;
      mockFsAdapter = createMockFsAdapter({
        '/.principal-views': { isDir: true, contents: ['library.yaml'] },
        '/.principal-views/library.yaml': { content: libraryYaml },
      });
      discovery = new LibraryDiscovery(mockFsAdapter);

      const fileTree = createMockFileTree([
        '.principal-views/library.yaml',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('scopes-canvas-required');
      expect(result.errors[0].message).toContain('scope-a');
      expect(result.errors[0].message).toContain('scope-b');
    });

    test('finds .scopes.canvas in subdirectory', async () => {
      const libraryYaml = `
version: '1.0'
name: test-library
scopes:
  scope-a:
    color: "#ff0000"
nodeComponents:
  box: { shape: rectangle }
edgeComponents:
  connection: {}
resources:
  my-service:
    service.name: my-service
    owned-scopes:
      - scope-a
`;
      mockFsAdapter = createMockFsAdapter({
        '/.principal-views': { isDir: true, contents: ['library.yaml', 'architecture'] },
        '/.principal-views/library.yaml': { content: libraryYaml },
        '/.principal-views/architecture': { isDir: true, contents: ['architecture.scopes.canvas'] },
        '/.principal-views/architecture/architecture.scopes.canvas': { content: '{}' },
      });
      discovery = new LibraryDiscovery(mockFsAdapter);

      const fileTree = createMockFileTree([
        '.principal-views/library.yaml',
        '.principal-views/architecture/architecture.scopes.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      // No scopes-canvas-required errors
      const scopesErrors = result.errors.filter(e => e.type === 'scopes-canvas-required');
      expect(scopesErrors).toHaveLength(0);
    });

    test('validation can be disabled with requireScopesCanvas: false', async () => {
      const libraryYaml = `
version: '1.0'
name: test-library
scopes:
  scope-a:
    color: "#ff0000"
nodeComponents:
  box: { shape: rectangle }
edgeComponents:
  connection: {}
resources:
  my-service:
    service.name: my-service
    owned-scopes:
      - scope-a
`;
      mockFsAdapter = createMockFsAdapter({
        '/.principal-views': { isDir: true, contents: ['library.yaml'] },
        '/.principal-views/library.yaml': { content: libraryYaml },
      });
      discovery = new LibraryDiscovery(mockFsAdapter);

      const fileTree = createMockFileTree([
        '.principal-views/library.yaml',
      ]);

      const result = await discovery.discover(fileTree, { requireScopesCanvas: false });

      // No errors when validation is disabled
      expect(result.errors).toHaveLength(0);
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
 * Helper to create mock FileSystemAdapter for testing
 */
function createMockFsAdapter(
  files: Record<string, { content?: string; isDir?: boolean; contents?: string[] }>
): FileSystemAdapter {
  return {
    async readFile(path: string): Promise<string> {
      const file = files[path];
      if (file?.content !== undefined) {
        return file.content;
      }
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    },
    async exists(path: string): Promise<boolean> {
      return path in files;
    },
    async isDirectory(path: string): Promise<boolean> {
      return files[path]?.isDir === true;
    },
    async readDir(path: string): Promise<string[]> {
      const file = files[path];
      if (file?.isDir && file.contents) {
        return file.contents;
      }
      return [];
    },
    join(...parts: string[]): string {
      return parts.join('/').replace(/\/+/g, '/');
    },
    dirname(path: string): string {
      return path.split('/').slice(0, -1).join('/');
    },
    basename(path: string): string {
      return path.split('/').pop() || '';
    },
    async writeFile(): Promise<void> {},
    async mkdir(): Promise<void> {},
    async rm(): Promise<void> {},
    async stat(): Promise<{ isDirectory: boolean; size: number; mtime: Date }> {
      return { isDirectory: false, size: 0, mtime: new Date() };
    },
    async copyFile(): Promise<void> {},
    async rename(): Promise<void> {},
    async getAbsolutePath(path: string): Promise<string> {
      return path;
    },
    isAbsolute(path: string): boolean {
      return path.startsWith('/');
    },
    resolve(...paths: string[]): string {
      return paths.join('/').replace(/\/+/g, '/');
    },
    relative(from: string, to: string): string {
      return to.replace(from, '').replace(/^\//, '');
    },
  };
}
