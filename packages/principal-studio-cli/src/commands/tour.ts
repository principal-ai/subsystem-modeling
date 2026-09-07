/**
 * Tour command — author, validate, analyze, and open File City introduction
 * tours (`*.tour.json`).
 *
 * Tours are the sibling of trails: a trail pins markers to `file:line`, a tour
 * scopes steps to a `focusDirectory` + highlight layers. This command bundles
 * the full tour lifecycle:
 *
 *   principal-ai tour init      scaffold a tour from a template
 *   principal-ai tour validate  validate a tour against the spec
 *   principal-ai tour stats      timing/length analysis vs. the guidelines
 *   principal-ai tour view      open a tour in the standalone viewer
 *
 * `init`/`validate`/`stats` were folded in from the deprecated
 * `@principal-ai/file-city-cli`; they delegate all schema work to
 * `@principal-ai/file-city-builder` (`parseTour`, `IntroductionTour`). `view`
 * is the lighter cousin of `trail view --file`, reusing the same viewer-launch
 * + IPC handoff plumbing — and because steps address whole directories, tours
 * are local-mode only (no fetch, no remote slice resolution, no token).
 */

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import chalk from 'chalk';
import { parseTour, type IntroductionTour, type TourRepoRef } from '@principal-ai/file-city-builder';
import { handoffToRunning, type LoadTrailMessage } from '../lib/viewer-ipc.js';
import * as tourCache from '../lib/tour-cache.js';
import {
  BASE_URL,
  describeHttpError,
  exitWithTokenError,
  gitRemoteUrl,
  ownerRepoFromGitRemote,
  resolveToken,
  resolveViewerLaunch,
} from './trail.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Extract a tour id from a bare id or a web-ade `/tour/<id>` URL. Falls back to
 * the input unchanged when it isn't a URL.
 */
function parseTourId(input: string): string {
  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/tour\/([^/]+)\/?$/);
    if (match) return match[1];
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length) return segments[segments.length - 1];
  } catch {
    // not a URL — treat as a bare id
  }
  return input;
}

// ---------------------------------------------------------------------------
// view
// ---------------------------------------------------------------------------

interface TourViewOptions {
  repoRoot?: string;
  viewerDir?: string;
  file?: string;
  refresh?: boolean;
}

interface TourOwnerRepoOptions {
  owner?: string;
  repo?: string;
  purl?: string;
}

/**
 * Resolve the `{ owner, repo }` a tour publishes under. Unlike trails, a tour
 * document carries no `repos[]`, so we look at explicit flags first, then fall
 * back to the cwd's `origin` git remote. Exits with guidance when neither
 * yields an owner/repo.
 */
function resolveTourOwnerRepo(options: TourOwnerRepoOptions): {
  owner: string;
  repo: string;
} {
  if (options.purl) {
    const match = options.purl.match(/^pkg:(?:github|gitlab|bitbucket)\/([^/]+)\/([^/@]+)/);
    if (!match) {
      process.stderr.write(
        `--purl is not a valid github/gitlab/bitbucket Purl: ${options.purl}\n`,
      );
      process.exit(2);
    }
    return { owner: options.owner ?? match[1], repo: options.repo ?? match[2] };
  }

  if (options.owner && options.repo) {
    return { owner: options.owner, repo: options.repo };
  }

  const remote = gitRemoteUrl(process.cwd());
  const fromRemote = remote ? ownerRepoFromGitRemote(remote) : null;
  const owner = options.owner ?? fromRemote?.owner;
  const repo = options.repo ?? fromRemote?.name;

  if (!owner || !repo) {
    process.stderr.write(
      'Could not determine owner/repo. Pass --owner and --repo (or --purl), or run inside a clone with an `origin` remote.\n',
    );
    process.exit(2);
  }
  return { owner, repo };
}

/** Build a tour's primary repo ref from resolved owner/repo. */
function tourRepoRefFor(owner: string, repo: string): TourRepoRef {
  return {
    id: `pkg:github/${owner.toLowerCase()}/${repo}`,
    name: repo,
    remote: { host: 'github', owner, name: repo },
  };
}

