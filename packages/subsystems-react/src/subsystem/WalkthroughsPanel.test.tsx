import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import {
  STEP_COPY_FEEDBACK_MS,
  WalkthroughsPanel,
  type WalkthroughsPanelProps,
} from './WalkthroughsPanel';
import type { SubsystemWalkthrough } from './model';
import { buildStepBrief } from './walkthroughBrief';

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


const walkthroughs: SubsystemWalkthrough[] = [
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

const writeText = mock(() => Promise.resolve());

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

afterEach(cleanup);

function renderPanel(overrides: Partial<WalkthroughsPanelProps> = {}) {
  const props: WalkthroughsPanelProps = {
    walkthroughs,
    expandedWalkthroughs: new Set(['auth-flow']),
    focusedWalkthroughId: null,
    focusedStepIndex: null,
    hoveredWalkthroughStep: null,
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
      <WalkthroughsPanel {...props} />
    </ThemeProvider>,
  );
}

const COPY_LABEL = 'Copy step 1 of Auth flow for an agent';

describe('WalkthroughsPanel step copy', () => {
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
    expect(writeText).toHaveBeenCalledWith(buildStepBrief(walkthroughs[0]!, 0));
    expect(copy.getAttribute('title')).toBe('Copied');
  });

  test('hovering the row still focuses the step on click', () => {
    const onFocusStep = mock(() => {});
    const { getByText } = renderPanel({ onFocusStep });
    const row = getByText('Login.submit').closest('button')!;
    fireEvent.mouseEnter(row);
    fireEvent.click(row);
    expect(onFocusStep).toHaveBeenCalledWith(walkthroughs[0]!, 0);
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
