/**
 * Dashboard File Validator
 *
 * Validates dashboard definition files (.dashboard.json) that define metrics,
 * layout, and data sources for observability dashboards.
 */

import type {
  DashboardDefinition,
  MetricDefinition,
  MetricType,
  MetricSource,
  MetricQuery,
  Derivation,
  TimeGroup,
  MetricDisplay,
  DisplayComponent,
  DashboardLayout,
  DashboardRow,
  PanelPlacement,
} from '../types/dashboard';

/**
 * Validation error details
 */
export interface DashboardValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

/**
 * Validation result
 */
export interface DashboardValidationResult {
  valid: boolean;
  errors: DashboardValidationError[];
  warnings: DashboardValidationError[];
}

/**
 * Context for cross-reference validation (optional)
 */
export interface DashboardValidationContext {
  /** Known storyboard names for source validation */
  storyboards?: string[];
  /** Known workflow names per storyboard */
  workflows?: Record<string, string[]>;
  /** Known event names */
  events?: string[];
}

// Valid metric types
const VALID_METRIC_TYPES: MetricType[] = ['counter', 'gauge', 'histogram'];

// Valid derivations
const VALID_DERIVATIONS: Derivation[] = [
  'count',
  'rate',
  'sum',
  'avg',
  'min',
  'max',
  'duration',
  'error_rate',
  'success_rate',
  'percentage',
  'p50',
  'p95',
  'p99',
];

// Valid time groups
const VALID_TIME_GROUPS: TimeGroup[] = ['minute', 'hour', 'day', 'week', 'month'];

// Valid display components
const VALID_DISPLAY_COMPONENTS: DisplayComponent[] = [
  'MetricCard',
  'LineChart',
  'BarChart',
  'StackedBarChart',
  'PieChart',
  'GaugeChart',
  'Histogram',
  'DataTable',
];

/**
 * Validator for dashboard definition files
 */
