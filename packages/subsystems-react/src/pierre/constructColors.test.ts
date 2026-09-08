import { describe, expect, test } from 'bun:test';
import {
  CONSTRUCT_COLOR,
  componentColor,
  constructColorsFromPierreTheme,
} from './constructColors';
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
  'custom_entity',
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

  test('all ten constructs are distinguishable within a theme', () => {
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

  test('componentColor inherits the construct color when no override', () => {
    expect(componentColor({ construct: 'class' }, 'pierre-dark')).toBe(
      constructColorsFromPierreTheme('pierre-dark').class,
    );
    expect(componentColor({ construct: 'custom_entity' }, 'pierre-light')).toBe(
      constructColorsFromPierreTheme('pierre-light').custom_entity,
    );
  });

  test('componentColor prefers an authored color override', () => {
    expect(
      componentColor(
        { construct: 'custom_entity', color: '#ff00aa' },
        'pierre-dark',
      ),
    ).toBe('#ff00aa');
    // same override in both themes — the explicit color wins outright
    expect(
      componentColor(
        { construct: 'custom_entity', color: '#ff00aa' },
        'pierre-light',
      ),
    ).toBe('#ff00aa');
  });
});
