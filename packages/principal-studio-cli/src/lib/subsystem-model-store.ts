/**
 * Local subsystem-model store — same on-disk layout as Principal Studio:
 * `~/.principal/subsystem-models/<id>.json` + `_index.json`.
 *
 * Lets the CLI create/list models without Studio's HTTP bridge running.
 * Structural validation mirrors the Studio POST gate (construct / mechanism /
 * trails / detail provenance). File/symbol verification is Studio-only
 * for now and may be empty on CLI-created records until opened/updated there.
 */

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { deriveGraphEdges } from '@principal-ai/subsystems-core';
import { capturePurlCommits, purlRepoKey, type PurlCommit } from './purl-commits.js';

/** Home override for tests (mirrors PRINCIPAL_ALEXANDRIA_HOME); lazy so an
 * override set after module load still applies. */
function storeHome(): string {
  const override = process.env['PRINCIPAL_SUBSYSTEM_MODELS_HOME']?.trim();
  return override ? override : homedir();
}

function modelsRoot(): string {
  return join(storeHome(), '.principal', 'subsystem-models');
}

function indexFilePath(): string {
  return join(modelsRoot(), '_index.json');
}

export const SUBSYSTEM_EDGE_MECHANISMS = [
  'calls',
  'extends',
  'inherits',
  'implements',
  'mixes_in',
  'uses',
  'method',
  'feeds',
  'produces',
  'writes',
  'reads',
  'watches',
  'registers-into',
] as const;

export const SUBSYSTEM_COMPONENT_CONSTRUCTS = [
  'class',
  'function',
  'method',
  'interface',
  'type_alias',
  'enum',
  'store',
  'external',
  'custom_entity',
] as const;

export const SUBSYSTEM_DECLARATION_PROVENANCES = ['verified', 'authored'] as const;

export interface SubsystemModelIndexEntry {
  id: string;
  title: string;
  description?: string;
  componentCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  fileName: string;
  /** Host-only gist link mirrored from the record. */
  gist?: { id: string; fileName?: string };
}

interface IndexFile {
  version: number;
  entries: SubsystemModelIndexEntry[];
}

export interface StoredSubsystemModel {
  id: string;
  title: string;
  description?: string;
  components: unknown[];
  trails?: unknown[];
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  /** Host-only GitHub gist link (not portable). */
  gist?: { id: string; fileName?: string };
  /** Per-purl commit the model was created against (see PurlCommit). */
  createdAtCommits?: Record<string, PurlCommit>;
  /** Per-purl commit when a full audit last passed (written by Studio). */
  verifiedAtCommits?: Record<string, PurlCommit>;
  verification?: unknown;
}

export interface CreateSubsystemModelInput {
  title: string;
  description?: string;
  components: unknown[];
  trails?: unknown[];
}

function graphId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 11);
  return `sg-${ts}-${rand}`;
}

function graphPath(id: string): string {
  return join(modelsRoot(), `${id}.json`);
}

export function subsystemModelFilePath(id: string): string {
  return graphPath(id);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(modelsRoot(), { recursive: true });
}

/** Structural problems that would make Studio reject a POST (empty = valid). */
function indexEntryFor(record: StoredSubsystemModel): SubsystemModelIndexEntry {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    componentCount: record.components.length,
    edgeCount: deriveGraphEdges({
      trails: record.trails as Parameters<typeof deriveGraphEdges>[0]['trails'],
    }).length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastOpenedAt: record.lastOpenedAt,
    fileName: `${record.id}.json`,
    gist: record.gist,
  };
}

async function readIndex(): Promise<SubsystemModelIndexEntry[]> {
  try {
    const raw = await fs.readFile(indexFilePath(), 'utf8');
    const idx = JSON.parse(raw) as IndexFile;
    if (idx.version === 1) return idx.entries;
  } catch {
    // missing / corrupt → rebuild
  }
  return rebuildIndex();
}

async function writeIndex(entries: SubsystemModelIndexEntry[]): Promise<void> {
  await ensureDir();
  const idx: IndexFile = { version: 1, entries };
  await fs.writeFile(indexFilePath(), JSON.stringify(idx, null, 2), 'utf8');
}

async function upsertIndexEntry(entry: SubsystemModelIndexEntry): Promise<void> {
  const entries = await readIndex();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  await writeIndex(entries);
}

