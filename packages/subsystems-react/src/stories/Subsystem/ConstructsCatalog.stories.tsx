import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { ConstructsCatalog } from '../../subsystem/ConstructsCatalog';
import { PierreFileView, PierreSnippetView } from '../../pierre';
import type { SubsystemComponent } from '../../subsystem/model';
import type { SubsystemOpenFileOptions } from '../../subsystem/declarationRef';
import type { SymbolInspection } from '../../subsystem/symbolRefs';
import type { GraphifyComponentDetail } from '../../graphify';

const meta = {
  title: 'Subsystem/ConstructsCatalog',
  component: ConstructsCatalog,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ConstructsCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Fixtures — two repos, two processes, one of each core construct kind, so the
// catalog exercises process sorting, purl grouping, and every badge/anatomy.
// ---------------------------------------------------------------------------
const INTAKE = 'pkg:github/you/notes-intake';
const UI = 'pkg:github/you/notes-ui';

const components: SubsystemComponent[] = [
  {
    alias: 'submit-note',
    name: 'submitNote',
    construct: 'function',
    symbol: 'submitNote',
    role: 'entry',
    purl: INTAKE,
    process: 'notes-api/server',
    file: 'src/api/submitNote.ts',
    purpose: 'HTTP/handler entry — validates and hands off to the service.',
    declarationRef: {
      file: 'src/api/submitNote.ts',
      startLine: 7,
      lineHash: 'storybook-placeholder',
      capturedAt: new Date(0).toISOString(),
    },
    declaration: {
      kind: 'function',
      parameters: [
        { name: 'req', type: 'SubmitNoteRequest' },
        { name: 'ctx', type: 'RequestContext' },
      ],
      returnType: 'Promise<NoteId>',
      callers: [],
      callees: [{ nodeId: 'note-service', name: 'NoteService' }],
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'note-service',
    name: 'NoteService',
    construct: 'class',
    symbol: 'NoteService',
    purl: INTAKE,
    process: 'notes-api/server',
    file: 'src/NoteService.ts',
    purpose: 'Owns intake rules; methods are separate nodes when they matter.',
    declarationRef: {
      file: 'src/NoteService.ts',
      startLine: 3,
      lineHash: 'storybook-placeholder',
      capturedAt: new Date(0).toISOString(),
    },
    declaration: {
      kind: 'class',
      methods: [
        {
          nodeId: 'note-service-persist',
          name: 'persist',
          parameters: [{ name: 'draft', type: 'NoteDraft' }],
          returnType: 'Promise<NoteId>',
        },
      ],
      properties: [{ name: 'repo', type: 'NoteRepository' }],
      extends: [],
      implements: ['NoteRepository'],
      instantiations: [],
      references: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'note-service-persist',
    name: 'persist',
    construct: 'method',
    symbol: 'NoteService.persist',
    purl: INTAKE,
    process: 'notes-api/server',
    file: 'src/NoteService.ts',
    purpose: 'Instance method on NoteService — written as its own construct.',
    declarationRef: {
      file: 'src/NoteService.ts',
      startLine: 14,
      lineHash: 'storybook-placeholder',
      capturedAt: new Date(0).toISOString(),
    },
    declaration: {
      kind: 'method',
      hostClass: 'NoteService',
      parameters: [{ name: 'draft', type: 'NoteDraft' }],
      returnType: 'Promise<NoteId>',
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'note-repository',
    name: 'NoteRepository',
    construct: 'interface',
    symbol: 'NoteRepository',
    purl: INTAKE,
    process: 'notes-api/server',
    file: 'src/NoteRepository.ts',
    purpose: 'Persistence contract the service depends on.',
    declaration: {
      kind: 'type',
      properties: [
        { name: 'save', type: '(draft: NoteDraft) => Promise<NoteId>' },
        { name: 'findById', type: '(id: NoteId) => Promise<Note | null>' },
      ],
      usedBy: [],
      implementors: ['NoteService'],
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'note-kind',
    name: 'NoteKind',
    construct: 'enum',
    symbol: 'NoteKind',
    purl: INTAKE,
    process: 'notes-api/server',
    file: 'src/types.ts',
    purpose: 'Closed set of note kinds (idea, task, …).',
    declaration: {
      kind: 'type',
      properties: [],
      usedBy: [],
      implementors: [],
      enumMembers: [
        { name: 'Idea', value: "'idea'" },
        { name: 'Task', value: "'task'" },
      ],
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'note-id',
    name: 'NoteId',
    construct: 'type_alias',
    symbol: 'NoteId',
    purl: INTAKE,
    file: 'src/types.ts',
    purpose: 'Branded id type — no process, so it sorts to the bottom.',
    declaration: {
      kind: 'type',
      properties: [],
      usedBy: [],
      implementors: [],
      aliasOf: "string & { readonly __brand: 'NoteId' }",
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'note-editor',
    name: 'NoteEditor',
    construct: 'function',
    framework: 'react',
    stereotype: 'component',
    symbol: 'NoteEditor',
    purl: UI,
    process: 'notes-web/client',
    file: 'packages/ui/NoteEditor.tsx',
    purpose: 'React component — a function playing the component stereotype.',
    declaration: {
      kind: 'function',
      parameters: [{ name: 'props', type: 'NoteEditorProps' }],
      returnType: 'JSX.Element',
      callers: [],
      callees: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'use-draft',
    name: 'useDraft',
    construct: 'function',
    framework: 'react',
    stereotype: 'hook',
    symbol: 'useDraft',
    purl: UI,
    process: 'notes-web/client',
    file: 'packages/ui/useDraft.ts',
    purpose: 'React hook — draft state for the editor.',
    declaration: {
      kind: 'function',
      parameters: [{ name: 'initial', type: 'NoteDraft' }],
      returnType: '[NoteDraft, (next: NoteDraft) => void]',
      callers: [],
      callees: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'stripe',
    name: 'stripe',
    construct: 'external',
    role: 'service',
    symbol: '',
    purl: 'pkg:npm/stripe',
    file: '',
    purpose: 'Third-party payments SDK the intake service calls out to.',
    declaration: {
      kind: 'external',
      label: 'pkg:npm/stripe',
    } satisfies GraphifyComponentDetail,
  },
];

/** Constructs with no `file` — the Files tab should not appear. */
const componentsWithoutFiles: SubsystemComponent[] = [
  {
    alias: 'remote-notes-service',
    name: 'notes-service',
    construct: 'external',
    role: 'service',
    symbol: '',
    purl: 'pkg:npm/@you/notes-service',
    file: '',
    purpose: 'External package consumer — no source file in this repo.',
    declaration: {
      kind: 'external',
      label: 'pkg:npm/@you/notes-service',
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'remote-notes-client',
    name: 'notes-client',
    construct: 'external',
    role: 'service',
    symbol: '',
    purl: 'pkg:npm/@you/notes-client',
    file: '',
    purpose: 'Second external dependency for the no-files case.',
    declaration: {
      kind: 'external',
      label: 'pkg:npm/@you/notes-client',
    } satisfies GraphifyComponentDetail,
  },
];

// ---------------------------------------------------------------------------
// Inline source fixtures for the bottom FileDrawer (no fs in Storybook).
// ---------------------------------------------------------------------------
const storyFiles: Record<string, string> = {
  'src/api/submitNote.ts': `import { NoteService } from '../NoteService';
import type { NoteId, SubmitNoteRequest, RequestContext } from '../types';

const service = new NoteService();

/** HTTP/handler entry — validates and hands off to the service. */
export async function submitNote(
  req: SubmitNoteRequest,
  ctx: RequestContext,
): Promise<NoteId> {
  return service.persist({ ...req, actor: ctx.actor });
}
`,
  'src/NoteService.ts': `import type { NoteDraft, NoteId, NoteRepository } from './types';

export class NoteService implements NoteRepository {
  constructor(readonly repo: NoteRepository) {}

  async save(draft: NoteDraft): Promise<NoteId> {
    return this.persist(draft);
  }

  async findById(id: NoteId): Promise<Note | null> {
    return this.repo.findById(id);
  }

  async persist(draft: NoteDraft): Promise<NoteId> {
    return this.repo.save(draft);
  }
}
`,
  'src/NoteRepository.ts': `import type { Note, NoteDraft, NoteId } from './types';

export interface NoteRepository {
  save(draft: NoteDraft): Promise<NoteId>;
  findById(id: NoteId): Promise<Note | null>;
}
`,
  'src/types.ts': `export type NoteId = string & { readonly __brand: 'NoteId' };

export type NoteDraft = { title: string; kind: NoteKind };

export enum NoteKind {
  Idea = 'idea',
  Task = 'task',
}
`,
  'packages/ui/NoteEditor.tsx': `import type { NoteDraft } from '../../src/types';
import { useDraft } from './useDraft';

export function NoteEditor(props: { initial: NoteDraft }) {
  const [draft, setDraft] = useDraft(props.initial);
  return <textarea value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />;
}
`,
  'packages/ui/useDraft.ts': `import { useState } from 'react';
import type { NoteDraft } from '../../src/types';

export function useDraft(initial: NoteDraft) {
  return useState<NoteDraft>(initial);
}
`,
};

function readStoryFile(path: string): Promise<string> {
  const content = storyFiles[path];
  if (content == null) return Promise.reject(new Error(`No story fixture for ${path}`));
  return Promise.resolve(content);
}

function renderFileViewer(file: string, opts?: SubsystemOpenFileOptions) {
  const startLine = opts?.startLine;
  if (startLine != null && !opts?.fullFile) {
    return (
      <PierreSnippetView
        filePath={file}
        fileName={file.split('/').pop() ?? file}
        startLine={startLine}
        endLine={startLine}
        focusLine={startLine}
        contextLines={12}
        readFile={readStoryFile}
      />
    );
  }
  return (
    <PierreFileView
      filePath={file}
      fileName={file.split('/').pop() ?? file}
      readFile={readStoryFile}
      focusLine={opts?.fullFile ? startLine : undefined}
    />
  );
}

/** Graphify lookups so referenced type tokens in declarations are clickable. */
const INSPECTIONS: Record<string, SymbolInspection> = {
  NoteRepository: {
    symbol: 'NoteRepository',
    purl: INTAKE,
    resolution: 'resolved',
    node: {
      nodeId: 'note-repository',
      label: 'NoteRepository',
      sourceFile: 'src/NoteRepository.ts',
      sourceLocation: 'L3',
    },
    declaration: {
      kind: 'type',
      properties: [
        { name: 'save', type: '(draft: NoteDraft) => Promise<NoteId>' },
        { name: 'findById', type: '(id: NoteId) => Promise<Note | null>' },
      ],
      usedBy: [],
      implementors: ['NoteService'],
    },
  },
  NoteDraft: {
    symbol: 'NoteDraft',
    purl: INTAKE,
    resolution: 'resolved',
    node: {
      nodeId: 'note-draft',
      label: 'NoteDraft',
      sourceFile: 'src/types.ts',
      sourceLocation: 'L3',
    },
    declaration: {
      kind: 'type',
      properties: [
        { name: 'title', type: 'string' },
        { name: 'kind', type: 'NoteKind' },
      ],
      usedBy: [],
      implementors: [],
    },
  },
};

function inspectSymbol(req: { symbol: string }): SymbolInspection | null {
  return INSPECTIONS[req.symbol] ?? null;
}

function CatalogDemo({
  comps = components,
  hideSidebar = false,
}: {
  comps?: SubsystemComponent[];
  hideSidebar?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ConstructsCatalog
          components={comps}
          title="Notes intake — constructs"
          description="Nothing is selected, so every construct is listed and searchable; pick a file on the left to narrow. Every file stacks under one combined header (path + a description toggle for the whole stack), each declaration labeling the line that holds the construct in a file-like gutter; external constructs get a header naming their kind with the body naming the construct. Click the header or a line to open the file."
          hideSidebar={hideSidebar}
          onSelect={(id) => setSelected(id)}
          renderFileViewer={renderFileViewer}
          onInspectSymbol={inspectSymbol}
        />
      </div>
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        {selected
          ? `last toggled: ${selected}`
          : 'click constructs to toggle their signatures'}
      </div>
    </div>
  );
}

/** Full catalog: title + description chrome, two repos, process-sorted rows. */
export const Catalog: Story = {
  args: { components },
  render: () => <CatalogDemo />,
};

/** Home-page embed shape — chrome suppressed via `hideSidebar`. */
export const Embedded: Story = {
  args: { components },
  render: () => <CatalogDemo hideSidebar />,
};

/** Constructs with no `file` — the Files tab is hidden, constructs-only list. */
export const NoFiles: Story = {
  args: { components: componentsWithoutFiles },
  render: () => <CatalogDemo comps={componentsWithoutFiles} />,
};

/** No components — the empty-state prompt in the detail pane. */
export const Empty: Story = {
  args: { components: [] },
  render: () => <CatalogDemo comps={[]} />,
};
