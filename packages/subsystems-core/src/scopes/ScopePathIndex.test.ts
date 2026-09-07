import { describe, expect, test } from 'bun:test';
import { ScopePathIndex } from './ScopePathIndex';

function makeIndex(entries: Array<{ scope: string; paths: string[] }>) {
  const idx = new ScopePathIndex();
  idx.addAll(entries);
  return idx;
}

describe('ScopePathIndex.resolve', () => {
  test('empty index resolves to null', () => {
    const idx = new ScopePathIndex();
    expect(idx.resolve('packages/subsystems-core/src/foo.ts')).toBeNull();
  });

  test('matches file nested under a declared folder path', () => {
    const idx = makeIndex([{ scope: 'principal-ai.core', paths: ['packages/subsystems-core/src'] }]);
    const match = idx.resolve('packages/subsystems-core/src/events/foo.ts');
    expect(match?.entry.scope).toBe('principal-ai.core');
    expect(match?.matchedPath).toBe('packages/subsystems-core/src');
  });

  test('returns null when no path covers the file', () => {
    const idx = makeIndex([{ scope: 'principal-ai.core', paths: ['packages/subsystems-core/src'] }]);
    expect(idx.resolve('packages/principal-studio-cli/src/foo.ts')).toBeNull();
  });

  test('longest-prefix wins: nested child scope beats parent', () => {
    const idx = makeIndex([
      { scope: 'principal-ai.core', paths: ['packages/subsystems-core/src'] },
      { scope: 'principal-ai.core.validation', paths: ['packages/subsystems-core/src/validation'] },
    ]);

    // Parent-only subtree → parent wins
    expect(idx.resolve('packages/subsystems-core/src/events/foo.ts')?.entry.scope).toBe('principal-ai.core');
    // Child subtree → child wins (longer prefix)
    expect(idx.resolve('packages/subsystems-core/src/validation/engine.ts')?.entry.scope).toBe(
      'principal-ai.core.validation',
    );
    // Deeper under child → still child (inherited)
    expect(idx.resolve('packages/subsystems-core/src/validation/rules/foo.ts')?.entry.scope).toBe(
      'principal-ai.core.validation',
    );
  });

  test('sibling scopes resolve disjointly', () => {
    const idx = makeIndex([
      { scope: 'principal-ai.core', paths: ['packages/subsystems-core/src'] },
      { scope: 'principal-ai.cli', paths: ['packages/principal-studio-cli/src'] },
    ]);
    expect(idx.resolve('packages/subsystems-core/src/foo.ts')?.entry.scope).toBe('principal-ai.core');
    expect(idx.resolve('packages/principal-studio-cli/src/foo.ts')?.entry.scope).toBe('principal-ai.cli');
  });

  test('exact-file path matches when declared as a file', () => {
    const idx = makeIndex([{ scope: 'tiny', paths: ['packages/tiny/src/index.ts'] }]);
    expect(idx.resolve('packages/tiny/src/index.ts')?.entry.scope).toBe('tiny');
    expect(idx.resolve('packages/tiny/src/other.ts')).toBeNull();
  });

  test('normalization: trailing slash and ./ prefix are equivalent', () => {
    const idx = makeIndex([{ scope: 's', paths: ['packages/subsystems-core/src/'] }]);
    expect(idx.resolve('./packages/subsystems-core/src/foo.ts')?.entry.scope).toBe('s');
  });

  test('similar-prefix paths are not mistaken for nesting', () => {
    const idx = makeIndex([
      { scope: 'foo', paths: ['packages/foo/src'] },
      { scope: 'foobar', paths: ['packages/foobar/src'] },
    ]);
    expect(idx.resolve('packages/foobar/src/x.ts')?.entry.scope).toBe('foobar');
    expect(idx.resolve('packages/foo/src/x.ts')?.entry.scope).toBe('foo');
  });
});

describe('ScopePathIndex.getEntry / getScopes', () => {
  test('getEntry returns null when scope not registered', () => {
    const idx = makeIndex([{ scope: 's', paths: ['packages/subsystems-core/src'] }]);
    expect(idx.getEntry('other')).toBeNull();
  });

  test('getEntry returns the entry when present', () => {
    const idx = makeIndex([{ scope: 's', paths: ['packages/subsystems-core/src'] }]);
    expect(idx.getEntry('s')?.paths).toEqual(['packages/subsystems-core/src']);
  });

  test('getScopes lists each scope once', () => {
    const idx = makeIndex([
      { scope: 'a', paths: ['packages/a/src'] },
      { scope: 'b', paths: ['packages/b/src'] },
    ]);
    expect(idx.getScopes().slice().sort()).toEqual(['a', 'b']);
  });
});
