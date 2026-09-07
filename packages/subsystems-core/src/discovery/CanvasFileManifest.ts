/**
 * Canvas File Manifest Builder
 *
 * Utilities for building aggregated file manifests from canvases, workflows, and storyboards.
 * These manifests provide structured access to all files associated with OTEL canvases,
 * with bidirectional mappings between files, nodes, and events.
 */

import type {
  ExtendedCanvas,
  ExtendedCanvasNode,
  OtelNode,
  OtelEventNode,
} from '../types/canvas';
import type { WorkflowTemplate, WorkflowScenario } from '../workflow/types';
import type {
  CanvasFileManifest,
  WorkflowFileManifest,
  StoryboardFileManifest,
  CanvasFile,
  CanvasFileRole,
  CanvasFileOrigin,
  CanvasType,
} from './types';

// =============================================================================
// Type Guards
// =============================================================================

function isOtelNode(node: ExtendedCanvasNode): node is OtelNode {
  return node.type.startsWith('otel-');
}

function isOtelEventNode(node: ExtendedCanvasNode): node is OtelEventNode {
  return node.type === 'otel-event';
}

// =============================================================================
// Node File Extraction
// =============================================================================

interface ExtractedFile {
  path: string;
  role: CanvasFileRole;
  origin: CanvasFileOrigin;
  eventName?: string;
}

function extractNodeFiles(node: ExtendedCanvasNode): ExtractedFile[] {
  const files: ExtractedFile[] = [];

  // Only process OTEL nodes
  if (!isOtelNode(node) || !node.otel) {
    return files;
  }

  // Get event name if this is an otel-event node
  let eventName: string | undefined;
  if (isOtelEventNode(node)) {
    eventName = node.event?.name ?? node.eventRef;
  }

  const origin: CanvasFileOrigin = node.otel.origin ?? 'internal';

  // Instrumentation files
  if (node.otel.files) {
    for (const path of node.otel.files) {
      files.push({ path, role: 'instrumentation', origin, eventName });
    }
  }

  // References
  if (node.otel.references) {
    for (const path of node.otel.references) {
      files.push({ path, role: 'reference', origin: 'external', eventName });
    }
  }

  return files;
}

// =============================================================================
// Canvas Manifest Builder
// =============================================================================

/**
 * Build a file manifest from a canvas
 *
 * @param canvas - The parsed ExtendedCanvas
 * @param canvasId - Canvas identifier
 * @param canvasPath - Canvas file path
 * @param canvasType - Canvas type (otel, scopes, spans, resources)
 * @returns Aggregated file manifest
 *
 * @example
 * ```typescript
 * const manifest = buildCanvasFileManifest(
 *   canvas,
 *   'my-canvas',
 *   '.principal-views/my-canvas.otel.canvas',
 *   'otel'
 * );
 *
 * // Get all instrumentation files
 * const instrumentationFiles = manifest.byRole.instrumentation;
 *
 * // Find which nodes reference a specific file
 * const nodeIds = manifest.fileToNodes.get('src/api/checkout.ts');
 *
 * // Get all files for a specific node
 * const files = manifest.nodeToFiles.get('node-123');
 * ```
 */
