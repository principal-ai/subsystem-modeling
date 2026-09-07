/**
 * Trail command — fetch or publish trails to the Principal ADE backend.
 *
 * Resolves a GitHub token locally (gh CLI → git credential helper) and calls
 * the web-ade trail API with `Authorization: Bearer <token>`. The token is
 * never echoed to argv, env, stdout, or stderr. stdout is trail JSON (fetch)
 * or the share URL (publish) only.
 */

import { Command } from 'commander';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { isValidPurl, parsePurl } from '@principal-ai/alexandria-core-library';
import * as trailCache from '../lib/trail-cache.js';
import { handoffToRunning, type LoadTrailMessage } from '../lib/viewer-ipc.js';
import { handoffToBridge } from '../lib/bridge-ipc.js';
import { fetchGitHubMe, fetchGitHubUserByLogin } from '../lib/github-user.js';
import { openInBrowser } from '../lib/open-url.js';

const ONE_HOUR_MS = 60 * 60 * 1000;
// Anchor `require.resolve` to wherever the CLI is actually running from. Works
// in both the esbuild CJS bundle (argv[1] = dist/index.cjs) and dev (argv[1] =
// src/index.ts). Falling back to cwd is a last resort that matters mainly when
// some wrapper script has rewritten argv.
const cliRequire = createRequire(process.argv[1] ?? `${process.cwd()}/`);

// Shared with the `tour` command (see `./tour.ts`) — both target the same
// web-ade backend with the same local GitHub-token auth. `PRINCIPAL_ADE_BASE_URL`
// overrides the default for pointing at a local dev server.
export const BASE_URL =
  process.env.PRINCIPAL_ADE_BASE_URL?.replace(/\/+$/, '') ||
  'https://app.principal-ade.com';
const RESERVED_TRAIL_IDS = new Set(['publish', 'list']);

function parseTrailId(input: string): string {
  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/trail\/([^/]+)\/?$/);
    if (match) return match[1];
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length) return segments[segments.length - 1];
  } catch {
    // not a URL — fall through and treat input as a bare id
  }
  return input;
}

function resolveTokenViaGh(): string | null {
  const result = spawnSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status === 0 && result.stdout) {
    const token = result.stdout.trim();
    if (token) return token;
  }
  return null;
}

function resolveTokenViaGitCredential(): string | null {
  const result = spawnSync('git', ['credential', 'fill'], {
    encoding: 'utf8',
    input: 'protocol=https\nhost=github.com\n\n',
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  if (result.status !== 0 || !result.stdout) return null;
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('password=')) {
      const token = line.slice('password='.length).trim();
      if (token) return token;
    }
  }
  return null;
}

export function resolveToken(): string | null {
  return resolveTokenViaGh() ?? resolveTokenViaGitCredential();
}

export function exitWithTokenError(): never {
  process.stderr.write(
    'Could not resolve a GitHub token. Run `gh auth login`, or configure a git credential helper for github.com.\n',
  );
  process.exit(2);
}

async function readPayloadFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

interface ResolvedPayloadInput {
  payload: unknown;
  source: 'stdin' | 'file';
}

async function readPayload(file: string | undefined): Promise<ResolvedPayloadInput> {
  const useStdin = !file || file === '-';
  const raw = useStdin ? await readPayloadFromStdin() : readFileSync(file, 'utf8');
  if (!raw.trim()) {
    process.stderr.write('Empty payload\n');
    process.exit(2);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`Could not parse payload as JSON: ${(err as Error).message}\n`);
    process.exit(2);
  }
  return { payload: parsed, source: useStdin ? 'stdin' : 'file' };
}

interface OwnerRepo {
  owner: string;
  repo: string;
}

function ownerRepoFromPurl(purl: string): OwnerRepo | null {
  const parsed = parsePurl(purl);
  if (!parsed || !parsed.namespace) return null;
  if (parsed.type !== 'github' && parsed.type !== 'gitlab' && parsed.type !== 'bitbucket') {
    return null;
  }
  return { owner: parsed.namespace, repo: parsed.name };
}

function validateRepoPurls(payload: unknown): void {
  if (typeof payload !== 'object' || payload === null) return;
  const repos = (payload as { repos?: Array<{ id?: unknown }> }).repos;
  if (!Array.isArray(repos)) return;
  for (let i = 0; i < repos.length; i++) {
    const id = repos[i]?.id;
    if (typeof id !== 'string' || !isValidPurl(id)) {
      process.stderr.write(
        `repos[${i}].id is not a valid Purl${typeof id === 'string' ? `: ${id}` : ''}. ` +
          `Mint with \`PurlBuilders.github(owner, repo)\` or \`createLocalRepoPurl(absPath)\` ` +
          `from @principal-ai/alexandria-core-library.\n`,
      );
      process.exit(2);
    }
  }
}

