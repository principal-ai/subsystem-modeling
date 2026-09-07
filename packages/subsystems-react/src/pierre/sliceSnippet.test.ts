import { describe, expect, test } from 'bun:test';
import { sliceSnippetWindow } from './sliceSnippet';

describe('sliceSnippetWindow', () => {
  const content = ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n');

  test('slices with context and focus offset', () => {
    const s = sliceSnippetWindow(content, 3, 3, 1, 3);
    expect(s.sliceStart).toBe(2);
    expect(s.sliceEnd).toBe(4);
    expect(s.contents).toBe(['line2', 'line3', 'line4'].join('\n'));
    expect(s.focusOffset).toBe(2);
  });

  test('clamps out-of-range lines', () => {
    const s = sliceSnippetWindow(content, 99, 99, 0, 99);
    expect(s.sliceStart).toBe(5);
    expect(s.sliceEnd).toBe(5);
    expect(s.focusOffset).toBe(95);
  });
});
