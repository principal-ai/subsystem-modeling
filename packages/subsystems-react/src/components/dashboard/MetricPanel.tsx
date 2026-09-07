/**
 * MetricPanel
 *
 * Wrapper component that determines which visualization to render
 * based on the metric definition and data.
 */

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import type {
  MetricPanelProps,
  MetricDefinition,
  MetricData,
  DisplayComponent,
} from './types';
import { MetricCard, LineChart, BarChart, SourceLink } from './components';

export function MetricPanel({
  metric,
  data,
  onMetricClick,
  onSourceClick,
}: MetricPanelProps) {
  const { theme } = useTheme();

  // Determine which component to use
  const componentType = getComponentType(metric, data);

  // Render loading state
  if (data.loading) {
    return (
      <div
        style={{
          backgroundColor: theme.colors.surface || theme.colors.background,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii?.[2] || 8,
          padding: theme.space?.[3] || 16,
          minHeight: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: theme.fonts.body,
        }}
      >
        <span style={{ color: theme.colors.textSecondary, fontSize: theme.fontSizes[1] }}>
          Loading...
        </span>
      </div>
    );
  }

  // Render error state
  if (data.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            backgroundColor: theme.colors.surface || theme.colors.background,
            border: `1px solid ${theme.colors.error}`,
            borderRadius: theme.radii?.[2] || 8,
            padding: theme.space?.[3] || 16,
            fontFamily: theme.fonts.body,
          }}
        >
          <div
            style={{
              color: theme.colors.error,
              marginBottom: theme.space?.[2] || 8,
              fontSize: theme.fontSizes[1],
              fontWeight: theme.fontWeights.medium,
            }}
          >
            {metric.name}
          </div>
          <div style={{ color: theme.colors.textSecondary, fontSize: theme.fontSizes[0] }}>
            {data.error}
          </div>
        </div>

        {/* Source links - show even in error state for navigation to workflows */}
        {metric.sources && metric.sources.length > 0 && onSourceClick && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {metric.sources.map((source, i) => (
              <SourceLink key={i} source={source} onClick={onSourceClick} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const handleClick = () => {
    onMetricClick?.(metric.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* The visualization component */}
      {renderComponent(componentType, metric, data, handleClick)}

      {/* Source links */}
      {metric.sources && metric.sources.length > 0 && onSourceClick && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {metric.sources.map((source, i) => (
            <SourceLink key={i} source={source} onClick={onSourceClick} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Determine which component to render based on metric definition and data
 */
function getComponentType(metric: MetricDefinition, data: MetricData): DisplayComponent {
  // Explicit display hint takes precedence
  if (metric.display?.component) {
    return metric.display.component;
  }

  const { type, query } = metric;

  // Time series data → chart
  if (data.series && data.series.length > 0) {
    if (query.groupBy && query.groupBy.length > 0) {
      return 'StackedBarChart';
    }
    return 'LineChart';
  }

  // Histogram data
  if (data.histogram) {
    return 'Histogram';
  }

  // Counter with time grouping → line/bar chart (but no series data yet)
  if (type === 'counter' && query.timeGroup) {
    return query.groupBy?.length ? 'BarChart' : 'LineChart';
  }

  // Gauge (percentage) → gauge or metric card
  if (type === 'gauge') {
    return metric.thresholds ? 'GaugeChart' : 'MetricCard';
  }

  // Default to metric card
  return 'MetricCard';
}

/**
 * Render the appropriate component
 */
function renderComponent(
  componentType: DisplayComponent,
  metric: MetricDefinition,
  data: MetricData,
  onClick?: () => void
): React.ReactNode {
  switch (componentType) {
    case 'MetricCard':
    case 'GaugeChart': // Use MetricCard for now, can add GaugeChart later
      return (
        <MetricCard
          title={metric.name}
          value={data.current ?? 0}
          unit={metric.unit}
          description={metric.description}
          trend={data.trend}
          changePercent={data.changePercent}
          showTrend={metric.display?.showTrend ?? true}
          showSparkline={metric.display?.showSparkline}
          sparklineData={data.series}
          thresholds={metric.thresholds}
          size={metric.display?.size || 'medium'}
          onClick={onClick}
        />
      );

    case 'LineChart':
      return (
        <LineChart
          title={metric.name}
          data={data.series || []}
          xKey="date"
          yKey="value"
          unit={metric.unit}
          onClick={onClick}
        />
      );

    case 'BarChart':
    case 'StackedBarChart':
      // Extract series keys from data
      const series = data.series && data.series.length > 0
        ? Object.keys(data.series[0]).filter(k => k !== 'date')
        : metric.query.groupBy || [];

      return (
        <BarChart
          title={metric.name}
          data={data.series || []}
          xKey="date"
          series={series}
          stacked={componentType === 'StackedBarChart'}
          unit={metric.unit}
          onClick={onClick}
        />
      );

    case 'Histogram':
      // TODO: Implement Histogram component
      return (
        <MetricCard
          title={metric.name}
          value="Histogram (TODO)"
          description={metric.description}
          onClick={onClick}
        />
      );

    case 'PieChart':
      // TODO: Implement PieChart component
      return (
        <MetricCard
          title={metric.name}
          value="PieChart (TODO)"
          description={metric.description}
          onClick={onClick}
        />
      );

    case 'DataTable':
      // TODO: Implement DataTable component
      return (
        <MetricCard
          title={metric.name}
          value="DataTable (TODO)"
          description={metric.description}
          onClick={onClick}
        />
      );

    default:
      return (
        <MetricCard
          title={metric.name}
          value={data.current ?? 0}
          unit={metric.unit}
          onClick={onClick}
        />
      );
  }
}
