# Workflow Validation Rules

This document describes the validation rules enforced by the workflow validator.

## Event Connectivity (`workflow-event-connectivity`)

**Severity:** `error`

**Description:** Checks that all events listed in a scenario's template form a connected path through canvas edges.

**Why:** Workflows visualize execution flows. If events are disconnected (no path through canvas edges), the visualization shows isolated nodes that don't explain how execution progresses from one event to another.

**Checked:**
- Events in `template.events` map to canvas nodes
- Those nodes are connected via canvas edges (direct or through intermediate nodes)
- Treats edges as undirected for connectivity checking

**Example Violation:**

```json
{
  "template": {
    "events": {
      "filetree.file.changed": "File changed",
      "filetree.cache.rebuild": "Cache rebuilt"
    }
  }
}
```

Canvas has:
- Node `file-system` with event `filetree.file.changed`
- Node `cache-rebuild` with event `filetree.cache.rebuild`
- But edges: `file-system → git-watcher → worker → cache-rebuild`

**Fix:** Add intermediate events to maintain connectivity:

```json
{
  "template": {
    "events": {
      "filetree.file.changed": "File changed",
      "filetree.watcher.detected": "Watcher detected",
      "filetree.worker.notified": "Worker notified",
      "filetree.cache.rebuild": "Cache rebuilt"
    }
  }
}
```

**Note:** This is an error that must be fixed. All events in a scenario must be connected through the canvas edge structure to ensure the workflow visualization accurately represents the execution flow.

## Examples

### ✅ Valid: Connected Flow

```json
{
  "events": {
    "filetree.file.changed": "1️⃣ File changed",
    "filetree.watcher.detected": "2️⃣ Watcher detected",
    "filetree.worker.notified": "3️⃣ Worker notified",
    "filetree.cache.rebuild": "4️⃣ Cache rebuilt"
  }
}
```

Canvas edges: `file-system → git-watcher → repo-monitoring-worker → cache-rebuild` ✅

### ❌ Error: Disconnected Events

```json
{
  "events": {
    "filetree.file.changed": "File changed",
    "filetree.cache.rebuild": "Cache rebuilt",
    "filetree.context.updated": "Context updated"
  }
}
```

Canvas edges skip intermediate nodes between these events. Error suggests adding:
- `filetree.watcher.detected`
- `filetree.worker.notified`
- `filetree.cache.invalidated`
- `filetree.cache.synced`
- `filetree.preload.event_received`

## Algorithm

The validator uses Breadth-First Search (BFS) to check connectivity:

1. **Build event-to-node mapping:** Maps event names to canvas node IDs
2. **Build adjacency graph:** Creates an undirected graph from canvas edges
3. **Extract scenario events:** Gets all events from scenario template
4. **Run BFS:** Starts from the first event node and traverses all connected nodes
5. **Check coverage:** Identifies which event nodes were not reached

**Why undirected?** Edges represent architectural flow relationships. For connectivity checking, we only care if nodes are reachable from each other, not the specific direction.

## Related Issues

This validation addresses issues discovered while creating workflows for the `filetree-sync` storyboard, where events appeared disconnected in visualizations, making it unclear how execution flowed between them.
