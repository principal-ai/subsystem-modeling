import { afterEach, describe, expect, test } from 'bun:test';
import type { ComponentProps } from 'react';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render } from '@testing-library/react/pure';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { FileDrawer } from './FileDrawer';

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
globals.KeyboardEvent = dom.KeyboardEvent;
globals.localStorage = dom.localStorage;
globals.sessionStorage = dom.sessionStorage;
globals.matchMedia = dom.matchMedia.bind(dom);
globals.requestAnimationFrame = dom.requestAnimationFrame.bind(dom);
globals.cancelAnimationFrame = dom.cancelAnimationFrame.bind(dom);

afterEach(cleanup);

function drawer(props: Partial<ComponentProps<typeof FileDrawer>> = {}) {
  return (
    <ThemeProvider theme={defaultEditorTheme}>
      <FileDrawer title="Trail code" onClose={() => {}} {...props}>
        <input aria-label="Code state" defaultValue="selected step" />
      </FileDrawer>
    </ThemeProvider>
  );
}

function parts(container: HTMLElement) {
  return {
    spacer: container.children[0] as HTMLElement,
    panel: container.children[1] as HTMLElement,
  };
}

function setDrawerGeometry(container: HTMLElement, width = 450, containerWidth = 1000) {
  parts(container).panel.getBoundingClientRect = () => ({ width } as DOMRect);
  container.getBoundingClientRect = () => ({ width: containerWidth } as DOMRect);
}

