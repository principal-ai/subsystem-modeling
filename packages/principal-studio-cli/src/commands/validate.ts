/**
 * Validate command - Comprehensive validation of all Principal View artifacts
 *
 * This command validates:
 * - Canvas files (.canvas, .otel.canvas)
 * - Workflow templates (.workflow.json)
 * - Execution artifacts (.otel.json)
 * - Component library (library.yaml)
 */

import { Command } from 'commander';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname, basename } from 'node:path';
import { determineFileType } from '../file-utils.js';
import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
import { globby } from 'globby';
import yaml from 'js-yaml';
import type {
  ExtendedCanvas,
  WorkflowTemplate,
  ExecutionData,
  ComponentLibrary as CoreComponentLibrary,
  DashboardDefinition,
  DashboardValidationContext,
} from '@principal-ai/subsystems-core';
import {
  createExecutionValidator,
  validateLibraryStructure,
  createDashboardValidator,
} from '@principal-ai/subsystems-core';
import {
  CanvasDiscovery,
  LibraryDiscovery,
  createWorkflowValidator,
  EventRegistry,
  WorkflowValidator,
  ScopeEventsValidator,
  OtelEventPathsValidator,
} from '@principal-ai/subsystems-core/node';
import type {
  EventsCanvasInput,
  OtelCanvasInput,
} from '@principal-ai/subsystems-core/node';
import type { ComponentLibrary } from '@principal-ai/subsystems-core';
import {
  FilesystemService,
  NodeFileSystemAdapter as CompositionFsAdapter,
} from '@principal-ai/codebase-composition/node';
import { NodeFileSystemAdapter } from '@principal-ai/repository-abstraction/node';

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  path?: string;
  suggestion?: string;
}

interface ValidationResult {
  file: string;
  fileType: 'canvas' | 'workflow' | 'testTrace' | 'library' | 'dashboard';
  isValid: boolean;
  issues: ValidationIssue[];
  canvas?: ExtendedCanvas;
}

/**
 * Loaded library structure (simplified for validation purposes)
 */
interface LoadedLibrary {
  nodeComponents: Record<string, unknown>;
  edgeComponents: Record<string, unknown>;
  scopes?: Record<string, unknown>;
  raw: Record<string, unknown>;
  path: string;
}

/**
 * Cross-canvas path enforcement. For every `otel-event` node in an OTEL
 * canvas, cross-references each entry in `otel.files` against the `paths`
 * declared on the event's namespace in the matching events canvas.
 * Enforcement is opt-in per namespace — namespaces without `paths` produce
 * no violations. Mutates `results` in place to attach any violations.
 */
function runOtelEventPathsValidation(
  results: ValidationResult[],
  repositoryPath: string,
): void {
  try {
    const eventsCanvasInputs: EventsCanvasInput[] = [];
    const otelCanvasInputs: OtelCanvasInput[] = [];

    for (const r of results) {
      if (r.fileType !== 'canvas') continue;
      const absPath = resolve(repositoryPath, r.file);
      if (!existsSync(absPath)) continue;
      let canvas: ExtendedCanvas;
      try {
        canvas = JSON.parse(readFileSync(absPath, 'utf-8')) as ExtendedCanvas;
      } catch {
        continue; // malformed — caught by per-file validator
      }

      if (r.file.endsWith('.events.canvas')) {
        const rawScope = (canvas as unknown as { scope?: unknown }).scope;
        if (typeof rawScope !== 'string' || rawScope.length === 0) continue;
        eventsCanvasInputs.push({ canvas, canvasPath: r.file, scope: rawScope });
      } else if (r.file.endsWith('.otel.canvas')) {
        otelCanvasInputs.push({ canvas, canvasPath: r.file });
      }
    }

    if (eventsCanvasInputs.length === 0 || otelCanvasInputs.length === 0) return;

    const pathsResult = new OtelEventPathsValidator().validate({
      eventsCanvases: eventsCanvasInputs,
      otelCanvases: otelCanvasInputs,
    });

    for (const violation of pathsResult.violations) {
      const target = results.find((r) => r.file === violation.file);
      if (!target) continue;
      if (violation.severity === 'error') target.isValid = false;
      target.issues.push({
        type: violation.severity === 'error' ? 'error' : 'warning',
        message: violation.message,
        path: violation.path,
        suggestion: violation.suggestion,
      });
    }
  } catch {
    // Non-fatal — any loading/parsing failure leaves the cross-canvas check
    // quiet, letting the per-file validators surface their own errors.
  }
}

/**
 * Load the library.yaml file from the .principal-views directory
 */
function loadLibrary(principalViewsDir: string): LoadedLibrary | null {
  const libraryFiles = ['library.yaml', 'library.yml', 'library.json'];

  for (const fileName of libraryFiles) {
    const libraryPath = resolve(principalViewsDir, fileName);
    if (existsSync(libraryPath)) {
      try {
        const content = readFileSync(libraryPath, 'utf8');
        const library = fileName.endsWith('.json') ? JSON.parse(content) : yaml.load(content);

        if (library && typeof library === 'object') {
          return {
            nodeComponents:
              ((library as Record<string, unknown>).nodeComponents as Record<string, unknown>) ||
              {},
            edgeComponents:
              ((library as Record<string, unknown>).edgeComponents as Record<string, unknown>) ||
              {},
            scopes:
              ((library as Record<string, unknown>).scopes as Record<string, unknown>) ||
              undefined,
            raw: library as Record<string, unknown>,
            path: libraryPath,
          };
        }
      } catch {
        // Library exists but failed to parse - return empty to avoid false positives
        return { nodeComponents: {}, edgeComponents: {}, scopes: undefined, raw: {}, path: libraryPath };
      }
    }
  }
  return null;
}

interface NodeRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectanglesIntersect(a: NodeRect, b: NodeRect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Validate library.yaml file
 *
 * Uses core's validateLibraryStructure for schema validation,
 * then adds CLI-specific checks (unknown fields, icons, recommended fields).
 */
function validateLibrary(library: LoadedLibrary): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lib = library.raw;

  // 1. Run core schema validation
  const schemaResult = validateLibraryStructure(lib as unknown as CoreComponentLibrary);
  for (const error of schemaResult.errors) {
    issues.push({
      type: 'error',
      message: error.message,
      path: error.path,
      suggestion: error.suggestion,
    });
  }

  // 2. CLI-specific: Check for unknown fields (helpful for typos)
  checkUnknownFields(lib, ALLOWED_LIBRARY_FIELDS.root, '', issues);

  // CLI-specific: Validate nodeComponents for unknown fields and icon names
  if (lib.nodeComponents && typeof lib.nodeComponents === 'object') {
    for (const [compId, compDef] of Object.entries(lib.nodeComponents as Record<string, unknown>)) {
      if (compDef && typeof compDef === 'object') {
        const comp = compDef as Record<string, unknown>;
        checkUnknownFields(
          comp,
          ALLOWED_LIBRARY_FIELDS.nodeComponent,
          `nodeComponents.${compId}`,
          issues
        );

        // Validate icon name format (must be PascalCase for Lucide icons)
        validateIconName(comp.icon, `nodeComponents.${compId}.icon`, issues);

        // Check nested fields
        if (comp.size && typeof comp.size === 'object') {
          checkUnknownFields(
            comp.size as Record<string, unknown>,
            ALLOWED_LIBRARY_FIELDS.nodeComponentSize,
            `nodeComponents.${compId}.size`,
            issues
          );
        }

        if (comp.states && typeof comp.states === 'object') {
          for (const [stateId, stateDef] of Object.entries(
            comp.states as Record<string, unknown>
          )) {
            if (stateDef && typeof stateDef === 'object') {
              checkUnknownFields(
                stateDef as Record<string, unknown>,
                ALLOWED_LIBRARY_FIELDS.nodeComponentState,
                `nodeComponents.${compId}.states.${stateId}`,
                issues
              );
              // Validate state icon name format
              const state = stateDef as Record<string, unknown>;
              validateIconName(
                state.icon,
                `nodeComponents.${compId}.states.${stateId}.icon`,
                issues
              );
            }
          }
        }

        if (comp.dataSchema && typeof comp.dataSchema === 'object') {
          for (const [fieldName, fieldDef] of Object.entries(
            comp.dataSchema as Record<string, unknown>
          )) {
            if (fieldDef && typeof fieldDef === 'object') {
              const field = fieldDef as Record<string, unknown>;
              checkUnknownFields(
                field,
                ALLOWED_LIBRARY_FIELDS.nodeComponentDataSchemaField,
                `nodeComponents.${compId}.dataSchema.${fieldName}`,
                issues
              );
              // Check required fields
              if (field.description === undefined) {
                issues.push({
                  type: 'error',
                  message: `Missing required field "description" in nodeComponents.${compId}.dataSchema.${fieldName}`,
                });
              }
              if (field.placeholder === undefined) {
                issues.push({
                  type: 'error',
                  message: `Missing required field "placeholder" in nodeComponents.${compId}.dataSchema.${fieldName}`,
                });
              }
            }
          }
        }

        if (comp.layout && typeof comp.layout === 'object') {
          checkUnknownFields(
            comp.layout as Record<string, unknown>,
            ALLOWED_LIBRARY_FIELDS.nodeComponentLayout,
            `nodeComponents.${compId}.layout`,
            issues
          );
        }

        if (Array.isArray(comp.actions)) {
          comp.actions.forEach((action: unknown, actionIndex: number) => {
            if (action && typeof action === 'object') {
              checkUnknownFields(
                action as Record<string, unknown>,
                ALLOWED_LIBRARY_FIELDS.nodeComponentAction,
                `nodeComponents.${compId}.actions[${actionIndex}]`,
                issues
              );
            }
          });
        }
      }
    }
  }

  // CLI-specific: Validate edgeComponents for unknown fields
  if (lib.edgeComponents && typeof lib.edgeComponents === 'object') {
    for (const [compId, compDef] of Object.entries(lib.edgeComponents as Record<string, unknown>)) {
      if (compDef && typeof compDef === 'object') {
        const comp = compDef as Record<string, unknown>;
        checkUnknownFields(
          comp,
          ALLOWED_LIBRARY_FIELDS.edgeComponent,
          `edgeComponents.${compId}`,
          issues
        );

        // Check nested fields
        if (comp.animation && typeof comp.animation === 'object') {
          checkUnknownFields(
            comp.animation as Record<string, unknown>,
            ALLOWED_LIBRARY_FIELDS.edgeComponentAnimation,
            `edgeComponents.${compId}.animation`,
            issues
          );
        }

        if (comp.label && typeof comp.label === 'object') {
          checkUnknownFields(
            comp.label as Record<string, unknown>,
            ALLOWED_LIBRARY_FIELDS.edgeComponentLabel,
            `edgeComponents.${compId}.label`,
            issues
          );
        }
      }
    }
  }

  // CLI-specific: Validate connectionRules for unknown fields
  if (Array.isArray(lib.connectionRules)) {
    lib.connectionRules.forEach((rule: unknown, ruleIndex: number) => {
      if (rule && typeof rule === 'object') {
        const r = rule as Record<string, unknown>;
        checkUnknownFields(
          r,
          ALLOWED_LIBRARY_FIELDS.connectionRule,
          `connectionRules[${ruleIndex}]`,
          issues
        );

        if (r.constraints && typeof r.constraints === 'object') {
          checkUnknownFields(
            r.constraints as Record<string, unknown>,
            ALLOWED_LIBRARY_FIELDS.connectionRuleConstraints,
            `connectionRules[${ruleIndex}].constraints`,
            issues
          );
        }
      }
    });
  }

  // 3. CLI-specific: Recommended field warnings for resources
  // (Schema validation for resources is handled by core)
  if (lib.resources && typeof lib.resources === 'object' && !Array.isArray(lib.resources)) {
    const resources = lib.resources as Record<string, unknown>;
    const resourceKeys = Object.keys(resources);

    // Warn if resources is defined but empty
    if (resourceKeys.length === 0) {
      issues.push({
        type: 'warning',
        message: 'resources section is empty. Consider documenting services that emit OTEL traces.',
        path: 'resources',
        suggestion: 'See: npx @principal-ai/principal-studio-cli formats library',
      });
    }

    // Check for recommended (but not required) fields
    for (const [serviceId, serviceDef] of Object.entries(resources)) {
      if (serviceDef && typeof serviceDef === 'object') {
        const service = serviceDef as Record<string, unknown>;

        // Warn about missing recommended fields
        if (!service['service.version']) {
          issues.push({
            type: 'warning',
            message: `Missing recommended field "service.version" in resource "${serviceId}"`,
            path: `resources.${serviceId}`,
            suggestion: 'Consider adding service.version to track which version emitted traces',
          });
        }

        if (!service['deployment.environment']) {
          issues.push({
            type: 'warning',
            message: `Missing recommended field "deployment.environment" in resource "${serviceId}"`,
            path: `resources.${serviceId}`,
            suggestion:
              'Consider adding deployment.environment (e.g., "development", "production")',
          });
        }
      }
    }
  }

  // 4. CLI-specific: Validate scopes section for unknown fields and icon names
  // Check for deprecated scopes section (breaking change)
  if (lib.scopes && typeof lib.scopes === 'object' && !Array.isArray(lib.scopes)) {
    const scopeCount = Object.keys(lib.scopes).length;
    issues.push({
      type: 'error',
      message: `The 'scopes' section in library.yaml is no longer supported (${scopeCount} scope(s) found)`,
      path: `library.yaml:scopes`,
      suggestion: `Run "pv migrate scopes-to-canvas" to migrate to .scopes.canvas format, then remove the scopes section from library.yaml. Scope visual metadata (colors, icons, descriptions) is now defined in .scopes.canvas files. The "owned-scopes" field in resources is still used for telemetry routing.`,
    });
  }

  return issues;
}

/**
 * Standard JSON Canvas node types that don't require pv metadata
 */
const STANDARD_CANVAS_TYPES = ['text', 'group', 'file', 'link'] as const;

/**
 * OTEL semantic node types (new format)
 * These replace the legacy "type: text" + "pv.nodeType" pattern
 */
const OTEL_NODE_TYPES = [
  'otel-event',
  'otel-span-convention',
  'otel-scope',
  'otel-resource',
  'otel-boundary',
  'event-namespace',
] as const;

// ============================================================================
// Icon Validation
// ============================================================================

/**
 * Common Lucide icons that are known to work
 * This is not exhaustive - see https://lucide.dev/icons/ for the full list
 */
const KNOWN_LUCIDE_ICONS = new Set([
  // Common UI
  'Server',
  'Database',
  'Cloud',
  'Shield',
  'Lock',
  'Key',
  'Zap',
  'Cpu',
  'HardDrive',
  'Network',
  'Wifi',
  'WifiOff',
  'User',
  'Users',
  'UserCheck',
  'UserPlus',
  'UserMinus',
  'File',
  'Folder',
  'Package',
  'Box',
  'Archive',
  'GitBranch',
  'GitCommit',
  'GitMerge',
  'GitPullRequest',
  'Github',
  'Circle',
  'Square',
  'Triangle',
  'Pentagon',
  'Hexagon',
  'Octagon',
  'Settings',
  'Wrench',
  'Tool',
  'Hammer',
  'Cog',
  'Monitor',
  'Smartphone',
  'Tablet',
  'Laptop',
  'Mail',
  'Phone',
  'MessageSquare',
  'MessageCircle',
  'Calendar',
  'Clock',
  'Timer',
  'Watch',
  'Check',
  'X',
  'AlertCircle',
  'AlertTriangle',
  'Info',
  'Plus',
  'Minus',
  'Edit',
  'Trash',
  'Copy',
  'Search',
  'Filter',
  'Download',
  'Upload',
  'Home',
  'Star',
  'Heart',
  'Bookmark',
  'ChevronRight',
  'ChevronLeft',
  'ChevronUp',
  'ChevronDown',
  'ArrowRight',
  'ArrowLeft',
  'ArrowUp',
  'ArrowDown',
  'Activity',
  'BarChart',
  'PieChart',
  'TrendingUp',
  'TrendingDown',
  'FileText',
  'FileCode',
  'FileJson',
  'Image',
  'Video',
  'Link',
  'ExternalLink',
  'Unlink',
  'Eye',
  'EyeOff',
  'Play',
  'Pause',
  'Stop',
  'RefreshCw',
]);

/**
 * Convert kebab-case to PascalCase
 * e.g., "file-text" -> "FileText", "alert-circle" -> "AlertCircle"
 */
