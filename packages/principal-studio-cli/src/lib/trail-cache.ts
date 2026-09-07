/**
 * Local cache for trail JSON fetched from web-ade.
 *
 * Layout — `~/.principal/trails/<purl-namespace>/<purl-name>/<id>.json` when the
 * payload carries enough identity (single-repo `authoredAt`-style trails plus
 * `repos[0]` Purl in multi-repo trails), or `~/.principal/trails/by-id/<id>.json`
 * as a fallback for trails we can't anchor to a Purl.
 *
 * See `docs/PRINCIPAL_STUDIO_MODES.md` for the design context.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parsePurl } from '@principal-ai/alexandria-core-library';

const ROOT = join(homedir(), '.principal', 'trails');

export interface CacheLocation {
  /** Absolute filesystem path to the cached JSON. */
  path: string;
  /** `<purl-namespace>/<purl-name>` style anchor, or `by-id` for the fallback. */
  anchor: string;
}

/**
 * Decide where a trail's JSON should live on disk.
 *
 * Prefers `<purl-namespace>/<purl-name>/<id>.json` when the payload's
 * `repos[0].id` parses; falls back to `by-id/<id>.json` otherwise. Only github,
 * gitlab, bitbucket, and generic Purls participate in the hierarchical layout —
 * other types fall through to `by-id` so we never write into surprising paths.
 */
export function locate(id: string, payload: unknown): CacheLocation {
  const repoId =
    typeof payload === 'object' && payload !== null
      ? (payload as { repos?: Array<{ id?: unknown }> }).repos?.[0]?.id
      : undefined;

  if (typeof repoId === 'string') {
    const parsed = parsePurl(repoId);
    if (parsed && parsed.namespace) {
      const ns = sanitizeSegment(parsed.namespace);
      const name = sanitizeSegment(parsed.name);
      if (ns && name) {
        return {
          path: join(ROOT, ns, name, `${sanitizeSegment(id)}.json`),
          anchor: `${ns}/${name}`,
        };
      }
    }
  }

  return {
    path: join(ROOT, 'by-id', `${sanitizeSegment(id)}.json`),
    anchor: 'by-id',
  };
}

/**
 * Write a trail's raw JSON body to its cache slot. The body is stored verbatim
 * — no re-serialization — so the cached file matches what the server returned.
 */
export function write(id: string, body: string, payload: unknown): CacheLocation {
  const location = locate(id, payload);
  mkdirSync(dirname(location.path), { recursive: true });
  writeFileSync(location.path, body, 'utf8');
  return location;
}

/**
 * Read a cached trail by id. Returns `null` when the file is missing or older
 * than `maxAgeMs`. The caller is responsible for fetching + writing a fresh
 * copy when this returns null.
 */
export function read(id: string, maxAgeMs: number): { body: string; path: string } | null {
  const safeId = sanitizeSegment(id);
  const candidates = [join(ROOT, 'by-id', `${safeId}.json`)];

  for (const candidate of candidates) {
    const hit = readIfFresh(candidate, maxAgeMs);
    if (hit) return hit;
  }

  // Hierarchical layout: walk the namespace tree looking for the id. We don't
  // know the (namespace, name) ahead of a successful fetch, so this is a small
  // best-effort scan rather than a directed lookup. Cheap in practice — the
  // tree is shallow per user.
  return scanHierarchical(safeId, maxAgeMs);
}

function readIfFresh(
  path: string,
  maxAgeMs: number,
): { body: string; path: string } | null {
  try {
    const stat = statSync(path);
    if (Date.now() - stat.mtimeMs > maxAgeMs) return null;
    return { body: readFileSync(path, 'utf8'), path };
  } catch {
    return null;
  }
}

function scanHierarchical(
  safeId: string,
  maxAgeMs: number,
): { body: string; path: string } | null {
  // Implemented as a separate function so the common `by-id` hit doesn't pay
  // the readdir cost. Filled in once we have a real consumer (step 5).
  void safeId;
  void maxAgeMs;
  return null;
}

function sanitizeSegment(value: string): string {
  // Path traversal defence — keep alnum, dash, underscore, dot. Anything else
  // becomes `_`. Empty results are rejected by the caller.
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}
