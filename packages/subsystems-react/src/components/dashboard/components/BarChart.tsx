/**
 * BarChart
 *
 * Simple SVG-based bar chart for grouped/stacked data.
 * For prototyping - can be replaced with a more robust charting library later.
 */

import { useMemo } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import type { BarChartProps } from '../types';

const CHART_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
];

export function BarChart({
  title,
  data,
  xKey = 'date',
  series,
  stacked = false,
  unit,
  height = 200,
  onClick,
}: BarChartProps) {
  const { theme } = useTheme();

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = 400;
  const chartHeight = height;

  const { bars, yAxisLabels, xAxisLabels } = useMemo(() => {
    if (!data || data.length === 0 || !series || series.length === 0) {
      return { bars: [], yAxisLabels: [], xAxisLabels: [], maxValue: 0 };
    }

    // Find max value
    let max = 0;
    for (const point of data) {
      if (stacked) {
        // Sum all series for stacked bars
        let sum = 0;
        for (const key of series) {
          const val = point[key];
          if (typeof val === 'number') sum += val;
        }
        if (sum > max) max = sum;
      } else {
        // Max of individual values for grouped bars
        for (const key of series) {
          const val = point[key];
          if (typeof val === 'number' && val > max) max = val;
        }
      }
    }

    max = max * 1.1; // Add padding

    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    const barGroupWidth = innerWidth / data.length;
    const barPadding = barGroupWidth * 0.2;
    const barAreaWidth = barGroupWidth - barPadding;

    const barsResult: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      label: string;
      value: number;
    }> = [];

    data.forEach((point, i) => {
      const groupX = padding.left + i * barGroupWidth + barPadding / 2;

      if (stacked) {
        // Stacked bars
        let currentY = padding.top + innerHeight;

        series.forEach((key, keyIndex) => {
          const val = point[key];
          if (typeof val === 'number') {
            const barHeight = (val / max) * innerHeight;
            currentY -= barHeight;

            barsResult.push({
              x: groupX,
              y: currentY,
              width: barAreaWidth,
              height: barHeight,
              color: CHART_COLORS[keyIndex % CHART_COLORS.length],
              label: key,
              value: val,
            });
          }
        });
      } else {
        // Grouped bars
        const singleBarWidth = barAreaWidth / series.length;

        series.forEach((key, keyIndex) => {
          const val = point[key];
          if (typeof val === 'number') {
            const barHeight = (val / max) * innerHeight;
            const barX = groupX + keyIndex * singleBarWidth;
            const barY = padding.top + innerHeight - barHeight;

            barsResult.push({
              x: barX,
              y: barY,
              width: singleBarWidth * 0.9,
              height: barHeight,
              color: CHART_COLORS[keyIndex % CHART_COLORS.length],
              label: key,
              value: val,
            });
          }
        });
      }
    });

    // Y-axis labels
    const yLabels: Array<{ value: string; y: number }> = [];
    for (let i = 0; i <= 4; i++) {
      const value = (max / 4) * (4 - i);
      const y = padding.top + (i / 4) * innerHeight;
      yLabels.push({
        value: formatNumber(value),
        y,
      });
    }

    // X-axis labels
    const xLabels: Array<{ value: string; x: number }> = [];
    data.forEach((point, i) => {
      const x = padding.left + i * barGroupWidth + barGroupWidth / 2;
      xLabels.push({
        value: String(point[xKey] || '').slice(-5), // Show last 5 chars (e.g., MM-DD)
        x,
      });
    });

    return {
      bars: barsResult,
      yAxisLabels: yLabels,
      xAxisLabels: xLabels,
      maxValue: max,
    };
  }, [data, series, xKey, stacked, chartWidth, chartHeight]);

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

        {/* Bars */}
        {bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            fill={bar.color}
            rx={2}
          />
        ))}
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
                  height: 12,
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
