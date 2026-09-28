import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { Window } from 'happy-dom';
import { cleanup, render } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemIssueCard, type SubsystemIssue } from './IssueList';

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

const issue: SubsystemIssue = {
  id: 'i1',
  severity: 'info',
  kind: 'walkthrough',
  message: 'Step 2 references a line that moved.',
  target: {
    kind: 'step',
    id: 'flow-1',
    label: 'Checkout',
    detail: 'step 2',
    stepIndex: 1,
  },
};

function renderCard(overrides: Partial<SubsystemIssue> = {}) {
  return render(
    createElement(
      ThemeProvider,
      { theme: defaultEditorTheme },
      createElement(SubsystemIssueCard as never, {
        issue: { ...issue, ...overrides },
      } as never),
    ),
  );
}

// lucide emits "lucide lucide-<name>", so match on substring rather than the
// whole class string.
const hasIcon = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll('svg')].some((s) =>
    (s.getAttribute('class') ?? '').includes(`lucide-${name}`),
  );

describe('issue card icon', () => {
  test('a step finding wears the step icon, not the flow lane icon', () => {
    // The audit kind is `walkthrough` (the whole flow), so without a
    // target-shape icon this card would read as a comment on the flow rather
    // than on the one step that is wrong.
    const { container } = renderCard();
    expect(hasIcon(container, 'footprints')).toBe(true);
    expect(hasIcon(container, 'route')).toBe(false);
  });

  test('a finding about the flow as a whole keeps the lane icon', () => {
    const { container } = renderCard({
      target: { kind: 'walkthrough', id: 'flow-1', label: 'Checkout' },
    });
    expect(hasIcon(container, 'route')).toBe(true);
    expect(hasIcon(container, 'footprints')).toBe(false);
  });

  test('an explicit kind icon outranks the target-shape icon', () => {
    // A boundary finding about a module is about the region, and says so.
    const { container } = renderCard({
      kind: 'boundary_process_nest_disagree',
      target: { kind: 'step', id: 'flow-1', label: 'Checkout', stepIndex: 0 },
    });
    expect(hasIcon(container, 'split')).toBe(true);
    expect(hasIcon(container, 'footprints')).toBe(false);
  });

  test('a construct rung still outranks both', () => {
    const { container } = renderCard({
      kind: 'missing_file',
      target: { kind: 'step', id: 'flow-1', label: 'Checkout', stepIndex: 0 },
    });
    expect(hasIcon(container, 'file-x')).toBe(true);
  });
});
