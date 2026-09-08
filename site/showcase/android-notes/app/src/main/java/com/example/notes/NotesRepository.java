package com.example.notes;

import androidx.lifecycle.LiveData;

/**
 * Single source of truth for notes — Room locally, optional network refresh.
 */
public class NotesRepository {
  private final NoteDao noteDao;
  private final NotesApi notesApi;

  public NotesRepository(NoteDao noteDao) {
    this(noteDao, new NotesApi());
  }

  public NotesRepository(NoteDao noteDao, NotesApi notesApi) {
    this.noteDao = noteDao;
    this.notesApi = notesApi;
  }

  public LiveData<java.util.List<Note>> observeNotes() {
    return noteDao.observeAll();
  }

  public void insert(Note note) {
    noteDao.insert(note);
  }

  public void refreshFromNetwork() {
    java.util.List<Note> remote = notesApi.fetchNotes();
    noteDao.replaceAll(remote);
  }
}
