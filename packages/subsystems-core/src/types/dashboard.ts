/**
 * Dashboard Types
 *
 * Types for dashboard definition files (.dashboard.json) that define metrics,
 * layout, and data sources for observability dashboards.
 *
 * These types enable:
 * - Schema validation of dashboard files
 * - Metric source validation against workflow/canvas definitions
 * - Dashboard rendering in UI components
 */

// ============================================================================
// Dashboard Definition Types (from .dashboard.json files)
// ============================================================================

export interface DashboardDefinition {
  $schema?: string;
  id: string;
  name: string;
  description?: string;
  owner?: string;

  externalLinks?: {
    grafana?: string;
    datadog?: string;
    runbook?: string;
    [key: string]: string | undefined;
  };

  metrics: MetricDefinition[];

  layout: DashboardLayout;
}

export interface MetricDefinition {
  id: string;
  name: string;
  description?: string;
  type: MetricType;
  unit?: string;

  sources: MetricSource[];

  query: MetricQuery;

  thresholds?: {
    warning?: number;
    critical?: number;
  };

  alerts?: AlertDefinition[];

  /** Display hints for the renderer */
  display?: MetricDisplay;

  /** Mock data for prototyping (prefixed with _ to indicate non-production) */
  _mockData?: MockMetricData;
}

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricSource {
  /** Source type: event or span */
  type?: 'event' | 'span';
  /** Storyboard containing the workflow */
  storyboard: string;
  /** Workflow within the storyboard */
  workflow: string;
  /** Specific nodes within the workflow (optional) */
  nodes?: string[];
  /** Event name pattern (for event-based metrics) */
  event?: string;
}

export interface MetricQuery {
  /** How to derive the metric value */
  derivation: Derivation;
  /** Filter expression (e.g., "isMobile = true") */
  filter?: string;
  /** Attributes to group by (e.g., ["isMobile", "user.tier"]) */
  groupBy?: string[];
  /** Time bucket for aggregation */
  timeGroup?: TimeGroup;
  /** Time window for the query (e.g., "1h", "24h") */
  window?: string;
  /** Base expression for percentage calculations */
  over?: string;
  /** Percentile value for histogram metrics */
  percentile?: number;
}

export type Derivation =
  | 'count'
  | 'rate'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'duration'
  | 'error_rate'
  | 'success_rate'
  | 'percentage'
  | 'p50'
  | 'p95'
  | 'p99';

export type TimeGroup = 'minute' | 'hour' | 'day' | 'week' | 'month';

export interface AlertDefinition {
  name: string;
  condition: string;
  severity: 'info' | 'warning' | 'critical';
  runbook?: string;
}

export interface MetricDisplay {
  component?: DisplayComponent;
  size?: 'small' | 'medium' | 'large';
  showTrend?: boolean;
  showSparkline?: boolean;
  color?: string;
}

export type DisplayComponent =
  | 'MetricCard'
  | 'LineChart'
  | 'BarChart'
  | 'StackedBarChart'
  | 'PieChart'
  | 'GaugeChart'
  | 'Histogram'
  | 'DataTable';

// ============================================================================
// Dashboard Layout Types
// ============================================================================

export interface DashboardLayout {
  /** Grid column count (e.g., 12 for 12-column grid) */
  columns?: number;
  /** Gap between panels in pixels */
  gap?: number;

  /** Responsive breakpoints */
  breakpoints?: {
    mobile?: number; // e.g., 768 - below this, single column
    tablet?: number; // e.g., 1024 - below this, reduced columns
  };

  rows: DashboardRow[];
}

export interface DashboardRow {
  title?: string;
  panels: PanelPlacement[];
}

export interface PanelPlacement {
  /** Metric ID to display */
  id: string;

  /** Grid span (how many columns this panel takes, 1-12 for 12-column grid) */
  span?: number;

  /** Responsive spans */
  spanMobile?: number;
  spanTablet?: number;
  spanDesktop?: number;

  /** Height control */
  height?: number | 'auto';
  minHeight?: number;
}

// ============================================================================
// Mock Data Types (for prototyping without real OTEL data)
// ============================================================================

export interface MockMetricData {
  current?: number;
  previous?: number;
  trend?: 'up' | 'down' | 'flat';
  series?: TimeSeriesPoint[];
  breakdown?: Record<string, number>;
  histogram?: HistogramData;
}

export interface TimeSeriesPoint {
  date: string;
  value?: number;
  /** For grouped data (e.g., { date: "2024-03-27", mobile: 10156, desktop: 18946 }) */
  [key: string]: string | number | undefined;
}

export interface HistogramData {
  buckets: string[];
  counts: number[];
}

// ============================================================================
// Time Range Types
// ============================================================================

export type TimeRangePreset =
  | 'last_5m'
  | 'last_15m'
  | 'last_30m'
  | 'last_1h'
  | 'last_3h'
  | 'last_6h'
  | 'last_12h'
  | 'last_24h'
  | 'last_7d'
  | 'last_30d'
  | 'custom';

export interface TimeRange {
  preset?: TimeRangePreset;
  /** For custom ranges */
  start?: Date;
  end?: Date;
}

export type RefreshInterval = 'off' | '10s' | '30s' | '1m' | '5m' | '10m';

export interface TimeRangeConfig {
  /** Available presets to show in the selector */
  presets?: TimeRangePreset[];
  /** Default time range */
  defaultRange?: TimeRangePreset;
  /** Available refresh intervals */
  refreshIntervals?: RefreshInterval[];
  /** Default refresh interval */
  defaultRefresh?: RefreshInterval;
}

// ============================================================================
// Runtime Data Types (for rendering)
// ============================================================================

export interface MetricData {
  current?: number;
  previous?: number;
  trend?: 'up' | 'down' | 'flat';
  changePercent?: number;
  series?: TimeSeriesPoint[];
  breakdown?: Record<string, number>;
  histogram?: HistogramData;
  loading?: boolean;
  error?: string;
}

export interface DataProvider {
  get(metricId: string): MetricData;
  getAll(): Record<string, MetricData>;
}
