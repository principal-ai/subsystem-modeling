# Whole-maintenance-run status

Studio records the parent maintenance attempt as well as its individual agent
runs. OpenBot reads this contract through its scoped tools. Optional terminal
outcome delivery reuses OpenBot's existing registered webhook/responsibility path.

## Existing HTTP endpoints

`POST /api/subsystem-model/:id/maintain` still starts the same governed,
sequenced maintenance path. An accepted start now includes `maintenanceRunId`.
The parent record is saved before the host acknowledges the start. Concurrent
starts retain the existing `alreadyRunning` behavior.

`GET /api/subsystem-model/:id/maintain/status` preserves `ok`, `graphId`,
`running` and the recent legacy `runs`. It adds `snapshot`, containing the
latest recorded parent attempt, or `null` if the model has no parent record.
Legacy agent history does not justify reconstructing a whole-run outcome.
The separate `delivery` field reports the latest notification checkpoint and
retained pending/failed counts, without exposing its target, key or event body.

An illustrative response before the first agent starts (identifiers shortened):

```json
{
  "ok": true,
  "graphId": "sg-example",
  "running": true,
  "runs": [],
  "delivery": { "latest": null, "pending": 0, "failed": 0 },
  "snapshot": {
    "schemaVersion": 1,
    "model": { "id": "sg-example", "title": "Example subsystem" },
    "sequence": {
      "id": "example-parent-uuid",
      "startedAt": "2026-10-26T10:00:00.000Z",
      "status": "running",
      "outcome": null,
      "endedAt": null
    },
    "revision": 2,
    "updatedAt": "2026-10-26T10:00:01.000Z",
    "observedAt": "2026-10-26T10:00:05.000Z",
    "stages": [],
    "counts": {
      "proposalsCreated": 0,
      "proposalsApplied": 0,
      "proposalsPending": 0,
      "stagesFinished": 0
    },
    "commitsAtStart": { "pkg:github/acme/example": "abc123" },
    "verifiedAtCommits": null,
    "verification": null,
    "summary": null,
    "blocker": null
  }
}
```

`sequence` is the internal field name for the user-facing **maintenance run**.
It is not a Git commit and is not an agent session.

## Identity and evidence

- The parent gets a UUID per attempt, independent of the source commits.
  Repeating maintenance against the same commits creates a different parent.
- `stages` is the ordered agent-attempt history. Each entry has its own `runId`,
  nullable `sessionId`, agent, layer, start/end times, state, summary/error,
  `commitsAtStart` and proposal `counts`. Failed fallback attempts remain in
  history, even if a later attempt succeeds.
- Legacy agent rows carry `maintenanceRunId` so proposals, sessions and parent
  attempts can be correlated without guessing from times or commit hashes.
- `commitsAtStart` captures per-repository HEADs when the parent/agent begins.
  It does not freeze the checkout or describe uncommitted file contents.
  Null means the capture was unavailable; an empty map means no referenced
  repository could be resolved.
- `verifiedAtCommits` is the model's separately recorded verified baseline,
  not a copy of its starting commits and not proof earned by convergence.
- Counts are measured from retained proposal records joined by agent `runId`,
  including accepted and rejected records. Applied counts accepted records;
  pending counts pending records. Untagged proposals and other runs are not
  distributed between agents. Whole-run totals sum its own stages.
  Unreadable/malformed proposal evidence produces null, not invented zeros.
  These are not lifetime statistics after explicit proposal-history deletion.
- `verification` comes from the existing saved audit. Its four lane statuses
  use the same summary as Studio's Maintain surface. Its timestamp and
  fingerprint-based staleness are independent of maintenance outcomes.
  Missing/unusable audit evidence stays null. Status reads do not run an audit,
  invoke an LLM, start maintenance or resolve proposals.

## Lifecycle and recovery

An agent ending updates its history entry, not the parent outcome. The parent
finishes only when orchestration records `converged`, `needs_unblock`,
`stalled`, `cap` or `error`, with an explicit end time.

Records are stored under
`~/.principal/subsystem-maintenance-runs/<model-id>.json`. Per-model writes
are serialized and use a sibling temporary file plus atomic rename. The last
20 recent non-pending-delivery attempts retain their embedded stage history
independently of the legacy agent log's 50-row retention. Up to 20 additional
pending deliveries are pinned until resolved. If those slots fill, new outcomes
record `backlog_full` rather than silently discarding pending events or blocking
maintenance. The per-model bound is 40 records. This is a single-Studio-host
store, not a distributed database lock.

