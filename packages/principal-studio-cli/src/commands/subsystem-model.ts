/**
 * `principal-ai subsystem-model` — create / open / list subsystem models
 * without requiring Principal Studio's HTTP bridge to already be running.
 *
 * Create validates + persists to `~/.principal/subsystem-models/` (same store
 * Studio uses), then opens the model: IPC handoff if Studio is up, otherwise
 * launches Studio with `SUBSYSTEM_MODEL_ID` so it opens the new tab on boot.
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { tryResolveViewerLaunch } from '../lib/viewer-launch.js';
import { handoffToRunning } from '../lib/viewer-ipc.js';
import {
  getSubsystemModel,
  listSubsystemModels,
  subsystemModelFilePath,
  upsertSubsystemModel,
  type StoredSubsystemModel,
} from '../lib/subsystem-model-store.js';
import { findSubsystemModelProblems } from '../lib/subsystem-model-validation.js';
import {
  analyzeComposeOverlap,
  formatComposeOverlap,
  type OverlapComponent,
} from '../lib/compose-overlap.js';

async function readPayloadFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readPayload(file: string | undefined): Promise<unknown> {
  const useStdin = !file || file === '-';
  const raw = useStdin ? await readPayloadFromStdin() : readFileSync(file, 'utf8');
  if (!raw.trim()) {
    process.stderr.write('Empty payload\n');
    process.exit(2);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    process.stderr.write(`Could not parse payload as JSON: ${(err as Error).message}\n`);
    process.exit(2);
  }
}

function studioHttpBase(): string {
  const port = process.env['PRINCIPAL_STUDIO_HTTP_PORT'] ?? '3045';
  return `http://127.0.0.1:${port}`;
}

/** True when Studio's HTTP bridge answers /health. */
async function studioHttpUp(): Promise<boolean> {
  try {
    const res = await fetch(`${studioHttpBase()}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Prefer Studio's HTTP create when the bridge is up — that path runs full
 * file/symbol verification. Falls back to null when unreachable so the CLI
 * can persist locally.
 */
async function createViaHttp(
  body: Record<string, unknown>,
): Promise<{ record: StoredSubsystemModel; reused: boolean } | null> {
  try {
    const res = await fetch(`${studioHttpBase()}/api/subsystem-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      graph?: StoredSubsystemModel;
      reused?: boolean;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.graph) {
      process.stderr.write(
        `Studio rejected model: ${json.error ?? `HTTP ${res.status}`}\n`,
      );
      process.exit(2);
    }
    return { record: json.graph, reused: json.reused === true };
  } catch {
    return null;
  }
}

async function openViaHttp(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${studioHttpBase()}/api/subsystem-model/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(5_000),
    });
    const json = (await res.json()) as { ok?: boolean };
    return res.ok && json.ok === true;
  } catch {
    return false;
  }
}

/**
 * Open a stored model in Studio. Order: HTTP /open → IPC → spawn Studio.
 * Returns true when handed off to a running instance (caller can exit).
 * Returns false when it spawned Studio (caller should wait on the child).
 */
async function openModel(
  id: string,
  options: { viewerDir?: string; waitOnSpawn?: boolean },
): Promise<'handed' | 'spawned' | 'failed'> {
  if (await openViaHttp(id)) return 'handed';
  if (await handoffToRunning({ kind: 'LOAD_SUBSYSTEM_GRAPH', graphId: id })) {
    return 'handed';
  }

  const resolved = tryResolveViewerLaunch(options.viewerDir);
  if (!resolved.ok) {
    process.stderr.write(`${resolved.error}\n`);
    return 'failed';
  }
  const launch = resolved.launch;

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    SUBSYSTEM_MODEL_ID: id,
  };

  process.stderr.write(`Launching Principal Studio for ${id}…\n`);
  const child =
    launch.kind === 'installed'
      ? spawn(launch.bin, [], { env, stdio: 'inherit' })
      : spawn('bun', ['start'], { cwd: launch.dir, env, stdio: 'inherit' });

  if (!options.waitOnSpawn) {
    child.unref();
    return 'spawned';
  }

  return await new Promise((resolve) => {
    child.on('error', (err) => {
      process.stderr.write(`Failed to launch Principal Studio: ${err.message}\n`);
      resolve('failed');
    });
    child.on('exit', (code) => {
      if (code && code !== 0) {
        process.exit(code);
      }
      resolve('spawned');
    });
  });
}

