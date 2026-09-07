/**
 * Local subsystem-model store — same on-disk layout as Principal Studio:
 * `~/.principal/subsystem-models/<id>.json` + `_index.json`.
 *
 * Lets the CLI create/list models without Studio's HTTP bridge running.
 * Structural validation mirrors the Studio POST gate (construct / mechanism /
 * throughlines / detail provenance). File/symbol verification is Studio-only
 * for now and may be empty on CLI-created records until opened/updated there.
 */

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(homedir(), '.principal', 'subsystem-models');
const INDEX_PATH = join(ROOT, '_index.json');

export const SUBSYSTEM_EDGE_MECHANISMS = [
  'imports',
  'imports_from',
  're_exports',
  'defines',
  'calls',
  'extends',
  'inherits',
  'implements',
  'mixes_in',
  'uses',
  'method',
  'references',
  'contains',
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
] as const;

export const SUBSYSTEM_DETAIL_PROVENANCES = ['verified', 'authored'] as const;

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
  source?: string;
  repo?: { owner: string; name: string };
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
  edges: unknown[];
  throughlines?: unknown[];
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  source?: string;
  repo?: { owner: string; name: string };
  repoRoot?: string;
  repoRoots?: Record<string, string>;
  verification?: unknown;
}

export interface CreateSubsystemModelInput {
  title: string;
  description?: string;
  components: unknown[];
  edges: unknown[];
  throughlines?: unknown[];
  source?: string;
  repo?: { owner: string; name: string };
  repoRoot?: string;
  repoRoots?: Record<string, string>;
}

function graphId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 11);
  return `sg-${ts}-${rand}`;
}

function graphPath(id: string): string {
  return join(ROOT, `${id}.json`);
}

export function subsystemModelFilePath(id: string): string {
  return graphPath(id);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(ROOT, { recursive: true });
}

export function findEdgeMechanismProblems(edges: unknown): string[] {
  if (!Array.isArray(edges)) return [];
  const problems: string[] = [];
  for (const edge of edges) {
    const e = edge as { id?: unknown; mechanism?: unknown } | null;
    if (
      typeof e?.mechanism === 'string' &&
      (SUBSYSTEM_EDGE_MECHANISMS as readonly string[]).includes(e.mechanism)
    ) {
      continue;
    }
    problems.push(
      `edge ${JSON.stringify(e?.id ?? '<no id>')}: unknown mechanism ${JSON.stringify(e?.mechanism)} — allowed: ${SUBSYSTEM_EDGE_MECHANISMS.join(', ')}`,
    );
  }
  return problems;
}

export function findThroughlineProblems(edges: unknown, throughlines: unknown): string[] {
  if (throughlines === undefined) return [];
  if (!Array.isArray(throughlines)) return ['throughlines must be an array'];
  const edgeIds = new Set(
    (Array.isArray(edges) ? edges : [])
      .map((e) => (e as { id?: unknown } | null)?.id)
      .filter((id): id is string => typeof id === 'string'),
  );
  const problems: string[] = [];
  for (const tl of throughlines) {
    const t = tl as {
      id?: unknown;
      title?: unknown;
      steps?: unknown;
    } | null;
    const label = JSON.stringify(t?.id ?? '<no id>');
    if (typeof t?.id !== 'string' || !t.id.trim()) {
      problems.push(`throughline ${label}: id is required`);
      continue;
    }
    if (typeof t?.title !== 'string' || !t.title.trim()) {
      problems.push(`throughline ${label}: title is required`);
    }
    if (!Array.isArray(t.steps)) {
      problems.push(`throughline ${label}: steps array is required`);
      continue;
    }
    t.steps.forEach((step, i) => {
      const s = step as {
        edgeId?: unknown;
        file?: unknown;
        line?: unknown;
      } | null;
      if (typeof s?.edgeId !== 'string' || !edgeIds.has(s.edgeId)) {
        problems.push(
          `throughline ${label}: step ${i} edgeId ${JSON.stringify(s?.edgeId ?? '<missing>')} does not match any edge in the graph`,
        );
      }
      if (typeof s?.file !== 'string' || !s.file.trim()) {
        problems.push(
          `throughline ${label}: step ${i} file is required (edgeId ${JSON.stringify(s?.edgeId ?? '<missing>')})`,
        );
      } else if (typeof s?.line !== 'number' || !Number.isInteger(s.line) || s.line < 1) {
        problems.push(
          `throughline ${label}: step ${i} line must be a positive 1-based integer (edgeId ${JSON.stringify(s?.edgeId ?? '<missing>')}, file ${JSON.stringify(s?.file)})`,
        );
      }
    });
  }
  return problems;
}

