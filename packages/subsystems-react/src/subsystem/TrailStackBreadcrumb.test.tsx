import { afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import type { SubsystemTrail } from './model';
import { TrailStackBreadcrumb } from './TrailStackBreadcrumb';

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
globals.getComputedStyle = dom.getComputedStyle.bind(dom);
globals.requestAnimationFrame = dom.requestAnimationFrame.bind(dom);
globals.cancelAnimationFrame = dom.cancelAnimationFrame.bind(dom);
globals.localStorage = dom.localStorage;
globals.sessionStorage = dom.sessionStorage;
globals.matchMedia = dom.matchMedia.bind(dom);
globals.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

const trail: SubsystemTrail = {
  id: 't',
  title: 'T',
  steps: [
    {
      from: 'panel',
      to: 'rpc',
      mechanism: 'calls',
      file: 'src/panel.ts',
      purl: 'pkg:github/acme/app#src/panel.ts',
      symbol: 'MaintenancePanel',
      target: {
        purl: 'pkg:github/acme/app#src/rpc.ts',
        file: 'src/rpc.ts',
        symbol: 'getRpc',
      },
    },
    {
      from: 'rpc',
      to: 'detail',
      mechanism: 'calls',
      file: 'src/rpc.ts',
      purl: 'pkg:github/acme/app#src/rpc.ts',
      symbol: 'getRpc',
      target: {
        purl: 'pkg:github/acme/app#src/detail.ts',
        file: 'src/detail.ts',
        symbol: 'modelDetail',
      },
    },
    {
      from: 'panel',
      to: 'merge',
      mechanism: 'uses',
      file: 'src/list.tsx',
      purl: 'pkg:github/acme/app#src/list.tsx',
      symbol: 'ModelList',
    },
  ],
};

function renderBreadcrumb(stepIndex: number, onFocusStep?: (i: number) => void) {
  return render(
    <ThemeProvider theme={defaultEditorTheme}>
      <TrailStackBreadcrumb
        trail={trail}
        stepIndex={stepIndex}
        onFocusStep={onFocusStep}
      />
    </ThemeProvider>,
  );
}

describe('TrailStackBreadcrumb', () => {
  test('renders the call chain and the callee', () => {
    const { getByText } = renderBreadcrumb(1);
    expect(getByText('MaintenancePanel')).toBeTruthy();
    expect(getByText('getRpc')).toBeTruthy();
    expect(getByText('modelDetail')).toBeTruthy();
  });

  test('clicking a frame focuses that step', () => {
    let focused: number | null = null;
    const { getByText } = renderBreadcrumb(1, (i) => {
      focused = i;
    });
    fireEvent.click(getByText('MaintenancePanel'));
    expect(focused).toBe(0);
  });

  test('a uses step is an annotation, not a fourth frame', () => {
    const { getByText, queryByText } = renderBreadcrumb(2);
    expect(getByText('Context')).toBeTruthy();
    expect(getByText('uses merge')).toBeTruthy();
    // The uses step's site symbol is not rendered as a frame.
    expect(queryByText('ModelList')).toBeNull();
  });
});
