/** Shared Pierre / @pierre/diffs option helpers for file + snippet views. */

export const PIERRE_FILE_STYLE = { display: 'block' } as const;

export const PIERRE_BASE_OPTIONS = {
  disableFileHeader: true,
} as const;

/** Chrome overrides for the per-file header (`[data-diffs-header]`). */
export interface PierreHeaderStyle {
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
) {
  if (!background) return PIERRE_BASE_OPTIONS;
  return {
    ...PIERRE_BASE_OPTIONS,
    unsafeCSS: buildBackgroundCSS(background, header),
  };
}
