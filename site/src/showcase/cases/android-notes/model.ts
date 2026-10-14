import type {
  SubsystemComponent,
  SubsystemTrail,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/android-notes';
const JAVA = 'app/src/main/java/com/example/notes';

export const components: SubsystemComponent[] = [
  {
    alias: 'main-activity',
    process: 'android-notes',
    name: 'MainActivity',
    construct: 'class',
    symbol: 'MainActivity',
    role: 'entry',
    framework: 'android',
    stereotype: 'activity',
    purl: PURL,
    file: `${JAVA}/MainActivity.java`,
    declarationSpan: {
      startLine: 13,
      endLine: 13,
      contentHash: 'f6d53f156824e685a26239a8d3720667',
    },
    purpose: 'UI entry — wires views to the ViewModel; never touches Room.',
    layer: 1,
  },
  {
    alias: 'notes-view-model',
    process: 'android-notes',
    name: 'NotesViewModel',
    construct: 'class',
    symbol: 'NotesViewModel',
    framework: 'android',
    stereotype: 'viewmodel',
    purl: PURL,
    file: `${JAVA}/NotesViewModel.java`,
    declarationSpan: {
      startLine: 9,
      endLine: 9,
      contentHash: 'b727d5506f33862275a36a5ae4b8c809',
    },
    purpose: 'Survives rotation — maps UI intents to repository calls.',
    layer: 2,
  },
  {
    alias: 'notes-repository',
    process: 'android-notes',
    name: 'NotesRepository',
    construct: 'class',
    symbol: 'NotesRepository',
    purl: PURL,
    file: `${JAVA}/NotesRepository.java`,
    declarationSpan: {
      startLine: 8,
      endLine: 8,
      contentHash: '56c8edc77e6c7f08a13419948a119f9e',
    },
    purpose: 'Single source of truth — Room locally, network on refresh.',
    layer: 3,
  },
  {
    alias: 'note-dao',
    process: 'android-notes',
    name: 'NoteDao',
    construct: 'interface',
    symbol: 'NoteDao',
    framework: 'android',
    stereotype: 'dao',
    purl: PURL,
    file: `${JAVA}/NoteDao.java`,
    declarationSpan: {
      startLine: 12,
      endLine: 12,
      contentHash: '173aa7cdd142fbaba31260e14cf4e233',
    },
    purpose: 'Room DAO — local persistence boundary.',
    layer: 3,
  },
  {
    alias: 'notes-api',
    process: 'android-notes',
    name: 'NotesApi',
    construct: 'class',
    symbol: 'NotesApi',
    purl: PURL,
    file: `${JAVA}/NotesApi.java`,
    declarationSpan: {
      startLine: 7,
      endLine: 7,
      contentHash: 'f46f44164495bd6f3bf03cf84864001d',
    },
    purpose: 'Thin HTTP client for remote notes.',
    layer: 3,
  },
  {
    alias: 'Room',
    name: 'Room',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'On-device SQLite via Room.',
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
        "from": "main-activity",
        "to": "notes-view-model",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/MainActivity.java",
        "span": {
          "startLine": 26,
          "endLine": 26,
          "contentHash": "070696a5615b8af275ff1c825f76fd4e"
        },
        "purl": PURL,
        "symbol": "getNotes().observe",
        "annotation": "Activity observes LiveData from the ViewModel."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesViewModel.java",
        "span": {
          "startLine": 22,
          "endLine": 22,
          "contentHash": "418ad670373c86a7188a77ee2ace36d6"
        },
        "purl": PURL,
        "symbol": "observeNotes",
        "annotation": "ViewModel forwards to the repository."
      },
      {
        "from": "notes-repository",
        "to": "note-dao",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesRepository.java",
        "span": {
          "startLine": 22,
          "endLine": 22,
          "contentHash": "13b5d96ffe3d9012df92abccc4ee8f8d"
        },
        "purl": PURL,
        "symbol": "observeAll",
        "annotation": "Repository reads through the DAO — not the Activity."
      },
      {
        "from": "note-dao",
        "to": "Room",
        "mechanism": "reads",
        "file": "app/src/main/java/com/example/notes/NoteDao.java",
        "span": {
          "startLine": 14,
          "endLine": 14,
          "contentHash": "43b0e26b7b460ca1aadd7e5af043d62d"
        },
        "purl": PURL,
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
        "span": {
          "startLine": 27,
          "endLine": 27,
          "contentHash": "e2df7c2228d7d6ec904e97392139ad82"
        },
        "purl": PURL,
        "symbol": "addNote",
        "annotation": "Click handler → ViewModel only."
      },
      {
        "from": "notes-view-model",
        "to": "notes-repository",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesViewModel.java",
        "span": {
          "startLine": 27,
          "endLine": 27,
          "contentHash": "b078ffaf041f60e9346fafd5af5a48bd"
        },
        "purl": PURL,
        "symbol": "insert",
        "annotation": "ViewModel validates, then repository insert."
      },
      {
        "from": "notes-repository",
        "to": "note-dao",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesRepository.java",
        "span": {
          "startLine": 26,
          "endLine": 26,
          "contentHash": "06da5909a301047b49c40d83b138cfb0"
        },
        "purl": PURL,
        "symbol": "insert",
        "annotation": "Repository owns the write."
      },
      {
        "from": "note-dao",
        "to": "Room",
        "mechanism": "writes",
        "file": "app/src/main/java/com/example/notes/NoteDao.java",
        "span": {
          "startLine": 17,
          "endLine": 17,
          "contentHash": "f61305b7d7476f6bd6f38278dbe584dd"
        },
        "purl": PURL,
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
        "span": {
          "startLine": 31,
          "endLine": 31,
          "contentHash": "0b512d6301e293213aa9b155a5948662"
        },
        "purl": PURL,
        "symbol": "refreshFromNetwork",
        "annotation": "Pull-to-refresh style intent."
      },
      {
        "from": "notes-repository",
        "to": "notes-api",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesRepository.java",
        "span": {
          "startLine": 30,
          "endLine": 30,
          "contentHash": "dbacedeb3a258efb0e2fe6052e2839ca"
        },
        "purl": PURL,
        "symbol": "fetchNotes",
        "annotation": "Network before touching Room."
      },
      {
        "from": "notes-api",
        "to": "NotesBackend",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesApi.java",
        "span": {
          "startLine": 8,
          "endLine": 8,
          "contentHash": "bd7494c56e0041a79722d67b63a726ca"
        },
        "purl": PURL,
        "symbol": "fetchNotes",
        "annotation": "HTTP to the notes backend."
      },
      {
        "from": "notes-repository",
        "to": "note-dao",
        "mechanism": "calls",
        "file": "app/src/main/java/com/example/notes/NotesRepository.java",
        "span": {
          "startLine": 31,
          "endLine": 31,
          "contentHash": "be0ae7faed6a82cf91b2ffa8597dbc33"
        },
        "purl": PURL,
        "symbol": "replaceAll",
        "annotation": "Replace local cache with remote payload."
      },
      {
        "from": "note-dao",
        "to": "Room",
        "mechanism": "writes",
        "file": "app/src/main/java/com/example/notes/NoteDao.java",
        "span": {
          "startLine": 20,
          "endLine": 20,
          "contentHash": "fb15a0f97f34acf0447b3c9da57bdae9"
        },
        "purl": PURL,
        "symbol": "replaceAll",
        "annotation": "Transactional Room rewrite."
      }
    ]
  }
] as SubsystemTrail[];

export const title = 'Android notes screen';

export const description =
  'Classic Android layering: **Activity → ViewModel → Repository → Room/API**. The UI never talks to the database. Open **Trails** for open, save, and network refresh.';
