/**
 * MockDataProvider
 *
 * Provides mock data for dashboard metrics during prototyping.
 * Can use inline _mockData from the dashboard definition or generate realistic data.
 */

import type {
  DashboardDefinition,
  MetricDefinition,
  MetricData,
  DataProvider,
  TimeSeriesPoint,
} from './types';

export class MockDataProvider implements DataProvider {
  private data: Record<string, MetricData> = {};

  constructor(dashboard: DashboardDefinition) {
    for (const metric of dashboard.metrics) {
      this.data[metric.id] = this.resolveData(metric);
    }
  }

  get(metricId: string): MetricData {
    return this.data[metricId] || { error: `No data for metric: ${metricId}` };
  }

  getAll(): Record<string, MetricData> {
    return this.data;
  }

  private resolveData(metric: MetricDefinition): MetricData {
    // Use inline mock data if provided
    if (metric._mockData) {
      return this.transformMockData(metric._mockData, metric);
    }

    // Generate data based on metric type and query
    return this.generateData(metric);
  }

  private transformMockData(
    mockData: NonNullable<MetricDefinition['_mockData']>,
    _metric: MetricDefinition
  ): MetricData {
    const result: MetricData = {};

    if (mockData.current !== undefined) {
      result.current = mockData.current;
    }

    if (mockData.previous !== undefined) {
      result.previous = mockData.previous;
      // Calculate change percent if not provided
      if (result.current !== undefined) {
        result.changePercent =
          ((result.current - mockData.previous) / mockData.previous) * 100;
        result.trend =
          result.changePercent > 0
            ? 'up'
            : result.changePercent < 0
              ? 'down'
              : 'flat';
      }
    }

    if (mockData.trend) {
      result.trend = mockData.trend;
    }

    if (mockData.series) {
      result.series = mockData.series;
    }

    if (mockData.breakdown) {
      result.breakdown = mockData.breakdown;
    }

    if (mockData.histogram) {
      result.histogram = mockData.histogram;
    }

    return result;
  }

  private generateData(metric: MetricDefinition): MetricData {
    const { type, query } = metric;

    // Time series data
    if (query.timeGroup) {
      return this.generateTimeSeries(metric);
    }

    // Single value
    if (type === 'gauge') {
      return this.generateGaugeData(metric);
    }

    if (type === 'counter') {
      return this.generateCounterData(metric);
    }

    if (type === 'histogram') {
      return this.generateHistogramData(metric);
    }

    // Fallback
    return {
      current: Math.floor(Math.random() * 1000),
      trend: 'flat',
    };
  }

  private generateTimeSeries(metric: MetricDefinition): MetricData {
    const { query } = metric;
    const points = this.getPointCount(query.timeGroup);
    const series: TimeSeriesPoint[] = [];

    const baseValue = this.getBaseValue(metric);
    const variance = 0.2;

    // Generate dates
    const dates = this.generateDates(query.timeGroup, points);

    if (query.groupBy && query.groupBy.length > 0) {
      // Grouped data (e.g., by isMobile)
      const groups = this.getGroupValues(query.groupBy[0]);

      for (let i = 0; i < points; i++) {
        const point: TimeSeriesPoint = { date: dates[i] };
        for (const group of groups) {
          point[group] = Math.floor(
            baseValue * (0.3 + Math.random() * 0.7) * (1 + (Math.random() - 0.5) * variance)
          );
        }
        series.push(point);
      }
    } else {
      // Simple time series
      for (let i = 0; i < points; i++) {
        series.push({
          date: dates[i],
          value: Math.floor(baseValue * (1 + (Math.random() - 0.5) * variance)),
        });
      }
    }

    return { series };
  }

  private generateGaugeData(metric: MetricDefinition): MetricData {
    const { query } = metric;

    // Percentage derivations
    if (
      query.derivation === 'percentage' ||
      query.derivation === 'error_rate' ||
      query.derivation === 'success_rate'
    ) {
      const current = Math.random() * 100;
      const previous = Math.random() * 100;
      return {
        current: Math.round(current * 10) / 10,
        previous: Math.round(previous * 10) / 10,
        trend: current > previous ? 'up' : current < previous ? 'down' : 'flat',
        changePercent: Math.round(((current - previous) / previous) * 100 * 10) / 10,
      };
    }

    // Rate
    if (query.derivation === 'rate') {
      const current = Math.floor(Math.random() * 1000);
      const previous = Math.floor(Math.random() * 1000);
      return {
        current,
        previous,
        trend: current > previous ? 'up' : current < previous ? 'down' : 'flat',
        changePercent: Math.round(((current - previous) / previous) * 100),
      };
    }

    const current = Math.floor(Math.random() * 10000);
    return { current, trend: 'flat' };
  }