async function createAction(options: {
  file?: string;
  open?: boolean;
  viewerDir?: string;
  force?: boolean;
}): Promise<void> {
  const parsed = await readPayload(options.file);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    process.stderr.write('Payload must be a JSON object\n');
    process.exit(2);
  }
  const body = parsed as Record<string, unknown>;
  if (options.force) body['force'] = true;

  let record: StoredSubsystemModel | null = null;
  let reused = false;
  if (await studioHttpUp()) {
    // A running Studio is the single validator: it owns the schema the model
    // will actually be stored against. The CLI's bundled subsystems-core can
    // lag it (the two shipped schemas have drifted before), so validating
    // locally first would reject payloads the Studio accepts — and vice versa.
    // Hold local validation for the offline path below.
    const viaHttp = await createViaHttp(body);
    if (viaHttp) {
      record = viaHttp.record;
      reused = viaHttp.reused;
    }
  }
  if (!record) {
    const problems = findSubsystemModelProblems(body);
    if (problems.length > 0) {
      process.stderr.write(`invalid model: ${problems.join('; ')}\n`);
      process.exit(2);
    }
    const outcome = await upsertSubsystemModel(
      {
        title: body['title'] as string,
        description: typeof body['description'] === 'string' ? body['description'] : undefined,
        components: body['components'] as unknown[],
        trails: Array.isArray(body['trails']) ? body['trails'] : undefined,
      },
      { force: options.force },
    );
    record = outcome.record;
    reused = outcome.action === 'updated';
  }

  process.stderr.write(
    `${reused ? 'Updated' : 'Created'} subsystem model ${record.id} → ${subsystemModelFilePath(record.id)}\n`,
  );

  // Commander `--no-open` flips `open` to false (default true).
  if (options.open !== false) {
    const outcome = await openModel(record.id, {
      viewerDir: options.viewerDir,
      waitOnSpawn: false,
    });
    if (outcome === 'handed') {
      process.stderr.write(`Opened in Principal Studio: ${record.id}\n`);
    } else if (outcome === 'spawned') {
      process.stderr.write(`Principal Studio launching with model ${record.id}\n`);
    } else {
      process.stderr.write(
        `Model saved but could not open Principal Studio. Run \`principal-ai open-studio\` or \`principal-ai subsystem-model open ${record.id}\`.\n`,
      );
    }
  }

  process.stdout.write(
    JSON.stringify({ ok: true, reused, graph: record }, null, 2) + '\n',
  );
}

async function openAction(
  id: string | undefined,
  options: { viewerDir?: string },
): Promise<void> {
  if (!id) {
    process.stderr.write('Pass a model id.\n');
    process.exit(2);
  }
  const existing = await getSubsystemModel(id);
  if (!existing) {
    process.stderr.write(`Model not found: ${id}\n`);
    process.exit(2);
  }

  const outcome = await openModel(id, { viewerDir: options.viewerDir, waitOnSpawn: true });
  if (outcome === 'handed') {
    process.stderr.write(`Opened in Principal Studio: ${id}\n`);
    return;
  }
  if (outcome === 'failed') {
    process.stderr.write(
      `Could not open Principal Studio. Is @principal-ai/subsystems-studio installed?\n`,
    );
    process.exit(2);
  }
}

