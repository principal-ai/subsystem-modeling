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
import { tryResolveViewerLaunch } from './trail.js';
import { handoffToRunning } from '../lib/viewer-ipc.js';
import {
  createSubsystemModel,
  findCreateProblems,
  getSubsystemModel,
  isRepoRoots,
  listSubsystemModels,
  subsystemModelFilePath,
  type StoredSubsystemModel,
} from '../lib/subsystem-model-store.js';

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
      signal: AbortSignal.timeout(400),
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
): Promise<StoredSubsystemModel | null> {
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
      error?: string;
    };
    if (!res.ok || !json.ok || !json.graph) {
      process.stderr.write(
        `Studio rejected model: ${json.error ?? `HTTP ${res.status}`}\n`,
      );
      process.exit(2);
    }
    return json.graph;
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
}): Promise<void> {
  const parsed = await readPayload(options.file);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    process.stderr.write('Payload must be a JSON object\n');
    process.exit(2);
  }
  const body = parsed as Record<string, unknown>;

  const problems = findCreateProblems(body);
  if (problems.length > 0) {
    process.stderr.write(`invalid model: ${problems.join('; ')}\n`);
    process.exit(2);
  }

  let record: StoredSubsystemModel | null = null;
  if (await studioHttpUp()) {
    record = await createViaHttp(body);
  }
  if (!record) {
    record = await createSubsystemModel({
      title: body['title'] as string,
      description: typeof body['description'] === 'string' ? body['description'] : undefined,
      components: body['components'] as unknown[],
      edges: body['edges'] as unknown[],
      throughlines: Array.isArray(body['throughlines']) ? body['throughlines'] : undefined,
      source: typeof body['source'] === 'string' ? body['source'] : undefined,
      repo: body['repo'] as { owner: string; name: string } | undefined,
      repoRoot: typeof body['repoRoot'] === 'string' ? body['repoRoot'] : undefined,
      repoRoots: isRepoRoots(body['repoRoots']) ? body['repoRoots'] : undefined,
    });
  }

  process.stderr.write(
    `Created subsystem model ${record.id} → ${subsystemModelFilePath(record.id)}\n`,
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

  process.stdout.write(JSON.stringify({ ok: true, graph: record }, null, 2) + '\n');
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

export function createSubsystemModelCommand(): Command {
  const cmd = new Command('subsystem-model').description(
    'Create, open, and list subsystem models (works without Studio already running)',
  );

  cmd
    .command('create')
    .description(
      'Validate + persist a subsystem model JSON, then open it in Principal Studio',
    )
    .option('-f, --file <path>', 'Path to model JSON (default: stdin; use - for stdin)')
    .option('--no-open', 'Persist only; do not open Principal Studio')
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
    .command('get')
    .description('Print a stored subsystem model as JSON')
    .argument('[id]', 'Model id (sg-…)')
    .action(getAction);

  return cmd;
}
