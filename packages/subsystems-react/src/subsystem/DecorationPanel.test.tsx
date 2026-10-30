import { afterEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render, within } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { DecorationHeader, DecorationPanel, type DecorationPanelProps } from './DecorationPanel';
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
    const { getByText, getAllByText, container } = renderPanel();
    expect(container.textContent).toContain('reading path');
    expect(getAllByText('desktop-app')).toHaveLength(2);
    expect(getByText('sync-service')).not.toBeNull();
    expect(getByText('Save drawing')).not.toBeNull();
    expect(getByText('Persist file')).not.toBeNull();
    expect(getByText('Planned sync')).not.toBeNull();
    expect(getByText('draft')).not.toBeNull();
    expect(getByText('SyncAgent')).not.toBeNull();
    expect(getByText('+ 1 draft edge')).not.toBeNull();
  });

  test('shows proposed flows and draft structure before context trails', () => {
    const onSelectTrail = mock(() => {});
    const { getByRole, container } = renderPanel({ onSelectTrail });
    const proposed = getByRole('region', { name: 'Proposed flows' });
    const context = getByRole('region', { name: 'Context trails' });
    expect(within(proposed).getByText('Proposed flows · 1')).not.toBeNull();
    expect(within(proposed).getByText('Planned sync')).not.toBeNull();
    expect(within(proposed).queryByText('Save drawing')).toBeNull();
    expect(within(context).getByText('Context trails · 2')).not.toBeNull();
    expect(within(context).getByText('Save drawing')).not.toBeNull();
    expect(within(context).getByText('Persist file')).not.toBeNull();
    expect(within(context).queryByText('Planned sync')).toBeNull();
    const text = container.textContent!;
    expect(text.indexOf('Proposed flows')).toBeLessThan(text.indexOf('Draft structure'));
    expect(text.indexOf('Draft structure')).toBeLessThan(text.indexOf('Context trails'));
    fireEvent.click(within(proposed).getByText('Planned sync'));
    expect(onSelectTrail).toHaveBeenCalledWith(decoration.trails[2]);
  });

  test('omits the proposed section for a context-only decoration', () => {
    const { queryByRole, getByRole } = renderPanel({
      decoration: { ...decoration, trails: decoration.trails.filter((ref) => ref.kind === 'base') },
    });
    expect(queryByRole('region', { name: 'Proposed flows' })).toBeNull();
    expect(getByRole('region', { name: 'Context trails' })).not.toBeNull();
  });

  test('omits the context section for a draft-only decoration', () => {
    const { queryByRole, getByRole } = renderPanel({
      decoration: { ...decoration, trails: decoration.trails.filter((ref) => ref.kind === 'draft') },
    });
    expect(getByRole('region', { name: 'Proposed flows' })).not.toBeNull();
    expect(queryByRole('region', { name: 'Context trails' })).toBeNull();
  });

  test('omits both trail sections when there are no trails', () => {
    const { queryByRole } = renderPanel({ decoration: { ...decoration, trails: [] } });
    expect(queryByRole('region', { name: 'Proposed flows' })).toBeNull();
    expect(queryByRole('region', { name: 'Context trails' })).toBeNull();
  });

  test('the toggle reports the next active state', () => {
    const onToggleActive = mock(() => {});
    const { getByLabelText } = renderPanel({ onToggleActive });
    fireEvent.click(getByLabelText('Turn decoration off'));
    expect(onToggleActive).toHaveBeenCalledWith(false);
  });

  test('can omit the panel header when the host provides a full-width header', () => {
    const { queryByRole, queryByLabelText, getByText } = renderPanel({ hideHeader: true });
    expect(queryByRole('heading', { name: decoration.title })).toBeNull();
    expect(queryByLabelText('Turn decoration off')).toBeNull();
    expect(getByText('Save drawing')).not.toBeNull();
  });

  test('the standalone header renders actions and toggles the decoration', () => {
    const onToggleActive = mock(() => {});
    const { getByRole, getByLabelText, getByText } = render(
      <ThemeProvider theme={defaultEditorTheme}>
        <DecorationHeader
          decoration={decoration}
          active={false}
          onToggleActive={onToggleActive}
          actions={<span>Base architecture only</span>}
        />
      </ThemeProvider>,
    );
    expect(getByRole('heading', { name: decoration.title })).not.toBeNull();
    expect(getByText('Base architecture only')).not.toBeNull();
    fireEvent.click(getByLabelText('Turn decoration on'));
    expect(onToggleActive).toHaveBeenCalledWith(true);
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

  test('styles the selected class or C4 row and clears the previous selection', () => {
    const withC4: SubsystemDecoration = {
      ...decoration,
      draft: {
        ...decoration.draft,
        c4: {
          elements: [{
            kind: 'component', id: 'component:sync', label: 'Sync coordinator',
            container: 'container:desktop', technology: 'TypeScript', members: ['sync-agent'],
          }],
        },
      },
    };
    const panel = (selectedDraftItem: DecorationPanelProps['selectedDraftItem']) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <DecorationPanel
          decoration={withC4}
          active
          onToggleActive={() => {}}
          selectedDraftItem={selectedDraftItem}
        />
      </ThemeProvider>
    );
    const { getByText, container, rerender } = render(panel(null));
    const classRow = getByText('SyncAgent').closest('button')!;
    const c4Row = getByText('Sync coordinator').closest('button')!;
    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(0);

    rerender(panel({ kind: 'component', alias: 'sync-agent' }));
    expect(classRow.getAttribute('aria-current')).toBe('true');
    expect(classRow.style.background).not.toBe('');
    expect(classRow.style.boxShadow).toBe('');
    expect(classRow.classList.contains('subsystem-decoration-draft-row')).toBe(true);
    expect(c4Row.getAttribute('aria-current')).toBeNull();

    rerender(panel({ kind: 'c4', id: 'component:sync' }));
    expect(c4Row.getAttribute('aria-current')).toBe('true');
    expect(c4Row.style.background).not.toBe('');
    expect(c4Row.style.boxShadow).toBe('');
    expect(c4Row.classList.contains('subsystem-decoration-draft-row')).toBe(true);
    expect(classRow.getAttribute('aria-current')).toBeNull();
    expect(classRow.style.background).toBe('');
    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(1);

    rerender(panel(null));
    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(0);
    expect(c4Row.style.background).toBe('');
  });

  test('renders and selects C4-only draft structure', () => {
    const element = {
      kind: 'container' as const, id: 'container:worker', label: 'Background sync',
      containerKind: 'application' as const, technology: 'Bun', process: 'sync-worker',
    };
    const onSelectDraftC4Element = mock(() => {});
    const { getByText, getByRole } = renderPanel({
      decoration: {
        ...decoration,
        draft: {
          c4: {
            elements: [element],
            edges: [{
              id: 'draft:dispatch', source: 'container:desktop', target: element.id,
              label: 'Dispatches upload', mechanisms: ['calls'], count: 1,
            }],
          },
        },
      },
      onSelectDraftC4Element,
    });
    expect(getByText('Draft structure · not verified')).not.toBeNull();
    expect(getByText('C4 container')).not.toBeNull();
    const relationships = getByRole('list', { name: 'Draft C4 relationships' });
    expect(within(relationships).getAllByRole('listitem')).toHaveLength(1);
    expect(within(relationships).getByText('Dispatches upload')).not.toBeNull();
    expect(within(relationships).getByText('container:desktop → Background sync')).not.toBeNull();
    fireEvent.click(getByText('Background sync'));
    expect(onSelectDraftC4Element).toHaveBeenCalledWith(element);
  });

  test('enumerates relationships in authored order with resolved endpoints and id fallbacks', () => {
    const { getByRole } = renderPanel({
      decoration: {
        ...decoration,
        draft: {
          c4: {
            elements: [{
              kind: 'component', id: 'component:sync', label: 'Sync coordinator',
              container: 'container:desktop', technology: 'TypeScript',
            }],
            edges: [
              { id: 'enqueue', source: 'component:save', target: 'component:sync', label: 'Queues drawing', mechanisms: ['produces'], count: 1 },
              { id: 'dispatch', source: 'component:sync', target: 'container:worker', label: 'Dispatches upload', mechanisms: ['calls'], count: 1 },
              { id: 'upload', source: 'container:worker', target: 'component:persist', label: 'Uploads drawing', mechanisms: ['calls'], count: 1 },
            ],
          },
        },
      },
      c4ElementLabels: new Map([
        ['component:save', 'Drawing save'],
        ['container:worker', 'Background worker'],
      ]),
    });
    const items = within(getByRole('list', { name: 'Draft C4 relationships' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.map((item) => within(item).getByRole('button').firstElementChild?.textContent))
      .toEqual(['Queues drawing', 'Dispatches upload', 'Uploads drawing']);
    expect(within(items[0]!).getByText('Drawing save → Sync coordinator')).not.toBeNull();
    expect(within(items[1]!).getByText('Sync coordinator → Background worker')).not.toBeNull();
    expect(within(items[2]!).getByText('Background worker → component:persist')).not.toBeNull();
  });

  test('relationship buttons report clicks and share the selected and hover row styles', () => {
    const edges = [
      { id: 'enqueue', source: 'component:save', target: 'component:sync', label: 'Queues drawing', mechanisms: ['produces'], count: 1 },
      { id: 'dispatch', source: 'component:sync', target: 'container:worker', label: 'Dispatches upload', mechanisms: ['calls'], count: 1 },
    ];
    const onSelectDraftC4Edge = mock(() => {});
    const withEdges: SubsystemDecoration = {
      ...decoration,
      draft: { ...decoration.draft, c4: { edges } },
    };
    const panel = (selectedDraftItem: DecorationPanelProps['selectedDraftItem']) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <DecorationPanel
          decoration={withEdges}
          active
          onToggleActive={() => {}}
          onSelectDraftC4Edge={onSelectDraftC4Edge}
          selectedDraftItem={selectedDraftItem}
        />
      </ThemeProvider>
    );
    const { getByRole, container, rerender } = render(panel(null));
    const rows = within(getByRole('list', { name: 'Draft C4 relationships' })).getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.classList.contains('subsystem-decoration-draft-row')).toBe(true);
    expect(rows[0]!.style.cursor).toBe('pointer');
    fireEvent.click(rows[0]!);
    expect(onSelectDraftC4Edge).toHaveBeenCalledWith(edges[0]);

    rerender(panel({ kind: 'c4-edge', id: 'enqueue' }));
    expect(rows[0]!.getAttribute('aria-current')).toBe('true');
    expect(rows[0]!.style.background).not.toBe('');
    expect(rows[0]!.style.boxShadow).toBe('');
    expect(rows[1]!.getAttribute('aria-current')).toBeNull();

    rerender(panel({ kind: 'c4-edge', id: 'dispatch' }));
    expect(rows[0]!.getAttribute('aria-current')).toBeNull();
    expect(rows[0]!.style.background).toBe('');
    expect(rows[1]!.getAttribute('aria-current')).toBe('true');
    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(1);

    rerender(panel(null));
    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(0);
    expect(rows[1]!.style.background).toBe('');
  });
});
