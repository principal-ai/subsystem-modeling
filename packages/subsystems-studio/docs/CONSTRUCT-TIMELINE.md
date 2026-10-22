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
- `identities.json`: verified identities, source spans and fingerprints at the cursor,
  keyed by file plus qualified symbol.
- `repository/`: the private managed clone.

Events record the commit SHA, date and subject, introduced/removed/changed
identity lists, location-only shifts (`relocated`), verified census size,
verification coverage and phase timings.
Source text and per-target observation traces are not stored.

### Source span evidence

Every new transition retains commit-qualified source evidence:

```ts
interface ConstructTimelineSpan {
  startLine: number; // one-based, inclusive
  endLine: number;   // inclusive
  contentHash: string;
}

interface ConstructTimelineIdentity {
  file: string;
  symbol: string;
  construct?: string;
  before?: { sha: string; span: ConstructTimelineSpan };
  after?: { sha: string; span: ConstructTimelineSpan };
}
```

Introductions have `after`; removals have `before`; content changes and
location-only shifts have both. `before.sha` identifies the previous analyzed
commit, not the removal/change commit. `after.sha` is the event commit. Read
the file from the specified Git revision, not the current working tree.

The baseline retains all verified constructs at the cursor, serialized as
`{ sha, entries: [[key, file, symbol, construct, contentHash, startLine, endLine]] }`.
An absent construct kind is an empty string. Events retain only transitions,
not complete per-commit snapshots. Starting at the epoch, replay introductions,
changes and relocations and remove exits to reconstruct verified spans at any
analyzed commit. Unchanged spans carry forward; their evidence SHA remains a
revision where the span was verified.

The analyzer is now `construct-timeline-v2`. Legacy v1 timelines remain readable
but cannot be extended with v2 events, because their historical spans are
missing. They are not silently upgraded or deleted. A new timeline store is
required to analyze spans from the epoch; use the confirmed Reset timeline action
to discard the old analysis before starting again. There is no automatic migration.
Missing, invalid or cursor-mismatched v2 baselines fail instead of comparing
against an empty inventory and fabricating introductions.

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

With no options, a call defaults to 50 commits with **no time limit**. Commit-count
and history-period runs do not install a runtime deadline. Explicit runtime
runs process commits until their deadline or the end of history, without an
implicit 50-commit cap. Later calls continue the remaining work.
`idle` means no extension is running, not necessarily that the
cursor has reached HEAD. Cancellation/time limits leave an `interrupted`
checkpoint; extraction errors produce `failed`.

The timeline explicitly accepts Graphify's known empty-corpus exit only when
the code-only scan reports **zero code files**, exit status is 1, and stderr
contains only the expected empty-graph diagnostic. A missing scan summary,
supported code with no nodes, additional errors, or other exit statuses still
fail. Other graph consumers do not opt into this behavior.

Such a snapshot records zero verified constructs and an `extraction` marker:
`{ status: "no-supported-code", unclassifiedFiles, sensitiveFiles }`. These are
file counts, separate from declaration-level verification coverage. Zero
verified constructs does not prove zero source declarations; unsupported files,
sensitive-file exclusions and uninitialized submodules remain outside coverage.
Later commits can introduce verified declarations normally.

Failures report the failing commit, exit status and a controlled CLI diagnostic
(for example an empty graph or missing Python module). Arbitrary CLI output is
not copied into persisted errors because it may contain source text or secrets.
The failed commit is not appended, and the previous cursor remains resumable.

If the cursor is no longer in HEAD's first-parent log, extension fails rather
than joining disjoint histories. The recorded prefix remains on disk.

## Interpretation

An identity is file plus parsed qualified symbol. An identity appearing in the
verified census is an entry; disappearing is an exit; a differing content hash
under the same identity is a change. A line-range shift with an unchanged hash
is recorded separately in `relocated`, without increasing content-change counts
or opening a new lifetime. Current summary charts show content transitions, not
relocation counts. Renames and cross-file moves therefore
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
Build the worker with `bun run build:worker`. Electrobun's `preBuild` hook also
rebuilds it before every build, including `dev --watch` reloads and direct CLI
builds, before the worker is copied into the app. Shared timeline sources and the
worker build script are watched too. A failed worker build stops the app build,
instead of staging an older worker without live commit progress. Already-running
workers are not hot-swapped; restart the development session after the current
extension finishes to load a build-hook change.

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
- `getConstructTimelineHistory({ purl })`: reads the local repository's complete
  first-parent commit metadata, independently of analysis progress. Falls back
  to the managed clone's fetched tip when no local checkout is registered.
