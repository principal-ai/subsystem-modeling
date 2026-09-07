import { describe, it, expect, beforeEach } from 'vitest';
import { GraphRulesEngine, createRulesEngine } from './engine';
import { builtinRules } from './implementations';
import type { GraphConfiguration } from '../types';
import type { GraphRule } from './types';

describe('GraphRulesEngine', () => {
  let engine: GraphRulesEngine;

  beforeEach(() => {
    engine = new GraphRulesEngine();
  });

  describe('rule registration', () => {
    it('should register a rule', () => {
      const mockRule: GraphRule = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'A test rule',
        impact: 'Test impact',
        severity: 'error',
        category: 'schema',
        enabled: true,
        fixable: false,
        check: async () => [],
      };

      engine.registerRule(mockRule);
      expect(engine.getRule('test-rule')).toBe(mockRule);
    });

    it('should throw when registering duplicate rule', () => {
      const mockRule: GraphRule = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'A test rule',
        impact: 'Test impact',
        severity: 'error',
        category: 'schema',
        enabled: true,
        fixable: false,
        check: async () => [],
      };

      engine.registerRule(mockRule);
      expect(() => engine.registerRule(mockRule)).toThrow('already registered');
    });

    it('should register multiple rules', () => {
      const rules: GraphRule[] = [
        {
          id: 'rule-1',
          name: 'Rule 1',
          description: 'Rule 1',
          impact: 'Impact 1',
          severity: 'error',
          category: 'schema',
          enabled: true,
          fixable: false,
          check: async () => [],
        },
        {
          id: 'rule-2',
          name: 'Rule 2',
          description: 'Rule 2',
          impact: 'Impact 2',
          severity: 'warn',
          category: 'reference',
          enabled: true,
          fixable: false,
          check: async () => [],
        },
      ];

      engine.registerRules(rules);
      expect(engine.getAllRules().size).toBe(2);
    });

    it('should unregister a rule', () => {
      const mockRule: GraphRule = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'A test rule',
        impact: 'Test impact',
        severity: 'error',
        category: 'schema',
        enabled: true,
        fixable: false,
        check: async () => [],
      };

      engine.registerRule(mockRule);
      expect(engine.unregisterRule('test-rule')).toBe(true);
      expect(engine.getRule('test-rule')).toBeUndefined();
    });

    it('should get rules by category', () => {
      engine.registerRules(builtinRules);
      const schemaRules = engine.getRulesByCategory('schema');
      expect(schemaRules.length).toBeGreaterThan(0);
      expect(schemaRules.every((r) => r.category === 'schema')).toBe(true);
    });
  });

  describe('linting', () => {
    const validConfig: GraphConfiguration = {
      metadata: {
        name: 'Test Config',
        version: '1.0.0',
      },
      nodeTypes: {
        service: {
          description: 'A service node',
          shape: 'rectangle',
          dataSchema: {
            name: { type: 'string' },
          },
        },
      },
      edgeTypes: {
        calls: {
          style: 'solid',
        },
      },
      allowedConnections: [{ from: 'service', to: 'service', via: 'calls' }],
    };

    it('should return no violations for valid config', async () => {
      engine.registerRules(builtinRules);

      // Add sources to avoid minimum-node-sources violation
      const configWithSources = {
        ...validConfig,
        nodeTypes: {
          service: {
            ...validConfig.nodeTypes.service,
            sources: ['lib/service.ts'],
          },
        },
      };

      const result = await engine.lint(configWithSources);
      expect(result.errorCount).toBe(0);
    });

    it('should detect missing metadata', async () => {
      engine.registerRules(builtinRules);

      const invalidConfig = {
        nodeTypes: validConfig.nodeTypes,
        edgeTypes: validConfig.edgeTypes,
        allowedConnections: validConfig.allowedConnections,
      } as GraphConfiguration;

      const result = await engine.lint(invalidConfig);
      expect(result.violations.some((v) => v.ruleId === 'required-metadata')).toBe(true);
    });

    it('should detect invalid color format', async () => {
      engine.registerRules(builtinRules);

      const invalidConfig: GraphConfiguration = {
        ...validConfig,
        nodeTypes: {
          service: {
            ...validConfig.nodeTypes.service,
            color: 'blue', // Invalid - should be hex
            sources: ['lib/service.ts'],
          },
        },
      };

      const result = await engine.lint(invalidConfig);
      const colorViolation = result.violations.find((v) => v.ruleId === 'valid-color-format');
      expect(colorViolation).toBeDefined();
      expect(colorViolation?.message).toContain('blue');
    });

    it('should respect disabled rules', async () => {
      engine.registerRules(builtinRules);

      const invalidConfig: GraphConfiguration = {
        ...validConfig,
        nodeTypes: {
          service: {
            ...validConfig.nodeTypes.service,
            color: 'invalid',
          },
        },
      };

      const result = await engine.lint(invalidConfig, {
        disabledRules: ['valid-color-format'],
      });

      expect(result.violations.some((v) => v.ruleId === 'valid-color-format')).toBe(false);
    });

    it('should respect enabled rules filter', async () => {
      engine.registerRules(builtinRules);

      const result = await engine.lint(validConfig, {
        enabledRules: ['required-metadata'],
      });

      // Should only have violations from required-metadata (or none if valid)
      expect(result.violations.every((v) => v.ruleId === 'required-metadata')).toBe(true);
    });

    it('should apply severity overrides', async () => {
      engine.registerRules(builtinRules);

      const invalidConfig: GraphConfiguration = {
        ...validConfig,
        nodeTypes: {
          service: {
            ...validConfig.nodeTypes.service,
            color: 'invalid',
            sources: ['lib/service.ts'],
          },
        },
      };

      const result = await engine.lint(invalidConfig, {
        severityOverrides: new Map([['valid-color-format', 'warn']]),
      });

      const colorViolation = result.violations.find((v) => v.ruleId === 'valid-color-format');
      expect(colorViolation?.severity).toBe('warn');
    });

    it('should count violations correctly', async () => {
      engine.registerRules(builtinRules);

      const invalidConfig: GraphConfiguration = {
        metadata: { name: 'Test', version: '1.0.0' },
        nodeTypes: {
          service: {
            description: 'A service node',
            shape: 'rectangle',
            color: 'invalid1',
            dataSchema: {},
          },
          database: {
            description: 'A database node',
            shape: 'rectangle',
            color: 'invalid2',
            dataSchema: {},
          },
        },
        edgeTypes: {
          calls: { style: 'solid' },
        },
        allowedConnections: [{ from: 'service', to: 'database', via: 'calls' }],
      };

      const result = await engine.lint(invalidConfig);
      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations.length).toBe(result.errorCount + result.warningCount);
    });

    it('should handle rule execution errors gracefully', async () => {
      const errorRule: GraphRule = {
        id: 'error-rule',
        name: 'Error Rule',
        description: 'A rule that throws',
        impact: 'Test',
        severity: 'error',
        category: 'schema',
        enabled: true,
        fixable: false,
        check: async () => {
          throw new Error('Test error');
        },
      };

      engine.registerRule(errorRule);

      const result = await engine.lint(validConfig);
      const errorViolation = result.violations.find((v) => v.ruleId === 'error-rule');
      expect(errorViolation).toBeDefined();
      expect(errorViolation?.message).toContain('Test error');
    });
  });

  describe('createRulesEngine', () => {
    it('should create engine with provided rules', () => {
      const rules: GraphRule[] = [
        {
          id: 'test-rule',
          name: 'Test',
          description: 'Test',
          impact: 'Test',
          severity: 'error',
          category: 'schema',
          enabled: true,
          fixable: false,
          check: async () => [],
        },
      ];

      const engine = createRulesEngine(rules);
      expect(engine.getAllRules().size).toBe(1);
    });

    it('should create empty engine when no rules provided', () => {
      const engine = createRulesEngine();
      expect(engine.getAllRules().size).toBe(0);
    });
  });
});

describe('builtinRules', () => {
  it('should have 13 rules', () => {
    expect(builtinRules.length).toBe(13);
  });

  it('should have unique IDs', () => {
    const ids = builtinRules.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should all default to error severity', () => {
    expect(builtinRules.every((r) => r.severity === 'error')).toBe(true);
  });

  it('should all be enabled by default', () => {
    expect(builtinRules.every((r) => r.enabled === true)).toBe(true);
  });
});
