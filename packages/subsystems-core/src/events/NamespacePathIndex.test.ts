import { describe, expect, test } from 'bun:test';
import { NamespacePathIndex } from './NamespacePathIndex';

function makeIndex(entries: Array<{ scope: string; namespace: string; paths: string[] }>) {
  const idx = new NamespacePathIndex();
  idx.addAll(entries);
  return idx;
}

describe('NamespacePathIndex.resolve', () => {
  test('empty index resolves to null', () => {
    const idx = new NamespacePathIndex();
    expect(idx.resolve('scope', 'src/foo.ts')).toBeNull();
  });

  test('matches file nested under a declared folder path', () => {
    const idx = makeIndex([{ scope: 's', namespace: 'events', paths: ['src/events'] }]);
    const match = idx.resolve('s', 'src/events/foo.ts');
    expect(match?.entry.namespace).toBe('events');
    expect(match?.matchedPath).toBe('src/events');
  });

  test('returns null when no path covers the file', () => {
    const idx = makeIndex([{ scope: 's', namespace: 'events', paths: ['src/events'] }]);
    expect(idx.resolve('s', 'src/other/foo.ts')).toBeNull();
  });

  test('scope isolation: match in scope A is not returned when querying scope B', () => {
    const idx = makeIndex([{ scope: 'A', namespace: 'events', paths: ['src/events'] }]);
    expect(idx.resolve('B', 'src/events/foo.ts')).toBeNull();
  });

  test('longest-prefix wins: nested child namespace beats parent', () => {
    const idx = makeIndex([
      { scope: 's', namespace: 'workflow', paths: ['src/workflow'] },
      { scope: 's', namespace: 'workflow.scenarios', paths: ['src/workflow/scenarios'] },
    ]);

    // Parent-only subtree → parent wins
    expect(idx.resolve('s', 'src/workflow/orchestrator.ts')?.entry.namespace).toBe('workflow');
    // Child subtree → child wins (longer prefix)
    expect(idx.resolve('s', 'src/workflow/scenarios/matcher.ts')?.entry.namespace).toBe(
      'workflow.scenarios',
    );
    // Deeper under child → still child (inherited)
    expect(idx.resolve('s', 'src/workflow/scenarios/helpers/fmt.ts')?.entry.namespace).toBe(
      'workflow.scenarios',
    );
  });

  test('exact-file path matches when declared as a file', () => {
    const idx = makeIndex([{ scope: 's', namespace: 'retry', paths: ['src/utils/retry.ts'] }]);
    expect(idx.resolve('s', 'src/utils/retry.ts')?.entry.namespace).toBe('retry');
    // Not a folder, so unrelated files don't match
    expect(idx.resolve('s', 'src/utils/other.ts')).toBeNull();
  });

  test('normalization: trailing slash and ./ prefix are equivalent', () => {
    const idx = makeIndex([{ scope: 's', namespace: 'events', paths: ['src/events/'] }]);
    expect(idx.resolve('s', './src/events/foo.ts')?.entry.namespace).toBe('events');
  });

  test('similar-prefix paths are not mistaken for nesting', () => {
    const idx = makeIndex([
      { scope: 's', namespace: 'foo', paths: ['src/foo'] },
      { scope: 's', namespace: 'foobar', paths: ['src/foobar'] },
    ]);
    expect(idx.resolve('s', 'src/foobar/x.ts')?.entry.namespace).toBe('foobar');
    expect(idx.resolve('s', 'src/foo/x.ts')?.entry.namespace).toBe('foo');
  });
});

describe('NamespacePathIndex.getEntry', () => {
  test('returns null when (scope, namespace) not registered', () => {
    const idx = makeIndex([{ scope: 's', namespace: 'events', paths: ['src/events'] }]);
    expect(idx.getEntry('s', 'workflow')).toBeNull();
    expect(idx.getEntry('other', 'events')).toBeNull();
  });

  test('returns the entry when present', () => {
    const idx = makeIndex([{ scope: 's', namespace: 'events', paths: ['src/events'] }]);
    expect(idx.getEntry('s', 'events')?.paths).toEqual(['src/events']);
  });
});

describe('NamespacePathIndex.getScopeEntries / getScopes', () => {
  test('returns only entries for the requested scope', () => {
    const idx = makeIndex([
      { scope: 'A', namespace: 'a1', paths: ['src/a1'] },
      { scope: 'A', namespace: 'a2', paths: ['src/a2'] },
      { scope: 'B', namespace: 'b1', paths: ['src/b1'] },
    ]);
    expect(idx.getScopeEntries('A')).toHaveLength(2);
    expect(idx.getScopeEntries('B')).toHaveLength(1);
    expect(idx.getScopes().sort()).toEqual(['A', 'B']);
  });
});
