import { describe, expect, test } from 'bun:test';
import { isPrettierSourceLang, sourceLangForPath } from './sourceLang';

describe('sourceLangForPath', () => {
  test('maps JS/TS extensions to their grammar', () => {
    expect(sourceLangForPath('src/a.ts')).toBe('typescript');
    expect(sourceLangForPath('src/a.tsx')).toBe('tsx');
    expect(sourceLangForPath('src/a.mjs')).toBe('javascript');
    expect(sourceLangForPath('src/a.jsx')).toBe('jsx');
  });

  test('maps other languages', () => {
    expect(sourceLangForPath('graphify/dedup.py')).toBe('python');
    expect(sourceLangForPath('src/lib.rs')).toBe('rust');
    expect(sourceLangForPath('cmd/main.go')).toBe('go');
  });

  test('unknown / missing path falls back to text', () => {
    expect(sourceLangForPath(undefined)).toBe('text');
    expect(sourceLangForPath('')).toBe('text');
    expect(sourceLangForPath('Makefile')).toBe('text');
    expect(sourceLangForPath('src/a.unknownext')).toBe('text');
  });

  test('C-family stays text (WebKit-safe grammars)', () => {
    expect(sourceLangForPath('src/main.cpp')).toBe('text');
    expect(sourceLangForPath('src/graph.h')).toBe('text');
  });
});

describe('isPrettierSourceLang', () => {
  test('true only for the bundled Prettier parsers', () => {
    for (const lang of ['typescript', 'tsx', 'javascript', 'jsx']) {
      expect(isPrettierSourceLang(lang)).toBe(true);
    }
    for (const lang of ['python', 'rust', 'go', 'text']) {
      expect(isPrettierSourceLang(lang)).toBe(false);
    }
  });
});
