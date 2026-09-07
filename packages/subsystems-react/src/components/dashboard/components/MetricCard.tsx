/**
 * MetricCard
 *
 * Displays a single metric value with optional trend indicator and sparkline.
 */

import { useTheme } from '@principal-ade/industry-theme';
import type { MetricCardProps } from '../types';

export function MetricCard({
  title,
  value,
  unit,
  description,
  trend,
  changePercent,
  showTrend = true,
  showSparkline = false,
  sparklineData,
  thresholds,
  size = 'medium',
  onClick,
}: MetricCardProps) {
  const { theme } = useTheme();

  // Font size indices into theme.fontSizes array
  // Typical array: [12, 14, 16, 20, 24, 32, 48]
  const sizeConfig = {
    small: {
      padding: '12px 16px',
      titleIndex: 0,    // ~12px
      valueIndex: 4,    // ~24px
      unitIndex: 0,     // ~12px
      trendIndex: 0,    // ~12px
    },
    medium: {
      padding: '16px 20px',
      titleIndex: 1,    // ~14px
      valueIndex: 5,    // ~32px
      unitIndex: 1,     // ~14px
      trendIndex: 0,    // ~12px
    },
    large: {
      padding: '20px 24px',
      titleIndex: 2,    // ~16px
      valueIndex: 6,    // ~48px
      unitIndex: 2,     // ~16px
      trendIndex: 1,    // ~14px
    },
  };

  const config = sizeConfig[size];

  const getValueColor = () => {
    if (!thresholds || typeof value !== 'number') {
      return theme.colors.text;
    }
    if (thresholds.critical !== undefined && value >= thresholds.critical) {
      return theme.colors.error;
    }
    if (thresholds.warning !== undefined && value >= thresholds.warning) {
      return theme.colors.warning;
    }
    return theme.colors.success;
  };

  const getTrendIcon = () => {
    if (!trend || !showTrend) return null;

    const iconSize = size === 'small' ? 12 : 16;
    const iconStyle: React.CSSProperties = {
      width: iconSize,
      height: iconSize,
      marginRight: 4,
    };

    if (trend === 'up') {
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M7 17l5-5 5 5M7 7l5 5 5-5" />
        </svg>
      );
    }
    if (trend === 'down') {
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M7 7l5 5 5-5M7 17l5-5 5 5" />
        </svg>
      );
    }
    return (
      <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M5 12h14" />
      </svg>
    );
  };

  const getTrendColor = () => {
    if (!trend) return theme.colors.textSecondary;
    if (trend === 'up') return theme.colors.success;
    if (trend === 'down') return theme.colors.error;
    return theme.colors.textSecondary;
  };

  const formatValue = (val: number | string): string => {
    if (typeof val === 'string') return val;
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    if (val % 1 !== 0) return val.toFixed(1);
    return val.toString();
  };

  const renderSparkline = () => {
    if (!showSparkline || !sparklineData || sparklineData.length < 2) return null;

    const values = sparklineData
      .map((point) => point.value)
      .filter((v): v is number => typeof v === 'number');

    if (values.length < 2) return null;

    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const width = size === 'small' ? 100 : size === 'medium' ? 140 : 180;
    const height = size === 'small' ? 24 : size === 'medium' ? 32 : 40;
    const padding = 2;

    const points = values.map((val, i) => {
      const x = padding + (i / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
      return `${x},${y}`;
    });

    const pathD = `M ${points.join(' L ')}`;

    // Create gradient fill path
    const fillPoints = [
      `${padding},${height - padding}`,
      ...points,
      `${width - padding},${height - padding}`,
    ];
    const fillD = `M ${fillPoints.join(' L ')} Z`;

    const lineColor = trend === 'up' ? theme.colors.success : trend === 'down' ? theme.colors.error : theme.colors.primary || theme.colors.accent;

    return (
      <div style={{ marginTop: theme.space?.[2] || 8 }}>
        <svg width={width} height={height} style={{ display: 'block' }}>
          <defs>
            <linearGradient id={`sparkline-gradient-${title}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <path d={fillD} fill={`url(#sparkline-gradient-${title})`} />
          <path d={pathD} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  };

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: theme.colors.surface || theme.colors.background,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii?.[2] || 8,
        padding: config.padding,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        minWidth: size === 'small' ? 140 : size === 'medium' ? 180 : 220,
        fontFamily: theme.fonts.body,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = theme.colors.primary || theme.colors.accent;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border;
      }}
    >
      {/* Title */}
      <div
        style={{
          fontSize: theme.fontSizes[config.titleIndex],
          color: theme.colors.textSecondary,
          marginBottom: theme.space?.[2] || 8,
          fontWeight: theme.fontWeights.medium,
        }}
      >
        {title}
      </div>

      {/* Value */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: theme.fontSizes[config.valueIndex],
            fontWeight: theme.fontWeights.semibold,
            color: getValueColor(),
            fontVariantNumeric: 'tabular-nums',
            fontFamily: theme.fonts.monospace,
          }}
        >
          {formatValue(value)}
        </span>
        {unit && (
          <span
            style={{
              fontSize: theme.fontSizes[config.unitIndex],
              color: theme.colors.textSecondary,
            }}
          >
            {unit}
          </span>
        )}
      </div>

      {/* Trend */}
      {showTrend && (trend || changePercent !== undefined) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: theme.space?.[2] || 8,
            fontSize: theme.fontSizes[config.trendIndex],
            color: getTrendColor(),
            fontFamily: theme.fonts.monospace,
          }}
        >
          {getTrendIcon()}
          {changePercent !== undefined && (
            <span>
              {changePercent > 0 ? '+' : ''}
              {changePercent.toFixed(1)}%
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {description && (
        <div
          style={{
            fontSize: theme.fontSizes[config.trendIndex],
            color: theme.colors.textSecondary,
            marginTop: theme.space?.[2] || 8,
            lineHeight: theme.lineHeights.body,
            opacity: 0.8,
          }}
        >
          {description}
        </div>
      )}

      {/* Sparkline */}
      {renderSparkline()}
    </div>
  );
}
