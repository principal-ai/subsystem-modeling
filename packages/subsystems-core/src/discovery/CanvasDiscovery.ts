/**
 * Unified discovery system for canvas and execution files in a package-aware way
 */

import type { FileTree, GitStatusWithFiles } from '@principal-ai/repository-abstraction';
import { PackageLayerModule, type PackageLayer } from '@principal-ai/codebase-composition';
import type {
  DiscoveredCanvas,
  DiscoveredCanvasWithContent,
  DiscoveredTestTrace,
  DiscoveredTestTraceWithContent,
  DiscoveredWorkflow,
  DiscoveredWorkflowWithContent,
  DiscoveredStoryboard,
  DiscoveredStoryboardWithContent,
  DiscoveredDashboard,
  DiscoveredDashboardWithContent,
  CanvasDiscoveryResult,
  DiscoveryOptions,
  CanvasType,
  ReferencedSpan,
} from './types';
import { deriveWorkflowEdges } from '../workflow/edge-derivation';
import type { ExtendedCanvas } from '../types/canvas';
import { isOtelSpanConventionNode, isOtelScopeNode } from '../types/canvas';
import { OtelCanvasValidator } from '../validation/OtelCanvasValidator';

/** Info about a span convention extracted from spans.canvas */
interface SpanInfo {
  /** Display label from spans.canvas node label field */
  label?: string;
  /** Instrumentation scope from spans.canvas node otel.scope field */
  scope?: string;
}

/** Lookup map from span pattern to span info (label, scope) */
type SpanLookup = Map<string, SpanInfo>;

/** Lookup map from scope name to display label */
type ScopeLabelLookup = Map<string, string>;

/**
 * Unified discovery system for canvas and execution files in a package-aware way
 *
 * @example
 * // Basic usage without content parsing
 * const discovery = new CanvasDiscovery();
 * const result = await discovery.discover(fileTree);
 *
 * @example
 * // With content parsing (CLI)
 * const result = await discovery.discover(fileTree, {
 *   fileReader: async (path) => fs.promises.readFile(path, 'utf-8'),
 *   includeContent: true
 * });
 *
 * @example
 * // With content parsing (panels)
 * const result = await discovery.discover(fileTree, {
 *   fileReader: async (path) => context.getSlice('fileCache').read(path),
 *   includeContent: true
 * });
 */
export class CanvasDiscovery {
  private static readonly CANVAS_DIR = '.principal-views';
  private static readonly WORKFLOW_EXTENSION = '.workflow.json';
  private static readonly DASHBOARD_EXTENSION = '.dashboard.json';

  private packageModule: PackageLayerModule;
  private packageCache: Map<string, PackageLayer[]> = new Map();

  constructor() {
    this.packageModule = new PackageLayerModule();
  }

  /**
   * Build a lookup map from span pattern to span info from spans.canvas files
   *
   * @param canvases - Discovered canvases (must include content for spans.canvas)
   * @returns Map of spanPattern → { label?, scope? }
   */
  private buildSpanLookup(
    canvases: (DiscoveredCanvas | DiscoveredCanvasWithContent)[]
  ): SpanLookup {
    const lookup: SpanLookup = new Map();

    for (const canvas of canvases) {
      // Only process spans.canvas files with content
      if (canvas.type !== 'spans') continue;

      const canvasWithContent = canvas as DiscoveredCanvasWithContent;
      const content = canvasWithContent.content as ExtendedCanvas | undefined;
      if (!content?.nodes) continue;

      // Extract span patterns, labels, and scopes from otel-span-convention nodes
      for (const node of content.nodes) {
        if (isOtelSpanConventionNode(node)) {
          const spanPattern = node.otel?.spanPattern;
          if (spanPattern) {
            lookup.set(spanPattern, {
              label: node.label,
              scope: node.otel?.scope,
            });
          }
        }
      }
    }

    return lookup;
  }

  /**
   * Build a lookup map from scope name to display label from scopes.canvas files
   *
   * @param canvases - Discovered canvases (must include content for scopes.canvas)
   * @returns Map of scopeName → label
   */
  private buildScopeLabelLookup(
    canvases: (DiscoveredCanvas | DiscoveredCanvasWithContent)[]
  ): ScopeLabelLookup {
    const lookup: ScopeLabelLookup = new Map();

    for (const canvas of canvases) {
      // Only process scopes.canvas files with content
      if (canvas.type !== 'scopes') continue;

      const canvasWithContent = canvas as DiscoveredCanvasWithContent;
      const content = canvasWithContent.content as ExtendedCanvas | undefined;
      if (!content?.nodes) continue;

      // Extract scope names and labels from otel-scope nodes
      for (const node of content.nodes) {
        if (isOtelScopeNode(node)) {
          const scopeName = node.otel.scope;
          const label = node.label;
          if (scopeName && label) {
            lookup.set(scopeName, label);
          }
        }
      }
    }

    return lookup;
  }

