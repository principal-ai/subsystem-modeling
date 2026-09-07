# Analyzing agent sessions into concept cards

> Status: **stub implemented, real extraction designed.** The full wiring —
> Analyze button → RPC → host store → analysis tab → concept cards — is live and
> verified end-to-end, but the host currently writes a **canned stub card**
> (`status: "done"`) so the plumbing is provable before the opencode extraction
> lands. This doc is the operating spec for the whole flow: how it works today
> and how real extraction (§5) will slot in.

---

## 1. The flow at a glance

```
┌─────────────────────┐   analyzeSession   ┌──────────────────────────────┐
│ FileCityGuidePanel  │ ─────────────────▶ │ principal-studio host (bun)      │
│ Agent Sessions mode │                    │  src/bun/index.ts             │
│  row Analyze button │                    │  1. find-or-create analysis   │
└─────────────────────┘                    │  2. open/focus analysis tab   │
        │ hasAnalysis (accent row)         └──────────────┬───────────────┘
        │                                                 │ save/read
        │                                                 ▼
        │                                        ~/.principal/
        │                                        principal-studio-analyses.json
        ▼
┌─────────────────────┐   getTab  ◀──────────  tabsChanged broadcast
│ AnalysisView        │  (tab payload = the ConceptAnalysis record)
│  renders concept    │
│  cards (FeedCard/   │
│  DiagramModal)      │
└─────────────────────┘
```

1. **Panel** — a session row in the drawer shows a Wand2/Analyze button. It
   renders only when the host wires `FileCityGuidePanelActions.analyzeSession`.
   Once a session has an analysis (`AgentSessionView.hasAnalysis`), the row
   turns accent and the button reads "Open concept analysis".
2. **Host** — `analyzeSession` is **idempotent**: if an analysis already exists
   for that `sessionId`, it just focuses the existing analysis tab and returns
   the same `analysisId`. Otherwise it creates a record, opens a tab, and
   returns.
3. **Tab** — an `"analysis"` tab is a normal (closeable, non-permanent) tab,
   deduped by `analysisId` exactly like trail tabs dedupe by path. Opening or
   focusing it broadcasts `tabsChanged`, so the renderer switches to it.
4. **Renderer** — `AnalysisView` renders the analysis from the tab payload via
   the same `FeedCard`/`DiagramModal` used by the curated Concepts feed.

## 2. The shared contract

All of these live in `src/shared/contract.ts` (single cross-process contract).

```ts
type ConceptChangeType = "execution" | "derive" | "integration" | "ui";

interface ConceptCardData {
  id: string;
  title: string;
  changeType: ConceptChangeType;
  status?: "draft" | "refining" | "stable"; // curation phase
  sessionIds: string[];                     // sessions that surfaced it
  repos: Array<{ owner: string; name: string }>;
  description: string;   // 1–2 sentence left-pane description
  points: string[];      // bullets that state the key idea
  mermaid: string;       // right-pane diagram source
}

type AnalysisStatus = "pending" | "done" | "error";

interface ConceptAnalysis {
  id: string;            // `analysis_<16 hex>`
  sessionId: string;
  sessionTitle?: string;
  sessionSlug?: string;
  agent?: string;        // "opencode" | "cline" | "pi" | "grok"
  createdAt: string;     // ISO
  status: AnalysisStatus;
  error?: string;        // when status === "error"
  concepts: ConceptCardData[];
}

interface AnalysisSummary {  // row in the index — no cards
  id: string; sessionId: string; sessionTitle?: string;
  status: AnalysisStatus; createdAt: string; conceptCount: number;
}
```

`ConceptCard` / `ChangeType` in `src/mainview/concepts.ts` are aliases of the
shared types, so hand-curated cards (the `CONCEPT_CARDS` registry) and
agent-extracted cards are the same shape on the wire and render through the
same feed.

### RPCs

| RPC | Params | Response |
|-----|--------|----------|
| `analyzeSession` | `{ sessionId, title?, agent? }` | `{ ok, error?, analysisId?, tabId? }` |
| `listAnalyses` | `{}` | `{ analyses: AnalysisSummary[] }` |

The renderer reads a full analysis through the existing `getTab({ id })` — the
tab payload is the `ConceptAnalysis`.

## 3. The on-disk store

- **Path:** `~/.principal/principal-studio-analyses.json` (same `~/.principal`
  convention as the trail cache).
- **Module:** `src/bun/analyses.ts` — a single JSON object keyed by `analysisId`,
  read/written synchronously (the file is small; handlers are already sync).
- **Store API:** `get`, `findBySession`, `list` (newest-first), `summaries`,
  `save`. One `analyses` singleton is exported.
- `listAnalyses` reads this file; `analyzeSession` writes it. `hasAnalysis` on
  panel rows comes from the `sessionId` set the renderer builds from
  `listAnalyses`.

