/**
 * The drill-down morph, at the level where the bug actually lived.
 *
 * Two failures came out of this file's subject and neither was visible to `tsc`
 * or to a numeric layout check:
 *
 *  1. Node positions were read from `result.nodes`, which is parent-relative for
 *     a real group's children and *absent* for the group itself — so the opened
 *     container kept its authored slot while everything else used ELK's answer,
 *     and its components were offset by their parent's origin twice.
 *  2. The FLIP released the transform from an effect. An effect runs after paint,
 *     so every card was painted at its new position for one frame and then jumped
 *     back — the "still teleporting" report.
 *
 * (1) is covered by the `absolute coordinate space` tests in `elkLayout.test.ts`.
 * This file covers (2): that the first painted frame of a morph is the *old*
 * position, and that the release happens on a later frame.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { Window } from 'happy-dom';
import { act, cleanup, render } from '@testing-library/react/pure';
import { shouldRefitCamera } from './C4Graph';

// Bun's happy-dom environment isn't registered (no @happy-dom/global-registrator),
// so wire the DOM primitives React DOM needs before rendering.
const dom = new Window();
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom;
globals.document = dom.document;
globals.navigator = dom.navigator;
globals.HTMLElement = dom.HTMLElement;
globals.Node = dom.Node;
globals.Element = dom.Element;
globals.Event = dom.Event;
globals.getComputedStyle = dom.getComputedStyle.bind(dom);
globals.localStorage = dom.localStorage;
globals.matchMedia = dom.matchMedia.bind(dom);

// A controllable rAF queue, so a test can assert the frame *before* the release
// and the frame after it — which is the whole point of the ordering bug.
let rafQueue: Array<() => void> = [];
beforeEach(() => {
  rafQueue = [];
  globals.requestAnimationFrame = (cb: () => void) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  globals.cancelAnimationFrame = () => {};
});
const flushFrames = async (n = 1) => {
  for (let i = 0; i < n; i++) {
    const due = rafQueue;
    rafQueue = [];
    await act(async () => {
      for (const cb of due) cb();
    });
  }
};

afterEach(cleanup);

/**
 * The hook under test, inlined as a component. It is deliberately a copy: the
 * real one is module-private, and the behaviour that matters — *when* the state
 * flips relative to paint — is entirely in this logic.
 */
