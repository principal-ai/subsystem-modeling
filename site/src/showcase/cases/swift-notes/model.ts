import type {
  SubsystemComponent,
  SubsystemComponentEdge,
} from '@principal-ai/subsystems-react';
import type { SubsystemThroughline } from '@principal-ai/subsystems-react/dist/subsystem/model.js';

const PURL = 'pkg:github/you/swift-notes';
const SRC = 'Sources/Notes';

export const components: SubsystemComponent[] = [
  {
    id: 'content-view',
    process: 'swift-notes',
    name: 'ContentView',
    construct: 'function',
    symbol: 'ContentView',
    role: 'entry',
    framework: 'swiftui',
    stereotype: 'view',
    purl: PURL,
    file: `${SRC}/ContentView.swift`,
    purpose: 'SwiftUI entry — binds to the view model only.',
    layer: 1,
  },
  {
    id: 'notes-view-model',
    process: 'swift-notes',
    name: 'NotesViewModel',
    construct: 'class',
    symbol: 'NotesViewModel',
    framework: 'swiftui',
    stereotype: 'viewmodel',
    purl: PURL,
    file: `${SRC}/NotesViewModel.swift`,
    purpose: 'ObservableObject — maps UI intents to the repository.',
    layer: 2,
  },
  {
    id: 'notes-repository',
    process: 'swift-notes',
    name: 'NotesRepository',
    construct: 'class',
    symbol: 'NotesRepository',
    purl: PURL,
    file: `${SRC}/NotesRepository.swift`,
    purpose: 'Single source of truth — store + network.',
    layer: 3,
  },
  {
    id: 'notes-store',
    process: 'swift-notes',
    name: 'NotesStore',
    construct: 'class',
    symbol: 'NotesStore',
    purl: PURL,
    file: `${SRC}/NotesStore.swift`,
    purpose: 'Core Data / SwiftData boundary (showcase stand-in).',
    layer: 3,
  },
  {
    id: 'notes-api',
    process: 'swift-notes',
    name: 'NotesAPI',
    construct: 'class',
    symbol: 'NotesAPI',
    purl: PURL,
    file: `${SRC}/NotesStore.swift`,
    purpose: 'Thin HTTP client for remote notes.',
    layer: 3,
  },
  {
    id: 'CoreData',
    name: 'Core Data',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'On-device persistence.',
    layer: 4,
  },
  {
    id: 'NotesBackend',
    name: 'Notes backend',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Remote notes API.',
    layer: 4,
  },
];

export const edges: SubsystemComponentEdge[] = [
  { id: 'e0', from: 'content-view', to: 'notes-view-model', mechanism: 'calls' },
  { id: 'e1', from: 'notes-view-model', to: 'notes-repository', mechanism: 'calls' },
  { id: 'e2', from: 'notes-repository', to: 'notes-store', mechanism: 'calls' },
  { id: 'e3', from: 'notes-repository', to: 'notes-api', mechanism: 'calls' },
  { id: 'e4', from: 'notes-store', to: 'CoreData', mechanism: 'reads' },
  { id: 'e5', from: 'notes-store', to: 'CoreData', mechanism: 'writes' },
  { id: 'e6', from: 'notes-api', to: 'NotesBackend', mechanism: 'calls' },
];

export const throughlines: SubsystemThroughline[] = [
  {
    id: 'tl-open',
    title: 'Open notes screen',
    steps: [
      { edgeId: 'e0', file: `${SRC}/ContentView.swift`, line: 17, symbol: 'load', annotation: 'onAppear → view model.' },
      { edgeId: 'e1', file: `${SRC}/NotesViewModel.swift`, line: 16, symbol: 'fetchAll', annotation: 'ViewModel loads via repository.' },
      { edgeId: 'e2', file: `${SRC}/NotesRepository.swift`, line: 14, symbol: 'fetchAll', annotation: 'Repository reads the store.' },
      { edgeId: 'e4', file: `${SRC}/NotesStore.swift`, line: 7, symbol: 'fetchAll', annotation: 'Local persistence boundary.' },
    ],
  },
  {
    id: 'tl-save',
    title: 'Add a note',
    steps: [
      { edgeId: 'e0', file: `${SRC}/ContentView.swift`, line: 14, symbol: 'addNote', annotation: 'Toolbar button → view model.' },
      { edgeId: 'e1', file: `${SRC}/NotesViewModel.swift`, line: 22, symbol: 'insert', annotation: 'Validate then repository insert.' },
      { edgeId: 'e2', file: `${SRC}/NotesRepository.swift`, line: 18, symbol: 'insert', annotation: 'Repository owns the write.' },
      { edgeId: 'e5', file: `${SRC}/NotesStore.swift`, line: 9, symbol: 'insert', annotation: 'Persist locally.' },
    ],
  },
  {
    id: 'tl-refresh',
    title: 'Refresh from network',
    steps: [
      { edgeId: 'e0', file: `${SRC}/ContentView.swift`, line: 15, symbol: 'refresh', annotation: 'Refresh control.' },
      { edgeId: 'e1', file: `${SRC}/NotesViewModel.swift`, line: 27, symbol: 'refreshFromNetwork', annotation: 'ViewModel → repository.' },
      { edgeId: 'e3', file: `${SRC}/NotesRepository.swift`, line: 22, symbol: 'fetchNotes', annotation: 'Network before replace.' },
      { edgeId: 'e6', file: `${SRC}/NotesStore.swift`, line: 16, symbol: 'fetchNotes', annotation: 'HTTP to backend.' },
      { edgeId: 'e2', file: `${SRC}/NotesRepository.swift`, line: 23, symbol: 'replaceAll', annotation: 'Replace local cache.' },
    ],
  },
];

export const title = 'SwiftUI notes screen';
export const description =
  'iOS twin to the Android case: **SwiftUI → ViewModel → Repository → Core Data/API**. Open **Flows** for open, add, and refresh.';