/** Fetch + cache a tour by id. Exits the process on any error. */
async function fetchAndCacheTour(
  id: string,
): Promise<{ body: string; cachePath: string }> {
  const token = resolveToken();
  if (!token) exitWithTokenError();

  const url = `${BASE_URL}/api/tours/by-id/${encodeURIComponent(id)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch (err) {
    process.stderr.write(`Network error fetching tour: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const body = await response.text();
  let cachePath: string;
  try {
    cachePath = tourCache.write(id, body).path;
  } catch {
    // Cache write failed — continue without a cache hit for this call.
    cachePath = '';
  }
  return { body, cachePath };
}

async function fetchTour(input: string): Promise<void> {
  const id = parseTourId(input);
  if (!id) {
    process.stderr.write('Invalid tour id\n');
    process.exit(2);
  }
  const { body } = await fetchAndCacheTour(id);
  process.stdout.write(body);
  if (!body.endsWith('\n')) process.stdout.write('\n');
}

/**
 * Publish a tour document to web-ade. The server mints the share id and pins
 * audio coordinates; we print the resulting share URL to stdout.
 */
async function publishTour(
  file: string | undefined,
  options: TourOwnerRepoOptions,
): Promise<void> {
  const path = file && file !== '-' ? resolve(process.cwd(), file) : undefined;
  if (!path) {
    process.stderr.write('Pass the path to a *.tour.json file to publish.\n');
    process.exit(2);
  }
  if (!existsSync(path)) {
    process.stderr.write(`Tour file not found: ${path}\n`);
    process.exit(2);
  }

  let tour: unknown;
  try {
    tour = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    process.stderr.write(`Tour file is not valid JSON: ${(err as Error).message}\n`);
    process.exit(1);
  }

  // Resolve the publish target and stamp it as the tour's primary repo. Tours
  // require `repos[]`, but an author's file usually omits it — so we derive it
  // from flags / the git remote and inject it (preserving any extra repos the
  // author declared for a multi-repo tour) before validating. The server
  // re-stamps repos[0] authoritatively; this keeps local validation honest and
  // the published artifact consistent.
  const { owner, repo } = resolveTourOwnerRepo(options);
  const existingRepos =
    tour && typeof tour === 'object' && Array.isArray((tour as { repos?: unknown }).repos)
      ? (tour as { repos: TourRepoRef[] }).repos.slice(1)
      : [];
  const stampedTour = {
    ...(tour as Record<string, unknown>),
    repos: [tourRepoRefFor(owner, repo), ...existingRepos],
  };

  // Validate locally before the round-trip so authors get the spec errors here
  // rather than as a 400 from the server.
  const parsed = parseTour(JSON.stringify(stampedTour));
  if (!parsed.success || !parsed.tour) {
    const detail =
      parsed.errors?.map((e) => e.message).join(', ') || 'unknown error';
    process.stderr.write(`Invalid tour: ${detail}\n`);
    process.exit(2);
  }

  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/api/tours/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ owner, repo, tour: parsed.tour }),
      },
    );
  } catch (err) {
    process.stderr.write(`Network error publishing tour: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const resBody = (await response.json()) as { id?: string; url?: string };
  if (!resBody.url) {
    process.stderr.write('Server response missing share URL\n');
    process.exit(1);
  }
  const shareUrl = resBody.url.startsWith('http')
    ? resBody.url
    : `${BASE_URL}${resBody.url}`;
  process.stdout.write(`${shareUrl}\n`);
}

/**
 * Cheap pre-flight so an obviously-broken tour fails here with a clear message
 * instead of opening the viewer to an idle, empty city. The viewer host runs
 * the full `parseTourOrThrow` validation on load — this only catches the
 * coarse "not JSON / not a tour" cases without pulling in the builder package.
 */
function assertLooksLikeTour(absolute: string): void {
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
    process.stderr.write(`Tour file is not valid JSON: ${(err as Error).message}\n`);
    process.exit(1);
  }
  const steps =
    typeof payload === 'object' && payload !== null
      ? (payload as { steps?: unknown }).steps
      : undefined;
  if (!Array.isArray(steps) || steps.length === 0) {
    process.stderr.write(
      `${absolute} does not look like a tour (expected a non-empty \`steps\` array).\n`,
    );
    process.exit(1);
  }
}

/**
 * Materialize a viewer-ready *.tour.json from a store id. The by-id response is
 * a `{ owner, repo, entry, payload }` wrapper where `payload` is the tour; we
 * pull it out and write it to a temp `*.tour.json` the viewer can load. The
 * fetched wrapper is still cached verbatim by `fetchAndCacheTour` for `fetch`.
 */
