/**
 * Browser-safety regression test.
 *
 * The package has two entry points:
 *   - `@principal-ai/subsystems-core` (src/index.ts) — must work in any
 *     environment, including browsers. It must not transitively import any
 *     Node.js-only built-in module.
 *   - `@principal-ai/subsystems-core/node` (src/node.ts) — Node-only.
 *
 * This test walks the import graph starting from src/index.ts and fails if
 * any reachable source file pulls in a forbidden Node built-in. `import type`
 * lines are erased at compile time and are ignored.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, statSync } from 'fs';
import { dirname, resolve } from 'path';

const ENTRY = resolve(import.meta.dir, 'index.ts');
const SRC_ROOT = resolve(import.meta.dir);

// Node built-ins that don't exist in the browser. `node:` prefix and
// submodules like `fs/promises` are matched separately.
const FORBIDDEN_BARE = new Set([
  'fs',
  'path',
  'os',
  'child_process',
  'crypto',
  'http',
  'https',
  'net',
  'tls',
  'stream',
  'zlib',
  'url',
  'worker_threads',
  'cluster',
  'dgram',
  'dns',
  'readline',
  'v8',
  'vm',
]);

function isForbidden(spec: string): boolean {
  if (spec.startsWith('node:')) return true;
  const root = spec.split('/')[0];
  return FORBIDDEN_BARE.has(root);
}

function resolveRelative(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  for (const c of candidates) {
    try {
      const s = statSync(c);
      if (s.isFile()) return c;
    } catch {
      // not a file; keep trying
    }
  }
  return null;
}

interface ImportRef {
  spec: string;
  typeOnly: boolean;
}

// Strip /* ... */ and // ... so commented-out imports don't trip the regex.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function extractImports(src: string): ImportRef[] {
  const cleaned = stripComments(src);
  const refs: ImportRef[] = [];

  // import ... from 'spec' / import 'spec'
  const importRe = /^\s*import\s+(type\s+)?(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(cleaned))) {
    refs.push({ spec: m[2], typeOnly: Boolean(m[1]) });
  }

  // export ... from 'spec' (re-exports — runtime-relevant unless "export type")
  const exportRe = /^\s*export\s+(type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm;
  while ((m = exportRe.exec(cleaned))) {
    refs.push({ spec: m[2], typeOnly: Boolean(m[1]) });
  }

  return refs;
}

interface LeakReport {
  chain: string[];
  forbiddenSpec: string;
}

function findLeaks(entry: string): LeakReport[] {
  const visited = new Set<string>();
  const leaks: LeakReport[] = [];

  function walk(file: string, chain: string[]): void {
    if (visited.has(file)) return;
    visited.add(file);

    const rel = file.startsWith(SRC_ROOT) ? file.slice(SRC_ROOT.length + 1) : file;
    const nextChain = [...chain, rel];

    let src: string;
    try {
      src = readFileSync(file, 'utf-8');
    } catch {
      return;
    }

    for (const ref of extractImports(src)) {
      if (ref.typeOnly) continue;

      // Forbidden Node built-in?
      if (isForbidden(ref.spec)) {
        leaks.push({ chain: nextChain, forbiddenSpec: ref.spec });
        continue;
      }

      // Relative import — recurse.
      if (ref.spec.startsWith('.')) {
        const resolved = resolveRelative(file, ref.spec);
        if (resolved) walk(resolved, nextChain);
        continue;
      }

      // External package — out of scope. We trust the package author to have
      // shipped a browser-safe entry; if they didn't, that's a separate bug.
    }
  }

  walk(entry, []);
  return leaks;
}

describe('browser-safe entry (src/index.ts)', () => {
  test('does not transitively import any Node.js built-in', () => {
    const leaks = findLeaks(ENTRY);

    if (leaks.length > 0) {
      const lines = leaks.map((l) => {
        const arrow = l.chain.join('\n      → ');
        return `  ✗ imports "${l.forbiddenSpec}" via:\n      → ${arrow}`;
      });
      const msg =
        `Found ${leaks.length} Node.js built-in import(s) reachable from src/index.ts.\n` +
        `These must move to src/node.ts (or be replaced with a FileSystemAdapter):\n\n` +
        lines.join('\n\n');
      throw new Error(msg);
    }

    expect(leaks).toHaveLength(0);
  });
});
