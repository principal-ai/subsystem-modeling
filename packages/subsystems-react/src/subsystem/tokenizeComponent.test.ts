import { describe, expect, test } from 'bun:test';
import { tokenizeComponent } from './tokenizeComponent';
import type { SubsystemComponent } from './model';

const textOf = (toks: { kind: string; text: string }[]) =>
  toks.filter((t) => t.kind !== 'newline').map((t) => t.text).join('');

describe('tokenizeComponent — language inference', () => {
  test('non-JS/TS (python) bypasses Prettier and tokenizes unformatted', async () => {
    const component: SubsystemComponent = {
      alias: 'dedup',
      name: 'deduplicate_entities',
      construct: 'function',
      file: 'graphify/dedup.py',
      purl: 'pkg:github/graphify-labs/graphify#graphify/dedup.py',
      symbol: 'deduplicate_entities',
      declaration: {
        kind: 'function',
        parameters: [{ name: 'graph', type: 'nx.MultiDiGraph' }],
        returnType: 'None',
        callers: [],
        callees: [],
      },
    };
    const toks = await tokenizeComponent(component, 80, 'pierre-dark');
    // No Prettier run → the raw one-liner comes through verbatim.
    expect(textOf(toks)).toBe(
      'function deduplicate_entities(graph: nx.MultiDiGraph): None;',
    );
  });

  test('JS/TS still goes through Prettier (wraps to printWidth)', async () => {
    const component: SubsystemComponent = {
      alias: 'merge',
      name: 'mergeSessions',
      construct: 'function',
      file: 'src/session/merge.ts',
      purl: 'pkg:github/acme/widget',
      symbol: 'mergeSessions',
      declaration: {
        kind: 'function',
        parameters: [
          { name: 'sessions', type: 'SessionRecord[]' },
          { name: 'options', type: 'MergeOptions' },
          { name: 'onConflict', type: '((a: SessionRecord, b: SessionRecord) => SessionRecord)' },
        ],
        returnType: 'Promise<Map<string, SessionEvent[]>>',
        callers: [],
        callees: [],
      },
    };
    const toks = await tokenizeComponent(component, 40, 'pierre-dark');
    // Formatted output spans multiple lines.
    expect(toks.some((t) => t.kind === 'newline')).toBe(true);
  });
});