async function overlapAction(options: { json?: boolean; repo?: string }): Promise<void> {
  const listed = await listSubsystemModels();
  const models = [];
  for (const entry of listed) {
    const graph = await getSubsystemModel(entry.id);
    if (!graph) continue;
    models.push({
      id: graph.id,
      title: graph.title,
      components: (Array.isArray(graph.components) ? graph.components : []) as OverlapComponent[],
    });
  }
  let report = analyzeComposeOverlap(models);
  const repo = options.repo?.trim();
  if (repo) {
    report = {
      repos: report.repos.filter((r) => r.repoKey === repo),
      unscoped: [],
    };
    if (report.repos.length === 0) {
      process.stderr.write(`No code components for repo ${repo}\n`);
      process.exit(2);
    }
  }
  if (options.json) {
    process.stdout.write(JSON.stringify({ ok: true, ...report }, null, 2) + '\n');
    return;
  }
  process.stdout.write(formatComposeOverlap(report));
}

async function listAction(): Promise<void> {
  const graphs = await listSubsystemModels();
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        graphs: graphs.map((g) => ({
          ...g,
          path: subsystemModelFilePath(g.id),
        })),
      },
      null,
      2,
    ) + '\n',
  );
}

async function getAction(id: string | undefined): Promise<void> {
  if (!id) {
    process.stderr.write('Pass a model id.\n');
    process.exit(2);
  }
  const graph = await getSubsystemModel(id);
  if (!graph) {
    process.stderr.write(`Model not found: ${id}\n`);
    process.exit(2);
  }
  process.stdout.write(JSON.stringify({ ok: true, graph }, null, 2) + '\n');
}

