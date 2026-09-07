import { describe, expect, test, beforeEach } from 'bun:test';
import { InMemoryFileSystemAdapter } from '@principal-ai/repository-abstraction';
import { ScopeEventsValidator } from './ScopeEventsValidator';
import type { ExtendedCanvas, OtelScopeNode, ExtendedCanvasNode } from '../types/canvas';

const BASE = '/project';

function scopeNode(id: string, scope: string): OtelScopeNode {
  return {
    id,
    type: 'otel-scope',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    otel: { scope },
  } as OtelScopeNode;
}

function canvas(nodes: ExtendedCanvasNode[]): ExtendedCanvas {
  return { nodes, edges: [] } as unknown as ExtendedCanvas;
}

describe('ScopeEventsValidator', () => {
  let fsAdapter: InMemoryFileSystemAdapter;
  let validator: ScopeEventsValidator;

  beforeEach(async () => {
    fsAdapter = new InMemoryFileSystemAdapter();
    await fsAdapter.createDir(`${BASE}/.principal-views`, { recursive: true });
    validator = new ScopeEventsValidator(fsAdapter);
  });

  async function writeEventsCanvas(filename: string): Promise<void> {
    await fsAdapter.writeFile(
      `${BASE}/.principal-views/${filename}`,
      '{"nodes":[],"edges":[]}',
    );
  }

  test('returns empty result when no scopes canvas is provided', async () => {
    const result = await validator.validate({ basePath: BASE });

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.coverage).toEqual({
      totalScopes: 0,
      scopesWithEvents: [],
      scopesMissingEvents: [],
    });
  });

  test('passes when every scope has a matching events canvas file', async () => {
    await writeEventsCanvas('auth.events.canvas');
    await writeEventsCanvas('billing.events.canvas');

    const result = await validator.validate({
      scopesCanvas: canvas([
        scopeNode('s1', 'auth'),
        scopeNode('s2', 'billing'),
      ]),
      basePath: BASE,
    });

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.coverage.totalScopes).toBe(2);
    expect(result.coverage.scopesWithEvents).toEqual(['auth', 'billing']);
    expect(result.coverage.scopesMissingEvents).toEqual([]);
  });

  test('flags a warn violation for each scope missing its events canvas file', async () => {
    const result = await validator.validate({
      scopesCanvas: canvas([
        scopeNode('s1', 'nope-one'),
        scopeNode('s2', 'nope-two'),
      ]),
      basePath: BASE,
    });

    // valid remains true because violations are warn-level, not errors
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(2);
    expect(result.violations.every((v) => v.severity === 'warn')).toBe(true);
    expect(result.violations.every((v) => v.ruleId === 'scope-events-canvas-required')).toBe(true);
    expect(result.coverage.scopesMissingEvents).toEqual(['nope-one', 'nope-two']);
    expect(result.coverage.scopesWithEvents).toEqual([]);
  });

  test('reports mixed coverage when some scopes have files and others do not', async () => {
    await writeEventsCanvas('present.events.canvas');

    const result = await validator.validate({
      scopesCanvas: canvas([
        scopeNode('s1', 'present'),
        scopeNode('s2', 'absent'),
      ]),
      basePath: BASE,
    });

    expect(result.coverage.scopesWithEvents).toEqual(['present']);
    expect(result.coverage.scopesMissingEvents).toEqual(['absent']);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].scope).toBe('absent');
    expect(result.violations[0].expectedPath).toBe('.principal-views/absent.events.canvas');
  });

  test('converts dots in scope names to dashes for the expected filename', async () => {
    await writeEventsCanvas('backlog-md-cli.events.canvas');

    const result = await validator.validate({
      scopesCanvas: canvas([scopeNode('s1', 'backlog.md.cli')]),
      basePath: BASE,
    });

    expect(result.violations).toHaveLength(0);
    expect(result.coverage.scopesWithEvents).toEqual(['backlog.md.cli']);
  });

  test('ignores non-otel-scope nodes', async () => {
    await writeEventsCanvas('present.events.canvas');
    const mixedNodes = [
      scopeNode('s1', 'present'),
      {
        id: 'e1',
        type: 'otel-event',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        eventRef: 'some.event',
      },
      {
        id: 't1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        text: 'not a scope',
      },
    ] as unknown as ExtendedCanvasNode[];

    const result = await validator.validate({
      scopesCanvas: canvas(mixedNodes),
      basePath: BASE,
    });

    expect(result.coverage.totalScopes).toBe(1);
    expect(result.coverage.scopesWithEvents).toEqual(['present']);
  });

  test('skips otel-scope nodes missing otel.scope without throwing', async () => {
    const nodeWithoutScope = {
      id: 's-bad',
      type: 'otel-scope',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      otel: {},
    } as unknown as OtelScopeNode;

    const result = await validator.validate({
      scopesCanvas: canvas([nodeWithoutScope]),
      basePath: BASE,
    });

    expect(result.violations).toHaveLength(0);
    expect(result.coverage.scopesWithEvents).toEqual([]);
    expect(result.coverage.scopesMissingEvents).toEqual([]);
  });
});
