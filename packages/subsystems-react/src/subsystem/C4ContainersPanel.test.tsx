import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { C4ContainersPanel, type C4ContainerListItem } from './C4ContainersPanel';

// Bun's happy-dom test environment isn't registered (no @happy-dom/global-
// registrator), so wire the DOM primitives React DOM needs before rendering.
const dom = new Window();
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom;
globals.document = dom.document;
globals.navigator = dom.navigator;
globals.HTMLElement = dom.HTMLElement;
globals.customElements = dom.customElements;
globals.Node = dom.Node;
globals.Element = dom.Element;
globals.Event = dom.Event;
globals.getComputedStyle = dom.getComputedStyle.bind(dom);
globals.requestAnimationFrame = dom.requestAnimationFrame.bind(dom);
globals.cancelAnimationFrame = dom.cancelAnimationFrame.bind(dom);
globals.localStorage = dom.localStorage;
globals.matchMedia = dom.matchMedia.bind(dom);

afterEach(cleanup);

const ITEMS: C4ContainerListItem[] = [
  {
    container: {
      kind: 'container',
      id: 'container:host',
      label: 'Host',
      containerKind: 'application',
      technology: 'Bun',
      state: 'accepted',
    },
    open: false,
    members: [
      {
        kind: 'component',
        id: 'component:host-api',
        label: 'Host API',
        container: 'container:host',
        technology: 'Bun',
        state: 'accepted',
      },
    ],
  },
  {
    container: {
      kind: 'container',
      id: 'container:store',
      label: 'Session store',
      containerKind: 'data-store',
      technology: 'SQLite',
      state: 'proposed',
    },
    open: true,
    members: [],
  },
];

function renderPanel(items: C4ContainerListItem[], handlers = {}) {
  const props = {
    containers: items,
    activeId: null,
    onActivate: () => {},
    onSelect: () => {},
    onOpenAll: () => {},
    onCloseAll: () => {},
    ...handlers,
  };
  return render(
    createElement(
      ThemeProvider,
      { theme: defaultEditorTheme },
      createElement(C4ContainersPanel as never, props as never),
    ),
  );
}

describe('C4ContainersPanel', () => {
  test('lists every container and its state', () => {
    const view = renderPanel(ITEMS);
    expect(view.getByText('2 containers')).toBeTruthy();
    expect(view.getByText('Host')).toBeTruthy();
    expect(view.getByText('Session store')).toBeTruthy();
    expect(view.getByText('proposed')).toBeTruthy();
    expect(view.queryByText('Host API')).toBeNull();
    const row = view.getByText('Host').closest('li');
    expect(row?.className).toContain('c4-containers-row');
    expect(row?.hasAttribute('title')).toBe(false);
    expect(row?.querySelector('button')?.hasAttribute('title')).toBe(false);
  });

  test('an open container lists its components', () => {
    const view = renderPanel([{ ...ITEMS[0]!, open: true }]);
    expect(view.getByText('Host API')).toBeTruthy();
    expect(view.queryByText('No components')).toBeNull();
  });

  test('activating a row opens/frames that container', () => {
    const activated: string[] = [];
    const view = renderPanel(ITEMS, { onActivate: (id: string) => activated.push(id) });
    fireEvent.click(view.getByRole('button', { name: /^Host/ }));
    expect(activated).toEqual(['container:host']);
  });

  test('rows with members are dropdowns; empty rows are select-only', () => {
    const view = renderPanel(ITEMS);
    const closed = view.getByRole('button', { name: /^Host/ });
    expect(closed.getAttribute('aria-expanded')).toBe('false');
    const empty = view.getByRole('button', { name: /^Session store/ });
    expect(empty.hasAttribute('aria-expanded')).toBe(false);
  });

  test('selecting an empty container frames it without toggling', () => {
    let selected = '';
    let activated = 0;
    const view = renderPanel(ITEMS, {
      onSelect: (id: string) => {
        selected = id;
      },
      onActivate: () => {
        activated += 1;
      },
    });
    fireEvent.click(view.getByRole('button', { name: /^Session store/ }));
    expect(selected).toBe('container:store');
    expect(activated).toBe(0);
  });

  test('bulk controls reflect the open set and invoke their handlers', () => {
    const opened: string[] = [];
    const closed: string[] = [];
    const view = renderPanel(ITEMS, {
      onOpenAll: () => opened.push('open'),
      onCloseAll: () => closed.push('close'),
    });
    fireEvent.click(view.getByRole('button', { name: 'Open all' }));
    fireEvent.click(view.getByRole('button', { name: 'Close all' }));
    expect(opened).toEqual(['open']);
    expect(closed).toEqual(['close']);
  });

  test('an empty model says so instead of drawing an empty list', () => {
    const view = renderPanel([]);
    expect(view.getByText('No containers.')).toBeTruthy();
  });
});