function kebabToPascalCase(str: string): string {
  return str
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert a dot/hyphen-separated ID to a human-readable label.
 * E.g., "multi-canvas-panel.render" → "Multi Canvas Panel Render"
 */
function idToHumanReadable(id: string): string {
  return id
    .split(/[-.]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Check if a string looks like kebab-case (has hyphens and lowercase)
 */
function isKebabCase(str: string): boolean {
  return str.includes('-') && str === str.toLowerCase();
}

/**
 * Validate an icon name and return issues if invalid
 * Icons should be in PascalCase (e.g., "FileText", "Database", "AlertCircle")
 */
function validateIconName(iconValue: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof iconValue !== 'string' || !iconValue) {
    return; // No icon specified, that's fine
  }

  // Check if it looks like kebab-case
  if (isKebabCase(iconValue)) {
    const suggested = kebabToPascalCase(iconValue);
    issues.push({
      type: 'error',
      message: `Invalid icon name "${iconValue}" - icons must be in PascalCase`,
      path,
      suggestion: `Use "${suggested}" instead of "${iconValue}". See https://lucide.dev/icons/ for valid icon names.`,
    });
    return;
  }

  // Check if first character is lowercase (common mistake)
  if (iconValue[0] === iconValue[0].toLowerCase() && iconValue[0] !== iconValue[0].toUpperCase()) {
    const suggested = iconValue.charAt(0).toUpperCase() + iconValue.slice(1);
    issues.push({
      type: 'error',
      message: `Invalid icon name "${iconValue}" - icons must start with uppercase`,
      path,
      suggestion: `Use "${suggested}" instead of "${iconValue}". See https://lucide.dev/icons/ for valid icon names.`,
    });
    return;
  }

  // Warn if icon is not in our known list (but might still be valid)
  if (!KNOWN_LUCIDE_ICONS.has(iconValue)) {
    issues.push({
      type: 'warning',
      message: `Icon "${iconValue}" is not in the list of commonly used Lucide icons`,
      path,
      suggestion: `Verify that "${iconValue}" exists at https://lucide.dev/icons/. If it does, you can ignore this warning. Common icons: Server, Database, User, File, Settings, etc.`,
    });
  }
}

// ============================================================================
// Allowed Fields Definitions
// ============================================================================

/**
 * Allowed fields for canvas validation
 */
const ALLOWED_CANVAS_FIELDS = {
  // Top-level canvas fields (all pv fields moved to root)
  root: [
    'nodes',
    'edges',
    'name',
    'markdown',
    'description',
    'type', // For event-namespace canvases
    'nodeTypes',
    'edgeTypes',
    'pathConfig',
    'display',
    'scope',
    'audit',
    'pv', // deprecated - kept for error reporting
  ],
  // pv is fully deprecated - all fields moved to root
  pv: [
    'name',
    'description',
    'markdown',
    'nodeTypes',
    'edgeTypes',
    'pathConfig',
    'display',
    'scope',
    'audit',
  ],
  pvPathConfig: [
    'projectRoot',
    'captureSource',
    'enableActionPatterns',
    'logLevel',
    'ignoreUnsourced',
  ],
  pvDisplay: ['layout', 'theme', 'animations'],
  pvDisplayTheme: ['primary', 'success', 'warning', 'danger', 'info'],
  pvDisplayAnimations: ['enabled', 'speed'],
  pvNodeType: ['label', 'description', 'color', 'icon', 'shape'],
  pvEdgeType: [
    'label',
    'description',
    'style',
    'color',
    'width',
    'directed',
    'animation',
    'labelConfig',
    'activatedBy',
  ],
  pvEdgeTypeAnimation: ['type', 'duration', 'color'],
  pvEdgeTypeLabelConfig: ['field', 'position'],
  // Base node fields from JSON Canvas spec
  nodeBase: ['id', 'type', 'x', 'y', 'width', 'height', 'color', 'pv'],
  // Type-specific node fields
  nodeText: ['text'],
  nodeFile: ['file', 'subpath'],
  nodeLink: ['url'],
  nodeGroup: ['label', 'background', 'backgroundStyle'],
  // OTEL node type fields (new semantic format)
  nodeOtel: [
    'label',
    'description',
    'icon',
    'shape',
    'fill',
    'otel',
    'event',
    'eventRef',
    'dataSchema',
    'boundary',
    'namespace',
    'paths',
  ],
  // Node pv extension
  nodePv: [
    'nodeType',
    'name',
    'description',
    'otel',
    'event',
    'eventRef',
    'status',
    'shape',
    'icon',
    'fill',
    'stroke',
    'states',
    'origin',
    'references',
    'sources', // deprecated, use references
    'resourceMatch',
    'actions',
    'dataSchema',
    'layout',
    'boundary', // For boundary nodes representing external system interfaces
  ],
  nodePvOtel: ['kind', 'category', 'files', 'scope', 'spanPattern', 'spanKind'],
  nodePvBoundary: ['direction', 'node'],
  nodePvState: ['color', 'icon', 'label'],
  nodePvAction: ['pattern', 'event', 'state', 'metadata', 'triggerEdges'],
  nodePvDataSchemaField: ['type', 'required', 'displayInLabel', 'description', 'placeholder'],
  nodePvLayout: ['layer', 'cluster'],
  // Edge fields (edgeType moved from pv to top-level)
  edge: [
    'id',
    'fromNode',
    'toNode',
    'fromSide',
    'toSide',
    'fromEnd',
    'toEnd',
    'color',
    'label',
    'edgeType', // moved from pv.edgeType
    'description', // for event-namespace canvases
    'pv', // deprecated
  ],
  // edgePv is deprecated - edgeType moved to top-level
  edgePv: ['edgeType', 'style', 'width', 'animation', 'activatedBy'],
  edgePvAnimation: ['type', 'duration', 'color'],
  edgePvActivatedBy: ['action', 'animation', 'direction', 'duration'],
};

/**
 * Allowed fields for library validation
 */
const ALLOWED_LIBRARY_FIELDS = {
  root: [
    'version',
    'name',
    'description',
    'nodeComponents',
    'edgeComponents',
    'connectionRules',
    'resources',
    'scopes',
    'eventSchemas',
  ],
  nodeComponent: [
    'description',
    'tags',
    'defaultLabel',
    'shape',
    'icon',
    'color',
    'size',
    'states',
    'status',
    'sources',
    'resourceMatch',
    'actions',
    'dataSchema',
    'layout',
  ],
  nodeComponentSize: ['width', 'height'],
  nodeComponentState: ['color', 'icon', 'label'],
  nodeComponentAction: ['pattern', 'event', 'state', 'metadata', 'triggerEdges'],
  nodeComponentDataSchemaField: [
    'type',
    'required',
    'displayInLabel',
    'label',
    'displayInInfo',
    'description',
    'placeholder',
  ],
  nodeComponentLayout: ['layer', 'cluster'],
  edgeComponent: [
    'description',
    'tags',
    'style',
    'color',
    'width',
    'directed',
    'animation',
    'label',
  ],
  edgeComponentAnimation: ['type', 'duration', 'color'],
  edgeComponentLabel: ['field', 'position'],
  connectionRule: ['from', 'to', 'via', 'constraints'],
  connectionRuleConstraints: ['maxInstances', 'bidirectional', 'exclusive'],
  scope: ['color', 'icon', 'description', 'external'],
};

/**
 * Check for unknown fields and return validation issues
 */
function checkUnknownFields(
  obj: Record<string, unknown>,
  allowedFields: string[],
  path: string,
  issues: ValidationIssue[]
): void {
  for (const field of Object.keys(obj)) {
    if (!allowedFields.includes(field)) {
      const suggestion = findSimilarField(field, allowedFields);
      issues.push({
        type: 'error',
        message: `Unknown field "${field}"${path ? ` in ${path}` : ' at root level'}`,
        path: path ? `${path}.${field}` : field,
        suggestion: suggestion
          ? `Did you mean "${suggestion}"? Allowed fields: ${allowedFields.join(', ')}`
          : `Allowed fields: ${allowedFields.join(', ')}`,
      });
    }
  }
}

/**
 * Find a similar field name for suggestions
 */
function findSimilarField(field: string, allowedFields: string[]): string | null {
  const fieldLower = field.toLowerCase();

  for (const allowed of allowedFields) {
    const allowedLower = allowed.toLowerCase();
    if (fieldLower.includes(allowedLower) || allowedLower.includes(fieldLower)) {
      return allowed;
    }
    // Check for small edit distance
    if (Math.abs(field.length - allowed.length) <= 2) {
      let differences = 0;
      const minLen = Math.min(fieldLower.length, allowedLower.length);
      for (let i = 0; i < minLen; i++) {
        if (fieldLower[i] !== allowedLower[i]) differences++;
      }
      differences += Math.abs(field.length - allowed.length);
      if (differences <= 2) return allowed;
    }
  }
  return null;
}

/**
 * Check if a span pattern matches a workflow span pattern
 * Supports wildcards: "task.*" matches "task.create", "task.edit", etc.
 */
function spanPatternMatches(conventionPattern: string, workflowPattern: string): boolean {
  // Exact match
  if (conventionPattern === workflowPattern) {
    return true;
  }

  // Wildcard match: "task.*" matches "task.create"
  if (conventionPattern.endsWith('.*')) {
    const prefix = conventionPattern.slice(0, -1); // Remove the '*', keep the '.'
    return workflowPattern.startsWith(prefix);
  }

  return false;
}

/**
 * Find workflows that match a span convention pattern (with wildcard support)
 */
function findMatchingWorkflows(
  conventionPattern: string,
  workflowSpanPatterns: Map<string, string>
): Array<{ pattern: string; path: string }> {
  const matches: Array<{ pattern: string; path: string }> = [];

  for (const [workflowPattern, workflowPath] of workflowSpanPatterns) {
    if (spanPatternMatches(conventionPattern, workflowPattern)) {
      matches.push({ pattern: workflowPattern, path: workflowPath });
    }
  }

  return matches;
}

/**
 * Load a workflow template file
 */
function loadWorkflowTemplate(filePath: string): WorkflowTemplate | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as WorkflowTemplate;
  } catch {
    return null;
  }
}

/**
 * Load an execution artifact file
 */
function loadExecutionFile(filePath: string): ExecutionData | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as ExecutionData;
  } catch {
    return null;
  }
}

/**
 * Find matching canvas file for an execution artifact
 *
 * Strategy:
 * 1. Look for a co-located workflow file and use its canvas reference
 * 2. Fall back to name-based matching for legacy patterns
 */
function findMatchingCanvas(
  executionPath: string,
  repositoryPath: string
): { canvasPath: string | null; workflowPath: string | null } {
  const fileName = basename(executionPath);
  const dir = dirname(executionPath);

  // Strategy 1: Look for co-located workflow file
  // In the hierarchical structure, test traces are co-located with their workflow:
  //   .principal-views/storyboard/workflow-name/
  //     ├── workflow-name.workflow.json
  //     └── test-trace.otel.json
  const workflowFiles = readdirSync(dir).filter((f) => f.endsWith('.workflow.json'));
  if (workflowFiles.length > 0) {
    // Use the first workflow found (typically there's only one per directory)
    const workflowPath = resolve(dir, workflowFiles[0]);
    try {
      const workflowContent = readFileSync(workflowPath, 'utf8');
      const workflow = JSON.parse(workflowContent);

      if (workflow.canvas) {
        // Canvas paths in workflows are relative to repository root
        const canvasPath = resolve(repositoryPath, workflow.canvas);
        if (existsSync(canvasPath)) {
          return { canvasPath, workflowPath };
        }
      }
    } catch {
      // Failed to parse workflow, fall through to name-based matching
    }
  }

  // Strategy 2: Name-based matching for legacy patterns
  // Extract basename by removing .otel.json extension
  const canvasBasename = fileName.replace(/\.otel\.json$/, '');

  // Determine canvas directory (go up from __executions__ to .principal-views)
  let canvasDir: string;
  if (dir.includes('.principal-views/__executions__')) {
    canvasDir = dir.replace('/__executions__', '');
  } else if (dir.endsWith('__executions__')) {
    canvasDir = resolve(dirname(dir), '.principal-views');
  } else {
    // Fallback: look in .principal-views relative to repository root
    canvasDir = resolve(repositoryPath, '.principal-views');
  }

  // Check for .otel.canvas first (preferred)
  const otelCanvasPath = resolve(canvasDir, `${canvasBasename}.otel.canvas`);
  if (existsSync(otelCanvasPath)) {
    return { canvasPath: otelCanvasPath, workflowPath: null };
  }

  // Check for regular .canvas as fallback
  const regularCanvasPath = resolve(canvasDir, `${canvasBasename}.canvas`);
  if (existsSync(regularCanvasPath)) {
    return { canvasPath: regularCanvasPath, workflowPath: null };
  }

  return {
    canvasPath: null,
    workflowPath: workflowFiles.length > 0 ? resolve(dir, workflowFiles[0]) : null,
  };
}

/**
 * Find workflow files that reference a given canvas
 *
 * Searches the canvas directory and parent storyboard directory for .workflow.json files
 * that have a 'canvas' field referencing the given canvas path.
 */
function findWorkflowsForCanvas(canvasPath: string, repositoryPath: string): string[] {
  const canvasDir = dirname(canvasPath);
  const canvasRelPath = relative(repositoryPath, canvasPath);
  const workflows: string[] = [];

  // Helper to check if a workflow references this canvas
  const checkWorkflowFile = (workflowPath: string): boolean => {
    try {
      const content = readFileSync(workflowPath, 'utf8');
      const workflow = JSON.parse(content);
      if (workflow.canvas) {
        // Normalize both paths for comparison
        const workflowCanvasPath = resolve(repositoryPath, workflow.canvas);
        const normalizedCanvasPath = resolve(repositoryPath, canvasRelPath);
        return workflowCanvasPath === normalizedCanvasPath;
      }
    } catch {
      // Failed to parse, skip
    }
    return false;
  };

  // Check direct directory for workflow files
  try {
    const filesInDir = readdirSync(canvasDir);
    for (const file of filesInDir) {
      if (file.endsWith('.workflow.json')) {
        const workflowPath = resolve(canvasDir, file);
        if (checkWorkflowFile(workflowPath)) {
          workflows.push(workflowPath);
        }
      }
    }
  } catch {
    // Directory not readable
  }

  // Also check subdirectories (storyboard pattern: canvas at storyboard root, workflows in subdirs)
  try {
    const entries = readdirSync(canvasDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = resolve(canvasDir, entry.name);
        try {
          const subFiles = readdirSync(subDir);
          for (const file of subFiles) {
            if (file.endsWith('.workflow.json')) {
              const workflowPath = resolve(subDir, file);
              if (checkWorkflowFile(workflowPath)) {
                workflows.push(workflowPath);
              }
            }
          }
        } catch {
          // Subdirectory not readable
        }
      }
    }
  } catch {
    // Directory not readable
  }

  return workflows;
}

/**
 * Check if a canvas has OTEL-related features
 * Returns true if the canvas contains any of:
 * 1. Nodes with pv.otel extension (kind, category)
 * 2. Event schema (pv.event or pv.eventRef with validation)
 * 3. Canvas scope/audit config (OTEL log routing)
 * 4. Resource matching for OTEL logs
 */
