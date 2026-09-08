import Foundation

/// Core Data / SwiftData boundary (showcase stand-in).
final class NotesStore {
  private var rows: [Note] = []

  func fetchAll() -> [Note] { rows }

  func insert(_ note: Note) { rows.append(note) }

  func replaceAll(_ notes: [Note]) { rows = notes }
}

/// Thin HTTP client for remote notes.
final class NotesAPI {
  func fetchNotes() -> [Note] {
    // URLSession dataTask in a real app
    []
  }
}