- `getConstructTimelineFiles({ purl, sha })`: reads the exact file tree with
  `git ls-tree` and joins recorded coverage when available. Unanalyzed commits
  must belong to the repository's first-parent history; they return
  `analyzed: false`, no coverage and all-gray files. Reads use source Git objects
  for commits not yet fetched by analysis. No checkout, fetch, extraction,
  source parsing or analysis-store writes occur.
  Snapshots also include the full Git commit `message` and first-parent
  `changes`, with previous size/kind for deleted paths. Root commits compare
  against an empty tree; renames appear as remove plus add. Missing parent
  objects leave changes unavailable, not an invented empty or all-added diff.
- `cancelConstructTimeline({ purl })`: cancels the active extension.
- `resetConstructTimeline({ purl })`: deletes only this repository's managed
  timeline directory, including events, baseline and analysis clone. The worker
  rejects reset while an extension is starting/running or another reset is in
  progress. Source files, subsystem models and other timelines are untouched.

The Constructs view lists repositories referenced by saved subsystem models and
shows their saved model-audit constructs without a history-change filter.
Opening the tab does not extract or parse code. Source spans are checked on
demand against the working tree.

The **Timeline** button opens a standalone panel with the project start date,
latest Git commit date (UTC), total first-parent commits, and percentage analyzed,
plus analysis actions and transition charts over commits or UTC days.
**Continue analysis** in the header opens a modal with analysis presets and
**Extend timeline**. Before the first analysis, **Start analysis** opens the same
modal with **Start timeline**. The form is not shown at the bottom of the panel.
Choose **1 day**, **1 week**, or **1 month** of commit history; **10**, **100**, or
**1000 commits** (or a custom count); or a runtime of **10 minutes** or **1 hour**.
Selecting a preset replaces the previous limits. History periods begin on the
UTC date of the next unanalyzed commit, so gaps do not create empty runs.
Days end at the next UTC midnight, weeks cover seven UTC dates, and months end
on the same date next calendar month (clamped at month-end). The end boundary
is exclusive. Selection always takes a contiguous first-parent prefix, even
when committer dates are out of order. Cancellation remains available for all
presets, and only completed commits advance the durable cursor.
Progress counts saved analysis whose SHAs match the current project
history, not the cursor date or a stale event total. The overview and activity
calendar share a read-only history request. The hook polls every
two seconds while extending. Nothing starts automatically. Analysis itself
discovers declarations independently of model membership.

**Reset timeline** opens a confirmation naming the repository and analyzed commit
count. **Keep analysis** dismisses it without a request. **Delete analysis**
permanently removes the cache and returns the panel to **Start analysis**;
analysis does not restart automatically. Reset is disabled while extending:
cancel and wait for the extension to finish first. Legacy analyzer timelines can
be reset. Read-only stale responses are ignored after a successful reset.

### File City analysis coverage

