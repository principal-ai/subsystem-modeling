import { describe, expect, test } from 'bun:test';
import {
  isPierreCFamilyPath,
  pierreCodeViewFileName,
  pierreLangForPath,
} from './pierreFileLang';

describe('pierreFileLang', () => {
  test('marks C-family extensions', () => {
    expect(isPierreCFamilyPath('src/main.cpp')).toBe(true);
    expect(isPierreCFamilyPath('src/graph.h')).toBe(true);
    expect(isPierreCFamilyPath('foo.mm')).toBe(true);
    expect(isPierreCFamilyPath('src/main.ts')).toBe(false);
  });

  test('forces plain text for C-family (WebKit-safe)', () => {
    expect(pierreLangForPath('src/main.cpp')).toBe('text');
    expect(pierreLangForPath('src/ingest_crawl.h')).toBe('text');
    expect(pierreLangForPath('src/foo.ts')).toBeUndefined();
  });

  test('uniquifies CodeView names while keeping the extension', () => {
    expect(pierreCodeViewFileName('src/main.cpp', 0)).toBe('01-main.cpp');
    expect(pierreCodeViewFileName('src/main.cpp', 6)).toBe('07-main.cpp');
  });
});
