/**
 * Standalone-viewer launch resolution — shared by `open-studio`,
 * `agent-sessions`, `tour view`, and `subsystem-model create`. Locates the
 * `@principal-ai/subsystems-studio` install (or a source checkout) to spawn.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

// Anchor `require.resolve` to wherever the CLI is actually running from. Works
// in both the esbuild CJS bundle (argv[1] = dist/index.cjs) and dev (argv[1] =
// src/index.ts). Falling back to cwd is a last resort that matters mainly when
// some wrapper script has rewritten argv.
const cliRequire = createRequire(process.argv[1] ?? `${process.cwd()}/`);

export type ViewerLaunch =
  | { kind: 'installed'; bin: string }
  | { kind: 'source'; dir: string };

export function resolveViewerLaunch(flag: string | undefined): ViewerLaunch {
  const result = tryResolveViewerLaunch(flag);
  if (!result.ok) {
    process.stderr.write(result.error + '\n');
    process.exit(2);
  }
  return result.launch;
}

/** Soft resolve for callers that can fall back (e.g. subsystem-model create). */
export function tryResolveViewerLaunch(
  flag: string | undefined,
): { ok: true; launch: ViewerLaunch } | { ok: false; error: string } {
  // 1) Explicit override (flag or env) wins. If it points at a source tree we
  //    use `bun start`; if it points at a published install root we use its
  //    bin shim. Distinguished by whether `bin/subsystems-studio.cjs` exists.
  const candidate = flag ?? process.env['PRINCIPAL_STUDIO_DIR'];
  if (candidate) {
    const overrideBin = `${candidate}/bin/subsystems-studio.cjs`;
    if (existsSync(overrideBin)) return { ok: true, launch: { kind: 'installed', bin: overrideBin } };
    if (existsSync(`${candidate}/package.json`)) return { ok: true, launch: { kind: 'source', dir: candidate } };
    return {
      ok: false,
      error: `No principal-studio at ${candidate}; expected a package dir or installed root.`,
    };
  }

  // 2) Try the installed @principal-ai/subsystems-studio optionalDependency.
  try {
    const bin = cliRequire.resolve('@principal-ai/subsystems-studio/bin/subsystems-studio.cjs');
    return { ok: true, launch: { kind: 'installed', bin } };
  } catch {
    // not installed (different platform, install skipped, etc.)
  }

  return {
    ok: false,
    error:
      '@principal-ai/subsystems-studio is not installed for this platform. Currently only macOS arm64 prebuilds are shipped — pass --viewer-dir <path> to a source checkout if you have one.',
  };
}