async function studioFetch(
  path: string,
  init?: RequestInit,
  timeoutMs = 120_000,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  if (!(await studioHttpUp())) {
    process.stderr.write(
      'Principal Studio HTTP is not running (need audit / propose apply via Studio on :3045).\n',
    );
    process.exit(2);
  }
  try {
    const res = await fetch(`${studioHttpBase()}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const json = (await res.json()) as Record<string, unknown>;
    return { ok: res.ok && json.ok !== false, status: res.status, json };
  } catch (err) {
    process.stderr.write(`Studio request failed: ${(err as Error).message}\n`);
    process.exit(2);
  }
}

async function auditAction(id: string | undefined): Promise<void> {
  if (!id) {
    process.stderr.write('Pass a model id.\n');
    process.exit(2);
  }
  const { ok, json } = await studioFetch(`/api/subsystem-model/${encodeURIComponent(id)}/audit`);
  process.stdout.write(JSON.stringify(json, null, 2) + '\n');
  if (!ok) process.exit(2);
}

interface MaintainPlanJson {
  graphId?: string;
  title?: string;
  verdict?: string;
  route?: { agent: string; layer: string; mode: string } | null;
  pendingCount?: number;
  pendingProposals?: Array<{
    id?: string;
    author?: string;
    lane?: string;
    rationale?: string;
    confidence?: number;
    verdict?: string;
    risk?: string;
    secondOpinionError?: string;
  }>;
  autoAccept?: { enabled?: boolean; confidenceThreshold?: number };
  audit?: {
    checkedAt?: string;
    needsUpdate?: boolean;
    findings?: { total: number; error: number; info: number };
  };
}

function formatMaintainPlan(plan: MaintainPlanJson): string {
  const lines: string[] = [];
  lines.push(`${plan.title ?? plan.graphId ?? 'model'} (${plan.graphId ?? '?'})`);
  if (plan.audit) {
    lines.push(
      `  audited   ${plan.audit.checkedAt ?? 'unknown'}${
        plan.audit.needsUpdate ? ' · verification failed' : ''
      }`,
    );
    lines.push(`  verdict   ${plan.verdict ?? 'unknown'}`);
    const findings = plan.audit.findings;
    if (findings) {
      lines.push(
        `  findings  ${findings.total} (${findings.error} error, ${findings.info} info)`,
      );
    }
  }
  lines.push(
    `  next      ${
      plan.route
        ? `${plan.route.agent} (${plan.route.layer} · ${plan.route.mode})`
        : 'none — nothing queued'
    }`,
  );
  if (plan.autoAccept?.enabled) {
    const threshold = plan.autoAccept.confidenceThreshold;
    lines.push(
      `  gate      auto-accept on${threshold != null ? ` · confidence ≥ ${threshold}` : ''}`,
    );
  } else {
    lines.push('  gate      auto-accept off — every proposal waits for review');
  }

  const pending = plan.pendingProposals ?? [];
  lines.push(`  pending   ${plan.pendingCount ?? pending.length} proposal(s) awaiting review`);
  for (const proposal of pending) {
    const bits = [
      proposal.author,
      proposal.lane,
      proposal.confidence != null ? `confidence ${proposal.confidence}` : 'unscored',
      proposal.risk,
      proposal.secondOpinionError ? `scoring error: ${proposal.secondOpinionError}` : null,
    ].filter(Boolean);
    lines.push(`    ${proposal.id ?? '?'}  ${bits.join(' · ')}`);
    const firstLine = (proposal.rationale ?? '').split('\n')[0];
    if (firstLine) lines.push(`      ${firstLine}`);
  }
  return lines.join('\n') + '\n';
}

interface MaintainOptions {
  plan?: boolean;
  start?: boolean;
  status?: boolean;
  wait?: boolean;
  all?: boolean;
  model?: string;
  timeout?: string;
  json?: boolean;
}

async function maintainAction(
  id: string | undefined,
  opts: MaintainOptions,
): Promise<void> {
  if (!id && !opts.all) {
    process.stderr.write('Pass a model id or --all.\n');
    process.exit(2);
  }
  if (id && opts.all) {
    process.stderr.write('Pass either a model id or --all, not both.\n');
    process.exit(2);
  }
  if (opts.all && (opts.start || opts.status)) {
    process.stderr.write('--all only applies to --plan.\n');
    process.exit(2);
  }
  if (opts.plan && (opts.start || opts.status)) {
    process.stderr.write('Pass only one of --plan, --start, or --status.\n');
    process.exit(2);
  }
  if (opts.start && opts.status) {
    process.stderr.write('Pass only one of --plan, --start, or --status.\n');
    process.exit(2);
  }
  if (opts.wait && !opts.start) {
    process.stderr.write('--wait requires --start.\n');
    process.exit(2);
  }

  if (opts.all) {
    const listed = await studioFetch('/api/subsystem-model');
    if (!listed.ok) {
      process.stderr.write(`${String(listed.json.error ?? 'could not list models')}\n`);
      process.exit(2);
    }
    const graphs = Array.isArray(listed.json.graphs)
      ? (listed.json.graphs as Array<{ id?: unknown; title?: unknown }>)
      : [];
    const plans: Array<Record<string, unknown>> = [];
    let allOk = true;
    for (const graph of graphs) {
      if (typeof graph.id !== 'string') continue;
      const plan = await studioFetch(
        `/api/subsystem-model/${encodeURIComponent(graph.id)}/maintain/plan`,
        undefined,
        300_000,
      );
      allOk = allOk && plan.ok;
      plans.push(plan.json);
      if (!opts.json) {
        process.stdout.write(
          formatMaintainPlan(plan.json as unknown as MaintainPlanJson) + '\n',
        );
      }
    }
    if (opts.json) {
      process.stdout.write(JSON.stringify({ ok: allOk, models: plans }, null, 2) + '\n');
    }
    if (!allOk) process.exit(2);
    return;
  }

  const enc = encodeURIComponent(id!);
  const planPath = `/api/subsystem-model/${enc}/maintain/plan`;
  const statusPath = `/api/subsystem-model/${enc}/maintain/status`;
  const startPath = `/api/subsystem-model/${enc}/maintain`;

  if (opts.status) {
    const { ok, json } = await studioFetch(statusPath);
    process.stdout.write(JSON.stringify(json, null, 2) + '\n');
    if (!ok) process.exit(2);
    return;
  }

  if (!opts.start) {
    const { ok, json } = await studioFetch(planPath, undefined, 300_000);
    if (opts.json) {
      process.stdout.write(JSON.stringify(json, null, 2) + '\n');
    } else if (ok) {
      process.stdout.write(formatMaintainPlan(json as unknown as MaintainPlanJson));
    } else {
      process.stderr.write(`${String(json.error ?? 'maintain plan failed')}\n`);
    }
    if (!ok) process.exit(2);
    return;
  }

  const started = await studioFetch(startPath, {
    method: 'POST',
    body: JSON.stringify(opts.model ? { model: opts.model } : {}),
  });
  if (!started.ok) {
    if (opts.json) {
      process.stdout.write(JSON.stringify(started.json, null, 2) + '\n');
    } else {
      process.stderr.write(
        `${String(started.json.error ?? 'could not start maintain run')}\n`,
      );
    }
    process.exit(2);
  }

  if (!opts.wait) {
    process.stdout.write(JSON.stringify(started.json, null, 2) + '\n');
    return;
  }

  if (!opts.json) {
    const model = started.json.model ? ` · ${String(started.json.model)}` : '';
    process.stderr.write(
      started.json.alreadyRunning
        ? `Maintain already running for ${id}${model}\n`
        : `Maintain started for ${id}${model}\n`,
    );
  }

  const timeoutSeconds = Math.max(1, Number(opts.timeout ?? 1800) || 1800);
  const deadline = Date.now() + timeoutSeconds * 1000;
  let status: Record<string, unknown> = {};
  while (true) {
    const polled = await studioFetch(statusPath);
    status = polled.json;
    if (!polled.ok) process.exit(2);
    if (status.running !== true) break;
    if (Date.now() >= deadline) {
      process.stderr.write(
        `Timed out after ${timeoutSeconds}s; the run is still in flight. Check \`principal-ai subsystem-model maintain ${id} --status\`.\n`,
      );
      process.stdout.write(JSON.stringify(status, null, 2) + '\n');
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const plan = await studioFetch(planPath, undefined, 300_000);
  const runs = Array.isArray(status.runs)
    ? (status.runs as Array<Record<string, unknown>>)
    : [];
  const latest = runs[0];
  const ok = plan.ok && latest?.status !== 'error';
  const outcome = {
    ok,
    started: started.json,
    status,
    plan: plan.json,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(outcome, null, 2) + '\n');
  } else {
    if (latest) {
      const agent = latest.agent ? ` · ${String(latest.agent)}` : '';
      const error = latest.error ? ` — ${String(latest.error)}` : '';
      process.stdout.write(`Run ${String(latest.status)}${agent}${error}\n`);
      if (latest.summary) process.stdout.write(`${String(latest.summary)}\n`);
    }
    if (plan.ok) {
      process.stdout.write(formatMaintainPlan(plan.json as unknown as MaintainPlanJson));
    } else {
      process.stderr.write(`${String(plan.json.error ?? 'maintain plan failed')}\n`);
    }
  }
  if (!ok) process.exit(2);
}

