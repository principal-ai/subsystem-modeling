import React, { useCallback } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemWalkthrough } from '../../../subsystem/model';
import { PierreWalkthroughCodeView } from '../../../pierre';
import type { WalkthroughViewerContext } from '../../../subsystem/SubsystemComponentGraph';

const meta = {
  title: 'Subsystem/ComponentGraph/Flows',
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

function fakeSource(path: string, markedLines: number[]): string {
  const maxLine = Math.max(80, ...markedLines);
  const marks = new Set(markedLines);
  const lines: string[] = [`// ${path}`, ''];
  for (let i = 3; i <= maxLine; i++) {
    if (marks.has(i)) {
      lines.push(`export function stepAtLine${i}() {`);
      lines.push(`  return ${i};`);
      lines.push(`}`);
      lines.push('');
    } else {
      lines.push(`// context line ${i}`);
    }
  }
  return lines.join('\n');
}

const storyFiles: Record<string, string> = {
  'src/panels/DrawingsLeftPanel.tsx': fakeSource('src/panels/DrawingsLeftPanel.tsx', [56, 85]),
  'src/hooks/useDrawingsHost.ts': fakeSource('src/hooks/useDrawingsHost.ts', [45, 64, 66]),
  'src/workspace/WorkspaceShell.tsx': fakeSource('src/workspace/WorkspaceShell.tsx', [369, 372]),
  'src/storage/drawingsStorage.ts': fakeSource('src/storage/drawingsStorage.ts', [90]),
  'src/components/DrawingTabContent.tsx': fakeSource('src/components/DrawingTabContent.tsx', [83, 112, 121]),
};

function readStoryFile(path: string): Promise<string> {
  const content = storyFiles[path];
  if (content == null) {
    return Promise.reject(new Error(`No story fixture for ${path}`));
  }
  return Promise.resolve(content);
}

const drawingComponents: SubsystemComponent[] = [
  {
    id: 'panel',
    name: 'DrawingsLeftPanel',
    construct: 'class',
    file: 'src/panels/DrawingsLeftPanel.tsx',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'lists drawings; emits open/delete intents',
    symbol: 'DrawingsLeftPanel',
    process: 'draw-list',
  },
  {
    id: 'host',
    name: 'useDrawingsHost',
    construct: 'function',
    file: 'src/hooks/useDrawingsHost.ts',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'hosts drawing CRUD; dispatches to storage and shell',
    symbol: 'useDrawingsHost',
    process: 'draw-list',
  },
  {
    id: 'storage',
    name: 'DrawingsStorage',
    construct: 'class',
    file: 'src/storage/drawingsStorage.ts',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'persists drawings as files',
    symbol: 'DrawingsStorage',
    process: 'draw-host',
  },
  {
    id: 'fs',
    name: 'FileSystemService',
    construct: 'external',
    file: 'src/services/fileSystem.ts',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'sandboxed host fd/fs access',
    symbol: 'FileSystemService',
    role: 'service',
  },
  {
    id: 'shell',
    name: 'WorkspaceShell',
    construct: 'class',
    file: 'src/workspace/WorkspaceShell.tsx',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'mounts tabs for opened drawings',
    symbol: 'WorkspaceShell',
    process: 'draw-host',
  },
  {
    id: 'tab',
    name: 'DrawingTabContent',
    construct: 'class',
    file: 'src/components/DrawingTabContent.tsx',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'loads/saves an open drawing',
    symbol: 'DrawingTabContent',
    process: 'draw-host',
  },
];

const drawingWalkthroughs: SubsystemWalkthrough[] = [
  {
    id: 'tl-open-drawing',
    title: 'Open drawing',
    steps: [
      { from: 'panel', to: 'storage', mechanism: 'calls', file: 'src/panels/DrawingsLeftPanel.tsx', line: 56, symbol: 'DrawingsLeftPanel.scan', annotation: 'Lists the drawings directory; each row feeds an open intent.' },
      { from: 'panel', to: 'host', mechanism: 'produces', file: 'src/panels/DrawingsLeftPanel.tsx', line: 85, symbol: 'DrawingsLeftPanel.openDrawing', annotation: 'Emits the open intent up to the host.' },
      { from: 'host', to: 'storage', mechanism: 'calls', file: 'src/hooks/useDrawingsHost.ts', line: 45, symbol: 'useDrawingsHost.openDrawing', annotation: 'Host resolves the path and delegates to storage.' },
      { from: 'host', to: 'shell', mechanism: 'produces', file: 'src/workspace/WorkspaceShell.tsx', line: 369, symbol: 'WorkspaceShell.openTab', annotation: 'Asks the shell to surface the drawing as a tab.' },
      { from: 'shell', to: 'tab', mechanism: 'feeds', file: 'src/workspace/WorkspaceShell.tsx', line: 372, symbol: 'WorkspaceShell.mountTab' },
      { from: 'storage', to: 'fs', mechanism: 'calls', file: 'src/storage/drawingsStorage.ts', line: 90, symbol: 'DrawingsStorage.read', annotation: 'Reads the file through the sandboxed fs service.' },
      { from: 'tab', to: 'fs', mechanism: 'calls', file: 'src/components/DrawingTabContent.tsx', line: 83, symbol: 'DrawingTabContent.load' },
    ],
  },
  {
    id: 'tl-save-drawing',
    title: 'Save drawing',
    steps: [
      { from: 'tab', to: 'fs', mechanism: 'calls', file: 'src/components/DrawingTabContent.tsx', line: 112, symbol: 'DrawingTabContent.save' },
      { from: 'tab', to: 'host', mechanism: 'produces', file: 'src/components/DrawingTabContent.tsx', line: 121, symbol: 'DrawingTabContent.emitSaved' },
      { from: 'host', to: 'panel', mechanism: 'produces', file: 'src/hooks/useDrawingsHost.ts', line: 64, symbol: 'useDrawingsHost.onSaved' },
      { from: 'panel', to: 'storage', mechanism: 'calls', file: 'src/panels/DrawingsLeftPanel.tsx', line: 56, symbol: 'DrawingsLeftPanel.scan' },
    ],
  },
  {
    id: 'tl-delete-drawing',
    title: 'Delete drawing',
    steps: [
      { from: 'host', to: 'fs', mechanism: 'calls', file: 'src/hooks/useDrawingsHost.ts', line: 64, symbol: 'useDrawingsHost.deleteDrawing' },
      { from: 'host', to: 'panel', mechanism: 'produces', file: 'src/hooks/useDrawingsHost.ts', line: 66, symbol: 'useDrawingsHost.refreshList' },
      { from: 'panel', to: 'storage', mechanism: 'calls', file: 'src/panels/DrawingsLeftPanel.tsx', line: 56, symbol: 'DrawingsLeftPanel.scan' },
    ],
  },
];

function FlowsDemo() {
  const renderWalkthroughViewer = useCallback(
    ({ walkthrough, stepIndex }: WalkthroughViewerContext) => (
      <PierreWalkthroughCodeView
        walkthrough={walkthrough}
        stepIndex={stepIndex}
        readFile={readStoryFile}
        contextLines={4}
      />
    ),
    [],
  );

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={drawingComponents}
        relations={[]}
        walkthroughs={drawingWalkthroughs}
        title="drawing-files flow"
        description="Three walkthroughs over one graph — opening, saving, and deleting a drawing. The sidebar's **Walkthroughs** panel lists each step by **symbol**; clicking a step focuses that hop and scrolls the bottom CodeView to that snippet."
        renderWalkthroughViewer={renderWalkthroughViewer}
        renderFileViewer={(file, opts) => (
          <div
            style={{
              padding: 12,
              fontFamily: 'monospace',
              fontSize: 12,
              color: '#bbb',
              whiteSpace: 'pre',
            }}
          >
            {`// ${file}`}
            {opts?.startLine != null ? `\n  // → focus line ${opts.startLine}` : ''}
            {'\n  …'}
          </div>
        )}
      />
    </div>
  );
}

export const ThreeFlows: Story = {
  render: () => <FlowsDemo />,
};
