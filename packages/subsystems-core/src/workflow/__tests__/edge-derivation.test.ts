/**
 * Tests for edge derivation from workflows
 */

import {
  extractEventSpans,
  deriveEdgesFromSequence,
  deriveWorkflowEdges,
  deriveEdgesFromWorkflows,
  groupEdgesBySources,
} from '../edge-derivation';
import type { WorkflowTemplate, WorkflowScenario } from '../types';

describe('extractEventSpans', () => {
  it('extracts spans from string events using rootSpan', () => {
    const scenario: WorkflowScenario = {
      id: 'test',
      priority: 1,
      description: 'Test scenario',
      template: {
        events: {
          'event.one': 'First event',
          'event.two': 'Second event',
        },
      },
    };

    const result = extractEventSpans(scenario, 'root.span');

    expect(result).toEqual([
      { eventName: 'event.one', span: 'root.span' },
      { eventName: 'event.two', span: 'root.span' },
    ]);
  });

  it('extracts explicit spans from object events', () => {
    const scenario: WorkflowScenario = {
      id: 'test',
      priority: 1,
      description: 'Test scenario',
      template: {
        events: {
          'event.one': { span: 'custom.span', template: 'First event' },
          'event.two': 'Second event',
          'event.three': { span: 'another.span', template: 'Third event' },
        },
      },
    };

    const result = extractEventSpans(scenario, 'root.span');

    expect(result).toEqual([
      { eventName: 'event.one', span: 'custom.span' },
      { eventName: 'event.two', span: 'root.span' },
      { eventName: 'event.three', span: 'another.span' },
    ]);
  });

  it('handles object events without span using rootSpan', () => {
    const scenario: WorkflowScenario = {
      id: 'test',
      priority: 1,
      description: 'Test scenario',
      template: {
        events: {
          'event.one': { template: 'No span specified' },
        },
      },
    };

    const result = extractEventSpans(scenario, 'root.span');

    expect(result).toEqual([{ eventName: 'event.one', span: 'root.span' }]);
  });

  it('returns empty array when no events', () => {
    const scenario: WorkflowScenario = {
      id: 'test',
      priority: 1,
      description: 'Test scenario',
      template: {},
    };

    const result = extractEventSpans(scenario, 'root.span');

    expect(result).toEqual([]);
  });

  it('skips events when no rootSpan and no explicit span', () => {
    const scenario: WorkflowScenario = {
      id: 'test',
      priority: 1,
      description: 'Test scenario',
      template: {
        events: {
          'event.one': 'No span available',
          'event.two': { span: 'explicit.span', template: 'Has span' },
        },
      },
    };

    const result = extractEventSpans(scenario, undefined);

    expect(result).toEqual([{ eventName: 'event.two', span: 'explicit.span' }]);
  });
});

describe('deriveEdgesFromSequence', () => {
  it('derives edge when spans differ', () => {
    const eventSpans = [
      { eventName: 'start', span: 'span.a' },
      { eventName: 'middle', span: 'span.b' },
    ];

    const edges = deriveEdgesFromSequence(eventSpans, 'test-scenario');

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      fromSpan: 'span.a',
      toSpan: 'span.b',
      scenarioId: 'test-scenario',
      eventNames: ['start', 'middle'],
      sequenceNumber: 1,
    });
  });

  it('does not derive edge when spans are same', () => {
    const eventSpans = [
      { eventName: 'start', span: 'span.a' },
      { eventName: 'continue', span: 'span.a' },
    ];

    const edges = deriveEdgesFromSequence(eventSpans, 'test-scenario');

    expect(edges).toHaveLength(0);
  });

  it('derives multiple edges for span sequence', () => {
    const eventSpans = [
      { eventName: 'e1', span: 'root' },
      { eventName: 'e2', span: 'child.a' },
      { eventName: 'e3', span: 'child.a' },
      { eventName: 'e4', span: 'child.b' },
      { eventName: 'e5', span: 'root' },
    ];

    const edges = deriveEdgesFromSequence(eventSpans, 'test-scenario');

    expect(edges).toHaveLength(3);
    expect(edges[0]).toMatchObject({ fromSpan: 'root', toSpan: 'child.a' });
    expect(edges[1]).toMatchObject({ fromSpan: 'child.a', toSpan: 'child.b' });
    expect(edges[2]).toMatchObject({ fromSpan: 'child.b', toSpan: 'root' });
  });

  it('deduplicates repeated edges', () => {
    const eventSpans = [
      { eventName: 'e1', span: 'root' },
      { eventName: 'e2', span: 'child' },
      { eventName: 'e3', span: 'root' },
      { eventName: 'e4', span: 'child' }, // Same edge as e1->e2
    ];

    const edges = deriveEdgesFromSequence(eventSpans, 'test-scenario');

    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ fromSpan: 'root', toSpan: 'child' });
    expect(edges[1]).toMatchObject({ fromSpan: 'child', toSpan: 'root' });
  });

  it('handles empty sequence', () => {
    const edges = deriveEdgesFromSequence([], 'test-scenario');
    expect(edges).toHaveLength(0);
  });

  it('handles single event', () => {
    const eventSpans = [{ eventName: 'only', span: 'root' }];
    const edges = deriveEdgesFromSequence(eventSpans, 'test-scenario');
    expect(edges).toHaveLength(0);
  });
});

