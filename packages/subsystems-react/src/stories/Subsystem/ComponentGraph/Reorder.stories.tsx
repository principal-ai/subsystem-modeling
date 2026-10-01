import React, { useCallback, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { TrailsPanel } from '../../../subsystem/TrailsPanel';
import type { SubsystemComponent, SubsystemTrail } from '../../../subsystem/model';

const meta = {
  title: 'Subsystem/ComponentGraph/Reorder',
  component: SubsystemComponentGraph,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof SubsystemComponentGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

const components: SubsystemComponent[] = [
  {
    alias: 'panel',
    name: 'DrawingsLeftPanel',
    construct: 'class',
    file: 'src/panels/DrawingsLeftPanel.tsx',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'lists drawings; emits open/delete intents',
    symbol: 'DrawingsLeftPanel',
    process: 'draw-list',
  },
  {
    alias: 'host',
    name: 'useDrawingsHost',
    construct: 'function',
    file: 'src/hooks/useDrawingsHost.ts',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'hosts drawing CRUD; dispatches to storage and shell',
    symbol: 'useDrawingsHost',
    process: 'draw-list',
  },
  {
    alias: 'storage',
    name: 'DrawingsStorage',
    construct: 'class',
    file: 'src/storage/drawingsStorage.ts',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'persists drawings as files',
    symbol: 'DrawingsStorage',
    process: 'draw-host',
  },
  {
    alias: 'fs',
    name: 'FileSystemService',
    construct: 'external',
    file: 'src/services/fileSystem.ts',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'sandboxed host fd/fs access',
    symbol: 'FileSystemService',
    role: 'service',
  },
];

const initialTrails: SubsystemTrail[] = [
  {
    id: 'tl-open-drawing',
    title: 'Open drawing',
    steps: [
      { from: 'panel', to: 'storage', mechanism: 'calls', file: 'src/panels/DrawingsLeftPanel.tsx', line: 56, symbol: 'DrawingsLeftPanel.scan' },
      { from: 'panel', to: 'host', mechanism: 'produces', file: 'src/panels/DrawingsLeftPanel.tsx', line: 85, symbol: 'DrawingsLeftPanel.openDrawing' },
      { from: 'host', to: 'storage', mechanism: 'calls', file: 'src/hooks/useDrawingsHost.ts', line: 45, symbol: 'useDrawingsHost.openDrawing' },
    ],
  },
  {
    id: 'tl-save-drawing',
    title: 'Save drawing',
    steps: [
      { from: 'host', to: 'storage', mechanism: 'calls', file: 'src/hooks/useDrawingsHost.ts', line: 64, symbol: 'useDrawingsHost.saveDrawing' },
      { from: 'storage', to: 'fs', mechanism: 'calls', file: 'src/storage/drawingsStorage.ts', line: 90, symbol: 'DrawingsStorage.write' },
    ],
  },
  {
    id: 'tl-delete-drawing',
    title: 'Delete drawing',
    steps: [
      { from: 'host', to: 'fs', mechanism: 'calls', file: 'src/hooks/useDrawingsHost.ts', line: 66, symbol: 'useDrawingsHost.deleteDrawing' },
      { from: 'host', to: 'panel', mechanism: 'produces', file: 'src/hooks/useDrawingsHost.ts', line: 64, symbol: 'useDrawingsHost.refreshList' },
    ],
  },
  {
    id: 'tl-refresh-list',
    title: 'Refresh list',
    steps: [
      { from: 'panel', to: 'storage', mechanism: 'calls', file: 'src/panels/DrawingsLeftPanel.tsx', line: 56, symbol: 'DrawingsLeftPanel.scan' },
    ],
  },
];

const orderLabel = (list: SubsystemTrail[]) => list.map((w) => w.title).join('  →  ');

function OrderHeader({ list }: { list: SubsystemTrail[] }) {
  return (
    <div
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid #2a2a2a',
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#9aa4b2',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      array order: {orderLabel(list)}
    </div>
  );
}

function ReorderGraphDemo() {
  const [trails, setTrails] = useState(initialTrails);
  const onReorder = useCallback(
    (next: SubsystemTrail[]) => setTrails(next),
    [],
  );

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <OrderHeader list={trails} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <SubsystemComponentGraph
          components={components}
          trails={trails}
          onReorderTrails={onReorder}
          title="drawing-files flows"
          description="Drag the grip at the right of a trail row to reorder it. Grips show only while every row is collapsed — expand one and they hide. The header above mirrors the array order; dropping a row calls `onReorderTrails` with the next array."
        />
      </div>
    </div>
  );
}

function PanelOnlyDemo() {
  const [trails, setTrails] = useState(initialTrails);
  // Start collapsed so the drag grips are visible; expanding any row hides them
  // (reordering is only offered when every row is collapsed).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const onToggleCollapsed = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <OrderHeader list={trails} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div
          style={{
            width: 340,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #2a2a2a',
          }}
        >
          <TrailsPanel
            trails={trails}
            expandedTrails={expanded}
            focusedTrailId={null}
            focusedStepIndex={null}
            hoveredTrailStep={null}
            onToggleCollapsed={onToggleCollapsed}
            onFocusFlow={() => {}}
            onClearFocus={() => {}}
            onFocusStep={() => {}}
            onHoverStep={() => {}}
            onHoverFlow={() => {}}
            onLeaveStep={() => {}}
            onReorder={setTrails}
          />
        </div>
      </div>
    </div>
  );
}

export const DragToReorder: Story = {
  render: () => <ReorderGraphDemo />,
};

export const PanelOnly: Story = {
  render: () => <PanelOnlyDemo />,
};
