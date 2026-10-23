import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { useState } from 'react';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import {
  STEP_COPY_FEEDBACK_MS,
  TRAIL_HOVER_PREVIEW_MS,
  TrailsPanel,
  type TrailsPanelProps,
} from './TrailsPanel';
import type { SubsystemTrail } from './model';
import { buildStepBrief } from './trailBrief';
import {
  buildStepEmphasisMap,
  stepClaimKey,
  type StepEmphasisRecord,
} from './stepEmphasis';

// Bun's happy-dom test environment needs `@happy-dom/global-registrator`, which
// isn't installed here, so wire the DOM primitives React DOM + Testing Library
// need before any test renders.
const dom = new Window();
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom;
globals.document = dom.document;
globals.navigator = dom.navigator;
globals.HTMLElement = dom.HTMLElement;
globals.Node = dom.Node;
globals.Element = dom.Element;
globals.Event = dom.Event;
globals.MouseEvent = dom.MouseEvent;
globals.FocusEvent = dom.FocusEvent;
globals.KeyboardEvent = dom.KeyboardEvent;
globals.getComputedStyle = dom.getComputedStyle.bind(dom);
globals.requestAnimationFrame = dom.requestAnimationFrame.bind(dom);
globals.cancelAnimationFrame = dom.cancelAnimationFrame.bind(dom);
globals.localStorage = dom.localStorage;
globals.sessionStorage = dom.sessionStorage;
globals.matchMedia = dom.matchMedia.bind(dom);
// themed-markdown measures its slide container; happy-dom has no ResizeObserver.
globals.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};


const trails: SubsystemTrail[] = [
  {
    id: 'auth-flow',
    title: 'Auth flow',
    steps: [
      {
        from: 'ui',
        to: 'api',
        mechanism: 'calls',
        file: 'src/ui/login.tsx',
        line: 42,
        purl: 'pkg:github/acme/app',
        symbol: 'Login.submit',
      },
    ],
  },
];

const usesTrail: SubsystemTrail = {
  id: 'uses-flow',
  title: 'Uses flow',
  steps: [
    {
      from: 'panel',
      to: 'merge',
      mechanism: 'uses',
      file: 'src/list.tsx',
      span: { startLine: 10, endLine: 12, contentHash: 'h' },
      purl: 'pkg:github/acme/app#src/list.tsx',
      symbol: 'ModelList',
    },
  ],
};

const writeText = mock(() => Promise.resolve());

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

afterEach(cleanup);

function renderPanel(overrides: Partial<TrailsPanelProps> = {}) {
  const props: TrailsPanelProps = {
    trails,
    expandedTrails: new Set(['auth-flow']),
    focusedTrailId: null,
    focusedStepIndex: null,
    hoveredTrailStep: null,
    onToggleCollapsed: () => {},
    onFocusFlow: () => {},
    onClearFocus: () => {},
    onFocusStep: () => {},
    onHoverStep: () => {},
    onHoverFlow: () => {},
    onLeaveStep: () => {},
    ...overrides,
  };
  return render(
    <ThemeProvider theme={defaultEditorTheme}>
      <TrailsPanel {...props} />
    </ThemeProvider>,
  );
}

