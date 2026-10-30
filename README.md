# Subsystem Modeling

**Verifiable system diagrams.**

This monorepo is the home of the **Subsystem Model** schema and the prebuilt
tooling around it:

| Package | npm name | Role |
|---|---|---|
| `packages/subsystems-core` | `@principal-ai/subsystems-core` | Schema, types, validation |
| `packages/subsystems-react` | `@principal-ai/subsystems-react` | Graph UI |
| `packages/subsystems-studio` | `@principal-ai/subsystems-studio` | Desktop host (Electrobun) |
| `packages/principal-studio-cli` | `@principal-ai/principal-studio-cli` | CLI (`principal-ai` bin) |
| `site` | — | Marketing / docs site |

Studio can also browse S3- and Cloudflare R2-backed models in its **Shared Subsystems** tab.
See [bucket configuration and agent HTTP API](packages/subsystems-studio/docs/SHARED-SUBSYSTEMS.md).

