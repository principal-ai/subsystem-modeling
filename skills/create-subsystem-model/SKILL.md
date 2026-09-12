---
name: create-subsystem-model
description: Author a subsystem model (named components + typed relations + execution flows/walkthroughs describing one subsystem of a codebase) and create it with `npx -y @principal-ai/principal-studio-cli subsystem-model create`, which persists to disk and opens it in Subsystems Studio (launching Studio if it is not already running). Use when the user says "make a subsystem model", "make a subsystem graph", "diagram this subsystem", "post a component graph to the viewer", "visualize this architecture", "show the flows", or invokes /create-subsystem-model or /create-subsystem-graph. NOT for File City trails (use author-{investigation,informative}-trail), Excalidraw drawings (use excalidraw-drawings), or topics (use create-topic).
---

# Create Subsystem Model

Create a subsystem model with the Principal AI CLI via **npx** (no global
install). It validates the payload, persists to
`~/.principal/subsystem-models/<id>.json`, and opens an interactive React Flow
tab in Subsystems Studio — launching Studio when it is not already running.
When the payload includes `walkthroughs`, the sidebar opens on a **Walkthroughs**
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
  `declarationProvenance: "authored"`. **`module` is rejected**: a module is
  its own subsystem — give it its own model and reference it, or name the
  export inside it that matters. If you catch yourself posting a file as a
  component, stop and find the symbol.
- **Relations** — topology only (structural / module / type). `relationType` is
  a **closed set** (Set A below); pick the closest label and put specifics in
  `refs` evidence. Runtime seams do **not** go here.
- **Walkthroughs** (required when the model explains *how something works*) —
  ordered runtime hops with `from`/`to`/`mechanism`/`file`/`line`. The UI calls
  these Walkthroughs; the wire field is `walkthroughs`. Graph edges for hops
  are **derived** — do not author a parallel runtime edge list. One walkthrough
  per named story (open, save, refresh, …). Skip only for pure topology models
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
  "title": "Subsystems Studio session service",        // required
  "description": "Optional one-liner.",
  "source": "agent:<your-name>",                   // optional provenance
  "repo": { "owner": "principal-ai", "name": "subsystem-modeling" },
  "repoRoot": "/abs/path/to/local/clone",         // see "repoRoot" below
  "components": [                                  // required
    {
      "id": "session-service",                     // stable, unique
      "name": "SessionService",
      "construct": "function",                     // see construct list below
      "role": "entry",                             // optional: entry | service
      "proposed": false,                           // optional: true = not in source yet
      "file": "packages/subsystems-studio/src/bun/server-sessions.ts",  // repo-relative
      "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/server-sessions.ts",
      "symbol": "probeOpencodeServer",             // optional but strongly preferred
      "purpose": "Lists and watches opencode sessions.",  // optional, one line
      "process": "subsystems-studio/host",               // optional deployment unit / boundary
      "layer": 1,                                  // optional int, lower = closer to entry
      "declaration": {                             // optional — click-panel signature shape
        "kind": "function",                        // discriminator; match construct when possible
        "parameters": [{ "name": "root", "type": "string" }],
        "returnType": "Promise<SessionSummary[]>",
        "callers": [],                             // leave empty — relations carry interactions
        "callees": []
      },
      "declarationProvenance": "authored"          // required when declaration is set by hand
    }
  ],
  "relations": [
    {
      "id": "sessions-imports-warmup",
      "from": "session-service",
      "to": "warmup-worker",
      "relationType": "imports",
      "refs": ["pkg:github/owner/repo#path/to/glue.ts"]
    }
  ],
  "walkthroughs": [
    {
      "id": "wt-list-sessions",
      "title": "List sessions",
      "steps": [
        {
          "from": "session-service",
          "to": "warmup-worker",
          "mechanism": "calls",
          "file": "packages/subsystems-studio/src/bun/server-sessions.ts",
          "line": 42,
          "symbol": "probeOpencodeServer",
          "annotation": "Probe the server before listing sessions."
        }
      ]
    }
  ]
}
```

Rules:

- `file` paths MUST be repo-root-relative (they join onto `repoRoot` for reads);
  `purl` subpaths carry the same path after `#`.
- `purpose` is rendered as a doc comment under the node's declaration: one
  plain-text sentence, verb-first. No markdown (backticks render literally),
  no brace-dumps, no restating the signature — specifics belong in
  `declaration` and `refs`. A second thought goes on a second line via `\n`.
- `symbol` must be a real definition graphify can anchor (exact node in the
  code graph). File existence is checked on create/update; symbol presence is
  confirmed later by audit against graphify — not by a text regex. Prefer real
  exported / declared names, not invented labels.
- `process` groups nodes into boundary regions (e.g. `subsystems-studio/host` vs
  `principal-studio/renderer`). Nodes without one sit outside every boundary.
- Keep models to one subsystem, roughly 4–15 components. Split sprawling ones.
- Component `id`s are referenced by relation / walkthrough `from`/`to`; never rename on update.
- Relation `id`s are stable topology keys; walkthrough steps carry their own `from`/`to`/`mechanism`.

Stdout is `{ ok: true, graph }` — capture `graph.id` (`sg-<ts>-<rand>`).
Also read `verification.walkthroughsChecked` / `walkthroughsFailed` when flows
were included and Studio verified them.

Do **not** ask the user to start Studio first. The CLI opens or launches it.
Do **not** curl the HTTP bridge unless the user explicitly asks for the raw API.

## Walkthroughs (`walkthroughs`)

Walkthroughs are the point of a "how this works" model. Components + relations
are the topology map; walkthroughs are the runtime stories. Display edges for
hops are derived from steps.

**When to author them**

