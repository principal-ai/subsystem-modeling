import type {
  SubsystemComponent,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/swift-notes';
const SRC = 'Sources/Notes';

export const components: SubsystemComponent[] = [
  {
    alias: 'content-view',
    process: 'swift-notes',
    name: 'ContentView',
    construct: 'function',
    symbol: 'ContentView',
    role: 'entry',
    framework: 'swiftui',
    stereotype: 'view',
    purl: PURL,
    file: `${SRC}/ContentView.swift`,
    declarationRef: {
      file: 'Sources/Notes/ContentView.swift',
      startLine: 4,
      lineHash: 'ddda96719ca3854b2933c3600e077017',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'SwiftUI entry — binds to the view model only.',
    layer: 1,
  },
  {
    alias: 'notes-view-model',
    process: 'swift-notes',
    name: 'NotesViewModel',
    construct: 'class',
    symbol: 'NotesViewModel',
    framework: 'swiftui',
    stereotype: 'viewmodel',
    purl: PURL,
    file: `${SRC}/NotesViewModel.swift`,
    declarationRef: {
      file: 'Sources/Notes/NotesViewModel.swift',
      startLine: 6,
      lineHash: '4220a220ccc1c39ff3c2726db56ee10a',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'ObservableObject — maps UI intents to the repository.',
    layer: 2,
  },
  {
    alias: 'notes-repository',
    process: 'swift-notes',
    name: 'NotesRepository',
    construct: 'class',
    symbol: 'NotesRepository',
    purl: PURL,
    file: `${SRC}/NotesRepository.swift`,
    declarationRef: {
      file: 'Sources/Notes/NotesRepository.swift',
      startLine: 4,
      lineHash: 'f3b68deda902184b3273e9bf0a84b545',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Single source of truth — store + network.',
    layer: 3,
  },
  {
    alias: 'notes-store',
    process: 'swift-notes',
    name: 'NotesStore',
    construct: 'class',
    symbol: 'NotesStore',
    purl: PURL,
    file: `${SRC}/NotesStore.swift`,
    declarationRef: {
      file: 'Sources/Notes/NotesStore.swift',
      startLine: 4,
      lineHash: '891d93bd682945ea41f539db3f36fe28',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Core Data / SwiftData boundary (showcase stand-in).',
    layer: 3,
  },
  {
    alias: 'notes-api',
    process: 'swift-notes',
    name: 'NotesAPI',
    construct: 'class',
    symbol: 'NotesAPI',
    purl: PURL,
    file: `${SRC}/NotesStore.swift`,
    declarationRef: {
      file: 'Sources/Notes/NotesStore.swift',
      startLine: 15,
      lineHash: 'd036aa2372331404c25fe2585f11c729',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Thin HTTP client for remote notes.',
    layer: 3,
  },
  {
    alias: 'CoreData',
    name: 'Core Data',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'On-device persistence.',
    layer: 4,
  },
  {
    alias: 'NotesBackend',
    name: 'Notes backend',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Remote notes API.',
    layer: 4,
  },
];

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
        "purl": PURL,
        "symbol": "load",
        "annotation": "onAppear → view model."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesViewModel.swift",
        "line": 16,
        "purl": PURL,
        "symbol": "fetchAll",
        "annotation": "ViewModel loads via repository."
      },
      {
        "from": "notes-repository",
        "to": "notes-store",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesRepository.swift",
        "line": 14,
        "purl": PURL,
        "symbol": "fetchAll",
        "annotation": "Repository reads the store."
      },
      {
        "from": "notes-store",
        "to": "CoreData",
        "mechanism": "reads",
        "file": "Sources/Notes/NotesStore.swift",
        "line": 7,
        "purl": PURL,
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
        "purl": PURL,
        "symbol": "addNote",
        "annotation": "Toolbar button → view model."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesViewModel.swift",
        "line": 22,
        "purl": PURL,
        "symbol": "insert",
        "annotation": "Validate then repository insert."
      },
      {
        "from": "notes-repository",
        "to": "notes-store",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesRepository.swift",
        "line": 18,
        "purl": PURL,
        "symbol": "insert",
        "annotation": "Repository owns the write."
      },
      {
        "from": "notes-store",
        "to": "CoreData",
        "mechanism": "writes",
        "file": "Sources/Notes/NotesStore.swift",
        "line": 9,
        "purl": PURL,
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
        "purl": PURL,
        "symbol": "refresh",
        "annotation": "Refresh control."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesViewModel.swift",
        "line": 27,
        "purl": PURL,
        "symbol": "refreshFromNetwork",
        "annotation": "ViewModel → repository."
      },
      {
        "from": "notes-repository",
        "to": "notes-api",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesRepository.swift",
        "line": 22,
        "purl": PURL,
        "symbol": "fetchNotes",
        "annotation": "Network before replace."
      },
      {
        "from": "notes-api",
        "to": "NotesBackend",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesStore.swift",
        "line": 16,
        "purl": PURL,
        "symbol": "fetchNotes",
        "annotation": "HTTP to backend."
      },
      {
        "from": "notes-repository",
        "to": "notes-store",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesRepository.swift",
        "line": 23,
        "purl": PURL,
        "symbol": "replaceAll",
        "annotation": "Replace local cache."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'SwiftUI notes screen';
export const description =
  'iOS twin to the Android case: **SwiftUI → ViewModel → Repository → Core Data/API**. Open **Walkthroughs** for open, add, and refresh.';