## 4. How `analyzeSession` operates (today: stub)

```
1. findBySession(sessionId)
   └─ exists  → openAnalysisTab(existing.id) → return { ok, analysisId, tabId }
   └─ missing → newAnalysisId()
             → analyses.save({
                 id, sessionId, title, agent,
                 createdAt, status: "done",
                 concepts: [ stubConceptCard({ sessionId, title, agent }) ]
               })
             → openAnalysisTab(id) → return { ok, analysisId, tabId }
```

`openAnalysisTab` dedupes by `analysisId` (focuses an already-open tab rather
than stacking duplicates), sets the tab active, and broadcasts `tabsChanged`.

The **stub card** is a single `changeType: "execution"`, `status: "draft"`
card that names the session and marks itself as a placeholder. It proves the
button → RPC → store → tab → cards path with zero latency and no network.

## 5. Real extraction (designed — the next implementation step)

The plan is to replace the stub in `analyzeSession` with an actual opencode run.
The async machinery is the reason `AnalysisStatus` includes `"pending"` and why
`AnalysisView` already renders a pending analysis (status badge, empty cards).

### 5.1 Build a transcript (host)

The **accumulated layer is the starting point** — not raw events. The session's
events are already normalized + accumulated by the shared pipeline
(`getSessionEvents`); a transcript is a plain-text rendering of that, one line
per accumulated event with its operation, description, and touched files, plus
a header carrying the session title, agent, model, repo(s), and the **first
user prompt** (the *why* lives in the user's words, not the assistant-side
descriptions). Later user messages are included in the body where available.

**Enrichment policy — in order of preference, never jump to raw:**
1. If the accumulated layer is insufficient for good extraction, **enrich the
   accumulated layer itself** (richer `description`s, more fields, subagent
   intent, commit context) — that benefits every consumer of the pipeline, not
   just analysis.
2. Let the extractor **read the repo's files directly** (below) so it can pull
   the code/diffs behind the cards itself.
3. Raw event payloads are **not** fed to the agent: they're agent-specific,
   huge, and full of model/tool internals that dilute the concept signal.

### 5.2 The `concept-extractor` agent

Author an opencode agent (repo-local, e.g. under the principal-studio package or a
shared agents location) that:

- **Input:** the transcript file (context) + the instruction to emit JSON.
- **Environment:** the analyzed session's **primary repository** (`--dir
  <primaryRepoRoot>`) with normal tool access. `--dir` is a single working
  directory (no multi-root flag), but it is **not a fence** — Read/Grep/Bash
  resolve absolute paths, so the agent can read the actual files and diffs in
  any repo the session touched. The transcript header enumerates **all** the
  session's repo roots (the `repos[].root` list `getSessionEvents` already
  returns, sorted by file count) so the agent knows where everything lives;
  `--dir` just anchors the run to the primary one. One run covers a
  multi-repo session; each card's `repos` carries the owner/name pairs it
  involved.
- **Output:** `JSON` (via `--format json`) whose result parses into
  `ConceptCardData[]` — one card per distinct concept surfaced by the session,
  following the `ConceptChangeType` taxonomy and the card fields above.
- **Conventions:** cards start `status: "draft"`; `sessionIds` should contain
  the analyzed session; `mermaid` must be valid `flowchart`/`sequenceDiagram`
  source; `description` stays 1–2 sentences; `points` are short bullets.

The CLI command is verified end-to-end (smoke-tested against the real agent).
**The message positional MUST precede `-f`** — the file flag is array-typed and
greedily consumes any positional that follows it:

```
/Users/griever/.opencode/bin/opencode run \
  --agent concept-extractor \
  --format json \
  -m opencode-go/deepseek-v4-flash \   # fixed extractor model (opencode-go provider)
  --dir <primaryRepoRoot> \            # primary repo; agent reads all session repos by path
  "<session title> — extract concept cards" \
  -f <transcript.txt>                  # accumulated-layer prose + all repo roots (see §5.1)
