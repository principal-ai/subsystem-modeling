import React, { useCallback } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemTrail } from '../../../subsystem/model';
import { PierreTrailCodeView } from '../../../pierre';
import type { TrailViewerContext } from '../../../subsystem/SubsystemComponentGraph';

const meta = {
  title: 'Subsystem/ComponentGraph/Trails',
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
    // Mirror the host's wording so the Pierre views exercise their
    // "not in the local checkout" handling, not just any rejection.
    return Promise.reject(
      new Error(`file not found in graph repos: ${path}`),
    );
  }
  return Promise.resolve(content);
}

const drawingComponents: SubsystemComponent[] = [
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
  {
    alias: 'shell',
    name: 'WorkspaceShell',
    construct: 'class',
    file: 'src/workspace/WorkspaceShell.tsx',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'mounts tabs for opened drawings',
    symbol: 'WorkspaceShell',
    process: 'draw-host',
  },
  {
    alias: 'tab',
    name: 'DrawingTabContent',
    construct: 'class',
    file: 'src/components/DrawingTabContent.tsx',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'loads/saves an open drawing',
    symbol: 'DrawingTabContent',
    process: 'draw-host',
  },
];

const STORY_PURL = 'pkg:github/principal-ai/desktop-app';
const stepPurl = (file: string) => `${STORY_PURL}#${file}`;

const drawingTrails: SubsystemTrail[] = [
  {
    id: 'tl-open-drawing',
    title: 'Open drawing',
    steps: [
      { from: 'panel', to: 'storage', mechanism: 'calls', file: 'src/panels/DrawingsLeftPanel.tsx', span: { startLine: 56, endLine: 56, contentHash: 'fixture' }, purl: stepPurl('src/panels/DrawingsLeftPanel.tsx'), symbol: 'DrawingsLeftPanel.scan', annotation: 'Lists the drawings directory; each row feeds an open intent.' },
      { from: 'panel', to: 'host', mechanism: 'produces', file: 'src/panels/DrawingsLeftPanel.tsx', span: { startLine: 85, endLine: 85, contentHash: 'fixture' }, purl: stepPurl('src/panels/DrawingsLeftPanel.tsx'), symbol: 'DrawingsLeftPanel.openDrawing', annotation: 'Emits the open intent up to the host.' },
      { from: 'host', to: 'storage', mechanism: 'calls', file: 'src/hooks/useDrawingsHost.ts', span: { startLine: 45, endLine: 45, contentHash: 'fixture' }, purl: stepPurl('src/hooks/useDrawingsHost.ts'), symbol: 'useDrawingsHost.openDrawing', annotation: 'Host resolves the path and delegates to storage.' },
      { from: 'host', to: 'shell', mechanism: 'produces', file: 'src/workspace/WorkspaceShell.tsx', span: { startLine: 369, endLine: 369, contentHash: 'fixture' }, purl: stepPurl('src/workspace/WorkspaceShell.tsx'), symbol: 'WorkspaceShell.openTab', annotation: 'Asks the shell to surface the drawing as a tab.' },
      { from: 'shell', to: 'tab', mechanism: 'feeds', file: 'src/workspace/WorkspaceShell.tsx', span: { startLine: 372, endLine: 372, contentHash: 'fixture' }, purl: stepPurl('src/workspace/WorkspaceShell.tsx'), symbol: 'WorkspaceShell.mountTab' },
      { from: 'storage', to: 'fs', mechanism: 'calls', file: 'src/storage/drawingsStorage.ts', span: { startLine: 90, endLine: 90, contentHash: 'fixture' }, purl: stepPurl('src/storage/drawingsStorage.ts'), symbol: 'DrawingsStorage.read', annotation: 'Reads the file through the sandboxed fs service.' },
      { from: 'tab', to: 'fs', mechanism: 'calls', file: 'src/components/DrawingTabContent.tsx', span: { startLine: 83, endLine: 83, contentHash: 'fixture' }, purl: stepPurl('src/components/DrawingTabContent.tsx'), symbol: 'DrawingTabContent.load' },
    ],
  },
  {
    id: 'tl-save-drawing',
    title: 'Save drawing',
    steps: [
      { from: 'tab', to: 'fs', mechanism: 'calls', file: 'src/components/DrawingTabContent.tsx', span: { startLine: 112, endLine: 112, contentHash: 'fixture' }, purl: stepPurl('src/components/DrawingTabContent.tsx'), symbol: 'DrawingTabContent.save' },
      { from: 'tab', to: 'host', mechanism: 'produces', file: 'src/components/DrawingTabContent.tsx', span: { startLine: 121, endLine: 121, contentHash: 'fixture' }, purl: stepPurl('src/components/DrawingTabContent.tsx'), symbol: 'DrawingTabContent.emitSaved' },
      { from: 'host', to: 'panel', mechanism: 'produces', file: 'src/hooks/useDrawingsHost.ts', span: { startLine: 64, endLine: 64, contentHash: 'fixture' }, purl: stepPurl('src/hooks/useDrawingsHost.ts'), symbol: 'useDrawingsHost.onSaved' },
      { from: 'panel', to: 'storage', mechanism: 'calls', file: 'src/panels/DrawingsLeftPanel.tsx', span: { startLine: 56, endLine: 56, contentHash: 'fixture' }, purl: stepPurl('src/panels/DrawingsLeftPanel.tsx'), symbol: 'DrawingsLeftPanel.scan' },
    ],
  },
  {
    id: 'tl-delete-drawing',
    title: 'Delete drawing',
    steps: [
      { from: 'host', to: 'fs', mechanism: 'calls', file: 'src/hooks/useDrawingsHost.ts', span: { startLine: 64, endLine: 64, contentHash: 'fixture' }, purl: stepPurl('src/hooks/useDrawingsHost.ts'), symbol: 'useDrawingsHost.deleteDrawing' },
      { from: 'host', to: 'panel', mechanism: 'produces', file: 'src/hooks/useDrawingsHost.ts', span: { startLine: 66, endLine: 66, contentHash: 'fixture' }, purl: stepPurl('src/hooks/useDrawingsHost.ts'), symbol: 'useDrawingsHost.refreshList' },
      { from: 'panel', to: 'storage', mechanism: 'calls', file: 'src/panels/DrawingsLeftPanel.tsx', span: { startLine: 56, endLine: 56, contentHash: 'fixture' }, purl: stepPurl('src/panels/DrawingsLeftPanel.tsx'), symbol: 'DrawingsLeftPanel.scan' },
    ],
  },
];

