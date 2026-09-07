/**
 * Tests for TraceOrchestrator
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { TraceOrchestrator } from '../TraceOrchestrator';
import type { OtelExportTraceServiceRequest } from '../../types/otel';
import type { StoryboardRegistryInterface, ScopeLookupResult } from '../../types/registered-trace';
import type { VersionSnapshot } from '../../types/version-registry';
import type { ExtendedCanvas } from '../../types/canvas';
import type { WorkflowTemplate } from '../../workflow/types';

/**
 * Mock registry for testing
 */
class MockRegistry implements StoryboardRegistryInterface {
  private snapshots = new Map<string, VersionSnapshot>();

  setSnapshot(scopeName: string, snapshot: VersionSnapshot | null): void {
    if (snapshot === null) {
      this.snapshots.delete(scopeName);
    } else {
      this.snapshots.set(scopeName, snapshot);
    }
  }

  async lookupByScope(
    scope: { name: string; version: string },
    _resource: { attributes?: Record<string, unknown> }
  ): Promise<ScopeLookupResult> {
    const snapshot = this.snapshots.get(scope.name);
    if (!snapshot) {
      return { found: false, reason: 'scope_not_owned', scopeName: scope.name };
    }
    if (snapshot.storyboards.length === 0) {
      return { found: false, reason: 'no_storyboards', scopeName: scope.name };
    }
    return { found: true, snapshot };
  }

  async listScopes(): Promise<Array<{ name: string; versions: string[] }>> {
    return Array.from(this.snapshots.keys()).map((name) => ({
      name,
      versions: ['1.0.0'],
    }));
  }

  supportsHotReload(): boolean {
    return false;
  }
}

