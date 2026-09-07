# opencode V1 Event → NormalizedEventType Mapping

## Event-Level Mapping

| V1 event type | Suggested NormalizedEventType | Notes |
|---|---|---|
| `session.created.1` | `session-start` | Carries `SessionInfo` (directory, agent, model, title) |
| `session.updated.1` | `session-update` | Metadata/title/status changes mid-session |
| `session.deleted.1` | `session-end` | Not observed in local instance; may be rare |
| `message.updated.1` (role=user) | `user-prompt-submit` | Carries prompt text, format, agent config, system prompt |
| `message.updated.1` (role=assistant) | `message-display` | Carries message metadata, cost, tokens, error info |
| `message.removed.1` | `message-removed` | Rare (4 instances across 368 sessions) |

## Part-Level Mapping (`message.part.updated.1`)

Each `message.part.updated.1` event carries a single `Part` discriminated by `type`. Below is the per-variant mapping.

### tool — Tool call state machine

A single tool call produces **4 separate `part.updated` events** as it transitions. Each maps to a distinct normalized event type to preserve full temporal fidelity for visualization.

| Tool state | Suggested NormalizedEventType | Carrier fields |
|---|---|---|
| `pending` | `pre-tool-use` | `tool`, `callID`, `state.input`, `state.raw` |
| `running` | `tool-executing` | `tool`, `callID`, `state.title`, `state.time.start`, `state.metadata` |
| `completed` | `post-tool-use` | `tool`, `callID`, `state.output`, `state.title`, `state.time.start/end`, `state.attachments` |
| `error` | `post-tool-use-failure` | `tool`, `callID`, `state.error`, `state.time.start/end` |

All four carry `callID` for correlation. A visualization can group them by `callID` to show a single tool call expanding through its lifecycle.

### text — Text output

| Part variant | Suggested NormalizedEventType | Carrier fields |
|---|---|---|
| `text` | `notification` | `text`, optional `time.start`/`time.end`, `synthetic`, `ignored`, `metadata` |

### reasoning — Model reasoning text

| Part variant | Suggested NormalizedEventType | Carrier fields |
|---|---|---|
| `reasoning` | `model-reasoning` | `text`, `time.start`/`time.end`, `metadata` |

### step-start / step-finish — Model thinking step boundaries

| Part variant | Suggested NormalizedEventType | Carrier fields |
|---|---|---|
| `step-start` | `step-start` | Optional `snapshot` |
| `step-finish` | `step-finish` | `reason` (e.g. `"tool-calls"`, `"stop"`), `cost`, `tokens{input,output,reasoning,cache}`, optional `snapshot` |

`step-finish` is the richest source for token/cost accounting. The `reason` field indicates what ended the step.

### patch — File edits

| Part variant | Suggested NormalizedEventType | Carrier fields |
|---|---|---|
| `patch` | `file-changed` | `hash`, `files[]` (list of affected file paths) |

### compaction — Context window compression

| Part variant | Suggested NormalizedEventType | Carrier fields |
|---|---|---|
| `compaction` | `post-compact` | `auto` (boolean), optional `overflow`, optional `tail_start_id` |

## NormalizedEventType additions needed

Mapping at full fidelity requires adding these new types to the `NormalizedEventType` union in `AgentEventTypes.ts`:

```
"session-update"       // session.updated.1
"message-removed"      // message.removed.1
"tool-executing"       // tool part with state=running
"model-reasoning"      // reasoning part
"step-start"           // step-start part
"step-finish"          // step-finish part (carries cost+tokens)
"post-tool-use-failure" // already exists
"file-changed"         // already exists
"post-compact"         // already exists
```

## Fixture reference

`__fixtures__/event-shapes.json` contains one representative sample of each of the 15 shapes listed above, extracted from a local opencode instance. Each entry is a full `EventV2.Payload` with the complete `data` blob intact.
