import { describe, expect, test } from 'bun:test';
import {
  nodeStyle,
  nodeSubtitle,
  nodeTag,
  nodeStateTag,
  nodeShape,
  nodeMissing,
  NODE_W,
  NODE_H,
} from './C4NodeCard';
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

  test('confirmation state wins over kind for colour and dash', () => {
    const s = nodeStyle(decorated('accepted'), theme);
    expect(s.color).toBe('#4ec9b0');
  });

  test('border weight carries the level, not the state', () => {
    // Otherwise a component and a container differ only by hue, which is
    // invisible in grayscale and to a colourblind reader.
    expect(nodeStyle(node({ kind: 'component' }), theme).width).toBe(1);
    expect(nodeStyle(node(), theme).width).toBe(2);
    expect(nodeStyle(decorated('accepted', { type: 'application' }), theme).width).toBe(2);
  });

  test('a component stays thinner when confirmed', () => {
    const confirmed = decorated('accepted');
    expect(nodeStyle({ ...confirmed, kind: 'component' }, theme).width).toBe(1);
  });

  test('falls back safely when the theme has no colour', () => {
    const bare = { colors: {} } as Parameters<typeof nodeStyle>[1];
    expect(() => nodeStyle(decorated('accepted'), bare)).not.toThrow();
    expect(nodeStyle(decorated('accepted'), bare).dash).toBe('solid');
  });
});

describe('nodeTag — what the box IS', () => {
  test('names the C4 level, never the confirmation state', () => {
    expect(nodeTag(node())).toBe('container');
    expect(nodeTag(decorated('accepted'))).toBe('container');
    expect(nodeTag(decorated('proposed'))).toBe('container');
    expect(nodeTag(decorated('rejected'))).toBe('container');
  });

  test('keeps every level distinct', () => {
    expect(nodeTag(node({ kind: 'component' }))).toBe('component');
    expect(nodeTag(node({ kind: 'external' }))).toBe('external');
    expect(nodeTag(node({ kind: 'actor' }))).toBe('actor');
  });

  test('a confirmed container is still a container', () => {
    // This is the regression that made the two levels unreadable: state used
    // to overwrite the level, so an accepted container stopped being one.
    expect(nodeTag(decorated('accepted'))).not.toBe('confirmed');
  });
});

describe('nodeStateTag — whether anyone vouched for it', () => {
  test('names each confirmation state', () => {
    expect(nodeStateTag(decorated('accepted'))).toBe('confirmed');
    expect(nodeStateTag(decorated('proposed'))).toBe('proposed');
    expect(nodeStateTag(decorated('rejected'))).toBe('rejected');
  });

  test('says unconfirmed rather than showing nothing', () => {
    expect(nodeStateTag(node())).toBe('unconfirmed');
    expect(nodeStateTag(node({ kind: 'component' }))).toBe('unconfirmed');
  });

  test('is a separate axis from the level', () => {
    // Same level, different state — and vice versa.
    expect(nodeTag(decorated('accepted'))).toBe(nodeTag(node()));
    expect(nodeStateTag(node())).not.toBe(nodeStateTag(decorated('accepted')));
    expect(nodeStateTag(node({ kind: 'component' }))).toBe(nodeStateTag(node()));
  });
});

describe('nodeShape — level without relying on colour', () => {
  test('a container is a sharp solid box', () => {
    const s = nodeShape(node());
    expect(s.radius).toBeLessThanOrEqual(4);
    expect(s.dash).toBe('solid');
  });

  test('a component is a rounded box', () => {
    expect(nodeShape(node({ kind: 'component' })).radius).toBeGreaterThan(nodeShape(node()).radius);
  });

  test('an external is dashed — there is nothing to confirm inside it', () => {
    expect(nodeShape(node({ kind: 'external' })).dash).toBe('dashed');
  });

  test('an actor is a pill', () => {
    expect(nodeShape(node({ kind: 'actor' })).radius).toBeGreaterThanOrEqual(NODE_H / 2);
  });

  test('shape does not depend on confirmation state', () => {
    expect(nodeShape(decorated('proposed')).radius).toBe(nodeShape(decorated('accepted')).radius);
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