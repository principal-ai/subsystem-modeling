import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render } from '@testing-library/react/pure';
import { ReactFlowProvider } from '@xyflow/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemGroupNode } from './nodes';

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

const region = {
  kind: 'process' as const,
  key: 'booking-web/server',
  label: 'booking-web/server',
  memberAliases: ['a', 'b'],
};

function renderGroup(data: Record<string, unknown>) {
  // A collapsed card mounts React Flow handles, which need the flow store.
  return render(
    createElement(
      ReactFlowProvider,
      null,
      createElement(
        ThemeProvider,
        { theme: defaultEditorTheme },
        createElement(SubsystemGroupNode as never, {
          data,
          width: 200,
          height: 120,
          selected: false,
        } as never),
      ),
    ),
  );
}

describe('SubsystemGroupNode frame color', () => {
  test('an explicit data.color overrides the derived color', () => {
    const { container } = renderGroup({ region, color: '#d9a441' });
    const frame = container.querySelector('div') as HTMLElement;
    expect(frame.style.border).toContain('#d9a441');
  });

  test('a region without an override falls back to the derived color', () => {
    // booking-web/client hashes to palette slot 2 (#ff6b35) under packageColor.
    const { container } = renderGroup({
      region: { ...region, key: 'booking-web/client' },
    });
    const frame = container.querySelector('div') as HTMLElement;
    expect(frame.style.border).toContain('#ff6b35');
  });
});

describe('SubsystemGroupNode chrome', () => {
  // A process or package is a container in the C4 sense, so it draws as a
  // container card: filled body, header rows. Runtime chrome (a plain process)
  // is solid with a slight radius; a process the host marked `chrome: 'package'`
  // groups code organisation — a library, an area, a proposal — and draws as a
  // package boundary: rounded, dashed.
  test('a plain process region wears runtime chrome', () => {
    const { container } = renderGroup({ region });
    const frame = container.querySelector('div') as HTMLElement;
    expect(frame.style.border).toContain('solid');
    expect(frame.style.borderRadius).toBe('4px');
    expect(frame.style.background).not.toBe('transparent');
  });

  test("chrome: 'package' draws the frame as a code boundary", () => {
    const { container } = renderGroup({
      region: { ...region, chrome: 'package' },
    });
    const frame = container.querySelector('div') as HTMLElement;
    expect(frame.style.border).toContain('dashed');
    expect(frame.style.borderRadius).toBe('12px');
  });

  test('chrome does not change the region identity the frame renders', () => {
    const { container } = renderGroup({
      region: { ...region, chrome: 'package' },
    });
    // The header still reads the label — kind is chrome's business alone.
    expect(container.textContent).toContain('booking-web/server');
  });

  test('a module region keeps the bare dashed frame and path badge', () => {
    const { container } = renderGroup({
      region: {
        kind: 'module',
        key: 'src/bun/index.ts',
        label: 'src/bun/index.ts',
        memberAliases: ['a', 'b'],
      },
    });
    const frame = container.querySelector('div') as HTMLElement;
    expect(frame.style.border).toContain('dashed');
    expect(frame.style.background).toBe('transparent');
    // The badge may collapse a long path to `first/…/last` at this width.
    expect(container.textContent).toContain('index.ts');
  });
});

