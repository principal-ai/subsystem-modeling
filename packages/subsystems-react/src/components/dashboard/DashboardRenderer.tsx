/**
 * DashboardRenderer
 *
 * Main component for rendering a dashboard from a DashboardDefinition.
 * Takes a dashboard definition JSON and a data provider, renders all metrics.
 */

import { useMemo, useState, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import type { DashboardRendererProps, MetricSource, PanelPlacement, TimeRange, RefreshInterval } from './types';
import { MetricPanel } from './MetricPanel';
import { MockDataProvider } from './MockDataProvider';
import { TimeRangeSelector } from './components';

type Breakpoint = 'mobile' | 'tablet' | 'desktop';

function useBreakpoint(breakpoints?: { mobile?: number; tablet?: number }): Breakpoint {
  const mobileBreak = breakpoints?.mobile ?? 768;
  const tabletBreak = breakpoints?.tablet ?? 1024;

  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => {
    if (typeof window === 'undefined') return 'desktop';
    const width = window.innerWidth;
    if (width < mobileBreak) return 'mobile';
    if (width < tabletBreak) return 'tablet';
    return 'desktop';
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < mobileBreak) setBreakpoint('mobile');
      else if (width < tabletBreak) setBreakpoint('tablet');
      else setBreakpoint('desktop');
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mobileBreak, tabletBreak]);

  return breakpoint;
}