export function buildCanvasFileManifest(
  canvas: ExtendedCanvas,
  canvasId: string,
  canvasPath: string,
  canvasType: CanvasType = 'otel'
): CanvasFileManifest {
  const fileMap = new Map<string, CanvasFile>();
  const fileToNodes = new Map<string, string[]>();
  const nodeToFiles = new Map<string, string[]>();
  const eventToFiles = new Map<string, string[]>();
  const eventNames = new Set<string>();

  let nodesWithFiles = 0;
  let nodesWithoutFiles = 0;

  for (const node of canvas.nodes ?? []) {
    const nodeFiles = extractNodeFiles(node);

    if (nodeFiles.length > 0) {
      nodesWithFiles++;
      nodeToFiles.set(
        node.id,
        nodeFiles.map((f) => f.path)
      );
    } else {
      nodesWithoutFiles++;
    }

    for (const { path, role, origin, eventName } of nodeFiles) {
      // Track event names
      if (eventName) {
        eventNames.add(eventName);
        const existingEventFiles = eventToFiles.get(eventName) ?? [];
        if (!existingEventFiles.includes(path)) {
          existingEventFiles.push(path);
          eventToFiles.set(eventName, existingEventFiles);
        }
      }

      // Update fileToNodes mapping
      const existingNodes = fileToNodes.get(path) ?? [];
      if (!existingNodes.includes(node.id)) {
        existingNodes.push(node.id);
        fileToNodes.set(path, existingNodes);
      }

      // Update or create CanvasFile entry
      const existing = fileMap.get(path);
      if (existing) {
        if (!existing.nodeIds.includes(node.id)) {
          existing.nodeIds.push(node.id);
        }
        if (!existing.nodeTypes.includes(node.type)) {
          existing.nodeTypes.push(node.type);
        }
        if (eventName && !existing.eventNames.includes(eventName)) {
          existing.eventNames.push(eventName);
        }
        // Role priority: instrumentation > root-span > reference
        const rolePriority: Record<CanvasFileRole, number> = {
          instrumentation: 3,
          'root-span': 2,
          reference: 1,
        };
        if (rolePriority[role] > rolePriority[existing.role]) {
          existing.role = role;
        }
      } else {
        fileMap.set(path, {
          path,
          role,
          origin,
          level: 'canvas-node',
          nodeIds: [node.id],
          nodeTypes: [node.type],
          workflowIds: [],
          eventNames: eventName ? [eventName] : [],
        });
      }
    }
  }

  const files = Array.from(fileMap.values());

  // Build byRole lookup
  const byRole: Record<CanvasFileRole, CanvasFile[]> = {
    instrumentation: files.filter((f) => f.role === 'instrumentation'),
    reference: files.filter((f) => f.role === 'reference'),
    'root-span': files.filter((f) => f.role === 'root-span'),
  };

  // Build byOrigin lookup
  const byOrigin: Record<CanvasFileOrigin, CanvasFile[]> = {
    internal: files.filter((f) => f.origin === 'internal'),
    external: files.filter((f) => f.origin === 'external'),
  };

  return {
    canvasId,
    canvasPath,
    canvasType,
    files,
    byRole,
    byOrigin,
    fileToNodes,
    nodeToFiles,
    eventToFiles,
    stats: {
      totalFiles: files.length,
      internalFiles: byOrigin.internal.length,
      externalFiles: byOrigin.external.length,
      instrumentationFiles: byRole.instrumentation.length,
      referenceFiles: byRole.reference.length,
      nodesWithFiles,
      nodesWithoutFiles,
      uniqueEventNames: eventNames.size,
    },
  };
}

// =============================================================================
// Workflow Manifest Builder
// =============================================================================

/**
 * Get files relevant to a specific scenario
 */
function getFilesForScenario(
  scenario: WorkflowScenario,
  canvasManifest: CanvasFileManifest,
  workflowFiles: CanvasFile[]
): CanvasFile[] {
  const files: CanvasFile[] = [];

  // Always include workflow-level files (root span)
  files.push(...workflowFiles);

  // Get event names from scenario template
  const eventNames = Object.keys(scenario.template.events ?? {});

  // Find files for each event
  for (const eventName of eventNames) {
    const eventFiles = canvasManifest.eventToFiles.get(eventName) ?? [];
    for (const filePath of eventFiles) {
      const canvasFile = canvasManifest.files.find((f) => f.path === filePath);
      if (canvasFile && !files.some((f) => f.path === filePath)) {
        files.push(canvasFile);
      }
    }
  }

  return files;
}

/**
 * Build a file manifest for a workflow (includes canvas files)
 *
 * @param canvasManifest - The canvas manifest to extend
 * @param workflow - The workflow template
 * @param workflowId - Workflow identifier
 * @param workflowPath - Workflow file path
 * @returns Workflow file manifest with scenario filtering
 *
 * @example
 * ```typescript
 * const workflowManifest = buildWorkflowFileManifest(
 *   canvasManifest,
 *   workflow,
 *   'checkout-workflow',
 *   '.principal-views/checkout/checkout.workflow.json'
 * );
 *
 * // Get files for a specific scenario
 * const scenarioFiles = workflowManifest.byScenario.get('success-scenario');
 * ```
 */
