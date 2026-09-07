import { describe, expect, test } from 'bun:test';
import { ExecutionLoader, createExecutionLoader } from './ExecutionLoader';
import type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
import type { OtlpData } from './ExecutionValidator';

// Mock file system adapter
class MockFileSystemAdapter implements FileSystemAdapter {
  private files: Map<string, string> = new Map();
  private dirs: Set<string> = new Set();

  constructor() {
    // Set up directory structure
    this.dirs.add('/project');
    this.dirs.add('/project/__executions__');
  }

  addFile(path: string, content: string) {
    this.files.set(path, content);
  }

  addDirectory(path: string) {
    this.dirs.add(path);
  }

  exists(path: string): boolean {
    return this.files.has(path) || this.dirs.has(path);
  }

  isDirectory(path: string): boolean {
    return this.dirs.has(path);
  }

  readFile(path: string): string {
    const content = this.files.get(path);
    if (!content) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  readDir(path: string): string[] {
    if (!this.dirs.has(path)) {
      throw new Error(`Directory not found: ${path}`);
    }

    const prefix = path.endsWith('/') ? path : `${path}/`;
    const items: Set<string> = new Set();

    // Add files
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const relativePath = filePath.substring(prefix.length);
        if (!relativePath.includes('/')) {
          items.add(relativePath);
        }
      }
    }

    // Add directories
    for (const dirPath of this.dirs) {
      if (dirPath.startsWith(prefix) && dirPath !== path) {
        const relativePath = dirPath.substring(prefix.length);
        const firstSegment = relativePath.split('/')[0];
        if (firstSegment) {
          items.add(firstSegment);
        }
      }
    }

    return Array.from(items);
  }

  join(...paths: string[]): string {
    return paths
      .join('/')
      .replace(/\/+/g, '/')
      .replace(/\/\./g, '')
      .replace(/\/[^/]+\/\.\./g, '');
  }

  resolve(...paths: string[]): string {
    return this.join(...paths);
  }

  dirname(path: string): string {
    return path.split('/').slice(0, -1).join('/');
  }

  basename(path: string): string {
    return path.split('/').pop() || '';
  }

  writeFile(_path: string, _content: string): void {
    // Not implemented
  }

  copyFile(_src: string, _dest: string): void {
    // Not implemented
  }

  mkdirSync(_path: string): void {
    // Not implemented
  }
}

