/**
 * Telemetry Coverage Analysis
 *
 * Measures observability coverage by analyzing which implementation files
 * contain the OpenTelemetry events documented in canvas nodes.
 *
 * Uses codebase-composition's ImplementationFileLayerModule for accurate,
 * framework-aware detection of implementation files.
 */

import type { FileTree } from '@principal-ai/repository-abstraction';
import { CanvasDiscovery } from '../discovery/CanvasDiscovery';
import type { DiscoveredCanvasWithContent } from '../discovery/types';
import type { ExtendedCanvasNode } from '../types/canvas';
import { isOtelNode, isStandardCanvasNode } from '../types/canvas';
import { getNodeEventName } from '../storyboard/builder';
import {
  ImplementationFileLayerModule,
  PackageLayerModule,
  type ImplementationFileLayer,
} from '@principal-ai/codebase-composition';

/**
 * Per-file instrumentation details
 */
export interface FileInstrumentation {
  filePath: string;
  expectedEvents: string[];      // Events that should be in this file (from canvas)
  foundEvents: string[];         // Events actually found in the file
  instrumentationCount: number;  // foundEvents.length (for heat map)
  hasInstrumentation: boolean;   // instrumentationCount > 0
  missingEvents: string[];       // expectedEvents - foundEvents
  isImplementationFile: boolean; // Whether this file matches implementation patterns
}

/**
 * Node status breakdown
 */
export interface NodeStatusBreakdown {
  missingStatusCount: number;
  draftCount: number;
  approvedCount: number;
  approvedWithFilesCount: number;
  implementedCount: number;
  implementedWithFilesCount: number;
}

/**
 * Validation error for a canvas node
 */
export interface ValidationError {
  nodeId: string;
  canvasPath: string;
  error: string;
  status?: string;
}

/**
 * Overall coverage metrics (file-based)
 */
export interface CoverageMetrics {
  // File-based coverage
  totalImplementationFiles: number;
  filesWithInstrumentation: number;
  coveragePercentage: number;

  // Per-file details (for heat map and debugging)
  fileCoverage: FileInstrumentation[];

  // Canvas metadata
  canvasFiles: string[];

  // Summary stats
  totalExpectedEvents: number;
  totalFoundEvents: number;

  // Per-package breakdown
  packageCoverage: PackageCoverageMetrics[];

  // Node status breakdown
  nodeStatus: NodeStatusBreakdown;

  // Validation errors
  validationErrors: ValidationError[];
}

/**
 * Per-package coverage metrics
 */
export interface PackageCoverageMetrics {
  packageName: string;
  packagePath: string;
  totalFiles: number;
  filesWithInstrumentation: number;
  coveragePercentage: number;
  filesByExtension: Record<string, number>;
}

/**
 * Extract event name from a canvas node
 * Uses the canonical getNodeEventName() which supports all event reference formats
 */
function getEventName(node: ExtendedCanvasNode): string | null {
  return getNodeEventName(node) ?? null;
}

/**
 * Extract instrumentation file paths from a canvas node
 * Supports both new format (node.otel.files) and legacy format (pv.otel.files)
 */
function getInstrumentationFiles(node: ExtendedCanvasNode): string[] {
  // Check OTEL nodes (top-level otel field)
  if (isOtelNode(node) && node.otel?.files) {
    return node.otel.files;
  }
  // Check standard nodes (pv.otel.files)
  if (isStandardCanvasNode(node) && node.pv?.otel?.files) {
    return node.pv.otel.files;
  }
  return [];
}

/**
 * Check if a file contains a specific event name (simple string match)
 */
async function fileContainsEvent(
  filePath: string,
  eventName: string,
  fileReader: (path: string) => Promise<string>
): Promise<boolean> {
  try {
    const content = await fileReader(filePath);
    return content.includes(eventName);
  } catch {
    return false;
  }
}

/**
 * Get the status of a node (returns undefined if not specified)
 * Supports both new format (node.otel.status) and legacy format (pv.status)
 */
function getNodeStatus(node: ExtendedCanvasNode): 'draft' | 'approved' | 'implemented' | undefined {
  // Check OTEL nodes (otel.status)
  if (isOtelNode(node) && node.otel?.status) {
    return node.otel.status;
  }
  // Check standard nodes (pv.status)
  if (isStandardCanvasNode(node) && node.pv?.status) {
    return node.pv.status;
  }
  return undefined;
}

/**
 * Get the scope from a node
 * Only supports new format (node.otel.scope). Legacy format (pv.otel.scope) is rejected.
 */
function getNodeScope(node: ExtendedCanvasNode): string | undefined {
  const otelNode = node as { otel?: { scope?: string } };
  return otelNode.otel?.scope;
}

/**
 * Build a map of file -> expected events from canvas nodes
 * Only includes nodes with status='implemented'
 */
