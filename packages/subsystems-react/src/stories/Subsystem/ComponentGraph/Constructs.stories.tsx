import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import { PierreFileView, PierreSnippetView } from '../../../pierre';
import type { SubsystemComponent } from '../../../subsystem/model';
import type { SubsystemOpenFileOptions } from '../../../subsystem/declarationRef';
import type { GraphifyComponentDetail } from '../../../graphify';

const meta = {
  title: 'Subsystem/ComponentGraph/Constructs',
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

const PURL = 'pkg:github/you/notes-intake';

/** One construct of each core kind, no relations — the catalog view. */
const constructsOnly: SubsystemComponent[] = [
  {
    alias: 'submit-note',
    name: 'submitNote',
    construct: 'function',
    symbol: 'submitNote',
    role: 'entry',
    purl: PURL,
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
    purl: PURL,
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
      implements: ['NoteRepository'],
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'note-service-persist',
    name: 'persist',
    construct: 'method',
    symbol: 'NoteService.persist',
    purl: PURL,
    file: 'src/NoteService.ts',
    purpose: 'Instance method on NoteService — written as its own construct.',
    declarationRef: {
      file: 'src/NoteService.ts',
      startLine: 14,
      lineHash: 'storybook-placeholder',
      capturedAt: new Date(0).toISOString(),
    },
    declaration: {
      kind: 'function',
      parameters: [{ name: 'draft', type: 'NoteDraft' }],
      returnType: 'Promise<NoteId>',
      callers: [{ nodeId: 'submit-note', name: 'submitNote' }],
      callees: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'note-repository',
    name: 'NoteRepository',
    construct: 'interface',
    symbol: 'NoteRepository',
    purl: PURL,
    file: 'src/NoteRepository.ts',
    purpose: 'Persistence contract the service depends on.',
    declarationRef: {
      file: 'src/NoteRepository.ts',
      startLine: 1,
      lineHash: 'storybook-placeholder',
      capturedAt: new Date(0).toISOString(),
    },
    declaration: {
      kind: 'type',
      properties: [
        { name: 'save', type: '(draft: NoteDraft) => Promise<NoteId>' },
        { name: 'findById', type: '(id: NoteId) => Promise<Note | null>' },
      ],
      implementors: ['NoteService'],
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'note-id',
    name: 'NoteId',
    construct: 'type_alias',
    symbol: 'NoteId',
    purl: PURL,
    file: 'src/types.ts',
    purpose: 'Branded id type — a declaration, not a runtime instance.',
    declarationRef: {
      file: 'src/types.ts',
      startLine: 1,
      lineHash: 'storybook-placeholder',
      capturedAt: new Date(0).toISOString(),
    },
    declaration: {
      kind: 'type',
      aliasOf: "string & { readonly __brand: 'NoteId' }",
    } satisfies GraphifyComponentDetail,
  },
  {
    alias: 'note-kind',
    name: 'NoteKind',
    construct: 'enum',
    symbol: 'NoteKind',
    purl: PURL,
    file: 'src/types.ts',
    purpose: 'Closed set of note kinds (idea, task, …).',
    declarationRef: {
      file: 'src/types.ts',
      startLine: 5,
      lineHash: 'storybook-placeholder',
      capturedAt: new Date(0).toISOString(),
    },
    declaration: {
      kind: 'type',
      enumMembers: [
        { name: 'Idea', value: "'idea'" },
        { name: 'Task', value: "'task'" },
      ],
    } satisfies GraphifyComponentDetail,
  },
];

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

function CatalogDemo({ hideSidebar = false }: { hideSidebar?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={constructsOnly}
        title="Constructs at a glance"
        description="Layer 1 — constructs only. Click a file path or L# to open the declaration source."
        hideSidebar={hideSidebar}
        onSelect={(id) => setSelected(id)}
        renderFileViewer={renderFileViewer}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        {selected
          ? `last toggled: ${selected}`
          : 'click constructs to toggle their signatures'}
      </div>
    </div>
  );
}

/** Homepage-style embed: list of constructs on the left, signature on the right. */
export const Catalog: Story = {
  render: () => <CatalogDemo />,
};

/** Same catalog, no title chrome — the shape the home-page constructs layer uses. */
export const CatalogEmbed: Story = {
  render: () => <CatalogDemo hideSidebar />,
};
