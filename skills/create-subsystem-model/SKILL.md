---
name: create-subsystem-model
description: Author a subsystem model (named components + package/module containment + runtime trails describing one subsystem of a codebase) and create it with `npx -y @principal-ai/principal-studio-cli subsystem-model create`, which persists to disk and opens it in Subsystems Studio (launching Studio if it is not already running). Use when the user says "make a subsystem model", "make a subsystem graph", "diagram this subsystem", "post a component graph to the viewer", "visualize this architecture", "show the flows", or invokes /create-subsystem-model or /create-subsystem-graph. NOT for File City authoring in the Principal desktop app (use the author-*/create-topic skills there), Excalidraw drawings (use excalidraw-drawings), or topics (use create-topic).
---

# Create Subsystem Model

Create a subsystem model with the Principal AI CLI via **npx** (no global
install). It validates the payload, persists to
`~/.principal/subsystem-models/<id>.json`, and opens an interactive React Flow
tab in Subsystems Studio — launching Studio when it is not already running.
When the payload includes `trails`, the sidebar opens on a **Trails**
panel instead of Files.

Studio does **not** need to be running first. Prefer the CLI over curling the
local HTTP bridge.

## 1. Run the CLI with npx

Do **not** ask the user to install the CLI globally. Invoke it with:

```bash
npx -y @principal-ai/principal-studio-cli <command>
```

`-y` skips the npx install prompt. Subsystems Studio ships as an optional
dependency of the CLI (macOS arm64 today); if it is missing on this platform,
`create` still writes the model and prints how to open it later.

If `principal-ai` is already on PATH (global or local install), that binary is
fine too — prefer whichever is available without making the user install
anything new.

## 2. Derive the model

Analyze the target subsystem in the repo and produce:

- **Components** (nodes) — concrete code units anchored to a real exported
  `symbol`, tagged with `construct`. The `file` field is each
  unit's location anchor. Hand-author a `declaration` (params, return type,
  members) when the click panel should show signature shape — pair with
  `declarationProvenance: "authored"`. **`construct: "module"` is rejected** —
  a file is not a node. Anchor each export as its real construct and set
  optional `module` (source path) so the file draws as a frame. If you catch
  yourself posting a file as a component, stop and find the symbol.
- **Boundaries** — package / `module` / `process` membership frames (see
  below). These are the model's topology: `module` is source-file containment,
  `process` is runtime deployment. There are no authored edge relations —
  runtime seams (calls, feeds, writes, …) live on **trail steps**.
- **Trails** (required when the model explains *how something works*) —
  ordered execution stories over components. The UI calls these Trails;
  the wire field is `trails`. Graph edges for steps are **derived** —
  do not author a parallel runtime edge list. One trail per named
  story (open, save, refresh, …). Skip only for pure topology models
  with no runtime story.

## 3. Create via the CLI

Write the payload to a temp file (or pipe JSON on stdin), then:

```bash
npx -y @principal-ai/principal-studio-cli subsystem-model create --file model.json
# or:  cat model.json | npx -y @principal-ai/principal-studio-cli subsystem-model create
# persist only:  npx -y @principal-ai/principal-studio-cli subsystem-model create --file model.json --no-open
```

