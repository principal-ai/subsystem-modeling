package com.example.notes;

/** Showcase stand-ins so Activity/ViewModel fixtures read cleanly. */
class Note {
  final String body;
  Note(String body) { this.body = body; }
}

class NotesAdapter {
  NotesAdapter(java.util.List<Note> notes) {}
}

class AppDatabase {
  static AppDatabase getInstance() { return new AppDatabase(); }
  NoteDao noteDao() { return null; }
}

class R {
  static class layout { static final int activity_main = 0; }
  static class id {
    static final int notes_list = 0;
    static final int note_input = 0;
    static final int save_button = 0;
  }
}