async function resolveTourFileFromId(
  input: string,
  refresh: boolean,
): Promise<string> {
  const id = parseTourId(input);
  if (!id) {
    process.stderr.write('Invalid tour id\n');
    process.exit(2);
  }

  const cached = refresh ? null : tourCache.read(id, ONE_HOUR_MS);
  const body = cached ? cached.body : (await fetchAndCacheTour(id)).body;

  let wrapper: unknown;
  try {
    wrapper = JSON.parse(body);
  } catch (err) {
    process.stderr.write(`Tour body is not valid JSON: ${(err as Error).message}\n`);
    process.exit(1);
  }

  // The by-id response wraps the tour as `{ owner, repo, entry, payload }`,
  // where `payload` IS the tour. A bare local file is already the tour. Accept
  // either shape.
  const tour =
    typeof wrapper === 'object' && wrapper !== null
      ? ((wrapper as { payload?: unknown }).payload ?? wrapper)
      : wrapper;

  const viewerPath = join(
    tmpdir(),
    `principal-tour-${id.replace(/[^A-Za-z0-9._-]/g, '_')}.tour.json`,
  );
  writeFileSync(viewerPath, JSON.stringify(tour), 'utf8');
  assertLooksLikeTour(viewerPath);
  return viewerPath;
}

async function viewTour(
  input: string | undefined,
  options: TourViewOptions,
): Promise<void> {
  if (!input && !options.file) {
    process.stderr.write('Pass a *.tour.json path/id-or-url, or --file <path>.\n');
    process.exit(2);
  }
  if (input && options.file) {
    process.stderr.write('Pass either a path/id-or-url OR --file, not both.\n');
    process.exit(2);
  }

  let absolute: string;
  if (options.file) {
    absolute = resolve(process.cwd(), options.file);
    if (!existsSync(absolute)) {
      process.stderr.write(`Tour file not found: ${absolute}\n`);
      process.exit(2);
    }
    assertLooksLikeTour(absolute);
  } else {
    // A positional arg that resolves to an existing file is a local tour; any
    // other value is treated as a store id/url and fetched.
    const maybePath = resolve(process.cwd(), input as string);
    if (existsSync(maybePath)) {
      absolute = maybePath;
      assertLooksLikeTour(absolute);
    } else {
      absolute = await resolveTourFileFromId(input as string, options.refresh ?? false);
    }
  }

  // Default the repo root to cwd. The user sees "no directory matched" framing
  // in the viewer if cwd isn't actually the repo the tour was authored against,
  // which is the right signal to re-run with --repo-root.
  const repoRoot = options.repoRoot
    ? resolve(process.cwd(), options.repoRoot)
    : process.cwd();

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TRAIL_FILE: absolute,
    TRAIL_MODE: 'local',
    TRAIL_REPO_ROOT: repoRoot,
  };

  // The viewer host auto-detects tour vs trail from the filename/shape, so the
  // `LOAD_TRAIL` message carries the tour file just like a trail would.
  const ipcMessage: LoadTrailMessage = {
    kind: 'LOAD_TRAIL',
    trailFile: absolute,
    mode: 'local',
    repoRoot,
  };
  if (await handoffToRunning(ipcMessage)) {
    process.stderr.write(`Tour handed off to running viewer: ${absolute}\n`);
    process.exit(0);
  }

  const launch = resolveViewerLaunch(options.viewerDir);
  process.stderr.write(`Launching tour viewer for ${absolute}\n`);

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

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

type TemplateType = 'minimal' | 'onboarding' | 'architecture';

interface InitOptions {
  template?: TemplateType;
  output?: string;
}

function getMinimalTemplate(): Omit<IntroductionTour, 'repos'> {
  return {
    id: 'quick-start',
    title: 'Quick Start Guide',
    description: 'Get started with the codebase in 5 minutes',
    version: '1.0.0',
    audience: 'New Users & AI Assistants',
    steps: [
      {
        id: 'step-1-welcome',
        title: 'Welcome!',
        description: 'This is a simple introduction to the project structure.',
        estimatedTime: 30,
        // Last step must focus on repository root ("") for a complete overview.
        focusDirectory: '',
        colorMode: 'fileTypes',
      },
    ],
  };
}