  /**
   * Discover all canvas, workflow, and test trace files in the file tree
   *
   * @param fileTree - FileTree from repository-abstraction
   * @param options - Discovery options (fileReader, includeContent)
   * @returns Discovery result with canvases, testTraces, storyboards, and errors
   */
  async discover(
    fileTree: FileTree,
    options: DiscoveryOptions = {}
  ): Promise<CanvasDiscoveryResult> {
    const errors: Array<{ path: string; error: string }> = [];
    const warnings: Array<{ path: string; message: string; type: 'deprecation' }> = [];

    // 1. Discover packages (with caching by fileTree.sha)
    const packages = await this.discoverPackagesWithCache(fileTree, options.fileReader);

    // 2. Build package lookup map for efficient path matching
    const packageMap = this.buildPackageMap(packages);

    // 3. Discover canvas files
    const canvases = await this.discoverCanvasFiles(fileTree, packageMap, options, errors);

    // 3.5. Build span lookup from spans.canvas files (for enriching workflow referencedSpans with labels and scopes)
    const spanLookup = this.buildSpanLookup(canvases);

    // 3.6. Build scope label lookup from scopes.canvas files (for resolving scope display names)
    const scopeLabelLookup = this.buildScopeLabelLookup(canvases);

    // 4. Discover storyboards (hierarchical organization)
    // Note: Test traces are discovered as part of workflows, not separately
    const storyboards = await this.discoverStoryboards(fileTree, packageMap, canvases, options, errors, spanLookup, scopeLabelLookup);

    // 5. Collect all test traces from workflows for backward compatibility
    const testTraces: (DiscoveredTestTrace | DiscoveredTestTraceWithContent)[] = [];
    for (const storyboard of storyboards) {
      for (const workflow of storyboard.workflows) {
        testTraces.push(...workflow.testTraces);
      }
    }

    // 6. Discover dashboard files from .principal-views/dashboards/
    const dashboards = await this.discoverDashboards(fileTree, packageMap, options, errors);

    // 7. Detect legacy flat canvas structures and add deprecation errors
    this.detectLegacyStructures(canvases, storyboards, errors);

    // 8. Validate required canvas types
    this.validateRequiredCanvases(canvases, storyboards, errors);

    // 8.5. Validate scope hierarchy (when content is loaded)
    if (options.includeContent) {
      this.validateScopeHierarchy(storyboards, spanLookup, scopeLabelLookup, errors);
    }

    // 9. Sort results
    canvases.sort(this.compareByPackageThenName);
    testTraces.sort(this.compareByPackageThenName);
    storyboards.sort(this.compareByPackageThenName);
    dashboards.sort(this.compareByPackageThenName);

    return { canvases, testTraces, storyboards, dashboards, errors, warnings };
  }

  /**
   * Clear package cache (useful when file tree changes)
   */
  clearCache(): void {
    this.packageCache.clear();
  }

  /**
   * Check if a file path is relevant to canvas discovery
   * Uses package-aware path matching for .principal-views directories
   */
  isRelevantPath(path: string): boolean {
    // Canvas files (.canvas, .otel.canvas)
    if (this.isInCanvasDir(path) && this.parseCanvasPath(path)) {
      return true;
    }
    // Workflow files (.workflow.json) in .principal-views
    if (path.includes(CanvasDiscovery.CANVAS_DIR) && path.endsWith(CanvasDiscovery.WORKFLOW_EXTENSION)) {
      return true;
    }
    // Dashboard files (.dashboard.json) in .principal-views
    if (path.includes(CanvasDiscovery.CANVAS_DIR) && path.endsWith(CanvasDiscovery.DASHBOARD_EXTENSION)) {
      return true;
    }
    // Test trace files (.otel.json) in .principal-views
    if (path.includes(CanvasDiscovery.CANVAS_DIR) && path.endsWith('.otel.json')) {
      return true;
    }
    return false;
  }

  /**
   * Get all file paths in the FileTree that are relevant to canvas discovery
   * Uses package-aware path matching (respects packages/\*\/.principal-views/ etc.)
   *
   * @param fileTree - FileTree from repository-abstraction
   * @returns Set of relevant file paths
   */
  getRelevantPaths(fileTree: FileTree): Set<string> {
    const paths = new Set<string>();

    for (const file of fileTree.allFiles) {
      const path = file.relativePath || file.path || '';
      if (this.isRelevantPath(path)) {
        paths.add(path);
      }
    }

    return paths;
  }

