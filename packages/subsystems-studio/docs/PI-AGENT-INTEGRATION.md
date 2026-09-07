# Integrating the pi coding agent into the principal-studio

> Status: **implemented** — `PiSessionReader` landed in `@principal-ai/agent-monitoring@0.3.30`
> (published), and the principal-studio host + mainview are wired against it.
> Source agent: `@earendil-works/pi-coding-agent`, local checkout at
> `/Users/griever/Developer/earendil-works/pi`. Validated end-to-end against a
> real local pi session (see §7).

---

## 1. The shared data path

The principal-studio's **agent-sessions** mode renders sessions through one live
pipeline that is identical for every agent. It is a 5‑stage funnel:

```
durable storage ──▶ UniversalAgentSessionEvent[] ──▶ RepoNormalized[] ──▶ AgentSessionEvent[]
   (agent-specific         │  normalize                  │  repo-normalize      │  accumulate
    reader + processor)    │                             │  (normalizePathsBatch)│  (createAccumulatedState + eventOp)
```

Every agent plugs into **stage 1** with its own reader, and every reader emits the
same `UniversalAgentSessionEvent[]` shape. Stages 2–5 are shared and need no
agent-specific code:

| # | Stage | Component |
|---|-------|-----------|
| 1 | Read raw durable events + normalize to universal | agent-specific (see table below) |
| 2 | Repo-normalize paths | `PathNormalizationService.normalizePathsBatch` (`@principal-ai/agent-monitoring`) |
| 3 | Accumulate into `AgentSessionEvent` (highlight layers, `contextTokens`) | `createAccumulatedState` + `eventOp` (`@principal-ai/agent-monitoring`) |
| 4 | Assemble RPC response rows | principal-studio host `packages/subsystems-studio/src/bun/index.ts` |
| 5 | Map to panel `AgentSessionsView`/`AgentSessionEvent` | `packages/subsystems-studio/src/mainview/index.tsx` → `buildAgentSessionsView` |

### Stage-1 readers per agent

| Agent | Storage | Reader / processor | Emits |
|-------|---------|--------------------|-------|
| opencode | `opencode.db` event table (`SELECT id, aggregate_id, seq, type, data FROM event WHERE aggregate_id = ?`) | `V1EventBridgeProcessor` (via `opencodeRowsToUniversalEvents`) | `UniversalAgentSessionEvent` |
| Cline  | `~/.cline/data/sessions/<id>/<id>.messages.json` | `ClineSessionReader.toUniversalEvents()` | `UniversalAgentSessionEvent` |
| **pi**  | `~/.pi/agent/sessions/**/<sessionId>.jsonl` | **(new) `PiSessionReader`** (planned) | `UniversalAgentSessionEvent` |

### Relevant source files

- `packages/subsystems-studio/src/bun/index.ts` — host/bun side: `getSessionEvents` RPC,
  `listSessions`, `runClinePipeline`, `isClineSession`, `openCodeDBPath()`
- `packages/subsystems-core/src/opencode/pipeline.ts` — pure, agent-agnostic pipeline
  (`opencodeRowsToUniversalEvents`, `normalizeEventsWithAdapter`, `accumulateEvents`)
- `packages/subsystems-core/src/opencode/agent-sessions.ts` — shared `listAgentSessions` /
  `fetchRawEvents` / `detectAgent`
- `packages/subsystems-studio/src/mainview/index.tsx` — `buildAgentSessionsView()`
- `@principal-ai/agent-monitoring` — `V1EventBridgeProcessor`, `ClineSessionReader`,
  `SupportedAgent`, `eventOp`, `createAccumulatedState`

---

## 2. The pi data model (verified from a real session on disk)

One pi session = **one JSONL file**, e.g.
`~/.pi/agent/sessions/--Users-griever-Developer--/2026-08-04T17-58-09-288Z_019fcded-….jsonl`.

