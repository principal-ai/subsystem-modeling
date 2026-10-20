import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import {
  STEP_COPY_FEEDBACK_MS,
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

const COPY_LABEL = 'Copy step 1 of Auth flow for an agent';

describe('TrailsPanel step copy', () => {
  test('copy icon is hidden until the step row is hovered', () => {
    const { getByText, queryByLabelText } = renderPanel();
    expect(queryByLabelText(COPY_LABEL)).toBeNull();
    const row = getByText('Login.submit').closest('button')!;
    fireEvent.mouseEnter(row);
    expect(queryByLabelText(COPY_LABEL)).not.toBeNull();
  });

  test('copy icon is revealed on keyboard focus', () => {
    const { getByText, queryByLabelText } = renderPanel();
    const row = getByText('Login.submit').closest('button')!;
    fireEvent.focus(row);
    expect(queryByLabelText(COPY_LABEL)).not.toBeNull();
  });

  test('clicking copies the step brief and flashes a copied state', async () => {
    const { getByText, getByLabelText } = renderPanel();
    fireEvent.mouseEnter(getByText('Login.submit').closest('button')!);
    const copy = getByLabelText(COPY_LABEL);
    fireEvent.mouseDown(copy);
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(buildStepBrief(trails[0]!, 0));
    expect(copy.getAttribute('title')).toBe('Copied');
  });

  test('hovering the row still focuses the step on click', () => {
    const onFocusStep = mock(() => {});
    const { getByText } = renderPanel({ onFocusStep });
    const row = getByText('Login.submit').closest('button')!;
    fireEvent.mouseEnter(row);
    fireEvent.click(row);
    expect(onFocusStep).toHaveBeenCalledWith(trails[0]!, 0);
  });

  test('the copied checkmark clears after the feedback window', async () => {
    const { getByText, getByLabelText } = renderPanel();
    fireEvent.mouseEnter(getByText('Login.submit').closest('button')!);
    const copy = getByLabelText(COPY_LABEL);
    fireEvent.click(copy);
    await waitFor(() => expect(copy.getAttribute('title')).toBe('Copied'));
    await new Promise((r) => setTimeout(r, STEP_COPY_FEEDBACK_MS + 20));
    await waitFor(() => expect(copy.getAttribute('title')).not.toBe('Copied'));
  });

  test('a failed copy shows no copied state', async () => {
    writeText.mockImplementationOnce(() => Promise.reject(new Error('denied')));
    const { getByText, getByLabelText } = renderPanel();
    fireEvent.mouseEnter(getByText('Login.submit').closest('button')!);
    const copy = getByLabelText(COPY_LABEL);
    fireEvent.click(copy);
    await new Promise((r) => setTimeout(r, 10));
    expect(copy.getAttribute('title')).toBe('Copy this step for an agent');
  });
});

describe('TrailsPanel step semantics', () => {
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