export function findComponentConstructProblems(components: unknown): string[] {
  if (!Array.isArray(components)) return [];
  const problems: string[] = [];
  for (const component of components) {
    const c = component as { id?: unknown; construct?: unknown } | null;
    if (
      typeof c?.construct === 'string' &&
      (SUBSYSTEM_COMPONENT_CONSTRUCTS as readonly string[]).includes(c.construct)
    ) {
      continue;
    }
    problems.push(
      `component ${JSON.stringify(c?.id ?? '<no id>')}: invalid construct ${JSON.stringify(c?.construct)} — allowed: ${SUBSYSTEM_COMPONENT_CONSTRUCTS.join(', ')}. A module is its own subsystem: anchor to a concrete export (symbol + file), or publish it as a separate graph and reference it.`,
    );
  }
  return problems;
}

export function findDetailProvenanceProblems(components: unknown): string[] {
  if (!Array.isArray(components)) return [];
  const problems: string[] = [];
  for (const component of components) {
    const c = component as Record<string, unknown> | null;
    if (!c || typeof c !== 'object' || !c['detail']) continue;
    const p = c['detailProvenance'];
    if (p === undefined) continue;
    if (typeof p === 'string' && (SUBSYSTEM_DETAIL_PROVENANCES as readonly string[]).includes(p)) {
      continue;
    }
    problems.push(
      `component ${JSON.stringify(String(c['id'] ?? '<no id>'))}: invalid detailProvenance ${JSON.stringify(p)} — allowed: ${SUBSYSTEM_DETAIL_PROVENANCES.join(', ')}. Hand-authored details must be "authored"; "verified" is reserved for tool-extracted data.`,
    );
  }
  return problems;
}

export function normalizeDetailProvenance(components: unknown): void {
  if (!Array.isArray(components)) return;
  for (const component of components) {
    const c = component as Record<string, unknown> | null;
    if (!c || typeof c !== 'object') continue;
    const detail = c['detail'] as Record<string, unknown> | undefined;
    if (!detail || typeof detail !== 'object') {
      delete c['detailProvenance'];
      continue;
    }
    const p = c['detailProvenance'];
    if (p !== 'verified' && p !== 'authored') c['detailProvenance'] = 'authored';
    const kind = detail['kind'];
    const arrays: Record<string, string[]> = {
      function: ['parameters', 'callers', 'callees'],
      method: ['parameters'],
      class: ['methods', 'properties', 'extends', 'implements', 'instantiations', 'references'],
      type: ['properties', 'usedBy', 'implementors'],
      module: ['imports', 'exports', 'symbols'],
    };
    for (const key of arrays[String(kind)] ?? []) {
      if (!Array.isArray(detail[key])) detail[key] = [];
    }
  }
}

export function isRepoRoots(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === 'string');
}

/** Structural problems that would make Studio reject a POST (empty = valid). */
export function findCreateProblems(body: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (!body['title'] || typeof body['title'] !== 'string') {
    problems.push('title is required');
  }
  if (!Array.isArray(body['components'])) {
    problems.push('components array is required');
  }
  if (!Array.isArray(body['edges'])) {
    problems.push('edges array is required');
  }
  if (problems.length > 0) return problems;
  return [
    ...findComponentConstructProblems(body['components']),
    ...findDetailProvenanceProblems(body['components']),
    ...findEdgeMechanismProblems(body['edges']),
    ...findThroughlineProblems(body['edges'], body['throughlines']),
  ];
}

function indexEntryFor(record: StoredSubsystemModel): SubsystemModelIndexEntry {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    componentCount: record.components.length,
    edgeCount: record.edges.length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastOpenedAt: record.lastOpenedAt,
    fileName: `${record.id}.json`,
    source: record.source,
    repo: record.repo,
  };
}

async function readIndex(): Promise<SubsystemModelIndexEntry[]> {
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf8');
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
  await fs.writeFile(INDEX_PATH, JSON.stringify(idx, null, 2), 'utf8');
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
    files = await fs.readdir(ROOT, { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const f of files) {
    if (!f.isFile() || !f.name.endsWith('.json') || f.name === '_index.json') continue;
    try {
      const raw = await fs.readFile(join(ROOT, f.name), 'utf8');
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
  normalizeDetailProvenance(doc.components);
  const now = new Date().toISOString();
  const record: StoredSubsystemModel = {
    ...doc,
    id: graphId(),
    createdAt: now,
    updatedAt: now,
  };
  await fs.writeFile(graphPath(record.id), JSON.stringify(record, null, 2), 'utf8');
  await upsertIndexEntry(indexEntryFor(record));
  return record;
}
