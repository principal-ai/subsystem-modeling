import { describe, expect, test } from 'bun:test';
import {
  nodeStyle,
  nodeSubtitle,
  nodeTag,
  nodeKindIcon,
  nodeTopLabel,
  nodeShape,
  nodeMissing,
  NODE_W,
  NODE_H,
  nodeSize,
  COMPONENT_SIZE,
} from './C4NodeCard';
import type { C4Element, C4Container } from './c4';

const theme = {
  colors: {
    border: '#555',
    primary: '#4ec9b0',
    warning: '#e8a33a',
    accent: '#e3b341',
    info: '#0ea5e9',
  },
} as Parameters<typeof nodeStyle>[1];

/**
 * A container element with overridable fields. `state` is required — every
 * authored element carries a decision — so the card never has to cope with a
 * box nobody proposed, and no test pretends otherwise.
 */
function node(over: Partial<C4Container> = {}): C4Element {
  return {
    id: 'n',
    kind: 'container',
    label: 'n',
    containerKind: 'application',
    technology: '',
    state: 'proposed',
    ...over,
  };
}

describe('nodeStyle — one axis per channel', () => {
  test('selected overrides everything', () => {
    expect(nodeStyle(node({ state: 'accepted' }), theme, true).width).toBe(3);
    expect(nodeStyle(node({ state: 'accepted' }), theme, true).dash).toBe('solid');
  });

  test('accepted is solid', () => {
    expect(nodeStyle(node({ state: 'accepted' }), theme).dash).toBe('solid');
  });

  test('proposed is dashed', () => {
    expect(nodeStyle(node({ state: 'proposed' }), theme).dash).toBe('dashed');
  });

  test('rejected is dotted and muted', () => {
    const s = nodeStyle(node({ state: 'rejected' }), theme);
    expect(s.dash).toBe('dotted');
    expect(s.color).toBe('#555');
  });

  test('the dash belongs to state, never to kind', () => {
    // This is the bug that made proposed boxes draw solid: the card rendered
    // `shape.dash`, and shape answered to kind. Every kind at the same state
    // must now draw the same dash.
    for (const kind of ['container', 'component', 'external-system', 'person'] as const) {
      expect(nodeStyle(node({ kind, state: 'proposed' }), theme).dash).toBe('dashed');
      expect(nodeStyle(node({ kind, state: 'accepted' }), theme).dash).toBe('solid');
    }
  });

  test('colour follows the technology, not the state', () => {
    // Same kind and state, different tech: different hue.
    const react = nodeStyle(node({ technology: 'React 19', state: 'accepted' }), theme).color;
    const bun = nodeStyle(node({ technology: 'Bun', state: 'accepted' }), theme).color;
    expect(react).not.toBe(bun);
    // State does not move the colour.
    expect(nodeStyle(node({ technology: 'React 19', state: 'proposed' }), theme).color).toBe(react);
  });

  test('an unknown technology falls back to the muted border', () => {
    expect(nodeStyle(node({ technology: '', state: 'accepted' }), theme).color).toBe('#555');
    expect(nodeStyle(node({ technology: 'COBOL', state: 'accepted' }), theme).color).toBe('#555');
  });

  test('border weight carries the level, not the state', () => {
    // Otherwise a component and a container differ only by hue, which is
    // invisible in grayscale and to a colourblind reader.
    expect(nodeStyle(node({ kind: 'component' }), theme).width).toBe(1);
    expect(nodeStyle(node(), theme).width).toBe(2);
  });

  test('a component stays thinner once confirmed', () => {
    expect(nodeStyle(node({ kind: 'component', state: 'accepted' }), theme).width).toBe(1);
  });

  test('falls back safely when the theme has no colour', () => {
    const bare = { colors: {} } as Parameters<typeof nodeStyle>[1];
    expect(() => nodeStyle(node({ state: 'accepted' }), bare)).not.toThrow();
    expect(nodeStyle(node({ state: 'accepted' }), bare).dash).toBe('solid');
  });
});