  /**
   * Filter git status to only include changes relevant to canvas discovery
   *
   * For existing/modified/deleted files: filters to paths in the current FileTree's relevant paths
   * For new/untracked files: checks if they match discovery patterns (could be new canvas files)
   *
   * @param fileTree - FileTree from repository-abstraction
   * @param gitStatus - Git status with file lists
   * @returns Filtered git status containing only relevant changes, or null if no relevant changes
   */
  filterRelevantGitChanges(
    fileTree: FileTree,
    gitStatus: GitStatusWithFiles
  ): GitStatusWithFiles | null {
    const relevantPaths = this.getRelevantPaths(fileTree);

    // For existing files: filter to paths we know about
    const filterExisting = (paths: string[]) =>
      paths.filter(p => relevantPaths.has(p));

    // For new/untracked files: check if they match discovery patterns
    const filterNew = (paths: string[]) =>
      paths.filter(p => this.isRelevantPath(p));

    const filtered: GitStatusWithFiles = {
      ...gitStatus,
      modifiedFiles: filterExisting(gitStatus.modifiedFiles),
      stagedFiles: filterNew(gitStatus.stagedFiles),
      untrackedFiles: filterNew(gitStatus.untrackedFiles),
      deletedFiles: filterExisting(gitStatus.deletedFiles),
      createdFiles: filterNew(gitStatus.createdFiles || []),
    };

    // Return null if no relevant changes
    const hasChanges =
      filtered.modifiedFiles.length > 0 ||
      filtered.stagedFiles.length > 0 ||
      filtered.untrackedFiles.length > 0 ||
      filtered.deletedFiles.length > 0 ||
      filtered.createdFiles.length > 0;

    return hasChanges ? filtered : null;
  }

  /**
   * Discover storyboards (hierarchical organization of canvas + workflows + executions)
   */
  private async discoverStoryboards(
    fileTree: FileTree,
    packageMap: Map<string, PackageLayer>,
    canvases: DiscoveredCanvas[],
    options: DiscoveryOptions,
    errors: Array<{ path: string; error: string }>,
    spanLookup: SpanLookup,
    scopeLabelLookup: ScopeLabelLookup
  ): Promise<(DiscoveredStoryboard | DiscoveredStoryboardWithContent)[]> {
    const storyboards: (DiscoveredStoryboard | DiscoveredStoryboardWithContent)[] = [];

    // Build a map of directories to check for storyboards
    const storyboardDirs = new Map<string, Set<string>>();

    // Find all directories in .principal-views/ that have subdirectories
    for (const file of fileTree.allFiles) {
      const path = file.relativePath || file.path || '';
      const parts = path.split('/');

      // Look for paths like: .principal-views/storyboard-name/workflow-name/...
      // Or: packages/subsystems-core/.principal-views/storyboard-name/workflow-name/...
      const pvIndex = parts.indexOf(CanvasDiscovery.CANVAS_DIR);
      if (pvIndex === -1 || parts.length < pvIndex + 3) continue;

      const storyboardName = parts[pvIndex + 1];
      const storyboardPath = parts.slice(0, pvIndex + 2).join('/');

      if (!storyboardDirs.has(storyboardPath)) {
        storyboardDirs.set(storyboardPath, new Set());
      }
      storyboardDirs.get(storyboardPath)!.add(storyboardName);
    }

    // For each potential storyboard directory, check if it has a canvas
    for (const [storyboardPath, storyboardNames] of storyboardDirs) {
      for (const storyboardName of storyboardNames) {
        // Skip __executions__ directory (legacy pattern, should not exist)
        if (storyboardName === '__executions__') continue;

        // Find canvas for this storyboard
        const storyboardCanvas = canvases.find(c => {
          const canvasDir = c.path.split('/').slice(0, -1).join('/');
          return canvasDir === storyboardPath && c.basename === storyboardName;
        });

        if (!storyboardCanvas) continue;

        // This is a storyboard! Now discover workflows
        const workflows = await this.discoverWorkflowsInStoryboard(
          fileTree,
          storyboardPath,
          storyboardName,
          packageMap,
          options,
          spanLookup,
          scopeLabelLookup,
          errors
        );

        // Determine package context
        const packageInfo = this.findPackageForPath(storyboardPath, packageMap);

        // Generate unique ID
        const id = packageInfo
          ? `${packageInfo.packageData.name}/${storyboardName}`
          : storyboardName;

        // Create discovered storyboard
        const storyboard: DiscoveredStoryboard | DiscoveredStoryboardWithContent = {
          id,
          name: this.toDisplayName(storyboardName),
          path: storyboardPath,
          basename: storyboardName,
          canvas: storyboardCanvas,
          workflows,
          packageName: packageInfo?.packageData.name,
          packagePath: packageInfo?.packageData.path,
          scope: packageInfo ? 'package' : 'root',
        };

        storyboards.push(storyboard);
      }
    }

    // Add standalone canvas files (flat structure without workflows)
    // These are typically .canvas files used for documentation/architecture diagrams
    const storyboardCanvasIds = new Set(storyboards.map(s => s.canvas.id));

    for (const canvas of canvases) {
      // Skip if already part of a hierarchical storyboard
      if (storyboardCanvasIds.has(canvas.id)) continue;

      // Check if canvas is in flat structure (.principal-views/file.canvas)
      const canvasDir = canvas.path.split('/').slice(0, -1).join('/');
      const parts = canvasDir.split('/');
      const pvIndex = parts.indexOf(CanvasDiscovery.CANVAS_DIR);

      // Only include flat .canvas files (for documentation)
      // Exclude .otel.canvas files which must use storyboard structure
      if (pvIndex !== -1 && parts.length === pvIndex + 1 && canvas.type !== 'otel') {
        const packageInfo = this.findPackageForPath(canvas.path, packageMap);

        // Create a standalone storyboard with no workflows
        const storyboard: DiscoveredStoryboard | DiscoveredStoryboardWithContent = {
          id: canvas.id,
          name: canvas.name,
          path: canvasDir,
          basename: canvas.basename,
          canvas: canvas,
          workflows: [], // No workflows for standalone canvases
          packageName: packageInfo?.packageData.name,
          packagePath: packageInfo?.packageData.path,
          scope: packageInfo ? 'package' : 'root',
        };

        storyboards.push(storyboard);
      }
    }

    return storyboards;
  }

