import { afterEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { DecorationPanel, type DecorationPanelProps } from './DecorationPanel';
import { decorationTrailKey, type SubsystemDecoration } from './decoration';

// Same DOM shim as TrailsPanel.test: happy-dom lacks ResizeObserver, which
// themed-markdown uses to measure its slide container.
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
globals.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

const decoration: SubsystemDecoration = {
  version: 1,
  id: 'dec-sync',
  title: 'Local-first sync',
  description: 'A **reading path** for the save flow.',
  trails: [
    { kind: 'base', modelId: 'sg-desktop', trailId: 'tl-save' },
    { kind: 'base', modelId: 'sg-server', trailId: 'tl-persist' },
    {
      kind: 'draft',
      modelId: 'sg-desktop',
      trail: { id: 'tl-planned', title: 'Planned sync', steps: [] },
    },
  ],
  draft: {
    components: [
      { alias: 'sync-agent', name: 'SyncAgent', construct: 'class' },
    ],
    edges: [{ from: 'tab', to: 'sync-agent', mechanism: 'produces' }],
  },
  provenance: { source: 'author', at: '2026-10-20T00:00:00.000Z' },
};

const resolveTrail: NonNullable<DecorationPanelProps['resolveTrail']> = (ref) => {
  if (ref.kind === 'draft') return undefined;
  const key = decorationTrailKey(ref);
  if (key === 'sg-desktop:tl-save') return { title: 'Save drawing', stepCount: 4 };
  if (key === 'sg-server:tl-persist') return { title: 'Persist file', stepCount: 5 };
  return undefined;
};

function renderPanel(overrides: Partial<DecorationPanelProps> = {}) {
  const props: DecorationPanelProps = {
    decoration,
    active: true,
    onToggleActive: () => {},
    resolveTrail,
    modelLabels: new Map([
      ['sg-desktop', 'desktop-app'],
      ['sg-server', 'sync-service'],
    ]),
    ...overrides,
  };
  return render(
    <ThemeProvider theme={defaultEditorTheme}>
      <DecorationPanel {...props} />
    </ThemeProvider>,
  );
}

describe('DecorationPanel', () => {
  test('renders the description, grouped trails, and draft structure', () => {
    const { getByText, container } = renderPanel();
    expect(container.textContent).toContain('reading path');
    expect(getByText('desktop-app')).not.toBeNull();
    expect(getByText('sync-service')).not.toBeNull();
    expect(getByText('Save drawing')).not.toBeNull();
    expect(getByText('Persist file')).not.toBeNull();
    expect(getByText('Planned sync')).not.toBeNull();
    expect(getByText('draft')).not.toBeNull();
    expect(getByText('SyncAgent')).not.toBeNull();
    expect(getByText('+ 1 draft edge')).not.toBeNull();
  });

  test('the toggle reports the next active state', () => {
    const onToggleActive = mock(() => {});
    const { getByLabelText } = renderPanel({ onToggleActive });
    fireEvent.click(getByLabelText('Turn decoration off'));
    expect(onToggleActive).toHaveBeenCalledWith(false);
  });

  test('selecting a trail hands the ref back to the host', () => {
    const onSelectTrail = mock(() => {});
    const { getByText } = renderPanel({ onSelectTrail });
    fireEvent.click(getByText('Save drawing'));
    expect(onSelectTrail).toHaveBeenCalledWith({
      kind: 'base',
      modelId: 'sg-desktop',
      trailId: 'tl-save',
    });
  });

  test('selecting a draft component hands the component back', () => {
    const onSelectDraftComponent = mock(() => {});
    const { getByText } = renderPanel({ onSelectDraftComponent });
    fireEvent.click(getByText('SyncAgent'));
    expect(onSelectDraftComponent).toHaveBeenCalledWith({
      alias: 'sync-agent',
      name: 'SyncAgent',
      construct: 'class',
    });
  });
});