function TrailsDemo() {
  const renderTrailViewer = useCallback(
    ({
      trail,
      stepIndex,
      onOpenFile,
      proposedAliases,
      resolveSymbol,
      onSymbolClick,
      onVisibleStepChange,
    }: TrailViewerContext) => (
      <PierreTrailCodeView
        trail={trail}
        stepIndex={stepIndex}
        readFile={readStoryFile}
        contextLines={4}
        onOpenFile={onOpenFile}
        proposedAliases={proposedAliases}
        resolveSymbol={resolveSymbol}
        onSymbolClick={onSymbolClick}
        onVisibleStepChange={onVisibleStepChange}
      />
    ),
    [],
  );

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={drawingComponents}
        trails={drawingTrails}
        title="drawing-files flow"
        description="Three trails over one graph — opening, saving, and deleting a drawing. The sidebar's **Trails** panel lists each step by **symbol**; clicking a step focuses that step and scrolls the bottom CodeView to that snippet."
        renderTrailViewer={renderTrailViewer}
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
            {opts?.fullFile ? '\n  // → full file' : ''}
            {'\n  …'}
          </div>
        )}
      />
    </div>
  );
}

export const ThreeTrails: Story = {
  render: () => <TrailsDemo />,
};

/**
 * The proposed-seam failure mode: a trail step whose component is
 * `proposed` points at a file that isn't in the checkout yet (no story
 * fixture). The step must render an inline "Proposed — … isn't in the local
 * checkout yet." placeholder with no Open-file affordance, while the live steps
 * around it still render their snippets — one bad step must not blank the flow.
 */
