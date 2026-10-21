# Construct timeline

Construct history is processed as a cumulative, repository-level timeline: a
forward walk through first-parent commits, with a durable cursor and one compact
event per commit. An extension only analyzes commits after the saved cursor.
The bounded, tip-anchored history-run implementation is no longer used.

## Storage

`~/.principal/construct-timeline/<repo-key-hash>/` contains:

- `timeline.json`: version, repository PURL, epoch, cursor, status, event and
  construct totals, elapsed time and retained report bytes.
- `events.ndjson`: append-only events, oldest to newest.
- `identities.json`: verified identities and fingerprints at the cursor,
  keyed by file plus qualified symbol.
- `repository/`: the private managed clone.

Events record the commit SHA, date and subject, introduced/removed/changed
identity lists, verified census size, verification coverage and phase timings.
Source text and per-target observation traces are not stored.

Existing data in the retired `~/.principal/construct-history/` store is neither
read nor deleted. There is no automatic migration into the timeline.

## Processing

1. Resolve the registered local checkout and prepare the managed clone.
2. Read HEAD's first-parent log.
3. With no cursor, start at the oldest commit. With a cursor, take the oldest
   commits newer than that cursor.
4. For each commit: check out detached in the clone, run Graphify `--code-only`,
   source-verify candidate declarations and spans, then compare the verified
   identity set and content hashes against the previous baseline.
5. Append the event, save the new baseline, and update the cursor/metadata.
   Remove the temporary graph output after processing.

Each call defaults to 50 commits and 10 minutes. Later calls continue the
remaining work. `idle` means no extension is running, not necessarily that the
cursor has reached HEAD. Cancellation/time limits leave an `interrupted`
checkpoint; extraction errors produce `failed`.

If the cursor is no longer in HEAD's first-parent log, extension fails rather
than joining disjoint histories. The recorded prefix remains on disk.

## Interpretation

An identity is file plus parsed qualified symbol. An identity appearing in the
verified census is an entry; disappearing is an exit; a differing content hash
under the same identity is a change. Renames and cross-file moves therefore
appear as remove plus add. No semantic lineage reconciliation runs here.
Verification gaps can change census membership; entries/exits are not independent
proof of source creation/deletion. Inspect coverage alongside transitions.

The epoch's declarations count as introductions relative to the timeline.
Source fingerprints include implementation, comments, indentation and nested
declarations, but normalize trailing whitespace and CRLF. Reversions count as
new changes. These are source changes, not behavioral changes.

Summaries include per-commit counts and closed identity lifetimes. Constructs
alive at either edge are excluded from closed-interval lifetime medians;
reintroductions open a new interval.

## Worker and isolation

All extraction and parsing run in the supervised `construct-timeline-worker.js`
worker, not the Studio host's event loop. `construct-timeline-proxy.ts` forwards
commands and falls back to disk reads if the worker is unavailable. A later
explicit extension can respawn a stopped worker and continue from the cursor.
Build the worker with `bun run build:worker`; dev/start/build also invoke it.

Analysis clones/fetches from the registered local checkout into its own clone.
It never switches or writes the source checkout and ignores staged/untracked
work. Hooks, ambient Git configuration/filters and fsmonitor are disabled for
managed operations. Symlinks are materialized as plain text; submodules and LFS
objects are not fetched. No dependencies are installed.

## RPC and UI

- `extendConstructTimeline({ purl, options })`: starts an extension and returns
  metadata immediately.
- `getConstructTimeline({ purl })`: reads metadata and a computed summary, without
  starting work or sending the raw event log.
- `cancelConstructTimeline({ purl })`: cancels the active extension.

The Constructs view lists repositories referenced by saved subsystem models and
shows their saved model-audit constructs without a history-change filter.
Opening the tab does not extract or parse code. Source spans are checked on
demand against the working tree.

The **Timeline** button opens a standalone panel with the cursor, event and
construct totals, report bytes, elapsed time, budgets, Start/Extend/Cancel
actions, and transition charts over commits or UTC days. The hook polls every
two seconds while extending. Nothing starts automatically. Analysis itself
discovers declarations independently of model membership.

## Follow-ups

The timeline does not yet provide semantic rename/move reconciliation, a UI
reset action after history rewrites, or a disk budget. Checkpoint writes span
the event log, baseline and metadata; crash recovery between those writes needs
further validation before claiming exactly-once processing. Analyzer/extractor
compatibility and coverage-gap semantics also need strengthening for long runs.
