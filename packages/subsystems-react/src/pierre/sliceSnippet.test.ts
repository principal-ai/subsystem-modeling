import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { remapSnippetLineNumbers, sliceSnippetWindow } from './sliceSnippet';

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

describe('remapSnippetLineNumbers', () => {
  function gutter(doc: Document, lineIndex: number, label: string): HTMLElement {
    const el = doc.createElement('div');
    el.setAttribute('data-column-number', '');
    el.dataset.lineIndex = String(lineIndex);
    const span = doc.createElement('span');
    span.setAttribute('data-line-number-content', '');
    span.textContent = label;
    el.appendChild(span);
    return el;
  }

  test('rewrites gutters to absolute file lines', () => {
    const win = new Window();
    const doc = win.document;
    const root = doc.createElement('div');
    root.appendChild(gutter(doc, 0, '1'));
    root.appendChild(gutter(doc, 1, '2'));
    root.appendChild(gutter(doc, 2, '3'));

    remapSnippetLineNumbers(root as unknown as HTMLElement, 250);

    const labels = [...root.querySelectorAll('[data-line-number-content]')].map(
      (n) => n.textContent,
    );
    expect(labels).toEqual(['250', '251', '252']);
  });

  test('no-ops when slice already starts at line 1', () => {
    const win = new Window();
    const doc = win.document;
    const root = doc.createElement('div');
    root.appendChild(gutter(doc, 0, '1'));

    remapSnippetLineNumbers(root as unknown as HTMLElement, 1);

    expect(
      root.querySelector('[data-line-number-content]')?.textContent,
    ).toBe('1');
  });
});
