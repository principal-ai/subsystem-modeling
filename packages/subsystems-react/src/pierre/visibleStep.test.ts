import { describe, expect, test } from 'bun:test';

import {
  AT_END_TOLERANCE_PX,
  resolveVisibleStepIndex,
  type VisibleStepRect,
  type VisibleStepViewport,
} from "./visibleStep";

/**
 * Four steps in *content* coordinates. Steps 2 and 3 are short tails, which is
 * the case that matters: neither can fill a 600px viewport, so at full scroll
 * the topmost thing on screen is step 1 while the true position is step 3.
 */
const CONTENT_RECTS = [
  { index: 0, top: 0, bottom: 200 },
  { index: 1, top: 200, bottom: 900 },
  { index: 2, top: 900, bottom: 1100 },
  { index: 3, top: 1100, bottom: 1200 },
];

const CONTENT_HEIGHT = 1200;
const CLIENT_HEIGHT = 600;
/** Furthest the view can scroll with this content. */
const MAX_SCROLL = CONTENT_HEIGHT - CLIENT_HEIGHT;

/** Project the content layout into viewport coordinates at `scrollTop`. */
function rectsAt(scrollTop: number): VisibleStepRect[] {
  return CONTENT_RECTS.map((rect) => ({
    index: rect.index,
    top: rect.top - scrollTop,
    bottom: rect.bottom - scrollTop,
  }));
}

function viewport(
  scrollTop: number,
  overrides: Partial<VisibleStepViewport> = {},
): VisibleStepViewport {
  return {
    top: 0,
    bottom: CLIENT_HEIGHT,
    scrollTop,
    clientHeight: CLIENT_HEIGHT,
    scrollHeight: CONTENT_HEIGHT,
    ...overrides,
  };
}

function at(scrollTop: number, overrides: Partial<VisibleStepViewport> = {}) {
  return resolveVisibleStepIndex(
    viewport(scrollTop, overrides),
    rectsAt(scrollTop),
  );
}

describe('resolveVisibleStepIndex', () => {
  test('reports the topmost step on screen', () => {
    expect(at(0)).toBe(0);
    expect(at(250)).toBe(1);
  });

  test('reports the last step once the end of the content is on screen', () => {
    // The regression: at full scroll step 1's tail is still the topmost thing
    // on screen, but the end of the content has been reached.
    expect(at(MAX_SCROLL)).toBe(3);
  });

  test('does not report the end while content remains below', () => {
    expect(at(300)).toBe(1);
    // Extra scrollable content below must not be mistaken for the end: step 3
    // is still well below the viewport here.
    expect(at(400, { scrollHeight: CONTENT_HEIGHT + 4000 })).toBe(1);
  });

  test('trusts the scroll extent when the container box is not authoritative', () => {
    // Nested scroller: the container's own box reports a bottom edge far above
    // the real end, so only scrollTop/clientHeight/scrollHeight say we're done.
    expect(at(MAX_SCROLL, { bottom: 100 })).toBe(3);
  });

  test('ignores the scroll extent when the container does not actually scroll', () => {
    // An ancestor scrolls instead: scrollTop is pinned at 0 and scrollHeight
    // equals clientHeight, which must not read as 'at the end' on first paint.
    const notAScroller = { scrollTop: 0, clientHeight: 600, scrollHeight: 600 };
    expect(at(0, { ...notAScroller, bottom: 100 })).toBe(0);
  });

  test('tolerates a bottom edge a fraction of a pixel off', () => {
    expect(
      at(MAX_SCROLL, { scrollHeight: CONTENT_HEIGHT + AT_END_TOLERANCE_PX }),
    ).toBe(3);
  });

  test('returns null when nothing is on screen', () => {
    expect(resolveVisibleStepIndex(viewport(0), [])).toBeNull();
    expect(
      resolveVisibleStepIndex(viewport(0), [
        { index: 0, top: -800, bottom: -400 },
      ]),
    ).toBeNull();
  });

  test('uses the highest index even when rects arrive out of order', () => {
    const shuffled = [...rectsAt(MAX_SCROLL)].reverse();
    expect(resolveVisibleStepIndex(viewport(MAX_SCROLL), shuffled)).toBe(3);
  });
});
