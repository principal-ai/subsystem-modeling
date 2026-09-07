/**
 * Tests for workflow type helpers
 */

import {
  isEventTemplate,
  getEventTemplateString,
  getEventSpan,
  getWorkflowRootSpan,
  type EventTemplate,
  type WorkflowTemplate,
} from '../types';

describe('EventTemplate helpers', () => {
  describe('isEventTemplate', () => {
    it('returns false for string', () => {
      expect(isEventTemplate('template text')).toBe(false);
    });

    it('returns true for EventTemplate object', () => {
      const template: EventTemplate = { template: 'template text' };
      expect(isEventTemplate(template)).toBe(true);
    });

    it('returns true for EventTemplate with span', () => {
      const template: EventTemplate = { span: 'my.span', template: 'template text' };
      expect(isEventTemplate(template)).toBe(true);
    });
  });

  describe('getEventTemplateString', () => {
    it('returns string as-is', () => {
      expect(getEventTemplateString('template text')).toBe('template text');
    });

    it('extracts template from EventTemplate object', () => {
      const template: EventTemplate = { template: 'template text' };
      expect(getEventTemplateString(template)).toBe('template text');
    });

    it('extracts template from EventTemplate with span', () => {
      const template: EventTemplate = { span: 'my.span', template: 'template text' };
      expect(getEventTemplateString(template)).toBe('template text');
    });
  });

  describe('getEventSpan', () => {
    it('returns undefined for string', () => {
      expect(getEventSpan('template text')).toBeUndefined();
    });

    it('returns undefined for EventTemplate without span', () => {
      const template: EventTemplate = { template: 'template text' };
      expect(getEventSpan(template)).toBeUndefined();
    });

    it('returns span from EventTemplate with span', () => {
      const template: EventTemplate = { span: 'my.span', template: 'template text' };
      expect(getEventSpan(template)).toBe('my.span');
    });
  });

  describe('getWorkflowRootSpan', () => {
    it('returns rootSpan when defined', () => {
      const workflow = {
        version: '1.0.0',
        canvas: 'test.canvas',
        name: 'Test',
        description: 'Test',
        rootSpan: 'my.root.span',
        scenarioSelection: 'first-match' as const,
        scenarios: [],
      };
      expect(getWorkflowRootSpan(workflow)).toBe('my.root.span');
    });

    it('falls back to spanPattern when rootSpan not defined', () => {
      const workflow = {
        version: '1.0.0',
        canvas: 'test.canvas',
        name: 'Test',
        description: 'Test',
        spanPattern: 'legacy.span.pattern',
        scenarioSelection: 'first-match' as const,
        scenarios: [],
      };
      expect(getWorkflowRootSpan(workflow)).toBe('legacy.span.pattern');
    });

    it('prefers rootSpan over spanPattern', () => {
      const workflow = {
        version: '1.0.0',
        canvas: 'test.canvas',
        name: 'Test',
        description: 'Test',
        rootSpan: 'new.root.span',
        spanPattern: 'legacy.span.pattern',
        scenarioSelection: 'first-match' as const,
        scenarios: [],
      };
      expect(getWorkflowRootSpan(workflow)).toBe('new.root.span');
    });

    it('returns undefined when neither defined', () => {
      const workflow = {
        version: '1.0.0',
        canvas: 'test.canvas',
        name: 'Test',
        description: 'Test',
        scenarioSelection: 'first-match' as const,
        scenarios: [],
      };
      expect(getWorkflowRootSpan(workflow)).toBeUndefined();
    });
  });
});

describe('EventTemplate in scenarios', () => {
  it('supports string form for backward compatibility', () => {
    const scenario = {
      id: 'test',
      priority: 1,
      description: 'Test',
      template: {
        events: {
          'event.name': 'Simple template {{attr}}',
        },
      },
    };

    const templateEntry = scenario.template.events['event.name'];
    expect(getEventTemplateString(templateEntry)).toBe('Simple template {{attr}}');
    expect(getEventSpan(templateEntry)).toBeUndefined();
  });

  it('supports object form with span context', () => {
    const scenario = {
      id: 'test',
      priority: 1,
      description: 'Test',
      template: {
        events: {
          'event.name': {
            span: 'validate.canvas',
            template: 'Validating {{file.name}}',
          },
        },
      },
    };

    const templateEntry = scenario.template.events['event.name'];
    expect(getEventTemplateString(templateEntry)).toBe('Validating {{file.name}}');
    expect(getEventSpan(templateEntry)).toBe('validate.canvas');
  });

  it('supports mixed forms in same scenario', () => {
    const scenario = {
      id: 'test',
      priority: 1,
      description: 'Test',
      template: {
        events: {
          'event.one': 'Simple template',
          'event.two': {
            span: 'child.span',
            template: 'With span context',
          },
          'event.three': {
            template: 'Object form without span',
          },
        },
      },
    };

    // String form
    expect(getEventTemplateString(scenario.template.events['event.one'])).toBe('Simple template');
    expect(getEventSpan(scenario.template.events['event.one'])).toBeUndefined();

    // Object form with span
    expect(getEventTemplateString(scenario.template.events['event.two'])).toBe('With span context');
    expect(getEventSpan(scenario.template.events['event.two'])).toBe('child.span');

    // Object form without span
    expect(getEventTemplateString(scenario.template.events['event.three'])).toBe('Object form without span');
    expect(getEventSpan(scenario.template.events['event.three'])).toBeUndefined();
  });
});