  /**
   * Discover workflows within a storyboard folder
   */
  private async discoverWorkflowsInStoryboard(
    fileTree: FileTree,
    storyboardPath: string,
    storyboardName: string,
    packageMap: Map<string, PackageLayer>,
    options: DiscoveryOptions,
    spanLookup: SpanLookup,
    scopeLabelLookup: ScopeLabelLookup,
    errors: Array<{ path: string; error: string }>
  ): Promise<(DiscoveredWorkflow | DiscoveredWorkflowWithContent)[]> {
    const workflows: (DiscoveredWorkflow | DiscoveredWorkflowWithContent)[] = [];

    // Find all workflow files in this storyboard
    for (const file of fileTree.allFiles) {
      const path = file.relativePath || file.path || '';

      // Check if file is in this storyboard
      if (!path.startsWith(storyboardPath + '/')) continue;

      // Check if it's a workflow file
      if (!path.endsWith(CanvasDiscovery.WORKFLOW_EXTENSION)) continue;

      // Extract workflow info
      const filename = path.split('/').pop();
      if (!filename) continue;

      const basename = filename.replace(CanvasDiscovery.WORKFLOW_EXTENSION, '');
      const workflowDir = path.split('/').slice(0, -1).join('/');

      // Determine package context
      const packageInfo = this.findPackageForPath(path, packageMap);

      // Generate unique ID (basename only - storyboard context is in storyboardId)
      const id = basename;

      // Discover test traces co-located in the same directory as workflow.json
      const workflowTestTraces = await this.discoverTestTracesInWorkflowDir(
        fileTree,
        workflowDir,
        packageMap,
        options,
        errors
      );

      // Create discovered workflow
      let workflow: DiscoveredWorkflow | DiscoveredWorkflowWithContent = {
        id,
        name: this.toDisplayName(basename),
        path,
        basename,
        storyboardId: packageInfo
          ? `${packageInfo.packageData.name}/${storyboardName}`
          : storyboardName,
        packageName: packageInfo?.packageData.name,
        packagePath: packageInfo?.packageData.path,
        scope: packageInfo ? 'package' : 'root',
        testTraces: workflowTestTraces,
      };

      // Optionally load content
      if (options.includeContent && options.fileReader) {
        try {
          const content = await options.fileReader(path);
          const parsedContent = JSON.parse(content);

          // Extract referenced spans from workflow content
          const edgeResult = deriveWorkflowEdges(parsedContent, path);

          // Convert span patterns to ReferencedSpan objects with labels and scopes
          const referencedSpans: ReferencedSpan[] = edgeResult.referencedSpans.map(
            (pattern) => {
              const spanInfo = spanLookup.get(pattern);
              return {
                pattern,
                label: spanInfo?.label,
                scope: spanInfo?.scope,
              };
            }
          );

          // Derive workflow instrumentation scope from rootSpan's scope
          const rootSpan = parsedContent.rootSpan as string | undefined;
          const rootSpanInfo = rootSpan ? spanLookup.get(rootSpan) : undefined;
          const instrumentationScope = rootSpanInfo?.scope;
          const instrumentationScopeLabel = instrumentationScope
            ? scopeLabelLookup.get(instrumentationScope)
            : undefined;

          workflow = {
            ...workflow,
            content: parsedContent,
            referencedSpans,
            instrumentationScope,
            instrumentationScopeLabel,
          } as DiscoveredWorkflowWithContent;
        } catch (error) {
          errors.push({
            path,
            error: `Failed to parse workflow content: ${(error as Error).message}`,
          });
        }
      }

      workflows.push(workflow);
    }

    return workflows;
  }

