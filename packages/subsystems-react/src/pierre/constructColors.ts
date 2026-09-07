/**
 * Construct colors derived from the Pierre syntax themes.
 *
 * Single source of truth for node coloring: the same palette the declaration
 * panel and Pierre file views render with. The themes are static JSON objects
 * (VS Code/Shiki `tokenColors` scope rules), so extraction is a synchronous
 * scope lookup — no Shiki call, no React context. Dark/light (and any future
 * variant) resolves by mode at render time.
 *
 * Syntax themes deliberately reuse one hue across related scopes (class and
 * type share `entity.name.class`); the node taxonomy needs distinguishable
 * colors, so colliding constructs take a shade of the scope color — derived
 * from the theme itself, toward white in dark themes and toward black in
 * light themes.
 */

import type { SubsystemComponentConstruct } from '../subsystem/model';
import type { PierreSyntaxThemeName } from './pierreSyntaxTheme';
import pierreDark from '@pierre/theme/pierre-dark';
import pierreLight from '@pierre/theme/pierre-light';

interface PierreThemeInput {
  type: 'dark' | 'light';
  colors: Record<string, string>;
  tokenColors: Array<{ scope: string | string[]; settings: { foreground?: string } }>;
}

const THEMES: Record<PierreSyntaxThemeName, PierreThemeInput> = {
  'pierre-dark': pierreDark as unknown as PierreThemeInput,
  'pierre-light': pierreLight as unknown as PierreThemeInput,
};

/** First rule whose scope list contains the exact scope. */
function scopeColor(theme: PierreThemeInput, scope: string): string | undefined {
  for (const rule of theme.tokenColors) {
    const scopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
    if (scopes.includes(scope)) return rule.settings.foreground;
  }
  return undefined;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Linear blend of two hex colors; amount 0 = base, 1 = other. */
function mix(hex: string, other: string, amount: number): string {
  const base = hexToRgb(hex);
  const target = hexToRgb(other);
  return rgbToHex([
    base[0] + (target[0] - base[0]) * amount,
    base[1] + (target[1] - base[1]) * amount,
    base[2] + (target[2] - base[2]) * amount,
  ]);
}

export function constructColorsFromPierreTheme(
  themeName: PierreSyntaxThemeName,
): Record<SubsystemComponentConstruct, string> {
  const theme = THEMES[themeName];
  // A scope the theme doesn't declare resolves to the theme's own foreground —
  // still all-Pierre, never a hand-picked value.
  const editorFg = theme.colors['editor.foreground'] ?? '#fafafa';
  const pick = (scope: string) => scopeColor(theme, scope) ?? editorFg;
  const towardBackground = theme.type === 'dark' ? lighten : darken;

  const classColor = pick('entity.name.class');
  const functionColor = pick('entity.name.function');
  const typeColor = pick('support.type');
  const moduleColor = pick('entity.name.namespace');

  return {
    class: classColor,
    // interface/type are the type-name scope, shaded to separate them from
    // class (whose declaration name shares the same hue in syntax themes)
    interface: towardBackground(typeColor, 0.14),
    type_alias: towardBackground(typeColor, 0.28),
    function: functionColor,
    method: towardBackground(functionColor, 0.14),
    // enum members are constants — the generic constant hue
    enum: pick('constant'),
    // module and store share the constant hue — the module holds the store,
    // and the store IS the retained value, so the store keeps the pure
    // `variable.other.constant` color and the module takes the shade
    module: towardBackground(moduleColor, 0.18),
    store: pick('variable.other.constant'),
    external: pick('comment'),
  };
}

function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', amount);
}

function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', amount);
}

/**
 * The dark-theme instantiation, for consumers without a mode context (the
 * bun-side excalidraw exporter). React components derive per mode instead.
 */
export const CONSTRUCT_COLOR: Record<SubsystemComponentConstruct, string> =
  constructColorsFromPierreTheme('pierre-dark');