function getOnboardingTemplate(): Omit<IntroductionTour, 'repos'> {
  return {
    id: 'codebase-onboarding',
    title: 'Codebase Onboarding Tour',
    description: 'Learn the structure and key components of this codebase',
    version: '1.0.0',
    audience: 'New Developers',
    prerequisites: ['Basic understanding of the technology stack'],
    steps: [
      {
        id: 'step-1-overview',
        title: 'Project Overview',
        description: 'Welcome to the codebase! This tour will guide you through the main areas.',
        estimatedTime: 60,
        colorMode: 'fileTypes',
      },
      {
        id: 'step-2-core',
        title: 'Core Components',
        description: 'These are the main building blocks of the application.',
        estimatedTime: 120,
        focusDirectory: 'src',
        highlightLayers: [
          {
            id: 'core-layer',
            name: 'Core Files',
            color: '#3b82f6',
            items: [
              { path: 'src/index.ts', type: 'file' },
              { path: 'src/components', type: 'directory' },
            ],
            opacity: 0.7,
            borderWidth: 2,
          },
        ],
        colorMode: 'fileTypes',
      },
      {
        id: 'step-3-configuration',
        title: 'Configuration',
        description: 'Configuration files that control the application behavior.',
        estimatedTime: 60,
        highlightFiles: ['package.json', 'tsconfig.json'],
        // Last step focuses on repository root ("") for a complete overview.
        focusDirectory: '',
        colorMode: 'fileTypes',
      },
    ],
    metadata: {
      author: 'Your Name',
      createdAt: new Date().toISOString(),
      tags: ['onboarding', 'tutorial'],
    },
  };
}

function getArchitectureTemplate(): Omit<IntroductionTour, 'repos'> {
  return {
    id: 'architecture-overview',
    title: 'Architecture Overview',
    description: 'Understand the architectural decisions and patterns in this codebase',
    version: '1.0.0',
    audience: 'Engineers & Architects',
    steps: [
      {
        id: 'step-1-layered-architecture',
        title: 'Layered Architecture',
        description: 'The application follows a layered architecture pattern.',
        estimatedTime: 120,
        // Steps with highlightLayers must set focusDirectory; "" frames the
        // whole tree so all three layers are visible at once.
        focusDirectory: '',
        highlightLayers: [
          {
            id: 'presentation-layer',
            name: 'Presentation Layer',
            color: '#10b981',
            items: [{ path: 'src/components', type: 'directory' }],
            opacity: 0.6,
          },
          {
            id: 'business-layer',
            name: 'Business Logic',
            color: '#f59e0b',
            items: [{ path: 'src/services', type: 'directory' }],
            opacity: 0.6,
          },
          {
            id: 'data-layer',
            name: 'Data Layer',
            color: '#ef4444',
            items: [{ path: 'src/models', type: 'directory' }],
            opacity: 0.6,
          },
        ],
        colorMode: 'fileTypes',
      },
      {
        id: 'step-2-patterns',
        title: 'Design Patterns',
        description: 'Key design patterns used throughout the codebase.',
        estimatedTime: 180,
        // Last step focuses on repository root ("") for a complete overview.
        focusDirectory: '',
        resources: [
          {
            title: 'Design Patterns Documentation',
            url: 'https://refactoring.guru/design-patterns',
            type: 'documentation',
          },
        ],
        colorMode: 'fileTypes',
      },
    ],
    metadata: {
      author: 'Architecture Team',
      createdAt: new Date().toISOString(),
      tags: ['architecture', 'patterns', 'advanced'],
    },
  };
}

function getTemplate(templateType: TemplateType): Omit<IntroductionTour, 'repos'> {
  switch (templateType) {
    case 'onboarding':
      return getOnboardingTemplate();
    case 'architecture':
      return getArchitectureTemplate();
    case 'minimal':
    default:
      return getMinimalTemplate();
  }
}

