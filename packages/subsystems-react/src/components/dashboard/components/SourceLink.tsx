/**
 * SourceLink
 *
 * Displays a link to the workflow/canvas that sources a metric.
 */

import { useTheme } from '@principal-ade/industry-theme';
import type { SourceLinkProps } from '../types';

export function SourceLink({ source, onClick }: SourceLinkProps) {
  const { theme } = useTheme();

  const formatSource = () => {
    const parts = [source.storyboard, source.workflow];
    if (source.nodes && source.nodes.length > 0) {
      parts.push(source.nodes.join(', '));
    }
    if (source.event) {
      parts.push(source.event);
    }
    return parts.join(' → ');
  };

  return (
    <button
      onClick={() => onClick?.(source)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        fontSize: theme.fontSizes[0],
        fontFamily: theme.fonts.body,
        color: theme.colors.primary || theme.colors.accent,
        backgroundColor: 'transparent',
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii?.[1] || 4,
        cursor: 'pointer',
        transition: 'background-color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = theme.colors.surface || theme.colors.background;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {/* Link icon */}
      <svg
        width={12}
        height={12}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      <span style={{ fontFamily: theme.fonts.monospace }}>{formatSource()}</span>
    </button>
  );
}
