package com.example.notes;

import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import androidx.appcompat.app.AppCompatActivity;
import androidx.lifecycle.ViewModelProvider;
import androidx.recyclerview.widget.RecyclerView;

/**
 * Notes screen — Android entry. Wires UI to the ViewModel; never talks to Room.
 */
public class MainActivity extends AppCompatActivity {
  private NotesViewModel viewModel;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setContentView(R.layout.activity_main);

    viewModel = new ViewModelProvider(this).get(NotesViewModel.class);
    RecyclerView list = findViewById(R.id.notes_list);
    EditText input = findViewById(R.id.note_input);
    Button save = findViewById(R.id.save_button);

    viewModel.getNotes().observe(this, notes -> list.setAdapter(new NotesAdapter(notes)));
    save.setOnClickListener(v -> viewModel.addNote(input.getText().toString()));
  }
}
