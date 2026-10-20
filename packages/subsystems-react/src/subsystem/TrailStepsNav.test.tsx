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

const step = (from: string, to: string, symbol: string, annotation?: string) => ({
  from,
  to,
  mechanism: 'calls' as const,
  file: `${from}.ts`,
  line: 1,
  purl: `pkg:github/x#${from}.ts`,
  symbol,
  ...(annotation ? { annotation } : {}),
});

const TRAILS: SubsystemTrail[] = [
  {
    id: 't1',
    title: 'First flow',
    steps: [step('a', 'b', 'A.go', 'Read the source seam.'), step('b', 'c', 'B.go')],
  },
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

  test('back slides the step pane out before its steps unmount', async () => {
    const base = {
      trails: TRAILS,
      focusedStepIndex: null,
      hoveredTrailStep: null,
      onFocusFlow: () => {},
      onClearFocus: () => {},
      onFocusStep: () => {},
      onHoverStep: () => {},
      onHoverFlow: () => {},
      onLeaveStep: () => {},
      transitionMs: 30,
    };
    const { getByText, queryByText, rerender } = renderNav({ ...base, focusedTrailId: 't1' });
    expect(getByText('A.go')).toBeTruthy();
    // Back clears the focus, but the pane keeps its content while it slides out.
    rerender(
      createElement(
        ThemeProvider,
        { theme: defaultEditorTheme },
        createElement(TrailStepsNav as never, { ...base, focusedTrailId: null } as never),
      ),
    );
    expect(queryByText('A.go')).toBeTruthy();
    // Once the transition has run, the step content is dropped.
    await new Promise((r) => setTimeout(r, 30 + 40));
    expect(queryByText('A.go')).toBeNull();
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
    // The step pane is translated in; both steps render by symbol, and an
    // annotated step shows its note as the row's description.
    expect(getByText('A.go')).toBeTruthy();
    expect(getByText('B.go')).toBeTruthy();
    expect(getByText('Read the source seam.')).toBeTruthy();
    fireEvent.click(getByRole('button', { name: /B\.go/ }));
    expect(focusedStep).toBe(1);
    fireEvent.click(getByLabelText('Back to trails'));
    expect(cleared).toBe(true);
  });

  test('uses rows show the logical hop and the via site', () => {
    const usesTrail: SubsystemTrail = {
      id: 'uses',
      title: 'Uses flow',
      steps: [
        {
          from: 'panel',
          to: 'merge',
          mechanism: 'uses',
          file: 'src/list.tsx',
          span: { startLine: 10, endLine: 12, contentHash: 'h' },
          purl: 'pkg:github/x#src/list.tsx',
          symbol: 'ModelList',
        },
      ],
    };
    const { getByText } = renderNav({
      trails: [usesTrail],
      focusedTrailId: 'uses',
      focusedStepIndex: null,
      hoveredTrailStep: null,
      componentByAlias: new Map([
        ['panel', { alias: 'panel', name: 'MaintenancePanel' }],
        ['merge', { alias: 'merge', name: 'mergeProvenance' }],
      ]),
      onFocusFlow: () => {},
      onClearFocus: () => {},
      onFocusStep: () => {},
      onHoverStep: () => {},
      onHoverFlow: () => {},
      onLeaveStep: () => {},
    });
    expect(getByText('MaintenancePanel uses mergeProvenance')).toBeTruthy();
  });

  test('clicking the step-pane header title also goes back', () => {
    let cleared = false;
    const { getByRole } = renderNav({
      trails: TRAILS,
      focusedTrailId: 't1',
      focusedStepIndex: null,
      hoveredTrailStep: null,
      onFocusFlow: () => {},
      onClearFocus: () => {
        cleared = true;
      },
      onFocusStep: () => {},
      onHoverStep: () => {},
      onHoverFlow: () => {},
      onLeaveStep: () => {},
    });
    // The header title is its own button (the list row's accessible name
    // includes the step count, so the exact title matches the header).
    fireEvent.click(getByRole('button', { name: 'First flow' }));
    expect(cleared).toBe(true);
  });
});