function hasOtelFeatures(canvas: unknown): boolean {
  if (!canvas || typeof canvas !== 'object') {
    return false;
  }

  const c = canvas as Record<string, unknown>;

  // Check for canvas-level scope or audit config (top-level)
  if (c.scope !== undefined || c.audit !== undefined) {
    return true;
  }

  // Check nodes for OTEL features
  if (Array.isArray(c.nodes)) {
    for (const node of c.nodes) {
      if (node && typeof node === 'object') {
        const n = node as Record<string, unknown>;

        // Check for OTEL semantic node types (e.g., otel-event, otel-span-convention)
        if (
          typeof n.type === 'string' &&
          OTEL_NODE_TYPES.includes(n.type as (typeof OTEL_NODE_TYPES)[number])
        ) {
          return true;
        }

        if (n.pv && typeof n.pv === 'object') {
          const nodePv = n.pv as Record<string, unknown>;

          // Check for pv.otel extension
          if (nodePv.otel !== undefined) {
            return true;
          }

          // Check for event schema (pv.event or pv.eventRef)
          if (nodePv.event !== undefined || nodePv.eventRef !== undefined) {
            return true;
          }

          // Check for resourceMatch (OTEL log routing)
          if (nodePv.resourceMatch !== undefined) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Validate an ExtendedCanvas object with strict validation
 *
 * Strict validation ensures:
 * - All required fields are present
 * - Custom node types have proper pv metadata
 * - Edge types reference defined types in pv.edgeTypes or library.edgeComponents
 * - Node types reference defined types in pv.nodeTypes or library.nodeComponents
 * - Canvas has pv extension with name and version
 * - OTEL nodes have source file references and the files exist
 * - Scopes used in OTEL canvases are documented in scopes canvas
 */
function validateCanvas(
  canvas: unknown,
  filePath: string,
  library: LoadedLibrary | null,
  repositoryPath?: string,
  scopesCanvas?: ExtendedCanvas
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!canvas || typeof canvas !== 'object') {
    issues.push({ type: 'error', message: 'Canvas must be an object' });
    return issues;
  }

  const c = canvas as Record<string, unknown>;

  // Check unknown fields at canvas root level
  checkUnknownFields(c, ALLOWED_CANVAS_FIELDS.root, '', issues);

  // Collect library-defined types
  const libraryNodeTypes = library ? Object.keys(library.nodeComponents) : [];
  const libraryEdgeTypes = library ? Object.keys(library.edgeComponents) : [];

  // Validate top-level canvas fields (name is required)
  let canvasEdgeTypes: string[] = [];
  let canvasNodeTypes: string[] = [];

  // Check for deprecated pv field at canvas level
  if (c.pv !== undefined) {
    issues.push({
      type: 'error',
      message: 'The "pv" field is fully deprecated. All fields have been moved to top-level.',
      path: 'pv',
      suggestion:
        'Move all pv fields to top-level: name, markdown, description, nodeTypes, edgeTypes, display, pathConfig, scope, audit. Then remove the pv field entirely.',
    });
  }

  // Require top-level name field
  if (typeof c.name !== 'string' || !c.name) {
    issues.push({
      type: 'error',
      message: 'Canvas must have a top-level "name" field',
      path: 'name',
      suggestion: 'Add: "name": "My Graph"',
    });
  }

  // Validate top-level pathConfig if present
  if (c.pathConfig && typeof c.pathConfig === 'object') {
    checkUnknownFields(
      c.pathConfig as Record<string, unknown>,
      ALLOWED_CANVAS_FIELDS.pvPathConfig,
      'pathConfig',
      issues
    );
  }

  // Validate top-level display if present
  if (c.display && typeof c.display === 'object') {
    const display = c.display as Record<string, unknown>;
    checkUnknownFields(display, ALLOWED_CANVAS_FIELDS.pvDisplay, 'display', issues);

    if (display.theme && typeof display.theme === 'object') {
      checkUnknownFields(
        display.theme as Record<string, unknown>,
        ALLOWED_CANVAS_FIELDS.pvDisplayTheme,
        'display.theme',
        issues
      );
    }
    if (display.animations && typeof display.animations === 'object') {
      checkUnknownFields(
        display.animations as Record<string, unknown>,
        ALLOWED_CANVAS_FIELDS.pvDisplayAnimations,
        'display.animations',
        issues
      );
    }
  }

  // Collect and validate defined node types (top-level)
  if (c.nodeTypes && typeof c.nodeTypes === 'object') {
    canvasNodeTypes = Object.keys(c.nodeTypes as Record<string, unknown>);
    for (const [typeId, typeDef] of Object.entries(c.nodeTypes as Record<string, unknown>)) {
      if (typeDef && typeof typeDef === 'object') {
        checkUnknownFields(
          typeDef as Record<string, unknown>,
          ALLOWED_CANVAS_FIELDS.pvNodeType,
          `nodeTypes.${typeId}`,
          issues
        );
        // Validate icon name format
        const nodeType = typeDef as Record<string, unknown>;
        validateIconName(nodeType.icon, `nodeTypes.${typeId}.icon`, issues);
      }
    }
  }

  // Collect and validate defined edge types (top-level)
  if (c.edgeTypes && typeof c.edgeTypes === 'object') {
    canvasEdgeTypes = Object.keys(c.edgeTypes as Record<string, unknown>);
    for (const [typeId, typeDef] of Object.entries(c.edgeTypes as Record<string, unknown>)) {
      if (typeDef && typeof typeDef === 'object') {
        const edgeTypeDef = typeDef as Record<string, unknown>;
        checkUnknownFields(
          edgeTypeDef,
          ALLOWED_CANVAS_FIELDS.pvEdgeType,
          `edgeTypes.${typeId}`,
          issues
        );

        if (edgeTypeDef.animation && typeof edgeTypeDef.animation === 'object') {
          checkUnknownFields(
            edgeTypeDef.animation as Record<string, unknown>,
            ALLOWED_CANVAS_FIELDS.pvEdgeTypeAnimation,
            `edgeTypes.${typeId}.animation`,
            issues
          );
        }
        if (edgeTypeDef.labelConfig && typeof edgeTypeDef.labelConfig === 'object') {
          checkUnknownFields(
            edgeTypeDef.labelConfig as Record<string, unknown>,
            ALLOWED_CANVAS_FIELDS.pvEdgeTypeLabelConfig,
            `edgeTypes.${typeId}.labelConfig`,
            issues
          );
        }
      }
    }
  }

  // Built-in node types that are always valid
  const builtInNodeTypes = ['scope', 'boundary'];

  // Combined types from canvas + library + built-ins
  const allDefinedNodeTypes = [
    ...new Set([...builtInNodeTypes, ...canvasNodeTypes, ...libraryNodeTypes]),
  ];
  const allDefinedEdgeTypes = [...new Set([...canvasEdgeTypes, ...libraryEdgeTypes])];

  // Check nodes
  // Track if any nodes have status: 'implemented' for library resources validation
  let hasImplementedNodes = false;

  if (!Array.isArray(c.nodes)) {
    issues.push({ type: 'error', message: 'Canvas must have a "nodes" array' });
  } else if (c.nodes.length === 0) {
    issues.push({ type: 'error', message: 'Canvas must have at least one node' });
  } else {
    c.nodes.forEach((node: unknown, index: number) => {
      if (!node || typeof node !== 'object') {
        issues.push({
          type: 'error',
          message: `Node at index ${index} must be an object`,
          path: `nodes[${index}]`,
        });
        return;
      }
      const n = node as Record<string, unknown>;
      const nodePath = `nodes[${index}]`;
      const nodeLabel = n.id || index;

      // Check unknown fields on node based on type
      const nodeType = n.type as string;
      let allowedNodeFields = [...ALLOWED_CANVAS_FIELDS.nodeBase];
      if (nodeType === 'text') {
        allowedNodeFields = [...allowedNodeFields, ...ALLOWED_CANVAS_FIELDS.nodeText];
      } else if (nodeType === 'file') {
        allowedNodeFields = [...allowedNodeFields, ...ALLOWED_CANVAS_FIELDS.nodeFile];
      } else if (nodeType === 'link') {
        allowedNodeFields = [...allowedNodeFields, ...ALLOWED_CANVAS_FIELDS.nodeLink];
      } else if (nodeType === 'group') {
        allowedNodeFields = [...allowedNodeFields, ...ALLOWED_CANVAS_FIELDS.nodeGroup];
      } else if (OTEL_NODE_TYPES.includes(nodeType as (typeof OTEL_NODE_TYPES)[number])) {
        // OTEL node types have their own set of fields
        allowedNodeFields = [...allowedNodeFields, ...ALLOWED_CANVAS_FIELDS.nodeOtel];
      }
      // Custom types can have any base fields
      checkUnknownFields(n, allowedNodeFields, nodePath, issues);

      if (typeof n.id !== 'string' || !n.id) {
        issues.push({
          type: 'error',
          message: `Node at index ${index} must have a string "id"`,
          path: `${nodePath}.id`,
        });
      }
      if (typeof n.type !== 'string') {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" must have a string "type"`,
          path: `${nodePath}.type`,
        });
      }
      if (typeof n.x !== 'number') {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" must have a numeric "x" position`,
          path: `${nodePath}.x`,
        });
      }
      if (typeof n.y !== 'number') {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" must have a numeric "y" position`,
          path: `${nodePath}.y`,
        });
      }
      // Width and height are now REQUIRED (was warning)
      if (typeof n.width !== 'number') {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" must have a numeric "width"`,
          path: `${nodePath}.width`,
        });
      }
      if (typeof n.height !== 'number') {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" must have a numeric "height"`,
          path: `${nodePath}.height`,
        });
      }

      // Validate color requirements based on canvas type
      // - .otel.canvas (events): colors NOT required - derived from scope (border) + span (fill) at render time
      // - .spans.canvas: colors required on span convention nodes (used as fill color for events in that span)
      // - Other canvases: colors required either directly or via nodeType
      const isOtelCanvasForColor = filePath.endsWith('.otel.canvas');
      const isSpansCanvasForColor = filePath.endsWith('.spans.canvas');

      if (!isOtelCanvasForColor) {
        const hasDirectColor = typeof n.color === 'string' && n.color;
        let hasNodeTypeColor = false;

        if (!hasDirectColor && n.pv && typeof n.pv === 'object') {
          const nodePv = n.pv as Record<string, unknown>;
          const nodeTypeName = nodePv.nodeType as string;

          if (typeof nodeTypeName === 'string' && nodeTypeName) {
            // Check if nodeType has a color defined in canvas nodeTypes
            if (c.nodeTypes && typeof c.nodeTypes === 'object') {
              const nodeTypes = c.nodeTypes as Record<string, unknown>;
              const nodeTypeDef = nodeTypes[nodeTypeName];
              if (nodeTypeDef && typeof nodeTypeDef === 'object') {
                const typeDef = nodeTypeDef as Record<string, unknown>;
                if (typeof typeDef.color === 'string' && typeDef.color) {
                  hasNodeTypeColor = true;
                }
              }
            }

            // Check if nodeType has a color defined in library.nodeComponents
            if (!hasNodeTypeColor && library) {
              const nodeComponent = library.nodeComponents[nodeTypeName];
              if (nodeComponent && typeof nodeComponent === 'object') {
                const component = nodeComponent as Record<string, unknown>;
                if (typeof component.color === 'string' && component.color) {
                  hasNodeTypeColor = true;
                }
              }
            }
          }
        }

        // For spans.canvas, require direct color on the node (not via nodeType)
        // This color will be used as the fill color for events emitted within this span
        if (isSpansCanvasForColor) {
          if (!hasDirectColor) {
            issues.push({
              type: 'error',
              message: `Span convention "${nodeLabel}" must have a color`,
              path: `${nodePath}.color`,
              suggestion:
                'Add a "color" field (e.g., "color": "#3B82F6"). This color is used as the fill color for events emitted within this span.',
            });
          }
        } else if (!hasDirectColor && !hasNodeTypeColor) {
          issues.push({
            type: 'error',
            message: `Node "${nodeLabel}" must have a color`,
            path: `${nodePath}`,
            suggestion:
              'Add a "color" field (e.g., "color": "#64748B") or use a pv.nodeType that defines a color',
          });
        }
      }

      // Validate required fields for standard canvas types
      if (nodeType === 'text' && (typeof n.text !== 'string' || !n.text)) {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" has type "text" but is missing required "text" field`,
          path: `${nodePath}.text`,
          suggestion: 'Add a "text" field with markdown content, or change the node type',
        });
      }
      if (nodeType === 'file' && (typeof n.file !== 'string' || !n.file)) {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" has type "file" but is missing required "file" field`,
          path: `${nodePath}.file`,
          suggestion: 'Add a "file" field with a file path, or change the node type',
        });
      }
      if (nodeType === 'link' && (typeof n.url !== 'string' || !n.url)) {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" has type "link" but is missing required "url" field`,
          path: `${nodePath}.url`,
          suggestion: 'Add a "url" field with a URL, or change the node type',
        });
      }

      // Validate node type - must be a standard JSON Canvas type or OTEL type
      const isStandardType = STANDARD_CANVAS_TYPES.includes(
        nodeType as (typeof STANDARD_CANVAS_TYPES)[number]
      );
      const isOtelType = OTEL_NODE_TYPES.includes(nodeType as (typeof OTEL_NODE_TYPES)[number]);

      if (!isStandardType && !isOtelType) {
        issues.push({
          type: 'error',
          message: `Node "${n.id || index}" uses invalid type "${nodeType}"`,
          path: `nodes[${index}].type`,
          suggestion: `Use a standard JSON Canvas type (${STANDARD_CANVAS_TYPES.join(
            ', '
          )}) or OTEL type (${OTEL_NODE_TYPES.join(
            ', '
          )}). For custom shapes, use type: "text" with pv.shape: "${nodeType}"`,
        });
      }

      // Validate OTEL node types have required fields
      if (isOtelType) {
        // OTEL nodes must have a label (except event-namespace which uses namespace.name)
        if (nodeType !== 'event-namespace') {
          if (typeof n.label !== 'string' || !n.label) {
            issues.push({
              type: 'error',
              message: `OTEL node "${n.id || index}" must have a "label" field`,
              path: `${nodePath}.label`,
              suggestion:
                'Add a human-readable label for display (e.g., "User Login", "Process Payment")',
            });
          } else if (n.label === n.id) {
            // Label should not be the same as ID
            const suggestedLabel = idToHumanReadable(n.id as string);
            issues.push({
              type: 'error',
              message: `OTEL node "${n.id}" has label identical to its ID`,
              path: `${nodePath}.label`,
              suggestion: `Labels must be human-readable, not technical identifiers. Try: "${suggestedLabel}"`,
            });
          } else if (typeof n.label === 'string' && /[*_#`\[\]]/.test(n.label)) {
            // Label should not contain markdown formatting
            const cleanLabel = (n.label as string)
              .replace(/\*\*/g, '')
              .replace(/\*/g, '')
              .replace(/_/g, ' ')
              .replace(/^#+\s*/, '')
              .replace(/`/g, '')
              .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
              .trim();
            issues.push({
              type: 'error',
              message: `OTEL node "${n.id}" has markdown formatting in label`,
              path: `${nodePath}.label`,
              suggestion: `Labels should be plain text without markdown. Try: "${cleanLabel}"`,
            });
          }
        }

        // otel-event nodes must have event or eventRef
        if (nodeType === 'otel-event') {
          const hasEvent = n.event && typeof n.event === 'object';
          const hasEventRef = typeof n.eventRef === 'string' && n.eventRef;
          if (!hasEvent && !hasEventRef) {
            issues.push({
              type: 'error',
              message: `OTEL event node "${n.id}" is missing "event" or "eventRef" field`,
              path: `${nodePath}`,
              suggestion:
                'Add an event schema: event: { name: "your.event.name", attributes: {...} } or reference a library event: eventRef: "library.event.name". If migrating from legacy format, run: npx @principal-ai/principal-studio-cli migrate-nodes',
            });
          }

          // otel-event nodes MUST have otel.scope
          const otel = n.otel as Record<string, unknown> | undefined;
          const scope = otel?.scope as string | undefined;
          if (!scope) {
            issues.push({
              type: 'error',
              message: `OTEL event node "${n.id}" is missing required "otel.scope" field`,
              path: `${nodePath}.otel.scope`,
              suggestion:
                'Add otel.scope to specify which instrumentation library emits this event. Example: otel: { scope: "my-service" }. Document scopes in your .scopes.canvas file with otel-scope nodes.',
            });
          }
        }

        // otel-span-convention nodes must have spanPattern in otel
        if (nodeType === 'otel-span-convention') {
          const otel = n.otel as Record<string, unknown> | undefined;
          if (!otel?.spanPattern) {
            issues.push({
              type: 'error',
              message: `Span convention "${n.id}" is missing "otel.spanPattern"`,
              path: `${nodePath}.otel.spanPattern`,
              suggestion:
                'Add the span pattern: otel: { spanPattern: "your.span.pattern" }. This pattern is used to match workflows and color events within this span.',
            });
          }
        }

        // Semantic OTEL nodes must have valid otel.status (except event-namespace)
        if (OTEL_NODE_TYPES.includes(nodeType as (typeof OTEL_NODE_TYPES)[number]) && nodeType !== 'event-namespace') {
          const otel = n.otel as Record<string, unknown> | undefined;
          const validStatuses = ['draft', 'approved', 'implemented'];

          if (otel?.status === undefined) {
            issues.push({
              type: 'error',
              message: `OTEL node "${n.id}" is missing required "otel.status" field`,
              path: `${nodePath}.otel.status`,
              suggestion:
                'Add implementation status: "status": "draft" | "approved" | "implemented". Use "draft" for design, "approved" for finalized design, "implemented" for code with instrumentation.',
            });
          } else if (!validStatuses.includes(otel.status as string)) {
            issues.push({
              type: 'error',
              message: `OTEL node "${n.id}" has invalid status value "${otel.status}"`,
              path: `${nodePath}.otel.status`,
              suggestion: `Valid values: ${validStatuses.join(', ')}`,
            });
          }
        }
      }

      // Validate node pv extension fields
      if (n.pv && typeof n.pv === 'object') {
        const nodePv = n.pv as Record<string, unknown>;

        // Check unknown fields in node pv extension
        checkUnknownFields(nodePv, ALLOWED_CANVAS_FIELDS.nodePv, `${nodePath}.pv`, issues);

        // Validate icon name format (must be PascalCase for Lucide icons)
        validateIconName(nodePv.icon, `${nodePath}.pv.icon`, issues);

        // Check nested pv fields
        if (nodePv.states && typeof nodePv.states === 'object') {
          for (const [stateId, stateDef] of Object.entries(
            nodePv.states as Record<string, unknown>
          )) {
            if (stateDef && typeof stateDef === 'object') {
              checkUnknownFields(
                stateDef as Record<string, unknown>,
                ALLOWED_CANVAS_FIELDS.nodePvState,
                `${nodePath}.pv.states.${stateId}`,
                issues
              );
              // Validate state icon name format
              const state = stateDef as Record<string, unknown>;
              validateIconName(state.icon, `${nodePath}.pv.states.${stateId}.icon`, issues);
            }
          }
        }

        if (nodePv.dataSchema && typeof nodePv.dataSchema === 'object') {
          for (const [fieldName, fieldDef] of Object.entries(
            nodePv.dataSchema as Record<string, unknown>
          )) {
            if (fieldDef && typeof fieldDef === 'object') {
              const field = fieldDef as Record<string, unknown>;
              checkUnknownFields(
                field,
                ALLOWED_CANVAS_FIELDS.nodePvDataSchemaField,
                `${nodePath}.pv.dataSchema.${fieldName}`,
                issues
              );
              // Check required fields
              if (field.description === undefined) {
                issues.push({
                  type: 'error',
                  message: `Missing required field "description" in ${nodePath}.pv.dataSchema.${fieldName}`,
                });
              }
              if (field.placeholder === undefined) {
                issues.push({
                  type: 'error',
                  message: `Missing required field "placeholder" in ${nodePath}.pv.dataSchema.${fieldName}`,
                });
              }
            }
          }
        }

        if (nodePv.layout && typeof nodePv.layout === 'object') {
          checkUnknownFields(
            nodePv.layout as Record<string, unknown>,
            ALLOWED_CANVAS_FIELDS.nodePvLayout,
            `${nodePath}.pv.layout`,
            issues
          );
        }

        if (nodePv.otel && typeof nodePv.otel === 'object') {
          checkUnknownFields(
            nodePv.otel as Record<string, unknown>,
            ALLOWED_CANVAS_FIELDS.nodePvOtel,
            `${nodePath}.pv.otel`,
            issues
          );
        }

        // Validate boundary extension if present
        if (nodePv.boundary && typeof nodePv.boundary === 'object') {
          checkUnknownFields(
            nodePv.boundary as Record<string, unknown>,
            ALLOWED_CANVAS_FIELDS.nodePvBoundary,
            `${nodePath}.pv.boundary`,
            issues
          );

          // Validate boundary direction (required)
          const boundary = nodePv.boundary as Record<string, unknown>;
          const validDirections = ['outbound', 'inbound'];
          if (!boundary.direction || !validDirections.includes(boundary.direction as string)) {
            issues.push({
              type: 'error',
              message: `Node "${nodeLabel}" has invalid or missing boundary.direction`,
              path: `${nodePath}.pv.boundary.direction`,
              suggestion:
                'Use "outbound" for calls to external systems, "inbound" for callbacks from external systems',
            });
          }

          // Validate boundary node query (required)
          if (!boundary.node || typeof boundary.node !== 'object') {
            issues.push({
              type: 'error',
              message: `Node "${nodeLabel}" has boundary but is missing required "node" field`,
              path: `${nodePath}.pv.boundary.node`,
              suggestion:
                'Add node query for resolution, e.g.: "node": { "pv.event.name": "host.event-name" }',
            });
          }
        }

        // Check for conflict: node cannot have both event and eventRef
        if (nodePv.event !== undefined && nodePv.eventRef !== undefined) {
          issues.push({
            type: 'error',
            message: `Node "${nodeLabel}" has both "pv.event" and "pv.eventRef" - only one is allowed`,
            path: `${nodePath}.pv`,
            suggestion:
              'Use "event" for inline event definition, or "eventRef" to reference a library event schema. Remove one of them.',
          });
        }

        // Check for legacy string format: event should be object or use eventRef instead
        if (nodePv.event !== undefined && typeof nodePv.event === 'string') {
          issues.push({
            type: 'error',
            message: `Node "${nodeLabel}" uses deprecated string format for "pv.event": "${nodePv.event}"`,
            path: `${nodePath}.pv.event`,
            suggestion: `Migration options:\n  1. Use "eventRef": "${nodePv.event}" to reference a library event (define in library.yaml under eventSchemas)\n  2. Use "event": { "name": "${nodePv.event}", "attributes": {} } for inline event definition`,
          });
        }

        // Validate that display name doesn't match event name (poor UX)
        // Check both inline event definitions (pv.event.name) and library references (pv.eventRef)
        if (nodeType === 'text' && typeof n.text === 'string') {
          let eventName: string | null = null;

          // Check inline event definition
          if (nodePv.event && typeof nodePv.event === 'object') {
            const eventObj = nodePv.event as { name?: string };
            if (eventObj.name) {
              eventName = eventObj.name;
            }
          }
          // Check library event reference
          else if (nodePv.eventRef && typeof nodePv.eventRef === 'string') {
            eventName = nodePv.eventRef;
          }

          if (eventName) {
            // Extract display name the same way CanvasConverter does
            const displayName = n.text.split('\n')[0].replace(/^#+ /, '').substring(0, 50);
            if (displayName === eventName) {
              issues.push({
                type: 'error',
                message: `Node "${nodeLabel}" has display name identical to event name "${eventName}"`,
                path: `${nodePath}.text`,
                suggestion: `The first line of the text field becomes the node's display name and should be human-readable, not a technical event name.

Current:
  text: "# ${eventName}\\n..."
  ${nodePv.eventRef ? `eventRef: "${eventName}"` : `event.name: "${eventName}"`}

Suggested:
  text: "# [Human-Readable Title]\\n..."
  ${nodePv.eventRef ? `eventRef: "${eventName}"` : `event.name: "${eventName}"`}

Example:
  text: "# Registration Started\\nVersion registration request received"
  ${
    nodePv.eventRef
      ? `eventRef: "version.registration.started"`
      : `event.name: "version.registration.started"`
  }

The display name will be shown large on the node, and the event name will appear below it in smaller monospace font.`,
              });
            }
          }
        }

        // Validate origin and references
        const origin = (nodePv.origin as string) || 'internal';
        const isExternal = origin === 'external';

        // Validate origin value
        if (
          nodePv.origin !== undefined &&
          nodePv.origin !== 'internal' &&
          nodePv.origin !== 'external'
        ) {
          issues.push({
            type: 'error',
            message: `Node "${nodeLabel}" has invalid origin value "${nodePv.origin}"`,
            path: `${nodePath}.pv.origin`,
            suggestion: 'Valid values: "internal" (default), "external"',
          });
        }

        // Deprecation warning for sources field
        if (nodePv.sources !== undefined) {
          issues.push({
            type: 'warning',
            message: `Node "${nodeLabel}" uses deprecated "pv.sources" field`,
            path: `${nodePath}.pv.sources`,
            suggestion:
              'Use "pv.references" instead. The "sources" field will be removed in a future version.',
          });
        }

        // Deprecation warnings for pv.otel.kind and pv.otel.category
        const nodeOtel = nodePv.otel as Record<string, unknown> | undefined;
        if (nodeOtel?.kind !== undefined) {
          issues.push({
            type: 'error',
            message: `Node "${nodeLabel}" uses deprecated "pv.otel.kind" field`,
            path: `${nodePath}.pv.otel.kind`,
            suggestion:
              'Use semantic node types instead. For example, use type: "otel-event" instead of type: "text" with otel.kind: "event". Run: npx @principal-ai/principal-studio-cli migrate-nodes',
          });
        }
        if (nodeOtel?.category !== undefined) {
          issues.push({
            type: 'error',
            message: `Node "${nodeLabel}" uses deprecated "pv.otel.category" field`,
            path: `${nodePath}.pv.otel.category`,
            suggestion:
              'Use semantic node types instead. Run: npx @principal-ai/principal-studio-cli migrate-nodes',
          });
        }

        // When origin is external, references is required
        if (isExternal) {
          if (!Array.isArray(nodePv.references) || nodePv.references.length === 0) {
            issues.push({
              type: 'error',
              message: `Node "${nodeLabel}" has origin "external" but is missing required "pv.references" field`,
              path: `${nodePath}.pv.references`,
              suggestion:
                'Add references to document the external package/service, e.g.: "references": ["@logfire/pydantic-ai"]',
            });
          }
        }

        // Validate source file references for OTEL event nodes (skip boundary nodes)
        const isBoundaryNode = nodePv.nodeType === 'boundary';
        const hasOtelFeatures =
          nodePv.otel !== undefined || nodePv.event !== undefined || nodePv.eventRef !== undefined;
        if (hasOtelFeatures && !isBoundaryNode) {
          // For .otel.canvas files: nodes using legacy pv.event/pv.eventRef should migrate to otel-event type
          if (
            filePath.endsWith('.otel.canvas') &&
            nodeType === 'text' &&
            (nodePv.event !== undefined || nodePv.eventRef !== undefined)
          ) {
            issues.push({
              type: 'error',
              message: `Node "${nodeLabel}" uses legacy format: type "text" with pv.event/pv.eventRef`,
              path: `${nodePath}.type`,
              suggestion:
                'Migrate to semantic type: change type from "text" to "otel-event" and move event/eventRef to top level. Run: npx @principal-ai/principal-studio-cli migrate-nodes',
            });
          }

          // For .otel.canvas files: nodes with OTEL features must have pv.status
          if (filePath.endsWith('.otel.canvas') && nodeType !== 'group') {
            if (nodePv.status === undefined) {
              issues.push({
                type: 'error',
                message: `Node "${nodeLabel}" in .otel.canvas file is missing required "pv.status" field`,
                path: `${nodePath}.pv.status`,
                suggestion:
                  'Add implementation status: "status": "draft" | "approved" | "implemented". Use "draft" for design, "approved" for finalized design, "implemented" for code with instrumentation.',
              });
            } else {
              // Validate status value
              const validStatuses = ['draft', 'approved', 'implemented'];
              if (!validStatuses.includes(nodePv.status as string)) {
                issues.push({
                  type: 'error',
                  message: `Node "${nodeLabel}" has invalid status value "${nodePv.status}"`,
                  path: `${nodePath}.pv.status`,
                  suggestion: `Valid values: ${validStatuses.join(', ')}`,
                });
              }

              // Validate approved and implemented nodes have pv.otel.files (unless external origin)
              const status = nodePv.status as string;
              const otelFiles = (nodePv.otel as Record<string, unknown> | undefined)?.files;
              const hasFiles = Array.isArray(otelFiles) && otelFiles.length > 0;

              // Track if any nodes are implemented for resources/owned-scopes validation
              if (status === 'implemented') {
                hasImplementedNodes = true;
              }

              // External origin nodes don't need pv.otel.files since implementation is in external package
              if ((status === 'approved' || status === 'implemented') && !hasFiles && !isExternal) {
                issues.push({
                  type: 'error',
                  message: `Node "${nodeLabel}" with status="${status}" must have pv.otel.files specified`,
                  path: `${nodePath}.pv.otel.files`,
                  suggestion:
                    'Add file paths where this event is instrumented, e.g.: "otel": { "files": ["src/app/api/route.ts"] }. For external/auto-instrumented events, set "origin": "external" instead.',
                });
              }

              // Validate scope is specified for ALL event nodes (deprecated pv.otel.scope format)
              const legacyScope = (nodePv.otel as Record<string, unknown> | undefined)?.scope;
              if (legacyScope) {
                issues.push({
                  type: 'error',
                  message: `Node "${nodeLabel}" uses deprecated "pv.otel.scope" field`,
                  path: `${nodePath}.pv.otel.scope`,
                  suggestion:
                    'Use new format: convert to type: "otel-event" with top-level "otel.scope" field instead. Run: npx @principal-ai/principal-studio-cli migrate-nodes',
                });
              }

              // For implemented nodes: validate that events exist in the specified files (skip for external origin)
              if (status === 'implemented' && hasFiles && repositoryPath && !isExternal) {
                // Extract event name
                let eventName: string | null = null;
                if (nodePv.event && typeof nodePv.event === 'object') {
                  const eventObj = nodePv.event as { name?: string };
                  eventName = eventObj.name || null;
                } else if (typeof nodePv.eventRef === 'string') {
                  eventName = nodePv.eventRef;
                }

                if (eventName) {
                  (otelFiles as string[]).forEach((file: string, fileIndex: number) => {
                    // Check if file exists
                    const fullPath = resolve(repositoryPath, file);
                    if (!existsSync(fullPath)) {
                      issues.push({
                        type: 'error',
                        message: `Node "${nodeLabel}" references non-existent file in pv.otel.files: ${file}`,
                        path: `${nodePath}.pv.otel.files[${fileIndex}]`,
                        suggestion: `Verify the file path is correct relative to repository root: ${repositoryPath}. If this is an auto-instrumented event from an external library, set "origin": "external" and add "references" to document the external package.`,
                      });
                    } else {
                      // Check if event is in the file
                      try {
                        const content = readFileSync(fullPath, 'utf-8');
                        if (!content.includes(eventName)) {
                          issues.push({
                            type: 'error',
                            message: `Node "${nodeLabel}" is marked as "implemented" but event "${eventName}" not found in file: ${file}`,
                            path: `${nodePath}.pv.otel.files[${fileIndex}]`,
                            suggestion: `Add the event to the file using span.addEvent('${eventName}', { ... }) or change status to "approved" if not yet implemented`,
                          });
                        }
                      } catch (error) {
                        // File read error - already reported above if file doesn't exist
                      }
                    }
                  });
                }
              }
            }
          }
        }

        // Validate source file paths
        if (Array.isArray(nodePv.sources)) {
          nodePv.sources.forEach((source: unknown, sourceIndex: number) => {
            if (typeof source === 'string') {
              // Check for glob patterns
              if (/[*?[\]{}]/.test(source)) {
                issues.push({
                  type: 'error',
                  message: `Node "${nodeLabel}" has glob pattern in sources: ${source}`,
                  path: `${nodePath}.pv.sources[${sourceIndex}]`,
                  suggestion:
                    'Use exact file paths only. Glob patterns (*, ?, [], {}) are not supported in sources.',
                });
              }

              // Check for line number suffix (e.g., "file.ts:123")
              if (/:\d+$/.test(source)) {
                issues.push({
                  type: 'error',
                  message: `Node "${nodeLabel}" has line number suffix in sources: ${source}`,
                  path: `${nodePath}.pv.sources[${sourceIndex}]`,
                  suggestion:
                    'Remove line number suffix. Use exact file paths only (e.g., "src/file.ts" not "src/file.ts:123").',
                });
              }

              // Validate that source file exists (if repository path is provided and not external)
              if (repositoryPath && !isExternal) {
                const fullPath = resolve(repositoryPath, source);

                if (!existsSync(fullPath)) {
                  issues.push({
                    type: 'error',
                    message: `Node "${nodeLabel}" references non-existent source file: ${source}`,
                    path: `${nodePath}.pv.sources[${sourceIndex}]`,
                    suggestion: `Verify the file path is correct relative to repository root: ${repositoryPath}. If this references an external package or auto-instrumented code, set "origin": "external" and use "references" to document the external dependency.`,
                  });
                }
              }
            }
          });
        }

        if (Array.isArray(nodePv.actions)) {
          nodePv.actions.forEach((action: unknown, actionIndex: number) => {
            if (action && typeof action === 'object') {
              checkUnknownFields(
                action as Record<string, unknown>,
                ALLOWED_CANVAS_FIELDS.nodePvAction,
                `${nodePath}.pv.actions[${actionIndex}]`,
                issues
              );
            }
          });
        }

        // Validate pv.nodeType references a defined nodeType
        if (typeof nodePv.nodeType === 'string' && nodePv.nodeType) {
          // Check for legacy OTEL format: type "text" with pv.nodeType set to OTEL type
          const LEGACY_OTEL_NODE_TYPES = [
            'event',
            'span',
            'span-convention',
            'scope',
            'resource',
            'boundary',
          ];
          if (nodeType === 'text' && LEGACY_OTEL_NODE_TYPES.includes(nodePv.nodeType)) {
            const newType =
              nodePv.nodeType === 'span' ? 'otel-span-convention' : `otel-${nodePv.nodeType}`;
            issues.push({
              type: 'error',
              message: `Node "${nodeLabel}" uses legacy format: type "text" with pv.nodeType: "${nodePv.nodeType}"`,
              path: `${nodePath}.type`,
              suggestion: `Migrate to semantic type: change type from "text" to "${newType}". Run: npx @principal-ai/principal-studio-cli migrate-nodes`,
            });
          }

          if (allDefinedNodeTypes.length === 0) {
            issues.push({
              type: 'error',
              message: `Node "${nodeLabel}" uses nodeType "${nodePv.nodeType}" but no node types are defined`,
              path: `${nodePath}.pv.nodeType`,
              suggestion: 'Define node types in canvas pv.nodeTypes or library.yaml nodeComponents',
            });
          } else if (!allDefinedNodeTypes.includes(nodePv.nodeType)) {
            // Build a helpful suggestion showing where types can be defined
            const sources: string[] = [];
            if (canvasNodeTypes.length > 0) {
              sources.push(`canvas pv.nodeTypes: ${canvasNodeTypes.join(', ')}`);
            }
            if (libraryNodeTypes.length > 0) {
              sources.push(`library.yaml nodeComponents: ${libraryNodeTypes.join(', ')}`);
            }
            const suggestion =
              sources.length > 0
                ? `Available types from ${sources.join(' | ')}`
                : 'Define node types in canvas pv.nodeTypes or library.yaml nodeComponents';

            issues.push({
              type: 'error',
              message: `Node "${nodeLabel}" uses undefined nodeType "${nodePv.nodeType}"`,
              path: `${nodePath}.pv.nodeType`,
              suggestion,
            });
          }

          // Validate nodeType is appropriate for the canvas type
          const nodeTypeValue = nodePv.nodeType as string;
          const isResourcesCanvas = filePath.endsWith('resources.canvas');
          const isSpansCanvas = filePath.endsWith('.spans.canvas');
          const isOtelCanvas = filePath.endsWith('.otel.canvas');

          if (isResourcesCanvas) {
            const validResourceTypes = ['resource', 'scope'];
            if (!validResourceTypes.includes(nodeTypeValue)) {
              issues.push({
                type: 'error',
                message: `Node "${nodeLabel}" in resources.canvas has invalid pv.nodeType "${nodeTypeValue}"`,
                path: `${nodePath}.pv.nodeType`,
                suggestion: `Migrate to semantic types: use type: "otel-resource" or type: "otel-scope" instead of pv.nodeType. Run: npx @principal-ai/principal-studio-cli migrate-nodes`,
              });
            }
          } else if (isSpansCanvas) {
            const validSpanTypes = ['span-convention'];
            if (!validSpanTypes.includes(nodeTypeValue)) {
              issues.push({
                type: 'error',
                message: `Node "${nodeLabel}" in .spans.canvas has invalid pv.nodeType "${nodeTypeValue}"`,
                path: `${nodePath}.pv.nodeType`,
                suggestion: `Migrate to semantic types: use type: "otel-span-convention" instead of pv.nodeType. Run: npx @principal-ai/principal-studio-cli migrate-nodes`,
              });
            }
          } else if (isOtelCanvas) {
            const validOtelTypes = ['event', 'boundary'];
            if (!validOtelTypes.includes(nodeTypeValue)) {
              issues.push({
                type: 'error',
                message: `Node "${nodeLabel}" in .otel.canvas has invalid pv.nodeType "${nodeTypeValue}"`,
                path: `${nodePath}.pv.nodeType`,
                suggestion: `Migrate to semantic types: use type: "otel-event" or type: "otel-boundary" instead of pv.nodeType. Run: npx @principal-ai/principal-studio-cli migrate-nodes`,
              });
            }
          }
        }
      }
    });

    // Check for text nodes that contain other nodes (suggest using group nodes instead)
    const nodesWithBounds: NodeRect[] = (c.nodes as Array<Record<string, unknown>>)
      .filter(
        (n) =>
          n &&
          typeof n.x === 'number' &&
          typeof n.y === 'number' &&
          typeof n.width === 'number' &&
          typeof n.height === 'number' &&
          typeof n.id === 'string'
      )
      .map((n) => ({
        id: n.id as string,
        x: n.x as number,
        y: n.y as number,
        width: n.width as number,
        height: n.height as number,
      }));

    for (const textNode of nodesWithBounds) {
      const allNodes = c.nodes as Array<Record<string, unknown>> | undefined;
      const nodeData = allNodes?.find((n) => n.id === textNode.id);
      if (!nodeData || nodeData.type !== 'text') continue;

      const containedNonTextNodes = nodesWithBounds.filter((other) => {
        if (other.id === textNode.id) return false;
        const otherNode = allNodes?.find((n) => n.id === other.id);
        if (!otherNode || otherNode.type === 'text') return false;
        return (
          other.x >= textNode.x &&
          other.y >= textNode.y &&
          other.x + other.width <= textNode.x + textNode.width &&
          other.y + other.height <= textNode.y + textNode.height
        );
      });

      if (containedNonTextNodes.length > 0) {
        const textNodeLabel =
          (nodeData.pv &&
            typeof nodeData.pv === 'object' &&
            ((nodeData.pv as Record<string, unknown>).label as string)) ||
          textNode.id;

        issues.push({
          type: 'warning',
          message: `Text node "${textNodeLabel}" contains ${
            containedNonTextNodes.length
          } other node(s): ${containedNonTextNodes.map((n) => `"${n.id}"`).join(', ')}`,
          path: `nodes[${allNodes?.findIndex((n) => n.id === textNode.id)}].type`,
          suggestion:
            'Consider using type "group" instead of type "text" for container nodes that visually wrap other nodes',
        });
      }
    }
  }

  // For .otel.canvas files: warn if library.yaml is missing
  if (filePath.endsWith('.otel.canvas') && !library) {
    issues.push({
      type: 'warning',
      message: 'Found otel.canvas file but no library.yaml',
      path: 'library.yaml',
      suggestion:
        'Create .principal-views/library.yaml to register your instrumentation library.\nThis ensures traces are properly attributed to your library.',
    });
  }

  // For .otel.canvas files with implemented nodes: validate library has resources with owned-scopes
  if (filePath.endsWith('.otel.canvas') && hasImplementedNodes) {
    const resources = library?.raw?.resources as
      | Record<string, Record<string, unknown>>
      | undefined;

    if (!resources || Object.keys(resources).length === 0) {
      issues.push({
        type: 'error',
        message: 'Canvas has implemented nodes but library.yaml is missing "resources" section',
        path: 'library.yaml:resources',
        suggestion:
          'Add a resources section to library.yaml defining your services and their owned-scopes:\n  resources:\n    my-service:\n      service.name: "my-service"\n      owned-scopes:\n        - "my-instrumentation-scope"',
      });
    } else {
      // Check that at least one resource has owned-scopes
      const hasOwnedScopes = Object.values(resources).some(
        (resource) => Array.isArray(resource['owned-scopes']) && resource['owned-scopes'].length > 0
      );

      if (!hasOwnedScopes) {
        issues.push({
          type: 'error',
          message:
            'Canvas has implemented nodes but no resources in library.yaml have "owned-scopes" defined',
          path: 'library.yaml:resources',
          suggestion:
            'Add owned-scopes to at least one resource to specify which instrumentation scopes belong to your services:\n  resources:\n    my-service:\n      service.name: "my-service"\n      owned-scopes:\n        - "my-instrumentation-scope"',
        });
      }
    }
  }

  // Check edges (required)
  if (c.edges === undefined) {
    issues.push({ type: 'error', message: 'Canvas must have an "edges" array' });
  } else if (!Array.isArray(c.edges)) {
    issues.push({ type: 'error', message: '"edges" must be an array' });
  } else if (c.edges.length === 0) {
    issues.push({ type: 'error', message: 'Canvas must have at least one edge' });
  } else if (Array.isArray(c.edges)) {
    const nodeIds = new Set((c.nodes as Array<{ id: string }>)?.map((n) => n.id) || []);

    c.edges.forEach((edge: unknown, index: number) => {
      if (!edge || typeof edge !== 'object') {
        issues.push({
          type: 'error',
          message: `Edge at index ${index} must be an object`,
          path: `edges[${index}]`,
        });
        return;
      }
      const e = edge as Record<string, unknown>;
      const edgePath = `edges[${index}]`;
      const edgeLabel = e.id || index;

      // Check unknown fields on edge
      checkUnknownFields(e, ALLOWED_CANVAS_FIELDS.edge, edgePath, issues);

      if (typeof e.id !== 'string' || !e.id) {
        issues.push({
          type: 'error',
          message: `Edge at index ${index} must have a string "id"`,
          path: `${edgePath}.id`,
        });
      }
      if (typeof e.fromNode !== 'string') {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" must have a string "fromNode"`,
          path: `${edgePath}.fromNode`,
        });
      } else if (!nodeIds.has(e.fromNode)) {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" references unknown node "${e.fromNode}"`,
          path: `${edgePath}.fromNode`,
        });
      }
      if (typeof e.toNode !== 'string') {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" must have a string "toNode"`,
          path: `${edgePath}.toNode`,
        });
      } else if (!nodeIds.has(e.toNode)) {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" references unknown node "${e.toNode}"`,
          path: `${edgePath}.toNode`,
        });
      }

      // Validate fromSide and toSide are present and valid (optional for event-namespace canvases)
      const isEventNamespaceCanvas = c.type === 'event-namespace';
      const VALID_SIDES = ['top', 'right', 'bottom', 'left'] as const;

      if (!isEventNamespaceCanvas) {
        if (typeof e.fromSide !== 'string') {
          issues.push({
            type: 'error',
            message: `Edge "${edgeLabel}" must have a "fromSide" field`,
            path: `${edgePath}.fromSide`,
            suggestion: `Specify which side of the source node the edge starts from: ${VALID_SIDES.join(
              ', '
            )}`,
          });
        } else if (!VALID_SIDES.includes(e.fromSide as (typeof VALID_SIDES)[number])) {
          issues.push({
            type: 'error',
            message: `Edge "${edgeLabel}" has invalid fromSide "${e.fromSide}"`,
            path: `${edgePath}.fromSide`,
            suggestion: `Valid values: ${VALID_SIDES.join(', ')}`,
          });
        }
        if (typeof e.toSide !== 'string') {
          issues.push({
            type: 'error',
            message: `Edge "${edgeLabel}" must have a "toSide" field`,
            path: `${edgePath}.toSide`,
            suggestion: `Specify which side of the target node the edge connects to: ${VALID_SIDES.join(
              ', '
            )}`,
          });
        } else if (!VALID_SIDES.includes(e.toSide as (typeof VALID_SIDES)[number])) {
          issues.push({
            type: 'error',
            message: `Edge "${edgeLabel}" has invalid toSide "${e.toSide}"`,
            path: `${edgePath}.toSide`,
            suggestion: `Valid values: ${VALID_SIDES.join(', ')}`,
          });
        }
      } else if (e.fromSide || e.toSide) {
        // If sides are provided in event-namespace canvas, they must be valid
        if (e.fromSide && !VALID_SIDES.includes(e.fromSide as (typeof VALID_SIDES)[number])) {
          issues.push({
            type: 'error',
            message: `Edge "${edgeLabel}" has invalid fromSide "${e.fromSide}"`,
            path: `${edgePath}.fromSide`,
            suggestion: `Valid values: ${VALID_SIDES.join(', ')}`,
          });
        }
        if (e.toSide && !VALID_SIDES.includes(e.toSide as (typeof VALID_SIDES)[number])) {
          issues.push({
            type: 'error',
            message: `Edge "${edgeLabel}" has invalid toSide "${e.toSide}"`,
            path: `${edgePath}.toSide`,
            suggestion: `Valid values: ${VALID_SIDES.join(', ')}`,
          });
        }
      }

      // Check for deprecated pv field on edge
      if (e.pv !== undefined) {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" has deprecated "pv" field. Use top-level "edgeType" instead.`,
          path: `${edgePath}.pv`,
          suggestion:
            'Move pv.edgeType to top-level "edgeType" and remove the "pv" field. ' +
            'Example: { "id": "e1", "fromNode": "a", "toNode": "b", "edgeType": "data-flow" }',
        });
      }

      // Validate top-level edgeType is present
      if (typeof e.edgeType !== 'string' || !e.edgeType) {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" must have an "edgeType" field`,
          path: `${edgePath}.edgeType`,
          suggestion:
            allDefinedEdgeTypes.length > 0
              ? `Available types: ${allDefinedEdgeTypes.join(', ')}`
              : 'Define edge types in canvas pv.edgeTypes or library.yaml edgeComponents',
        });
      }

      // Validate edge pv extension fields
      if (e.pv && typeof e.pv === 'object') {
        const edgePv = e.pv as Record<string, unknown>;

        // Check unknown fields in edge pv extension
        checkUnknownFields(edgePv, ALLOWED_CANVAS_FIELDS.edgePv, `${edgePath}.pv`, issues);

        // Check nested edge pv fields
        if (edgePv.animation && typeof edgePv.animation === 'object') {
          checkUnknownFields(
            edgePv.animation as Record<string, unknown>,
            ALLOWED_CANVAS_FIELDS.edgePvAnimation,
            `${edgePath}.pv.animation`,
            issues
          );
        }

        if (Array.isArray(edgePv.activatedBy)) {
          edgePv.activatedBy.forEach((trigger: unknown, triggerIndex: number) => {
            if (trigger && typeof trigger === 'object') {
              checkUnknownFields(
                trigger as Record<string, unknown>,
                ALLOWED_CANVAS_FIELDS.edgePvActivatedBy,
                `${edgePath}.pv.activatedBy[${triggerIndex}]`,
                issues
              );
            }
          });
        }

      }

      // Validate edge type references (using top-level edgeType)
      if (e.edgeType && typeof e.edgeType === 'string') {
        if (allDefinedEdgeTypes.length === 0) {
          issues.push({
            type: 'error',
            message: `Edge "${edgeLabel}" uses edgeType "${e.edgeType}" but no edge types are defined`,
            path: `${edgePath}.edgeType`,
            suggestion: 'Define edge types in canvas pv.edgeTypes or library.yaml edgeComponents',
          });
        } else if (!allDefinedEdgeTypes.includes(e.edgeType as string)) {
          // Build a helpful suggestion showing where types can be defined
          const sources: string[] = [];
          if (canvasEdgeTypes.length > 0) {
            sources.push(`canvas pv.edgeTypes: ${canvasEdgeTypes.join(', ')}`);
          }
          if (libraryEdgeTypes.length > 0) {
            sources.push(`library.yaml edgeComponents: ${libraryEdgeTypes.join(', ')}`);
          }
          const suggestion =
            sources.length > 0
              ? `Available types from ${sources.join(' | ')}`
              : 'Define edge types in canvas pv.edgeTypes or library.yaml edgeComponents';

          issues.push({
            type: 'error',
            message: `Edge "${edgeLabel}" uses undefined edgeType "${e.edgeType}"`,
            path: `${edgePath}.edgeType`,
            suggestion,
          });
        }
      }
    });
  }

  // Validate OTEL canvas naming convention
  const hasOtel = hasOtelFeatures(canvas);
  const isOtelCanvas = filePath.endsWith('.otel.canvas');
  const isScopesCanvas = filePath.endsWith('.scopes.canvas');
  const isSpansCanvas = filePath.endsWith('.spans.canvas');
  const isEventsCanvas = filePath.endsWith('.events.canvas');
  const isEventNamespaceCanvas = (canvas as Record<string, unknown>).type === 'event-namespace';

  if (hasOtel && !isOtelCanvas && !isScopesCanvas && !isSpansCanvas && !isEventsCanvas) {
    issues.push({
      type: 'error',
      message: 'Canvas contains OTEL features but does not use .otel.canvas naming convention',
      suggestion: 'Rename file to use .otel.canvas extension (e.g., "graph-name.otel.canvas")',
    });
  } else if (!hasOtel && isOtelCanvas && !isEventNamespaceCanvas) {
    issues.push({
      type: 'warning',
      message: 'Canvas uses .otel.canvas naming but does not contain any OTEL features',
      suggestion:
        'Either add OTEL features (otel-event, otel-span-convention, otel-scope, otel-resource nodes, or pv.otel, pv.scope, pv.audit) or rename to .canvas',
    });
  }

  // Validate markdown field for all canvas files (now at top level)
  if (typeof c.markdown !== 'string' || !c.markdown) {
    issues.push({
      type: 'error',
      message: 'Canvas files must have a top-level "markdown" field pointing to documentation',
      path: 'markdown',
      suggestion: `Add: "markdown": ".principal-views/graph-name.md"

The markdown file should explain the FEATURE, not the canvas itself.

Good: "Task management lets users create, edit, and archive tasks.
       Tasks move through a lifecycle from draft → active → archive..."

Bad:  "This canvas shows telemetry events. The task.create.started
       event is emitted when..."

The canvas shows HOW ${
        isOtelCanvas ? 'we instrument it' : 'it works'
      }. The markdown explains WHAT the feature does and WHY.

Include:
- What problem does this feature solve?
- What operations are available?
- What design choices were made and why?
- Common workflow patterns
- Error scenarios and recovery

The canvas is visual documentation. The markdown supplements it with context.`,
    });
  } else {
    // Validate that the markdown file exists
    // Try to resolve relative to repository root, or relative to canvas directory if no repository path
    let markdownPath: string;
    if (repositoryPath) {
      markdownPath = resolve(repositoryPath, c.markdown as string);
    } else {
      // If no repository path, try to find the repository root by looking for .principal-views parent
      const canvasDir = dirname(filePath);
      const principalViewsIndex = canvasDir.lastIndexOf('.principal-views');
      if (principalViewsIndex !== -1) {
        const repoRoot = canvasDir.substring(0, principalViewsIndex);
        markdownPath = resolve(repoRoot, c.markdown as string);
      } else {
        // Fallback: resolve relative to canvas directory
        markdownPath = resolve(canvasDir, c.markdown as string);
      }
    }

    if (!existsSync(markdownPath)) {
      issues.push({
        type: 'error',
        message: `Referenced markdown file does not exist: ${c.markdown}`,
        path: 'markdown',
        suggestion: `Create the markdown file at: ${markdownPath}

The markdown should explain the FEATURE (what it does, why it exists), not describe the canvas itself.
The canvas shows HOW ${
          isOtelCanvas ? 'we instrument it' : 'it works'
        }. The markdown explains WHAT the feature does and WHY.

Example structure:
- What problem does this feature solve?
- What operations are available?
- What design choices were made and why?
- Common workflow patterns
- Error scenarios and recovery`,
      });
    }
  }

  // Validate that scopes used in OTEL canvas are documented in scopes canvas
  if (filePath.endsWith('.otel.canvas') && scopesCanvas) {
    // Extract scopes documented in scopes canvas
    const documentedScopes = new Set<string>();
    if (Array.isArray(scopesCanvas.nodes)) {
      for (const node of scopesCanvas.nodes) {
        if (node.type === 'otel-scope' && (node as any).otel?.scope) {
          documentedScopes.add((node as any).otel.scope);
        }
      }
    }

    // Extract scopes used in this canvas
    const usedScopes = new Set<string>();
    if (Array.isArray(c.nodes)) {
      for (const node of c.nodes as Array<Record<string, unknown>>) {
        // Check OTEL nodes with otel.scope
        if (node.type && typeof node.type === 'string' && node.type.startsWith('otel-')) {
          const otelScope = (node.otel as Record<string, unknown> | undefined)?.scope;
          if (typeof otelScope === 'string') {
            usedScopes.add(otelScope);
          }
        }
      }
    }

    // Check for undocumented scopes
    for (const scope of usedScopes) {
      if (!documentedScopes.has(scope)) {
        issues.push({
          type: 'error',
          message: `Scope "${scope}" is used in this canvas but not documented in architecture.scopes.canvas`,
          path: 'nodes[].otel.scope',
          suggestion: `Add a node to architecture.scopes.canvas with:
{
  "type": "otel-scope",
  "label": "${scope.split('.').pop() || scope}",
  "otel": {
    "scope": "${scope}",
    "status": "implemented"
  }
}

All scopes must be documented in architecture.scopes.canvas before being used in workflow canvases.`,
        });
      }
    }
  }

  return issues;
}

