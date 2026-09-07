/**
 * TimeRangeSelector
 *
 * Dropdown selector for time range and auto-refresh interval.
 */

import { useState, useRef, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import type { TimeRangeSelectorProps, TimeRangePreset, RefreshInterval } from '../types';

const PRESET_LABELS: Record<TimeRangePreset, string> = {
  last_5m: 'Last 5 minutes',
  last_15m: 'Last 15 minutes',
  last_30m: 'Last 30 minutes',
  last_1h: 'Last 1 hour',
  last_3h: 'Last 3 hours',
  last_6h: 'Last 6 hours',
  last_12h: 'Last 12 hours',
  last_24h: 'Last 24 hours',
  last_7d: 'Last 7 days',
  last_30d: 'Last 30 days',
  custom: 'Custom range',
};

const REFRESH_LABELS: Record<RefreshInterval, string> = {
  off: 'Off',
  '10s': '10 seconds',
  '30s': '30 seconds',
  '1m': '1 minute',
  '5m': '5 minutes',
  '10m': '10 minutes',
};

const DEFAULT_PRESETS: TimeRangePreset[] = [
  'last_1h',
  'last_3h',
  'last_6h',
  'last_12h',
  'last_24h',
  'last_7d',
];

const DEFAULT_REFRESH_INTERVALS: RefreshInterval[] = [
  'off',
  '30s',
  '1m',
  '5m',
];

export function TimeRangeSelector({
  timeRange,
  onTimeRangeChange,
  refreshInterval = 'off',
  onRefreshIntervalChange,
  config,
}: TimeRangeSelectorProps) {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'range' | 'refresh'>('range');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const presets = config?.presets ?? DEFAULT_PRESETS;
  const refreshIntervals = config?.refreshIntervals ?? DEFAULT_REFRESH_INTERVALS;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getCurrentLabel = (): string => {
    if (timeRange.preset && timeRange.preset !== 'custom') {
      return PRESET_LABELS[timeRange.preset];
    }
    if (timeRange.start && timeRange.end) {
      const formatDate = (d: Date) => d.toLocaleDateString();
      return `${formatDate(timeRange.start)} - ${formatDate(timeRange.end)}`;
    }
    return 'Select time range';
  };

  const handlePresetSelect = (preset: TimeRangePreset) => {
    onTimeRangeChange({ preset });
    setIsOpen(false);
  };

  const handleRefreshSelect = (interval: RefreshInterval) => {
    onRefreshIntervalChange?.(interval);
    setIsOpen(false);
  };

  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    backgroundColor: theme.colors.surface || theme.colors.background,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii?.[1] || 4,
    fontSize: theme.fontSizes[1],
    fontFamily: theme.fonts.body,
    color: theme.colors.text,
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  };

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    minWidth: 200,
    backgroundColor: theme.colors.surface || theme.colors.background,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii?.[2] || 8,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: 1000,
    overflow: 'hidden',
  };

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 12px',
    backgroundColor: isActive ? theme.colors.surface : 'transparent',
    border: 'none',
    borderBottom: isActive ? `2px solid ${theme.colors.primary || theme.colors.accent}` : '2px solid transparent',
    fontSize: theme.fontSizes[0],
    fontFamily: theme.fonts.body,
    fontWeight: isActive ? theme.fontWeights.medium : theme.fontWeights.body,
    color: isActive ? theme.colors.text : theme.colors.textSecondary,
    cursor: 'pointer',
  });

  const optionStyle = (isSelected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: isSelected ? (theme.colors.primary || theme.colors.accent) + '15' : 'transparent',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    fontSize: theme.fontSizes[1],
    fontFamily: theme.fonts.body,
    color: theme.colors.text,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  });

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Main button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={buttonStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = theme.colors.primary || theme.colors.accent;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = theme.colors.border;
        }}
      >
        {/* Clock icon */}
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>{getCurrentLabel()}</span>
        {/* Chevron */}
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {/* Refresh indicator */}
        {refreshInterval !== 'off' && (
          <span
            style={{
              marginLeft: 4,
              padding: '2px 6px',
              backgroundColor: theme.colors.primary || theme.colors.accent,
              color: theme.colors.background,
              fontSize: theme.fontSizes[0],
              borderRadius: theme.radii?.[1] || 4,
              fontWeight: theme.fontWeights.medium,
            }}
          >
            {refreshInterval}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div style={dropdownStyle}>
          {/* Tabs */}
          {onRefreshIntervalChange && (
            <div style={{ display: 'flex', borderBottom: `1px solid ${theme.colors.border}` }}>
              <button style={tabStyle(activeTab === 'range')} onClick={() => setActiveTab('range')}>
                Time Range
              </button>
              <button style={tabStyle(activeTab === 'refresh')} onClick={() => setActiveTab('refresh')}>
                Auto Refresh
              </button>
            </div>
          )}

          {/* Options */}
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {activeTab === 'range' &&
              presets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handlePresetSelect(preset)}
                  style={optionStyle(timeRange.preset === preset)}
                  onMouseEnter={(e) => {
                    if (timeRange.preset !== preset) {
                      e.currentTarget.style.backgroundColor = theme.colors.border + '40';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      timeRange.preset === preset
                        ? (theme.colors.primary || theme.colors.accent) + '15'
                        : 'transparent';
                  }}
                >
                  <span>{PRESET_LABELS[preset]}</span>
                  {timeRange.preset === preset && (
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}

            {activeTab === 'refresh' &&
              refreshIntervals.map((interval) => (
                <button
                  key={interval}
                  onClick={() => handleRefreshSelect(interval)}
                  style={optionStyle(refreshInterval === interval)}
                  onMouseEnter={(e) => {
                    if (refreshInterval !== interval) {
                      e.currentTarget.style.backgroundColor = theme.colors.border + '40';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      refreshInterval === interval
                        ? (theme.colors.primary || theme.colors.accent) + '15'
                        : 'transparent';
                  }}
                >
                  <span>{REFRESH_LABELS[interval]}</span>
                  {refreshInterval === interval && (
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
