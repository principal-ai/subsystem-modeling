import { describe, expect, test } from 'bun:test';
import { EDGE_DIM_ALPHA, fileMatchForNode, flowElementVisibility, hexWithAlpha } from './nodes';

describe('hexWithAlpha', () => {
  test('appends a two-digit alpha to #rrggbb', () => {
    expect(hexWithAlpha('#4ec9b0', 1)).toBe('#4ec9b0ff');
    expect(hexWithAlpha('#4ec9b0', EDGE_DIM_ALPHA)).toBe('#4ec9b026');
  });

  test('expands #rgb', () => {
    expect(hexWithAlpha('#abc', 1)).toBe('#aabbccff');
  });

  test('leaves non-hex values alone', () => {
    expect(hexWithAlpha('teal', 0.15)).toBe('teal');
  });
});

describe('fileMatchForNode', () => {
  test('no open file → neutral', () => {
    expect(fileMatchForNode('src/a.ts', null, false)).toBeUndefined();
  });

  test('open file spotlights matches and dims others', () => {
    expect(fileMatchForNode('src/a.ts', 'src/a.ts', false)).toBe(true);
    expect(fileMatchForNode('src/b.ts', 'src/a.ts', false)).toBe(false);
  });

  test('focused-edge endpoint is not dimmed when it lives in another file', () => {
    expect(fileMatchForNode('src/target.ts', 'src/source.ts', true)).toBeUndefined();
    expect(fileMatchForNode('src/source.ts', 'src/source.ts', true)).toBe(true);
  });
});

describe('flowElementVisibility', () => {
  test('nothing open or selected → everything full', () => {
    expect(flowElementVisibility({ inOpened: false, inSelected: false, anyOpened: false, anySelected: false }))
      .toEqual({ hidden: false, dimmed: false });
  });

  test('opened, nothing selected → opened members full, rest hidden', () => {
    expect(flowElementVisibility({ inOpened: true, inSelected: false, anyOpened: true, anySelected: false }))
      .toEqual({ hidden: false, dimmed: false });
    expect(flowElementVisibility({ inOpened: false, inSelected: false, anyOpened: true, anySelected: false }))
      .toEqual({ hidden: true, dimmed: false });
  });

  test('selected flow or step full; other opened members dimmed; rest hidden', () => {
    expect(flowElementVisibility({ inOpened: true, inSelected: true, anyOpened: true, anySelected: true }))
      .toEqual({ hidden: false, dimmed: false });
    expect(flowElementVisibility({ inOpened: true, inSelected: false, anyOpened: true, anySelected: true }))
      .toEqual({ hidden: false, dimmed: true });
    expect(flowElementVisibility({ inOpened: false, inSelected: false, anyOpened: true, anySelected: true }))
      .toEqual({ hidden: true, dimmed: false });
  });
});