  /**
   * Discover execution files co-located in a workflow directory
   */
  private async discoverTestTracesInWorkflowDir(
    fileTree: FileTree,
    workflowDir: string,
    packageMap: Map<string, PackageLayer>,
    options: DiscoveryOptions,
    errors: Array<{ path: string; error: string }>
  ): Promise<(DiscoveredTestTrace | DiscoveredTestTraceWithContent)[]> {
    const testTraces: (DiscoveredTestTrace | DiscoveredTestTraceWithContent)[] = [];

    // Find all .otel.json files in the workflow directory
    for (const file of fileTree.allFiles) {
      const path = file.relativePath || file.path || '';

      // Check if file is in this workflow directory
      const fileDir = path.split('/').slice(0, -1).join('/');
      if (fileDir !== workflowDir) continue;

      // Check if it's a test trace file (.otel.json)
      if (!path.endsWith('.otel.json')) {
        continue;
      }

      // Extract test trace metadata
      const filename = path.split('/').pop();
      if (!filename) continue;

      const basename = filename.replace('.otel.json', '');

      // Determine package context
      const packageInfo = this.findPackageForPath(path, packageMap);

      // Generate unique ID (workflow-scoped)
      const workflowBasename = workflowDir.split('/').pop() || '';
      const id = packageInfo
        ? `${packageInfo.packageData.name}/${workflowBasename}/${basename}`
        : `${workflowBasename}/${basename}`;

      // Create discovered test trace
      let testTrace: DiscoveredTestTrace | DiscoveredTestTraceWithContent = {
        id,
        name: this.toDisplayName(basename),
        path,
        basename,
        type: 'otel',
        canvasBasename: basename, // For backward compatibility
        packageName: packageInfo?.packageData.name,
        packagePath: packageInfo?.packageData.path,
        scope: packageInfo ? 'package' : 'root',
      };

      // Optionally load content
      if (options.includeContent && options.fileReader) {
        try {
          const content = await options.fileReader(path);
          testTrace = { ...testTrace, content: JSON.parse(content) } as DiscoveredTestTraceWithContent;
        } catch (error) {
          errors.push({
            path,
            error: `Failed to parse test trace content: ${(error as Error).message}`,
          });
        }
      }

      testTraces.push(testTrace);
    }

    return testTraces;
  }

  /**
   * Discover packages with caching by fileTree SHA
   */
  private async discoverPackagesWithCache(
    fileTree: FileTree,
    fileReader?: (path: string) => Promise<string>
  ): Promise<PackageLayer[]> {
    const cacheKey = fileTree.sha;

    if (this.packageCache.has(cacheKey)) {
      return this.packageCache.get(cacheKey)!;
    }

    const packages = await this.packageModule.discoverPackages(fileTree, fileReader);
    this.packageCache.set(cacheKey, packages);

    return packages;
  }

  /**
   * Build package lookup map for efficient path matching
   */
  private buildPackageMap(packages: PackageLayer[]): Map<string, PackageLayer> {
    const map = new Map<string, PackageLayer>();

    for (const pkg of packages) {
      // Normalize package path for lookup (replace backslashes with forward slashes)
      const normalizedPath = pkg.packageData.path.replace(/\\/g, '/');
      map.set(normalizedPath, pkg);
    }

    return map;
  }

  /**
   * Discover canvas files in the file tree
   */
  private async discoverCanvasFiles(
    fileTree: FileTree,
    packageMap: Map<string, PackageLayer>,
    options: DiscoveryOptions,
    errors: Array<{ path: string; error: string }>
  ): Promise<DiscoveredCanvas[]> {
    const canvases: DiscoveredCanvas[] = [];

    for (const file of fileTree.allFiles) {
      const path = file.relativePath || file.path || '';

      // Check if in .principal-views directory
      if (!this.isInCanvasDir(path)) continue;

      // Extract canvas metadata
      const metadata = this.parseCanvasPath(path);
      if (!metadata) continue;

      // Determine package context
      const packageInfo = this.findPackageForPath(path, packageMap);

      // Generate unique ID
      // Include canvas type suffix for non-regular types to avoid collisions
      // e.g., "architecture" vs "architecture.scopes"
      const idSuffix = metadata.type !== 'regular' ? `.${metadata.type}` : '';
      const id = packageInfo
        ? `${packageInfo.packageData.name}/${metadata.basename}${idSuffix}`
        : `${metadata.basename}${idSuffix}`;

      // Create discovered canvas
      const canvas: DiscoveredCanvas = {
        id,
        name: this.toDisplayName(metadata.basename),
        path,
        basename: metadata.basename,
        type: metadata.type,
        packageName: packageInfo?.packageData.name,
        packagePath: packageInfo?.packageData.path,
        scope: packageInfo ? 'package' : 'root',
      };

      // Optionally load content
      if (options.includeContent && options.fileReader) {
        try {
          const content = await options.fileReader(path);
          const parsedContent = JSON.parse(content);

          // Cast to DiscoveredCanvasWithContent when adding content
          const canvasWithContent = canvas as DiscoveredCanvasWithContent;
          canvasWithContent.content = parsedContent;

          // Validate OTEL canvas nodes for explicit color usage (only for .otel.canvas files)
          if (metadata.type === 'otel') {
            const otelValidator = new OtelCanvasValidator();
            const violations = otelValidator.validate(parsedContent, path);

            for (const violation of violations) {
              errors.push({
                path: violation.file,
                error: `[${violation.ruleId}] ${violation.message}. ${violation.impact} ${violation.suggestion}`,
              });
            }
          }

          // Extract markdown path from canvas metadata if it exists
          if (parsedContent.markdown) {
            canvas.markdownPath = parsedContent.markdown;
          }
        } catch (error) {
          errors.push({
            path,
            error: `Failed to parse canvas content: ${(error as Error).message}`,
          });
        }
      }

      canvases.push(canvas);
    }

    return canvases;
  }