Line 1 is the session header; the remaining lines are typed, append-only,
tree-structured **entries**:

```jsonl
{"type":"session","version":3,"id":"…","timestamp":"…","cwd":"/Users/griever/Developer"}
{"type":"thinking_level_change","id":"fb6c4190","parentId":null,"timestamp":"…","thinkingLevel":"off"}
{"type":"model_change","id":"…","provider":"openrouter","modelId":"moonshotai/kimi-k2.6"}
{"type":"message","id":"…","parentId":"…","timestamp":"…","message":{
   "role":"user" | "assistant" | "toolResult",
   "content":[
      {"type":"text" | "thinking"},
      {"type":"toolCall","id":"call_…","name":"bash","arguments":{ … }}
   ],
   "usage":{ … },            // assistant only — carries input / cacheRead tokens
   "stopReason":"…","timestamp":…
}}
```

Observed entry types in real files: `session` (1), `message` (majority),
`model_change`, `thinking_level_change`; `compaction` / `branch_summary` /
`label` / `session_info` / `custom` also exist in the `SessionManager` model
(`packages/coding-agent/src/core/session-manager.ts`).

This is the same spirit as the Cline durable transcript: an **append-only,
tree-structured entry log**, **not** an event-sourced aggregate like opencode.
Tool operations (`bash`, `read`, `write`, `edit`, `grep`) appear as `toolCall`
content blocks inside assistant messages, with their results as
`message.role === "toolResult"` entries.

---

## 3. Mapping pi entries → `UniversalAgentSessionEvent`

`UniversalAgentSessionEvent` (from
`@principal-ai/agent-monitoring/src/types/UniversalAgentSessionEvent.ts`) is the
contract to hit. The pi reader emits these fields: `eventType`, `sessionId`,
`workingDirectory`, `timestamp`, `toolName`, `toolInput`, `toolOutput`,
`rawFilePaths`, `operation`, `data`, `provider`.

