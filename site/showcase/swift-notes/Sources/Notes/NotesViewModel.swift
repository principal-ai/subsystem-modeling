import Foundation
import Combine

/// Maps UI intents to the repository — ObservableObject for SwiftUI.
@MainActor
final class NotesViewModel: ObservableObject {
  @Published private(set) var notes: [Note] = []

  private let repository: NotesRepository

  init(repository: NotesRepository = NotesRepository()) {
    self.repository = repository
  }

  func load() {
    notes = repository.fetchAll()
  }

  func addNote(_ body: String) {
    let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    repository.insert(Note(body: trimmed))
    load()
  }

  func refresh() {
    repository.refreshFromNetwork()
    load()
  }
}

struct Note: Identifiable {
  let id = UUID()
  let body: String
}
