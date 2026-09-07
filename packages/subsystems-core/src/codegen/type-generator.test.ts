/**
 * Type Generator Tests
 */

import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { generateTypes, generatorRegistry } from './type-generator';
import type { ExtendedCanvas } from '../types/canvas';

// Load the example canvas
const canvasPath = path.join(__dirname, '../../../../.principal-views/graph-converter-execution.otel.canvas');
const canvas: ExtendedCanvas = JSON.parse(fs.readFileSync(canvasPath, 'utf-8'));

describe('TypeScript Type Generator', () => {
  test('should generate TypeScript types from canvas', () => {
    const result = generateTypes(canvas, { language: 'typescript' });

    expect(result.extension).toBe('ts');
    expect(result.filename).toBe('graph-converter-execution.types.ts');
    expect(result.code).toContain('export namespace GraphConverter');
    expect(result.code).toContain('DO NOT EDIT MANUALLY');
  });

  test('should generate event interfaces with correct structure', () => {
    const result = generateTypes(canvas, {
      language: 'typescript',
      style: { includeDocComments: true },
    });

    // Should have ConversionStarted interface
    expect(result.code).toContain('export interface ConversionStarted');
    expect(result.code).toContain("name: 'conversion.started'");
    expect(result.code).toContain("'config.nodeTypes': number");
    expect(result.code).toContain("'config.edgeTypes': number");

    // Should have ConversionComplete interface
    expect(result.code).toContain('export interface ConversionComplete');
    expect(result.code).toContain("'result.nodes.count': number");
    expect(result.code).toContain("'result.edges.count': number");
  });

  test('should handle required vs optional fields', () => {
    const result = generateTypes(canvas, {
      language: 'typescript',
      style: { strictNullChecks: true },
    });

    // Required field (no question mark)
    expect(result.code).toMatch(/'config\.nodeTypes': number/);

    // Optional field (with question mark)
    expect(result.code).toMatch(/'duration\.ms'\?: number/);
  });

  test('should generate union types for all events', () => {
    const result = generateTypes(canvas, { language: 'typescript' });

    // Union of event types
    expect(result.code).toContain('export type Event =');
    expect(result.code).toContain('ConversionStarted');
    expect(result.code).toContain('ConversionComplete');

    // Union of event names
    expect(result.code).toContain('export type EventName =');
    expect(result.code).toContain("'conversion.started'");
    expect(result.code).toContain("'conversion.complete'");
  });

  test('should generate all event names union', () => {
    const result = generateTypes(canvas, { language: 'typescript' });

    expect(result.code).toContain('export type AllEventNames =');
    expect(result.code).toContain("'conversion.started'");
    expect(result.code).toContain("'validation.started'");
    expect(result.code).toContain("'output.created'");
  });

  test('should generate helper emitter types', () => {
    const result = generateTypes(canvas, { language: 'typescript' });

    expect(result.code).toContain('export type NodeEmitter<');
    expect(result.code).toContain('export type NodeEmitterByName<');
  });

  test('should include JSDoc comments when enabled', () => {
    const result = generateTypes(canvas, {
      language: 'typescript',
      style: { includeDocComments: true },
    });

    expect(result.code).toContain('/**');
    expect(result.code).toContain('Triggered when graph conversion begins');
    expect(result.code).toContain('Number of node types in config');
  });

  test('should omit JSDoc comments when disabled', () => {
    const result = generateTypes(canvas, {
      language: 'typescript',
      style: { includeDocComments: false },
    });

    // Should still have file header comment
    expect(result.code).toContain('DO NOT EDIT MANUALLY');

    // But fewer JSDoc blocks overall (updated for per-node-instance namespaces)
    const commentBlocks = result.code.match(/\/\*\*/g) || [];
    expect(commentBlocks.length).toBeLessThan(25);
  });

  test('should support readonly modifier', () => {
    const result = generateTypes(canvas, {
      language: 'typescript',
      style: { readonly: true },
    });

    expect(result.code).toContain('readonly name:');
    expect(result.code).toContain('readonly attributes:');
    expect(result.code).toContain("readonly 'config.nodeTypes':");
  });

  test('should support namespace option', () => {
    const result = generateTypes(canvas, {
      language: 'typescript',
      namespace: 'TelemetryEvents',
    });

    expect(result.code).toContain('export namespace TelemetryEvents {');
    expect(result.code).toMatch(/^export namespace TelemetryEvents \{/m);
    expect(result.code).toMatch(/\}$/m);
  });

  test('should handle multiple nodes with event schemas', () => {
    const result = generateTypes(canvas, { language: 'typescript' });

    // GraphConverter namespace
    expect(result.code).toContain('export namespace GraphConverter {');

    // Validation namespace
    expect(result.code).toContain('export namespace Validation {');

    // GraphOutput namespace
    expect(result.code).toContain('export namespace GraphOutput {');
  });

  test('should convert node IDs to PascalCase type names', () => {
    const result = generateTypes(canvas, { language: 'typescript' });

    // 'graph-converter' -> 'GraphConverter'
    expect(result.code).toContain('export namespace GraphConverter');

    // 'validation' -> 'Validation'
    expect(result.code).toContain('export namespace Validation');

    // 'graph-output' -> 'GraphOutput'
    expect(result.code).toContain('export namespace GraphOutput');
  });

  test('should convert event names to PascalCase interface names', () => {
    const result = generateTypes(canvas, { language: 'typescript' });

    // 'conversion.started' -> 'ConversionStarted'
    expect(result.code).toContain('export interface ConversionStarted');

    // 'validation.complete' -> 'ValidationComplete'
    expect(result.code).toContain('export interface ValidationComplete');
  });

  test('should write generated types to file', () => {
    const result = generateTypes(canvas, { language: 'typescript' });

    const outputPath = path.join(
      __dirname,
      '../../../../.principal-views',
      result.filename
    );

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, result.code);

    expect(fs.existsSync(outputPath)).toBe(true);

    const written = fs.readFileSync(outputPath, 'utf-8');
    expect(written).toBe(result.code);
  });
});

describe('Code Generator Registry', () => {
  test('should list available generators', () => {
    const languages = generatorRegistry.list();
    expect(languages).toContain('typescript');
  });

  test('should get TypeScript generator', () => {
    const generator = generatorRegistry.get('typescript');
    expect(generator).toBeDefined();
    expect(generator?.language).toBe('typescript');
  });

  test('should allow registering custom generators', () => {

    const customGenerator = {
      language: 'custom',
      generate: () => ({ code: 'test', extension: 'txt', filename: 'test.txt' }),
    };

    generatorRegistry.register(customGenerator);

    const retrieved = generatorRegistry.get('custom');
    expect(retrieved).toBe(customGenerator);

    expect(generatorRegistry.list()).toContain('custom');
  });
});
