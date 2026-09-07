/**
 * LineChart
 *
 * Simple SVG-based line chart for time series data.
 * For prototyping - can be replaced with a more robust charting library later.
 */

import { useMemo } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import type { LineChartProps } from '../types';

const CHART_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
];

export function LineChart({
  title,
  data,
  xKey = 'date',
  yKey = 'value',
  series,
  unit,
  height = 200,
  onClick,
}: LineChartProps) {
  const { theme } = useTheme();

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = 400;
  const chartHeight = height;

  const { paths, yAxisLabels, xAxisLabels } = useMemo(() => {
    if (!data || data.length === 0) {
      return { paths: [], yAxisLabels: [], xAxisLabels: [], maxValue: 0 };
    }

    // Determine which keys to plot
    const keys = series || [yKey];

    // Find max value across all series
    let max = 0;
    for (const point of data) {
      for (const key of keys) {
        const val = point[key];
        if (typeof val === 'number' && val > max) {
          max = val;
        }
      }
    }

    // Add 10% padding to max
    max = max * 1.1;

    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    // Generate paths for each series
    const pathsResult: Array<{ path: string; color: string; label: string }> = [];

    keys.forEach((key, keyIndex) => {
      const points: Array<{ x: number; y: number }> = [];

      data.forEach((point, i) => {
        const val = point[key];
        if (typeof val === 'number') {
          const x = padding.left + (i / (data.length - 1 || 1)) * innerWidth;
          const y = padding.top + innerHeight - (val / max) * innerHeight;
          points.push({ x, y });
        }
      });

      if (points.length > 0) {
        const pathD = points
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
          .join(' ');

        pathsResult.push({
          path: pathD,
          color: CHART_COLORS[keyIndex % CHART_COLORS.length],
          label: key,
        });
      }
    });

    // Y-axis labels (5 ticks)
    const yLabels: Array<{ value: string; y: number }> = [];
    for (let i = 0; i <= 4; i++) {
      const value = (max / 4) * (4 - i);
      const y = padding.top + (i / 4) * innerHeight;
      yLabels.push({
        value: formatNumber(value),
        y,
      });
    }

    // X-axis labels (show first, middle, last)
    const xLabels: Array<{ value: string; x: number }> = [];
    const indices = [0, Math.floor(data.length / 2), data.length - 1];
    for (const idx of indices) {
      if (data[idx]) {
        const x = padding.left + (idx / (data.length - 1 || 1)) * innerWidth;
        xLabels.push({
          value: String(data[idx][xKey] || ''),
          x,
        });
      }
    }

    return {
      paths: pathsResult,
      yAxisLabels: yLabels,
      xAxisLabels: xLabels,
      maxValue: max,
    };
  }, [data, series, yKey, xKey, chartWidth, chartHeight]);

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: theme.colors.surface || theme.colors.background,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii?.[2] || 8,
        padding: theme.space?.[3] || 16,
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: theme.fonts.body,
      }}
    >
      {/* Title */}
      <div
        style={{
          fontSize: theme.fontSizes[1],
          fontWeight: theme.fontWeights.medium,
          color: theme.colors.text,
          marginBottom: theme.space?.[3] || 16,
        }}
      >
        {title}
        {unit && (
          <span style={{ color: theme.colors.textSecondary, fontWeight: theme.fontWeights.body }}>
            {' '}
            ({unit})
          </span>
        )}
      </div>

      {/* Chart */}
      <svg
        width="100%"
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {yAxisLabels.map((label, i) => (
          <line
            key={i}
            x1={padding.left}
            y1={label.y}
            x2={chartWidth - padding.right}
            y2={label.y}
            stroke={theme.colors.border}
            strokeDasharray="4 4"
            opacity={0.5}
          />
        ))}

        {/* Y-axis labels */}
        {yAxisLabels.map((label, i) => (
          <text
            key={i}
            x={padding.left - 8}
            y={label.y}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={theme.fontSizes[0]}
            fontFamily={theme.fonts.monospace}
            fill={theme.colors.textSecondary}
          >
            {label.value}
          </text>
        ))}

        {/* X-axis labels */}
        {xAxisLabels.map((label, i) => (
          <text
            key={i}
            x={label.x}
            y={chartHeight - padding.bottom + 20}
            textAnchor="middle"
            fontSize={theme.fontSizes[0]}
            fontFamily={theme.fonts.monospace}
            fill={theme.colors.textSecondary}
          >
            {label.value}
          </text>
        ))}

        {/* Lines */}
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.path}
            fill="none"
            stroke={p.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Data points */}
        {paths.map((p, pathIndex) => {
          const points = p.path.split(/[ML]/).filter(Boolean);
          return points.map((point, i) => {
            const [x, y] = point.trim().split(' ').map(Number);
            return (
              <circle
                key={`${pathIndex}-${i}`}
                cx={x}
                cy={y}
                r={3}
                fill={p.color}
              />
            );
          });
        })}
      </svg>

      {/* Legend */}
      {series && series.length > 1 && (
        <div
          style={{
            display: 'flex',
            gap: theme.space?.[3] || 16,
            marginTop: theme.space?.[3] || 12,
            justifyContent: 'center',
          }}
        >
          {series.map((s, i) => (
            <div
              key={s}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: theme.fontSizes[0],
                color: theme.colors.textSecondary,
                fontFamily: theme.fonts.body,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 3,
                  backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                  borderRadius: 2,
                }}
              />
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  if (value % 1 !== 0) return value.toFixed(1);
  return Math.round(value).toString();
}
