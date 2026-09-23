import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/android-notes';
const JAVA = 'app/src/main/java/com/example/notes';

export const components: SubsystemComponent[] = [
  {
    id: 'main-activity',
    process: 'android-notes',
    name: 'MainActivity',
    construct: 'class',
    symbol: 'MainActivity',
    role: 'entry',
    framework: 'android',
    stereotype: 'activity',
    purl: PURL,
    file: `${JAVA}/MainActivity.java`,
    declarationRef: {
      file: 'app/src/main/java/com/example/notes/MainActivity.java',
      startLine: 13,
      lineHash: 'f6d53f156824e685a26239a8d3720667',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'UI entry — wires views to the ViewModel; never touches Room.',
    layer: 1,
  },
  {
    id: 'notes-view-model',
    process: 'android-notes',
    name: 'NotesViewModel',
    construct: 'class',
    symbol: 'NotesViewModel',
    framework: 'android',
    stereotype: 'viewmodel',
    purl: PURL,
    file: `${JAVA}/NotesViewModel.java`,
    declarationRef: {
      file: 'app/src/main/java/com/example/notes/NotesViewModel.java',
      startLine: 9,
      lineHash: 'b727d5506f33862275a36a5ae4b8c809',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Survives rotation — maps UI intents to repository calls.',
    layer: 2,
  },
  {
    id: 'notes-repository',
    process: 'android-notes',
    name: 'NotesRepository',
    construct: 'class',
    symbol: 'NotesRepository',
    purl: PURL,
    file: `${JAVA}/NotesRepository.java`,
    declarationRef: {
      file: 'app/src/main/java/com/example/notes/NotesRepository.java',
      startLine: 8,
      lineHash: '56c8edc77e6c7f08a13419948a119f9e',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Single source of truth — Room locally, network on refresh.',
    layer: 3,
  },
  {
    id: 'note-dao',
    process: 'android-notes',
    name: 'NoteDao',
    construct: 'interface',
    symbol: 'NoteDao',
    framework: 'android',
    stereotype: 'dao',
    purl: PURL,
    file: `${JAVA}/NoteDao.java`,
    declarationRef: {
      file: 'app/src/main/java/com/example/notes/NoteDao.java',
      startLine: 12,
      lineHash: '173aa7cdd142fbaba31260e14cf4e233',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Room DAO — local persistence boundary.',
    layer: 3,
  },
  {
    id: 'notes-api',
    process: 'android-notes',
    name: 'NotesApi',
    construct: 'class',
    symbol: 'NotesApi',
    purl: PURL,
    file: `${JAVA}/NotesApi.java`,
    declarationRef: {
      file: 'app/src/main/java/com/example/notes/NotesApi.java',
      startLine: 7,
      lineHash: 'f46f44164495bd6f3bf03cf84864001d',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Thin HTTP client for remote notes.',
    layer: 3,
  },
  {
    id: 'Room',
    name: 'Room',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'On-device SQLite via Room.',
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

export const relations = [
  {
    id: 'activity-vm',
    from: 'main-activity',
    to: 'notes-view-model',
    relationType: 'references',
  },
  {
    id: 'vm-repo',
    from: 'notes-view-model',
    to: 'notes-repository',
    relationType: 'references',
  },
  {
    id: 'repo-dao',
    from: 'notes-repository',
    to: 'note-dao',
    relationType: 'references',
  },
  {
    id: 'repo-api',
    from: 'notes-repository',
    to: 'notes-api',
    relationType: 'references',
  },
  {
    id: 'dao-room',
    from: 'note-dao',
    to: 'Room',
    relationType: 'references',
  },
  {
    id: 'api-backend',
    from: 'notes-api',
    to: 'NotesBackend',
    relationType: 'references',
  },
] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-open",
    "title": "Open notes screen",
    "steps": [
      {
        "from": "main-activity",
        "to": "notes-view-model",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/MainActivity.java",
        "line": 26,
        "symbol": "getNotes().observe",
        "annotation": "Activity observes LiveData from the ViewModel."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesViewModel.java",
        "line": 22,
        "symbol": "observeNotes",
        "annotation": "ViewModel forwards to the repository."
      },
      {
        "from": "notes-repository",
        "to": "note-dao",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesRepository.java",
        "line": 22,
        "symbol": "observeAll",
        "annotation": "Repository reads through the DAO — not the Activity."
      },
      {
        "from": "note-dao",
        "to": "Room",
        "mechanism": "reads",
        "file": "app/src/main/java/com/example/notes/NoteDao.java",
        "line": 14,
        "symbol": "observeAll",
        "annotation": "Room query powers the list."
      }
    ]
  },
  {
    "id": "tl-save",
    "title": "Save a note",
    "steps": [
      {
        "from": "main-activity",
        "to": "notes-view-model",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/MainActivity.java",
        "line": 27,
        "symbol": "addNote",
        "annotation": "Click handler → ViewModel only."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesViewModel.java",
        "line": 27,
        "symbol": "insert",
        "annotation": "ViewModel validates, then repository insert."
      },
      {
        "from": "notes-repository",
        "to": "note-dao",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesRepository.java",
        "line": 26,
        "symbol": "insert",
        "annotation": "Repository owns the write."
      },
      {
        "from": "note-dao",
        "to": "Room",
        "mechanism": "writes",
        "file": "app/src/main/java/com/example/notes/NoteDao.java",
        "line": 17,
        "symbol": "insert",
        "annotation": "Room persists on device."
      }
    ]
  },
  {
    "id": "tl-refresh",
    "title": "Refresh from network",
    "steps": [
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesViewModel.java",
        "line": 31,
        "symbol": "refreshFromNetwork",
        "annotation": "Pull-to-refresh style intent."
      },
      {
        "from": "notes-repository",
        "to": "notes-api",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesRepository.java",
        "line": 30,
        "symbol": "fetchNotes",
        "annotation": "Network before touching Room."
      },
      {
        "from": "notes-api",
        "to": "NotesBackend",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesApi.java",
        "line": 8,
        "symbol": "fetchNotes",
        "annotation": "HTTP to the notes backend."
      },
      {
        "from": "notes-repository",
        "to": "note-dao",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesRepository.java",
        "line": 31,
        "symbol": "replaceAll",
        "annotation": "Replace local cache with remote payload."
      },
      {
        "from": "note-dao",
        "to": "Room",
        "mechanism": "writes",
        "file": "app/src/main/java/com/example/notes/NoteDao.java",
        "line": 20,
        "symbol": "replaceAll",
        "annotation": "Transactional Room rewrite."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Android notes screen';

export const description =
  'Classic Android layering: **Activity → ViewModel → Repository → Room/API**. The UI never talks to the database. Open **Walkthroughs** for open, save, and network refresh.';
