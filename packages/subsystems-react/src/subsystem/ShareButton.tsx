import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

/** Standard header affordance for host-owned sharing flows. */
export function ShareButton({ onClick }: { onClick: () => void }) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      aria-label="Share"
      title="Share"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 34,
        padding: '0 10px',
        borderRadius: 6,
        border: `1px solid ${theme.colors.border}`,
        background: hover ? theme.colors.backgroundSecondary ?? theme.colors.border : 'transparent',
        color: theme.colors.textSecondary,
        font: 'inherit',
        fontSize: theme.fontSizes[1],
        cursor: 'pointer',
      }}
    >
      <Share2 size={14} aria-hidden="true" />
      Share
    </button>
  );
}
