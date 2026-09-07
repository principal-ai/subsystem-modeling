import { describe, expect, test } from 'bun:test';
import type { GraphifyNode } from './types';
import {
  createGraphifyTypeResolver,
  normalizeGraphifyLabel,
  resolveGraphifyTypeRef,
} from './resolve';

function node(id: string, label: string, sourceFile: string, location?: string): GraphifyNode {
  return { id, label, file_type: 'code', source_file: sourceFile, source_location: location ?? '' };
}

const corpus: GraphifyNode[] = [
  // Real definition of SessionReader in another file.
  node('src/session_reader.ts#sessionreader', 'SessionReader', 'src/session_reader.ts', 'L12'),
  // Same-name class in a second package → ambiguous stub target.
  node('other/pkg/reader.ts#sessionreader', 'SessionReader', 'other/pkg/reader.ts', 'L3'),
  // Sourceless stub left behind by an ambiguous reference.
  node('stub-sessionreader', 'SessionReader', ''),
  // A file node — never a resolution candidate.
  node('src/session_reader_ts', 'session_reader.ts', 'src/session_reader.ts'),
];

describe('normalizeGraphifyLabel', () => {
  test('mirrors graphify normalise_callable_label', () => {
    expect(normalizeGraphifyLabel(' SessionReader() ')).toBe('sessionreader');
    expect(normalizeGraphifyLabel('.method()')).toBe('method');
    expect(normalizeGraphifyLabel('SessionReader')).toBe('sessionreader');
  });
});

describe('createGraphifyTypeResolver', () => {
  test('resolved when the target is a real definition', () => {
    const resolver = createGraphifyTypeResolver(corpus);
    const r = resolver.resolve('src/session_reader.ts#sessionreader');
    expect(r.status).toBe('resolved');
    expect(r.node?.source_file).toBe('src/session_reader.ts');
    expect(r.node?.source_location).toBe('L12');
    expect(r.candidates).toHaveLength(0);
  });

  test('unique same-label definition folds onto the stub (rewire parity)', () => {
    const single = [node('a.ts#parser', 'Parser', 'a.ts', 'L1'), node('stub-parser', 'Parser', '')];
    const r = createGraphifyTypeResolver(single).resolve('stub-parser');
    expect(r.status).toBe('resolved');
    expect(r.node?.id).toBe('a.ts#parser');
  });

  test('ambiguous when multiple definitions share the label', () => {
    const r = createGraphifyTypeResolver(corpus).resolve('stub-sessionreader', 'SessionReader');
    expect(r.status).toBe('ambiguous');
    expect(r.candidates).toHaveLength(2);
    // The stub itself is returned as the node.
    expect(r.node?.id).toBe('stub-sessionreader');
  });

  test('unresolved when nothing defines the name (primitives / externals)', () => {
    const withStub = [...corpus, node('stub-string', 'string', '')];
    const r = createGraphifyTypeResolver(withStub).resolve('stub-string', 'string');
    expect(r.status).toBe('unresolved');
    expect(r.candidates).toHaveLength(0);
  });

  test('missing for absent ids and missing nodeIds', () => {
    const resolver = createGraphifyTypeResolver(corpus);
    expect(resolver.resolve(undefined).status).toBe('missing');
    expect(resolver.resolve('nope').status).toBe('missing');
  });

  test('file nodes are not candidates; folded tier matches case-insensitively', () => {
    const corpus2 = [
      node('f_ts', 'reader.ts', 'x/reader.ts'),
      node('x/reader_ts', 'Reader', 'x/Reader.ts'),
      node('stub-reader', 'Reader', ''),
    ];
    const r = createGraphifyTypeResolver(corpus2).resolve('stub-reader');
    expect(r.status).toBe('resolved');
    expect(r.node?.id).toBe('x/reader_ts');
  });
});

describe('resolveGraphifyTypeRef', () => {
  test('one-shot wrapper reads nodeId off the ref', () => {
    const resolved = resolveGraphifyTypeRef(corpus, { nodeId: 'src/session_reader.ts#sessionreader' });
    expect(resolved.status).toBe('resolved');
    const missing = resolveGraphifyTypeRef(corpus, undefined);
    expect(missing.status).toBe('missing');
  });
});
