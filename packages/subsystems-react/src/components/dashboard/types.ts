/**
 * Dashboard Types for React Components
 *
 * Core definition types are imported from @principal-ai/subsystems-core.
 * This file only contains React-specific component props types.
 */

// Re-export all core dashboard types
export type {
  // Dashboard definition types
  DashboardDefinition,
  MetricDefinition,
  MetricType,
  MetricSource,
  MetricQuery,
  Derivation,
  TimeGroup,
  AlertDefinition,
  MetricDisplay,
  DisplayComponent,
  // Layout types
  DashboardLayout,
  DashboardRow,
  PanelPlacement,
  // Mock data types
  MockMetricData,
  TimeSeriesPoint,
  HistogramData,
  // Time range types
  TimeRangePreset,
  TimeRange,
  RefreshInterval,
  TimeRangeConfig,
  // Runtime types
  MetricData,
  DataProvider,
} from '@principal-ai/subsystems-core';

// Import types needed for component props
import type {
  DashboardDefinition,
  MetricDefinition,
  MetricSource,
  MetricData,
  TimeSeriesPoint,
  TimeRange,
  RefreshInterval,
  TimeRangeConfig,
} from '@principal-ai/subsystems-core';

// ============================================================================
// React Component Props Types
// ============================================================================

export interface DashboardRendererProps {
  dashboard: DashboardDefinition;
  dataProvider?: import('@principal-ai/subsystems-core').DataProvider;

  // Time range controls
  timeRange?: TimeRange;
  onTimeRangeChange?: (range: TimeRange) => void;
  refreshInterval?: RefreshInterval;
  onRefreshIntervalChange?: (interval: RefreshInterval) => void;
  timeRangeConfig?: TimeRangeConfig;

  // Callbacks
  onMetricClick?: (metricId: string) => void;
  onSourceClick?: (source: MetricSource) => void;
}

export interface MetricPanelProps {
  metric: MetricDefinition;
  data: MetricData;
  onMetricClick?: (metricId: string) => void;
  onSourceClick?: (source: MetricSource) => void;
}

export interface MetricCardProps {
  title: string;
  value: number | string;
  unit?: string;
  description?: string;
  trend?: 'up' | 'down' | 'flat';
  changePercent?: number;
  showTrend?: boolean;
  showSparkline?: boolean;
  sparklineData?: TimeSeriesPoint[];
  thresholds?: { warning?: number; critical?: number };
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
}

export interface LineChartProps {
  title: string;
  data: TimeSeriesPoint[];
  xKey?: string;
  yKey?: string;
  series?: string[]; // For multi-series charts
  unit?: string;
  height?: number;
  onClick?: () => void;
}

export interface BarChartProps {
  title: string;
  data: TimeSeriesPoint[];
  xKey?: string;
  series: string[];
  stacked?: boolean;
  unit?: string;
  height?: number;
  onClick?: () => void;
}

export interface SourceLinkProps {
  source: MetricSource;
  onClick?: (source: MetricSource) => void;
}

export interface TimeRangeSelectorProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  refreshInterval?: RefreshInterval;
  onRefreshIntervalChange?: (interval: RefreshInterval) => void;
  config?: TimeRangeConfig;
}
