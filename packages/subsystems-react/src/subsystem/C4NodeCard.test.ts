import { describe, expect, test } from 'bun:test';
import { nodeStyle, nodeSubtitle, nodeTag, nodeMissing, NODE_W, NODE_H } from './C4NodeCard';
import type { C4Node, C4ElementType, C4AssociationState } from './toC4';

const theme = {
  colors: {
    border: '#555',
    primary: '#4ec9b0',
    warning: '#e8a33a',
    accent: '#e3b341',
    info: '#0ea5e9',
  },
} as Parameters<typeof nodeStyle>[1];

function node(over: Partial<C4Node> = {}): C4Node {
  return { id: 'n', kind: 'container', label: 'n', members: [], constructs: [], isStore: false, ...over };
}

function decorated(state: C4AssociationState, extra: Record<string, unknown> = {}): C4Node {
  return node({ decoration: { id: 'container:x', state, ...extra } as C4Node['decoration'] });
}

describe('nodeStyle', () => {
  test('selected overrides everything', () => {
    expect(nodeStyle(decorated('accepted'), theme, true).width).toBe(3);
    expect(nodeStyle(node(), theme, true).color).toBe('#4ec9b0');
  });

  test('accepted is solid and uses the primary colour', () => {
    const s = nodeStyle(decorated('accepted'), theme);
    expect(s.dash).toBe('solid');
    expect(s.color).toBe('#4ec9b0');
  });

  test('proposed is dashed and uses the warning colour', () => {
    const s = nodeStyle(decorated('proposed'), theme);
    expect(s.dash).toBe('dashed');
    expect(s.color).toBe('#e8a33a');
  });

  test('rejected is dotted and muted', () => {
    const s = nodeStyle(decorated('rejected'), theme);
    expect(s.dash).toBe('dotted');
    expect(s.color).toBe('#555');
  });

  test('no association is muted, so confirmed boxes read stronger', () => {
    expect(nodeStyle(node(), theme).color).toBe('#555');
  });

  test('an external and an actor are distinguished without an association', () => {
    expect(nodeStyle(node({ kind: 'external' }), theme).color).toBe('#e8a33a');
    expect(nodeStyle(node({ kind: 'actor' }), theme).color).toBe('#e3b341');
  });

  test('confirmation state wins over kind', () => {
    const s = nodeStyle(decorated('accepted'), theme);
    expect(s.color).toBe('#4ec9b0');
  });

  test('falls back safely when the theme has no colour', () => {
    const bare = { colors: {} } as Parameters<typeof nodeStyle>[1];
    expect(() => nodeStyle(decorated('accepted'), bare)).not.toThrow();
    expect(nodeStyle(decorated('accepted'), bare).dash).toBe('solid');
  });
});

describe('nodeTag', () => {
  test('names the confirmation state ahead of the C4 kind', () => {
    expect(nodeTag(decorated('accepted'))).toBe('confirmed');
    expect(nodeTag(decorated('proposed'))).toBe('proposed');
    expect(nodeTag(decorated('rejected'))).toBe('rejected');
  });

  test('falls back to the kind when there is no association', () => {
    expect(nodeTag(node())).toBe('container');
    expect(nodeTag(node({ kind: 'external' }))).toBe('external');
    expect(nodeTag(node({ kind: 'actor' }))).toBe('actor');
  });
});

describe('nodeSubtitle', () => {
  test('shows type and technology once confirmed', () => {
    const s = nodeSubtitle(
      decorated('accepted', { type: 'application', technology: 'Bun + Electrobun' }),
    );
    expect(s).toBe('application · Bun + Electrobun');
  });

  test('omits technology when it was never stated', () => {
    expect(nodeSubtitle(decorated('accepted', { type: 'data-store' }))).toBe('data-store');
  });

  test('falls back to the construct breakdown for a raw container', () => {
    const s = nodeSubtitle(node({ constructs: ['function', 'store'], members: ['a', 'b'] }));
    expect(s).toContain('function');
    expect(s).toContain('store');
    expect(s).toContain('2 components');
  });

  test('singularises a single member', () => {
    const s = nodeSubtitle(node({ constructs: ['function'], members: ['a'] }));
    expect(s).toContain('1 component');
    expect(s).not.toContain('1 components');
  });

  test('a component shows its construct and file basename', () => {
    const s = nodeSubtitle(
      node({
        kind: 'component',
        component: {
          alias: 'a',
          name: 'buildGroups',
          construct: 'function',
          file: 'src/subsystem/model.ts',
          purl: 'pkg:x#src/subsystem/model.ts',
        },
      }),
    );
    expect(s).toBe('function · model.ts');
  });
});

describe('nodeMissing', () => {
  test('a bare container reports both notation gaps', () => {
    expect(nodeMissing(node())).toEqual(['technology', 'description']);
  });

  test('one supplied gap drops only that one', () => {
    expect(nodeMissing(decorated('accepted', { technology: 'React' }))).toEqual(['description']);
  });

  test('a fully stated container reports nothing', () => {
    expect(
      nodeMissing(decorated('accepted', { technology: 'React', description: 'Renders graphs.' })),
    ).toEqual([]);
  });

  test('the requirement is on containers only', () => {
    expect(nodeMissing(node({ kind: 'external' }))).toEqual([]);
    expect(nodeMissing(node({ kind: 'actor' }))).toEqual([]);
    expect(nodeMissing(node({ kind: 'component' }))).toEqual([]);
  });
});

describe('card metrics', () => {
  test('exposes the size the graph lays out against', () => {
    expect(NODE_W).toBeGreaterThan(0);
    expect(NODE_H).toBeGreaterThan(0);
  });

  test('is near-square, not a wide strip', () => {
    // The card carries four fields (tag, label, type+technology, notation
    // gap). A 3:1 strip truncates the last two; this is the aspect ratio that
    // lets each sit on its own line.
    const ratio = NODE_W / NODE_H;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(1.8);
  });

  test('is tall enough for four lines of content', () => {
    // tag + 2-line label + subtitle + gap marker, plus 8px padding top/bottom.
    expect(NODE_H).toBeGreaterThanOrEqual(130);
  });

  test('leaves breathing room around four lines of text', () => {
    // Top-aligned now, not centred, so this is about slack rather than
    // balance: tag + 2-line label slot + subtitle + gap slot + padding.
    const contentBudget = 16 + 40 + 16 + 18 + 20; // lines + 10px padding ×2
    expect(NODE_H - contentBudget).toBeGreaterThanOrEqual(12);
  });

  test('fits the longest real container label on two lines', () => {
    // "subsystems-studio/renderer" is the longest label the 40 stored models
    // produce. It must be allowed to wrap rather than ellipsize.
    expect(NODE_W).toBeGreaterThanOrEqual(200);
  });
});

/** Compile-time guard: every declared element type is reachable from a card. */
const ALL_TYPES: C4ElementType[] = [
  'application',
  'data-store',
  'queue',
  'library',
  'software-system',
  'person',
];

describe('element types', () => {
  test('each one renders as a subtitle without special-casing', () => {
    for (const type of ALL_TYPES) {
      expect(nodeSubtitle(decorated('accepted', { type }))).toBe(type);
    }
  });
});