  private generateCounterData(_metric: MetricDefinition): MetricData {
    const current = Math.floor(Math.random() * 100000);
    const previous = Math.floor(Math.random() * 100000);
    return {
      current,
      previous,
      trend: current > previous ? 'up' : current < previous ? 'down' : 'flat',
      changePercent: Math.round(((current - previous) / previous) * 100),
    };
  }

  private generateHistogramData(metric: MetricDefinition): MetricData {
    const { query } = metric;

    // Percentile value
    if (query.percentile) {
      const values = [50, 120, 200, 350, 500, 800, 1200];
      const percentileIndex = Math.min(
        Math.floor((query.percentile / 100) * values.length),
        values.length - 1
      );
      const current = values[percentileIndex] + Math.floor(Math.random() * 100);
      const previous = values[percentileIndex] + Math.floor(Math.random() * 100);

      return {
        current,
        previous,
        trend: current > previous ? 'up' : current < previous ? 'down' : 'flat',
        changePercent: Math.round(((current - previous) / previous) * 100),
      };
    }

    // Full histogram
    return {
      histogram: {
        buckets: ['0-50ms', '50-100ms', '100-200ms', '200-500ms', '500ms-1s', '>1s'],
        counts: [
          Math.floor(Math.random() * 1000),
          Math.floor(Math.random() * 800),
          Math.floor(Math.random() * 400),
          Math.floor(Math.random() * 200),
          Math.floor(Math.random() * 100),
          Math.floor(Math.random() * 50),
        ],
      },
    };
  }

  private getPointCount(timeGroup?: string): number {
    switch (timeGroup) {
      case 'minute':
        return 60;
      case 'hour':
        return 24;
      case 'day':
        return 7;
      case 'week':
        return 12;
      case 'month':
        return 12;
      default:
        return 7;
    }
  }

  private getBaseValue(metric: MetricDefinition): number {
    // Estimate reasonable base value based on metric type
    if (metric.query.derivation === 'percentage' || metric.query.derivation === 'error_rate') {
      return 50;
    }
    if (metric.unit === 'views' || metric.unit === 'count') {
      return 10000;
    }
    if (metric.unit === 'milliseconds' || metric.unit === 'ms') {
      return 200;
    }
    return 1000;
  }

  private generateDates(timeGroup: string | undefined, count: number): string[] {
    const dates: string[] = [];
    const now = new Date();

    for (let i = count - 1; i >= 0; i--) {
      const date = new Date(now);

      switch (timeGroup) {
        case 'minute':
          date.setMinutes(date.getMinutes() - i);
          dates.push(date.toISOString().slice(11, 16)); // HH:MM
          break;
        case 'hour':
          date.setHours(date.getHours() - i);
          dates.push(date.toISOString().slice(11, 13) + ':00'); // HH:00
          break;
        case 'day':
          date.setDate(date.getDate() - i);
          dates.push(date.toISOString().slice(0, 10)); // YYYY-MM-DD
          break;
        case 'week':
          date.setDate(date.getDate() - i * 7);
          dates.push(`W${this.getWeekNumber(date)}`);
          break;
        case 'month':
          date.setMonth(date.getMonth() - i);
          dates.push(date.toISOString().slice(0, 7)); // YYYY-MM
          break;
        default:
          date.setDate(date.getDate() - i);
          dates.push(date.toISOString().slice(0, 10));
      }
    }

    return dates;
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  private getGroupValues(groupBy: string): string[] {
    // Common group values based on attribute name
    if (groupBy === 'isMobile') {
      return ['mobile', 'desktop'];
    }
    if (groupBy === 'status' || groupBy === 'status.code') {
      return ['success', 'error'];
    }
    if (groupBy === 'user.tier') {
      return ['free', 'pro', 'enterprise'];
    }
    // Default generic groups
    return ['group_a', 'group_b'];
  }
}

/**
 * Create a mock data provider from a dashboard definition
 */
export function createMockDataProvider(dashboard: DashboardDefinition): DataProvider {
  return new MockDataProvider(dashboard);
}