| pi entry / message | `UniversalAgentSessionEvent` mapping |
|---|---|
| `session` header | `{ eventType:"session-start", sessionId, workingDirectory: header.cwd, timestamp }` |
| `message` role=user | `{ eventType:"user-prompt-submit", data:{ prompt } }`, then a follow-up `notification` carrying the prompt text (mirrors opencode's prompt→notification pairing so the accumulator fills in the description) |
| `message` role=assistant, no toolcalls | `{ eventType:"message-display", data:{ message, model, tokens:{ input: usage.input, cache:{ read: usage.cacheRead } } } }` — **`tokens.input` is what the accumulator stamps onto `contextTokens`** |
| assistant content block `toolCall` | one `{ eventType:"pre-tool-use", toolName, toolInput: arguments, operation, rawFilePaths }` per tool call |
| `message` role=toolResult | `{ eventType:"post-tool-use", toolName, toolOutput: content, rawFilePaths }` |
| `compaction` entry | `{ eventType:"pre-compact", data:{ trigger, auto } }` → accumulator emits `compacting` |
| `model_change` / `thinking_level_change` | `{ eventType:"step-finish" }` / lifecycle (low visual impact) |

**Tool → operation / path mapping.** Reuse `getFileOperation(toolName)` from
`PathNormalization.ts` (`read`→read, `write`→write, `edit`→edit, `bash` per
convention). Extract paths from tool args (`filePath`, `path`, `file_path`,
`command`) the same way `V1EventBridgeProcessor.normalizePartUpdated` does.


---

## 4. Concrete changes (file by file)

### A. `@principal-ai/agent-monitoring` (published shared package)

The clean home for the reader — it mirrors `ClineSessionReader` exactly, and keeps
pi on the published lifecycle (so the desktop app and Storybook share it too).

1. **`src/supported-agents.ts`** — add `PI = "pi"` to the `SupportedAgent` enum and
   an `AGENT_INFO[SupportedAgent.PI]` entry.
2. **`src/event-processors/pi/PiSessionReader.ts`** (new) — implement
   `listSessions()`, `readSession(sessionId)`, `toUniversalEvents(sessionId)`,
   walking the JSONL. Model it on `ClineSessionReader` (lines 51–350):
   - `sessionsDir()` → `join(getAgentDir(), "sessions")`
     (pi default: `~/.pi/agent/sessions`; respect `$PI_CODING_AGENT_SESSION_DIR`
     and `$PI_CODING_AGENT_DIR`)
   - `listSessions()` → one entry per `sessions/**/*.jsonl` file
   - `toUniversalEvents()` → apply the mapping table in §3
3. **`src/event-processors/pi/transcript.ts`** (new) — pi entry/`AgentMessage`
   type-guards (analogous to `cline/transcript.ts`).
4. **`packages/subsystems-core/src/opencode/agent-sessions.ts`** — add `"pi"` to the agent
   unions; add `listPiSessions()`; extend `detectAgent` / `listAgentSessions` /
   `fetchRawEvents`.

### B. `packages/subsystems-studio/src/bun/index.ts` (host side)

1. Add `isPiSession(sessionId)` alongside `isClineSession` (line 73).
2. Add `runPiPipeline(sessionId)` — a near-copy of `runClinePipeline` (lines 92–150):
   `piReader.toUniversalEvents(sessionId)` →
   `BunNormalizationAdapter` / `PathNormalizationService.normalizePathsBatch`
   (workingDirectory = `header.cwd`) → register `adapter.newlyDiscovered` roots →
   `createAccumulatedState` + `eventOp` loop → build `SessionEventRow[]`.
3. In `getSessionEvents` (line 1376), add a **pi branch before** the opencode-DB
   path (pi ids `019fcded-…` UUIDv7 survive opencode's `SELECT` returning no rows,
   so the check must come first — same as the Cline branch).
4. In `listSessions` (near the Cline block at 1145–1166), append pi sessions to
   `standalone`, deriving `createdAt` from header `timestamp` and `title` from the
   first user message. Set `agent: "pi"`.

### C. `packages/subsystems-studio/src/mainview/index.tsx`

- `buildAgentSessionsView` (lines 2576–2578): pi has no `sessionMeta.slug` (like
  Cline), so today `isCline`/`"cline"` would win. Add a `"pi"` branch and set
  `agentLabel = "pi"`, `owner.name/login = "pi"`.

### D. `@industry-theme/file-city-panel` (panel types — optional)

- `AgentSessionsView.agent` is typed; add `"pi"` to the union in
  `src/types/FileCityGuidePanel.ts` if the panel should render a pi label/icon.


---

## 5. Gotchas (from topic-1785592768388-zwny04ey6, applied to pi)

1. **Synchronized copies of the operation union.** `AgentSessionEventOperation`
   lives in three places (accumulator, panel, `buildAgentSessionsView` cast).
   pi adds **no new operation** (it produces the same read/write/edit/subagent ops),
   so no `AgentSessionEventOperation` member changes. The only new union is the
   **agent label**.
2. **`contextTokens` source.** The accumulator stamps `contextTokens` only from
   `tokens.input` (+ `cache.read`) on `message-display`. The pi reader **must**
   emit `usage.input` / `usage.cacheRead` in the assistant `message-display` data
   or the context gauge stays 0. Real files carry `usage.input` (verified: `4773`,
   `cacheRead: 0`), so it's already available.
3. **Detect before opencode.** pi session ids silently return no rows from the
   opencode DB query; check `isPiSession` in `getSessionEvents` / session detection
   **before** falling through to the opencode path, exactly as the Cline branch does.
4. **Path-normalization working directory.** pi stores `cwd` on its header and its
   own `~/.pi/agent/sessions` dir is *not* the project dir. Pass `header.cwd` into
   `normalizePathsBatch`, otherwise nothing resolves to a repository (this is what
   Cline does with `workspace_root || cwd`).
5. **Storybook fixtures.** No fixture regeneration needed: this is the **live
   principal-studio path**. The accumulator/reader changes reflect immediately once the
   `agent-monitoring` dep is republished and bumped (per the topic note, the
   principal-studio consumes the *published* package).

---

## 6. Recommendation

Add a `PiSessionReader` to `@principal-ai/agent-monitoring` (mirroring
`ClineSessionReader`), plus a `runPiPipeline` in the principal-studio host. This keeps
pi on the **live principal-studio path** with the identical normalize→accumulate middle,
so pi jobs surface automatically (no fixture regen), with `contextTokens`, highlight
layers, and the `finished` event for free.



---

## 7. What was implemented and validated

### agent-monitoring (`@principal-ai/agent-monitoring@0.3.30`, published)

- `src/supported-agents.ts` — added `SupportedAgent.PI` + `AGENT_INFO` entry.
- `src/event-processors/pi/transcript.ts` (new) — pi JSONL entry/message type
  guards (`isPiSessionHeader`, `isPiSessionEntry`).
- `src/event-processors/pi/paths.ts` (new) — `normalizePiToolName` (maps pi's
  lowercase tool names onto the accumulator vocabulary) + `extractPiFilePaths`.
- `src/event-processors/pi/PiSessionReader.ts` (new) — durable reader:
  `listSessions()` / `readSession(id)` / `toUniversalEvents(id)`, recursive walk
  of `~/.pi/agent/sessions` (respects `$PI_CODING_AGENT_DIR` and
  `$PI_CODING_AGENT_SESSION_DIR`).
- `src/event-processors/pi/PiSessionReader.test.ts` (new) — 6 tests incl. the
  full normalize → accumulate pipeline. All pass; full suite 143 pass / 0 fail.

### principal-studio repo (uncommitted, for review)

- `packages/subsystems-studio/src/bun/index.ts` — `piReader` singleton,
  `isPiSession`, `runPiPipeline` (mirror of `runClinePipeline`, normalizes
  against `record.header.cwd`), pi branch in `getSessionEvents` **before** the
  opencode DB path, pi branch in `discoverSessionsRepos`, pi entries appended in
  `listSessions` with `agent: "pi"`. RPC `session` object now carries
  `agent?: string` (`"cline" | "opencode" | "pi"`).
- `packages/subsystems-studio/src/mainview/index.tsx` — `buildAgentSessionsView`
  prefers the explicit `sessionMeta.agent` over the old slug heuristic (which
  would have mislabeled pi as cline).
- `packages/subsystems-core/src/opencode/agent-sessions.ts` — `listPiSessions`,
  `detectAgent` / `fetchRawEvents` / `listAgentSessions` pi branches (shared CLI
  session pulling).
- Both `package.json`s bumped to `@principal-ai/agent-monitoring@^0.3.30`;
  core rebuilt (`dist` contains `PiSessionReader`).

### Validation (real local fixture, per integration guidance)

Against `~/.pi/agent/sessions/--Users-griever-Developer--/2026-08-04T17-58-09-288Z_019fcded-….jsonl`
(117 messages):

- 180 universal events (16 prompts, 45 pre-tool-use, 44 post-tool-use, 57
  message-display, session-start/end).
- Accumulated: `starting` ×1, `prompting` ×16 (real prompt text), `reading` ×10,
  `finished` ×1. Repos auto-discovered: principal-view-core-library (68 files),
  agent-monitoring (57 files). `contextTokens` 85513.
- principal-studio `tsc --noEmit` clean; core test deltas verified pre-existing
  (same 3 failures on stashed baseline).

### Known minor issue (pre-existing pattern, not pi-specific)

`BunNormalizationAdapter` can discover the same git root with and without a
trailing slash, producing duplicate repo entries in the response.