describe('TrailsPanel drilldown navigation', () => {
  test('clicking a trail opens its steps, and Back restores the list without playback', () => {
    const onFocusFlow = mock(() => {});
    const onFocusStep = mock(() => {});
    const onClearFocus = mock(() => {});
    const onToggleCollapsed = mock(() => {});
    function Harness() {
      const [focusedTrailId, setFocusedTrailId] = useState<string | null>(null);
      return (
        <ThemeProvider theme={defaultEditorTheme}>
          <TrailsPanel
            drilldown
            trails={trails}
            expandedTrails={new Set()}
            focusedTrailId={focusedTrailId}
            focusedStepIndex={null}
            hoveredTrailStep={null}
            onToggleCollapsed={onToggleCollapsed}
            onFocusFlow={(trail) => {
              onFocusFlow(trail);
              setFocusedTrailId(trail.id);
            }}
            onClearFocus={() => {
              onClearFocus();
              setFocusedTrailId(null);
            }}
            onFocusStep={onFocusStep}
            onHoverStep={() => {}}
            onHoverFlow={() => {}}
            onLeaveStep={() => {}}
          />
        </ThemeProvider>
      );
    }
    const { getByRole, queryByRole, queryByText } = render(<Harness />);
    expect(queryByText('Login.submit')).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Auth flow', exact: true }));
    expect(onFocusFlow).toHaveBeenCalledWith(trails[0]);
    expect(onToggleCollapsed).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: /Login.submit/ }));
    expect(onFocusStep).toHaveBeenCalledWith(trails[0], 0);
    expect(queryByRole('button', { name: /Play|Pause|Focus layout/ })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Back to trails' }));
    expect(onClearFocus).toHaveBeenCalledTimes(1);
    expect(getByRole('button', { name: 'Auth flow', exact: true })).toBeTruthy();
    expect(queryByRole('button', { name: /Login.submit/ })).toBeNull();
  });

  test('supports Command-click copy in the focused pane without extra controls', async () => {
    const onFocusStep = mock(() => {});
    const { getByText, getByLabelText, queryByLabelText, queryByRole } = renderPanel({
      drilldown: true,
      focusedTrailId: 'auth-flow',
      onFocusStep,
    });
    fireEvent.click(getByText('Login.submit').closest('button')!, { metaKey: true });
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(buildStepBrief(trails[0]!, 0)));
    expect(onFocusStep).not.toHaveBeenCalled();
    expect(queryByRole('button', { name: /Copy step/ })).toBeNull();
    expect(queryByLabelText('Play Auth flow')).toBeNull();
    expect(queryByLabelText('Collapse Auth flow')).toBeNull();
    expect(getByLabelText('Back to trails')).toBeTruthy();
  });

  test('keeps reordering available in the list even after an old expanded state is restored', () => {
    const { getByRole } = renderPanel({
      drilldown: true,
      onReorder: () => {},
    });
    expect(getByRole('button', { name: 'Reorder Auth flow' }).getAttribute('draggable')).toBe('true');
  });
});