function initTour(options: InitOptions): void {
  const template = options.template || 'minimal';
  const base = getTemplate(template);

  // Tours require `repos[]`. Anchor to the cwd git remote when there is one;
  // otherwise scaffold an obvious placeholder for the author to edit.
  const remote = gitRemoteUrl(process.cwd());
  const fromRemote = remote ? ownerRepoFromGitRemote(remote) : null;
  const repos: TourRepoRef[] = fromRemote
    ? [tourRepoRefFor(fromRemote.owner, fromRemote.name)]
    : [
        {
          id: 'pkg:github/OWNER/REPO',
          name: 'REPO',
          remote: { host: 'github', owner: 'OWNER', name: 'REPO' },
        },
      ];
  const tour: IntroductionTour = { ...base, repos };

  const outputFile = options.output || `${tour.id}.tour.json`;
  const absolutePath = resolve(process.cwd(), outputFile);

  try {
    writeFileSync(absolutePath, JSON.stringify(tour, null, 2), 'utf-8');
  } catch (error) {
    console.error(chalk.red(`\n✗ ${error instanceof Error ? error.message : 'Unknown error'}\n`));
    process.exit(1);
  }

  console.log(chalk.green(`✓ Tour file created: ${outputFile}`));
  console.log(chalk.dim(`  Template: ${template}`));
  console.log(chalk.dim(`  Tour ID: ${tour.id}`));
  console.log(chalk.dim(`  Steps: ${tour.steps.length}`));
  console.log(chalk.dim(`  Repo: ${repos[0]!.id}`));
  if (!fromRemote) {
    console.log(
      chalk.yellow(
        '  ⚠ No git remote found — edit `repos[0]` to point at the real repository.',
      ),
    );
  }
  console.log('\nNext steps:');
  console.log('  1. Edit the tour file to customize it for your codebase');
  console.log(`  2. Validate the tour: principal-ai tour validate ${outputFile}`);
  console.log(`  3. Publish it: principal-ai tour publish ${outputFile}\n`);
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

interface ValidateOptions {
  json?: boolean;
}

function validateTourFile(file: string, options: ValidateOptions): void {
  const absolutePath = resolve(process.cwd(), file);
  const fileName = basename(absolutePath);

  let content: string;
  try {
    content = readFileSync(absolutePath, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (options.json) {
      console.log(JSON.stringify({ valid: false, error: message }, null, 2));
    } else {
      console.error(chalk.red(`\n✗ Error: ${message}\n`));
    }
    process.exit(1);
  }

  const result = parseTour(content);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          file: fileName,
          valid: result.success,
          errors: result.errors?.map((e) => ({
            message: e.message,
            field: e.field,
            value: e.value,
          })),
          tour: result.tour
            ? {
                id: result.tour.id,
                title: result.tour.title,
                version: result.tour.version,
                stepCount: result.tour.steps.length,
              }
            : undefined,
        },
        null,
        2,
      ),
    );
    if (!result.success) process.exit(1);
    return;
  }

  if (result.success && result.tour) {
    console.log(chalk.green(`✓ Tour "${fileName}" is valid!`));
    console.log(chalk.dim(`  Tour ID: ${result.tour.id}`));
    console.log(chalk.dim(`  Title: ${result.tour.title}`));
    console.log(chalk.dim(`  Version: ${result.tour.version}`));
    console.log(chalk.dim(`  Steps: ${result.tour.steps.length}`));
    if (result.tour.audience) {
      console.log(chalk.dim(`  Audience: ${result.tour.audience}`));
    }
    return;
  }

  console.error(chalk.red(`\n✗ Tour "${fileName}" is invalid:\n`));
  for (const e of result.errors ?? []) {
    const where = e.field ? chalk.dim(` (${e.field})`) : '';
    console.error(chalk.red(`  • ${e.message}`) + where);
  }
  console.error('');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

interface StatsOptions {
  json?: boolean;
}

interface StepStats {
  id: string;
  title: string;
  estimatedTime: number;
  characterCount: number;
  hasTime: boolean;
}

interface TourStats {
  stepCount: number;
  totalTime: number;
  hasAllTimes: boolean;
  totalCharacters: number;
  steps: StepStats[];
  recommendations: string[];
}

/**
 * Estimate time for a step from character count. Guideline: 200-250 chars take
 * ~20-30s — roughly 10 chars/second covering reading + viewing + interaction.
 */
function estimateStepTime(charCount: number): number {
  return Math.round(charCount / 10 / 5) * 5;
}

