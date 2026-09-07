/**
 * Tests for template renderer (end-to-end workflow generation)
 */

import { renderWorkflow } from '../template-renderer';
import type { WorkflowTemplate, OtelEvent } from '../types';

describe('renderWorkflow', () => {
  describe('span tree rendering', () => {
    const template: WorkflowTemplate = {
      version: '1.0.0',
      canvas: 'test.otel.canvas',
      name: 'Span Tree Test',
      description: 'Test span tree rendering',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'default',
          priority: 1,
          description: 'Default scenario',
          condition: { default: true },
          template: {
            introduction: '✅ Execution Trace',
            span: '→ {{span.name}}',
            children: 'recurse',
            summary: '✅ Complete',
          },
        },
      ],
    };

    it('should render simple span tree', () => {
      const events: OtelEvent[] = [
        {
          name: 'parent.span',
          timestamp: 0,
          type: 'span',
          spanId: 'span1',
          traceId: 'trace1',
        },
        {
          name: 'child.span',
          timestamp: 10,
          type: 'span',
          spanId: 'span2',
          parentSpanId: 'span1',
          traceId: 'trace1',
        },
      ];

      const result = renderWorkflow(template, events);

      expect(result.text).toContain('✅ Execution Trace');
      expect(result.text).toContain('→ parent.span');
      expect(result.text).toContain('→ child.span');
      expect(result.text).toContain('✅ Complete');
      expect(result.scenarioId).toBe('default');
    });

    it('should indent child spans correctly', () => {
      const events: OtelEvent[] = [
        { name: 'root', type: 'span', spanId: '1', traceId: 't1', timestamp: 0 },
        { name: 'child1', type: 'span', spanId: '2', parentSpanId: '1', traceId: 't1', timestamp: 10 },
        { name: 'grandchild', type: 'span', spanId: '3', parentSpanId: '2', traceId: 't1', timestamp: 20 },
      ];

      const result = renderWorkflow(template, events);
      const lines = result.text.split('\n');

      // Check for proper indentation (2 spaces per level)
      expect(lines).toContainEqual(expect.stringMatching(/^→ root$/));
      expect(lines).toContainEqual(expect.stringMatching(/^ {2}→ child1$/));
      expect(lines).toContainEqual(expect.stringMatching(/^ {4}→ grandchild$/));
    });

    it('should attach logs to spans when showLogsPerSpan is true', () => {
      const templateWithLogs: WorkflowTemplate = {
        ...template,
        showLogsPerSpan: true,
        scenarios: [
          {
            ...template.scenarios[0],
            template: {
              ...template.scenarios[0].template,
              logs: {
                info: '  📝 {{log.body}}',
                error: '  ❌ {{log.body}}',
              },
            },
          },
        ],
      };

      const events: OtelEvent[] = [
        { name: 'test.span', type: 'span', spanId: 'span1', traceId: 't1', timestamp: 0 },
        {
          name: 'log.info',
          type: 'log',
          spanId: 'span1',
          traceId: 't1',
          timestamp: 5,
          severityText: 'INFO',
          severityNumber: 9,
          body: 'Processing started',
        },
        {
          name: 'log.error',
          type: 'log',
          spanId: 'span1',
          traceId: 't1',
          timestamp: 15,
          severityText: 'ERROR',
          severityNumber: 17,
          body: 'Something failed',
        },
      ];

      const result = renderWorkflow(templateWithLogs, events);

      expect(result.text).toContain('→ test.span');
      expect(result.text).toContain('📝 Processing started');
      expect(result.text).toContain('❌ Something failed');
    });
  });

  describe('scenario selection', () => {
    const template: WorkflowTemplate = {
      version: '1.0.0',
      canvas: 'test.otel.canvas',
      name: 'Scenario Test',
      description: 'Test scenario selection',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'error',
          priority: 1,
          description: 'Error occurred',
          template: {
            summary: '❌ Error',
            events: { 'test.error': 'Error: {{span.name}}' },
          },
        },
        {
          id: 'warnings',
          priority: 2,
          description: 'Has warnings',
          template: {
            summary: '⚠️ Warnings',
            events: {
              'test.complete': 'Complete',
              'test.warning': 'Warning',
            },
          },
        },
        {
          id: 'success',
          priority: 3,
          description: 'Success',
          template: {
            summary: '✅ Success',
            events: { 'test.complete': 'Complete: {{span.name}}' },
          },
        },
        {
          id: 'fallback',
          priority: 99,
          description: 'Fallback',
          template: {
            summary: 'Unknown',
            events: {}, // Catch-all scenario
          },
        },
      ],
    };

    it('should select error scenario (highest priority)', () => {
      const events: OtelEvent[] = [
        { name: 'test.error', timestamp: 50, type: 'span' },
        { name: 'test.complete', timestamp: 100, type: 'span', attributes: { 'result.warnings': 2 } },
      ];

      const result = renderWorkflow(template, events);
      expect(result.scenarioId).toBe('error');
      expect(result.text).toContain('❌ Error');
    });

    it('should select warnings scenario', () => {
      const events: OtelEvent[] = [
        { name: 'test.complete', timestamp: 100, type: 'span' },
        { name: 'test.warning', timestamp: 50, type: 'span' },
      ];

      const result = renderWorkflow(template, events);
      expect(result.scenarioId).toBe('warnings');
      expect(result.text).toContain('⚠️ Warnings');
    });

    it('should select success scenario', () => {
      const events: OtelEvent[] = [
        { name: 'test.complete', timestamp: 100, type: 'span' },
      ];

      const result = renderWorkflow(template, events);
      expect(result.scenarioId).toBe('success');
      expect(result.text).toContain('✅ Success');
    });

    it('should select highest priority partial match when no full matches', () => {
      const events: OtelEvent[] = [{ name: 'unknown.event', timestamp: 0, type: 'span' }];

      const result = renderWorkflow(template, events);
      // When no scenarios match fully (all at 0%), highest priority wins
      expect(result.scenarioId).toBe('error'); // Priority 1 is highest
      expect(result.text).toContain('❌ Error');
    });
  });

  describe('event-specific attributes override aggregates', () => {
    const template: WorkflowTemplate = {
      version: '1.0.0',
      canvas: 'skill-installation.otel.canvas',
      name: 'Skill Installation',
      description: 'Test event attribute override',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'success',
          priority: 1,
          description: 'Success',
          condition: {
            requires: ['installation.complete'],
            assertions: { 'install.failure_count': { $eq: 0 } }
          },
          template: {
            events: {
              'installation.started': 'Starting installation ({{install.scope}})',
              'skill.installing': 'Installing {{skill.name}} to {{agent.name}} (Mode: {{install.mode}})',
              'skill.installed': 'Installed successfully',
              'installation.complete': '{{install.success_count}} successful installations'
            }
          },
        },
      ],
    };

    it('should use event-specific attributes not aggregates', () => {
      const events: OtelEvent[] = [
        {
          name: 'installation.started',
          timestamp: 1000,
          type: 'span',
          spanId: 's1',
          traceId: 't1',
          attributes: {
            'install.scope': 'global',
            'install.mode': 'copy', // Summary event has 'copy'
          }
        },
        {
          name: 'skill.installing',
          timestamp: 2000,
          type: 'span',
          spanId: 's2',
          traceId: 't1',
          attributes: {
            'skill.name': 'demo-skill',
            'agent.name': 'Amp',
            'install.mode': 'symlink', // Event-specific has 'symlink' - should override!
            'install.scope': 'global',
          }
        },
        {
          name: 'skill.installed',
          timestamp: 2500,
          type: 'span',
          spanId: 's3',
          traceId: 't1',
          attributes: {
            'skill.name': 'demo-skill',
            'agent.name': 'Amp',
          }
        },
        {
          name: 'skill.installing',
          timestamp: 3000,
          type: 'span',
          spanId: 's4',
          traceId: 't1',
          attributes: {
            'skill.name': 'demo-skill',
            'agent.name': 'Cursor',
            'install.mode': 'symlink', // Different agent
            'install.scope': 'global',
          }
        },
        {
          name: 'skill.installed',
          timestamp: 3500,
          type: 'span',
          spanId: 's5',
          traceId: 't1',
          attributes: {
            'skill.name': 'demo-skill',
            'agent.name': 'Cursor',
          }
        },
        {
          name: 'installation.complete',
          timestamp: 4000,
          type: 'span',
          spanId: 's6',
          traceId: 't1',
          attributes: {
            'install.success_count': 2,
            'install.failure_count': 0,
          }
        },
      ];

      const result = renderWorkflow(template, events);

      // Should show event-specific values, not aggregate values
      expect(result.text).toContain('Installing demo-skill to Amp (Mode: symlink)');
      expect(result.text).toContain('Installing demo-skill to Cursor (Mode: symlink)');

      // Should NOT show aggregate value
      expect(result.text).not.toContain('Installing demo-skill to Amp (Mode: copy)');
      expect(result.text).not.toContain('Installing demo-skill to Cursor (Mode: copy)');

      // Should show both installations with different agent names
      expect(result.text).toContain('to Amp');
      expect(result.text).toContain('to Cursor');
    });
  });

  describe('metadata', () => {
    const template: WorkflowTemplate = {
      version: '1.0.0',
      canvas: 'test.otel.canvas',
      name: 'Metadata Test',
      description: 'Test metadata generation',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'default',
          priority: 1,
          description: 'Default',
          condition: { default: true },
          template: { summary: 'Done' },
        },
      ],
    };

    it('should include event counts', () => {
      const events: OtelEvent[] = [
        { name: 'span1', timestamp: 0, type: 'span' },
        { name: 'span2', timestamp: 10, type: 'span' },
        { name: 'log1', timestamp: 5, type: 'log', body: 'test' },
        { name: 'log2', timestamp: 15, type: 'log', body: 'test' },
        { name: 'log3', timestamp: 20, type: 'log', body: 'test' },
      ];

      const result = renderWorkflow(template, events);

      expect(result.metadata.eventCount).toBe(5);
      expect(result.metadata.spanCount).toBe(2);
      expect(result.metadata.logCount).toBe(3);
    });

    it('should include time range', () => {
      const events: OtelEvent[] = [
        { name: 'event1', timestamp: 1000, type: 'span' },
        { name: 'event2', timestamp: 2000, type: 'span' },
        { name: 'event3', timestamp: 1500, type: 'log', body: 'test' },
      ];

      const result = renderWorkflow(template, events);

      expect(result.metadata.timeRange).toBeDefined();
      expect(result.metadata.timeRange?.start).toBe(1000);
      expect(result.metadata.timeRange?.end).toBe(2000);
    });
  });

  describe('@span attribute access', () => {
    it('should render span attributes via @span namespace', () => {
      const template: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Span Attributes Test',
        description: 'Test @span attribute access',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'default',
            priority: 1,
            description: 'Default scenario',
            template: {
              events: {
                'kanban.loaded': 'Loaded {{tasks.count}} tasks (backlog: {{@span.output.isBacklogProject}})',
              },
            },
          },
        ],
      };

      const events: OtelEvent[] = [
        {
          name: 'kanban.loaded',
          timestamp: 1000,
          type: 'span',
          spanId: 'span1',
          traceId: 'trace1',
          attributes: {
            'tasks.count': 42,
            'has.more': true,
          },
          spanAttributes: {
            'output.isBacklogProject': true,
            'output.tasksLoaded': 42,
          },
        },
      ];

      const result = renderWorkflow(template, events);
      expect(result.text).toContain('Loaded 42 tasks (backlog: true)');
    });

    it('should render span attributes via @span namespace with span template', () => {
      const template: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Span Tree Attributes Test',
        description: 'Test @span with span template',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'default',
            priority: 1,
            description: 'Default scenario',
            template: {
              span: '→ {{span.name}} (status: {{@span.output.status}})',
              children: 'recurse',
            },
          },
        ],
      };

      const events: OtelEvent[] = [
        {
          name: 'api.request',
          timestamp: 1000,
          type: 'span',
          spanId: 'span1',
          traceId: 'trace1',
          spanAttributes: {
            'output.status': 'success',
          },
        },
      ];

      const result = renderWorkflow(template, events);
      expect(result.text).toContain('→ api.request (status: success)');
    });

    it('should allow event attributes to be accessed normally alongside @span', () => {
      const template: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Mixed Attributes Test',
        description: 'Test event and span attributes together',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'default',
            priority: 1,
            description: 'Default scenario',
            template: {
              events: {
                'task.completed': 'Task {{task.id}} done in {{duration}}ms (project: {{@span.project.name}})',
              },
            },
          },
        ],
      };

      const events: OtelEvent[] = [
        {
          name: 'task.completed',
          timestamp: 1000,
          type: 'span',
          spanId: 'span1',
          traceId: 'trace1',
          attributes: {
            'task.id': 'TASK-123',
            'duration': 150,
          },
          spanAttributes: {
            'project.name': 'My Project',
            'project.id': 'proj-1',
          },
        },
      ];

      const result = renderWorkflow(template, events);
      expect(result.text).toContain('Task TASK-123 done in 150ms (project: My Project)');
    });
  });
});