const proposedComponents: SubsystemComponent[] = [
  ...drawingComponents,
  {
    alias: 'runs',
    name: 'SubsystemModelRunStore',
    construct: 'store',
    file: 'src/runs/subsystemModelRuns.ts',
    purl: 'pkg:github/principal-ai/desktop-app',
    symbol: 'SubsystemModelRunStore',
    purpose: 'proposed store associating maintain runs with a model',
    proposed: true,
    process: 'draw-host',
  },
];

const proposedTrails: SubsystemTrail[] = [
  {
    id: 'tl-associate-run',
    title: 'Associate a finished run with its model (proposed)',
    steps: [
      {
        from: 'host',
        to: 'storage',
        mechanism: 'calls',
        file: 'src/hooks/useDrawingsHost.ts',
        span: { startLine: 45, endLine: 45, contentHash: 'fixture' },
        purl: stepPurl('src/hooks/useDrawingsHost.ts'),
        symbol: 'useDrawingsHost.openDrawing',
        annotation: 'Live step — its snippet still renders.',
      },
      {
        from: 'storage',
        to: 'runs',
        mechanism: 'writes',
        file: 'src/runs/subsystemModelRuns.ts',
        span: { startLine: 1, endLine: 1, contentHash: 'fixture' },
        purl: stepPurl('src/runs/subsystemModelRuns.ts'),
        symbol: 'SubsystemModelRunStore.write',
        annotation: 'Proposed seam — the file is not in the checkout yet.',
      },
    ],
  },
  // Neighbours for the wrapped title above: a couple of one-line titles and
  // one that wraps to two, so the header's padding reads against the rows on
  // either side of it rather than in isolation.
  {
    id: 'tl-open-drawing',
    title: 'Open drawing',
    steps: [
      {
        from: 'panel',
        to: 'host',
        mechanism: 'produces',
        file: 'src/panels/DrawingsLeftPanel.tsx',
        span: { startLine: 85, endLine: 85, contentHash: 'fixture' },
        purl: stepPurl('src/panels/DrawingsLeftPanel.tsx'),
        symbol: 'DrawingsLeftPanel.openDrawing',
        annotation: 'Emits the open intent up to the host.',
      },
      {
        from: 'host',
        to: 'storage',
        mechanism: 'calls',
        file: 'src/hooks/useDrawingsHost.ts',
        span: { startLine: 45, endLine: 45, contentHash: 'fixture' },
        purl: stepPurl('src/hooks/useDrawingsHost.ts'),
        symbol: 'useDrawingsHost.openDrawing',
      },
    ],
  },
  {
    id: 'tl-save-drawing',
    title: 'Save the drawing and refresh the list',
    steps: [
      {
        from: 'tab',
        to: 'fs',
        mechanism: 'calls',
        file: 'src/components/DrawingTabContent.tsx',
        span: { startLine: 112, endLine: 112, contentHash: 'fixture' },
        purl: stepPurl('src/components/DrawingTabContent.tsx'),
        symbol: 'DrawingTabContent.save',
      },
      {
        from: 'host',
        to: 'panel',
        mechanism: 'produces',
        file: 'src/hooks/useDrawingsHost.ts',
        span: { startLine: 64, endLine: 64, contentHash: 'fixture' },
        purl: stepPurl('src/hooks/useDrawingsHost.ts'),
        symbol: 'useDrawingsHost.onSaved',
      },
    ],
  },
  {
    id: 'tl-delete-drawing',
    title: 'Delete drawing',
    steps: [
      {
        from: 'host',
        to: 'fs',
        mechanism: 'calls',
        file: 'src/hooks/useDrawingsHost.ts',
        span: { startLine: 66, endLine: 66, contentHash: 'fixture' },
        purl: stepPurl('src/hooks/useDrawingsHost.ts'),
        symbol: 'useDrawingsHost.deleteDrawing',
      },
      {
        from: 'panel',
        to: 'storage',
        mechanism: 'calls',
        file: 'src/panels/DrawingsLeftPanel.tsx',
        span: { startLine: 56, endLine: 56, contentHash: 'fixture' },
        purl: stepPurl('src/panels/DrawingsLeftPanel.tsx'),
        symbol: 'DrawingsLeftPanel.scan',
      },
    ],
  },
];