function analyzeTour(tour: IntroductionTour): TourStats {
  const steps: StepStats[] = tour.steps.map((step) => {
    const characterCount = step.description.length;
    const hasTime = step.estimatedTime !== undefined;
    const estimatedTime = hasTime ? (step.estimatedTime as number) : estimateStepTime(characterCount);
    return { id: step.id, title: step.title, estimatedTime, characterCount, hasTime };
  });

  const totalCharacters = steps.reduce((sum, s) => sum + s.characterCount, 0);
  const totalTime = steps.reduce((sum, s) => sum + s.estimatedTime, 0);
  const hasAllTimes = steps.every((s) => s.hasTime);
  const stepCount = steps.length;

  const recommendations: string[] = [];

  for (const step of steps.filter((s) => s.characterCount > 300)) {
    const excess = step.characterCount - 300;
    recommendations.push(`Reduce "${step.title}" by ${excess} character${excess > 1 ? 's' : ''}`);
  }

  if (stepCount > 8) {
    recommendations.push(`Reduce step count from ${stepCount} to 6-8 steps (consolidate related concepts)`);
  } else if (stepCount > 6) {
    recommendations.push(`Consider reducing from ${stepCount} to 4-6 steps for ideal 2-minute duration`);
  }

  if (totalTime > 180) {
    recommendations.push(`Reduce total duration by ~${Math.round((totalTime - 180) / 60)}m to meet 3-minute maximum`);
  } else if (totalTime > 120) {
    recommendations.push(`Consider reducing duration by ~${Math.round((totalTime - 120) / 60)}m to meet 2-minute ideal`);
  }

  if (totalCharacters > 2000) {
    recommendations.push(`Reduce total text by ${totalCharacters - 2000} characters to meet 2,000 char limit`);
  } else if (totalCharacters > 1500) {
    recommendations.push(`Consider reducing text by ${totalCharacters - 1500} characters to meet ideal range`);
  }

  if (!hasAllTimes) {
    recommendations.push('Add `estimatedTime` field to all steps for accurate tracking');
  }

  return { stepCount, totalTime, hasAllTimes, totalCharacters, steps, recommendations };
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins === 0 ? `${secs}s` : `${mins}m ${secs}s`;
}

function statusIndicator(value: number, idealMax: number, acceptableMax: number): string {
  if (value <= idealMax) return chalk.green('✓');
  if (value <= acceptableMax) return chalk.yellow('⚠');
  return chalk.red('✗');
}

function printStats(tour: IntroductionTour, stats: TourStats): void {
  console.log('');
  console.log(chalk.bold.cyan(`Tour Statistics: "${tour.title}"`));
  console.log(chalk.cyan('━'.repeat(60)));
  console.log('');

  console.log(chalk.bold('Steps:              ') + `${stats.stepCount} step${stats.stepCount !== 1 ? 's' : ''}`);
  const timeStr = stats.hasAllTimes ? formatTime(stats.totalTime) : `${formatTime(stats.totalTime)} (estimated)`;
  console.log(chalk.bold('Total duration:     ') + timeStr);
  console.log(chalk.bold('Total description:  ') + `${stats.totalCharacters} characters`);
  console.log('');

  console.log(chalk.bold('Target Guidelines:'));
  console.log(`  ${statusIndicator(stats.stepCount, 6, 8)} Steps: ${stats.stepCount} (4-6 ideal, 6-8 acceptable, >8 over)`);
  console.log(`  ${statusIndicator(stats.totalTime, 120, 180)} Duration: ${formatTime(stats.totalTime)} (2min ideal, 3min max)`);
  console.log(`  ${statusIndicator(stats.totalCharacters, 1500, 2000)} Characters: ${stats.totalCharacters} (800-1,500 ideal, 2,000 max)`);
  console.log('');

  console.log(chalk.bold('Per-Step Breakdown:'));
  stats.steps.forEach((step, index) => {
    const timeStr = step.hasTime ? formatTime(step.estimatedTime) : `${formatTime(step.estimatedTime)} est`;
    const charStatus =
      step.characterCount > 300
        ? chalk.red('✗ Exceeds 300 char limit')
        : step.characterCount >= 280
          ? chalk.yellow('⚠ Approaching limit')
          : chalk.green('✓');
    console.log(
      `  ${(index + 1).toString().padStart(2)}. ${step.title.padEnd(30)} (${timeStr.padEnd(7)}, ${step.characterCount} chars) ${charStatus}`,
    );
  });
  console.log('');

  if (!stats.hasAllTimes) {
    console.log(chalk.yellow('⚠ Missing `estimatedTime` field on some steps (values estimated)'));
    console.log('');
  }

  if (stats.recommendations.length > 0) {
    console.log(chalk.bold('Recommendations:'));
    for (const rec of stats.recommendations) console.log(`  • ${rec}`);
    console.log('');
  } else {
    console.log(chalk.green.bold('✓ Tour meets all guidelines!'));
    console.log('');
  }
}

