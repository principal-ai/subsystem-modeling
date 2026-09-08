package com.example.notes;

import androidx.lifecycle.LiveData;
import androidx.lifecycle.ViewModel;

/**
 * Survives configuration changes — maps UI intents to repository calls.
 */
public class NotesViewModel extends ViewModel {
  private final NotesRepository repository;

  public NotesViewModel(NotesRepository repository) {
    this.repository = repository;
  }

  /** Default factory path in the showcase — real apps use a ViewModelFactory. */
  public NotesViewModel() {
    this(new NotesRepository(AppDatabase.getInstance().noteDao()));
  }

  public LiveData<java.util.List<Note>> getNotes() {
    return repository.observeNotes();
  }

  public void addNote(String body) {
    if (body == null || body.isBlank()) return;
    repository.insert(new Note(body.trim()));
  }

  public void refresh() {
    repository.refreshFromNetwork();
  }
}