- Default **on** for any model that explains a request path, open/close loop,
  save/load, refresh, or multi-hop interaction.
- One walkthrough per distinct story (not one mega-walk of every hop).
- Prefer 2–8 steps. Reuse the same `from`/`to`/`mechanism` hop in multiple
  walkthroughs when real (e.g. a shared scan hop on open and save).

**Step contract**

| Field | Required | Meaning |
|---|---|---|
| `from` / `to` / `mechanism` | yes | Hop endpoints + Set B mechanism (`calls`, `uses`, …) |
| `file` | yes | Repo-root-relative path of the seam site |
| `line` | yes | 1-based line in `file` where that relationship fires |
| `symbol` | no | Frame name shown in the Walkthroughs list (function/method at the site) |
| `annotation` | no | Free-text note for this hop. Viewers show it in the codeview annotation column next to the highlighted line. Informative only — never verified against source. Prefer one short verb-first sentence (same voice as `purpose`). |

Do **not** point `file:line` at a random nearby line: verification checks that
the site line has **affinity** with the hop (mentions an endpoint symbol/name,
lenient ≥4-char identifier match). Failed affinity
shows up in `verification.walkthroughsFailed` (informational — does not block
persist, but fix before considering the model done).

**Authoring workflow**

1. Lay components (+ optional topology `relations`).
2. Name the walkthroughs the user cares about (titles humans will click).
3. For each hop, open the real glue file, pick the call/emit/register line,
   and record `{ from, to, mechanism, file, line, symbol?, annotation? }`. Default **on** for
   `annotation` when the hop needs a human-readable “what happens here” — the
   site line alone is often opaque without it.
4. Create via CLI; if `walkthroughsFailed` is non-empty, correct the site lines
   and update (Studio HTTP PUT while Studio is running, or recreate).

Reference shape: `packages/subsystems-react/src/stories/Subsystem/ComponentGraph/Flows.stories.tsx`.

## Closed vocabularies

Validated against the published model (`subsystem/model.ts`) and the
store validators. Off-list `relationType` / hop `mechanism` values are rejected;
off-list `construct` values are rejected naming the allowed set.

**Component `construct`** (code shape — one of):

- `class`, `function`, `method`, `interface`, `type_alias`, `enum`, `store`, `external`
- `custom_entity` — an **authored actor** (Person / agent / queue), not code

`module` is **rejected**: a module is its own subsystem — anchor to
a concrete export inside it (`symbol` + `file`), or publish the module as a
separate model and reference it from `purpose`/`description`.

`custom_entity` is for actors that participate in the flow but have no source
declaration — a Person, an agent, a queue (e.g. `NudgeQueue`). There is no
`symbol` and no `file` (leave `file` empty, `purl` may be `external` or a real
repo purl). Tag the actor kind with `entityKind` (badge text, e.g. `Person`,
`agent`, `queue`); optionally override the node color with `color` (hex) and
hand-author `declaration` (`kind: "custom_entity"` + `attributes` as ordered
`{ key, value }` pairs — e.g. `level: L1`, `approvalLimit: $500`). Entities
group by `process`/`layer` and flow through relations exactly like code nodes.

`store` is for retained state registries (e.g. a `Set`/`Map` module-scope
subscriber bag), not conceptual "services". Pair with `writes` / `reads` /
`watches` relations.

`method` is for **standalone method components** selected from a class. Use it
when a class method is important enough to be its own node. `symbol` should be
the dotted form (`ClassName.methodName`). Do not use `method` for top-level
functions — use `function` for those.

**Component `role`** (optional topology role):

- `entry` — boundary / UI / RPC entry the story starts from
- `service` — external system the process calls out to

**Component `proposed`** (optional boolean):

Set `proposed: true` for design / migration nodes that do not exist in
source yet. Keep a real `construct` for the intended shape (`function`,
`class`, …). Verification skips source checks until you promote the node
(clear `proposed`, fill `file` + `symbol`). Do **not** misuse
`construct: "external"` for planned in-repo code — that is for real outside
systems.

**Relation `relationType`** (topology — Set A):

| Style | Labels |
|---|---|
| solid | `imports`, `method`, `contains` |
| dashed | `extends`, `inherits`, `implements`, `mixes_in` |
| dotted | `references` |

**Walkthrough hop `mechanism`** (runtime — Set B):

| Style | Labels |
|---|---|
| solid | `calls`, `uses`, `feeds`, `produces`, `writes`, `reads` |
| dashed | `registers-into`, `watches` |

Semantics: `uses` = general dependency (prefer a tighter verb); `feeds` =
data-flow output→input; `produces` = emits an output; `writes`/`reads`/`watches`
= store access; `registers-into` = subscriber registration into a fan-out bag.
For RPC / event-broadcast use the closest match (`calls` for request/response,
`feeds` / `produces` for pushed data).

**Declarations** (`component.declaration`) render params, return type, and
members in the click panel — hand-author them when you want to highlight
specific inputs/outputs. Discriminated by `declaration.kind` (`function`,
`class`, `method`, `type`, `store`, `external`, `custom_entity`, …). Don't
bother filling
`callers`/`callees`: relationship comments are intentionally not rendered
(the model's relations carry interactions). Every hand-written `declaration`
must carry provenance:

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

## repoRoot

Opt-in but strongly recommended when the repo exists locally: clicking a node
then serves the file inline in the detail panel (sandboxed read — traversal is
rejected). Without `repoRoot` the model still renders, but node clicks show
only metadata (`graph has no repoRoot`). Needed for walkthrough site
verification against real `file:line` contents.

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
also closes any tabs rendering the model. To add walkthroughs to an existing model,
PUT `{ "walkthroughs": [ ... ] }` (and any new topology `relations` if needed).