describe('SubsystemGroupNode card header', () => {
  // The header is the C4 container card's: label, kind glyph, technology row
  // with the member count. A frame with no stated technology falls back to its
  // kind so the row is never blank.
  test('a process header carries the member count and the application glyph', () => {
    const { container } = renderGroup({ region });
    expect(container.textContent).toContain('2');
    expect(container.querySelector('.lucide-app-window')).not.toBeNull();
    expect(container.textContent).toContain('application');
  });

  test('a data-store process wears the database glyph', () => {
    const { container } = renderGroup({ region: { ...region, containerKind: 'data-store' } });
    expect(container.querySelector('.lucide-database')).not.toBeNull();
    expect(container.querySelector('.lucide-app-window')).toBeNull();
  });

  test('a stated technology fills the technology row and colours the frame', () => {
    const { container } = renderGroup({ region: { ...region, technology: 'Bun' } });
    expect(container.textContent).toContain('Bun');
    const frame = container.querySelector('div') as HTMLElement;
    // Bun's brand hue, not the key hash.
    expect(frame.style.border).toContain('#fbf0df');
    // The official mark rides the row.
    expect(container.querySelector('[aria-label="Bun"]')).not.toBeNull();
  });

  test('an unknown technology keeps the hashed frame colour', () => {
    const { container } = renderGroup({
      region: { ...region, key: 'booking-web/client', technology: 'COBOL' },
    });
    const frame = container.querySelector('div') as HTMLElement;
    expect(frame.style.border).toContain('#ff6b35');
    expect(container.textContent).toContain('COBOL');
  });

  test('an explicit data.color still beats the technology hue', () => {
    const { container } = renderGroup({ region: { ...region, technology: 'Bun' }, color: '#d9a441' });
    const frame = container.querySelector('div') as HTMLElement;
    expect(frame.style.border).toContain('#d9a441');
  });

  test('a package header falls back to "package" and wears the glyph', () => {
    const { container } = renderGroup({
      region: {
        kind: 'package',
        key: 'pkg:github/acme/app',
        label: 'acme/app',
        memberAliases: ['a', 'b', 'c'],
      },
    });
    expect(container.textContent).toContain('package');
    expect(container.textContent).toContain('3');
    expect(container.querySelector('.lucide-package')).not.toBeNull();
  });
});
describe('SubsystemGroupNode package glyph', () => {
  // A frame that renders as a package boundary wears the Package glyph: a
  // real package (purl repo identity) or a process claim the host demoted to
  // package chrome. Module/directory/plain-process frames stay text-only —
  // the glyph is what tells the shared dashed chrome "code organisation, not
  // a deployment unit".
  test('a package-kind region wears the glyph', () => {
    const { container } = renderGroup({
      region: {
        kind: 'package',
        key: 'pkg:github/acme/app',
        label: 'acme/app',
        memberAliases: ['a', 'b'],
      },
    });
    expect(container.querySelector('.lucide-package')).not.toBeNull();
  });

  test("a process region demoted to package chrome wears the glyph", () => {
    const { container } = renderGroup({
      region: { ...region, chrome: 'package' },
    });
    expect(container.querySelector('.lucide-package')).not.toBeNull();
  });

  test('plain process, module, and directory regions carry no glyph', () => {
    expect(renderGroup({ region }).container.querySelector('.lucide-package')).toBeNull();
    expect(
      renderGroup({
        region: {
          kind: 'module',
          key: 'src/bun/index.ts',
          label: 'src/bun/index.ts',
          memberAliases: ['a', 'b'],
        },
      }).container.querySelector('.lucide-package'),
    ).toBeNull();
    expect(
      renderGroup({
        region: {
          kind: 'directory',
          key: 'src/bun',
          label: 'src/bun',
          memberAliases: ['a', 'b'],
        },
      }).container.querySelector('.lucide-package'),
    ).toBeNull();
  });
});

describe('SubsystemGroupNode boundary badge', () => {
  // A boundary finding is a property of the region's shape, so it badges the
  // frame with its own icon rather than borrowing the verification-rung chips
  // that leaf constructs wear.
  const moduleRegion = {
    kind: 'module' as const,
    key: 'src/bun/index.ts',
    label: 'src/bun/index.ts',
    memberAliases: ['a', 'b', 'c'],
  };

  test('a boundary finding badges the frame with its own icon', () => {
    const { container } = renderGroup({
      region: moduleRegion,
      issue: {
        severity: 'info',
        kind: 'boundary_process_nest_disagree',
        count: 1,
      },
    });
    // The chip is aria-hidden and inert; its lucide icon carries the class.
    expect(container.querySelector('.lucide-split')).not.toBeNull();
  });

  test('a finding with no dedicated frame icon is not badged', () => {
    // `construct_unconfirmed` belongs on a leaf node, not the frame — badging
    // the region with it would imply the region is at fault.
    const { container } = renderGroup({
      region: moduleRegion,
      issue: { severity: 'error', kind: 'construct_unconfirmed', count: 1 },
    });
    expect(container.querySelector('svg')).toBeNull();
  });

  test('a region with no findings renders no chip', () => {
    const { container } = renderGroup({ region: moduleRegion });
    expect(container.querySelector('svg')).toBeNull();
  });

  test('the chip shows a count when the region has more than one finding', () => {
    const { container } = renderGroup({
      region: moduleRegion,
      issue: {
        severity: 'error',
        kind: 'boundary_process_nest_disagree',
        count: 3,
      },
    });
    expect(container.textContent).toContain('3');
  });

  test('a process verification finding badges the process frame too', () => {
    // Dynamic-topology findings target kind `process`; the frame badge is the
    // same mechanism as a module finding — the boundary's state is the fault.
    const { container } = renderGroup({
      region,
      issue: {
        severity: 'info',
        kind: 'boundary_process_unassigned',
        count: 1,
      },
    });
    // The kind has a dedicated frame icon, so the lucide icon carries the class.
    expect(container.querySelector('.lucide-circle-ellipsis')).not.toBeNull();
  });
});

describe('SubsystemGroupNode collapse toggle', () => {
  test('no toggle without a callback', () => {
    const { container } = renderGroup({ region });
    expect(container.querySelector('button')).toBeNull();
  });

  test('open frame offers "Hide members" and fires the toggle', () => {
    let toggled = 0;
    const { container } = renderGroup({ region, onToggleCollapse: () => { toggled += 1; } });
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('Hide members');
    expect(btn.className).toContain('nodrag');
    fireEvent.click(btn);
    expect(toggled).toBe(1);
  });

  test('collapsed card offers "Show members" and grows handles for its lines', () => {
    const { container } = renderGroup({ region, collapsed: true, onToggleCollapse: () => {} });
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('Show members');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('.react-flow__handle').length).toBe(2);
    expect(container.querySelector('.lucide-maximize-2')).not.toBeNull();
  });

  test('an open card has no handles — its members carry the lines', () => {
    const { container } = renderGroup({ region });
    expect(container.querySelectorAll('.react-flow__handle').length).toBe(0);
  });
});