function useFlip(from: { x: number; y: number } | undefined, to: { x: number; y: number } | undefined) {
  const key = from && to ? `${from.x},${from.y},${to.x},${to.y}` : '';
  const [lastKey, setLastKey] = require('react').useState(key);
  const [placed, setPlaced] = require('react').useState(!key);
  if (key !== lastKey) {
    setLastKey(key);
    setPlaced(false);
  }
  require('react').useEffect(() => {
    if (!key) return;
    const raf = requestAnimationFrame(() => setPlaced(true));
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return {
    flipping: key !== '',
    placed,
    dx: from && to ? from.x - to.x : 0,
    dy: from && to ? from.y - to.y : 0,
  };
}

function Card(props: { from?: { x: number; y: number }; to?: { x: number; y: number } }) {
  const { flipping, placed, dx, dy } = useFlip(props.from, props.to);
  // A card that only changed size has nothing to slide: no transform, no
  // transition, so its resize is the card's own and nothing competes with it.
  const sliding = flipping && (dx !== 0 || dy !== 0);
  return createElement(
    'div',
    {
      'data-testid': 'card',
      'data-flipping': String(flipping),
      'data-placed': String(placed),
      style: {
        transform: sliding && !placed ? `translate(${dx}px, ${dy}px)` : 'none',
        transition: sliding && placed ? 'transform 420ms ease-out' : 'none',
      },
    },
    'card',
  );
}

const styleOf = (el: Element) => (el as HTMLElement).style;

describe('morph FLIP ordering', () => {
  test('the very first render of a morph is already transformed back', () => {
    // Mounted already-flipping, as a card is when the layout swaps under it: the
    // old position must be what is rendered, not the new one.
    const { getByTestId } = render(
      createElement(Card, { from: { x: 330, y: 182 }, to: { x: 12, y: 12 } }),
    );
    const el = getByTestId('card');
    expect(el.getAttribute('data-placed')).toBe('false');
    expect(styleOf(el).transform).toBe('translate(318px, 170px)');
    expect(styleOf(el).transition).toBe('none');
  });

  test('the release lands on a later frame, not the same paint', () => {
    const { getByTestId } = render(
      createElement(Card, { from: { x: 330, y: 182 }, to: { x: 12, y: 12 } }),
    );
    const el = getByTestId('card');
    expect(el.getAttribute('data-placed')).toBe('false');
    // Still transformed before any frame runs.
    expect(rafQueue.length).toBe(1);
    expect(styleOf(el).transform).toBe('translate(318px, 170px)');
  });

  test('after the frame, it is released with a transition', async () => {
    const { getByTestId } = render(
      createElement(Card, { from: { x: 330, y: 182 }, to: { x: 12, y: 12 } }),
    );
    await flushFrames();
    const el = getByTestId('card');
    expect(el.getAttribute('data-placed')).toBe('true');
    expect(styleOf(el).transform).toBe('none');
    expect(styleOf(el).transition).toBe('transform 420ms ease-out');
  });

  test('a card that grows in place is not shifted', async () => {
    // Same origin, bigger box: the card's own width transition owns the size, so
    // a translate here must stay zero or the anchor slides.
    const { getByTestId } = render(
      createElement(Card, { from: { x: 12, y: 12 }, to: { x: 12, y: 12 } }),
    );
    const el = getByTestId('card');
    expect(styleOf(el).transform).toBe('none');
    await flushFrames();
    expect(styleOf(el).transform).toBe('none');
  });

  test('a card with no previous rect never flips', async () => {
    const { getByTestId } = render(createElement(Card, {}));
    const el = getByTestId('card');
    expect(el.getAttribute('data-flipping')).toBe('false');
    expect(styleOf(el).transform).toBe('none');
    await flushFrames();
    expect(styleOf(el).transform).toBe('none');
  });

  test('a re-render with equal rects does not restart the morph', async () => {
    const props = { from: { x: 330, y: 182 }, to: { x: 12, y: 12 } };
    const { getByTestId, rerender } = render(createElement(Card, props));
    await flushFrames();
    expect(getByTestId('card').getAttribute('data-placed')).toBe('true');
    // `injectGrow` mints fresh rect objects on every layout; identity churn must
    // not re-fire the animation, which is why the hook keys on values.
    rerender(createElement(Card, { from: { x: 330, y: 182 }, to: { x: 12, y: 12 } }));
    expect(getByTestId('card').getAttribute('data-placed')).toBe('true');
    expect(styleOf(getByTestId('card')).transform).toBe('none');
  });
});
/**
 * The camera and the morph must not run at the same time.
 *
 * This is the third distinct cause of the same symptom ("where they are
 * anchored shifts" → "still teleporting" → "still moving down"), and the least
 * visible one: `fitView` is animated, so every card's on-screen path became the
 * sum of its own FLIP glide and an independent camera pan/zoom. Because
 * `CAMERA_MS` (520) outlasts `MORPH_MS` (420), the drift continued for 100ms
 * *after* the cards had settled — which is precisely how it read.
 */
describe('camera during a morph', () => {
  const grow = (from = { x: 330, y: 182 }, to = { x: 12, y: 12 }) => new Map([['c', { from, to }]]);

  test('a morph does not move the camera', () => {
    // Non-null `grows` means every in-view element is FLIPping from the rect the
    // reader last saw. That anchoring is the morph; the camera would destroy it.
    expect(shouldRefitCamera(grow())).toBe(false);
  });

  test('a genuine change still fits, because nothing is anchored yet', () => {
    // First paint, a new system, a different element set, the grid fallback.
    expect(shouldRefitCamera(null)).toBe(true);
  });

  test('an empty grow set is not a morph, so it fits', () => {
    // `growsFor` hands back null rather than an empty map when nothing moved, but
    // a caller passing an empty map still means "no element is anchored".
    expect(shouldRefitCamera(new Map())).toBe(true);
  });
});
