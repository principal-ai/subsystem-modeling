import { describe, expect, test } from 'bun:test';
import {
  extractDeclarationLine,
  normalizeDeclarationLine,
  parseSourceLocation,
} from './declarationRef';

describe('parseSourceLocation', () => {
  test('parses L-prefixed lines', () => {
    expect(parseSourceLocation('L42')).toBe(42);
    expect(parseSourceLocation(' L1 ')).toBe(1);
  });

  test('rejects invalid', () => {
    expect(parseSourceLocation('42')).toBeNull();
    expect(parseSourceLocation('')).toBeNull();
    expect(parseSourceLocation(undefined)).toBeNull();
  });
});

describe('normalizeDeclarationLine', () => {
  test('trims trailing whitespace and CR', () => {
    expect(normalizeDeclarationLine('export class Foo {\r')).toBe('export class Foo {');
    expect(normalizeDeclarationLine('  x  ')).toBe('  x');
  });
});

describe('extractDeclarationLine', () => {
  test('1-based indexing', () => {
    expect(extractDeclarationLine('a\nb\nc', 2)).toBe('b');
    expect(extractDeclarationLine('a\nb', 3)).toBeNull();
  });
});