```

The `--format json` stream is NDJSON: `step_start` → `text` → `step_finish`
events. The agent's answer is the concatenation of `text` events' `part.text`
(a single `{"concepts": [...]}` object, no fences); `error` events surface as
failures. The parser in `src/bun/extraction.ts` also tolerates fenced or
prose-wrapped JSON.

**Caveat:** this assumes default (unsandboxed) tool access. If a sandbox or a
`permission` allowlist ever restricts reads to the workspace, widen it to the
session's repo roots (or the transcripts still work one-repo-at-a-time).

### 5.3 Async run + status lifecycle

The host RPC limit is **5000 ms** (`maxRequestTime`), far too short for an
opencode run. So `analyzeSession` must not block on it — and does not:

1. Create the analysis as `status: "pending"` (save to store), open the tab,
   return immediately.
2. Kick the run in the background (`void (async () => {…})()`, not awaited
   inside the handler). The transcript is built from `getSessionEvents` (the
   same loader the session view uses — the `requests` object is hoisted so
   `analyzeSession` reuses the handler directly), written to
   `~/.principal/transcripts/<id>.md`, and attached with `-f`.
3. On success: parse JSON → `ConceptCardData[]` (validated + session id
   injected), save as `status: "done"` + `model`, broadcast `tabsChanged` so
   the open `AnalysisView` reloads via `getTab`.
4. On failure: save `status: "error"` + `error` message, broadcast the same.
5. If the analysis is `pending` when the renderer reads it, `AnalysisView`
   shows the extracting state and re-fetches on the next broadcast (registered
   in `reloadSubscribers`).

### 5.4 Rendering + refresh

- `AnalysisView` handles all four states: loading / pending (extracting
  message) / done (cards) / error. It registers a `getTab` re-fetch into
  `reloadSubscribers`, so the pending → done/error transition reloads the tab
  in place.
- The header shows `agent · date · model · N concepts`.
- Agent Sessions marks a row analyzed on click; `hasAnalysis` re-enriches from
  `listAnalyses` on mount.

### 5.5 The prompt audit surface

Every `AnalysisView` header shows the analysis status; the **Prompt** button in
the app header (`AppHeader`) opens a `kind: "prompt"` tab from anywhere. Its
`getTab` payload is `ExtractionPromptInfo` — the verbatim extractor **system
prompt** (read live from the agent file on disk), the **task template** (the
per-run message the title is interpolated into), and the agent/model/path. The
`prompt` tab is a normal closeable tab; like `analysis`, it is excluded from
the file-serving guards and rendered by its own view (`PromptView`). The system
prompt itself carries `edit: deny` read-only permissions, which is why the exact
text matters for auditing what the extractor is allowed to do.

## 6. Curation (later — the review surface)

Agent cards land as `status: "draft"`. The curated `CONCEPT_CARDS` registry in
`src/mainview/concepts.ts` is the eventual review surface: drafts that survive
are promoted `refining → stable`, and `sessionIds` already lets multiple
sessions group onto one concept (dedupe, not duplicate). This is deliberately
**out of scope** until real extraction produces output worth curating.

## 7. File map

| File | Role |
|------|------|
| `src/shared/contract.ts` | `ConceptCardData`, `ConceptAnalysis`, `AnalysisSummary`, RPC schemas |
| `src/bun/analyses.ts` | store + `newAnalysisId` |
| `src/bun/extraction.ts` | transcript builder, opencode run, NDJSON parser, card validator |
| `src/bun/index.ts` | `analyzeSession`/`listAnalyses` handlers, `openAnalysisTab`, tab guards |
| `src/mainview/views/AnalysisView.tsx` | renders one analysis's cards |
| `src/mainview/components/AppHeader.tsx` | **Prompt** button → `openPromptTab` |
| `src/mainview/views/PromptView.tsx` | renders the extractor system prompt + task template (a `kind: "prompt"` tab) |
| `src/mainview/views/ConceptCardsView.tsx` | exports `FeedCard`/`DiagramModal` (shared with AnalysisView) |
| `src/mainview/views/AgentSessions.tsx` | `hasAnalysis` enrichment + `analyzeSession` action |
| `src/mainview/concepts.ts` | curated registry, aliases shared card types |

**Panel side** (`@industry-theme/file-city-panel`):
`src/types/FileCityGuidePanel.ts` (`AgentSessionView.hasAnalysis`,
`FileCityGuidePanelActions.analyzeSession`) and
`src/panels/FileCityGuidePanel/modes/agentSessionsMode.tsx` (row button).

## 8. Testing checklist

- [ ] Analyze on a fresh session → analysis tab opens, shows `pending`
      ("Extracting concept cards…"), then flips to `done` with real cards
      (transcript written to `~/.principal/transcripts/<id>.md`).
- [ ] Analyze again on the same session → focuses the existing tab, no new
      record, no duplicate tab.
- [ ] Row flips to accent (`hasAnalysis`) after the first analyze.
- [ ] `~/.principal/principal-studio-analyses.json` gains one entry per analyzed
      session (with `model` + `concepts` on success); `listAnalyses` matches.
- [ ] Analysis tab closes like any tab (Cmd+W / close button); reopening via
      the row button restores it.
- [ ] A session with real extraction shows `pending` then `done` without
      blocking the UI; failure surfaces `error`.
- [ ] **Prompt** in the app header opens the prompt tab; it shows the verbatim
      system prompt (with `edit: deny`) and the interpolated task template, and
      the tab closes like any other.
