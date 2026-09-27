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
