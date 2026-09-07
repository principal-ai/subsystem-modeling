import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { NodeFileSystemAdapter } from '@principal-ai/repository-abstraction/node';
import { EventsCanvasValidator } from './EventsCanvasValidator';
import type { ExtendedCanvas } from '../types/canvas';

let testRoot: string;

beforeAll(() => {
  testRoot = mkdtempSync(join(tmpdir(), 'events-canvas-validator-'));
  mkdirSync(join(testRoot, 'src/events'), { recursive: true });
  mkdirSync(join(testRoot, 'src/workflow/scenarios'), { recursive: true });
  mkdirSync(join(testRoot, 'src/trace'), { recursive: true });
  mkdirSync(join(testRoot, 'src/generated/events'), { recursive: true });
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

function namespaceNode(
  id: string,
  name: string,
  opts: { paths?: string[]; eventNames?: string[] } = {},
): any {
  const eventNames = opts.eventNames ?? [`${name}.happened`];
  return {
    id,
    type: 'event-namespace',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    namespace: {
      name,
      description: `${name} description`,
      paths: opts.paths,
      events: eventNames.map((n) => ({
        name: n,
        severity: 'INFO',
        description: `desc for ${n}`,
      })),
    },
  };
}

function canvas(nodes: any[]): ExtendedCanvas {
  return { nodes, edges: [] } as unknown as ExtendedCanvas;
}

async function runValidator(nodes: any[]) {
  const validator = new EventsCanvasValidator(new NodeFileSystemAdapter());
  return validator.validate({
    eventsCanvas: canvas(nodes),
    eventsCanvasPath: 'test.events.canvas',
    basePath: testRoot,
  });
}

function rules(result: { violations: Array<{ ruleId: string }> }, ruleId: string) {
  return result.violations.filter((v) => v.ruleId === ruleId);
}

describe('EventsCanvasValidator — paths field', () => {
  test('namespace without paths: no path-related violations (opt-in, backward compatible)', async () => {
    const result = await runValidator([namespaceNode('events', 'events')]);

    expect(rules(result, 'events-namespace-multiple-paths')).toHaveLength(0);
    expect(rules(result, 'events-namespace-paths-missing')).toHaveLength(0);
    expect(rules(result, 'events-namespace-paths-overlap')).toHaveLength(0);
  });

  test('namespace with one existing path: no path-related violations', async () => {
    const result = await runValidator([
      namespaceNode('events', 'events', { paths: ['src/events'] }),
    ]);

    expect(rules(result, 'events-namespace-multiple-paths')).toHaveLength(0);
    expect(rules(result, 'events-namespace-paths-missing')).toHaveLength(0);
    expect(rules(result, 'events-namespace-paths-overlap')).toHaveLength(0);
  });

  test('namespace with missing path: warns events-namespace-paths-missing', async () => {
    const result = await runValidator([
      namespaceNode('events', 'events', { paths: ['src/does-not-exist'] }),
    ]);

    const missing = rules(result, 'events-namespace-paths-missing');
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe('warn');
    expect(missing[0].message).toContain('src/does-not-exist');
  });

  test('namespace with multiple paths: warns events-namespace-multiple-paths', async () => {
    const result = await runValidator([
      namespaceNode('events', 'events', {
        paths: ['src/events', 'src/generated/events'],
      }),
    ]);

    const multi = rules(result, 'events-namespace-multiple-paths');
    expect(multi).toHaveLength(1);
    expect(multi[0].severity).toBe('warn');
    expect(multi[0].message).toContain('2 paths');
  });

  test('two namespaces declaring identical paths: errors events-namespace-paths-overlap', async () => {
    const result = await runValidator([
      namespaceNode('a', 'alpha', {
        paths: ['src/events'],
        eventNames: ['alpha.happened'],
      }),
      namespaceNode('b', 'beta', {
        paths: ['src/events'],
        eventNames: ['beta.happened'],
      }),
    ]);

    const overlap = rules(result, 'events-namespace-paths-overlap');
    expect(overlap).toHaveLength(1);
    expect(overlap[0].severity).toBe('error');
    expect(result.valid).toBe(false);
  });

  test('parent-child partition (workflow / workflow.scenarios): no overlap error', async () => {
    const result = await runValidator([
      namespaceNode('workflow', 'workflow', {
        paths: ['src/workflow'],
        eventNames: ['workflow.happened'],
      }),
      namespaceNode('workflow.scenarios', 'workflow.scenarios', {
        paths: ['src/workflow/scenarios'],
        eventNames: ['workflow.scenarios.matched'],
      }),
    ]);

    expect(rules(result, 'events-namespace-paths-overlap')).toHaveLength(0);
  });

  test('disjoint sibling paths: no overlap error', async () => {
    const result = await runValidator([
      namespaceNode('events', 'events', {
        paths: ['src/events'],
        eventNames: ['events.happened'],
      }),
      namespaceNode('trace', 'trace', {
        paths: ['src/trace'],
        eventNames: ['trace.happened'],
      }),
    ]);

    expect(rules(result, 'events-namespace-paths-overlap')).toHaveLength(0);
  });

  test('path normalization: trailing slashes and "./" prefix compared equivalently', async () => {
    const result = await runValidator([
      namespaceNode('a', 'alpha', {
        paths: ['src/events/'],
        eventNames: ['alpha.happened'],
      }),
      namespaceNode('b', 'beta', {
        paths: ['./src/events'],
        eventNames: ['beta.happened'],
      }),
    ]);

    expect(rules(result, 'events-namespace-paths-overlap')).toHaveLength(1);
  });

  test('similar-prefix paths that are not parent/child: no overlap error', async () => {
    // src/foo and src/foobar share a prefix but neither is a descendant of the other.
    // These should not trigger the overlap rule.
    mkdirSync(join(testRoot, 'src/foo'), { recursive: true });
    mkdirSync(join(testRoot, 'src/foobar'), { recursive: true });

    const result = await runValidator([
      namespaceNode('a', 'foo', {
        paths: ['src/foo'],
        eventNames: ['foo.happened'],
      }),
      namespaceNode('b', 'foobar', {
        paths: ['src/foobar'],
        eventNames: ['foobar.happened'],
      }),
    ]);

    expect(rules(result, 'events-namespace-paths-overlap')).toHaveLength(0);
  });
});
