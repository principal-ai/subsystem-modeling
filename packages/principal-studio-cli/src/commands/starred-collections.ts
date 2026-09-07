/**
 * Starred-collections command — manage starred-repo collections on web-ade.
 *
 * Collections are per-user curated groups of repos (with cached descriptions,
 * star counts, and avatars). Each collection is owned by a user or an org.
 *
 * Resolves a GitHub token locally (gh CLI → git credential helper) and calls
 * the web-ade starred-collections API with `Authorization: Bearer <token>`.
 */

import { Command } from 'commander';
import { spawnSync } from 'node:child_process';

const BASE_URL =
  process.env.PRINCIPAL_ADE_BASE_URL?.replace(/\/+$/, '') ||
  'https://app.principal-ade.com';

// ============================================================================
// Auth
// ============================================================================

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

function resolveToken(): string | null {
  return resolveTokenViaGh() ?? resolveTokenViaGitCredential();
}

function exitWithTokenError(): never {
  process.stderr.write(
    'Could not resolve a GitHub token. Run `gh auth login`, or configure a git credential helper for github.com.\n',
  );
  process.exit(2);
}

// ============================================================================
// HTTP helpers
// ============================================================================

async function describeHttpError(response: Response): Promise<string> {
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
    // body wasn't JSON — fall through to status-only message
  }
  const fallback =
    response.status === 404
      ? 'Collection not found'
      : response.status === 403
        ? 'Not authorized'
        : response.status === 401
          ? 'GitHub token rejected'
          : response.status === 409
            ? 'Conflict (duplicate name or repo)'
            : `HTTP ${response.status}`;
  const human = serverMessage || fallback;
  return `${human}${code ? ` [${code}]` : ''}`;
}

// ============================================================================
// Types
// ============================================================================

interface Collection {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  ownerType: 'user' | 'org';
  ownerLogin?: string;
  repos: CollectionRepo[];
  users: CollectionUser[];
  createdAt: string;
  updatedAt: string;
}

interface CollectionRepo {
  owner: string;
  repo: string;
  addedAt: string;
  description?: string;
  stargazersCount?: number;
  avatarUrl?: string;
  notes?: string;
}

interface CollectionUser {
  login: string;
  addedAt: string;
  avatarUrl?: string;
  name?: string;
}

// ============================================================================
// Subcommands
// ============================================================================

async function listCollections(): Promise<void> {
  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/starred-collections?include_items=false`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    process.stderr.write(`Network error listing collections: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const body = (await response.json()) as {
    collections: Collection[];
    version: number;
  };
  process.stdout.write(JSON.stringify(body.collections, null, 2));
  process.stdout.write('\n');
}

interface CreateOptions {
  description?: string;
  icon?: string;
  orgLogin?: string;
}

async function createCollection(name: string, options: CreateOptions): Promise<void> {
  const token = resolveToken();
  if (!token) exitWithTokenError();

  const payload: Record<string, string> = { name };
  if (options.description) payload.description = options.description;
  if (options.icon) payload.icon = options.icon;
  if (options.orgLogin) payload.orgLogin = options.orgLogin;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/starred-collections`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    process.stderr.write(`Network error creating collection: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const collection = (await response.json()) as Collection;
  process.stdout.write(JSON.stringify(collection, null, 2));
  process.stdout.write('\n');
}

async function listRepos(collectionId: string): Promise<void> {
  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/starred-collections/${encodeURIComponent(collectionId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    process.stderr.write(`Network error fetching collection: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const collection = (await response.json()) as Collection;
  process.stdout.write(JSON.stringify(collection.repos, null, 2));
  process.stdout.write('\n');
}

async function addRepo(collectionId: string, ownerRepo: string): Promise<void> {
  const slashIndex = ownerRepo.indexOf('/');
  if (slashIndex === -1 || slashIndex === 0 || slashIndex === ownerRepo.length - 1) {
    process.stderr.write(`Invalid repo format: "${ownerRepo}". Use <owner>/<repo> (e.g. "principal-ai/web-ade").\n`);
    process.exit(2);
  }
  const owner = ownerRepo.slice(0, slashIndex);
  const repo = ownerRepo.slice(slashIndex + 1);

  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/api/starred-collections/${encodeURIComponent(collectionId)}/repos`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ owner, repo }),
      },
    );
  } catch (err) {
    process.stderr.write(`Network error adding repo: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const repoEntry = (await response.json()) as CollectionRepo;
  process.stdout.write(JSON.stringify(repoEntry, null, 2));
  process.stdout.write('\n');
}

async function removeRepo(collectionId: string, ownerRepo: string): Promise<void> {
  const slashIndex = ownerRepo.indexOf('/');
  if (slashIndex === -1 || slashIndex === 0 || slashIndex === ownerRepo.length - 1) {
    process.stderr.write(`Invalid repo format: "${ownerRepo}". Use <owner>/<repo> (e.g. "principal-ai/web-ade").\n`);
    process.exit(2);
  }
  const owner = ownerRepo.slice(0, slashIndex);
  const repo = ownerRepo.slice(slashIndex + 1);

  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/api/starred-collections/${encodeURIComponent(collectionId)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    );
  } catch (err) {
    process.stderr.write(`Network error removing repo: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok && response.status !== 204) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  process.stdout.write(`Removed ${owner}/${repo} from collection ${collectionId}\n`);
}

async function deleteCollection(collectionId: string): Promise<void> {
  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/starred-collections/${encodeURIComponent(collectionId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    process.stderr.write(`Network error deleting collection: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok && response.status !== 204) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  process.stdout.write(`Deleted collection ${collectionId}\n`);
}

// ============================================================================
// Command wiring
// ============================================================================

export function createStarredCollectionsCommand(): Command {
  const command = new Command('starred-collections');

  command.description('Manage starred-repo collections on web-ade');

  command
    .command('list')
    .description('List all collections for the authenticated user (including org collections)')
    .action(async () => {
      await listCollections();
    });

  command
    .command('create')
    .description('Create a new collection')
    .argument('<name>', 'Collection name (1-100 chars)')
    .option('--description <text>', 'Optional description')
    .option('--icon <name>', 'Lucide icon name (e.g. Star, Sparkles, Rocket, Heart)')
    .option('--org-login <login>', 'Create as an org-owned collection (must be a member)')
    .action(async (name: string, options: CreateOptions) => {
      await createCollection(name, options);
    });

  command
    .command('repos')
    .description('List all repos in a collection')
    .argument('<collection-id>', 'Collection id')
    .action(async (collectionId: string) => {
      await listRepos(collectionId);
    });

  command
    .command('add')
    .description('Add a repo to a collection (auto-fetches description, stars, avatar from GitHub)')
    .argument('<collection-id>', 'Collection id')
    .argument('<owner/repo>', 'Repo in owner/repo format (e.g. principal-ai/web-ade)')
    .action(async (collectionId: string, ownerRepo: string) => {
      await addRepo(collectionId, ownerRepo);
    });

  command
    .command('remove')
    .description('Remove a repo from a collection')
    .argument('<collection-id>', 'Collection id')
    .argument('<owner/repo>', 'Repo in owner/repo format (e.g. principal-ai/web-ade)')
    .action(async (collectionId: string, ownerRepo: string) => {
      await removeRepo(collectionId, ownerRepo);
    });

  command
    .command('delete')
    .description('Delete a collection')
    .argument('<collection-id>', 'Collection id')
    .action(async (collectionId: string) => {
      await deleteCollection(collectionId);
    });

  return command;
}
