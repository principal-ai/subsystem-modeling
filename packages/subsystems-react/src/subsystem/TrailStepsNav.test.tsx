import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { TrailStepsNav } from './TrailStepsNav';
import type { SubsystemTrail } from './model';

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

const step = (from: string, to: string, symbol: string) => ({
  from,
  to,
  mechanism: 'calls' as const,
  file: `${from}.ts`,
  line: 1,
  purl: `pkg:github/x#${from}.ts`,
  symbol,
});

const TRAILS: SubsystemTrail[] = [
  { id: 't1', title: 'First flow', steps: [step('a', 'b', 'A.go'), step('b', 'c', 'B.go')] },
  { id: 't2', title: 'Second flow', steps: [step('c', 'd', 'C.go')] },
];

function renderNav(props: Record<string, unknown>) {
  return render(
    createElement(
      ThemeProvider,
      { theme: defaultEditorTheme },
      createElement(TrailStepsNav as never, props as never),
    ),
  );
}

describe('TrailStepsNav', () => {
  test('lists trails with step counts and focuses on click', () => {
    let focused: string | null = null;
    const { getByText, getByRole } = renderNav({
      trails: TRAILS,
      focusedTrailId: null,
      focusedStepIndex: null,
      hoveredTrailStep: null,
      onFocusFlow: (t: SubsystemTrail) => {
        focused = t.id;
      },
      onClearFocus: () => {},
      onFocusStep: () => {},
      onHoverStep: () => {},
      onHoverFlow: () => {},
      onLeaveStep: () => {},
    });
    expect(getByText('First flow')).toBeTruthy();
    expect(getByText('Second flow')).toBeTruthy();
    fireEvent.click(getByRole('button', { name: /First flow/ }));
    expect(focused).toBe('t1');
  });

  test('a hovered trail row previews the flow', () => {
    const hovered: string[] = [];
    const { getByRole } = renderNav({
      trails: TRAILS,
      focusedTrailId: null,
      focusedStepIndex: null,
      hoveredTrailStep: null,
      onFocusFlow: () => {},
      onClearFocus: () => {},
      onFocusStep: () => {},
      onHoverStep: () => {},
      onHoverFlow: (t: SubsystemTrail) => hovered.push(t.id),
      onLeaveStep: () => {},
    });
    fireEvent.mouseEnter(getByRole('button', { name: /Second flow/ }));
    expect(hovered).toContain('t2');
  });

  test('a focused trail shows its steps; back clears the focus', () => {
    let cleared = false;
    let focusedStep: number | null = null;
    const { getByText, getByLabelText, getByRole } = renderNav({
      trails: TRAILS,
      focusedTrailId: 't1',
      focusedStepIndex: null,
      hoveredTrailStep: null,
      onFocusFlow: () => {},
      onClearFocus: () => {
        cleared = true;
      },
      onFocusStep: (_t: SubsystemTrail, i: number) => {
        focusedStep = i;
      },
      onHoverStep: () => {},
      onHoverFlow: () => {},
      onLeaveStep: () => {},
    });
    // The step pane is translated in; both steps render by symbol.
    expect(getByText('A.go')).toBeTruthy();
    expect(getByText('B.go')).toBeTruthy();
    fireEvent.click(getByRole('button', { name: /B\.go/ }));
    expect(focusedStep).toBe(1);
    fireEvent.click(getByLabelText('Back to trails'));
    expect(cleared).toBe(true);
  });
});