#!/usr/bin/env bun
/**
 * Build script for Principal AI CLI
 * Uses esbuild to create a bundled CLI executable
 */

import * as esbuild from 'esbuild';
import { chmod } from 'fs/promises';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

// Build the CLI as a single bundled file
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/index.cjs',
  banner: {
    js: `#!/usr/bin/env node`,
  },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
  minify: false,
  sourcemap: true,
  alias: {
    // agent-monitoring@0.3.43 top-level-requires bun:sqlite for CursorSessionReader.
    // Map it to better-sqlite3 so the Node CLI can load.
    'bun:sqlite': './build/bun-sqlite-stub.cjs',
  },
  external: [
    'glob',
    'better-sqlite3',
    '@principal-ai/repository-abstraction',
  ],
});

// Make the CLI executable
await chmod('dist/index.cjs', 0o755);

console.log('✅ Principal AI CLI bundle built successfully');
