import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { Window } from 'happy-dom';
import { cleanup, render } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { GraphWithSidebar, GraphSidebar } from './GraphWithSidebar';

// Bun's happy-dom test environment isn't registered (no @happy-dom/global-
// registrator), so wire the DOM primitives React DOM needs before rendering.
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
globals.requestAnimationFrame = dom.requestAnimationFrame.bind(dom);
globals.cancelAnimationFrame = dom.cancelAnimationFrame.bind(dom);
globals.localStorage = dom.localStorage;
globals.matchMedia = dom.matchMedia.bind(dom);

afterEach(cleanup);

function renderWrapper(props: Record<string, unknown>) {
  return render(
    createElement(
      ThemeProvider,
      { theme: defaultEditorTheme },
      createElement(GraphWithSidebar as never, props as never),
    ),
  );
}

describe('GraphWithSidebar composition', () => {
  test('composes GraphSidebar next to graph content', () => {
    const { getByText, getByLabelText } = renderWrapper({
      header: createElement('span', null, 'title'),
      sidebarBody: createElement('span', null, 'panel'),
      children: createElement('div', null, 'canvas'),
    });
    expect(getByText('title')).toBeTruthy();
    expect(getByText('panel')).toBeTruthy();
    expect(getByText('canvas')).toBeTruthy();
    expect(getByLabelText('Resize sidebar')).toBeTruthy();
  });

  test('hidden renders only the content — no sidebar, no handle', () => {
    const { queryByLabelText, getByText } = renderWrapper({
      hidden: true,
      header: createElement('span', null, 'title'),
      children: createElement('div', null, 'canvas'),
    });
    expect(getByText('canvas')).toBeTruthy();
    expect(queryByLabelText('Resize sidebar')).toBeNull();
    expect(() => getByText('title')).toThrow();
  });

  test('wrapper exposes GraphSidebar as its own export', () => {
    expect(GraphSidebar).toBeTypeOf('function');
  });

  test('the content slot is a flex column so a flex-filling child can size', () => {
    // The component graph's canvas fills the pane with `flex: 1 1 0%`, which
    // only resolves against a flex parent — a block slot collapses it to 0 and
    // the canvas renders blank.
    const { container } = renderWrapper({
      sidebarBody: createElement('span', null, 'panel'),
      children: createElement('div', null, 'canvas'),
    });
    const root = container.firstElementChild as HTMLElement;
    const content = root.lastElementChild as HTMLElement;
    expect(content.style.display).toBe('flex');
    expect(content.style.flexDirection).toBe('column');
  });
});