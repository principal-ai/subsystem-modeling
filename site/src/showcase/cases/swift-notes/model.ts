import type {
  SubsystemComponent,
  SubsystemTrail,
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
    declarationSpan: {
      startLine: 4,
      endLine: 4,
      contentHash: 'ddda96719ca3854b2933c3600e077017',
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
    declarationSpan: {
      startLine: 6,
      endLine: 6,
      contentHash: '4220a220ccc1c39ff3c2726db56ee10a',
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
    declarationSpan: {
      startLine: 4,
      endLine: 4,
      contentHash: 'f3b68deda902184b3273e9bf0a84b545',
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
    declarationSpan: {
      startLine: 4,
      endLine: 4,
      contentHash: '891d93bd682945ea41f539db3f36fe28',
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
    declarationSpan: {
      startLine: 15,
      endLine: 15,
      contentHash: 'd036aa2372331404c25fe2585f11c729',
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

export const trails = [
  {
    "id": "tl-open",
    "title": "Open notes screen",
    "steps": [
      {
        "from": "content-view",
        "to": "notes-view-model",
        "mechanism": "calls",
        "file": "Sources/Notes/ContentView.swift",
        "span": {
          "startLine": 17,
          "endLine": 17,
          "contentHash": "c1b1421cfab60270b89c2016b5f36400"
        },
        "purl": PURL,
        "symbol": "load",
        "annotation": "onAppear → view model."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesViewModel.swift",
        "span": {
          "startLine": 16,
          "endLine": 16,
          "contentHash": "8fe74d192af1db60b1f4f1b8e07f9d20"
        },
        "purl": PURL,
        "symbol": "fetchAll",
        "annotation": "ViewModel loads via repository."
      },
      {
        "from": "notes-repository",
        "to": "notes-store",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesRepository.swift",
        "span": {
          "startLine": 14,
          "endLine": 14,
          "contentHash": "b20f3585e27634d6e7db2125db40b19c"
        },
        "purl": PURL,
        "symbol": "fetchAll",
        "annotation": "Repository reads the store."
      },
      {
        "from": "notes-store",
        "to": "CoreData",
        "mechanism": "reads",
        "file": "Sources/Notes/NotesStore.swift",
        "span": {
          "startLine": 7,
          "endLine": 7,
          "contentHash": "6ebd01e29ab8f369d396da9ba51b8732"
        },
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
        "span": {
          "startLine": 14,
          "endLine": 14,
          "contentHash": "41f6b397a3d82402baa2a5ebda2b6bce"
        },
        "purl": PURL,
        "symbol": "addNote",
        "annotation": "Toolbar button → view model."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesViewModel.swift",
        "span": {
          "startLine": 22,
          "endLine": 22,
          "contentHash": "bacbc3928cf2167359cfe6dad066a9b8"
        },
        "purl": PURL,
        "symbol": "insert",
        "annotation": "Validate then repository insert."
      },
      {
        "from": "notes-repository",
        "to": "notes-store",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesRepository.swift",
        "span": {
          "startLine": 18,
          "endLine": 18,
          "contentHash": "85ea13410a6959aaba358f84ebb7f1fe"
        },
        "purl": PURL,
        "symbol": "insert",
        "annotation": "Repository owns the write."
      },
      {
        "from": "notes-store",
        "to": "CoreData",
        "mechanism": "writes",
        "file": "Sources/Notes/NotesStore.swift",
        "span": {
          "startLine": 9,
          "endLine": 9,
          "contentHash": "a4f4e0fe95de2bd9cb541ba8feb53f9a"
        },
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
        "span": {
          "startLine": 15,
          "endLine": 15,
          "contentHash": "ffba23d7ab7324b4d0bca6b37f08373b"
        },
        "purl": PURL,
        "symbol": "refresh",
        "annotation": "Refresh control."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesViewModel.swift",
        "span": {
          "startLine": 27,
          "endLine": 27,
          "contentHash": "0dab0929c71d5fb8e4f9f84a930127c9"
        },
        "purl": PURL,
        "symbol": "refreshFromNetwork",
        "annotation": "ViewModel → repository."
      },
      {
        "from": "notes-repository",
        "to": "notes-api",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesRepository.swift",
        "span": {
          "startLine": 22,
          "endLine": 22,
          "contentHash": "34f5577263f6ede80c7a74dce8878127"
        },
        "purl": PURL,
        "symbol": "fetchNotes",
        "annotation": "Network before replace."
      },
      {
        "from": "notes-api",
        "to": "NotesBackend",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesStore.swift",
        "span": {
          "startLine": 16,
          "endLine": 16,
          "contentHash": "c5a15f13dd17313f86793d5718b0eeaf"
        },
        "purl": PURL,
        "symbol": "fetchNotes",
        "annotation": "HTTP to backend."
      },
      {
        "from": "notes-repository",
        "to": "notes-store",
        "mechanism": "calls",
        "file": "Sources/Notes/NotesRepository.swift",
        "span": {
          "startLine": 23,
          "endLine": 23,
          "contentHash": "f97b8093a0d890e73fb946d276fbf5ec"
        },
        "purl": PURL,
        "symbol": "replaceAll",
        "annotation": "Replace local cache."
      }
    ]
  }
] as SubsystemTrail[];

export const title = 'SwiftUI notes screen';
export const description =
  'iOS twin to the Android case: **SwiftUI → ViewModel → Repository → Core Data/API**. Open **Trails** for open, add, and refresh.';
