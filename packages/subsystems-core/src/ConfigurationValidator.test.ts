import { describe, expect, test } from 'bun:test';
import { ConfigurationValidator } from './ConfigurationValidator';
import type { GraphConfiguration } from './types';

describe('ConfigurationValidator', () => {
  test('validates a correct configuration', () => {
    const validConfig: GraphConfiguration = {
      metadata: {
        name: 'Test Graph',
        version: '1.0.0',
      },
      nodeTypes: {
        process: {
          shape: 'rectangle',
          color: '#4A90E2',
          dataSchema: {
            name: { type: 'string', required: true },
          },
        },
      },
      edgeTypes: {
        dataflow: {
          style: 'solid',
          color: '#999',
        },
      },
      allowedConnections: [
        {
          from: 'process',
          to: 'process',
          via: 'dataflow',
        },
      ],
    };

    const result = ConfigurationValidator.validate(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('catches missing node type in connection rules', () => {
    const invalidConfig: GraphConfiguration = {
      metadata: {
        name: 'Test Graph',
        version: '1.0.0',
      },
      nodeTypes: {
        process: {
          shape: 'rectangle',
          dataSchema: {},
        },
      },
      edgeTypes: {
        dataflow: {
          style: 'solid',
        },
      },
      allowedConnections: [
        {
          from: 'process',
          to: 'nonexistent', // ❌ This doesn't exist
          via: 'dataflow',
        },
      ],
    };

    const result = ConfigurationValidator.validate(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('nonexistent'))).toBe(true);
  });

  test('catches missing edge type in connection rules', () => {
    const invalidConfig: GraphConfiguration = {
      metadata: {
        name: 'Test Graph',
        version: '1.0.0',
      },
      nodeTypes: {
        process: {
          shape: 'rectangle',
          dataSchema: {},
        },
      },
      edgeTypes: {
        dataflow: {
          style: 'solid',
        },
      },
      allowedConnections: [
        {
          from: 'process',
          to: 'process',
          via: 'nonexistent_edge', // ❌ This doesn't exist
        },
      ],
    };

    const result = ConfigurationValidator.validate(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('nonexistent_edge'))).toBe(true);
  });

  test('catches missing metadata', () => {
    const invalidConfig = {
      nodeTypes: {
        process: { shape: 'rectangle', dataSchema: {} },
      },
      edgeTypes: {
        dataflow: { style: 'solid' },
      },
      allowedConnections: [],
    } as unknown as GraphConfiguration;

    const result = ConfigurationValidator.validate(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('metadata'))).toBe(true);
  });

  test('warns about undefined states in state transitions', () => {
    const configWithBadStates: GraphConfiguration = {
      metadata: {
        name: 'Test Graph',
        version: '1.0.0',
      },
      nodeTypes: {
        order: {
          shape: 'rectangle',
          dataSchema: {},
          states: {
            pending: { color: '#FFA500' },
            shipped: { color: '#00FF00' },
          },
        },
      },
      edgeTypes: {
        flow: { style: 'solid' },
      },
      allowedConnections: [],
      validation: {
        stateTransitions: {
          order: [
            {
              from: 'pending',
              to: ['shipped', 'nonexistent'], // ❌ nonexistent state
            },
          ],
        },
      },
    };

    const result = ConfigurationValidator.validate(configWithBadStates);
    expect(result.warnings.some((w) => w.message.includes('nonexistent'))).toBe(true);
  });

  test('validateOrThrow throws on invalid config', () => {
    const invalidConfig: GraphConfiguration = {
      metadata: {
        name: 'Test',
        version: '1.0.0',
      },
      nodeTypes: {}, // Empty!
      edgeTypes: {
        flow: { style: 'solid' },
      },
      allowedConnections: [],
    };

    expect(() => {
      ConfigurationValidator.validateOrThrow(invalidConfig);
    }).toThrow('Invalid GraphConfiguration');
  });

  test('formatReport creates readable output', () => {
    const result = {
      valid: false,
      errors: [
        {
          type: 'error' as const,
          message: 'Node type not found',
          path: 'nodeTypes.missing',
          suggestion: 'Add the node type definition',
        },
      ],
      warnings: [
        {
          type: 'warning' as const,
          message: 'No data schema',
          path: 'nodeTypes.process.dataSchema',
        },
      ],
    };

    const report = ConfigurationValidator.formatReport(result);
    expect(report).toContain('❌');
    expect(report).toContain('Node type not found');
    expect(report).toContain('⚠️');
    expect(report).toContain('No data schema');
    expect(report).toContain('💡');
  });
});
