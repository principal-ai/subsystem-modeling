/**
 * DashboardRenderer Stories
 *
 * Storybook stories for testing and iterating on dashboard rendering.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { DashboardRenderer } from '../../components/dashboard';
import activityFeedDashboard from '../data/activity-feed-analytics.dashboard.json';
import type { DashboardDefinition } from '../../components/dashboard';

const meta: Meta<typeof DashboardRenderer> = {
  title: 'Components/DashboardRenderer',
  component: DashboardRenderer,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ minHeight: '100vh' }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DashboardRenderer>;

/**
 * Activity Feed Analytics Dashboard
 *
 * Full dashboard example based on the web-ade activity feed use case.
 * Shows mobile vs desktop view percentages, traffic trends, and engagement metrics.
 */
export const ActivityFeedAnalytics: Story = {
  args: {
    dashboard: activityFeedDashboard as DashboardDefinition,
  },
};

/**
 * With Metric Click Handler
 *
 * Demonstrates handling metric clicks - useful for drill-down navigation.
 */
export const WithClickHandlers: Story = {
  args: {
    dashboard: activityFeedDashboard as DashboardDefinition,
    onMetricClick: (metricId) => {
      alert(`Clicked metric: ${metricId}`);
    },
    onSourceClick: (source) => {
      alert(`Navigate to: ${source.storyboard}/${source.workflow}`);
    },
  },
};

/**
 * Minimal Dashboard
 *
 * A simple dashboard with just a few metrics.
 */
export const MinimalDashboard: Story = {
  args: {
    dashboard: {
      id: 'minimal',
      name: 'Minimal Dashboard',
      description: 'A simple dashboard with basic metrics',
      metrics: [
        {
          id: 'total-requests',
          name: 'Total Requests',
          type: 'counter',
          unit: 'requests',
          sources: [{ storyboard: 'api', workflow: 'request-handler' }],
          query: { derivation: 'count', window: '1h' },
          _mockData: { current: 145892, previous: 132456, trend: 'up' },
        },
        {
          id: 'error-rate',
          name: 'Error Rate',
          type: 'gauge',
          unit: '%',
          sources: [{ storyboard: 'api', workflow: 'request-handler' }],
          query: { derivation: 'error_rate', window: '1h' },
          thresholds: { warning: 1.0, critical: 5.0 },
          _mockData: { current: 0.3, previous: 0.5, trend: 'down' },
        },
        {
          id: 'p99-latency',
          name: 'P99 Latency',
          type: 'histogram',
          unit: 'ms',
          sources: [{ storyboard: 'api', workflow: 'request-handler' }],
          query: { derivation: 'p99' },
          _mockData: { current: 245, previous: 312, trend: 'down' },
        },
      ],
      layout: {
        rows: [
          {
            title: 'Key Metrics',
            panels: [
              { id: 'total-requests', span: 4 },
              { id: 'error-rate', span: 4 },
              { id: 'p99-latency', span: 4 },
            ],
          },
        ],
      },
    } as DashboardDefinition,
  },
};

/**
 * Time Series Focus
 *
 * Dashboard focused on time series visualizations.
 */
export const TimeSeriesFocus: Story = {
  args: {
    dashboard: {
      id: 'time-series',
      name: 'Time Series Dashboard',
      description: 'Focus on time-based trends',
      metrics: [
        {
          id: 'hourly-requests',
          name: 'Hourly Requests',
          type: 'counter',
          unit: 'requests',
          sources: [{ storyboard: 'api', workflow: 'handler' }],
          query: { derivation: 'count', timeGroup: 'hour' },
          display: { component: 'LineChart', size: 'large' },
          _mockData: {
            series: [
              { date: '00:00', value: 1200 },
              { date: '04:00', value: 800 },
              { date: '08:00', value: 2400 },
              { date: '12:00', value: 3200 },
              { date: '16:00', value: 2800 },
              { date: '20:00', value: 1800 },
            ],
          },
        },
        {
          id: 'requests-by-status',
          name: 'Requests by Status',
          type: 'counter',
          unit: 'requests',
          sources: [{ storyboard: 'api', workflow: 'handler' }],
          query: { derivation: 'count', groupBy: ['status'], timeGroup: 'hour' },
          display: { component: 'StackedBarChart', size: 'large' },
          _mockData: {
            series: [
              { date: '00:00', success: 1150, error: 50 },
              { date: '04:00', success: 780, error: 20 },
              { date: '08:00', success: 2300, error: 100 },
              { date: '12:00', success: 3050, error: 150 },
              { date: '16:00', success: 2650, error: 150 },
              { date: '20:00', success: 1720, error: 80 },
            ],
          },
        },
      ],
      layout: {
        rows: [
          {
            title: 'Traffic Over Time',
            panels: [{ id: 'hourly-requests', span: 12 }],
          },
          {
            title: 'Status Breakdown',
            panels: [{ id: 'requests-by-status', span: 12 }],
          },
        ],
      },
    } as DashboardDefinition,
  },
};

/**
 * With Thresholds
 *
 * Shows metrics with warning and critical thresholds.
 */
export const WithThresholds: Story = {
  args: {
    dashboard: {
      id: 'thresholds',
      name: 'SLO Dashboard',
      description: 'Service level objectives with thresholds',
      metrics: [
        {
          id: 'availability',
          name: 'Availability',
          type: 'gauge',
          unit: '%',
          sources: [{ storyboard: 'infra', workflow: 'health-check' }],
          query: { derivation: 'success_rate' },
          thresholds: { warning: 99.9, critical: 99.0 },
          _mockData: { current: 99.95, trend: 'flat' },
        },
        {
          id: 'error-budget',
          name: 'Error Budget Remaining',
          type: 'gauge',
          unit: '%',
          sources: [{ storyboard: 'infra', workflow: 'slo-tracker' }],
          query: { derivation: 'percentage' },
          thresholds: { warning: 25, critical: 10 },
          _mockData: { current: 67.3, previous: 72.1, trend: 'down' },
        },
        {
          id: 'latency-slo',
          name: 'Latency SLO',
          type: 'gauge',
          unit: '%',
          description: 'Percentage of requests under 200ms',
          sources: [{ storyboard: 'api', workflow: 'handler' }],
          query: { derivation: 'percentage', filter: 'duration < 200' },
          thresholds: { warning: 95, critical: 90 },
          _mockData: { current: 97.2, previous: 96.8, trend: 'up' },
        },
      ],
      layout: {
        rows: [
          {
            title: 'Service Level Objectives',
            panels: [
              { id: 'availability', span: 4 },
              { id: 'error-budget', span: 4 },
              { id: 'latency-slo', span: 4 },
            ],
          },
        ],
      },
    } as DashboardDefinition,
  },
};

/**
 * Empty Dashboard
 *
 * Edge case: dashboard with no metrics.
 */
export const EmptyDashboard: Story = {
  args: {
    dashboard: {
      id: 'empty',
      name: 'Empty Dashboard',
      description: 'This dashboard has no metrics configured yet',
      metrics: [],
      layout: {
        rows: [],
      },
    } as DashboardDefinition,
  },
};