function ProposedMissingStepDemo() {
  const renderTrailViewer = useCallback(
    ({
      trail,
      stepIndex,
      onOpenFile,
      proposedAliases,
      resolveSymbol,
      onSymbolClick,
      onVisibleStepChange,
    }: TrailViewerContext) => (
      <PierreTrailCodeView
        trail={trail}
        stepIndex={stepIndex}
        readFile={readStoryFile}
        contextLines={4}
        onOpenFile={onOpenFile}
        proposedAliases={proposedAliases}
        resolveSymbol={resolveSymbol}
        onSymbolClick={onSymbolClick}
        onVisibleStepChange={onVisibleStepChange}
      />
    ),
    [],
  );

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={proposedComponents}
        trails={proposedTrails}
        title="proposed seam with a missing file"
        description="The **Trails** panel lists four flows so the long, wrapped title (*Associate a finished run with its model (proposed)*) reads against its neighbours — two one-line titles and one (*Save the drawing and refresh the list*) that also wraps. Expand **Associate a finished run with its model** and click either step: the proposed step has no file in the checkout, so its snippet shows an inline *Proposed — … isn't in the local checkout yet.* placeholder instead of failing the whole flow."
        renderTrailViewer={renderTrailViewer}
        renderFileViewer={(file) => (
          <div
            style={{
              padding: 12,
              fontFamily: 'monospace',
              fontSize: 12,
              color: '#bbb',
              whiteSpace: 'pre',
            }}
          >
            {`// ${file}\n  …`}
          </div>
        )}
      />
    </div>
  );
}

export const ProposedMissingStep: Story = {
  render: () => <ProposedMissingStepDemo />,
};

// --- Clickable constructs -------------------------------------------------
//
// A trail step's line is an edge between two constructs. When the host
// supplies `resolveSymbol`/`onSymbolClick` (the graph derives them from the
// step's `from`/`to` components), a token in the snippet that names either
// endpoint becomes clickable — clicking it opens that construct's file at its
// declaration line in the bottom drawer. The second endpoint here is a
// `method` construct (`DrawingStore.list`), so the bare `list` token is
// clickable and jumps to the method's declaration.

const clickableComponents: SubsystemComponent[] = [
  {
    alias: 'load-panel',
    name: 'LoadPanel',
    construct: 'function',
    file: 'src/load/LoadPanel.tsx',
    purl: 'pkg:github/principal-ai/desktop-app',
    symbol: 'LoadPanel',
    purpose: 'loads the drawing list and hands rows to the render surface',
    process: 'draw-list',
    declarationSpan: {
      startLine: 3,
      endLine: 3,
      contentHash: 'story',
    },
    declaration: {
      kind: 'function',
      parameters: [],
      returnType: 'JSX.Element',
      callers: [],
      callees: [],
    },
    declarationProvenance: 'authored',
  },
  {
    alias: 'drawing-store-list',
    name: 'list',
    construct: 'method',
    file: 'src/store/DrawingStore.ts',
    purl: 'pkg:github/principal-ai/desktop-app',
    symbol: 'DrawingStore.list',
    purpose: 'lists stored drawings for the panel',
    process: 'draw-list',
    declarationSpan: {
      startLine: 4,
      endLine: 4,
      contentHash: 'story',
    },
    declaration: {
      kind: 'method',
      hostClass: 'DrawingStore',
      parameters: [],
      returnType: 'Drawing[]',
    },
    declarationProvenance: 'authored',
  },
  {
    alias: 'render-surface',
    name: 'RenderSurface',
    construct: 'class',
    file: 'src/render/RenderSurface.ts',
    purl: 'pkg:github/principal-ai/desktop-app',
    symbol: 'RenderSurface',
    purpose: 'paints a drawing into a surface',
    process: 'draw-host',
    declarationSpan: {
      startLine: 3,
      endLine: 3,
      contentHash: 'story',
    },
    declaration: {
      kind: 'class',
      methods: [{ nodeId: 'RenderSurface.render', name: 'render' }],
      properties: [],
      extends: [],
      implements: [],
      instantiations: [],
      references: [],
    },
    declarationProvenance: 'authored',
  },
];

