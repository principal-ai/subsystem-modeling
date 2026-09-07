/**
 * Repo command — fetch package information for a GitHub repo from web-ade.
 *
 * Hits `GET /api/github/repo/{owner}/{name}/packages` which mirrors the live
 * package discovery the in-app repo explorer uses (`PackageLayerModule`).
 * The response is `{ packages: PackageLayer[], summary, treeSha }` where
 * `summary` carries the monorepo flag, root package name, workspace list,
 * and aggregated dependency / script counts.
 *
 * Resolves a GitHub token locally (gh CLI → git credential helper) and calls
 * the web-ade API with `Authorization: Bearer <token>`. The token is never
 * echoed to argv, env, stdout, or stderr.
 *
 * Set `PRINCIPAL_ADE_BASE_URL` to point at a non-prod deployment.
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
      ? 'Repository not found (or token lacks read access)'
      : response.status === 403
        ? 'Not authorized (token may lack repo scope)'
        : response.status === 401
          ? 'GitHub token rejected'
          : `HTTP ${response.status}`;
  const human = serverMessage || fallback;
  return `${human}${code ? ` [${code}]` : ''}`;
}

// ============================================================================
// Types — mirror the shape returned by web-ade's packages route.
// Kept permissive (`?`) since `PackageLayer.packageData` is sparse for some
// manifest kinds; the server already tolerates missing fields.
// ============================================================================

interface PackageCommand {
  name?: string;
  command?: string;
}

interface PackageData {
  name?: string;
  path?: string;
  isMonorepoRoot?: boolean;
  isWorkspace?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  availableCommands?: PackageCommand[];
}

interface PackageLayer {
  packageData?: PackageData;
}

interface WorkspacePackage {
  name?: string;
  path?: string;
}

interface PackagesSummary {
  isMonorepo?: boolean;
  rootPackageName?: string;
  totalPackages?: number;
  workspacePackages?: WorkspacePackage[];
  totalDependencies?: number;
  totalDevDependencies?: number;
  availableScripts?: string[];
  truncated?: boolean;
}

interface PackagesResponse {
  packages: PackageLayer[];
  summary: PackagesSummary;
  treeSha?: string;
  error?: string;
}

// ============================================================================
// repo parsing
// ============================================================================

function parseOwnerRepo(ownerRepo: string): { owner: string; repo: string } {
  const slashIndex = ownerRepo.indexOf('/');
  if (slashIndex === -1 || slashIndex === 0 || slashIndex === ownerRepo.length - 1) {
    process.stderr.write(
      `Invalid repo format: "${ownerRepo}". Use <owner>/<repo> (e.g. "principal-ai/web-ade").\n`,
    );
    process.exit(2);
  }
  return {
    owner: ownerRepo.slice(0, slashIndex),
    repo: ownerRepo.slice(slashIndex + 1),
  };
}

// ============================================================================
// Subcommands
// ============================================================================

interface PackagesOptions {
  summaryOnly?: boolean;
  json?: boolean;
}

async function fetchPackages(
  ownerRepo: string,
  options: PackagesOptions,
): Promise<void> {
  const { owner, repo } = parseOwnerRepo(ownerRepo);

  const token = resolveToken();
  if (!token) exitWithTokenError();

  const url = `${BASE_URL}/api/github/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/packages`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    process.stderr.write(
      `Network error fetching packages: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  let body: PackagesResponse;
  try {
    body = (await response.json()) as PackagesResponse;
  } catch {
    process.stderr.write('Unexpected non-JSON response from the packages endpoint.\n');
    process.exit(1);
  }

  // A 200 may still carry a server-side error message (degraded fallback).
  if (body.error) {
    process.stderr.write(`Server reported an error: ${body.error}\n`);
    process.exit(1);
  }

  if (options.json) {
    const out = options.summaryOnly ? { summary: body.summary, treeSha: body.treeSha } : body;
    process.stdout.write(JSON.stringify(out, null, 2));
    process.stdout.write('\n');
    return;
  }

  renderPackagesHuman(body, options.summaryOnly === true);
}

// ============================================================================
// Human rendering
// ============================================================================

function renderPackagesHuman(body: PackagesResponse, summaryOnly: boolean): void {
  const { summary = {}, packages, treeSha } = body;
  const pkgCount = summary.totalPackages ?? packages.length;
  const heading = summary.isMonorepo
    ? `Monorepo — ${pkgCount} package${pkgCount === 1 ? '' : 's'}`
    : `${pkgCount} package${pkgCount === 1 ? '' : 's'}`;

  console.log(`\n${heading}`);
  if (summary.rootPackageName) {
    console.log(`  root: ${summary.rootPackageName}`);
  }
  if (treeSha) console.log(`  tree: ${treeSha}`);
  console.log('');

  const deps = summary.totalDependencies ?? 0;
  const devDeps = summary.totalDevDependencies ?? 0;
  console.log(
    `  dependencies:        ${deps}   dev: ${devDeps}`,
  );
  const scripts = summary.availableScripts ?? [];
  if (scripts.length > 0) {
    console.log(`  available scripts:  ${scripts.length}`);
    const preview = scripts.slice(0, 10).join(', ');
    const more = scripts.length > 10 ? ` (+${scripts.length - 10} more)` : '';
    console.log(`    ${preview}${more}`);
  }
  console.log('');

  if (summaryOnly) return;

  const workspacePackages = summary.workspacePackages ?? [];
  if (workspacePackages.length > 0) {
    console.log('  workspaces:');
    for (const ws of workspacePackages) {
      const name = ws.name || '(unnamed)';
      const path = ws.path || '';
      console.log(`    ${name}${path ? `  ${path}` : ''}`);
    }
    console.log('');
  }

  if (packages.length === 0) {
    console.log('  (no package manifests detected)');
    return;
  }

  console.log('  packages:');
  for (const p of packages) {
    const data = p.packageData;
    if (!data) {
      console.log('    (entry without packageData)');
      continue;
    }
    const name = data.name || '(unnamed)';
    const path = data.path || '';
    const flags: string[] = [];
    if (data.isMonorepoRoot) flags.push('monorepo-root');
    if (data.isWorkspace) flags.push('workspace');
    const flagText = flags.length > 0 ? `  [${flags.join(', ')}]` : '';
    console.log(`    ${name}${path ? `  ${path}` : ''}${flagText}`);
    const depCount = Object.keys(data.dependencies || {}).length;
    const devDepCount = Object.keys(data.devDependencies || {}).length;
    if (depCount || devDepCount) {
      console.log(`      deps: ${depCount}, devDeps: ${devDepCount}`);
    }
    const commands = data.availableCommands ?? [];
    if (commands.length > 0) {
      const names = commands.map((c) => c.name).filter(Boolean) as string[];
      if (names.length > 0) {
        const preview = names.slice(0, 8).join(', ');
        const more = names.length > 8 ? ` (+${names.length - 8} more)` : '';
        console.log(`      scripts: ${preview}${more}`);
      }
    }
  }
  console.log('');
}

// ============================================================================
// Command wiring
// ============================================================================

export function createRepoCommand(): Command {
  const command = new Command('repo');

  command.description('Fetch repository data from web-ade');

  command
    .command('packages')
    .description(
      'Detect and return package information for a GitHub repository (live discovery via web-ade).',
    )
    .argument('<owner/repo>', 'Repo in owner/repo format (e.g. principal-ai/web-ade)')
    .option('--summary-only', 'Print only the aggregate summary (no per-package list)')
    .option('--json', 'Output the raw response as JSON (for agents / storing in a story)')
    .action(async (ownerRepo: string, options: PackagesOptions) => {
      await fetchPackages(ownerRepo, options);
    });

  return command;
}