function statsTourFile(file: string, options: StatsOptions): void {
  const absolutePath = resolve(process.cwd(), file);
  const fileName = basename(absolutePath);

  let content: string;
  try {
    content = readFileSync(absolutePath, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (options.json) console.log(JSON.stringify({ error: message }, null, 2));
    else console.error(chalk.red(`\n✗ Error: ${message}\n`));
    process.exit(1);
  }

  const result = parseTour(content);
  if (!result.success || !result.tour) {
    console.error(chalk.red('\n✗ Cannot analyze tour — validation failed. Run `tour validate` first.\n'));
    process.exit(1);
  }

  const stats = analyzeTour(result.tour);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          file: fileName,
          tour: { id: result.tour.id, title: result.tour.title, version: result.tour.version },
          stats: {
            stepCount: stats.stepCount,
            totalTime: stats.totalTime,
            totalCharacters: stats.totalCharacters,
            hasAllTimes: stats.hasAllTimes,
            steps: stats.steps,
            recommendations: stats.recommendations,
          },
          meetsGuidelines: stats.recommendations.length === 0,
        },
        null,
        2,
      ),
    );
    return;
  }

  printStats(result.tour, stats);
}

// ---------------------------------------------------------------------------
// command wiring
// ---------------------------------------------------------------------------

export function createTourCommand(): Command {
  const command = new Command('tour');

  command.description('Author, validate, analyze, and open File City introduction tours');

  command
    .command('init')
    .description('Scaffold a new *.tour.json from a template')
    .option('-t, --template <type>', 'Template type (minimal, onboarding, architecture)', 'minimal')
    .option('-o, --output <file>', 'Output filename')
    .action((options: InitOptions) => {
      initTour(options);
    });

  command
    .command('validate')
    .description('Validate a *.tour.json against the spec')
    .argument('<file>', 'Path to a *.tour.json file')
    .option('-j, --json', 'Output results as JSON')
    .action((file: string, options: ValidateOptions) => {
      validateTourFile(file, options);
    });

  command
    .command('stats')
    .description('Show tour timing/length analysis vs. the authoring guidelines')
    .argument('<file>', 'Path to a *.tour.json file')
    .option('-j, --json', 'Output results as JSON')
    .action((file: string, options: StatsOptions) => {
      statsTourFile(file, options);
    });

  command
    .command('view')
    .description('Open a tour in the standalone viewer (local mode): a *.tour.json path, or a store id/url')
    .argument('[file-or-id]', 'Path to a *.tour.json file, a tour id, or a /tour/<id> URL (omit when using --file)')
    .option('--file <path>', 'Open a local *.tour.json file directly (skips fetch + cache)')
    .option('--repo-root <path>', 'Working tree the tour is authored against (default: cwd)')
    .option('--refresh', 'Bypass the tour JSON cache and re-fetch (id/url only)')
    .option('--viewer-dir <path>', 'Path to the @principal-ai/subsystems-studio package (overrides PRINCIPAL_STUDIO_DIR)')
    .action(async (input: string | undefined, options: TourViewOptions) => {
      await viewTour(input, options);
    });

  command
    .command('fetch')
    .description('Fetch a tour by id/url from web-ade and print its JSON (also caches locally)')
    .argument('<id-or-url>', 'Tour id, or full https://app.principal-ade.com/tour/<id> URL')
    .action(async (input: string) => {
      await fetchTour(input);
    });

  command
    .command('publish')
    .description('Publish a *.tour.json to web-ade')
    .argument('<file>', 'Path to a *.tour.json file')
    .option('--owner <owner>', 'GitHub owner to publish under (overrides the git remote)')
    .option('--repo <repo>', 'GitHub repo to publish under (overrides the git remote)')
    .option('--purl <purl>', 'Anchor by Purl (e.g. pkg:github/owner/repo); overrides --owner/--repo derivation')
    .action(async (file: string, options: TourOwnerRepoOptions) => {
      await publishTour(file, options);
    });

  return command;
}