  /**
   * Discover execution files in the file tree
   */
  /**
   * Check if path is in .principal-views directory
   * Supports both flat (.principal-views/file.canvas) and hierarchical (.principal-views/storyboard/file.canvas) structures
   */
  private isInCanvasDir(path: string): boolean {
    const parts = path.split('/');

    // Root flat: .principal-views/file.canvas (2 parts)
    if (parts[0] === CanvasDiscovery.CANVAS_DIR && parts.length === 2) {
      return true;
    }

    // Root hierarchical: .principal-views/storyboard/file.canvas (3 parts)
    if (parts[0] === CanvasDiscovery.CANVAS_DIR && parts.length === 3) {
      return true;
    }

    // Package structures
    if (parts.includes(CanvasDiscovery.CANVAS_DIR)) {
      const idx = parts.indexOf(CanvasDiscovery.CANVAS_DIR);
      // Package flat: packages/subsystems-core/.principal-views/file.canvas (idx + 2 parts)
      // Package hierarchical: packages/subsystems-core/.principal-views/storyboard/file.canvas (idx + 3 parts)
      return parts.length === idx + 2 || parts.length === idx + 3;
    }

    return false;
  }

  /**
   * Parse canvas file path to extract metadata
   */
  private parseCanvasPath(path: string): { basename: string; type: CanvasType } | null {
    const filename = path.split('/').pop();
    if (!filename) return null;

    // Check for .scopes.canvas first (must come before .canvas check)
    if (filename.endsWith('.scopes.canvas')) {
      return {
        basename: filename.replace(/\.scopes\.canvas$/, ''),
        type: 'scopes',
      };
    }

    // Check for .resources.canvas (must come before .canvas check)
    if (filename.endsWith('.resources.canvas')) {
      return {
        basename: filename.replace(/\.resources\.canvas$/, ''),
        type: 'resources',
      };
    }

    // Check for .spans.canvas (must come before .canvas check)
    if (filename.endsWith('.spans.canvas')) {
      return {
        basename: filename.replace(/\.spans\.canvas$/, ''),
        type: 'spans',
      };
    }

    // Check for .events.canvas (must come before .canvas check)
    if (filename.endsWith('.events.canvas')) {
      return {
        basename: filename.replace(/\.events\.canvas$/, ''),
        type: 'events',
      };
    }

    // Check for .otel.canvas (must come before .canvas check)
    if (filename.endsWith('.otel.canvas')) {
      return {
        basename: filename.replace(/\.otel\.canvas$/, ''),
        type: 'otel',
      };
    }

    // Check for .canvas (but not .otel.canvas, .scopes.canvas, .resources.canvas, .spans.canvas, or .events.canvas)
    if (filename.endsWith('.canvas')) {
      const basename = filename.replace(/\.canvas$/, '');

      // Handle special case: files named exactly "resources.canvas" or "spans.canvas"
      // These are architecture canvases despite using .canvas extension
      if (basename === 'resources') {
        return { basename, type: 'resources' };
      }
      if (basename === 'spans') {
        return { basename, type: 'spans' };
      }
      if (basename === 'scopes') {
        return { basename, type: 'scopes' };
      }
      if (basename === 'events') {
        return { basename, type: 'events' };
      }

      return { basename, type: 'regular' };
    }

    return null;
  }