export function buildWorkflowFileManifest(
  canvasManifest: CanvasFileManifest,
  workflow: WorkflowTemplate,
  workflowId: string,
  workflowPath: string
): WorkflowFileManifest {
  // Extract workflow-level files
  const workflowFiles: CanvasFile[] = (workflow.files ?? []).map((path) => ({
    path,
    role: 'root-span' as CanvasFileRole,
    origin: 'internal' as CanvasFileOrigin,
    level: 'workflow' as const,
    nodeIds: [],
    nodeTypes: [],
    workflowIds: [workflowId],
    eventNames: [],
  }));

  // Merge canvas files with workflow files
  const allFilesMap = new Map<string, CanvasFile>();

  // Add canvas files first
  for (const file of canvasManifest.files) {
    allFilesMap.set(file.path, { ...file });
  }

  // Add/merge workflow files
  for (const file of workflowFiles) {
    const existing = allFilesMap.get(file.path);
    if (existing) {
      existing.workflowIds.push(workflowId);
      // Upgrade role if workflow-level
      if (file.role === 'root-span') {
        existing.role = 'root-span';
        existing.level = 'workflow';
      }
    } else {
      allFilesMap.set(file.path, file);
    }
  }

  const allFiles = Array.from(allFilesMap.values());

  // Build scenario -> files mapping
  const byScenario = new Map<string, CanvasFile[]>();
  for (const scenario of workflow.scenarios) {
    const scenarioFiles = getFilesForScenario(scenario, canvasManifest, workflowFiles);
    byScenario.set(scenario.id, scenarioFiles);
  }

  return {
    ...canvasManifest,
    workflowId,
    workflowPath,
    rootSpan: workflow.rootSpan ?? workflow.spanPattern,
    workflowFiles,
    allFiles,
    byScenario,
  };
}

// =============================================================================
// Storyboard Manifest Builder
// =============================================================================

/**
 * Build a file manifest for an entire storyboard
 *
 * @param canvasManifest - The main canvas manifest
 * @param workflowManifests - Array of workflow manifests
 * @param storyboardId - Storyboard identifier
 * @param storyboardPath - Storyboard folder path
 * @returns Storyboard file manifest aggregating all files
 *
 * @example
 * ```typescript
 * const storyboardManifest = buildStoryboardFileManifest(
 *   canvasManifest,
 *   workflowManifests,
 *   'checkout-flow',
 *   '.principal-views/checkout-flow'
 * );
 *
 * // Get all files across canvas and workflows
 * const allFiles = storyboardManifest.allFiles;
 * ```
 */
export function buildStoryboardFileManifest(
  canvasManifest: CanvasFileManifest,
  workflowManifests: WorkflowFileManifest[],
  storyboardId: string,
  storyboardPath: string
): StoryboardFileManifest {
  // Merge all files across canvas and workflows
  const allFilesMap = new Map<string, CanvasFile>();

  for (const file of canvasManifest.files) {
    allFilesMap.set(file.path, { ...file });
  }

  for (const workflow of workflowManifests) {
    for (const file of workflow.workflowFiles) {
      const existing = allFilesMap.get(file.path);
      if (existing) {
        existing.workflowIds.push(...file.workflowIds);
      } else {
        allFilesMap.set(file.path, { ...file });
      }
    }
  }

  const allFiles = Array.from(allFilesMap.values());

  // Count scenarios across all workflows
  const scenarioCount = workflowManifests.reduce((sum, w) => sum + w.byScenario.size, 0);

  return {
    storyboardId,
    storyboardPath,
    canvas: canvasManifest,
    workflows: workflowManifests,
    allFiles,
    stats: {
      ...canvasManifest.stats,
      workflowCount: workflowManifests.length,
      scenarioCount,
      rootSpanFiles: allFiles.filter((f) => f.role === 'root-span').length,
    },
  };
}