describe('deriveWorkflowEdges', () => {
  it('derives edges from workflow with rootSpan', () => {
    const workflow: WorkflowTemplate = {
      version: '1.0.0',
      canvas: 'test.canvas',
      name: 'Test Workflow',
      description: 'Test',
      rootSpan: 'cli.command',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'success',
          priority: 1,
          description: 'Success path',
          template: {
            events: {
              'cli.started': 'Started',
              'validation.started': { span: 'validate.canvas', template: 'Validating' },
              'validation.complete': { span: 'validate.canvas', template: 'Done' },
              'cli.complete': 'Completed',
            },
          },
        },
      ],
    };

    const result = deriveWorkflowEdges(workflow, 'test.workflow.json');

    expect(result.workflowName).toBe('Test Workflow');
    expect(result.rootSpan).toBe('cli.command');
    expect(result.referencedSpans).toContain('cli.command');
    expect(result.referencedSpans).toContain('validate.canvas');

    expect(result.scenarioEdges).toHaveLength(1);
    expect(result.scenarioEdges[0].scenarioId).toBe('success');
    expect(result.scenarioEdges[0].edges).toHaveLength(2);

    // cli.command -> validate.canvas
    expect(result.scenarioEdges[0].edges[0]).toMatchObject({
      fromSpan: 'cli.command',
      toSpan: 'validate.canvas',
      workflowFile: 'test.workflow.json',
    });

    // validate.canvas -> cli.command
    expect(result.scenarioEdges[0].edges[1]).toMatchObject({
      fromSpan: 'validate.canvas',
      toSpan: 'cli.command',
      workflowFile: 'test.workflow.json',
    });
  });

  it('handles deprecated spanPattern', () => {
    const workflow: WorkflowTemplate = {
      version: '1.0.0',
      canvas: 'test.canvas',
      name: 'Legacy Workflow',
      description: 'Uses spanPattern',
      spanPattern: 'legacy.root',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'test',
          priority: 1,
          description: 'Test',
          template: {
            events: {
              'event.one': 'First',
            },
          },
        },
      ],
    };

    const result = deriveWorkflowEdges(workflow);

    expect(result.rootSpan).toBe('legacy.root');
    expect(result.referencedSpans).toContain('legacy.root');
  });

  it('derives edges from multiple scenarios', () => {
    const workflow: WorkflowTemplate = {
      version: '1.0.0',
      canvas: 'test.canvas',
      name: 'Multi-scenario',
      description: 'Has multiple scenarios',
      rootSpan: 'root',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'success',
          priority: 1,
          description: 'Success',
          template: {
            events: {
              'start': 'Start',
              'success.event': { span: 'success.span', template: 'Success' },
            },
          },
        },
        {
          id: 'failure',
          priority: 2,
          description: 'Failure',
          template: {
            events: {
              'start': 'Start',
              'failure.event': { span: 'failure.span', template: 'Failure' },
            },
          },
        },
      ],
    };

    const result = deriveWorkflowEdges(workflow);

    expect(result.scenarioEdges).toHaveLength(2);
    expect(result.referencedSpans).toContain('root');
    expect(result.referencedSpans).toContain('success.span');
    expect(result.referencedSpans).toContain('failure.span');
  });
});

