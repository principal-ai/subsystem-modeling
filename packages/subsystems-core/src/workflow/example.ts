/**
 * Example: Using the Workflow Template System
 *
 * This example demonstrates how to use the workflow renderer
 * to transform OTEL events into human-readable workflows.
 */

import { renderWorkflow } from './template-renderer';
import type { WorkflowTemplate, OtelEvent } from './types';

// Example 1: Simple Success Scenario
function exampleSuccess() {
  const template: WorkflowTemplate = {
    version: '1.0.0',
    canvas: 'example.otel.canvas',
    name: 'Example Execution',
    description: 'Simple execution workflow',
    spanPattern: 'example.execution',
    scenarioSelection: 'first-match',
    showLogsPerSpan: true,
    scenarios: [
      {
        id: 'success',
        priority: 1,
        description: 'Successful execution',
        template: {
          introduction: '✅ Execution Successful\n{"━".repeat(50)}',
          span: '→ {span.name}',
          children: 'recurse',
          events: {
            'execution.started': '  🔄 Starting execution',
            'execution.complete': '  ✅ Completed in {duration.ms}ms with {result.count} items',
          },
          logs: {
            info: '    ℹ️  {log.body}',
            debug: '    🔍 {log.body}',
          },
          summary: '{"━".repeat(50)}\n\n✅ SUCCESS\n\nProcessed {result.count} items in {duration.ms}ms',
        },
      },
    ],
  };

  const events: OtelEvent[] = [
    {
      name: 'execution.started',
      timestamp: 1000,
      type: 'span',
      spanId: 'span1',
      traceId: 'trace1',
    },
    {
      name: 'log.info',
      timestamp: 1100,
      type: 'log',
      spanId: 'span1',
      traceId: 'trace1',
      severityText: 'INFO',
      severityNumber: 9,
      body: 'Processing items...',
    },
    {
      name: 'execution.complete',
      timestamp: 2000,
      type: 'span',
      spanId: 'span1',
      traceId: 'trace1',
      attributes: {
        'result.status': 'success',
        'result.count': 42,
        'duration.ms': 1000,
      },
    },
  ];

  const result = renderWorkflow(template, events);
  console.log('=== Example 1: Success Scenario ===\n');
  console.log(result.text);
  console.log('\nMetadata:', result.metadata);
  console.log('\n');
}

// Example 2: Multi-scenario with Violations
function exampleWithViolations() {
  const template: WorkflowTemplate = {
    version: '1.0.0',
    canvas: 'validation.otel.canvas',
    name: 'Validation Execution',
    description: 'Validation with multiple scenarios',
    spanPattern: 'validation.run',
    scenarioSelection: 'first-match',
    scenarios: [
      {
        id: 'errors',
        priority: 1,
        description: 'Has error-level violations',
        template: {
          introduction: '❌ Validation Failed\n{"━".repeat(50)}',
          span: '→ {span.name}',
          children: 'recurse',
          events: {
            'validation.started': '  🔍 Validating configuration',
            'validation.complete':
              '  ❌ Found {result.errors} errors and {result.warnings} warnings',
          },
          summary:
            '{"━".repeat(50)}\n\n❌ FAILED\n\nErrors: {result.errors}\nWarnings: {result.warnings}',
        },
      },
      {
        id: 'warnings',
        priority: 2,
        description: 'Has warnings only',
        template: {
          introduction: '⚠️  Validation Passed with Warnings\n{"━".repeat(50)}',
          span: '→ {span.name}',
          children: 'recurse',
          events: {
            'validation.started': '  🔍 Validating configuration',
            'validation.complete': '  ⚠️  Found {result.warnings} warnings',
          },
          summary: '{"━".repeat(50)}\n\n⚠️  PASSED WITH WARNINGS\n\nWarnings: {result.warnings}',
        },
      },
      {
        id: 'success',
        priority: 3,
        description: 'All checks passed',
        template: {
          introduction: '✅ Validation Passed\n{"━".repeat(50)}',
          span: '→ {span.name}',
          children: 'recurse',
          events: {
            'validation.started': '  🔍 Validating configuration',
            'validation.complete': '  ✅ All checks passed',
          },
          summary: '{"━".repeat(50)}\n\n✅ SUCCESS\n\nNo violations found.',
        },
      },
    ],
  };

  // Scenario 1: Errors
  const eventsWithErrors: OtelEvent[] = [
    {
      name: 'validation.started',
      timestamp: 1000,
      type: 'span',
      spanId: 'span1',
      traceId: 'trace1',
    },
    {
      name: 'validation.complete',
      timestamp: 2000,
      type: 'span',
      spanId: 'span1',
      traceId: 'trace1',
      attributes: {
        'result.errors': 3,
        'result.warnings': 2,
      },
    },
  ];

  console.log('=== Example 2a: Validation with Errors ===\n');
  const result1 = renderWorkflow(template, eventsWithErrors);
  console.log(result1.text);
  console.log('\nSelected scenario:', result1.scenarioId);
  console.log('\n');

  // Scenario 2: Warnings only
  const eventsWithWarnings: OtelEvent[] = [
    {
      name: 'validation.started',
      timestamp: 1000,
      type: 'span',
      spanId: 'span1',
      traceId: 'trace1',
    },
    {
      name: 'validation.complete',
      timestamp: 2000,
      type: 'span',
      spanId: 'span1',
      traceId: 'trace1',
      attributes: {
        'result.errors': 0,
        'result.warnings': 5,
      },
    },
  ];

  console.log('=== Example 2b: Validation with Warnings ===\n');
  const result2 = renderWorkflow(template, eventsWithWarnings);
  console.log(result2.text);
  console.log('\nSelected scenario:', result2.scenarioId);
  console.log('\n');

  // Scenario 3: Success
  const eventsSuccess: OtelEvent[] = [
    {
      name: 'validation.started',
      timestamp: 1000,
      type: 'span',
      spanId: 'span1',
      traceId: 'trace1',
    },
    {
      name: 'validation.complete',
      timestamp: 2000,
      type: 'span',
      spanId: 'span1',
      traceId: 'trace1',
      attributes: {
        'result.errors': 0,
        'result.warnings': 0,
      },
    },
  ];

  console.log('=== Example 2c: Validation Success ===\n');
  const result3 = renderWorkflow(template, eventsSuccess);
  console.log(result3.text);
  console.log('\nSelected scenario:', result3.scenarioId);
  console.log('\n');
}