const clickableFiles: Record<string, string> = {
  'src/load/LoadPanel.tsx': [
    '// src/load/LoadPanel.tsx',
    '',
    'export function LoadPanel() {',
    '  const rows = DrawingStore.list();',
    '  return rows.map(RenderSurface.render);',
    '}',
  ].join('\n'),
  'src/store/DrawingStore.ts': [
    '// src/store/DrawingStore.ts',
    '',
    'export class DrawingStore {',
    '  static list() {',
    '    return RenderSurface.read();',
    '  }',
    '}',
  ].join('\n'),
};

function readClickableFile(path: string): Promise<string> {
  const content = clickableFiles[path];
  if (content == null) {
    return Promise.reject(new Error(`file not found in graph repos: ${path}`));
  }
  return Promise.resolve(content);
}

const clickableTrails: SubsystemTrail[] = [
  {
    id: 'tl-load',
    title: 'Load drawings',
    steps: [
      {
        from: 'load-panel',
        to: 'drawing-store-list',
        mechanism: 'calls',
        file: 'src/load/LoadPanel.tsx',
        span: { startLine: 4, endLine: 4, contentHash: 'fixture' },
        purl: stepPurl('src/load/LoadPanel.tsx'),
        symbol: 'LoadPanel.load',
        annotation:
          'LoadPanel calls DrawingStore.list — click the `list` (or `DrawingStore`) token to jump to the method.',
      },
      {
        from: 'drawing-store-list',
        to: 'render-surface',
        mechanism: 'calls',
        file: 'src/store/DrawingStore.ts',
        span: { startLine: 5, endLine: 5, contentHash: 'fixture' },
        purl: stepPurl('src/store/DrawingStore.ts'),
        symbol: 'DrawingStore.list',
        annotation: 'list reads through RenderSurface — click RenderSurface.',
      },
    ],
  },
];

function ClickableConstructsDemo() {
  const [opened, setOpened] = React.useState<string | null>(null);
  const renderTrailViewer = useCallback(
    ({
      trail,
      stepIndex,
      onOpenFile,
      proposedAliases,
      resolveSymbol,
      onSymbolClick,
      onVisibleStepChange,
    }: TrailViewerContext) => (
      <PierreTrailCodeView
        trail={trail}
        stepIndex={stepIndex}
        readFile={readClickableFile}
        contextLines={4}
        onOpenFile={onOpenFile}
        proposedAliases={proposedAliases}
        resolveSymbol={resolveSymbol}
        onSymbolClick={onSymbolClick}
        onVisibleStepChange={onVisibleStepChange}
      />
    ),
    [],
  );

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '8px 14px',
          fontFamily: 'monospace',
          fontSize: 12,
          borderBottom: '1px solid #333',
          background: '#141414',
          color: '#ddd',
        }}
      >
        Click the <strong>Load drawings</strong> step, then click the dotted-underlined{' '}
        <code>list</code> <em>(a method)</em> or <code>RenderSurface</code> token in the
        snippet. It opens that construct's file at its declaration line in the bottom drawer
        — <code>list</code> jumps to <code>DrawingStore.ts:4</code>.
        <span style={{ marginLeft: 8, color: '#8fd' }}>opened: {opened ?? '—'}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SubsystemComponentGraph
          components={clickableComponents}
          trails={clickableTrails}
          initialTrailId="tl-load"
          title="clickable constructs"
          description="A trail step's line is an edge to a construct. Tokens that name the step's `from`/`to` components are clickable and open that construct's declaration line in the file drawer — including a **method** endpoint (click `list` to jump to `DrawingStore.list`)."
          renderTrailViewer={renderTrailViewer}
          onFileSelect={setOpened}
          renderFileViewer={(file, opts) => (
            <div style={{ padding: 12, fontFamily: 'monospace', fontSize: 12, color: '#bbb' }}>
              {`// ${file}`}
              {opts?.startLine != null ? `\n  // → focus line ${opts.startLine}` : ''}
              {'\n  …'}
            </div>
          )}
        />
      </div>
    </div>
  );
}

export const ClickableConstructs: Story = {
  render: () => <ClickableConstructsDemo />,
};
