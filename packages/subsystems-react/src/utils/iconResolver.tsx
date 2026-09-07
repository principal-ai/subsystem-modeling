import React from 'react';
import * as LucideIcons from 'lucide-react';

/**
 * Icon Resolver
 *
 * Resolves icon strings to React components. Supports:
 * 1. Lucide icon names (e.g., "Database", "Settings", "Package")
 * 2. Emoji/Unicode strings (e.g., "⚙️", "💾", "📦")
 *
 * This keeps configurations JSON-serializable while supporting icon libraries.
 */

export interface IconProps {
  icon?: string;
  size?: number;
  className?: string;
}

/**
 * Resolves an icon string to a React element
 *
 * @param icon - Icon name (Lucide) or emoji/text string
 * @param size - Icon size in pixels (default: 20)
 * @param className - Optional CSS class
 * @returns React element or null
 */
export function resolveIcon(icon?: string, size: number = 20, className?: string): React.ReactNode {
  if (!icon) return null;

  // Try to resolve as Lucide icon first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LucideIcon = (LucideIcons as any)[icon];

  // Check if it's a valid React component (function or object with $$typeof)
  if (LucideIcon && (typeof LucideIcon === 'function' || typeof LucideIcon === 'object')) {
    return <LucideIcon size={size} className={className} />;
  }

  // Fall back to rendering as text (emoji or unicode)
  return (
    <span className={className} style={{ fontSize: `${size}px` }}>
      {icon}
    </span>
  );
}

/**
 * Icon component that resolves icon strings
 */
export const Icon: React.FC<IconProps> = ({ icon, size = 20, className }) => {
  return <>{resolveIcon(icon, size, className)}</>;
};
