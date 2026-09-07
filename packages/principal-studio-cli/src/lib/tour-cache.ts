/**
 * Local cache for tour JSON fetched from web-ade.
 *
 * Sibling of `./trail-cache.ts`, but simpler: tours don't carry a `repos[]`
 * Purl, and the only id we have on a read is the bare tour id, so the cache is
 * a flat `~/.principal/tours/by-id/<id>.json` layout — writes and reads use the
 * same slot, so a recent fetch is actually reused by the next `view`.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = join(homedir(), '.principal', 'tours');

export interface CacheLocation {
  /** Absolute filesystem path to the cached JSON. */
  path: string;
}

function slotFor(id: string): string {
  return join(ROOT, 'by-id', `${sanitizeSegment(id)}.json`);
}

/**
 * Write a tour's raw JSON body to its cache slot. Stored verbatim — no
 * re-serialization — so the cached file matches what the server returned.
 */
export function write(id: string, body: string): CacheLocation {
  const path = slotFor(id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf8');
  return { path };
}

/**
 * Read a cached tour by id. Returns `null` when the file is missing or older
 * than `maxAgeMs`. The caller fetches + writes a fresh copy on a miss.
 */
export function read(
  id: string,
  maxAgeMs: number,
): { body: string; path: string } | null {
  const path = slotFor(id);
  try {
    const stat = statSync(path);
    if (Date.now() - stat.mtimeMs > maxAgeMs) return null;
    return { body: readFileSync(path, 'utf8'), path };
  } catch {
    return null;
  }
}

function sanitizeSegment(value: string): string {
  // Path traversal defence — keep alnum, dash, underscore, dot. Anything else
  // becomes `_`. Empty results are rejected by the caller.
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}
