import { describe, expect, test } from 'bun:test';
import { CONSTRUCT_COLOR, constructColorsFromPierreTheme } from './constructColors';
import type { SubsystemComponentConstruct } from '../subsystem/model';

const CONSTRUCTS: SubsystemComponentConstruct[] = [
  'class',
  'function',
  'method',
  'interface',
  'type_alias',
  'enum',
  'module',
  'store',
  'external',
];

const HEX = /^#[0-9a-f]{6}$/;

describe('constructColorsFromPierreTheme', () => {
  test('resolves every construct to a hex in both themes (no fallbacks)', () => {
    for (const themeName of ['pierre-dark', 'pierre-light'] as const) {
      const colors = constructColorsFromPierreTheme(themeName);
      for (const construct of CONSTRUCTS) {
        expect(colors[construct]).toMatch(HEX);
      }
    }
  });

  test('all seven constructs are distinguishable within a theme', () => {
    for (const themeName of ['pierre-dark', 'pierre-light'] as const) {
      const colors = constructColorsFromPierreTheme(themeName);
      const values = CONSTRUCTS.map((c) => colors[c]);
      expect(new Set(values).size).toBe(CONSTRUCTS.length);
    }
  });

  test('colliding scope pairs are shaded apart (class/type, function/method)', () => {
    const dark = constructColorsFromPierreTheme('pierre-dark');
    expect(dark.class).not.toBe(dark.type);
    expect(dark.function).not.toBe(dark.method);
  });

  test('dark and light instantiations differ', () => {
    expect(constructColorsFromPierreTheme('pierre-dark')).not.toEqual(
      constructColorsFromPierreTheme('pierre-light'),
    );
  });

  test('the static dark instantiation matches the derived table', () => {
    expect(CONSTRUCT_COLOR).toEqual(constructColorsFromPierreTheme('pierre-dark'));
  });
});
