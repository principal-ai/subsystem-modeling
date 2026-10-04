/**
 * Technology marks — official brand SVGs, vendored one per file, matched
 * against an element's free-text `technology`.
 *
 * The rule is deliberately strict: if we do not hold the official mark for a
 * technology, the slot stays empty. We do not substitute a generic glyph or a
 * lookalike — a wrong logo is worse than none. Adding a brand is dropping its
 * SVG in this folder and adding one row to `TECH_BRANDS`.
 *
 * Brand logos remain the property of their owners and are used for
 * identification only, under each owner's trademark policy.
 */

import { bunSvg } from './bun';
import { nodeSvg } from './node';
import { reactSvg } from './react';

export interface TechBrand {
  /** Human name, used for the tooltip / accessible label. */
  name: string;
  /** Where the mark was vendored from. */
  source: string;
  /** The official SVG, with its root sized to 100%. */
  svg: string;
  /** Matched against the technology string. First match in `TECH_BRANDS` wins. */
  match: RegExp;
  /**
   * Representative brand hue, for the card border. The dominant colour of the
   * mark, chosen to stay legible as a thin line.
   */
  color: string;
}

/**
 * Order matters: the first brand whose pattern matches is the one drawn, so
 * put the more specific marks first if two could match the same string.
 */
export const TECH_BRANDS: readonly TechBrand[] = [
  {
    name: 'React',
    source: 'https://react.dev',
    svg: reactSvg,
    match: /\breact\b/i,
    color: '#61dafb',
  },
  {
    name: 'Bun',
    source: 'https://bun.sh/logo.svg',
    svg: bunSvg,
    match: /\bbun\b/i,
    color: '#fbf0df',
  },
  {
    name: 'Node.js',
    source: 'https://nodejs.org/static/logos/nodejsHex.svg',
    svg: nodeSvg,
    // Matches "Node" and "Node.js"; "Electrobun" has no word boundary before
    // "bun" and never reaches here.
    match: /\bnode(\.js)?\b/i,
    color: '#5fa04e',
  },
];

/** The official mark for a technology string, or undefined when we hold none. */
export function technologyBrand(technology: string | undefined): TechBrand | undefined {
  if (!technology) return undefined;
  return TECH_BRANDS.find((brand) => brand.match.test(technology));
}

/** A brand mark sized to the top row. Full-colour, not tinted by state. */
export function TechMark({ brand, size = 14 }: { brand: TechBrand; size?: number }) {
  return (
    <span
      title={`${brand.name} — ${brand.source}`}
      aria-label={brand.name}
      style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0 }}
      // The SVG is a static, vendored string — never user input.
      dangerouslySetInnerHTML={{ __html: brand.svg }}
    />
  );
}
