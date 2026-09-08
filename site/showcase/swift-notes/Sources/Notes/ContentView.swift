import SwiftUI

/// Notes screen — SwiftUI entry. Binds to the view model; never talks to Core Data.
struct ContentView: View {
  @StateObject private var viewModel = NotesViewModel()

  var body: some View {
    NavigationStack {
      List(viewModel.notes) { note in
        Text(note.body)
      }
      .navigationTitle("Notes")
      .toolbar {
        Button("Add") { viewModel.addNote("New note") }
        Button("Refresh") { viewModel.refresh() }
      }
      .onAppear { viewModel.load() }
    }
  }
}