  /**
   * Find package for a given path using longest-path matching
   */
  private findPackageForPath(
    path: string,
    packageMap: Map<string, PackageLayer>
  ): PackageLayer | null {
    // Find the longest matching package path
    let bestMatch: PackageLayer | null = null;
    let bestMatchLength = 0;

    for (const [pkgPath, pkg] of packageMap) {
      if (path.startsWith(pkgPath + '/')) {
        if (pkgPath.length > bestMatchLength) {
          bestMatch = pkg;
          bestMatchLength = pkgPath.length;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Convert basename to display name (Title Case)
   */
  private toDisplayName(basename: string): string {
    return basename
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Sort by package then name
   */
  private compareByPackageThenName(
    a: DiscoveredCanvas | DiscoveredTestTrace | DiscoveredStoryboard | DiscoveredDashboard,
    b: DiscoveredCanvas | DiscoveredTestTrace | DiscoveredStoryboard | DiscoveredDashboard
  ): number {
    // Package files first, then root
    if (a.packageName && !b.packageName) return -1;
    if (!a.packageName && b.packageName) return 1;

    // If both have packages, sort by package name
    if (a.packageName && b.packageName) {
      const pkgCompare = a.packageName.localeCompare(b.packageName);
      if (pkgCompare !== 0) return pkgCompare;
    }

    // Within same package/root, sort by name
    return a.name.localeCompare(b.name);
  }

  /**
   * Validate required canvas types based on dependency chain:
   * - resources.canvas is required (foundation)
   * - spans.canvas is required when resources.canvas exists
   * - .otel.canvas is required when spans.canvas exists
   */
  private validateRequiredCanvases(
    canvases: DiscoveredCanvas[],
    storyboards: (DiscoveredStoryboard | DiscoveredStoryboardWithContent)[],
    errors: Array<{ path: string; error: string }>
  ): void {
    // Check canvas types by category
    const hasResourcesCanvas = canvases.some(c => c.type === 'resources');
    const hasSpansCanvas = canvases.some(c => c.type === 'spans');
    // Check for otel canvases specifically (not just any storyboard, since standalone canvases also create storyboards)
    const hasOtelCanvas = canvases.some(c => c.type === 'otel');

    // If no canvases at all, nothing to validate (no .principal-views directory)
    if (canvases.length === 0 && storyboards.length === 0) {
      return;
    }

    // 1. resources.canvas is required (foundation)
    if (!hasResourcesCanvas) {
      errors.push({
        path: '.principal-views',
        error:
          'Missing required resources.canvas: A resources canvas documenting OTEL resources and scopes is required. ' +
          'Create .principal-views/resources.canvas (or architecture.resources.canvas) with nodes showing service.name and instrumentation scopes.',
      });
      // Don't check further dependencies if foundation is missing
      return;
    }

    // 2. spans.canvas is required when resources.canvas exists
    if (!hasSpansCanvas) {
      errors.push({
        path: '.principal-views',
        error:
          'Missing required spans.canvas: When resources.canvas exists, a spans canvas documenting span conventions is required. ' +
          'Create .principal-views/architecture.spans.canvas with nodes for each span pattern (e.g., validate.*, http.request) and edges showing valid parent-child relationships.',
      });
      // Don't check further dependencies
      return;
    }

    // 3. .otel.canvas is required when spans.canvas exists
    if (!hasOtelCanvas) {
      errors.push({
        path: '.principal-views',
        error:
          'Missing required .otel.canvas: When spans.canvas exists, at least one feature-level OTEL canvas is required. ' +
          'Create a storyboard with an .otel.canvas file (e.g., .principal-views/my-feature/my-feature.otel.canvas) documenting events for a specific feature.',
      });
    }
  }

  /**
   * Discover dashboard files from .principal-views/dashboards/ folder
   */
  private async discoverDashboards(
    fileTree: FileTree,
    packageMap: Map<string, PackageLayer>,
    options: DiscoveryOptions,
    errors: Array<{ path: string; error: string }>
  ): Promise<(DiscoveredDashboard | DiscoveredDashboardWithContent)[]> {
    const dashboards: (DiscoveredDashboard | DiscoveredDashboardWithContent)[] = [];

    for (const file of fileTree.allFiles) {
      const path = file.relativePath || file.path || '';

      // Only look for .dashboard.json files in dashboards/ folder
      if (!path.endsWith(CanvasDiscovery.DASHBOARD_EXTENSION)) continue;

      // Must be in .principal-views/dashboards/ folder
      const parts = path.split('/');
      const pvIndex = parts.indexOf(CanvasDiscovery.CANVAS_DIR);
      if (pvIndex === -1) continue;

      // Check if it's in the dashboards/ folder (directly after .principal-views/)
      const nextPart = parts[pvIndex + 1];
      if (nextPart !== 'dashboards') continue;

      const filename = parts[parts.length - 1];
      const basename = filename.replace(/\.dashboard\.json$/, '');

      // Determine package context
      const packageInfo = this.findPackageForPath(path, packageMap);

      // Generate unique ID
      const id = packageInfo
        ? `${packageInfo.packageData.name}/${basename}`
        : basename;

      const dashboard: DiscoveredDashboard = {
        id,
        name: this.toDisplayName(basename),
        path,
        basename,
        packageName: packageInfo?.packageData.name,
        packagePath: packageInfo?.packageData.path,
        scope: packageInfo ? 'package' : 'root',
      };

      // Optionally load content
      if (options.includeContent && options.fileReader) {
        try {
          const content = await options.fileReader(path);
          const parsed = JSON.parse(content);
          (dashboard as DiscoveredDashboardWithContent).content = parsed;
        } catch (e) {
          errors.push({
            path,
            error: `Failed to parse dashboard: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }

      dashboards.push(dashboard);
    }

    return dashboards;
  }

  /**
   * Detect legacy flat canvas structures and add deprecation errors
   * Note: Flat .canvas and .scopes.canvas files are supported
   * Only .otel.canvas files in flat structure are deprecated
   */
  private detectLegacyStructures(
    canvases: DiscoveredCanvas[],
    storyboards: (DiscoveredStoryboard | DiscoveredStoryboardWithContent)[],
    errors: Array<{ path: string; error: string }>
  ): void {
    // Build a set of storyboard canvas IDs for quick lookup
    const storyboardCanvasIds = new Set(storyboards.map(s => s.canvas.id));

    // Check for legacy flat .otel.canvas files (not part of any storyboard)
    // Note: Flat .canvas and .scopes.canvas files are supported
    for (const canvas of canvases) {
      if (!storyboardCanvasIds.has(canvas.id)) {
        // This canvas is not part of any storyboard
        const canvasDir = canvas.path.split('/').slice(0, -1).join('/');
        const parts = canvasDir.split('/');
        const pvIndex = parts.indexOf(CanvasDiscovery.CANVAS_DIR);

        // Only error if it's a .otel.canvas file in flat structure
        // Regular .canvas and .scopes.canvas files in flat structure are supported
        if (pvIndex !== -1 && parts.length === pvIndex + 1 && canvas.type === 'otel') {
          errors.push({
            path: canvas.path,
            error: 'DEPRECATED: Flat .otel.canvas files are no longer supported. .otel.canvas files must use the storyboard structure (.principal-views/storyboard-name/storyboard-name.otel.canvas). For static documentation, use .canvas files instead.',
          });
        }
      }
    }
  }

  /**
   * Validate scope hierarchy for hierarchical filtering
   *
   * Validates:
   * 1. Workflow rootSpan exists in spans.canvas
   * 2. Span conventions have otel.scope defined
   * 3. Scope references exist in scopes.canvas (warning)
   */
  private validateScopeHierarchy(
    storyboards: (DiscoveredStoryboard | DiscoveredStoryboardWithContent)[],
    spanLookup: SpanLookup,
    scopeLabelLookup: ScopeLabelLookup,
    errors: Array<{ path: string; error: string }>
  ): void {
    // Track scopes that have been warned about (to avoid duplicate warnings)
    const warnedScopes = new Set<string>();

    for (const storyboard of storyboards) {
      // Only validate otel storyboards
      if (storyboard.canvas.type !== 'otel') continue;

      for (const workflow of storyboard.workflows) {
        const workflowWithContent = workflow as DiscoveredWorkflowWithContent;
        const content = workflowWithContent.content;
        if (!content) continue;

        const rootSpan = content.rootSpan as string | undefined;
        if (!rootSpan) continue;

        // 1. Validate rootSpan exists in spans.canvas
        const rootSpanInfo = spanLookup.get(rootSpan);
        if (!rootSpanInfo) {
          errors.push({
            path: workflow.path,
            error:
              `Workflow "${workflow.basename}" has rootSpan "${rootSpan}" but no matching span convention ` +
              `was found in spans.canvas. Add an otel-span-convention node with spanPattern: "${rootSpan}".`,
          });
          continue; // Skip further validation for this workflow
        }

        // 2. Validate span convention has otel.scope defined
        if (!rootSpanInfo.scope) {
          errors.push({
            path: workflow.path,
            error:
              `Span convention "${rootSpan}" in spans.canvas does not declare a scope. ` +
              `Add otel.scope to specify which instrumentation scope creates this span.`,
          });
          continue; // Skip further validation for this workflow
        }

        // 3. Warn if scope doesn't exist in scopes.canvas
        const scopeName = rootSpanInfo.scope;
        if (!scopeLabelLookup.has(scopeName) && !warnedScopes.has(scopeName)) {
          warnedScopes.add(scopeName);
          errors.push({
            path: workflow.path,
            error:
              `Span convention "${rootSpan}" references scope "${scopeName}" but no matching ` +
              `otel-scope node was found in scopes.canvas. Consider adding it for documentation.`,
          });
        }
      }
    }
  }
}
