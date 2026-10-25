import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph, type SubsystemComponentGraphProps } from './SubsystemComponentGraph';

const components: SubsystemComponentGraphProps['components'] = [
  { alias: 'entry', name: 'Entry', construct: 'function', file: 'src/entry.ts', purl: 'pkg:github/test/app' },
  { alias: 'store', name: 'Store', construct: 'function', file: 'src/store.ts', purl: 'pkg:github/test/app' },
];
const trails: SubsystemComponentGraphProps['trails'] = [{
  id: 'request',
  title: 'Request flow',
  steps: [{ from: 'entry', to: 'store', mechanism: 'calls', file: 'src/entry.ts', purl: 'pkg:github/test/app', symbol: 'Entry' }],
}];
const graphifyRelations: SubsystemComponentGraphProps['graphifyRelations'] = [
  { id: 'static', from: 'entry', to: 'store', relation: 'references' },
];

function renderGraph(props: Partial<SubsystemComponentGraphProps> = {}) {
  const markup = renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme: defaultEditorTheme },
      createElement(SubsystemComponentGraph, {
        components,
        trails,
        title: 'Request subsystem',
        description: 'Always visible **description**.',
        ...props,
      }),
    ),
  );
  const dom = new Window();
  dom.document.body.innerHTML = markup;
  return dom.document.body;
}

