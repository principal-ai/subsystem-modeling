import Foundation

/// Single source of truth — Core Data locally, optional network refresh.
final class NotesRepository {
  private let store: NotesStore
  private let api: NotesAPI

  init(store: NotesStore = NotesStore(), api: NotesAPI = NotesAPI()) {
    self.store = store
    self.api = api
  }

  func fetchAll() -> [Note] {
    store.fetchAll()
  }

  func insert(_ note: Note) {
    store.insert(note)
  }

  func refreshFromNetwork() {
    let remote = api.fetchNotes()
    store.replaceAll(remote)
  }
}
