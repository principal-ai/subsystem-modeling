/** Shared Pierre / @pierre/diffs option helpers for file + snippet views. */

export const PIERRE_FILE_STYLE = { display: 'block' } as const;

export const PIERRE_BASE_OPTIONS = {
  disableFileHeader: true,
} as const;

export function buildBackgroundCSS(background: string): string {
  return `
  :host {
    background: ${background} !important;
  }
  pre, code,
  [data-gutter], [data-content],
  [data-line], [data-column-number],
  [data-gutter-buffer], [data-line-annotation], [data-no-newline],
  [data-separator], [data-separator-wrapper] {
    background: ${background} !important;
  }
  [data-line] span {
    background: ${background} !important;
  }
`;
}

export function buildPierreOptions(background?: string) {
  if (!background) return PIERRE_BASE_OPTIONS;
  return {
    ...PIERRE_BASE_OPTIONS,
    unsafeCSS: buildBackgroundCSS(background),
  };
}
