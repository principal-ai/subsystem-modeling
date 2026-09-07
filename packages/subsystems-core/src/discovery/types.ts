/**
 * Type definitions for canvas and execution file discovery
 */

import type { ExtendedCanvas } from '../types/canvas';
import type { ExecutionData } from '../execution/ExecutionValidator';
import type { WorkflowTemplate } from '../workflow/types';

/**
 * Canvas file type discriminator
 * - 'otel': OpenTelemetry canvas (.otel.canvas) for workflow/tracing visualization
 * - 'scopes': Scopes canvas (.scopes.canvas) for documenting instrumentation scopes
 * - 'resources': Resources canvas (.resources.canvas) for documenting OTel resources
 * - 'spans': Spans canvas (.spans.canvas) for documenting span conventions
 * - 'events': Events canvas (.events.canvas) for documenting event namespaces and adjacency
 * - 'regular': Regular canvas (.canvas) for documentation/architecture diagrams
 *
 * Note: Dashboards (.dashboard.json) are NOT canvases - they live in .principal-views/dashboards/
 * and are discovered separately as DiscoveredDashboard.
 */
export type CanvasType = 'otel' | 'scopes' | 'resources' | 'spans' | 'events' | 'regular';

/**
 * Test trace file type discriminator based on extension
 * Only .otel.json files are supported
 */
export type TestTraceType = 'otel';

/**
 * Discovered canvas file with package metadata
 */
export interface DiscoveredCanvas {
  /** Unique ID with package prefix (e.g., "core/my-flow" or "my-flow") */
  id: string;
  /** Display name (Title Case from basename) */
  name: string;
  /** Full relative path from repo root */
  path: string;
  /** Canvas basename (without .canvas/.otel.canvas extension) */
  basename: string;
  /** Canvas type */
  type: CanvasType;
  /** Package name if in a package (e.g., "core" from packages/subsystems-core) */
  packageName?: string;
  /** Package path if in a package (e.g., "packages/subsystems-core") */
  packagePath?: string;
  /** Whether this is from repo root vs package */
  scope: 'root' | 'package';
  /**
   * Associated markdown documentation file path (relative to repo root)
   * Only populated for otel.canvas files when canvas content is loaded
   */
  markdownPath?: string;
}

/**
 * Discovered test trace file with package metadata
 */
export interface DiscoveredTestTrace {
  /** Unique ID with package prefix (e.g., "core/api-tests" or "api-tests") */
  id: string;
  /** Display name (Title Case from basename) */
  name: string;
  /** Full relative path from repo root */
  path: string;
  /** Test trace basename (without .otel.json extension) */
  basename: string;
  /** Test trace file type */
  type: TestTraceType;
  /** Canvas basename this test trace is linked to */
  canvasBasename: string;
  /** Package name if in a package */
  packageName?: string;
  /** Package path if in a package */
  packagePath?: string;
  /** Whether this is from repo root vs package */
  scope: 'root' | 'package';
}

/**
 * Discovered dashboard file in .principal-views/dashboards/
 */
export interface DiscoveredDashboard {
  /** Unique ID with package prefix (e.g., "core/auth-health" or "auth-health") */
  id: string;
  /** Display name (Title Case from basename) */
  name: string;
  /** Full relative path from repo root */
  path: string;
  /** Dashboard basename (without .dashboard.json extension) */
  basename: string;
  /** Package name if in a package */
  packageName?: string;
  /** Package path if in a package */
  packagePath?: string;
  /** Whether this is from repo root vs package */
  scope: 'root' | 'package';
}

/**
 * Discovered dashboard with parsed content
 */
export interface DiscoveredDashboardWithContent extends DiscoveredDashboard {
  /** Parsed dashboard content (only when includeContent: true) */
  content: import('../types/dashboard').DashboardDefinition;
}

/**
 * A span convention (surface) referenced by a workflow
 */
export interface ReferencedSpan {
  /** The span pattern (e.g., "canvas.load", "multi-canvas-panel.render") */
  pattern: string;
  /** Display label from the spans.canvas node, if found */
  label?: string;
  /** Instrumentation scope from the spans.canvas node otel.scope, if found */
  scope?: string;
}

/**
 * Discovered workflow file within a storyboard
 */
