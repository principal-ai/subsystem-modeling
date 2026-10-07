import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { GraphSidebar } from './GraphSidebar';

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

function renderSidebar(props: Record<string, unknown>) {
  return render(
    createElement(
      ThemeProvider,
      { theme: defaultEditorTheme },
      createElement(GraphSidebar as never, props as never),
    ),
  );
}

const sidebarColumn = (container: HTMLElement) =>
  container.querySelector('div[style*="border-right"]') as HTMLElement;

describe('GraphSidebar chrome', () => {
  test('renders the sidebar column and resize handle', () => {
    const { container, getByText, getByLabelText } = renderSidebar({
      header: createElement('span', null, 'title'),
      sidebarBody: createElement('span', null, 'panel'),
    });
    expect(getByText('title')).toBeTruthy();
    expect(getByText('panel')).toBeTruthy();
    expect(getByLabelText('Resize sidebar')).toBeTruthy();
    // Uncontrolled width defaults to 320px.
    expect(sidebarColumn(container).style.width).toBe('320px');
  });

  test('hidden renders nothing — no column, no handle', () => {
    const { queryByLabelText, queryByText } = renderSidebar({
      hidden: true,
      header: createElement('span', null, 'title'),
    });
    expect(queryByText('title')).toBeNull();
    expect(queryByLabelText('Resize sidebar')).toBeNull();
  });

  test('tabs render a strip and report the change', () => {
    let changed: string | null = null;
    const { getByRole } = renderSidebar({
      tabs: [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ],
      activeTab: 'a',
      onTabChange: (id: string) => {
        changed = id;
      },
      sidebarBody: createElement('span', null, 'body'),
    });
    expect(getByRole('tablist')).toBeTruthy();
    fireEvent.click(getByRole('tab', { name: 'Beta' }));
    expect(changed).toBe('b');
  });

  test('no tabs renders a single body without a strip', () => {
    const { queryByRole, getByText } = renderSidebar({
      sidebarBody: createElement('span', null, 'body'),
    });
    expect(getByText('body')).toBeTruthy();
    expect(queryByRole('tablist')).toBeNull();
  });

  test('bodyHidden hides the lower panel but keeps the header', () => {
    const { getByText, queryByText } = renderSidebar({
      header: createElement('span', null, 'header'),
      sidebarBody: createElement('span', null, 'body'),
      bodyHidden: true,
    });
    expect(getByText('header')).toBeTruthy();
    expect(queryByText('body')).toBeNull();
  });

  test('controlled width applies to the column and reports drag changes', () => {
    let reports = 0;
    const { container, getByLabelText } = renderSidebar({
      width: 400,
      onWidthChange: () => {
        reports++;
      },
      sidebarBody: createElement('span', null, 'panel'),
    });
    expect(sidebarColumn(container).style.width).toBe('400px');
    const handle = getByLabelText('Resize sidebar');
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 140 });
    fireEvent.mouseUp(document);
    // Controlled: the width only reports — the prop stays authoritative.
    expect(sidebarColumn(container).style.width).toBe('400px');
    expect(reports).toBeGreaterThan(0);
  });

  test('an uncontrolled drag resizes the column', () => {
    const { container, getByLabelText } = renderSidebar({
      sidebarBody: createElement('span', null, 'panel'),
    });
    const handle = getByLabelText('Resize sidebar');
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 180 });
    fireEvent.mouseUp(document);
    expect(sidebarColumn(container).style.width).toBe('400px');
  });

  test('a drag ends by persisting the width under persistKey', () => {
    const { getByLabelText } = renderSidebar({
      persistKey: 'gs-test',
      sidebarBody: createElement('span', null, 'panel'),
    });
    const handle = getByLabelText('Resize sidebar');
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 200 });
    fireEvent.mouseUp(document);
    expect(window.localStorage.getItem('principal.subsystems.sidebarWidth.gs-test')).toBe('420');
  });

  test('reports drag state to the wrapper', () => {
    const states: boolean[] = [];
    const { getByLabelText } = renderSidebar({
      onDraggingChange: (d: boolean) => states.push(d),
      sidebarBody: createElement('span', null, 'panel'),
    });
    const handle = getByLabelText('Resize sidebar');
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 140 });
    fireEvent.mouseUp(document);
    expect(states).toEqual([true, false]);
  });
});