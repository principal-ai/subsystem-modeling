import { describe, expect, test } from 'bun:test';
import { scrollAnchorLine } from './scrollAnchor';

describe('scrollAnchorLine', () => {
  test('first line stays at top', () => {
    expect(scrollAnchorLine(1)).toBe(1);
  });

  test('focus line keeps a few lines of leading context', () => {
    expect(scrollAnchorLine(10, 4)).toBe(6);
    expect(scrollAnchorLine(3, 4)).toBe(1);
  });
});