function resolveOwnerRepo(
  payload: unknown,
  flagOwner: string | undefined,
  flagRepo: string | undefined,
  flagPurl: string | undefined,
): OwnerRepo {
  if (flagPurl) {
    const fromFlag = ownerRepoFromPurl(flagPurl);
    if (!fromFlag) {
      process.stderr.write(
        `--purl is not a valid github/gitlab/bitbucket Purl: ${flagPurl}\n`,
      );
      process.exit(2);
    }
    return { owner: flagOwner ?? fromFlag.owner, repo: flagRepo ?? fromFlag.repo };
  }

  const repoEntry =
    typeof payload === 'object' && payload !== null
      ? (payload as { repos?: Array<{ id?: string; remote?: { owner?: string; name?: string } }> })
          .repos?.[0]
      : undefined;

  const purlOwnerRepo =
    typeof repoEntry?.id === 'string' ? ownerRepoFromPurl(repoEntry.id) : null;

  const owner = flagOwner ?? repoEntry?.remote?.owner ?? purlOwnerRepo?.owner;
  const repo = flagRepo ?? repoEntry?.remote?.name ?? purlOwnerRepo?.repo;

  if (!owner || !repo) {
    process.stderr.write(
      'Could not determine owner/repo. Pass --owner and --repo (or --purl), or include `repos[0].remote`/`repos[0].id` in the payload.\n',
    );
    process.exit(2);
  }
  return { owner, repo };
}

export async function describeHttpError(response: Response): Promise<string> {
  let serverMessage = '';
  let code = '';
  try {
    const body = (await response.clone().json()) as {
      error?: string;
      code?: string;
    };
    serverMessage = body.error ?? '';
    code = body.code ?? '';
  } catch {
    // body wasn't JSON — keep going with status-only message
  }
  const fallback =
    response.status === 404
      ? 'Trail not found'
      : response.status === 403
        ? 'No read access to this repository (token may lack repo scope)'
        : response.status === 401
          ? 'GitHub token rejected'
          : `HTTP ${response.status}`;
  const human = serverMessage || fallback;
  return `${human}${code ? ` [${code}]` : ''}`;
}

/** Fetch + cache a trail by id. Exits the process on any error. */
async function fetchAndCacheTrail(
  id: string,
): Promise<{ body: string; cachePath: string }> {
  const token = resolveToken();
  if (!token) exitWithTokenError();

  const url = `${BASE_URL}/api/trails/by-id/${encodeURIComponent(id)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    process.stderr.write(`Network error fetching trail: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const body = await response.text();

  let cachePath: string;
  try {
    const parsed = JSON.parse(body) as unknown;
    cachePath = trailCache.write(id, body, parsed).path;
  } catch {
    // Body wasn't JSON or the cache write failed. Continue without a cache hit
    // for this call — the caller's contract is "you get the body."
    cachePath = '';
  }

  return { body, cachePath };
}

async function fetchTrail(input: string): Promise<void> {
  const id = parseTrailId(input);
  if (!id) {
    process.stderr.write('Invalid trail id\n');
    process.exit(2);
  }
  const { body } = await fetchAndCacheTrail(id);
  process.stdout.write(body);
  if (!body.endsWith('\n')) process.stdout.write('\n');
}

interface PublishOptions {
  owner?: string;
  repo?: string;
  purl?: string;
}