async function rebuildIndex(): Promise<SubsystemModelIndexEntry[]> {
  await ensureDir();
  const entries: SubsystemModelIndexEntry[] = [];
  let files;
  try {
    files = await fs.readdir(modelsRoot(), { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const f of files) {
    if (!f.isFile() || !f.name.endsWith('.json') || f.name === '_index.json') continue;
    try {
      const raw = await fs.readFile(join(modelsRoot(), f.name), 'utf8');
      const graph = JSON.parse(raw) as StoredSubsystemModel;
      entries.push(indexEntryFor(graph));
    } catch {
      // skip corrupt files
    }
  }
  entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  await writeIndex(entries);
  return entries;
}

export async function listSubsystemModels(): Promise<SubsystemModelIndexEntry[]> {
  return readIndex();
}

export async function getSubsystemModel(id: string): Promise<StoredSubsystemModel | null> {
  try {
    const raw = await fs.readFile(graphPath(id), 'utf8');
    return JSON.parse(raw) as StoredSubsystemModel;
  } catch {
    return null;
  }
}

export async function createSubsystemModel(
  doc: CreateSubsystemModelInput,
): Promise<StoredSubsystemModel> {
  await ensureDir();
  const now = new Date().toISOString();
  const record: StoredSubsystemModel = {
    ...doc,
    id: graphId(),
    createdAt: now,
    updatedAt: now,
  };
  // Anchor the model to the commit each referenced repo is at now.
  record.createdAtCommits = capturePurlCommits(
    doc.components as ReadonlyArray<{ alias?: string; purl?: string }>,
  );
  await fs.writeFile(graphPath(record.id), JSON.stringify(record, null, 2), 'utf8');
  await upsertIndexEntry(indexEntryFor(record));
  return record;
}

/** Patch an existing record (e.g. stamp a host gist ref after share). */
export async function updateSubsystemModel(
  id: string,
  patch: Partial<
    Pick<
      StoredSubsystemModel,
      | 'title'
      | 'description'
      | 'components'
      | 'trails'
      | 'gist'
    >
  >,
): Promise<StoredSubsystemModel | null> {
  const existing = await getSubsystemModel(id);
  if (!existing) return null;
  const updated: StoredSubsystemModel = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(graphPath(id), JSON.stringify(updated, null, 2), 'utf8');
  await upsertIndexEntry(indexEntryFor(updated));
  return updated;
}

/** Normalize a model title for identity comparison (case/whitespace). */
export function normalizeModelTitle(title: string | undefined): string {
  return (title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Referenced purl keys of a component list (purl fragment stripped), deduped
 * and sorted. Empty when no component carries a purl.
 */
export function modelPurlKeys(
  components: ReadonlyArray<{ purl?: string }>,
): string[] {
  const purls = new Set<string>();
  for (const c of components) {
    const key = purlRepoKey(c.purl);
    if (key) purls.add(key);
  }
  return [...purls].sort();
}

/**
 * Identity of a model's subject: same normalized title AND same referenced purl
 * set. A re-create with this key folds onto the existing record instead of
 * minting another `sg-` id. `null` when the model carries no purl at all.
 */
export function modelIdentityKey(
  title: string | undefined,
  components: ReadonlyArray<{ purl?: string }>,
): string | null {
  const purls = modelPurlKeys(components);
  if (purls.length === 0) return null;
  const norm = normalizeModelTitle(title);
  if (!norm) return null;
  return [norm, ...purls].join('\u0000');
}

/**
 * Find the canonical existing model with the same subject identity (normalized
 * title + referenced purl set). The oldest `createdAt` wins when duplicates
 * already exist — that is the id a re-create should fold into.
 */
export async function findSubsystemModelByIdentity(
  title: string | undefined,
  components: ReadonlyArray<{ purl?: string }>,
): Promise<StoredSubsystemModel | null> {
  const key = modelIdentityKey(title, components);
  if (!key) return null;
  const normTitle = normalizeModelTitle(title);
  const candidates = (await listSubsystemModels())
    .filter((e) => normalizeModelTitle(e.title) === normTitle)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const entry of candidates) {
    const record = await getSubsystemModel(entry.id);
    if (
      record &&
      modelIdentityKey(
        record.title,
        record.components as ReadonlyArray<{ purl?: string }>,
      ) === key
    ) {
      return record;
    }
  }
  return null;
}

/**
 * Create a model, or fold onto the existing one when a model with the same
 * subject identity (normalized title + referenced purl set) is already stored.
 * Makes create idempotent for the common retry. Pass `{ force: true }` to
 * always mint a new record.
 */
export async function upsertSubsystemModel(
  doc: CreateSubsystemModelInput,
  options?: { force?: boolean },
): Promise<{ record: StoredSubsystemModel; action: 'created' | 'updated' }> {
  if (!options?.force) {
    const existing = await findSubsystemModelByIdentity(
      doc.title,
      doc.components as ReadonlyArray<{ purl?: string }>,
    );
    if (existing) {
      const updated = await updateSubsystemModel(existing.id, {
        title: doc.title,
        description: doc.description,
        components: doc.components,
        trails: doc.trails,
      });
      return { record: updated ?? existing, action: 'updated' };
    }
  }
  return { record: await createSubsystemModel(doc), action: 'created' };
}
