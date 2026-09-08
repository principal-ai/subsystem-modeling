# Site

React + TypeScript + Vite app deployed to GitHub Pages at
`https://principal-ai.github.io/subsystem-modeling/`.

It lives in `site/` (top level, not `packages/`) because it is not a
publishable npm package — it is never built or released by the root
`bun run build` flow.

## Develop

```bash
cd site
bun install
bun dev
```

Open `http://localhost:5173/subsystem-modeling/` (Vite `base` matches the
GitHub Pages project subpath).

## Build

```bash
bun run build
```

This typechecks, bundles to `dist/`, and copies `dist/index.html` to
`dist/404.html` so client-side routes survive refreshes and deep links
on GitHub Pages.

## Gallery (Storybook)

The gallery is a Storybook that lives in this same package
(`.storybook/`, `stories/`) and renders Subsystem Models with the
**published** `@principal-ai/subsystems-react` package — never
workspace source — so it shows what npm consumers actually get.

```bash
bun run showcase        # dev server on :6007
bun run build:showcase  # static build to storybook-static/
```

Deploys to `/gallery/` next to the landing page: the workflow runs
`build:showcase` with `STORYBOOK_BASE_PATH=/subsystem-modeling/gallery/`
and copies the output into `dist/gallery/`. Storybook routes via query
params (`?path=/story/...`), so deep links work on Pages without the
404 fallback.

## Deploy

Deploys happen automatically via `.github/workflows/pages.yml` on pushes
to `main` that touch `site/`. One-time setup: in the repo on GitHub, go to
**Settings → Pages** and set **Source** to **GitHub Actions**.

## GitHub Pages specifics

- `vite.config.ts` sets `base: '/subsystem-modeling/'` because a
  project site is served from a repo subpath, not the domain root.
- The router uses `basename={import.meta.env.BASE_URL}` so it stays in
  sync with that base automatically.
- If the repo is ever renamed, update `base` in `vite.config.ts`.
