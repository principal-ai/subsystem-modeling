# Repository Structure and Publishing

## Overview

Monorepo for subsystem modeling. **Does not use npm/yarn workspaces** — each
package publishes independently to npm under `@principal-ai/*`.

## Packages

- `packages/subsystems-core` → `@principal-ai/subsystems-core`
- `packages/subsystems-react` → `@principal-ai/subsystems-react`
- `packages/subsystems-studio` → `@principal-ai/subsystems-studio`
- `packages/principal-studio-cli` → `@principal-ai/principal-studio-cli`
- `site` — marketing site (not published as a library)

## Inter-package dependencies

Internal deps must reference **published npm versions**, not `workspace:` or
`file:` paths (except temporary local linking while migrating).

When changing a package other packages depend on:

1. Build the changed package
2. Publish to npm
3. Bump the version in dependents' `package.json`
4. Install in dependents

## Build order

1. `packages/subsystems-core`
2. `packages/subsystems-react`
3. `packages/principal-studio-cli` / `packages/subsystems-studio`