describe('TrailsPanel trail titles', () => {
  for (const title of ['Short flow', 'Validate every selected checkout item and persist the complete customer order']) {
    for (const collapsed of [true, false]) {
      test(`keeps explicit title spacing for ${collapsed ? 'collapsed' : 'expanded'} ${title}`, () => {
        const { getByRole } = renderPanel({
          trails: [{ ...trails[0]!, title }],
          expandedTrails: collapsed ? new Set() : new Set(['auth-flow']),
          onReorder: () => {},
        });
        const button = getByRole('button', { name: title, exact: true });
        const row = button.parentElement!;
        expect(row.style.paddingTop).toBe('14px');
        expect(row.style.paddingBottom).toBe('14px');
        expect(row.style.paddingLeft).toBe('16px');
        expect(row.style.paddingRight).toBe(row.style.paddingLeft);
        expect(row.style.minHeight).toBe('');
        expect(row.style.alignItems).toBe('flex-start');
        expect(button.style.padding).toBe('0px');
        expect((button.lastElementChild as HTMLElement).style.lineHeight).toBe('20px');
        expect((button.firstElementChild as SVGElement).style.marginTop).toBe('3px');
        if (collapsed) {
          expect(getByRole('button', { name: `Reorder ${title}` }).style.height).toBe('20px');
          expect(getByRole('button', { name: `Reorder ${title}` }).style.marginRight).toBe('');
        } else {
          expect(getByRole('button', { name: `Play ${title}` }).style.height).toBe('20px');
        }
      });
    }
  }

  test('highlights immediately without a CSS fade while graph preview waits', async () => {
    const onHoverFlow = mock(() => {});
    const onLeaveStep = mock(() => {});
    const { getByRole } = renderPanel({
      drilldown: true,
      expandedTrails: new Set(),
      onHoverFlow,
      onLeaveStep,
    });
    const button = getByRole('button', { name: 'Auth flow', exact: true });
    const row = button.parentElement!;
    const icon = button.firstElementChild as SVGElement;
    const accent = document.createElement('span');
    accent.style.color = defaultEditorTheme.colors.primary;
    expect(row.style.background).toBe('transparent');
    fireEvent.mouseEnter(row);
    expect(row.style.background).not.toBe('transparent');
    expect(row.style.transition).toBe('');
    expect(icon.style.color).toBe(accent.style.color);
    expect(onHoverFlow).not.toHaveBeenCalled();
    await waitFor(() => expect(onHoverFlow).toHaveBeenCalledWith(trails[0]));
    fireEvent.mouseLeave(row);
    expect(row.style.background).toBe('transparent');
    expect(onLeaveStep).toHaveBeenCalled();
  });

  test('a pending graph preview does not hold a row highlight after the pointer leaves', async () => {
    const onHoverFlow = mock(() => {});
    const { getByRole } = renderPanel({
      drilldown: true,
      expandedTrails: new Set(),
      // The host may still be showing the previous graph preview.
      hoveredTrailStep: { trailId: 'auth-flow', stepIndex: null },
      onHoverFlow,
    });
    const row = getByRole('button', { name: 'Auth flow', exact: true }).parentElement!;
    expect(row.style.background).toBe('transparent');
    fireEvent.mouseEnter(row);
    expect(row.style.background).not.toBe('transparent');
    fireEvent.mouseLeave(row);
    expect(row.style.background).toBe('transparent');
    await new Promise((resolve) => setTimeout(resolve, TRAIL_HOVER_PREVIEW_MS + 20));
    expect(onHoverFlow).not.toHaveBeenCalled();
  });

  for (const collapsed of [true, false]) {
    test(`shows a decorative trail icon before the ${collapsed ? 'collapsed' : 'expanded'} trail name`, () => {
      const onFocusFlow = mock(() => {});
      const { getByRole } = renderPanel({
        expandedTrails: collapsed ? new Set() : new Set(['auth-flow']),
        onFocusFlow,
      });
      const button = getByRole('button', { name: 'Auth flow', exact: true });
      const icon = button.firstElementChild;
      expect(icon?.tagName.toLowerCase()).toBe('svg');
      expect(icon?.classList.contains('lucide-route')).toBe(true);
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(icon?.nextElementSibling?.textContent).toBe('Auth flow');
      fireEvent.click(button);
      expect(onFocusFlow).toHaveBeenCalledWith(trails[0]);
    });
  }
});

