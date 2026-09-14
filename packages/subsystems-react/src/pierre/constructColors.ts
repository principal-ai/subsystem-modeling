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
 * colors, so colliding constructs remap to distinct theme scopes (or a shade
 * of one) rather than sharing the syntax color verbatim.
 */

import type { SubsystemComponentConstruct } from '../subsystem/model';
import type { PierreSyntaxThemeName } from './pierreSyntaxTheme';
import pierreDark from '@pierre/theme/pierre-dark';
import pierreLight from '@pierre/theme/pierre-light';

/**
 * Resolve a component's accent color: an authored `color` override wins;
 * otherwise the construct color derived from the active Pierre syntax theme.
 * Single source of truth so the node border/badges and the declaration panel
 * agree on what a custom entity (or any component) renders as.
 */
export function componentColor(
  component: { color?: string; construct: SubsystemComponentConstruct },
  themeName: PierreSyntaxThemeName,
): string {
  if (component.color) return component.color;
  return constructColorsFromPierreTheme(themeName)[component.construct];
}

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

  // Classes: keyword's warm red/pink, pulled toward black for a crimson
  // border (syntax paints class names purple; the taxonomy wants red).
  // Darken lightly so it stays brighter than a muted wine, but still
  // distinguishable from method (hot pink / magenta).
  const classColor = mix(
    pick('keyword'),
    '#000000',
    theme.type === 'dark' ? 0.18 : 0.08,
  );
  // Syntax themes paint function names purple; the node taxonomy wants
  // standalone functions in the theme's string green, while methods take a
  // hot pink (keyword + type magenta) so they don't collapse into class crimson.
  const functionColor = pick('string');
  const methodColor = mix(
    pick('keyword'),
    pick('support.type'),
    theme.type === 'dark' ? 0.5 : 0.4,
  );
  // Cool white-silver: punctuation gray iced with numeric cyan, then lifted
  // toward pure white (dark) / pure black (light). Higher cyan mix so the
  // metallic cool cast survives the lift.
  const coolMetal = mix(pick('punctuation'), pick('constant.numeric'), 0.45);
  const interfaceColor =
    theme.type === 'dark'
      ? mix('#ffffff', coolMetal, 0.16)
      : mix('#000000', coolMetal, 0.3);

  return {
    class: classColor,
    // Interfaces are contracts / shapes — a near-white cool silver, not typed purple.
    interface: interfaceColor,
    // Type aliases: decorator blue (distinct from class crimson / enum purple).
    type_alias: pick('meta.decorator'),
    function: functionColor,
    method: methodColor,
    // Enums: function-name purple from the syntax theme.
    enum: pick('entity.name.function'),
    store: pick('variable.other.constant'),
    // Externals: comment gray, lifted slightly so they read as muted but
    // not sunk into the canvas.
    external:
      theme.type === 'dark'
        ? mix(pick('comment'), '#ffffff', 0.22)
        : mix(pick('comment'), '#000000', 0.08),
    // custom entities are actors, not code — the heading/emphasis coral reads
    // as a highlight against the code-construct hues. Distinct from entry role
    // orange (#ff6b35) which stays a badge, not a border.
    custom_entity: pick('markup.heading'),
  };
}

/**
 * The dark-theme instantiation, for consumers without a mode context (the
 * bun-side excalidraw exporter). React components derive per mode instead.
 */
export const CONSTRUCT_COLOR: Record<SubsystemComponentConstruct, string> =
  constructColorsFromPierreTheme('pierre-dark');