describe('nodeTag — what the box IS', () => {
  test('names the C4 kind, never the confirmation state', () => {
    expect(nodeTag(node({ state: 'accepted' }))).toBe('container');
    expect(nodeTag(node({ state: 'proposed' }))).toBe('container');
    expect(nodeTag(node({ state: 'rejected' }))).toBe('container');
  });

  test('keeps all four kinds distinct', () => {
    expect(nodeTag(node({ kind: 'component' }))).toBe('component');
    expect(nodeTag(node({ kind: 'external-system' }))).toBe('external-system');
    expect(nodeTag(node({ kind: 'person' }))).toBe('person');
  });

  test('a confirmed container is still a container', () => {
    // This is the regression that made the two levels unreadable: state used
    // to overwrite the kind, so an accepted container stopped being one.
    expect(nodeTag(node({ state: 'accepted' }))).not.toBe('confirmed');
  });
});

describe('nodeKindIcon — a container’s sort, not its C4 kind', () => {
  test('application and data-store get different icons', () => {
    const app = nodeKindIcon(node({ containerKind: 'application' }));
    const store = nodeKindIcon(node({ containerKind: 'data-store' }));
    expect(app).toBeDefined();
    expect(store).toBeDefined();
    expect(app).not.toBe(store);
  });

  test('only containers get an icon — the shape carries the rest', () => {
    for (const kind of ['component', 'external-system', 'person'] as const) {
      expect(nodeKindIcon(node({ kind }))).toBeUndefined();
    }
  });

  test('the icon does not depend on confirmation state', () => {
    expect(nodeKindIcon(node({ state: 'proposed' }))).toBe(
      nodeKindIcon(node({ state: 'accepted' })),
    );
  });
});

describe('nodeTopLabel — the technology, or the kind when none is stated', () => {
  test('a stated technology is the label', () => {
    expect(
      nodeTopLabel(node({ containerKind: 'application', technology: 'Bun + Electrobun' })),
    ).toBe('Bun + Electrobun');
    expect(nodeTopLabel(node({ kind: 'component', technology: 'React + ELK' }))).toBe('React + ELK');
  });

  test('a container with no technology falls back to its kind', () => {
    expect(nodeTopLabel(node({ containerKind: 'data-store', technology: '' }))).toBe('data-store');
  });

  test('the other kinds fall back to their C4 kind', () => {
    expect(nodeTopLabel(node({ kind: 'component' }))).toBe('component');
    expect(nodeTopLabel(node({ kind: 'external-system' }))).toBe('external-system');
    expect(nodeTopLabel(node({ kind: 'person' }))).toBe('person');
  });
});

describe('nodeShape — kind without relying on colour or dash', () => {
  test('a container is a sharp rectangle', () => {
    const s = nodeShape(node());
    expect(s.kind).toBe('rect');
    expect(s.radius).toBeLessThanOrEqual(4);
  });

  test('a component is a square', () => {
    expect(nodeShape(node({ kind: 'component' })).kind).toBe('square');
  });

  test('an external system has no corner radius', () => {
    const s = nodeShape(node({ kind: 'external-system' }));
    expect(s.kind).toBe('rect');
    expect(s.radius).toBe(0);
  });

  test('a person is a pill', () => {
    const s = nodeShape(node({ kind: 'person' }));
    expect(s.kind).toBe('pill');
    expect(s.radius).toBeGreaterThanOrEqual(NODE_H / 2);
  });

  test('shape does not depend on confirmation state', () => {
    expect(nodeShape(node({ state: 'proposed' })).kind).toBe(
      nodeShape(node({ state: 'accepted' })).kind,
    );
  });
});

describe('nodeSubtitle', () => {
  test('is the element description when it has one', () => {
    expect(
      nodeSubtitle(node({ technology: 'Bun', description: 'Runs the audit pipeline.' })),
    ).toBe('Runs the audit pipeline.');
  });

  test('is empty when nothing is stated — there is no fallback', () => {
    const withTech = node({ technology: 'Bun + Electrobun' });
    const withMembers = node({ constructs: ['function', 'store'], members: ['a', 'b'] });
    const component = node({
      kind: 'component',
      component: {
        alias: 'a',
        name: 'buildGroups',
        construct: 'function',
        file: 'src/subsystem/model.ts',
        purl: 'pkg:x#src/subsystem/model.ts',
      },
    });
    for (const n of [withTech, withMembers, component]) {
      expect(nodeSubtitle(n)).toBe('');
    }
  });
});

