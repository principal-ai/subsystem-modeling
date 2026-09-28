/**
 * Per-purl commit capture for CLI-created models (the offline path — when
 * Studio's HTTP bridge is up, Studio's store captures instead).
 *
 * Mirrors Studio's behavior: one commit sha per referenced repo, keyed by
 * `purlRepoKey` (fragment stripped), never a dirty fingerprint. Repo → checkout
 * resolution goes through the Alexandria registry, the same one Studio uses.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
} from 'node:path';
import {
  ProjectRegistryStore,
  type FileSystemAdapter,
  type ValidatedRepositoryPath,
} from '@principal-ai/alexandria-core-library';

export type PurlCommit = string;

interface ComponentLike {
  alias?: string;
  purl?: string;
}

interface CommitOptions {
  resolveRoot?: (purlOrKey: string) => string | undefined;
  head?: (repoRoot: string) => string | null;
}

/** Normalize a purl to its repo key (fragment stripped). */
export function purlRepoKey(purl: string | undefined): string | undefined {
  if (!purl) return undefined;
  const base = purl.split('#')[0]?.trim();
  return base || undefined;
}

/** `owner/name` from a GitHub remote URL (SSH or HTTPS, dots in name kept). */
export function githubIdentityFromRemoteUrl(
  url: string,
): { owner: string; name: string } | null {
  const match = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  if (!match) return null;
  return { owner: match[1]!, name: match[2]! };
}

/** Minimal node:fs adapter for `ProjectRegistryStore` (mirrors Studio). */
class NodeFsAdapter implements FileSystemAdapter {
  exists(path: string): boolean {
    return existsSync(path);
  }
  readFile(path: string): string {
    return readFileSync(path, 'utf8');
  }
  writeFile(path: string, content: string): void {
    writeFileSync(path, content, 'utf8');
  }
  deleteFile(path: string): void {
    unlinkSync(path);
  }
  readBinaryFile(path: string): Uint8Array {
    return new Uint8Array(readFileSync(path));
  }
  writeBinaryFile(path: string, content: Uint8Array): void {
    writeFileSync(path, content);
  }
  createDir(path: string): void {
    mkdirSync(path, { recursive: true });
  }
  readDir(path: string): string[] {
    return readdirSync(path);
  }
  deleteDir(path: string): void {
    rmSync(path, { recursive: true, force: true });
  }
  isDirectory(path: string): boolean {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  }
  join(...paths: string[]): string {
    return join(...paths);
  }
  relative(from: string, to: string): string {
    return relative(from, to);
  }
  dirname(path: string): string {
    return dirname(path);
  }
  basename(path: string, ext?: string): string {
    return basename(path, ext);
  }
  extname(path: string): string {
    return extname(path);
  }
  isAbsolute(path: string): boolean {
    return isAbsolute(path);
  }
  normalizeRepositoryPath(inputPath: string): string {
    return inputPath;
  }
  findProjectRoot(inputPath: string): string {
    return inputPath;
  }
  getRepositoryName(repositoryPath: string): string {
    return basename(repositoryPath);
  }
}

let store: ProjectRegistryStore | null = null;
let storeHome: string | null = null;
function registry(): ProjectRegistryStore {
  const home = registryHome();
  if (!store || storeHome !== home) {
    store = new ProjectRegistryStore(new NodeFsAdapter(), home);
    storeHome = home;
  }
  return store;
}

function registryHome(): string {
  const override = process.env['PRINCIPAL_ALEXANDRIA_HOME']?.trim();
  return override ? override : homedir();
}

export function resolveRepoRootFromAlexandria(
  owner: string,
  name: string,
): string | null {
  const wantOwner = owner.toLowerCase();
  const wantName = name.toLowerCase();
  let entries: Array<{ path: string; remoteUrl?: string }>;
  try {
    entries = registry().listProjects();
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.remoteUrl) continue;
    const identity = githubIdentityFromRemoteUrl(entry.remoteUrl);
    if (
      identity?.owner.toLowerCase() === wantOwner &&
      identity?.name.toLowerCase() === wantName &&
      existsSync(entry.path)
    ) {
      return entry.path;
    }
  }
  return null;
}

/** Register a checkout (idempotent) — used by tests and repo-root hints. */
export function registerProjectInAlexandria(
  gitRoot: string,
  remoteUrl?: string,
): void {
  try {
    registry().registerProject(gitRoot as ValidatedRepositoryPath, remoteUrl);
  } catch {
    /* best-effort */
  }
}

/**
 * Resolve a purl repo key (`pkg:github/owner/name`) to a local checkout.
 * Non-repo / internal pseudo-purls (`external:file:…`, `external:proposed`, …)
 * are not checkouts and resolve to undefined rather than a fabricated owner/name.
 */
export function resolveRepoRootForPurlKey(key: string): string | undefined {
  if (!/^pkg:github\//i.test(key)) return undefined;
  const parts = key.split('/');
  const name = parts.pop();
  const owner = parts.pop();
  if (!owner || !name) return undefined;
  return resolveRepoRootFromAlexandria(owner, name) ?? undefined;
}

/** Current HEAD commit sha, or null when not a git repo / no commits. */
export function headSha(repoRoot: string): string | null {
  const result = spawnSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

/**
 * Capture the current commit of every resolvable purl referenced by the model.
 * Unresolved purls (no registered checkout) are omitted rather than fabricated.
 */
export function capturePurlCommits(
  components: ReadonlyArray<ComponentLike>,
  opts?: CommitOptions,
): Record<string, PurlCommit> {
  const resolveRoot = opts?.resolveRoot ?? resolveRepoRootForPurlKey;
  const head = opts?.head ?? headSha;
  const out: Record<string, PurlCommit> = {};
  const seen = new Set<string>();
  for (const c of components) {
    const key = purlRepoKey(c.purl);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const root = resolveRoot(key);
    if (!root) continue;
    const sha = head(root);
    if (sha) out[key] = sha;
  }
  return out;
}