/**
 * Validate a workflow template
 */
async function validateWorkflow(
  filePath: string,
  allWorkflowEvents: Set<string> | undefined,
  repositoryPath: string,
  executionFiles?: string[],
  eventRegistry?: EventRegistry
): Promise<ValidationResult> {
  const relativePath = relative(repositoryPath, filePath);

  if (!existsSync(filePath)) {
    return {
      file: relativePath,
      fileType: 'workflow',
      isValid: false,
      issues: [{ type: 'error', message: `File not found: ${filePath}` }],
    };
  }

  try {
    const workflow = loadWorkflowTemplate(filePath);
    if (!workflow) {
      return {
        file: relativePath,
        fileType: 'workflow',
        isValid: false,
        issues: [{ type: 'error', message: 'Could not parse workflow file' }],
      };
    }

    // Load referenced canvas if it exists
    // Canvas paths are always relative to repository root
    const canvasPath = workflow.canvas ? resolve(repositoryPath, workflow.canvas) : undefined;
    const canvas =
      canvasPath && existsSync(canvasPath)
        ? (JSON.parse(readFileSync(canvasPath, 'utf8')) as ExtendedCanvas)
        : undefined;

    // Validate using workflow validator
    const validator = createWorkflowValidator(new NodeFileSystemAdapter());
    const rawContent = readFileSync(filePath, 'utf8');

    const result = await validator.validate({
      workflow,
      workflowPath: relativePath,
      canvas,
      canvasPath,
      basePath: repositoryPath,
      rawContent,
      allWorkflowEvents,
      executionFiles,
      eventRegistry,
    });

    // Convert workflow violations to validation issues
    const issues: ValidationIssue[] = result.violations.map((v) => ({
      type: v.severity === 'error' ? 'error' : 'warning',
      message: v.message,
      path: v.path,
      suggestion: v.suggestion,
    }));

    return {
      file: relativePath,
      fileType: 'workflow',
      isValid: result.errorCount === 0,
      issues,
    };
  } catch (error) {
    return {
      file: relativePath,
      fileType: 'workflow',
      isValid: false,
      issues: [{ type: 'error', message: `Failed to validate: ${(error as Error).message}` }],
    };
  }
}