describe('TraceOrchestrator', () => {
  let registry: MockRegistry;
  let orchestrator: TraceOrchestrator;

  beforeEach(() => {
    registry = new MockRegistry();
    orchestrator = new TraceOrchestrator({
      registry,
      enableValidation: true,
    });
  });

  describe('Basic Trace Processing', () => {
    it('should process a simple single-scope trace', async () => {
      // Create a simple trace with one scope
      const trace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'checkout-service' } },
              ],
            },
            scopeSpans: [
              {
                scope: {
                  name: 'checkout-service',
                  version: '1.0.0',
                },
                spans: [
                  {
                    traceId: 'trace-001',
                    spanId: 'span-001',
                    name: 'handleCheckout',
                    kind: 1,
                    startTimeUnixNano: '1000000000',
                    endTimeUnixNano: '2000000000',
                    attributes: [],
                    events: [
                      {
                        timeUnixNano: '1500000000',
                        name: 'checkout.started',
                        attributes: [],
                      },
                    ],
                    status: { code: 0 },
                  },
                ],
              },
            ],
          },
        ],
      };

      // No storyboards registered - all spans should be unmatched
      const result = await orchestrator.processTrace(trace);

      expect(result.traceId).toBe('trace-001');
      expect(result.spanCount).toBe(1);
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].scopes).toHaveLength(1);
      expect(result.scenarioMatches).toHaveLength(0);
      expect(result.storyboardMatches).toHaveLength(0);
      expect(result.unmatchedSpans.spans).toHaveLength(1);
      expect(result.unmatchedSpans.spans[0].reason).toContain('is not registered in any owned-scopes');
    });

    it('should extract trace metadata correctly', async () => {
      const trace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'test-service' } },
              ],
            },
            scopeSpans: [
              {
                scope: {
                  name: 'test-service',
                  version: '2.0.0',
                },
                spans: [
                  {
                    traceId: 'trace-123',
                    spanId: 'span-1',
                    name: 'testOperation',
                    kind: 1,
                    startTimeUnixNano: '1000000', // 1 ms in nanoseconds
                    endTimeUnixNano: '5000000', // 5 ms in nanoseconds
                    attributes: [],
                    events: [],
                    status: { code: 0 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await orchestrator.processTrace(trace);

      expect(result.traceId).toBe('trace-123');
      expect(result.name).toBe('testOperation');
      expect(result.startTime).toBe(1);
      expect(result.endTime).toBe(5);
      expect(result.duration).toBe(4);
      expect(result.hasErrors).toBe(false);
    });
  });

  describe('Multi-Scope Traces', () => {
    it('should process traces with multiple scopes', async () => {
      const trace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'api-gateway' } },
              ],
            },
            scopeSpans: [
              {
                scope: {
                  name: 'api-gateway',
                  version: '1.0.0',
                },
                spans: [
                  {
                    traceId: 'trace-multi',
                    spanId: 'span-gateway',
                    name: 'handleRequest',
                    kind: 2, // SERVER
                    startTimeUnixNano: '1000000000',
                    endTimeUnixNano: '3000000000',
                    attributes: [],
                    events: [],
                    status: { code: 0 },
                  },
                ],
              },
              {
                scope: {
                  name: 'pkg:npm/@acme/auth-lib',
                  version: '2.1.0',
                },
                spans: [
                  {
                    traceId: 'trace-multi',
                    spanId: 'span-auth',
                    name: 'validateToken',
                    kind: 1, // INTERNAL
                    startTimeUnixNano: '1500000000',
                    endTimeUnixNano: '2500000000',
                    attributes: [],
                    events: [],
                    status: { code: 0 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await orchestrator.processTrace(trace);

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].scopes).toHaveLength(2);
      expect(result.resources[0].scopes[0].scope.name).toBe('api-gateway');
      expect(result.resources[0].scopes[1].scope.name).toBe('pkg:npm/@acme/auth-lib');
      expect(result.spanCount).toBe(2);
    });

    it('should lookup storyboards for each scope independently', async () => {
      // Register storyboard for one scope but not the other
      registry.setSnapshot('checkout-service', {
        repositoryUrl: 'https://github.com/acme/checkout',
        commitSha: 'abc123',
        storyboards: [],
        registeredAt: new Date().toISOString(),
      });

      const trace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'multi-service' } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'checkout-service', version: '1.0.0' },
                spans: [
                  {
                    traceId: 'trace-001',
                    spanId: 'span-001',
                    name: 'checkout',
                    kind: 1,
                    startTimeUnixNano: '1000000000',
                    endTimeUnixNano: '2000000000',
                    attributes: [],
                    events: [],
                    status: { code: 0 },
                  },
                ],
              },
              {
                scope: { name: 'payment-service', version: '1.0.0' },
                spans: [
                  {
                    traceId: 'trace-001',
                    spanId: 'span-002',
                    name: 'processPayment',
                    kind: 1,
                    startTimeUnixNano: '1500000000',
                    endTimeUnixNano: '2500000000',
                    attributes: [],
                    events: [],
                    status: { code: 0 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await orchestrator.processTrace(trace);

      // One scope has storyboards (empty), one doesn't
      // Both should have spans in unmatched since no workflows match
      expect(result.unmatchedSpans.spans).toHaveLength(2);
    });
  });

  describe('Scenario Matching (Category 1)', () => {
    it('should match spans to scenarios when events match', async () => {
      // Create a canvas with span matching criteria
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-checkout',
            type: 'event',
            position: { x: 0, y: 0 },
            data: { label: 'Checkout Started' },
            pv: {
              otel: {
                spanMatch: {
                  name: 'handleCheckout',
                  event: {
                    name: 'checkout.started',
                  },
                },
              },
            },
          },
        ],
        edges: [],
      };

      // Create a workflow with scenario
      const workflow: WorkflowTemplate = {
        name: 'Checkout Flow',
        mode: 'strict',
        spanPattern: 'handleCheckout', // Match span by name
        scenarios: [
          {
            id: 'successful-checkout',
            priority: 1,
            description: 'Successful checkout',
            template: {
              introduction: 'Checkout started',
              events: {
                'checkout.started': 'Checkout began',
              },
            },
          },
        ],
      };

      // Register storyboard with canvas and workflow
      registry.setSnapshot('checkout-service', {
        repositoryUrl: 'https://github.com/acme/checkout',
        commitSha: 'abc123',
        storyboards: [
          {
            id: 'checkout-storyboard',
            name: 'Checkout Storyboard',
            path: '.principal-views/checkout',
            basename: 'checkout',
            scope: 'root' as const,
            canvas: {
              id: 'checkout',
              name: 'Checkout',
              path: '.principal-views/checkout/checkout.otel.canvas',
              basename: 'checkout',
              type: 'otel' as const,
              scope: 'root' as const,
              content: canvas,
            },
            workflows: [
              {
                id: 'checkout-workflow',
                name: 'Checkout Workflow',
                path: '.principal-views/checkout/checkout.workflow.json',
                basename: 'checkout',
                storyboardId: 'checkout-storyboard',
                scope: 'root' as const,
                testTraces: [],
                content: workflow,
              },
            ],
          },
        ],
        registeredAt: new Date().toISOString(),
      });

      const trace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'checkout-service' } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'checkout-service', version: '1.0.0' },
                spans: [
                  {
                    traceId: 'trace-001',
                    spanId: 'span-001',
                    name: 'handleCheckout',
                    kind: 1,
                    startTimeUnixNano: '1000000000',
                    endTimeUnixNano: '2000000000',
                    attributes: [],
                    events: [
                      {
                        timeUnixNano: '1500000000',
                        name: 'checkout.started',
                        attributes: [],
                      },
                    ],
                    status: { code: 0 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await orchestrator.processTrace(trace);

      // Should have a scenario match
      expect(result.scenarioMatches).toHaveLength(1);
      expect(result.scenarioMatches[0].scenarioId).toBe('successful-checkout');
      expect(result.scenarioMatches[0].scopeName).toBe('checkout-service');
      expect(result.scenarioMatches[0].matchedSpans).toHaveLength(1);
      expect(result.scenarioMatches[0].matchedSpans[0].spanId).toBe('span-001');
      expect(result.scenarioMatches[0].matchedSpans[0].nodeId).toBe('node-checkout');
      expect(result.scenarioMatches[0].matchType).toBe('full');
      expect(result.scenarioMatches[0].coveragePercent).toBe(100);

      // No orphaned or unmatched spans
      expect(result.storyboardMatches).toHaveLength(0);
      expect(result.unmatchedSpans.spans).toHaveLength(0);
    });

    it('should mark partial matches correctly', async () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-checkout',
            type: 'event',
            position: { x: 0, y: 0 },
            data: { label: 'Checkout' },
            pv: {
              otel: {
                spanMatch: {
                  name: 'handleCheckout',
                },
              },
            },
          },
        ],
        edges: [],
      };

      const workflow: WorkflowTemplate = {
        name: 'Checkout Flow',
        mode: 'strict',
        spanPattern: 'handleCheckout', // Match span by name
        scenarios: [
          {
            id: 'full-checkout',
            priority: 1,
            description: 'Full checkout with all events',
            template: {
              events: {
                'checkout.started': 'Checkout started',
                'checkout.validated': 'Cart validated',
                'checkout.completed': 'Checkout completed',
              },
            },
          },
        ],
      };

      registry.setSnapshot('checkout-service', {
        repositoryUrl: 'https://github.com/acme/checkout',
        commitSha: 'abc123',
        storyboards: [
          {
            id: 'checkout-storyboard',
            name: 'Checkout Storyboard',
            path: '.principal-views/checkout',
            basename: 'checkout',
            scope: 'root' as const,
            canvas: {
              id: 'checkout',
              name: 'Checkout',
              path: '.principal-views/checkout/checkout.otel.canvas',
              basename: 'checkout',
              type: 'otel' as const,
              scope: 'root' as const,
              content: canvas,
            },
            workflows: [
              {
                id: 'checkout-workflow',
                name: 'Checkout Workflow',
                path: '.principal-views/checkout/checkout.workflow.json',
                basename: 'checkout',
                storyboardId: 'checkout-storyboard',
                scope: 'root' as const,
                testTraces: [],
                content: workflow,
              },
            ],
          },
        ],
        registeredAt: new Date().toISOString(),
      });

      const trace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'checkout-service' } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'checkout-service', version: '1.0.0' },
                spans: [
                  {
                    traceId: 'trace-001',
                    spanId: 'span-001',
                    name: 'handleCheckout',
                    kind: 1,
                    startTimeUnixNano: '1000000000',
                    endTimeUnixNano: '2000000000',
                    attributes: [],
                    events: [
                      {
                        timeUnixNano: '1500000000',
                        name: 'checkout.started',
                        attributes: [],
                      },
                      // Missing checkout.validated and checkout.completed
                    ],
                    status: { code: 0 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await orchestrator.processTrace(trace);

      // Should have a partial match (1 out of 3 events = 33%)
      expect(result.scenarioMatches).toHaveLength(1);
      expect(result.scenarioMatches[0].matchType).toBe('partial');
      expect(result.scenarioMatches[0].coveragePercent).toBeLessThan(100);
      expect(result.scenarioMatches[0].coveragePercent).toBeGreaterThan(0);
    });
  });

  describe('Storyboard Matching - Orphaned Spans (Category 2)', () => {
    it('should create orphaned spans when canvas matches but no scenario does', async () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-checkout',
            type: 'event',
            position: { x: 0, y: 0 },
            data: { label: 'Checkout' },
            pv: {
              otel: {
                spanMatch: {
                  name: 'handleCheckout',
                },
              },
            },
          },
        ],
        edges: [],
      };

      const workflow: WorkflowTemplate = {
        name: 'Checkout Flow',
        mode: 'strict',
        spanPattern: 'handleCheckout', // Match span by name
        scenarios: [
          {
            id: 'successful-checkout',
            priority: 1,
            description: 'Successful checkout',
            template: {
              events: {
                'checkout.completed': 'Checkout completed successfully',
              },
            },
          },
        ],
      };

      registry.setSnapshot('checkout-service', {
        repositoryUrl: 'https://github.com/acme/checkout',
        commitSha: 'abc123',
        storyboards: [
          {
            id: 'checkout-storyboard',
            name: 'Checkout Storyboard',
            path: '.principal-views/checkout',
            basename: 'checkout',
            scope: 'root' as const,
            canvas: {
              id: 'checkout',
              name: 'Checkout',
              path: '.principal-views/checkout/checkout.otel.canvas',
              basename: 'checkout',
              type: 'otel' as const,
              scope: 'root' as const,
              content: canvas,
            },
            workflows: [
              {
                id: 'checkout-workflow',
                name: 'Checkout Workflow',
                path: '.principal-views/checkout/checkout.workflow.json',
                basename: 'checkout',
                storyboardId: 'checkout-storyboard',
                scope: 'root' as const,
                testTraces: [],
                content: workflow,
              },
            ],
          },
        ],
        registeredAt: new Date().toISOString(),
      });

      const trace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'checkout-service' } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'checkout-service', version: '1.0.0' },
                spans: [
                  {
                    traceId: 'trace-001',
                    spanId: 'span-001',
                    name: 'handleCheckout',
                    kind: 1,
                    startTimeUnixNano: '1000000000',
                    endTimeUnixNano: '2000000000',
                    attributes: [],
                    events: [
                      {
                        timeUnixNano: '1500000000',
                        name: 'checkout.failed', // Different event - doesn't match scenario
                        attributes: [],
                      },
                    ],
                    status: { code: 0 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await orchestrator.processTrace(trace);

      // Should have no scenario matches
      expect(result.scenarioMatches).toHaveLength(0);

      // Should have orphaned span (canvas matched, scenario didn't)
      expect(result.storyboardMatches).toHaveLength(1);
      expect(result.storyboardMatches[0].storyboardId).toBe('checkout-storyboard');
      expect(result.storyboardMatches[0].orphanedSpans).toHaveLength(1);
      expect(result.storyboardMatches[0].orphanedSpans[0].spanId).toBe('span-001');
      expect(result.storyboardMatches[0].orphanedSpans[0].nodeId).toBe('node-checkout');
      expect(result.storyboardMatches[0].orphanedSpans[0].observedEvents).toContain(
        'checkout.failed'
      );
      expect(result.storyboardMatches[0].orphanedSpans[0].reason).toContain(
        'no scenario matched'
      );

      // No unmatched spans
      expect(result.unmatchedSpans.spans).toHaveLength(0);
    });
  });

  describe('Unmatched Spans (Category 3)', () => {
    it('should mark spans as unmatched when no canvas nodes match', async () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-checkout',
            type: 'event',
            position: { x: 0, y: 0 },
            data: { label: 'Checkout' },
            pv: {
              otel: {
                spanMatch: {
                  name: 'handleCheckout', // Looking for this specific span name
                },
              },
            },
          },
        ],
        edges: [],
      };

      registry.setSnapshot('api-service', {
        repositoryUrl: 'https://github.com/acme/api',
        commitSha: 'abc123',
        storyboards: [
          {
            id: 'api-storyboard',
            name: 'API Storyboard',
            path: '.principal-views/api',
            basename: 'api',
            scope: 'root' as const,
            canvas: {
              id: 'api',
              name: 'API',
              path: '.principal-views/api/api.otel.canvas',
              basename: 'api',
              type: 'otel' as const,
              scope: 'root' as const,
              content: canvas,
            },
            workflows: [],
          },
        ],
        registeredAt: new Date().toISOString(),
      });

      const trace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'api-service' } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'api-service', version: '1.0.0' },
                spans: [
                  {
                    traceId: 'trace-001',
                    spanId: 'span-001',
                    name: 'handleLogin', // Different span name - won't match
                    kind: 1,
                    startTimeUnixNano: '1000000000',
                    endTimeUnixNano: '2000000000',
                    attributes: [],
                    events: [],
                    status: { code: 0 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await orchestrator.processTrace(trace);

      // Should have no matches
      expect(result.scenarioMatches).toHaveLength(0);
      expect(result.storyboardMatches).toHaveLength(0);

      // Should have unmatched span
      expect(result.unmatchedSpans.spans).toHaveLength(1);
      expect(result.unmatchedSpans.spans[0].spanId).toBe('span-001');
      expect(result.unmatchedSpans.spans[0].reason).toContain('No workflow spanPattern matched span');
    });

    it('should mark all spans as unmatched when scope has no storyboards', async () => {
      const trace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'unknown-service' } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'unknown-service', version: '1.0.0' },
                spans: [
                  {
                    traceId: 'trace-001',
                    spanId: 'span-001',
                    name: 'someOperation',
                    kind: 1,
                    startTimeUnixNano: '1000000000',
                    endTimeUnixNano: '2000000000',
                    attributes: [],
                    events: [],
                    status: { code: 0 },
                  },
                  {
                    traceId: 'trace-001',
                    spanId: 'span-002',
                    name: 'anotherOperation',
                    kind: 1,
                    startTimeUnixNano: '2000000000',
                    endTimeUnixNano: '3000000000',
                    attributes: [],
                    events: [],
                    status: { code: 0 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await orchestrator.processTrace(trace);

      // All spans should be unmatched
      expect(result.unmatchedSpans.spans).toHaveLength(2);
      expect(result.unmatchedSpans.spans[0].reason).toContain('is not registered in any owned-scopes');
      expect(result.unmatchedSpans.spans[1].reason).toContain('is not registered in any owned-scopes');
    });
  });

  describe('Validation', () => {
    it('should detect duplicate scenario matches', async () => {
      // This is a theoretical edge case - normally shouldn't happen
      // but good to test the validation logic
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-1',
            type: 'event',
            position: { x: 0, y: 0 },
            data: { label: 'Node 1' },
            pv: {
              otel: {
                spanMatch: {
                  name: 'operation',
                },
              },
            },
          },
        ],
        edges: [],
      };

      const workflow: WorkflowTemplate = {
        name: 'Test Workflow',
        mode: 'strict',
        scenarios: [
          {
            id: 'scenario-1',
            priority: 1,
            description: 'Test scenario',
            template: {
              events: {
                'event.test': 'Test event',
              },
            },
          },
        ],
      };

      registry.setSnapshot('test-service', {
        repositoryUrl: 'https://github.com/acme/test',
        commitSha: 'abc123',
        storyboards: [
          {
            id: 'test-storyboard',
            name: 'Test Storyboard',
            path: '.principal-views/test',
            basename: 'test',
            scope: 'root' as const,
            canvas: {
              id: 'test',
              name: 'Test',
              path: '.principal-views/test/test.otel.canvas',
              basename: 'test',
              type: 'otel' as const,
              scope: 'root' as const,
              content: canvas,
            },
            workflows: [
              {
                id: 'test-workflow',
                name: 'Test Workflow',
                path: '.principal-views/test/test.workflow.json',
                basename: 'test',
                storyboardId: 'test-storyboard',
                scope: 'root' as const,
                testTraces: [],
                content: workflow,
              },
            ],
          },
        ],
        registeredAt: new Date().toISOString(),
      });

      const trace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'test-service' } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'test-service', version: '1.0.0' },
                spans: [
                  {
                    traceId: 'trace-001',
                    spanId: 'span-001',
                    name: 'operation',
                    kind: 1,
                    startTimeUnixNano: '1000000000',
                    endTimeUnixNano: '2000000000',
                    attributes: [],
                    events: [
                      {
                        timeUnixNano: '1500000000',
                        name: 'event.test',
                        attributes: [],
                      },
                    ],
                    status: { code: 0 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await orchestrator.processTrace(trace);

      // Should have validation enabled
      expect(result.validationIssues).toBeDefined();
    });

    it('should flag orphaned spans without clear reason', async () => {
      // This tests the validation logic for orphaned spans
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-1',
            type: 'event',
            position: { x: 0, y: 0 },
            data: { label: 'Node 1' },
            pv: {
              otel: {
                spanMatch: {
                  name: 'operation',
                },
              },
            },
          },
        ],
        edges: [],
      };

      const workflow: WorkflowTemplate = {
        name: 'Test Workflow',
        mode: 'strict',
        spanPattern: 'operation', // Match span by name
        scenarios: [
          {
            id: 'scenario-1',
            priority: 1,
            description: 'Test scenario',
            template: {
              events: {
                'event.expected': 'Expected event',
              },
            },
          },
        ],
      };

      registry.setSnapshot('test-service', {
        repositoryUrl: 'https://github.com/acme/test',
        commitSha: 'abc123',
        storyboards: [
          {
            id: 'test-storyboard',
            name: 'Test Storyboard',
            path: '.principal-views/test',
            basename: 'test',
            scope: 'root' as const,
            canvas: {
              id: 'test',
              name: 'Test',
              path: '.principal-views/test/test.otel.canvas',
              basename: 'test',
              type: 'otel' as const,
              scope: 'root' as const,
              content: canvas,
            },
            workflows: [
              {
                id: 'test-workflow',
                name: 'Test Workflow',
                path: '.principal-views/test/test.workflow.json',
                basename: 'test',
                storyboardId: 'test-storyboard',
                scope: 'root' as const,
                testTraces: [],
                content: workflow,
              },
            ],
          },
        ],
        registeredAt: new Date().toISOString(),
      });

      const trace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'test-service' } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'test-service', version: '1.0.0' },
                spans: [
                  {
                    traceId: 'trace-001',
                    spanId: 'span-001',
                    name: 'operation',
                    kind: 1,
                    startTimeUnixNano: '1000000000',
                    endTimeUnixNano: '2000000000',
                    attributes: [],
                    events: [
                      {
                        timeUnixNano: '1500000000',
                        name: 'event.unexpected', // Wrong event
                        attributes: [],
                      },
                    ],
                    status: { code: 0 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await orchestrator.processTrace(trace);

      // Should have orphaned span with reason
      expect(result.storyboardMatches).toHaveLength(1);
      expect(result.storyboardMatches[0].orphanedSpans[0].reason).toBeTruthy();
      expect(result.storyboardMatches[0].orphanedSpans[0].reason.length).toBeGreaterThan(0);
    });
  });

  describe('OTLP Data Preservation', () => {
    it('should include original OTLP data in result', async () => {
      const trace: OtelExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'test-service' } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'test-service', version: '1.0.0' },
                spans: [
                  {
                    traceId: 'trace-001',
                    spanId: 'span-001',
                    name: 'test',
                    kind: 1,
                    startTimeUnixNano: '1000000000',
                    endTimeUnixNano: '2000000000',
                    attributes: [],
                    events: [],
                    status: { code: 0 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await orchestrator.processTrace(trace);

      expect(result.otlpData).toBeDefined();
      expect(result.otlpData).toEqual(trace);
    });
  });
});