describe('TrailsPanel step copy', () => {
  test('does not show a copy button on hover or keyboard focus', () => {
    const { getByText, queryByRole, container } = renderPanel();
    const row = getByText('Login.submit').closest('button')!;
    fireEvent.mouseEnter(row);
    fireEvent.focus(row);
    expect(queryByRole('button', { name: /Copy step/ })).toBeNull();
    expect(container.querySelector('.lucide-copy')).toBeNull();
    expect(row.hasAttribute('title')).toBe(false);
    expect(row.firstElementChild?.textContent).toBe('1');
  });

  test('Command-click copies the brief without focusing and replaces the number with a checkmark', async () => {
    const onFocusStep = mock(() => {});
    const { getByText, getByRole } = renderPanel({ onFocusStep });
    const row = getByText('Login.submit').closest('button')!;
    fireEvent.click(row, { metaKey: true });
    await waitFor(() => expect(getByRole('status', { name: 'Copied' })).toBeTruthy());
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(buildStepBrief(trails[0]!, 0));
    expect(onFocusStep).not.toHaveBeenCalled();
    expect(row.hasAttribute('title')).toBe(false);
    expect(row.firstElementChild?.querySelector('.lucide-check')).not.toBeNull();
  });

  test('hovering the row still focuses the step on click', () => {
    const onFocusStep = mock(() => {});
    const { getByText } = renderPanel({ onFocusStep });
    const row = getByText('Login.submit').closest('button')!;
    fireEvent.mouseEnter(row);
    fireEvent.click(row);
    expect(onFocusStep).toHaveBeenCalledWith(trails[0]!, 0);
    expect(writeText).not.toHaveBeenCalled();
  });

  test('the copied checkmark clears after the feedback window', async () => {
    const { getByText, getByRole, queryByRole } = renderPanel();
    const row = getByText('Login.submit').closest('button')!;
    fireEvent.click(row, { metaKey: true });
    await waitFor(() => expect(getByRole('status', { name: 'Copied' })).toBeTruthy());
    await new Promise((r) => setTimeout(r, STEP_COPY_FEEDBACK_MS + 20));
    await waitFor(() => expect(queryByRole('status', { name: 'Copied' })).toBeNull());
    expect(row.firstElementChild?.textContent).toBe('1');
  });

  test('a failed copy shows no copied state', async () => {
    writeText.mockImplementationOnce(() => Promise.reject(new Error('denied')));
    const { getByText, queryByRole } = renderPanel();
    const row = getByText('Login.submit').closest('button')!;
    fireEvent.click(row, { metaKey: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(queryByRole('status', { name: 'Copied' })).toBeNull();
    expect(row.firstElementChild?.textContent).toBe('1');
  });

  test('an unavailable clipboard leaves the number and does not focus the step', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const onFocusStep = mock(() => {});
    const { getByText, queryByRole } = renderPanel({ onFocusStep });
    const row = getByText('Login.submit').closest('button')!;
    fireEvent.click(row, { metaKey: true });
    expect(writeText).not.toHaveBeenCalled();
    expect(onFocusStep).not.toHaveBeenCalled();
    expect(queryByRole('status', { name: 'Copied' })).toBeNull();
    expect(row.firstElementChild?.textContent).toBe('1');
  });
});

describe('TrailsPanel step semantics', () => {
  for (const drilldown of [false, true]) {
    test(`shows accent annotations above symbols in ${drilldown ? 'drilldown' : 'inline'} steps`, () => {
      const trail = {
        ...trails[0]!,
        steps: [{ ...trails[0]!.steps[0]!, annotation: 'Submit the login request.' }],
      };
      const onFocusStep = mock(() => {});
      const { getByText, getByRole } = renderPanel({
        trails: [trail],
        drilldown,
        focusedTrailId: trail.id,
        onFocusStep,
      });
      const annotation = getByText('Submit the login request.');
      const symbol = getByText('Login.submit');
      const accent = document.createElement('span');
      accent.style.color = defaultEditorTheme.colors.primary;
      const normal = document.createElement('span');
      normal.style.color = defaultEditorTheme.colors.text;
      expect(annotation.style.color).toBe(accent.style.color);
      expect(annotation.style.fontFamily).toBe(defaultEditorTheme.fonts.monospace);
      expect(symbol.style.color).toBe(normal.style.color);
      expect(symbol.style.fontFamily).toBe(defaultEditorTheme.fonts.body);
      expect(symbol.previousElementSibling).toBe(annotation);
      const row = symbol.closest('button')!;
      expect(row.style.paddingTop).toBe('14px');
      expect(row.style.paddingBottom).toBe('14px');
      expect(row.style.paddingLeft).toBe(drilldown ? '12px' : '16px');
      expect((row.firstElementChild as HTMLElement).style.width).toBe('14px');
      expect((row.firstElementChild as HTMLElement).style.textAlign).toBe('center');
      fireEvent.click(getByRole('button', { name: /Submit the login request.*Login.submit/ }));
      expect(onFocusStep).toHaveBeenCalledWith(trail, 0);
    });

    test(`keeps nested steps offset from the ${drilldown ? 'selected' : 'inline'} header column`, () => {
      const trail: SubsystemTrail = {
        ...trails[0]!,
        steps: [
          { ...trails[0]!.steps[0]!, from: 'a', to: 'b', symbol: 'A.go' },
          { ...trails[0]!.steps[0]!, from: 'b', to: 'c', symbol: 'B.go' },
          { ...trails[0]!.steps[0]!, from: 'a', to: 'd', symbol: 'A.next' },
        ],
      };
      const { getByText } = renderPanel({ trails: [trail], drilldown, focusedTrailId: trail.id });
      const inset = drilldown ? 12 : 16;
      expect(getByText('A.go').closest('button')!.style.paddingLeft).toBe(`${inset}px`);
      expect(getByText('B.go').closest('button')!.style.paddingLeft).toBe(`${inset + 10}px`);
      expect(getByText('A.next').closest('button')!.style.paddingLeft).toBe(`${inset}px`);
    });
  }

  test('calls leads with the caller frame', () => {
    const { getByText, queryByText } = renderPanel();
    expect(getByText('Login.submit')).toBeTruthy();
    expect(queryByText(/calls →/)).toBeNull();
  });

  test('uses leads with the logical hop and shows the via site', () => {
    const { getByText } = renderPanel({
      trails: [usesTrail],
      expandedTrails: new Set(['uses-flow']),
      componentByAlias: new Map([
        ['panel', { alias: 'panel', name: 'MaintenancePanel' }],
        ['merge', { alias: 'merge', name: 'mergeProvenance' }],
      ]),
    });
    expect(getByText('MaintenancePanel uses mergeProvenance')).toBeTruthy();
  });

  test('falls back to aliases when no component map is supplied', () => {
    const { getByText } = renderPanel({
      trails: [usesTrail],
      expandedTrails: new Set(['uses-flow']),
    });
    expect(getByText('panel uses merge')).toBeTruthy();
  });

  test('uses the resolved target symbol as the callee', () => {
    const withTarget: SubsystemTrail = {
      ...usesTrail,
      steps: [
        {
          ...usesTrail.steps[0]!,
          target: {
            purl: 'pkg:github/acme/app#src/store.ts',
            file: 'src/store.ts',
            symbol: 'Store.add',
            span: { startLine: 3, endLine: 5, contentHash: 'h' },
          },
        },
      ],
    };
    const { getByText } = renderPanel({
      trails: [withTarget],
      expandedTrails: new Set(['uses-flow']),
      componentByAlias: new Map([
        ['panel', { alias: 'panel', name: 'MaintenancePanel' }],
        ['merge', { alias: 'merge', name: 'Store' }],
      ]),
    });
    expect(getByText('MaintenancePanel uses Store.add')).toBeTruthy();
  });

});

function emphasisRecord(
  trailId: string,
  stepIndex: number,
  guidance?: string,
): StepEmphasisRecord {
  return {
    trailId,
    stepKey: stepClaimKey(trails[0]!.steps[stepIndex]!),
    guidance,
    provenance: { source: 'author', at: '2026-10-19T00:00:00.000Z' },
  };
}

describe('TrailsPanel step emphasis', () => {
  test('renders a marked star and the trail emphasis count', () => {
    const emphasis = buildStepEmphasisMap([
      emphasisRecord('auth-flow', 0, 'Why this step matters.'),
    ]);
    const { getByTitle } = renderPanel({ stepEmphasis: emphasis });
    expect(getByTitle('1 emphasized step')).not.toBeNull();
    expect(getByTitle('Key step')).not.toBeNull();
  });

  test('shows markdown guidance when the marked step is focused', () => {
    const emphasis = buildStepEmphasisMap([
      emphasisRecord('auth-flow', 0, '**Start here** because this row matters.'),
    ]);
    const { container } = renderPanel({
      focusedTrailId: 'auth-flow',
      focusedStepIndex: 0,
      stepEmphasis: emphasis,
    });
    expect(container.textContent).toContain('Start here');
    expect(container.textContent).toContain('because this row matters.');
  });

  test('Remove guidance toggles the mark off', () => {
    const onRemoveStepEmphasis = mock(() => {});
    const emphasis = buildStepEmphasisMap([
      emphasisRecord('auth-flow', 0, 'Why this step matters.'),
    ]);
    const { getByText } = renderPanel({
      focusedTrailId: 'auth-flow',
      focusedStepIndex: 0,
      stepEmphasis: emphasis,
      onRemoveStepEmphasis,
    });
    fireEvent.click(getByText('Remove guidance'));
    expect(onRemoveStepEmphasis).toHaveBeenCalledWith(trails[0], 0);
  });

  test('does not render guidance while the step is not focused', () => {
    const emphasis = buildStepEmphasisMap([
      emphasisRecord('auth-flow', 0, '**Start here** because this row matters.'),
    ]);
    const { container } = renderPanel({ stepEmphasis: emphasis });
    expect(container.textContent).not.toContain('because this row matters.');
  });

  test('does not render a star for an unmarked step', () => {
    const { queryByTitle } = renderPanel({
      stepEmphasis: buildStepEmphasisMap([]),
    });
    expect(queryByTitle('Key step')).toBeNull();
  });
});
