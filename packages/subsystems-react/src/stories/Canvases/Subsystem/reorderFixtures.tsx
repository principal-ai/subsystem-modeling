import type {
  SubsystemComponent,
  SubsystemTrail,
  SubsystemTrailMechanism,
  SubsystemTrailStep,
} from '../../../subsystem/model';

/** One authored trail step; `line` becomes the seam span the viewers read. */
function step(
  from: string,
  to: string,
  mechanism: SubsystemTrailMechanism,
  file: string,
  line: number,
  symbol: string,
): SubsystemTrailStep {
  return {
    from,
    to,
    mechanism,
    file,
    span: { startLine: line, endLine: line, contentHash: 'fixture' },
    purl: `pkg:github/storybook/fixture#${file}`,
    symbol,
  };
}

export const components: SubsystemComponent[] = [
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

export const initialTrails: SubsystemTrail[] = [
  {
    id: 'tl-open-drawing',
    title: 'Open drawing',
    steps: [
      step('panel', 'storage', 'calls', 'src/panels/DrawingsLeftPanel.tsx', 56, 'DrawingsLeftPanel.scan'),
      step('panel', 'host', 'produces', 'src/panels/DrawingsLeftPanel.tsx', 85, 'DrawingsLeftPanel.openDrawing'),
      step('host', 'storage', 'calls', 'src/hooks/useDrawingsHost.ts', 45, 'useDrawingsHost.openDrawing'),
    ],
  },
  {
    id: 'tl-save-drawing',
    title: 'Save drawing',
    steps: [
      step('host', 'storage', 'calls', 'src/hooks/useDrawingsHost.ts', 64, 'useDrawingsHost.saveDrawing'),
      step('storage', 'fs', 'calls', 'src/storage/drawingsStorage.ts', 90, 'DrawingsStorage.write'),
    ],
  },
  {
    id: 'tl-delete-drawing',
    title: 'Delete drawing',
    steps: [
      step('host', 'fs', 'calls', 'src/hooks/useDrawingsHost.ts', 66, 'useDrawingsHost.deleteDrawing'),
      step('host', 'panel', 'produces', 'src/hooks/useDrawingsHost.ts', 64, 'useDrawingsHost.refreshList'),
    ],
  },
  {
    id: 'tl-refresh-list',
    title: 'Refresh list',
    steps: [
      step('panel', 'storage', 'calls', 'src/panels/DrawingsLeftPanel.tsx', 56, 'DrawingsLeftPanel.scan'),
    ],
  },
];

const orderLabel = (list: SubsystemTrail[]) => list.map((w) => w.title).join('  →  ');

export function OrderHeader({ list }: { list: SubsystemTrail[] }) {
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