On a read after the owning Studio process exits, an unfinished parent becomes
`unknown`, with no terminal outcome or end time. The same happens when the
current host no longer tracks its orchestration, for example after a failed
final persistence operation. A different live process's attempt is not taken
over. Completed outcomes survive restart unchanged.

Agent sessions may outlive Studio. Existing orphan-agent reconciliation can
update the legacy log, but a finished agent alone cannot prove the parent
converged. Automatic resumption of interrupted sequences is not implemented.

A corrupt parent file returns HTTP 503 rather than pretending no maintenance
exists. An unknown model remains HTTP 404.

## Revision versus observation

`revision` increases only for semantic snapshot changes within one attempt.
`updatedAt` timestamps that change; `observedAt` timestamps the read. Unchanged
polls do not create another revision or move `updatedAt`.

Evidence changes, such as accepted proposals or a now-stale audit, may advance
the revision after the sequence ends. They do not rewrite its historical
outcome or end time. Evidence updates compare both parent identity and revision,
so a delayed read cannot attach another attempt's counts or overwrite newer
state.

## Optional signed terminal outcomes

An operator must first register a generic webhook trigger on the intended
OpenBot responsibility, using the intended owner, Bot and reply channel.
Filter on `studio.maintenance.finished`, optionally also `model.id`. Configure
the Studio process, not the renderer or a model, with:

```text
PRINCIPAL_MAINTENANCE_WEBHOOK_URL=https://openbot.example/api/events/triggers/REGISTERED_TRIGGER_ID
PRINCIPAL_MAINTENANCE_WEBHOOK_SECRET=whsec_BASE64_ENCODED_32_BYTE_KEY
```

These are placeholders, not installed configuration. The matching private key
must decode to 32–128 bytes, with an optional `whsec_` prefix. HTTPS is required
except for exact `localhost`, `127.0.0.1` or IPv6 loopback. Only the registered
ingress route is allowed; credentials, queries and fragments are rejected.

With both settings absent, notification delivery is disabled. There is no
historical backfill when it is later enabled. A partial/invalid configuration
records a visible `configuration` failure without preventing the parent outcome.

- The terminal snapshot and its immutable delivery checkpoint commit in the
  same atomic file write. All five real outcomes emit the same event type.
  Agent completion, reads and evidence revisions do not create events.
  Interrupted `unknown` outcomes do not fabricate a terminal notification.
- The JSON event carries schema version, event ID/time, model identity, parent
  execution identity/outcome, counts and independent audit/commit evidence.
  It omits agent transcripts, raw error/summary text and routing/actor fields.
  The 24 KiB body limit stays below OpenBot's event cap; unusually large commit
  maps become null with `provenanceOmitted: true`, not misleading partial maps.
- Standard Webhooks signs `id.timestamp.rawBody` with HMAC-SHA256. Retries keep
  the same `webhook-id` and exact bytes, but sign a fresh `webhook-timestamp`.
  Only a hash of the configured destination is persisted, never its URL or key.
  A changed destination fails pending events instead of retargeting them.
- A reserved attempt is saved before POST. Each event has at most five
  reservations, ten-second requests, no redirects, and backoff of 5 seconds,
  30 seconds, 2 minutes and 10 minutes. A crash consumes its reservation and
  waits out the request-timeout/backoff window before another attempt.
  Responses are bounded to 8 KiB.
- Network errors, malformed acknowledgements, 408, 409 (paused responsibility),
  429 and server errors retry within that budget. Permanent rejections fail.
  Exhausted/configuration/destination/backlog failures remain visible; there
  is no automatic unlimited redrive after an operator fixes configuration.
- A resident sender wakes on committed outcomes and scans pending checkpoints
  on startup. It has no idle poll when there are no pending events. One flush
  reserves at most 20 sends. It runs no LLM, audit or maintenance sequence.
  Pending checkpoints survive normal restart and recent-history retention;
  a corrupt file is reported and does not starve other valid model files.

`delivery.latest` includes `eventId`, `status`, `attempts`, next/last attempt
times, HTTP status, receipt and a bounded failure code. Pending and failed
counts cover retained records. Delivery changes do not advance the maintenance
snapshot revision. `delivered` receipts distinguish `queued` and `duplicate`;
`ignored` means OpenBot accepted but filtered the event.

An accepted/queued event is not a completed responsibility turn, delivered
reply, or successful repair. OpenBot's existing ingress deduplicates the stable
signed event ID within its retention, then uses its shared work queue and
normal governed, recorded turn. End-to-end effects remain at-least-once, not
exactly-once. Treat the payload as untrusted; only the registered responsibility
selects its actor and channel. Use reporting-only instructions unless the user
explicitly authorizes more. No new OpenBot queue, schedule, live registration,
grant or auto-accept policy is introduced by this code.