/**
 * Validate a test trace artifact (.otel.json file)
 */
function validateExecution(filePath: string, repositoryPath: string): ValidationResult {
  const relativePath = relative(repositoryPath, filePath);

  if (!existsSync(filePath)) {
    return {
      file: relativePath,
      fileType: 'testTrace',
      isValid: false,
      issues: [{ type: 'error', message: `File not found: ${filePath}` }],
    };
  }

  try {
    const data = loadExecutionFile(filePath);
    if (!data) {
      return {
        file: relativePath,
        fileType: 'testTrace',
        isValid: false,
        issues: [{ type: 'error', message: 'Could not parse test trace file' }],
      };
    }

    // Validate using execution validator
    const validator = createExecutionValidator();
    const result = validator.validate(data, relativePath);

    // Check if matching canvas exists
    const { canvasPath, workflowPath } = findMatchingCanvas(filePath, repositoryPath);
    if (!canvasPath) {
      const fileName = basename(filePath);
      const traceDir = dirname(filePath);

      if (workflowPath) {
        // Workflow found but its canvas reference is invalid
        const workflowName = basename(workflowPath);
        try {
          const workflowContent = readFileSync(workflowPath, 'utf8');
          const workflow = JSON.parse(workflowContent);
          const canvasRef = workflow.canvas || '(no canvas field)';
          result.errors.push({
            path: relativePath,
            message: `Workflow '${workflowName}' references canvas that doesn't exist: ${canvasRef}`,
            severity: 'error',
            suggestion: `Check the 'canvas' field in ${relative(
              repositoryPath,
              workflowPath
            )} and ensure the referenced canvas file exists`,
          });
        } catch {
          result.errors.push({
            path: relativePath,
            message: `Found workflow '${workflowName}' but it could not be parsed`,
            severity: 'error',
            suggestion: `Check that ${relative(repositoryPath, workflowPath)} is valid JSON`,
          });
        }
      } else {
        // No workflow found - provide guidance on expected structure
        result.errors.push({
          path: relativePath,
          message: 'No co-located workflow file found for test trace',
          severity: 'error',
          suggestion: `Test traces should be co-located with a workflow file. Expected structure:
  ${relative(repositoryPath, traceDir)}/
    ├── <workflow-name>.workflow.json  (with 'canvas' field referencing the canvas)
    └── ${fileName}

The workflow's 'canvas' field should point to the canvas this trace validates against.`,
        });
      }
      result.valid = false;
    }

    // Convert execution validation result to validation issues
    const issues: ValidationIssue[] = [
      ...result.errors.map((e) => ({
        type: 'error' as const,
        message: e.message,
        path: e.path,
        suggestion: e.suggestion,
      })),
      ...result.warnings.map((w) => ({
        type: 'warning' as const,
        message: w.message,
        path: w.path,
        suggestion: w.suggestion,
      })),
    ];

    return {
      file: relativePath,
      fileType: 'testTrace',
      isValid: result.valid,
      issues,
    };
  } catch (error) {
    return {
      file: relativePath,
      fileType: 'testTrace',
      isValid: false,
      issues: [{ type: 'error', message: `Failed to validate: ${(error as Error).message}` }],
    };
  }
}