async function publishTrail(file: string | undefined, options: PublishOptions): Promise<void> {
  const { payload } = await readPayload(file);

  const payloadId =
    typeof payload === 'object' && payload !== null
      ? (payload as { id?: unknown }).id
      : undefined;
  if (typeof payloadId === 'string' && RESERVED_TRAIL_IDS.has(payloadId)) {
    process.stderr.write(
      `Trail id '${payloadId}' is reserved (collides with \`principal-ai trail ${payloadId}\`).\n`,
    );
    process.exit(2);
  }

  validateRepoPurls(payload);

  const { owner, repo } = resolveOwnerRepo(payload, options.owner, options.repo, options.purl);

  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/trails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ owner, repo, payload }),
    });
  } catch (err) {
    process.stderr.write(`Network error publishing trail: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const body = (await response.json()) as { id?: string; url?: string };
  if (!body.url) {
    process.stderr.write('Server response missing share URL\n');
    process.exit(1);
  }
  const shareUrl = body.url.startsWith('http') ? body.url : `${BASE_URL}${body.url}`;
  process.stdout.write(`${shareUrl}\n`);
}

interface ViewOptions {
  refresh?: boolean;
  remote?: boolean;
  local?: string | boolean;
  file?: string;
  repoRoot?: string;
  viewer?: boolean;
  viewerDir?: string;
}

interface ResolvedRepo {
  owner: string;
  name: string;
  purl: string;
  authoredAtSha?: string;
}

export function gitRemoteUrl(cwd: string): string | null {
  const result = spawnSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

export function ownerRepoFromGitRemote(remoteUrl: string): { owner: string; name: string } | null {
  const match = remoteUrl.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!match) return null;
  return { owner: match[1]!, name: match[2]! };
}

function resolveTrailRepo(parsed: unknown): ResolvedRepo | null {
  if (typeof parsed !== 'object' || parsed === null) return null;

  // web-ade wraps the payload as { entry, owner, repo, payload }. Local files
  // are just the bare TrailPayload. Look in both shapes.
  const wrapper = parsed as {
    owner?: string;
    repo?: string;
    payload?: unknown;
  };
  const inner = (wrapper.payload ?? parsed) as {
    repos?: Array<{
      id?: string;
      remote?: { owner?: string; name?: string };
      authoredAtSha?: string;
    }>;
  };

  // Prefer the explicit per-repo entry (carries Purl + authoredAtSha).
  const entry = inner.repos?.[0];
  if (entry?.remote?.owner && entry.remote.name && entry.id) {
    return {
      owner: entry.remote.owner,
      name: entry.remote.name,
      purl: entry.id,
      authoredAtSha: entry.authoredAtSha,
    };
  }

  // Fallback: web-ade wrapper top-level owner/repo. Synthesize a Purl since the
  // wrapper doesn't carry one. authoredAtSha is unavailable in this shape — the
  // viewer will fall back to inner.authoredAt.sha when fetching slices.
  if (wrapper.owner && wrapper.repo) {
    return {
      owner: wrapper.owner,
      name: wrapper.repo,
      purl: `pkg:github/${wrapper.owner}/${wrapper.repo}`,
    };
  }

  return null;
}

function cwdIsCloneOf(repo: ResolvedRepo): boolean {
  const url = gitRemoteUrl(process.cwd());
  if (!url) return false;
  const parsed = ownerRepoFromGitRemote(url);
  if (!parsed) return false;
  return (
    parsed.owner.toLowerCase() === repo.owner.toLowerCase() &&
    parsed.name.toLowerCase() === repo.name.toLowerCase()
  );
}

export type ViewerLaunch =
  | { kind: 'installed'; bin: string }
  | { kind: 'source'; dir: string };

// Shared with the `tour` command — both launch the same standalone viewer
// bundle; only the payload (trail vs *.tour.json) differs.
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

interface ResolvedTrail {
  trailFile: string;
  payload: unknown;
  label: string;
}

async function resolveTrailFromFile(filePath: string): Promise<ResolvedTrail> {
  const absolute = filePath.startsWith('/') ? filePath : `${process.cwd()}/${filePath}`;
  if (!existsSync(absolute)) {
    process.stderr.write(`Trail file not found: ${absolute}\n`);
    process.exit(2);
  }
  let body: string;
  try {
    body = readFileSync(absolute, 'utf8');
  } catch (err) {
    process.stderr.write(`Failed to read ${absolute}: ${(err as Error).message}\n`);
    process.exit(1);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (err) {
    process.stderr.write(`Trail file is not valid JSON: ${(err as Error).message}\n`);
    process.exit(1);
  }
  return { trailFile: absolute, payload, label: absolute };
}

async function resolveTrailFromId(input: string, refresh: boolean): Promise<ResolvedTrail> {
  const id = parseTrailId(input);
  if (!id) {
    process.stderr.write('Invalid trail id\n');
    process.exit(2);
  }

  let body: string;
  let cachePath: string;
  const cached = refresh ? null : trailCache.read(id, ONE_HOUR_MS);
  if (cached) {
    body = cached.body;
    cachePath = cached.path;
  } else {
    const fetched = await fetchAndCacheTrail(id);
    body = fetched.body;
    cachePath = fetched.cachePath;
    if (!cachePath) {
      process.stderr.write('Trail JSON could not be cached; aborting.\n');
      process.exit(1);
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (err) {
    process.stderr.write(`Trail body is not valid JSON: ${(err as Error).message}\n`);
    process.exit(1);
  }
  return { trailFile: cachePath, payload, label: id };
}

async function viewTrail(input: string | undefined, options: ViewOptions): Promise<void> {
  if (!input && !options.file) {
    process.stderr.write('Pass an id/url or --file <path>.\n');
    process.exit(2);
  }
  if (input && options.file) {
    process.stderr.write('Pass either an id/url OR --file, not both.\n');
    process.exit(2);
  }

  // Prefer a running desktop app for a bare `trail view <id>`: its bridge reads
  // the same on-disk trail store, so a *local* id opens in the app without a
  // remote fetch or GitHub token (the path resolveTrailFromId would otherwise
  // take). Skipped when the caller pinned the standalone principal-studio — either
  // explicitly (--viewer / --viewer-dir) or implicitly via a mode/working-tree
  // flag (--remote, --local/--repo-root) or --file. A miss — app down, or trail
  // not in its store — falls through to the existing fetch + socket/spawn path.
  const pinsViewer =
    options.viewer === true ||
    options.viewerDir !== undefined ||
    options.remote === true ||
    options.repoRoot !== undefined ||
    options.local !== undefined;
  if (input && !options.file && !pinsViewer) {
    const id = parseTrailId(input);
    if (id && (await handoffToBridge(id))) {
      process.stderr.write(`Trail opened in running desktop app: ${id}\n`);
      process.exit(0);
    }
  }

  const resolved = options.file
    ? await resolveTrailFromFile(options.file)
    : await resolveTrailFromId(input as string, options.refresh ?? false);

  // Decide mode. For --file: default to local (the user has the file, presumably
  // also the working tree). For id-based: auto-detect via cwd's git remote.
  const repo = resolveTrailRepo(resolved.payload);
  let mode: 'local' | 'remote';
  let repoRoot: string | undefined;

  if (options.remote) {
    mode = 'remote';
  } else if (options.local !== undefined || options.repoRoot !== undefined) {
    mode = 'local';
    repoRoot =
      options.repoRoot ??
      (typeof options.local === 'string' ? options.local : process.cwd());
  } else if (options.file) {
    // --file default: local mode anchored at cwd. The user will see a "no
    // sourcePath matched" failure on click if cwd isn't actually the repo —
    // that's the right signal for them to pass --repo-root.
    mode = 'local';
    repoRoot = process.cwd();
  } else if (repo && cwdIsCloneOf(repo)) {
    mode = 'local';
    repoRoot = process.cwd();
  } else {
    mode = 'remote';
  }

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    TRAIL_FILE: resolved.trailFile,
    TRAIL_MODE: mode,
  };
  if (mode === 'local' && repoRoot) env['TRAIL_REPO_ROOT'] = repoRoot;
  if (mode === 'remote') {
    const token = resolveToken();
    if (token) env['TRAIL_GH_TOKEN'] = token;
    if (repo) {
      env['TRAIL_REPO_OWNER'] = repo.owner;
      env['TRAIL_REPO_NAME'] = repo.name;
      env['TRAIL_REPO_PURL'] = repo.purl;
    }
  }

  // Build the IPC message from the env we'd otherwise spawn with. If a viewer
  // is already running, hand off and exit — no need to spawn a second process.
  const ipcMessage: LoadTrailMessage = {
    kind: 'LOAD_TRAIL',
    trailFile: resolved.trailFile,
    mode,
  };
  if (mode === 'local' && repoRoot) ipcMessage.repoRoot = repoRoot;
  if (mode === 'remote') {
    if (env['TRAIL_GH_TOKEN']) ipcMessage.ghToken = env['TRAIL_GH_TOKEN'];
    if (env['TRAIL_REPO_OWNER']) ipcMessage.repoOwner = env['TRAIL_REPO_OWNER'];
    if (env['TRAIL_REPO_NAME']) ipcMessage.repoName = env['TRAIL_REPO_NAME'];
    if (env['TRAIL_REPO_PURL']) ipcMessage.repoPurl = env['TRAIL_REPO_PURL'];
  }
  if (await handoffToRunning(ipcMessage)) {
    process.stderr.write(`Trail handed off to running viewer (${mode} mode): ${resolved.label}\n`);
    process.exit(0);
  }

  const launch = resolveViewerLaunch(options.viewerDir);
  process.stderr.write(`Launching principal studio (${mode} mode) for ${resolved.label}\n`);

  const child =
    launch.kind === 'installed'
      ? spawn(launch.bin, [], { env, stdio: 'inherit' })
      : spawn('bun', ['start'], { cwd: launch.dir, env, stdio: 'inherit' });
  child.on('error', (err) => {
    process.stderr.write(`Failed to launch viewer: ${err.message}\n`);
    process.exit(1);
  });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

interface ListOptions {
  user?: string;
  id?: string;
}

async function listTrails(options: ListOptions): Promise<void> {
  let githubId: number;

  if (options.id) {
    const parsed = Number(options.id);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      process.stderr.write(`--id must be a positive number, got: ${options.id}\n`);
      process.exit(2);
    }
    githubId = parsed;
  } else {
    // `--user` resolves login → numeric id via GitHub; the bare form
    // resolves the authenticated user via /user. Both paths need a token.
    const token = resolveToken();
    if (!token) exitWithTokenError();
    const user = options.user
      ? await fetchGitHubUserByLogin(options.user, token)
      : await fetchGitHubMe(token);
    githubId = user.id;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/trails/by-user/${githubId}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    process.stderr.write(`Network error listing trails: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const body = await response.text();
  process.stdout.write(body);
  if (!body.endsWith('\n')) process.stdout.write('\n');
}

export function createTrailCommand(): Command {
  const command = new Command('trail');

  command
    .description('Fetch or publish trails from the Principal ADE backend')
    .argument(
      '[id-or-url]',
      'Trail id, or full https://app.principal-ade.com/trail/<id> URL (omit when using a sub-action)',
    )
    .action(async (input: string | undefined) => {
      if (!input) {
        command.help();
        return;
      }
      await fetchTrail(input);
    });

  command
    .command('view')
    .description('Open a trail in the standalone viewer (auto-picks local or remote mode)')
    .argument(
      '[id-or-url]',
      'Trail id, or full https://app.principal-ade.com/trail/<id> URL (omit when using --file)',
    )
    .option('--file <path>', 'Open a local TrailPayload JSON file directly (skips fetch + cache)')
    .option('--repo-root <path>', 'Working tree to resolve slices against; implies local mode')
    .option('--refresh', 'Bypass the trail JSON cache and re-fetch')
    .option('--remote', 'Force remote mode (fetch slices from GitHub even if a clone is present)')
    .option(
      '--local [path]',
      'Force local mode; optional path overrides the repo root (default: cwd)',
    )
    .option(
      '--viewer',
      'Open in the standalone principal-studio instead of routing to a running desktop app',
    )
    .option(
      '--viewer-dir <path>',
      'Path to the @principal-ai/subsystems-studio package (overrides PRINCIPAL_STUDIO_DIR)',
    )
    .action(async (input: string | undefined, options: ViewOptions) => {
      await viewTrail(input, options);
    });

  command
    .command('publish')
    .description('Publish a slice/flow trail payload to web-ade')
    .argument(
      '[file]',
      'Payload JSON file path; pass `-` or omit to read from stdin',
    )
    .option('--owner <owner>', 'GitHub owner (overrides payload `repos[0].remote.owner`)')
    .option('--repo <repo>', 'GitHub repo (overrides payload `repos[0].remote.name`)')
    .option(
      '--purl <purl>',
      'Anchor share by Purl (e.g. pkg:github/owner/repo); overrides payload-derived owner/repo',
    )
    .action(async (file: string | undefined, options: PublishOptions) => {
      await publishTrail(file, options);
    });

  command
    .command('list')
    .description('List trails published by a user (defaults to the authenticated user)')
    .option('--user <login>', 'GitHub login to list trails for (resolves to numeric id)')
    .option('--id <githubId>', 'GitHub numeric user id (skips the lookup)')
    .action(async (options: ListOptions) => {
      await listTrails(options);
    });

  // `open-web` (not `open`) keeps the existing `trail view` standalone-viewer
  // surface unambiguous — this one launches the web app in a browser tab.
  command
    .command('open-web')
    .description('Open the trail page in the default browser (web app, not the standalone viewer)')
    .argument('<id-or-url>', 'Trail id, or full https://app.principal-ade.com/trail/<id> URL')
    .action((input: string) => {
      const id = parseTrailId(input);
      const url = `${BASE_URL}/trail/${id}`;
      process.stdout.write(`${url}\n`);
      openInBrowser(url);
    });

  return command;
}