async function buildFileEventMap(
  otelCanvases: DiscoveredCanvasWithContent[]
): Promise<Map<string, Set<string>>> {
  const fileEventMap = new Map<string, Set<string>>();

  for (const canvas of otelCanvases) {
    if (!canvas.content?.nodes || canvas.content.nodes.length === 0) {
      continue;
    }

    for (const node of canvas.content.nodes) {
      const eventName = getEventName(node);
      if (!eventName) continue;

      // Only check implemented nodes for coverage
      const status = getNodeStatus(node);
      if (status !== 'implemented') continue;

      const files = getInstrumentationFiles(node);
      for (const file of files) {
        if (!fileEventMap.has(file)) {
          fileEventMap.set(file, new Set());
        }
        fileEventMap.get(file)!.add(eventName);
      }
    }
  }

  return fileEventMap;
}

/**
 * Validate nodes and collect validation errors
 */
function validateNodes(
  otelCanvases: DiscoveredCanvasWithContent[]
): { statusBreakdown: NodeStatusBreakdown; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const statusBreakdown: NodeStatusBreakdown = {
    missingStatusCount: 0,
    draftCount: 0,
    approvedCount: 0,
    approvedWithFilesCount: 0,
    implementedCount: 0,
    implementedWithFilesCount: 0,
  };

  for (const canvas of otelCanvases) {
    if (!canvas.content?.nodes || canvas.content.nodes.length === 0) {
      continue;
    }

    for (const node of canvas.content.nodes) {
      const status = getNodeStatus(node);
      const eventName = getEventName(node);

      // Only validate nodes with events
      if (!eventName) continue;

      const files = getInstrumentationFiles(node);
      const hasFiles = files.length > 0;

      // Validate: nodes with events MUST have a status
      if (!status) {
        statusBreakdown.missingStatusCount++;
        errors.push({
          nodeId: node.id,
          canvasPath: canvas.path,
          error: `Node with event "${eventName}" must have pv.status field. Set to "draft" (design phase), "approved" (ready to implement), or "implemented" (code exists)`,
        });
        continue; // Skip further validation for this node
      }

      // Get references for grounding validation
      let references: string[] = [];
      if (isOtelNode(node) && node.otel?.references) {
        references = node.otel.references;
      } else if (isStandardCanvasNode(node) && node.pv?.references) {
        references = node.pv.references;
      }
      const hasReferences = references.length > 0;

      // Count by status
      if (status === 'draft') {
        statusBreakdown.draftCount++;
        // Drafts must be grounded: require either files (if implementation location is known) or references
        if (!hasFiles && !hasReferences) {
          errors.push({
            nodeId: node.id,
            canvasPath: canvas.path,
            status,
            error: `Node with status="draft" must have either pv.otel.files (if implementation location is known) or pv.references (to ground the event in something)`,
          });
        }
      } else if (status === 'approved') {
        statusBreakdown.approvedCount++;
        if (hasFiles) {
          statusBreakdown.approvedWithFilesCount++;
        }
      } else if (status === 'implemented') {
        statusBreakdown.implementedCount++;
        if (hasFiles) {
          statusBreakdown.implementedWithFilesCount++;
        }
      }

      // Validate approved and implemented nodes have pv.otel.files
      if ((status === 'approved' || status === 'implemented') && !hasFiles) {
        errors.push({
          nodeId: node.id,
          canvasPath: canvas.path,
          status,
          error: `Node with status="${status}" must have pv.otel.files specified`,
        });
      }

      // Error if using deprecated pv.otel.scope (only for standard nodes)
      let legacyScope: string | undefined;
      if (isStandardCanvasNode(node)) {
        legacyScope = node.pv?.otel?.scope;
      }
      if (legacyScope) {
        errors.push({
          nodeId: node.id,
          canvasPath: canvas.path,
          status,
          error: `Node uses deprecated "pv.otel.scope" field. Use new format: convert to type: "otel-event" with top-level "otel.scope" field instead. Run: npx @principal-ai/principal-studio-cli migrate-nodes`,
        });
      }

      // Require scope for ALL event nodes (using new format)
      const scope = getNodeScope(node);
      if (!scope) {
        errors.push({
          nodeId: node.id,
          canvasPath: canvas.path,
          status,
          error: `Event node must have otel.scope specified. Scope defines which instrumentation library emits this event (e.g., "terminal-activity", "auth"). Document scopes in your .scopes.canvas file with otel-scope nodes.`,
        });
      }
    }
  }

  return { statusBreakdown, errors };
}

/**
 * Analyze instrumentation for a single file
 */
async function analyzeFileInstrumentation(
  filePath: string,
  expectedEvents: string[],
  fileReader: (path: string) => Promise<string>,
  isImplFile: boolean
): Promise<FileInstrumentation> {
  const foundEvents: string[] = [];

  for (const eventName of expectedEvents) {
    const found = await fileContainsEvent(filePath, eventName, fileReader);
    if (found) {
      foundEvents.push(eventName);
    }
  }

  const missingEvents = expectedEvents.filter(e => !foundEvents.includes(e));

  return {
    filePath,
    expectedEvents,
    foundEvents,
    instrumentationCount: foundEvents.length,
    hasInstrumentation: foundEvents.length > 0,
    missingEvents,
    isImplementationFile: isImplFile,
  };
}