/**
 * Validate a .dashboard.json file
 */
function validateDashboard(
  filePath: string,
  repositoryPath: string,
  context?: DashboardValidationContext
): ValidationResult {
  const relativePath = relative(repositoryPath, filePath);

  if (!existsSync(filePath)) {
    return {
      file: relativePath,
      fileType: 'dashboard',
      isValid: false,
      issues: [{ type: 'error', message: `File not found: ${filePath}` }],
    };
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Validate using dashboard validator with optional cross-reference context
    const validator = createDashboardValidator();
    const result = validator.validate(data, relativePath, context);

    // Convert dashboard validation result to validation issues
    const issues: ValidationIssue[] = [
      ...result.errors.map((e) => ({
        type: 'error' as const,
        message: e.message,
        path: e.path,
        suggestion: e.suggestion,
      })),
      ...result.warnings.map((w) => ({
        type: 'warning' as const,
        message: w.message,
        path: w.path,
        suggestion: w.suggestion,
      })),
    ];

    return {
      file: relativePath,
      fileType: 'dashboard',
      isValid: result.valid,
      issues,
    };
  } catch (error) {
    return {
      file: relativePath,
      fileType: 'dashboard',
      isValid: false,
      issues: [{ type: 'error', message: `Failed to validate: ${(error as Error).message}` }],
    };
  }
}

/**
 * Validate a single .canvas file
 */
function validateFile(
  filePath: string,
  library: LoadedLibrary | null,
  repositoryPath?: string,
  scopesCanvas?: ExtendedCanvas
): ValidationResult {
  const absolutePath = repositoryPath ? resolve(repositoryPath, filePath) : resolve(filePath);
  const relativePath = relative(repositoryPath || process.cwd(), absolutePath);

  if (!existsSync(absolutePath)) {
    return {
      file: relativePath,
      fileType: 'canvas',
      isValid: false,
      issues: [{ type: 'error', message: `File not found: ${filePath}` }],
    };
  }

  try {
    const content = readFileSync(absolutePath, 'utf8');
    const canvas = JSON.parse(content);
    const issues = validateCanvas(canvas, relativePath, library, repositoryPath, scopesCanvas);
    const hasErrors = issues.some((i) => i.type === 'error');

    return {
      file: relativePath,
      fileType: 'canvas',
      isValid: !hasErrors,
      issues,
      canvas: hasErrors ? undefined : canvas,
    };
  } catch (error) {
    return {
      file: relativePath,
      fileType: 'canvas',
      isValid: false,
      issues: [{ type: 'error', message: `Failed to parse JSON: ${(error as Error).message}` }],
    };
  }
}

/**
 * Output validation results, organized by file type
 */
function outputResults(
  results: ValidationResult[],
  libraryResult: ValidationResult | null,
  options: { json?: boolean; quiet?: boolean },
  targetedValidation: boolean = false
) {
  const allResults = libraryResult ? [libraryResult, ...results] : results;
  const validCount = allResults.filter((r) => r.isValid).length;
  const invalidCount = allResults.length - validCount;

  // Group by file type
  const byType = {
    canvas: allResults.filter((r) => r.fileType === 'canvas'),
    workflow: allResults.filter((r) => r.fileType === 'workflow'),
    testTrace: allResults.filter((r) => r.fileType === 'testTrace'),
    library: allResults.filter((r) => r.fileType === 'library'),
    dashboard: allResults.filter((r) => r.fileType === 'dashboard'),
  };

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          files: allResults,
          summary: {
            total: allResults.length,
            valid: validCount,
            invalid: invalidCount,
            byType: {
              canvas: byType.canvas.length,
              workflow: byType.workflow.length,
              testTrace: byType.testTrace.length,
              library: byType.library.length,
              dashboard: byType.dashboard.length,
            },
          },
        },
        null,
        2
      )
    );
  } else {
    if (!options.quiet) {
      const counts = [];
      if (byType.canvas.length > 0) counts.push(`${byType.canvas.length} canvas`);
      if (byType.workflow.length > 0) counts.push(`${byType.workflow.length} workflow`);
      if (byType.testTrace.length > 0) counts.push(`${byType.testTrace.length} test trace`);
      if (byType.library.length > 0) counts.push(`${byType.library.length} library`);
      if (byType.dashboard.length > 0) counts.push(`${byType.dashboard.length} dashboard`);

      console.log(chalk.bold(`\nValidating ${counts.join(', ')} file(s)...\n`));
    }

    // Output by type for better organization
    const outputByType = (type: string, results: ValidationResult[]) => {
      if (results.length === 0) return;

      if (!options.quiet) {
        console.log(chalk.bold(`${type.charAt(0).toUpperCase() + type.slice(1)} Files:`));
      }

      for (const result of results) {
        if (result.isValid) {
          if (!options.quiet) {
            console.log(chalk.green(`✓ ${result.file}`));
            const warnings = result.issues.filter((i) => i.type === 'warning');
            if (warnings.length > 0) {
              warnings.forEach((w) => {
                console.log(chalk.yellow(`  ⚠ ${w.message}`));
              });
            }
          }
        } else {
          console.log(chalk.red(`✗ ${result.file}`));
          result.issues.forEach((issue) => {
            const label = issue.type === 'error' ? 'error' : 'warning';
            const color = issue.type === 'error' ? chalk.red : chalk.yellow;
            console.log(color(`    ${label}: ${issue.message}`));
            if (issue.suggestion) {
              console.log(chalk.dim(`      → ${issue.suggestion}`));
            }
          });
        }
      }
      if (!options.quiet) console.log('');
    };

    // Output in logical order
    outputByType('Library', byType.library);
    outputByType('Canvas', byType.canvas);
    outputByType('Workflow', byType.workflow);
    outputByType('Test Trace', byType.testTrace);
    outputByType('Dashboard', byType.dashboard);

    // Summary
    if (invalidCount === 0) {
      console.log(chalk.green(`✓ All ${validCount} file(s) are valid`));
      if (targetedValidation) {
        console.log(
          chalk.dim(
            `\nTip: Run the validate command without arguments for comprehensive validation of all artifacts.`
          )
        );
      }
    } else {
      console.log(chalk.red(`✗ ${invalidCount} of ${allResults.length} file(s) failed validation`));
    }
  }

  // Exit with error if validation failed
  if (invalidCount > 0) {
    process.exit(1);
  }
}