export class DashboardValidator {
  /**
   * Validate dashboard definition structure
   */
  validate(
    data: unknown,
    filePath?: string,
    context?: DashboardValidationContext
  ): DashboardValidationResult {
    const errors: DashboardValidationError[] = [];
    const warnings: DashboardValidationError[] = [];

    // Check if data is an object
    if (!data || typeof data !== 'object') {
      errors.push({
        path: filePath || 'root',
        message: 'Dashboard data must be an object',
        severity: 'error',
        suggestion: 'Expected format: { "id": "...", "name": "...", "metrics": [...], "layout": {...} }',
      });
      return { valid: false, errors, warnings };
    }

    // Check if it's an array (common mistake)
    if (Array.isArray(data)) {
      errors.push({
        path: filePath || 'root',
        message: 'Dashboard data should be an object, not an array',
        severity: 'error',
      });
      return { valid: false, errors, warnings };
    }

    const dashboard = data as Partial<DashboardDefinition>;

    // Validate required fields
    if (!dashboard.id) {
      errors.push({
        path: 'id',
        message: 'Missing required "id" field',
        severity: 'error',
        suggestion: 'Add a unique kebab-case identifier, e.g., "service-health"',
      });
    } else if (typeof dashboard.id !== 'string') {
      errors.push({
        path: 'id',
        message: '"id" must be a string',
        severity: 'error',
      });
    } else if (!/^[a-z0-9-]+$/.test(dashboard.id)) {
      warnings.push({
        path: 'id',
        message: 'Dashboard "id" should be kebab-case (lowercase with hyphens)',
        severity: 'warning',
        suggestion: `Consider renaming to "${dashboard.id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"`,
      });
    }

    if (!dashboard.name) {
      errors.push({
        path: 'name',
        message: 'Missing required "name" field',
        severity: 'error',
        suggestion: 'Add a human-readable name, e.g., "Service Health Dashboard"',
      });
    } else if (typeof dashboard.name !== 'string') {
      errors.push({
        path: 'name',
        message: '"name" must be a string',
        severity: 'error',
      });
    }

    // Validate optional description
    if (dashboard.description !== undefined && typeof dashboard.description !== 'string') {
      errors.push({
        path: 'description',
        message: '"description" must be a string',
        severity: 'error',
      });
    }

    // Validate metrics array
    if (!dashboard.metrics) {
      errors.push({
        path: 'metrics',
        message: 'Missing required "metrics" array',
        severity: 'error',
        suggestion: 'Add at least one metric definition',
      });
    } else if (!Array.isArray(dashboard.metrics)) {
      errors.push({
        path: 'metrics',
        message: '"metrics" must be an array',
        severity: 'error',
      });
    } else if (dashboard.metrics.length === 0) {
      warnings.push({
        path: 'metrics',
        message: 'Dashboard has no metrics defined',
        severity: 'warning',
        suggestion: 'Add at least one metric to make the dashboard useful',
      });
    } else {
      // Validate each metric
      const metricIds = new Set<string>();
      dashboard.metrics.forEach((metric, index) => {
        this.validateMetric(metric, index, errors, warnings, context);

        // Check for duplicate metric IDs
        if (metric.id) {
          if (metricIds.has(metric.id)) {
            errors.push({
              path: `metrics[${index}].id`,
              message: `Duplicate metric ID: "${metric.id}"`,
              severity: 'error',
              suggestion: 'Each metric must have a unique ID',
            });
          }
          metricIds.add(metric.id);
        }
      });
    }

    // Validate layout
    if (!dashboard.layout) {
      errors.push({
        path: 'layout',
        message: 'Missing required "layout" object',
        severity: 'error',
        suggestion: 'Add layout with columns and rows',
      });
    } else if (typeof dashboard.layout !== 'object' || Array.isArray(dashboard.layout)) {
      errors.push({
        path: 'layout',
        message: '"layout" must be an object',
        severity: 'error',
      });
    } else {
      // Get metric IDs for panel validation
      const metricIds = new Set(
        (dashboard.metrics || [])
          .filter((m): m is MetricDefinition => !!m && typeof m === 'object' && !!m.id)
          .map((m) => m.id)
      );
      this.validateLayout(dashboard.layout, errors, warnings, metricIds);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a single metric definition
   */
  private validateMetric(
    metric: unknown,
    index: number,
    errors: DashboardValidationError[],
    warnings: DashboardValidationError[],
    context?: DashboardValidationContext
  ): void {
    const metricPath = `metrics[${index}]`;

    if (!metric || typeof metric !== 'object') {
      errors.push({
        path: metricPath,
        message: 'Metric must be an object',
        severity: 'error',
      });
      return;
    }

    const m = metric as Partial<MetricDefinition>;

    // Required: id
    if (!m.id) {
      errors.push({
        path: `${metricPath}.id`,
        message: 'Metric is missing required "id" field',
        severity: 'error',
        suggestion: `Add unique ID like "metric-${index + 1}"`,
      });
    } else if (typeof m.id !== 'string') {
      errors.push({
        path: `${metricPath}.id`,
        message: 'Metric "id" must be a string',
        severity: 'error',
      });
    } else if (!/^[a-z0-9-]+$/.test(m.id)) {
      warnings.push({
        path: `${metricPath}.id`,
        message: 'Metric "id" should be kebab-case',
        severity: 'warning',
      });
    }

    // Required: name
    if (!m.name) {
      errors.push({
        path: `${metricPath}.name`,
        message: 'Metric is missing required "name" field',
        severity: 'error',
      });
    } else if (typeof m.name !== 'string') {
      errors.push({
        path: `${metricPath}.name`,
        message: 'Metric "name" must be a string',
        severity: 'error',
      });
    }

    // Required: type
    if (!m.type) {
      errors.push({
        path: `${metricPath}.type`,
        message: 'Metric is missing required "type" field',
        severity: 'error',
        suggestion: `Valid types: ${VALID_METRIC_TYPES.join(', ')}`,
      });
    } else if (!VALID_METRIC_TYPES.includes(m.type as MetricType)) {
      errors.push({
        path: `${metricPath}.type`,
        message: `Invalid metric type: "${m.type}"`,
        severity: 'error',
        suggestion: `Valid types: ${VALID_METRIC_TYPES.join(', ')}`,
      });
    }

    // Required: sources
    if (!m.sources) {
      errors.push({
        path: `${metricPath}.sources`,
        message: 'Metric is missing required "sources" array',
        severity: 'error',
        suggestion: 'Add at least one source linking to a storyboard/workflow',
      });
    } else if (!Array.isArray(m.sources)) {
      errors.push({
        path: `${metricPath}.sources`,
        message: 'Metric "sources" must be an array',
        severity: 'error',
      });
    } else if (m.sources.length === 0) {
      errors.push({
        path: `${metricPath}.sources`,
        message: 'Metric must have at least one source',
        severity: 'error',
      });
    } else {
      m.sources.forEach((source, sourceIndex) => {
        this.validateSource(source, `${metricPath}.sources[${sourceIndex}]`, errors, warnings, context);
      });
    }

    // Required: query
    if (!m.query) {
      errors.push({
        path: `${metricPath}.query`,
        message: 'Metric is missing required "query" object',
        severity: 'error',
      });
    } else if (typeof m.query !== 'object' || Array.isArray(m.query)) {
      errors.push({
        path: `${metricPath}.query`,
        message: 'Metric "query" must be an object',
        severity: 'error',
      });
    } else {
      this.validateQuery(m.query, `${metricPath}.query`, errors, warnings);
    }

    // Optional: thresholds
    if (m.thresholds !== undefined) {
      if (typeof m.thresholds !== 'object' || Array.isArray(m.thresholds)) {
        errors.push({
          path: `${metricPath}.thresholds`,
          message: '"thresholds" must be an object',
          severity: 'error',
        });
      } else {
        if (m.thresholds.warning !== undefined && typeof m.thresholds.warning !== 'number') {
          errors.push({
            path: `${metricPath}.thresholds.warning`,
            message: 'Threshold "warning" must be a number',
            severity: 'error',
          });
        }
        if (m.thresholds.critical !== undefined && typeof m.thresholds.critical !== 'number') {
          errors.push({
            path: `${metricPath}.thresholds.critical`,
            message: 'Threshold "critical" must be a number',
            severity: 'error',
          });
        }
      }
    }

    // Optional: display
    if (m.display !== undefined) {
      this.validateDisplay(m.display, `${metricPath}.display`, errors, warnings);
    }

    // Check for _mockData (informational)
    if (!m._mockData) {
      warnings.push({
        path: `${metricPath}._mockData`,
        message: 'No mock data provided for prototyping',
        severity: 'warning',
        suggestion: 'Add _mockData to prototype the dashboard before live OTEL data',
      });
    }
  }

  /**
   * Validate a metric source
   */
  private validateSource(
    source: unknown,
    path: string,
    errors: DashboardValidationError[],
    warnings: DashboardValidationError[],
    context?: DashboardValidationContext
  ): void {
    if (!source || typeof source !== 'object') {
      errors.push({
        path,
        message: 'Source must be an object',
        severity: 'error',
      });
      return;
    }

    const s = source as Partial<MetricSource>;

    // Required: storyboard
    if (!s.storyboard) {
      errors.push({
        path: `${path}.storyboard`,
        message: 'Source is missing required "storyboard" field',
        severity: 'error',
      });
    } else if (typeof s.storyboard !== 'string') {
      errors.push({
        path: `${path}.storyboard`,
        message: 'Source "storyboard" must be a string',
        severity: 'error',
      });
    } else if (context?.storyboards && !context.storyboards.includes(s.storyboard)) {
      errors.push({
        path: `${path}.storyboard`,
        message: `Unknown storyboard: "${s.storyboard}"`,
        severity: 'error',
        suggestion: `Known storyboards: ${context.storyboards.join(', ')}`,
      });
    }

    // Required: workflow
    if (!s.workflow) {
      errors.push({
        path: `${path}.workflow`,
        message: 'Source is missing required "workflow" field',
        severity: 'error',
      });
    } else if (typeof s.workflow !== 'string') {
      errors.push({
        path: `${path}.workflow`,
        message: 'Source "workflow" must be a string',
        severity: 'error',
      });
    } else if (
      context?.workflows &&
      s.storyboard &&
      context.workflows[s.storyboard] &&
      !context.workflows[s.storyboard].includes(s.workflow)
    ) {
      errors.push({
        path: `${path}.workflow`,
        message: `Unknown workflow "${s.workflow}" in storyboard "${s.storyboard}"`,
        severity: 'error',
        suggestion: context.workflows[s.storyboard].length > 0
          ? `Known workflows in "${s.storyboard}": ${context.workflows[s.storyboard].join(', ')}`
          : `No workflows found in storyboard "${s.storyboard}"`,
      });
    }

    // Optional: type
    if (s.type !== undefined && s.type !== 'event' && s.type !== 'span') {
      errors.push({
        path: `${path}.type`,
        message: 'Source "type" must be "event" or "span"',
        severity: 'error',
      });
    }

    // Optional: nodes
    if (s.nodes !== undefined) {
      if (!Array.isArray(s.nodes)) {
        errors.push({
          path: `${path}.nodes`,
          message: 'Source "nodes" must be an array of strings',
          severity: 'error',
        });
      } else {
        s.nodes.forEach((node, i) => {
          if (typeof node !== 'string') {
            errors.push({
              path: `${path}.nodes[${i}]`,
              message: 'Node must be a string',
              severity: 'error',
            });
          }
        });
      }
    }

    // Optional: event
    if (s.event !== undefined && typeof s.event !== 'string') {
      errors.push({
        path: `${path}.event`,
        message: 'Source "event" must be a string',
        severity: 'error',
      });
    }
  }

  /**
   * Validate a metric query
   */
  private validateQuery(
    query: unknown,
    path: string,
    errors: DashboardValidationError[],
    warnings: DashboardValidationError[]
  ): void {
    const q = query as Partial<MetricQuery>;

    // Required: derivation
    if (!q.derivation) {
      errors.push({
        path: `${path}.derivation`,
        message: 'Query is missing required "derivation" field',
        severity: 'error',
        suggestion: `Valid derivations: ${VALID_DERIVATIONS.join(', ')}`,
      });
    } else if (!VALID_DERIVATIONS.includes(q.derivation as Derivation)) {
      errors.push({
        path: `${path}.derivation`,
        message: `Invalid derivation: "${q.derivation}"`,
        severity: 'error',
        suggestion: `Valid derivations: ${VALID_DERIVATIONS.join(', ')}`,
      });
    }

    // Optional: timeGroup
    if (q.timeGroup !== undefined && !VALID_TIME_GROUPS.includes(q.timeGroup as TimeGroup)) {
      errors.push({
        path: `${path}.timeGroup`,
        message: `Invalid timeGroup: "${q.timeGroup}"`,
        severity: 'error',
        suggestion: `Valid time groups: ${VALID_TIME_GROUPS.join(', ')}`,
      });
    }

    // Optional: groupBy
    if (q.groupBy !== undefined) {
      if (!Array.isArray(q.groupBy)) {
        errors.push({
          path: `${path}.groupBy`,
          message: '"groupBy" must be an array of strings',
          severity: 'error',
        });
      } else {
        q.groupBy.forEach((field, i) => {
          if (typeof field !== 'string') {
            errors.push({
              path: `${path}.groupBy[${i}]`,
              message: 'groupBy field must be a string',
              severity: 'error',
            });
          }
        });
      }
    }

    // Optional: window
    if (q.window !== undefined && typeof q.window !== 'string') {
      errors.push({
        path: `${path}.window`,
        message: '"window" must be a string (e.g., "1h", "24h")',
        severity: 'error',
      });
    }
  }

  /**
   * Validate metric display options
   */
  private validateDisplay(
    display: unknown,
    path: string,
    errors: DashboardValidationError[],
    warnings: DashboardValidationError[]
  ): void {
    if (typeof display !== 'object' || Array.isArray(display)) {
      errors.push({
        path,
        message: '"display" must be an object',
        severity: 'error',
      });
      return;
    }

    const d = display as Partial<MetricDisplay>;

    // Optional: component
    if (d.component !== undefined && !VALID_DISPLAY_COMPONENTS.includes(d.component as DisplayComponent)) {
      errors.push({
        path: `${path}.component`,
        message: `Invalid display component: "${d.component}"`,
        severity: 'error',
        suggestion: `Valid components: ${VALID_DISPLAY_COMPONENTS.join(', ')}`,
      });
    }

    // Optional: size
    if (d.size !== undefined && !['small', 'medium', 'large'].includes(d.size)) {
      errors.push({
        path: `${path}.size`,
        message: `Invalid size: "${d.size}"`,
        severity: 'error',
        suggestion: 'Valid sizes: small, medium, large',
      });
    }
  }

  /**
   * Validate dashboard layout
   */
  private validateLayout(
    layout: unknown,
    errors: DashboardValidationError[],
    warnings: DashboardValidationError[],
    metricIds: Set<string>
  ): void {
    const l = layout as Partial<DashboardLayout>;

    // Optional: columns
    if (l.columns !== undefined) {
      if (typeof l.columns !== 'number' || l.columns < 1) {
        errors.push({
          path: 'layout.columns',
          message: '"columns" must be a positive number',
          severity: 'error',
        });
      }
    }

    // Required: rows
    if (!l.rows) {
      errors.push({
        path: 'layout.rows',
        message: 'Layout is missing required "rows" array',
        severity: 'error',
      });
    } else if (!Array.isArray(l.rows)) {
      errors.push({
        path: 'layout.rows',
        message: '"rows" must be an array',
        severity: 'error',
      });
    } else if (l.rows.length === 0) {
      warnings.push({
        path: 'layout.rows',
        message: 'Layout has no rows defined',
        severity: 'warning',
      });
    } else {
      const referencedMetricIds = new Set<string>();

      l.rows.forEach((row, rowIndex) => {
        this.validateRow(row, rowIndex, errors, warnings, metricIds, referencedMetricIds);
      });

      // Check for orphaned metrics (defined but not in layout)
      metricIds.forEach((id) => {
        if (!referencedMetricIds.has(id)) {
          warnings.push({
            path: `layout`,
            message: `Metric "${id}" is defined but not placed in any layout row`,
            severity: 'warning',
            suggestion: 'Add a panel referencing this metric or remove the metric definition',
          });
        }
      });
    }
  }

  /**
   * Validate a layout row
   */
  private validateRow(
    row: unknown,
    rowIndex: number,
    errors: DashboardValidationError[],
    warnings: DashboardValidationError[],
    metricIds: Set<string>,
    referencedMetricIds: Set<string>
  ): void {
    const rowPath = `layout.rows[${rowIndex}]`;

    if (!row || typeof row !== 'object') {
      errors.push({
        path: rowPath,
        message: 'Row must be an object',
        severity: 'error',
      });
      return;
    }

    const r = row as Partial<DashboardRow>;

    // Optional: title
    if (r.title !== undefined && typeof r.title !== 'string') {
      errors.push({
        path: `${rowPath}.title`,
        message: 'Row "title" must be a string',
        severity: 'error',
      });
    }

    // Required: panels
    if (!r.panels) {
      errors.push({
        path: `${rowPath}.panels`,
        message: 'Row is missing required "panels" array',
        severity: 'error',
      });
    } else if (!Array.isArray(r.panels)) {
      errors.push({
        path: `${rowPath}.panels`,
        message: '"panels" must be an array',
        severity: 'error',
      });
    } else if (r.panels.length === 0) {
      warnings.push({
        path: `${rowPath}.panels`,
        message: 'Row has no panels',
        severity: 'warning',
      });
    } else {
      r.panels.forEach((panel, panelIndex) => {
        this.validatePanel(panel, `${rowPath}.panels[${panelIndex}]`, errors, warnings, metricIds, referencedMetricIds);
      });
    }
  }

  /**
   * Validate a panel placement
   */
  private validatePanel(
    panel: unknown,
    path: string,
    errors: DashboardValidationError[],
    warnings: DashboardValidationError[],
    metricIds: Set<string>,
    referencedMetricIds: Set<string>
  ): void {
    if (!panel || typeof panel !== 'object') {
      errors.push({
        path,
        message: 'Panel must be an object',
        severity: 'error',
      });
      return;
    }

    const p = panel as Partial<PanelPlacement>;

    // Required: id
    if (!p.id) {
      errors.push({
        path: `${path}.id`,
        message: 'Panel is missing required "id" field',
        severity: 'error',
        suggestion: 'Reference a metric ID defined in the metrics array',
      });
    } else if (typeof p.id !== 'string') {
      errors.push({
        path: `${path}.id`,
        message: 'Panel "id" must be a string',
        severity: 'error',
      });
    } else {
      referencedMetricIds.add(p.id);

      if (!metricIds.has(p.id)) {
        errors.push({
          path: `${path}.id`,
          message: `Panel references unknown metric: "${p.id}"`,
          severity: 'error',
          suggestion: `Available metrics: ${Array.from(metricIds).join(', ') || '(none defined)'}`,
        });
      }
    }

    // Optional: span
    if (p.span !== undefined) {
      if (typeof p.span !== 'number' || p.span < 1) {
        errors.push({
          path: `${path}.span`,
          message: '"span" must be a positive number',
          severity: 'error',
        });
      }
    }

    // Optional: spanMobile
    if (p.spanMobile !== undefined) {
      if (typeof p.spanMobile !== 'number' || p.spanMobile < 1) {
        errors.push({
          path: `${path}.spanMobile`,
          message: '"spanMobile" must be a positive number',
          severity: 'error',
        });
      }
    } else if (p.span !== undefined) {
      warnings.push({
        path: `${path}`,
        message: 'Panel has span but no spanMobile for responsive layout',
        severity: 'warning',
        suggestion: 'Add spanMobile: 12 for full-width on mobile',
      });
    }

    // Optional: minHeight
    if (p.minHeight !== undefined && typeof p.minHeight !== 'number') {
      errors.push({
        path: `${path}.minHeight`,
        message: '"minHeight" must be a number',
        severity: 'error',
      });
    }
  }

  /**
   * Validate and throw if invalid
   */
  validateOrThrow(
    data: unknown,
    filePath?: string,
    context?: DashboardValidationContext
  ): DashboardDefinition {
    const result = this.validate(data, filePath, context);

    if (!result.valid) {
      const errorMessages = result.errors.map(
        (e) => `${e.path}: ${e.message}${e.suggestion ? ` (${e.suggestion})` : ''}`
      );
      throw new Error(`Invalid dashboard data:\n${errorMessages.join('\n')}`);
    }

    return data as DashboardDefinition;
  }

  /**
   * Format validation result as human-readable report
   */
  formatReport(result: DashboardValidationResult): string {
    const lines: string[] = [];

    if (result.valid && result.warnings.length === 0) {
      lines.push('✓ Dashboard definition is valid');
      return lines.join('\n');
    }

    if (result.errors.length > 0) {
      lines.push('Validation errors:\n');
      result.errors.forEach((error) => {
        lines.push(`  ${error.path}`);
        lines.push(`    ${error.message}`);
        if (error.suggestion) {
          lines.push(`    → ${error.suggestion}`);
        }
        lines.push('');
      });
    }

    if (result.warnings.length > 0) {
      lines.push('Warnings:\n');
      result.warnings.forEach((warning) => {
        lines.push(`  ${warning.path}`);
        lines.push(`    ${warning.message}`);
        if (warning.suggestion) {
          lines.push(`    → ${warning.suggestion}`);
        }
        lines.push('');
      });
    }

    return lines.join('\n');
  }
}

/**
 * Create a new dashboard validator instance
 */
export function createDashboardValidator(): DashboardValidator {
  return new DashboardValidator();
}
