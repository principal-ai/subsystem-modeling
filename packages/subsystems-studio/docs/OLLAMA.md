# Ollama in Studio

Studio can run on local models through [Ollama](https://ollama.com) in two
places, both configured over the loopback HTTP API (port 3045 release / 3046
dev, see `studio-http-port.ts`):

1. **Judge** — the Jev-type second opinion on proposals, the auto-accept
   confidence gate, and construct complexity scoring. A setting picks the
   backend: `typesafe` (hosted Jev SystemOne, the default) or `ollama`.
   The Ollama judge is asked the same `noul` / `choice` / `score` questions
   and answers through a JSON-schema constrained `/api/chat` call, so the
   opinions it produces have the same shape, verdicts, and confidence
   semantics as Jev's (`judge.ts`).
2. **Maintain agents** — Studio writes an `ollama` provider into the user's
   OpenCode config (`~/.config/opencode/opencode.json`), makes the chosen
   model OpenCode's default, restarts the `opencode2` service so it re-reads
   the file, and stores `ollama/<model>` as the maintainer model
   (`opencode-config.ts`, `settings-http.ts`).

## Settings

| Setting                 | Default                  | Meaning                                          |
| ----------------------- | ------------------------ | ------------------------------------------------ |
| `secondOpinionProvider` | `"typesafe"`             | `"typesafe"` or `"ollama"`                       |
| `ollamaBaseUrl`         | `null` → `http://localhost:11434` | Ollama origin shared by judge and provider |
| `ollamaJudgeModel`      | `null`                   | Ollama model that answers judge questions        |
| `subsystemMaintainerModel` | `null`                | OpenCode `provider/id`; `ollama/<model>` once set |

## Settings UI

The same controls live in the Settings modal:

- **Second opinion** — a Jev | Ollama switch for the judge. Jev shows the
  TypeSafe key field; Ollama shows the server URL, whether it is reachable,
  and a judge-model picker over the pulled models (thinking models are
  flagged as slow). "Test the judge" asks one canned question and reports
  the verdict and latency. The auto-accept toggle and threshold unlock once
  the chosen judge is ready.
- **Maintainer** — OpenCode V2 install state (with an Install button) and the
  maintainer model as three options: use a free model, pick a catalog model,
  or Ollama (local). The Ollama row shows the server's availability and model
  count inline; Apply runs the same `configureOllama` path as `PUT /api/ollama`.
## HTTP

All routes are loopback-only and refuse foreign `Origin` headers.

```sh
# What Ollama has pulled, which models can call tools, current config
curl -s localhost:3045/api/ollama | jq
curl -s localhost:3045/api/ollama/models | jq

# Use one local model for both agents and the judge
curl -s -X PUT localhost:3045/api/ollama \
  -H 'Content-Type: application/json' \
  -d '{"agentModel":"qwen3.6:27b","judgeModel":"qwen3.6:27b"}' | jq

# Point at a remote Ollama host (agents + judge)
curl -s -X PUT localhost:3045/api/ollama \
  -d '{"baseUrl":"http://gpu-box:11434","agentModel":"qwen3.6:27b"}'

# Judge only, and keep agents where they are
curl -s -X PUT localhost:3045/api/ollama -d '{"judgeModel":"qwen2.5-coder:7b"}'

# Back to the hosted Jev judge
curl -s -X PATCH localhost:3045/api/settings -d '{"secondOpinionProvider":"typesafe"}'

# Any viewer setting (the TypeSafe key is write-only here)
curl -s localhost:3045/api/settings | jq
curl -s -X PATCH localhost:3045/api/settings -d '{"autoAcceptSubsystemModelProposals":true}'
```

`PUT /api/ollama` validates against the live Ollama catalog first: the agent
model must be pulled **and** report the `tools` capability (Maintain agents
cannot run without tool calling); the judge model must be pulled. Nothing is
written when validation fails. Passing `judgeModel` switches
`secondOpinionProvider` to `ollama` unless the body says otherwise.

Writing the provider restarts OpenCode, which kills in-flight sessions, so
the call returns `409` while a Maintain run is active. Pass
`"restartOpencode": false` to write the config now and restart later
(`opencode2 service restart`). The response's `applied.opencodeCatalogHasModel`
confirms OpenCode lists the model as enabled and tool-capable after the restart.

## Latency

Local judging is slow compared with Jev: a cold 27B model can take over two
minutes to answer its first question. The judge timeout defaults to 240 s
(`PRINCIPAL_OLLAMA_JUDGE_TIMEOUT_MS` overrides), and Maintain runs wait
180 s for an Ollama model's Step-0 liveness call instead of 60 s. Smaller
tool-capable models (`qwen2.5-coder:7b`, `llama3.2`) judge much faster;
the agent model can be chosen independently of the judge model.
