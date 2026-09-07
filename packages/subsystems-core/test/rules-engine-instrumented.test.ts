/**
 * Rules Engine Instrumented Test
 *
 * This test exercises the rules engine with OTEL instrumentation enabled.
 * Spans are captured and written to __executions__/ for visualization.
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { startTestSpan, addEvent, endSpan, markTestPassed } from './otel-setup';
import { createDefaultRulesEngine } from '../src/rules';
import type { GraphConfiguration } from '../src/types';
import fs from 'fs';
import path from 'path';

// Configuration with intentional violations for interesting telemetry
const configWithViolations: GraphConfiguration = {
  // Missing metadata - will trigger required-metadata rule
  nodeTypes: {
    'api-service': {
      description: 'API Service',
      shape: 'rectangle',
      color: 'invalid-color', // Invalid color format
      dataSchema: {
        name: { type: 'string' },
      },
      // Missing sources - will trigger minimum-node-sources
    },
    'database': {
      description: 'Database',
      shape: 'cylinder',
      color: '#10b981', // Valid color
      dataSchema: {
        name: { type: 'string' },
      },
      sources: ['lib/db.ts'],
    },
    'orphaned-type': {
      // This type is never used in connections
      description: 'Orphaned node type',
      shape: 'rectangle',
      dataSchema: {},
      sources: ['lib/orphaned.ts'],
    },
  },
  edgeTypes: {
    'http-call': {
      style: 'solid',
    },
    'orphaned-edge': {
      // This edge type is never used
      style: 'dashed',
    },
  },
  allowedConnections: [
    { from: 'api-service', to: 'database', via: 'http-call' },
  ],
} as GraphConfiguration;

// Valid configuration for comparison
const validConfig: GraphConfiguration = {
  metadata: {
    name: 'Valid Test Config',
    version: '1.0.0',
  },
  nodeTypes: {
    service: {
      description: 'A service node',
      shape: 'rectangle',
      color: '#3b82f6',
      dataSchema: {
        name: { type: 'string' },
      },
      sources: ['lib/service.ts'],
    },
  },
  edgeTypes: {
    calls: {
      style: 'solid',
    },
  },
  allowedConnections: [
    { from: 'service', to: 'service', via: 'calls' },
  ],
};

describe('Rules Engine with Telemetry', () => {
  const collectedSpans: unknown[] = [];

  test('lint configuration with violations', async () => {
    const span = startTestSpan('rules.lint.with.violations');

    // Add test metadata
    addEvent(span, 'test.started', {
      'test.type': 'integration',
      'test.subject': 'rules-engine',
    });

    // Create rules engine
    addEvent(span, 'engine.creating', {
      'engine.type': 'default',
    });
    const engine = createDefaultRulesEngine();

    addEvent(span, 'engine.created', {
      'engine.rules.count': engine.getAllRules().size,
    });

    // Lint configuration
    addEvent(span, 'lint.starting', {
      'config.node.types.count': Object.keys(configWithViolations.nodeTypes).length,
      'config.edge.types.count': Object.keys(configWithViolations.edgeTypes).length,
      'config.connections.count': configWithViolations.allowedConnections.length,
    });

    const result = await engine.lint(configWithViolations, {
      configPath: 'test-config-with-violations.yaml',
    });

    addEvent(span, 'lint.completed', {
      'result.violations.total': result.violations.length,
      'result.violations.errors': result.errorCount,
      'result.violations.warnings': result.warningCount,
      'result.violations.fixable': result.fixableCount,
    });

    // Assert expected violations
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.errorCount).toBeGreaterThan(0);

    // Check specific rule violations
    const metadataViolation = result.violations.find(v => v.ruleId === 'required-metadata');
    const colorViolation = result.violations.find(v => v.ruleId === 'valid-color-format');
    const sourcesViolation = result.violations.find(v => v.ruleId === 'minimum-node-sources');

    addEvent(span, 'violations.analyzed', {
      'violation.required-metadata.found': !!metadataViolation,
      'violation.valid-color-format.found': !!colorViolation,
      'violation.minimum-node-sources.found': !!sourcesViolation,
    });

    expect(metadataViolation).toBeDefined();
    expect(colorViolation).toBeDefined();
    expect(sourcesViolation).toBeDefined();

    markTestPassed(span);
    endSpan(span);
    collectedSpans.push(span);
  });

  test('lint valid configuration', async () => {
    const span = startTestSpan('rules.lint.valid.config');

    addEvent(span, 'test.started', {
      'test.type': 'integration',
      'test.subject': 'rules-engine',
      'test.expectation': 'no-violations',
    });

    const engine = createDefaultRulesEngine();

    addEvent(span, 'lint.starting', {
      'config.node.types.count': Object.keys(validConfig.nodeTypes).length,
      'config.edge.types.count': Object.keys(validConfig.edgeTypes).length,
    });

    const result = await engine.lint(validConfig, {
      configPath: 'test-config-valid.yaml',
    });

    addEvent(span, 'lint.completed', {
      'result.violations.total': result.violations.length,
      'result.violations.errors': result.errorCount,
      'result.violations.warnings': result.warningCount,
    });

    expect(result.violations.length).toBe(0);
    expect(result.errorCount).toBe(0);

    markTestPassed(span);
    endSpan(span);
    collectedSpans.push(span);
  });

  test('lint with rule severity override', async () => {
    const span = startTestSpan('rules.lint.severity.override');

    addEvent(span, 'test.started', {
      'test.type': 'integration',
      'test.subject': 'rules-engine-config',
    });

    const engine = createDefaultRulesEngine();

    addEvent(span, 'lint.starting', {
      'config.has.violations': true,
      'config.severity.override': 'valid-color-format=warn',
    });

    // Override color format rule to warning
    const result = await engine.lint(configWithViolations, {
      configPath: 'test-config-override.yaml',
      severityOverrides: new Map([['valid-color-format', 'warn']]),
    });

    const colorViolation = result.violations.find(v => v.ruleId === 'valid-color-format');

    addEvent(span, 'lint.completed', {
      'result.violations.total': result.violations.length,
      'violation.color.severity': colorViolation?.severity ?? 'not-found',
    });

    expect(colorViolation?.severity).toBe('warn');

    markTestPassed(span);
    endSpan(span);
    collectedSpans.push(span);
  });

  test('lint with disabled rules', async () => {
    const span = startTestSpan('rules.lint.disabled.rules');

    addEvent(span, 'test.started', {
      'test.type': 'integration',
      'test.subject': 'rules-engine-config',
    });

    const engine = createDefaultRulesEngine();

    addEvent(span, 'lint.starting', {
      'config.disabled.rules': 'valid-color-format,minimum-node-sources',
    });

    const result = await engine.lint(configWithViolations, {
      configPath: 'test-config-disabled.yaml',
      disabledRules: ['valid-color-format', 'minimum-node-sources'],
    });

    const colorViolation = result.violations.find(v => v.ruleId === 'valid-color-format');
    const sourcesViolation = result.violations.find(v => v.ruleId === 'minimum-node-sources');

    addEvent(span, 'lint.completed', {
      'result.violations.total': result.violations.length,
      'violation.color.disabled': !colorViolation,
      'violation.sources.disabled': !sourcesViolation,
    });

    expect(colorViolation).toBeUndefined();
    expect(sourcesViolation).toBeUndefined();

    markTestPassed(span);
    endSpan(span);
    collectedSpans.push(span);
  });

  // Export spans after all tests
  afterAll(() => {
    const metadata = {
      canvasName: 'Rules Engine Execution',
      exportedAt: new Date().toISOString(),
      source: 'test:rules-engine',
      framework: 'bun',
      status: 'success' as const,
    };

    const outputPath = path.join(
      __dirname,
      '../../../.principal-views/validation/validation-workflow/rules-engine-execution.otel.json'
    );

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const output = {
      metadata,
      spans: collectedSpans,
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log(`\n✅ Exported ${collectedSpans.length} spans to ${outputPath}`);
  });
});
