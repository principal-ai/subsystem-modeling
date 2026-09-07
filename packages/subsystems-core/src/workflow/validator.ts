/**
 * Workflow Template Validator
 * Validates .workflow.json files against their corresponding .otel.canvas files
 */

import type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
import type { WorkflowTemplate, WorkflowScenario, ScenarioTemplate } from './types';
import { getEventTemplateString } from './types';
import type { ExtendedCanvas, OtelEventNode } from '../types/canvas';
import { isOtelEventNode } from '../types/canvas';
import { resolve, basename } from 'path';
import type { EventRegistry } from '../registry/EventRegistry';
import type { IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer/build/src/trace/internal-types';

// Type for deprecated scenario format (for migration detection)
interface DeprecatedScenario extends WorkflowScenario {
  condition?: unknown;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface WorkflowValidationContext {
  /** The workflow template being validated */
  workflow: WorkflowTemplate;

  /** Path to the workflow file */
  workflowPath: string;

  /** The canvas file (if found) */
  canvas?: ExtendedCanvas;

  /** Path to the canvas file */
  canvasPath?: string;

  /** Base path for resolving relative paths */
  basePath: string;

  /** Raw workflow content for line number lookup */
  rawContent?: string;

  /** Execution data for validating attribute references (optional) */
  executionData?: {
    /** Aggregated attributes available in templates */
    aggregates: Record<string, unknown>;
    /** Attributes grouped by event name */
    eventAttributes: Map<string, Record<string, unknown>>;
  };

  /**
   * Co-located execution files for validating template completeness.
   * Array of paths to .otel.json files in the same directory as the workflow.
   */
  executionFiles?: string[];

  /**
   * Optional: Events used across all workflows that reference this canvas.
   * When provided, coverage warnings are only emitted for canvas events
   * that are NOT in this set (i.e., truly unused across all workflows).
   * This enables multi-workflow canvas patterns where different workflows
   * cover different subsets of canvas events.
   */
  allWorkflowEvents?: Set<string>;

  /**
   * Optional: Registry of all events across the project.
   * When provided, enables enhanced error messages that show where
   * missing events are defined (in library or other canvases).
   */
  eventRegistry?: EventRegistry;

  /**
   * Optional: List of owned instrumentation scopes from library.yaml.
   * When provided, validates that workflow scope is in this list.
   */
  ownedScopes?: string[];
}

export interface WorkflowViolation {
  /** Rule ID that detected this violation */
  ruleId: string;

  /** Severity level */
  severity: 'error' | 'warn';

  /** File path */
  file: string;

  /** Line number (1-indexed) */
  line?: number;

  /** JSON path to the problematic field */
  path?: string;

  /** Clear error message */
  message: string;

  /** Explanation of impact */
  impact: string;

  /** Suggestion for fixing */
  suggestion?: string;

  /** Whether this can be auto-fixed */
  fixable: boolean;
}

export interface WorkflowValidationResult {
  /** All violations found */
  violations: WorkflowViolation[];

  /** Count of errors */
  errorCount: number;

  /** Count of warnings */
  warningCount: number;

  /** Count of fixable violations */
  fixableCount: number;
}

// ============================================================================
// Validator Implementation
// ============================================================================

export class WorkflowValidator {
  constructor(private fsAdapter: FileSystemAdapter) {}

  /**
   * Validate a workflow template
   */
  async validate(
    context: WorkflowValidationContext
  ): Promise<WorkflowValidationResult> {
    const violations: WorkflowViolation[] = [];

    // Run all validation rules
    violations.push(...(await this.checkSchema(context)));
    violations.push(...(await this.checkCanvasExists(context)));
    violations.push(...this.checkCanvasNodeLabels(context));
    violations.push(...this.checkCanvasCrossReference(context));
    violations.push(...this.checkDeprecatedFields(context));
    violations.push(...this.checkScenarios(context));
    violations.push(...this.checkScenarioSubsets(context));

    // Check event name syntax BEFORE checking event references
    // This ensures we catch unsupported syntax before trying to match events
    violations.push(...this.checkEventNameSyntax(context));

    // Only run canvas-dependent checks if canvas was loaded
    if (context.canvas) {
      violations.push(...this.checkEventReferences(context));
      violations.push(...this.checkAttributeReferences(context));
      violations.push(...this.checkEventConnectivity(context));
      violations.push(...this.checkEventAttributeRequirements(context));
      violations.push(...this.checkTemplateAttributesDefinedInSchema(context));
      violations.push(...this.checkScenarioScopeConsistency(context));
    }

    violations.push(...this.checkTemplateSyntax(context));
    violations.push(...this.checkConflictingAttributePaths(context));
    violations.push(...this.checkFormattingOptions(context));

    // Check execution data completeness if execution files are provided
    if (context.executionFiles && context.executionFiles.length > 0) {
      violations.push(...(await this.checkExecutionDataCompleteness(context)));
    }

    return this.aggregateResults(violations);
  }

  /**
   * Validate multiple workflows for duplicate spanPatterns
   *
   * This is a CLI-level validation that checks for conflicts across workflows.
   * Call this method after validating individual workflows.
   *
   * @param workflows Array of workflow templates with their file paths
   * @returns Array of violations for duplicate spanPatterns
   */
  static validateSpanPatterns(
    workflows: Array<{ workflow: WorkflowTemplate; workflowPath: string }>
  ): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const spanPatternMap = new Map<string, string[]>(); // spanPattern -> workflow paths

    // Collect all spanPatterns
    for (const { workflow, workflowPath } of workflows) {
      if (!workflow.spanPattern) {
        continue; // Will be caught by individual validation
      }

      if (!spanPatternMap.has(workflow.spanPattern)) {
        spanPatternMap.set(workflow.spanPattern, []);
      }
      spanPatternMap.get(workflow.spanPattern)!.push(workflowPath);
    }

    // Check for duplicates
    for (const [spanPattern, paths] of spanPatternMap.entries()) {
      if (paths.length > 1) {
        // Duplicate spanPattern found
        for (const path of paths) {
          const otherPaths = paths.filter(p => p !== path);
          violations.push({
            ruleId: 'workflow-span-pattern-duplicate',
            severity: 'error',
            file: path,
            path: 'spanPattern',
            message: `Duplicate spanPattern "${spanPattern}" found in multiple workflows`,
            impact: 'Multiple workflows cannot match the same span - this creates ambiguous workflow selection',
            suggestion: `This spanPattern is also used in:\n${otherPaths.map(p => `  - ${p}`).join('\n')}\n\nEach workflow must have a unique spanPattern. Consider:\n  - Using different span names (e.g., "payment.authorize" vs "payment.refund")\n  - Merging these workflows into one with multiple scenarios`,
            fixable: false,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check schema validity (required fields, valid values)
   */
  private async checkSchema(context: WorkflowValidationContext): Promise<WorkflowViolation[]> {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    // Valid fields at the workflow root level
    const validWorkflowFields = [
      'version',
      'canvas',
      'name',
      'description',
      'spanPattern',
      'scope',
      'files',
      'status',
      'scenarioSelection',
      'showLogsPerSpan',
      'scenarios',
      'formatting',
    ];

    // Check for unknown fields at workflow level
    const workflowRecord = workflow as unknown as Record<string, unknown>;
    const workflowKeys = Object.keys(workflowRecord);

    for (const key of workflowKeys) {
      if (!validWorkflowFields.includes(key)) {
        violations.push({
          ruleId: 'workflow-unknown-field',
          severity: 'error',
          file: workflowPath,
          path: key,
          message: `Unknown workflow field "${key}"`,
          impact: 'This field will be ignored and may indicate a misunderstanding of the schema',
          suggestion: `Valid workflow fields are: ${validWorkflowFields.join(', ')}. Remove the "${key}" field or check for typos.`,
          fixable: false,
        });
      }
    }

    // Check version
    if (!workflow.version) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'version',
        message: 'Missing required field "version"',
        impact: 'Cannot determine template version for compatibility',
        suggestion: 'Add a version field (e.g., "1.0.0")',
        fixable: false,
      });
    } else if (!this.isValidSemver(workflow.version)) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'version',
        message: `Invalid version format: "${workflow.version}"`,
        impact: 'Version must follow semver format',
        suggestion: 'Use semver format like "1.0.0"',
        fixable: false,
      });
    }

    // Check canvas reference
    if (!workflow.canvas) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'canvas',
        message: 'Missing required field "canvas"',
        impact: 'Cannot determine which canvas this workflow belongs to',
        suggestion: 'Add a canvas field pointing to an .otel.canvas file',
        fixable: false,
      });
    }

    // Check name
    if (!workflow.name) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'name',
        message: 'Missing required field "name"',
        impact: 'Cannot identify this workflow template',
        suggestion: 'Add a human-readable name',
        fixable: false,
      });
    }

    // Check description
    if (!workflow.description) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'description',
        message: 'Missing required field "description"',
        impact: 'Cannot understand the purpose of this workflow',
        suggestion: 'Add a description explaining what this workflow shows',
        fixable: false,
      });
    }

    // Check spanPattern
    if (!workflow.spanPattern) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'spanPattern',
        message: 'Missing required field "spanPattern"',
        impact: 'Cannot determine which spans this workflow applies to',
        suggestion: 'Add a spanPattern field specifying the exact span name (e.g., "payment.authorize")',
        fixable: false,
      });
    } else if (typeof workflow.spanPattern !== 'string' || workflow.spanPattern.trim() === '') {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'spanPattern',
        message: 'spanPattern must be a non-empty string',
        impact: 'Cannot match spans with invalid pattern',
        suggestion: 'Provide a valid span name (e.g., "payment.authorize", "checkout.process")',
        fixable: false,
      });
    } else if (workflow.spanPattern.includes('*')) {
      // Reject glob/wildcard patterns - only exact match is supported
      violations.push({
        ruleId: 'workflow-span-pattern-exact',
        severity: 'error',
        file: workflowPath,
        path: 'spanPattern',
        message: `spanPattern contains wildcard "*" which is not supported: "${workflow.spanPattern}"`,
        impact: 'Glob patterns create ambiguity when multiple workflows could match the same span',
        suggestion: 'Use an exact span name instead (e.g., "payment.authorize" not "payment.*")',
        fixable: false,
      });
    } else if (/[[\]{}^$|\\+?]/.test(workflow.spanPattern)) {
      // Reject regex special characters (except . which is common in span names, and () which appear in framework span names like Next.js)
      violations.push({
        ruleId: 'workflow-span-pattern-exact',
        severity: 'error',
        file: workflowPath,
        path: 'spanPattern',
        message: `spanPattern contains regex special characters which are not supported: "${workflow.spanPattern}"`,
        impact: 'Regex patterns are not supported - only exact span name matching is used',
        suggestion: 'Use an exact span name that matches your instrumented span (e.g., "GET /api/auth/me/route")',
        fixable: false,
      });
    }

    // Check scope against owned-scopes
    if (workflow.scope && context.ownedScopes && context.ownedScopes.length > 0) {
      if (!context.ownedScopes.includes(workflow.scope)) {
        violations.push({
          ruleId: 'workflow-scope-owned',
          severity: 'error',
          file: workflowPath,
          path: 'scope',
          message: `Scope "${workflow.scope}" is not in owned-scopes list`,
          impact: 'Spans from this scope will not be matched - the scope must be declared in library.yaml owned-scopes',
          suggestion: `Either:\n  - Add "${workflow.scope}" to owned-scopes in library.yaml\n  - Change scope to one of: ${context.ownedScopes.join(', ')}\n  - Remove scope if using a different tracer`,
          fixable: false,
        });
      }
    }

    // Check status value
    const validStatuses = ['draft', 'approved', 'implemented'];
    if (workflow.status && !validStatuses.includes(workflow.status)) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'status',
        message: `Invalid status: "${workflow.status}"`,
        impact: 'Status must be a valid lifecycle value',
        suggestion: `Use one of: ${validStatuses.join(', ')}`,
        fixable: false,
      });
    }

    // Check files requirement based on status
    const status = workflow.status || 'draft';
    if ((status === 'approved' || status === 'implemented') && (!workflow.files || workflow.files.length === 0)) {
      violations.push({
        ruleId: 'workflow-files-required',
        severity: 'error',
        file: workflowPath,
        path: 'files',
        message: `Status "${status}" requires files to be specified`,
        impact: 'Cannot validate implementation without knowing which files contain the span instrumentation',
        suggestion: 'Add a "files" array with the paths where this span is created (e.g., ["src/app/api/auth/me/route.ts"])',
        fixable: false,
      });
    }

    // Check files exist when status is implemented
    if (status === 'implemented' && workflow.files && workflow.files.length > 0) {
      for (const file of workflow.files) {
        const filePath = resolve(context.basePath, file);
        if (!(await this.fsAdapter.exists(filePath))) {
          violations.push({
            ruleId: 'workflow-files-exist',
            severity: 'error',
            file: workflowPath,
            path: 'files',
            message: `Implementation file not found: ${file}`,
            impact: 'Workflow is marked as implemented but the source file does not exist',
            suggestion: `Either:\n  - Create the file at ${file}\n  - Update the files array with the correct path\n  - Change status to "approved" or "draft"`,
            fixable: false,
          });
        }
      }
    }

    // Check scope requirement based on status
    if ((status === 'approved' || status === 'implemented') && !workflow.scope) {
      violations.push({
        ruleId: 'workflow-scope-required',
        severity: 'error',
        file: workflowPath,
        path: 'scope',
        message: `Status "${status}" requires scope to be specified`,
        impact: 'Cannot validate instrumentation scope without knowing which tracer emits this span',
        suggestion: 'Add a "scope" field with the instrumentation scope name (e.g., "terminal-activity", "auth")',
        fixable: false,
      });
    }

    // Check scenarioSelection
    const validSelections = ['first-match', 'manual'];
    if (workflow.scenarioSelection && !validSelections.includes(workflow.scenarioSelection)) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'scenarioSelection',
        message: `Invalid scenarioSelection: "${workflow.scenarioSelection}"`,
        impact: 'Scenario selection must be a valid type',
        suggestion: `Use one of: ${validSelections.join(', ')}`,
        fixable: false,
      });
    }

    // Check scenarios array
    if (!workflow.scenarios || !Array.isArray(workflow.scenarios)) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'scenarios',
        message: 'Missing or invalid "scenarios" field',
        impact: 'Cannot generate workflows without scenarios',
        suggestion: 'Add a scenarios array with at least one scenario',
        fixable: false,
      });
    } else if (workflow.scenarios.length === 0) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'scenarios',
        message: 'Scenarios array is empty',
        impact: 'Cannot generate workflows without scenarios',
        suggestion: 'Add at least one scenario definition',
        fixable: false,
      });
    }

    return violations;
  }

  /**
   * Check that the referenced canvas file exists
   */
  private async checkCanvasExists(context: WorkflowValidationContext): Promise<WorkflowViolation[]> {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath, basePath, canvasPath } = context;

    if (!workflow.canvas) {
      // Already flagged by checkSchema
      return violations;
    }

    // Resolve canvas path
    const resolvedPath = canvasPath || resolve(basePath, workflow.canvas);

    if (!(await this.fsAdapter.exists(resolvedPath))) {
      violations.push({
        ruleId: 'workflow-canvas-exists',
        severity: 'error',
        file: workflowPath,
        path: 'canvas',
        message: `Referenced canvas file does not exist: ${workflow.canvas}`,
        impact: 'Cannot validate event references without the canvas',
        suggestion: `Canvas paths must be relative to the repository root, not the workflow file. Use a path like ".principal-views/your-storyboard/canvas.otel.canvas" instead of relative paths like "../canvas.otel.canvas"`,
        fixable: false,
      });
    }

    return violations;
  }

  /**
   * Check OTEL node labels are meaningful (not equal to their IDs).
   * Labels should be human-readable display names, not technical identifiers.
   */
  private checkCanvasNodeLabels(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { canvas, canvasPath } = context;

    if (!canvas?.nodes || !canvasPath) {
      return violations;
    }

    // OTEL node types that require meaningful labels
    const otelNodeTypes = ['otel-event', 'otel-span-convention', 'otel-scope', 'otel-resource', 'otel-boundary'];

    for (const node of canvas.nodes) {
      // Check if it's an OTEL node type
      if (!otelNodeTypes.includes(node.type)) {
        continue;
      }

      // Get label from OTEL node (top-level field)
      const label = 'label' in node ? (node as { label?: string }).label : undefined;

      // Skip if no label defined
      if (!label) {
        continue;
      }

      // Check if label equals ID
      if (label === node.id) {
        violations.push({
          ruleId: 'canvas-node-label-meaningful',
          severity: 'warn',
          file: canvasPath,
          path: `nodes[${node.id}].label`,
          message: `Node "${node.id}" has label identical to its ID`,
          impact: 'Labels should be human-readable display names, not technical identifiers',
          suggestion: `Change the label to a human-readable name like "${this.idToHumanReadable(node.id)}"`,
          fixable: true,
        });
      }
    }

    return violations;
  }

  /**
   * Convert a dot-separated ID to a human-readable label.
   * E.g., "multi-canvas-panel.render" → "Multi Canvas Panel Render"
   */
  private idToHumanReadable(id: string): string {
    return id
      .split(/[-.]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Check if workflow references a canvas from a different storyboard folder.
   * Workflows should be co-located with their canvas in the same storyboard.
   */
  private checkCanvasCrossReference(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    if (!workflow.canvas) {
      return violations;
    }

    // Extract storyboard folder from workflow path
    // e.g., ".principal-views/task-management/task-workflow/task-complete.workflow.json"
    // -> storyboard is "task-management"
    const workflowStoryboard = this.extractStoryboardName(workflowPath);

    // Extract storyboard folder from canvas path
    // e.g., ".principal-views/cleanup-operations/cleanup-operations.otel.canvas"
    // -> storyboard is "cleanup-operations"
    const canvasStoryboard = this.extractStoryboardName(workflow.canvas);

    if (workflowStoryboard && canvasStoryboard && workflowStoryboard !== canvasStoryboard) {
      violations.push({
        ruleId: 'workflow-canvas-cross-reference',
        severity: 'error',
        file: workflowPath,
        path: 'canvas',
        message: `Workflow in "${workflowStoryboard}" references canvas from different storyboard "${canvasStoryboard}"`,
        impact: 'Cross-referencing canvases across storyboards makes it difficult to understand which workflows cover a canvas and fragments the storyboard organization',
        suggestion: `Create a canvas in the "${workflowStoryboard}" storyboard with the events this workflow needs. ` +
          `Duplicating events across canvases is acceptable - each storyboard should be self-contained. ` +
          `Move or copy the relevant event nodes to ".principal-views/${workflowStoryboard}/${workflowStoryboard}.otel.canvas"`,
        fixable: false,
      });
    }

    return violations;
  }

  /**
   * Extract storyboard name from a path within .principal-views
   * e.g., ".principal-views/task-management/task-workflow/file.json" -> "task-management"
   * e.g., ".principal-views/cleanup-operations/cleanup-operations.otel.canvas" -> "cleanup-operations"
   */
  private extractStoryboardName(filePath: string): string | null {
    const parts = filePath.split('/');
    const pvIndex = parts.indexOf('.principal-views');

    if (pvIndex === -1 || parts.length < pvIndex + 2) {
      return null;
    }

    // The storyboard name is the folder immediately after .principal-views
    return parts[pvIndex + 1];
  }

  /**
   * Check for deprecated fields (condition, condition.requires, etc.)
   */
  private checkDeprecatedFields(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    if (!workflow.scenarios || workflow.scenarios.length === 0) {
      return violations;
    }

    workflow.scenarios.forEach((scenario, idx) => {
      // Check if scenario has a 'condition' field
      const deprecatedScenario = scenario as DeprecatedScenario;
      if (deprecatedScenario.condition) {
        const condition = deprecatedScenario.condition as Record<string, unknown>;

        // Build list of what was in condition
        const conditionFields: string[] = [];
        if (condition.requires) conditionFields.push('requires');
        if (condition.excludes) conditionFields.push('excludes');
        if (condition.assertions) conditionFields.push('assertions');
        if (condition.default) conditionFields.push('default');
        if (condition.any) conditionFields.push('any');

        const fieldsDescription = conditionFields.length > 0
          ? ` (${conditionFields.join(', ')})`
          : '';

        violations.push({
          ruleId: 'workflow-deprecated-condition',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${idx}].condition`,
          message: `The "condition" field is no longer supported${fieldsDescription}`,
          impact: 'Required events are now automatically derived from template.events keys',
          suggestion: `Remove the "condition" field. Required events are inferred from template.events.\n\n` +
            `Migration:\n` +
            `  Before:\n` +
            `    {\n` +
            `      "condition": { "requires": ["event.a", "event.b"] },\n` +
            `      "template": { "events": { "event.a": "...", "event.b": "..." }}\n` +
            `    }\n\n` +
            `  After:\n` +
            `    {\n` +
            `      "template": { "events": { "event.a": "...", "event.b": "..." }}\n` +
            `    }\n\n` +
            `Simply remove the "condition" field - the same events should already be defined in "template.events".`,
          fixable: true,
        });
      }
    });

    return violations;
  }

  /**
   * Check that events referenced in templates exist in the canvas
   *
   * Note: This is currently a placeholder as canvas files don't yet define event schemas.
   * In the future, when canvas files include OTEL event schema definitions,
   * this will validate event references.
   */
  private checkEventReferences(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath, canvas } = context;

    if (!canvas || !canvas.nodes) {
      return violations;
    }

    // Extract all event names from canvas nodes (otel-event nodes only)
    const canvasEvents = new Set<string>();
    for (const node of canvas.nodes) {
      // Only process otel-event nodes
      if (isOtelEventNode(node)) {
        const otelEventNode = node as OtelEventNode;
        if (otelEventNode.event?.name) {
          canvasEvents.add(otelEventNode.event.name);
        } else if (otelEventNode.eventRef) {
          canvasEvents.add(otelEventNode.eventRef);
        }
      }
      // Legacy pv.event/pv.eventRef format is no longer supported - use otel-event nodes
    }

    // Extract all event names from workflow scenarios (from template.events)
    const workflowEvents = new Set<string>();
    for (const scenario of workflow.scenarios) {
      // From template.events
      if (scenario.template?.events) {
        for (const eventName of Object.keys(scenario.template.events)) {
          // Skip wildcard patterns
          if (!eventName.includes('*')) {
            workflowEvents.add(eventName);
          }
        }
      }
    }

    // Check for workflow events not in canvas
    for (const eventName of Array.from(workflowEvents)) {
      if (!canvasEvents.has(eventName)) {
        // Try to find this event elsewhere using the registry
        const eventSources = context.eventRegistry?.findEvent(eventName) ?? [];

        let message = `Workflow references event "${eventName}" which is not defined in canvas`;
        let suggestion = `Add event "${eventName}" to a node in ${workflow.canvas} or remove it from the workflow`;

        if (eventSources.length > 0) {
          // Event found elsewhere - provide helpful guidance
          const librarySources = eventSources.filter(s => s.type === 'library');
          const canvasSources = eventSources.filter(s => s.type === 'canvas');

          if (librarySources.length > 0) {
            // Event is in library - suggest using eventRef
            message = `Event "${eventName}" not found in canvas but is available in library`;
            suggestion = `Add a node with eventRef: "${eventName}" to ${workflow.canvas}`;
          } else if (canvasSources.length > 0) {
            // Event is in another canvas - suggest adding to library
            const canvasNames = canvasSources.map(s => basename(s.path)).join(', ');
            message = `Event "${eventName}" not found in canvas. Found in: ${canvasNames}`;
            suggestion = `Add "${eventName}" to library.yaml eventSchemas and use eventRef in ${workflow.canvas}`;
          }
        }

        violations.push({
          ruleId: 'workflow-event-sync',
          severity: 'error',
          file: workflowPath,
          path: 'events',
          message,
          impact: 'This event will never highlight a canvas node and may never match',
          suggestion,
          fixable: false,
        });
      }
    }

    // Check for canvas events not in workflow (warning only)
    // If allWorkflowEvents is provided, check against the combined set of all workflows
    // for this canvas. Otherwise, check against just this workflow's events.
    const eventsToCheckAgainst = context.allWorkflowEvents ?? workflowEvents;

    for (const eventName of Array.from(canvasEvents)) {
      if (!eventsToCheckAgainst.has(eventName)) {
        violations.push({
          ruleId: 'workflow-event-coverage',
          severity: 'error',
          file: workflowPath,
          path: 'events',
          message: context.allWorkflowEvents
            ? `Canvas defines event "${eventName}" which is not used in any workflow for this canvas`
            : `Canvas defines event "${eventName}" which is not used in this workflow scenario`,
          impact: 'This canvas node may never be highlighted during workflow playback',
          suggestion: `Add event "${eventName}" to a scenario's template.events`,
          fixable: false,
        });
      }
    }

    return violations;
  }

  /**
   * Check that scenarios are well-formed
   */
  private checkScenarios(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    if (!workflow.scenarios || workflow.scenarios.length === 0) {
      return violations; // Already flagged by checkSchema
    }

    const scenarioIds = new Set<string>();
    const priorities = new Set<number>();

    // Valid fields for scenario objects
    const validScenarioFields = ['id', 'priority', 'description', 'template', 'outcomeType', 'filterDefault'];
    const validOutcomeTypes = ['expected', 'expected-issue', 'unknown-issue'];

    workflow.scenarios.forEach((scenario, idx) => {
      // Check for unknown fields at scenario level
      const scenarioRecord = scenario as unknown as Record<string, unknown>;
      const scenarioKeys = Object.keys(scenarioRecord);

      for (const key of scenarioKeys) {
        if (!validScenarioFields.includes(key)) {
          violations.push({
            ruleId: 'workflow-scenario-unknown-field',
            severity: 'error',
            file: workflowPath,
            path: `scenarios[${idx}].${key}`,
            message: `Unknown scenario field "${key}"`,
            impact: 'This field will be ignored and may indicate a misunderstanding of the schema',
            suggestion: `Valid scenario fields are: ${validScenarioFields.join(', ')}. ` +
              (key === 'match' || key === 'excludeEvents'
                ? 'Scenario matching is based solely on template.events keys - there is no separate match configuration.'
                : key === 'condition' || key === 'requires'
                  ? 'Required events are automatically derived from template.events keys.'
                  : `Remove the "${key}" field or check for typos.`),
            fixable: false,
          });
        }
      }
      // Check for required fields
      if (!scenario.id) {
        violations.push({
          ruleId: 'workflow-scenario-valid',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${idx}].id`,
          message: 'Scenario is missing required "id" field',
          impact: 'Cannot identify this scenario',
          suggestion: 'Add a unique ID for this scenario',
          fixable: false,
        });
      } else {
        // Check for duplicate IDs
        if (scenarioIds.has(scenario.id)) {
          violations.push({
            ruleId: 'workflow-scenario-valid',
            severity: 'error',
            file: workflowPath,
            path: `scenarios[${idx}].id`,
            message: `Duplicate scenario ID: "${scenario.id}"`,
            impact: 'Scenario IDs must be unique',
            suggestion: 'Use a unique identifier for each scenario',
            fixable: false,
          });
        }
        scenarioIds.add(scenario.id);
      }

      // Check priority
      if (scenario.priority === undefined || scenario.priority === null) {
        violations.push({
          ruleId: 'workflow-scenario-valid',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${idx}].priority`,
          message: 'Scenario is missing required "priority" field',
          impact: 'Cannot determine scenario selection order',
          suggestion: 'Add a priority (lower number = higher priority)',
          fixable: false,
        });
      } else {
        if (scenario.priority < 0) {
          violations.push({
            ruleId: 'workflow-scenario-valid',
            severity: 'error',
            file: workflowPath,
            path: `scenarios[${idx}].priority`,
            message: 'Priority must be a non-negative number',
            impact: 'Invalid priority value',
            suggestion: 'Use a positive integer (1 = highest priority)',
            fixable: false,
          });
        }

        // Check for duplicate priorities
        if (priorities.has(scenario.priority)) {
          violations.push({
            ruleId: 'workflow-scenario-valid',
            severity: 'error',
            file: workflowPath,
            path: `scenarios[${idx}].priority`,
            message: `Duplicate priority: ${scenario.priority}`,
            impact: 'Priorities must be unique to determine selection order',
            suggestion: 'Assign unique priority values to each scenario',
            fixable: false,
          });
        }
        priorities.add(scenario.priority);
      }

      // Check description
      if (!scenario.description) {
        violations.push({
          ruleId: 'workflow-scenario-valid',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${idx}].description`,
          message: 'Scenario is missing required "description" field',
          impact: 'Cannot understand what this scenario represents',
          suggestion: 'Add a description explaining what this scenario represents',
          fixable: false,
        });
      }

      // Check outcomeType if present
      if (scenario.outcomeType !== undefined && !validOutcomeTypes.includes(scenario.outcomeType)) {
        violations.push({
          ruleId: 'workflow-scenario-valid',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${idx}].outcomeType`,
          message: `Invalid outcomeType: "${scenario.outcomeType}"`,
          impact: 'The scenario outcome type will not be recognized',
          suggestion: `Valid outcomeType values are: ${validOutcomeTypes.join(', ')}`,
          fixable: false,
        });
      }

      // Check filterDefault if present (should be boolean)
      if (scenario.filterDefault !== undefined && typeof scenario.filterDefault !== 'boolean') {
        violations.push({
          ruleId: 'workflow-scenario-valid',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${idx}].filterDefault`,
          message: `filterDefault must be a boolean, got: ${typeof scenario.filterDefault}`,
          impact: 'The filter default state will not be applied correctly',
          suggestion: 'Set filterDefault to true or false',
          fixable: false,
        });
      }

      // Check template
      if (!scenario.template) {
        violations.push({
          ruleId: 'workflow-scenario-valid',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${idx}].template`,
          message: 'Scenario is missing required "template" field',
          impact: 'Cannot render workflow without a template',
          suggestion: 'Add a template with introduction, events, or flow',
          fixable: false,
        });
      } else {
        // Validate template structure
        violations.push(...this.checkTemplateStructure(scenario.template, workflowPath, idx));
      }
    });

    return violations;
  }

  /**
   * Check for subset relationships between scenarios
   *
   * Ensures no scenario's event set is a strict subset of another scenario's event set.
   * This prevents ambiguous matching where a trace could match multiple scenarios.
   */
  private checkScenarioSubsets(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    if (!workflow.scenarios || workflow.scenarios.length < 2) {
      return violations; // Need at least 2 scenarios to check subsets
    }

    const scenarios = workflow.scenarios;

    for (let i = 0; i < scenarios.length; i++) {
      for (let j = i + 1; j < scenarios.length; j++) {
        const eventsA = new Set(Object.keys(scenarios[i].template?.events || {}));
        const eventsB = new Set(Object.keys(scenarios[j].template?.events || {}));

        // Check if A is a strict subset of B
        if (this.isStrictSubset(eventsA, eventsB)) {
          violations.push({
            ruleId: 'workflow-scenario-subset',
            severity: 'error',
            file: workflowPath,
            path: `scenarios[${i}]`,
            message: `Scenario "${scenarios[i].id}" is a strict subset of "${scenarios[j].id}"`,
            impact: 'A trace with all events from both scenarios will match both, causing ambiguous scenario selection',
            suggestion: this.generateSubsetFixSuggestion(scenarios[i], scenarios[j]),
            fixable: false,
          });
        }

        // Check if B is a strict subset of A
        if (this.isStrictSubset(eventsB, eventsA)) {
          violations.push({
            ruleId: 'workflow-scenario-subset',
            severity: 'error',
            file: workflowPath,
            path: `scenarios[${j}]`,
            message: `Scenario "${scenarios[j].id}" is a strict subset of "${scenarios[i].id}"`,
            impact: 'A trace with all events from both scenarios will match both, causing ambiguous scenario selection',
            suggestion: this.generateSubsetFixSuggestion(scenarios[j], scenarios[i]),
            fixable: false,
          });
        }

        // Check if A and B have identical event sets
        if (this.areIdenticalSets(eventsA, eventsB)) {
          violations.push({
            ruleId: 'workflow-scenario-identical',
            severity: 'error',
            file: workflowPath,
            path: `scenarios[${i}], scenarios[${j}]`,
            message: `Scenarios "${scenarios[i].id}" and "${scenarios[j].id}" have identical event sets`,
            impact: 'Both scenarios will match the same traces, making scenario selection arbitrary based on priority alone',
            suggestion: this.generateIdenticalFixSuggestion(scenarios[i], scenarios[j]),
            fixable: false,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check if set A is a strict subset of set B
   *
   * A is a strict subset of B if:
   * 1. All elements of A are in B
   * 2. A has fewer elements than B
   */
  private isStrictSubset(A: Set<string>, B: Set<string>): boolean {
    // A must have fewer elements than B
    if (A.size >= B.size) {
      return false;
    }

    // All elements of A must be in B
    for (const item of A) {
      if (!B.has(item)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if two sets have identical elements
   *
   * Two sets are identical if they have the same size and all elements match.
   */
  private areIdenticalSets(A: Set<string>, B: Set<string>): boolean {
    if (A.size !== B.size) {
      return false;
    }

    for (const item of A) {
      if (!B.has(item)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate helpful suggestion for fixing identical event sets
   */
  private generateIdenticalFixSuggestion(
    scenarioA: WorkflowScenario,
    scenarioB: WorkflowScenario
  ): string {
    const events = Object.keys(scenarioA.template?.events || {});

    return (
      `Both scenarios have events: [${events.join(', ')}]\n\n` +
      `Recommended fixes:\n\n` +
      `1. Merge into a single scenario with template conditionals for any differences:\n` +
      `   Scenarios with identical events represent the same execution path.\n` +
      `   Use template conditionals or attribute-based logic to handle variations.\n\n` +
      `2. If they represent genuinely different paths, add distinguishing events:\n` +
      `   - Add an event unique to "${scenarioA.id}" (e.g., "${scenarioA.id}.marker")\n` +
      `   - Add an event unique to "${scenarioB.id}" (e.g., "${scenarioB.id}.marker")\n\n` +
      `3. If the difference is attribute-based, use template variables:\n` +
      `   Instead of separate scenarios, use {{attribute}} in templates to show variations.`
    );
  }

  /**
   * Generate helpful suggestion for fixing subset relationship
   */
  private generateSubsetFixSuggestion(
    subsetScenario: WorkflowScenario,
    supersetScenario: WorkflowScenario
  ): string {
    const subsetEvents = Object.keys(subsetScenario.template?.events || {});
    const supersetEvents = Object.keys(supersetScenario.template?.events || {});
    const extraEvents = supersetEvents.filter(e => !subsetEvents.includes(e));

    return (
      `Scenario "${subsetScenario.id}" events: [${subsetEvents.join(', ')}]\n` +
      `Scenario "${supersetScenario.id}" events: [${supersetEvents.join(', ')}]\n\n` +
      `Recommended fixes:\n\n` +
      `1. Merge into one scenario with template conditionals:\n` +
      `   {\n` +
      `     "id": "${subsetScenario.id}",\n` +
      `     "template": {\n` +
      `       "events": { ${subsetEvents.map(e => `"${e}": "..."`).join(', ')} },\n` +
      `       "flow": [\n` +
      `         "Base flow steps...",\n` +
      `         {{#if ${extraEvents[0]}}}Additional step...{{/if}}\n` +
      `       ]\n` +
      `     }\n` +
      `   }\n\n` +
      `2. Make them mutually exclusive by adding distinguishing events:\n` +
      `   - Add an event to "${subsetScenario.id}" that distinguishes it (e.g., "conversion.timeout", "conversion.abandoned")\n` +
      `   - Or ensure "${supersetScenario.id}" has events that never co-occur with "${subsetScenario.id}"`
    );
  }

  /**
   * Check that all events in a scenario come from nodes with the same scope
   *
   * This ensures scenarios don't accidentally span multiple instrumentation boundaries.
   * Cross-scope workflows should be explicitly designed and documented.
   */
  private checkScenarioScopeConsistency(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath, canvas } = context;

    if (!canvas || !workflow.scenarios) {
      return violations;
    }

    // Build a map of event name -> scope from canvas nodes (otel-event nodes only)
    const eventToScope = new Map<string, string | undefined>();
    const eventToNodeId = new Map<string, string>();

    for (const node of canvas.nodes || []) {
      // Only process otel-event nodes
      if (isOtelEventNode(node)) {
        const otelEventNode = node as OtelEventNode;
        const eventName = otelEventNode.event?.name || otelEventNode.eventRef;
        const scope = otelEventNode.otel?.scope;

        if (eventName) {
          eventToScope.set(eventName, scope);
          eventToNodeId.set(eventName, node.id);
        }
      }
      // Legacy pv.event/pv.eventRef format is no longer supported
    }

    // Check each scenario for scope consistency
    for (let idx = 0; idx < workflow.scenarios.length; idx++) {
      const scenario = workflow.scenarios[idx];
      const templateEvents = Object.keys(scenario.template?.events || {});

      if (templateEvents.length === 0) {
        continue;
      }

      // Collect scopes for all events in this scenario
      const scopesInScenario = new Map<string, string[]>(); // scope -> event names

      for (const eventName of templateEvents) {
        // Skip wildcard events
        if (eventName === '*') continue;

        const scope = eventToScope.get(eventName);
        const scopeKey = scope || '__undefined__';

        if (!scopesInScenario.has(scopeKey)) {
          scopesInScenario.set(scopeKey, []);
        }
        scopesInScenario.get(scopeKey)!.push(eventName);
      }

      // Check if there are multiple scopes
      const definedScopes = Array.from(scopesInScenario.keys()).filter(s => s !== '__undefined__');
      const undefinedEvents = scopesInScenario.get('__undefined__') || [];

      if (definedScopes.length > 1) {
        // Multiple scopes detected - this is a cross-scope scenario
        const scopeBreakdown = definedScopes
          .map(scope => `  - ${scope}: ${scopesInScenario.get(scope)!.join(', ')}`)
          .join('\n');

        violations.push({
          ruleId: 'workflow-scenario-cross-scope',
          severity: 'warn',
          file: workflowPath,
          path: `scenarios[${idx}]`,
          message: `Scenario "${scenario.id}" spans multiple instrumentation scopes`,
          impact: 'This scenario crosses instrumentation boundaries, which may indicate:\n' +
            '  - A workflow that should be split into separate scope-specific workflows\n' +
            '  - A legitimate cross-scope operation that needs documentation',
          suggestion: `Scopes detected:\n${scopeBreakdown}\n\n` +
            'Consider:\n' +
            '  1. Split into separate workflows per scope\n' +
            '  2. If intentional, document the cross-scope nature in the workflow description\n' +
            '  3. Ensure all nodes have pv.otel.scope defined for accurate tracking',
          fixable: false,
        });
      }

      // Warn about events with undefined scopes (only if some events have scopes)
      if (undefinedEvents.length > 0 && definedScopes.length > 0) {
        violations.push({
          ruleId: 'workflow-scenario-scope-missing',
          severity: 'warn',
          file: workflowPath,
          path: `scenarios[${idx}]`,
          message: `Scenario "${scenario.id}" has events without scope defined`,
          impact: 'Cannot determine if these events belong to the same instrumentation boundary',
          suggestion: `Events missing scope: ${undefinedEvents.join(', ')}\n` +
            `Add pv.otel.scope to these nodes in the canvas to enable scope consistency checking`,
          fixable: false,
        });
      }

      // Check if node scopes are in owned-scopes list
      if (context.ownedScopes && context.ownedScopes.length > 0) {
        const unknownScopes = definedScopes.filter(scope => !context.ownedScopes!.includes(scope));
        if (unknownScopes.length > 0) {
          const eventsPerScope = unknownScopes
            .map(scope => `  - ${scope}: ${scopesInScenario.get(scope)!.join(', ')}`)
            .join('\n');

          violations.push({
            ruleId: 'workflow-node-scope-not-owned',
            severity: 'error',
            file: workflowPath,
            path: `scenarios[${idx}]`,
            message: `Scenario "${scenario.id}" uses scopes not declared in library.yaml owned-scopes`,
            impact: 'Spans from these scopes will not be matched - scopes must be declared in library.yaml',
            suggestion: `Unknown scopes:\n${eventsPerScope}\n\n` +
              `Either:\n` +
              `  - Add these scopes to owned-scopes in library.yaml\n` +
              `  - Update the nodes to use a declared scope: ${context.ownedScopes.join(', ')}`,
            fixable: false,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check that template uses valid fields (not legacy format)
   */
  private checkTemplateStructure(
    template: unknown,
    file: string,
    scenarioIdx: number
  ): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const validFields = ['introduction', 'events', 'logs', 'summary', 'span', 'children'];

    // Type guard: ensure template is an object
    if (typeof template !== 'object' || template === null) {
      return violations;
    }

    const templateRecord = template as Record<string, unknown>;
    const templateKeys = Object.keys(templateRecord);

    // Check that events field is present and is an object
    if (!templateRecord.events) {
      violations.push({
        ruleId: 'workflow-template-structure',
        severity: 'error',
        file,
        path: `scenarios[${scenarioIdx}].template`,
        message: 'Template is missing required "events" field',
        impact: 'Template must specify how to render each event type',
        suggestion: 'Add "events: { eventName: template }" to map event names to templates',
        fixable: false,
      });
    } else if (typeof templateRecord.events !== 'object' || Array.isArray(templateRecord.events)) {
      violations.push({
        ruleId: 'workflow-template-structure',
        severity: 'error',
        file,
        path: `scenarios[${scenarioIdx}].template.events`,
        message: 'Template "events" field must be an object',
        impact: 'Events will not render correctly',
        suggestion: 'Use object format: { "event.name": "template string" }',
        fixable: false,
      });
    } else if (typeof templateRecord.events === 'object' && templateRecord.events !== null && Object.keys(templateRecord.events).length === 0) {
      violations.push({
        ruleId: 'workflow-template-structure',
        severity: 'error',
        file,
        path: `scenarios[${scenarioIdx}].template.events`,
        message: 'Template "events" field must not be empty',
        impact: 'No events will be rendered in this scenario',
        suggestion: 'Add at least one event template: { "event.name": "template string" }',
        fixable: false,
      });
    }

    // Check for invalid/legacy fields
    for (const key of templateKeys) {
      if (!validFields.includes(key)) {
        // Check for common legacy format fields
        if (key === 'steps') {
          violations.push({
            ruleId: 'workflow-template-structure',
            severity: 'error',
            file,
            path: `scenarios[${scenarioIdx}].template.${key}`,
            message: `Invalid template field "${key}" (legacy format detected)`,
            impact: 'Template will not render - "steps" field is not supported',
            suggestion: 'Use "events: { eventName: template }" to map event names to templates',
            fixable: false,
          });
        } else if (key === 'details') {
          violations.push({
            ruleId: 'workflow-template-structure',
            severity: 'error',
            file,
            path: `scenarios[${scenarioIdx}].template.${key}`,
            message: `Invalid template field "${key}" (legacy format detected)`,
            impact: 'Template will not render - "details" field is not supported',
            suggestion: 'Remove "details" field - use template variables in "events" or "summary" instead',
            fixable: false,
          });
        } else {
          violations.push({
            ruleId: 'workflow-template-structure',
            severity: 'error',
            file,
            path: `scenarios[${scenarioIdx}].template.${key}`,
            message: `Unknown template field "${key}"`,
            impact: 'This field will be ignored and may cause unexpected behavior',
            suggestion: `Valid fields are: ${validFields.join(', ')}`,
            fixable: false,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check that event names don't use attribute filter syntax
   */
  private checkEventNameSyntax(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    workflow.scenarios.forEach((scenario, scenarioIdx) => {
      // Check template.events
      if (scenario.template?.events) {
        Object.keys(scenario.template.events).forEach((eventName) => {
          if (eventName.includes('[') && eventName.includes(']')) {
            violations.push({
              ruleId: 'workflow-event-name-syntax',
              severity: 'error',
              file: workflowPath,
              path: `scenarios[${scenarioIdx}].template.events["${eventName}"]`,
              message: `Event name uses unsupported [attribute=value] syntax: "${eventName}"`,
              impact: 'Attribute filter syntax is not supported - template will never render',
              suggestion: `Use a distinct event name instead (e.g., "${this.extractBaseEventName(eventName)}.${this.extractAttributeValue(eventName)}")`,
              fixable: false,
            });
          }
        });
      }
    });

    return violations;
  }

  /**
   * Check template syntax (balanced braces, valid expressions)
   */
  private checkTemplateSyntax(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    workflow.scenarios.forEach((scenario, scenarioIdx) => {
      if (!scenario.template) {
        return;
      }

      const template = scenario.template;

      // Check introduction
      if (template.introduction) {
        violations.push(...this.validateTemplateString(
          template.introduction,
          workflowPath,
          `scenarios[${scenarioIdx}].template.introduction`
        ));
      }

      // Check summary
      if (template.summary) {
        violations.push(...this.validateTemplateString(
          template.summary,
          workflowPath,
          `scenarios[${scenarioIdx}].template.summary`
        ));
      }

      // Check event templates
      if (template.events) {
        Object.entries(template.events).forEach(([eventName, templateEntry]) => {
          const templateStr = getEventTemplateString(templateEntry);
          violations.push(...this.validateTemplateString(
            templateStr,
            workflowPath,
            `scenarios[${scenarioIdx}].template.events.${eventName}`
          ));
        });
      }

      // Check log templates
      if (template.logs) {
        Object.entries(template.logs).forEach(([severity, templateStr]) => {
          if (typeof templateStr === 'string') {
            violations.push(...this.validateTemplateString(
              templateStr,
              workflowPath,
              `scenarios[${scenarioIdx}].template.logs.${severity}`
            ));
          }
        });
      }
    });

    return violations;
  }

  /**
   * Validate a single template string
   */
  private validateTemplateString(
    templateStr: string,
    file: string,
    path: string
  ): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];

    // Check for balanced braces
    let braceDepth = 0;
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < templateStr.length; i++) {
      const char = templateStr[i];
      const prevChar = i > 0 ? templateStr[i - 1] : '';

      // Track quotes
      if ((char === "'" || char === '"') && prevChar !== '\\') {
        if (!inQuote) {
          inQuote = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuote = false;
          quoteChar = '';
        }
      }

      // Track braces (only outside of quotes)
      if (!inQuote) {
        if (char === '{') {
          braceDepth++;
        } else if (char === '}') {
          braceDepth--;
          if (braceDepth < 0) {
            violations.push({
              ruleId: 'workflow-template-syntax',
              severity: 'error',
              file,
              path,
              message: 'Unbalanced braces: closing } without opening {',
              impact: 'Template will fail to render',
              suggestion: 'Ensure all {{variables}} and {expressions} have matching braces',
              fixable: false,
            });
            break;
          }
        }
      }
    }

    if (braceDepth > 0) {
      violations.push({
        ruleId: 'workflow-template-syntax',
        severity: 'error',
        file,
        path,
        message: 'Unbalanced braces: missing closing }',
        impact: 'Template will fail to render',
        suggestion: 'Ensure all {{variables}} and {expressions} have matching braces',
        fixable: false,
      });
    }

    // Check for incomplete conditional expressions (? without :)
    const conditionalPattern = /\{[^}]*\?[^}]*\}/g;
    const conditionals = templateStr.match(conditionalPattern) || [];

    conditionals.forEach((expr) => {
      // Simple check: if has ? but no :, it's incomplete
      const questionCount = (expr.match(/\?/g) || []).length;
      const colonCount = (expr.match(/:/g) || []).length;

      if (questionCount > colonCount) {
        violations.push({
          ruleId: 'workflow-template-syntax',
          severity: 'error',
          file,
          path,
          message: `Incomplete conditional expression: ${expr}`,
          impact: 'Template will fail to render',
          suggestion: 'Use Handlebars syntax: {{#if condition}}true{{else}}false{{/if}}',
          fixable: false,
        });
      }
    });

    // Check for Handlebars conditionals - these are not allowed in scenarios
    // A scenario must represent a single deterministic trace, not multiple conditional paths
    const handlebarsConditionalPattern = /\{\{#(if|unless|each)\b[^}]*\}\}|\{\{else\}\}/g;
    const handlebarsConditionals = templateStr.match(handlebarsConditionalPattern) || [];

    if (handlebarsConditionals.length > 0) {
      const firstMatch = handlebarsConditionals[0];
      violations.push({
        ruleId: 'workflow-template-conditional',
        severity: 'error',
        file,
        path,
        message: `Conditional syntax detected: ${firstMatch}`,
        impact: 'Scenarios must represent a single deterministic trace. Conditionals introduce ambiguity about which events should be present.',
        suggestion: 'Split into separate scenarios for each conditional path. Each scenario should represent one specific trace shape.',
        fixable: false,
      });
    }

    // Check for emojis - templates should be plain text without emoji characters
    const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]|[\u{200D}]|[\u{FE0F}]/gu;
    const emojiMatches = templateStr.match(emojiPattern);

    if (emojiMatches && emojiMatches.length > 0) {
      const uniqueEmojis = [...new Set(emojiMatches)].slice(0, 5);
      violations.push({
        ruleId: 'workflow-template-emoji',
        severity: 'error',
        file,
        path,
        message: `Template contains emoji characters: ${uniqueEmojis.join(' ')}`,
        impact: 'Emojis in templates can cause rendering issues and inconsistent display across platforms',
        suggestion: 'Remove emoji characters and use plain text descriptions instead',
        fixable: true,
      });
    }

    return violations;
  }

  /**
   * Check for conflicting attribute paths in templates
   *
   * Detects when one attribute path is a prefix of another, which causes
   * rendering issues. For example:
   * - `git.branch` (expects string value)
   * - `git.branch.source` (expects git.branch to be an object)
   *
   * When both are used, the nested object conversion will clobber the string
   * value, resulting in `[object Object]` being rendered.
   */
  private checkConflictingAttributePaths(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath, canvas, canvasPath } = context;

    // Helper function to find conflicts in a set of paths
    const findConflicts = (paths: Set<string>): Map<string, string[]> => {
      const pathArray = Array.from(paths);
      const conflicts = new Map<string, string[]>();

      for (let i = 0; i < pathArray.length; i++) {
        for (let j = 0; j < pathArray.length; j++) {
          if (i === j) continue;

          const pathA = pathArray[i];
          const pathB = pathArray[j];

          // Check if pathA is a prefix of pathB (pathA.something)
          if (pathB.startsWith(pathA + '.')) {
            if (!conflicts.has(pathA)) {
              conflicts.set(pathA, []);
            }
            if (!conflicts.get(pathA)!.includes(pathB)) {
              conflicts.get(pathA)!.push(pathB);
            }
          }
        }
      }

      return conflicts;
    };

    // 1. Check canvas event schema attributes for conflicts
    if (canvas?.nodes) {
      for (const node of canvas.nodes) {
        // Only check nodes that have event schemas (not text nodes)
        if (!('event' in node) || !node.event) continue;
        const eventSchema = node.event as { name?: string; attributes?: Record<string, unknown> };
        if (eventSchema.attributes && typeof eventSchema.attributes === 'object') {
          const attributeNames = new Set<string>(Object.keys(eventSchema.attributes));
          const conflicts = findConflicts(attributeNames);

          for (const [parent, children] of conflicts.entries()) {
            violations.push({
              ruleId: 'canvas-event-attribute-conflict',
              severity: 'error',
              file: canvasPath || workflowPath,
              path: `nodes[${node.id}].event.attributes`,
              message: `Conflicting attribute paths in event "${eventSchema.name || 'unknown'}": "${parent}" conflicts with ${children.map(c => `"${c}"`).join(', ')}`,
              impact: `When rendered in workflow templates, "${parent}" will become "[object Object]" because nested paths require it to be an object`,
              suggestion: `Rename attributes to avoid conflicts:\n` +
                `  - "${parent}" → "${parent}Value" or "${parent.replace(/\./g, '_')}"\n` +
                `  - Or use a different naming scheme that doesn't nest (e.g., "${parent.split('.').slice(0, -1).join('.')}_${parent.split('.').pop()}")`,
              fixable: false,
            });
          }
        }
      }
    }

    // 2. Check each scenario's template variables for conflicts
    workflow.scenarios.forEach((scenario, scenarioIdx) => {
      if (!scenario.template) return;

      // Collect all attribute paths from this scenario's templates
      const allPaths = new Set<string>();

      // From introduction
      if (scenario.template.introduction) {
        this.extractAttributeReferences(scenario.template.introduction).forEach(p => allPaths.add(p));
      }

      // From summary
      if (scenario.template.summary) {
        this.extractAttributeReferences(scenario.template.summary).forEach(p => allPaths.add(p));
      }

      // From event templates
      if (scenario.template.events) {
        Object.values(scenario.template.events).forEach(templateEntry => {
          const templateStr = getEventTemplateString(templateEntry);
          this.extractAttributeReferences(templateStr).forEach(p => allPaths.add(p));
        });
      }

      // Check for conflicts
      const conflicts = findConflicts(allPaths);

      // Report violations
      for (const [parent, children] of conflicts.entries()) {
        violations.push({
          ruleId: 'workflow-attribute-path-conflict',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${scenarioIdx}].template`,
          message: `Conflicting attribute paths: "{{${parent}}}" conflicts with ${children.map(c => `"{{${c}}}"`).join(', ')}`,
          impact: `"{{${parent}}}" will render as "[object Object]" because nested paths require it to be an object, not a primitive value`,
          suggestion: `Options:\n` +
            `  1. Remove "{{${parent}}}" and only use the nested paths\n` +
            `  2. Rename attributes to avoid conflicts (e.g., "${parent}" → "${parent}_value" or "${parent}.value")\n` +
            `  3. Use different attribute names that don't share a common prefix`,
          fixable: false,
        });
      }
    });

    return violations;
  }

  /**
   * Check attribute references against execution data
   *
   * Validates that:
   * - Attributes referenced in templates exist in execution data
   * - Object attributes are accessed via properties (not used directly)
   * - Attribute names are correct (catches typos)
   */
  private checkAttributeReferences(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath, executionData } = context;

    // Skip if no execution data provided
    if (!executionData) {
      return violations;
    }

    const { aggregates, eventAttributes } = executionData;

    // Check each scenario's template
    for (const scenario of workflow.scenarios) {
      const scenarioPath = `scenarios[${scenario.id}]`;

      // Check introduction template
      if (scenario.template.introduction) {
        const attrs = this.extractAttributeReferences(scenario.template.introduction);
        violations.push(
          ...this.validateAttributes(
            attrs,
            aggregates,
            null, // introduction doesn't have specific event context
            workflowPath,
            `${scenarioPath}.template.introduction`
          )
        );
      }

      // Check event templates
      if (scenario.template.events) {
        for (const [eventName, eventTemplateEntry] of Object.entries(scenario.template.events)) {
          const eventTemplate = getEventTemplateString(eventTemplateEntry);
          const attrs = this.extractAttributeReferences(eventTemplate);
          const eventAttrs = eventAttributes.get(eventName);

          violations.push(
            ...this.validateAttributes(
              attrs,
              aggregates,
              eventAttrs || null,
              workflowPath,
              `${scenarioPath}.template.events.${eventName}`,
              eventName
            )
          );
        }
      }

      // Check summary template
      if (scenario.template.summary) {
        const attrs = this.extractAttributeReferences(scenario.template.summary);
        violations.push(
          ...this.validateAttributes(
            attrs,
            aggregates,
            null, // summary uses global aggregates
            workflowPath,
            `${scenarioPath}.template.summary`
          )
        );
      }
    }

    return violations;
  }

  /**
   * Validate a list of attribute references against available data
   *
   * @param attributes - Attribute paths to validate
   * @param aggregates - Global aggregate attributes
   * @param eventAttributes - Event-specific attributes (if validating event template)
   * @param file - File path for violation reporting
   * @param path - JSON path for violation reporting
   * @param eventName - Event name (if validating event template)
   * @returns Array of violations found
   */
  private validateAttributes(
    attributes: string[],
    aggregates: Record<string, unknown>,
    eventAttributes: Record<string, unknown> | null,
    file: string,
    path: string,
    eventName?: string
  ): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];

    for (const attr of attributes) {
      // Check if attribute exists in global aggregates
      const globalValue = aggregates[attr];
      const eventValue = eventAttributes?.[attr];

      // Attribute doesn't exist anywhere
      if (globalValue === undefined && eventValue === undefined) {
        // Try to find similar attributes for helpful suggestions
        const allKeys = [
          ...Object.keys(aggregates),
          ...(eventAttributes ? Object.keys(eventAttributes) : []),
        ];
        const similar = this.findSimilarAttributes(attr, allKeys);

        violations.push({
          ruleId: 'workflow-attribute-undefined',
          severity: 'warn',
          file,
          path,
          message: eventName
            ? `Attribute "{{${attr}}}" not found in event "${eventName}" or global aggregates`
            : `Attribute "{{${attr}}}" not found in execution data`,
          impact: 'Template will render as empty or "undefined"',
          suggestion: similar.length > 0 ? `Did you mean: ${similar.join(', ')}?` : undefined,
          fixable: false,
        });
        continue;
      }

      // Check if object is used directly (should use property access)
      const value = eventValue !== undefined ? eventValue : globalValue;
      if (this.isObjectType(value)) {
        const objectKeys = Object.keys(value as Record<string, unknown>);
        const suggestions = objectKeys.slice(0, 3).map((k) => `{{${attr}.${k}}}`);

        violations.push({
          ruleId: 'workflow-attribute-object',
          severity: 'warn',
          file,
          path,
          message: `Attribute "{{${attr}}}" is an object and will render as "[object Object]"`,
          impact: 'Template will show "[object Object]" instead of useful data',
          suggestion: `Access a property instead: ${suggestions.join(', ')}`,
          fixable: false,
        });
      }
    }

    return violations;
  }

  /**
   * Check event attribute requirements:
   * All attributes defined in event schemas must be used in at least one template.
   *
   * This ensures all defined attributes have a purpose and are displayed to users.
   */
  private checkEventAttributeRequirements(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath, canvas, canvasPath } = context;

    if (!canvas?.nodes) {
      return violations;
    }

    // Collect all event names referenced in workflow scenarios
    // Only validate attributes for events that are INCLUDED in the workflow
    const workflowEventNames = new Set<string>();
    for (const scenario of workflow.scenarios) {
      if (!scenario.template?.events) continue;
      for (const eventName of Object.keys(scenario.template.events)) {
        workflowEventNames.add(eventName);
      }
    }

    // Collect all attribute references from workflow templates by event name
    const templateAttributesByEvent = new Map<string, Set<string>>();

    for (const scenario of workflow.scenarios) {
      if (!scenario.template?.events) continue;

      for (const [eventName, eventTemplateEntry] of Object.entries(scenario.template.events)) {
        const eventTemplate = getEventTemplateString(eventTemplateEntry);
        const attrs = this.extractAttributeReferences(eventTemplate);
        if (!templateAttributesByEvent.has(eventName)) {
          templateAttributesByEvent.set(eventName, new Set());
        }
        const eventAttrs = templateAttributesByEvent.get(eventName)!;
        attrs.forEach((attr) => eventAttrs.add(attr));
      }
    }

    // Check each canvas node's event schema (only for events included in the workflow)
    // Only otel-event nodes are supported
    for (const node of canvas.nodes) {
      let eventName: string | undefined;
      let eventSchema: { attributes?: Record<string, unknown> } | undefined;
      let schemaSource: 'inline' | 'library' = 'inline';

      // Only process otel-event nodes
      if (isOtelEventNode(node)) {
        const otelEventNode = node as OtelEventNode;
        if (otelEventNode.event?.name) {
          eventName = otelEventNode.event.name;
          eventSchema = otelEventNode.event as { attributes?: Record<string, unknown> };
        } else if (otelEventNode.eventRef) {
          eventName = otelEventNode.eventRef;
          schemaSource = 'library';
          const sources = context.eventRegistry?.findEvent(eventName) ?? [];
          const librarySource = sources.find((s) => s.type === 'library' && s.eventSchema);
          if (librarySource?.eventSchema) {
            eventSchema = librarySource.eventSchema;
          }
        }
      }
      // Legacy pv.event/pv.eventRef format is no longer supported

      if (!eventName || !eventSchema?.attributes) {
        continue; // No schema to validate
      }

      // Skip events not included in this workflow
      // This allows canvases with disconnected subgraphs where different workflows focus on different flows
      if (!workflowEventNames.has(eventName)) {
        continue;
      }

      // Get all defined attributes
      const definedAttrs = Object.keys(eventSchema.attributes);

      // All attributes must be used in templates
      const usedAttrs = templateAttributesByEvent.get(eventName) ?? new Set<string>();

      for (const attr of definedAttrs) {
        // Check if attribute is used (direct match or as prefix of a nested path)
        const isUsed = Array.from(usedAttrs).some(
          (usedAttr) => usedAttr === attr || usedAttr.startsWith(attr + '.')
        );

        if (!isUsed) {
          violations.push({
            ruleId: 'workflow-attribute-unused',
            severity: 'error',
            file: canvasPath || workflowPath,
            path: schemaSource === 'inline' ? `nodes[${node.id}].event.attributes.${attr}` : `library.eventSchemas.${eventName}.attributes.${attr}`,
            message: `Event "${eventName}" defines attribute "${attr}" that is not used in any template`,
            impact: 'This attribute is defined but never used in any template',
            suggestion: `Use {{${attr}}} in a template for event "${eventName}", or remove the attribute if it's not needed`,
            fixable: false,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check that template attributes are defined in the canvas event schema.
   *
   * This validates the reverse of checkEventAttributeRequirements:
   * - checkEventAttributeRequirements: schema defines attr not used in template → error
   * - checkTemplateAttributesDefinedInSchema: template uses attr not in schema → error
   *
   * This catches cases where:
   * - Template references {{context.projectRoot}} but schema doesn't define it
   * - Typos in attribute names (e.g., {{contex.projectRoot}})
   * - Attributes emitted by instrumentation but not documented in schema
   */
  private checkTemplateAttributesDefinedInSchema(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath, canvas, canvasPath } = context;

    if (!canvas?.nodes) {
      return violations;
    }

    // Build a map of event name -> schema attributes (including nested paths)
    // Only otel-event nodes are supported
    const eventSchemaAttributes = new Map<string, Set<string>>();

    for (const node of canvas.nodes) {
      let eventName: string | undefined;
      let eventSchema: { attributes?: Record<string, unknown> } | undefined;

      // Only process otel-event nodes
      if (isOtelEventNode(node)) {
        const otelEventNode = node as OtelEventNode;
        if (otelEventNode.event?.name) {
          eventName = otelEventNode.event.name;
          eventSchema = otelEventNode.event as { attributes?: Record<string, unknown> };
        } else if (otelEventNode.eventRef) {
          eventName = otelEventNode.eventRef;
          const sources = context.eventRegistry?.findEvent(eventName) ?? [];
          const librarySource = sources.find((s) => s.type === 'library' && s.eventSchema);
          if (librarySource?.eventSchema) {
            eventSchema = librarySource.eventSchema;
          }
        }
      }
      // Legacy pv.event/pv.eventRef format is no longer supported

      if (!eventName) continue;

      // Collect all attribute paths from schema (exact paths only, not parents)
      const schemaAttrs = new Set<string>();
      if (eventSchema?.attributes) {
        for (const attrName of Object.keys(eventSchema.attributes)) {
          schemaAttrs.add(attrName);
        }
      }

      eventSchemaAttributes.set(eventName, schemaAttrs);
    }

    // Check each scenario's event templates
    for (let scenarioIdx = 0; scenarioIdx < workflow.scenarios.length; scenarioIdx++) {
      const scenario = workflow.scenarios[scenarioIdx];
      if (!scenario.template?.events) continue;

      for (const [eventName, eventTemplateEntry] of Object.entries(scenario.template.events)) {
        // Skip wildcard patterns
        if (eventName.includes('*')) continue;

        const schemaAttrs = eventSchemaAttributes.get(eventName);

        // If event has no schema, we can't validate (already flagged by checkEventReferences)
        if (!schemaAttrs) continue;

        // Extract attribute references from this template
        const eventTemplate = getEventTemplateString(eventTemplateEntry);
        const templateAttrs = this.extractAttributeReferences(eventTemplate);

        for (const attr of templateAttrs) {
          // Check if attribute is defined in schema:
          // 1. Exact match: {{input.taskId}} with schema "input.taskId"
          // 2. Parent access: {{input}} with schema "input.taskId" (accessing parent object)
          // 3. NOT: {{input.takId}} with schema "input.taskId" (typo - different leaf)
          const isDefinedInSchema =
            schemaAttrs.has(attr) || // Exact match
            Array.from(schemaAttrs).some(schemaAttr => schemaAttr.startsWith(attr + '.')); // attr is parent of schema attr

          if (!isDefinedInSchema) {
            // Find similar attributes for suggestions
            const similar = this.findSimilarAttributes(attr, Array.from(schemaAttrs));

            violations.push({
              ruleId: 'workflow-template-attribute-not-in-schema',
              severity: 'error',
              file: workflowPath,
              path: `scenarios[${scenarioIdx}].template.events["${eventName}"]`,
              message: `Template references "{{${attr}}}" but it is not defined in the event schema for "${eventName}"`,
              impact: 'This attribute may render as empty or cause unexpected behavior. The schema should document all attributes used in templates.',
              suggestion: similar.length > 0
                ? `Did you mean: ${similar.map(s => `{{${s}}}`).join(', ')}? Or add "${attr}" to the event schema in ${canvasPath || 'the canvas file'}.`
                : `Add "${attr}" to the event schema for "${eventName}" in ${canvasPath || 'the canvas file'}, or remove it from the template if not needed.`,
              fixable: false,
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * Check if all events in scenario templates are connected through canvas edges
   */
  private checkEventConnectivity(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];

    if (!context.canvas) {
      return violations; // Can't validate without canvas
    }

    // Check if canvas has edges - if not, error for workflows with multi-event scenarios
    if (!context.canvas.edges || context.canvas.edges.length === 0) {
      const { workflow } = context;

      for (let i = 0; i < workflow.scenarios.length; i++) {
        const scenario = workflow.scenarios[i];

        if (!scenario.template?.events) {
          continue;
        }

        const eventNames = Object.keys(scenario.template.events);

        if (eventNames.length >= 2) {
          violations.push({
            ruleId: 'workflow-event-connectivity',
            severity: 'error',
            file: context.workflowPath,
            path: `scenarios[${i}]`,
            message: `Scenario "${scenario.id}" has ${eventNames.length} events but the canvas has no edges`,
            impact: 'Events will appear as isolated nodes in workflow visualizations, making it unclear how execution flows between them',
            suggestion: 'Add edges to the canvas to connect the events in this scenario',
            fixable: false,
          });
        }
      }

      return violations;
    }

    const { workflow, canvas } = context;

    // Build event name → node ID mapping (otel-event nodes only)
    const eventToNodeId = new Map<string, string>();
    for (const node of canvas.nodes || []) {
      if (isOtelEventNode(node)) {
        const otelEventNode = node as OtelEventNode;
        const eventName = otelEventNode.event?.name || otelEventNode.eventRef;
        if (eventName) {
          eventToNodeId.set(eventName, node.id);
        }
      }
      // Legacy pv.event/pv.eventRef format is no longer supported
    }

    // Build adjacency graph from edges
    const adjacency = new Map<string, Set<string>>();
    for (const edge of canvas.edges!) {
      if (!adjacency.has(edge.fromNode)) {
        adjacency.set(edge.fromNode, new Set());
      }
      if (!adjacency.has(edge.toNode)) {
        adjacency.set(edge.toNode, new Set());
      }
      adjacency.get(edge.fromNode)!.add(edge.toNode);
      adjacency.get(edge.toNode)!.add(edge.fromNode); // Treat as undirected for connectivity
    }

    // Check each scenario
    for (let i = 0; i < workflow.scenarios.length; i++) {
      const scenario = workflow.scenarios[i];

      if (!scenario.template?.events) {
        continue;
      }

      const eventNames = Object.keys(scenario.template.events);
      const nodeIds = eventNames
        .map(name => eventToNodeId.get(name))
        .filter((id): id is string => id !== undefined);

      if (nodeIds.length < 2) {
        continue; // Need at least 2 nodes to check connectivity
      }

      // Check if all nodes are in the same connected component
      const disconnected = this.findDisconnectedNodes(nodeIds, adjacency);

      if (disconnected.length > 0) {
        violations.push({
          ruleId: 'workflow-event-connectivity',
          severity: 'error',
          file: context.workflowPath,
          path: `scenarios[${i}].template.events`,
          message: `Scenario "${scenario.id}" has ${disconnected.length} disconnected event(s)`,
          impact: 'Events will appear as isolated nodes in workflow visualizations, making it unclear how execution flows between them',
          suggestion: `Add intermediate events to connect the flow. Disconnected events: ${disconnected.map(id => {
            const node = canvas.nodes?.find(n => n.id === id);
            if (!node) return id;
            if (isOtelEventNode(node)) {
              const otelEventNode = node as OtelEventNode;
              return otelEventNode.event?.name || otelEventNode.eventRef || id;
            }
            return id;
          }).join(', ')}`,
          fixable: false,
        });
      }
    }

    return violations;
  }

  /**
   * Find nodes that are not connected to the main component
   */
  private findDisconnectedNodes(
    nodeIds: string[],
    adjacency: Map<string, Set<string>>
  ): string[] {
    if (nodeIds.length === 0) return [];

    // BFS from first node - traverse ALL nodes to find connectivity
    const visited = new Set<string>();
    const queue = [nodeIds[0]];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const neighbors = adjacency.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    // Return nodes from nodeIds that were not visited (disconnected)
    return nodeIds.filter(id => !visited.has(id));
  }

  /**
   * Find similar attribute names for helpful suggestions
   *
   * Uses simple string similarity (Levenshtein-like) to find typos
   *
   * @param target - The attribute being searched for
   * @param available - Available attribute names
   * @returns Array of similar attribute names (max 3)
   */
  private findSimilarAttributes(target: string, available: string[]): string[] {
    const similar: Array<{ attr: string; score: number }> = [];

    for (const attr of available) {
      // Check for prefix match
      if (attr.startsWith(target) || target.startsWith(attr)) {
        similar.push({ attr, score: 10 });
        continue;
      }

      // Check for substring match
      if (attr.includes(target) || target.includes(attr)) {
        similar.push({ attr, score: 5 });
        continue;
      }

      // Check for similar structure (same number of dots)
      const targetParts = target.split('.');
      const attrParts = attr.split('.');
      if (targetParts.length === attrParts.length) {
        // Check if any parts match
        const matchingParts = targetParts.filter((p, i) => p === attrParts[i]).length;
        if (matchingParts > 0) {
          similar.push({ attr, score: matchingParts });
        }
      }
    }

    // Sort by score and return top 3
    return similar
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => s.attr);
  }

  /**
   * Check formatting options
   */
  private checkFormattingOptions(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    if (!workflow.formatting) {
      return violations;
    }

    // Check showAttributes
    if (workflow.formatting.showAttributes) {
      const validValues = ['none', 'matched', 'all'];
      if (!validValues.includes(workflow.formatting.showAttributes)) {
        violations.push({
          ruleId: 'workflow-formatting-options',
          severity: 'warn',
          file: workflowPath,
          path: 'formatting.showAttributes',
          message: `Invalid showAttributes value: "${workflow.formatting.showAttributes}"`,
          impact: 'May not display attributes correctly',
          suggestion: `Use one of: ${validValues.join(', ')}`,
          fixable: false,
        });
      }
    }

    return violations;
  }

  /**
   * Check execution data completeness
   *
   * Validates that co-located execution files contain the events and attributes
   * that workflow templates reference.
   */
  private async checkExecutionDataCompleteness(context: WorkflowValidationContext): Promise<WorkflowViolation[]> {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath, executionFiles } = context;

    if (!executionFiles || executionFiles.length === 0) {
      return violations;
    }

    // Load and parse all execution files
    const executions: Array<{path: string; data: IExportTraceServiceRequest}> = [];
    for (const execPath of executionFiles) {
      try {
        const content = await this.fsAdapter.readFile(execPath);
        const data = JSON.parse(content) as IExportTraceServiceRequest;
        executions.push({ path: execPath, data });
      } catch (error) {
        // Skip files that can't be loaded/parsed
        continue;
      }
    }

    if (executions.length === 0) {
      return violations;
    }

    // Check for multiple traces in single files (anti-pattern)
    for (const { path, data } of executions) {
      const traceIds = new Set<string>();

      data.resourceSpans?.forEach((rs) => {
        rs.scopeSpans?.forEach((ss) => {
          ss.spans?.forEach((span) => {
            if (span.traceId) {
              traceIds.add(typeof span.traceId === 'string' ? span.traceId : Buffer.from(span.traceId).toString('hex'));
            }
          });
        });
      });

      if (traceIds.size > 1) {
        const fileName = path.split('/').pop() || path;
        violations.push({
          ruleId: 'workflow-execution-multiple-traces',
          severity: 'warn',
          file: path,
          message: `Execution file contains ${traceIds.size} traces - should contain only one trace per file`,
          impact: 'Cannot establish clear trace-to-scenario association, makes debugging harder',
          suggestion: `Split ${fileName} into ${traceIds.size} separate files, one per test case (e.g., success.otel.json, error.otel.json)`,
          fixable: false,
        });
      }
    }

    // For each scenario, check if execution data can satisfy the template
    workflow.scenarios.forEach((scenario, scenarioIdx) => {
      if (!scenario.template) return;

      // Extract all template variables from this scenario
      const templateVars = new Set<string>();
      const eventTemplates = new Map<string, Set<string>>();

      // Extract variables from summary
      if (scenario.template.summary) {
        this.extractTemplateVariables(scenario.template.summary).forEach(v => templateVars.add(v));
      }

      // Extract variables from introduction
      if (scenario.template.introduction) {
        this.extractTemplateVariables(scenario.template.introduction).forEach(v => templateVars.add(v));
      }

      // Extract variables from event templates
      if (scenario.template.events) {
        Object.entries(scenario.template.events).forEach(([eventName, templateEntry]) => {
          const template = getEventTemplateString(templateEntry);
          const vars = this.extractTemplateVariables(template);
          if (!eventTemplates.has(eventName)) {
            eventTemplates.set(eventName, new Set());
          }
          vars.forEach(v => {
            templateVars.add(v);
            eventTemplates.get(eventName)!.add(v);
          });
        });
      }

      // Check if ANY execution file has the data needed
      const hasCompleteData = executions.some(({ data }) => {
        return this.executionHasTemplateData(data, scenario.template, templateVars, eventTemplates);
      });

      if (!hasCompleteData && templateVars.size > 0) {
        const missingInfo = this.findMissingTemplateData(executions, scenario.template, eventTemplates);

        violations.push({
          ruleId: 'workflow-execution-data-incomplete',
          severity: 'warn',
          file: workflowPath,
          path: `scenarios[${scenarioIdx}].template`,
          message: `Template references data not found in co-located execution files`,
          impact: 'Template variables will not resolve when viewing executions',
          suggestion: missingInfo.length > 0
            ? `Missing: ${missingInfo.slice(0, 3).join(', ')}${missingInfo.length > 3 ? ` and ${missingInfo.length - 3} more` : ''}`
            : 'Ensure execution files contain the events and attributes referenced in templates',
          fixable: false,
        });
      }
    });

    return violations;
  }

  /**
   * Extract template variable references from a template string
   * Matches {{variableName}} and {{@span.attributeName}} patterns
   */
  private extractTemplateVariables(template: string): string[] {
    const vars: string[] = [];
    // Match {{variableName}}, {{object.property}}, or {{@span.attributeName}}
    // but not {{#if}} {{/if}} {{else}}
    const pattern = /\{\{(?!\s*[#/])\s*(@?[a-zA-Z_][a-zA-Z0-9._]*)\s*\}\}/g;
    let match;

    while ((match = pattern.exec(template)) !== null) {
      const varName = match[1];
      // Skip Handlebars helpers and keywords
      if (!['this', 'else', 'each', 'if', 'unless', 'with'].includes(varName)) {
        // Skip @span.* variables - they reference span attributes which are
        // validated separately and don't need to be in event attributes
        if (!varName.startsWith('@span.')) {
          vars.push(varName);
        }
      }
    }

    return vars;
  }

  /**
   * Check if execution data contains the template data needed
   */
  private executionHasTemplateData(
    execution: IExportTraceServiceRequest,
    template: ScenarioTemplate,
    templateVars: Set<string>,
    eventTemplates: Map<string, Set<string>>
  ): boolean {
    // Collect all events and their attributes from the execution
    const executionEvents = new Map<string, Set<string>>();

    execution.resourceSpans?.forEach((rs) => {
      rs.scopeSpans?.forEach((ss) => {
        ss.spans?.forEach((span) => {
          // Add span events
          span.events?.forEach((event) => {
            const eventName = event.name;
            if (!executionEvents.has(eventName)) {
              executionEvents.set(eventName, new Set());
            }
            // Add event attributes
            event.attributes?.forEach((attr) => {
              executionEvents.get(eventName)!.add(attr.key);
            });
          });

          // Also check span-level attributes (available as aggregates)
          if (span.name) {
            if (!executionEvents.has(span.name)) {
              executionEvents.set(span.name, new Set());
            }
            span.attributes?.forEach((attr) => {
              executionEvents.get(span.name)!.add(attr.key);
            });
          }
        });
      });
    });

    // Check if the execution has the events referenced in templates
    let hasAllData = true;

    for (const [eventName, requiredVars] of eventTemplates.entries()) {
      // Check if this event exists in execution
      const eventData = executionEvents.get(eventName);
      if (!eventData) {
        // Event doesn't exist - this is incomplete
        hasAllData = false;
        break;
      }

      // Check if event has all required attributes
      for (const varName of requiredVars) {
        const baseVar = varName.split('.')[0]; // Handle nested properties
        if (!eventData.has(baseVar)) {
          hasAllData = false;
          break;
        }
      }

      if (!hasAllData) break;
    }

    return hasAllData;
  }

  /**
   * Find what specific data is missing from executions
   */
  private findMissingTemplateData(
    executions: Array<{path: string; data: IExportTraceServiceRequest}>,
    template: ScenarioTemplate,
    eventTemplates: Map<string, Set<string>>
  ): string[] {
    const missing: string[] = [];
    const allEvents = new Set<string>();

    // Collect all events from all executions
    executions.forEach(({ data }) => {
      data.resourceSpans?.forEach((rs) => {
        rs.scopeSpans?.forEach((ss) => {
          ss.spans?.forEach((span) => {
            span.events?.forEach((event) => {
              allEvents.add(event.name);
            });
            if (span.name) {
              allEvents.add(span.name);
            }
          });
        });
      });
    });

    // Check what's missing
    for (const [eventName, requiredVars] of eventTemplates.entries()) {
      if (!allEvents.has(eventName)) {
        missing.push(`event "${eventName}"`);
      } else {
        // Event exists, check attributes
        requiredVars.forEach(varName => {
          missing.push(`attribute "${varName}" in event "${eventName}"`);
        });
      }
    }

    return missing;
  }

  /**
   * Aggregate violations into result
   */
  private aggregateResults(violations: WorkflowViolation[]): WorkflowValidationResult {
    let errorCount = 0;
    let warningCount = 0;
    let fixableCount = 0;

    violations.forEach((v) => {
      if (v.severity === 'error') {
        errorCount++;
      } else {
        warningCount++;
      }
      if (v.fixable) {
        fixableCount++;
      }
    });

    return {
      violations,
      errorCount,
      warningCount,
      fixableCount,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Check if a version string is valid semver
   */
  private isValidSemver(version: string): boolean {
    const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
    return semverPattern.test(version);
  }

  /**
   * Check if an event name matches any available event (supports globs)
   */
  private matchesEventPattern(eventName: string, availableEvents: string[]): boolean {
    // Exact match only
    return availableEvents.includes(eventName);
  }

  /**
   * Extract base event name from event pattern
   *
   * Examples:
   * - "installation.started" -> "installation.started"
   * - "installation.progress[stage=skills_discovered]" -> "installation.progress"
   * - "error.*[severity=high]" -> "error.*"
   */
  private extractBaseEventName(eventPattern: string): string {
    const bracketIndex = eventPattern.indexOf('[');
    if (bracketIndex === -1) {
      return eventPattern;
    }
    return eventPattern.substring(0, bracketIndex);
  }

  /**
   * Extract attribute value from event pattern for suggestion
   *
   * Examples:
   * - "installation.progress[stage=skills_discovered]" -> "skills_discovered"
   * - "error.*[severity=high]" -> "high"
   * - "installation.started" -> ""
   */
  private extractAttributeValue(eventPattern: string): string {
    const match = eventPattern.match(/\[.*?=(.*?)\]/);
    if (!match) {
      return '';
    }
    return match[1];
  }

  /**
   * Extract attribute references from Handlebars template
   *
   * Parses template strings like:
   * - "{{source}}" -> ["source"]
   * - "{{source.url}}" -> ["source.url"]
   * - "{{#if options.global}}" -> ["options.global"]
   * - "{{#if (eq install.mode 'symlink')}}" -> ["install.mode"]
   *
   * @param template - Handlebars template string
   * @returns Array of attribute paths referenced in the template
   */
  private extractAttributeReferences(template: string): string[] {
    const attributes = new Set<string>();

    // Match all Handlebars expressions: {{...}}
    const expressionPattern = /\{\{([^}]+)\}\}/g;
    let match;

    while ((match = expressionPattern.exec(template)) !== null) {
      const expression = match[1].trim();

      // Skip block helpers closing tags
      if (expression.startsWith('/')) {
        continue;
      }

      // Handle block helpers: #if, #each, #unless, etc.
      if (expression.startsWith('#')) {
        // Extract the condition/expression after the helper
        const helperMatch = expression.match(/^#\w+\s+(.+)$/);
        if (helperMatch) {
          this.extractAttributesFromExpression(helperMatch[1], attributes);
        }
        continue;
      }

      // Handle regular expressions
      this.extractAttributesFromExpression(expression, attributes);
    }

    return Array.from(attributes);
  }

  /**
   * Extract attribute references from a single Handlebars expression
   *
   * Handles:
   * - Simple references: source.url
   * - Helper calls: (eq install.mode 'symlink')
   * - Nested expressions
   *
   * @param expression - The expression to parse
   * @param attributes - Set to add found attributes to
   */
  private extractAttributesFromExpression(expression: string, attributes: Set<string>): void {
    // Remove helper parentheses: (eq install.mode 'symlink') -> eq install.mode 'symlink'
    const cleaned = expression.replace(/^\(|\)$/g, '').trim();

    // Split on spaces to handle helper arguments
    const parts = cleaned.split(/\s+/);

    for (const part of parts) {
      // Skip helper names, string literals, numbers, and boolean literals
      if (
        part.match(/^(if|unless|each|with|eq|ne|lt|gt|lte|gte|and|or|not)$/) ||
        part.match(/^['"].*['"]$/) ||
        part.match(/^\d+$/) ||
        part.match(/^(true|false|null|undefined)$/)
      ) {
        continue;
      }

      // Remove any remaining quotes or parentheses
      const cleanPart = part.replace(/['"()]/g, '');

      // If it looks like an attribute path (contains letters/dots/underscores)
      if (cleanPart && cleanPart.match(/^[a-zA-Z_][a-zA-Z0-9_.]*$/)) {
        attributes.add(cleanPart);
      }
    }
  }

  /**
   * Check if an attribute is an object type
   *
   * @param value - The attribute value to check
   * @returns true if value is a plain object (not array, not null)
   */
  private isObjectType(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    );
  }
}

/**
 * Create a validator instance
 */
export function createWorkflowValidator(fsAdapter: FileSystemAdapter): WorkflowValidator {
  return new WorkflowValidator(fsAdapter);
}