```jsonc
{
  "$schema": "https://principal-ai.dev/schemas/subsystem-model.schema.json",   // optional
  "title": "Subsystems Studio session service",        // required
  "description": "Optional one-liner.",
  "components": [                                  // required
    {
      "alias": "session-service",                  // model-local, unique; edges point here
      "name": "SessionService",
      "construct": "function",                     // see construct list below
      "role": "entry",                             // optional: entry | service
      "proposed": false,                           // optional: true = not in source yet
      "framework": "bun",                          // optional: framework owning the stereotype
      "stereotype": "controller",                  // optional: framework pattern the construct plays
      "file": "packages/subsystems-studio/src/bun/server-sessions.ts",  // repo-relative
      "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/server-sessions.ts",
      "symbol": "probeOpencodeServer",             // optional but strongly preferred
      "purpose": "Lists and watches opencode sessions.",  // optional, one line
      "process": "subsystems-studio/host",               // optional deployment unit / boundary
      "module": "packages/subsystems-studio/src/bun/server-sessions.ts", // optional source-file frame
      "layer": 1,                                  // optional int, lower = closer to entry
      "declaration": {                             // optional — click-panel signature shape
        "kind": "function",                        // discriminator; match construct when possible
        "parameters": [{ "name": "root", "type": "string" }],
        "returnType": "Promise<SessionSummary[]>"    // no callers/callees — not in the schema
      },
      "declarationProvenance": "authored"          // required when declaration is set by hand
    }
  ],
  "trails": [                                // flows — see section below
    {
      "id": "wt-list-sessions",
      "title": "List sessions",
      "steps": [
        {
          "from": "session-service",               // source component alias
          "to": "warmup-worker",                   // target component alias
          "mechanism": "calls",                    // see mechanism list below
          "file": "packages/subsystems-studio/src/bun/server-sessions.ts",
          "line": 42,                              // 1-based site where the seam fires
          "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/server-sessions.ts",  // required: file-anchored purl of the seam site; readers resolve the checkout from this
          "symbol": "probeOpencodeServer",         // optional frame label in Trails UI
          "annotation": "Probe the server before listing sessions."  // optional codeview note
        }
      ]
    }
  ]
}
```

Rules:

- `file` paths MUST be repo-root-relative (each file is resolved against its
  own repo's checkout); `purl` subpaths carry the same path after `#`.
- Portable documents carry only `$schema` / `title` / `description` /
  `components` / `trails`. Repo identity lives on each
  component's `purl` and each trail step's `purl` — there is no stored
  `repo` field. Local checkouts are
  resolved from the **Alexandria registry** (`~/.alexandria/projects.json`), so
  you normally pass nothing extra: registering the repo in Alexandria (opening
  it in Studio, or `repo add`) is what makes file reads work. A create/update
  payload may still carry `repoRoot` (single repo) or `repoRoots` (map keyed by
  purl repo key) as a **registration hint** — Studio learns those paths into
  Alexandria instead of storing them — but they are not part of the document and
  are dropped before any share surface.
- `purpose` is rendered as a doc comment under the node's declaration: one
  plain-text sentence, verb-first. No markdown (backticks render literally),
  no brace-dumps, no restating the signature — specifics belong in
  `declaration` and `refs`. A second thought goes on a second line via `\n`.
- `symbol` must be a real definition graphify can anchor (exact node in the
  code graph). File existence is checked on create/update; symbol presence is
  confirmed later by audit against graphify — not by a text regex. Prefer real
  exported / declared names, not invented labels.
- `process` groups nodes into a runtime deployment boundary (e.g.
  `subsystems-studio/host` vs `principal-studio/renderer`). Nodes without one
  sit outside every process frame.
- `module` groups nodes into a source-file frame (usually the same path as
  `file`). Prefer this over inventing a module construct: each export keeps
  its real `construct`, and multi-member modules draw a dashed
  `module · path` frame. When every member of a module also shares the same
  `process`, the module frame nests inside that process frame
  (process → module → export). Singleton modules (one export) stay unframed —
  same 2+ member rule as process.
- Scope by story, not by node count: one subsystem / one coherent flow. Include
  a component only when a trail actually reaches it or it anchors a
  boundary frame — a node no trail reaches is a smell. Split only when
  the model spans genuinely unrelated stories or stops reading at a glance.
- Component `alias`es are referenced by trail `from`/`to`; they are model-local and stable across file moves (edges point at the alias, not the location), so never rename on update. Code identity for composed multi-model views lives on `purl` + `file` + `symbol`, not the alias.
- Trail steps carry their own `from`/`to`/`mechanism`; there is no separate relation id.

Stdout is `{ ok: true, graph }` — capture `graph.id` (`sg-<ts>-<rand>`).
Also read `verification.trailsChecked` / `trailsFailed` when walks
were included and Studio verified them.

Do **not** ask the user to start Studio first. The CLI opens or launches it.
Do **not** curl the HTTP bridge unless the user explicitly asks for the raw API.

## Trails (`trails`)

Trails are the point of a "how this works" model. Components (with their
package / `module` / `process` frames) are the topology map; trails are
the runtime stories. Display edges for steps are **derived** from steps — you
never author an `edges` array.

**When to author them**

- Default **on** for any model that explains a request path, open/close loop,
  save/load, refresh, or multi-step interaction.
- One trail per distinct story (not one mega-walk of every step).
- Prefer 2–8 steps, touching roughly 2–6 distinct components. A walk that spans
  most of the diagram is really several stories — split it. Reuse the same
  `from`/`to`/`mechanism` step in multiple trails when real (e.g. a shared
  scan step on open and save).

**Step contract**

| Field | Required | Meaning |
|---|---|---|
| `from` | yes | Source component `alias` this step starts from |
| `to` | yes | Target component `alias` this step lands on |
| `mechanism` | yes | Runtime seam label (closed set below) |
| `file` | yes | Repo-root-relative path of the seam site |
| `line` | yes | 1-based line in `file` where that relationship fires |
| `purl` | yes | File-anchored purl of the seam site (repo key + `#` + `file`, mirroring component `purl`). Readers resolve the checkout from this — the step must not rely on its endpoints' repos. The fragment after `#` must equal `file`. |
| `symbol` | yes | Frame name shown in the Trails list — the function/method on the stack at the site. Required; there is no mechanism + filename fallback. |
| `annotation` | no | Free-text note for this step. Viewers show it in the codeview annotation column next to the highlighted line. Informative only — never verified against source. Prefer one short verb-first sentence (same voice as `purpose`). |

Do **not** point `file:line` at a random nearby line: pick the line where the
seam actually fires (a reviewer checks the step against it). Site verification
(`verification.trailsChecked` / `trailsFailed`) confirms the file
resolves under the step's `purl` and the line is in range and non-blank — it
does not check text affinity, so a wrong-but-plausible line passes
verification and misleads readers. Get the line right anyway.

**Authoring workflow**

1. Lay components (+ optional `module` / `process` boundary frames).
2. Name the trails the user cares about (titles humans will click).
3. For each step, open the real glue file, pick the call/emit/register line,
   and record `{ from, to, mechanism, file, line, purl, symbol?, annotation? }`
   where `purl` is the file-anchored purl of that glue file (`<repo-key>#<file>`).
   The seam file does NOT need an owning component — that is exactly what the
   step `purl` is for.
   Default **on** for `annotation` when the step needs a human-readable
   "what happens here" — the site line alone is often opaque without it.
4. Create via CLI; if `trailsFailed` is non-empty, correct the site lines
   and update (Studio HTTP PUT while Studio is running, or recreate).

Reference shape: `packages/subsystems-react/src/stories/Subsystem/ComponentGraph/Trails.stories.tsx`.

## Closed vocabularies

Validated against the published model (`subsystem/model.ts`), the JSON schema
(`packages/subsystems-core/schemas/subsystem-model.schema.json`), and the
store validators. Off-list step `mechanism`s are rejected; off-list `construct`
values are rejected naming the allowed set.

**Component `construct`** (code shape — one of):

- `class`, `function`, `method`, `interface`, `type_alias`, `enum`, `store`, `external`
- `custom_entity` — an **authored actor** (Person / agent / queue), not code

`construct: "module"` is **rejected**: a source file is not a node — anchor to
a concrete export inside it (`symbol` + `file`), and set optional `module` to
that path when you want a file frame. Or publish the file as its own
subsystem model and reference it from `purpose`/`description`.

`custom_entity` is for actors that participate in the flow but have no source
declaration — a Person, an agent, a queue (e.g. `NudgeQueue`). There is no
`symbol` and no `file` (leave `file` empty, `purl` may be `external` or a real
repo purl). Tag the actor kind with `entityKind` (badge text, e.g. `Person`,
`agent`, `queue`); optionally override the node color with `color` (hex) and
hand-author `declaration` (`kind: "custom_entity"` + `attributes` as ordered
`{ key, value }` pairs — e.g. `level: L1`, `approvalLimit: $500`). Entities
group by `process` / `module` / `layer` and participate in trail steps
exactly like code nodes.

### `store` — a retained-state declaration

Use `store` for **state that outlives a single call** — the thing a function
reads or writes rather than the function doing the work:

- a module-level or closure-level state block: `const feeds = new Map<...>()`,
  `const listeners = new Set<...>()`, a singleton registry/cache
- a class's retained fields when the state matters on its own
- a DB table or on-disk file this process reads/writes (`storage: "external"`)

It is **not** for:
- a function that *manages* state — that is a `function` (a store is the state
  it manages, not the accessor). If a class manages access, the class is a
  separate `class` node joined to the store by `writes`/`reads`.
- a service, singleton *object*, or module — those are `class`/`function`/module
  frames, not stores.

**Anchor a store at the state declaration**, not at a function that returns it.
`name`/`symbol` are the state's own name (`feeds`, `cartStore`); a function that
reads or writes it is its own node, linked by `writes` / `reads` / `watches`
steps. When the state is closure-local (created inside a factory), anchor it at
the state location anyway — it is a real declaration even if a symbol-only
index cannot see it.

A store **declares its type** like every other declaration, on
`declaration.valueType`:

- state block → the value type (`Map<string, OpencodeLiveFeedState>`,
  `Set<FeedListener>`)
- table → the row/record type; when only columns are known, list them in
  `declaration.properties` instead

Set `declaration.storage` to say how it persists — `memory` (process-lifetime
RAM), `disk` (this process on the filesystem), `external` (another system —
db/service). An in-memory store is still `storage: "memory"`, not a separate
construct; `storage` is orthogonal to `construct`, exactly like `framework` to
`function`.

```jsonc
{
  "alias": "feeds",
  "name": "feeds",
  "construct": "store",
  "symbol": "feeds",
  "file": "src/bun/opencode-v2-live.ts",
  "purl": "pkg:github/you/your-app",
  "declaration": {
    "kind": "store",
    "storage": "memory",
    "valueType": "Map<string, OpencodeLiveFeedState>",
    "properties": []
  },
  "declarationProvenance": "authored"
}
```

The node shows the state's name and its `storage` badge; `valueType` renders in
the click panel. Give an in-memory store a `valueType` — an unnamed `Map`/`Set`
is the common case, and the type is the interesting part of the declaration.

`method` is for **standalone method components** selected from a class. Use it
when a class method is important enough to be its own node. `symbol` should be
the dotted form (`ClassName.methodName`). Do not use `method` for top-level
functions — use `function` for those.

**Component `role`** (optional topology role):

- `entry` — boundary / UI / RPC entry the story starts from
- `service` — external system the process calls out to

**Component `framework` / `stereotype`** (optional, orthogonal to `construct`):

Pair them when the unit plays a framework pattern that isn't a language
construct. Examples: `framework: "react"` + `stereotype: "component"` on a
`construct: function`; `framework: "nestjs"` + `stereotype: "controller"`.
Empty when the node is language-only.

**Component `proposed`** (optional boolean):

Set `proposed: true` for design / migration nodes that do not exist in
source yet. Keep a real `construct` for the intended shape (`function`,
`class`, …). Verification skips source checks until you promote the node
(clear `proposed`, fill `file` + `symbol`). Do **not** misuse
`construct: "external"` for planned in-repo code — that is for real outside
systems.

**Component `process` / `module`** (optional boundary frames):

- `process` — runtime deployment unit (e.g. `principal-studio/host`). Multi-
  member values draw a dashed process frame.
- `module` — source-file membership (usually equals `file`). Multi-member
  values draw a `module · path` frame. When all members share one `process`,
  the module frame nests inside that process (process → module → export).
  Never use `construct: "module"` for this.

**Trail step `mechanism`** (how `from` relates to `to` at a runtime
site — request/response and pushed data both live here):

| Style | Labels |
|---|---|
| solid | `calls`, `uses`, `feeds`, `produces`, `writes`, `reads` |
| dashed | `watches`, `registers-into` |

Semantics: `calls` = direct invocation (request/response); `uses` = general
runtime dependency; `feeds` = data-flow output→input; `produces` = emits an
output; `writes`/`reads` = store access; `watches` = observes/subscribes;
`registers-into` = subscriber registration into a fan-out bag. For RPC /
event-broadcast use the closest match (`calls` for request/response,
`feeds` / `produces` for pushed data). Structural labels (`imports`, `extends`,
…) are **not** valid step mechanisms — the model has no authored edge
relations; keep wiring on trail steps.

**Declarations** (`component.declaration`) render params, return type, and
members in the click panel — hand-author them when you want to highlight
specific inputs/outputs. Discriminated by `declaration.kind` (`function`,
`class`, `method`, `type`, `store`, `external`, `custom_entity`, …). Every
declaration carries the shape that makes sense for its kind — for a `store`
that is `storage` + `valueType` + `properties` (see above). Declarations are
`additionalProperties: false` — only use the fields the schema declares for
that `kind`, or the model is rejected. There are **no** `callers` / `callees`
fields (retired); interactions live on trail steps. A store has `storage` /
`valueType` / `valueTypeRef` / `properties` and nothing else. Every hand-written
`declaration` must carry provenance:

- `"declarationProvenance": "authored"` — written by you from reading the
  code; informative but not checked against source (defaulted when omitted)
- `"declarationProvenance": "verified"` — reserved for tool-extracted data
  (graphify AST / signature extraction). Never claim it by hand.

Invalid provenance values are rejected; declarations without one are stored
as `authored`.

## 4. Re-open later

```bash
npx -y @principal-ai/principal-studio-cli subsystem-model open <graph.id>
```

## Local checkouts (Alexandria)

Files are served only when the component's repo is registered locally: clicking
a node then serves the file inline in the detail panel (sandboxed read —
traversal is rejected). Without a registered checkout the model still renders,
but node clicks show only metadata, and trail site verification against
real `file:line` contents is skipped.

Repo → checkout binding is **not stored on the model**. It is resolved per
component from its `purl` via the Alexandria registry
(`~/.alexandria/projects.json`) — the same registry Studio writes when you open
a repo (`principal-ai repo add <path>` registers one explicitly).

A create/update payload may include roots as a **registration hint**; Studio
registers them into Alexandria (idempotent) and never stores them:

- `repoRoot` — a single local checkout; its remote is derived from the first
  component purl.
- `repoRoots` — multi-repo models: a map keyed by purl repo key
  (`pkg:github/owner/name`, fragment stripped) → local root.

## Managing existing models

```bash
npx -y @principal-ai/principal-studio-cli subsystem-model list
npx -y @principal-ai/principal-studio-cli subsystem-model get <id>
```

While Subsystems Studio is running, the HTTP bridge still supports update/delete:

```bash
curl -s -X PUT http://127.0.0.1:3045/api/subsystem-model/<id> \
  -H 'Content-Type: application/json' -d '{"description":"updated"}'
curl -s -X DELETE http://127.0.0.1:3045/api/subsystem-model/<id>
```

Prefer PUT over delete-and-recreate so ids and timestamps stay stable. DELETE
also closes any tabs rendering the model. To add trails to an existing model,
PUT `{ "trails": [ ... ] }` (or updated `module` / `process` frames).