---
name: create-subsystem-model
description: Author a subsystem model (named components + typed edges + execution flows/throughlines describing one subsystem of a codebase) and create it with `npx -y @principal-ai/principal-studio-cli subsystem-model create`, which persists to disk and opens it in Subsystems Studio (launching Studio if it is not already running). Use when the user says "make a subsystem model", "make a subsystem graph", "diagram this subsystem", "post a component graph to the viewer", "visualize this architecture", "show the flows", or invokes /create-subsystem-model or /create-subsystem-graph. NOT for File City trails (use author-{investigation,informative}-trail), Excalidraw drawings (use excalidraw-drawings), or topics (use create-topic).
---

# Create Subsystem Model

Create a subsystem model with the Principal AI CLI via **npx** (no global
install). It validates the payload, persists to
`~/.principal/subsystem-models/<id>.json`, and opens an interactive React Flow
tab in Subsystems Studio — launching Studio when it is not already running.
When the payload includes `throughlines`, the sidebar opens on a **Flows**
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
- **Edges** — real interactions between them. `mechanism` is a **closed set**
  (see below); pick the closest label and put specifics in `refs` evidence.
- **Throughlines / flows** (required when the model explains *how something
  works*) — ordered execution stories over **existing** edges. The UI calls
  these Flows; the wire field is `throughlines`. One throughline per named
  flow (open, save, refresh, …). Skip only for pure topology/inventory models
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
      "file": "packages/subsystems-studio/src/bun/server-sessions.ts",  // repo-relative
      "purl": "pkg:github/principal-ai/subsystem-modeling#packages/subsystems-studio/src/bun/server-sessions.ts",
      "symbol": "probeOpencodeServer",             // optional but strongly preferred
      "purpose": "Lists and watches opencode sessions.",  // optional, one line
      "process": "subsystems-studio/host",               // optional deployment unit / boundary
      "layer": 1,                                  // optional int, lower = closer to entry
      "capture": "analyzed",                       // optional: edited | analyzed | referenced
      "declaration": {                             // optional — click-panel signature shape
        "kind": "function",                        // discriminator; match construct when possible
        "parameters": [{ "name": "root", "type": "string" }],
        "returnType": "Promise<SessionSummary[]>",
        "callers": [],                             // leave empty — edges carry interactions
        "callees": []
      },
      "declarationProvenance": "authored"          // required when declaration is set by hand
    }
  ],
  "edges": [                                       // required
    {
      "id": "sessions-to-warmup",
      "from": "session-service",
      "to": "warmup-worker",                       // component ids, not names
      "mechanism": "uses",
      "refs": ["pkg:github/owner/repo#path/to/glue.ts"]  // optional purl evidence
    }
  ],
  "throughlines": [                                // flows — see section below
    {
      "id": "tl-list-sessions",
      "title": "List sessions",
      "steps": [
        {
          "edgeId": "sessions-to-warmup",          // must match an edge.id
          "file": "packages/subsystems-studio/src/bun/server-sessions.ts",
          "line": 42,                              // 1-based site where the edge fires
          "symbol": "probeOpencodeServer"          // optional frame label in Flows UI
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
- `symbol` must be a real declaration in `file` — it is verified on
  create/update when Studio's HTTP bridge handles the write (function/class/
  const/interface/type/enum match; mentions, imports, and call sites don't
  count). Undeclared symbols are reported in the response's
  `verification.symbolsMissing`. Use real exported names, not invented labels.
- `process` groups nodes into boundary regions (e.g. `subsystems-studio/host` vs
  `principal-studio/renderer`). Nodes without one sit outside every boundary.
- Keep models to one subsystem, roughly 4–15 components. Split sprawling ones.
- Component `id`s are referenced by edge `from`/`to`; never rename on update.
- Edge `id`s are referenced by throughline steps; keep them stable.

Stdout is `{ ok: true, graph }` — capture `graph.id` (`sg-<ts>-<rand>`).
Also read `verification.throughlinesChecked` / `throughlinesFailed` when flows
were included and Studio verified them.

Do **not** ask the user to start Studio first. The CLI opens or launches it.
Do **not** curl the HTTP bridge unless the user explicitly asks for the raw API.

## Flows (`throughlines`)

Flows are the point of a "how this works" model. Components + edges are the
map; throughlines are the routes across it.

**When to author them**

- Default **on** for any model that explains a request path, open/close loop,
  save/load, refresh, or multi-hop interaction.
- One throughline per distinct story (not one mega-walk of every edge).
- Prefer 2–8 steps. Reuse the same edge in multiple flows when real (e.g. a
  shared scan hop on open and save).

**Step contract**

| Field | Required | Meaning |
|---|---|---|
| `edgeId` | yes | Id of an **existing** edge this hop traverses |
| `file` | yes | Repo-root-relative path of the seam site |
| `line` | yes | 1-based line in `file` where that relationship fires |
| `symbol` | no | Frame name shown in the Flows list (function/method at the site) |

Do **not** invent edges just for a flow — add the edge first, then reference it.
Do **not** point `file:line` at a random nearby line: verification checks that
the site line has **affinity** with the edge (mentions an endpoint symbol/name
or a token from `refs`, lenient ≥4-char identifier match). Failed affinity
shows up in `verification.throughlinesFailed` (informational — does not block
persist, but fix before considering the model done).

**Authoring workflow**

1. Lay components + edges for the topology.
2. Name the flows the user cares about (titles humans will click).
3. For each hop, open the real glue file, pick the call/emit/register line,
   and record `{ edgeId, file, line, symbol }`.
4. Create via CLI; if `throughlinesFailed` is non-empty, correct the site lines
   and update (Studio HTTP PUT while Studio is running, or recreate).

Reference shape: `packages/react/src/stories/Subsystem/ComponentGraph/Flows.stories.tsx`.

## Closed vocabularies

Validated against the published model (`subsystem/model.ts`) and the
store validators. Off-list edge `mechanism`s are rejected; off-list
`construct` values are rejected naming the allowed set.

**Component `construct`** (code shape — one of):

- `class`, `function`, `method`, `interface`, `type_alias`, `enum`, `store`, `external`

`module` is **rejected**: a module is its own subsystem — anchor to
a concrete export inside it (`symbol` + `file`), or publish the module as a
separate model and reference it from `purpose`/`description`.

`store` is for retained state registries (e.g. a `Set`/`Map` module-scope
subscriber bag), not conceptual "services". Pair with `writes` / `reads` /
`watches` edges.

`method` is for **standalone method components** selected from a class. Use it
when a class method is important enough to be its own node. `symbol` should be
the dotted form (`ClassName.methodName`). Do not use `method` for top-level
functions — use `function` for those.

**Component `role`** (optional topology role):

- `entry` — boundary / UI / RPC entry the story starts from
- `service` — external system the process calls out to

**Edge `mechanism`** (how `from` relates to `to`):

| Style | Labels |
|---|---|
| solid | `imports`, `imports_from`, `re_exports`, `defines`, `calls`, `uses`, `method`, `contains`, `feeds`, `produces`, `writes`, `reads` |
| dashed | `extends`, `inherits`, `implements`, `mixes_in`, `registers-into`, `watches` |
| dotted | `references` |

Semantics: `uses` = general dependency; `feeds` = data-flow output→input;
`produces` = emits an output; `writes`/`reads`/`watches` = store access;
`references` = type/symbol reference that isn't a call; `registers-into` =
subscriber registration into a fan-out bag. For RPC / event-broadcast use the
closest match (`calls` for request/response, `feeds` / `produces` for pushed
data).

**Declarations** (`component.declaration`) render params, return type, and
members in the click panel — hand-author them when you want to highlight
specific inputs/outputs. Discriminated by `declaration.kind` (`function`,
`class`, `method`, `type`, `store`, `external`, …). Don't bother filling
`callers`/`callees`: relationship comments are intentionally not rendered
(the model's edges carry interactions). Every hand-written `declaration`
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
only metadata (`graph has no repoRoot`). Needed for throughline site
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
also closes any tabs rendering the model. To add flows to an existing model,
PUT `{ "throughlines": [ ... ] }` (and any new edges those steps need).
