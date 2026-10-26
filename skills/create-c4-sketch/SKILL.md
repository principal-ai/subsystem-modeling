---
name: create-c4-sketch
description: Author a standalone C4 architecture sketch — containers, components, external systems, people, and authored edges — and create/open it in Subsystems Studio through the local HTTP API. Use when the user says "make a C4 sketch", "sketch this architecture", "draw a C4 diagram", "top-down C4", "architecture hypothesis", or invokes /create-c4-sketch. NOT for subsystem models (use create-subsystem-model), File City tours (use file-city-tours), Excalidraw drawings (use excalidraw-drawings), or topics (use create-topic).
---

# Create C4 Sketch

A C4 sketch is an **authored hypothesis**, not a model and not evidence. It can
exist before any subsystem model does. It carries containers, components,
external systems, people, **and edges**. It is never compared with a model,
never grounded, and never promoted into the accepted element store.

Sketches live at `~/.principal/c4-sketches/<id>.json` and open in their own
`c4-sketch` tab in Subsystems Studio.

## 1. Check Studio and resolve the repo

Sketches are created through Studio's local HTTP API, not the CLI:

```bash
STUDIO=http://127.0.0.1:3045       # PRINCIPAL_STUDIO_HTTP_PORT overrides this
curl -fsS "$STUDIO/health"
```

If that fails, ask the user to launch Studio. You can try:

```bash
npx -y @principal-ai/principal-studio-cli open-studio
```

Resolve the repository PURL from the Principal bridge (port **3044**, different
from Studio):

```bash
curl -s http://localhost:3044/api/repos \
  | jq '.repos[] | select(.path | contains("/your/repo")) | .purl'
```

Or use `git remote -v` and form `pkg:github/<owner>/<name>` yourself. A sketch
may reference several repos (`repoKeys` array); it may also have none for a
greenfield sketch.

## 2. Derive the sketch

Read the repo's README, docs, package manifests, and deployment files. Identify:

- **Containers** — deployable units or data stores. Not every package is a
  container; a library that is not a deployable unit should not get a container
  box.
- **Components** — functional groups inside exactly one container.
- **External systems** — software outside the boundary (third-party APIs,
  external services).
- **People** — actors outside the boundary.
- **Edges** — expected interactions, authored as hypotheses. There is no trail
  evidence in a sketch.

Use stable, readable ids:

- `container:<slug>` (e.g. `container:api-server`)
- `component:<slug>` (e.g. `component:session-store`)
- `external:<slug>` (e.g. `external:github`)
- `person:<slug>` (e.g. `person:developer`)
- `e:<source>-<target>` or another unique edge id

Edges must reference existing node ids. A component's `container` must reference
an existing container id.

## 3. Build the payload

```jsonc
{
  "title": "Acme widget architecture",
  "repoKeys": ["pkg:github/acme/widget"],
  "author": "agent",
  "notes": "## About\n\nThis sketch describes the **host** and **worker** and their expected interactions.",
  "model": {
    "view": "container",
    "system": { "id": "system:acme", "label": "Acme" },
    "nodes": [
      {
        "kind": "container",
        "id": "container:host",
        "label": "Host",
        "containerKind": "application",      // application | data-store
        "technology": "Bun",
        "process": "acme/host",              // optional; only when known
        "state": "proposed",                 // forced to proposed server-side
        "description": "The long-lived host process."
      },
      {
        "kind": "component",
        "id": "component:store",
        "label": "Store",
        "container": "container:host",       // required
        "technology": "Postgres",
        "members": ["store"],                // optional aliases
        "state": "proposed"
      },
      {
        "kind": "external-system",
        "id": "external:github",
        "label": "GitHub",
        "technology": "REST",
        "members": ["github"],
        "state": "proposed"
      },
      { "kind": "person", "id": "person:dev", "label": "Developer", "state": "proposed" }
    ],
    "edges": [
      {
        "id": "e:host-github",
        "source": "container:host",
        "target": "external:github",
        "label": "HTTPS",
        "protocol": "HTTPS",
        "mechanisms": ["calls"],
        "count": 1
      }
    ]
  }
}
```

### Node rules

| Kind | Required | Optional |
|---|---|---|
| `container` | `id`, `label`, `containerKind` (`application` or `data-store`) | `technology`, `process`, `description`, `parentId` |
| `component` | `id`, `label`, `container` | `technology`, `members`, `description` |
| `external-system` | `id`, `label` | `technology`, `members`, `description` |
| `person` | `id`, `label` | `description` |

- `state` is forced to `proposed` by the store. Do not send `accepted` or
  `rejected`.
- `technology` is usually expected by C4, but a sketch may leave it blank when
  unknown. The card shows what is missing.
- `notes` is Markdown and renders in the left **About** panel via the industry
  themed markdown component. Omit it or leave it empty to hide the panel.

### Edge rules

- `source` and `target` must be node ids.
- `label` is the chip text (`HTTPS`, `RPC`, `SQL`, …).
- `protocol` is the fuller interaction technology.
- `mechanisms` is an array of verbs (`calls`, `writes`, `reads`, `uses`, …).
- `count` is informational; sketches have no trail steps to count.
- Do not add `trailRefs`; sketches are authored, not evidence-backed.

## 4. Create and open

```bash
curl -sS -X POST "$STUDIO/api/c4-sketches" \
  -H 'content-type: application/json' \
  -d @sketch.json | jq '{ok, sketch: .sketch.id}'
```

Capture the returned `sketch.id`, then open its tab:

```bash
curl -sS -X POST "$STUDIO/api/c4-sketches/<id>/open" \
  -H 'content-type: application/json' -d '{}'
```

The sketch tab shows:

- full-width header with the title, `SKETCH` badge, **Open all**, **Collapse all**
- the authored C4 canvas (containers start collapsed)
- if `notes` is set, a left **About** panel rendering it as Markdown

## 5. Read, update, list, delete

```bash
curl -sS "$STUDIO/api/c4-sketches?repo=pkg:github/acme/widget" | jq
curl -sS "$STUDIO/api/c4-sketches/<id>" | jq
curl -sS -X PUT "$STUDIO/api/c4-sketches/<id>" \
  -H 'content-type: application/json' \
  -d '{"notes":"## Updated\n\nNew context."}' | jq
curl -sS -X DELETE "$STUDIO/api/c4-sketches/<id>" | jq
```

`PUT` accepts `title`, `repoKeys`, `model`, `author`, and `notes`; omitted fields
are left alone. Replacing `model` replaces the whole authored graph.

## Rules

- **No grounding, model comparison, compare-model action, or promotion.** A
  sketch is standalone. Do not mention coverage/verification statuses.
- Do not add or edit subsystem models or the accepted element store.
- Do not add trails or trail steps to a sketch; edges are authored in `model`.
- Do not invent a container for a library or a non-deployable package.
- Keep ids stable and human-readable; edges and component containers must
  resolve.
- The sketch store is the host's `~/.principal/c4-sketches`; never edit those
  files directly.
- This skill does not authorize implementation, grants, deployments, or
  maintenance runs.

## Common errors

| Response | Meaning |
|---|---|
| `curl: (7) Failed to connect` | Studio's HTTP server is not running. Launch Studio. |
| `400 invalid ...` | A node/edge reference is missing or malformed. Fix ids first. |
| `404 Sketch not found` | Unknown sketch id. |
| `400 model.nodes must be an array` | The `model` object is incomplete. |