describe('FileDrawer docking', () => {
  test('keeps the default bottom drawer and reserves height', () => {
    const { container } = render(drawer());
    const { spacer, panel } = parts(container);
    expect(spacer.style.height).toBe('45%');
    expect(spacer.style.width).toBe('');
    expect(panel.style.height).toBe('45%');
    expect(panel.style.left).toBe('0px');
    expect(panel.style.right).toBe('0px');
    expect(panel.style.top).toBe('');
    expect(panel.style.borderTopStyle).toBe('solid');
  });

  test('docks on the left and reserves width before the canvas', () => {
    const { container } = render(drawer({ placement: 'left' }));
    const { spacer, panel } = parts(container);
    expect(spacer.style.width).toBe('45%');
    expect(spacer.style.height).toBe('');
    expect(spacer.style.order).toBe('-1');
    expect(panel.style.width).toBe('45%');
    expect(panel.style.height).toBe('100%');
    expect(panel.style.left).toBe('0px');
    expect(panel.style.right).toBe('');
    expect(panel.style.top).toBe('0px');
    expect(panel.style.borderRightStyle).toBe('solid');
    expect(panel.style.borderTopStyle).toBe('none');
  });

  test('preserves mounted content when switching dock axes', () => {
    const { container, getByLabelText, rerender } = render(drawer());
    const input = getByLabelText('Code state') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'step 3' } });
    rerender(drawer({ placement: 'left' }));
    expect(getByLabelText('Code state')).toBe(input);
    expect(input.value).toBe('step 3');
    expect(parts(container).spacer.style.height).toBe('');
    rerender(drawer());
    expect(getByLabelText('Code state')).toBe(input);
    expect(parts(container).spacer.style.width).toBe('');
    expect(parts(container).panel.style.width).toBe('');
  });

  test('maximizes and restores along the left dock axis', () => {
    const { container, getByLabelText } = render(drawer({ placement: 'left' }));
    fireEvent.click(getByLabelText('Maximize code view'));
    expect(parts(container).panel.style.width).toBe('100%');
    expect(parts(container).spacer.style.width).toBe('0px');
    fireEvent.click(getByLabelText('Minimize code view'));
    expect(parts(container).panel.style.width).toBe('45%');
    expect(parts(container).spacer.style.width).toBe('45%');
  });

  test('fills the graph area for full-file reading', () => {
    const { container } = render(drawer({ placement: 'left', fillHeight: true }));
    expect(parts(container).panel.style.width).toBe('100%');
    expect(parts(container).spacer.style.width).toBe('0px');
  });

  test('closed and hidden left drawers reserve no width', () => {
    const { container, rerender } = render(drawer({ placement: 'left', title: null }));
    expect(parts(container).panel.style.width).toBe('0px');
    expect(parts(container).spacer.style.width).toBe('0px');
    rerender(drawer({ placement: 'left', hidden: true }));
    expect(parts(container).panel.style.width).toBe('0px');
    expect(parts(container).spacer.style.width).toBe('0px');
  });

  test('closing resets maximize state before reopening', () => {
    const { container, getByLabelText, rerender } = render(drawer({ placement: 'left' }));
    fireEvent.click(getByLabelText('Maximize code view'));
    rerender(drawer({ placement: 'left', title: null }));
    rerender(drawer({ placement: 'left' }));
    expect(parts(container).panel.style.width).toBe('45%');
    expect(getByLabelText('Maximize code view')).not.toBeNull();
  });

  test('Escape closes a left drawer unless a full-file overlay handles it', () => {
    let closes = 0;
    const onClose = () => { closes++; };
    const { rerender } = render(drawer({ placement: 'left', onClose }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closes).toBe(1);
    rerender(drawer({ placement: 'left', onClose, suppressEscape: true }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closes).toBe(1);
  });

  test('width dragging tracks the initial width and resizes the canvas spacer together', () => {
    let ended = 0;
    const { container, getByLabelText } = render(drawer({
      placement: 'left',
      onResizeEnd: () => { ended++; },
    }));
    setDrawerGeometry(container);
    const input = getByLabelText('Code state');
    fireEvent.mouseDown(getByLabelText('Resize code view'), { clientX: 450 });
    expect(document.body.style.userSelect).toBe('none');
    expect(parts(container).panel.style.transition).toBe('none');
    fireEvent.mouseMove(document, { clientX: 500 });
    expect(parts(container).panel.style.width).toBe('50%');
    expect(parts(container).spacer.style.width).toBe('50%');
    fireEvent.mouseMove(document, { clientX: 520 });
    expect(parts(container).panel.style.width).toBe('52%');
    fireEvent.mouseMove(document, { clientX: 460 });
    expect(parts(container).panel.style.width).toBe('46%');
    expect(getByLabelText('Code state')).toBe(input);
    fireEvent.mouseUp(document);
    expect(ended).toBe(1);
    expect(document.body.style.userSelect).toBe('');
    expect(document.body.style.cursor).toBe('');
    fireEvent.mouseMove(document, { clientX: 600 });
    expect(parts(container).panel.style.width).toBe('46%');
  });

  test('width dragging keeps space for both code and graph at either limit', () => {
    const { container, getByLabelText } = render(drawer({ placement: 'left' }));
    setDrawerGeometry(container);
    fireEvent.mouseDown(getByLabelText('Resize code view'), { clientX: 450 });
    fireEvent.mouseMove(document, { clientX: 1000 });
    expect(parts(container).panel.style.width).toBe('76%');
    fireEvent.mouseMove(document, { clientX: 0 });
    expect(parts(container).panel.style.width).toBe('24%');
    fireEvent.mouseMove(document, { clientX: 500 });
    expect(parts(container).panel.style.width).toBe('50%');
    fireEvent.mouseUp(document);
  });

  test('narrow containers do not produce inverted width limits', () => {
    const { container, getByLabelText } = render(drawer({ placement: 'left' }));
    setDrawerGeometry(container, 180, 400);
    fireEvent.mouseDown(getByLabelText('Resize code view'), { clientX: 180 });
    fireEvent.mouseMove(document, { clientX: 350 });
    expect(parts(container).panel.style.width).toBe('50%');
    fireEvent.mouseUp(document);
  });

  test('remembers dragged width across maximize, closing, and layout changes', () => {
    const { container, getByLabelText, queryByLabelText, rerender } = render(drawer({ placement: 'left' }));
    setDrawerGeometry(container);
    fireEvent.mouseDown(getByLabelText('Resize code view'), { clientX: 450 });
    fireEvent.mouseMove(document, { clientX: 500 });
    fireEvent.mouseUp(document);
    fireEvent.click(getByLabelText('Maximize code view'));
    expect(parts(container).panel.style.width).toBe('100%');
    expect(queryByLabelText('Resize code view')).toBeNull();
    fireEvent.click(getByLabelText('Minimize code view'));
    expect(parts(container).panel.style.width).toBe('50%');
    rerender(drawer({ placement: 'left', title: null }));
    rerender(drawer({ placement: 'left' }));
    expect(parts(container).panel.style.width).toBe('50%');
    rerender(drawer());
    expect(parts(container).panel.style.height).toBe('45%');
    expect(queryByLabelText('Resize code view')).toBeNull();
    rerender(drawer({ placement: 'left' }));
    expect(parts(container).panel.style.width).toBe('50%');
  });

  test('closing mid-drag removes listeners and restores document styles', () => {
    const { container, getByLabelText, rerender } = render(drawer({ placement: 'left' }));
    setDrawerGeometry(container);
    fireEvent.mouseDown(getByLabelText('Resize code view'), { clientX: 450 });
    rerender(drawer({ placement: 'left', title: null }));
    expect(document.body.style.userSelect).toBe('');
    fireEvent.mouseMove(document, { clientX: 700 });
    rerender(drawer({ placement: 'left' }));
    expect(parts(container).panel.style.width).toBe('45%');
  });

  test('losing window focus finishes the drag and restores existing styles', () => {
    document.body.style.userSelect = 'text';
    document.body.style.cursor = 'crosshair';
    const { container, getByLabelText, unmount } = render(drawer({ placement: 'left' }));
    setDrawerGeometry(container);
    fireEvent.mouseDown(getByLabelText('Resize code view'), { clientX: 450 });
    fireEvent(window, new dom.Event('blur') as unknown as Event);
    expect(document.body.style.userSelect).toBe('text');
    expect(document.body.style.cursor).toBe('crosshair');
    fireEvent.mouseDown(getByLabelText('Resize code view'), { clientX: 450 });
    unmount();
    expect(document.body.style.userSelect).toBe('text');
    expect(document.body.style.cursor).toBe('crosshair');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
});
