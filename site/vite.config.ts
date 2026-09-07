import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const siteRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(siteRoot, '..')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Served as a project site at https://principal-ai.github.io/subsystem-modeling/,
  // so all asset URLs must be prefixed with the repo subpath.
  base: '/subsystem-modeling/',
  resolve: {
    alias: {
      '@schemas': path.resolve(repoRoot, 'packages/subsystems-core/schemas'),
    },
  },
  server: {
    fs: {
      // Allow importing the live schema from packages/subsystems-core during dev.
      allow: [repoRoot],
    },
  },
  optimizeDeps: {
    include: [
      '@stoplight/json-schema-viewer',
      '@stoplight/mosaic',
      '@stoplight/mosaic-code-viewer',
      '@stoplight/markdown-viewer',
    ],
  },
})
