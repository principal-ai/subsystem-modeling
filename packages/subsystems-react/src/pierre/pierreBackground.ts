/** Shared Pierre / @pierre/diffs option helpers for file + snippet views. */

import { canUseWASM, type HighlighterTypes } from '@pierre/diffs';

/**
 * Highlighting backend for every Pierre surface.
 *
 * `'highlights'` is Pierre's WASM lexer (see `@pierre/highlights`): much faster
 * than Shiki and built for streaming/live edits. It needs WebAssembly + SIMD,
 * so older engines fall back to Shiki's JavaScript engine.
 */
export const PIERRE_PREFERRED_HIGHLIGHTER: HighlighterTypes = canUseWASM()
  ? 'highlights'
  : 'shiki-js';

export const PIERRE_FILE_STYLE = { display: 'block' } as const;

export const PIERRE_BASE_OPTIONS = {
  disableFileHeader: true,
  preferredHighlighter: PIERRE_PREFERRED_HIGHLIGHTER,
} as const;

/** Chrome overrides for the per-file header (`[data-diffs-header]`). */
export interface PierreHeaderStyle {
  /** Foreground for the header path and icon. */
  color?: string;
  /** Fill behind the header row. */
  background?: string;
  /** Rule under the header row. */
  borderBottom?: string;
  /** Explicit size — the library leaves the header to inherit its line box. */
  fontSize?: string;
  lineHeight?: string;
  /** Vertical padding. The library ships none, so this is the only breathing room. */
  padding?: string;
}

/**
 * Retint Pierre's code surface to `background`, optionally restyling the file
 * header.
 *
 * Every background in `@pierre/diffs` resolves to `--diffs-bg`, which is
 * `light-dark(var(--diffs-light-bg, #fff), var(--diffs-dark-bg, #000))` — so
 * overriding both inputs re-tints the whole surface from one variable and lets
 * the diff / selection / hover layers keep recomputing their `color-mix` tints
 * against it.
 *
 * `:host` still needs a direct override: the theme layer writes a literal
 * `background-color` there from the Shiki theme, which does not go through
 * `--diffs-bg`.
 *
 * Header rules land in each file item's shadow root, which is where
 * `FileRenderer` puts the header — `CodeView` forwards `unsafeCSS` to its file
 * items even though it never injects it into its own shadow root.
 *
 * Changing header height also invalidates `itemMetrics.diffHeaderHeight`, which
 * `CodeView` uses for its virtualization window and sticky offset. Keep the two
 * in step when overriding `fontSize` / `lineHeight` / `padding`.
 */
export function buildBackgroundCSS(
  background: string,
  header?: PierreHeaderStyle,
  lineNumberColor?: string,
): string {
  const headerDeclarations = header
    ? Object.entries(header)
        .map(([property, value]) => `  ${kebab(property)}: ${value};`)
        .join("\n")
    : "";

  return `
  :host {
    --diffs-light-bg: ${background};
    --diffs-dark-bg: ${background};
    ${lineNumberColor ? `--diffs-fg-number-override: ${lineNumberColor};` : ''}
    background: ${background} !important;
  }
  ${
    headerDeclarations
      ? `[data-diffs-header] {
${headerDeclarations}
  }`
      : ""
  }
`;
}

function kebab(property: string): string {
  return property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export function buildPierreOptions(
  background?: string,
  header?: PierreHeaderStyle,
  lineNumberColor?: string,
) {
  if (!background) return PIERRE_BASE_OPTIONS;
  return {
    ...PIERRE_BASE_OPTIONS,
    unsafeCSS: buildBackgroundCSS(background, header, lineNumberColor),
  };
}
