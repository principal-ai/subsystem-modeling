# @principal-ai/subsystems-core

Subsystem model types/schema and agent-session tooling for Principal AI.

## Entry points

| Import | Use |
|---|---|
| `@principal-ai/subsystems-core` | Browser-safe subsystem model types + `isSubsystemModelDocument` |
| `@principal-ai/subsystems-core/node` | OpenCode store, agent-session list/fetch/normalize, topic store, fixtures |
| `@principal-ai/subsystems-core/pipeline` | Bun-safe session normalize/accumulate (no `better-sqlite3`) |

## Schema

Portable document schema: `schemas/subsystem-model.schema.json`

## Installation

```bash
npm install @principal-ai/subsystems-core
# or
bun add @principal-ai/subsystems-core
```

Peer: `@principal-ai/agent-monitoring` (session pipeline / fixtures).

## License

Apache-2.0
