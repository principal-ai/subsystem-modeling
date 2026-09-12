import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

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

export const relations = [] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-open",
    "title": "Open notes screen",
    "steps": [
      {
        "from": "content-view",
        "to": "notes-view-model",
        "mechanism": "calls",
        "file": "Sources/Notes/ContentView.swift",
        "line": 17,
        "symbol": "load",
        "annotation": "onAppear → view model."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesViewModel.swift",
        "line": 16,
        "symbol": "fetchAll",
        "annotation": "ViewModel loads via repository."
      },
      {
        "from": "notes-repository",
        "to": "notes-store",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesRepository.swift",
        "line": 14,
        "symbol": "fetchAll",
        "annotation": "Repository reads the store."
      },
      {
        "from": "notes-store",
        "to": "CoreData",
        "mechanism": "reads",
        "file": "Sources/Notes/NotesStore.swift",
        "line": 7,
        "symbol": "fetchAll",
        "annotation": "Local persistence boundary."
      }
    ]
  },
  {
    "id": "tl-save",
    "title": "Add a note",
    "steps": [
      {
        "from": "content-view",
        "to": "notes-view-model",
        "mechanism": "calls",
        "file": "Sources/Notes/ContentView.swift",
        "line": 14,
        "symbol": "addNote",
        "annotation": "Toolbar button → view model."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesViewModel.swift",
        "line": 22,
        "symbol": "insert",
        "annotation": "Validate then repository insert."
      },
      {
        "from": "notes-repository",
        "to": "notes-store",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesRepository.swift",
        "line": 18,
        "symbol": "insert",
        "annotation": "Repository owns the write."
      },
      {
        "from": "notes-store",
        "to": "CoreData",
        "mechanism": "writes",
        "file": "Sources/Notes/NotesStore.swift",
        "line": 9,
        "symbol": "insert",
        "annotation": "Persist locally."
      }
    ]
  },
  {
    "id": "tl-refresh",
    "title": "Refresh from network",
    "steps": [
      {
        "from": "content-view",
        "to": "notes-view-model",
        "mechanism": "calls",
        "file": "Sources/Notes/ContentView.swift",
        "line": 15,
        "symbol": "refresh",
        "annotation": "Refresh control."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesViewModel.swift",
        "line": 27,
        "symbol": "refreshFromNetwork",
        "annotation": "ViewModel → repository."
      },
      {
        "from": "notes-repository",
        "to": "notes-api",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesRepository.swift",
        "line": 22,
        "symbol": "fetchNotes",
        "annotation": "Network before replace."
      },
      {
        "from": "notes-api",
        "to": "NotesBackend",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesStore.swift",
        "line": 16,
        "symbol": "fetchNotes",
        "annotation": "HTTP to backend."
      },
      {
        "from": "notes-repository",
        "to": "notes-store",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesRepository.swift",
        "line": 23,
        "symbol": "replaceAll",
        "annotation": "Replace local cache."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'SwiftUI notes screen';
export const description =
  'iOS twin to the Android case: **SwiftUI → ViewModel → Repository → Core Data/API**. Open **Walkthroughs** for open, add, and refresh.';