export interface DiscoveredWorkflow {
  /** Workflow basename ID (e.g., "checkout" for checkout.workflow.json) */
  id: string;
  /** Display name (Title Case from basename) */
  name: string;
  /** Full relative path from repo root to workflow.json file */
  path: string;
  /** Workflow basename (without .workflow.json extension) */
  basename: string;
  /** Parent storyboard ID this workflow belongs to */
  storyboardId: string;
  /** Package name if in a package */
  packageName?: string;
  /** Package path if in a package */
  packagePath?: string;
  /** Whether this is from repo root vs package */
  scope: 'root' | 'package';
  /** Associated test trace files for this workflow */
  testTraces: DiscoveredTestTrace[];
  /**
   * All span conventions (surfaces) referenced by this workflow.
   * Includes rootSpan and any explicit span fields in event templates.
   * Only populated when includeContent: true during discovery.
   */
  referencedSpans?: ReferencedSpan[];

  /**
   * The instrumentation scope this workflow belongs to.
   * Derived from the rootSpan's scope in spans.canvas.
   * Only populated when includeContent: true during discovery.
   */
  instrumentationScope?: string;

  /**
   * Display label for the workflow's instrumentation scope.
   * Resolved from scopes.canvas using the scope name.
   * Only populated when includeContent: true during discovery.
   */
  instrumentationScopeLabel?: string;
}

/**
 * Discovered storyboard folder containing canvas, workflows, and executions
 */
export interface DiscoveredStoryboard {
  /** Unique ID with package prefix (e.g., "core/checkout-flow" or "checkout-flow") */
  id: string;
  /** Display name (Title Case from basename) */
  name: string;
  /** Full relative path from repo root to storyboard folder */
  path: string;
  /** Storyboard basename (folder name) */
  basename: string;
  /** The main canvas file for this storyboard */
  canvas: DiscoveredCanvas;
  /** Workflows within this storyboard */
  workflows: DiscoveredWorkflow[];
  /** Package name if in a package */
  packageName?: string;
  /** Package path if in a package */
  packagePath?: string;
  /** Whether this is from repo root vs package */
  scope: 'root' | 'package';
}

/**
 * Result of canvas discovery operation
 */
export interface CanvasDiscoveryResult {
  /** All discovered canvas files, sorted by package then name */
  canvases: DiscoveredCanvas[];
  /** All discovered test trace files, sorted by package then name */
  testTraces: DiscoveredTestTrace[];
  /** All discovered storyboards (hierarchical organization of canvas + workflows + test traces) */
  storyboards: DiscoveredStoryboard[];
  /** All discovered dashboard files from .principal-views/dashboards/ */
  dashboards: DiscoveredDashboard[];
  /** Any errors encountered during discovery */
  errors: Array<{ path: string; error: string }>;
  /** Deprecation warnings for legacy structures */
  warnings: Array<{ path: string; message: string; type: 'deprecation' }>;
}

/**
 * Options for file discovery
 */
export interface DiscoveryOptions {
  /**
   * Optional function to read and parse canvas file contents
   * Useful when you want parsed canvas objects, not just metadata
   *
   * @example
   * // In CLI with filesystem access:
   * fileReader: async (path) => fs.promises.readFile(path, 'utf-8')
   *
   * @example
   * // In panels with cache:
   * fileReader: async (path) => context.getSlice('fileCache').read(path)
   */
  fileReader?: (path: string) => Promise<string>;

  /**
   * Whether to include canvas content in results
   * Requires fileReader to be provided
   */
  includeContent?: boolean;
}

/**
 * Discovered canvas with parsed content
 */
export interface DiscoveredCanvasWithContent extends DiscoveredCanvas {
  /** Parsed canvas content (only when includeContent: true) */
  content: ExtendedCanvas;
}

/**
 * Discovered test trace with parsed content
 */
export interface DiscoveredTestTraceWithContent extends DiscoveredTestTrace {
  /** Parsed test trace artifact (only when includeContent: true) */
  content: ExecutionData;
}

/**
 * Discovered workflow with parsed content
 */
export interface DiscoveredWorkflowWithContent extends DiscoveredWorkflow {
  /** Parsed workflow template (only when includeContent: true) */
  content: WorkflowTemplate;
  /** Test traces with parsed content */
  testTraces: (DiscoveredTestTrace | DiscoveredTestTraceWithContent)[];
}

/**
 * Discovered storyboard with parsed content
 */
export interface DiscoveredStoryboardWithContent extends DiscoveredStoryboard {
  /** Canvas with parsed content */
  canvas: DiscoveredCanvas | DiscoveredCanvasWithContent;
  /** Workflows with parsed content */
  workflows: (DiscoveredWorkflow | DiscoveredWorkflowWithContent)[];
}

/**
 * Discovery result with content
 */
export interface CanvasDiscoveryResultWithContent {
  canvases: (DiscoveredCanvas | DiscoveredCanvasWithContent)[];
  testTraces: (DiscoveredTestTrace | DiscoveredTestTraceWithContent)[];
  storyboards: (DiscoveredStoryboard | DiscoveredStoryboardWithContent)[];
  dashboards: (DiscoveredDashboard | DiscoveredDashboardWithContent)[];
  errors: Array<{ path: string; error: string }>;
  warnings: Array<{ path: string; message: string; type: 'deprecation' }>;
}

