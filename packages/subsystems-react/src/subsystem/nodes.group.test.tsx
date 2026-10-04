import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { Window } from 'happy-dom';
import { cleanup, render } from '@testing-library/react/pure';
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
  return render(
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
