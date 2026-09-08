package com.example.notes;

import androidx.lifecycle.LiveData;
import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.Query;
import androidx.room.Transaction;
import java.util.List;

/** Room access object — the local persistence boundary. */
@Dao
public interface NoteDao {
  @Query("SELECT * FROM notes ORDER BY created_at DESC")
  LiveData<List<Note>> observeAll();

  @Insert
  void insert(Note note);

  @Transaction
  default void replaceAll(List<Note> notes) {
    deleteAll();
    for (Note n : notes) insert(n);
  }

  @Query("DELETE FROM notes")
  void deleteAll();
}