describe('deriveEdgesFromWorkflows', () => {
  it('combines edges from multiple workflows', () => {
    const workflows = [
      {
        workflow: {
          version: '1.0.0',
          canvas: 'a.canvas',
          name: 'Workflow A',
          description: 'First',
          rootSpan: 'root',
          scenarioSelection: 'first-match' as const,
          scenarios: [
            {
              id: 'a',
              priority: 1,
              description: 'A',
              template: {
                events: {
                  'start': 'Start',
                  'child.event': { span: 'child.a', template: 'Child A' },
                },
              },
            },
          ],
        },
        filePath: 'a.workflow.json',
      },
      {
        workflow: {
          version: '1.0.0',
          canvas: 'b.canvas',
          name: 'Workflow B',
          description: 'Second',
          rootSpan: 'root',
          scenarioSelection: 'first-match' as const,
          scenarios: [
            {
              id: 'b',
              priority: 1,
              description: 'B',
              template: {
                events: {
                  'start': 'Start',
                  'child.event': { span: 'child.b', template: 'Child B' },
                },
              },
            },
          ],
        },
        filePath: 'b.workflow.json',
      },
    ];

    const result = deriveEdgesFromWorkflows(workflows);

    expect(result.workflows).toHaveLength(2);
    expect(result.allSpans).toContain('root');
    expect(result.allSpans).toContain('child.a');
    expect(result.allSpans).toContain('child.b');

    // Should have 2 unique edges: root->child.a and root->child.b
    expect(result.edges).toHaveLength(2);
  });

  it('deduplicates same edges across workflows', () => {
    const workflows = [
      {
        workflow: {
          version: '1.0.0',
          canvas: 'a.canvas',
          name: 'Workflow A',
          description: 'First',
          rootSpan: 'root',
          scenarioSelection: 'first-match' as const,
          scenarios: [
            {
              id: 'a',
              priority: 1,
              description: 'A',
              template: {
                events: {
                  'start': 'Start',
                  'shared': { span: 'shared.span', template: 'Shared' },
                },
              },
            },
          ],
        },
      },
      {
        workflow: {
          version: '1.0.0',
          canvas: 'b.canvas',
          name: 'Workflow B',
          description: 'Second',
          rootSpan: 'root',
          scenarioSelection: 'first-match' as const,
          scenarios: [
            {
              id: 'b',
              priority: 1,
              description: 'B',
              template: {
                events: {
                  'start': 'Start',
                  'shared': { span: 'shared.span', template: 'Also shared' },
                },
              },
            },
          ],
        },
      },
    ];

    const result = deriveEdgesFromWorkflows(workflows);

    // Same edge appears in both, should be deduplicated
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      fromSpan: 'root',
      toSpan: 'shared.span',
    });
  });
});

describe('groupEdgesBySources', () => {
  it('groups edges by source and target', () => {
    const edges = [
      { fromSpan: 'a', toSpan: 'b', scenarioId: 's1', eventNames: ['e1', 'e2'], workflowFile: 'w1.json' },
      { fromSpan: 'a', toSpan: 'b', scenarioId: 's2', eventNames: ['e3', 'e4'], workflowFile: 'w2.json' },
      { fromSpan: 'a', toSpan: 'c', scenarioId: 's3', eventNames: ['e5', 'e6'] },
    ];

    const grouped = groupEdgesBySources(edges);

    expect(grouped.get('a->b')).toEqual([
      { workflowFile: 'w1.json', scenarioId: 's1' },
      { workflowFile: 'w2.json', scenarioId: 's2' },
    ]);

    expect(grouped.get('a->c')).toEqual([
      { workflowFile: undefined, scenarioId: 's3' },
    ]);
  });
});