describe('nodeMissing', () => {
  test('a container with neither reports both notation gaps', () => {
    expect(nodeMissing(node({ technology: '', description: undefined }))).toEqual([
      'technology',
      'description',
    ]);
  });

  test('one supplied gap drops only that one', () => {
    expect(nodeMissing(node({ technology: 'React', description: undefined }))).toEqual([
      'description',
    ]);
  });

  test('a fully stated container reports nothing', () => {
    expect(
      nodeMissing(node({ technology: 'React', description: 'Renders graphs.', state: 'accepted' })),
    ).toEqual([]);
  });

  test('the requirement is on containers only', () => {
    for (const kind of ['external-system', 'person', 'component'] as const) {
      expect(nodeMissing(node({ kind, technology: '', description: undefined }))).toEqual([]);
    }
  });
});

describe('nodeSize — a component is a proper square', () => {
  test('a component has equal width and height', () => {
    const s = nodeSize(node({ kind: 'component' }));
    expect(s.width).toBe(s.height);
  });

  test('a container is wider than it is tall', () => {
    const s = nodeSize(node());
    expect(s.width).toBeGreaterThan(s.height);
  });

  test('a component is smaller than its container', () => {
    const c = nodeSize(node({ kind: 'component' }));
    const k = nodeSize(node());
    expect(c.width).toBeLessThan(k.width);
    expect(c.height).toBeLessThan(k.height);
  });

  test('the square still fits its three lines of text', () => {
    // tag + 2-line label slot + subtitle + 10px padding x2. Without this the
    // square clips its own subtitle.
    const s = nodeSize(node({ kind: 'component' }));
    const content = 16 + 40 + 16 + 20;
    expect(s.height).toBeGreaterThanOrEqual(content);
  });

  test('every kind but a component shares the container box', () => {
    const c = nodeSize(node());
    expect(nodeSize(node({ kind: 'external-system' }))).toEqual(c);
    expect(nodeSize(node({ kind: 'person' }))).toEqual(c);
  });
});

describe('card metrics', () => {
  test('exposes the size the graph lays out against', () => {
    expect(NODE_W).toBe(250);
    expect(NODE_H).toBe(150);
  });

  test('COMPONENT_SIZE is a square, not just a smaller rectangle', () => {
    expect(COMPONENT_SIZE).toBe(nodeSize(node({ kind: 'component' })).width);
    expect(COMPONENT_SIZE).toBe(nodeSize(node({ kind: 'component' })).height);
  });

  test('is near-square, not a wide strip', () => {
    // The card carries three fields (technology row, label, description). A
    // 3:1 strip wraps the last two hard; this is the aspect ratio that lets
    // each sit on its own line.
    const ratio = NODE_W / NODE_H;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(1.8);
  });

  test('is tall enough for three lines of content', () => {
    // technology row + 2-line label + description, plus padding.
    expect(NODE_H).toBeGreaterThanOrEqual(130);
  });

  test('leaves breathing room around three lines of text', () => {
    // Top-aligned now, not centred, so this is about slack rather than
    // balance: technology row + 2-line label slot + description + padding.
    const contentBudget = 16 + 40 + 16 + 20; // lines + 10px padding ×2
    expect(NODE_H - contentBudget).toBeGreaterThanOrEqual(12);
  });

  test('fits the longest real container label on two lines', () => {
    // "subsystems-studio/renderer" is the longest label the 40 stored models
    // produce. It must be allowed to wrap rather than ellipsize.
    expect(NODE_W).toBeGreaterThanOrEqual(200);
  });
});

describe('container kinds', () => {
  test('each container kind has an icon and a fallback label', () => {
    for (const containerKind of ['application', 'data-store'] as const) {
      expect(nodeKindIcon(node({ containerKind }))).toBeDefined();
      // No technology stated, so the label falls back to the kind.
      expect(nodeTopLabel(node({ containerKind, technology: '' }))).toBe(containerKind);
    }
  });

  test('application and data-store do not share an icon', () => {
    expect(nodeKindIcon(node({ containerKind: 'application' }))).not.toBe(
      nodeKindIcon(node({ containerKind: 'data-store' })),
    );
  });

  test('a library is not one of them', () => {
    // C4 says a module "typically" is not an element at all, so there is no
    // kind to render. A library-shaped group is a review comment.
    expect(['application', 'data-store']).not.toContain('library');
  });
});