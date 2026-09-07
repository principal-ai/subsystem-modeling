import { describe, expect, test } from 'bun:test';
import {
  buildCanvasFileManifest,
  buildWorkflowFileManifest,
  buildStoryboardFileManifest,
} from './CanvasFileManifest';
import type { ExtendedCanvas, OtelEventNode, OtelSpanConventionNode } from '../types/canvas';
import type { WorkflowTemplate } from '../workflow/types';

describe('CanvasFileManifest', () => {
  describe('buildCanvasFileManifest', () => {
    test('extracts instrumentation files from otel-event nodes', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-1',
            type: 'otel-event',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            name: 'Test Event',
            event: { name: 'test.started', attributes: {} },
            otel: {
              files: ['src/api/handler.ts', 'src/api/utils.ts'],
            },
          } as OtelEventNode,
        ],
      };

      const manifest = buildCanvasFileManifest(canvas, 'test', 'test.otel.canvas', 'otel');

      expect(manifest.stats.instrumentationFiles).toBe(2);
      expect(manifest.byRole.instrumentation).toHaveLength(2);
      expect(manifest.fileToNodes.get('src/api/handler.ts')).toEqual(['node-1']);
      expect(manifest.nodeToFiles.get('node-1')).toEqual(['src/api/handler.ts', 'src/api/utils.ts']);
    });

    test('extracts references from otel nodes', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-1',
            type: 'otel-event',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            name: 'External Event',
            event: { name: 'external.call', attributes: {} },
            otel: {
              origin: 'external',
              references: ['https://docs.example.com', '@some/package'],
            },
          } as OtelEventNode,
        ],
      };

      const manifest = buildCanvasFileManifest(canvas, 'test', 'test.otel.canvas', 'otel');

      expect(manifest.stats.referenceFiles).toBe(2);
      expect(manifest.byRole.reference).toHaveLength(2);
      expect(manifest.byOrigin.external).toHaveLength(2);
    });

    test('tracks event names for otel-event nodes', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-1',
            type: 'otel-event',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            name: 'Event 1',
            event: { name: 'user.login', attributes: {} },
            otel: {
              files: ['src/auth/login.ts'],
            },
          } as OtelEventNode,
          {
            id: 'node-2',
            type: 'otel-event',
            x: 0,
            y: 100,
            width: 100,
            height: 50,
            name: 'Event 2',
            event: { name: 'user.logout', attributes: {} },
            otel: {
              files: ['src/auth/logout.ts'],
            },
          } as OtelEventNode,
        ],
      };

      const manifest = buildCanvasFileManifest(canvas, 'test', 'test.otel.canvas', 'otel');

      expect(manifest.stats.uniqueEventNames).toBe(2);
      expect(manifest.eventToFiles.get('user.login')).toEqual(['src/auth/login.ts']);
      expect(manifest.eventToFiles.get('user.logout')).toEqual(['src/auth/logout.ts']);
    });

    test('merges duplicate file references across nodes', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-1',
            type: 'otel-event',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            name: 'Event 1',
            event: { name: 'event.one', attributes: {} },
            otel: {
              files: ['src/shared.ts'],
            },
          } as OtelEventNode,
          {
            id: 'node-2',
            type: 'otel-event',
            x: 0,
            y: 100,
            width: 100,
            height: 50,
            name: 'Event 2',
            event: { name: 'event.two', attributes: {} },
            otel: {
              files: ['src/shared.ts'],
            },
          } as OtelEventNode,
        ],
      };

      const manifest = buildCanvasFileManifest(canvas, 'test', 'test.otel.canvas', 'otel');

      expect(manifest.stats.totalFiles).toBe(1);
      expect(manifest.files[0].nodeIds).toEqual(['node-1', 'node-2']);
      expect(manifest.files[0].eventNames).toEqual(['event.one', 'event.two']);
      expect(manifest.fileToNodes.get('src/shared.ts')).toEqual(['node-1', 'node-2']);
    });

    test('handles otel-span-convention nodes', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'span-node',
            type: 'otel-span-convention',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            name: 'HTTP Request',
            otel: {
              spanPattern: 'http.request',
              files: ['src/middleware/tracing.ts'],
            },
          } as OtelSpanConventionNode,
        ],
      };

      const manifest = buildCanvasFileManifest(canvas, 'test', 'test.spans.canvas', 'spans');

      expect(manifest.stats.instrumentationFiles).toBe(1);
      expect(manifest.canvasType).toBe('spans');
      // Span convention nodes don't have event names
      expect(manifest.files[0].eventNames).toEqual([]);
    });

    test('ignores non-OTEL nodes', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'text-node',
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            text: 'Some documentation',
          },
          {
            id: 'otel-node',
            type: 'otel-event',
            x: 0,
            y: 100,
            width: 100,
            height: 50,
            name: 'Real Event',
            event: { name: 'real.event', attributes: {} },
            otel: {
              files: ['src/real.ts'],
            },
          } as OtelEventNode,
        ],
      };

      const manifest = buildCanvasFileManifest(canvas, 'test', 'test.otel.canvas', 'otel');

      expect(manifest.stats.totalFiles).toBe(1);
      expect(manifest.stats.nodesWithFiles).toBe(1);
      expect(manifest.stats.nodesWithoutFiles).toBe(1);
    });

    test('handles empty canvas', () => {
      const canvas: ExtendedCanvas = {
        nodes: [],
      };

      const manifest = buildCanvasFileManifest(canvas, 'test', 'test.otel.canvas', 'otel');

      expect(manifest.stats.totalFiles).toBe(0);
      expect(manifest.files).toEqual([]);
      expect(manifest.byRole.instrumentation).toEqual([]);
    });

    test('handles nodes without otel metadata', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-no-otel',
            type: 'otel-event',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            name: 'Draft Event',
            event: { name: 'draft.event', attributes: {} },
            // No otel property
          } as unknown as OtelEventNode,
        ],
      };

      const manifest = buildCanvasFileManifest(canvas, 'test', 'test.otel.canvas', 'otel');

      expect(manifest.stats.totalFiles).toBe(0);
      expect(manifest.stats.nodesWithoutFiles).toBe(1);
    });
  });

  describe('buildWorkflowFileManifest', () => {
    test('includes workflow-level files', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-1',
            type: 'otel-event',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            name: 'Event',
            event: { name: 'test.event', attributes: {} },
            otel: {
              files: ['src/event.ts'],
            },
          } as OtelEventNode,
        ],
      };

      const canvasManifest = buildCanvasFileManifest(canvas, 'test', 'test.otel.canvas', 'otel');

      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Test Workflow',
        description: 'Test',
        rootSpan: 'test.span',
        files: ['src/api/route.ts'],
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'success',
            priority: 1,
            description: 'Success scenario',
            template: {
              events: {
                'test.event': 'Event happened',
              },
            },
          },
        ],
      };

      const workflowManifest = buildWorkflowFileManifest(
        canvasManifest,
        workflow,
        'test-workflow',
        'test.workflow.json'
      );

      expect(workflowManifest.workflowFiles).toHaveLength(1);
      expect(workflowManifest.workflowFiles[0].role).toBe('root-span');
      expect(workflowManifest.allFiles).toHaveLength(2);
      expect(workflowManifest.rootSpan).toBe('test.span');
    });

    test('filters files by scenario', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-1',
            type: 'otel-event',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            name: 'Login Event',
            event: { name: 'user.login', attributes: {} },
            otel: {
              files: ['src/auth/login.ts'],
            },
          } as OtelEventNode,
          {
            id: 'node-2',
            type: 'otel-event',
            x: 0,
            y: 100,
            width: 100,
            height: 50,
            name: 'Logout Event',
            event: { name: 'user.logout', attributes: {} },
            otel: {
              files: ['src/auth/logout.ts'],
            },
          } as OtelEventNode,
        ],
      };

      const canvasManifest = buildCanvasFileManifest(canvas, 'test', 'test.otel.canvas', 'otel');

      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Auth Workflow',
        description: 'Auth',
        rootSpan: 'auth.flow',
        files: ['src/api/auth.ts'],
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'login-only',
            priority: 1,
            description: 'Login only',
            template: {
              events: {
                'user.login': 'User logged in',
              },
            },
          },
          {
            id: 'full-flow',
            priority: 2,
            description: 'Full flow',
            template: {
              events: {
                'user.login': 'User logged in',
                'user.logout': 'User logged out',
              },
            },
          },
        ],
      };

      const workflowManifest = buildWorkflowFileManifest(
        canvasManifest,
        workflow,
        'auth-workflow',
        'auth.workflow.json'
      );

      const loginOnlyFiles = workflowManifest.byScenario.get('login-only');
      const fullFlowFiles = workflowManifest.byScenario.get('full-flow');

      // login-only: workflow file + login file
      expect(loginOnlyFiles).toHaveLength(2);
      expect(loginOnlyFiles?.map((f) => f.path)).toContain('src/api/auth.ts');
      expect(loginOnlyFiles?.map((f) => f.path)).toContain('src/auth/login.ts');

      // full-flow: workflow file + both event files
      expect(fullFlowFiles).toHaveLength(3);
      expect(fullFlowFiles?.map((f) => f.path)).toContain('src/auth/login.ts');
      expect(fullFlowFiles?.map((f) => f.path)).toContain('src/auth/logout.ts');
    });

    test('merges overlapping files between canvas and workflow', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-1',
            type: 'otel-event',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            name: 'Event',
            event: { name: 'test.event', attributes: {} },
            otel: {
              files: ['src/shared.ts'],
            },
          } as OtelEventNode,
        ],
      };

      const canvasManifest = buildCanvasFileManifest(canvas, 'test', 'test.otel.canvas', 'otel');

      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Test Workflow',
        description: 'Test',
        rootSpan: 'test.span',
        files: ['src/shared.ts'], // Same file as canvas node
        scenarioSelection: 'first-match',
        scenarios: [],
      };

      const workflowManifest = buildWorkflowFileManifest(
        canvasManifest,
        workflow,
        'test-workflow',
        'test.workflow.json'
      );

      // Should be merged, not duplicated
      expect(workflowManifest.allFiles).toHaveLength(1);
      // Role should be upgraded to root-span
      expect(workflowManifest.allFiles[0].role).toBe('root-span');
      expect(workflowManifest.allFiles[0].workflowIds).toContain('test-workflow');
    });
  });

  describe('buildStoryboardFileManifest', () => {
    test('aggregates files across canvas and workflows', () => {
      const canvas: ExtendedCanvas = {
        nodes: [
          {
            id: 'node-1',
            type: 'otel-event',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            name: 'Event',
            event: { name: 'test.event', attributes: {} },
            otel: {
              files: ['src/canvas-file.ts'],
            },
          } as OtelEventNode,
        ],
      };

      const canvasManifest = buildCanvasFileManifest(canvas, 'test', 'test.otel.canvas', 'otel');

      const workflow1: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Workflow 1',
        description: 'Test',
        rootSpan: 'workflow1.span',
        files: ['src/workflow1.ts'],
        scenarioSelection: 'first-match',
        scenarios: [{ id: 's1', priority: 1, description: 'S1', template: {} }],
      };

      const workflow2: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Workflow 2',
        description: 'Test',
        rootSpan: 'workflow2.span',
        files: ['src/workflow2.ts'],
        scenarioSelection: 'first-match',
        scenarios: [{ id: 's2', priority: 1, description: 'S2', template: {} }],
      };

      const workflowManifest1 = buildWorkflowFileManifest(
        canvasManifest,
        workflow1,
        'workflow-1',
        'workflow1.workflow.json'
      );

      const workflowManifest2 = buildWorkflowFileManifest(
        canvasManifest,
        workflow2,
        'workflow-2',
        'workflow2.workflow.json'
      );

      const storyboardManifest = buildStoryboardFileManifest(
        canvasManifest,
        [workflowManifest1, workflowManifest2],
        'test-storyboard',
        '.principal-views/test-storyboard'
      );

      expect(storyboardManifest.allFiles).toHaveLength(3);
      expect(storyboardManifest.stats.workflowCount).toBe(2);
      expect(storyboardManifest.stats.scenarioCount).toBe(2);
      expect(storyboardManifest.stats.rootSpanFiles).toBe(2);
    });

    test('includes canvas manifest reference', () => {
      const canvas: ExtendedCanvas = { nodes: [] };
      const canvasManifest = buildCanvasFileManifest(canvas, 'test', 'test.otel.canvas', 'otel');

      const storyboardManifest = buildStoryboardFileManifest(
        canvasManifest,
        [],
        'test-storyboard',
        '.principal-views/test-storyboard'
      );

      expect(storyboardManifest.canvas).toBe(canvasManifest);
      expect(storyboardManifest.workflows).toEqual([]);
    });
  });
});