describe('ExecutionLoader', () => {
  test('hasExecutionDirectory returns true when __executions__/ exists', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    const loader = new ExecutionLoader(fsAdapter);

    expect(await loader.hasExecutionDirectory('/project')).toBe(true);
  });

  test('hasExecutionDirectory returns false when __executions__/ does not exist', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    const loader = new ExecutionLoader(fsAdapter);

    expect(await loader.hasExecutionDirectory('/other')).toBe(false);
  });

  test('listExecutions returns execution names', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    fsAdapter.addFile(
      '/project/__executions__/test-run.otel.json',
      JSON.stringify({ spans: [] })
    );
    fsAdapter.addFile(
      '/project/__executions__/feature-test.otel.json',
      JSON.stringify({ spans: [] })
    );

    const loader = new ExecutionLoader(fsAdapter);
    const executions = await loader.listExecutions('/project');

    expect(executions).toEqual(['feature-test', 'test-run']);
  });

  test('listExecutions ignores non-.otel.json files', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    fsAdapter.addFile(
      '/project/__executions__/test-run.otel.json',
      JSON.stringify({ spans: [] })
    );
    fsAdapter.addFile('/project/__executions__/README.md', '# README');

    const loader = new ExecutionLoader(fsAdapter);
    const executions = await loader.listExecutions('/project');

    expect(executions).toEqual(['test-run']);
  });

  test('loadByName loads valid execution with flattened format', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    const executionData = {
      metadata: {
        serviceName: 'test-service',
        exportedAt: '2024-01-01T00:00:00Z',
      },
      spans: [
        {
          id: 'span-1',
          name: 'test-span',
          startTime: 1000,
          endTime: 2000,
          duration: 1000,
          status: 'OK',
          attributes: {},
          events: [],
        },
      ],
    };

    fsAdapter.addFile(
      '/project/__executions__/test-run.otel.json',
      JSON.stringify(executionData)
    );

    const loader = new ExecutionLoader(fsAdapter);
    const result = await loader.loadByName('test-run', '/project');

    expect(result).not.toBeNull();
    expect(result?.name).toBe('test-run');
    expect(result?.data.spans).toHaveLength(1);
    expect(result?.data.spans[0].name).toBe('test-span');
  });

  test('loadByName loads and converts OTLP format', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    const otlpData: OtlpData = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: 'test-service' },
              },
            ],
            droppedAttributesCount: 0,
          },
          scopeSpans: [
            {
              scope: {
                name: 'test-tracer',
                version: '1.0.0',
              },
              spans: [
                {
                  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
                  spanId: '00f067aa0ba902b7',
                  name: 'test.operation',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  attributes: [],
                  events: [],
                  status: { code: 1 },
                  droppedAttributesCount: 0,
                  droppedEventsCount: 0,
                  droppedLinksCount: 0,
                  links: [],
                },
              ],
            },
          ],
        },
      ],
    };

    fsAdapter.addFile(
      '/project/__executions__/otlp-test.otel.json',
      JSON.stringify(otlpData)
    );

    const loader = new ExecutionLoader(fsAdapter);
    const result = await loader.loadByName('otlp-test', '/project');

    expect(result).not.toBeNull();
    expect(result?.name).toBe('otlp-test');
    expect(result?.data.spans).toHaveLength(1);
    expect(result?.data.spans[0].name).toBe('test.operation');
    expect(result?.data.spans[0].id).toBe('00f067aa0ba902b7');
    expect(result?.data.metadata?.serviceName).toBe('test-service');
  });

  test('loadByName returns null for non-existent execution', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    const loader = new ExecutionLoader(fsAdapter);

    const result = await loader.loadByName('non-existent', '/project');

    expect(result).toBeNull();
  });

  test('loadByName returns null for invalid JSON', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    fsAdapter.addFile(
      '/project/__executions__/invalid.otel.json',
      'invalid json{'
    );

    const loader = new ExecutionLoader(fsAdapter);
    const result = await loader.loadByName('invalid', '/project');

    expect(result).toBeNull();
  });

  test('loadAll loads all valid executions', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    fsAdapter.addFile(
      '/project/__executions__/test-1.otel.json',
      JSON.stringify({ spans: [{ id: '1', name: 'span1', events: [] }] })
    );
    fsAdapter.addFile(
      '/project/__executions__/test-2.otel.json',
      JSON.stringify({ spans: [{ id: '2', name: 'span2', events: [] }] })
    );

    const loader = new ExecutionLoader(fsAdapter);
    const result = await loader.loadAll('/project');

    expect(result.executions).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.executions[0].name).toBe('test-1');
    expect(result.executions[1].name).toBe('test-2');
  });

  test('loadAll reports errors for invalid files', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    fsAdapter.addFile(
      '/project/__executions__/valid.otel.json',
      JSON.stringify({ spans: [{ id: '1', name: 'span1', events: [] }] })
    );
    fsAdapter.addFile(
      '/project/__executions__/invalid.otel.json',
      'invalid json{'
    );

    const loader = new ExecutionLoader(fsAdapter);
    const result = await loader.loadAll('/project');

    expect(result.executions).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].file).toBe('invalid.otel.json');
  });

  test('loadAll returns error when __executions__/ does not exist', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    const loader = new ExecutionLoader(fsAdapter);

    const result = await loader.loadAll('/non-existent');

    expect(result.executions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].file).toBe('__executions__');
  });

  test('getExecutionDirectoryPath returns correct path', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    const loader = new ExecutionLoader(fsAdapter);

    const path = loader.getExecutionDirectoryPath('/project');

    expect(path).toBe('/project/__executions__');
  });

  test('findExecutionDirectories finds nested __executions__/ folders', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    fsAdapter.addDirectory('/project/packages');
    fsAdapter.addDirectory('/project/packages/subsystems-core');
    fsAdapter.addDirectory('/project/packages/subsystems-core/__executions__');
    fsAdapter.addDirectory('/project/packages/principal-studio-cli');
    fsAdapter.addDirectory('/project/packages/principal-studio-cli/__executions__');

    const loader = new ExecutionLoader(fsAdapter);
    const dirs = await loader.findExecutionDirectories('/project');

    expect(dirs).toHaveLength(3); // root + core + cli
    expect(dirs).toContain('/project/__executions__');
    expect(dirs).toContain('/project/packages/subsystems-core/__executions__');
    expect(dirs).toContain('/project/packages/principal-studio-cli/__executions__');
  });

  test('loadAllRecursive loads executions from multiple directories', async () => {
    const fsAdapter = new MockFileSystemAdapter();

    // Root executions
    fsAdapter.addFile(
      '/project/__executions__/root-test.otel.json',
      JSON.stringify({ spans: [{ id: '1', name: 'root', events: [] }] })
    );

    // Package executions
    fsAdapter.addDirectory('/project/packages');
    fsAdapter.addDirectory('/project/packages/subsystems-core');
    fsAdapter.addDirectory('/project/packages/subsystems-core/__executions__');
    fsAdapter.addFile(
      '/project/packages/subsystems-core/__executions__/core-test.otel.json',
      JSON.stringify({ spans: [{ id: '2', name: 'core', events: [] }] })
    );

    const loader = new ExecutionLoader(fsAdapter);
    const result = await loader.loadAllRecursive('/project');

    expect(result.executions).toHaveLength(2);
    expect(result.executions.map((e) => e.name)).toContain('root-test');
    expect(result.executions.map((e) => e.name)).toContain('core-test');
  });
});

describe('createExecutionLoader', () => {
  test('creates ExecutionLoader instance', async () => {
    const fsAdapter = new MockFileSystemAdapter();
    const loader = createExecutionLoader(fsAdapter);

    expect(loader).toBeInstanceOf(ExecutionLoader);
  });
});
