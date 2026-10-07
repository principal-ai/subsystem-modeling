import { useState } from 'react';
import type { ReactNode } from 'react';
import { GraphSidebar } from './GraphSidebar';
import type { GraphSidebarProps } from './GraphSidebar';

/**
 * GraphWithSidebar — a graph laid out beside its own sidebar.
 *
 * A flex row: `[GraphSidebar][graph content]`. The sidebar is the standalone
 * `GraphSidebar` panel (its right edge is the resize handle, and it owns the
 * width drag + persistence); this component only composes it next to a graph
 * and locks the row against text selection while a resize is in progress.
 *
 * Every sidebar prop is forwarded straight to `GraphSidebar`: `header`,
 * `tabs`/`activeTab`/`onTabChange`, `sidebarBody`, `footer`, `hidden`,
 * `bodyHidden`, `stretchHeader`, `width`/`onWidthChange`, `defaultWidth`,
 * `minWidth`/`maxWidth`, `onResizeEnd`, `persistKey`. See GraphSidebar for the
 * semantics.
 */

export interface GraphWithSidebarProps extends GraphSidebarProps {
  /** The graph content to the right of the sidebar. */
  children?: ReactNode;
}

export { GraphSidebar } from './GraphSidebar';
export type { GraphSidebarProps, GraphSidebarTab } from './GraphSidebar';

export function GraphWithSidebar({ children, ...sidebarProps }: GraphWithSidebarProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        userSelect: dragging ? 'none' : undefined,
      }}
    >
      <GraphSidebar {...sidebarProps} onDraggingChange={setDragging} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          position: 'relative',
          minHeight: 0,
          // A flex column so a child that fills the pane with flex-grow (the
          // component graph's canvas tree) resolves against a real flex
          // parent instead of collapsing to 0.
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  );
}