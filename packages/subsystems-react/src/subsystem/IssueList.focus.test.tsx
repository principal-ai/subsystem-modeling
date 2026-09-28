import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemIssueList, type SubsystemIssue } from './IssueList';

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

const issues: SubsystemIssue[] = [
  {
    id: 'ct',
    severity: 'error',
    kind: 'missing_file',
    message: 'construct finding',
    target: { kind: 'component', id: 'alpha', label: 'Alpha' },
  },
  {
    id: 'wl',
    severity: 'info',
    kind: 'walkthrough',
    message: 'walkthrough finding',
    target: { kind: 'walkthrough', id: 'w', label: 'Walkthrough' },
  },
];

function setup() {
  const events: string[] = [];
  const view = render(
    createElement(
      ThemeProvider,
      { theme: defaultEditorTheme },
      createElement(SubsystemIssueList, {
        issues,
        onSelectIssue: (i) => events.push(`select:${i.id}`),
        onDeselectIssue: (i) => events.push(`deselect:${i.id}`),
      }),
    ),
  );
  const category = (name: string) =>
    [...view.container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(name),
    ) as HTMLElement;
  const card = (label: string) =>
    [...view.container.querySelectorAll('[role="button"]')].find((b) =>
      b.textContent?.includes(label),
    ) as HTMLElement;
  return { ...view, events, category, card };
}

describe('collapsing a category retracts the focus it established', () => {
  // Closing a CATEGORY unmounts its cards, so a card stops being expanded
  // without ever toggling itself. A host that framed a target on expand has to
  // hear about it, or the canvas stays parked on a target the list no longer
  // shows as open.
  test('clicking the open category emits a deselect for its expanded card', () => {
    const { events, category, card } = setup();
    fireEvent.click(category('Constructs'));
    fireEvent.click(card('Alpha'));
    expect(events).toEqual(['select:ct']);

    fireEvent.click(category('Constructs'));
    expect(events).toEqual(['select:ct', 'deselect:ct']);
  });

  test('opening a sibling layer retracts the other layer’s card', () => {
    // The accordion closes every other layer, so that layer's cards unmount
    // on this click — same obligation as collapsing the layer directly.
    const { events, category, card } = setup();
    fireEvent.click(category('Constructs'));
    fireEvent.click(card('Alpha'));

    fireEvent.click(category('Walkthrough'));
    expect(events).toEqual(['select:ct', 'deselect:ct']);
  });

  test('collapsing a layer with nothing expanded emits no deselect', () => {
    const { events, category } = setup();
    fireEvent.click(category('Constructs'));
    fireEvent.click(category('Constructs'));
    expect(events).toEqual([]);
  });

  test('collapsing the card itself still emits exactly one deselect', () => {
    // The ref is cleared by the card's own collapse, so closing the layer
    // afterwards must not re-report it.
    const { events, category, card } = setup();
    fireEvent.click(category('Constructs'));
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('Alpha'));
    expect(events).toEqual(['select:ct', 'deselect:ct']);

    fireEvent.click(category('Constructs'));
    expect(events).toEqual(['select:ct', 'deselect:ct']);
  });
});
