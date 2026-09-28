/**
 * Homepage teaching diagram for the Constructs layer.
 * Covers the core code constructs in one small, coherent subsystem.
 */
import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/notes-intake';

export const title = 'Constructs at a glance';

export const description =
  'One small intake path — each node is a different construct so you can see how declaration shape drives the diagram.';

export const components: SubsystemComponent[] = [
  {
    alias: 'submit-note',
    name: 'submitNote',
    construct: 'function',
    symbol: 'submitNote',
    role: 'entry',
    purl: PURL,
    file: 'src/api/submitNote.ts',
    purpose: 'HTTP/handler entry — validates and hands off to the service.',
    layer: 1,
  },
  {
    alias: 'note-service',
    name: 'NoteService',
    construct: 'class',
    symbol: 'NoteService',
    purl: PURL,
    file: 'src/NoteService.ts',
    purpose: 'Owns intake rules; methods are separate nodes when they matter.',
    layer: 2,
  },
  {
    alias: 'note-service-persist',
    name: 'persist',
    construct: 'method',
    symbol: 'persist',
    purl: PURL,
    file: 'src/NoteService.ts',
    purpose: 'Instance method on NoteService — written as its own construct.',
    layer: 2,
  },
  {
    alias: 'note-repository',
    name: 'NoteRepository',
    construct: 'interface',
    symbol: 'NoteRepository',
    purl: PURL,
    file: 'src/NoteRepository.ts',
    purpose: 'Persistence contract the service depends on.',
    layer: 3,
  },
  {
    alias: 'note-id',
    name: 'NoteId',
    construct: 'type_alias',
    symbol: 'NoteId',
    purl: PURL,
    file: 'src/types.ts',
    purpose: 'Branded id type — a declaration, not a runtime instance.',
    layer: 3,
  },
  {
    alias: 'note-kind',
    name: 'NoteKind',
    construct: 'enum',
    symbol: 'NoteKind',
    purl: PURL,
    file: 'src/types.ts',
    purpose: 'Closed set of note kinds (idea, task, …).',
    layer: 3,
  },
];

/** Light structural glue so the graph coheres — not the teaching focus here. */
export const relations: SubsystemRelation[] = [
  {
    id: 'svc-method',
    from: 'note-service',
    to: 'note-service-persist',
    relationType: 'method',
  },
];

export const walkthroughs = [] as SubsystemWalkthrough[];
