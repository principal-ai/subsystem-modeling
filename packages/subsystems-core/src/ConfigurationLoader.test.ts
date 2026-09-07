import { describe, expect, test, beforeEach } from 'bun:test';
import { ConfigurationLoader } from './ConfigurationLoader';
// Types imported for documentation - they're part of the public API
import { InMemoryFileSystemAdapter } from '@principal-ai/repository-abstraction';
import type { PathBasedGraphConfiguration } from './types/path-based-config';

describe('ConfigurationLoader', () => {
  let fsAdapter: InMemoryFileSystemAdapter;
  let loader: ConfigurationLoader;

  const validConfig: PathBasedGraphConfiguration = {
    metadata: {
      name: 'Test Config',
      version: '1.0.0',
      description: 'A test configuration',
    },
    nodeTypes: {
      service: {
        shape: 'rectangle',
        color: '#4A90E2',
        dataSchema: {
          name: { type: 'string', required: true },
        },
      },
    },
    edgeTypes: {
      call: {
        style: 'solid',
        color: '#999',
      },
    },
    allowedConnections: [
      {
        from: 'service',
        to: 'service',
        via: 'call',
      },
    ],
  };

  beforeEach(() => {
    fsAdapter = new InMemoryFileSystemAdapter();
    loader = new ConfigurationLoader(fsAdapter);
  });

  describe('hasConfigDirectory', () => {
    test('returns true when .principal-views directory exists', async () => {
      await fsAdapter.createDir('/project/.principal-views');

      expect(await loader.hasConfigDirectory('/project')).toBe(true);
    });

    test('returns false when .principal-views directory does not exist', async () => {
      expect(await loader.hasConfigDirectory('/project')).toBe(false);
    });

    test('returns false when .principal-views exists but is not a directory', async () => {
      await fsAdapter.writeFile('/project/.principal-views', 'not a directory');

      expect(await loader.hasConfigDirectory('/project')).toBe(false);
    });
  });

  describe('listConfigurations', () => {
    test('returns empty array when .principal-views does not exist', async () => {
      const configs = await loader.listConfigurations('/project');

      expect(configs).toEqual([]);
    });

    test('returns list of configuration names', async () => {
      await fsAdapter.createDir('/project/.principal-views');
      await fsAdapter.writeFile(
        '/project/.principal-views/architecture.yaml',
        JSON.stringify(validConfig)
      );
      await fsAdapter.writeFile('/project/.principal-views/data-flow.yaml', JSON.stringify(validConfig));
      await fsAdapter.writeFile('/project/.principal-views/deployment.yml', JSON.stringify(validConfig));

      const configs = await loader.listConfigurations('/project');

      expect(configs).toEqual(['architecture', 'data-flow', 'deployment']);
    });

    test('filters out non-YAML files', async () => {
      await fsAdapter.createDir('/project/.principal-views');
      await fsAdapter.writeFile('/project/.principal-views/config1.yaml', JSON.stringify(validConfig));
      await fsAdapter.writeFile('/project/.principal-views/README.md', '# README');
      await fsAdapter.writeFile('/project/.principal-views/config.json', '{}');

      const configs = await loader.listConfigurations('/project');

      expect(configs).toEqual(['config1']);
    });

    test('returns sorted configuration names', async () => {
      await fsAdapter.createDir('/project/.principal-views');
      await fsAdapter.writeFile('/project/.principal-views/zebra.yaml', JSON.stringify(validConfig));
      await fsAdapter.writeFile('/project/.principal-views/alpha.yaml', JSON.stringify(validConfig));
      await fsAdapter.writeFile('/project/.principal-views/middle.yaml', JSON.stringify(validConfig));

      const configs = await loader.listConfigurations('/project');

      expect(configs).toEqual(['alpha', 'middle', 'zebra']);
    });
  });

  describe('loadByName', () => {
    beforeEach(async () => {
      await fsAdapter.createDir('/project/.principal-views');
    });

    test('loads configuration by name with .yaml extension', async () => {
      const yamlContent = `
metadata:
  name: Test Config
  version: 1.0.0
nodeTypes:
  service:
    shape: rectangle
    color: '#4A90E2'
    dataSchema:
      name:
        type: string
        required: true
edgeTypes:
  call:
    style: solid
    color: '#999'
allowedConnections:
  - from: service
    to: service
    via: call
`;
      await fsAdapter.writeFile('/project/.principal-views/simple.yaml', yamlContent);

      const result = await loader.loadByName('simple', '/project');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('simple');
      expect(result?.config.metadata.name).toBe('Test Config');
    });

    test('loads configuration by name with .yml extension', async () => {
      const yamlContent = `
metadata:
  name: Alternative Config
  version: 2.0.0
nodeTypes:
  component:
    shape: hexagon
    color: '#FF6B6B'
    dataSchema:
      id:
        type: string
        required: true
edgeTypes:
  link:
    style: dashed
    color: '#888'
allowedConnections:
  - from: component
    to: component
    via: link
`;
      await fsAdapter.writeFile('/project/.principal-views/alt.yml', yamlContent);

      const result = await loader.loadByName('alt', '/project');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('alt');
      expect(result?.config.metadata.name).toBe('Alternative Config');
    });

    test('returns null when configuration does not exist', async () => {
      const result = await loader.loadByName('nonexistent', '/project');

      expect(result).toBeNull();
    });

    test('returns null when .principal-views directory does not exist', async () => {
      const result = await loader.loadByName('any', '/no-project');

      expect(result).toBeNull();
    });

    test('returns null when YAML is invalid', async () => {
      await fsAdapter.writeFile('/project/.principal-views/invalid.yaml', 'invalid: yaml: content:');

      const result = await loader.loadByName('invalid', '/project');

      expect(result).toBeNull();
    });

    test('returns null when configuration structure is invalid', async () => {
      const yamlContent = `
metadata:
  name: Incomplete
nodeTypes: {}
# Missing edgeTypes and allowedConnections
`;
      await fsAdapter.writeFile('/project/.principal-views/incomplete.yaml', yamlContent);

      const result = await loader.loadByName('incomplete', '/project');

      expect(result).toBeNull();
    });

    test('prefers .yaml over .yml when both exist', async () => {
      const yamlContent = `
metadata:
  name: YAML Version
  version: 1.0.0
nodeTypes:
  service:
    shape: rectangle
    dataSchema:
      name:
        type: string
edgeTypes:
  call:
    style: solid
allowedConnections:
  - from: service
    to: service
    via: call
`;
      const ymlContent = `
metadata:
  name: YML Version
  version: 1.0.0
nodeTypes:
  service:
    shape: rectangle
    dataSchema:
      name:
        type: string
edgeTypes:
  call:
    style: solid
allowedConnections:
  - from: service
    to: service
    via: call
`;
      await fsAdapter.writeFile('/project/.principal-views/both.yaml', yamlContent);
      await fsAdapter.writeFile('/project/.principal-views/both.yml', ymlContent);

      const result = await loader.loadByName('both', '/project');

      expect(result).not.toBeNull();
      expect(result?.config.metadata.name).toBe('YAML Version');
    });
  });

  describe('loadAll', () => {
    test('returns error when .principal-views directory does not exist', async () => {
      const result = await loader.loadAll('/project');

      expect(result.configs).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].file).toBe('.principal-views');
      expect(result.errors[0].error).toContain('not found');
    });

    test('loads all valid configurations', async () => {
      await fsAdapter.createDir('/project/.principal-views');

      const config1 = `
metadata:
  name: Config 1
  version: 1.0.0
nodeTypes:
  service:
    shape: rectangle
    dataSchema:
      name:
        type: string
edgeTypes:
  call:
    style: solid
allowedConnections:
  - from: service
    to: service
    via: call
`;
      const config2 = `
metadata:
  name: Config 2
  version: 2.0.0
nodeTypes:
  component:
    shape: hexagon
    dataSchema:
      id:
        type: string
edgeTypes:
  link:
    style: dashed
allowedConnections:
  - from: component
    to: component
    via: link
`;

      await fsAdapter.writeFile('/project/.principal-views/first.yaml', config1);
      await fsAdapter.writeFile('/project/.principal-views/second.yml', config2);

      const result = await loader.loadAll('/project');

      expect(result.configs).toHaveLength(2);
      expect(result.errors).toEqual([]);
      expect(result.configs[0].name).toBe('first');
      expect(result.configs[1].name).toBe('second');
    });

    test('skips non-YAML files', async () => {
      await fsAdapter.createDir('/project/.principal-views');

      const validYaml = `
metadata:
  name: Valid
  version: 1.0.0
nodeTypes:
  service:
    shape: rectangle
    dataSchema:
      name:
        type: string
edgeTypes:
  call:
    style: solid
allowedConnections:
  - from: service
    to: service
    via: call
`;

      await fsAdapter.writeFile('/project/.principal-views/valid.yaml', validYaml);
      await fsAdapter.writeFile('/project/.principal-views/README.md', '# README');
      await fsAdapter.writeFile('/project/.principal-views/config.json', '{}');

      const result = await loader.loadAll('/project');

      expect(result.configs).toHaveLength(1);
      expect(result.configs[0].name).toBe('valid');
      expect(result.errors).toEqual([]);
    });

    test('collects errors for invalid files', async () => {
      await fsAdapter.createDir('/project/.principal-views');

      const validYaml = `
metadata:
  name: Valid
  version: 1.0.0
nodeTypes:
  service:
    shape: rectangle
    dataSchema:
      name:
        type: string
edgeTypes:
  call:
    style: solid
allowedConnections:
  - from: service
    to: service
    via: call
`;

      await fsAdapter.writeFile('/project/.principal-views/valid.yaml', validYaml);
      await fsAdapter.writeFile('/project/.principal-views/invalid-yaml.yaml', 'invalid: yaml: content:');
      await fsAdapter.writeFile(
        '/project/.principal-views/incomplete.yaml',
        'metadata:\n  name: Incomplete\nnodeTypes: {}'
      );

      const result = await loader.loadAll('/project');

      expect(result.configs).toHaveLength(1);
      expect(result.configs[0].name).toBe('valid');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('returns configs sorted by name', async () => {
      await fsAdapter.createDir('/project/.principal-views');

      const configTemplate = (name: string) => `
metadata:
  name: ${name}
  version: 1.0.0
nodeTypes:
  service:
    shape: rectangle
    dataSchema:
      name:
        type: string
edgeTypes:
  call:
    style: solid
allowedConnections:
  - from: service
    to: service
    via: call
`;

      await fsAdapter.writeFile('/project/.principal-views/zebra.yaml', configTemplate('Zebra'));
      await fsAdapter.writeFile('/project/.principal-views/alpha.yaml', configTemplate('Alpha'));
      await fsAdapter.writeFile('/project/.principal-views/middle.yaml', configTemplate('Middle'));

      const result = await loader.loadAll('/project');

      expect(result.configs).toHaveLength(3);
      expect(result.configs[0].name).toBe('alpha');
      expect(result.configs[1].name).toBe('middle');
      expect(result.configs[2].name).toBe('zebra');
    });

    test('handles mixed .yaml and .yml extensions', async () => {
      await fsAdapter.createDir('/project/.principal-views');

      const configTemplate = (name: string) => `
metadata:
  name: ${name}
  version: 1.0.0
nodeTypes:
  service:
    shape: rectangle
    dataSchema:
      name:
        type: string
edgeTypes:
  call:
    style: solid
allowedConnections:
  - from: service
    to: service
    via: call
`;

      await fsAdapter.writeFile('/project/.principal-views/config1.yaml', configTemplate('Config 1'));
      await fsAdapter.writeFile('/project/.principal-views/config2.yml', configTemplate('Config 2'));

      const result = await loader.loadAll('/project');

      expect(result.configs).toHaveLength(2);
      expect(result.errors).toEqual([]);
    });
  });

  describe('getConfigDirectoryPath', () => {
    test('returns correct .principal-views path', async () => {
      const path = loader.getConfigDirectoryPath('/my/project');

      expect(path).toBe('/my/project/.principal-views');
    });

    test('handles trailing slashes', async () => {
      const path = loader.getConfigDirectoryPath('/my/project/');

      // The path should be consistent regardless of trailing slash
      expect(path).toContain('.principal-views');
    });
  });
});
