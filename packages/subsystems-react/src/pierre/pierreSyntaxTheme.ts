/**
 * Pierre syntax theme names — aligned with @pierre/diffs DEFAULT_THEMES.
 */

export type PierreSyntaxThemeName = 'pierre-dark' | 'pierre-light';

export const PIERRE_DEFAULT_SYNTAX_THEMES = {
  dark: 'pierre-dark',
  light: 'pierre-light',
} as const satisfies Record<'dark' | 'light', PierreSyntaxThemeName>;

/** Pick pierre-dark / pierre-light to match Pierre file views and industry-theme mode. */
export function resolvePierreSyntaxThemeName(mode?: string): PierreSyntaxThemeName {
  if (mode === 'light') return PIERRE_DEFAULT_SYNTAX_THEMES.light;
  if (mode === 'dark') return PIERRE_DEFAULT_SYNTAX_THEMES.dark;
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  ) {
    return PIERRE_DEFAULT_SYNTAX_THEMES.light;
  }
  return PIERRE_DEFAULT_SYNTAX_THEMES.dark;
}