describe('subsystem graph sidebar', () => {
  test('puts the name in a full-width header above the sidebar and graph', () => {
    const body = renderGraph();
    const header = body.querySelector('header');
    expect(header?.querySelector('h2')?.textContent).toBe('Request subsystem');
    expect(body.querySelectorAll('h2').length).toBe(1);
    expect(header?.textContent).not.toContain('Always visible');
    const content = header?.nextElementSibling;
    expect(content?.querySelector('[aria-label="Resize sidebar"]')).not.toBeNull();
    expect(content?.textContent).toContain('Always visible description.');
    expect(content?.textContent).not.toContain('Request subsystem');
  });

  test('truncates the description without scrolling and offers the full description', () => {
    const body = renderGraph();
    const description = body.querySelector('[style*="-webkit-line-clamp:6"]') as HTMLElement;
    expect(description).not.toBeNull();
    expect(description.textContent).toContain('Always visible description.');
    expect(description.style.overflow).toBe('hidden');
    expect(description.style.maxHeight).toBe('9em');
    const more = body.querySelector('button[aria-label="Read full description"]');
    expect(more?.textContent).toBe('More');
    expect(more?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(more?.getAttribute('aria-expanded')).toBe('false');
    expect(body.querySelector('[role="dialog"]')).toBeNull();
    expect(body.querySelector('[style*="max-height:30%"]')).toBeNull();
  });

  test('keeps the Files button in the header when no name is provided', () => {
    const body = renderGraph({ title: undefined });
    expect(body.querySelector('header h2')).toBeNull();
    expect(body.querySelector('header button[aria-label^="Files"]')?.textContent).toBe('Files2');
    expect(body.textContent).toContain('Always visible description.');
  });

  test('the header Files button starts inactive and leaves trails visible', () => {
    const body = renderGraph();
    expect(body.querySelector('header button[aria-label^="Files"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(body.textContent).toContain('Request flow');
    expect(body.querySelector('[role="tree"]')).toBeNull();
  });

  test('groups Trails, Files, and Issues into one switch with Trails selected by default', () => {
    const body = renderGraph({ diagnostic: { status: 'issues', issueCount: 1 } });
    const group = body.querySelector('header [role="group"][aria-label="Sidebar view"]');
    expect(group?.querySelectorAll('button').length).toBe(3);
    expect(group?.querySelectorAll('button[aria-pressed="true"]').length).toBe(1);
    expect(group?.querySelector('button[aria-label^="Trails"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(group?.querySelector('button[aria-label^="Trails"]')?.textContent).toBe('Trails1');
    expect(group?.querySelector('button[aria-label^="Issues:"]')?.textContent).toBe('Issues1');
    expect((group as HTMLElement).style.borderStyle).toBe('solid');
    expect((group as HTMLElement).style.gridAutoColumns).toBe('1fr');
    for (const button of group!.querySelectorAll('button')) {
      expect((button as HTMLElement).style.paddingLeft).toBe('16px');
      expect((button as HTMLElement).style.paddingRight).toBe('16px');
      expect((button.lastElementChild as HTMLElement).style.marginLeft).toBe('4px');
    }
  });

  for (const count of [0, 1, 3]) {
    test(`shows ${count} in the plural Trails option`, () => {
      const body = renderGraph({
        trails: Array.from({ length: count }, (_, index) => ({ ...trails![0], id: `trail-${index}` })),
        graphifyRelations,
      });
      const button = body.querySelector('header button[aria-label^="Trails"]');
      expect(button?.textContent).toBe(`Trails${count}`);
      expect(button?.getAttribute('aria-label')).toBe(`Trails (${count} ${count === 1 ? 'trail' : 'trails'})`);
    });
  }

  for (const props of [
    {},
    { diagnostic: { status: 'ok' as const, issueCount: 0 } },
    { issues: [], diagnostic: { status: 'issues' as const, issueCount: 3 } },
    { issues: [], showIssues: true },
  ]) {
    test(`hides Issues and keeps Trails active for an empty scope: ${JSON.stringify(props)}`, () => {
      const body = renderGraph(props);
      const group = body.querySelector('header [aria-label="Sidebar view"]');
      expect(group?.querySelectorAll('button').length).toBe(2);
      expect(group?.querySelector('button[aria-label^="Issues:"]')).toBeNull();
      expect(group?.querySelector('button[aria-label^="Trails"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(body.textContent).toContain('Request flow');
      expect((group as HTMLElement).style.gridAutoColumns).toBe('1fr');
    });
  }

  test('omits the Files button when no components have files', () => {
    const body = renderGraph({
      components: components.map((component) => ({ ...component, file: '' })),
    });
    expect(body.querySelector('button[aria-label^="Files"]')).toBeNull();
    expect(body.textContent).toContain('Request flow');
  });

  for (const active of [true, false]) {
    test(`puts the ${active ? 'active' : 'inactive'} issue toggle in the header, not the sidebar`, () => {
      const body = renderGraph({
        diagnostic: { status: 'issues', issueCount: 3 },
        showIssues: active,
      });
      const header = body.querySelector('header');
      const toggle = header?.querySelector('button[aria-label^="Issues:"]');
      expect(toggle).not.toBeNull();
      expect(toggle?.textContent).toBe('Issues3');
      expect((toggle as HTMLElement).style.borderStyle).toBe('none');
      const filesButton = header?.querySelector('button[aria-label^="Files"]') as HTMLElement;
      expect(filesButton.style.borderStyle).toBe('none');
      expect(filesButton.parentElement?.style.borderStyle).toBe('solid');
      expect(filesButton.parentElement?.style.display).toBe('grid');
      expect(filesButton.parentElement?.style.gridAutoColumns).toBe('1fr');
      expect((toggle as HTMLElement).style.justifyContent).toBe('center');
      expect(toggle?.getAttribute('aria-pressed')).toBe(String(active));
      expect(header?.querySelectorAll('button').length).toBe(3);
      expect(header?.querySelectorAll('button[aria-pressed="true"]').length).toBe(1);
      expect(header?.querySelector('button[aria-label^="Trails"]')?.getAttribute('aria-pressed')).toBe(String(!active));
      expect(body.querySelectorAll('button[aria-label^="Issues:"]').length).toBe(1);
      expect(header?.nextElementSibling?.querySelector('button[aria-label^="Issues:"]')).toBeNull();
      expect(body.textContent).toContain('Always visible description.');
    });
  }

  test('counts unique files rather than components in the same file', () => {
    const body = renderGraph({
      components: [...components, { ...components[0], alias: 'helper' }],
    });
    expect(body.querySelector('header button[aria-label^="Files"]')?.textContent).toBe('Files2');
  });

  test('counts the same path in separate repositories as separate files', () => {
    const body = renderGraph({
      components: [...components, { ...components[0], alias: 'other-entry', purl: 'pkg:github/test/other' }],
    });
    expect(body.querySelector('header button[aria-label^="Files"]')?.textContent).toBe('Files3');
  });

  test('a diagnostic alone creates a header without an empty sidebar', () => {
    const body = renderGraph({
      trails: undefined,
      graphifyRelations,
      title: undefined,
      description: undefined,
      diagnostic: { status: 'ok' },
    });
    expect(body.querySelector('header button[aria-pressed="false"]')).not.toBeNull();
    expect(body.querySelector('[aria-label="Resize sidebar"]')).toBeNull();
  });

  test('a name alone creates a header without an empty sidebar', () => {
    const body = renderGraph({ trails: undefined, graphifyRelations, description: undefined });
    expect(body.querySelector('header h2')?.textContent).toBe('Request subsystem');
    expect(body.querySelector('[aria-label="Resize sidebar"]')).toBeNull();
  });

  test('shows the description immediately without a description toggle', () => {
    const body = renderGraph();
    expect(body.textContent).toContain('Always visible description.');
    expect(body.querySelector('strong')?.textContent).toBe('description');
    expect(body.querySelector('[aria-label="Show description"]')).toBeNull();
    expect(body.querySelector('[aria-label="Hide description"]')).toBeNull();
    expect(body.textContent).toContain('Request flow');
    expect(body.querySelector('[role="tablist"]')).toBeNull();
    expect(body.querySelector('[role="tree"]')).toBeNull();
    expect(body.textContent).not.toContain('src/entry.ts');
  });

  test('still shows trails when an old Files tab selection was saved', () => {
    const previousWindow = globalThis.window;
    const dom = new Window();
    dom.localStorage.setItem('principal.subsystems.viewState.sidebar-test', JSON.stringify({
      sidebarView: 'files',
    }));
    globalThis.window = dom as unknown as typeof window;
    try {
      const body = renderGraph({ persistKey: 'sidebar-test' });
      expect(body.textContent).toContain('Request flow');
      expect(body.querySelector('[role="tree"]')).toBeNull();
      expect(body.querySelector('[role="tablist"]')).toBeNull();
    } finally {
      globalThis.window = previousWindow;
    }
  });

  test('restores a focused trail into drilldown navigation without playback controls', () => {
    const previousWindow = globalThis.window;
    const dom = new Window();
    dom.localStorage.setItem('principal.subsystems.viewState.trail-nav-test', JSON.stringify({
      expandedTrails: ['request'],
      focusedTrailId: 'request',
    }));
    globalThis.window = dom as unknown as typeof window;
    try {
      const body = renderGraph({ persistKey: 'trail-nav-test' });
      expect(body.querySelector('header button[aria-label="Trail"]')?.textContent).toBe('Trail');
      expect(body.querySelector('header button[aria-label^="Trails"]')).toBeNull();
      expect(body.querySelector('[aria-hidden="false"] button[aria-label="Back to trails"]')).not.toBeNull();
      expect(body.querySelector('button[aria-label^="Play "]')).toBeNull();
      expect(body.querySelector('button[aria-label^="Focus layout"]')).toBeNull();
      expect(body.querySelector('[aria-hidden="false"]')?.textContent).toContain('Entry');
    } finally {
      globalThis.window = previousWindow;
    }
  });

  test('keeps the trail header and scoped counts in Issues after graph selection is cleared', () => {
    const previousWindow = globalThis.window;
    const dom = new Window();
    dom.localStorage.setItem('principal.subsystems.viewState.scoped-sidebar-test', JSON.stringify({
      sidebarTrailId: 'request',
      focusedTrailId: null,
    }));
    globalThis.window = dom as unknown as typeof window;
    try {
      const body = renderGraph({
        persistKey: 'scoped-sidebar-test',
        showIssues: true,
        components: [...components, {
          alias: 'other', name: 'Other', construct: 'function', file: 'src/other.ts', purl: 'pkg:github/test/app',
        }],
        issues: [
          { id: 'related', severity: 'error', kind: 'missing_file', message: 'Related finding',
            target: { kind: 'component', id: 'entry', label: 'Entry' } },
          { id: 'unrelated', severity: 'error', kind: 'missing_file', message: 'Unrelated finding',
            target: { kind: 'component', id: 'other', label: 'Other' } },
        ],
        diagnostic: { status: 'issues', issueCount: 2 },
      });
      expect(body.querySelector('[aria-hidden="false"] button[aria-label="Back to trails"]')).not.toBeNull();
      expect(body.querySelector('[aria-hidden="false"]')?.textContent).toContain('Request flow');
      expect(body.querySelector('header button[aria-label^="Files"]')?.textContent).toBe('Files2');
      expect(body.querySelector('header button[aria-label^="Issues:"]')?.textContent).toBe('Issues1');
      expect(body.querySelector('header button[aria-label="Trail"]')?.textContent).toBe('Trail');
      expect(body.querySelector('[aria-hidden="false"]')?.textContent).not.toContain('Unrelated finding');
    } finally {
      globalThis.window = previousWindow;
    }
  });

  test('hides Issues for a selected trail with no findings even when other trails have issues', () => {
    const previousWindow = globalThis.window;
    const dom = new Window();
    dom.localStorage.setItem('principal.subsystems.viewState.empty-trail-issues-test', JSON.stringify({
      sidebarTrailId: 'request',
    }));
    globalThis.window = dom as unknown as typeof window;
    try {
      const body = renderGraph({
        persistKey: 'empty-trail-issues-test',
        showIssues: true,
        issues: [{
          id: 'unrelated', severity: 'error', kind: 'missing_file', message: 'Unrelated finding',
          target: { kind: 'component', id: 'other', label: 'Other' },
        }],
        diagnostic: { status: 'issues', issueCount: 1 },
      });
      expect(body.querySelector('header button[aria-label^="Issues:"]')).toBeNull();
      expect(body.querySelector('header button[aria-label="Trail"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(body.querySelector('[aria-hidden="false"] button[aria-label="Back to trails"]')).not.toBeNull();
      expect(body.querySelector('[aria-hidden="false"]')?.textContent).toContain('Entry');
    } finally {
      globalThis.window = previousWindow;
    }
  });

  test('static graphs keep their description but do not show a file panel', () => {
    const body = renderGraph({ trails: undefined, graphifyRelations });
    expect(body.textContent).toContain('Always visible description.');
    expect(body.querySelector('[aria-label="Resize sidebar"]')).not.toBeNull();
    expect(body.querySelector('[role="tree"]')).toBeNull();
    expect(body.textContent).not.toContain('src/entry.ts');
    expect(body.querySelector('header')?.nextElementSibling?.textContent).not.toContain('Files');
  });

  test('files alone do not create an empty sidebar', () => {
    const body = renderGraph({
      trails: undefined,
      graphifyRelations,
      title: undefined,
      description: undefined,
    });
    expect(body.querySelector('[aria-label="Resize sidebar"]')).toBeNull();
  });

  test('the description stays visible while diagnostics replace the trails', () => {
    const body = renderGraph({ showIssues: true, issues: [{
      id: 'related', severity: 'error', kind: 'missing_file', message: 'Related finding',
      target: { kind: 'component', id: 'entry', label: 'Entry' },
    }] });
    expect(body.textContent).toContain('Always visible description.');
    expect(body.textContent).not.toContain('Request flow');
    expect(body.querySelector('[aria-label="Resize sidebar"]')).not.toBeNull();
    expect(body.querySelector('[aria-label="Hide description"]')).toBeNull();
    expect(body.querySelector('[role="tree"]')).toBeNull();
  });

  test('hideSidebar still hides the title, description, and trails', () => {
    const body = renderGraph({ hideSidebar: true, diagnostic: { status: 'issues', issueCount: 3 } });
    expect(body.textContent).not.toContain('Request subsystem');
    expect(body.textContent).not.toContain('Always visible');
    expect(body.textContent).not.toContain('Request flow');
    expect(body.querySelector('[aria-label="Resize sidebar"]')).toBeNull();
    expect(body.querySelector('header')).toBeNull();
    expect(body.querySelector('button[aria-label^="Diagnostics:"]')).toBeNull();
  });
});