export function DashboardRenderer({
  dashboard,
  dataProvider,
  timeRange: controlledTimeRange,
  onTimeRangeChange,
  refreshInterval: controlledRefreshInterval,
  onRefreshIntervalChange,
  timeRangeConfig,
  onMetricClick,
  onSourceClick,
}: DashboardRendererProps) {
  const { theme } = useTheme();
  const breakpoint = useBreakpoint(dashboard.layout.breakpoints);

  // Internal state for uncontrolled time range
  const [internalTimeRange, setInternalTimeRange] = useState<TimeRange>({
    preset: timeRangeConfig?.defaultRange ?? 'last_1h',
  });
  const [internalRefreshInterval, setInternalRefreshInterval] = useState<RefreshInterval>(
    timeRangeConfig?.defaultRefresh ?? 'off'
  );

  // Use controlled or internal state
  const timeRange = controlledTimeRange ?? internalTimeRange;
  const refreshInterval = controlledRefreshInterval ?? internalRefreshInterval;

  const handleTimeRangeChange = (range: TimeRange) => {
    if (onTimeRangeChange) {
      onTimeRangeChange(range);
    } else {
      setInternalTimeRange(range);
    }
  };

  const handleRefreshIntervalChange = (interval: RefreshInterval) => {
    if (onRefreshIntervalChange) {
      onRefreshIntervalChange(interval);
    } else {
      setInternalRefreshInterval(interval);
    }
  };

  // Grid configuration
  const gridColumns = dashboard.layout.columns ?? 12;
  const gridGap = dashboard.layout.gap ?? 16;

  // Use provided data provider or create a mock one
  const data = useMemo(() => {
    const provider = dataProvider || new MockDataProvider(dashboard);
    return provider.getAll();
  }, [dashboard, dataProvider]);

  // Build a map of metric ID → metric definition for quick lookup
  const metricsMap = useMemo(() => {
    const map = new Map<string, (typeof dashboard.metrics)[0]>();
    for (const metric of dashboard.metrics) {
      map.set(metric.id, metric);
    }
    return map;
  }, [dashboard.metrics]);

  const handleSourceClick = (source: MetricSource) => {
    if (onSourceClick) {
      onSourceClick(source);
    } else {
      // Default behavior: log to console
      console.log('Source clicked:', source);
    }
  };

  // Get span for current breakpoint
  const getSpan = (placement: PanelPlacement, totalPanels: number): number => {
    // Mobile defaults to full width
    if (breakpoint === 'mobile') {
      return placement.spanMobile ?? gridColumns;
    }

    // Tablet uses spanTablet or falls back to span
    if (breakpoint === 'tablet') {
      return placement.spanTablet ?? placement.span ?? Math.floor(gridColumns / Math.min(totalPanels, 2));
    }

    // Desktop uses spanDesktop or span or auto-calculate
    return placement.spanDesktop ?? placement.span ?? Math.floor(gridColumns / Math.min(totalPanels, 3));
  };

  return (
    <div
      style={{
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        padding: theme.space?.[4] || 24,
        minHeight: '100%',
        fontFamily: theme.fonts.body,
      }}
    >
      {/* Dashboard Header */}
      <div style={{ marginBottom: theme.space?.[4] || 24 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: theme.space?.[3] || 16,
            flexWrap: 'wrap',
          }}
        >
          <h1
            style={{
              fontSize: theme.fontSizes[4],
              fontWeight: theme.fontWeights.semibold,
              fontFamily: theme.fonts.heading,
              margin: 0,
              color: theme.colors.text,
            }}
          >
            {dashboard.name}
          </h1>

          <TimeRangeSelector
            timeRange={timeRange}
            onTimeRangeChange={handleTimeRangeChange}
            refreshInterval={refreshInterval}
            onRefreshIntervalChange={handleRefreshIntervalChange}
            config={timeRangeConfig}
          />
        </div>

        {dashboard.description && (
          <p
            style={{
              fontSize: theme.fontSizes[1],
              color: theme.colors.textSecondary,
              margin: 0,
              marginTop: theme.space?.[2] || 8,
              marginBottom: theme.space?.[3] || 12,
              lineHeight: theme.lineHeights.body,
            }}
          >
            {dashboard.description}
          </p>
        )}

        {/* External links */}
        {dashboard.externalLinks && Object.keys(dashboard.externalLinks).length > 0 && (
          <div style={{ display: 'flex', gap: theme.space?.[3] || 12 }}>
            {Object.entries(dashboard.externalLinks).map(([name, url]) => (
              url && (
                <a
                  key={name}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: theme.fontSizes[0],
                    color: theme.colors.primary || theme.colors.accent,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <svg
                    width={12}
                    height={12}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  {name}
                </a>
              )
            ))}
          </div>
        )}
      </div>

      {/* Dashboard Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space?.[4] || 24 }}>
        {dashboard.layout.rows.map((row, rowIndex) => (
          <div key={rowIndex}>
            {/* Row title */}
            {row.title && (
              <h2
                style={{
                  fontSize: theme.fontSizes[2],
                  fontWeight: theme.fontWeights.medium,
                  fontFamily: theme.fonts.heading,
                  margin: 0,
                  marginBottom: theme.space?.[3] || 12,
                  color: theme.colors.text,
                  paddingBottom: theme.space?.[2] || 8,
                  borderBottom: `1px solid ${theme.colors.border}`,
                }}
              >
                {row.title}
              </h2>
            )}

            {/* Row panels - using CSS Grid with column spans */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
                gap: gridGap,
              }}
            >
              {row.panels.map((panel) => {
                const span = getSpan(panel, row.panels.length);
                const metric = metricsMap.get(panel.id);

                const panelStyle: React.CSSProperties = {
                  gridColumn: `span ${span}`,
                  minHeight: panel.minHeight,
                  height: panel.height === 'auto' ? 'auto' : panel.height,
                };

                if (!metric) {
                  return (
                    <div
                      key={panel.id}
                      style={{
                        ...panelStyle,
                        backgroundColor: theme.colors.surface || theme.colors.background,
                        border: `1px solid ${theme.colors.error}`,
                        borderRadius: theme.radii?.[2] || 8,
                        padding: theme.space?.[3] || 16,
                        color: theme.colors.error,
                        fontSize: theme.fontSizes[1],
                      }}
                    >
                      Metric not found: {panel.id}
                    </div>
                  );
                }

                return (
                  <div key={panel.id} style={panelStyle}>
                    <MetricPanel
                      metric={metric}
                      data={data[panel.id] || { error: 'No data' }}
                      onMetricClick={onMetricClick}
                      onSourceClick={handleSourceClick}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Owner info */}
      {dashboard.owner && (
        <div
          style={{
            marginTop: theme.space?.[5] || 32,
            paddingTop: theme.space?.[3] || 16,
            borderTop: `1px solid ${theme.colors.border}`,
            fontSize: theme.fontSizes[0],
            color: theme.colors.textSecondary,
          }}
        >
          Owner: {dashboard.owner}
        </div>
      )}
    </div>
  );
}
