import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from './SubsystemComponentGraph';

const dom = new Window();
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom;
globals.document = dom.document;
globals.navigator = dom.navigator;
globals.HTMLElement = dom.HTMLElement;
globals.SVGElement = dom.SVGElement;
globals.Node = dom.Node;
globals.Element = dom.Element;
globals.Event = dom.Event;
globals.localStorage = dom.localStorage;
globals.ResizeObserver = dom.ResizeObserver;
globals.getComputedStyle = dom.getComputedStyle.bind(dom);
globals.requestAnimationFrame = dom.requestAnimationFrame.bind(dom);
globals.cancelAnimationFrame = dom.cancelAnimationFrame.bind(dom);
globals.matchMedia = dom.matchMedia.bind(dom);

afterEach(cleanup);

function renderGraph(description: string | undefined) {
  return render(createElement(
    ThemeProvider,
    { theme: defaultEditorTheme },
    createElement(SubsystemComponentGraph, {
      components: [
        { alias: 'entry', name: 'Entry', construct: 'function', file: 'entry.ts' },
        { alias: 'store', name: 'Store', construct: 'function', file: 'store.ts' },
      ],
      trails: [{
        id: 'request',
        title: 'Request flow',
        steps: [{ from: 'entry', to: 'store', mechanism: 'calls' }],
      }],
      description,
    }),
  ));
}

describe('subsystem description overlay', () => {
  for (const closeWithEscape of [false, true]) {
    test(`More opens the full markdown over the graph and closes with ${closeWithEscape ? 'Escape' : 'the close button'}`, () => {
      const description = `${'A long description. '.repeat(50)}\n\n**Final detail**`;
      const view = renderGraph(description);
      const more = view.getByRole('button', { name: 'Read full description' });
      more.focus();
      fireEvent.click(more);
      const overlay = view.getByRole('dialog', { name: 'Subsystem description' });
      expect(overlay.textContent).toContain('A long description. '.repeat(50).trim());
      expect(overlay.querySelector('strong')?.textContent).toBe('Final detail');
      expect(overlay.style.position).toBe('absolute');
      expect(overlay.parentElement?.contains(view.getByLabelText('Resize sidebar'))).toBe(false);
      expect(more.getAttribute('aria-expanded')).toBe('true');
      const close = view.getByRole('button', { name: 'Close description' });
      expect(document.activeElement).toBe(close);
      if (closeWithEscape) fireEvent.keyDown(close, { key: 'Escape' });
      else fireEvent.click(close);
      expect(view.queryByRole('dialog')).toBeNull();
      expect(more.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(more);
      expect(view.getByText('Request flow')).toBeTruthy();
    });
  }

  test('does not offer More when there is no description', () => {
    const view = renderGraph(undefined);
    expect(view.queryByRole('button', { name: 'Read full description' })).toBeNull();
    expect(view.queryByRole('dialog')).toBeNull();
  });
});