async function backfillSitesAction(
  id: string | undefined,
  opts: { all?: boolean; apply?: boolean },
): Promise<void> {
  if (!id && !opts.all) {
    process.stderr.write('Pass a model id or --all.\n');
    process.exit(2);
  }
  if (id && opts.all) {
    process.stderr.write('Pass either a model id or --all, not both.\n');
    process.exit(2);
  }
  const path = opts.all
    ? '/api/subsystem-model/backfill-sites'
    : `/api/subsystem-model/${encodeURIComponent(id!)}/backfill-sites`;
  const { ok, json } = await studioFetch(path, {
    method: 'POST',
    body: JSON.stringify({ apply: opts.apply === true }),
  });
  process.stdout.write(JSON.stringify(json, null, 2) + '\n');
  if (!ok) process.exit(2);
}

async function proposalsListAction(
  id: string | undefined,
  opts: { includeResolved?: boolean },
): Promise<void> {
  if (!id) {
    process.stderr.write('Pass a model id.\n');
    process.exit(2);
  }
  const q = opts.includeResolved ? '?includeResolved=1' : '';
  const { ok, json } = await studioFetch(
    `/api/subsystem-model/${encodeURIComponent(id)}/proposals${q}`,
  );
  process.stdout.write(JSON.stringify(json, null, 2) + '\n');
  if (!ok) process.exit(2);
}