// Example 3: Span Tree with Hierarchy
function exampleSpanTree() {
  const template: WorkflowTemplate = {
    version: '1.0.0',
    canvas: 'hierarchy.otel.canvas',
    name: 'Hierarchical Execution',
    description: 'Demonstrates span tree rendering',
    spanPattern: 'root.operation',
    scenarioSelection: 'first-match',
    showLogsPerSpan: true,
    scenarios: [
      {
        id: 'default',
        priority: 1,
        description: 'Default',
        template: {
          introduction: '📋 Execution Trace\n{"━".repeat(50)}',
          span: '→ {span.name}',
          children: 'recurse',
          events: {
            'root.operation': '  🔄 Operation started',
          },
          logs: {
            info: '  ℹ️  {log.body}',
            error: '  ❌ {log.body}',
          },
          summary: '{"━".repeat(50)}\nComplete',
        },
      },
    ],
  };

  const events: OtelEvent[] = [
    {
      name: 'root.operation',
      timestamp: 1000,
      type: 'span',
      spanId: 'span1',
      traceId: 'trace1',
    },
    {
      name: 'log.info',
      timestamp: 1100,
      type: 'log',
      spanId: 'span1',
      traceId: 'trace1',
      severityText: 'INFO',
      severityNumber: 9,
      body: 'Root operation started',
    },
    {
      name: 'child.operation',
      timestamp: 1200,
      type: 'span',
      spanId: 'span2',
      parentSpanId: 'span1',
      traceId: 'trace1',
    },
    {
      name: 'log.info',
      timestamp: 1300,
      type: 'log',
      spanId: 'span2',
      traceId: 'trace1',
      severityText: 'INFO',
      severityNumber: 9,
      body: 'Processing child task',
    },
    {
      name: 'grandchild.operation',
      timestamp: 1400,
      type: 'span',
      spanId: 'span3',
      parentSpanId: 'span2',
      traceId: 'trace1',
    },
    {
      name: 'log.info',
      timestamp: 1500,
      type: 'log',
      spanId: 'span3',
      traceId: 'trace1',
      severityText: 'INFO',
      severityNumber: 9,
      body: 'Executing grandchild task',
    },
  ];

  console.log('=== Example 3: Span Tree Hierarchy ===\n');
  const result = renderWorkflow(template, events);
  console.log(result.text);
  console.log('\n');
}

// Run all examples
// Commented out for CommonJS compatibility - uncomment if using ESM
// if (import.meta.main) {
//   exampleSuccess();
//   exampleWithViolations();
//   exampleSpanTree();
// }

export { exampleSuccess, exampleWithViolations, exampleSpanTree };
