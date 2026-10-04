import { describe, expect, test } from 'bun:test';
import { TECH_BRANDS, technologyBrand } from './index';

describe('technologyBrand', () => {
  test('matches the brand named in the technology string', () => {
    expect(technologyBrand('React 19')?.name).toBe('React');
    expect(technologyBrand('React + ELK')?.name).toBe('React');
    expect(technologyBrand('Bun + Electrobun host')?.name).toBe('Bun');
    expect(technologyBrand('Bun fs')?.name).toBe('Bun');
  });

  test('does not match a brand name inside another word', () => {
    // "Electrobun" contains "bun" but is not Bun — no word boundary.
    expect(technologyBrand('Electrobun host')).toBeUndefined();
  });

  test('returns nothing for technologies we hold no official mark for', () => {
    for (const tech of ['HTTP', 'REST', 'JSON files under ~/.principal', 'Electrobun host']) {
      expect(technologyBrand(tech)).toBeUndefined();
    }
    expect(technologyBrand('')).toBeUndefined();
    expect(technologyBrand(undefined)).toBeUndefined();
  });

  test('matches Node and Node.js', () => {
    expect(technologyBrand('Node')?.name).toBe('Node.js');
    expect(technologyBrand('Node.js 20')?.name).toBe('Node.js');
  });

  test('every vendored brand carries a source and an SVG', () => {
    for (const brand of TECH_BRANDS) {
      expect(brand.source).toMatch(/^https?:\/\//);
      expect(brand.svg.startsWith('<svg')).toBe(true);
      // Root sized to 100%, so the card wrapper controls the box.
      expect(brand.svg).toContain('width="100%"');
      expect(brand.svg).toContain('height="100%"');
    }
  });
});