/**
 * Get implementation files using codebase-composition's ImplementationFileLayerModule
 * This provides accurate detection with framework-awareness and package boundaries
 */
async function getImplementationFilesFromLayer(
  fileTree: FileTree
): Promise<{ files: Set<string>; layers: ImplementationFileLayer[] }> {
  // Detect packages
  const packageModule = new PackageLayerModule();
  const packageLayers = await packageModule.discoverPackages(fileTree);

  // Get implementation files per package
  const implModule = new ImplementationFileLayerModule();
  const implLayers = implModule.createImplementationFileLayers(packageLayers, fileTree);

  // Flatten to set of file paths
  const files = new Set<string>();
  for (const layer of implLayers) {
    for (const file of layer.implementationData.implementationFiles) {
      files.add(file);
    }
  }

  return { files, layers: implLayers };
}

/**
 * Generate telemetry coverage report from canvas files
 *
 * Uses codebase-composition's ImplementationFileLayerModule for accurate,
 * framework-aware detection of implementation files.
 *
 * @param fileTree - FileTree representation of the codebase
 * @param fileReader - Function to read file contents
 * @returns Coverage metrics based on file instrumentation
 *
 * @example
 * ```typescript
 * import { FilesystemService, NodeFileSystemAdapter } from '@principal-ai/codebase-composition/node';
 * import { readFile } from 'fs/promises';
 * import { resolve } from 'path';
 *
 * const service = new FilesystemService(new NodeFileSystemAdapter());
 * const fileTree = await service.buildFileSystemTreeFromPath('/path/to/project');
 * const fileReader = async (path: string) => readFile(resolve('/path/to/project', path), 'utf-8');
 * const metrics = await analyzeCoverage(fileTree, fileReader);
 * ```
 */
export async function analyzeCoverage(
  fileTree: FileTree,
  fileReader: (path: string) => Promise<string>
): Promise<CoverageMetrics> {
  // Use CanvasDiscovery to find all canvas files
  const discovery = new CanvasDiscovery();
  const result = await discovery.discover(fileTree, {
    fileReader,
    includeContent: true, // Need content to parse nodes
  });

  // Filter for .otel.canvas files only
  const otelCanvases = result.canvases.filter(c => c.type === 'otel') as DiscoveredCanvasWithContent[];

  // Validate nodes and collect status breakdown
  const { statusBreakdown, errors } = validateNodes(otelCanvases);

  // Build map of file -> expected events from canvas (only implemented nodes)
  const fileEventMap = await buildFileEventMap(otelCanvases);

  // Get all implementation files from the codebase using implementation layer
  const { files: implementationFiles, layers: implLayers } = await getImplementationFilesFromLayer(fileTree);

  // Get all files referenced in canvas (for coverage denominator)
  const referencedFiles = new Set(fileEventMap.keys());

  // Combine: we want to check all files referenced in canvas that are also implementation files
  const filesToCheck = new Set(
    [...referencedFiles].filter(f => implementationFiles.has(f))
  );

  // Analyze each file
  const fileCoverage: FileInstrumentation[] = [];

  for (const filePath of filesToCheck) {
    const expectedEvents = Array.from(fileEventMap.get(filePath) || []);
    const coverage = await analyzeFileInstrumentation(
      filePath,
      expectedEvents,
      fileReader,
      implementationFiles.has(filePath)
    );
    fileCoverage.push(coverage);
  }

  // Calculate metrics
  const filesWithInstrumentation = fileCoverage.filter(f => f.hasInstrumentation).length;
  const totalImplementationFiles = filesToCheck.size;
  const coveragePercentage = totalImplementationFiles > 0
    ? (filesWithInstrumentation / totalImplementationFiles) * 100
    : 0;

  const totalExpectedEvents = fileCoverage.reduce((sum, f) => sum + f.expectedEvents.length, 0);
  const totalFoundEvents = fileCoverage.reduce((sum, f) => sum + f.foundEvents.length, 0);

  // Calculate per-package metrics
  const packageCoverage: PackageCoverageMetrics[] = implLayers.map(layer => {
    const packageFiles = new Set(layer.implementationData.implementationFiles);
    const packageInstrumented = fileCoverage.filter(f =>
      packageFiles.has(f.filePath) && f.hasInstrumentation
    );

    return {
      packageName: layer.implementationData.packageName,
      packagePath: layer.implementationData.packagePath,
      totalFiles: layer.implementationData.fileCount,
      filesWithInstrumentation: packageInstrumented.length,
      coveragePercentage:
        layer.implementationData.fileCount > 0
          ? (packageInstrumented.length / layer.implementationData.fileCount) * 100
          : 0,
      filesByExtension: layer.implementationData.filesByExtension || {},
    };
  });

  return {
    totalImplementationFiles,
    filesWithInstrumentation,
    coveragePercentage,
    fileCoverage,
    canvasFiles: otelCanvases.map(c => c.path),
    totalExpectedEvents,
    totalFoundEvents,
    packageCoverage,
    nodeStatus: statusBreakdown,
    validationErrors: errors,
  };
}
