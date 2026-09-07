import { describe, expect, test } from 'bun:test';
import { OtelEventPathsValidator } from './OtelEventPathsValidator';
import type { ExtendedCanvas } from '../types/canvas';

function namespaceNode(name: string, opts: { paths?: string[] } = {}): any {
  return {
    id: `ns-${name}`,
    type: 'event-namespace',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    namespace: {
      name,
      description: `${name} description`,
      paths: opts.paths,
      events: [],
    },
  };
}

function eventNode(
  id: string,
  eventName: string,
  scope: string,
  files: string[] | undefined,
): any {
  return {
    id,
    type: 'otel-event',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    label: eventName,
    event: { name: eventName, attributes: {} },
    otel: { scope, files },
  };
}

function canvas(nodes: any[]): ExtendedCanvas {
  return { nodes, edges: [] } as unknown as ExtendedCanvas;
}

function validate(input: {
  events: Array<{ scope: string; nodes: any[] }>;
  otel: any[][];
}) {
  const validator = new OtelEventPathsValidator();
  return validator.validate({
    eventsCanvases: input.events.map((e, i) => ({
      canvas: canvas(e.nodes),
      canvasPath: `scope-${i}.events.canvas`,
      scope: e.scope,
    })),
    otelCanvases: input.otel.map((nodes, i) => ({
      canvas: canvas(nodes),
      canvasPath: `otel-${i}.otel.canvas`,
    })),
  });
}

function rules(result: { violations: Array<{ ruleId: string }> }, ruleId: string) {
  return result.violations.filter((v) => v.ruleId === ruleId);
}

describe('OtelEventPathsValidator', () => {
  test('empty input produces no violations', () => {
    const result = validate({ events: [], otel: [] });
    expect(result.violations).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  test('skips events whose namespace has no paths declared (opt-in)', () => {
    const result = validate({
      events: [{ scope: 's', nodes: [namespaceNode('events')] }], // no paths
      otel: [[eventNode('e1', 'events.happened', 's', ['src/somewhere/else.ts'])]],
    });
    expect(result.violations).toHaveLength(0);
    expect(result.metrics.eventsSkippedNoPaths).toBe(1);
    expect(result.metrics.eventsChecked).toBe(0);
  });

  test('file covered by the event’s namespace: no violation', () => {
    const result = validate({
      events: [
        {
          scope: 's',
          nodes: [namespaceNode('events', { paths: ['src/events'] })],
        },
      ],
      otel: [[eventNode('e1', 'events.happened', 's', ['src/events/foo.ts'])]],
    });
    expect(result.violations).toHaveLength(0);
    expect(result.metrics.eventsChecked).toBe(1);
    expect(result.metrics.filesChecked).toBe(1);
  });

  test('file covered by a different namespace: wrong-namespace error', () => {
    const result = validate({
      events: [
        {
          scope: 's',
          nodes: [
            namespaceNode('validation', { paths: ['src/validation'] }),
            namespaceNode('middleware', { paths: ['src/middleware'] }),
          ],
        },
      ],
      otel: [
        [eventNode('e1', 'validation.started', 's', ['src/middleware/auth.ts'])],
      ],
    });

    const wrong = rules(result, 'events-otel-files-wrong-namespace');
    expect(wrong).toHaveLength(1);
    expect(wrong[0].severity).toBe('error');
    expect(wrong[0].message).toContain('middleware');
    expect(wrong[0].message).toContain('validation.started');
    expect(result.valid).toBe(false);
  });

  test('file in no namespace: orphan warning', () => {
    const result = validate({
      events: [
        {
          scope: 's',
          nodes: [namespaceNode('events', { paths: ['src/events'] })],
        },
      ],
      otel: [
        [eventNode('e1', 'events.happened', 's', ['src/nowhere/foo.ts'])],
      ],
    });

    const orphan = rules(result, 'events-otel-files-orphan');
    expect(orphan).toHaveLength(1);
    expect(orphan[0].severity).toBe('warn');
    expect(orphan[0].message).toContain('src/nowhere/foo.ts');
    expect(result.valid).toBe(true); // only warnings
  });

  test('parent-child partition: event on parent using child-owned file is flagged', () => {
    const result = validate({
      events: [
        {
          scope: 's',
          nodes: [
            namespaceNode('workflow', { paths: ['src/workflow'] }),
            namespaceNode('workflow.scenarios', { paths: ['src/workflow/scenarios'] }),
          ],
        },
      ],
      otel: [
        // "workflow.started" declared with a file under workflow.scenarios/
        [eventNode('e1', 'workflow.started', 's', ['src/workflow/scenarios/matcher.ts'])],
      ],
    });

    const wrong = rules(result, 'events-otel-files-wrong-namespace');
    expect(wrong).toHaveLength(1);
    expect(wrong[0].message).toContain('workflow.scenarios');
  });

  test('parent-child partition: event on child using child-owned file is OK', () => {
    const result = validate({
      events: [
        {
          scope: 's',
          nodes: [
            namespaceNode('workflow', { paths: ['src/workflow'] }),
            namespaceNode('workflow.scenarios', { paths: ['src/workflow/scenarios'] }),
          ],
        },
      ],
      otel: [
        [eventNode('e1', 'workflow.scenarios.matched', 's', ['src/workflow/scenarios/m.ts'])],
      ],
    });
    expect(result.violations).toHaveLength(0);
  });

  test('scope isolation: namespace paths from scope A do not claim files for scope B events', () => {
    const result = validate({
      events: [
        {
          scope: 'A',
          nodes: [namespaceNode('events', { paths: ['src/events'] })],
        },
        // Scope B has no paths declared at all
        {
          scope: 'B',
          nodes: [namespaceNode('events')],
        },
      ],
      otel: [
        // Event in scope B with a file that WOULD be covered in scope A.
        // Since scope B namespace has no paths → skipped (opt-in).
        [eventNode('e1', 'events.happened', 'B', ['src/events/foo.ts'])],
      ],
    });

    expect(result.violations).toHaveLength(0);
    expect(result.metrics.eventsSkippedNoPaths).toBe(1);
  });

  test('events with no scope or no files are skipped', () => {
    const result = validate({
      events: [
        { scope: 's', nodes: [namespaceNode('events', { paths: ['src/events'] })] },
      ],
      otel: [
        [
          eventNode('no-scope', 'events.happened', '', ['src/nowhere.ts']),
          eventNode('no-files', 'events.happened', 's', undefined),
        ],
      ],
    });
    expect(result.violations).toHaveLength(0);
    expect(result.metrics.eventsChecked).toBe(0);
    // The "no-files" event is counted in eventsSkippedNoFiles;
    // the "no-scope" event is skipped silently before namespace resolution.
    expect(result.metrics.eventsSkippedNoFiles).toBe(1);
  });

  test('multiple otel canvases are all checked', () => {
    const result = validate({
      events: [
        {
          scope: 's',
          nodes: [namespaceNode('events', { paths: ['src/events'] })],
        },
      ],
      otel: [
        [eventNode('e1', 'events.one', 's', ['src/events/ok.ts'])],
        [eventNode('e2', 'events.two', 's', ['src/other/bad.ts'])],
      ],
    });

    expect(rules(result, 'events-otel-files-orphan')).toHaveLength(1);
    expect(result.metrics.filesChecked).toBe(2);
  });
});
