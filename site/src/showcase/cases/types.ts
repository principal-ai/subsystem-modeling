/**
 * Shared carousel / registry metadata for showcase cases.
 */
export interface ShowcaseCaseMeta {
  /** Stable id — matches `site/showcase/<id>/` and registry key. */
  id: string;
  /** Short label for a future marketing carousel card. */
  shortTitle: string;
  /** One-line blurb for carousel / index. */
  blurb: string;
  /** Stack chip (e.g. TypeScript). */
  stack: string;
  /** Axes this case is meant to illustrate. */
  axes: Array<'job' | 'shape' | 'stack' | 'insight' | 'complexity'>;
  /** Rough complexity for gallery ordering. */
  complexity: 'low' | 'medium' | 'high';
  /** Storybook title path (sidebar), e.g. `TypeScript/Daily page digest`. */
  storyTitle: string;
}