The Timeline panel contains a File City snapshot map and a full-year activity
calendar, with a year picker. Each day is green for analyzed commits, gray for
unanalyzed commits, split green/gray for a mixture, or dark for no commits.
Dates use UTC committer timestamps and first-parent history, matching analysis.
Click a day to show its net construct change (additions minus removals) and its
added/removed totals, using the latest snapshot from that day for the map.
The calendar does not list individual commit subjects, hashes or selection buttons.
Below the daily totals, one dot per commit runs oldest-first. Completed commits
are green, pending commits gray, and the worker's actual in-flight commit pulses
amber (static amber with reduced motion). This marker is live worker state, never
a guessed next commit or a persisted analysis result.
Changes are summed across analyzed history only; partially analyzed days are
explicitly labeled, and unprocessed days show **Not analyzed**, not zero.
Edits to existing constructs do not affect the net count. Calendar intensity
reflects the magnitude of the daily net change, not commit volume.
**Follow latest** follows the active analysis day and Git snapshot while analysis
runs. The sidebar shows the first 200 characters of that snapshot's commit message,
with an ellipsis when truncated, instead of its date, verification percentage,
caveat and coverage counts. Buildings are neutral with
green added, amber modified and red removed highlights. Deleted paths remain as
display-only buildings using their previous size/kind; their details say
**Removed in this commit**. These highlights describe Git changes, not construct
verification. Pinned days keep their historical coverage view. Stopping analysis
restores coverage for the latest completed snapshot.
An unanalyzed commit opens its exact historical file map, entirely gray and
explicitly labeled **Not analyzed**, without a misleading zero-percent result or
starting analysis. If history cannot load, the UI labels unknown activity instead
of claiming those days had no commits, and offers Retry.

Clicking a building
opens its coverage details over the left sidebar, leaving the map visible. **Close**
or Escape restores the summary without remounting the map. The map toggles between
a flat file map and 3D buildings.
Commit changes animate matching paths between layouts, shrinking removed buildings
and growing added buildings. The previous map and matching sidebar content stay visible
without loading messages while the next snapshot loads, including on load failure.
Camera drag, rotation,
wheel zoom/pan and touch gestures are disabled; building selection still works.
The 2D/3D mode and surviving file selection persist across commits. Reduced-motion
preferences skip the layout animation. Coverage mode uses verification colors;
the live view uses separate Git change layers over neutral buildings.

New events persist a sparse `files` list with per-file verified, unresolved,
unsupported and error candidate counts. This includes unchanged declarations;
transition lists alone cannot establish whole-commit file coverage. Old events
without this list remain readable, with an explicit coverage-not-recorded notice.
There is no automatic historical backfill.

New per-file records also include `declarations`: each observed candidate's
qualified symbol, kind, verification status, verified source line range or
unverified graph anchor, and controlled diagnostic for unsuccessful verification.
This includes unchanged candidates, not just transition entries. Selecting a
building lists which candidates verified and which were unresolved, unsupported
or errored, with the reason. Source text and duplicate content hashes are not
stored in these lists. Older count-only records display an explicit
details-not-recorded notice; reset and reanalyze to populate historical details.

Green means every **observed candidate** in the file verified, amber means some
verified and some did not, orange means unresolved, purple unsupported, red
error, and gray no evidence. Known documentation, configuration and asset formats
have a separate Non-code state. No evidence is not necessarily pending work:
supported files without candidates, ignored files and submodules can lack
evidence. Green does not prove complete extraction of all declarations.
Percentages use all tracked paths in the selected Git tree, including
symlinks/submodule entries, not just files with candidates. Partial files are
counted separately from fully verified candidate sets.

The parser registry is shared by verification, asset packaging and support labels.
It supports `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.go`, `.rs`,
`.java`, `.rb` and `.php`. Without recorded candidate coverage, other regular
files are labeled **Not supported for construct verification**, except known
non-code formats. Unknown extensions remain unsupported rather than silently
disappearing. Symlink/submodule targets are not classified as analyzed files.

Support labels describe the **current analyzer**, not historical verification.
They are derived from the selected Git tree on read, so older snapshots show
unsupported types without reanalysis or changing saved events. Recorded
verification results take precedence. The sidebar shows the verified percentage
and a compact status breakdown, including unsupported files. **About these results**
expands the definitions, support list and historical-coverage caveats; selecting
a building explains its state. Missing historical coverage remains visible even
when help is collapsed.

Verification colors update after each commit is durably recorded, not during
individual file parsing. Failed/in-flight commits can be previewed as Git-only
maps but are never presented as completed analysis.
Historical reads do not change the source checkout or the worker's checkout.

## Follow-ups

The timeline does not yet provide semantic rename/move reconciliation,
automatic migration after history rewrites, or a disk budget. Checkpoint writes span
the event log, baseline and metadata; crash recovery between those writes needs
further validation before claiming exactly-once processing. Analyzer/extractor
compatibility and coverage-gap semantics also need strengthening for long runs.