// =============================================================================
// Canvas File Manifest Types
// =============================================================================

/**
 * Classification of how a file relates to a canvas/workflow
 */
export type CanvasFileRole =
  | 'instrumentation' // File contains OTEL instrumentation (from otel.files)
  | 'reference' // External reference/documentation (from otel.references)
  | 'root-span'; // Root span instrumentation (from workflow.files)

/**
 * Origin of the file - internal to repo or external
 */
export type CanvasFileOrigin = 'internal' | 'external';

/**
 * Source level where the file was defined
 */
export type CanvasFileLevel = 'canvas-node' | 'workflow';

/**
 * A file referenced by a canvas, workflow, or scenario
 */
export interface CanvasFile {
  /** File path (relative to repo root for internal, URL/package ref for external) */
  path: string;

  /** How this file relates to the canvas */
  role: CanvasFileRole;

  /** Whether the file is in this repo or external */
  origin: CanvasFileOrigin;

  /** Where this file reference was defined */
  level: CanvasFileLevel;

  /** IDs of nodes that reference this file (for canvas-node level) */
  nodeIds: string[];

  /** Node types that reference this file */
  nodeTypes: string[];

  /** Workflow IDs that reference this file (for workflow level) */
  workflowIds: string[];

  /** Event names associated with this file's nodes */
  eventNames: string[];
}

/**
 * Canvas-level statistics
 */
export interface CanvasFileStats {
  totalFiles: number;
  internalFiles: number;
  externalFiles: number;
  instrumentationFiles: number;
  referenceFiles: number;
  nodesWithFiles: number;
  nodesWithoutFiles: number;
  uniqueEventNames: number;
}

/**
 * Storyboard-level statistics
 */
export interface StoryboardFileStats extends CanvasFileStats {
  workflowCount: number;
  scenarioCount: number;
  rootSpanFiles: number;
}

/**
 * File manifest for a single canvas (without workflows)
 */
export interface CanvasFileManifest {
  /** Canvas ID */
  canvasId: string;

  /** Canvas path */
  canvasPath: string;

  /** Canvas type */
  canvasType: CanvasType;

  /** All files from canvas nodes, deduplicated */
  files: CanvasFile[];

  /** Quick lookup by role */
  byRole: Record<CanvasFileRole, CanvasFile[]>;

  /** Quick lookup by origin */
  byOrigin: Record<CanvasFileOrigin, CanvasFile[]>;

  /** Reverse mapping: file path -> node IDs */
  fileToNodes: Map<string, string[]>;

  /** Reverse mapping: node ID -> file paths */
  nodeToFiles: Map<string, string[]>;

  /** Reverse mapping: event name -> file paths */
  eventToFiles: Map<string, string[]>;

  /** Summary statistics */
  stats: CanvasFileStats;
}

/**
 * File manifest for a workflow (includes canvas + workflow-level files)
 */
export interface WorkflowFileManifest extends CanvasFileManifest {
  /** Workflow ID */
  workflowId: string;

  /** Workflow path */
  workflowPath: string;

  /** Root span name */
  rootSpan?: string;

  /** Files from workflow.files property */
  workflowFiles: CanvasFile[];

  /** Merged files (canvas + workflow) */
  allFiles: CanvasFile[];

  /** Files filtered by scenario (scenario ID -> files) */
  byScenario: Map<string, CanvasFile[]>;
}

/**
 * File manifest for an entire storyboard
 */
export interface StoryboardFileManifest {
  /** Storyboard ID */
  storyboardId: string;

  /** Storyboard path */
  storyboardPath: string;

  /** Main canvas manifest */
  canvas: CanvasFileManifest;

  /** Workflow manifests */
  workflows: WorkflowFileManifest[];

  /** All files across canvas and all workflows */
  allFiles: CanvasFile[];

  /** Summary statistics */
  stats: StoryboardFileStats;
}

/**
 * Discovered canvas with content AND file manifest
 */
export interface DiscoveredCanvasWithManifest extends DiscoveredCanvasWithContent {
  manifest: CanvasFileManifest;
}

/**
 * Discovered workflow with content AND file manifest
 */
export interface DiscoveredWorkflowWithManifest extends DiscoveredWorkflowWithContent {
  manifest: WorkflowFileManifest;
}

/**
 * Discovered storyboard with content AND file manifest
 */
export interface DiscoveredStoryboardWithManifest extends DiscoveredStoryboardWithContent {
  manifest: StoryboardFileManifest;
}