async function proposeAction(
  id: string | undefined,
  opts: { file?: string; author?: string },
): Promise<void> {
  if (!id) {
    process.stderr.write('Pass a model id.\n');
    process.exit(2);
  }
  const payload = (await readPayload(opts.file)) as Record<string, unknown>;
  if (opts.author && typeof payload['author'] !== 'string') {
    payload['author'] = opts.author;
  }
  const { ok, json } = await studioFetch(
    `/api/subsystem-model/${encodeURIComponent(id)}/proposals`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
  process.stdout.write(JSON.stringify(json, null, 2) + '\n');
  if (!ok) process.exit(2);
}

async function acceptAction(
  id: string | undefined,
  proposalId: string | undefined,
): Promise<void> {
  if (!id || !proposalId) {
    process.stderr.write('Pass a model id and proposal id.\n');
    process.exit(2);
  }
  const { ok, json } = await studioFetch(
    `/api/subsystem-model/${encodeURIComponent(id)}/proposals/${encodeURIComponent(proposalId)}/accept`,
    { method: 'POST', body: '{}' },
  );
  process.stdout.write(JSON.stringify(json, null, 2) + '\n');
  if (!ok) process.exit(2);
}

async function acceptAllAction(id: string | undefined): Promise<void> {
  if (!id) {
    process.stderr.write('Pass a model id.\n');
    process.exit(2);
  }
  const { ok, json } = await studioFetch(
    `/api/subsystem-model/${encodeURIComponent(id)}/proposals/accept-all`,
    { method: 'POST', body: '{}' },
  );
  process.stdout.write(JSON.stringify(json, null, 2) + '\n');
  if (!ok) process.exit(2);
}

async function rejectAction(
  id: string | undefined,
  proposalId: string | undefined,
): Promise<void> {
  if (!id || !proposalId) {
    process.stderr.write('Pass a model id and proposal id.\n');
    process.exit(2);
  }
  const { ok, json } = await studioFetch(
    `/api/subsystem-model/${encodeURIComponent(id)}/proposals/${encodeURIComponent(proposalId)}/reject`,
    { method: 'POST', body: '{}' },
  );
  process.stdout.write(JSON.stringify(json, null, 2) + '\n');
  if (!ok) process.exit(2);
}

async function showcaseAction(
  ids: string[],
  options: { title?: string },
): Promise<void> {
  if (!(await studioHttpUp())) {
    process.stderr.write(
      'Principal Studio HTTP is not running (need Studio on :3045 to open a showcase).\n',
    );
    process.exit(2);
  }
  const { ok, json } = await studioFetch('/api/subsystem-model/showcase', {
    method: 'POST',
    body: JSON.stringify({ ids, title: options.title }),
  });
  process.stdout.write(JSON.stringify(json, null, 2) + '\n');
  if (!ok) process.exit(2);
}

export function createSubsystemModelCommand(): Command {
  const cmd = new Command('subsystem-model').description(
    'Create, open, audit, and propose corrections for subsystem models',
  );

  cmd
    .command('create')
    .description(
      'Validate + persist a subsystem model JSON, then open it in Principal Studio',
    )
    .option('-f, --file <path>', 'Path to model JSON (default: stdin; use - for stdin)')
    .option('--no-open', 'Persist only; do not open Principal Studio')
    .option(
      '--force',
      'Always create a new record, even when a model with the same title and repos already exists',
    )
    .option(
      '--viewer-dir <path>',
      'Path to the @principal-ai/subsystems-studio package (overrides PRINCIPAL_STUDIO_DIR)',
    )
    .action(createAction);

  cmd
    .command('open')
    .description('Open a stored subsystem model in Principal Studio')
    .argument('[id]', 'Model id (sg-…)')
    .option(
      '--viewer-dir <path>',
      'Path to the @principal-ai/subsystems-studio package (overrides PRINCIPAL_STUDIO_DIR)',
    )
    .action(openAction);

  cmd
    .command('list')
    .description('List stored subsystem models')
    .action(listAction);

  cmd
    .command('overlap')
    .description(
      'Show which local models share code components, and which fall into disjoint groups',
    )
    .option('--json', 'Print the analysis as JSON')
    .option('--repo <purl>', 'Limit to one repo purl (fragment ignored)')
    .action(overlapAction);

  cmd
    .command('get')
    .description('Print a stored subsystem model as JSON')
    .argument('[id]', 'Model id (sg-…)')
    .action(getAction);

  cmd
    .command('showcase')
    .description(
      'Open a new Subsystem Showcase tab scoped to specific model ids (requires Studio HTTP)',
    )
    .argument('<ids...>', 'Model ids (sg-…)')
    .option('--title <title>', 'Tab title')
    .action(showcaseAction);

  cmd
    .command('audit')
    .description(
      'Run the deterministic dry-run audit (requires Principal Studio HTTP)',
    )
    .argument('<id>', 'Model id (sg-…)')
    .action(auditAction);

  cmd
    .command('maintain')
    .description(
      'Plan or start a Maintain run: fresh audit → routed agent stage (requires Studio HTTP)',
    )
    .argument('[id]', 'Model id (sg-…)')
    .option('--plan', 'Only show the fresh audit, next routed stage, and pending proposals (default)')
    .option('--all', 'With --plan, plan every stored model')
    .option('--start', 'Start the sequenced Maintain run in the background')
    .option('--status', 'Show in-flight state and recent Maintain runs')
    .option('--wait', 'With --start, poll until the run finishes or needs a human')
    .option('--timeout <seconds>', 'Max seconds to wait with --wait (default 1800)')
    .option('--model <ref>', 'OpenCode provider/id model override for this run')
    .option('--json', 'Print raw JSON')
    .action(maintainAction);

  cmd
    .command('backfill-sites')
    .description(
      'Resolve and pin missing site constructs on calls steps (requires Studio HTTP)',
    )
    .argument('[id]', 'Model id (sg-…)')
    .option('--all', 'Backfill every stored model')
    .option('--apply', 'Write the changes (default: dry run)')
    .action((id: string | undefined, opts: { all?: boolean; apply?: boolean }) =>
      backfillSitesAction(id, opts),
    );

  cmd
    .command('proposals')
    .description('List correction proposals for a model (requires Studio HTTP)')
    .argument('<id>', 'Model id (sg-…)')
    .option('--include-resolved', 'Include accepted/rejected proposals')
    .action((id: string, opts: { includeResolved?: boolean }) =>
      proposalsListAction(id, opts),
    );

  cmd
    .command('propose')
    .description(
      'Submit a correction proposal with rationale (does not apply unless auto-accept is on)',
    )
    .argument('<id>', 'Model id (sg-…)')
    .option(
      '-f, --file <path>',
      'Proposal JSON: { rationale, changes[], finding?, author? } (default: stdin)',
    )
    .option('--author <name>', 'Author tag (e.g. agent name)')
    .action((id: string, opts: { file?: string; author?: string }) =>
      proposeAction(id, opts),
    );

  cmd
    .command('accept')
    .description('Accept a pending proposal and apply it to the model')
    .argument('<id>', 'Model id (sg-…)')
    .argument('<proposalId>', 'Proposal id (sp-…)')
    .action(acceptAction);

  cmd
    .command('accept-all')
    .description(
      'Accept every pending proposal for a model, then re-audit once (requires Studio HTTP)',
    )
    .argument('<id>', 'Model id (sg-…)')
    .action(acceptAllAction);

  cmd
    .command('reject')
    .description('Reject a pending proposal without changing the model')
    .argument('<id>', 'Model id (sg-…)')
    .argument('<proposalId>', 'Proposal id (sp-…)')
    .action(rejectAction);

  return cmd;
}