export function createValidateCommand(): Command {
  const command = new Command('validate');

  command
    .description('Validate all Principal View artifacts (canvas, workflow, test trace files)')
    .argument(
      '[files...]',
      'Files or glob patterns to validate (defaults to all Principal View files)'
    )
    .option('-q, --quiet', 'Only output errors')
    .option('--json', 'Output results as JSON')
    .option(
      '-r, --repository <path>',
      'Repository root path for validating source file references (defaults to current directory)'
    )
    .option('--canvas-only', 'Only validate canvas files')
    .option('--workflow-only', 'Only validate workflow files')
    .option('--execution-only', 'Only validate test trace files')
    .action(async (files: string[], options) => {
      try {
        // Determine repository path for source file validation
        const repositoryPath = options.repository ? resolve(options.repository) : process.cwd();

        // If specific files are provided, validate each based on its type
        if (files.length > 0) {
          const matchedFiles = await globby(files, {
            expandDirectories: false,
          });

          if (matchedFiles.length === 0) {
            if (options.json) {
              console.log(
                JSON.stringify({ files: [], summary: { total: 0, valid: 0, invalid: 0 } })
              );
            } else {
              console.log(chalk.yellow('No files found matching the specified patterns.'));
              console.log(chalk.dim(`Patterns searched: ${files.join(', ')}`));
            }
            return;
          }

          const library = loadLibrary(resolve(repositoryPath, '.principal-views'));

          // Helper to extract storyboard name from a path
          const extractStoryboardName = (filePath: string): string | null => {
            const parts = filePath.split('/');
            const pvIndex = parts.indexOf('.principal-views');
            if (pvIndex === -1 || parts.length < pvIndex + 2) {
              return null;
            }
            return parts[pvIndex + 1];
          };

          // PHASE 1: Group workflows by canvas and collect all events used
          // Only include co-located workflows (same storyboard folder) for event coverage
          const workflowsByCanvas = new Map<string, Set<string>>();
          const workflowFiles: string[] = [];
          const canvasFiles: string[] = [];
          const testTraceFiles: string[] = [];
          const dashboardFiles: string[] = [];
          let libraryFile: string | null = null;

          // First pass: categorize files and build workflow event map
          for (const file of matchedFiles) {
            const fileType = determineFileType(file);
            const absolutePath = resolve(file);

            // Skip unknown file types (e.g., .md files)
            if (fileType === 'unknown') {
              continue;
            }

            if (fileType === 'canvas') {
              canvasFiles.push(file);
            } else if (fileType === 'workflow') {
              workflowFiles.push(absolutePath);

              // Load workflow and collect events
              const workflow = loadWorkflowTemplate(absolutePath);
              if (workflow && workflow.canvas) {
                const canvasPath = resolve(repositoryPath, workflow.canvas);
                const canvasKey = relative(repositoryPath, canvasPath);

                // Only include events from workflows that are co-located with the canvas
                // (same storyboard folder). Cross-referenced workflows are validated separately.
                const workflowRelativePath = relative(repositoryPath, absolutePath);
                const workflowStoryboard = extractStoryboardName(workflowRelativePath);
                const canvasStoryboard = extractStoryboardName(workflow.canvas);

                if (workflowStoryboard !== canvasStoryboard) {
                  // Skip cross-referenced workflows for event coverage calculation
                  continue;
                }

                // Collect events from this workflow
                if (!workflowsByCanvas.has(canvasKey)) {
                  workflowsByCanvas.set(canvasKey, new Set<string>());
                }
                const workflowEvents = workflowsByCanvas.get(canvasKey)!;

                for (const scenario of workflow.scenarios) {
                  if (scenario.template?.events) {
                    for (const eventName of Object.keys(scenario.template.events)) {
                      if (!eventName.includes('*')) {
                        workflowEvents.add(eventName);
                      }
                    }
                  }
                }
              }
            } else if (fileType === 'testTrace') {
              testTraceFiles.push(absolutePath);
            } else if (fileType === 'dashboard') {
              dashboardFiles.push(absolutePath);
            } else if (fileType === 'library') {
              libraryFile = file;
            }
          }

          // PHASE 2: Validate canvases and build EventRegistry
          const results: ValidationResult[] = [];
          const parsedCanvases = new Map<string, ExtendedCanvas>();

          for (const file of canvasFiles) {
            const validationResult = validateFile(file, library, repositoryPath);

            // Check if this canvas has any associated workflow files
            // Only check for .otel.canvas files (workflows are for telemetry scenarios)
            const isOtelCanvas = file.endsWith('.otel.canvas');
            const hasErrors = validationResult.issues.some((i) => i.type === 'error');
            if (isOtelCanvas && !hasErrors) {
              const absoluteCanvasPath = resolve(repositoryPath, file);
              const associatedWorkflows = findWorkflowsForCanvas(
                absoluteCanvasPath,
                repositoryPath
              );

              // Also check if any workflows were passed to validation that reference this canvas
              const canvasRelPath = relative(repositoryPath, absoluteCanvasPath);
              const passedWorkflowsForCanvas = workflowsByCanvas.has(canvasRelPath);

              if (associatedWorkflows.length === 0 && !passedWorkflowsForCanvas) {
                validationResult.isValid = false;
                validationResult.issues.push({
                  type: 'error',
                  message: 'No workflow files found for this .otel.canvas',
                  suggestion:
                    'Create a .workflow.json file to define telemetry scenarios for this canvas. Workflows are required for .otel.canvas files.',
                });
              }
            }

            results.push(validationResult);

            // Collect parsed canvas for EventRegistry
            if (validationResult.canvas) {
              parsedCanvases.set(file, validationResult.canvas);
            }
          }

          // Build EventRegistry from library and all parsed canvases
          const componentLibrary = library?.raw as ComponentLibrary | undefined;
          const eventRegistry = EventRegistry.build(
            componentLibrary,
            parsedCanvases,
            library?.path
          );

          // PHASE 3: Validate workflows with canvas-wide event knowledge
          for (const absolutePath of workflowFiles) {
            const workflow = loadWorkflowTemplate(absolutePath);
            if (!workflow) {
              results.push({
                file: relative(repositoryPath, absolutePath),
                fileType: 'workflow',
                isValid: false,
                issues: [{ type: 'error', message: 'Could not parse workflow file' }],
              });
              continue;
            }

            // Get combined event set for this workflow's canvas
            const canvasPath = workflow.canvas
              ? resolve(repositoryPath, workflow.canvas)
              : undefined;
            const canvasKey = canvasPath ? relative(repositoryPath, canvasPath) : undefined;
            const allWorkflowEvents = canvasKey ? workflowsByCanvas.get(canvasKey) : undefined;

            // Find co-located execution files
            const workflowDir = dirname(absolutePath);
            const executionFiles: string[] = [];
            try {
              const filesInDir = readdirSync(workflowDir);
              for (const file of filesInDir) {
                if (file.endsWith('.otel.json')) {
                  executionFiles.push(resolve(workflowDir, file));
                }
              }
            } catch {
              // Directory not readable, skip
            }

            const validationResult = await validateWorkflow(
              absolutePath,
              allWorkflowEvents,
              repositoryPath,
              executionFiles,
              eventRegistry
            );
            results.push(validationResult);
          }

          // PHASE 4: Validate test traces
          for (const absolutePath of testTraceFiles) {
            results.push(validateExecution(absolutePath, repositoryPath));
          }

          // PHASE 5: Validate dashboards
          for (const absolutePath of dashboardFiles) {
            results.push(validateDashboard(absolutePath, repositoryPath));
          }

          // PHASE 6: Validate library
          if (libraryFile && library) {
            const libraryIssues = validateLibrary(library);

            // Validate scope events canvases (check against scopes canvas)
            // Look for architecture.scopes.canvas in .principal-views
            const scopesCanvasPath = resolve(repositoryPath, '.principal-views/architecture.scopes.canvas');
            if (existsSync(scopesCanvasPath)) {
              try {
                const scopesCanvasData = readFileSync(scopesCanvasPath, 'utf-8');
                const scopesCanvasContent = JSON.parse(scopesCanvasData) as ExtendedCanvas;

                const scopeEventsValidator = new ScopeEventsValidator(new NodeFileSystemAdapter());
                const scopeEventsResult = await scopeEventsValidator.validate({
                  scopesCanvas: scopesCanvasContent,
                  scopesCanvasPath: '.principal-views/architecture.scopes.canvas',
                  basePath: repositoryPath,
                });

                for (const violation of scopeEventsResult.violations) {
                  libraryIssues.push({
                    type: violation.severity === 'error' ? 'error' : 'warning',
                    message: violation.message,
                    path: violation.expectedPath,
                    suggestion: violation.suggestion,
                  });
                }
              } catch {
                // Skip if we can't load the scopes canvas
              }
            }

            const libraryHasErrors = libraryIssues.some((i) => i.type === 'error');
            results.push({
              file: relative(repositoryPath, library.path),
              fileType: 'library',
              isValid: !libraryHasErrors,
              issues: libraryIssues,
            });
          }

          // Cross-canvas path enforcement: cross-reference `otel.files` on
          // `otel-event` nodes against `paths` on `event-namespace` nodes.
          runOtelEventPathsValidation(results, repositoryPath);

          // Group canvases by directory for validation
          const canvasesByDir = new Map<string, { otel: string[]; regular: string[] }>();
          for (const result of results) {
            if (result.fileType !== 'canvas') continue;

            const dir = dirname(result.file);
            if (!canvasesByDir.has(dir)) {
              canvasesByDir.set(dir, { otel: [], regular: [] });
            }
            const entry = canvasesByDir.get(dir)!;

            if (result.file.endsWith('.otel.canvas')) {
              entry.otel.push(result.file);
            } else if (result.file.endsWith('.canvas')) {
              entry.regular.push(result.file);
            }
          }

          for (const [dir, { otel, regular }] of canvasesByDir.entries()) {
            const folderName = basename(dir);

            // Check for multiple .otel.canvas files in the same directory
            if (otel.length > 1) {
              for (const filePath of otel) {
                const result = results.find((r) => r.file === filePath);
                if (result) {
                  result.isValid = false;
                  result.issues.push({
                    type: 'error',
                    message: `Multiple .otel.canvas files in the same directory: ${otel
                      .map((f) => basename(f))
                      .join(', ')}`,
                    path: filePath,
                    suggestion: `A storyboard folder should contain only one .otel.canvas file. Move additional canvases to separate storyboard folders.`,
                  });
                }
              }
            }

            // If there's an .otel.canvas in the folder:
            if (otel.length > 0) {
              // No .canvas files allowed in the same folder
              if (regular.length > 0) {
                for (const filePath of regular) {
                  const result = results.find((r) => r.file === filePath);
                  if (result) {
                    result.isValid = false;
                    result.issues.push({
                      type: 'error',
                      message: `Cannot have .canvas files in a folder with .otel.canvas`,
                      path: filePath,
                      suggestion: `Remove this .canvas file or move it to a different folder. The .otel.canvas format supports both architectural and instrumented nodes.`,
                    });
                  }
                }
              }

              // .otel.canvas filename must match folder name
              for (const filePath of otel) {
                const fileName = basename(filePath, '.otel.canvas');
                if (fileName !== folderName) {
                  const result = results.find((r) => r.file === filePath);
                  if (result) {
                    result.isValid = false;
                    result.issues.push({
                      type: 'error',
                      message: `Canvas filename "${fileName}" does not match folder name "${folderName}"`,
                      path: filePath,
                      suggestion: `Rename to "${folderName}.otel.canvas" to match the storyboard folder name.`,
                    });
                  }
                }
              }
            }
          }

          return outputResults(results, null, options, true);
        }

        // Determine which file types to validate
        const validateCanvases = !options.workflowOnly && !options.executionOnly;
        const validateWorkflows = !options.canvasOnly && !options.executionOnly;
        const validateExecutions = !options.canvasOnly && !options.workflowOnly;

        // Use CanvasDiscovery to find all canvases (including storyboards)
        const compositionFsAdapter = new CompositionFsAdapter();
        const service = new FilesystemService(compositionFsAdapter);
        const fileTree = await service.buildFileSystemTreeFromPath(repositoryPath);
        const fileReader = async (path: string) => readFile(resolve(repositoryPath, path), 'utf-8');
        const discovery = new CanvasDiscovery();
        const discoveryResult = await discovery.discover(fileTree, {
          fileReader,
          includeContent: true,
        });

        // Use LibraryDiscovery to validate scopes canvas requirements
        const repoFsAdapter = new NodeFileSystemAdapter();
        const libraryDiscovery = new LibraryDiscovery(repoFsAdapter);
        const libraryDiscoveryResult = await libraryDiscovery.discover(fileTree, {
          fileReader,
        });

        // Workflows and test traces are discovered by CanvasDiscovery
        // Extract them from the discovery result
        const workflows = validateWorkflows
          ? discoveryResult.storyboards.flatMap((sb) => sb.workflows)
          : [];

        const testTraces = validateExecutions ? discoveryResult.testTraces : [];

        // Dashboards are always validated when canvases are validated
        const dashboards = validateCanvases ? discoveryResult.dashboards : [];

        // Check if any files were found
        const canvasCount = discoveryResult.canvases.length;
        const totalFiles = canvasCount + workflows.length + testTraces.length + dashboards.length;
        if (totalFiles === 0) {
          if (options.json) {
            console.log(
              JSON.stringify({
                files: [],
                discoveryErrors: discoveryResult.errors,
                summary: {
                  total: 0,
                  valid: 0,
                  invalid: 0,
                  byType: { canvas: 0, workflow: 0, testTrace: 0, library: 0, dashboard: 0 },
                },
              })
            );
          } else {
            console.log(chalk.yellow('No Principal View files found.'));
            if (discoveryResult.errors.length > 0) {
              console.log(chalk.red('\nDiscovery errors:'));
              discoveryResult.errors.forEach((err) => {
                console.log(chalk.red(`  ✗ ${err.path}: ${err.error}`));
              });
            }
            console.log(
              chalk.dim(
                '\nTo create a new .principal-views folder, run: npx @principal-ai/principal-studio-cli init'
              )
            );
          }
          return;
        }

        // Load library from .principal-views directory (used for type validation)
        const principalViewsDir = resolve(repositoryPath, '.principal-views');
        const library = loadLibrary(principalViewsDir);

        // Validate library if present
        let libraryResult: ValidationResult | null = null;
        if (library && Object.keys(library.raw).length > 0) {
          const libraryIssues = validateLibrary(library);

          // Add scopes canvas requirement errors from LibraryDiscovery
          for (const error of libraryDiscoveryResult.errors) {
            if (error.type === 'scopes-canvas-required') {
              libraryIssues.push({
                type: 'error',
                message: error.message,
                path: relative(repositoryPath, error.path),
                suggestion:
                  'Create a .scopes.canvas file (e.g., architecture.scopes.canvas) with nodes for each scope.',
              });
            }
          }

          // Validate scope events canvases (check against scopes canvas)
          const scopesCanvas = discoveryResult.canvases.find(c => c.type === 'scopes');
          if (scopesCanvas) {
            // Load the scopes canvas content
            let scopesCanvasContent: ExtendedCanvas | undefined;
            try {
              const scopesCanvasPath = resolve(repositoryPath, scopesCanvas.path);
              const scopesCanvasData = readFileSync(scopesCanvasPath, 'utf-8');
              scopesCanvasContent = JSON.parse(scopesCanvasData) as ExtendedCanvas;
            } catch {
              // Skip if we can't load the scopes canvas
            }

            if (scopesCanvasContent) {
              const scopeEventsValidator = new ScopeEventsValidator(new NodeFileSystemAdapter());
              const scopeEventsResult = await scopeEventsValidator.validate({
                scopesCanvas: scopesCanvasContent,
                scopesCanvasPath: scopesCanvas.path,
                basePath: repositoryPath,
              });

              for (const violation of scopeEventsResult.violations) {
                libraryIssues.push({
                  type: violation.severity === 'error' ? 'error' : 'warning',
                  message: violation.message,
                  path: violation.expectedPath,
                  suggestion: violation.suggestion,
                });
              }
            }
          }

          const libraryHasErrors = libraryIssues.some((i) => i.type === 'error');
          libraryResult = {
            file: relative(repositoryPath, library.path),
            fileType: 'library',
            isValid: !libraryHasErrors,
            issues: libraryIssues,
          };
        }

        // Convert discovery results to validation results
        const results: ValidationResult[] = [];

        // Add discovery errors as validation failures
        for (const error of discoveryResult.errors) {
          // Skip if path doesn't look like a canvas file at all
          if (!error.path.endsWith('.canvas') && !error.path.endsWith('.otel.canvas')) {
            continue;
          }

          results.push({
            file: error.path,
            fileType: 'canvas',
            isValid: false,
            issues: [
              {
                type: 'error',
                message: error.error,
                path: error.path,
              },
            ],
          });
        }

        // Add discovery warnings
        for (const warning of discoveryResult.warnings) {
          // Skip if path doesn't look like a canvas file at all
          if (!warning.path.endsWith('.canvas') && !warning.path.endsWith('.otel.canvas')) {
            continue;
          }

          // Find existing result for this path or create new one
          let result = results.find((r) => r.file === warning.path);
          if (!result) {
            result = {
              file: warning.path,
              fileType: 'canvas',
              isValid: true,
              issues: [],
            };
            results.push(result);
          }
          result.issues.push({
            type: 'warning',
            message: warning.message,
            path: warning.path,
          });
        }

        // Group canvases by directory for validation
        const canvasesByDir = new Map<string, { otel: string[]; regular: string[] }>();
        for (const canvas of discoveryResult.canvases) {
          const dir = dirname(canvas.path);
          if (!canvasesByDir.has(dir)) {
            canvasesByDir.set(dir, { otel: [], regular: [] });
          }
          const entry = canvasesByDir.get(dir)!;

          if (canvas.type === 'otel') {
            entry.otel.push(canvas.path);
          } else {
            entry.regular.push(canvas.path);
          }
        }

        for (const [dir, { otel, regular }] of canvasesByDir.entries()) {
          const folderName = basename(dir);

          // Check for multiple .otel.canvas files in the same directory
          if (otel.length > 1) {
            for (const filePath of otel) {
              let result = results.find((r) => r.file === filePath);
              if (!result) {
                result = {
                  file: filePath,
                  fileType: 'canvas',
                  isValid: false,
                  issues: [],
                };
                results.push(result);
              }

              result.isValid = false;
              result.issues.push({
                type: 'error',
                message: `Multiple .otel.canvas files in the same directory: ${otel
                  .map((f) => basename(f))
                  .join(', ')}`,
                path: filePath,
                suggestion: `A storyboard folder should contain only one .otel.canvas file. Move additional canvases to separate storyboard folders.`,
              });
            }
          }

          // If there's an .otel.canvas in the folder:
          if (otel.length > 0) {
            // No .canvas files allowed in the same folder
            if (regular.length > 0) {
              for (const filePath of regular) {
                let result = results.find((r) => r.file === filePath);
                if (!result) {
                  result = {
                    file: filePath,
                    fileType: 'canvas',
                    isValid: false,
                    issues: [],
                  };
                  results.push(result);
                }

                result.isValid = false;
                result.issues.push({
                  type: 'error',
                  message: `Cannot have .canvas files in a folder with .otel.canvas`,
                  path: filePath,
                  suggestion: `Remove this .canvas file or move it to a different folder. The .otel.canvas format supports both architectural and instrumented nodes.`,
                });
              }
            }

            // .otel.canvas filename must match folder name
            for (const filePath of otel) {
              const fileName = basename(filePath, '.otel.canvas');
              if (fileName !== folderName) {
                let result = results.find((r) => r.file === filePath);
                if (!result) {
                  result = {
                    file: filePath,
                    fileType: 'canvas',
                    isValid: false,
                    issues: [],
                  };
                  results.push(result);
                }

                result.isValid = false;
                result.issues.push({
                  type: 'error',
                  message: `Canvas filename "${fileName}" does not match folder name "${folderName}"`,
                  path: filePath,
                  suggestion: `Rename to "${folderName}.otel.canvas" to match the storyboard folder name.`,
                });
              }
            }
          }
        }

        // Helper to extract storyboard name from a path
        const extractStoryboardName = (filePath: string): string | null => {
          const parts = filePath.split('/');
          const pvIndex = parts.indexOf('.principal-views');
          if (pvIndex === -1 || parts.length < pvIndex + 2) {
            return null;
          }
          return parts[pvIndex + 1];
        };

        // PHASE 1: Group workflows by canvas and collect all events used
        // Only include co-located workflows (same storyboard folder) for event coverage
        const workflowsByCanvas = new Map<string, Set<string>>();

        for (const discoveredWorkflow of workflows) {
          const absolutePath = resolve(repositoryPath, discoveredWorkflow.path);
          const workflow = loadWorkflowTemplate(absolutePath);
          if (!workflow || !workflow.canvas) continue;

          // Canvas paths are always relative to repository root
          const canvasPath = resolve(repositoryPath, workflow.canvas);
          const canvasKey = relative(repositoryPath, canvasPath);

          // Only include events from workflows that are co-located with the canvas
          // (same storyboard folder). Cross-referenced workflows are validated separately.
          const workflowStoryboard = extractStoryboardName(discoveredWorkflow.path);
          const canvasStoryboard = extractStoryboardName(workflow.canvas);

          if (workflowStoryboard !== canvasStoryboard) {
            // Skip cross-referenced workflows for event coverage calculation
            continue;
          }

          // Collect events from this workflow
          if (!workflowsByCanvas.has(canvasKey)) {
            workflowsByCanvas.set(canvasKey, new Set<string>());
          }
          const workflowEvents = workflowsByCanvas.get(canvasKey)!;

          for (const scenario of workflow.scenarios) {
            if (scenario.template?.events) {
              for (const eventName of Object.keys(scenario.template.events)) {
                if (!eventName.includes('*')) {
                  workflowEvents.add(eventName);
                }
              }
            }
          }
        }

        // PHASE 2: Validate all canvas files and collect parsed canvases
        const parsedCanvases = new Map<string, ExtendedCanvas>();

        // Load scopes canvas for cross-validation
        let scopesCanvasContent: ExtendedCanvas | undefined;
        const scopesCanvasPath = resolve(repositoryPath, '.principal-views/architecture.scopes.canvas');
        if (existsSync(scopesCanvasPath)) {
          try {
            const scopesCanvasData = readFileSync(scopesCanvasPath, 'utf-8');
            scopesCanvasContent = JSON.parse(scopesCanvasData) as ExtendedCanvas;
          } catch {
            // Skip if we can't load the scopes canvas
          }
        }

        if (validateCanvases) {
          for (const canvas of discoveryResult.canvases) {
            // Check if we already have a result for this canvas (from discovery errors)
            const existingResult = results.find((r) => r.file === canvas.path);
            if (existingResult) {
              // Already has errors/warnings, skip validation
              continue;
            }

            const validationResult = validateFile(canvas.path, library, repositoryPath, scopesCanvasContent);
            results.push(validationResult);

            // Collect parsed canvas for EventRegistry
            if (validationResult.canvas) {
              parsedCanvases.set(canvas.path, validationResult.canvas);
            }
          }

          // Build dashboard validation context from discovered storyboards
          // This enables cross-reference validation of source storyboard/workflow references
          const dashboardContext: DashboardValidationContext = {
            storyboards: discoveryResult.storyboards.map((sb) => sb.basename),
            workflows: Object.fromEntries(
              discoveryResult.storyboards.map((sb) => [
                sb.basename,
                sb.workflows.map((wf) => wf.name),
              ])
            ),
          };

          // Validate dashboard files from .principal-views/dashboards/
          for (const dashboard of dashboards) {
            const absolutePath = resolve(repositoryPath, dashboard.path);
            const validationResult = validateDashboard(absolutePath, repositoryPath, dashboardContext);
            results.push(validationResult);
          }
        }

        // Build EventRegistry from library and all parsed canvases
        const componentLibrary = library?.raw as ComponentLibrary | undefined;
        const eventRegistry = EventRegistry.build(componentLibrary, parsedCanvases, library?.path);

        // PHASE 2.5a: Check that .otel.canvas files have co-located workflows
        // Build a set of canvas paths that have co-located workflows
        const canvasesWithColocatedWorkflows = new Set<string>();
        for (const discoveredWorkflow of workflows) {
          const absolutePath = resolve(repositoryPath, discoveredWorkflow.path);
          const workflow = loadWorkflowTemplate(absolutePath);
          if (!workflow || !workflow.canvas) continue;

          const workflowStoryboard = extractStoryboardName(discoveredWorkflow.path);
          const canvasStoryboard = extractStoryboardName(workflow.canvas);

          // Only count as co-located if in same storyboard
          if (workflowStoryboard === canvasStoryboard) {
            canvasesWithColocatedWorkflows.add(workflow.canvas);
          }
        }

        // Check each .otel.canvas storyboard for missing workflows
        for (const storyboard of discoveryResult.storyboards) {
          if (storyboard.canvas.type !== 'otel') continue;

          if (!canvasesWithColocatedWorkflows.has(storyboard.canvas.path)) {
            // Find or create result for this canvas
            let result = results.find((r) => r.file === storyboard.canvas.path);
            if (!result) {
              result = {
                file: storyboard.canvas.path,
                fileType: 'canvas',
                isValid: false,
                issues: [],
              };
              results.push(result);
            }

            result.isValid = false;
            result.issues.push({
              type: 'error',
              message: `No workflows found for this .otel.canvas in the "${storyboard.basename}" storyboard`,
              path: storyboard.canvas.path,
              suggestion:
                `Create at least one workflow file in ".principal-views/${storyboard.basename}/${storyboard.basename}-workflow/" that references this canvas. ` +
                `Workflows define how events in the canvas are visualized during trace playback.`,
            });
          }
        }

        // PHASE 2.5b: Cross-workflow validation (duplicate spanPatterns)
        if (validateWorkflows && workflows.length > 0) {
          // Collect all workflows with their templates
          const workflowsForSpanPatternValidation: Array<{
            workflow: WorkflowTemplate;
            workflowPath: string;
          }> = [];

          for (const discoveredWorkflow of workflows) {
            const absolutePath = resolve(repositoryPath, discoveredWorkflow.path);
            const workflow = loadWorkflowTemplate(absolutePath);
            if (workflow) {
              workflowsForSpanPatternValidation.push({
                workflow,
                workflowPath: discoveredWorkflow.path,
              });
            }
          }

          // Validate for duplicate spanPatterns
          const spanPatternViolations = WorkflowValidator.validateSpanPatterns(
            workflowsForSpanPatternValidation
          );

          // Add violations to results
          for (const violation of spanPatternViolations) {
            // Find or create result for this workflow file
            let result = results.find((r) => r.file === violation.file);
            if (!result) {
              result = {
                file: violation.file,
                fileType: 'workflow',
                isValid: false,
                issues: [],
              };
              results.push(result);
            }

            // Add the violation as an issue
            result.issues.push({
              type: violation.severity === 'error' ? 'error' : 'warning',
              message: violation.message,
              path: violation.path,
              suggestion: violation.suggestion,
            });

            // Mark as invalid if it's an error
            if (violation.severity === 'error') {
              result.isValid = false;
            }
          }
        }

        // PHASE 2.5c: Cross-validate spans.canvas ↔ workflow.json
        // - implemented span conventions must have a workflow.json
        // - draft span conventions with a workflow.json should be changed to implemented
        if (validateCanvases && validateWorkflows) {
          // Find spans.canvas files and extract span conventions
          const spansCanvases = discoveryResult.canvases.filter((c) =>
            c.path.endsWith('.spans.canvas')
          );

          // Collect all workflow spanPatterns
          const workflowSpanPatterns = new Map<string, string>(); // spanPattern -> workflow path
          for (const discoveredWorkflow of workflows) {
            const absolutePath = resolve(repositoryPath, discoveredWorkflow.path);
            const workflow = loadWorkflowTemplate(absolutePath);
            if (workflow?.spanPattern) {
              workflowSpanPatterns.set(workflow.spanPattern, discoveredWorkflow.path);
            }
          }

          // If workflows with spanPatterns exist but no spans.canvas, error on each workflow
          if (workflowSpanPatterns.size > 0 && spansCanvases.length === 0) {
            for (const [spanPattern, workflowPath] of workflowSpanPatterns) {
              let result = results.find((r) => r.file === workflowPath);
              if (!result) {
                result = {
                  file: workflowPath,
                  fileType: 'workflow',
                  isValid: false,
                  issues: [],
                };
                results.push(result);
              }
              result.issues.push({
                type: 'error',
                message: `Workflow defines spanPattern "${spanPattern}" but no spans.canvas file exists`,
                path: 'spanPattern',
                suggestion:
                  'Create a .spans.canvas file (e.g., ".principal-views/architecture.spans.canvas") to define span conventions for your project',
              });
              result.isValid = false;
            }
          }

          for (const spansCanvas of spansCanvases) {
            const absolutePath = resolve(repositoryPath, spansCanvas.path);
            let canvas: ExtendedCanvas | null = null;
            try {
              const content = readFileSync(absolutePath, 'utf-8');
              canvas = JSON.parse(content) as ExtendedCanvas;
            } catch {
              // Skip - parse errors handled elsewhere
              continue;
            }

            if (!canvas?.nodes) continue;

            // Extract span conventions from nodes
            for (const node of canvas.nodes) {
              // Only process OTEL span convention nodes (new format)
              if (node.type !== 'otel-span-convention') continue;

              const spanNode = node as { type: 'otel-span-convention'; label: string; otel?: { spanPattern?: string; status?: string } };
              const spanPattern = spanNode.otel?.spanPattern;
              const status = spanNode.otel?.status;
              const nodeLabel = spanNode.label || node.id || 'unknown';

              if (!spanPattern) continue; // Skip nodes without spanPattern

              // Find workflows that match this span convention (with wildcard support)
              const matchingWorkflows = findMatchingWorkflows(spanPattern, workflowSpanPatterns);
              const hasWorkflow = matchingWorkflows.length > 0;

              // Find or create result for spans.canvas
              let result = results.find((r) => r.file === spansCanvas.path);
              if (!result) {
                result = {
                  file: spansCanvas.path,
                  fileType: 'canvas',
                  isValid: true,
                  issues: [],
                };
                results.push(result);
              }

              if (status === 'implemented' && !hasWorkflow) {
                // implemented span conventions must have a workflow.json
                result.issues.push({
                  type: 'error',
                  message: `Span convention "${spanPattern}" is implemented but has no workflow.json`,
                  path: `nodes.${nodeLabel}.pv.otel.spanPattern`,
                  suggestion: `Create a workflow.json with spanPattern: "${spanPattern}" or change status to "draft"`,
                });
                result.isValid = false;
              } else if (status === 'draft' && hasWorkflow) {
                // draft span conventions with a workflow.json should be changed to implemented
                const workflowPaths = matchingWorkflows.map((w) => w.path).join(', ');
                result.issues.push({
                  type: 'error',
                  message: `Span convention "${spanPattern}" has matching workflow(s) (${workflowPaths}) but is marked as draft`,
                  path: `nodes.${nodeLabel}.pv.status`,
                  suggestion: `Change status to "implemented" since workflow(s) already exist`,
                });
                result.isValid = false;
              }
            }
          }
        }

        // PHASE 3: Validate workflows with canvas-wide event knowledge
        if (validateWorkflows) {
          for (const discoveredWorkflow of workflows) {
            const absolutePath = resolve(repositoryPath, discoveredWorkflow.path);
            const workflow = loadWorkflowTemplate(absolutePath);
            if (!workflow) continue;

            // Canvas paths are always relative to repository root
            const canvasPath = workflow.canvas
              ? resolve(repositoryPath, workflow.canvas)
              : undefined;
            const canvasKey = canvasPath ? relative(repositoryPath, canvasPath) : undefined;
            const allWorkflowEvents = canvasKey ? workflowsByCanvas.get(canvasKey) : undefined;

            // Get co-located test traces for this workflow
            const executionFiles = discoveredWorkflow.testTraces.map((tt) =>
              resolve(repositoryPath, tt.path)
            );

            const validationResult = await validateWorkflow(
              absolutePath,
              allWorkflowEvents,
              repositoryPath,
              executionFiles,
              eventRegistry
            );
            results.push(validationResult);
          }
        }

        // PHASE 4: Validate test trace artifacts
        if (validateExecutions) {
          for (const testTrace of testTraces) {
            const absolutePath = resolve(repositoryPath, testTrace.path);
            const validationResult = validateExecution(absolutePath, repositoryPath);
            results.push(validationResult);
          }
        }

        // Cross-canvas path enforcement (discovery branch).
        runOtelEventPathsValidation(results, repositoryPath);

        // Output results using helper function
        outputResults(results, libraryResult, options, false);
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
